// 教师客户端 v0.3 壳（对齐 UI Agent 设计源 routes/index.tsx）：
// 侧栏二级分组 + 顶栏 + 视图分发，沿用 R03「useState<View>」决策。
// 课堂工具六视图用壳端真实实现（RosterView/ClassesView/CheckinView/ReflectionView/TimerView/DisciplineView）；
// 其余视图（启动中心/下载中心/工具箱/顶栏）为设计源组件（P2 阶段接入真实 invoke）。
import { useCallback, useEffect, useState } from "react";
import { Toaster } from "sonner";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { listen } from "@tauri-apps/api/event";
import { cn } from "@/lib/utils";
import { detectPatternFor } from "@/lib/archiveDetect";
import type { ArchiveMeta, ArchiveRule, Notification, View } from "@/lib/types";
import { VIEW_TITLES } from "@/lib/nav";
import {
  useArchivePending,
  useArchiveRules,
  useBookmarks,
  useDownloadTasks,
  useInstalledPackages,
  useLaunchConfig,
  useLaunchRecent,
  useLocalTextbooks,
  useLoggedIn,
  useNotifications,
  useNavCollapse,
  useNavGroups,
  useNavRail,
  useProbeOnline,
  useShortcuts,
  useToolCollapse,
} from "@/lib/store";
import { isPinnedMenu, SIDEBAR_MENU_MAX } from "@/components/LaunchConfigDialog";
import { Sidebar, type SidebarQuickItem } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { DownloadExtView } from "@/components/DownloadExtView";
import { ArchiveConfirmCard } from "@/components/ArchiveConfirmCard";
import { LaunchpadView } from "@/components/LaunchpadView";
import { SpecDocView } from "@/components/SpecDocView";
import { ProfileView } from "@/components/ProfileView";
import { SettingsView } from "@/components/SettingsView";
import { ThemeProvider, useThemeCtx } from "@/lib/theme";
import { QuickstartView } from "@/components/ClassroomViews";
// 壳端真实课堂工具视图
import RosterView from "./RosterView";
import ClassesView from "./ClassesView";
import CheckinView from "./CheckinView";
import ReflectionView from "./ReflectionView";
import TimerView from "./TimerView";
import DisciplineView from "./DisciplineView";
import { api, ClassProgress } from "./api";
import { friendlyErr } from "./errutil";

export default function Shell() {
  return (
    <ThemeProvider>
      <ShellInner />
    </ThemeProvider>
  );
}

