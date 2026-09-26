// 练习页：自由练习 / 每日挑战 / 训练地图 / 导入题 / 错题重练 共用一套渲染。
// 含计时、五类高亮、笔记、撤销、提示讲解、冲突红闪、完成结算与分享入口。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Board, NumberPad, ToolBar } from "./Board";
import { Overlay, ResultSummary, OverlayBtns, formatMs } from "./Overlay";
import { Btn, Card, Toast } from "./ui/kit";
import { APP_ICON_URL, OrientationHint } from "./Shell";
import { HINT_LIMIT, LEVEL_GIVEN, MAP_LEVELS, skillByKey } from "@/lib/content";
import { levelName } from "./Walls";
import type { PracticeSource } from "@/lib/store";
import { calcStars, markCheckin, todayStr, useStore, type BookItem, type HistoryItem, type LevelId, type Snapshot } from "@/lib/store";
import { colOf, countGiven, findLogicStep, generatePuzzle, peersOf, remainingMap, rowOf, toSDString, type Grid, type Size } from "@/lib/sudoku";
import { SharePuzzleOverlay, ShareResultOverlay } from "./Share";
import { StepReview } from "./StepReview";

export interface StartParams {
  size: Size;
  level: LevelId;
  source: PracticeSource;
  seed?: string;
  mapIndex?: number;
  /** 回放（错题/收藏重练）时直接给定盘面 */
  board?: Grid;
  solution?: Grid;
}

interface Props {
  params: StartParams;
  onExit: () => void;
  onFinish: () => void;
}

interface Move {
  i: number;
  prev: number;
  prevNotes: number[];
}

const SOURCE_LABEL: Record<PracticeSource, string> = {
  free: "自由练习",
  daily: "每日挑战",
  map: "训练地图",
  import: "导入题目",
  replay: "巩固重练",
};

