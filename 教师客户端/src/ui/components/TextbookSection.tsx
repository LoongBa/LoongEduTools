// 下载中心·原版教材分区：本机教材目录的真实扫描导入与管理（不提供云端下载）
// 流程：浏览器「教材下载」扩展抓取 → 选择目录后真实遍历 PDF/图片并粗识别 → 随随身工具包一起打包
import { useMemo, useState } from "react";
import {
  Check,
  ExternalLink,
  FolderSearch,
  Globe,
  Hash,
  Image,
  Loader,
  PackageCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { open } from "@tauri-apps/plugin-dialog";
import { TEXTBOOK_EXT_INSTALL_URL } from "@/lib/mockData";
import { formatBytes } from "@/lib/format";
import { guessSubject } from "@/lib/pdf-scan";
import { api, TextbookScanResult } from "@/api";
import type { LocalTextbook } from "@/lib/types";

interface Props {
  items: LocalTextbook[];
  onItems: (next: LocalTextbook[]) => void;
}

/** 扫描结果 → 本机教材条目 */
function toTextbook(r: TextbookScanResult): LocalTextbook {
  const valid = r.pdfs.filter((p) => p.valid);
  const titles = valid.map((p) => p.title).filter((t): t is string => !!t);
  return {
    id: `tbk-${Date.now().toString(36)}`,
    name: titles[0] ?? r.dir_name,
    subject: guessSubject(r.dir_name, titles),
    dir: r.dir_name,
    file_count: valid.length + r.image_count,
    size_bytes: r.total_bytes,
    formats: `PDF ×${valid.length}${r.image_count > 0 ? ` · 图片 ×${r.image_count}` : ""}`,
    packed: true,
    imported_at: new Date().toISOString(),
  };
}

export function TextbookSection({ items, onItems }: Props) {
  const [filter, setFilter] = useState("全部");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<TextbookScanResult | null>(null);

  const subjects = useMemo(() => {
    const out: string[] = [];
    for (const t of items) if (!out.includes(t.subject)) out.push(t.subject);
    return out;
  }, [items]);

  const visible = filter === "全部" ? items : items.filter((t) => t.subject === filter);
  const packedCount = items.filter((t) => t.packed).length;
  const totalSize = items.reduce((a, t) => a + t.size_bytes, 0);
  const scanning = progress !== null;

  /** 真实扫描：选目录（tauri dialog）→ Rust textbook_scan（PDF 魔数校验与 /Title 粗识别） */
  const scanFolder = async () => {
    setProgress({ done: 0, total: 0 });
    try {
      // 目录选择：tauri-plugin-dialog（替代浏览器的 showDirectoryPicker），取消返回 null 静默
      const picked = await open({ directory: true, multiple: false });
      if (typeof picked !== "string" || !picked) return;
      const r = await api.textbookScan(picked);
      const validPdfs = r.pdfs.filter((p) => p.valid).length;
      if (validPdfs === 0 && r.image_count === 0) {
        toast.error(`「${r.dir_name}」里没有找到可用的 PDF 或图片`, {
          description: r.pdfs.length > 0 ? `发现 ${r.pdfs.length} 个 .pdf 文件，但均不是有效的 PDF 格式。` : undefined,
        });
        return;
      }
      const next = toTextbook(r);
      onItems([next, ...items]);
      setReport(r);
      const titled = r.pdfs.filter((p) => p.valid && p.title).length;
      toast.success(`已导入「${next.name}」`, {
        description: `识别到 ${validPdfs} 个有效 PDF${titled > 0 ? `（其中 ${titled} 个带书名）` : ""}${r.image_count > 0 ? `、${r.image_count} 张图片` : ""}，已纳入工具包打包。`,
      });
    } catch (e) {
      toast.error(`扫描失败：${String(e)}`);
    } finally {
      setProgress(null);
    }
  };

  const togglePacked = (id: string) =>
    onItems(items.map((t) => (t.id === id ? { ...t, packed: !t.packed } : t)));

  const removeItem = (t: LocalTextbook) => {
    onItems(items.filter((x) => x.id !== t.id));
    toast.info(`已移除「${t.name}」的索引`, { description: "仅移出客户端列表，本机目录中的文件未被删除。" });
  };

  return (
    <div className="space-y-4">
      {/* 工作流说明条：扩展抓取 → 扫描目录 → 随包打包 */}
      <section className="rounded-xl border border-border bg-muted/30 p-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <Globe size={16} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[13px] font-semibold">用浏览器扩展抓取原版教材</h2>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              本分类不提供客户端内下载：先在浏览器安装「教材下载」扩展，在教材网页上把图片 / PDF 抓到本地，再扫描下方教材目录。
              扫描会真实读取所选目录中的文件（校验 PDF 格式并尝试识别书名），导入后的教材随随身工具包一起打包。
            </p>
          </div>
          <button
            type="button"
            className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3.5 text-[13px] text-primary-foreground transition-opacity hover:opacity-90"
            onClick={() => window.open(TEXTBOOK_EXT_INSTALL_URL, "_blank", "noopener,noreferrer")}
            title={TEXTBOOK_EXT_INSTALL_URL}
          >
            <ExternalLink size={13} aria-hidden />为浏览器安装「教材下载」扩展
          </button>
        </div>
        <ol className="mt-3 grid grid-cols-1 gap-2 border-t border-border pt-3 text-[12px] text-muted-foreground sm:grid-cols-3">
          {[
            { n: 1, t: "扩展抓取", d: "在教材网页点扩展图标，批量保存页面图片与 PDF" },
            { n: 2, t: "扫描目录", d: "选择保存到的文件夹，真实遍历其中的 PDF 并识别书名" },
            { n: 3, t: "随包打包", d: "勾选纳入工具包，导出时一并带走" },
          ].map((s) => (
            <li key={s.n} className="flex items-start gap-2">
              <span className="mt-px flex size-4.5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[10px] font-bold text-brand">
                {s.n}
              </span>
              <span>
                <b className="font-medium text-foreground">{s.t}</b> — {s.d}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* 统计 + 学科 chips + 扫描按钮 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-[12px] text-muted-foreground">学科</span>
        {["全部", ...subjects].map((c) => (
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
        <span className="ml-auto flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
          <Hash size={11} aria-hidden />
          {items.length} 套 · {formatBytes(totalSize)} · 已纳入打包 {packedCount}
        </span>
        <button
          type="button"
          className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-card px-3 text-[13px] text-foreground transition-colors hover:bg-accent disabled:opacity-60"
          onClick={scanFolder}
          disabled={scanning}
        >
          {scanning ? <Loader size={13} aria-hidden className="animate-spin" /> : <FolderSearch size={13} aria-hidden />}
          {scanning
            ? progress && progress.total > 0
              ? `扫描中 ${progress.done}/${progress.total}…`
              : "扫描中…"
            : "扫描本地教材目录…"}
        </button>
      </div>

      {report && <ScanReport result={report} onClose={() => setReport(null)} />}

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground">
          <Image size={28} aria-hidden className="opacity-50" />
          <p className="text-[13px]">还没有本机教材。先用浏览器扩展抓取，再点右上「扫描本地教材目录」。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((t) => (
            <TextbookCard key={t.id} item={t} onTogglePacked={() => togglePacked(t.id)} onRemove={() => removeItem(t)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** 最近一次扫描的明细报告（最多展示 30 条） */
function ScanReport({ result, onClose }: { result: TextbookScanResult; onClose: () => void }) {
  const valid = result.pdfs.filter((p) => p.valid);
  const titled = valid.filter((p) => p.title);
  return (
    <section className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[13px] font-semibold">扫描报告 · {result.dir_name}</h3>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          共遍历 {result.total_files} 个文件
          {result.truncated && <em className="not-italic text-warn">（文件过多，仅扫描前 800 个）</em>}
        </span>
        <button
          type="button"
          aria-label="关闭扫描报告"
          className="ml-auto text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          onClick={onClose}
        >
          收起
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
        {[
          { l: "有效 PDF", v: `${valid.length} 个`, c: "text-ok" },
          { l: "图片", v: `${result.image_count} 张`, c: "text-brand" },
          { l: "识别到书名", v: `${titled.length} 个`, c: "text-brand" },
          { l: "伪 PDF（已跳过）", v: `${result.invalid_count} 个`, c: result.invalid_count > 0 ? "text-warn" : "text-muted-foreground" },
        ].map((s) => (
          <div key={s.l} className="rounded-lg bg-muted/40 px-2.5 py-2">
            <p className="text-[11px] text-muted-foreground">{s.l}</p>
            <p className={cn("mt-0.5 text-[14px] font-semibold tabular-nums", s.c)}>{s.v}</p>
          </div>
        ))}
      </div>
      {valid.length > 0 && (
        <ul role="list" className="mt-2.5 max-h-52 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {valid.slice(0, 30).map((p) => (
            <li key={p.path} className="flex items-center gap-2 px-2.5 py-1.5 text-[12px]">
              <span className="min-w-0 flex-1 truncate" title={p.path}>
                {p.title ?? p.name}
              </span>
              {p.pdf_version && (
                <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10.5px] tabular-nums text-secondary-foreground">
                  PDF {p.pdf_version}
                </span>
              )}
              <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {formatBytes(p.size_bytes)}
              </span>
            </li>
          ))}
          {valid.length > 30 && (
            <li className="px-2.5 py-1.5 text-[11.5px] text-muted-foreground">…其余 {valid.length - 30} 个未展开</li>
          )}
        </ul>
      )}
      {result.invalid_count > 0 && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
          以下 .pdf 文件头部缺少 %PDF 标识，可能是扩展抓取时的占位或损坏文件，已跳过：
          {" "}
          {result.pdfs.filter((p) => !p.valid).slice(0, 5).map((p) => p.name).join("、")}
          {result.invalid_count > 5 ? " 等" : ""}
        </p>
      )}
    </section>
  );
}

function TextbookCard({
  item,
  onTogglePacked,
  onRemove,
}: {
  item: LocalTextbook;
  onTogglePacked: () => void;
  onRemove: () => void;
}) {
  return (
    <article className="group flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Image size={16} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-semibold leading-snug" title={item.name}>
            {item.name}
          </h3>
          <p className="mt-0.5 truncate text-[11px] tabular-nums text-muted-foreground" title={item.dir}>
            {item.dir}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
          {item.subject}
        </span>
      </div>

      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
        {item.file_count} 个文件 · {formatBytes(item.size_bytes)} · {item.formats}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">本机扫描</span>
        <span className="text-[11px] text-muted-foreground">
          导入于 {new Date(item.imported_at).toLocaleDateString("zh-CN")}
        </span>
      </div>

      <div className="mt-auto flex items-center gap-2 pt-3">
        <button
          type="button"
          aria-pressed={item.packed}
          title={item.packed ? "已纳入随身工具包，点击取消" : "点击纳入随身工具包"}
          className={cn(
            "flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-md border text-[12px] transition-colors",
            item.packed
              ? "border-ok/40 bg-ok/12 text-ok"
              : "border-input bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
          onClick={onTogglePacked}
        >
          {item.packed ? <Check size={13} aria-hidden /> : <PackageCheck size={13} aria-hidden />}
          {item.packed ? "已纳入工具包" : "纳入工具包"}
        </button>
        <button
          type="button"
          title="从列表移除（不删除本机文件）"
          aria-label={`移除 ${item.name}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-md border border-input bg-card text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 size={13} aria-hidden />
        </button>
      </div>
    </article>
  );
}
