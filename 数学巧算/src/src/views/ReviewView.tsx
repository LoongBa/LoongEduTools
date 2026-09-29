// 数学巧算 · 错题重练（V1.3 闭环）：逐题原题重做 → 答对移出错题本（掌握）、答错保留计数
// 入口：HomeView「错题重练」卡 → 队列 = store.mistakes 快照（巧算 + 热身错题统一）→ 结算/空态
// 判题：window.SMART_GENERATORS.normalizeInput（巧算引擎先加载，运行时安全）+ eqFallback 兜底
// 防沉迷：答对推进 addPlayed(1) 逐题累计；dueInfo 引导条 + 结算组后二选；自律锁拦截
// 不 recordPractice：重练不重复打卡、不新增 lessons 记录（打卡日由新练习驱动）
// V1.4：结算（队列空）经 useEffect([finished]) 写 reviewDaily（Oracle B1——setTimeout 内联闭包会漏记最后一道的 mastered）
import { useCallback, useEffect, useRef, useState } from "react";
import { BackBtn, Btn, Panel, Stars } from "@/components/ui-kit";
import { useProgress } from "@/lib/store";
import { reviewQueue, type ReviewMistake } from "@/lib/review";

/** 组后二选浮层数据 */
type DueUi = { kind: "time" | "questions"; canExtend: boolean };

/** 判题归一（挂巧算引擎，错题 answer 格式 number/"p/q"/小数 兼容） */
function getNormalizer(): ((input: string, answer: number | string) => boolean) | null {
  const w = window as unknown as { SMART_GENERATORS?: { normalizeInput: (i: string, a: number | string) => boolean } };
  return w.SMART_GENERATORS?.normalizeInput || null;
}

