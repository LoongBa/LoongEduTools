/**
 * 课堂计时器主控（D08 §3.3#1 · B2 关键修订：TimerView 主控提升为框架无关纯模块）
 *
 * 背景：TimerView 在 App.tsx 为条件渲染（{view === "timer" && <TimerView />}），切视图
 * 即 unmount——若主控留在组件内，endAt/phase/remainMs 全丢（违背 D05「不离开当前内容包」
 * 本意）。故主控提升为本模块：
 * - 模块级 state + 订阅回调，unmount 不影响存活；导出 subscribe/getSnapshot，与 React
 *   useSyncExternalStore 兼容（React ≥18 直接用，<18 可在组件内手写订阅）。
 * - 迁移（非复制）自 TimerView 的实现：endAt 差值驱动时钟（挂起不漂移）、到时 beep()
 *   （原 L35-62）、document.title 闪烁（done 态，原 L95-113）+ 恢复原 title 清理——
 *   迁移后 TimerView 不再保留这些实现（不留双份）。
 * - 跨窗口 tick（已定架构）：每 1s 无条件 emit "timer://tick" + 每次状态变化立即 emit；
 *   emit 严格 try/catch 吞掉（浏览器非 Tauri 环境会抛，绝不能让 dev/test 崩）。无条件
 *   1s emit 的理由：浮层 F5 重载后 ≤1s 自愈（D08 F8），Rust 侧 Alt+T 处理器无需知道状态。
 *
 * 操作 API：start() / pause() / reset() / setPreset(ms)（对应 TimerView 按钮语义；
 * 守卫搬入：done 态 start 不可用、remainMs<=0 start 不可用）。
 */
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

export type Phase = "idle" | "running" | "paused" | "done";

/** 跨窗口 tick 载荷（浮层 OverlayView 只读消费 · D08 §3.3#1） */
export interface TimerTickPayload {
  endAt: number;
  phase: Phase;
  remainMs: number;
  totalMs: number;
}

/** useSyncExternalStore 快照（稳定引用：仅状态变化时换新对象） */
export interface TimerSnapshot {
  totalMs: number;
  remainMs: number;
  phase: Phase;
}

// ---- 模块级 state（主控唯一真源 · 四态一个都不能少） ----
const INIT_TOTAL = 10 * 60_000; // 默认 10 分钟（与 TimerView 初始一致）
let endAt = 0;
let totalMs = INIT_TOTAL;
let remainMs = INIT_TOTAL;
let phase: Phase = "idle";

// ---- 订阅（React useSyncExternalStore 兼容接口） ----
const listeners = new Set<() => void>();
let snapshot: TimerSnapshot = { totalMs, remainMs, phase };

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getSnapshot(): TimerSnapshot {
  return snapshot;
}

/** 状态变更统一出口：换新快照引用 + 通知订阅者 */
function publish(): void {
  snapshot = { totalMs, remainMs, phase };
  for (const cb of listeners) cb();
}

// ---- 时钟驱动（100ms 精度推进 remainMs，保留原计时器刷新节奏；1s 无条件 emit）----
let clockIv: ReturnType<typeof setInterval> | null = null;
let tickCount = 0;

/** 首个操作后启动，之后常驻（无条件 emit 直至应用退出） */
function ensureClock(): void {
  if (clockIv !== null) return;
  tickCount = 0;
  clockIv = setInterval(() => {
    tickCount++;
    tickClock();
    if (tickCount % 10 === 0) emitTick(); // 每 1s 无条件 emit（浮层 F5 自愈 ≤1s · D08 F8）
  }, 100);
}

/** endAt 差值推进：挂起/切后台不漂移；到时 → done + beep + 标题闪烁 */
function tickClock(): void {
  if (phase !== "running") return;
  const left = endAt - Date.now();
  if (left <= 0) {
    remainMs = 0;
    phase = "done";
    beep();
    startTitleFlash();
    publish();
    emitTick(); // 到时瞬间立即同步浮层
  } else {
    remainMs = left;
    publish();
  }
}

// ---- 跨窗口 tick（emit 严格 try/catch：非 Tauri 环境静默降级，每秒一次不许刷错）----
function emitTick(): void {
  const payload: TimerTickPayload = { endAt, phase, remainMs, totalMs };
  try {
    void getCurrentWebviewWindow()
      .emit("timer://tick", payload)
      .catch(() => {});
  } catch {
    /* 浏览器/vitest 等非 Tauri 环境：吞掉，绝不让 dev/test 崩溃 */
  }
}

// ---- 到时蜂鸣（迁移 TimerView L35-62 实现：3 短声 880Hz，AudioContext 不可用静默降级）----
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
    setTimeout(() => ctx.close().catch(() => {}), 1600);
  } catch {
    /* 静默降级：无声但视觉提示仍在 */
  }
}

// ---- 到时标题闪烁（迁移 TimerView L95-113 实现 + 恢复原 title 的清理）----
let originalTitle: string | null = null;
let titleIv: ReturnType<typeof setInterval> | null = null;

function restoreTitle(): void {
  if (titleIv !== null) {
    clearInterval(titleIv);
    titleIv = null;
  }
  if (originalTitle !== null && typeof document !== "undefined") {
    document.title = originalTitle;
  }
  originalTitle = null;
}

/** 到时标题闪烁提示（每 1s 交替，20s 后停）；vitest/node 无 DOM 时直接跳过 */
function startTitleFlash(): void {
  if (typeof document === "undefined") return;
  if (originalTitle === null) originalTitle = document.title;
  document.title = "⏰ 时间到！";
  if (titleIv !== null) clearInterval(titleIv);
  let n = 0;
  titleIv = setInterval(() => {
    n++;
    document.title = n % 2 === 0 ? "⏰ 时间到！" : "⏰ 时间到 …";
    if (n >= 20) restoreTitle();
  }, 1000);
}

// ---- 操作 API（守卫迁入 store · D08 §3.3#1） ----

/** 预设/自定义设定：totalMs/remainMs 归位回 idle（applyPreset/applyCustom 语义） */
export function setPreset(ms: number): void {
  if (!(ms > 0)) return; // 与 applyCustom 的 ms<=0 return 守卫一致
  totalMs = ms;
  remainMs = ms;
  phase = "idle";
  restoreTitle();
  publish();
  emitTick();
  ensureClock();
}

/** 开始/继续：done 态与 remainMs<=0 均不可用（原始 start 守卫搬入） */
export function start(): void {
  if (phase === "done") return;
  if (remainMs <= 0) return;
  endAt = Date.now() + remainMs;
  phase = "running";
  ensureClock();
  publish();
  emitTick();
}

/** 暂停：冻结剩余时间（endAt 差值取整，非递减） */
export function pause(): void {
  if (phase !== "running") return;
  remainMs = Math.max(0, endAt - Date.now());
  phase = "paused";
  publish();
  emitTick();
}

/** 重置：回到 totalMs / idle，并恢复被标题闪烁改动的 title */
export function reset(): void {
  remainMs = totalMs;
  phase = "idle";
  restoreTitle();
  publish();
  emitTick();
}
