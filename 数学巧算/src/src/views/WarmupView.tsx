// 数学巧算 · 口算热身（V1.2 增强）：复用数学口算 generators.js（KOU_GENERATORS），六档年级知识点池
// 入口：HomeView「口算热身」→ 推荐档/选档 → 定数（5/10/20）或计时（30/60/120s）→ 即时反馈 → 结算打卡
// V1.2 新增：① 六档池 g1-g6 全启用 + 跟随教程阶段默认档（lib/warmup.ts defaultLevel）
//            ② 计时挑战模式（到期自动 finish，成绩口径=正确率，与定数统一 key）
//            ③ 薄弱优先出题（pickType 按 warmupMist 计数加权，封顶 3）
// 判题：window.SMART_GENERATORS.normalizeInput（巧算引擎先加载，运行时安全）
// 防沉迷联动：结算时 todaySec（recordPractice 现有）+ guard.addPlayed（定数/计时两 finish 路径同步调用）
import { useCallback, useEffect, useRef, useState } from "react";
import { BackBtn, Btn, Panel, Pill, Stars } from "@/components/ui-kit";
import { useProgress } from "@/lib/store";
import {
  defaultLevel,
  LEVEL_LABEL,
  pickType,
  POOL,
  QUANTITIES,
  TIMES,
  WARM_LEVELS,
  type WarmLevel,
} from "@/lib/warmup";

interface KouQ {
  type: string;
  text: string;
  answer: number | string;
}

/** 组后二选浮层数据 */
type DueUi = { kind: "time" | "questions"; canExtend: boolean };

/** 练习模式：定数 / 计时 */
type Mode = "count" | "time";

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

