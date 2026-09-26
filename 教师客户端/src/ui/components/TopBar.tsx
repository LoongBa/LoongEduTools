// 顶栏：当前视图标题 · 服务器探针（可达/不可达，可手动切换模拟断网）· 下载速览 · 通知 · 头像菜单
// D11 §7.4：NotifyBell 支持 channel 分组图标 / groupKey 合并 count 展开 / action 动作按钮（撤销归档等）
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Check,
  LogOut,
  Menu,
  Settings,
  UserRound,
  Wifi,
  WifiOff,
  X,
  CheckCheck,
  Trash2,
  Info,
  TriangleAlert,
  CircleCheck,
  Download,
  Package,
  Wrench,
  Loader,
  Archive,
  BookOpen,
  Undo2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VIEW_TITLES } from "@/lib/nav";
import { relativeTime } from "@/lib/format";
import { api } from "@/api";
import type { ActiveDownload, DownloadHistoryItem, Notification, NotificationChannel, View } from "@/lib/types";

/** 顶栏下载面板里的活动任务（含进度） */
export interface ActiveDownloadView extends ActiveDownload {
  progress: number;
}

interface TopBarProps {
  view: View;
  probeOnline: boolean;
  onToggleProbe: () => void;
  loggedIn: boolean;
  onToggleLoggedIn: () => void;
  onMenu: () => void;
  onNavigate: (v: View) => void;
  /** 通知中心（头像旁铃铛） */
  notifications: Notification[];
  unreadCount: number;
  onNotifyMarkAllRead: () => void;
  onNotifyRemove: (id: string) => void;
  onNotifyClear: () => void;
  /** D11 §7.4：通知动作（撤销归档等） */
  onNotifyAction?: (n: Notification) => void;
  /** 下载中心速览：正在下载 / 等待中 */
  activeDownloads: ActiveDownloadView[];
  /** 已下载历史 */
  downloadHistory: DownloadHistoryItem[];
  /** 点击「前往下载中心」→ 跳转到下载中心的任务分区 */
  onOpenDownloadCenter: () => void;
}

const KIND_ICON = { success: CircleCheck, info: Info, warn: TriangleAlert } as const;
const KIND_CLASS = { success: "text-ok", info: "text-brand", warn: "text-warn" } as const;

/** D11 §7.4：channel 图标（插件/内容/教材/归档；缺省=通用不显） */
const CHANNEL_ICON: Partial<Record<NotificationChannel, typeof Wrench>> = {
  plugin: Wrench,
  content: Package,
  textbook: BookOpen,
  archive: Archive,
};
const CHANNEL_LABEL: Partial<Record<Notification["channel"] & string, string>> = {
  plugin: "插件",
  content: "内容",
  textbook: "教材",
  archive: "归档",
};

/** 任务类型图标：跑动中转圈，否则按内容包/工具区分 */
function IconFor({ kind, busy }: { kind: ActiveDownload["kind"]; busy: boolean }) {
  if (busy) return <Loader size={13} aria-hidden className="animate-spin" />;
  return kind === "tool" ? <Wrench size={13} aria-hidden /> : <Package size={13} aria-hidden />;
}

interface NotifyBellProps {
  items: Notification[];
  unread: number;
  onMarkAllRead: () => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  /** D11 §7.4：点击通知动作按钮（undo-archive 等）；返回 Promise 供按钮 loading 态 */
  onAction?: (n: Notification) => void;
}

