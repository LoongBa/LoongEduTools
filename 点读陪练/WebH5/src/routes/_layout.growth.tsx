// 成长卡：单元学习态势一览（可切换单元的"座舱"）——每日任务执行状态 + 能力自评/小阅兵
import { createFileRoute, Link } from "@tanstack/react-router";
import { STAGES, stageLabel, unitOf, type Stage } from "@/data/content";
import { useProgress } from "@/lib/store";
import { Btn, PageHead, Panel } from "@/components/ui-kit";
import { StarIcon, CheckIcon, PrintIcon } from "@/components/icons";
import { UnitScope } from "@/components/unit-scope";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_layout/growth")({
  component: GrowthPage,
});

function GrowthPage() {
  const p = useProgress();
  const unit = unitOf(p.state.unitId);

  // 本单元已完成的日记录（按 dayInWeek 1-5 汇总）
  const unitDays = p.state.days.filter((d) => d.unitId === unit.id);
  const dayState = (n: number) => {
    const rec = unitDays.find((d) => d.dayInWeek === n);
    return {
      exists: !!rec,
      finished: !!rec?.finished,
      stagesDone: rec?.stagesDone ?? [] as Stage[],
      date: rec?.date,
    };
  };
  const finishedCount = unitDays.filter((d) => d.finished).length;

  return (
    <div className="flex flex-col gap-5">
      <PageHead eyebrow="成长记录" title="成长卡" desc="这个单元学得怎么样，一眼看全。" />

      {/* 单元切换（跟随全局，这里可切换） */}
      <UnitScope switchable title="当前单元" />

      {/* 每日任务执行状态 */}
      <Panel className="px-5 py-4">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-bold leading-tight">每日任务</p>
          <span className="rounded-full bg-lit-soft px-2.5 py-0.5 text-[12px] font-bold text-[var(--lit)]">
            完成 {finishedCount} / 5 天
          </span>
        </div>
        <ul className="mt-3 space-y-2">
          {[1, 2, 3, 4, 5].map((n) => {
            const st = dayState(n);
            return (
              <li key={n} className="flex items-center gap-3">
                <span
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-full text-[14px] font-bold tabular-nums",
                    st.finished ? "bg-lit text-on-lit" : st.exists ? "bg-sky-soft text-[var(--sky)]" : "bg-secondary text-muted-text",
                  )}
                >
                  {st.finished ? <CheckIcon className="h-4.5 w-4.5" /> : n}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold leading-tight">第 {n} 天</span>
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    {STAGES.map((sg) => {
                      const done = st.stagesDone.includes(sg);
                      return (
                        <span
                          key={sg}
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            done ? "bg-lit-soft text-[var(--lit)]" : "bg-secondary text-muted-text",
                          )}
                        >
                          {stageLabel(sg)}
                        </span>
                      );
                    })}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </Panel>

      {/* 能力自评 / 小阅兵 */}
      <Panel className="px-5 py-4">
        <p className="mb-2.5 text-[15px] font-bold leading-tight">能力自评 · 小阅兵</p>
        <ul className="space-y-2">
          {unit.skills.map((sk) => {
            const r = p.skillRating(sk.id);
            return (
              <li key={sk.id} className="flex items-center gap-2.5">
                <StarIcon className={cn("h-4 w-4 shrink-0", r ? "text-[var(--warm)]" : "text-idle")} filled={!!r} />
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold leading-tight">
                  {sk.no}) {sk.name}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-bold",
                    r === "can" && "bg-lit-soft text-[var(--lit)]",
                    r === "almost" && "bg-sky-soft text-[var(--sky)]",
                    r === "help" && "bg-warm-soft text-[var(--warm)]",
                    !r && "bg-secondary text-muted-text",
                  )}
                >
                  {r === "can" ? "我能做到" : r === "almost" ? "基本可以" : r === "help" ? "需要帮助" : "未评"}
                </span>
              </li>
            );
          })}
        </ul>
      </Panel>

      {/* 打印小单入口 */}
      <Link to="/print">
        <Btn variant="soft" className="w-full">
          <PrintIcon className="h-5 w-5" />
          去打印练习小单
        </Btn>
      </Link>
    </div>
  );
}
