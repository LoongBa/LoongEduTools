import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// D02 §3.1（Oracle 评审）：target 显式 es2022（Chromium 108 完全支持，防默认 'modules' 兼容风险）
// 壳 UI 不用 Tailwind v4（oklch/color-mix 在 Chromium 108 仅部分支持），用纯 CSS
export default defineConfig(() => ({
  plugins: [react()],
  // 防 Vite 掩盖 Rust 错误
  clearScreen: false,
  build: {
    target: "es2022",
    sourcemap: false,
  },
  // 注：vite 8（rolldown/oxc）不走 esbuild 选项；JSX 转换由 @vitejs/plugin-react 负责，
  // minify 默认 oxc，无需显式配置（esbuild 选项会被忽略并告警）
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 忽略 src-tauri，避免循环触发
      ignored: ["**/src-tauri/**"],
    },
  },
}));