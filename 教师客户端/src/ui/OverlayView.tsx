/**
 * 计时器浮层视图（D08 §3.3#3 · timer-overlay 独立小窗口 320×140）
 *
 * **单向只读**（D08 明文）：不放置 start/pause/reset 按钮——操作只在 TimerView，
 * 浮层只消费 store 经跨窗口 emit 的 "timer://tick" 事件渲染。
 * 空态（尚无 tick）显示「计时器未启动」。
 *
 * 防白闪（D08 F7）：整窗用深色面板铺底（--timer-stage-bg，两主题恒深色），
 * 首次 show() 前即使 React 未完成渲染也不露白。动画遵守 prefers-reduced-motion 惯例。
 */
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { TimerTickPayload } from "./timerStore";
import "./App.css";

function fmt(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function OverlayView() {
  const [tick, setTick] = useState<TimerTickPayload | null>(null);

  // 跨窗口 tick：main 窗口 store 每 1s 无条件 emit + 状态变化立即 emit（D08 F8 自愈）
  useEffect(() => {
    const un = listen<TimerTickPayload>("timer://tick", (e) => setTick(e.payload));
    return () => {
      // 卸载时反注册监听；Promise 拒绝（已卸载/事件源消失）静默即可
      un.then((f) => f()).catch(() => {});
    };
  }, []);

  // 空态：尚无 tick（或计时器从未启动）
  if (tick === null) {
    return (
      <div className="timer-overlay">
        <div className="timer-overlay-empty">计时器未启动</div>
      </div>
    );
  }

  const { phase, remainMs, totalMs } = tick;
  const progress = totalMs > 0 ? remainMs / totalMs : 0;
  const secondsLeft = Math.ceil(remainMs / 1000);
  const warn = phase === "running" && secondsLeft <= 10 && secondsLeft > 0;
  const done = phase === "done";
  const status =
    done ? "时间到！" : phase === "running" ? "进行中" : phase === "paused" ? "已暂停" : "就绪";

  return (
    <div className={`timer-overlay${warn ? " warn" : ""}${done ? " done" : ""}`}>
      <div className="timer-overlay-time" role="timer" aria-live="off">
        {fmt(remainMs)}
      </div>
      <div className="timer-overlay-status">{status}</div>
      <div className="timer-overlay-track" aria-hidden="true">
        <div
          className="timer-overlay-fill"
          style={{ width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%` }}
        />
      </div>
    </div>
  );
}
