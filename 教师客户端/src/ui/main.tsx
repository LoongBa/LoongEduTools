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

// ---- 壳加固（D09 §7 步骤2 · 与 Rust 侧 on_page_load 注入同款）----
// 壳启动即阻断：右键菜单 + F12 / Ctrl+Shift+I/J/C / Ctrl+U / Ctrl+P / Ctrl+S。
// ReactDOM 渲染前挂裸 window 监听，覆盖 shell 全部路由；content 窗口内容包页由
// src-tauri lib.rs on_page_load 每页注入同一逻辑（包内 H5 不经过本 bundle）。
function installHardening(): void {
  window.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("keydown", (e) => {
    const k = e.key.toUpperCase();
    const shiftIJC = e.ctrlKey && e.shiftKey && ["I", "J", "C"].includes(k);
    const ctrlUPC = e.ctrlKey && !e.shiftKey && ["U", "P", "S"].includes(k);
    if (e.key === "F12" || shiftIJC || ctrlUPC) e.preventDefault();
  });
}
installHardening();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isOverlay ? <OverlayView /> : <Shell />}
  </React.StrictMode>,
);
