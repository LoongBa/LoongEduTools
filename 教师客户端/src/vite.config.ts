import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// D02 §3.1（Oracle 评审）：target 显式 es2022（Chromium 108 完全支持，防默认 'modules' 兼容风险）
// v0.3（R03）：引入 Tailwind v4 样式体系（设计源对齐），但 Win7/Chromium 108 不支持 oklch()——
// styles.css 令牌已由转换脚本落地为 hex/rgb（vite 构建产物不再含 oklch/color-mix）
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  // 防 Vite 掩盖 Rust 错误
  clearScreen: false,
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./ui", import.meta.url)),
    },
  },
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