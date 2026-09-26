import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ActiveDownload,
  Bookmark,
  DownloadHistoryItem,
  DownloadKind,
  DownloadTask,
  LaunchConfigMap,
  LaunchRecentItem,
  LocalTextbook,
  NavGroupConfig,
  Notification,
  ToolShortcut,
} from "./types";
import { MOCK_BOOKMARK_BASELINE, MOCK_TEXTBOOK_BASELINE, QUICKSTART_PIN_SEED, LAUNCH_ICON_SEED_MIGRATION_KEY, LEGACY_SEED_ICON_IDS, MOCK_USER } from "./mockData";
import { api } from "@/api";

// localStorage keys —— 折叠态 / 主题 / 登录态 / 探针 / 已装包 / 快捷方式 / 下载任务 / 启动中心
const K = {
  navCollapse: "taoli.nav.collapse",
  navRail: "taoli.nav.railCollapsed",
  toolCollapse: "taoli.toolbox.collapse",
  theme: "taoli.theme",
  loggedIn: "taoli.auth.loggedIn",
  probeOnline: "taoli.server.probeOnline",
  installed: "taoli.packages.installed",
  shortcuts: "taoli.toolbox.shortcuts",
  tasks: "taoli.downloads.tasks",
  bookmarks: "taoli.launch.bookmarks",
  launchRecent: "taoli.launch.recent",
  launchConfig: "taoli.launch.config",
  navGroups: "taoli.nav.groups",
  notifyItems: "taoli.notify.items",
  textbooks: "taoli.textbooks.local",
  downloadHistory: "taoli.downloads.history",
} as const;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 隐私模式等场景静默降级为内存态 */
  }
}

/** 通用：state + localStorage 持久化 hook */
export function usePersistentState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => load(key, initial));
  useEffect(() => {
    save(key, state);
  }, [key, state]);
  return [state, setState] as const;
}

// ── 侧栏分组折叠态：首装全部展开（{} 表示无折叠记录）──
import type { CollapseMap } from "./types";
export type { CollapseMap };
export function useNavCollapse() {
  return usePersistentState<CollapseMap>(K.navCollapse, {});
}

export function useToolCollapse() {
  return usePersistentState<CollapseMap>(K.toolCollapse, {});
}

// ── 侧栏收拢（rail 图标模式）：持久化，刷新保留 ──
export function useNavRail() {
  return usePersistentState<boolean>(K.navRail, false);
}

