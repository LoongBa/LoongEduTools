// 成长卡：本周收藏卡 + 分享图片（纯前端 canvas 生成，不含任何身份信息）
import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DEFAULT_SETTINGS, isDarkTheme, type ThemeKey } from "@/lib/store";
import { useProgress } from "@/lib/store";
import { Btn, CheckIcon, PageHead, Panel } from "@/components/ui-kit";
import { RepeatIcon, StarIcon } from "@/components/icons";

export const Route = createFileRoute("/_layout/card")({
  component: CardPage,
});

const CIRCLED = ["①", "②", "③", "④"];

function CardPage() {
  const p = useProgress();
  const { unit, week, litDays, skillRating, stats } = p;
  const [saved, setSaved] = useState(false);
  const sheetRef = useRef<HTMLElement>(null);

  const results = unit.skills.map((s) => ({
    no: s.no,
    name: s.name,
    rating: skillRating(s.id),
  }));
  const passed = results.filter((r) => r.rating === "can" || r.rating === "almost").length;
  const weak = results.find((r) => r.rating === "help");
  const advice = weak ? `${CIRCLED[weak.no - 1]} ${weak.name}需要再练` : "四项都稳，可以挑战更长句子";
  const isDraft = passed < 4;

  const newWords = useMemo(() => unit.cards.flatMap((c) => c.words).length, [unit]);
  const reviewWords = Math.max(0, stats.collected - newWords);

  const saveImage = async () => {
    const node = sheetRef.current;
    if (!node) return;
    try {
      const { canvas, w, h } = await drawCard(node);
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `growth-card-week${week}.png`;
      a.click();
      void w;
      void h;
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2600);
    } catch (err) {
      // 导出失败时留下可排查的现场信息，避免静默失败
      console.error("[growth-card] 分享图导出失败", err);
      setSaved(false);
    }
  };

  /** 用 canvas 复刻卡片内容（避免引入第三方截图库），配色跟随当前主题 token */
  const drawCard = (node: HTMLElement) =>
    new Promise<{ canvas: HTMLCanvasElement; w: number; h: number }>((resolve, reject) => {
      const scale = 2;
      const w = node.offsetWidth;
      const h = node.offsetHeight;
      if (!w || !h) return reject(new Error("growth-card sheet has zero size"));
      const canvas = document.createElement("canvas");
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no ctx"));
      ctx.scale(scale, scale);

      // 深色主题下若取色失败，兜底也必须是深色，避免导出白底图
      const raw = document.documentElement.dataset.theme;
      const dark = isDarkTheme((raw ?? DEFAULT_SETTINGS.theme) as ThemeKey);

      // 从计算样式读取当前主题的语义色（canvas 无法解析 var()，需借元素转成 rgb）
      const tok = (name: string, lightFallback: string, darkFallback: string) => {
        const probe = document.createElement("span");
        probe.style.color = `var(${name})`;
        probe.style.display = "none";
        document.body.appendChild(probe);
        const v = getComputedStyle(probe).color;
        probe.remove();
        return v && v !== "rgb(0, 0, 0)" ? v : dark ? darkFallback : lightFallback;
      };
      const cPrimary = tok("--primary", "#3E8F7A", "#7FD3B4");
      const cFore = tok("--foreground", "#3B4140", "#EBF2EE");
      const cMuted = tok("--muted-text", "#6B716F", "#A9BCB4");
      const cLit = tok("--lit", "#4E9E6A", "#63C783");
      const cIdle = tok("--idle", "#DDE3E0", "#3A4A44");
      const cIdleFg = tok("--idle-foreground", "#8A918E", "#93A69E");
      const cBorder = tok("--border", "#D5DCD8", "#5B716A");
      const cCard = tok("--card", "#FFFFFF", "#2E403A");
      const cBg = tok("--background", "#EFF5F1", "#1E322C");
      // 完成态圆点上的文字：浅色主题为近白，深色主题为深字
      const cOnLit = tok("--on-lit", "#FFFFFF", "#1C2A25");

      ctx.fillStyle = cBg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = cCard;
      roundRect(ctx, 16, 16, w - 32, h - 32, 22);
      ctx.fill();

      ctx.fillStyle = cPrimary;
      ctx.font = "bold 13px sans-serif";
      ctx.fillText(`第 ${week} 周 · Unit ${unit.no} ${unit.title}`, 40, 60);

      ctx.fillStyle = cFore;
      ctx.font = "bold 26px sans-serif";
      ctx.fillText("本周成长卡", 40, 96);

      // Day 圆点
      for (let i = 0; i < 5; i++) {
        const cx = 56 + i * 46;
        const cy = 140;
        const done = litDays.includes(i + 1);
        ctx.beginPath();
        ctx.arc(cx, cy, 17, 0, Math.PI * 2);
        ctx.fillStyle = done ? cLit : cIdle;
        ctx.fill();
        ctx.fillStyle = done ? cOnLit : cIdleFg;
        ctx.font = "bold 14px sans-serif";
        const t = done ? "★" : `${i + 1}`;
        ctx.fillText(t, cx - (done ? 6 : 4), cy + 5);
      }

      ctx.fillStyle = cFore;
      ctx.font = "bold 17px sans-serif";
      ctx.fillText(`能力达成：${results.map((r, i) => `${CIRCLED[i]}${r.rating === "help" ? "↻" : r.rating ? "✓" : "—"}`).join(" ")}`, 40, 200);

      ctx.font = "15px sans-serif";
      ctx.fillStyle = cMuted;
      ctx.fillText(`新学词 ${newWords} · 复习词 ${reviewWords}`, 40, 230);
      ctx.fillText(`下周建议：${advice}`, 40, 256);

      ctx.strokeStyle = cBorder;
      ctx.beginPath();
      ctx.moveTo(40, 306);
      ctx.lineTo(w - 120, 306);
      ctx.stroke();
      ctx.fillStyle = cIdleFg;
      ctx.font = "13px sans-serif";
      ctx.fillText("家长签名", 40, 326);

      resolve({ canvas, w, h });
    });

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        eyebrow={`第 ${week} 周`}
        title="成长卡"
        desc={isDraft ? `草稿态 · 还差 ${4 - passed} 项能力未过关` : "本周已点亮，可以保存成一张卡片"}
      />

      {/* 收藏卡本体 */}
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 translate-x-1.5 translate-y-2 rotate-[0.7deg] rounded-3xl border-2 border-dashed border-warm/50"
        />
        <Panel ref={sheetRef} as="article" className="relative px-6 py-6 shadow-lift">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-primary-deep">
                第 {week} 周 · Unit {unit.no} {unit.title}
              </p>
              <h2 className="mt-1 text-[24px] font-bold leading-tight">本周成长卡</h2>
            </div>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-warm-soft text-[var(--warm)]">
              <StarIcon className="h-5 w-5" filled />
            </span>
          </div>

          <ul className="mt-5 flex gap-3">
            {[1, 2, 3, 4, 5].map((d) => {
              const done = litDays.includes(d);
              return (
                <li key={d} className="flex flex-1 flex-col items-center gap-1.5">
                  <span
                    className={
                      "grid h-11 w-11 place-items-center rounded-full transition-colors duration-500 " +
                      (done ? "bg-lit text-on-lit" : "bg-idle text-idle-foreground")
                    }
                  >
                    {done ? <StarIcon className="h-5 w-5" filled /> : d}
                  </span>
                  <span className="text-[12px] font-semibold text-muted-text">Day{d}</span>
                </li>
              );
            })}
          </ul>

          <div className="mt-5 space-y-2">
            <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-muted-text">能力达成</p>
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl bg-secondary/60 px-3.5 py-2.5">
                <span className="text-[17px] font-bold text-primary-deep">{CIRCLED[i]}</span>
                <span className="min-w-0 flex-1 truncate text-[15px]">{r.name}</span>
                {r.rating === "help" ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-idle px-2.5 py-1 text-[12px] font-bold text-idle-foreground">
                    <RepeatIcon className="h-3.5 w-3.5" />
                    再练
                  </span>
                ) : r.rating ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-lit-soft px-2.5 py-1 text-[12px] font-bold text-[var(--lit)]">
                    <CheckIcon className="h-3.5 w-3.5" />
                    达成
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-idle px-2.5 py-1 text-[12px] font-semibold text-idle-foreground">
                    未评
                  </span>
                )}
              </div>
            ))}
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-3">
            <Stat label="新学词" value={newWords} />
            <Stat label="复习词" value={reviewWords} />
          </dl>

          <div className="mt-4 rounded-2xl border border-warm/40 bg-warm-soft/55 px-4 py-3">
            <p className="text-[13px] font-bold text-[var(--warm)]">下周建议</p>
            <p className="mt-1 text-[15px] leading-relaxed">{advice}</p>
          </div>

          <div className="mt-6 flex items-end gap-3">
            <span className="text-[13px] font-semibold text-muted-text">家长签名</span>
            <span className="mb-1 h-px flex-1 bg-border" />
          </div>
        </Panel>
      </div>

      <div className="flex gap-2">
        <Btn className="flex-1" size="lg" onClick={() => void saveImage()}>
          保存分享卡片
        </Btn>
        <Link to="/print" className="flex-1">
          <Btn variant="soft" size="lg" className="w-full">
            打印这一周
          </Btn>
        </Link>
      </div>
      {saved && (
        <p className="text-center text-[14px] font-semibold text-[var(--lit)]">
          卡片已保存到下载文件夹，只包含本周学习情况。
        </p>
      )}

      {isDraft && (
        <Link to="/review" className="block">
          <Panel className="px-5 py-4">
            <p className="text-[15px] font-bold">还有 {4 - passed} 项没评完</p>
            <p className="mt-1 text-[14px] text-muted-text">去小阅兵把剩下的说完，就能点亮这张卡。</p>
          </Panel>
        </Link>
      )}

      {/* 历史周卡 */}
      <HistoryWeeks />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-secondary/60 px-4 py-3">
      <dt className="text-[13px] text-muted-text">{label}</dt>
      <dd className="mt-0.5 text-[24px] font-bold tabular-nums leading-none">{value}</dd>
    </div>
  );
}

