// 根布局：Provider 放这里；页面路由在 src/routes/ 下单独建文件，勿堆进 index.tsx
import {
  Outlet,
  Navigate,
  createRootRoute,
  useRouterState,
  type ErrorComponentProps,
} from '@tanstack/react-router';

function NotFoundComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname === '/') return null;
  return <Navigate to="/" replace />;
}

function ErrorComponent({ error }: ErrorComponentProps) {
  // TanStack Router 的 error 是 unknown，先归一化再打日志
  console.error("[router] 渲染异常，已回退首页：", error);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // 已在首页仍报错时不再 redirect，避免 / → / 死循环
  if (pathname === '/') return null;
  return <Navigate to="/" replace />;
}

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  return <Outlet />;
}
