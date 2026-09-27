// 数学巧算 · 防沉迷/自控力纯逻辑层（对齐 RedTools 通用需求-防沉迷自控力.md §4 学科类口径）
// 字段名严格对齐契约：guard 内嵌（gamesPref/playedToday/delayGamesTimes）+ 顶层 selfDaily/selfStreak/selfLocked
// 日期格式：与 store.checkin 一致用 "YYYY-MM-DD"（偏离契约 YYYYMMDD，见方案 v0.2 B2 修订——避免跨日重置失效）
// API 对齐 LX_SHARED.guard 已落地 8 API（setPrefs/startRound/addPlayed/checkDue/extend/enough/isLocked/streak）

export interface GuardShape {
  minutePref: number;   // 预设 5/10/15；extend 后可达 20/25/30（+5/次，上限 2 次）
  /** 学科类口径 = 题量档（10/20/30，0=不限）；字段名对齐契约 games 前缀（语义=题量） */
  gamesPref: number;    // 预设 10/20/30/0；extend 后 +10/次（上限 2 次）
  /** 当前计数日（YYYY-MM-DD，跨日重置判断） */
  today: string;
  /** 今日已完成题量 */
  playedToday: number;
  /** 时长延迟次数（上限 2，跨日重置） */
  delayMinTimes: number;
  /** 题量延迟次数（上限 2，跨日重置） */
  delayGamesTimes: number;
}

export const GUARD_DEFAULT: GuardShape = {
  minutePref: 5,
  gamesPref: 10,
  today: "",
  playedToday: 0,
  delayMinTimes: 0,
  delayGamesTimes: 0,
};

/** 今日日期串（YYYY-MM-DD，与 store.todayStr 同格式） */
export function todayStr(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 跨日重置：today 变化时清零当日计数（playedToday/delayTimes），返回新 guard */
export function todayReset(guard: GuardShape, now = new Date()): GuardShape {
  const today = todayStr(now);
  if (guard.today === today) return guard;
  return { ...guard, today, playedToday: 0, delayMinTimes: 0, delayGamesTimes: 0 };
}

export type DueKind = "time" | "questions" | null;

export interface DueInfo {
  kind: Exclude<DueKind, null>;
  /** 延迟是否仍可用（每类上限 2 次） */
  canExtend: boolean;
}

/**
 * 到点判定：单局时长（todaySec）或今日题量（playedToday）触发。
 * @param todaySec 今日累计练习秒数（来自 store.todaySec）
 * @param playedToday 今日已完成题量（来自 guard.playedToday）
 * @returns 到点类型 + 是否可延迟；未到点返回 null
 */
export function checkDue(guard: GuardShape, todaySec: number, playedToday: number): DueInfo | null {
  const timeDue = guard.minutePref > 0 && todaySec >= guard.minutePref * 60;
  const qDue = guard.gamesPref > 0 && playedToday >= guard.gamesPref;
  if (timeDue) {
    return { kind: "time", canExtend: guard.delayMinTimes < 2 };
  }
  if (qDue) {
    return { kind: "questions", canExtend: guard.delayGamesTimes < 2 };
  }
  return null;
}

/**
 * 延迟：时长 +5min / 题量 +10（每类上限 2 次）。
 * @returns 新 guard（未达上限则延并计数；已达上限原样返回）
 */
export function extend(guard: GuardShape, kind: Exclude<DueKind, null>): GuardShape {
  if (kind === "time") {
    if (guard.delayMinTimes >= 2) return guard;
    return { ...guard, minutePref: guard.minutePref + 5, delayMinTimes: guard.delayMinTimes + 1 };
  }
  if (guard.delayGamesTimes >= 2) return guard;
  return { ...guard, gamesPref: guard.gamesPref === 0 ? 10 : guard.gamesPref + 10, delayGamesTimes: guard.delayGamesTimes + 1 };
}

export interface SelfState {
  selfDaily: string[];
  selfStreak: number;
  selfLocked: boolean;
}

/** 记今日自律退出 + 重算连续自律天数（对齐打卡 calcStreak 同逻辑：允许今天或昨天为起点） */
export function enough(self: SelfState, now = new Date()): SelfState {
  const today = todayStr(now);
  const selfDaily = self.selfDaily.includes(today) ? self.selfDaily : [...self.selfDaily, today].slice(-365);
  const set = new Set(selfDaily);
  let streak = 0;
  const cursor = new Date();
  if (!set.has(todayStr(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (set.has(todayStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { selfDaily, selfStreak: streak, selfLocked: true };
}

/** 今日是否自律锁（跨日自动复位：today 变化即解锁） */
export function isLocked(guard: GuardShape, selfLocked: boolean, now = new Date()): boolean {
  return guard.today === todayStr(now) && selfLocked;
}

/** 连续自律天数（只读计算） */
export function streak(selfDaily: string[], now = new Date()): number {
  const set = new Set(selfDaily);
  let s = 0;
  const cursor = new Date();
  if (!set.has(todayStr(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (set.has(todayStr(cursor))) {
    s++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return s;
}
