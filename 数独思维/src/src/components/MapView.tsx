// 训练地图：10 级线性解锁，节点显示已通/可玩/锁定三态与关联技巧。

import { cn } from "@/lib/utils";
import { Card, Bar } from "./ui/kit";
import { MAP_LEVELS } from "@/lib/content";
import { skillByKey } from "@/lib/content";
import type { MapLevel } from "@/lib/content";
import { levelName } from "./Walls";

export interface MapDoneItem {
  i: number;
  doneAt: number;
}

export function MapView({ completed, onPick, onBack }: { completed: MapDoneItem[]; onPick: (lv: MapLevel) => void; onBack: () => void }) {
  const doneSet = new Set(completed.map((c) => c.i));
  const currentIdx = MAP_LEVELS.findIndex((lv) => !doneSet.has(lv.i));
  const progress = currentIdx < 0 ? MAP_LEVELS.length : currentIdx;

  return (
    <div className="pb-4">
      <Card pad="normal" tone="flat" className="mb-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[14px] font-bold">🗺️ 训练阶梯</h2>
          <span className="tnum text-[11.5px] text-muted-foreground">{progress} / {MAP_LEVELS.length}</span>
        </div>
        <p className="mt-1 mb-2 text-[11px] leading-relaxed text-muted-foreground">
          从 4×4 到 9×9 逐级推进，每完成一级解锁下一级。不比较、不排名，只按自己的节奏往前走。
        </p>
        <Bar value={progress} total={MAP_LEVELS.length} tone="primary" />
      </Card>

      <ol className="relative space-y-2.5 pl-1">
        {/* 竖向连线 */}
        <span aria-hidden className="absolute left-[27px] top-4 bottom-4 w-0.5 rounded bg-border" />
        {MAP_LEVELS.map((lv, idx) => {
          const isDone = doneSet.has(lv.i);
          const unlocked = idx === 0 || doneSet.has(MAP_LEVELS[idx - 1].i);
          const isNext = unlocked && !isDone;
          const skill = lv.skillKey ? skillByKey(lv.skillKey) : undefined;
          return (
            <li key={lv.i} className="reveal-up relative" data-reveal-delay={idx * 35}>
              <button
                type="button"
                disabled={!unlocked}
                onClick={() => onPick(lv)}
                aria-label={`${lv.code} ${lv.name}${isDone ? " 已完成" : unlocked ? " 可练习" : " 未解锁"}`}
                className={cn(
                  "press flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors",
                  isDone
                    ? "border-success/40 bg-success/8"
                    : isNext
                      ? "border-primary bg-primary/8 shadow-soft"
                      : unlocked
                        ? "border-border bg-card"
                        : "border-dashed border-border bg-card/40 opacity-65",
                )}
              >
                <span
                  className={cn(
                    "z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-extrabold",
                    isDone ? "bg-success text-white" : isNext ? "bg-primary text-primary-foreground shadow-lift" : "bg-muted text-muted-foreground",
                  )}
                >
                  {isDone ? "✓" : unlocked ? lv.i + 1 : "🔒"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="tnum truncate text-[13.5px] font-bold leading-tight">
                      {lv.code} · {lv.name}
                    </span>
                    {isNext ? <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">下一站</span> : null}
                  </span>
                  <span className="mt-1 block text-[11px] leading-none text-muted-foreground">
                    {lv.size}×{lv.size} · {levelName(lv.level)}
                    {skill ? ` · 用到「${skill.name}」` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-[15px] text-muted-foreground">{unlocked ? (isDone ? "↻" : "▶") : ""}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <button type="button" onClick={onBack} className="press mt-4 w-full rounded-xl py-2.5 text-[13px] font-semibold text-muted-foreground">
        ← 返回难度
      </button>
    </div>
  );
}
