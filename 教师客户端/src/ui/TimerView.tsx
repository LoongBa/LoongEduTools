/**
 * 课堂计时器（D05 §2.4.4 · P3 / D08 M3）—— 纯本地瞬时 · 零网络 · 零上报
 *
 * 规范对齐 D05 §3：全屏大字倒计时（≥96px）+ 进度环 + 最后 10s 变色 + 到时声音；
 * 投影深底浅字（--timer-stage-bg 底 + --timer-stage-text 字，后排 ≥28px 可读）；预设按钮 ≥72px 触屏友好。
 *
 * D08 §3.3#1（B2 关键修订）：主控已提升至 timerStore（纯模块，跨视图/窗口存活），本组件
 * 只消费 store——UI/样式/文案/布局零变化，数据源从本地 useState 换为 useSyncExternalStore。
 * 到时蜂鸣 / 页签标题闪烁 / endAt 差值时钟 全部在 store 内（迁移完成，此处不留双份）。
 * 新增「浮层」按钮 = tool_timer 命令（D08 §3.3#2 F3 降级真实路径：全局快捷键失效时的壳内兜底）。
 */
import { useSyncExternalStore, useState } from "react";
import { api } from "./api";
import {
  getSnapshot,
  pause,
  reset,
  setPreset,
  start,
  subscribe,
} from "./timerStore";

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

export default function TimerView() {
  // 主控在 store：unmount 不影响计时存活（D08 B2）
  const { totalMs, remainMs, phase } = useSyncExternalStore(subscribe, getSnapshot);
  // 自定义输入为纯 UI 态（不进 store）
  const [customM, setCustomM] = useState("2");
  const [customS, setCustomS] = useState("0");

  function applyPreset(p: Preset) {
    setPreset(p.ms);
  }

  function applyCustom() {
    const m = Math.max(0, Math.min(99, parseInt(customM, 10) || 0));
    const s = Math.max(0, Math.min(59, parseInt(customS, 10) || 0));
    const ms = (m * 60 + s) * 1000;
    if (ms <= 0) return;
    setCustomM(String(m));
    setCustomS(String(s));
    setPreset(ms);
  }

  // 浮层呼出/收起（tool_timer · 失败静默——按钮恒显示，快捷键是否注册不影响此入口）
  function toggleOverlay() {
    void api.toolTimer().catch(() => {}); // 窗口已收起/未注册快捷键时失败：静默，UI 状态自会同步
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
        {/* D08 §3.3#2 F3 降级：全局快捷键失效时老师仍可由此呼出/收起浮层（Alt+T 是否注册成功都显示） */}
        <button
          className="ghost-btn inline"
          onClick={toggleOverlay}
          title="呼出/收起计时器浮层（全局快捷键 Alt+T 的兜底入口）"
        >
          浮层
        </button>
      </div>

      <footer className="hint">
        计时纯本地、零上报；到时三声提示音。预设 ≥72px 触屏可用，投影深底大字，Tab/Enter 可全键盘操作。
      </footer>
    </section>
  );
}
