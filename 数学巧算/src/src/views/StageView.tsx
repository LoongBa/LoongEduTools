// 数学巧算 · 阶段页：本阶段主题头 + 讲次列表（每讲卡片：序号/标题/点亮/三档最好正确率徽章）
import { useMemo } from "react";
import { BackBtn, PageHead, Panel, Pill } from "@/components/ui-kit";
import { useProgress } from "@/lib/store";
import { STAGES, type SmartLesson, type SmartStage } from "@/data/stages.generated";

const STAGE_EMOJI: Record<string, string> = {
  "1": "🌱",
  "2": "🧩",
  "3": "🚀",
  "4": "🧠",
  "5": "🌊",
  "6": "🧀",
  X: "✨",
};

export function StageView({
  stageKey,
  onBack,
  onOpenLesson,
}: {
  stageKey: number | string;
  onBack: () => void;
  onOpenLesson: (lesson: string) => void;
}) {
  const { store } = useProgress();
  const key = String(stageKey);

  const stage: SmartStage | undefined = useMemo(
    () => STAGES.find((s) => String(s.stage) === key),
    [key],
  );

  if (!stage) {
    return (
      <div className="pt-2">
        <BackBtn onClick={onBack} />
        <p className="mt-8 text-center text-muted-foreground">未找到该阶段</p>
      </div>
    );
  }

  const doneCount = (stage.lessons || []).filter((l) => store.lessons[`${key}:${l.lesson_id}`]?.done).length;

  return (
    <div className="anim-fade-in-up">
      <div className="flex items-center gap-1 pb-1">
        <BackBtn onClick={onBack} />
      </div>
      <PageHead
        eyebrow={`阶段 ${stage.grade}`}
        title={`${STAGE_EMOJI[key] || "📐"} ${stage.theme}`}
        desc={`${stage.lessons?.length || 0} 讲 · 已完成 ${doneCount} 讲`}
      />

      <ol className="flex flex-col gap-3">
        {(stage.lessons || []).map((l: SmartLesson, i: number) => {
          const rec = store.lessons[`${key}:${l.lesson_id}`];
          const bestVals = rec?.best ? Object.values(rec.best) : [];
          const best = bestVals.length ? Math.max(...bestVals) : 0;
          return (
            <li key={l.lesson_id}>
              <button
                type="button"
                onClick={() => onOpenLesson(l.lesson_id)}
                className="panel-border tap-target flex w-full items-center gap-3 rounded-3xl border bg-card p-3 text-left shadow-soft transition-transform active:scale-[0.985]"
              >
                <span
                  className={
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-[16px] font-extrabold " +
                    (rec?.done ? "bg-lit text-on-lit" : "bg-secondary text-secondary-foreground")
                  }
                >
                  {rec?.done ? "✓" : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-bold text-foreground">{l.title}</span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">
                    {l.principle}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  {rec?.done ? (
                    <>
                      <Pill tone="lit">{best >= 0.99 ? "🏅 掌握" : best >= 0.6 ? "🌤 进步中" : "🔁 再练练"}</Pill>
                      <span className="text-[11px] text-muted-foreground">
                        {rec.practiced || 0} 题
                      </span>
                    </>
                  ) : (
                    <Pill tone="idle">未开始</Pill>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <Panel className="mt-5 px-4 py-3">
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          💡 <b>怎么学</b>：先读「原理探究」讲清为什么，再做练习——讲不出为什么，不算学会巧算。
        </p>
      </Panel>
    </div>
  );
}