export function ReviewView({ onExit }: { onExit: () => void }) {
  const { store, retryMistake, recordReviewDaily, dueInfo, extendDue, enoughNow, addPlayed, locked } = useProgress();
  // 队列快照：进入时固定（单视图架构下无并发修改，Oracle ② 确认自洽）
  const [queue, setQueue] = useState<ReviewMistake[]>(() => reviewQueue(store.mistakes));
  const initialTotalRef = useRef(queue.length);
  const [mastered, setMastered] = useState(0);
  const [retriedCount, setRetriedCount] = useState(0); // V1.4 本次答错次数（结算统计用）
  const [input, setInput] = useState("");
  const [flash, setFlash] = useState<"ok" | "wrong" | null>(null);
  const [wrongInfo, setWrongInfo] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [dueChoice, setDueChoice] = useState<DueUi | null>(null);
  const [guideVisible, setGuideVisible] = useState(false);
  const [lockedState, setLockedState] = useState<boolean | null>(null);
  const shownDueRef = useRef(false);

  const current = queue[0];

  /* V1.4 结算写入 reviewDaily（useEffect 模式，Oracle B1——setTimeout 内联闭包漏记队列清空题的 mastered +1） */
  useEffect(() => {
    if (finished) {
      recordReviewDaily({ mastered, retried: retriedCount });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  /* 自律锁检查（mount 时） */
  useEffect(() => {
    setLockedState(locked());
  }, [locked]);

  /* 第一段：重练中到点引导条 */
  const msRef = useRef(0);
  const [ms, setMs] = useState(0);
  useEffect(() => {
    msRef.current = ms;
  }, [ms]);
  useEffect(() => {
    if (finished) return;
    const t = window.setInterval(() => setMs((m) => m + 100), 100);
    return () => window.clearInterval(t);
  }, [finished]);
  useEffect(() => {
    if (finished) return;
    const t = window.setInterval(() => {
      const due = dueInfo(Math.floor(msRef.current / 1000));
      if (due) setGuideVisible(true);
    }, 15000);
    return () => window.clearInterval(t);
  }, [finished, dueInfo]);

  const checkAnswer = useCallback(
    (ans: string) => {
      if (!current || finished) return;
      const norm = ans.trim();
      const normalizer = getNormalizer();
      const isCorrect = normalizer ? normalizer(norm, current.answer) : eqFallback(norm, current.answer);
      if (isCorrect) {
        setFlash("ok");
        setWrongInfo(null);
        setMastered((m) => m + 1);
        retryMistake(current.key, true); // 移出错题本（掌握）
        addPlayed(1); // 防沉迷题量逐题累计
        const next = queue.filter((m) => m.key !== current.key);
        window.setTimeout(() => {
          setInput(""); // 修复 V1.3 bug：答对后清空输入框，防残留上一题答案拼接
          setQueue(next);
          if (next.length === 0) {
            setFinished(true);
            const due = dueInfo();
            if (due && !shownDueRef.current) {
              shownDueRef.current = true;
              setDueChoice(due);
            }
          }
        }, 300);
      } else {
        setFlash("wrong");
        setWrongInfo(`答案是 ${current.answer}`);
        retryMistake(current.key, false); // 保留 + wrongCount+1
        setRetriedCount((c) => c + 1);
        window.setTimeout(() => setFlash(null), 400);
      }
    },
    [current, queue, finished, retryMistake, addPlayed, dueInfo],
  );

  const onKey = (k: string) => {
    if (finished) return;
    if (k === "⌫") { setInput((v) => v.slice(0, -1)); return; }
    if (k === "✓") { if (input.trim()) checkAnswer(input); return; }
    if (/^\d$/.test(k)) { setInput((v) => (v.length < 8 ? v + k : v)); return; }
    if (k === "." && !input.includes(".")) { setInput((v) => (v.length ? v + k : "0.")); return; }
    if (k === "/" && !input.includes("/")) { setInput((v) => (v.length ? v + k : v)); return; }
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
  }, [finished, current, input]);

  if (lockedState) {
    return (
      <div className="anim-fade-in-up pt-2">
        <div className="flex items-center pb-3">
          <BackBtn onClick={onExit} />
          <span className="flex-1 text-center text-[15px] font-bold">错题重练</span>
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

  /* 结算（队列全部掌握） */
  if (finished) {
    return (
      <div className="anim-pop-in pt-2">
        <div className="flex items-center pb-3">
          <BackBtn onClick={onExit} />
          <span className="flex-1 text-center text-[15px] font-bold">错题重练</span>
          <span className="w-10" />
        </div>
        <Panel className="px-5 py-8 text-center">
          <p className="text-5xl">🎉</p>
          <p className="mt-3 text-[20px] font-extrabold">错题重练完成</p>
          <div className="mt-2 flex justify-center">
            <Stars n={3} size={28} />
          </div>
          <p className="mt-3 text-[15px] text-muted-foreground">
            全部掌握（共 <b className="text-[var(--lit)]">{initialTotalRef.current}</b> 题）· 本次答对 {mastered} 次
          </p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">错题本已清空，薄弱方法统计同步更新。</p>
          <div className="mt-6 flex justify-center gap-2">
            <Btn variant="primary" onClick={onExit}>回首页</Btn>
          </div>
        </Panel>

        {/* 组后二选浮层（Oracle I1：结算时防沉迷对等） */}
        {dueChoice && (
          <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 px-6 pb-16">
            <Panel className="w-full max-w-[360px] px-5 py-6 text-center">
              <p className="text-4xl">{dueChoice.kind === "time" ? "⏰" : "📊"}</p>
              <p className="mt-2 text-[17px] font-extrabold text-foreground">
                {dueChoice.kind === "time" ? "练习时间到啦" : "今天的练习量到啦"}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                错题重练已完成，休息一下眼睛和大脑吧。
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

  /* 空态（进入时无错题） */
  if (!current) {
    return (
      <div className="anim-fade-in-up pt-2">
        <div className="flex items-center pb-3">
          <BackBtn onClick={onExit} />
          <span className="flex-1 text-center text-[15px] font-bold">错题重练</span>
          <span className="w-10" />
        </div>
        <Panel className="px-5 py-10 text-center">
          <p className="text-5xl">🌈</p>
          <p className="mt-3 text-[18px] font-extrabold text-foreground">错题都清光啦</p>
          <p className="mt-1 text-[13px] text-muted-foreground">继续保持，错一道练一道，越学越扎实。</p>
          <div className="mt-5 flex justify-center">
            <Btn variant="primary" onClick={onExit}>回首页</Btn>
          </div>
        </Panel>
      </div>
    );
  }

  /* 重练页 */
  return (
    <div className="anim-fade-in-up pt-2">
      <div className="flex items-center justify-between pb-3">
        <BackBtn onClick={onExit} />
        <span className="flex-1 text-center text-[15px] font-bold">错题重练</span>
        <span className="w-10" />
      </div>
      <p className="pb-3 text-center text-[12.5px] text-muted-foreground">
        剩余 {queue.length} 题 · 本次已掌握 {mastered} 题
      </p>

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
        <p className="mb-1 text-[12.5px] text-muted-foreground">重做错题 {mastered + 1}</p>
        {current && <p className="font-num text-[26px] font-extrabold leading-snug text-foreground">{current.expr} = ?</p>}
        {flash === "ok" && <p className="mt-2 text-[16px] font-bold text-[var(--lit)]">✓ 掌握啦，移出错题本</p>}
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

      <p className="mt-4 text-center text-[12.5px] text-muted-foreground">答对即掌握 · 答错保留错题本再练</p>
    </div>
  );
}

/* ------------------------------ 工具 ------------------------------ */

/** 归一判题兜底（与 WarmupView eqFallback 同逻辑；正常走 SMART_GENERATORS.normalizeInput） */
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
