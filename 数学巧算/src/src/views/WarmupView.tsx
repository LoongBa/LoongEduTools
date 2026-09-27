// 数学巧算 · 口算热身：复用数学口算 generators.js（KOU_GENERATORS），三档年级段知识点池
// 入口：HomeView「口算热身」→ 选档（一年级/二年级/三年级）→ 连出 10 题 → 即时反馈 → 结算打卡
// 判题：window.SMART_GENERATORS.normalizeInput（巧算引擎先加载，运行时安全）
// 防沉迷联动：结算时 todaySec（recordPractice 现有）+ guard.addPlayed({count})（见 lib/guard）
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackBtn, Btn, Panel, Pill, Stars } from "@/components/ui-kit";
import { useProgress } from "@/lib/store";

type WarmLevel = "g1" | "g2" | "g3";

interface KouQ {
  type: string;
  text: string;
  answer: number | string;
}

/** 组后二选浮层数据 */
type DueUi = { kind: "time" | "questions"; canExtend: boolean };

/** 引擎存在性检查（离线构建后由 assets/kou_gen/kou_gen.js 挂载） */
function getKou(): { list: string[]; gen: (type: string) => KouQ | null; validate: (q: KouQ) => boolean } | null {
  const w = window as unknown as {
    KOU_GENERATORS?: { list: string[]; gen: (type: string) => KouQ | null; validate: (q: KouQ) => boolean };
  };
  return w.KOU_GENERATORS || null;
}
/** 判题归一（挂巧算引擎，口算 answer 格式 number/"p/q"/小数 兼容） */
function getNormalizer(): ((input: string, answer: number | string) => boolean) | null {
  const w = window as unknown as { SMART_GENERATORS?: { normalizeInput: (i: string, a: number | string) => boolean } };
  return w.SMART_GENERATORS?.normalizeInput || null;
}

/** 知识点池：档位 → 知识点 id 列表（每档随机 3 个循环出题） */
const POOL: Record<WarmLevel, string[]> = {
  g1: ["g1_10addsub", "g1_20add", "g1_20sub", "g1_100"],
  g2: ["g2_mult", "g2_div", "g2_100", "g2_mixed"],
  g3: ["g3_wan", "g3_mult1", "g3_mult2", "g3_div1", "g3_frac"],
};

const LEVEL_LABEL: Record<WarmLevel, string> = {
  g1: "一年级",
  g2: "二年级",
  g3: "三年级",
};

const TOTAL = 10;

