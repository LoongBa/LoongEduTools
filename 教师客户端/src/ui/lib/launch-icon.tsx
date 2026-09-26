// 一键启动条目：图标解析 + 共享渲染（侧栏 rail / 快捷启动卡片 / 配置弹窗预览共用）
// 组件内裸色值为受控例外：按 id 散列的纯展示 hue，与 Favicon 同源逻辑。
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LaunchConfig } from "./types";

/** 按字符串散列出 0-359 的色相 */
export function hashHue(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** 默认背景色：id 散列 oklch 色相 */
export function defaultBg(id: string): string {
  return `oklch(0.55 0.15 ${hashHue(id)})`;
}

/** 文字图标缺省取名称首字 */
export function defaultText(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}

/** 菜单名 ≤4 字（超出截断） */
export function clampMenuLabel(s: string): string {
  return s.slice(0, 4);
}

export interface ResolvedIcon {
  kind: "text" | "image";
  text: string;
  image?: string;
  bg: string;
  fg: string;
}

export function resolveIcon(itemId: string, name: string, cfg?: LaunchConfig): ResolvedIcon {
  const kind = cfg?.iconKind ?? "text";
  return {
    kind,
    text: cfg?.iconText?.trim() || defaultText(name),
    image: kind === "image" ? cfg?.iconImage : undefined,
    bg: cfg?.bgColor?.trim() || defaultBg(itemId),
    fg: cfg?.fgColor?.trim() || "#ffffff",
  };
}

/** 图片加载失败时回退为文字块 */
function IconImage({ src, alt, fallback, className }: { src: string; alt: string; fallback: string; className?: string }) {
  return (
    <img
      src={src}
      alt={alt}
      className={cn("size-full rounded-[inherit] object-cover", className)}
      onError={(e) => {
        e.currentTarget.replaceWith(document.createTextNode(fallback));
      }}
    />
  );
}

/** 通用图标块：size 传像素数值；rounded 传圆角 class */
export function LaunchIconBlock({
  itemId,
  name,
  cfg,
  size = 28,
  rounded = "rounded-lg",
  className,
}: {
  itemId: string;
  name: string;
  cfg?: LaunchConfig;
  size?: number;
  rounded?: string;
  className?: string;
}) {
  const r = resolveIcon(itemId, name, cfg);
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center overflow-hidden font-bold leading-none", rounded, className)}
      style={{ width: size, height: size, backgroundColor: r.bg, color: r.fg, fontSize: Math.round(size * 0.42) }}
    >
      {r.kind === "image" && r.image ? (
        <IconImage src={r.image} alt="" fallback={r.text} />
      ) : (
        r.text
      )}
    </span>
  );
}

/** lucide 图标版兼容入口：仅当用户在启动中心显式配置过图标时才替换为色块，否则保持矢量图标以与普通菜单项一致 */
export function RailIconOrFallback({
  itemId,
  name,
  cfg,
  icon: Icon,
  size = 16,
  blockSize = 26,
}: {
  itemId: string;
  name: string;
  cfg?: LaunchConfig;
  icon: LucideIcon;
  size?: number;
  /** 配置态色块边长（px） */
  blockSize?: number;
}) {
  const configured = !!cfg?.iconKind;
  if (configured && cfg) {
    return <LaunchIconBlock itemId={itemId} name={name} cfg={cfg} size={blockSize} rounded="rounded-md" />;
  }
  return <Icon size={size} strokeWidth={2} aria-hidden />;
}
