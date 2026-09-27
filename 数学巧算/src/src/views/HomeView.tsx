// 数学巧算 · 首页：产品标题 + 六阶段 + 拓展课程地图（阶段卡片：年级/主题/讲数/完成度/点亮）
import { useMemo } from "react";
import { Btn, PageHead, Panel, Pill, ProgressBar } from "@/components/ui-kit";
import { useProgress } from "@/lib/store";
import type { SmartStage } from "@/data/stages.generated";

const STAGE_COLORS: Record<string, string> = {
  "1": "from-[#FFF3D6] to-[#FFE4B5]",
  "2": "from-[#E3F4E3] to-[#C9EAC9]",
  "3": "from-[#E0EEFF] to-[#C3DFFF]",
  "4": "from-[#FFEFE3] to-[#FFDCC2]",
  "5": "from-[#F0E8FF] to-[#DDCFFF]",
  "6": "from-[#FFE9E3] to-[#FFD3C7]",
  X: "from-[#FDF3D8] to-[#F7E3A9]",
};

const STAGE_EMOJI: Record<string, string> = {
  "1": "🌱",
  "2": "🧩",
  "3": "🚀",
  "4": "🧠",
  "5": "🌊",
  "6": "🧀",
  X: "✨",
};

export function HomeView({
  stages,
  onOpenStage,
  onOpenMe,
}: {
  stages: SmartStage[];
  onOpenStage: (stage: number | string) => void;
  onOpenMe: () => void;
}) {
  const { store } = useProgress();

  const stats = useMemo(() => {
    const total = stages.reduce((n, s) => n + (s.lessons?.length || 0), 0);
    const done = Object.values(store.lessons).filter((r) => r.done).length;
    return { total, done };
  }, [stages, store.lessons]);

  return (
    <div className="anim-fade-in-up">
      <PageHead
        eyebrow="巧算乐学 · 小学数学巧算"
        title="跟着小算珠学巧算"
        desc="口算打基础，教程教技巧，练习见实效。先讲「为什么」，再练「怎么算」。"
        right={
          <Btn variant="ghost" size="sm" onClick={onOpenMe} aria-label="我的">
            👤
          </Btn>
        }
      />

      <Panel className="mb-5 px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-muted-foreground">全部进度</p>
            <p className="pt-0.5 text-[24px] font-extrabold text-foreground">
              {stats.done} <span className="text-[14px] font-semibold text-muted-foreground">/ {stats.total} 讲</span>
            </p>
          </div>
          <Pill tone={store.checkin.length > 0 ? "lit" : "idle"}>
            🔥 {store.streak} 天连续练习
          </Pill>
        </div>
        <ProgressBar value={stats.total ? stats.done / stats.total : 0} tone="lit" className="mt-3" />
      </Panel>

      <div className="grid grid-cols-1 gap-3">
        {stages.map((s) => {
          const key = String(s.stage);
          const done = (s.lessons || []).filter((l) => store.lessons[`${key}:${l.lesson_id}`]?.done).length;
          const total = s.lessons?.length || 0;
          const pct = total ? done / total : 0;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onOpenStage(s.stage)}
              className={cn1(
                "panel-border tap-target rounded-3xl border bg-gradient-to-br p-4 text-left shadow-soft",
                "active:scale-[0.985] transition-transform",
                STAGE_COLORS[key] || STAGE_COLORS.X,
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-3xl">{STAGE_EMOJI[key] || "📐"}</span>
                {pct === 1 ? (
                  <Pill tone="lit">✅ 全学会</Pill>
                ) : done > 0 ? (
                  <Pill tone="sky">进行中</Pill>
                ) : (
                  <Pill tone="idle">待开始</Pill>
                )}
              </div>
              <p className="mt-2 text-[17px] font-extrabold text-foreground">
                {s.grade} <span className="font-bold">{s.theme}</span>
              </p>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/60">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct * 100}%` }} />
                </div>
                <span className="text-[12px] font-bold text-muted-foreground">
                  {done}/{total}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <p className="mt-6 text-center text-[12px] leading-relaxed text-muted-foreground">
        对照人教版小学数学教材 · 原理先行，讲不出为什么不算学会
      </p>
    </div>
  );
}

function cn1(...xs: (string | false | undefined)[]): string {
  return xs.filter(Boolean).join(" ");
}