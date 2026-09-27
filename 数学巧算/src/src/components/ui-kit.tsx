// 数学巧算 · 基础 UI 件（Btn / Panel / PageHead / ProgressBar / Stars / StepDots）
// 参考英语陪练 WebH5 ui-kit.tsx：tap-target、圆角、active 反馈、lit 语义
import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ------------------------------- Btn ------------------------------- */
type Variant = "primary" | "soft" | "ghost" | "lit" | "warm";
type Size = "md" | "lg" | "sm";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-soft hover:bg-[var(--primary-deep)] active:bg-[var(--primary-deep)]",
  soft: "bg-secondary text-secondary-foreground hover:bg-accent",
  ghost: "bg-transparent text-foreground hover:bg-secondary",
  lit: "bg-lit text-on-lit shadow-soft hover:brightness-105",
  warm: "bg-warm text-on-lit shadow-soft hover:brightness-105",
};

const SIZE: Record<Size, string> = {
  sm: "min-h-10 px-3.5 text-[15px] rounded-xl",
  md: "min-h-12 px-5 text-base rounded-2xl",
  lg: "min-h-14 px-7 text-lg rounded-2xl",
};

export function Btn({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      {...rest}
      className={cn(
        "tap-target inline-flex items-center justify-center gap-2 font-semibold tracking-wide",
        "transition-[transform,background-color,box-shadow] duration-200 ease-out",
        "active:scale-[0.975] disabled:pointer-events-none disabled:opacity-45",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
    >
      {children}
    </button>
  );
}

/* -------------------------------- Panel -------------------------------- */
export function Panel({
  className,
  children,
  as = "div",
}: {
  className?: string;
  children: ReactNode;
  as?: "div" | "section" | "article" | "ol";
}) {
  const As = as as "div";
  return (
    <As className={cn("panel-border rounded-3xl border bg-card shadow-soft", className)}>
      {children}
    </As>
  );
}

/* ----------------------------- Page header ---------------------------- */
export function PageHead({
  eyebrow,
  title,
  titleBadge,
  desc,
  right,
}: {
  eyebrow?: string;
  title: string;
  titleBadge?: ReactNode;
  desc?: string | ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-4 px-1 pb-5">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[13px] font-semibold uppercase tracking-[0.16em] text-primary-deep">
            {eyebrow}
          </p>
        )}
        <h1 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[22px] font-extrabold leading-tight text-foreground">
          {title}
          {titleBadge}
        </h1>
        {desc && <div className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">{desc}</div>}
      </div>
      {right}
    </header>
  );
}

/* ----------------------------- Back button ---------------------------- */
export function BackBtn({ onClick, label = "返回" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="tap-target -ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] hover:bg-secondary"
    >
      ←
    </button>
  );
}

/* ----------------------------- ProgressBar ---------------------------- */
export function ProgressBar({
  value,
  className,
  tone = "primary",
}: {
  /** 0-1 */
  value: number;
  className?: string;
  tone?: "primary" | "lit";
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", tone === "lit" ? "bg-lit" : "bg-primary")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* -------------------------------- Stars -------------------------------- */
export function Stars({ n, size = 20 }: { n: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${n} 星`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= n ? "text-[var(--warm)]" : "text-[var(--idle)]"} style={{ fontSize: size }}>
          ★
        </span>
      ))}
    </span>
  );
}

/* ------------------------------ StepDots ------------------------------ */
export function StepDots({
  total,
  current,
  labels,
}: {
  total: number;
  current: number;
  labels?: string[];
}) {
  return (
    <ol className="flex items-center gap-1" role="tablist">
      {Array.from({ length: total }, (_, i) => (
        <li key={i} className="flex items-center gap-1">
          {i > 0 && <span className={cn("h-0.5 w-2", i <= current ? "bg-primary" : "bg-muted")} />}
          <span
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold",
              i === current
                ? "bg-primary text-primary-foreground"
                : i < current
                  ? "bg-lit text-on-lit"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {i + 1}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------ Badge Pill ------------------------------ */
export function Pill({
  children,
  tone = "secondary",
  className,
}: {
  children: ReactNode;
  tone?: "secondary" | "lit" | "warm" | "sky" | "idle";
  className?: string;
}) {
  const tones = {
    secondary: "bg-secondary text-secondary-foreground",
    lit: "bg-lit-soft text-[var(--lit)]",
    warm: "bg-warm-soft text-[var(--warm)]",
    sky: "bg-sky-soft text-[var(--sky)]",
    idle: "bg-muted text-muted-foreground",
  } as const;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}

/* ------------------------------ EmptyState ------------------------------ */
export function EmptyState({ icon, title, desc }: { icon: string; title: string; desc?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-14 text-center">
      <span className="text-5xl">{icon}</span>
      <p className="text-[16px] font-bold text-foreground">{title}</p>
      {desc && <p className="max-w-[260px] text-[13px] leading-relaxed text-muted-foreground">{desc}</p>}
    </div>
  );
}