export function WarmupView({ onExit }: { onExit: () => void }) {
  const { recordPractice, pushMistake, store, dueInfo, extendDue, enoughNow, addPlayed, locked } = useProgress();
  const [level, setLevel] = useState<WarmLevel | null>(null); // null = 选档页
  const [q, setQ] = useState<KouQ | null>(null);
  const [input, setInput] = useState("");
  const [doneCount, setDoneCount] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [flash, setFlash] = useState<"ok" | "wrong" | null>(null);
  const [wrongInfo, setWrongInfo] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [ms, setMs] = useState(0);
  const [dueChoice, setDueChoice] = useState<DueUi | null>(null);
  const [guideVisible, setGuideVisible] = useState(false);
  const [lockedState, setLockedState] = useState<boolean | null>(null);
  const seqRef = useRef(0);
  const startRef = useRef(0);
  const shownDueRef = useRef(false);

  /* 出下一题（从当前档知识点池随机取一个知识点，避免连续同知识点） */
  const nextQ = useCallback(() => {
    setInput("");
    setWrongInfo(null);
    setFlash(null);
    if (!level) return;
    const kou = getKou();
    if (!kou) return;
    const pool = POOL[level];
    const type = pool[Math.floor(Math.random() * pool.length)];
    const qq = kou.gen(type);
    if (qq) setQ(qq);
  }, [level]);

  /* 计时 */
  useEffect(() => {
    if (finished || !level) return;
    startRef.current = performance.now();
    const t = window.setInterval(() => setMs((m) => m + 100), 100);
    return () => window.clearInterval(t);
  }, [finished, level]);

  useEffect(() => {
    if (level) nextQ();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  /* 自律锁检查（mount 时） */
  useEffect(() => {
    setLockedState(locked());
  }, [locked]);

  /* 第一段：练习中到点引导条 */
  useEffect(() => {
    if (finished || !level) return;
    const t = window.setInterval(() => {
      const due = dueInfo();
      if (due) setGuideVisible(true);
    }, 15000);
    return () => window.clearInterval(t);
  }, [finished, level, dueInfo]);

  const checkAnswer = useCallback(
    (ans: string) => {
      if (!q || finished || !level) return;
      const norm = ans.trim();
      const normalizer = getNormalizer();
      const isCorrect = normalizer ? normalizer(norm, q.answer) : eqFallback(norm, q.answer);
      if (isCorrect) {
        setCorrect((c) => c + 1);
        setFlash("ok");
        setWrongInfo(null);
        window.setTimeout(() => {
          const n = seqRef.current + 1;
          seqRef.current = n;
          setDoneCount(n);
          if (n >= TOTAL) {
            setFinished(true);
            const due = dueInfo();
            shownDueRef.current = false;
            if (due && !shownDueRef.current) {
              shownDueRef.current = true;
              setDueChoice(due);
            }
          } else {
            nextQ();
          }
        }, 300);
      } else {
        setFlash("wrong");
        setWrongInfo(`答案是 ${q.answer}`);
        pushMistake(`warmup:${level}`, q.text, q.answer);
        window.setTimeout(() => setFlash(null), 400);
      }
    },
    [q, finished, level, nextQ, pushMistake],
  );

  const onKey = (k: string) => {
    if (finished || !level) return;
    if (k === "⌫") { setInput((v) => v.slice(0, -1)); return; }
    if (k === "✓") { if (input.trim()) checkAnswer(input); return; }
    if (/^\d$/.test(k)) { setInput((v) => (v.length < 8 ? v + k : v)); return; }
    if (k === "." && !input.includes(".")) { setInput((v) => (v.length ? v + k : "0.")); return; }
    if (k === "/" && !input.includes("/")) { setInput((v) => (v.length ? v + k : v)); return; }
  };

  /* 实体键盘 */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (finished || !level) return;
      if (/^[0-9]$/.test(e.key)) onKey(e.key);
      else if (e.key === ".") onKey(".");
      else if (e.key === "/") onKey("/");
      else if (e.key === "Backspace") onKey("⌫");
      else if (e.key === "Enter") onKey("✓");
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, level, q, input]);

  /* 自律锁检查（mount 时） */
  useEffect(() => {
    setLockedState(locked());
  }, [locked]);

  if (lockedState) {
    return (
      <div className="anim-fade-in-up pt-2">
        <div className="flex items-center pb-3">
          <BackBtn onClick={onExit} />
          <span className="flex-1 text-center text-[15px] font-bold">口算热身</span>
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

  /* 结算 */
  if (finished && level) {
    const rate = TOTAL ? correct / TOTAL : 0;
    const stars = rate >= 0.9 ? 3 : rate >= 0.6 ? 2 : 1;
    const sec = Math.round(ms / 1000);
    recordPractice(`warmup:${level}`, "basic", correct, TOTAL, sec);
    addPlayed(TOTAL);
    return (
      <div className="anim-pop-in pt-2">
        <div className="flex items-center pb-3">
          <BackBtn onClick={onExit} />
          <span className="flex-1 text-center text-[15px] font-bold">口算热身 · {LEVEL_LABEL[level]}</span>
          <span className="w-10" />
        </div>
        <Panel className="px-5 py-8 text-center">
          <p className="text-5xl">{rate >= 0.9 ? "🎉" : rate >= 0.6 ? "🌤" : "💪"}</p>
          <p className="mt-3 text-[20px] font-extrabold">热身完成</p>
          <div className="mt-2 flex justify-center">
            <Stars n={stars} size={28} />
          </div>
          <p className="mt-3 text-[15px] text-muted-foreground">
            答对 <b className="text-[var(--lit)]">{correct}</b> / {TOTAL} 题 · 用时 {fmtMs(ms)}
          </p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {rate >= 0.9 ? "状态很好！去学巧算新招吧。" : rate >= 0.6 ? "再热热身会更稳。" : "回看口算基础，再试一次。"}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Btn variant="soft" onClick={onExit}>回首页</Btn>
            <Btn variant="primary" onClick={() => { seqRef.current = 0; setCorrect(0); setDoneCount(0); setFinished(false); setMs(0); setDueChoice(null); nextQ(); }}>
              再热一次
            </Btn>
          </div>
        </Panel>
        <p className="mt-3 text-center text-[12px] text-muted-foreground">今日已打卡 · 🔥 连续 {store.streak} 天</p>

        {/* 组后二选浮层 */}
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

  /* 选档页 */
  if (!level) {
    return (
      <div className="anim-fade-in-up pt-2">
        <div className="flex items-center pb-3">
          <BackBtn onClick={onExit} />
          <span className="flex-1 text-center text-[15px] font-bold">口算热身</span>
          <span className="w-10" />
        </div>
        <Panel className="px-5 py-6">
          <p className="text-center text-[16px] font-extrabold text-foreground">先热热身</p>
          <p className="mt-1 text-center text-[13px] text-muted-foreground">
            10 题口算打底，选你所在的年级。原理先行，练完再学巧算新招。
          </p>
          <div className="mt-5 flex flex-col gap-2.5">
            {(Object.keys(POOL) as WarmLevel[]).map((lv) => (
              <button
                key={lv}
                type="button"
                onClick={() => setLevel(lv)}
                className="tap-target panel-border flex items-center justify-between rounded-2xl border bg-gradient-to-br from-[#FFF3D6] to-[#FFE4B5] px-4 py-3.5 text-left shadow-soft transition-transform active:scale-[0.985]"
              >
                <div>
                  <p className="text-[16px] font-extrabold text-foreground">{LEVEL_LABEL[lv]}</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {POOL[lv].length} 个知识点 · 10 题
                  </p>
                </div>
                <span className="text-2xl">{lv === "g1" ? "🌱" : lv === "g2" ? "🧩" : "🚀"}</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>
    );
  }

  /* 练习页 */
  return (
    <div className="anim-fade-in-up pt-2">
      <div className="flex items-center justify-between pb-3">
        <BackBtn onClick={onExit} />
        <Pill tone="sky">{LEVEL_LABEL[level]} · 热身</Pill>
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

      <Panel className="px-4 py-6 text-center">
        <p className="mb-1 text-[12.5px] text-muted-foreground">
          第 {Math.min(doneCount + 1, TOTAL)} / {TOTAL} 题
        </p>
        {q && <p className="font-num text-[28px] font-extrabold leading-snug text-foreground">{q.text}</p>}
        {flash === "ok" && <p className="mt-2 text-[16px] font-bold text-[var(--lit)]">✓ 答对了</p>}
        {flash === "wrong" && <p className="mt-2 text-[14px] font-bold text-[var(--warm)]">{wrongInfo}</p>}
      </Panel>

      <div className="mt-3 flex items-center justify-center">
        <div className="w-full max-w-[280px] rounded-2xl border border-border bg-card px-4 py-3 text-center">
          <span className="font-num text-[24px] font-extrabold tracking-widest text-foreground">
            {input || " "}
            <span className="ml-0.5 inline-block h-6 w-0.5 animate-pulse bg-primary align-middle" />
          </span>
        </div>
      </div>

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

      <p className="mt-4 text-center text-[12.5px] text-muted-foreground">回答后立即判定 · 错误自动进错题本</p>
    </div>
  );
}

/* ------------------------------ 工具 ------------------------------ */

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} 分 ${s % 60} 秒` : `${s} 秒`;
}

/** 归一判题兜底（与 PracticeView eq 同逻辑；正常走 SMART_GENERATORS.normalizeInput） */
function eqFallback(input: string, answer: number | string): boolean {
  const a = String(answer).trim();
  const inp = input.trim();
  if (inp === a) return true;
  const toNum = (s: string): number => {
    const m = s.match(/^(-?\d+)\/(-?\d+)$/);
    if (m && Number(m[2]) !== 0) return Number(m[1]) / Number(m[2]);
    return Number(s);
  };
  const n1 = toNum(inp);
  const n2 = toNum(a);
  return Number.isFinite(n1) && Number.isFinite(n2) && Math.abs(n1 - n2) < 1e-6;
}
