// 下载中心（R03 §3 演进）：任务 / 内容（按学科分类）/ 工具（按类型分类）/ 原版教材（本机目录导入）四分区 Tab
// + 子分类 chips + tag chips + 卡片三态 + 待办总览（需下载/缺数据/数据有更新/有更新 + 一键批量）
// + D11 §6 素材归档（下载目录监视确认后归档的课件素材清单 + 撤销）
import { useCallback, useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  Archive,
  CircleCheck,
  Download,
  FolderInput,
  Hash,
  Inbox,
  ListChecks,
  Loader,
  Lock,
  Package,
  RefreshCw,
  PackageOpen,
  RotateCcw,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api, ArchiveEntry } from "@/api";
import { friendlyErr } from "@/errutil";
import { EDU_TOOLS } from "@/lib/eduTools";
import { formatBytes, relativeTime } from "@/lib/format";
import type { ActiveDownloadView } from "@/components/TopBar";
import type { InstalledMap } from "@/lib/store";
import type { DownloadHistoryItem, DownloadKind, LocalTextbook, Notification, StoreItem, ToolboxManifest } from "@/lib/types";
import { TextbookSection } from "@/components/TextbookSection";

type Section = "tasks" | "content" | "tool" | "textbook" | "archive";

/** startDownload 的可选元信息（顶栏下载面板展示名称与类型用） */
export type StartDownload = (
  id: string,
  onDone: (id: string) => void,
  info?: { name?: string; kind?: DownloadKind },
) => void;

/** 内容区按学科归类：categories 末位为学科；无 categories 的存量包归「综合」 */
const SUBJECTS = ["英语", "语文", "数学", "科学", "综合"] as const;
/** 工具区按类型归类：取除 "工具" 标记外的标签 */
function toolTypeOf(item: StoreItem): string {
  return item.categories?.find((c) => c !== "工具") ?? "其他";
}

interface Props {
  loggedIn: boolean;
  installed: InstalledMap;
  onInstalled: (id: string, version: string) => void;
  tasks: Record<string, { progress: number; done: boolean }>;
  startDownload: StartDownload;
  /** 外部工具下载完成 → 生成快捷方式（总览「需下载」含推荐工具） */
  addDownloaded?: (toolId: string, path: string) => void;
  /** 通知中心：下载完成事件写入 */
  notify?: (n: Omit<Notification, "id" | "at" | "read">) => void;
  /** 原版教材：本机目录导入项（持久化态由上层 store hook 提供） */
  textbooks: LocalTextbook[];
  onTextbooks: (next: LocalTextbook[]) => void;
  /** 「任务」分区：正在下载 / 等待中 */
  activeDownloads: ActiveDownloadView[];
  /** 「任务」分区：已下载历史 */
  downloadHistory: DownloadHistoryItem[];
  /** 清空已下载历史 */
  onClearHistory: () => void;
  /** 外部要求直达「任务」分区（顶栏下载面板 → 前往下载中心） */
  showTasks: boolean;
  /** 已消费 showTasks 信号 */
  onShowTasksHandled: () => void;
}

/** 分区规则：categories 含 "工具" → 工具区；缺省/不含 → 内容区（向后兼容） */
function sectionOf(item: StoreItem): Exclude<Section, "tasks" | "textbook"> {
  return item.categories?.includes("工具") ? "tool" : "content";
}

function subjectOf(item: StoreItem): string {
  const last = item.categories?.[item.categories.length - 1];
  return last && (SUBJECTS as readonly string[]).includes(last) ? last : "综合";
}

