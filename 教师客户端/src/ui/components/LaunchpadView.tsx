// 启动中心：快捷启动（易教工具/外部工具/网址收藏）+ 工具 Tab（工具箱全功能）
// 作为应用默认首页；紧耦合子组件同文件内联
// 徽章三态（需下载/缺数据/有更新）+ 齿轮配置入口 + 下载确认/选包弹窗
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  BookOpen,
  Calculator,
  Check,
  Download,
  Globe,
  Languages,
  LayoutGrid,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Rocket,
  ScrollText,
  Search,
  Settings2,
  Shapes,
  Star,
  Trash2,
  Type,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DATA_OPTIONS_BY_TOOL, MOCK_EDU_TOOLS, MOCK_PACKAGES, MOCK_TOOLBOX_MANIFEST } from "@/lib/mockData";
import { VIEW_TITLES } from "@/lib/nav";
import { relativeTime } from "@/lib/format";
import { ToolboxPanel } from "@/components/ToolboxPanel";
import { LaunchConfigDialog, isPinnedMenu } from "@/components/LaunchConfigDialog";
import { LaunchIconBlock, clampMenuLabel } from "@/lib/launch-icon";
import type { InstalledMap } from "@/lib/store";
import type {
  Bookmark,
  CollapseMap,
  DataOption,
  EduTool,
  LaunchConfig,
  LaunchConfigMap,
  LaunchRecentItem,
  LocalTextbook,
  Notification,
  ToolShortcut,
} from "@/lib/types";

const EDU_ICONS: Record<string, LucideIcon> = {
  Languages,
  Type,
  AudioLines,
  ScrollText,
  Calculator,
  Shapes,
};

/** pkgId → 清单条目（版本比较用） */
const PKG_BY_ID: Record<string, { name: string; version: string }> = Object.fromEntries(
  MOCK_PACKAGES.map((p) => [p.id, { name: p.name, version: p.version }]),
);

