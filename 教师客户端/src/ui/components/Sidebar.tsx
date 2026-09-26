// 侧栏：品牌区 + 分组二级导航（组名/可见性可配置）+ 快捷启动项区 + 底栏
// rail 收拢模式：200px ↔ 56px 图标条——品牌/菜单项/快捷项/底栏功能全部保留图标，hover/focus 显示名称
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ChevronRight,
  Globe,
  GraduationCap,
  LayoutDashboard,
  LayoutGrid,
  Maximize,
  Moon,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Rocket,
  Settings,
  ShieldAlert,
  Sun,
  Timer,
  DownloadCloud,
  Dices,
  ScrollText,
  UserRound,
  Wrench,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_GROUPS, groupOfView } from "@/lib/nav";
import { api } from "@/api";
import { friendlyErr } from "@/errutil";
import { useThemeCtx } from "@/lib/theme";
import { RailIconOrFallback, clampMenuLabel } from "@/lib/launch-icon";
import type { CollapseMap } from "@/lib/store";
import type { LaunchConfigMap, NavGroupConfig, View } from "@/lib/types";

const VIEW_ICONS: Record<View, LucideIcon> = {
  launchpad: LayoutGrid,
  quickstart: Rocket,
  "download-ext": DownloadCloud,
  lottery: Dices,
  board: LayoutDashboard,
  checkin: Play,
  reflection: NotebookPen,
  timer: Timer,
  discipline: ShieldAlert,
  "spec-doc": ScrollText,
  profile: UserRound,
  settings: SettingsIcon,
};

/** 侧栏「一键启动」钉选项：view=内置功能页（如一键开课），其余为工具/收藏 */
export interface SidebarQuickItem {
  itemId: string; // "view:<View>" | "edu:<id>" | "tool:<toolId>" | "bm:<id>"
  name: string;
  kind: "view" | "edu" | "tool" | "bm";
}

/** 钉选项未配置图标时的兜底矢量图标，与导航项样式保持一致 */
function quickFallbackIcon(item: SidebarQuickItem): LucideIcon {
  if (item.kind === "view") return VIEW_ICONS[item.itemId.slice(5) as View] ?? Rocket;
  if (item.kind === "bm") return Globe;
  return Wrench;
}

interface SidebarProps {
  view: View;
  onNavigate: (v: View) => void;
  collapse: CollapseMap;
  onToggleGroup: (id: string) => void;
  /** rail 收拢态；移动端抽屉不传（始终全宽） */
  rail?: boolean;
  onToggleRail?: () => void;
  /** 一键启动配置（图标/菜单名/钉选） */
  configs?: LaunchConfigMap;
  /** 分组覆盖（组名可改、条目可隐藏） */
  groupCfg?: NavGroupConfig;
  quickItems?: SidebarQuickItem[];
  onLaunchQuick?: (item: SidebarQuickItem) => void;
  /** 底栏火箭按钮：点击直达启动中心（通知铃铛已迁至顶栏头像旁） */
  onOpenLaunchpad?: () => void;
}