function semverLt(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

export function DownloadExtView({ loggedIn, installed, onInstalled, tasks, startDownload, addDownloaded, notify, textbooks, onTextbooks, activeDownloads, downloadHistory, onClearHistory, showTasks, onShowTasksHandled }: Props) {
  const [section, setSection] = useState<Section>("content");
  const [filter, setFilter] = useState<string>("全部");
  const [tag, setTag] = useState<string>("全部");
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");

  // 顶栏「前往下载中心」→ 直达任务分区（下载中 / 等待中 / 已下载）
  useEffect(() => {
    if (!showTasks) return;
    setSection("tasks");
    onShowTasksHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTasks]);

  // 从 U 盘导入内容包 zip：选文件 → store_import_usb（Rust 解压 + 校验 + 签名）→ 更新已装表
  const importUsb = useCallback(async () => {
    const picked = await open({ directory: false, multiple: false, filters: [{ name: "内容包", extensions: ["zip"] }] });
    if (!picked) return; // 用户取消
    try {
      const pkg = await api.storeImportUsb(picked as string);
      onInstalled(pkg.package_id, pkg.package_version);
      toast.success(`已导入「${pkg.display_name}」`, { description: "签名校验通过，已装入本机内容包目录" });
      notify?.({ kind: "success", title: `内容包已导入：${pkg.display_name}`, body: "来自 U 盘导入" });
    } catch (e) {
      toast.error("导入失败", { description: friendlyErr(e) });
    }
  }, [onInstalled, notify]);

  const [packages, setPackages] = useState<StoreItem[]>([]);
  // 工具清单：真实拉取（与 ToolboxPanel 同源，待办总览「需下载工具」与批量下载用）
  const [toolbox, setToolbox] = useState<ToolboxManifest | null>(null);
  useEffect(() => {
    void api
      .toolboxManifest()
      .then(setToolbox)
      .catch(() => { /* 清单不可达：待办总览工具项降级为空 */ });
  }, []);
  // D11 §6 素材归档：已归档索引清单（P3 · archive_list 真实拉取）
  const [archives, setArchives] = useState<ArchiveEntry[]>([]);
  const refreshArchives = useCallback(() => {
    void api
      .archiveList()
      .then(setArchives)
      .catch(() => setArchives([]));
  }, []);
  useEffect(() => {
    refreshArchives();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const items: StoreItem[] = useMemo(() => {
    return packages.map((p) => {
      const instVer = installed[p.id];
      return {
        ...p,
        categories: p.categories ?? [],
        installed: Boolean(instVer),
        latest_version: p.version,
        updatable: Boolean(instVer) && semverLt(instVer, p.version),
      };
    });
  }, [packages, installed]);

  const counts = useMemo(
    () => ({
      content: items.filter((i) => sectionOf(i) === "content").length,
      tool: items.filter((i) => sectionOf(i) === "tool").length,
      textbook: textbooks.length,
      archive: archives.length,
    }),
    [items, textbooks, archives],
  );

  // 当前分区的子分类 chips：内容=学科，工具=类型（原版教材区自带学科筛选，不走此处）
  const chips = useMemo(() => {
    const pool = items.filter((i) => sectionOf(i) === section);
    if (section === "content") {
      const used = new Set(pool.map(subjectOf));
      return ["全部", ...SUBJECTS.filter((s) => used.has(s))];
    }
    const types: string[] = [];
    for (const i of pool) {
      const t = toolTypeOf(i);
      if (!types.includes(t)) types.push(t);
    }
    return ["全部", ...types];
  }, [items, section]);

  // tag 全集：收集当前分区所有出现过的 categories 标签
  const allTags = useMemo(() => {
    const pool = items.filter((i) => sectionOf(i) === section);
    const out: string[] = [];
    for (const i of pool) for (const c of i.categories ?? []) if (!out.includes(c)) out.push(c);
    return out;
  }, [items, section]);

  const visible = useMemo(() => {
    const pool = items.filter((i) => sectionOf(i) === section);
    const byCat =
      filter === "全部"
        ? pool
        : pool.filter((i) => (section === "content" ? subjectOf(i) === filter : toolTypeOf(i) === filter));
    if (tag === "全部") return byCat;
    return byCat.filter((i) => i.categories?.includes(tag));
  }, [items, section, filter, tag]);

  // 清单拉取：真实 invoke store_list_available（壳端字段 package_id/package_version/
  // update_available → 设计源 StoreItem id/version/updatable/latest_version）
  const refresh = () => {
    setPhase("loading");
    void api
      .storeListAvailable()
      .then((list) => {
        setPackages(
          list.packages.map(
            (p: import("@/api").StoreItem) => ({
              id: p.package_id,
              name: p.name,
              version: p.package_version,
              package_type: p.package_type as "app" | "data",
              size_bytes: p.size_bytes ?? 0,
              download_url: p.download_url ?? "",
              checksum: p.checksum ?? "",
              updated_at: list.updated_at,
              categories: p.categories,
              description: p.description ?? undefined,
              installed: p.installed,
              latest_version: p.package_version,
              updatable: p.update_available,
            }),
          ),
        );
        setPhase("ready");
      })
      .catch(() => setPhase("error"));
  };
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchSection = (s: Section) => {
    setSection(s);
    setFilter("全部");
    setTag("全部");
  };

  // 「任务」分区：下载中 / 等待中 / 已下载（顶栏面板点「前往下载中心」直达）
  const running = activeDownloads.filter((a) => !a.queued);
  const waiting = activeDownloads.filter((a) => a.queued);

  const handleDownload = (item: StoreItem) => {
    if (!loggedIn) {
      toast.error("请先登录后再下载");
      return;
    }
    startDownload(item.id, (id) => {
      onInstalled(id, item.version);
      toast.success(`「${item.name}」下载完成并已安装`);
      notify?.({ kind: "success", title: `「${item.name}」下载完成`, body: "内容包已安装到本机，可立即使用。" });
    }, { name: item.name, kind: "pkg" });
  };

  // ── 待办总览：需下载 / 缺数据 / 数据有更新 / 有更新 ──
  const todo = useMemo(() => {
    const needPkg = items.filter((i) => !i.installed && i.package_type === "data" && (i.categories?.length ?? 0) > 0);
    const needTool = (toolbox?.tools ?? []).filter((t) => t.recommend && t.download_url);
    const missingData = EDU_TOOLS.filter((t) => t.requiresPkgId && !installed[t.requiresPkgId]);
    const dataUpdatable = items.filter((i) => i.updatable && i.package_type === "data");
    const appUpdatable = items.filter((i) => i.updatable && i.package_type === "app");
    return { needPkg, needTool, missingData, dataUpdatable, appUpdatable };
  }, [items, installed, toolbox]);

  const batch = (list: { id: string; name: string; version: string }[], kind: "pkg" | "tool") => {
    if (!loggedIn) {
      toast.error("请先登录后再下载");
      return;
    }
    for (const x of list) {
      if (kind === "pkg") {
        startDownload(x.id, (id) => {
          onInstalled(id, x.version);
          toast.success(`「${x.name}」下载完成并已安装`);
          notify?.({ kind: "success", title: `「${x.name}」下载完成`, body: "内容包已安装到本机，可立即使用。" });
        }, { name: x.name, kind: "pkg" });
      } else {
        const t = (toolbox?.tools ?? []).find((m) => m.id === x.id);
        if (!t) return; // 清单未含该工具：跳过（R6 防 .find()! 运行期炸）
        startDownload(`tb:${t.id}`, (id) => {
          addDownloaded?.(id.replace("tb:", ""), `toolbox/${t.id}/${t.entry}`);
          toast.success(`「${t.name}」已下载到工具目录`);
          notify?.({ kind: "success", title: `「${t.name}」下载完成`, body: "已生成本机快捷方式，出现在启动中心外部工具区。" });
        }, { name: t.name, kind: "tool" });
      }
    }
    toast.info(`已加入 ${list.length} 个下载任务`, { description: "进度见下方卡片，完成后自动安装。" });
  };

  const busyCount = Object.keys(tasks).length;

  return (
    <div className="flex h-full flex-col">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3.5 max-md:px-4">
        {/* 分区 Tab（带数量徽标） */}
        <div role="tablist" aria-label="下载中心分区" className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {(
            [
              { key: "tasks", label: "任务", n: activeDownloads.length },
              { key: "content", label: "内容", n: counts.content },
              { key: "tool", label: "工具", n: counts.tool },
              { key: "textbook", label: "原版教材", n: counts.textbook },
              { key: "archive", label: "素材归档", n: counts.archive },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={section === t.key}
              className={cn(
                "flex min-h-9 items-center gap-1.5 rounded-md px-3.5 text-[13px] transition-colors",
                section === t.key
                  ? "bg-card font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => switchSection(t.key)}
            >
              {t.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] tabular-nums",
                  section === t.key ? "bg-brand-soft text-brand" : "bg-secondary text-secondary-foreground",
                )}
              >
                {t.n}
              </span>
            </button>
          ))}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-card px-3 text-[13px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            onClick={refresh}
            disabled={phase === "loading"}
          >
            <RefreshCw size={13} aria-hidden className={phase === "loading" ? "animate-spin" : ""} />
            刷新
          </button>
          <button
            type="button"
            className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-card px-3 text-[13px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            onClick={importUsb}
          >
            <FolderInput size={13} aria-hidden />从 U 盘导入…
          </button>
        </div>
      </div>

      {/* 未登录 banner */}
      {!loggedIn && (
        <div className="banner print-hide mx-6 mt-3 flex items-center gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3.5 py-2.5 text-[13px] text-foreground max-md:mx-4">
          <Lock size={14} aria-hidden className="shrink-0 text-warn" />
          登录后即可下载与更新内容和工具。
          <span className="ml-auto whitespace-nowrap text-[12px] text-muted-foreground">
            点右上角头像菜单 →「去登录（模拟）」
          </span>
        </div>
      )}

      {/* 主体 */}
      <div className="flex-1 overflow-y-auto px-6 py-4 max-md:px-4">
        {phase === "loading" && <SkeletonGrid />}

        {phase === "error" && <ErrorState onRetry={refresh} />}

        {phase === "ready" && section === "textbook" && (
          <TextbookSection items={textbooks} onItems={onTextbooks} />
        )}

        {section === "archive" && (
          <ArchiveSection entries={archives} onRefresh={refreshArchives} />
        )}

        {section === "tasks" && (
          <TasksSection
            running={running}
            waiting={waiting}
            history={downloadHistory}
            onClearHistory={onClearHistory}
            onBrowse={() => switchSection("content")}
          />
        )}

        {phase === "ready" && (section === "content" || section === "tool") && (
          <>
            {/* 待办总览：需下载 / 缺数据 / 数据有更新 / 有更新 */}
            <section aria-labelledby="dl-todo" className="mb-5 rounded-xl border border-border bg-muted/30 p-3.5">
              <div className="mb-2.5 flex items-center gap-2">
                <h2 id="dl-todo" className="font-display text-[13px] font-bold tracking-wide">待办总览</h2>
                {busyCount > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
                    <RefreshCw size={10} aria-hidden className="animate-spin" />{busyCount} 个任务进行中
                  </span>
                )}
                <span className="ml-auto text-[11px] text-muted-foreground">按本机安装状态实时统计</span>
              </div>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <TodoBlock
                  title="需下载"
                  n={todo.needPkg.length + todo.needTool.length}
                  note="推荐工具与教材数据包尚未获取"
                  actionLabel="一键下载"
                  disabled={todo.needPkg.length + todo.needTool.length === 0}
                  onAction={() => {
                    batch(todo.needPkg, "pkg");
                    batch(todo.needTool.map((t) => ({ id: t.id, name: t.name, version: "—" })), "tool");
                  }}
                />
                <TodoBlock
                  title="缺数据"
                  n={todo.missingData.length}
                  note={todo.missingData.map((t) => t.name).join("、") || "易教工具配套齐全"}
                  actionLabel="一键补全"
                  disabled={todo.missingData.length === 0}
                  onAction={() =>
                    batch(
                      todo.missingData.flatMap((t) => {
                        const p = items.find((i) => i.id === t.requiresPkgId);
                        return p ? [{ id: p.id, name: p.name, version: p.version }] : [];
                      }),
                      "pkg",
                    )
                  }
                />
                <TodoBlock
                  title="数据有更新"
                  n={todo.dataUpdatable.length}
                  note="已装数据包可升级到新版本"
                  actionLabel="一键更新"
                  disabled={todo.dataUpdatable.length === 0}
                  onAction={() => batch(todo.dataUpdatable, "pkg")}
                />
                <TodoBlock
                  title="有更新"
                  n={todo.appUpdatable.length}
                  note="离线应用类内容包可升级"
                  actionLabel="一键更新"
                  disabled={todo.appUpdatable.length === 0}
                  onAction={() => batch(todo.appUpdatable, "pkg")}
                />
              </div>
            </section>

            {/* 分类 chips：内容=学科 / 工具=类型 */}
            <div
              className="mb-2 flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label={section === "content" ? "按学科筛选" : "按工具类型筛选"}
            >
              <span className="mr-0.5 text-[12px] text-muted-foreground">
                {section === "content" ? "学科" : "类型"}
              </span>
              {chips.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={filter === c}
                  onClick={() => setFilter(c)}
                  className={cn(
                    "min-h-8 rounded-full border px-3 text-[12px] transition-colors",
                    filter === c
                      ? "border-brand bg-brand-soft font-medium text-brand"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* tag chips：收集自当前分区所有标签，可与分类叠加 */}
            {allTags.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="按标签筛选">
                <span className="mr-0.5 flex items-center gap-1 text-[12px] text-muted-foreground">
                  <Hash size={11} aria-hidden />标签
                </span>
                {["全部", ...allTags].map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={tag === t}
                    onClick={() => setTag(t)}
                    className={cn(
                      "min-h-7 rounded-full border px-2.5 text-[12px] transition-colors",
                      tag === t
                        ? "border-brand bg-brand-soft font-medium text-brand"
                        : "border-dashed border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}

            {visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-24 text-muted-foreground">
                <Inbox size={28} aria-hidden className="opacity-50" />
                <p className="text-[13px]">没有符合筛选条件的内容</p>
                {(filter !== "全部" || tag !== "全部") && (
                  <button
                    type="button"
                    className="min-h-8 rounded-md border border-input bg-card px-3 text-[12px] transition-colors hover:bg-accent"
                    onClick={() => {
                      setFilter("全部");
                      setTag("全部");
                    }}
                  >
                    清空筛选
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {visible.map((item) => (
                  <PkgCard
                    key={item.id}
                    item={item}
                    task={tasks[item.id]}
                    loggedIn={loggedIn}
                    onDownload={() => handleDownload(item)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** 任务分区：下载中 / 等待中 / 已下载历史（与顶栏下载面板同源） */
function TasksSection({
  running,
  waiting,
  history,
  onClearHistory,
  onBrowse,
}: {
  running: ActiveDownloadView[];
  waiting: ActiveDownloadView[];
  history: DownloadHistoryItem[];
  onClearHistory: () => void;
  onBrowse: () => void;
}) {
  const active = [...running, ...waiting];
  return (
    <div className="space-y-5">
      <section aria-labelledby="dl-active" className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <ListChecks size={14} aria-hidden className="text-brand" />
          <h2 id="dl-active" className="font-display text-[13px] font-bold tracking-wide">
            下载中 / 等待中
          </h2>
          <span className="text-[11px] tabular-nums text-muted-foreground">{active.length} 个</span>
          <span className="ml-auto text-[11px] text-muted-foreground">最多同时 3 个任务，其余排队</span>
        </div>
        {active.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
            <Package size={24} aria-hidden className="opacity-50" />
            <p className="text-[13px]">当前没有进行中的下载任务。</p>
            <button
              type="button"
              className="min-h-8 rounded-md border border-input bg-card px-3 text-[12px] transition-colors hover:bg-accent"
              onClick={onBrowse}
            >
              去「内容」挑点东西下载
            </button>
          </div>
        ) : (
          <ul role="list" className="divide-y divide-border">
            {active.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  {a.kind === "tool" ? <Wrench size={14} aria-hidden /> : <Package size={14} aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium" title={a.name}>
                    {a.name}
                  </span>
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn("block h-full rounded-full transition-[width] duration-200", a.queued ? "bg-muted-foreground/40" : "bg-brand")}
                      style={{ width: `${a.queued ? 0 : Math.round(a.progress)}%` }}
                    />
                  </span>
                </span>
                <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                  {a.queued ? "等待中" : `${Math.round(a.progress)}%`}
                </span>
                {!a.queued && <Loader size={12} aria-hidden className="shrink-0 animate-spin text-brand" />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="dl-history" className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <CircleCheck size={14} aria-hidden className="text-ok" />
          <h2 id="dl-history" className="font-display text-[13px] font-bold tracking-wide">
            已下载
          </h2>
          <span className="text-[11px] tabular-nums text-muted-foreground">{history.length} 条</span>
          <button
            type="button"
            disabled={history.length === 0}
            className="ml-auto flex h-7 items-center gap-1 rounded px-2 text-[11px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
            onClick={onClearHistory}
          >
            <Trash2 size={11} aria-hidden />清空记录
          </button>
        </div>
        {history.length === 0 ? (
          <p className="py-8 text-center text-[12px] leading-relaxed text-muted-foreground">
            暂无下载记录。完成一次下载后，这里会保留最近 60 条。
          </p>
        ) : (
          <ul role="list" className="divide-y divide-border">
            {history.map((h) => (
              <li key={`${h.id}-${h.at}`} className="flex items-center gap-3 py-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  {h.kind === "tool" ? <Wrench size={14} aria-hidden /> : <Package size={14} aria-hidden />}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px]" title={h.name}>
                  {h.name}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{relativeTime(h.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** D11 §6 素材归档：已归档清单 + 撤销（archives/<学科>/<版本>/<年级册次>/，拷贝留原件） */
function ArchiveSection({ entries, onRefresh }: { entries: ArchiveEntry[]; onRefresh: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const undo = (entry: ArchiveEntry) => {
    setBusyId(entry.id);
    void api
      .archiveUndo(entry.id)
      .then(() => {
        toast.success(`已撤销归档：${entry.name}`, {
          description: "源文件仍在浏览器下载目录，可重新整理。",
        });
        onRefresh();
      })
      .catch((e) => toast.error("撤销失败", { description: friendlyErr(e) }))
      .finally(() => setBusyId(null));
  };

  return (
    <div className="space-y-5">
      <section aria-labelledby="dl-archive" className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Archive size={14} aria-hidden className="text-brand" />
          <h2 id="dl-archive" className="font-display text-[13px] font-bold tracking-wide">素材归档</h2>
          <span className="text-[11px] tabular-nums text-muted-foreground">{entries.length} 项</span>
          <button
            type="button"
            className="ml-auto flex h-7 items-center gap-1 rounded px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent"
            onClick={onRefresh}
          >
            <RefreshCw size={11} aria-hidden />刷新
          </button>
        </div>

        <p className="mb-3 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-[11.5px] leading-relaxed text-muted-foreground">
          归档的教材/课件资料仅供个人教学和学习使用，请勿对外分发。归档为副本，源文件保留在浏览器下载目录。
        </p>

        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <Archive size={24} aria-hidden className="opacity-50" />
            <p className="text-[13px]">还没有归档素材。</p>
            <p className="text-[11.5px] text-muted-foreground/80">
              在浏览器下载教材/课件后，客户端检测到新下载会弹出确认卡片，确认后自动归档到这里。
            </p>
          </div>
        ) : (
          <ul role="list" className="divide-y divide-border">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <Archive size={14} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium" title={e.name}>{e.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground" title={e.rel}>
                    {e.subject}·{e.version}·{e.grade}{e.volume} · {formatBytes(e.size_bytes)}
                  </span>
                </span>
                <span className="shrink-0 text-[10.5px] tabular-nums text-muted-foreground">{relativeTime(e.at)}</span>
                <button
                  type="button"
                  disabled={busyId === e.id}
                  title="撤销归档（保留下载目录源文件）"
                  aria-label={`撤销归档 ${e.name}`}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md border border-input bg-card text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-45"
                  onClick={() => undo(e)}
                >
                  {busyId === e.id ? <Loader size={12} aria-hidden className="animate-spin" /> : <RotateCcw size={12} aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-label="加载中">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-40 animate-pulse rounded-xl border border-border bg-muted/60" />
      ))}
    </div>
  );
}

/** 待办总览块：计数 + 说明 + 一键动作（图标化小按钮，借鉴 1Panel） */
function TodoBlock({
  title,
  n,
  note,
  actionLabel,
  disabled,
  onAction,
}: {
  title: string;
  n: number;
  note: string;
  actionLabel: string;
  disabled: boolean;
  onAction: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[12px] font-medium text-muted-foreground">{title}</span>
          <span className={cn("font-display text-[18px] font-bold tabular-nums", n > 0 ? "text-warn" : "text-ok")}>{n}</span>
        </div>
        <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground" title={note}>{note}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        title={actionLabel}
        aria-label={`${title}：${actionLabel}`}
        className="flex size-7 shrink-0 items-center justify-center rounded-md border border-input bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
        onClick={onAction}
      >
        <Download size={12} aria-hidden />
      </button>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <AlertTriangle size={28} aria-hidden className="text-destructive" />
      <p className="text-[13px] text-muted-foreground">清单拉取失败，请检查网络后重试。</p>
      <button
        type="button"
        className="min-h-9 rounded-md bg-primary px-4 text-[13px] text-primary-foreground transition-opacity hover:opacity-90"
        onClick={onRetry}
      >
        重试
      </button>
    </div>
  );
}

function PkgCard({
  item,
  task,
  loggedIn,
  onDownload,
}: {
  item: StoreItem;
  task?: { progress: number; done: boolean };
  loggedIn: boolean;
  onDownload: () => void;
}) {
  const isTool = sectionOf(item) === "tool";
  return (
    <article className="group flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
          {isTool ? <Wrench size={16} aria-hidden /> : <PackageOpen size={17} aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-semibold leading-snug" title={item.name}>
            {item.name}
          </h3>
          <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
            v{item.installed ? item.latest_version : item.version} · {formatBytes(item.size_bytes)} ·{" "}
            {item.package_type === "app" ? "离线应用" : "数据包"}
          </p>
        </div>
        {item.updatable && (
          <span className="shrink-0 rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-medium text-warn">
            可更新
          </span>
        )}
        {item.installed && !item.updatable && (
          <span className="shrink-0 rounded-full bg-ok/12 px-2 py-0.5 text-[11px] font-medium text-ok">
            已装
          </span>
        )}
      </div>

      <p className="mt-2 line-clamp-2 min-h-8 text-[12px] leading-relaxed text-muted-foreground">
        {item.description}
      </p>

      {(item.categories?.length ?? 0) > 0 && (
        <div className="store-tags mt-2 flex flex-wrap gap-1">
          {item.categories?.map((c) => (
            <span key={c} className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">
              {c}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center gap-2 pt-3">
        {task ? (
          <div className="flex-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="progress-stripes h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${task.progress}%` }}
              />
            </div>
            <p className="mt-1 text-right text-[11px] tabular-nums text-muted-foreground">
              下载中 {Math.round(task.progress)}%
            </p>
          </div>
        ) : item.installed && !item.updatable ? (
          <button
            type="button"
            disabled
            className="min-h-8 w-full cursor-default rounded-md border border-border bg-muted/50 text-[12px] text-muted-foreground"
          >
            已安装
          </button>
        ) : (
          <>
            {/* 主操作：图标化小按钮（借鉴 1Panel，一行可并排多态） */}
            <button
              type="button"
              title={item.installed ? "更新到新版本" : loggedIn ? "下载到本地" : "登录后可下载"}
              aria-label={item.installed ? `更新 ${item.name}` : `下载 ${item.name}`}
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-md transition-all active:scale-[0.96]",
                loggedIn
                  ? "bg-primary text-primary-foreground hover:opacity-90"
                  : "border border-input bg-card text-muted-foreground hover:bg-accent",
              )}
              onClick={onDownload}
            >
              {item.updatable ? <RefreshCw size={14} aria-hidden /> : <Download size={14} aria-hidden />}
            </button>
            {/* 同条目同时支持多种情况：已装且可更新时，另给「重新下载」入口 */}
            {item.updatable && (
              <button
                type="button"
                title="重新下载完整包"
                aria-label={`重新下载 ${item.name}`}
                className="flex size-8 shrink-0 items-center justify-center rounded-md border border-input bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onClick={onDownload}
              >
                <PackageOpen size={14} aria-hidden />
              </button>
            )}
            <span className="ml-auto text-[11px] text-muted-foreground">
              {item.updatable ? "有更新 · 点左侧刷新图标升级" : loggedIn ? "点下载图标获取" : "需登录"}
            </span>
          </>
        )}
      </div>
    </article>
  );
}