export function WarmupView({ onExit }: { onExit: () => void }) {
  const { store, recordPractice, pushMistake, addWarmupMist, recordWarmupDaily, dueInfo, extendDue, enoughNow, addPlayed, locked } = useProgress();
  const [level, setLevel] = useState<WarmLevel | null>(null); // null = 选档页
  const [mode, setMode] = useState<Mode>("count");
  const [quantity, setQuantity] = useState<(typeof QUANTITIES)[number]>(10);
  const [duration, setDuration] = useState<(typeof TIMES)[number]>(60);
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
  const prevTypeRef = useRef<string | undefined>(undefined);

  /* 出下一题：pickType 按 warmupMist 错题计数加权（薄弱优先，封顶 3），avoid 连续同知识点退避 */
  const nextQ = useCallback(() => {
    setInput("");
    setWrongInfo(null);
    setFlash(null);
    if (!level) return;
    const kou = getKou();
    if (!kou) return;
    const type = pickType(POOL[level], store.warmupMist, level, prevTypeRef.current);
    prevTypeRef.current = type;
    const qq = kou.gen(type);
    if (qq) setQ(qq);
  }, [level, store.warmupMist]);

  /* 计时：从 level 选定起计时（定数/计时共用；计时模式到期自动 finish） */
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

  /* 自律锁检查（mount 时，唯一一处；V1.2 清理了既有重复 effect） */
  useEffect(() => {
    setLockedState(locked());
  }, [locked]);

  /* 第一段：练习中到点引导条（B2：当前局秒数计入判定） */
  const msRef = useRef(0);
  useEffect(() => {
    msRef.current = ms;
  }, [ms]);
  useEffect(() => {
    if (finished || !level) return;
    const t = window.setInterval(() => {
      const due = dueInfo(Math.floor(msRef.current / 1000));
      if (due) setGuideVisible(true);
    }, 15000);
    return () => window.clearInterval(t);
  }, [finished, level, dueInfo]);

  /* 计时模式：到期自动 finish（不经过 checkAnswer 的独立路径；addPlayed 同步调用，防沉迷题量档不遗漏） */
  useEffect(() => {
    if (mode === "time" && level && !finished && ms >= duration * 1000) {
      addPlayed(doneCount);
      setFinished(true);
      const due = dueInfo();
      if (due && !shownDueRef.current) {
        shownDueRef.current = true;
        setDueChoice(due);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, mode, finished, level, duration]);

  /* B3 修复：结算记练习移入 effect（题量累计已在完成路径内）；V1.4 家长报告每日聚合同处写入（N4：total/correct/sec 局部算一次共用） */
  useEffect(() => {
    if (finished && level) {
      const total = mode === "count" ? quantity : doneCount;
      const sec = Math.round(ms / 1000);
      recordPractice(`warmup:${level}`, "basic", correct, total, sec);
      recordWarmupDaily({ total, correct, sec, sessions: 1 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

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
          if (mode === "count" && n >= quantity) {
            // 定数完成：先累计本组题量再判到点（B3 语义）
            addPlayed(quantity);
            setFinished(true);
            const due = dueInfo();
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
        addWarmupMist(level, q.type);
        window.setTimeout(() => setFlash(null), 400);
      }
    },
    [q, finished, level, mode, quantity, nextQ, pushMistake, addWarmupMist, addPlayed, dueInfo],
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

  /* 重新开始（结算页「再热一次」） */
  const restart = () => {
    seqRef.current = 0;
    prevTypeRef.current = undefined;
    setCorrect(0);
    setDoneCount(0);
    setFinished(false);
    setMs(0);
    setDueChoice(null);
    nextQ();
  };

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
    const total = mode === "count" ? quantity : doneCount;
    const rate = total > 0 ? correct / total : 0;
    const stars = rate >= 0.9 ? 3 : rate >= 0.6 ? 2 : 1;
    const sec = Math.round(ms / 1000);
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
            {mode === "count" ? (
              <>答对 <b className="text-[var(--lit)]">{correct}</b> / {quantity} 题 · 用时 {fmtMs(ms)}</>
            ) : (
              <>限时 {duration} 秒 · 答对 <b className="text-[var(--lit)]">{correct}</b> 题</>
            )}
          </p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {rate >= 0.9 ? "状态很好！去学巧算新招吧。" : rate >= 0.6 ? "再热热身会更稳。" : "回看口算基础，再试一次。"}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Btn variant="soft" onClick={onExit}>回首页</Btn>
            <Btn variant="primary" onClick={restart}>再热一次</Btn>
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
    const rec = defaultLevel(store.lessons);
    return (
      <div className="anim-fade-in-up pt-2">
        <div className="flex items-center pb-3">
          <BackBtn onClick={onExit} />
          <span className="flex-1 text-center text-[15px] font-bold">口算热身</span>
          <span className="w-10" />
        </div>

        {/* 推荐档（跟随教程进度） */}
        <button
          type="button"
          onClick={() => setLevel(rec)}
          className="tap-target panel-border flex w-full items-center justify-between rounded-2xl border border-[var(--lit)]/50 bg-gradient-to-br from-[#FFF7E0] to-[#FFE9C2] px-4 py-3.5 text-left shadow-soft transition-transform active:scale-[0.985]"
        >
          <div>
            <p className="text-[11.5px] font-bold text-[var(--warm)]">⭐ 按当前进度推荐</p>
            <p className="text-[16px] font-extrabold text-foreground">{LEVEL_LABEL[rec]}档 · {POOL[rec].length} 个知识点</p>
          </div>
          <span className="text-2xl">🌟</span>
        </button>

        <p className="mt-4 mb-2 text-[12.5px] font-bold text-muted-foreground">或自选年级</p>

        <Panel className="px-5 py-6">
          <div className="flex flex-col gap-2.5">
            {WARM_LEVELS.map((lv) => (
              <button
                key={lv}
                type="button"
                onClick={() => setLevel(lv)}
                className="tap-target panel-border flex items-center justify-between rounded-2xl border bg-gradient-to-br from-[#FFF3D6] to-[#FFE4B5] px-4 py-3.5 text-left shadow-soft transition-transform active:scale-[0.985]"
              >
                <div>
                  <p className="text-[16px] font-extrabold text-foreground">{LEVEL_LABEL[lv]}</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {POOL[lv].length} 个知识点 · {mode === "count" ? `定数 ${quantity} 题` : `计时 ${duration} 秒`}
                  </p>
                </div>
                <span className="text-2xl">{lv === "g1" ? "🌱" : lv === "g2" ? "🧩" : lv === "g3" ? "🚀" : lv === "g4" ? "⚡" : lv === "g5" ? "🔮" : "🎯"}</span>
              </button>
            ))}
          </div>
        </Panel>

        {/* 模式/题量/时长配置条 */}
        <Panel className="mt-3 px-4 py-3 print-hidden">
          <p className="text-[12.5px] font-bold text-muted-foreground">练习方式</p>
          <div className="mt-2 flex gap-2">
            {(["count", "time"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`tap-target flex-1 rounded-xl px-3 py-2 text-[13px] font-bold transition-colors ${
                  mode === m ? "bg-primary text-primary-foreground shadow-soft" : "bg-muted text-muted-foreground"
                }`}
              >
                {m === "count" ? "定数" : "计时挑战"}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="w-12 shrink-0 text-[12px] text-muted-foreground">{mode === "count" ? "题量" : "时长"}</span>
            <div className="flex flex-1 gap-2">
              {(mode === "count" ? QUANTITIES : TIMES).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => (mode === "count" ? setQuantity(v as (typeof QUANTITIES)[number]) : setDuration(v as (typeof TIMES)[number]))}
                  className={`tap-target flex-1 rounded-xl px-2 py-1.5 text-[13px] font-bold transition-colors ${
                    (mode === "count" ? quantity : duration) === v ? "bg-secondary text-secondary-foreground shadow-soft" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {mode === "count" ? `${v} 题` : `${v} 秒`}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-center text-[11.5px] text-muted-foreground">
            {mode === "count" ? "答完即结算，错误自动进错题本" : "限时连答，练口算速度"}
          </p>
        </Panel>
      </div>
    );
  }

  /* 练习页 */
  const remainMs = mode === "time" ? Math.max(0, duration * 1000 - ms) : 0;
  return (
    <div className="anim-fade-in-up pt-2">
      <div className="flex items-center justify-between pb-3">
        <BackBtn onClick={onExit} />
        <Pill tone="sky">
          {LEVEL_LABEL[level]} · {mode === "count" ? `定数 ${quantity}` : `计时 ${duration}s`}
        </Pill>
        <span className="w-10" />
      </div>

      {/* 计时倒计时条 */}
      {mode === "time" && (
        <div className="mb-3 flex items-center justify-between rounded-2xl border border-[var(--lit)]/40 bg-[#FFF7E0] px-3.5 py-2.5">
          <span className="text-[13px] font-bold text-[var(--warm)]">⏱ 剩余 {fmtClock(remainMs)}</span>
          <span className="text-[12px] text-muted-foreground">已答 {doneCount} 题</span>
        </div>
      )}

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
          {mode === "count" ? `第 ${Math.min(doneCount + 1, quantity)} / ${quantity} 题` : `第 ${doneCount + 1} 题`}
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

/** 倒计时 mm:ss 显示 */
function fmtClock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
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
