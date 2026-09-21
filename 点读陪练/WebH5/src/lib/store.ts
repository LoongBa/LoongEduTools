// 本地进度存储：全部数据只存本机浏览器，不收集任何身份信息
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Stage } from "@/data/content";
import { UNITS, TOTAL_WORDS, unitOf } from "@/data/content";

const KEY = "dianedu.progress.v1";

export type SelfRating = "can" | "almost" | "help";

export interface DayRecord {
  /** ISO 日期 yyyy-mm-dd */
  date: string;
  unitId: string;
  week: number;
  dayInWeek: number; // 1-5
  stagesDone: Stage[];
  finished: boolean;
}

export interface SkillResult {
  week: number;
  skillId: string;
  rating: SelfRating;
}

export type ThemeKey =
  | "sprout"
  | "matcha"
  | "warm"
  | "sky"
  | "moss"
  | "forest"
  | "night";

/** 跟随系统深色模式时，浅色档与深色档的配对关系 */
const DARK_PAIR: Record<ThemeKey, ThemeKey> = {
  sprout: "moss",
  matcha: "forest",
  warm: "night",
  sky: "night",
  moss: "moss",
  forest: "forest",
  night: "night",
};

const LIGHT_PAIR: Record<ThemeKey, ThemeKey> = {
  sprout: "sprout",
  matcha: "matcha",
  warm: "warm",
  sky: "sky",
  moss: "sprout",
  forest: "matcha",
  night: "warm",
};

export interface Settings {
  soundOn: boolean;
  slowRate: boolean;
  littleKid: boolean;
  fontScale: "normal" | "large";
  bgTone: "soft" | "standard";
  theme: ThemeKey;
  /** 开启后按系统 prefers-color-scheme 在配对的浅/深档间自动切换 */
  followSystem: boolean;
}

export interface ProgressState {
  unitId: string;
  days: DayRecord[];
  skills: SkillResult[];
  /** word -> 最近接触时间戳 */
  touched: Record<string, number>;
  litWords: string[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  soundOn: true,
  slowRate: false,
  littleKid: false,
  fontScale: "normal",
  bgTone: "soft",
  theme: "sprout",
  // 默认跟随系统深/浅：新设备与清档后自动落在同色系的深色档或浅色档
  followSystem: true,
};

/** 主题清单：默认嫩芽黄绿（深浅各三套可选） */
export const THEMES: {
  k: ThemeKey;
  t: string;
  note: string;
  dark?: boolean;
  swatch: [string, string, string];
}[] = [
  {
    k: "sprout",
    t: "嫩芽黄绿",
    note: "默认 · 底色偏黄绿，接近豆沙绿护眼色卡",
    swatch: ["#E7F1DE", "#5C8F4E", "#6BA85C"],
  },
  {
    k: "matcha",
    t: "抹茶豆沙",
    note: "绿意更浓 · 整页是柔和豆沙绿，不再是白底",
    swatch: ["#C7DFCC", "#2F7A63", "#3E8C55"],
  },
  {
    k: "warm",
    t: "暖米",
    note: "暖橙主色，柔和米色底",
    swatch: ["#F6EBDA", "#D97B2B", "#4E9E6A"],
  },
  {
    k: "sky",
    t: "天蓝",
    note: "蓝色主色，清亮不刺眼",
    swatch: ["#E3EDF6", "#2F72B8", "#4E9E6A"],
  },
  {
    k: "moss",
    t: "苔夜黄绿",
    note: "深色 · 与嫩芽黄绿同色相的暗档，晚上陪练不刺眼",
    dark: true,
    swatch: ["#22301F", "#A8DC86", "#8FD06A"],
  },
  {
    k: "forest",
    t: "森林夜绿",
    note: "深色 · 保留绿相的墨夜色，暗光下最柔和",
    dark: true,
    swatch: ["#1E3A32", "#7FD3B4", "#63C783"],
  },
  {
    k: "night",
    t: "墨夜",
    note: "深色 · 中性炭调，暗光环境最省眼",
    dark: true,
    swatch: ["#1F2A33", "#8FE0BE", "#63C783"],
  },
];

const THEME_KEYS = THEMES.map((t) => t.k);

export function isDarkTheme(k: ThemeKey): boolean {
  return THEMES.find((t) => t.k === k)?.dark === true;
}

/** 系统是否处于深色模式（无法判定时按浅色处理） */
export function systemPrefersDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

/** 依「跟随系统」开关算出实际生效的主题：开则取配对的浅/深档 */
export function resolveTheme(pref: ThemeKey, followSystem: boolean): ThemeKey {
  if (!followSystem) return pref;
  return systemPrefersDark() ? DARK_PAIR[pref] : LIGHT_PAIR[pref];
}

/** bgTone = standard 时的底色覆盖：浅色主题提亮，深色主题略微提亮但仍为深底 */
const STANDARD_BG: Record<ThemeKey, string> = {
  sprout: "oklch(0.985 0.014 122)",
  matcha: "oklch(0.965 0.028 155)",
  warm: "oklch(0.985 0.008 90)",
  sky: "oklch(0.985 0.008 225)",
  moss: "oklch(0.275 0.028 128)",
  forest: "oklch(0.275 0.028 158)",
  night: "oklch(0.255 0.015 240)",
};

/** bgTone = soft 时各主题的底色（深色主题下「柔和」= 更暗一档） */
const SOFT_BG: Record<ThemeKey, string> = {
  sprout: "",
  matcha: "",
  warm: "",
  sky: "",
  moss: "oklch(0.215 0.028 128)",
  forest: "oklch(0.215 0.03 158)",
  night: "oklch(0.195 0.017 240)",
};

function emptyState(): ProgressState {
  return {
    unitId: UNITS[0].id,
    days: [],
    skills: [],
    touched: {},
    litWords: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

let storageOk = true;

/** 预览取色模式：`?theme=matcha` 只切换配色、不落盘。
 *  供「先看图再决定要不要用这套配色」这类预览场景使用，退出页面即恢复用户自己的设置。 */
function previewThemeFromUrl(): ThemeKey | null {
  try {
    const q = new URLSearchParams(window.location.search).get("theme");
    return q && THEME_KEYS.includes(q as ThemeKey) ? (q as ThemeKey) : null;
  } catch {
    return null;
  }
}

const PREVIEW_THEME = previewThemeFromUrl();

function load(): ProgressState {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<ProgressState>;
    return {
      ...emptyState(),
      ...parsed,
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      days: Array.isArray(parsed.days) ? parsed.days : [],
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      litWords: Array.isArray(parsed.litWords) ? parsed.litWords : [],
      touched: parsed.touched && typeof parsed.touched === "object" ? parsed.touched : {},
    };
  } catch {
    storageOk = false;
    return emptyState();
  }
}

function save(state: ProgressState): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
    storageOk = true;
  } catch {
    storageOk = false;
  }
}

