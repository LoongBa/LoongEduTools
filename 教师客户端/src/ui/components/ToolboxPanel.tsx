// 启动中心·工具 Tab：服务端清单 + 本地快捷方式；搜索/tag 筛选/分组折叠/收藏/
// 最近使用/下载启动/随身工具包/断网降级（原 ToolboxView 迁移改造）
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FilePlus2,
  FolderDown,
  FolderUp,
  Hash,
  Inbox,
  Package,
  Play,
  RefreshCw,
  Search,
  Star,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/api";
import { formatBytes, relativeTime } from "@/lib/format";
import type { CollapseMap, LocalTextbook, ToolboxManifest, ToolboxPackFile, ToolboxTool, ToolShortcut } from "@/lib/types";

interface Props {
  shortcuts: ToolShortcut[];
  onShortcuts: (next: ToolShortcut[]) => void;
  addDownloaded: (toolId: string, path: string) => void;
  togglePin: (toolId: string) => void;
  markUsed: (toolId: string) => void;
  tasks: Record<string, { progress: number; done: boolean }>;
  startDownload: (id: string, onDone: (id: string) => void) => void;
  collapse: CollapseMap;
  onToggleCategory: (id: string) => void;
  /** 原版教材（下载中心·本机目录导入项）：导出时打包 packed=true 者 */
  textbooks?: LocalTextbook[];
  onTextbooks?: (next: LocalTextbook[]) => void;
}

const CACHE_KEY = "taoli.toolbox.manifestCache";
const LRU_MAX = 10;

type FetchPhase = "loading" | "ready" | "failed-cached" | "failed-empty";

