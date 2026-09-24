/**
 * 课堂计时器（D05 §2.4.4 · P3）—— 纯本地瞬时 · 零网络 · 零上报
 *
 * 规范对齐 D05 §3：全屏大字倒计时（≥96px）+ 进度环 + 最后 10s 变色 + 到时声音；
 * 投影深底浅字（#0f172a 底 + 白/黄字，后排 ≥28px 可读）；预设按钮 ≥72px 触屏友好。
 *
 * 计时基准：endAt = Date.now() + remainMs（挂起/切后台不漂移），非递减计数器。
 * 到时提示：Web Audio 三声 880Hz 蜂鸣（零音频素材依赖）+ 页签标题闪烁。
 */
import { useEffect, useRef, useState } from "react";

type Phase = "idle" | "running" | "paused" | "done";

interface Preset {
  label: string;
  ms: number;
}

const PRESETS: Preset[] = [
  { label: "晨读 10 分钟", ms: 10 * 60_000 },
  { label: "讨论 3 分钟", ms: 3 * 60_000 },
  { label: "小测 5 分钟", ms: 5 * 60_000 },
  { label: "挑战 30 秒", ms: 30_000 },
  { label: "挑战 60 秒", ms: 60_000 },
];

function fmt(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 到时蜂鸣：3 短声 880Hz（AudioContext 不可用时静默降级） */
function beep(): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const start = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 880;
      const t0 = start + i * 0.35;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    }
    // 释放资源（蜂鸣结束后关闭）
    window.setTimeout(() => ctx.close().catch(() => {}), 1600);
  } catch {
    /* 静默降级：无声但视觉提示仍在 */
  }
}

export default function TimerView() {
  const [totalMs, setTotalMs] = useState(10 * 60_000);
  const [remainMs, setRemainMs] = useState(10 * 60_000);
  const [phase, setPhase] = useState<Phase>("idle");
  const [customM, setCustomM] = useState("2");
  const [customS, setCustomS] = useState("0");
  const endAtRef = useRef(0);
  const titleRef = useRef<string | null>(null);

  // 运行时钟：endAt 差值驱动，切后台不漂移
  useEffect(() => {
    if (phase !== "running") return;
    let raf = 0;
    const tick = () => {
      const left = endAtRef.current - Date.now();
      if (left <= 0) {
        setRemainMs(0);
        setPhase("done");
        beep();
        if (titleRef.current === null) titleRef.current = document.title;
        document.title = "⏰ 时间到！";
        return;
      }
      setRemainMs(left);
      raf = window.setTimeout(tick, 100);
    };
    raf = window.setTimeout(tick, 50);
    return () => window.clearTimeout(raf);
  }, [phase]);

  // 到时标题闪烁提示（每 1s 交替，20s 后停）
  useEffect(() => {
    if (phase !== "done") return;
    let n = 0;
    const iv = window.setInterval(() => {
      n++;
      document.title = n % 2 === 0 ? "⏰ 时间到！" : "⏰ 时间到 …";
      if (n >= 20) {
        window.clearInterval(iv);
        if (titleRef.current !== null) document.title = titleRef.current;
      }
    }, 1000);
    return () => {
      window.clearInterval(iv);
      if (titleRef.current !== null) {
        document.title = titleRef.current;
        titleRef.current = null;
      }
    };
  }, [phase]);

  function applyPreset(p: Preset) {
    setTotalMs(p.ms);
    setRemainMs(p.ms);
    setPhase("idle");
  }

  function applyCustom() {
    const m = Math.max(0, Math.min(99, parseInt(customM, 10) || 0));
    const s = Math.max(0, Math.min(59, parseInt(customS, 10) || 0));
    const ms = (m * 60 + s) * 1000;
    if (ms <= 0) return;
    setCustomM(String(m));
    setCustomS(String(s));
    setTotalMs(ms);
    setRemainMs(ms);
    setPhase("idle");
  }

  function start() {
    if (remainMs <= 0) return;
    endAtRef.current = Date.now() + remainMs;
    setPhase("running");
  }

  function pause() {
    setRemainMs(Math.max(0, endAtRef.current - Date.now()));
    setPhase("paused");
  }

  function reset() {
    setRemainMs(totalMs);
    setPhase("idle");
  }

  const progress = totalMs > 0 ? remainMs / totalMs : 0;
  const secondsLeft = Math.ceil(remainMs / 1000);
  const warn = phase === "running" && secondsLeft <= 10 && secondsLeft > 0;
  const done = phase === "done";

  // 进度环几何
  const R = 150;
  const C = 2 * Math.PI * R;

  return (
    <section className="timer">
      <header className="timer-head">
        <h2>课堂计时器</h2>
        <div className="timer-presets">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className={`timer-preset${totalMs === p.ms ? " active" : ""}`}
              onClick={() => applyPreset(p)}
            >
              {p.label}
            </button>
          ))}
          <span className="timer-custom">
            <input
              aria-label="自定义分钟"
              inputMode="numeric"
              value={customM}
              onChange={(e) => setCustomM(e.target.value.replace(/\D/g, "").slice(0, 2))}
              onBlur={applyCustom}
              onKeyDown={(e) => e.key === "Enter" && applyCustom()}
            />
            <span>:</span>
            <input
              aria-label="自定义秒"
              inputMode="numeric"
              value={customS}
              onChange={(e) => setCustomS(e.target.value.replace(/\D/g, "").slice(0, 2))}
              onBlur={applyCustom}
              onKeyDown={(e) => e.key === "Enter" && applyCustom()}
            />
            <button className="ghost-btn inline" onClick={applyCustom}>
              设定
            </button>
          </span>
        </div>
      </header>

      <div className={`timer-stage${warn ? " warn" : ""}${done ? " done" : ""}`}>
        <svg className="timer-ring" viewBox="0 0 320 320" aria-hidden="true">
          <circle className="timer-ring-bg" cx="160" cy="160" r={R} />
          <circle
            className="timer-ring-fill"
            cx="160"
            cy="160"
            r={R}
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
          />
        </svg>
        <div className="timer-digits" role="timer" aria-live="off">
          {fmt(remainMs)}
        </div>
        <div className="timer-status">
          {done ? "时间到！" : phase === "running" ? "进行中" : phase === "paused" ? "已暂停" : "就绪"}
        </div>
      </div>

      <div className="timer-controls">
        {phase === "running" ? (
          <button className="timer-btn pause" onClick={pause}>
            暂停
          </button>
        ) : (
          <button className="timer-btn go" onClick={start} disabled={done || remainMs <= 0}>
            {phase === "paused" ? "继续" : done ? "已结束" : "开始"}
          </button>
        )}
        <button className="timer-btn reset" onClick={reset}>
          重置
        </button>
      </div>

      <footer className="hint">
        计时纯本地、零上报；到时三声提示音。预设 ≥72px 触屏可用，投影深底大字，Tab/Enter 可全键盘操作。
      </footer>
    </section>
  );
}
