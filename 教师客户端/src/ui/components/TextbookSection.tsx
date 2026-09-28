// 下载中心·原版教材分区：本机教材**单文件**导入与管理（不提供云端下载）
// 流程：教师手头单个 PDF 教材文件 → 选择文件后真实魔数/书名识别 → 随随身工具包一起打包
// 说明：当前按「1 个 PDF = 1 本教材」导入（扩展下载功能完全完成后，再拓展为整套教材资源）。
import { useMemo, useState } from "react";
import {
  Check,
  ExternalLink,
  FileUp,
  Globe,
  Hash,
  Image,
  PackageCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { open } from "@tauri-apps/plugin-dialog";
import { TEXTBOOK_EXT_INSTALL_URL } from "@/lib/mockData";
import { formatBytes } from "@/lib/format";
import { guessSubject } from "@/lib/pdf-scan";
import { api } from "@/api";
import type { LocalTextbook } from "@/lib/types";

interface Props {
  items: LocalTextbook[];
  onItems: (next: LocalTextbook[]) => void;
}

/** 单文件识别结果 → 本机教材条目（1 文件 = 1 本教材） */
function toTextbook(f: Awaited<ReturnType<typeof api.textbookSniff>>, filePath: string): LocalTextbook {
  return {
    id: `tbk-${Date.now().toString(36)}`,
    name: f.title ?? f.name.replace(/\.pdf$/i, ""),
    subject: guessSubject(f.name, f.title ? [f.title] : []),
    dir: filePath,
    file_count: 1,
    size_bytes: f.size_bytes,
    formats: "PDF ×1",
    packed: true,
    imported_at: new Date().toISOString(),
  };
}

export function TextbookSection({ items, onItems }: Props) {
  const [filter, setFilter] = useState("全部");
  const [importing, setImporting] = useState(false);

  const subjects = useMemo(() => {
    const out: string[] = [];
    for (const t of items) if (!out.includes(t.subject)) out.push(t.subject);
    return out;
  }, [items]);

  const visible = filter === "全部" ? items : items.filter((t) => t.subject === filter);
  const packedCount = items.filter((t) => t.packed).length;
  const totalSize = items.reduce((a, t) => a + t.size_bytes, 0);

  /** 单文件导入：选 1 个 PDF（tauri dialog filter pdf）→ Rust textbook_sniff（魔数/书名识别） */
  const importFile = async () => {
    const picked = await open({
      directory: false,
      multiple: false,
      filters: [{ name: "教材 PDF", extensions: ["pdf"] }],
    });
    if (typeof picked !== "string" || !picked) return; // 用户取消
    setImporting(true);
    try {
      const f = await api.textbookSniff(picked);
      const next = toTextbook(f, picked);
      onItems([next, ...items]);
      toast.success(`已导入「${next.name}」`, {
        description: `识别为 ${next.subject} · PDF v${f.pdf_version ?? "?"} · ${formatBytes(f.size_bytes)}，已纳入工具包打包。`,
      });
    } catch (e) {
      toast.error(`导入失败：${String(e)}`);
    } finally {
      setImporting(false);
    }
  };

  const togglePacked = (id: string) =>
    onItems(items.map((t) => (t.id === id ? { ...t, packed: !t.packed } : t)));

  const removeItem = (t: LocalTextbook) => {
    onItems(items.filter((x) => x.id !== t.id));
    toast.info(`已移除「${t.name}」的索引`, { description: "仅移出客户端列表，本机文件未被删除。" });
  };

  return (
    <div className="space-y-4">
      {/* 工作流说明条：单个 PDF 导入 → 随包打包 */}
      <section className="rounded-xl border border-border bg-muted/30 p-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <Globe size={16} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[13px] font-semibold">导入单个 PDF 教材文件</h2>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              本分类不提供客户端内下载：选择本机已有的单个 PDF 教材文件导入（1 个文件 = 1 本教材），
              客户端真实校验 PDF 格式并尝试识别书名。整套多文件教材资源将在浏览器「教材下载」扩展
              功能完成后支持，届时自动升级导入形态。
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
            { n: 1, t: "选择文件", d: "点右上「导入 PDF 教材文件」，选单个教材 PDF" },
            { n: 2, t: "真实识别", d: "Rust 校验 %PDF 魔数、读版本与 /Title 书名" },
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

      {/* 统计 + 学科 chips + 导入按钮 */}
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
          {items.length} 本 · {formatBytes(totalSize)} · 已纳入打包 {packedCount}
        </span>
        <button
          type="button"
          className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3.5 text-[13px] text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          onClick={importFile}
          disabled={importing}
        >
          <FileUp size={13} aria-hidden />
          {importing ? "识别中…" : "导入 PDF 教材文件…"}
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground">
          <Image size={28} aria-hidden className="opacity-50" />
          <p className="text-[13px]">还没有本机教材。点右上「导入 PDF 教材文件」，选择单个教材 PDF。</p>
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

const COVER_GRADIENTS = [
  "from-rose-100 to-rose-300/70 text-rose-600",
  "from-sky-100 to-sky-300/70 text-sky-600",
  "from-amber-100 to-amber-300/70 text-amber-600",
  "from-emerald-100 to-emerald-300/70 text-emerald-600",
  "from-violet-100 to-violet-300/70 text-violet-600",
];

function TextbookCard({
  item,
  onTogglePacked,
  onRemove,
}: {
  item: LocalTextbook;
  onTogglePacked: () => void;
  onRemove: () => void;
}) {
  // 封面色按 id 稳定取渐变色（同教材始终同色）
  const grad =
    COVER_GRADIENTS[
      Math.abs([...item.id].reduce((a, c) => a + c.charCodeAt(0), 0)) % COVER_GRADIENTS.length
    ];

  return (
    <article className="group flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex gap-3">
        {/* 放大版封面预览：书封样式渐变块 + 书名首字（可辨识，替代原 36px 小图标） */}
        <div
          className={cn(
            "flex aspect-[3/4] w-[74px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg bg-gradient-to-br transition-transform group-hover:scale-[1.03]",
            grad,
          )}
          aria-hidden
        >
          <span className="text-[30px] font-bold leading-none drop-shadow-sm">
            {(item.name.trim()[0] ?? "书").toUpperCase()}
          </span>
          <Image size={16} className="opacity-70" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[14px] font-semibold leading-snug" title={item.name}>
            {item.name}
          </h3>
          <span className="mt-1.5 inline-block rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
            {item.subject}
          </span>
          <p className="mt-1.5 break-all text-[11px] leading-snug text-muted-foreground" title={item.dir}>
            {item.dir}
          </p>
        </div>
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
        {item.file_count} 个文件 · {formatBytes(item.size_bytes)} · {item.formats}
      </p>

      <div className="mt-1 flex flex-wrap items-center gap-1">
        <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">本机导入</span>
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