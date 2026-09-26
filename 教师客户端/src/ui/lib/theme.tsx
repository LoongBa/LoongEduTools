// 主题系统：mode（light/dark/system，默认跟随系统）× skin（配色皮肤）
// 通过 React Context 共享给侧栏底栏、顶栏、设置页，避免层层传参
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePersistentState } from "./store";

export type ThemeMode = "light" | "dark" | "system";
export type SkinId = "clay" | "pine" | "indigo" | "rose" | "ink";

export const SKIN_META: { id: SkinId; label: string; light: boolean }[] = [
  { id: "clay", label: "暖橙陶土", light: true },
  { id: "pine", label: "松青", light: true },
  { id: "indigo", label: "靛蓝", light: true },
  { id: "rose", label: "玫瑰胭脂", light: true },
  { id: "ink", label: "墨玉", light: false },
];

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  /** 解析后的实际深浅（system 时取媒体查询结果） */
  resolved: "light" | "dark";
  skin: SkinId;
  setSkin: (s: SkinId) => void;
  /** 快速在浅/深之间切换（把 system 落到具体一档） */
  toggleDark: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = usePersistentState<ThemeMode>("taoli.theme.mode", "system");
  const [skin, setSkin] = usePersistentState<SkinId>("taoli.theme.skin", "clay");
  const [sysDark, setSysDark] = useState(systemPrefersDark);

  // 兼容旧版仅存 light/dark 的主题键
  useEffect(() => {
    try {
      const legacy = window.localStorage.getItem("taoli.theme");
      if (legacy === '"light"' || legacy === '"dark"') {
        setMode(JSON.parse(legacy) as ThemeMode);
        window.localStorage.removeItem("taoli.theme");
      }
    } catch {
      /* ignore */
    }
  }, [setMode]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSysDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolved: "light" | "dark" = mode === "system" ? (sysDark ? "dark" : "light") : mode;

  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(resolved);
    document.documentElement.setAttribute("data-theme", resolved);
  }, [resolved]);

  useEffect(() => {
    document.documentElement.setAttribute("data-skin", skin);
  }, [skin]);

  const toggleDark = useCallback(
    () => setMode(resolved === "light" ? "dark" : "light"),
    [resolved, setMode],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, setMode, resolved, skin, setSkin, toggleDark }),
    [mode, setMode, resolved, skin, setSkin, toggleDark],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeCtx(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeCtx 必须在 ThemeProvider 内使用");
  return ctx;
}