export function Sidebar({
  view,
  onNavigate,
  collapse,
  onToggleGroup,
  rail = false,
  onToggleRail,
  configs = {},
  groupCfg = {},
  quickItems = [],
  onLaunchQuick,
  onOpenLaunchpad,
}: SidebarProps) {
  const activeGroup = groupOfView(view);
  const { resolved, toggleDark } = useThemeCtx();

  // 当前视图所在组强制展开（不覆盖其他组的用户偏好）
  const [forced, setForced] = useState<CollapseMap>({});
  useEffect(() => {
    if (activeGroup && collapse[activeGroup]) {
      setForced((f: CollapseMap) => (f[activeGroup] ? f : { ...f, [activeGroup]: true }));
    }
  }, [activeGroup, collapse]);

  const isExpanded = (id: string) => !collapse[id] || forced[id];

  // 应用分组覆盖：组名可改、hiddenViews 过滤条目
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    label: groupCfg[g.id]?.label?.trim() || g.label,
    children: g.children.filter((c) => !groupCfg[g.id]?.hiddenViews?.includes(c.view)),
  })).filter((g) => g.children.length > 0);

  return (
    <aside
      className={cn(
        "sidebar print-hide flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar-bg text-sidebar-text transition-[width] duration-200 ease-out",
        rail ? "w-[56px]" : "w-[200px]",
        "max-md:w-full max-md:border-r-0",
      )}
      aria-label="主导航"
    >
      {/* 品牌区：rail 下保留 logo 图标 */}
      <div className={cn("flex items-center gap-2.5 px-4 pb-4 pt-5", rail && "justify-center px-0")}>
        <RailWrap rail={rail} label="桃李助手">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-on-primary shadow-sm">
            <GraduationCap size={18} strokeWidth={2} aria-hidden />
          </span>
        </RailWrap>
        {!rail && (
          <span className="leading-tight">
            <span className="block font-display text-[15px] font-bold tracking-wide">桃李助手</span>
            <span className="block text-[11px] text-sidebar-muted">龙爸易教 · 教师端</span>
          </span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2" aria-label="功能导航">
        {/* 一键启动·钉选条目：侧栏 pinnedMenu 项（≤6），置于导航最前；rail 下同样保留 */}
        {quickItems.length > 0 && (
          <div className="nav-group mb-1">
            {!rail && (
              <p className="nav-group-head flex min-h-8 items-center px-2.5 text-[12px] font-semibold uppercase tracking-wider text-sidebar-muted">
                一键启动
                <span className="ml-auto pr-1 text-[10px] font-normal normal-case tracking-normal opacity-70">
                  {quickItems.length}/6
                </span>
              </p>
            )}
            <ul className={cn("space-y-0.5", !rail && "pl-3")} role="list" aria-label="快捷启动项">
              {quickItems.map((item) => {
                const cfg = configs[item.itemId];
                const label = clampMenuLabel(cfg?.menuLabel ?? item.name);
                return (
                  <li key={item.itemId}>
                    <div className={cn(rail ? "group relative" : "group flex items-center")}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md text-left text-[14px] text-sidebar-nav transition-colors hover:bg-sidebar-hover hover:text-sidebar-text",
                          rail ? "mx-auto size-9 justify-center" : "min-h-10 px-3 py-1.5",
                        )}
                        aria-label={label}
                        onClick={() => onLaunchQuick?.(item)}
                      >
                        {rail ? (
                          <RailIconOrFallback
                            itemId={item.itemId}
                            name={item.name}
                            cfg={cfg}
                            icon={quickFallbackIcon(item)}
                          />
                        ) : (
                          <>
                            {/* 图标槽位与导航项一致（18px 容器 + 15px 图标） */}
                            <span className="flex size-[18px] shrink-0 items-center justify-center opacity-90">
                              <RailIconOrFallback
                                itemId={item.itemId}
                                name={item.name}
                                cfg={cfg}
                                icon={quickFallbackIcon(item)}
                                size={15}
                              />
                            </span>
                            <span className="min-w-0 flex-1 truncate">{label}</span>
                            {item.kind === "bm" && <Globe size={11} aria-hidden className="shrink-0 opacity-50" />}
                          </>
                        )}
                      </button>
                      {rail && <RailTooltip label={label} />}
                    </div>
                  </li>
                );
              })}
            </ul>
            {rail && (
              <span className="mx-auto mt-1 block h-px w-6 bg-sidebar-border opacity-60" aria-hidden />
            )}
          </div>
        )}

        {groups.map((group) => {
          const expanded = isExpanded(group.id);
          const groupActive = activeGroup === group.id;

          // 顶级直排组（启动中心/下载中心）：无组头、不可折叠，条目直接平铺
          if (group.topLevel) {
            return (
              <div key={group.id} className="mb-1">
                {rail ? (
                  <ul className="space-y-0.5" role="list">
                    {group.children.map((child) => {
                      const itemId = `view:${child.view}`;
                      const cfg = configs[itemId];
                      const label = clampMenuLabel(cfg?.menuLabel ?? child.label);
                      return (
                        <li key={child.view}>
                          <div className="group relative">
                            <button
                              type="button"
                              className={cn(
                                "mx-auto flex size-9 items-center justify-center rounded-md transition-colors",
                                view === child.view
                                  ? "bg-sidebar-active text-sidebar-active-fg shadow-sm"
                                  : "text-sidebar-nav hover:bg-sidebar-hover hover:text-sidebar-text",
                              )}
                              aria-label={label}
                              aria-current={view === child.view ? "page" : undefined}
                              onClick={() => onNavigate(child.view)}
                            >
                              <RailIconOrFallback itemId={itemId} name={child.label} cfg={cfg} icon={VIEW_ICONS[child.view]} />
                            </button>
                            <RailTooltip label={label} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <ul className="space-y-0.5" role="list">
                    {group.children.map((child) => {
                      const itemId = `view:${child.view}`;
                      const cfg = configs[itemId];
                      const label = clampMenuLabel(cfg?.menuLabel ?? child.label);
                      const active = view === child.view;
                      return (
                        <li key={child.view}>
                          <button
                            type="button"
                            className={cn(
                              "nav-item flex min-h-10 w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[14px] transition-colors",
                              active
                                ? "bg-sidebar-active font-medium text-sidebar-active-fg shadow-sm"
                                : "text-sidebar-nav hover:bg-sidebar-hover hover:text-sidebar-text",
                            )}
                            aria-current={active ? "page" : undefined}
                            onClick={() => onNavigate(child.view)}
                          >
                            <span className="flex size-[18px] shrink-0 items-center justify-center opacity-90">
                              <RailIconOrFallback itemId={itemId} name={child.label} cfg={cfg} icon={VIEW_ICONS[child.view]} size={15} />
                            </span>
                            <span className="truncate">{label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          }

          // rail：分组渲染为子项图标直排，组头位置放一个收拢占位分隔
          if (rail) {
            return (
              <div key={group.id} className="mb-1">
                <span
                  className={cn(
                    "mx-auto mb-1 block h-px w-6 bg-sidebar-border",
                    !groupActive && "opacity-60",
                  )}
                  aria-hidden
                />
                <ul className="space-y-0.5" role="list">
                  {group.children.map((child) => {
                    const itemId = `view:${child.view}`;
                    const cfg = configs[itemId];
                    const label = clampMenuLabel(cfg?.menuLabel ?? child.label);
                    return (
                      <li key={child.view}>
                        <div className="group relative">
                          <button
                            type="button"
                            className={cn(
                              "mx-auto flex size-9 items-center justify-center rounded-md transition-colors",
                              view === child.view
                                ? "bg-sidebar-active text-sidebar-active-fg shadow-sm"
                                : "text-sidebar-nav hover:bg-sidebar-hover hover:text-sidebar-text",
                            )}
                            aria-label={label}
                            aria-current={view === child.view ? "page" : undefined}
                            onClick={() => onNavigate(child.view)}
                          >
                            <RailIconOrFallback itemId={itemId} name={child.label} cfg={cfg} icon={VIEW_ICONS[child.view]} />
                          </button>
                          <RailTooltip label={label} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          }

          return (
            <div key={group.id} className="nav-group mb-1">
              <button
                type="button"
                className="nav-group-head flex min-h-10 w-full items-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold uppercase tracking-wider text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-nav"
                aria-expanded={expanded}
                onClick={() => onToggleGroup(group.id)}
              >
                <ChevronRight
                  size={12}
                  strokeWidth={2.5}
                  aria-hidden
                  className="nav-chevron shrink-0"
                  data-open={expanded}
                />
                <span>{group.label}</span>
                {groupActive && (
                  <span
                    className="ml-auto size-1.5 rounded-full bg-brand"
                    title="当前页在此分组"
                    aria-label="当前页在此分组"
                  />
                )}
              </button>
              <div className={cn("overflow-hidden", expanded ? "anim-collapse-down" : "hidden")}>
                <ul className="nav-subnav mt-0.5 space-y-0.5 pl-3" role="list">
                  {group.children.map((child) => {
                    const itemId = `view:${child.view}`;
                    const cfg = configs[itemId];
                    const label = clampMenuLabel(cfg?.menuLabel ?? child.label);
                    const active = view === child.view;
                    return (
                      <li key={child.view}>
                        <button
                          type="button"
                          className={cn(
                            "nav-item flex min-h-10 w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[14px] transition-colors",
                            active
                              ? "bg-sidebar-active font-medium text-sidebar-active-fg shadow-sm"
                              : "text-sidebar-nav hover:bg-sidebar-hover hover:text-sidebar-text",
                          )}
                          aria-current={active ? "page" : undefined}
                          onClick={() => onNavigate(child.view)}
                        >
                          <span className="flex size-[18px] shrink-0 items-center justify-center opacity-90">
                            <RailIconOrFallback itemId={itemId} name={child.label} cfg={cfg} icon={VIEW_ICONS[child.view]} size={15} />
                          </span>
                          <span className="truncate">{label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          );
        })}
      </nav>

      {/* 侧栏底：收拢开关 + 启动中心入口 + 全屏 + 主题 + 设置（通知铃铛已迁至顶栏头像旁；rail 下纵向排列且全部保留） */}
      <div
        className={cn(
          "flex items-center gap-1 border-t border-sidebar-border px-2 py-2.5",
          rail && "flex-col",
        )}
      >
        {onToggleRail && (
          <RailWrap rail={rail} label={rail ? "展开侧栏" : "收拢侧栏"}>
            <button
              type="button"
              className={cn(
                "relative flex min-h-9 items-center justify-center rounded-md text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-text",
                rail ? "size-9 w-full" : "w-9 shrink-0",
              )}
              title={rail ? "展开侧栏" : "收拢侧栏"}
              aria-label={rail ? "展开侧栏" : "收拢侧栏"}
              aria-expanded={!rail}
              onClick={onToggleRail}
            >
              {rail ? <PanelLeftOpen size={14} aria-hidden /> : <PanelLeftClose size={14} aria-hidden />}
            </button>
          </RailWrap>
        )}
        <RailWrap rail={rail} label="打开启动中心">
          <button
            type="button"
            className={cn(
              "relative flex min-h-9 items-center justify-center rounded-md transition-colors hover:bg-sidebar-hover hover:text-sidebar-text",
              rail ? "size-9 w-full" : "w-9 shrink-0",
              view === "launchpad" ? "bg-sidebar-hover text-brand" : "text-sidebar-muted",
            )}
            title="启动中心：管理快捷方式与一键启动钉选项"
            aria-label="打开启动中心"
            aria-current={view === "launchpad" ? "page" : undefined}
            onClick={() => onOpenLaunchpad?.()}
          >
            <Rocket size={13} aria-hidden />
            {quickItems.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-brand text-[8px] font-bold leading-none text-on-primary">
                {quickItems.length}
              </span>
            )}
          </button>
        </RailWrap>
        <RailWrap rail={rail} label="全屏 F11">
          <button
            type="button"
            className={cn(
              "flex min-h-9 items-center justify-center rounded-md text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-text",
              rail ? "size-9 w-full" : "w-9 shrink-0",
            )}
            title="全屏（F11，Tauri 窗口全屏）"
            onClick={async () => {
              // 真实壳端：Tauri 窗口全屏（对 main 窗口）；非 Tauri 环境降级为浏览器全屏（演示/浏览器直开）
              try {
                await api.toggleFullscreen("main");
              } catch (e) {
                if (document.fullscreenElement) {
                  void document.exitFullscreen();
                } else {
                  void document.documentElement.requestFullscreen().catch(() => toast.error(friendlyErr(e)));
                }
              }
            }}
          >
            <Maximize size={13} aria-hidden />
          </button>
        </RailWrap>
        <RailWrap rail={rail} label={resolved === "light" ? "切换深色主题" : "切换浅色主题"}>
          <button
            type="button"
            className="flex size-9 items-center justify-center rounded-md text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-text"
            title={resolved === "light" ? "切换深色主题" : "切换浅色主题"}
            aria-label="切换深浅主题"
            onClick={toggleDark}
          >
            {resolved === "light" ? <Sun size={14} aria-hidden /> : <Moon size={14} aria-hidden />}
          </button>
        </RailWrap>
        <RailWrap rail={rail} label="设置">
          <button
            type="button"
            className={cn(
              "flex size-9 items-center justify-center rounded-md text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-text",
              view === "settings" && "bg-sidebar-hover text-sidebar-text",
            )}
            title="设置"
            aria-label="设置"
            aria-current={view === "settings" ? "page" : undefined}
            onClick={() => onNavigate("settings")}
          >
            <Settings size={14} aria-hidden />
          </button>
        </RailWrap>
      </div>
    </aside>
  );
}

/** rail 模式的图标按钮（带 hover/focus tooltip） */
function RailWrap({
  rail,
  label,
  children,
}: {
  rail: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (!rail) return <>{children}</>;
  return (
    <div className="group relative w-full">
      {children}
      <RailTooltip label={label} />
    </div>
  );
}

function RailTooltip({ label }: { label: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-[calc(100%+8px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md border border-sidebar-border bg-popover px-2 py-1 text-[12px] text-popover-foreground opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
    >
      {label}
    </span>
  );
}

