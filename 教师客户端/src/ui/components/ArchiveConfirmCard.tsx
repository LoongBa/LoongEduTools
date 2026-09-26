// D11 §5 素材归档 · 确认卡片：检测到新下载 → 自动识别预填（可编辑）+ 级联四字段
// + 置信度徽章 + 「下次同类自动整理」记忆偏好 + 确认/忽略。
// 版权红线（D09/§1.2）：卡片固定展示「课件内容仅供个人教学和学习使用」。
import { useState } from "react";
import {
  Archive,
  BookOpen,
  CircleCheck,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  RotateCcw,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/format";
import {
  ARCHIVE_GRADES,
  ARCHIVE_SUBJECTS,
  ARCHIVE_VERSIONS,
  ARCHIVE_VOLUMES,
  detectPatternFor,
  fileKindLabel,
  VERSIONS_BY_SUBJECT,
} from "@/lib/archiveDetect";
import type { ArchiveMeta, PendingArchive } from "@/lib/types";

interface Props {
  item: PendingArchive;
  /** 确认归档：meta=最终分类；remember=「下次同类自动整理」（写规则） */
  onConfirm: (id: string, meta: ArchiveMeta, remember: boolean) => void;
  /** 忽略：留在下载目录不归档 */
  onIgnore: (id: string) => void;
  /** 关闭卡片（不处理，文件仍留待确认队列） */
  onClose: () => void;
}

const KIND_ICON: Record<string, typeof FileText> = {
  "教材 PDF": FileText,
  "课堂图片": FileImage,
  "音频": FileAudio,
  "视频": FileVideo,
  "其它文件": FileText,
};

const CONFIDENCE_META: Record<PendingArchive["confidence"], { label: string; cls: string }> = {
  high: { label: "自动识别", cls: "border-ok/40 bg-ok/10 text-ok" },
  medium: { label: "部分识别 · 请确认", cls: "border-warn/40 bg-warn/10 text-warn" },
  low: { label: "请手动归类", cls: "border-border bg-muted/40 text-muted-foreground" },
};

/** 选择框统一样式（级联：父未选 → 禁用占位） */
function Select({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string;
  options: readonly string[];
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      className="min-h-8 w-full rounded-md border border-input bg-card px-2 text-[12.5px] text-foreground outline-none transition-colors hover:bg-accent disabled:opacity-40 disabled:hover:bg-card"
      onChange={(e) => onChange(e.target.value)}
      disabled={options.length === 0}
      aria-label={placeholder}
    >
      <option value="" disabled>
        {options.length === 0 ? placeholder : "请选择"}
      </option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function ArchiveConfirmCard({ item, onConfirm, onIgnore, onClose }: Props) {
  // 级联状态：初始值取自动识别预填（可编辑；父变更 → 子清空）
  const [subject, setSubject] = useState(item.meta?.subject ?? "");
  const [version, setVersion] = useState(item.meta?.version ?? "");
  const [grade, setGrade] = useState(item.meta?.grade ?? "");
  const [volume, setVolume] = useState<ArchiveMeta["volume"]>(item.meta?.volume ?? "上册");
  const [remember, setRemember] = useState(false);

  // 级联数据源：版本随学科过滤；年级/册次全局
  const versionOptions = subject ? (VERSIONS_BY_SUBJECT[subject] ?? [...ARCHIVE_VERSIONS]) : [];
  const gradeOptions = [...ARCHIVE_GRADES];
  const volumeOptions = [...ARCHIVE_VOLUMES] as ArchiveMeta["volume"][];

  const KindIcon = KIND_ICON[fileKindLabel(item.name)] ?? FileText;
  const conf = CONFIDENCE_META[item.confidence];

  const canConfirm = Boolean(subject && version && grade);

  const submit = () => {
    if (!canConfirm) return;
    onConfirm(item.id, { subject, version, grade, volume }, remember);
  };

  const changeSubject = (v: string) => {
    setSubject(v);
    setVersion(""); // 父变更 → 子清空（D11 §5.3 反模式禁止）
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-label="确认素材归档">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-xl">
        {/* 头：检测到新下载 */}
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <Archive size={18} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-[15px] font-bold">检测到新下载</h3>
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-[12px] text-muted-foreground" title={item.path}>
              <KindIcon size={12} aria-hidden className="shrink-0" />
              <span className="truncate">{item.name}</span>
              <span className="shrink-0 tabular-nums">（{formatBytes(item.size_bytes)} · {fileKindLabel(item.name)}）</span>
            </p>
          </div>
          <button
            type="button"
            aria-label="稍后处理"
            title="关闭卡片（文件仍保留在待确认队列）"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent"
            onClick={onClose}
          >
            <X size={14} aria-hidden />
          </button>
        </div>

        {/* 版权红线（必显，D09） */}
        <p className="mt-3 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-[11.5px] leading-relaxed text-foreground">
          <BookOpen size={12} aria-hidden className="mr-1 inline shrink-0 text-warn" />
          课件内容仅供个人教学和学习使用，请勿对外分发。
        </p>

        {/* 识别置信度 */}
        <div className="mt-3 flex items-center gap-2">
          <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium", conf.cls)}>
            {item.confidence === "high" && <CircleCheck size={10} aria-hidden className="mr-1 inline" />}
            {item.confidence === "medium" && <RotateCcw size={10} aria-hidden className="mr-1 inline" />}
            {conf.label}
          </span>
          <span className="text-[11px] text-muted-foreground">可修改以下分类，确认后按此归档</span>
        </div>

        {/* 级联四字段 */}
        <div className="mt-3.5 grid grid-cols-2 gap-2.5">
          <Field label="学科">
            <Select value={subject} options={[...ARCHIVE_SUBJECTS]} placeholder="请先选择学科" onChange={changeSubject} />
          </Field>
          <Field label="版本">
            <Select value={version} options={versionOptions} placeholder={subject ? "请选择版本" : "请先选学科"} onChange={setVersion} />
          </Field>
          <Field label="年级">
            <Select value={grade} options={gradeOptions} placeholder="请选择年级" onChange={setGrade} />
          </Field>
          <Field label="册次">
            <div className="flex h-8 items-stretch gap-1 rounded-md border border-input bg-card p-0.5" role="radiogroup" aria-label="册次">
              {volumeOptions.map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={volume === v}
                  className={cn(
                    "flex-1 rounded text-[12px] transition-colors",
                    volume === v ? "bg-brand font-medium text-on-primary" : "text-muted-foreground hover:bg-accent",
                  )}
                  onClick={() => setVolume(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </Field>
        </div>

        {/* 记忆偏好（§5.4） */}
        <label className="mt-3.5 flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="size-3.5 accent-brand"
          />
          <span className="text-[12.5px] text-foreground">下次同类文件自动整理（不再询问）</span>
          <span className="ml-auto text-[11px] text-muted-foreground">同类 = 文件名包含「{detectPatternFor(item.name)}」</span>
        </label>

        {/* 操作 */}
        <div className="mt-4 flex items-center gap-2.5">
          <button
            type="button"
            className="min-h-9 rounded-lg border border-input bg-card px-4 text-[12.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => onIgnore(item.id)}
          >
            忽略（留在下载目录）
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            title={canConfirm ? "归档到本机素材目录" : "请补全学科/版本/年级"}
            className="ml-auto min-h-9 rounded-lg bg-primary px-5 text-[12.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            onClick={submit}
          >
            确认归档
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
