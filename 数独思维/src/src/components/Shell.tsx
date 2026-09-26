// 应用外壳：固定页头（品牌 + 主题快捷切换）+ 内容区 + 底部打卡条；含背景纹样与安全区。

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useTheme, SCHEMES } from "@/lib/theme";
import { useStore, todayStr } from "@/lib/store";
import appIcon from "@/assets/app-icon.png";

export const APP_ICON_URL = appIcon;

export function Shell({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const { resolved } = useTheme();
  return (
    <div className={cn("relative flex min-h-[100svh] flex-col bg-background text-foreground", resolved === "dark" && "dark")}>
      {/* 底层光晕 + 极淡纹样 */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-[320px] w-[520px] -translate-x-1/2 rounded-full bg-primary/18 blur-[90px]" />
        <div className="absolute bottom-[-120px] right-[-80px] h-[280px] w-[280px] rounded-full bg-badge-adv/12 blur-[80px]" />
        <div className="bg-texture absolute inset-0 opacity-70" />
      </div>
      <div className="relative z-10 mx-auto flex w-full max-w-[520px] flex-1 flex-col px-3.5 pb-3 safe-top">
        <AppHeader />
        <main className="flex-1 pt-1">{children}</main>
      </div>
      {footer ? (
        <div className="sticky bottom-0 z-20 border-t border-border/70 bg-background/88 backdrop-blur-md safe-bottom">{footer}</div>
      ) : null}
    </div>
  );
}

function AppHeader() {
  const { scheme, setScheme, mode, setMode, resolved } = useTheme();
  const [open, setOpen] = useState(false);
  const meta = SCHEMES.find((s) => s.id === scheme)!;

  return (
    <header className="relative flex items-center gap-2.5 py-2.5">
      <img src={APP_ICON_URL} alt="" className="h-9 w-9 shrink-0 drop-shadow-sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[16.5px] font-extrabold leading-none tracking-tight">数独思维</span>
          <span className="text-[9.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">逻辑教学</span>
        </div>
        <p className="mt-1 truncate text-[10.5px] leading-none text-muted-foreground">每天几分钟，练的是推理的秩序感</p>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="快速切换外观"
        aria-expanded={open}
        className="press grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-[15px] shadow-soft"
      >
        {resolved === "dark" ? "🌙" : "☀️"}
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-40 w-[248px] animate-card-in rounded-2xl border border-border bg-popover p-3 shadow-lift">
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">深浅模式</p>
            <div className="mb-3 grid grid-cols-3 gap-1.5">
              {(["system", "light", "dark"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "press rounded-lg border px-1 py-1.5 text-[11.5px] font-medium",
                    mode === m ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground",
                  )}
                >
                  {m === "system" ? "跟随系统" : m === "light" ? "浅色" : "深色"}
                </button>
              ))}
            </div>
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">主题方案 · 当前 {meta.name}</p>
            <div className="space-y-1.5">
              {SCHEMES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setScheme(s.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "press flex w-full items-center gap-2.5 rounded-xl border p-2 text-left",
                    scheme === s.id ? "border-primary bg-primary/8" : "border-border bg-card",
                  )}
                >
                  <span className="flex shrink-0 overflow-hidden rounded-md border border-border/60">
                    {[s.light, s.dark].map((p, i) => (
                      <span key={i} style={{ background: p.bg }} className="block h-6 w-5">
                        <span className="mx-auto mt-1.5 block h-3 w-3 rounded-full" style={{ background: p.primary }} />
                      </span>
                    ))}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-bold leading-tight">{s.name}</span>
                    <span className="block truncate text-[10.5px] text-muted-foreground">{s.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </header>
  );
}

/* ---------- 底部打卡条 ---------- */
export function CheckinBar({ onOpen }: { onOpen: () => void }) {
  const { store } = useStore();
  const done = store.checkin.dates.indexOf(todayStr()) >= 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="打开打卡日历"
      className="press mx-auto flex w-full max-w-[520px] items-center gap-2 px-4 py-2.5 text-left"
    >
      <span className="text-[15px]">📅</span>
      <span className="flex-1 text-[12.5px] font-semibold">打卡日历 · 连续 {store.checkin.streak} 天</span>
      <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-bold", done ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
        {done ? "今日已完成 ✅" : "今日待完成"}
      </span>
    </button>
  );
}

/* ---------- 视口方向提示（9×9 竖屏一次性建议横屏） ---------- */
export function OrientationHint({ show, onClose }: { show: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (show) setMounted(true);
  }, [show]);
  if (!mounted || !show) return null;
  return (
    <div className="fixed inset-0 z-[75] grid place-items-center px-8">
      <div className="absolute inset-0 animate-fade-in bg-foreground/50" onClick={onClose} />
      <div className="relative w-full max-w-[320px] animate-card-in rounded-3xl border border-border bg-popover p-5 text-center text-popover-foreground shadow-lift">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-[26px]">📱</div>
        <p className="text-[16px] font-bold">建议横屏练习</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">9×9 盘面在横屏下格子更大，看线索更省力，也能少一些滚动。</p>
        <button
          type="button"
          onClick={onClose}
          className="press mt-4 h-11 w-full rounded-xl surface-hero text-[14.5px] font-bold text-primary-foreground shadow-soft"
        >
          知道了
        </button>
      </div>
    </div>
  );
}
