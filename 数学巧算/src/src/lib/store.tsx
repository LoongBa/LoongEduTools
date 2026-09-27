// 数学巧算 · 本地进度中枢（localStorage，单一 key，儿童数据最小化）
// 参考英语陪练 WebH5 store.ts 模式：只存本地进度/打卡/错题，不上传个人数据。
// key: redtools.qiaosuanlein.v1（产品代号「巧算乐学」）
// V0.3：version 1→2 迁移（补 guard/selfDaily/selfStreak/selfLocked 默认值，B3 修订 load 硬编码 version:1）

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  checkDue,
  enough,
  extend,
  GUARD_DEFAULT,
  isLocked,
  streak as guardStreak,
  todayReset,
  todayStr,
  type DueInfo,
  type GuardShape,
  type SelfState,
} from "@/lib/guard";

const KEY = "redtools.qiaosuanlein.v1";

export type Level = "basic" | "advance" | "challenge";

/** 单讲学习记录 */
export interface LessonRecord {
  /** 本讲是否完成过（学过七步 + 至少一次练习） */
  done: boolean;
  /** 各档位最佳正确率（0-1） */
  best: Partial<Record<Level, number>>;
  /** 本讲练习总题数 */
  practiced: number;
}

export interface StoreShape {
  /** 每讲记录：key = `${stageKey}:${lessonId}`（warmup:* 为口算热身记录，MeView 阶段进度跳过） */
  lessons: Record<string, LessonRecord>;
  /** 每日打卡日期（YYYY-MM-DD） */
  checkin: string[];
  /** 连续打卡天数 */
  streak: number;
  /** 汇总错题（key = `${lessonId}:${expr}`，去重） */
  mistakes: { key: string; lessonId: string; expr: string; answer: number | string; wrongCount: number }[];
  /** 防沉迷：今日练习秒数（展示用；跨日由 guard.todayReset 同步清零） */
  todaySec: number;
  /** 防沉迷 guard（对齐契约 §4 字段名，学科类口径=题量档） */
  guard: GuardShape;
  /** 自律退出天数（YYYY-MM-DD，去重滚动 365） */
  selfDaily: string[];
  /** 连续自律天数 */
  selfStreak: number;
  /** 今日自律锁（跨日自动复位） */
  selfLocked: boolean;
  /** 设置 */
  settings: { sound: boolean };
  /** 版本迁移位 */
  version: 1 | 2;
}

function emptyStore(): StoreShape {
  return {
    lessons: {},
    checkin: [],
    streak: 0,
    mistakes: [],
    todaySec: 0,
    guard: { ...GUARD_DEFAULT, today: todayStr() },
    selfDaily: [],
    selfStreak: 0,
    selfLocked: false,
    settings: { sound: true },
    version: 2,
  };
}

/** V0.3 迁移：旧 store（version 1 / 无 guard）补默认值并写回（对齐数学口算 normalizeStore 模式） */
function load(): StoreShape {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    const today = todayStr();
    const guard: GuardShape = parsed.guard
      ? todayReset(parsed.guard)
      : { ...GUARD_DEFAULT, today };
    // 跨日时 selfLocked 复位
    const selfLocked = guard.today === today && !!parsed.selfLocked;
    return {
      ...emptyStore(),
      ...parsed,
      settings: { ...emptyStore().settings, ...(parsed.settings || {}) },
      lessons: parsed.lessons || {},
      checkin: parsed.checkin || [],
      mistakes: parsed.mistakes || [],
      todaySec: parsed.todaySec || 0,
      guard,
      selfDaily: parsed.selfDaily || [],
      selfStreak: parsed.selfStreak || 0,
      selfLocked,
      version: 2,
    };
  } catch {
    return emptyStore();
  }
}

function save(s: StoreShape): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 容量不足或隐私模式：静默降级 */
  }
}