export function semverLt(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

/** 徽章三态：需下载（未装）/ 有更新（已装但落后）/ null */
function badgeOf(pkgId: string | undefined, installed: InstalledMap): "need" | "update" | null {
  if (!pkgId) return null;
  const ver = installed[pkgId];
  if (!ver) return "need";
  const latest = PKG_BY_ID[pkgId]?.version;
  return latest && semverLt(ver, latest) ? "update" : null;
}

interface Props {
  installed: InstalledMap;
  markInstalled: (id: string, version: string) => void;
  shortcuts: ToolShortcut[];
  onShortcuts: (next: ToolShortcut[]) => void;
  addDownloaded: (toolId: string, path: string) => void;
  togglePin: (toolId: string) => void;
  markUsed: (toolId: string) => void;
  tasks: Record<string, { progress: number; done: boolean }>;
  startDownload: (id: string, onDone: (id: string) => void) => void;
  collapse: CollapseMap;
  onToggleCategory: (id: string) => void;
  probeOnline: boolean;
  bookmarks: Bookmark[];
  setBookmarks: (next: Bookmark[]) => void;
  recent: LaunchRecentItem[];
  markLaunch: (key: string, name: string) => void;
  configs: LaunchConfigMap;
  patchConfig: (itemId: string, patch: LaunchConfig) => void;
  /** 通知中心：下载完成/钉选上限等事件写入 */
  notify?: (n: Omit<Notification, "id" | "at" | "read">) => void;
  /** 原版教材：随随身工具包一起导出/导入（透传给 ToolboxPanel） */
  textbooks?: LocalTextbook[];
  onTextbooks?: (next: LocalTextbook[]) => void;
}

type Tab = "quick" | "tools";

export function LaunchpadView(props: Props) {
  const [tab, setTab] = useState<Tab>("quick");

  return (
    <div className="flex h-full flex-col">
      {/* Tab 切换 */}
      <div className="flex items-center gap-2 border-b border-border px-6 py-3 max-md:px-4">
        <div role="tablist" aria-label="启动中心分区" className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {(
            [
              { key: "quick", label: "快捷启动", icon: LayoutGrid },
              { key: "tools", label: "工具", icon: Wrench },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={tab === t.key}
              className={cn(
                "flex min-h-9 items-center gap-1.5 rounded-md px-3.5 text-[13px] transition-colors",
                tab === t.key
                  ? "bg-card font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setTab(t.key)}
            >
              <t.icon size={13} aria-hidden />
              {t.label}
            </button>
          ))}
        </div>
        <p className="ml-auto hidden text-[12px] text-muted-foreground sm:block">
          常用项一键直达 · 工具清单在「工具」页管理
        </p>
      </div>

      <div className="min-h-0 flex-1">
        {tab === "quick" ? <QuickLaunch {...props} /> : <ToolboxPanel {...props} />}
      </div>
    </div>
  );
}

// ── 下载确认 / 选包弹窗（同文件内联，紧耦合）──

interface PendingDownload {
  itemId: string;
  title: string;
  /** 直接整包/工具下载 */
  taskId?: string;
  taskLabel?: string;
  /** 有 options 时用 onConfirmMulti，否则必须有 onConfirm */
  onConfirm?: () => void;
  /** 有子包清单 → 渲染多选 */
  options?: DataOption[];
  onConfirmMulti?: (picked: string[]) => void;
}

function DownloadDialog({ req, onCancel }: { req: PendingDownload; onCancel: () => void }) {
  const [picked, setPicked] = useState<string[]>(() => req.options?.map((o) => o.pkgId) ?? []);
  const multi = Boolean(req.options?.length);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-label="下载到本地确认">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
        <h3 className="font-display text-[15px] font-bold">{multi ? "选择要更新的数据包" : "下载到本地？"}</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          {multi ? `「${req.title}」更新数据时可按年级选择，勾选后将合并为一个下载任务。` : `将「${req.title}」所需内容下载到本机。`}
        </p>
        {multi ? (
          <ul className="mt-3 space-y-1.5" role="list">
            {req.options!.map((o) => (
              <li key={o.pkgId}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-[13px] transition-colors hover:bg-accent">
                  <input
                    type="checkbox"
                    checked={picked.includes(o.pkgId)}
                    onChange={() => toggle(o.pkgId)}
                    className="size-3.5 accent-[var(--color-brand)]"
                  />
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  <span className="text-[11px] text-muted-foreground">{PKG_BY_ID[o.pkgId]?.name ?? o.pkgId}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          req.taskLabel && (
            <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-[12px] text-muted-foreground">{req.taskLabel}</p>
          )
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="min-h-9 rounded-md border border-input bg-card px-3.5 text-[13px] transition-colors hover:bg-accent"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            disabled={multi && picked.length === 0}
            className="flex min-h-9 items-center gap-1 rounded-md bg-primary px-3.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              if (multi) req.onConfirmMulti?.(picked);
              else req.onConfirm?.();
              onCancel();
            }}
          >
            <Download size={13} aria-hidden />{multi ? `下载所选（${picked.length}）` : "确认下载"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 快捷启动页 ──

function QuickLaunch({
  installed,
  markInstalled,
  shortcuts,
  addDownloaded,
  markUsed,
  markLaunch,
  recent,
  bookmarks,
  setBookmarks,
  tasks,
  startDownload,
  configs,
  patchConfig,
  notify,
}: Props) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Bookmark | null>(null);
  const [adding, setAdding] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Bookmark | null>(null);
  const [cfgTarget, setCfgTarget] = useState<{ itemId: string; name: string } | null>(null);
  const [dlReq, setDlReq] = useState<PendingDownload | null>(null);

  // 已钉选到侧栏「一键启动」的条目数（弹窗上限提示与拦截用；view 类内置功能页同样计入）
  const menuPinnedCount = Object.keys(configs).filter((id) => isPinnedMenu(configs[id])).length;

  // 易教工具 = 内置目录 + 已安装的 app 类内容包（口算/几何演示等）
  const eduTools = useMemo(() => {
    const dynamic: EduTool[] = Object.keys(installed)
      .filter((id) => id.startsWith("pkg-"))
      .flatMap((id) => {
        const pkg = MOCK_PKG_APP_BY_ID[id];
        return pkg ? [{ id: `pkg:${id}`, name: pkg.name, icon: pkg.icon, desc: pkg.desc }] : [];
      });
    return [...MOCK_EDU_TOOLS, ...dynamic];
  }, [installed]);

  // 外部工具 = 已下载快捷方式 ∪ 清单推荐但未下载（后者带「需下载」徽章）
  const external = useMemo(() => {
    const withPath = shortcuts.filter((s) => s.path);
    const haveIds = new Set(withPath.map((s) => s.tool_id));
    const recommended = MOCK_TOOLBOX_MANIFEST.tools.filter((t) => t.recommend && !haveIds.has(t.id));
    return { withPath, recommended };
  }, [shortcuts]);

  const q = query.trim().toLowerCase();
  const hit = (name: string, extra = "") =>
    !q || name.toLowerCase().includes(q) || extra.toLowerCase().includes(q);

  // 快捷方式区：pinnedQuick 条目（edu/tool/bm），按钉入时间排序，失效 id 自动过滤
  const quickPins = useMemo(() => {
    const eduIds = new Set(eduTools.map((t) => `edu:${t.id}`));
    const toolIds = new Set([
      ...shortcuts.map((s) => `tool:${s.tool_id}`),
      ...MOCK_TOOLBOX_MANIFEST.tools.filter((t) => t.recommend).map((t) => `tool:${t.id}`),
    ]);
    const bmIds = new Set(bookmarks.map((b) => `bm:${b.id}`));
    return Object.entries(configs)
      .filter(([id, c]) => c.pinnedQuick && (eduIds.has(id) || toolIds.has(id) || bmIds.has(id)))
      .sort(([, a], [, b]) => (a.pinnedAt ?? 0) - (b.pinnedAt ?? 0))
      .map(([id, c]) => {
        const ref = id.slice(id.indexOf(":") + 1);
        let name = ref;
        if (id.startsWith("edu:")) name = eduTools.find((t) => t.id === ref)?.name ?? ref;
        else if (id.startsWith("tool:")) name = TOOL_NAME_BY_ID[ref] ?? ref;
        else if (id.startsWith("bm:")) name = bookmarks.find((b) => b.id === ref)?.name ?? ref;
        return { itemId: id, name, cfg: c };
      })
      .filter((p) => hit(p.name));
  }, [configs, shortcuts, bookmarks, q]);

  // 钉选失效检测：曾钉任一通道、但目标条目已不存在（收藏被删/工具卸载）→ warn 通知（每条目仅提示一次）
  const staleNotified = useRef(new Set<string>());
  useEffect(() => {
    for (const [id, c] of Object.entries(configs)) {
      if (!c.pinnedMenu && !isPinnedMenu(c) && !c.pinnedQuick) continue;
      const ref = id.slice(id.indexOf(":") + 1);
      let alive = true;
      if (id.startsWith("view:")) alive = ref in VIEW_TITLES;
      else if (id.startsWith("edu:")) alive = eduTools.some((t) => `edu:${t.id}` === id);
      else if (id.startsWith("tool:")) alive = shortcuts.some((s) => s.tool_id === ref);
      else if (id.startsWith("bm:")) alive = bookmarks.some((b) => b.id === ref);
      if (!alive && !staleNotified.current.has(id)) {
        staleNotified.current.add(id);
        notify?.({ kind: "warn", title: "钉选项已失效", body: `「${c.menuLabel ?? ref}」对应的条目已不在本机，已从快捷区隐藏；可在配置中取消钉选。` });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configs, eduTools, shortcuts, bookmarks]);

  const launchPin = (itemId: string, name: string) => {
    if (itemId.startsWith("bm:")) {
      const bm = bookmarks.find((b) => b.id === itemId.slice(3));
      if (bm) window.open(bm.url, "_blank", "noopener,noreferrer");
      return;
    }
    markLaunch(itemId, name);
    toast.success(`已启动「${name}」`, { description: "演示环境：真实客户端将直接打开该项。" });
  };

  const visibleEdu = eduTools.filter((t) => hit(t.name, t.desc));
  const visibleExt = external.withPath.filter((s) => hit(shortcutName(s)));
  const visibleRec = external.recommended.filter((t) => hit(t.name, t.description));
  const visibleBm = bookmarks.filter((b) => hit(b.name, b.url));

  const openCfg = (itemId: string, name: string) => setCfgTarget({ itemId, name });

  /** 发起内容包下载（含完成回调落库 + 通知） */
  const downloadPkg = (pkgId: string, label: string) => {
    startDownload(pkgId, (id) => {
      markInstalled(id, PKG_BY_ID[id]?.version ?? "1.0.0");
      toast.success(`「${label}」下载完成并已安装`);
      notify?.({ kind: "success", title: `「${label}」下载完成`, body: "内容包已安装到本机，可立即使用。" });
    });
  };

  /** 点击徽章：按条目情况弹选包或直接确认下载 */
  const requestBadgeDownload = (itemId: string, title: string, opts: { pkgId?: string; options?: DataOption[]; toolId?: string }) => {
    if (opts.options?.length) {
      setDlReq({
        itemId,
        title,
        options: opts.options,
        onConfirmMulti: (picked) => {
          for (const pid of picked) downloadPkg(pid, PKG_BY_ID[pid]?.name ?? pid);
          toast.info(`已加入 ${picked.length} 个数据包下载任务`);
        },
      });
      return;
    }
    if (opts.toolId) {
      const t = MOCK_TOOLBOX_MANIFEST.tools.find((x) => x.id === opts.toolId)!;
      setDlReq({
        itemId,
        title,
        taskLabel: `${t.name} · ${t.license} · 便携版`,
        onConfirm: () => {
          startDownload(`tb:${t.id}`, (id) => {
            addDownloaded(id.replace("tb:", ""), `toolbox/${t.id}/${t.entry}`);
            toast.success(`「${t.name}」已下载，出现在外部工具区`);
            notify?.({ kind: "success", title: `「${t.name}」下载完成`, body: "已生成本机快捷方式，出现在外部工具区。" });
          });
        },
      });
      return;
    }
    if (opts.pkgId) {
      setDlReq({
        itemId,
        title,
        taskLabel: PKG_BY_ID[opts.pkgId]?.name ?? opts.pkgId,
        onConfirm: () => downloadPkg(opts.pkgId!, PKG_BY_ID[opts.pkgId!]?.name ?? opts.pkgId!),
      });
    }
  };

  const launchEdu = (t: EduTool) => {
    const badge = badgeOf(t.requiresPkgId, installed);
    if (badge === "need") {
      requestBadgeDownload(`edu:${t.id}`, t.name, {
        pkgId: t.requiresPkgId,
        options: DATA_OPTIONS_BY_TOOL[`edu:${t.id}`],
      });
      return;
    }
    if (badge === "update") {
      requestBadgeDownload(`edu:${t.id}`, t.name, {
        pkgId: t.requiresPkgId,
        options: DATA_OPTIONS_BY_TOOL[`edu:${t.id}`],
      });
      return;
    }
    markLaunch(`edu:${t.id}`, t.name);
    toast.success(`已启动「${t.name}」`, { description: "演示环境：真实客户端将直接打开该工具。" });
  };

  const launchExternal = (s: ToolShortcut) => {
    markUsed(s.tool_id);
    markLaunch(`tool:${s.tool_id}`, shortcutName(s));
    toast.success(`已请求启动「${shortcutName(s)}」`, {
      description: "真实客户端将通过系统 shell 直接启动本地程序，不注入、不监控其运行。",
    });
  };

  const openBookmark = (b: Bookmark) => {
    window.open(b.url, "_blank", "noopener,noreferrer");
  };

  const saveBookmark = (bm: Bookmark) => {
    const idx = bookmarks.findIndex((b) => b.id === bm.id);
    if (idx >= 0) {
      const next = [...bookmarks];
      next[idx] = bm;
      setBookmarks(next);
      toast.success(`已更新收藏「${bm.name}」`);
    } else {
      setBookmarks([...bookmarks, bm]);
      toast.success(`已添加收藏「${bm.name}」`);
    }
    setAdding(false);
    setEditing(null);
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-4 max-md:px-4">
      {/* 搜索 */}
      <div className="relative mb-4 max-w-md">
        <Search size={14} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索快捷项名称，如「点读」「截图」"
          aria-label="搜索快捷启动项"
          className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-8 text-[13px] outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
        />
        {query && (
          <button
            type="button"
            aria-label="清空搜索"
            className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent"
            onClick={() => setQuery("")}
          >
            <X size={13} aria-hidden />
          </button>
        )}
      </div>

      {/* 最近使用 */}
      {recent.length > 0 && !q && (
        <section aria-labelledby="lp-recent" className="mb-6">
          <Head id="lp-recent" icon={Star} title="最近使用" note={`最多 ${10} 条`} />
          <div className="flex flex-wrap gap-2">
            {recent.map((r) => (
              <span
                key={r.key}
                className="flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[12px] shadow-sm"
                title={`${r.name} · ${relativeTime(r.at)}`}
              >
                {r.name}
                <span className="text-[11px] text-muted-foreground">{relativeTime(r.at)}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* 快捷方式：pinnedQuick 汇总区（启动中心内直达，不限数量） */}
      {quickPins.length > 0 && (
        <section aria-labelledby="lp-pins" className="mb-6">
          <Head id="lp-pins" icon={Rocket} title="快捷方式" note={`${quickPins.length} 项 · 在卡片火箭按钮或配置弹窗中钉入`} />
          <div className="flex flex-wrap gap-2">
            {quickPins.map((p) => (
              <button
                key={p.itemId}
                type="button"
                className="group flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card py-1.5 pl-2 pr-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                onClick={() => launchPin(p.itemId, p.name)}
              >
                {p.cfg.iconKind ? (
                  <LaunchIconBlock itemId={p.itemId} name={p.name} cfg={p.cfg} size={26} rounded="rounded-md" />
                ) : (
                  <span className="flex size-[26px] shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
                    {p.itemId.startsWith("bm:") ? <Globe size={14} aria-hidden /> : <Rocket size={14} aria-hidden />}
                  </span>
                )}
                <span className="max-w-40 truncate text-[13px] font-medium">{clampMenuLabel(p.cfg.menuLabel ?? p.name)}</span>
                {p.itemId.startsWith("bm:") && <Globe size={11} aria-hidden className="shrink-0 opacity-50" />}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 易教工具 */}
      <section aria-labelledby="lp-edu" className="mb-6">
        <Head id="lp-edu" icon={BookOpen} title="易教工具" note="自研教学工具，内容包为其提供数据" />
        {visibleEdu.length === 0 ? (
          <Empty text={q ? `没有匹配「${query}」的易教工具` : "暂无易教工具"} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visibleEdu.map((t) => {
              const itemId = `edu:${t.id}`;
              const badge = badgeOf(t.requiresPkgId, installed);
              const busy = Boolean(t.requiresPkgId && tasks[t.requiresPkgId]);
              return (
                <div
                  key={t.id}
                  className="group relative rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <button type="button" className="block w-full text-left" onClick={() => launchEdu(t)}>
                    <CardIcon itemId={itemId} name={t.name} cfg={configs[itemId]}>
                      {(() => {
                        const Icon = EDU_ICONS[t.icon] ?? Rocket;
                        return <Icon size={19} aria-hidden />;
                      })()}
                    </CardIcon>
                    <span className="mt-2.5 block text-[14px] font-semibold">{t.name}</span>
                    <span className="mt-1 block line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">{t.desc}</span>
                  </button>
                  {busy ? (
                    <span className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand" title="下载中">
                      <RefreshCw size={11} aria-hidden className="animate-spin" />
                    </span>
                  ) : badge ? (
                    <button
                      type="button"
                      className={cn(
                        "absolute right-2.5 top-2.5 flex size-6 items-center justify-center rounded-full transition-colors",
                        badge === "need" ? "bg-warn/15 text-warn hover:bg-warn/25" : "bg-brand-soft text-brand hover:opacity-80",
                      )}
                      title={badge === "need" ? "需下载：点击下载到本地" : "数据有更新：点击更新"}
                      onClick={() =>
                        requestBadgeDownload(itemId, t.name, {
                          pkgId: t.requiresPkgId,
                          options: DATA_OPTIONS_BY_TOOL[itemId],
                        })
                      }
                    >
                      {badge === "need" ? <Download size={12} aria-hidden /> : <RefreshCw size={12} aria-hidden />}
                    </button>
                  ) : null}
                  <GearBtn itemId={itemId} name={t.name} onConfig={openCfg} pinned={isPinnedMenu(configs[itemId]) || configs[itemId]?.pinnedQuick} />
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 外部工具 */}
      <section aria-labelledby="lp-ext" className="mb-6">
        <Head id="lp-ext" icon={Wrench} title="外部工具" note="已下载或本机登记的快捷方式；推荐工具未下载时带「需下载」徽章" />
        {visibleExt.length === 0 && visibleRec.length === 0 ? (
          <Empty text={q ? `没有匹配「${query}」的外部工具` : "还没有外部工具 —— 到「工具」页下载后会自动出现在这里。"} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visibleExt.map((s) => {
              const itemId = `tool:${s.tool_id}`;
              return (
                <div
                  key={s.tool_id}
                  className="group relative rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <button type="button" className="block w-full text-left" onClick={() => launchExternal(s)}>
                    <CardIcon itemId={itemId} name={shortcutName(s)} cfg={configs[itemId]}>
                      <Rocket size={18} aria-hidden />
                    </CardIcon>
                    <span className="mt-2.5 block truncate text-[14px] font-semibold" title={shortcutName(s)}>
                      {shortcutName(s)}
                    </span>
                    <span className="mt-1 block text-[12px] text-muted-foreground">
                      {s.source === "manual" ? "本机登记" : "经工具页下载"} · 点击启动
                    </span>
                  </button>
                  <GearBtn itemId={itemId} name={shortcutName(s)} onConfig={openCfg} pinned={isPinnedMenu(configs[itemId]) || configs[itemId]?.pinnedQuick} />
                </div>
              );
            })}
            {visibleRec.map((t) => {
              const itemId = `tool:${t.id}`;
              const busy = Boolean(tasks[`tb:${t.id}`]);
              return (
                <div
                  key={t.id}
                  className="group relative rounded-xl border border-dashed border-border bg-card/60 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <button
                    type="button"
                    className="block w-full text-left"
                    onClick={() => requestBadgeDownload(itemId, t.name, { toolId: t.id })}
                  >
                    <CardIcon itemId={itemId} name={t.name} cfg={configs[itemId]} fallbackClass="bg-muted text-muted-foreground">
                      <Package size={18} aria-hidden />
                    </CardIcon>
                    <span className="mt-2.5 block truncate text-[14px] font-semibold" title={t.name}>{t.name}</span>
                    <span className="mt-1 block line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">{t.description}</span>
                  </button>
                  <span
                    className={cn(
                      "absolute right-2.5 top-2.5 flex size-6 items-center justify-center rounded-full",
                      busy ? "bg-brand-soft text-brand" : "bg-warn/15 text-warn",
                    )}
                    title={busy ? "下载中" : "需下载：点击下载到本机"}
                  >
                    {busy ? <RefreshCw size={12} aria-hidden className="animate-spin" /> : <Download size={12} aria-hidden />}
                  </span>
                  {!busy && <GearBtn itemId={itemId} name={t.name} onConfig={openCfg} pinned={isPinnedMenu(configs[itemId]) || configs[itemId]?.pinnedQuick} offset={32} />}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 网址收藏 */}
      <section aria-labelledby="lp-bm" className="pb-6">
        <Head
          id="lp-bm"
          icon={Globe}
          title="网址收藏"
          note={`${bookmarks.length} 条`}
          action={
            <button
              type="button"
              className="flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-input bg-card px-2 text-[12px] transition-colors hover:bg-accent"
              onClick={() => {
                setAdding(true);
                setEditing(null);
              }}
            >
              <Plus size={12} aria-hidden />新增
            </button>
          }
        />
        {visibleBm.length === 0 && !adding ? (
          <Empty text={q ? `没有匹配「${query}」的收藏` : "还没有网址收藏，点右上角「新增」登记常用网站。"} />
        ) : (
          <div className="flex flex-wrap gap-2">
            {visibleBm.map((b) => {
              const itemId = `bm:${b.id}`;
              return (
                <div
                  key={b.id}
                  className="group flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card py-1.5 pl-2 pr-1 shadow-sm"
                >
                  <button
                    type="button"
                    className="flex items-center gap-2"
                    title={`${b.name}\n${b.url}`}
                    onClick={() => openBookmark(b)}
                  >
                    {configs[itemId] ? (
                      <LaunchIconBlock itemId={itemId} name={b.name} cfg={configs[itemId]} size={28} />
                    ) : (
                      <Favicon name={b.name} url={b.url} />
                    )}
                    <span className="max-w-44 truncate text-[13px] font-medium">{b.name}</span>
                  </button>
                  <span className="flex items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <button
                      type="button"
                      aria-label={`配置收藏 ${b.name}`}
                      className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                      onClick={() => openCfg(itemId, b.name)}
                    >
                      <Settings2 size={11} aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`编辑收藏 ${b.name}`}
                      className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                      onClick={() => {
                        setEditing(b);
                        setAdding(false);
                      }}
                    >
                      <Pencil size={11} aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`删除收藏 ${b.name}`}
                      className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setPendingDelete(b)}
                    >
                      <Trash2 size={11} aria-hidden />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {(adding || editing) && (
          <BookmarkForm
            initial={editing ?? undefined}
            onCancel={() => {
              setAdding(false);
              setEditing(null);
            }}
            onSave={saveBookmark}
          />
        )}
      </section>

      {/* 下载到本地确认 / 选包 */}
      {dlReq && <DownloadDialog req={dlReq} onCancel={() => setDlReq(null)} />}

      {/* 一键启动配置弹窗 */}
      {cfgTarget && (
        <LaunchConfigDialog
          itemId={cfgTarget.itemId}
          name={cfgTarget.name}
          config={configs[cfgTarget.itemId]}
          menuPinnedCount={menuPinnedCount}
          notify={notify}
          onCancel={() => setCfgTarget(null)}
          onSave={(next) => {
            patchConfig(cfgTarget.itemId, next);
            setCfgTarget(null);
          }}
        />
      )}

      {/* 删除确认 */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-label="删除收藏确认">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
            <h3 className="font-display text-[15px] font-bold">删除网址收藏？</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              将从本机移除「{pendingDelete.name}」。此操作不影响其他设备上的收藏。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="min-h-9 rounded-md border border-input bg-card px-3.5 text-[13px] transition-colors hover:bg-accent"
                onClick={() => setPendingDelete(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="min-h-9 rounded-md bg-destructive px-3.5 text-[13px] font-medium text-destructive-foreground transition-opacity hover:opacity-90"
                onClick={() => {
                  setBookmarks(bookmarks.filter((b) => b.id !== pendingDelete.id));
                  toast.success(`已删除收藏「${pendingDelete.name}」`);
                  setPendingDelete(null);
                }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 收藏表单（新增/编辑共用）──

function BookmarkForm({
  initial,
  onCancel,
  onSave,
}: {
  initial?: Bookmark;
  onCancel: () => void;
  onSave: (b: Bookmark) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [err, setErr] = useState("");

  const submit = () => {
    const n = name.trim();
    let u = url.trim();
    if (!n) return setErr("请填写名称");
    if (!u) return setErr("请填写网址");
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    try {
      void new URL(u);
    } catch {
      return setErr("网址格式不正确");
    }
    onSave({ id: initial?.id ?? `bm-${Date.now().toString(36)}`, name: n, url: u });
  };

  return (
    <div className="mt-3 flex max-w-xl flex-wrap items-end gap-2 rounded-xl border border-border bg-muted/40 p-3.5">
      <label className="flex min-w-40 flex-1 flex-col gap-1 text-[12px] text-muted-foreground">
        名称
        <input
          autoFocus
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          placeholder="如：学校官网"
          className="h-9 rounded-md border border-input bg-card px-2.5 text-[13px] text-foreground outline-none focus:border-ring"
        />
      </label>
      <label className="flex min-w-56 flex-[2] flex-col gap-1 text-[12px] text-muted-foreground">
        网址
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="example.com"
          className="h-9 rounded-md border border-input bg-card px-2.5 text-[13px] text-foreground outline-none focus:border-ring"
        />
      </label>
      <button
        type="button"
        className="flex min-h-9 items-center gap-1 rounded-md bg-primary px-3.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
        onClick={submit}
      >
        <Check size={13} aria-hidden />{initial ? "保存" : "添加"}
      </button>
      <button
        type="button"
        className="min-h-9 rounded-md border border-input bg-card px-3 text-[13px] text-muted-foreground transition-colors hover:bg-accent"
        onClick={onCancel}
      >
        取消
      </button>
      {err && <p className="w-full text-[12px] text-destructive">{err}</p>}
    </div>
  );
}

// ── 小组件 ──

/** 卡片图标位：已配置一键启动图标 → 色块/图片；未配置 → 渲染默认 lucide 内容 */
function CardIcon({
  itemId,
  name,
  cfg,
  fallbackClass,
  children,
}: {
  itemId: string;
  name: string;
  cfg?: LaunchConfig;
  fallbackClass?: string;
  children: React.ReactNode;
}) {
  // 仅当用户在启动中心显式配置过图标时才替换为色块，否则保留卡片原生矢量图标
  if (cfg?.iconKind) return <LaunchIconBlock itemId={itemId} name={name} cfg={cfg} size={40} rounded="rounded-xl" />;
  return (
    <span className={cn("flex size-10 items-center justify-center rounded-xl", fallbackClass ?? "bg-brand-soft text-brand")}>
      {children}
    </span>
  );
}

/** 卡片右上角火箭：hover/focus 出现，打开一键启动配置弹窗；pinned 时常亮（已设为快捷启动） */
function GearBtn({
  itemId,
  name,
  onConfig,
  pinned,
  offset = 0,
}: {
  itemId: string;
  name: string;
  onConfig: (itemId: string, name: string) => void;
  pinned?: boolean;
  /** 右上角已有徽章时向左让位的像素偏移 */
  offset?: number;
}) {
  return (
    <button
      type="button"
      aria-label={`配置 ${name}`}
      title={pinned ? "已设为快捷启动 · 点击修改配置" : "设为/取消快捷启动 · 修改图标与名称"}
      className={cn(
        "absolute top-2.5 flex size-6 items-center justify-center rounded-md transition-all hover:bg-accent focus-visible:opacity-100",
        pinned ? "text-brand opacity-100" : "text-muted-foreground opacity-0 group-hover:opacity-100",
      )}
      style={{ right: `calc(0.625rem + ${offset}px)` }}
      onClick={() => onConfig(itemId, name)}
    >
      <Rocket size={13} aria-hidden />
    </button>
  );
}

function Head({
  id,
  icon: Icon,
  title,
  note,
  action,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  note?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <Icon size={14} aria-hidden className="text-brand" />
      <h2 id={id} className="font-display text-[14px] font-bold tracking-wide">{title}</h2>
      {note && <span className="text-[11px] text-muted-foreground">{note}</span>}
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-[13px] text-muted-foreground">
      {text}
    </p>
  );
}

/** 域名首字母圆形色块图标（按域名散列取色，纯展示用 hue 派生自品牌色系） */
function Favicon({ name, url }: { name: string; url: string }) {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = name;
  }
  const ch = (host.replace(/^www\./, "")[0] ?? "?").toUpperCase();
  let hash = 0;
  for (const c of host) hash = (hash * 31 + c.charCodeAt(0)) % 360;
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold text-on-primary"
      style={{ backgroundColor: `oklch(0.55 0.15 ${hash})` }}
    >
      {ch}
    </span>
  );
}

function shortcutName(s: ToolShortcut): string {
  return TOOL_NAME_BY_ID[s.tool_id] ?? s.external_name ?? s.tool_id;
}

// 展示名映射（模拟清单在本机的镜像；避免为取名重复拉取 manifest）
const TOOL_NAME_BY_ID: Record<string, string> = Object.fromEntries(
  MOCK_TOOLBOX_MANIFEST.tools.map((t) => [t.id, t.name]),
);

// 已安装 app 包 → 易教工具卡片的补充元信息
const MOCK_PKG_APP_BY_ID: Record<string, { name: string; icon: string; desc: string }> = Object.fromEntries(
  MOCK_PACKAGES.filter((p) => p.package_type === "app").map((p) => [
    p.id,
    { name: p.name.replace(/（离线应用）/, ""), icon: p.id.includes("math-geo") ? "Shapes" : "Calculator", desc: p.description ?? "" },
  ]),
);
