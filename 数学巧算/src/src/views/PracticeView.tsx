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
  const { recordPractice, pushMistake, store } = useProgress();
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
  const seqRef = useRef(0);

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
            setFinished(true);
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

  /* 结算 */
  if (finished) {
    const rate = total ? correct / total : 0;
    const stars = rate >= 0.9 ? 3 : rate >= 0.6 ? 2 : 1;
    recordPractice(`${key}:${lesson?.lesson_id || lessonId}`, level, correct, total, Math.round(ms / 1000));
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
            <Btn variant="primary" onClick={() => { seqRef.current = 0; setCorrect(0); setDoneCount(0); setFinished(false); setMs(0); nextQ(); }}>
              再练一次
            </Btn>
          </div>
        </Panel>
        <p className="mt-3 text-center text-[12px] text-muted-foreground">今日已打卡 · 🔥 连续 {store.streak} 天</p>
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