/** 连续打卡天数（允许今天或昨天为起点） */
function recomputeStreak(dates: string[]): number {
  const set = new Set(dates);
  let streak = 0;
  const cursor = new Date();
  if (!set.has(todayStr(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (set.has(todayStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export interface ProgressApi {
  store: StoreShape;
  /** 给某讲记录一次练习结果（best 只升不降）+ 累计练习量 + 打卡 */
  recordPractice: (lessonKey: string, level: Level, correct: number, total: number, seconds: number) => string[];
  /** 记一道错题（同 expr 去重置顶，上限 50） */
  pushMistake: (lessonId: string, expr: string, answer: number | string) => void;
  /** 清空全部数据 */
  clearAll: () => void;
  /** 更新设置 */
  setSetting: <K extends keyof StoreShape["settings"]>(k: K, v: StoreShape["settings"][K]) => void;
  /** 防沉迷：设置时长档/题量档（写入 guard） */
  setGuardPref: (kind: "minute" | "games", value: number) => void;
  /** 防沉迷：跨日重置后查询到点（结算处调） */
  dueInfo: () => DueInfo | null;
  /** 防沉迷：延迟（时长 +5min / 题量 +10，上限 2 次） */
  extendDue: (kind: "time" | "questions") => void;
  /** 防沉迷：我很自律（记今日 + 重算连续 + 置锁） */
  enoughNow: () => void;
  /** 防沉迷：今日是否自律锁 */
  locked: () => boolean;
  /** 防沉迷：连续自律天数 */
  selfStreakCount: () => number;
  /** 防沉迷：本组完成时累加题量（count=本组题数） */
  addPlayed: (count: number) => void;
}

const ProgressContext = createContext<ProgressApi | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<StoreShape>(load);

  useEffect(() => {
    save(store);
  }, [store]);

  const recordPractice = useCallback(
    (lessonKey: string, level: Level, correct: number, total: number, seconds: number): string[] => {
      let newCheckin: string[] = [];
      let newStreak = store.streak;
      setStore((s) => {
        const rate = total > 0 ? correct / total : 0;
        const prev = s.lessons[lessonKey];
        const lessons = {
          ...s.lessons,
          [lessonKey]: {
            done: true,
            best: { ...(prev?.best || {}), [level]: Math.max(prev?.best?.[level] || 0, rate) },
            practiced: (prev?.practiced || 0) + total,
          },
        };
        // 打卡：今天只要做过练习就点亮（去重）
        const today = todayStr();
        const checkin = s.checkin.includes(today) ? s.checkin : [...s.checkin, today];
        newCheckin = checkin;
        newStreak = recomputeStreak(checkin);
        return { ...s, lessons, checkin, streak: newStreak, todaySec: s.todaySec + seconds };
      });
      return newCheckin;
    },
    [store.streak],
  );

  const pushMistake = useCallback((lessonId: string, expr: string, answer: number | string) => {
    setStore((s) => {
      const key = `${lessonId}:${expr}`;
      const existing = s.mistakes.findIndex((m) => m.key === key);
      let mistakes = s.mistakes;
      if (existing >= 0) {
        mistakes = mistakes.map((m, i) => (i === existing ? { ...m, wrongCount: m.wrongCount + 1 } : m));
      } else {
        mistakes = [{ key, lessonId, expr, answer, wrongCount: 1 }, ...s.mistakes];
        if (mistakes.length > 50) mistakes = mistakes.slice(0, 50);
      }
      return { ...s, mistakes };
    });
  }, []);

  const clearAll = useCallback(() => {
    setStore(emptyStore());
  }, []);

  const setSetting = useCallback(
    <K extends keyof StoreShape["settings"]>(k: K, v: StoreShape["settings"][K]) => {
      setStore((s) => ({ ...s, settings: { ...s.settings, [k]: v } }));
    },
    [],
  );

  const setGuardPref = useCallback((kind: "minute" | "games", value: number) => {
    setStore((s) => {
      const g = todayReset(s.guard);
      return { ...s, guard: { ...g, minutePref: kind === "minute" ? value : g.minutePref, gamesPref: kind === "games" ? value : g.gamesPref } };
    });
  }, []);

  /* ---------- 防沉迷 API（纯逻辑在 guard.ts，store 只做持久化接线） ---------- */

  const dueInfo = useCallback((): DueInfo | null => {
    let due: DueInfo | null = null;
    setStore((s) => {
      const g = todayReset(s.guard);
      due = checkDue(g, s.todaySec, g.playedToday);
      return g === s.guard ? s : { ...s, guard: g, todaySec: g.today !== s.guard.today ? 0 : s.todaySec };
    });
    return due;
  }, []);

  const extendDue = useCallback((kind: "time" | "questions") => {
    setStore((s) => {
      const g = todayReset(s.guard);
      return { ...s, guard: extend(g, kind) };
    });
  }, []);

  const enoughNow = useCallback(() => {
    setStore((s) => {
      const self: SelfState = { selfDaily: s.selfDaily, selfStreak: s.selfStreak, selfLocked: s.selfLocked };
      const next = enough(self);
      return { ...s, selfDaily: next.selfDaily, selfStreak: next.selfStreak, selfLocked: next.selfLocked };
    });
  }, []);

  const locked = useCallback((): boolean => {
    let out = false;
    setStore((s) => {
      const g = todayReset(s.guard);
      out = isLocked(g, s.selfLocked);
      return g === s.guard ? s : { ...s, guard: g, todaySec: g.today !== s.guard.today ? 0 : s.todaySec };
    });
    return out;
  }, []);

  const selfStreakCount = useCallback((): number => {
    let out = 0;
    setStore((s) => {
      out = guardStreak(s.selfDaily);
      return s;
    });
    return out;
  }, []);

  const addPlayed = useCallback((count: number) => {
    setStore((s) => {
      const g = todayReset(s.guard);
      return { ...s, guard: { ...g, playedToday: g.playedToday + count } };
    });
  }, []);

  const api = useMemo<ProgressApi>(
    () => ({
      store,
      recordPractice,
      pushMistake,
      clearAll,
      setSetting,
      setGuardPref,
      dueInfo,
      extendDue,
      enoughNow,
      locked,
      selfStreakCount,
      addPlayed,
    }),
    [store, recordPractice, pushMistake, clearAll, setSetting, setGuardPref, dueInfo, extendDue, enoughNow, locked, selfStreakCount, addPlayed],
  );

  return <ProgressContext.Provider value={api}>{children}</ProgressContext.Provider>;
}

export function useProgress(): ProgressApi {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error("useProgress 必须在 ProgressProvider 内");
  return ctx;
}
