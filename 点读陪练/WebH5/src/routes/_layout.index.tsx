// 首页：唯一视觉重心是「今日陪练」，其余入口降级为小卡列表
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { UNITS, DAY_TITLES } from "@/data/content";
import { IP_CHARACTERS } from "@/data/ip";
import { useProgress } from "@/lib/store";
import { Btn, DayDots, Panel } from "@/components/ui-kit";
import { MusicIcon, BookIcon, PrintIcon, ShieldIcon, PlayIcon, LeafIcon, StarIcon } from "@/components/icons";

export const Route = createFileRoute("/_layout/")({
  component: HomePage,
});

function HomePage() {
  const p = useProgress();
  const { unit, week, litDays, currentDay, isWeekend, state, stats, dueReview } = p;
  const [picked, setPicked] = useState(false);

  const firstTime = stats.totalDays === 0 && !picked;
  const dayNo = Math.min(currentDay, 5);
  const reviewOpen = litDays.length >= 5 || isWeekend;
  const todayWords = unit.cards.filter((c) => c.stage === "new").flatMap((c) => c.words).length;

  return (
    <div className="flex flex-col gap-5">
      {/* 顶部状态条 */}
      <Panel className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 px-4 py-3.5">
        <div className="min-w-0 max-w-full">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-muted-text">
            第 {week} 周 · Unit {unit.no}
          </p>
          <p className="mt-0.5 text-[16px] font-bold leading-tight">{unit.cn}</p>
          <p className="mt-0.5 truncate text-[13px] leading-snug text-muted-text">{unit.theme}</p>
        </div>
        <DayDots lit={litDays} current={dayNo} size="sm" />
      </Panel>

      {firstTime && (
        <Panel className="reveal-up border-l-4 border-l-[var(--warm)] px-4 py-3.5">
          <p className="text-[15px] font-bold leading-snug">第一次来，选一个单元就能开始</p>
          <p className="mt-1 text-[14px] leading-relaxed text-muted-text">
            不需要注册，也不填任何信息。进度只存在这台设备上。
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {UNITS.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  p.setUnit(u.id);
                  setPicked(true);
                }}
                className={
                  "rounded-full px-3.5 py-1.5 text-[14px] font-semibold transition-colors duration-200 " +
                  (u.id === state.unitId
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-accent")
                }
              >
                U{u.no} {u.cn}
              </button>
            ))}
          </div>
        </Panel>
      )}

      {/* 今日陪练大卡片：唯一视觉重心 */}
      <Panel as="section" className="relative overflow-hidden px-6 pb-6 pt-7 shadow-lift">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-accent/70"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-10 -left-8 h-24 w-24 rounded-full bg-sky-soft/60"
        />
        <div className="relative">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-warm-soft px-3 py-1 text-[12px] font-bold text-[var(--warm)]">
            <StarIcon className="h-3.5 w-3.5" filled />
            天天见 · Day {dayNo}
          </p>
          <h1 className="mt-3 text-[28px] font-bold leading-[1.25] sm:text-[32px]">
            {DAY_TITLES[(dayNo - 1) % DAY_TITLES.length]}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-text">
            大约 15–20 分钟 · 四个环节 · 今天新学 {todayWords} 个词
          </p>

          <div className="mt-4 flex items-center gap-2">
            {IP_CHARACTERS.slice(0, 4).map((c, i) => (
              <img
                key={c.key}
                src={c.image}
                alt={c.cn}
                className="ip-plate h-11 w-11 rounded-full bg-card object-cover shadow-soft ring-2 ring-card"
                style={{ marginLeft: i === 0 ? 0 : -10, zIndex: 10 - i }}
                draggable={false}
              />
            ))}
            <span className="ml-2 text-[13px] text-muted-text">朋友们在等你</span>
          </div>

          <Link to="/daily" className="mt-5 block">
            <Btn size="lg" className="w-full">
              <PlayIcon className="h-5 w-5" />
              {litDays.includes(dayNo) ? "回看今天的句子" : "开始今天的陪练"}
            </Btn>
          </Link>
        </div>
      </Panel>

      {/* 周末入口 */}
      <Panel
        as="section"
        className={
          "flex items-center gap-4 px-5 py-4 transition-opacity " +
          (reviewOpen ? "" : "opacity-90")
        }
      >
        <span
          className={
            "grid h-12 w-12 shrink-0 place-items-center rounded-2xl " +
            (reviewOpen ? "bg-lit-soft text-[var(--lit)]" : "bg-idle text-idle-foreground")
          }
        >
          <ShieldIcon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-bold leading-tight">小阅兵 · 本周检验</p>
          <p className="mt-1 text-[14px] leading-snug text-muted-text">
            {reviewOpen
              ? `4 项能力逐条说一说，全过就点亮本周`
              : `还差 ${5 - litDays.length} 天，或周六周日开放`}
          </p>
        </div>
        {reviewOpen ? (
          <Link to="/review">
            <Btn variant="lit" size="sm">
              去检验
            </Btn>
          </Link>
        ) : (
          <span className="shrink-0 rounded-full bg-secondary px-3 py-1.5 text-[13px] font-semibold text-muted-text">
            未开放
          </span>
        )}
      </Panel>

      {/* 次级入口：弱化处理 */}
      <nav aria-label="快捷入口" className="grid grid-cols-2 gap-3">
        <QuickLink to="/words" Icon={BookIcon} title="词卡收藏册" note={`已收集 ${stats.collected}`} />
        <QuickLink to="/jukebox" Icon={MusicIcon} title="点唱台" note={`${unit.song.title}`} />
        <QuickLink to="/print" Icon={PrintIcon} title="打印小单" note="A4 黑白无屏版" />
        <QuickLink to="/card" Icon={StarIcon} title="成长卡" note={litDays.length >= 5 ? "本周可查看" : `本周已点亮 ${litDays.length} 天`} />
      </nav>

      {dueReview.length > 0 && (
        <Link to="/words" className="block">
          <Panel className="flex items-center gap-3 border-l-4 border-l-[var(--warm)] px-4 py-3">
            <LeafIcon className="h-5 w-5 shrink-0 text-[var(--warm)]" />
            <p className="text-[14px] leading-snug">
              有 <b className="tabular-nums">{dueReview.length}</b> 个词三天没碰了，翻一翻就算复习。
            </p>
          </Panel>
        </Link>
      )}
    </div>
  );
}

function QuickLink({
  to,
  Icon,
  title,
  note,
}: {
  to: "/words" | "/jukebox" | "/print" | "/card";
  Icon: (props: { className?: string }) => React.ReactElement;
  title: string;
  note: string;
}) {
  return (
    <Link to={to} className="block">
      <Panel className="h-full px-4 py-3.5 transition-transform duration-200 hover:-translate-y-0.5">
        <Icon className="h-5 w-5 text-primary-deep" />
        <p className="mt-2 text-[15px] font-bold leading-tight">{title}</p>
        <p className="mt-0.5 truncate text-[13px] text-muted-text">{note}</p>
      </Panel>
    </Link>
  );
}
