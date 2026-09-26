// 全站共享 UI 基础件：按钮三级、卡片、分区标题、组标签、进度条、空状态、Toast。
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

/* ---------- 按钮体系（主/次/幽灵 + 危险） ---------- */
const btn = cva(
  "press inline-flex items-center justify-center gap-2 select-none font-medium tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-45",
  {
    variants: {
      variant: {
        primary: "surface-hero text-primary-foreground shadow-lift rounded-xl",
        secondary: "bg-secondary text-secondary-foreground border border-border rounded-xl",
        ghost: "bg-transparent text-muted-foreground border border-border/70 rounded-xl hover:bg-muted",
        danger: "bg-destructive text-destructive-foreground rounded-xl",
        quiet: "bg-transparent text-foreground/80 rounded-lg",
      },
      size: {
        sm: "h-9 px-3 text-[13px] min-w-[36px]",
        md: "h-12 px-4 text-[15px] min-w-[48px]",
        lg: "h-14 px-6 text-[17px] min-w-[48px]",
        icon: "h-10 w-10 text-base",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof btn> {
  children?: ReactNode;
}

export function Btn({ variant, size, className, children, ...rest }: BtnProps) {
  return (
    <button type="button" className={cn(btn({ variant, size }), className)} {...rest}>
      {children}
    </button>
  );
}

/* ---------- 卡片 ---------- */
export const cardCva = cva("rounded-2xl bg-card text-card-foreground border border-border/70 shadow-soft", {
  variants: {
    tone: {
      solid: "",
      dashed: "border-dashed border-2 bg-card/60",
      hero: "border-transparent surface-hero text-primary-foreground shadow-lift",
      flat: "shadow-none bg-surface",
    },
    pad: { none: "", tight: "p-3", normal: "p-4", loose: "p-5" },
  },
  defaultVariants: { tone: "solid", pad: "normal" },
});

export interface CardProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardCva> {
  children?: ReactNode;
}

export function Card({ tone, pad, className, children, ...rest }: CardProps) {
  return (
    <div className={cn(cardCva({ tone, pad }), className)} {...rest}>
      {children}
    </div>
  );
}

/* ---------- 首页分区 ---------- */
export function SectionGroup({
  label,
  title,
  hint,
  children,
  delay = 0,
}: {
  label: string;
  title: string;
  hint?: string;
  children: ReactNode;
  delay?: number;
}) {
  return (
    <section className="reveal-up" data-reveal-delay={delay}>
      <header className="mb-2.5 flex items-end justify-between px-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/70">{label}</span>
          <h2 className="text-[16px] font-bold leading-none text-foreground">{title}</h2>
        </div>
        {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
      </header>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

/* ---------- 页面标题 ---------- */
export function PageTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="reveal mb-3 px-1">
      <h1 className="text-[21px] font-extrabold leading-tight tracking-tight text-foreground">{children}</h1>
      {sub ? <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

/* ---------- 顶栏 / 底栏壳 ---------- */
export function TopBar({
  onBack,
  backLabel = "返回",
  title,
  meta,
  right,
}: {
  onBack?: () => void;
  backLabel?: string;
  title: ReactNode;
  meta?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 px-1 py-2">
      {onBack ? (
        <Btn variant="ghost" size="icon" onClick={onBack} aria-label={backLabel} className="h-10 w-10 shrink-0 rounded-full text-[15px]">
          ←
        </Btn>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px] font-bold leading-tight text-foreground">{title}</div>
        {meta ? <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{meta}</div> : null}
      </div>
      {right}
    </div>
  );
}

/* ---------- 进度条（家长报告 / 掌握度） ---------- */
export function Bar({ value, total, tone = "primary" }: { value: number; total: number; tone?: "primary" | "base" | "adv" | "ach" | "warning" }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  const fill =
    tone === "base" ? "bg-badge-base" : tone === "adv" ? "bg-badge-adv" : tone === "ach" ? "bg-badge-ach" : tone === "warning" ? "bg-warning" : "bg-primary";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="presentation">
      <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ---------- 空状态 ---------- */
export function EmptyState({
  emoji,
  art,
  title,
  sub,
  action,
}: {
  emoji?: string;
  /** 插画 URL（优先展示，缺图自动回退 emoji） */
  art?: string;
  title: string;
  sub: string;
  action?: ReactNode;
}) {
  return (
    <div className="reveal flex flex-col items-center px-6 py-12 text-center">
      {art ? (
        <img
          src={art}
          alt=""
          aria-hidden="true"
          className="animate-fade-in mb-4 h-[96px] w-[96px] object-contain drop-shadow-sm"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="mb-4 grid h-20 w-20 place-items-center rounded-3xl bg-secondary text-[34px] shadow-inner">{emoji}</div>
      )}
      <p className="text-[16px] font-bold text-foreground">{title}</p>
      <p className="mt-1.5 max-w-[240px] text-[12.5px] leading-relaxed text-muted-foreground">{sub}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/* ---------- Toast ---------- */
export function Toast({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+88px)] z-[80] flex justify-center px-6">
      <div className="animate-rise rounded-full bg-foreground/88 px-4 py-2.5 text-[13px] font-medium text-background shadow-lift backdrop-blur">
        {text}
      </div>
    </div>
  );
}

/* ---------- 统计小块 ---------- */
export function Stat({ k, v, unit }: { k: string; v: ReactNode; unit?: string }) {
  return (
    <div className="rounded-xl bg-secondary/70 px-2.5 py-2 text-center">
      <div className="tnum text-[17px] font-extrabold leading-none text-foreground">
        {v}
        {unit ? <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">{unit}</span> : null}
      </div>
      <div className="mt-1 text-[10.5px] text-muted-foreground">{k}</div>
    </div>
  );
}