// ── 登录态 / 服务器探针（初始探测真实状态；保留手动切换契约供演示/降级）──
export function useLoggedIn() {
  const [loggedIn, setLoggedIn] = usePersistentState<boolean>(K.loggedIn, false);
  useEffect(() => {
    void api
      .authStatus()
      .then((a) => setLoggedIn(a.logged_in))
      .catch(() => { /* 未登录/离线：保持本地态 */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [loggedIn, setLoggedIn] as const;
}
export function useProbeOnline() {
  const [online, setOnline] = usePersistentState<boolean>(K.probeOnline, false);
  useEffect(() => {
    void api
      .serverPing()
      .then(() => setOnline(true))
      .catch(() => setOnline(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [online, setOnline] as const;
}

// ── 账号信息（真实来源：auth_status + license_status；未登录/离线时回退 MOCK_USER）──
export interface AccountInfo {
  name: string;
  school: string;
  subject: string;
  licenseUntil: string;
  clientVersion: string;
  deviceId: string;
  /** 是否来自真实壳端命令（false = 演示兜底） */
  real: boolean;
}
export function useAccountInfo(): AccountInfo {
  const [acct, setAcct] = useState<AccountInfo>(() => ({
    ...MOCK_USER,
    real: false,
  }));
  useEffect(() => {
    void Promise.allSettled([api.authStatus(), api.licenseStatus()]).then(([a, l]) => {
      const auth = a.status === "fulfilled" ? a.value : null;
      const lic = l.status === "fulfilled" ? l.value : null;
      if (!auth?.teacher) return; // 未登录：保持演示兜底
      const t = auth.teacher;
      setAcct({
        name: t.name ?? "教师",
        school: lic?.present ? "已授权（本机）" : "未授权",
        subject: [t.grade, t.subject].filter(Boolean).join(" · ") || "任教信息未填",
        licenseUntil: lic?.expires_at
          ? new Date(lic.expires_at).toLocaleDateString("zh-CN")
          : "—",
        clientVersion: "教师客户端 v0.3.0",
        deviceId: auth.device_id || lic?.machine_fp || "—",
        real: true,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return acct;
}

// ── 内容包安装状态：tool → 已装版本号 ──
export interface InstalledMap {
  [pkgId: string]: string;
}
export function useInstalledPackages() {
  const [installed, setInstalled] = usePersistentState<InstalledMap>(K.installed, {});
  // 初始从真实壳端拉已装内容包（list_installed → {package_id: package_version}）
  useEffect(() => {
    void api
      .listInstalled()
      .then((pkgs) =>
        setInstalled(
          Object.fromEntries(pkgs.map((p) => [p.package_id, p.package_version])),
        ),
      )
      .catch(() => { /* 未登录/离线：保持本地状态，下载中心自会提示 */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const markInstalled = useCallback(
    (id: string, version: string) =>
      setInstalled((m) => ({ ...m, [id]: version })),
    [setInstalled],
  );
  return { installed, markInstalled, setInstalled };
}

// ── 工具箱本地快捷方式（唯一本地业务状态；真实源 = 壳端 toolbox.json，localStorage 仅作离线兜底）──
export function useShortcuts() {
  const [shortcuts, setShortcuts] = usePersistentState<ToolShortcut[]>(
    K.shortcuts,
    [],
  );
  // 初始从真实壳端拉（toolbox_list → ToolboxShortcut[]，字段对齐）
  useEffect(() => {
    void api
      .toolboxList()
      .then((db) =>
        setShortcuts(
          db.shortcuts.map((s) => ({
            tool_id: s.tool_id,
            path: s.path,
            pinned: s.pinned,
            last_used: s.last_used || null,
            source: s.source,
            external_name: s.external_name ?? undefined,
          })),
        ),
      )
      .catch(() => { /* 未初始化：保持本地状态 */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upsert = useCallback(
    (next: ToolShortcut[]) => setShortcuts(next),
    [setShortcuts],
  );

  /** 下载完成 → 自动生成本地快捷方式（后端 toolbox_download 已落盘 + 生成，此处仅同步 UI） */
  const addDownloaded = useCallback(
    (toolId: string, path: string) =>
      setShortcuts((list) =>
        list.some((s) => s.tool_id === toolId)
          ? list
          : [...list, { tool_id: toolId, path, pinned: false, last_used: null, source: "download" }],
      ),
    [setShortcuts],
  );

  const togglePin = useCallback(
    (toolId: string) => {
      const target = shortcuts.find((s) => s.tool_id === toolId);
      if (!target) {
        // 未下载也可先收藏（清单可达时展示信息）——本地乐观 + 后端无记录（UI 态）
        setShortcuts((list) => [
          ...list,
          { tool_id: toolId, path: "", pinned: true, last_used: null, source: "manual" },
        ]);
        return;
      }
      const next = !target.pinned;
      void api.toolboxSetPinned(toolId, next).then((db) =>
        setShortcuts(
          db.shortcuts.map((s) => ({
            tool_id: s.tool_id,
            path: s.path,
            pinned: s.pinned,
            last_used: s.last_used || null,
            source: s.source,
            external_name: s.external_name ?? undefined,
          })),
        ),
      ).catch(() => { /* 后端失败：保持本地乐观态 */ });
      // 乐观更新
      setShortcuts((list) =>
        list.map((s) => (s.tool_id === toolId ? { ...s, pinned: next } : s)),
      );
    },
    [shortcuts, setShortcuts],
  );

  /** 成功启动 → 后端 toolbox_launch 更新 last_used + LRU 置顶（上限 10） */
  const markUsed = useCallback(
    (toolId: string) => {
      void api.toolboxLaunch(toolId).then((db) =>
        setShortcuts(
          db.shortcuts.map((s) => ({
            tool_id: s.tool_id,
            path: s.path,
            pinned: s.pinned,
            last_used: s.last_used || null,
            source: s.source,
            external_name: s.external_name ?? undefined,
          })),
        ),
      ).catch(() => { /* 启动失败：保持本地状态 */ });
      // 乐观 LRU 置顶
      setShortcuts((list) => {
        const rest = list.filter((s) => s.tool_id !== toolId);
        const target = list.find((s) => s.tool_id === toolId);
        if (!target) return list;
        const used: ToolShortcut = { ...target, last_used: new Date().toISOString() };
        const head = [used, ...rest];
        return head.slice(0, Math.max(10, head.filter((s) => s.pinned).length));
      });
    },
    [setShortcuts],
  );

  const remove = useCallback(
    (toolId: string) => setShortcuts((list) => list.filter((s) => s.tool_id !== toolId)),
    [setShortcuts],
  );

  return { shortcuts, setShortcuts: upsert, addDownloaded, togglePin, markUsed, remove };
}

// ── 启动中心：网址收藏 CRUD ──
export function useBookmarks() {
  return usePersistentState<Bookmark[]>(K.bookmarks, MOCK_BOOKMARK_BASELINE);
}

// ── 下载中心·原版教材：本机教材目录导入项（不提供云端下载，随工具包打包）──
export function useLocalTextbooks() {
  return usePersistentState<LocalTextbook[]>(K.textbooks, MOCK_TEXTBOOK_BASELINE);
}

// ── 启动中心：最近使用（跨易教/外部工具，LRU 上限 10）──
const LAUNCH_LRU_MAX = 10;
export function useLaunchRecent() {
  const [recent, setRecent] = usePersistentState<LaunchRecentItem[]>(K.launchRecent, []);
  const markLaunch = useCallback(
    (key: string, name: string) =>
      setRecent((list) => {
        const item: LaunchRecentItem = { key, name, at: new Date().toISOString() };
        return [item, ...list.filter((r) => r.key !== key)].slice(0, LAUNCH_LRU_MAX);
      }),
    [setRecent],
  );
  return { recent, markLaunch, setRecent };
}

// ── 一键启动配置：条目图标/菜单名/双通道钉选（种子含内置「一键开课」钉选项）──
export function useLaunchConfig() {
  const [configs, setConfigs] = usePersistentState<LaunchConfigMap>(K.launchConfig, QUICKSTART_PIN_SEED);
  // 一次性清洗：历史种子给内置 view 条目写入过 iconKind/iconText，会让侧栏菜单项显示大色块；
  // 用户若未自行改过图标则清除该字段，使其回退为与其它导航项一致的矢量图标。
  useEffect(() => {
    if (window.localStorage.getItem(LAUNCH_ICON_SEED_MIGRATION_KEY)) return;
    try {
      window.localStorage.setItem(LAUNCH_ICON_SEED_MIGRATION_KEY, "1");
    } catch {
      /* 隐私模式下仅本次会话内生效 */
    }
    setConfigs((m) => {
      let changed = false;
      const next: LaunchConfigMap = {};
      for (const [id, c] of Object.entries(m)) {
        if (LEGACY_SEED_ICON_IDS.includes(id as (typeof LEGACY_SEED_ICON_IDS)[number]) && (c.iconKind || c.iconText)) {
          const { iconKind: _k, iconText: _t, ...rest } = c;
          next[id] = rest;
          changed = true;
        } else {
          next[id] = c;
        }
      }
      return changed ? next : m;
    });
  }, [setConfigs]);
  /** 局部合并写入某条目的配置；传 null 语义字段由调用方保证 */
  const patchConfig = useCallback(
    (itemId: string, patch: LaunchConfigMap[string]) =>
      setConfigs((m) => ({ ...m, [itemId]: { ...m[itemId], ...patch } })),
    [setConfigs],
  );
  return { configs, setConfigs, patchConfig };
}

// ── 分组配置：组名可改、条目可隐藏出侧栏 ──
export function useNavGroups() {
  return usePersistentState<NavGroupConfig>(K.navGroups, {});
}

// ── 通知中心：本地事件流（下载完成/钉选上限/条目失效等），FIFO 上限 50 ──
const NOTIFY_MAX = 50;
export function useNotifications() {
  const [items, setItems] = usePersistentState<Notification[]>(K.notifyItems, []);
  /** 追加一条通知；kind=warn 用于拦截与失效提醒 */
  const push = useCallback(
    (n: Omit<Notification, "id" | "at" | "read">) =>
      setItems((list) => {
        const item: Notification = {
          ...n,
          id: `nt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          at: new Date().toISOString(),
          read: false,
        };
        return [item, ...list].slice(0, NOTIFY_MAX);
      }),
    [setItems],
  );
  const markAllRead = useCallback(
    () => setItems((list) => (list.every((i) => i.read) ? list : list.map((i) => ({ ...i, read: true })))),
    [setItems],
  );
  const removeOne = useCallback(
    (id: string) => setItems((list) => list.filter((i) => i.id !== id)),
    [setItems],
  );
  const clearAll = useCallback(() => setItems([]), [setItems]);
  const unread = items.reduce((acc, i) => acc + (i.read ? 0 : 1), 0);
  return { items, push, markAllRead, removeOne, clearAll, unread };
}

// ── 下载任务（并发队列 + 进度模拟；已完成写入持久化历史，刷新后仍可见）──
export interface TaskMap {
  [id: string]: DownloadTask;
}
const DOWNLOAD_CONCURRENCY = 3;
const HISTORY_MAX = 60;

export function useDownloadTasks() {
  const [tasks, setTasks] = useState<TaskMap>({});
  const [meta, setMeta] = useState<Record<string, ActiveDownload>>({});
  const [history, setHistory] = usePersistentState<DownloadHistoryItem[]>(K.downloadHistory, []);
  const queueRef = useRef<{ id: string; onDone: (id: string) => void }[]>([]);
  const runningRef = useRef(0);

  /** 从队列取任务开跑，跑完补位（并发上限 3，其余排队）*/
  const pump = useCallback(() => {
    while (runningRef.current < DOWNLOAD_CONCURRENCY && queueRef.current.length > 0) {
      const job = queueRef.current.shift()!;
      const id = job.id;
      runningRef.current += 1;
      setMeta((m) => (m[id] ? { ...m, [id]: { ...m[id], queued: false } } : m));
      // 视觉反馈：模拟进度递增（真实 Tauri 命令无逐字节回调）；命令完成即置 100
      setTasks((t) => ({ ...t, [id]: { id, progress: 5, done: false } }));
      const tick = setInterval(() => {
        setTasks((prev) => {
          const cur = prev[id];
          if (!cur || cur.done) return prev;
          const next = Math.min(92, cur.progress + 6 + Math.random() * 8);
          return { ...prev, [id]: { id, progress: next, done: false } };
        });
      }, 260);

      void (async () => {
        try {
          if (id.startsWith("tb:")) {
            await api.toolboxDownload(id.slice(3));
          } else {
            // 内容包：从清单取最新版本下载
            const list = await api.storeListAvailable();
            const pkg = list.packages.find((p) => p.package_id === id);
            if (!pkg) throw new Error("清单中无该内容包");
            await api.storeDownload(id, pkg.package_version);
          }
          // 完成：置 100 → 写历史 → 摘除 → 回调 → 补位
          clearInterval(tick);
          setTasks((t) => ({ ...t, [id]: { id, progress: 100, done: true } }));
          const info2 = metaRef.current[id];
          setHistory((h) => {
            const item: DownloadHistoryItem = {
              id,
              name: info2?.name ?? id,
              kind: info2?.kind ?? "pkg",
              at: new Date().toISOString(),
            };
            return [item, ...h.filter((x) => x.id !== id)].slice(0, HISTORY_MAX);
          });
          window.setTimeout(() => {
            setTasks((p) => {
              const c = { ...p };
              delete c[id];
              return c;
            });
            setMeta((m) => {
              const c = { ...m };
              delete c[id];
              return c;
            });
            runningRef.current -= 1;
            job.onDone(id);
            pump();
          }, 500);
        } catch (e) {
          // 失败：清任务 + 提示（保持 running 计数准确）
          clearInterval(tick);
          runningRef.current -= 1;
          setTasks((p) => {
            const c = { ...p };
            delete c[id];
            return c;
          });
          setMeta((m) => {
            const c = { ...m };
            delete c[id];
            return c;
          });
          console.warn(`[download] ${id} 失败`, e);
          job.onDone(id);
          pump();
        }
      })();
    }
  }, [setHistory, setTasks, setMeta]);

  const metaRef = useRef<Record<string, ActiveDownload>>({});
  metaRef.current = meta;

  /** 发起下载：登记名称/类型元信息 → 入队 → 满 3 个则标记为等待中 */
  const start = useCallback(
    (
      id: string,
      onDone: (id: string) => void,
      info?: { name?: string; kind?: DownloadKind },
    ) => {
      if (tasks[id] || queueRef.current.some((q) => q.id === id)) return;
      setMeta((m) => ({
        ...m,
        [id]: {
          id,
          name: info?.name ?? id,
          kind: info?.kind ?? "pkg",
          queued: runningRef.current >= DOWNLOAD_CONCURRENCY,
        },
      }));
      queueRef.current.push({ id, onDone });
      pump();
    },
    [tasks, pump],
  );

  /** 活动任务列表（含排队态与实时进度），供顶栏面板与下载中心「任务」分区共用 */
  const activeList = useMemo(
    () =>
      Object.values(meta).map((m) => ({
        ...m,
        queued: !tasks[m.id],
        progress: tasks[m.id]?.progress ?? 0,
      })),
    [meta, tasks],
  );

  const clearHistory = useCallback(() => setHistory([]), [setHistory]);

  return { tasks, start, history, clearHistory, activeList };
}
