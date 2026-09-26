// 三墙视觉分化：基础技巧=圆形亮章、进阶技巧=菱形、成就=奖章缎带。
// 另含题目本（错题/收藏）卡片与迷你盘缩略、打卡日历、训练地图节点。

import { cn } from "@/lib/utils";
import { Card, Btn, EmptyState, Bar } from "./ui/kit";
import { ART_MISTAKES, ART_FAVORITES } from "@/lib/art";
import type { Achievement, Technique } from "@/lib/content";
import type { BookItem } from "@/lib/store";
import { todayStr } from "@/lib/store";
import type { Size } from "@/lib/sudoku";

/* ================= 技巧徽章墙（base=圆章 / adv=菱形） ================= */
export function SkillWall({
  skills,
  lit,
  tier,
  onPick,
}: {
  skills: Technique[];
  lit: Record<string, boolean>;
  tier: "base" | "adv";
  onPick: (key: string) => void;
}) {
  const adv = tier === "adv";
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {skills.map((s, idx) => {
        const isLit = !!lit[s.key];
        // 进阶关按顺序解锁：前一个点亮才开放
        const prevLit = idx === 0 ? !adv : !!lit[skills[idx - 1].key];
        const locked = adv && !isLit && !prevLit;
        return (
          <button
            key={s.key}
            type="button"
            disabled={locked}
            onClick={() => onPick(s.key)}
            aria-label={`${s.name}${isLit ? " 已点亮" : locked ? " 未开放" : " 可学习"}`}
            className={cn(
              "press reveal-up group relative overflow-hidden rounded-2xl border p-3 text-left transition-colors",
              isLit
                ? adv
                  ? "border-badge-adv/45 bg-badge-adv/8"
                  : "border-badge-base/45 bg-badge-base/8"
                : locked
                  ? "border-dashed border-border bg-card/40 opacity-70"
                  : "border-dashed border-2 border-primary/35 bg-card/60",
            )}
            data-reveal-delay={idx * 45}
          >
            <span className="flex items-start gap-2.5">
              <span
                className={cn(
                  "grid h-11 w-11 shrink-0 place-items-center text-[21px] transition-transform group-active:scale-95",
                  adv ? "rotate-45 rounded-xl" : "rounded-full",
                  isLit
                    ? adv
                      ? "bg-badge-adv text-white shadow-lift"
                      : "bg-badge-base text-white shadow-lift"
                    : locked
                      ? "bg-muted text-muted-foreground/60"
                      : "bg-secondary text-muted-foreground",
                )}
              >
                <span className={adv ? "-rotate-45" : ""}>{locked ? "🔒" : isLit ? s.emoji : "🎯"}</span>
              </span>
              <span className="min-w-0 flex-1 pt-0.5">
                <span className="block truncate text-[13.5px] font-bold leading-tight">{s.name}</span>
                <span className={cn("mt-1 block text-[10.5px] font-semibold leading-none", isLit ? (adv ? "text-badge-adv" : "text-badge-base") : "text-muted-foreground")}>
                  {isLit ? "✅ 已点亮" : locked ? "🔒 先点亮上一项" : "🎯 可学习"}
                </span>
              </span>
            </span>
            <p className="mt-2 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{s.brief}</p>
          </button>
        );
      })}
    </div>
  );
}

