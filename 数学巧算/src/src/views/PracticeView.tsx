// 数学巧算 · 练习页：出题 → button 数字键盘作答 → 即时反馈 → 结算打卡 → 错题入错题本
// 引擎对接：window.SMART_GENERATORS.gen(genName)（巧算题生成器；引擎未就绪时降级示例题）
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackBtn, Btn, Panel, Pill, Stars } from "@/components/ui-kit";
import { STAGES, type SmartLesson, type SmartStage } from "@/data/stages.generated";
import { useProgress } from "@/lib/store";

type Level = "basic" | "advance" | "challenge";

interface Question {
  type: string;
  text: string;
  answer: number | string;
  hint?: string;
}

/** 组后二选浮层数据（到点类型 + 是否可延迟） */
type DueUi = { kind: "time" | "questions"; canExtend: boolean };

/** 引擎存在性检查：离线构建后由 assets/smart_gen/smart_gen.js 挂载 */
function getEngine(): { gen: (name: string) => Question | null } | null {
  const w = window as unknown as {
    SMART_GENERATORS?: { gen: (name: string) => Question | null };
  };
  return w.SMART_GENERATORS || null;
}

export function PracticeView({
  stageKey,
  lessonId,
  level,
  onExit,
}: {
  stageKey: number | string;
  lessonId: string;
  level: Level;
  onExit: () => void;
}) {
  const { recordPractice, pushMistake, store, dueInfo, extendDue, enoughNow, addPlayed, locked } = useProgress();
  const key = String(stageKey);

  const lesson: SmartLesson | undefined = useMemo(() => {
    const stage: SmartStage | undefined = STAGES.find((s) => String(s.stage) === key);
    return stage?.lessons?.find((l) => l.lesson_id === lessonId || l.title === lessonId);
  }, [key, lessonId]);

  const genName = lesson?.practice?.[level]?.gen || "";
  const total = lesson?.practice?.[level]?.count || 5;

  const [q, setQ] = useState<Question | null>(null);
  const [input, setInput] = useState("");
  const [doneCount, setDoneCount] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [flash, setFlash] = useState<"ok" | "wrong" | null>(null);
  const [wrongInfo, setWrongInfo] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [ms, setMs] = useState(0);
  const [dueChoice, setDueChoice] = useState<DueUi | null>(null); // 组后二选浮层
  const [guideVisible, setGuideVisible] = useState(false);        // 到点引导条（第一段）
  const [lockedState, setLockedState] = useState<boolean | null>(null); // null=检查中；true=自律锁
  const seqRef = useRef(0);
  const shownDueRef = useRef(false); // 防重复弹二选（同一结算只弹一次）

  /* 出下一题 */
  const nextQ = useCallback(() => {
    setInput("");
    setWrongInfo(null);
    setFlash(null);
    const engine = getEngine();
    const gen = genName || "";
    if (engine && gen) {
      const qq = engine.gen(gen);
      if (qq) {
        setQ(qq);
        return;
      }
    }
    // 降级示例题（引擎未就绪/无 genName）：basic=凑十、advance=补数、challenge=基准数
    setQ(fallbackQuestion(level));
  }, [genName, level]);

  /* 计时 */
  useEffect(() => {
    if (finished) return;
    const t = window.setInterval(() => setMs((m) => m + 100), 100);
    return () => window.clearInterval(t);
  }, [finished]);

  useEffect(() => {
    if (lesson) nextQ();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 自律锁检查（mount 时；今日已自律则阻止练习） */
  useEffect(() => {
    setLockedState(locked());
  }, [locked]);

  if (lockedState) {
    return (
      <div className="anim-fade-in-up pt-2">
        <div className="flex items-center pb-3">
          <BackBtn onClick={onExit} />
          <span className="flex-1 text-center text-[15px] font-bold">{lesson?.title}</span>
          <span className="w-10" />
        </div>
        <Panel className="px-5 py-10 text-center">
          <p className="text-5xl">🛡</p>
          <p className="mt-3 text-[18px] font-extrabold text-foreground">今天已经很自律啦</p>
          <p className="mt-1 text-[13px] text-muted-foreground">明天见！让眼睛和大脑好好休息。</p>
          <div className="mt-5 flex justify-center">
            <Btn variant="primary" onClick={onExit}>回去</Btn>
          </div>
        </Panel>
      </div>
    );
  }

  const checkAnswer = useCallback(
    (ans: string) => {
      if (!q || finished) return;
      const norm = ans.trim();
      const isCorrect = eq(norm, q.answer);
      if (isCorrect) {
        setCorrect((c) => c + 1);
        setFlash("ok");
        setWrongInfo(null);
        window.setTimeout(() => {
          const n = seqRef.current + 1;
          seqRef.current = n;
          setDoneCount(n);
          if (n >= total) {
            // B3 修复：先累计本组题量再判到点（本组应计入今日题量）
            addPlayed(total);
            setFinished(true);
            // 第二段：组后二选（到点才弹；未到点直接结算）
            const due = dueInfo();
            if (due && !shownDueRef.current) {
              shownDueRef.current = true;
              setDueChoice(due);
            }
          } else {
            nextQ();
          }
        }, 350);
      } else {
        setFlash("wrong");
        setWrongInfo(`答案是 ${q.answer}${q.hint ? " · " + q.hint : ""}`);
        pushMistake(lesson?.lesson_id || lessonId, q.text, q.answer);
        window.setTimeout(() => setFlash(null), 400);
      }
    },
    [q, finished, total, nextQ, pushMistake, lesson?.lesson_id, lessonId],
  );

  /* 数字键盘按键 */
  const onKey = (k: string) => {
    if (finished) return;
    if (k === "⌫") {
      setInput((v) => v.slice(0, -1));
      return;
    }
    if (k === "✓") {
      if (input.trim()) checkAnswer(input);
      return;
    }
    if (/^\d$/.test(k)) {
      setInput((v) => (v.length < 8 ? v + k : v));
      return;
    }
    if (k === "." && !input.includes(".")) {
      setInput((v) => (v.length ? v + k : "0."));
      return;
    }
    if (k === "/" && !input.includes("/")) {
      setInput((v) => (v.length ? v + k : v));
      return;
    }
  };

  /* 实体键盘 */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (finished) return;
      if (/^[0-9]$/.test(e.key)) onKey(e.key);
      else if (e.key === ".") onKey(".");
      else if (e.key === "/") onKey("/");
      else if (e.key === "Backspace") onKey("⌫");
      else if (e.key === "Enter") onKey("✓");
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, q]);

  /* 第一段：练习中到点引导条（非阻塞，不暂停） */
  useEffect(() => {
    if (finished) return;
    const t = window.setInterval(() => {
      // B2 修复：当前局进行中的秒数计入到点判定（todaySec 只累计已完成局的秒）
      const due = dueInfo(Math.floor(msRef.current / 1000));
      if (due) setGuideVisible(true);
    }, 15000);
    return () => window.clearInterval(t);
  }, [finished, dueInfo]);

  /* B1 修复：结算副作用（记练习）移入 effect，防渲染体 setStore 无限循环；题量累计在 checkAnswer 内完成（B3） */
  const msRef = useRef(0);
  useEffect(() => {
    msRef.current = ms;
  }, [ms]);
  useEffect(() => {
    if (finished) {
      recordPractice(`${key}:${lesson?.lesson_id || lessonId}`, level, correct, total, Math.round(ms / 1000));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  /* 结算（含组后二选浮层） */
  if (finished) {
    const rate = total ? correct / total : 0;
    const stars = rate >= 0.9 ? 3 : rate >= 0.6 ? 2 : 1;
    return (
      <div className="anim-pop-in pt-2">
        <div className="flex items-center pb-3">
          <BackBtn onClick={onExit} />
          <span className="flex-1 text-center text-[15px] font-bold">{lesson?.title}</span>
          <span className="w-10" />
        </div>
        <Panel className="px-5 py-8 text-center">
          <p className="text-5xl">{rate >= 0.9 ? "🎉" : rate >= 0.6 ? "🌤" : "💪"}</p>
          <p className="mt-3 text-[20px] font-extrabold">完成 {levelName(level)}练习</p>
          <div className="mt-2 flex justify-center">
            <Stars n={stars} size={28} />
          </div>
          <p className="mt-3 text-[15px] text-muted-foreground">
            答对 <b className="text-[var(--lit)]">{correct}</b> / {total} 题 · 用时 {fmtMs(ms)}
          </p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {rate >= 0.9 ? "掌握得不错！试试下一档。" : rate >= 0.6 ? "再练一练就更稳了。" : "回看原理探究，再挑战一次。"}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Btn variant="soft" onClick={onExit}>
              回课程
            </Btn>
            <Btn variant="primary" onClick={() => { seqRef.current = 0; setCorrect(0); setDoneCount(0); setFinished(false); setMs(0); setDueChoice(null); nextQ(); }}>
              再练一次
            </Btn>
          </div>
        </Panel>
        <p className="mt-3 text-center text-[12px] text-muted-foreground">今日已打卡 · 🔥 连续 {store.streak} 天</p>

        {/* 组后二选浮层（到点才出现） */}
        {dueChoice && (
          <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 px-6 pb-16">
            <Panel className="w-full max-w-[360px] px-5 py-6 text-center">
              <p className="text-4xl">{dueChoice.kind === "time" ? "⏰" : "📊"}</p>
              <p className="mt-2 text-[17px] font-extrabold text-foreground">
                {dueChoice.kind === "time" ? "练习时间到啦" : "今天的练习量到啦"}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                这一组已完成，休息一下眼睛和大脑吧。
              </p>
              <div className="mt-5 flex flex-col gap-2.5">
                {dueChoice.canExtend && (
                  <Btn variant="soft" onClick={() => { extendDue(dueChoice.kind); setDueChoice(null); }}>
                    再练 {dueChoice.kind === "time" ? "5 分钟" : "10 题"}
                  </Btn>
                )}
                <Btn variant="lit" onClick={() => { enoughNow(); setDueChoice(null); }}>
                  我很自律，今天足够了
                </Btn>
              </div>
              <p className="mt-3 text-[11.5px] text-muted-foreground">延后可继续，但到点还是会让眼睛休息哦</p>
            </Panel>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="anim-fade-in-up pt-2">
      <div className="flex items-center justify-between pb-3">
        <BackBtn onClick={onExit} />
        <Pill tone="sky">{levelName(level)} · {level === "basic" ? "基础" : level === "advance" ? "提高" : "挑战"}</Pill>
        <span className="w-10" />
      </div>

      {/* 到点引导条（第一段，非阻塞） */}
      {guideVisible && (
        <div className="mb-3 flex items-center justify-between rounded-2xl border border-warm/40 bg-warm-soft px-3.5 py-2.5">
          <span className="text-[13px] font-semibold text-[var(--warm)]">⏰ 再做完这组就休息哦</span>
          <button
            type="button"
            onClick={() => setGuideVisible(false)}
            className="tap-target text-[13px] font-bold text-[var(--warm)]"
            aria-label="知道了"
          >
            知道了
          </button>
        </div>
      )}

      {/* 题面 */}
      <Panel className="px-4 py-6 text-center">
        <p className="mb-1 text-[12.5px] text-muted-foreground">
          第 {Math.min(doneCount + 1, total)} / {total} 题
        </p>
        {q && (
          <p className="font-num text-[28px] font-extrabold leading-snug text-foreground">{q.text}</p>
        )}
        {q?.hint && <p className="mt-1 text-[12.5px] text-muted-foreground">💡 {q.hint}</p>}
        {flash === "ok" && <p className="mt-2 text-[16px] font-bold text-[var(--lit)]">✓ 答对了</p>}
        {flash === "wrong" && <p className="mt-2 text-[14px] font-bold text-[var(--warm)]">{wrongInfo}</p>}
      </Panel>

      {/* 输入框 */}
      <div className="mt-3 flex items-center justify-center">
        <div className="w-full max-w-[280px] rounded-2xl border border-border bg-card px-4 py-3 text-center">
          <span className="font-num text-[24px] font-extrabold tracking-widest text-foreground">
            {input || " "}
            <span className="ml-0.5 inline-block h-6 w-0.5 animate-pulse bg-primary align-middle" />
          </span>
        </div>
      </div>

      {/* 数字键盘 */}
      <div className="mx-auto mt-4 grid max-w-[300px] grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "/"].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onKey(k)}
            className="tap-target h-14 rounded-2xl bg-secondary text-[22px] font-bold text-secondary-foreground shadow-soft transition-transform active:scale-95"
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onKey("⌫")}
          className="tap-target h-14 rounded-2xl bg-muted text-[20px] text-muted-foreground transition-transform active:scale-95"
          aria-label="退格"
        >
          ⌫
        </button>
        <button
          type="button"
          onClick={() => onKey("✓")}
          className="tap-target h-14 rounded-2xl bg-primary text-[18px] font-extrabold text-primary-foreground shadow-soft transition-transform active:scale-95"
          aria-label="提交"
        >
          提交
        </button>
      </div>

      <p className="mt-4 text-center text-[12.5px] text-muted-foreground">
        回答后立即判定 · 错误自动进错题本
      </p>
    </div>
  );
}

/* ------------------------------ 工具 ------------------------------ */

function levelName(l: Level): string {
  return l === "basic" ? "基础" : l === "advance" ? "提高" : "挑战";
}

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} 分 ${s % 60} 秒` : `${s} 秒`;
}

/** 答案等价比较：支持整数/小数/分数 "p/q" 与数值互认 */
function eq(input: string, answer: number | string): boolean {
  const a = String(answer).trim();
  if (input === a) return true;
  const toNum = (s: string): number => {
    const m = s.match(/^(-?\d+)\/(-?\d+)$/);
    if (m && Number(m[2]) !== 0) return Number(m[1]) / Number(m[2]);
    return Number(s);
  };
  const n1 = toNum(input);
  const n2 = toNum(a);
  return Number.isFinite(n1) && Number.isFinite(n2) && Math.abs(n1 - n2) < 1e-6;
}

/** 引擎未就绪时的降级示例题（保证 UI 可演示） */
function fallbackQuestion(level: Level): Question {
  const list: Question[] =
    level === "basic"
      ? [
          { type: "complement_to_ten", text: "9 + 6 =", answer: 15 },
          { type: "complement_to_ten", text: "8 + 5 =", answer: 13 },
        ]
      : level === "advance"
        ? [
            { type: "complement_to_whole", text: "28 + 75 + 72 + 25 =", answer: 200 },
            { type: "move_number", text: "65 + 28 − 35 =", answer: 58 },
          ]
        : [
            { type: "baseline_num", text: "52 + 54 + 46 + 49 + 51 =", answer: 252 },
            { type: "extract_common_factor", text: "25 × 37 + 25 × 63 =", answer: 2500 },
          ];
  const r = Math.floor(Math.random() * list.length);
  return list[r];
}