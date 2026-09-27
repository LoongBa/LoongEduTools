// 应用入口：样式在 ./styles.css（Tailwind v4 + design token），数据见 stages.generated.ts
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";
// 巧算题引擎（经典脚本 IIFE，挂 window.SMART_GENERATORS；模块化 import 仅取其副作用）
import "@/assets/smart_gen/sg_tools";
import "@/assets/smart_gen/sg_stage1_2";
import "@/assets/smart_gen/sg_stage3_4";
import "@/assets/smart_gen/sg_stage5_6";
import "@/assets/smart_gen/sg_stageX";
import "@/assets/smart_gen/smart_gen";
// 口算热身引擎（内联数学口算 generators.js，挂 window.KOU_GENERATORS + KOU_META；与巧算引擎共存）
import "@/assets/kou_gen/kou_gen";

/**
 * flex gap 能力检测（minitool 明禁 CSS.supports('gap')）— 行为测量
 * （从英语陪练 WebH5 main.tsx 移植；Chrome 61 无 gap，CSS 基线 margin 回退）
 */
function detectFlexGap(): void {
  if (!document.body) return;
  try {
    const el = document.createElement("div");
    el.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;display:flex;flex-direction:column;gap:10px;";
    const a = document.createElement("div");
    a.style.cssText = "width:10px;height:10px;";
    const b = document.createElement("div");
    b.style.cssText = "width:10px;height:10px;";
    el.appendChild(a);
    el.appendChild(b);
    document.body.appendChild(el);
    const h = el.scrollHeight;
    el.remove();
    document.documentElement.classList.add(h >= 30 ? "flex-gap" : "no-flex-gap");
  } catch {
    document.documentElement.classList.add("no-flex-gap");
  }
}

function whenDomReady(): Promise<void> {
  if (document.readyState === "loading") {
    return new Promise((resolve) => {
      document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
    });
  }
  return Promise.resolve();
}

async function bootstrap() {
  await whenDomReady();
  detectFlexGap();
  const root = document.getElementById("root");
  if (!root) {
    console.error("[bootstrap] #root 不存在");
    return;
  }
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void bootstrap();