function ShellInner() {
  const [view, setView] = useState<View>("launchpad");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // 壳端真实数据：多班进度（课堂工具真实视图依赖）
  const [recents, setRecents] = useState<ClassProgress[]>([]);
  const refreshRecents = useCallback(async () => {
    try {
      setRecents(await api.recentsList());
    } catch (e) {
      setErr(friendlyErr(e));
    }
  }, []);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void refreshRecents();
  }, [refreshRecents]);

  const { resolved } = useThemeCtx();
  const [collapse, setCollapse] = useNavCollapse();
  const [railCollapsed, setRailCollapsed] = useNavRail();
  const [toolCollapse, setToolCollapse] = useToolCollapse();
  const [loggedIn, setLoggedIn] = useLoggedIn();
  const [probeOnline, setProbeOnline] = useProbeOnline();
  const { installed, markInstalled } = useInstalledPackages();
  const { shortcuts, setShortcuts, addDownloaded, togglePin, markUsed } = useShortcuts();
  const { tasks, start, history: downloadHistory, clearHistory, activeList } = useDownloadTasks();
  const [bookmarks, setBookmarks] = useBookmarks();
  const [textbooks, setTextbooks] = useLocalTextbooks();
  /** 顶栏「前往下载中心」→ 让下载中心直达「任务」分区（一次性信号，消费后复位） */
  const [downloadCenterTasks, setDownloadCenterTasks] = useState(false);
  const { recent: launchRecent, markLaunch } = useLaunchRecent();
  const { configs, patchConfig } = useLaunchConfig();
  const [groupCfg] = useNavGroups();
  const { items: notifyItems, push: notifyPush, markAllRead, removeOne, clearAll, unread } = useNotifications();

  // D11 §5 · 素材归档：订阅 archive:new（P1 轮询发现新下载）
  // §5.4 静默归档：回调先查自动整理规则（taoli.archive.rules）——命中 → 跳过卡片直接归档 + 通知合并；
  // 未命中 / 归档失败 → 降级入待确认队列弹卡片。
  const { items: archivePending, add: archiveAdd, confirm: archiveConfirm, ignore: archiveIgnore } = useArchivePending();
  const { addRule: archiveAddRule, matchFor } = useArchiveRules();
  /** 待确认的第一张卡片（每张处理完自动流转下一张；关闭=跳过保留） */
  const [archiveCardOpen, setArchiveCardOpen] = useState(true);
  const nextPending = archivePending.find((p) => p.status === "pending");

  /** 归档变更广播：下载中心「素材归档」Tab 监听刷新（归档/撤销后无需手动点刷新） */
  const notifyArchiveChanged = useCallback(() => {
    window.dispatchEvent(new Event("archive:changed"));
  }, []);

  /** D11 §7 归档成功通知（channel=archive + groupKey 合并 + 撤销 action）；viaRule=true 文案「已自动整理」 */
  const pushArchivedNotify = useCallback(
    (name: string, path: string, meta: ArchiveMeta, viaRule: boolean) => {
      notifyPush(
        {
          kind: "success",
          channel: "archive",
          title: `${viaRule ? "已自动整理" : "已归档"}：${meta.subject}·${meta.version}·${meta.grade}${meta.volume}`,
          body: name,
          meta: { path, subject: meta.subject },
          action: "undo-archive",
        },
        { groupKey: `archived:${meta.subject}:${meta.version}:${meta.grade}${meta.volume}` },
      );
    },
    [notifyPush],
  );

  /** §5.4 静默归档：命中规则 → 直接 archive_confirm（不再询问）；失败 → 降级确认卡片 */
  const silentArchive = useCallback(
    async (payload: { name: string; path: string; size_bytes: number; at: string }, rule: ArchiveRule) => {
      const meta: ArchiveMeta = {
        subject: rule.subject,
        version: rule.version,
        grade: rule.grade,
        volume: rule.volume,
      };
      try {
        await api.archiveConfirm(payload.path, meta);
      } catch (e) {
        // 归档失败（源文件缺失/类型不支持等）→ 降级：入待确认队列弹卡片，不静默吞掉
        archiveAdd(payload);
        setArchiveCardOpen(true);
        toast.error("自动整理失败", { description: friendlyErr(e) });
        return;
      }
      pushArchivedNotify(payload.name, payload.path, meta, true);
      notifyArchiveChanged();
      toast.success(`已自动整理「${payload.name}」到素材目录`);
    },
    [archiveAdd, notifyArchiveChanged, pushArchivedNotify],
  );

  useEffect(() => {
    // listen 在非 Tauri 环境（dev/测试）会抛：catch 静默降级
    // 竞态防护：listen 是异步注册（promise），依赖变更重跑 effect 时用 cancelled 标志
    // 注销迟到完成的注册，避免旧 listener 泄漏造成重复处理。
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    try {
      listen<{ name: string; path: string; size_bytes: number; at: string }>("archive:new", (e) => {
        // §5.4：先查自动整理规则，命中 → 静默归档（不再弹卡片）
        const rule = matchFor(e.payload.name);
        if (rule) {
          void silentArchive(e.payload, rule);
          return;
        }
        // 未命中规则：入待确认队列弹卡片
        archiveAdd(e.payload);
        setArchiveCardOpen(true);
      }).then((un) => {
        if (cancelled) un(); // 已清理：立即注销迟到完成的注册
        else unlisten = un;
      });
    } catch {
      /* 非 Tauri 环境 */
    }
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [archiveAdd, matchFor, silentArchive]);

  /** 确认归档：真实调用 archive_confirm（拷贝→staging→rename + 索引）→ 成功标记 archived + 记忆 + 通知 */
  const handleArchiveConfirm = useCallback(
    async (id: string, meta: ArchiveMeta, remember: boolean) => {
      const item = archivePending.find((p) => p.id === id);
      if (!item) return;
      try {
        await api.archiveConfirm(item.path, meta);
      } catch (e) {
        toast.error("归档失败", { description: friendlyErr(e) });
        return; // 卡片保持，可修改后重试或忽略
      }
      archiveConfirm(id, meta);
      if (remember) {
        archiveAddRule({
          pattern: detectPatternFor(item.name),
          subject: meta.subject,
          version: meta.version,
          grade: meta.grade,
          volume: meta.volume,
        });
      }
      // D11 §7：归档通知走 archive 通道 + groupKey 合并（15min 同批次）+ 撤销 action
      pushArchivedNotify(item.name, item.path, meta, false);
      notifyArchiveChanged();
      toast.success(`已归档「${item.name}」到素材目录`);
    },
    [archivePending, archiveConfirm, archiveAddRule, pushArchivedNotify, notifyArchiveChanged],
  );

  /** 忽略：留在下载目录不归档 */
  const handleArchiveIgnore = useCallback(
    (id: string) => {
      const item = archivePending.find((p) => p.id === id);
      archiveIgnore(id);
      notifyPush({
        kind: "info",
        channel: "archive",
        title: `已忽略：${item?.name ?? ""}`,
        body: "文件保留在浏览器下载目录，未归档。",
      });
    },
    [archivePending, archiveIgnore, notifyPush],
  );

  /** D11 §7.4：通知 action 处理——撤销归档（通知 meta.path 反查 archive entry id） */
  const handleNotifyAction = useCallback(
    (n: Notification) => {
      if (n.action !== "undo-archive") return;
      const path = n.meta?.path;
      void (async () => {
        try {
          const list = await api.archiveList();
          const entry = path ? list.find((e) => e.source_path === path) : undefined;
          if (entry) {
            await api.archiveUndo(entry.id);
            toast.success(`已撤销归档：${entry.name}`, {
              description: "源文件仍在浏览器下载目录，可重新整理。",
            });
            removeOne(n.id);
            notifyArchiveChanged(); // 素材归档 Tab 联动刷新
          } else {
            // 索引中已无此条目（已被撤销/手动删除）：仅清通知
            removeOne(n.id);
            toast.info("该归档已在素材目录中移除");
          }
        } catch (e) {
          toast.error("撤销失败", { description: friendlyErr(e) });
        }
      })();
    },
    [removeOne, notifyArchiveChanged],
  );

  // 侧栏快捷启动项：pinnedMenu 钉选项（view/edu/tool/bm 均可），≤6、按钉入时间排序；失效 bm 自动过滤
  const quickItems: SidebarQuickItem[] = Object.entries(configs)
    .filter(([, c]) => isPinnedMenu(c))
    .sort(([, a], [, b]) => (a.pinnedAt ?? 0) - (b.pinnedAt ?? 0))
    .slice(0, SIDEBAR_MENU_MAX)
    .map(([id]) => {
      const [kind, ref] = [id.slice(0, id.indexOf(":")), id.slice(id.indexOf(":") + 1)] as const;
      let name = configs[id]?.menuLabel ?? ref;
      if (kind === "view") name = VIEW_TITLES[ref as View] ?? ref;
      else if (kind === "bm") name = bookmarks.find((b) => b.id === ref)?.name ?? ref;
      return { itemId: id, name, kind: kind as SidebarQuickItem["kind"] };
    })
    .filter((item) => item.kind !== "bm" || bookmarks.some((b) => b.id === item.itemId.slice(3)));

  const launchQuick = (item: SidebarQuickItem) => {
    if (item.kind === "view") {
      navigate(item.itemId.slice(5) as View);
      return;
    }
    if (item.kind === "bm") {
      const bm = bookmarks.find((b) => b.id === item.itemId.slice(3));
      if (bm) window.open(bm.url, "_blank", "noopener,noreferrer");
      else toast.error("该收藏已被删除");
      return;
    }
    markLaunch(item.itemId, item.name);
    toast.success(`已启动「${item.name}」`, { description: "真实客户端将直接打开该项。" });
  };

  const navigate = (v: View) => {
    setView(v);
    setMobileNavOpen(false);
  };

  const toggleGroup = (id: string) =>
    setCollapse((c) => ({ ...c, [id]: !c[id] }));

  const toggleCategory = (id: string) =>
    setToolCollapse((c) => ({ ...c, [id]: !c[id] }));

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Toaster position="top-center" richColors theme={resolved} />

      {/* D11 §5 确认卡片：有待确认下载且用户未关闭时悬浮展示 */}
      {archiveCardOpen && nextPending && (
        <ArchiveConfirmCard
          key={nextPending.id}
          item={nextPending}
          onConfirm={handleArchiveConfirm}
          onIgnore={handleArchiveIgnore}
          onClose={() => setArchiveCardOpen(false)}
        />
      )}

      {/* 桌面侧栏（可收拢为图标条，让右侧最大化） */}
      <div className="relative hidden md:flex md:h-full">
        <Sidebar
          view={view}
          onNavigate={navigate}
          collapse={collapse}
          onToggleGroup={toggleGroup}
          rail={railCollapsed}
          onToggleRail={() => setRailCollapsed((r) => !r)}
          configs={configs}
          groupCfg={groupCfg}
          quickItems={quickItems}
          onLaunchQuick={launchQuick}
          onOpenLaunchpad={() => navigate("launchpad")}
        />
        {railCollapsed && (
          <button
            type="button"
            className="group absolute top-1/2 z-30 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-sidebar-border bg-card text-muted-foreground shadow-sm transition-all hover:text-foreground max-md:hidden"
            style={{ left: "calc(56px - 12px)" }}
            title="展开侧栏"
            aria-label="展开侧栏"
            onClick={() => setRailCollapsed(false)}
          >
            <ChevronRight size={13} aria-hidden className="transition-transform group-hover:translate-x-px" />
          </button>
        )}
      </div>

      {/* 移动端抽屉侧栏 */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden" role="dialog" aria-label="导航抽屉">
          <div className="absolute inset-0 bg-black/45" onClick={() => setMobileNavOpen(false)} aria-hidden />
          <div className="relative h-full w-[260px] shadow-xl">
            <Sidebar
              view={view}
              onNavigate={navigate}
              collapse={collapse}
              onToggleGroup={toggleGroup}
              configs={configs}
              groupCfg={groupCfg}
              quickItems={quickItems}
              onLaunchQuick={launchQuick}
              onOpenLaunchpad={() => navigate("launchpad")}
            />
          </div>
        </div>
      )}

      {/* 主区 */}
      <main className={cn("flex min-w-0 flex-1 flex-col")}>
        <TopBar
          view={view}
          probeOnline={probeOnline}
          onToggleProbe={() => setProbeOnline((o) => !o)}
          loggedIn={loggedIn}
          onToggleLoggedIn={() => setLoggedIn((l) => !l)}
          onMenu={() => setMobileNavOpen(true)}
          onNavigate={navigate}
          notifications={notifyItems}
          unreadCount={unread}
          onNotifyMarkAllRead={markAllRead}
          onNotifyRemove={removeOne}
          onNotifyClear={clearAll}
          onNotifyAction={handleNotifyAction}
          activeDownloads={activeList}
          downloadHistory={downloadHistory}
          onOpenDownloadCenter={() => {
            setDownloadCenterTasks(true);
            navigate("download-ext");
          }}
        />
        <div className="min-h-0 flex-1">
          {view === "launchpad" && (
            <LaunchpadView
              installed={installed}
              markInstalled={markInstalled}
              shortcuts={shortcuts}
              onShortcuts={setShortcuts}
              addDownloaded={addDownloaded}
              togglePin={togglePin}
              markUsed={markUsed}
              tasks={tasks}
              startDownload={start}
              collapse={toolCollapse}
              onToggleCategory={toggleCategory}
              probeOnline={probeOnline}
              bookmarks={bookmarks}
              setBookmarks={setBookmarks}
              recent={launchRecent}
              markLaunch={markLaunch}
              configs={configs}
              patchConfig={patchConfig}
              notify={notifyPush}
              textbooks={textbooks}
              onTextbooks={setTextbooks}
            />
          )}
          {view === "quickstart" && <QuickstartView />}
          {view === "download-ext" && (
            <DownloadExtView
              loggedIn={loggedIn}
              installed={installed}
              onInstalled={markInstalled}
              tasks={tasks}
              startDownload={start}
              addDownloaded={addDownloaded}
              notify={notifyPush}
              textbooks={textbooks}
              onTextbooks={setTextbooks}
              activeDownloads={activeList}
              downloadHistory={downloadHistory}
              onClearHistory={clearHistory}
              showTasks={downloadCenterTasks}
              onShowTasksHandled={() => setDownloadCenterTasks(false)}
            />
          )}
          {view === "lottery" && <RosterView initialTab="draw" />}
          {view === "spec-doc" && <SpecDocView />}
          {view === "board" && (
            <ClassesView recents={recents} onRefresh={refreshRecents} />
          )}
          {view === "checkin" && <CheckinView />}
          {view === "reflection" && <ReflectionView />}
          {view === "timer" && <TimerView />}
          {view === "discipline" && <DisciplineView onOpenRoster={() => navigate("lottery")} />}
          {view === "profile" && (
            <ProfileView
              loggedIn={loggedIn}
              onToggleLoggedIn={() => setLoggedIn((l) => !l)}
              installed={installed}
              shortcuts={shortcuts}
              onGoToolbox={() => navigate("launchpad")}
              onGoSettings={() => navigate("settings")}
            />
          )}
          {view === "settings" && (
            <SettingsView
              loggedIn={loggedIn}
              onToggleLoggedIn={() => setLoggedIn((l) => !l)}
              installed={installed}
              shortcuts={shortcuts}
            />
          )}
        </div>
      </main>
      {err && <div className="sr-only">{err}</div>}
    </div>
  );
}
