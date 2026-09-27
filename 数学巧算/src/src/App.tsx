// 数学巧算 · 应用根组件：视图状态机（首页/阶段/课堂/练习/我的）
// 参考英语陪练 WebH5：单路由视图切换；离线不用 TanStack Router（避免 history 基路径问题）

import { useState } from "react";
import { STAGES } from "@/data/stages.generated";
import { ProgressProvider } from "@/lib/store";
import { HomeView } from "@/views/HomeView";
import { StageView } from "@/views/StageView";
import { LessonView } from "@/views/LessonView";
import { PracticeView } from "@/views/PracticeView";
import { WarmupView } from "@/views/WarmupView";
import { MeView } from "@/views/MeView";

export type View =
  | { name: "home" }
  | { name: "stage"; stage: number | string }
  | { name: "lesson"; stage: number | string; lesson: string }
  | { name: "practice"; stage: number | string; lesson: string; level: "basic" | "advance" | "challenge" }
  | { name: "warmup" }
  | { name: "me" };

export function App() {
  const [view, setView] = useState<View>({ name: "home" });

  return (
    <ProgressProvider>
      <div className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col px-4 pb-20 pt-3">
        {view.name === "home" && (
          <HomeView
            stages={STAGES}
            onOpenStage={(stage) => setView({ name: "stage", stage })}
            onOpenWarmup={() => setView({ name: "warmup" })}
            onOpenMe={() => setView({ name: "me" })}
          />
        )}
        {view.name === "stage" && (
          <StageView
            stageKey={view.stage}
            onBack={() => setView({ name: "home" })}
            onOpenLesson={(lesson) => setView({ name: "lesson", stage: view.stage, lesson })}
          />
        )}
        {view.name === "lesson" && (
          <LessonView
            stageKey={view.stage}
            lessonId={view.lesson}
            onBack={() => setView({ name: "stage", stage: view.stage })}
            onPractice={(level) => setView({ name: "practice", stage: view.stage, lesson: view.lesson, level })}
          />
        )}
        {view.name === "practice" && (
          <PracticeView
            stageKey={view.stage}
            lessonId={view.lesson}
            level={view.level}
            onExit={() => setView({ name: "lesson", stage: view.stage, lesson: view.lesson })}
          />
        )}
        {view.name === "me" && <MeView onBack={() => setView({ name: "home" })} />}
        {view.name === "warmup" && <WarmupView onExit={() => setView({ name: "home" })} />}
      </div>
    </ProgressProvider>
  );
}