/* ================= 成就墙（奖章 + 缎带） ================= */
export function AchievementWall({ list, unlocked }: { list: Achievement[]; unlocked: Record<string, string> }) {
  const got = list.filter((a) => unlocked[a.key]).length;
  return (
    <>
      <Card tone="flat" pad="tight" className="mb-3">
        <div className="flex items-baseline justify-between px-1 pb-1.5">
          <span className="text-[12px] font-semibold">已收获 {got} / {list.length} 枚</span>
          <span className="tnum text-[11px] text-muted-foreground">{Math.round((got / list.length) * 100)}%</span>
        </div>
        <Bar value={got} total={list.length} tone="ach" />
      </Card>
      <div className="grid grid-cols-2 gap-2.5">
        {list.map((a, idx) => {
          const date = unlocked[a.key];
          return (
            <div
              key={a.key}
              className={cn(
                "reveal-up relative overflow-hidden rounded-2xl border p-3 pt-4 text-center",
                date ? "border-badge-ach/45 bg-badge-ach/8" : "border-dashed border-border bg-card/40",
              )}
              data-reveal-delay={idx * 35}
            >
              {/* 缎带 */}
              <span
                className={cn(
                  "absolute left-1/2 top-0 h-3 w-8 -translate-x-1/2 rounded-b-md",
                  date ? "bg-badge-ach" : "bg-muted",
                )}
                aria-hidden
              />
              <div
                className={cn(
                  "mx-auto grid h-12 w-12 place-items-center rounded-full text-[22px]",
                  date ? "bg-badge-ach text-white shadow-lift" : "bg-muted text-muted-foreground/50 grayscale",
                )}
              >
                {date ? a.emoji : "🔒"}
              </div>
              <p className="mt-2 truncate text-[12.5px] font-bold leading-tight">{a.name}</p>
              <p className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-muted-foreground">{a.desc}</p>
              {date ? (
                <p className="tnum mt-1.5 text-[10px] font-semibold text-badge-ach">{date.slice(0, 4)}-{date.slice(4, 6)}-{date.slice(6, 8)}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ================= 迷你盘缩略 ================= */
export function MiniBoard({ board, size }: { board: number[]; size: Size }) {
  const n = size * size;
  return (
    <div
      className="grid h-[68px] w-[68px] shrink-0 overflow-hidden rounded-lg border border-border bg-board"
      style={{ gridTemplateColumns: `repeat(${size}, minmax(0,1fr))` }}
      aria-hidden
    >
      {board.slice(0, n).map((v, i) => (
        <span
          key={i}
          className={cn(
            "grid place-items-center border-r border-b border-board-line/60 text-[7.5px] leading-none tnum last:border-r-0",
            v ? "font-semibold text-cell-given" : "text-transparent",
          )}
        >
          {v || 0}
        </span>
      ))}
    </div>
  );
}

/* ================= 题目本（错题 / 收藏） ================= */
export function BookList({
  items,
  kind,
  onReplay,
  onDelete,
  onClear,
  onGoPractice,
}: {
  items: BookItem[];
  kind: "mistake" | "favorite";
  onReplay: (item: BookItem) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onGoPractice: () => void;
}) {
  if (!items.length) {
    return (
      <EmptyState
        art={kind === "mistake" ? ART_MISTAKES : ART_FAVORITES}
        emoji={kind === "mistake" ? "📭" : "⭐"}
        title={kind === "mistake" ? "还没有需要巩固的题" : "收藏本还是空的"}
        sub={
          kind === "mistake"
            ? "练习中出现失误或用提示解开的题会自动收进来，掌握后自动移出。"
            : "在结果页点「⭐ 收藏这道题」，好题随时可以再来一遍。"
        }
        action={
          <Btn variant="primary" size="md" onClick={onGoPractice}>
            去练一道
          </Btn>
        }
      />
    );
  }
  return (
    <div className="space-y-2.5">
      {items.map((it, idx) => (
        <Card key={it.id} pad="tight" className="reveal-up flex items-center gap-3" data-reveal-delay={idx * 40}>
          <MiniBoard board={it.board} size={it.size} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-bold leading-tight">
              {it.size}×{it.size} · {levelName(it.level)}
            </p>
            <p className="mt-1 text-[11px] leading-none text-muted-foreground tnum">
              {new Date(it.ts).toLocaleDateString("zh-CN")}
              {kind === "mistake" ? ` · 失误 ${it.errors ?? 0} · 提示 ${it.hints ?? 0}` : " · 已收藏"}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-1.5">
            <Btn variant="secondary" size="sm" onClick={() => onReplay(it)} aria-label="重练这道题" className="h-9 px-2.5 text-[12px]">
              ▶ 重练
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => onDelete(it.id)} aria-label="删除这一条" className="h-9 w-9 min-w-0 p-0 text-[13px]">
              🗑
            </Btn>
          </div>
        </Card>
      ))}
      <Btn variant="danger" size="md" onClick={onClear} className="w-full">
        {kind === "mistake" ? "清空错题本" : "清空收藏本"}
      </Btn>
    </div>
  );
}

export function levelName(id: string): string {
  return id === "easy" ? "简单" : id === "hard" ? "困难" : "普通";
}

/* ================= 打卡日历 ================= */
export function Calendar({ dates, streak }: { dates: string[]; streak: number }) {
  const set = new Set(dates);
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= days; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const today = todayStr();

  return (
    <Card pad="normal">
      <div className="mb-3 flex items-center justify-between">
        <p className="tnum text-[14px] font-bold">
          {year} 年 {month + 1} 月
        </p>
        <span className="flex items-center gap-1 rounded-full bg-flame/12 px-2.5 py-1 text-[11.5px] font-bold text-flame">
          🔥 连续 {streak} 天
        </span>
      </div>
      <div className="mb-1 grid grid-cols-7 text-center">
        {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
          <span key={w} className="text-[10px] font-medium text-muted-foreground">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((ds, i) => {
          if (!ds) return <span key={i} />;
          const done = set.has(ds);
          const isToday = ds === today;
          const dayNum = Number(ds.slice(-2));
          return (
            <div
              key={ds}
              className={cn(
                "relative grid aspect-square place-items-center rounded-lg text-[12px] font-semibold tnum transition-colors",
                isToday
                  ? "bg-warning text-warning-foreground shadow-soft"
                  : done
                    ? "bg-warning/18 text-warning"
                    : "bg-muted/50 text-muted-foreground/70",
              )}
              aria-label={`${ds}${done ? " 已打卡" : " 未打卡"}`}
            >
              {dayNum}
              {isToday ? <span className="absolute -top-1 -right-1 rounded-full bg-background px-1 text-[8px] font-bold text-warning shadow-sm">今</span> : null}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-center text-[11px] text-muted-foreground">本月已打卡 {dates.filter((d) => d.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`)).length} 天</p>
    </Card>
  );
}

/* ================= 周卡 ================= */
export function WeekCard({
  dates,
  statusText,
  bigNumber,
  title,
}: {
  dates: string[];
  statusText: string;
  bigNumber: string;
  title: string;
}) {
  const set = new Set(dates);
  const today = todayStr();
  const days: { label: string; date: string; future: boolean }[] = [];
  const now = new Date();
  const offset = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - offset);
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const ds = todayStr(d);
    days.push({ label: ["一", "二", "三", "四", "五", "六", "日"][i], date: ds, future: ds > today });
  }
  return (
    <Card pad="normal" className="reveal-up">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-semibold text-muted-foreground">{title}</p>
          <p className="tnum mt-1 text-[26px] font-extrabold leading-none">{bigNumber}</p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">{statusText}</p>
        </div>
        <div className="flex shrink-0 items-end gap-1.5">
          {days.map((d) => {
            const lit = set.has(d.date);
            const isToday = d.date === today;
            return (
              <div key={d.date} className="flex flex-col items-center gap-1">
                <span
                  className={cn(
                    "h-3.5 w-3.5 rounded-full transition-colors",
                    lit ? "bg-warning shadow-soft" : isToday ? "border-2 border-primary bg-transparent" : d.future ? "bg-muted/70" : "bg-muted",
                  )}
                  aria-hidden
                />
                <span className={cn("text-[9.5px]", isToday ? "font-bold text-primary" : "text-muted-foreground")}>{d.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
