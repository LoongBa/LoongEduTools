import React from "react";
import ReactDOM from "react-dom/client";
import Shell from "./Shell";
import OverlayView from "./OverlayView";
import "./styles.css";

// 主题引导：首帧渲染前同步设置主题（未设置视为 "system"），浅/深/跟随系统由 data-theme 驱动
// 键名须与 lib/theme.tsx 的 usePersistentState("taoli.theme.mode") 一致，否则 FOUC 防护失效
const bootTheme = (() => {
  try {
    const raw = localStorage.getItem("taoli.theme.mode");
    if (raw === '"light"') return "light";
    if (raw === '"dark"') return "dark";
  } catch {
    /* ignore */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
})();
document.documentElement.dataset.theme = bootTheme;

// D08 §3.3#3：timer-overlay 独立窗口路由（tauri.conf.json 静态声明 url = index.html#/overlay）
// Spike-S1 临时代码已摘除（OverlaySpike + spike://tick 使命完成，演化为本视图）
const isOverlay = location.hash === "#/overlay";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isOverlay ? <OverlayView /> : <Shell />}
  </React.StrictMode>,
);