function HistoryWeeks() {
  const p = useProgress();
  const weeks = useMemo(() => {
    const m = new Map<number, number>();
    p.state.days.forEach((d) => {
      if (d.finished) m.set(d.week, (m.get(d.week) ?? 0) + 1);
    });
    return Array.from(m.entries()).sort((a, b) => b[0] - a[0]);
  }, [p.state.days]);

  if (weeks.length <= 1) return null;

  return (
    <section>
      <h2 className="mb-2.5 px-1 text-[15px] font-bold text-muted-text">以前的周卡</h2>
      <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
        {weeks.map(([w, n]) => (
          <li key={w} className="w-[132px] shrink-0 snap-start">
            <Panel className="px-4 py-3.5">
              <p className="text-[13px] font-semibold text-muted-text">第 {w} 周</p>
              <p className="mt-1 text-[22px] font-bold tabular-nums leading-none">
                {n}
                <span className="ml-1 text-[13px] font-medium text-muted-text">天点亮</span>
              </p>
              <div className="mt-2.5 flex gap-1">
                {[1, 2, 3, 4, 5].map((d) => (
                  <span
                    key={d}
                    className={"h-1.5 flex-1 rounded-full " + (d <= n ? "bg-lit" : "bg-idle")}
                  />
                ))}
              </div>
            </Panel>
          </li>
        ))}
      </ul>
    </section>
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
