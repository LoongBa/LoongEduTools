// 数学巧算 · 本地进度中枢（localStorage，单一 key，儿童数据最小化）
// 参考英语陪练 WebH5 store.ts 模式：只存本地进度/打卡/错题，不上传个人数据。
// key: redtools.qiaosuanlein.v1（产品代号「巧算乐学」）

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

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
  /** 每讲记录：key = `${stageKey}:${lessonId}` */
  lessons: Record<string, LessonRecord>;
  /** 每日打卡日期（YYYY-MM-DD） */
  checkin: string[];
  /** 连续打卡天数 */
  streak: number;
  /** 汇总错题（key = `${lessonId}:${expr}`，去重） */
  mistakes: { key: string; lessonId: string; expr: string; answer: number | string; wrongCount: number }[];
  /** 防沉迷：今日练习秒数 */
  todaySec: number;
  /** 设置 */
  settings: { sound: boolean };
  /** 版本迁移位（未来结构升级用） */
  version: 1;
}

export function todayStr(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function emptyStore(): StoreShape {
  return {
    lessons: {},
    checkin: [],
    streak: 0,
    mistakes: [],
    todaySec: 0,
    settings: { sound: true },
    version: 1,
  };
}

function load(): StoreShape {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    return {
      ...emptyStore(),
      ...parsed,
      settings: { ...emptyStore().settings, ...(parsed.settings || {}) },
      lessons: parsed.lessons || {},
      checkin: parsed.checkin || [],
      mistakes: parsed.mistakes || [],
      version: 1,
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

  const api = useMemo<ProgressApi>(
    () => ({ store, recordPractice, pushMistake, clearAll, setSetting }),
    [store, recordPractice, pushMistake, clearAll, setSetting],
  );

  return <ProgressContext.Provider value={api}>{children}</ProgressContext.Provider>;
}

export function useProgress(): ProgressApi {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error("useProgress 必须在 ProgressProvider 内");
  return ctx;
}