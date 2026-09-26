// 本地存档：单一 localStorage 键，纯浏览器存储，无账号无云同步。
// 记录最佳成绩、练习史、徽章、成就、打卡、错题、收藏、训练地图进度、断点快照。

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Grid, Size } from "./sudoku";

const KEY = "redtools.shudu.v1";

export interface BestRecord {
  ms: number;
  errors: number;
  hints: number;
  stars: number;
  date: string;
}

export interface HistoryItem {
  date: string;
  level: LevelId;
  size: Size;
  ms: number;
  errors: number;
  hints: number;
  stars: number;
}

export interface BookItem {
  id: string;
  ts: number;
  level: LevelId;
  size: Size;
  board: Grid;
  solution: Grid;
  /** 错题本用：错误次数 / 提示次数 */
  errors?: number;
  hints?: number;
}

export interface Snapshot {
  size: Size;
  level: LevelId;
  puzzle: Grid;
  solution: Grid;
  board: Grid;
  notes: Record<number, number[]>;
  ms: number;
  errors: number;
  hints: number;
  source: PracticeSource;
  mapIndex?: number;
}

export type LevelId = "easy" | "normal" | "hard";
export type PracticeSource = "free" | "daily" | "map" | "import" | "replay";

export interface StoreShape {
  version: 1;
  best: Partial<Record<Size, BestRecord>>;
  recent: Partial<Record<Size, number>>;
  checkin: { dates: string[]; streak: number };
  history: HistoryItem[];
  skills: Record<string, boolean>;
  advSkills: Record<string, boolean>;
  mistakes: BookItem[];
  favorites: BookItem[];
  daily: { date: string; level: LevelId } | null;
  achievements: Record<string, string>;
  mapProgress: { completed: { i: number; doneAt: number }[] };
  settings: { sound: boolean };
  cur: Snapshot | null;
}

export function todayStr(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function emptyStore(): StoreShape {
  return {
    version: 1,
    best: {},
    recent: {},
    checkin: { dates: [], streak: 0 },
    history: [],
    skills: {},
    advSkills: {},
    mistakes: [],
    favorites: [],
    daily: null,
    achievements: {},
    mapProgress: { completed: [] },
    settings: { sound: true },
    cur: null,
  };
}

function load(): StoreShape {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    // 逐字段合并，旧存档缺字段时回落默认值，避免结构回退
    return { ...emptyStore(), ...parsed, settings: { ...emptyStore().settings, ...(parsed.settings || {}) }, checkin: { ...emptyStore().checkin, ...(parsed.checkin || {}) }, mapProgress: { completed: parsed.mapProgress?.completed || [] }, version: 1 };
  } catch {
    return emptyStore();
  }
}

function save(s: StoreShape): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 容量不足或隐私模式：静默降级为内存态 */
  }
}

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

interface StoreCtx {
  store: StoreShape;
  update: (fn: (draft: StoreShape) => void) => void;
  resetAll: () => void;
  playSound: (kind: SoundKind) => void;
}

export type SoundKind = "tap" | "ok" | "wrong" | "win" | "badge";

const Ctx = createContext<StoreCtx | null>(null);

let audioCtx: AudioContext | null = null;
function tone(freq: number, dur: number, delay: number, gain = 0.05): void {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    const ctx = audioCtx;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch {
    /* 音频不可用时忽略 */
  }
}

const TONES: Record<SoundKind, [number, number, number][]> = {
  tap: [[520, 0.06, 0]],
  ok: [[660, 0.09, 0], [880, 0.1, 0.07]],
  wrong: [[300, 0.14, 0]],
  win: [[523, 0.12, 0], [659, 0.12, 0.1], [784, 0.16, 0.2], [1046, 0.22, 0.32]],
  badge: [[784, 0.1, 0], [1046, 0.16, 0.09]],
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<StoreShape>(() => load());

  const update = useCallback((fn: (draft: StoreShape) => void) => {
    setStore((prev) => {
      const draft: StoreShape = JSON.parse(JSON.stringify(prev));
      fn(draft);
      draft.checkin.streak = recomputeStreak(draft.checkin.dates);
      save(draft);
      return draft;
    });
  }, []);

  const resetAll = useCallback(() => {
    const fresh = emptyStore();
    save(fresh);
    setStore(fresh);
  }, []);

  const playSound = useCallback(
    (kind: SoundKind) => {
      if (!store.settings.sound) return;
      for (const [f, d, dl] of TONES[kind]) tone(f, d, dl);
    },
    [store.settings.sound],
  );

  const value = useMemo(() => ({ store, update, resetAll, playSound }), [store, update, resetAll, playSound]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore 必须在 StoreProvider 内使用");
  return v;
}

/** 打卡：完成一次练习即记一天 */
export function markCheckin(draft: StoreShape): boolean {
  const t = todayStr();
  if (draft.checkin.dates.indexOf(t) >= 0) return false;
  draft.checkin.dates.push(t);
  if (draft.checkin.dates.length > 400) draft.checkin.dates = draft.checkin.dates.slice(-400);
  return true;
}

/** 星级：0 提示 0 错 = 3★；提示 ≤1 且错 ≤3 = 2★；其余 1★（用过提示封顶 2★） */
export function calcStars(hints: number, errors: number): number {
  if (hints === 0 && errors === 0) return 3;
  if (hints <= 1 && errors <= 3) return 2;
  return 1;
}