export function ToolboxPanel({
  shortcuts,
  onShortcuts,
  addDownloaded,
  togglePin,
  markUsed,
  tasks,
  startDownload,
  collapse,
  onToggleCategory,
  textbooks,
  onTextbooks,
}: Props) {
  const [manifest, setManifest] = useState<ToolboxManifest | null>(null);
  const [phase, setPhase] = useState<FetchPhase>("loading");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("全部");
  const fileRef = useRef<HTMLInputElement>(null);

  // ── 清单获取：真实 invoke（Rust 端登录拉取 + 写缓存；未登录/无网 → Rust 缓存降级）。
  // 前端 CACHE_KEY 作双保险：invoke 失败时读本地缓存区分 failed-cached / failed-empty ──
  const fetchManifest = async (retry = false) => {
    setPhase("loading");
    try {
      const m = await api.toolboxManifest();
      setManifest(m);
      setPhase("ready");
      try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(m));
      } catch { /* 忽略写入失败 */ }
    } catch {
      let cached: ToolboxManifest | null = null;
      try {
        const raw = window.localStorage.getItem(CACHE_KEY);
        if (raw) cached = JSON.parse(raw) as ToolboxManifest;
      } catch { /* 缓存损坏视为无 */ }
      if (cached) {
        setManifest(cached);
        setPhase("failed-cached");
        if (retry) toast.success("仍在使用本地缓存清单");
      } else {
        setManifest(null);
        setPhase("failed-empty");
      }
    }
  };

  useEffect(() => {
    void fetchManifest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tools = manifest?.tools ?? [];
  const categories = manifest?.categories ?? [];
  const shortcutByTool = useMemo(() => {
    const m = new Map<string, ToolShortcut>();
    for (const s of shortcuts) m.set(s.tool_id, s);
    return m;
  }, [shortcuts]);

  // ── tag 全集（收集自所有工具的 tags 字段）──
  const allTags = useMemo(() => {
    const out: string[] = [];
    for (const t of tools) for (const x of t.tags) if (!out.includes(x)) out.push(x);
    return out;
  }, [tools]);

  // ── 搜索 + tag 叠加过滤：匹配 name/aliases/tags/description ──
  const q = query.trim().toLowerCase();
  const matches = (t: ToolboxTool) =>
    (!q ||
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some((x) => x.toLowerCase().includes(q)) ||
      (t.aliases ?? []).some((x) => x.toLowerCase().includes(q))) &&
    (tag === "全部" || t.tags.includes(tag));

  const filtered = useMemo(() => tools.filter(matches), [tools, q, tag]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtering = q.length > 0 || tag !== "全部";
  const hitCategories = useMemo(() => new Set(filtered.map((t) => t.category)), [filtered]);
  /** 有筛选时自动展开命中组：类别收起态 = collapse[id] && !命中 */
  const catExpanded = (id: string) => !collapse[id] || (filtering && hitCategories.has(id));

  // ── 最近使用 / 我的工具 ──
  const recent = useMemo(
    () =>
      shortcuts
        .filter((s) => s.last_used)
        .sort((a, b) => (a.last_used! < b.last_used! ? 1 : -1))
        .slice(0, LRU_MAX),
    [shortcuts],
  );
  const pinned = useMemo(() => shortcuts.filter((s) => s.pinned), [shortcuts]);

  const toolById = useMemo(() => {
    const m = new Map<string, ToolboxTool>();
    for (const t of tools) m.set(t.id, t);
    return m;
  }, [tools]);

  // ── 启动 / 下载 ──
  const launch = (toolId: string, name: string) => {
    markUsed(toolId);
    toast.success(`已请求启动「${name}」`, {
      description: "真实客户端将通过系统 shell 直接启动本地程序，不注入、不监控其运行。",
    });
  };

  const download = (t: ToolboxTool) => {
    startDownload(`tb:${t.id}`, (id) => {
      addDownloaded(id.replace("tb:", ""), `toolbox/${t.id}/${t.entry}`);
      toast.success(`「${t.name}」已下载到工具目录，快捷方式已生成`, {
        description: "可直接点击「启动」，也会出现在「快捷启动」的外部工具区。",
      });
    });
  };

  // ── 随身工具包：导出 / 导入 ──
  const packedTextbooks = (textbooks ?? []).filter((t) => t.packed);

  const exportPack = () => {
    const pack: ToolboxPackFile = {
      kind: "taoli-toolbox-pack",
      exported_at: new Date().toISOString(),
      shortcuts,
      downloaded_tools: shortcuts
        .filter((s) => s.source === "download" && s.path)
        .map((s) => ({
          tool_id: s.tool_id,
          name: toolById.get(s.tool_id)?.name ?? s.external_name ?? s.tool_id,
          path: s.path,
        })),
      textbooks: packedTextbooks,
    };
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "toolbox-pack.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("已导出随身工具包 toolbox-pack.json", {
      description: `含快捷方式清单、已下载工具索引与 ${packedTextbooks.length} 套原版教材；换电脑后用「导入」恢复。`,
    });
  };

  const importPack = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as ToolboxPackFile;
        if (data.kind !== "taoli-toolbox-pack" || !Array.isArray(data.shortcuts)) {
          throw new Error("bad");
        }
        const merged: ToolShortcut[] = [...shortcuts];
        for (const s of data.shortcuts) {
          const idx = merged.findIndex((m) => m.tool_id === s.tool_id);
          const known = toolById.has(s.tool_id);
          const entry: ToolShortcut = {
            ...s,
            external_name: known ? undefined : s.external_name ?? s.tool_id,
          };
          if (idx >= 0) merged[idx] = entry;
          else merged.push(entry);
        }
        onShortcuts(merged);
        // 原版教材：按 id 合并（导入包里的 packed 标记覆盖本机）
        const tbMerged = [...(textbooks ?? [])];
        let tbCount = 0;
        for (const t of data.textbooks ?? []) {
          if (!t?.id) continue;
          const idx = tbMerged.findIndex((m) => m.id === t.id);
          if (idx >= 0) tbMerged[idx] = t;
          else tbMerged.push(t);
          tbCount++;
        }
        if (tbCount > 0 && onTextbooks) onTextbooks(tbMerged);
        toast.success("随身工具包已导入", {
          description: `收藏、最近使用与已下载状态按 tool_id 对齐恢复${tbCount > 0 ? `，并合并 ${tbCount} 套原版教材索引` : ""}。`,
        });
      } catch {
        toast.error("导入失败：文件格式不正确，现有数据未受影响");
      }
    };
    reader.readAsText(file);
  };

  const manualAdd = () => {
    const name = window.prompt("登记本机已装工具的名称：");
    if (!name?.trim()) return;
    const path = window.prompt("程序路径（如 D:\\Tools\\xxx.exe）：");
    if (!path?.trim()) return;
    const id = `manual-${Date.now().toString(36)}`;
    onShortcuts([
      ...shortcuts,
      { tool_id: id, path: path.trim(), pinned: true, last_used: null, source: "manual", external_name: name.trim() },
    ]);
    toast.success(`已添加本地工具「${name.trim()}」到我的工具`);
  };

  const readOnly = phase === "failed-cached";

  return (
    <div className="flex h-full flex-col">
      {/* 顶部：搜索 + 工具包操作 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3 max-md:px-4">
        <div className="relative min-w-52 flex-1 max-md:w-full">
          <Search size={14} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索工具名称、标签或描述，如「标注」「按键」"
            aria-label="搜索工具"
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
        <div className="flex items-center gap-1.5">
          <PackButton icon={FolderDown} label="导出随身工具包" onClick={exportPack} />
          <PackButton icon={FolderUp} label="导入随身工具包" onClick={() => fileRef.current?.click()} />
          <PackButton icon={FilePlus2} label="手动添加" onClick={manualAdd} />
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importPack(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {/* 断网降级 banner */}
      {readOnly && (
        <div className="banner print-hide mx-6 mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3.5 py-2.5 text-[13px] max-md:mx-4">
          <AlertTriangle size={14} aria-hidden className="shrink-0 text-warn" />
          <span>清单更新失败，正在展示本地缓存清单（只读）。已下载工具的启动不受影响。</span>
          <button
            type="button"
            className="ml-auto flex min-h-8 items-center gap-1 rounded-md border border-input bg-card px-2.5 text-[12px] transition-colors hover:bg-accent"
            onClick={() => fetchManifest(true)}
          >
            <RefreshCw size={12} aria-hidden />重试
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-4 max-md:px-4">
        {phase === "loading" && (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3" aria-label="清单加载中">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl border border-border bg-muted/60" />
            ))}
          </div>
        )}

        {phase === "failed-empty" && (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <AlertTriangle size={28} aria-hidden className="text-destructive" />
            <p className="text-[13px] text-muted-foreground">
              无法获取工具清单，且本机没有缓存。请确认服务器可达后重试。
            </p>
            <button
              type="button"
              className="min-h-9 rounded-md bg-primary px-4 text-[13px] text-primary-foreground hover:opacity-90"
              onClick={() => fetchManifest(true)}
            >
              重试
            </button>
          </div>
        )}

        {(phase === "ready" || phase === "failed-cached") && manifest && (
          <>
            {/* tag 筛选行 */}
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
                      "min-h-8 rounded-full border px-3 text-[12px] transition-colors",
                      tag === t
                        ? "border-brand bg-brand-soft font-medium text-brand"
                        : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}

            {/* 最近使用 */}
            {recent.length > 0 && !filtering && (
              <section aria-labelledby="sec-recent" className="mb-6">
                <SectionHead id="sec-recent" icon={Clock} title="最近使用" note={`最多 ${LRU_MAX} 条`} />
                <div className="flex flex-wrap gap-2">
                  {recent.map((s) => {
                    const t = toolById.get(s.tool_id);
                    const name = t?.name ?? s.external_name ?? s.tool_id;
                    return (
                      <div
                        key={s.tool_id}
                        className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 shadow-sm"
                      >
                        <span className="max-w-44 truncate text-[13px] font-medium" title={name}>{name}</span>
                        <span className="whitespace-nowrap text-[11px] text-muted-foreground">{relativeTime(s.last_used)}</span>
                        <LaunchBtn enabled={Boolean(s.path) || s.source === "manual"} onClick={() => launch(s.tool_id, name)} />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 我的工具 */}
            {!filtering && (
              <section aria-labelledby="sec-mine" className="mb-6">
                <SectionHead id="sec-mine" icon={Star} title="我的工具" note={`${pinned.length} 个收藏`} />
                {pinned.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-[13px] text-muted-foreground">
                    还没有收藏任何工具 —— 点工具卡右上角的 ★ 收藏，常用工具一键直达。
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                    {pinned.map((s) => {
                      const t = toolById.get(s.tool_id);
                      const name = t?.name ?? s.external_name ?? s.tool_id;
                      const downloaded = Boolean(s.path);
                      return (
                        <div key={s.tool_id} className="flex min-h-12 items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 shadow-sm">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                            <Package size={15} aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium" title={name}>{name}</span>
                            <span className="block text-[11px] text-muted-foreground">
                              {downloaded ? "已下载 · 可启动" : s.source === "manual" ? "本地程序" : "尚未下载"}
                            </span>
                          </span>
                          {downloaded || s.source === "manual" ? (
                            <LaunchBtn onClick={() => launch(s.tool_id, name)} />
                          ) : t ? (
                            <MiniBtn label="下载" onClick={() => download(t)} busy={Boolean(tasks[`tb:${t.id}`])} />
                          ) : null}
                          <button
                            type="button"
                            aria-label={`取消收藏 ${name}`}
                            className="flex size-8 items-center justify-center rounded-md text-warn transition-colors hover:bg-warn/10"
                            onClick={() => togglePin(s.tool_id)}
                          >
                            <Star size={14} aria-hidden fill="currentColor" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* 全部工具（按类别分组） */}
            <section aria-labelledby="sec-all">
              <SectionHead
                id="sec-all"
                icon={Inbox}
                title="全部工具"
                note={filtering ? `匹配 ${filtered.length} 个` : `共 ${tools.length} 个`}
              />
              {filtering && filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-2.5 py-16 text-muted-foreground">
                  <Search size={26} aria-hidden className="opacity-40" />
                  <p className="text-[13px]">没有符合条件的工具</p>
                  <button
                    type="button"
                    className="min-h-8 rounded-md border border-input bg-card px-3 text-[12px] transition-colors hover:bg-accent"
                    onClick={() => {
                      setQuery("");
                      setTag("全部");
                    }}
                  >
                    清空筛选
                  </button>
                </div>
              ) : (
                <div className={cn(filtering && filtered.length > 0 && "space-y-5")}>
                  {categories.map((cat) => {
                    const catTools = filtered.filter((t) => t.category === cat.id);
                    if (filtering && catTools.length === 0) return null;
                    const open = catExpanded(cat.id);
                    return (
                      <div key={cat.id} className={cn(!filtering && "mb-5")}>
                        <button
                          type="button"
                          className="nav-group-head flex min-h-10 w-full items-center gap-1.5 rounded-md px-1 text-[13px] font-semibold text-sidebar-nav transition-colors hover:text-foreground"
                          aria-expanded={open}
                          onClick={() => onToggleCategory(cat.id)}
                        >
                          <span className="nav-chevron text-muted-foreground" data-open={open}>▸</span>
                          {cat.name}
                          <span className="rounded-full bg-secondary px-1.5 text-[11px] tabular-nums text-secondary-foreground">
                            {catTools.length}
                          </span>
                        </button>
                        {open && (
                          <div className="anim-collapse-down mt-1.5">
                            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                              {catTools.map((t) => (
                                <ToolCard
                                  key={t.id}
                                  tool={t}
                                  shortcut={shortcutByTool.get(t.id)}
                                  task={tasks[`tb:${t.id}`]}
                                  readOnly={readOnly}
                                  onPin={() => togglePin(t.id)}
                                  onDownload={() => download(t)}
                                  onLaunch={() => launch(t.id, t.name)}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* 底部说明 */}
            <div className="mt-8 border-t border-border pt-4 text-center">
              <p className="text-[11px] text-muted-foreground">
                已下载的工具会出现在「快捷启动」的外部工具区；自研教学工具与内容包在「下载中心」获取。
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── 子组件（同文件内联，紧耦合）──

function SectionHead({ id, icon: Icon, title, note }: { id: string; icon: typeof Star; title: string; note?: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <Icon size={14} aria-hidden className="text-brand" />
      <h2 id={id} className="font-display text-[14px] font-bold tracking-wide">{title}</h2>
      {note && <span className="text-[11px] text-muted-foreground">{note}</span>}
    </div>
  );
}

function ToolCard({
  tool,
  shortcut,
  task,
  readOnly,
  onPin,
  onDownload,
  onLaunch,
}: {
  tool: ToolboxTool;
  shortcut?: ToolShortcut;
  task?: { progress: number; done: boolean };
  readOnly: boolean;
  onPin: () => void;
  onDownload: () => void;
  onLaunch: () => void;
}) {
  const downloaded = Boolean(shortcut?.path);
  return (
    <article className="group relative flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <button
        type="button"
        aria-label={shortcut?.pinned ? `取消收藏 ${tool.name}` : `收藏 ${tool.name}`}
        aria-pressed={Boolean(shortcut?.pinned)}
        className={cn(
          "absolute right-2.5 top-2.5 flex size-8 items-center justify-center rounded-md transition-colors",
          shortcut?.pinned
            ? "text-warn hover:bg-warn/10"
            : "text-muted-foreground opacity-0 hover:bg-accent hover:text-warn focus-visible:opacity-100 group-hover:opacity-100",
        )}
        onClick={onPin}
      >
        <Star size={15} aria-hidden fill={shortcut?.pinned ? "currentColor" : "none"} />
      </button>

      <div className="flex items-start gap-2.5 pr-8">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Package size={17} aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-[14px] font-semibold leading-snug" title={tool.name}>
            {tool.name}
          </h3>
          <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
            {tool.license} · {tool.size_bytes > 0 ? formatBytes(tool.size_bytes) : "零分发"}
          </p>
        </div>
      </div>

      <p className="mt-2 line-clamp-2 min-h-8 text-[12px] leading-relaxed text-muted-foreground">
        {tool.description}
      </p>

      {/* 可见角标：推荐 / 便携 / Win7 兼容 / 已下载 */}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {tool.recommend && (
          <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand">推荐</span>
        )}
        {tool.portable && (
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">便携版</span>
        )}
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[11px]",
            tool.win7_ok ? "bg-ok/12 text-ok" : "bg-muted text-muted-foreground",
          )}
          title={tool.win7_ok ? "支持 Windows 7" : "需要 Windows 10 及以上"}
        >
          Win7 {tool.win7_ok ? "✓" : "✗"}
        </span>
        {downloaded && (
          <span className="flex items-center gap-0.5 rounded bg-ok/12 px-1.5 py-0.5 text-[11px] text-ok">
            <CheckCircle2 size={10} aria-hidden />已下载
          </span>
        )}
      </div>

      <div className="mt-auto flex items-center gap-2 pt-3">
        <a
          href={tool.homepage.startsWith("http") ? tool.homepage : undefined}
          target="_blank"
          rel="noreferrer noopener"
          className="flex min-h-9 items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          title="访问项目主页"
        >
          <ExternalLink size={12} aria-hidden />主页
        </a>
        <div className="ml-auto flex-1 basis-32">
          {task ? (
            <div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="progress-stripes h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${task.progress}%` }} />
              </div>
              <p className="mt-0.5 text-right text-[11px] tabular-nums text-muted-foreground">{Math.round(task.progress)}%</p>
            </div>
          ) : downloaded ? (
            <ActionButton variant="launch" onClick={onLaunch} />
          ) : readOnly ? (
            <button type="button" disabled className="min-h-9 w-full cursor-not-allowed rounded-md border border-border bg-muted/50 text-[13px] text-muted-foreground">
              离线不可下载
            </button>
          ) : (
            <ActionButton variant="download" onClick={onDownload} />
          )}
        </div>
      </div>
    </article>
  );
}

function ActionButton({ variant, onClick }: { variant: "download" | "launch"; onClick: () => void }) {
  const launch = variant === "launch";
  return (
    <button
      type="button"
      className={cn(
        "flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md text-[13px] font-medium transition-all active:scale-[0.99]",
        launch
          ? "border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
          : "bg-primary text-primary-foreground hover:opacity-90",
      )}
      onClick={onClick}
    >
      {launch ? <Play size={13} aria-hidden /> : <Download size={13} aria-hidden />}
      {launch ? "启动" : "下载"}
    </button>
  );
}

function LaunchBtn({ enabled = true, onClick }: { enabled?: boolean; onClick: () => void }) {
  if (!enabled) return null;
  return (
    <button
      type="button"
      className="flex min-h-8 items-center gap-1 rounded-md bg-primary/10 px-2.5 text-[12px] font-medium text-primary transition-colors hover:bg-primary/20"
      onClick={onClick}
    >
      <Play size={11} aria-hidden />启动
    </button>
  );
}

function MiniBtn({ label, onClick, busy }: { label: string; onClick: () => void; busy?: boolean }) {
  return (
    <button
      type="button"
      disabled={busy}
      className="flex min-h-8 items-center gap-1 rounded-md border border-input bg-card px-2.5 text-[12px] transition-colors hover:bg-accent disabled:opacity-60"
      onClick={onClick}
    >
      <Download size={11} aria-hidden />{label}
    </button>
  );
}

function PackButton({ icon: Icon, label, onClick }: { icon: typeof Star; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="flex min-h-10 items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-[12px] text-foreground transition-colors hover:bg-accent"
      onClick={onClick}
    >
      <Icon size={13} aria-hidden />
      <span className="max-md:hidden">{label}</span>
    </button>
  );
}
