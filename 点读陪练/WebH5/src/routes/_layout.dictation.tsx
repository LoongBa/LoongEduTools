// 听写：选词 → 播放面板（播放按钮即「下一个」+倒计时环）→ 列表高亮/听过显示 → 批改（手动打分）
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { unitOf, type WordCard } from "@/data/content";
import { useProgress } from "@/lib/store";
import { speechSupported, speak, speakMp3, stopAudio, setAudioRate } from "@/lib/speech";
import { Btn, PageHead, Panel } from "@/components/ui-kit";
import { SpeakerIcon, PlayIcon, CheckIcon, PrevIcon, NextIcon } from "@/components/icons";
import { shuffle } from "@/lib/utils";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_layout/dictation")({
  component: DictationPage,
});

type Phase = "intro" | "run" | "done";
type ListenMode = "en" | "zh" | "both";
/** 等待系数：停留 = 当前词播放时长 × WAIT_FACTOR */
const WAIT_FACTOR = 2;

function DictationPage() {
  const p = useProgress();
  const unit = unitOf(p.state.unitId);

  const [phase, setPhase] = useState<Phase>("intro");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [order, setOrder] = useState<WordCard[]>([]);
  const [idx, setIdx] = useState(0);
  // 听写参数
  const [rate, setRate] = useState(1);
  const [mode, setMode] = useState<ListenMode>("en");
  const [continuous, setContinuous] = useState(true);
  const [repeat, setRepeat] = useState<1 | 2>(1);
  const [shuffledOrder, setShuffledOrder] = useState(true);

  const repCountRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false); // 播放完等待「下一个」
  const [grading, setGrading] = useState(false); // 批改模式（听完停在列表）
  const [waitTotal, setWaitTotal] = useState(0);
  const [waitLeft, setWaitLeft] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [enPlayed, setEnPlayed] = useState<Set<string>>(new Set());
  const [zhPlayed, setZhPlayed] = useState<Set<string>>(new Set());
  const [marks, setMarks] = useState<Record<string, boolean>>({}); // 批改勾选 word → 记住了
  const timer = useRef<number | null>(null);

  // refs 镜像：setTimeout/interval 回调读最新值，避免闭包捕获陈旧 state（StrictMode 安全）
  const orderRef = useRef<WordCard[]>([]);
  const modeRef = useRef<ListenMode>("en");
  const waitLeftRef = useRef(0);
  const idxRef = useRef(0);
  orderRef.current = order;
  modeRef.current = mode;
  waitLeftRef.current = waitLeft;
  idxRef.current = idx;

  const word = order[idx];
  const remembered = useMemo(() => Object.values(marks).filter(Boolean).length, [marks]);
  const playedCount = useMemo(
    () => order.filter((w) => enPlayed.has(w.word) || zhPlayed.has(w.word)).length,
    [order, enPlayed, zhPlayed],
  );

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
    stopAudio();
  }, []);

  // 总计时
  useEffect(() => {
    if (phase !== "run" || grading) return;
    const iv = window.setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => window.clearInterval(iv);
  }, [phase, grading]);

  // 等待倒计时：interval 回调体内判断归零（不在 setState updater 内做副作用，StrictMode 安全）
  useEffect(() => {
    if (!waiting || waitLeft <= 0) return;
    const iv = window.setInterval(() => {
      if (waitLeftRef.current <= 100) {
        // 归零：停表 + 前进（回调体内，非 updater）
        window.clearInterval(iv);
        setWaitLeft(0);
        advance();
      } else {
        setWaitLeft((v) => v - 100);
      }
    }, 100);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, waitLeft > 0]);

  const stopAndReset = () => {
    if (timer.current) window.clearTimeout(timer.current);
    stopAudio();
    setPlaying(false);
    repCountRef.current = 0;
  };

  const playIndex = (i: number, isRepeat = false) => {
    const w = orderRef.current[i];
    if (!w) return;
    stopAudio();
    setPlaying(true);
    setWaiting(false);

    const end = (enDurationMs?: number) => {
      setPlaying(false);
      if (!isRepeat && repeat === 2 && repCountRef.current === 0) {
        repCountRef.current = 1;
        timer.current = window.setTimeout(() => playIndex(i, true), 600);
        return;
      }
      const w2 = orderRef.current[i];
      if (w2) {
        const m = modeRef.current;
        if (m === "zh") {
          setZhPlayed((s) => new Set(s).add(w2.word));
        } else if (m === "both") {
          setEnPlayed((s) => new Set(s).add(w2.word));
          setZhPlayed((s) => new Set(s).add(w2.word));
        } else {
          setEnPlayed((s) => new Set(s).add(w2.word));
        }
        const enMs = enDurationMs ?? 1600;
        const zhMs = Math.max(600, (w2.cn || w2.word).length * 350);
        const totalMs = m === "zh" ? zhMs : m === "both" ? enMs + zhMs : enMs;
        const waitMs = totalMs * WAIT_FACTOR;
        setWaitTotal(waitMs);
        setWaitLeft(waitMs);
        setWaiting(true);
      }
    };

    if (modeRef.current === "zh") {
      speak(w.cn || w.word, { rate, onEnd: () => end() });
    } else if (modeRef.current === "both") {
      speakMp3(w.mp3, w.word, { rate, onEnd: (d) => speak(w.cn || w.word, { rate, onEnd: () => end(d) }) });
    } else {
      speakMp3(w.mp3, w.word, { rate, onEnd: end });
    }
  };

  /** 前进：下一词 / 听完所有 → 进入批改（停在列表） */
  const advance = () => {
    if (timer.current) window.clearTimeout(timer.current);
    setWaiting(false);
    repCountRef.current = 0;
    if (idxRef.current + 1 < orderRef.current.length) {
      const n = idxRef.current + 1;
      setIdx(n);
      timer.current = window.setTimeout(() => playIndex(n), 200);
    } else {
      // 全部播完：进入批改，默认全「记住了」，孩子取消勾 = 没记住
      const all: Record<string, boolean> = {};
      orderRef.current.forEach((w) => { all[w.word] = true; });
      setMarks(all);
      setGrading(true);
      setWaiting(false);
    }
  };

  const step = (dir: -1 | 1) => {
    const cur = idxRef.current;
    const next = cur + dir;
    if (next < 0 || next >= orderRef.current.length) return;
    stopAndReset();
    setWaiting(false);
    setIdx(next);
    timer.current = window.setTimeout(() => playIndex(next), 200);
  };

  const jumpTo = (i: number) => {
    if (i < 0 || i >= orderRef.current.length) return;
    stopAndReset();
    setWaiting(false);
    setIdx(i);
    timer.current = window.setTimeout(() => playIndex(i), 200);
  };

  const togglePlay = () => {
    if (playing) {
      stopAndReset();
    } else {
      playIndex(idxRef.current);
    }
  };

  // ── 批改 ──
  const markAll = (v: boolean) => {
    const m: Record<string, boolean> = {};
    order.forEach((w) => { m[w.word] = v; });
    setMarks(m);
  };

  const finishMarking = () => {
    p.touchWords(order.map((w) => w.word));
    setPhase("done");
  };

  const retryMissed = () => {
    const missed = order.filter((w) => marks[w.word] === false);
    if (missed.length === 0) { finishMarking(); return; }
    const picked = shuffledOrder ? shuffle(missed) : missed;
    setOrder(picked);
    setIdx(0);
    repCountRef.current = 0;
    setEnPlayed(new Set());
    setZhPlayed(new Set());
    setMarks({});
    setGrading(false);
    // 总时长：重听不清零，持续累计（含重听时间）
    setPhase("run");
    window.setTimeout(() => playIndex(0), 200);
  };

  // ── 选词 ──
  const toggleSelect = (w: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(w)) n.delete(w);
      else n.add(w);
      return n;
    });
  };
  const selectAll = () => setSelected(new Set(unit.words.map((w) => w.word)));
  const clearSelect = () => setSelected(new Set());

  const start = () => {
    if (selected.size === 0) return;
    const picked = unit.words.filter((w) => selected.has(w.word));
    setOrder(shuffledOrder ? shuffle(picked) : picked);
    setIdx(0);
    repCountRef.current = 0;
    setEnPlayed(new Set());
    setZhPlayed(new Set());
    setMarks({});
    setGrading(false);
    setElapsed(0);
    setPhase("run");
    window.setTimeout(() => playIndex(0), 200);
  };

  const exit = () => {
    stopAndReset();
    setWaiting(false);
    setGrading(false);
    setPhase("intro");
    setOrder([]);
  };

  /** 按模式显示词面 */
  const face = (w: WordCard): string => {
    if (mode === "zh") return w.cn || w.word;
    if (mode === "both") return `${w.word} · ${w.cn}`;
    return w.word;
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  if (unit.words.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <PageHead eyebrow="自助餐" title="听写" desc="听发音、写单词，检验这单元的词记得怎么样。" />
        <Panel className="px-6 py-10 text-center">
          <p className="text-[16px] font-bold">这个单元还没有词卡</p>
          <p className="mt-1.5 text-[14px] text-muted-text">去天天见练几句，词卡就会出现。</p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHead
        eyebrow={`Unit ${unit.no} ${unit.title} · ${phase === "run" ? `${idx + 1} / ${order.length}` : `${unit.words.length} 词`}`}
        title="听写"
        desc={phase === "intro" ? "先挑要听写的词。" : undefined}
        right={
          phase === "run" ? (
            <Btn size="sm" variant="soft" onClick={exit}>
              退出
            </Btn>
          ) : undefined
        }
      />

      {phase === "intro" && (
        /* ── 选词 ── */
        <Panel className="px-5 py-4">
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-bold leading-tight">选词（已选 {selected.size}）</p>
            <div className="flex gap-1.5">
              <button type="button" onClick={selectAll} className="rounded-xl bg-secondary px-3 py-1.5 text-[13px] font-bold text-secondary-foreground">全选</button>
              <button type="button" onClick={clearSelect} className="rounded-xl bg-secondary px-3 py-1.5 text-[13px] font-bold text-secondary-foreground">清空</button>
            </div>
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {unit.words.map((w) => {
              const on = selected.has(w.word);
              return (
                <li key={w.word}>
                  <button
                    type="button"
                    onClick={() => toggleSelect(w.word)}
                    aria-pressed={on}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition-colors duration-200",
                      on ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-bold leading-tight">{w.word}</span>
                      <span className={cn("block truncate text-[12px] leading-tight", on ? "text-primary-foreground/75" : "text-muted-text")}>{w.cn}</span>
                    </span>
                    <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border", on ? "border-primary-foreground/50 bg-primary-foreground/20" : "border-border/60")}>
                      {on && <CheckIcon className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={start}
            disabled={selected.size === 0}
            className="tap-target mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[16px] font-bold text-primary-foreground disabled:opacity-40"
          >
            <PlayIcon className="h-5 w-5" />
            开始听写（{selected.size} 词）
          </button>
        </Panel>
      )}

      {phase === "run" && word && (
        <>
          {/* 区域1：模式参数 */}
          <Panel className="px-4 py-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-stretch gap-0.5 rounded-xl bg-secondary p-0.5">
                {[0.75, 1, 1.25, 1.5].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => { setRate(r); setAudioRate(r); }}
                    aria-pressed={rate === r}
                    className={cn("rounded-lg px-2 py-1 text-[12px] font-bold tabular-nums", rate === r ? "bg-primary text-primary-foreground" : "text-secondary-foreground")}
                  >
                    {r === 1 ? "1x" : `${r}x`}
                  </button>
                ))}
              </div>
              <div className="flex items-stretch gap-0.5 rounded-xl bg-secondary p-0.5">
                {(
                  [
                    { k: "en", t: "英文" },
                    { k: "zh", t: "中文" },
                    { k: "both", t: "双语" },
                  ] as { k: ListenMode; t: string }[]
                ).map((m) => (
                  <button
                    key={m.k}
                    type="button"
                    onClick={() => setMode(m.k)}
                    aria-pressed={mode === m.k}
                    className={cn("rounded-lg px-2.5 py-1 text-[12px] font-bold", mode === m.k ? "bg-primary text-primary-foreground" : "text-secondary-foreground")}
                  >
                    {m.t}
                  </button>
                ))}
              </div>
              <div className="flex items-stretch gap-0.5 rounded-xl bg-secondary p-0.5">
                {[1, 2].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRepeat(n as 1 | 2)}
                    aria-pressed={repeat === n}
                    className={cn("rounded-lg px-2.5 py-1 text-[12px] font-bold", repeat === n ? "bg-primary text-primary-foreground" : "text-secondary-foreground")}
                  >
                    重复×{n}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setContinuous((v) => !v)}
                aria-pressed={continuous}
                className={cn("rounded-xl px-3 py-1.5 text-[12px] font-bold", continuous ? "bg-lit-soft text-[var(--lit)] ring-1 ring-[var(--lit)]/30" : "bg-secondary text-muted-text")}
              >
                连续{continuous ? "开" : "关"}
              </button>
              <button
                type="button"
                onClick={() => setShuffledOrder((v) => !v)}
                aria-pressed={shuffledOrder}
                className={cn("rounded-xl px-3 py-1.5 text-[12px] font-bold", shuffledOrder ? "bg-lit-soft text-[var(--lit)] ring-1 ring-[var(--lit)]/30" : "bg-secondary text-muted-text")}
              >
                {shuffledOrder ? "乱序" : "顺序"}
              </button>
            </div>
          </Panel>

          {/* 区域2：播放（播放按钮即「下一个」+倒计时环） */}
          <Panel className="px-5 py-6 text-center">
            <div className="flex items-center justify-between text-[12px] font-semibold tabular-nums text-muted-text">
              <span>第 {idx + 1} / {order.length} 词 · 已听 {playedCount}</span>
              <span>⏱ {fmt(elapsed)}</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-idle">
              <div className="h-full rounded-full bg-lit transition-[width] duration-500" style={{ width: `${((idx + 1) / order.length) * 100}%` }} />
            </div>

            {/* 当前词（随模式显示） */}
            <div className="mt-5 min-h-16 rounded-2xl bg-accent/50 px-4 py-3">
              <p className="text-[22px] font-extrabold leading-tight break-words text-foreground">{face(word)}</p>
              {playing && <p className="mt-1 text-[12px] text-muted-text">正在播放…</p>}
            </div>

            {/* 播放按钮 = 下一个（倒计时环 + 读秒） */}
            <div
              className="mx-auto mt-6 h-24 w-24"
              style={
                waiting && waitTotal > 0
                  ? { background: `conic-gradient(var(--primary) ${(waitLeft / waitTotal) * 360}deg, transparent 0deg)`, borderRadius: "9999px", padding: 4 }
                  : undefined
              }
            >
              <button
                type="button"
                onClick={waiting ? advance : togglePlay}
                aria-label={waiting ? "下一个" : playing ? "暂停" : "播放"}
                className={cn(
                  "grid h-full w-full place-items-center rounded-full text-[17px] font-bold shadow-lift transition-transform active:scale-95",
                  playing ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground",
                )}
              >
                {waiting ? (
                  <span className="flex flex-col items-center leading-none">
                    <span>下一个</span>
                    <span className="mt-1 text-[13px] tabular-nums opacity-85">{Math.max(1, Math.ceil(waitLeft / 1000))}s</span>
                  </span>
                ) : playing ? (
                  <span className="flex flex-col items-center leading-none">
                    <span className="text-[12px]">暂停</span>
                  </span>
                ) : (
                  <span className="flex flex-col items-center leading-none">
                    <span className="text-[12px]">再听</span>
                  </span>
                )}
              </button>
            </div>

            {waiting && (
              <p className="mt-2 text-[12px] text-muted-text">
                {continuous ? "倒计时结束自动进下一个" : "点「下一个」进入下一词"}
              </p>
            )}

            {/* 上一下 */}
            <div className="mt-4 flex items-center justify-center gap-4">
              <button type="button" onClick={() => step(-1)} disabled={idx === 0} aria-label="上一个" className="grid h-11 w-11 place-items-center rounded-full bg-secondary text-secondary-foreground hover:bg-accent disabled:opacity-40">
                <PrevIcon className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => step(1)} disabled={idx === order.length - 1 && !waiting} aria-label="下一个" className="grid h-11 w-11 place-items-center rounded-full bg-secondary text-secondary-foreground hover:bg-accent disabled:opacity-40">
                <NextIcon className="h-5 w-5" />
              </button>
            </div>
          </Panel>

          {/* 区域3：单词列表 */}
          <Panel className="px-4 py-4">
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-bold leading-tight">单词列表</p>
            </div>
            <ul className="mt-3 grid grid-cols-1 gap-1.5">
              {order.map((w, i) => {
                const isCur = i === idx;
                const enDone = enPlayed.has(w.word);
                const zhDone = zhPlayed.has(w.word);
                const played = enDone || zhDone;
                return (
                  <li key={`${w.word}-${i}`}>
                    <button
                      type="button"
                      onClick={() => jumpTo(i)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors duration-200",
                        isCur ? "border-primary bg-accent/50" : "border-border/50 bg-card",
                      )}
                    >
                      <span className="w-6 shrink-0 text-right text-[12px] font-bold tabular-nums text-muted-text">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        {played ? (
                          <span className="block">
                            <span className="block truncate text-[15px] font-bold leading-tight text-foreground">
                              {w.word}
                            </span>
                            <span className="block truncate text-[12px] leading-tight text-muted-text">
                              {w.cn}
                            </span>
                          </span>
                        ) : (
                          <span className="block text-[15px] font-bold leading-tight tracking-[0.3em] text-muted-text/70">────</span>
                        )}
                      </span>
                      {isCur && <span className="shrink-0 text-[var(--primary)]">▶</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>

          {/* 批改入口（听完所有词后出现） */}
          {grading && (
            <Panel className="px-5 py-5">
              <p className="text-[15px] font-bold leading-tight">批改</p>
              <p className="mt-1 text-[13px] text-muted-text">听完所有词了，看看都记得哪些：</p>
              <ul className="mt-3 space-y-1.5">
                {order.map((w) => {
                  const m = marks[w.word];
                  return (
                    <li key={w.word}>
                      <button
                        type="button"
                        onClick={() => setMarks((mm) => ({ ...mm, [w.word]: !m }))}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left",
                          m ? "border-lit/50 bg-lit-soft" : "border-border/50 bg-card",
                        )}
                      >
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-border/60">
                          {m && <CheckIcon className="h-3.5 w-3.5 text-[var(--lit)]" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-bold leading-tight">{w.word}</span>
                          <span className="block truncate text-[12px] leading-tight text-muted-text">{w.cn}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => markAll(true)} className="flex-1 rounded-xl bg-secondary py-2.5 text-[14px] font-bold text-secondary-foreground">全对</button>
                <button type="button" onClick={() => markAll(false)} className="flex-1 rounded-xl bg-secondary py-2.5 text-[14px] font-bold text-secondary-foreground">全错</button>
              </div>
              <div className="mt-3 flex gap-2">
                {Object.values(marks).some((v) => !v) && (
                  <Btn variant="soft" onClick={retryMissed} className="flex-1">
                    <RepeatIcon className="h-5 w-5" />
                    重听错词
                  </Btn>
                )}
                <Btn onClick={finishMarking} className="flex-1">
                  完成听写
                </Btn>
              </div>
            </Panel>
          )}
        </>
      )}

      {phase === "done" && (
        <>
          <Panel className="px-5 py-8 text-center">
            <p className="text-[15px] font-bold text-primary-deep">听写完成</p>
            <p className="mt-3 text-[34px] leading-none font-extrabold text-foreground tabular-nums">
              {remembered}
              <span className="ml-1 text-[16px] font-bold text-muted-text">/ {order.length}</span>
            </p>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-text">
              {remembered === order.length
                ? "全部记住啦，太棒了！"
                : remembered >= order.length * 0.7
                  ? "记住了一大半，很厉害！"
                  : "没记住的已经标出来，再练一遍就好。"}
            </p>
          </Panel>

          <div className="flex flex-col gap-2">
            {Object.entries(marks).some(([, v]) => !v) && (
              <Btn variant="soft" onClick={retryMissed}>
                <RepeatIcon className="h-5 w-5" />
                把没记住的再听写一遍
              </Btn>
            )}
            <Link to="/words">
              <Btn className="w-full">
                <SpeakerIcon className="h-5 w-5" />
                回词卡复习
              </Btn>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function RepeatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M4.4 10.4A7.6 7.6 0 0 1 18 7.4M19.6 13.6a7.6 7.6 0 0 1-13.6 3" />
      <path d="M18.4 3.6v3.9h-3.9M5.6 20.4v-3.9h3.9" />
    </svg>
  );
}
