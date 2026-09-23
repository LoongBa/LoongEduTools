// 应用入口：样式在 ./styles.css（Tailwind v4 + design token），路由见 ./router.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { initRevealEngine } from "./lib/reveal-engine";
import { loadCatalog } from "./data/content";
import "./styles.css";

// 全局滚动渐入引擎：业务元素只需加 class="reveal"（详见 lib/reveal-engine.ts），勿删
initRevealEngine();

/**
 * flex gap 能力检测（minitool 明禁 CSS.supports('gap')）— 行为测量：
 * body 存在后、render 前执行。竖排两个 10px 子元素 + gap:10px，
 * 有 gap 则 scrollHeight=30，无 gap 则=20。结果挂到 html class 供 CSS 基线选择。
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

// 预加载运行时目录（manifest + 单元内容包）→ 自动匹配打包内容；缺失降级示例数据
async function bootstrap() {
  detectFlexGap();
  await loadCatalog();
  const router = getRouter();
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>
  );
}

void bootstrap();
