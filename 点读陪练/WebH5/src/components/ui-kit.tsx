// 应用自有的基础件：按钮 / 卡片 / 日期圆点 / 环节进度条 / 星星反馈
import { type ButtonHTMLAttributes, type ElementType, type ReactNode, type Ref } from "react";
import { cn } from "@/lib/utils";
import { STAGES, stageLabel, type Stage } from "@/data/content";

/* ------------------------------- Button ------------------------------- */
type Variant = "primary" | "soft" | "ghost" | "lit";
type Size = "md" | "lg" | "sm";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-soft hover:bg-[var(--primary-deep)] active:bg-[var(--primary-deep)]",
  soft: "bg-secondary text-secondary-foreground hover:bg-accent",
  ghost: "bg-transparent text-foreground hover:bg-secondary",
  lit: "bg-lit text-on-lit shadow-soft hover:brightness-105",
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

/* -------------------------------- Card -------------------------------- */
/** 动态标签 + ref 的组合无法由 TS 自动收窄，统一转成基础元素签名后再渲染 */
type PanelProps = {
  className?: string;
  children: ReactNode;
  /** 承载语义标签；不同标签的 DOM 接口不同，故 ref 一律按 HTMLElement 收 */
  as?: "div" | "section" | "article" | "ol";
  ref?: Ref<HTMLElement>;
};

export function Panel({ className, children, as = "div", ref }: PanelProps) {
  const As = as as ElementType;
  return (
    <As
      ref={ref}
      className={cn(
        "panel-border rounded-3xl bg-card border shadow-soft",
        className,
      )}
    >
      {children}
    </As>
  );
}

/* ----------------------------- Page header ---------------------------- */
export function PageHead({
  eyebrow,
  title,
  desc,
  right,
}: {
  eyebrow?: string;
  title: string;
  desc?: string;
  right?: ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-4 px-1 pb-5">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[13px] font-semibold tracking-[0.16em] uppercase text-primary-deep">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 text-[26px] leading-tight font-bold text-foreground">
          {title}
        </h1>
        {desc && <p className="mt-1.5 text-[15px] leading-relaxed text-muted-text">{desc}</p>}
      </div>
      {right}
    </header>
  );
}

/* --------------------------- Week day dots ---------------------------- */
export function DayDots({
  lit,
  current,
  size = "md",
}: {
  lit: number[];
  current?: number;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-7 w-7 text-[12px]" : "h-9 w-9 text-[13px]";
  return (
    <div className="flex items-center gap-2" role="list" aria-label="本周打卡进度">
      {[1, 2, 3, 4, 5].map((d) => {
        const done = lit.includes(d);
        const now = current === d;
        return (
          <div key={d} className="flex flex-col items-center gap-1">
            <span
              role="listitem"
              aria-label={`Day ${d}${done ? " 已完成" : " 未完成"}`}
              className={cn(
                "relative grid place-items-center rounded-full font-bold transition-colors duration-300",
                dim,
                done
                  ? "bg-lit text-on-lit"
                  : now
                    ? "bg-warm-soft text-[var(--warm)] ring-2 ring-[var(--warm)]/45"
                    : "bg-idle text-idle-foreground",
              )}
            >
              {done ? <StarIcon className="h-4 w-4" /> : d}
            </span>
            {!done && now && (
              <span className="text-[10px] font-semibold text-[var(--warm)]">今天</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------- Stage progress bar ------------------------- */
export function StageBar({
  stages,
  index,
  onJump,
}: {
  stages: Stage[];
  index: number;
  onJump?: (i: number) => void;
}) {
  return (
    <ol className="flex items-stretch gap-1.5">
      {stages.map((s, i) => {
        const state = i < index ? "done" : i === index ? "now" : "todo";
        const clickable = state === "done" && !!onJump;
        return (
          <li key={s} className="flex-1 min-w-0">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => onJump?.(i)}
              className={cn(
                "w-full rounded-xl px-1 py-2 text-center transition-colors duration-300",
                state === "done" && "bg-lit-soft",
                state === "now" && "bg-primary text-primary-foreground shadow-soft",
                state === "todo" && "bg-secondary text-idle-foreground",
                clickable && "cursor-pointer hover:brightness-[0.98]",
              )}
              aria-current={state === "now" ? "step" : undefined}
            >
              <span className="block text-[11px] leading-none opacity-80">
                {state === "done" ? "已完成" : state === "now" ? "进行中" : "待进行"}
              </span>
              <span className="mt-1 block truncate text-[13px] font-bold leading-none">
                {stageLabel(s)}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function allStages(): Stage[] {
  return STAGES;
}

/* ------------------------------ Feedback ------------------------------ */
/** 温和的星星飘散：只在完成时刻出现，不刷屏 */
export function StarBurst({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-1/2 z-20 h-0" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="anim-star absolute left-1/2 text-lit"
          style={{
            animationDelay: `${i * 110}ms`,
            marginLeft: `${(i - 2) * 26}px`,
          }}
        >
          <StarIcon className="h-5 w-5" filled={i % 2 === 0} />
        </span>
      ))}
    </div>
  );
}

/* -------------------------------- Icons ------------------------------- */
export function SpeakerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M11 5 6.5 8.8H3v6.4h3.5L11 19z" />
      <path d="M15.6 9.2a4 4 0 0 1 0 5.6M18.4 6.4a8 8 0 0 1 0 11.2" />
    </svg>
  );
}

export function StarIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" className={className} aria-hidden>
      <path d="m12 3.6 2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z" />
    </svg>
  );
}

export function MicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" className={className} aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
    </svg>
  );
}

export function TurtleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M4 14a8 8 0 0 1 16 0z" />
      <path d="M2.8 14h18.4M8 17.5v1.8M16 17.5v1.8M20.6 12.4l1.8-.9" />
    </svg>
  );
}

export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}

export function ArrowIcon({ className, dir = "right" }: { className?: string; dir?: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {dir === "right" ? <path d="M5 12h13m-5-6 6 6-6 6" /> : <path d="M19 12H6m5-6-6 6 6 6" />}
    </svg>
  );
}

export function PrintIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M7 9V4h10v5M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
      <rect x="7" y="14" width="10" height="6" rx="1" />
    </svg>
  );
}
