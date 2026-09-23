// 应用壳：手机比例画幅 + 底部五格导航（首页居中突出）；桌面居中留柔和空白
import { Link, Outlet, createFileRoute, useMatchRoute } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { HomeIcon, BookIcon, MusicIcon, UserIcon, LeafIcon } from "@/components/nav-icons";

export const Route = createFileRoute("/_layout")({
  component: LayoutShell,
});

const NAV = [
  { to: "/words", label: "词卡", Icon: BookIcon },
  { to: "/jukebox", label: "点唱台", Icon: MusicIcon },
  { to: "/", label: "首页", Icon: HomeIcon },
  { to: "/growth", label: "成长卡", Icon: LeafIcon },
  { to: "/me", label: "我的", Icon: UserIcon },
] as const;

/** 导航项 → 是否激活。用 router 的匹配结果，纯客户端跳转也会随路由变化重渲染 */
function useNavActive() {
  const matchRoute = useMatchRoute();
  return (to: string): boolean => {
    if (to === "/") return !!matchRoute({ to: "/", fuzzy: false });
    // /words 高亮「词卡」，但 /word-card 这类同前缀路由不应误命中
    return !!matchRoute({ to: `${to}/**` as never }) || !!matchRoute({ to: to as never });
  };
}

function LayoutShell() {
  const isNavActive = useNavActive();

  return (
    <div className="min-h-dvh w-full bg-background">
      {/* 桌面端：居中手机比例画幅，两侧留白 */}
      <div className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col border-x border-border/60 bg-background sm:my-0">
        <main className="flex-1 px-4 pb-28 pt-5 sm:px-6">
          <Outlet />
        </main>

        <nav
          aria-label="主导航"
          className="panel-border no-print fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[520px] border-t bg-card/95 backdrop-blur-sm"
        >
          <ul className="grid grid-cols-5 px-2 py-1.5">
            {NAV.map(({ to, label, Icon }) => {
              const active = isNavActive(to);
              const isHome = to === "/";
              return (
                <li key={to} className="flex items-stretch justify-center">
                  <Link
                    to={to}
                    className={cn(
                      "tap-target flex flex-col items-center justify-center gap-1 rounded-2xl transition-colors duration-200",
                      isHome ? "py-0.5" : "py-1.5",
                      active && !isHome ? "text-primary-deep" : !isHome && "text-muted-text hover:text-foreground",
                    )}
                    aria-current={active ? "page" : undefined}
                    aria-label={isHome ? "首页" : undefined}
                  >
                    {isHome ? (
                      <span
                        className={cn(
                          "grid h-14 w-14 -translate-y-2 place-items-center rounded-full shadow-lift transition-colors duration-300",
                          active ? "bg-primary text-primary-foreground" : "bg-accent text-primary-deep",
                        )}
                      >
                        <Icon className="h-7 w-7" />
                      </span>
                    ) : (
                      <>
                        <span
                          className={cn(
                            "grid h-9 w-14 place-items-center rounded-full transition-colors duration-300",
                            active && "bg-accent",
                          )}
                        >
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="text-[12px] font-semibold leading-none">{label}</span>
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
