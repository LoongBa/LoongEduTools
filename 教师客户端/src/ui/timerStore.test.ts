/**
 * timerStore 纯逻辑单测（D08 M3 · 计时主控提升）
 * 零 DOM/零 Tauri：node 环境直跑——beep/title/emit 全部静默降级（store 内已 try/catch）。
 * 时钟与 Date.now 用 vi.useFakeTimers + vi.setSystemTime 统一驱动。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSnapshot,
  pause,
  reset,
  setPreset,
  start,
  subscribe,
} from "./timerStore";

// 整个文件共享一份假时钟（store 的 clock interval 是模块级单例，跨测试常驻）
vi.useFakeTimers();
const BASE = new Date(1_700_000_000_000); // 固定时间基座

beforeEach(() => {
  vi.setSystemTime(BASE);
  reset(); // 每例回到 idle/totalMs 初态
});

afterEach(() => {
  // 不用 useRealTimers：store 的 interval 常驻，切真时钟会悬空；下例 setSystemTime 重设即可
});

describe("setPreset", () => {
  it("切换预设：totalMs/remainMs 同步归位回 idle", () => {
    setPreset(30_000);
    expect(getSnapshot()).toEqual({ totalMs: 30_000, remainMs: 30_000, phase: "idle" });
  });

  it("ms<=0 被守卫拒绝（与 applyCustom 的 return 语义一致）：当前状态不变", () => {
    setPreset(30_000); // 先确立已知基态
    const before = getSnapshot();
    setPreset(0);
    expect(getSnapshot()).toEqual(before);
  });
});

describe("start → endAt 差值驱动", () => {
  it("start 后 remainMs 随 endAt-Date.now() 递减（挂起不漂移）", () => {
    setPreset(60_000);
    start();
    expect(getSnapshot().phase).toBe("running");
    vi.advanceTimersByTime(5_000);
    expect(getSnapshot().remainMs).toBe(60_000 - 5_000);
  });

  it("暂停后继续：endAt 基于冻结值重建（非递减计数）", () => {
    setPreset(60_000);
    start();
    vi.advanceTimersByTime(5_000);
    pause();
    expect(getSnapshot().remainMs).toBe(55_000);
    start(); // 继续
    vi.advanceTimersByTime(3_000);
    expect(getSnapshot().remainMs).toBe(55_000 - 3_000);
  });
});

describe("pause 冻结", () => {
  it("暂停后推进时间 remainMs 不再变化", () => {
    setPreset(60_000);
    start();
    vi.advanceTimersByTime(3_000);
    pause();
    const frozen = getSnapshot().remainMs;
    expect(frozen).toBe(57_000);
    vi.advanceTimersByTime(10_000);
    expect(getSnapshot().phase).toBe("paused");
    expect(getSnapshot().remainMs).toBe(frozen);
  });
});

describe("reset", () => {
  it("回 totalMs / idle，可重新 start", () => {
    setPreset(120_000);
    start();
    vi.advanceTimersByTime(8_000);
    reset();
    expect(getSnapshot()).toEqual({ totalMs: 120_000, remainMs: 120_000, phase: "idle" });
  });
});

describe("done 守卫", () => {
  it("到时进 done（remainMs=0），done 后 start 无效", () => {
    setPreset(1_000);
    start();
    vi.advanceTimersByTime(1_100);
    expect(getSnapshot().phase).toBe("done");
    expect(getSnapshot().remainMs).toBe(0);
    start(); // done 态守卫：无效
    expect(getSnapshot().phase).toBe("done");
    expect(getSnapshot().remainMs).toBe(0);
  });
});

describe("订阅通知", () => {
  it("每次操作触发一次通知；退订后不再通知", () => {
    let n = 0;
    const un = subscribe(() => n++);
    setPreset(30_000); // +1
    start(); // +1
    pause(); // +1
    expect(n).toBe(3);
    un();
    setPreset(60_000); // 已退订：不再通知
    expect(n).toBe(3);
  });

  it("订阅者拿到的是最新快照（getSnapshot 稳定引用）", () => {
    let seen: unknown = null;
    const un = subscribe(() => {
      seen = getSnapshot();
    });
    setPreset(45_000);
    expect(seen).toEqual({ totalMs: 45_000, remainMs: 45_000, phase: "idle" });
    un();
  });
});