export function Practice({ params, onExit, onFinish }: Props) {
  const { store, update, playSound } = useStore();
  const { size, level, source } = params;
  const n = size * size;
  const total = n;

  /* ---------- 出题 ---------- */
  const initial = useMemo(() => {
    if (params.board && params.solution) {
      return { puzzle: params.board.slice(), solution: params.solution.slice() };
    }
    // 断点恢复（replay 重练局退出即弃，不恢复；其余来源均可续玩）
    if (
      source !== "replay" &&
      store.cur &&
      store.cur.source === source &&
      store.cur.size === size &&
      store.cur.level === level &&
      (source !== "map" || store.cur.mapIndex === params.mapIndex)
    ) {
      return null;
    }
    const seedBase = params.seed || `${source}:${level}:${size}:${params.mapIndex ?? todayStr()}`;
    const given = targetGiven(level, size);
    const { puzzle, solution } = cachedGenerate(size, given, seedBase);
    return { puzzle, solution };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resumed = !initial && store.cur ? store.cur : null;
  const start = initial || { puzzle: resumed!.puzzle, solution: resumed!.solution };

  const [board, setBoard] = useState<Grid>(() => start.puzzle.slice());
  const [notes, setNotes] = useState<Record<number, number[]>>(() => (resumed ? resumed.notes : {}));
  const [selected, setSelected] = useState<number | null>(null);
  const [noteMode, setNoteMode] = useState(false);
  const [eraserMode, setEraserMode] = useState(false);
  const [history, setHistory] = useState<Move[]>([]);
  const [errors, setErrors] = useState(resumed?.errors ?? 0);
  const [hints, setHints] = useState(resumed?.hints ?? 0);
  const [ms, setMs] = useState(resumed?.ms ?? 0);
  const [wrong, setWrong] = useState<number[]>([]);
  const [okCell, setOkCell] = useState<number | null>(null);
  const [msg, setMsg] = useState<string>(introText(source, size));
  const [warn, setWarn] = useState(false);
  const [finished, setFinished] = useState(false);
  const [sharePuzzle, setSharePuzzle] = useState(false);
  const [shareResult, setShareResult] = useState(false);
  const [review, setReview] = useState(false);
  const [toast, setToast] = useState("");
  const [hintCells, setHintCells] = useState<number[]>([]);
  const [scale, setScale] = useState(1);
  const pinchRef = useRef<{ dist: number; start: number } | null>(null);
  const hintTimer = useRef<number | undefined>(undefined);
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const scaleRef = useRef(1);

  const givenMask = useMemo(() => start.puzzle.map((v) => v > 0), [start.puzzle]);
  const remaining = useMemo(() => remainingMap(board, size), [board, size]);
  const filledCount = useMemo(() => countGiven(board), [board]);

  /* ---------- 计时 ---------- */
  useEffect(() => {
    if (finished) return;
    const t = window.setInterval(() => setMs((m) => m + 100), 100);
    return () => window.clearInterval(t);
  }, [finished]);

  /* ---------- 自动保存断点（每步） ---------- */
  useEffect(() => {
    // 所有来源都存快照（free/daily/map/import）；replay 重练局退出即弃
    if (finished || source === "replay") return;
    const snap: Snapshot = { size, level, puzzle: start.puzzle, solution: start.solution, board, notes, ms, errors, hints, source, mapIndex: params.mapIndex };
    update((d) => {
      d.cur = snap;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, notes, errors, hints]);

  /* ---------- 9×9 竖屏一次性建议横屏 ---------- */
  const [orient, setOrient] = useState(false);
  useEffect(() => {
    if (size !== 9) return;
    if (window.innerHeight <= window.innerWidth) return;
    try {
      if (localStorage.getItem("redtools.shudu.orient")) return;
    } catch {      /* ignore */
    }
    setOrient(true);
  }, [size]);

  /* ---------- 双指缩放（原生监听：仅两指捏合时 preventDefault，单指触摸放行点击/滚动） ---------- */
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    const el = boardWrapRef.current;
    if (!el) return;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        pinchRef.current = { dist: touchDist(e.touches), start: scaleRef.current };
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const ratio = touchDist(e.touches) / pinchRef.current.dist;
        setScale(Math.min(2.2, Math.max(0.5, pinchRef.current.start * ratio)));
      }
    };
    const onEnd = () => {
      pinchRef.current = null;
    };
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(""), 2600);
  }

  function flashWrong(cells: number[]) {
    setWrong(cells);
    window.setTimeout(() => setWrong([]), 400);
  }

  /* ---------- 填数 / 笔记 ---------- */
  const fill = useCallback(
    (v: number) => {
      if (finished || selected == null) {
        if (!finished) {
          setWarn(true);
          setMsg("先点一个空格，再选数字。");
          window.setTimeout(() => setWarn(false), 600);
        }
        return;
      }
      if (givenMask[selected]) return;

      if (noteMode) {
        const cur = notes[selected] || [];
        const next = cur.indexOf(v) >= 0 ? cur.filter((x) => x !== v) : [...cur, v].sort((a, b) => a - b);
        if (next.length === 0 && cur.length === 0) return;
        // 行/列/宫已有该数字则拒绝记笔记
        const conflict = peersOf(size, selected).some((j) => board[j] === v);
        if (conflict && next.indexOf(v) >= 0) {
          setWarn(true);
          setMsg("这一行、列或宫里已经有这个数字了，笔记先记不上。");
          window.setTimeout(() => setWarn(false), 800);
          return;
        }
        setHistory((h) => [...h, { i: selected, prev: board[selected], prevNotes: cur }]);
        setNotes((nn) => ({ ...nn, [selected]: next }));
        playSound("tap");
        return;
      }

      if (board[selected] === v) return;

      // 冲突判定：同行/列/宫已有同数字
      const clash = peersOf(size, selected).filter((j) => board[j] === v);
      const prev = board[selected];
      const nb = board.slice();
      nb[selected] = v;
      setHistory((h) => [...h, { i: selected, prev, prevNotes: notes[selected] || [] }]);
      setBoard(nb);

      if (clash.length) {
        flashWrong([selected, ...clash]);
        setErrors((e) => e + 1);
        playSound("wrong");
        setWarn(true);
        setMsg("这里和同${unitName(clash[0], selected, size)}的数字撞上了，看看是不是换个位置更合适。");
        window.setTimeout(() => setWarn(false), 1200);
        return;
      }
      setWarn(false);
      setOkCell(selected);
      window.setTimeout(() => setOkCell(null), 420);
      playSound("ok");
      // 自动铅笔：落定后清掉同伴的同值笔记
      setNotes((nn) => {
        const out: Record<number, number[]> = {};
        for (const k in nn) {
          const key = Number(k);
          if (key === selected) continue;
          const isPeer = peersOf(size, key).indexOf(selected) >= 0;
          const arr = isPeer ? nn[k].filter((x) => x !== v) : nn[k];
          if (arr.length) out[key] = arr;
        }
        return out;
      });
      checkComplete(nb);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, noteMode, notes, board, givenMask, finished, size, playSound, start.solution],
  );

  function unitName(a: number, b: number, s: Size): string {
    if (rowOf(s, a) === rowOf(s, b)) return "行";
    if (colOf(s, a) === colOf(s, b)) return "列";
    return "宫";
  }

  const erase = useCallback(() => {
    if (selected == null || givenMask[selected] || finished) return;
    if (!board[selected] && !(notes[selected] || []).length) return;
    setHistory((h) => [...h, { i: selected, prev: board[selected], prevNotes: notes[selected] || [] }]);
    const nb = board.slice();
    nb[selected] = 0;
    setBoard(nb);
    setNotes((nn) => {
      const out = { ...nn };
      delete out[selected];
      return out;
    });
    playSound("tap");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, givenMask, board, notes, finished, playSound]);

  /* ---------- 实体键盘增强（1-9 / Backspace / Delete；未完成时生效） ---------- */
  useEffect(() => {
    if (finished) return;
    function onKey(e: KeyboardEvent) {
      const k = e.key;
      if (k >= "1" && k <= "9") {
        const v = Number(k);
        if (v >= 1 && v <= size) fill(v);
      } else if (k === "Backspace" || k === "Delete") {
        if (selected != null) {
          e.preventDefault();
          erase();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finished, n, fill, erase, selected]);

  function undo() {
    if (!history.length || finished) return;
    const last = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    const nb = board.slice();
    nb[last.i] = last.prev;
    setBoard(nb);
    setNotes((nn) => {
      const out = { ...nn };
      if (last.prevNotes.length) out[last.i] = last.prevNotes;
      else delete out[last.i];
      return out;
    });
    setSelected(last.i);
    playSound("tap");
  }

  function useHint() {
    if (finished) return;
    const limit = HINT_LIMIT[size];
    if (Number.isFinite(limit) && hints >= limit) {
      setWarn(true);
      setMsg(`这道题的提示已经用完（${size}×${size} 最多 ${limit} 次），试着再推一步？`);
      window.setTimeout(() => setWarn(false), 1600);
      return;
    }
    const step = findLogicStep(board, size);
    if (!step) {
      setMsg("这一步需要更长的推理链，先把能确定的格子填上，线索会更多。");
      return;
    }
    setHints((h) => h + 1);
    setSelected(step.index);
    setHintCells(peersOf(size, step.index).filter((j) => board[j] === step.value));
    setWarn(false);
    setMsg(`💡 ${step.technique}：${step.reason} 目标在第 ${rowOf(size, step.index) + 1} 行第 ${colOf(size, step.index) + 1} 列。`);
    playSound("tap");
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHintCells([]), 3200);
  }

  function checkComplete(g: Grid) {
    const sol = start.solution;
    for (let i = 0; i < total; i++) if (g[i] !== sol[i]) return;
    window.setTimeout(() => finishAll(g), 380);
  }

  function finishAll(g: Grid) {
    if (finished) return;
    setFinished(true);
    playSound("win");
    const stars = calcStars(hints, errors);
    const date = todayStr();
    update((d) => {
      const got: string[] = [];
      const unlock = (k: string) => {
        if (!d.achievements[k]) {
          d.achievements[k] = date.replace(/-/g, "");
          got.push(k);
        }
      };
      if (source !== "import") {
        // 导入局不计成绩/打卡/最佳；其余来源照常记账
        const prevBest = d.best[size];
        // 最佳判定：星级高优先，同星级比用时
        const better = !prevBest || betterThan(stars, ms, prevBest.stars, prevBest.ms);
        if (better) d.best[size] = { ms, errors, hints, stars, date };
        d.recent[size] = ms;
        d.history.unshift({ date, level, size, ms, errors, hints, stars });
        if (d.history.length > 30) d.history = d.history.slice(0, 30);
        markCheckin(d);
        // 成就
        unlock("firstWin");
        if (stars === 3) unlock("threeStars");
        if (hints === 0) unlock("noHint");
        if (size === 4) unlock("size4");
        if (size === 6) unlock("size6");
        if (size === 9) unlock("size9");
        if (d.checkin.streak >= 3) unlock("streak3");
        if (d.checkin.streak >= 7) unlock("streak7");
        if (source === "daily") unlock("dailyFirst");
        const litBase = Object.keys(d.skills).length;
        if (litBase >= 1) unlock("skill1");
        if (litBase >= 4) unlock("skillAll4");
        const litAdv = Object.keys(d.advSkills).length;
        if (litAdv >= 1) unlock("adv1");
        if (litAdv >= 12) unlock("advAll12");
        if (source === "map" && params.mapIndex != null) {
          if (!d.mapProgress.completed.some((c) => c.i === params.mapIndex)) d.mapProgress.completed.push({ i: params.mapIndex, doneAt: Date.now() });
          if (d.mapProgress.completed.length >= 5) unlock("mapHalf");
          if (d.mapProgress.completed.length >= 10) unlock("mapAll");
        }
      }
      // 掌握即清：0 错 0 提示的重练通过 → 移出错题本
      if (source === "replay" && errors === 0 && hints === 0) {
        const sig = toSDString(g, size);
        const before = d.mistakes.length;
        d.mistakes = d.mistakes.filter((m) => toSDString(m.board, m.size) !== sig);
        if (d.mistakes.length < before) unlock("mistakeClear");
      } else if (errors > 0 || hints > 0) {
        pushMistake(d, g, start.solution, size, level, errors, hints);
      }
      d.cur = null;
      unlockedRef.current = got;
    });
  }

  const unlockedRef = useRef<string[]>([]);
  const [isRecord, setIsRecord] = useState(false);
  useEffect(() => {
    if (!finished) return;
    if (source === "import") {
      // 导入局不计成绩，也不产生新纪录
      setIsRecord(false);
      return;
    }
    const b = store.best[size];
    setIsRecord(!!b && b.ms === ms && b.errors === errors && b.hints === hints);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  function restart() {
    const { puzzle, solution } = cachedGenerate(size, targetGiven(level, size), (params.seed || "") + ":" + Math.random().toString(36).slice(2, 7));
    setBoard(puzzle.slice());
    start.solution = solution;
    (start as { puzzle: Grid }).puzzle = puzzle;
    setNotes({});
    setHistory([]);
    setSelected(null);
    setErrors(0);
    setHints(0);
    setMs(0);
    setFinished(false);
    setMsg(introText(source, size));
    update((d) => {
      d.cur = null;
    });
  }

  function leave() {
    // 退出未完成且有过失误 → 记入错题本（同盘面已存在则跳过；FIFO 50 上限沿用）
    if (!finished && errors > 0) {
      update((d) => {
        pushMistake(d, start.puzzle, start.solution, size, level, errors, hints);
      });
    }
    onExit();
  }

  function toggleFav() {
    const id = `${size}-${toSDString(start.puzzle, size)}`;
    const exists = store.favorites.some((f) => f.id === id);
    update((d) => {
      if (exists) d.favorites = d.favorites.filter((f) => f.id !== id);
      else d.favorites.unshift({ id, ts: Date.now(), level, size, board: start.puzzle, solution: start.solution });
      if (d.favorites.length > 60) d.favorites = d.favorites.slice(0, 60);
    });
    showToast(exists ? "已取消收藏" : "⭐ 已收进收藏本");
  }

  const isFav = store.favorites.some((f) => f.id === `${size}-${toSDString(start.puzzle, size)}`);
  const stars = calcStars(hints, errors);
  // E5 连败降档建议：导入局不进 history，不更新建议
  const suggestion = finished && source !== "import" ? suggestLevel(store.history) : null;
  // 训练地图关卡的技巧标签（分享题时标注所学技巧）
  const mapSkillName = useMemo(() => {
    if (source !== "map" || params.mapIndex == null) return undefined;
    const ml = MAP_LEVELS[params.mapIndex];
    if (!ml?.skillKey) return undefined;
    return skillByKey(ml.skillKey)?.name;
  }, [source, params.mapIndex]);
  const levelMeta = { name: levelName(level) };
  const hintLeft = HINT_LIMIT[size];
  const canHint = !Number.isFinite(hintLeft) || hints < hintLeft;

  return (
    <div className="pb-2">
      {/* 顶栏 */}
      <div className="flex items-center gap-2 py-1.5">
        <Btn variant="ghost" size="icon" onClick={leave} aria-label="返回" className="h-10 w-10 shrink-0 rounded-full text-[15px]">
          ←
        </Btn>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15.5px] font-bold leading-tight">{levelMeta.name}</div>
          <div className="mt-0.5 truncate text-[10.5px] text-muted-foreground tnum">
            {size}×{size} · 已知 {countGiven(start.puzzle)} 格 · {SOURCE_LABEL[source]}
            {source === "map" && params.mapIndex != null ? ` · 关卡 ${["1-1", "1-2", "1-3", "2-1", "2-2", "2-3", "3-1", "3-2", "3-3", "3-4"][params.mapIndex]}` : ""}
          </div>
        </div>
        <span className="tnum shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[12px] font-bold text-secondary-foreground">⏱ {formatMs(ms)}</span>
      </div>

      {/* 盘面 */}
      <Card tone="flat" pad="tight" className="relative overflow-hidden">
        <div ref={boardWrapRef} style={{ transform: `scale(${scale})`, transformOrigin: "top center", transition: "transform .18s ease" }}>
          <Board
            size={size}
            board={board}
            given={givenMask}
            selected={selected}
            notes={notes}
            wrong={wrong}
            okCell={okCell}
            peerGuide={hintCells}
            replay={source === "replay"}
            onPick={(i) => {
              if (finished) return;
              setHintCells([]);
              if (i === selected) setSelected(null);
              else if (givenMask[i]) {
                setSelected(i);
                if (eraserMode) setEraserMode(false);
              } else {
                setSelected(i);
                playSound("tap");
              }
              if (eraserMode && !givenMask[i]) erase();
            }}
          />
        </div>
        {scale > 1 ? (
          <button
            type="button"
            onClick={() => setScale(1)}
            aria-label="复位盘面大小"
            className="press absolute bottom-1.5 right-1.5 z-10 rounded-full bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground shadow-lift"
          >
            复位
          </button>
        ) : null}
      </Card>

      {/* 进度条：已填 / 总空格 */}
      <div className="mt-2.5 flex items-center gap-2 px-1">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${Math.round((filledCount / total) * 100)}%` }} />
        </div>
        <span className="tnum text-[10.5px] font-semibold text-muted-foreground">
          {filledCount}/{total}
        </span>
      </div>

      {/* 提示行 */}
      <p
        id="practice-msg"
        role="status"
        aria-live="polite"
        className={cn(
          "mt-2 min-h-[38px] rounded-xl border-l-[3px] bg-secondary/40 px-3 py-2 text-[12px] leading-snug transition-colors",
          warn ? "border-warning text-warning" : "border-transparent text-muted-foreground",
        )}
      >
        {msg}
      </p>

      {/* 数字条 */}
      <div className="mt-2">
        <NumberPad size={size} remaining={remaining} disabled={finished} onFill={fill} />
      </div>

      {/* 工具条 */}
      <div className="mt-2">
        <ToolBar
          state={{ eraser: true, note: true, undo: history.length > 0, hint: canHint }}
          noteOn={noteMode}
          onEraser={() => {
            setEraserMode((v) => !v);
            setNoteMode(false);
          }}
          onNote={() => {
            setNoteMode((v) => !v);
            setEraserMode(false);
          }}
          onUndo={undo}
          onHint={useHint}
        />
      </div>

      {/* 页脚 */}
      <div className="mt-2.5 flex items-center gap-2">
        <Btn variant="quiet" size="sm" onClick={leave} className="min-h-[36px]">
          ← 返回难度
        </Btn>
        <Btn variant="quiet" size="sm" onClick={restart} className="min-h-[36px]">
          重新开始
        </Btn>
        <span className={cn("tnum ml-auto text-[12px] font-semibold", errors ? "text-destructive" : "text-muted-foreground")}>❌ {errors}</span>
      </div>

      {/* 完成结算 */}
      <Overlay
        open={finished && !sharePuzzle && !shareResult && !review}
        title="🎉 完成啦！"
        sub={`${size}×${size} · ${levelMeta.name} · ${SOURCE_LABEL[source]}`}
        footer={
          <>
            <OverlayBtns>
              <Btn variant="primary" size="lg" onClick={() => setReview(true)}>
                🧠 回顾推理步骤
              </Btn>
              <Btn variant="secondary" size="lg" onClick={restart}>
                再练一题
              </Btn>
              <Btn variant={isFav ? "secondary" : "ghost"} onClick={toggleFav} className="w-full">
                {isFav ? "💛 取消收藏" : "⭐ 收藏这道题"}
              </Btn>
              <Btn variant="ghost" onClick={() => setSharePuzzle(true)}>
                📤 分享这道题
              </Btn>
              <Btn variant="ghost" onClick={() => setShareResult(true)}>
                📤 分享成绩
              </Btn>
              <Btn variant="ghost" onClick={onFinish}>
                选难度
              </Btn>
            </OverlayBtns>
            <Btn variant="quiet" size="sm" onClick={onFinish} className="w-full">
              查看打卡日历
            </Btn>
          </>
        }
      >
        <ResultSummary
          stars={stars}
          ms={ms}
          errors={errors}
          hints={hints}
          isRecord={isRecord}
          checkinNew
          unlocked={unlockedRef.current.map((k) => k)}
        />
        {suggestion ? (
          <p className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-center text-[12px] font-semibold text-warning">
            🌱 最近两局都有点吃力，下次可以从「{levelName(suggestion)}」这档开始（不扣分，只是建议）。
          </p>
        ) : null}
      </Overlay>

      {review ? (
        <StepReview
          open
          puzzle={start.puzzle}
          solution={start.solution}
          size={size}
          ms={ms}
          errors={errors}
          hints={hints}
          onClose={() => setReview(false)}
        />
      ) : null}

      {sharePuzzle ? (
        <SharePuzzleOverlay
          board={start.puzzle}
          solution={start.solution}
          size={size}
          skillName={mapSkillName}
          onClose={() => setSharePuzzle(false)}
          onToast={showToast}
        />
      ) : null}
      {shareResult ? (
        <ShareResultOverlay
          size={size}
          level={levelMeta.name}
          stars={stars}
          ms={ms}
          errors={errors}
          hints={hints}
          board={start.puzzle}
          onClose={() => setShareResult(false)}
          onToast={showToast}
        />
      ) : null}

      <OrientationHint show={orient} onClose={() => { setOrient(false); try { localStorage.setItem("redtools.shudu.orient", "1"); } catch { /* ignore */ } }} />
      <Toast text={toast} />
      <img src={APP_ICON_URL} alt="" className="hidden" />
    </div>
  );
}

/* ==================== 辅助 ==================== */

function touchDist(t: { length: number; [index: number]: unknown }): number {
  const a = t[0] as { clientX: number; clientY: number } | undefined;
  const b = t[1] as { clientX: number; clientY: number } | undefined;
  if (!a || !b) return 1;
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy) || 1;
}

function targetGiven(level: LevelId, size: Size): number {
  return LEVEL_GIVEN[level][size];
}

function introText(source: PracticeSource, size: Size): string {
  if (source === "daily") return "今天的挑战题已备好，按自己的节奏来，慢一点也算数。";
  if (source === "map") return "这是训练阶梯上的一级，把学过的技巧串起来用用看。";
  if (source === "replay") return "重练上次没把握的题，这次争取不用提示走完。";
  if (source === "import") return "你导入的题目已就绪，看看能不能推出唯一答案。";
  return size === 4 ? "先从一行开始看：哪个数字只剩下的一个位置？" : "挑一个数字，逐行逐列把它的可能位置划掉。";
}

function pushMistake(d: { mistakes: BookItem[] }, board: Grid, solution: Grid, size: Size, level: LevelId, errors: number, hints: number) {
  const sig = toSDString(board, size);
  if (d.mistakes.some((m) => toSDString(m.board, m.size) === sig)) return;
  d.mistakes.unshift({ id: `${Date.now()}`, ts: Date.now(), level, size, board: board.slice(), solution: solution.slice(), errors, hints });
  if (d.mistakes.length > 50) d.mistakes = d.mistakes.slice(0, 50);
}

/** 最佳成绩判定：星级高优先，同星级比用时 */
function betterThan(starsA: number, msA: number, starsB: number, msB: number): boolean {
  if (starsA !== starsB) return starsA > starsB;
  return msA < msB;
}

const LEVEL_ORDER: LevelId[] = ["easy", "normal", "hard"];

/** E5 连败降档：最近两局都「吃力」（错误+提示 ≥ 该档半数空格）→ 建议降一档；历史不足 2 局或已是最简单档 → null */
export function suggestLevel(history: HistoryItem[]): LevelId | null {
  if (!history || history.length < 2) return null;
  const a = history[history.length - 2];
  const b = history[history.length - 1];
  const halfA = Math.ceil((a.size * a.size - LEVEL_GIVEN[a.level][a.size]) / 2);
  const halfB = Math.ceil((b.size * b.size - LEVEL_GIVEN[b.level][b.size]) / 2);
  if (a.errors + a.hints < halfA) return null;
  if (b.errors + b.hints < halfB) return null;
  const hi = Math.max(LEVEL_ORDER.indexOf(a.level), LEVEL_ORDER.indexOf(b.level));
  return hi > 0 ? LEVEL_ORDER[hi - 1] : null;
}

/** 生成耗时较长，做一层内存缓存避免重复计算 */
const genCache = new Map<string, { puzzle: Grid; solution: Grid }>();
function cachedGenerate(size: Size, given: number, seed: string) {
  const key = `${size}:${given}:${seed}`;
  const hit = genCache.get(key);
  if (hit) return hit;
  const out = generatePuzzle(size, given, seed);
  genCache.set(key, out);
  if (genCache.size > 24) {
    const first = genCache.keys().next().value;
    if (first) genCache.delete(first);
  }
  return out;
}