export function isoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 周一为一周起点 */
export function weekInfo(d: Date = new Date()) {
  const dow = (d.getDay() + 6) % 7; // 0=Mon
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const epochMonday = new Date(2026, 8, 7).getTime(); // 内容起始周（2026-09-07）
  const week = Math.max(1, Math.floor((monday.getTime() - epochMonday) / (7 * 864e5)) + 1);
  return { week, monday, sunday, dow, isWeekend: dow >= 5 };
}

export function useProgress() {
  const [state, setState] = useState<ProgressState>(() => load());

  useEffect(() => {
    save(state);
  }, [state]);

  // 字号、主题与底色档位挂到根元素；跟随系统时监听深色模式变化
  useEffect(() => {
    const root = document.documentElement;
    root.style.fontSize = state.settings.fontScale === "large" ? "18px" : "16px";

    const apply = () => {
      const pref = THEME_KEYS.includes(state.settings.theme)
        ? state.settings.theme
        : DEFAULT_SETTINGS.theme;
      const theme = PREVIEW_THEME ?? resolveTheme(pref, state.settings.followSystem);
      root.dataset.theme = theme;
      // 深色主题下同步 .dark，让预置组件（shadcn/Radix）与描边/底板规则走暗色分支
      root.classList.toggle("dark", isDarkTheme(theme));
      const bg =
        state.settings.bgTone === "standard" ? STANDARD_BG[theme] : SOFT_BG[theme];
      if (bg) root.style.setProperty("--background", bg);
      else root.style.removeProperty("--background");
    };

    apply();
    if (!state.settings.followSystem || PREVIEW_THEME) return;
    try {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    } catch {
      /* 老浏览器不支持 matchMedia：保持当前档，不阻塞使用 */
    }
  }, [
    state.settings.fontScale,
    state.settings.bgTone,
    state.settings.theme,
    state.settings.followSystem,
  ]);

  const unit = useMemo(() => unitOf(state.unitId), [state.unitId]);

  const today = isoDate();
  const { week, isWeekend } = useMemo(() => weekInfo(), []);

  const dayRecordFor = useCallback(
    (w: number, dayInWeek: number) =>
      state.days.find((d) => d.week === w && d.dayInWeek === dayInWeek),
    [state.days],
  );

  /** 本周已点亮的 Day 编号列表 */
  const litDays = useMemo(() => {
    const arr: number[] = [];
    for (let i = 1; i <= 5; i++) {
      const r = state.days.find((d) => d.week === week && d.dayInWeek === i);
      if (r?.finished) arr.push(i);
    }
    return arr;
  }, [state.days, week]);

  /** 今天是本周的第几个陪练日（周末则取下一个未完成或 6 表示检验日） */
  const currentDay = useMemo(() => {
    for (let i = 1; i <= 5; i++) {
      const r = state.days.find((d) => d.week === week && d.dayInWeek === i);
      if (!r?.finished) return i;
    }
    return 6;
  }, [week, state.days]);

  const todayRecord = useMemo(
    () => state.days.find((d) => d.date === today),
    [state.days, today],
  );

  const startDay = useCallback((): number => {
    // 返回本次要练的 dayInWeek；同一天重复开始时沿用已有记录
    if (todayRecord) return todayRecord.dayInWeek;
    let slot = currentDay > 5 ? 1 : currentDay;
    while (slot <= 5 && state.days.some((d) => d.week === week && d.dayInWeek === slot && d.finished)) {
      slot++;
    }
    return Math.min(slot, 5);
  }, [todayRecord, currentDay, state.days, week]);

  const markStage = useCallback((dayInWeek: number, stage: Stage) => {
    setState((s) => {
      const idx = s.days.findIndex((d) => d.week === week && d.dayInWeek === dayInWeek);
      if (idx === -1) {
        return {
          ...s,
          days: [...s.days, { date: isoDate(), unitId: s.unitId, week, dayInWeek, stagesDone: [stage], finished: false }],
        };
      }
      const rec = s.days[idx];
      if (rec.stagesDone.includes(stage)) return s;
      const next = [...s.days];
      next[idx] = { ...rec, stagesDone: [...rec.stagesDone, stage] };
      return { ...s, days: next };
    });
  }, [week]);

  const finishDay = useCallback((dayInWeek: number, words: string[]) => {
    setState((s) => {
      const idx = s.days.findIndex((d) => d.week === week && d.dayInWeek === dayInWeek);
      const base: DayRecord = idx === -1
        ? { date: isoDate(), unitId: s.unitId, week, dayInWeek, stagesDone: ["warm", "new", "drill", "wrap"], finished: true }
        : { ...s.days[idx], stagesDone: Array.from(new Set([...s.days[idx].stagesDone, "warm", "new", "drill", "wrap"] as Stage[])), finished: true };
      const days = idx === -1 ? [...s.days, base] : s.days.map((d, i) => (i === idx ? base : d));
      const now = Date.now();
      const touched = { ...s.touched };
      words.forEach((w) => { touched[w] = now; });
      const litWords = Array.from(new Set([...s.litWords, ...words]));
      return { ...s, days, touched, litWords };
    });
  }, [week]);

  const rateSkill = useCallback((skillId: string, rating: SelfRating) => {
    setState((s) => {
      const rest = s.skills.filter((x) => !(x.week === week && x.skillId === skillId));
      return { ...s, skills: [...rest, { week, skillId, rating }] };
    });
  }, [week]);

  const skillRating = useCallback((skillId: string): SelfRating | undefined =>
    state.skills.find((x) => x.week === week && x.skillId === skillId)?.rating,
  [state.skills, week]);

  const reviewSkills = useCallback((unitId: string, ratings: Record<string, SelfRating>) => {
    setState((s) => {
      const u = unitOf(unitId);
      const now = Date.now();
      const touched = { ...s.touched };
      let extraLit: string[] = [];
      u.cards.forEach((c) => {
        c.words.forEach((w) => { touched[w.text] = now; });
      });
      // 「需要帮助」→ 补练后把对应环节句卡的词转为已点亮
      Object.entries(ratings).forEach(([sid, r]) => {
        if (r !== "help") return;
        const sk = u.skills.find((x) => x.id === sid);
        if (!sk) return;
        u.cards.filter((c) => c.stage === sk.remedy.stage).forEach((c) => {
          extraLit = [...extraLit, ...c.words.map((w) => w.text)];
        });
      });
      return { ...s, touched, litWords: Array.from(new Set([...s.litWords, ...extraLit])) };
    });
  }, []);

  const setUnit = useCallback((unitId: string) => {
    setState((s) => ({ ...s, unitId }));
  }, []);

  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  }, []);

  const resetAll = useCallback(() => setState(emptyState()), []);

  const stats = useMemo(() => {
    const finished = state.days.filter((d) => d.finished);
    const dates = Array.from(new Set(finished.map((d) => d.date))).sort();
    let streak = 0;
    for (let i = dates.length - 1; i >= 0; i--) {
      const cur = new Date(`${dates[i]}T00:00:00`);
      const expect = new Date();
      expect.setHours(0, 0, 0, 0);
      expect.setDate(expect.getDate() - (dates.length - 1 - i));
      if (cur.getTime() === expect.getTime()) streak++;
      else break;
    }
    return {
      totalDays: finished.length,
      streak,
      collected: state.litWords.length,
      totalWords: TOTAL_WORDS,
      unitsDone: Array.from(new Set(finished.map((d) => d.unitId))).length,
    };
  }, [state.days, state.litWords]);

  /** 超过 3 天未接触的词 → 柔性「该复习啦」 */
  const dueReview = useMemo(() => {
    const limit = Date.now() - 3 * 864e5;
    return Object.entries(state.touched)
      .filter(([, t]) => t < limit)
      .map(([w]) => w);
  }, [state.touched]);

  return {
    state,
    unit,
    week,
    isWeekend,
    today,
    currentDay,
    litDays,
    todayRecord,
    startDay,
    markStage,
    finishDay,
    rateSkill,
    skillRating,
    reviewSkills,
    setUnit,
    patchSettings,
    resetAll,
    stats,
    dueReview,
    storageOk,
  };
}

export type ProgressApi = ReturnType<typeof useProgress>;
