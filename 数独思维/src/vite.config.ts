import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { existsSync } from "fs";
import { resolve } from "path";

const SOURCE_LOCATION_PLUGIN_CANDIDATES = [
  process.env.MEOO_SOURCE_LOCATION_PLUGIN_PATH,
  "/app/sdk/lib/src/plugins/source-location-babel.js",
  resolve(process.cwd(), "node_modules/@ali/oneday-agent-sdk/lib/src/plugins/source-location-babel.js"),
].filter(Boolean) as string[];

const SOURCE_LOCATION_PLUGIN_PATH = SOURCE_LOCATION_PLUGIN_CANDIDATES.find((path) => existsSync(path));

/**
 * React + Vite 构建配置（双形态：offline / online）
 *
 * 硬约束：
 * - dev server 监听 3014 + strictPort（3015 被其它应用占用；如需改回沙箱代理端口，改这里 + package.json 脚本）
 * - outDir 'dist' / assetsDir 'assets' — 归一化产物目录
 * - offline 形态 base './' — 产物可 file:// 双击离线运行（无 history 路由依赖）
 * - online 形态 base '/shudu/' — lexue 分区子路径部署（方案 v0.9），单路由状态机无需 history 基路径
 */
export default defineConfig(({ command, mode }) => {
  const online = mode === "online";
  return {
    base: online ? "/shudu/" : "./",
    plugins: [
      tailwindcss(),
      TanStackRouterVite(),
      viteReact({
        babel: {
          plugins: SOURCE_LOCATION_PLUGIN_PATH
            ? [[SOURCE_LOCATION_PLUGIN_PATH, { projectRoot: process.cwd() }]]
            : [],
        },
      }),
      tsConfigPaths(),
    ],
    server: {
      host: "0.0.0.0",
      port: 3014,
      strictPort: true,
      allowedHosts: true,
      // HMR 默认关闭：沙箱预览 iframe 下 HMR 的整页 reload 会放大任何 transform error
      // 如需热更，改为: hmr: { clientPort: 443, protocol: 'wss' }
      hmr: false,
    },
    build: {
      outDir: "dist",
      assetsDir: "assets",
      emptyOutDir: true,
      rollupOptions: {
        output: {
          entryFileNames: "assets/[name]-[hash].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
  };
});