/** 顶栏通知铃铛 + 向下弹出面板 */
function NotifyBell({ items, unread, onMarkAllRead, onRemove, onClear, onAction }: NotifyBellProps) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const toggle = () => {
    setOpen((v) => !v);
    if (!open && unread > 0) onMarkAllRead();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="通知"
        aria-expanded={open}
        title={unread > 0 ? `${unread} 条未读通知` : "通知"}
        className={cn(
          "relative flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          open && "bg-accent text-foreground",
        )}
        onClick={toggle}
      >
        <Bell size={16} aria-hidden />
        {unread > 0 && (
          <span
            className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground"
            aria-hidden
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="通知中心"
          className="absolute right-0 top-11 z-50 flex max-h-[60vh] w-80 flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <p className="font-display text-[13px] font-bold text-popover-foreground">通知</p>
            <span className="text-[11px] text-muted-foreground">{items.length} 条</span>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                className="flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="全部标记已读"
                onClick={onMarkAllRead}
              >
                <CheckCheck size={11} aria-hidden />已读
              </button>
              <button
                type="button"
                className="flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
                title="清空全部通知"
                disabled={items.length === 0}
                onClick={onClear}
              >
                <Trash2 size={11} aria-hidden />清空
              </button>
              <button
                type="button"
                aria-label="关闭通知面板"
                className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onClick={() => setOpen(false)}
              >
                <X size={12} aria-hidden />
              </button>
            </div>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12px] leading-relaxed text-muted-foreground">
              暂无通知
              <br />
              下载和更新消息会出现在这里
            </p>
          ) : (
            <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto" role="list">
              {items.map((n) => {
                const Icon = KIND_ICON[n.kind];
                const ch = n.channel; // NotificationChannel | undefined
                const ChannelIcon = ch ? CHANNEL_ICON[ch] : undefined;
                const count = n.meta?.count;
                const itemsList = n.meta?.items;
                const isExpanded = expanded === n.id;
                return (
                  <li key={n.id} className={cn("group flex gap-2 px-3 py-2.5", !n.read && "bg-brand-soft/40")}>
                    <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
                      <Icon size={14} aria-hidden className={cn(KIND_CLASS[n.kind])} />
                      {ChannelIcon && ch && (
                        <span className="flex items-center gap-0.5 rounded bg-muted px-1 py-px text-[9px] text-muted-foreground" title={`${CHANNEL_LABEL[ch]}通道`}>
                          <ChannelIcon size={9} aria-hidden />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium text-popover-foreground" title={n.title}>
                        {count && count > 1 ? `${count} 个${n.title.replace(/^\d+ 个/, "")}` : n.title}
                      </p>
                      {!isExpanded && n.body && (
                        <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground">{n.body}</p>
                      )}
                      {isExpanded && itemsList && itemsList.length > 0 && (
                        <ul className="mt-1 space-y-0.5 border-l-2 border-border pl-2">
                          {itemsList.map((f, i) => (
                            <li key={i} className="truncate text-[11px] text-muted-foreground" title={f}>{f}</li>
                          ))}
                        </ul>
                      )}
                      {/* 合并条目 >1 且带明细 → 展开开关 */}
                      {count && count > 1 && itemsList && itemsList.length > 0 && (
                        <button
                          type="button"
                          className="mt-0.5 flex items-center gap-0.5 text-[10.5px] text-brand hover:underline"
                          onClick={() => setExpanded(isExpanded ? null : n.id)}
                        >
                          {isExpanded ? <ChevronDown size={10} aria-hidden /> : <ChevronRight size={10} aria-hidden />}
                          {isExpanded ? "收起明细" : `查看 ${itemsList.length} 项明细`}
                        </button>
                      )}
                      <p className="mt-0.5 text-[10.5px] text-muted-foreground/80">{relativeTime(n.at)}</p>
                      {/* D11 §7.4 动作按钮：仅当 action 已定义（撤销归档） */}
                      {n.action === "undo-archive" && onAction && (
                        <button
                          type="button"
                          disabled={busyId === n.id}
                          className="mt-1 flex h-6 items-center gap-1 rounded-md border border-input bg-card px-2 text-[11px] text-foreground transition-colors hover:bg-accent disabled:opacity-45"
                          onClick={() => {
                            setBusyId(n.id);
                            onAction(n);
                            setTimeout(() => setBusyId(null), 1500);
                          }}
                        >
                          {busyId === n.id ? <Loader size={10} aria-hidden className="animate-spin" /> : <Undo2 size={10} aria-hidden />}
                          撤销归档
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label={`删除通知：${n.title}`}
                      className="flex size-5 shrink-0 items-center justify-center self-start rounded text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      onClick={() => onRemove(n.id)}
                    >
                      <X size={11} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

interface DownloadBellProps {
  active: ActiveDownloadView[];
  history: DownloadHistoryItem[];
  onOpenCenter: () => void;
}

/** 顶栏「下载」按钮 + 向下弹出面板：正在下载 / 等待中 / 已下载，底部一键进入下载中心 */
function DownloadBell({ active, history, onOpenCenter }: DownloadBellProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const running = active.filter((a) => !a.queued);
  const waiting = active.filter((a) => a.queued);
  const busy = running.length > 0;
  const total = active.length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="下载"
        aria-expanded={open}
        title={total > 0 ? `${total} 个下载任务` : "下载中心速览"}
        className={cn(
          "relative flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          open && "bg-accent text-foreground",
          busy && "text-brand",
        )}
        onClick={() => setOpen((v) => !v)}
      >
        <Download size={16} aria-hidden className={busy ? "animate-pulse" : ""} />
        {total > 0 && (
          <span
            className="absolute right-0.5 top-0.5 flex min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold leading-4 text-on-primary"
            aria-hidden
          >
            {total > 9 ? "9+" : total}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="下载中心速览"
          className="absolute right-0 top-11 z-50 flex max-h-[70vh] w-80 flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <p className="font-display text-[13px] font-bold text-popover-foreground">下载</p>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {total > 0 ? `${running.length} 下载中 · ${waiting.length} 等待中` : "空闲"}
            </span>
            <button
              type="button"
              aria-label="关闭下载面板"
              className="ml-auto flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              <X size={12} aria-hidden />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {total === 0 ? (
              <p className="px-4 py-6 text-center text-[12px] leading-relaxed text-muted-foreground">
                当前没有进行中的下载
                <br />
                发起下载后会在这里看到进度
              </p>
            ) : (
              <section aria-label="下载中与等待中">
                {[...running, ...waiting].map((a) => (
                  <div key={a.id} className="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                      <IconFor kind={a.kind} busy={!a.queued} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium text-popover-foreground" title={a.name}>
                        {a.name}
                      </span>
                      <span className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className={cn("block h-full rounded-full transition-[width] duration-200", a.queued ? "bg-muted-foreground/40" : "bg-brand")}
                          style={{ width: `${a.queued ? 0 : Math.round(a.progress)}%` }}
                        />
                      </span>
                    </span>
                    <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                      {a.queued ? "等待中" : `${Math.round(a.progress)}%`}
                    </span>
                  </div>
                ))}
              </section>
            )}

            <p className="flex items-center gap-1.5 bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
              <CircleCheck size={11} aria-hidden className="text-ok" />
              已下载（{history.length}）
            </p>
            {history.length === 0 ? (
              <p className="px-4 py-5 text-center text-[11.5px] text-muted-foreground">暂无下载记录</p>
            ) : (
              <ul role="list" className="divide-y divide-border">
                {history.slice(0, 20).map((h) => (
                  <li key={`${h.id}-${h.at}`} className="flex items-center gap-2.5 px-3 py-2">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <IconFor kind={h.kind} busy={false} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-popover-foreground" title={h.name}>
                      {h.name}
                    </span>
                    <span className="shrink-0 text-[10.5px] tabular-nums text-muted-foreground">{relativeTime(h.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            className="flex min-h-10 shrink-0 items-center justify-center gap-1.5 border-t border-border bg-muted/30 text-[12.5px] font-medium text-foreground transition-colors hover:bg-accent"
            onClick={() => {
              setOpen(false);
              onOpenCenter();
            }}
          >
            <Download size={12} aria-hidden />前往下载中心
          </button>
        </div>
      )}
    </div>
  );
}

export function TopBar({
  view,
  probeOnline,
  onToggleProbe,
  loggedIn,
  onToggleLoggedIn,
  onMenu,
  onNavigate,
  notifications,
  unreadCount,
  onNotifyMarkAllRead,
  onNotifyRemove,
  onNotifyClear,
  onNotifyAction,
  activeDownloads,
  downloadHistory,
  onOpenDownloadCenter,
}: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="banner print-hide relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur-sm max-md:px-3">
      <button
        type="button"
        className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
        aria-label="打开导航"
        onClick={onMenu}
      >
        <Menu size={18} aria-hidden />
      </button>

      <h1 className="font-display text-[17px] font-bold tracking-wide text-foreground">
        {VIEW_TITLES[view]}
      </h1>

      <div className="ml-auto flex items-center gap-2">
        {/* 服务器探针 */}
        <button
          type="button"
          onClick={onToggleProbe}
          title="点击模拟服务器可达 / 不可达（演示断网降级）"
          className={cn(
            "flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12px] transition-colors",
            probeOnline
              ? "border-ok/30 bg-ok/10 text-ok"
              : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {probeOnline ? <Wifi size={12} aria-hidden /> : <WifiOff size={12} aria-hidden />}
          <span className="probe-dot size-1.5 rounded-full bg-current" aria-hidden />
          {probeOnline ? "服务器可达" : "服务器不可达"}
        </button>

        {/* 下载中心速览（正在下载 / 等待中 / 已下载） */}
        <DownloadBell active={activeDownloads} history={downloadHistory} onOpenCenter={onOpenDownloadCenter} />

        {/* 通知中心铃铛（头像旁） */}
        <NotifyBell
          items={notifications}
          unread={unreadCount}
          onMarkAllRead={onNotifyMarkAllRead}
          onRemove={onNotifyRemove}
          onClear={onNotifyClear}
          onAction={onNotifyAction}
        />

        {/* 头像菜单（profile/login/settings 收进此处，不回流侧栏） */}
        <div className="relative">
          <button
            type="button"
            className="flex size-9 items-center justify-center rounded-full bg-brand-soft text-[13px] font-bold text-brand transition-transform hover:scale-105"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            王
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" aria-hidden onClick={() => setMenuOpen(false)} />
              <div
                role="menu"
                className="user-menu-panel absolute right-0 top-11 z-20 w-56 overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-lg"
              >
                <div className="flex items-center gap-2.5 border-b border-border px-2.5 pb-2.5 pt-2">
                  <span className="flex size-9 items-center justify-center rounded-full bg-brand text-[13px] font-bold text-on-primary">
                    王
                  </span>
                  <span className="leading-tight">
                    <span className="block text-[13px] font-medium">王老师</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {loggedIn ? "已登录 · 本机授权" : "未登录 · 仅可浏览"}
                    </span>
                  </span>
                </div>
                <MenuItem icon={UserRound} label="个人信息" onClick={() => onNavigate("profile")} />
                <MenuItem icon={Settings} label="设置" onClick={() => onNavigate("settings")} />
                <MenuItem
                  icon={Check}
                  label={loggedIn ? "退出登录" : "去登录（模拟）"}
                  onClick={() => {
                    onToggleLoggedIn();
                    setMenuOpen(false);
                  }}
                />
                <MenuItem
                  icon={LogOut}
                  label="注销并清除本机数据"
                  danger
                  onClick={() => {
                    // 真实壳端：登出清凭证（Rust credential.enc）+ 清 taoli.* 本地数据（设计源持久化键）
                    void api.authLogout().catch(() => {});
                    for (const k of Object.keys(window.localStorage)) {
                      if (k.startsWith("taoli.")) window.localStorage.removeItem(k);
                    }
                    window.location.reload();
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof UserRound;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition-colors",
        danger
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground hover:bg-accent",
      )}
    >
      <Icon size={14} strokeWidth={2} aria-hidden className="shrink-0 opacity-80" />
      {label}
    </button>
  );
}
