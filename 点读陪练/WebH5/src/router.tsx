/**
 * TanStack Router 实例。
 *
 * 路由约定：
 * - 页面文件放 src/routes/，用 createFileRoute 定义
 * - src/routeTree.gen.ts 由 Vite 插件（@tanstack/router-plugin）在 dev/build 时自动更新（勿手改）
 * - 根布局见 src/routes/__root.tsx；首页占位见 src/routes/index.tsx（须整体替换）
 */
import { createHashHistory, createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    // 离线包（minitool）：hash 路由——document 路径恒为入口，保证 ./ 相对资源解析稳定；
    // 也避免容器自定义 scheme 下 pushState 抛 SecurityError。
    history: createHashHistory(),
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
