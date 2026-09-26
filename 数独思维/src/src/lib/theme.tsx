// 主题系统：4 套色板 × 浅/深两版；深浅默认跟随系统，可手动锁定。
// 全部状态写入 localStorage（纯本地，无云端）。首帧前由 index.html 内联脚本预应用，避免闪烁。

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type SchemeId = "sky" | "paper" | "mint" | "dusk";
export type ModeId = "system" | "light" | "dark";

export interface SchemeMeta {
  id: SchemeId;
  name: string;
  desc: string;
  /** 预览色：浅色版 / 深色版的主色与底色 */
  light: { bg: string; primary: string; accent: string };
  dark: { bg: string; primary: string; accent: string };
}

export const SCHEMES: SchemeMeta[] = [
  {
    id: "sky",
    name: "晴空",
    desc: "品牌天蓝延续，明快清爽",
    light: { bg: "#e8f2fb", primary: "#2f8ede", accent: "#f0a531" },
    dark: { bg: "#141d2c", primary: "#63b6f0", accent: "#f2b545" },
  },
  {
    id: "paper",
    name: "暖纸墨青",
    desc: "仿纸质教辅，安静耐看",
    light: { bg: "#f7f2e6", primary: "#2f5f70", accent: "#b8641f" },
    dark: { bg: "#1d2429", primary: "#e0cf9e", accent: "#d98a3c" },
  },
  {
    id: "mint",
    name: "薄荷青瓷",
    desc: "冷绿低刺激，久看不累",
    light: { bg: "#e9f6f3", primary: "#1f8a7d", accent: "#e0a02a" },
    dark: { bg: "#132322", primary: "#5fc9b6", accent: "#efbc45" },
  },
  {
    id: "dusk",
    name: "暮紫星云",
    desc: "沉静专注，深色优先",
    light: { bg: "#f1eefa", primary: "#6a3fc0", accent: "#c9762a" },
    dark: { bg: "#191428", primary: "#a98bf0", accent: "#f0a860" },
  },
];

const KEY_SCHEME = "redtools.shudu.scheme";
const KEY_MODE = "redtools.shudu.mode";

export function readStoredScheme(): SchemeId {
  try {
    const v = localStorage.getItem(KEY_SCHEME);
    return SCHEMES.some((s) => s.id === v) ? (v as SchemeId) : "sky";
  } catch {
    return "sky";
  }
}

export function readStoredMode(): ModeId {
  try {
    const v = localStorage.getItem(KEY_MODE);
    return v === "light" || v === "dark" || v === "system" ? v : "system";
  } catch {
    return "system";
  }
}

/** 供画布绘制/内联样式读取当前生效色值 */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

interface ThemeCtx {
  scheme: SchemeId;
  mode: ModeId;
  resolved: "light" | "dark";
  setScheme: (s: SchemeId) => void;
  setMode: (m: ModeId) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [scheme, setSchemeState] = useState<SchemeId>(() => readStoredScheme());
  const [mode, setModeState] = useState<ModeId>(() => readStoredMode());
  const [sysDark, setSysDark] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSysDark(e.matches);
    // Safari 14 以下只有 addListener
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  const resolved: "light" | "dark" = mode === "system" ? (sysDark ? "dark" : "light") : mode;

  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute("data-scheme", scheme);
    el.classList.remove("light", "dark");
    el.classList.add(resolved);
    el.setAttribute("data-theme", resolved);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", cssVar("--background") || (resolved === "dark" ? "#141d2c" : "#e8f2fb"));
  }, [scheme, resolved]);

  const setScheme = useCallback((s: SchemeId) => {
    setSchemeState(s);
    try {
      localStorage.setItem(KEY_SCHEME, s);
    } catch {
      /* 隐私模式下忽略 */
    }
  }, []);

  const setMode = useCallback((m: ModeId) => {
    setModeState(m);
    try {
      localStorage.setItem(KEY_MODE, m);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ scheme, mode, resolved, setScheme, setMode }),
    [scheme, mode, resolved, setScheme, setMode],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTheme 必须在 ThemeProvider 内使用");
  return v;
}
