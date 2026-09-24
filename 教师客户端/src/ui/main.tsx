import React from "react";
import ReactDOM from "react-dom/client";
import { listen } from "@tauri-apps/api/event";
import App from "./App";

// 主题引导：首帧渲染前同步设置主题（未设置视为 "system"），浅/深/跟随系统由 data-theme 驱动
document.documentElement.dataset.theme = localStorage.getItem("theme") || "system";

// ---- SPIKE-S1（D08 §4 前置验证 · 临时代码，M3 实施时移除/演化）----
// 验收：① content 全屏之上浮层可见（alwaysOnTop）② 跨窗口 emit/listen 通 ③ capabilities 权限齐
function OverlaySpike() {
  const [msg, setMsg] = React.useState("waiting for spike://tick ...");
  React.useEffect(() => {
    const un = listen<string>("spike://tick", (e) => setMsg(String(e.payload)));
    return () => {
      un.then((f) => f()).catch(() => {});
    };
  }, []);
  return (
    <div
      style={{
        background: "#101828",
        color: "#7ee787",
        font: "14px/1.6 monospace",
        padding: 16,
        height: "100vh",
        margin: 0,
      }}
    >
      <div>[SPIKE-S1] timer-overlay</div>
      <div>{msg}</div>
    </div>
  );
}

const isOverlay = location.hash === "#/overlay";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isOverlay ? <OverlaySpike /> : <App />}
  </React.StrictMode>,
);
