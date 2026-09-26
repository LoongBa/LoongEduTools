// 通用浮层：遮罩 + 卡片入场；结果结算浮层（星级依次弹出、打卡行、新纪录、成就解锁）。

import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Btn } from "./ui/kit";

export function Overlay({
  open,
  onClose,
  title,
  sub,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose?: () => void;
  title: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-foreground/45 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={cn(
          "relative m-0 max-h-[88vh] w-full animate-sheet-up overflow-y-auto rounded-b-none rounded-t-3xl border border-border bg-popover p-5 text-popover-foreground shadow-lift safe-bottom",
          "sm:m-4 sm:max-w-[400px] sm:rounded-3xl",
          wide && "sm:max-w-[460px]",
        )}
      >
        <h2 className="text-[20px] font-extrabold leading-tight tracking-tight">{title}</h2>
        {sub ? <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{sub}</p> : null}
        {children ? <div className="mt-4">{children}</div> : null}
        {footer ? <div className="mt-5 space-y-2">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ---------- 星级（依次弹出） ---------- */
export function Stars({ n, size = 34 }: { n: number; size?: number }) {
  return (
    <div className="flex items-center justify-center" style={{ height: size + 8 }} aria-label={`评价 ${n} 星`}>
      {[0, 1, 2].map((i) => {
        const lit = i < n;
        return (
          <span
            key={i}
            className={cn("mx-1 inline-block leading-none", lit ? "animate-star-pop text-star" : "text-muted-foreground/30")}
            style={{ fontSize: size, animationDelay: `${120 + i * 160}ms` }}
          >
            {lit ? "★" : "☆"}
          </span>
        );
      })}
    </div>
  );
}

/* ---------- 结果摘要块 ---------- */
export function ResultSummary({
  stars,
  ms,
  errors,
  hints,
  isRecord,
  checkinNew,
  unlocked,
  badge,
}: {
  stars: number;
  ms: number;
  errors: number;
  hints: number;
  isRecord?: boolean;
  checkinNew?: boolean;
  unlocked?: string[];
  badge?: string;
}) {
  return (
    <div className="space-y-3">
      <Stars n={stars} />
      {isRecord ? (
        <div className="mx-auto w-fit rounded-full bg-success px-3 py-1 text-[11.5px] font-bold text-success-foreground shadow-soft">
          🎉 新个人纪录
        </div>
      ) : null}
      <div className="grid grid-cols-3 gap-2">
        <Cell k="用时" v={formatMs(ms)} />
        <Cell k="失误" v={`${errors}`} />
        <Cell k="提示" v={`${hints}`} />
      </div>
      {checkinNew ? (
        <div className="rounded-xl bg-warning/15 px-3 py-2 text-center text-[12px] font-semibold text-warning">
          📅 今日已打卡 · 继续保持这个习惯
        </div>
      ) : null}
      {badge ? (
        <div className="rounded-xl border border-badge-base/40 bg-badge-base/10 px-3 py-2 text-center text-[12.5px] font-semibold text-badge-base">
          🏅 点亮技巧徽章 · {badge}
        </div>
      ) : null}
      {unlocked && unlocked.length ? (
        <div className="flex flex-wrap justify-center gap-1.5">
          {unlocked.map((u) => (
            <span key={u} className="rounded-full bg-badge-ach/15 px-2.5 py-1 text-[11px] font-semibold text-badge-ach">
              {u}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Cell({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-secondary/70 py-2 text-center">
      <div className="tnum text-[15px] font-bold leading-none text-foreground">{v}</div>
      <div className="mt-1 text-[10.5px] text-muted-foreground">{k}</div>
    </div>
  );
}

export function formatMs(ms: number): string {
  const t = Math.max(0, ms) / 1000;
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m > 0 ? `${m}:${s.toFixed(1).padStart(4, "0")}` : s.toFixed(1);
}

/* ---------- 按钮组排版 ---------- */
export function OverlayBtns({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 [&>*]:col-span-1 [&>.full]:col-span-2">{children}</div>;
}

export { Btn };
