// 数学巧算 · 课堂页（七步教学视图，产品核心）
// 七步：①前置检查 → ②情境引入 → ③原理探究 → ④方法要领 → ⑤例题精讲 → ⑥变式易错 → ⑦分层练习
// V0.4：复述入口三层曝光——③原理步骤 inline（O3-N1）+ ⑦练习步骤入口卡 + 顶部 banner（O3-I1 二次曝光）
import { useMemo, useState } from "react";
import { BackBtn, Btn, Panel, Pill, StepDots } from "@/components/ui-kit";
import { STAGES, type SmartLesson, type SmartStage } from "@/data/stages.generated";
import { useProgress } from "@/lib/store";

const STEPS = ["前置", "情境", "原理", "方法", "例题", "易错", "练习"] as const;
type Step = (typeof STEPS)[number];

export function LessonView({
  stageKey,
  lessonId,
  onBack,
  onOpenRecite,
  onPractice,
}: {
  stageKey: number | string;
  lessonId: string;
  onBack: () => void;
  onOpenRecite: () => void;
  onPractice: (level: "basic" | "advance" | "challenge") => void;
}) {
  const key = String(stageKey);
  const [step, setStep] = useState<Step>("前置");
  const { store } = useProgress();
  const recite = store.lessons[`${key}:${lessonId}`]?.recite;

  const stage: SmartStage | undefined = useMemo(
    () => STAGES.find((s) => String(s.stage) === key),
    [key],
  );
  const lesson: SmartLesson | undefined = useMemo(
    () => stage?.lessons?.find((l) => l.lesson_id === lessonId || l.title === lessonId),
    [stage, lessonId],
  );

  if (!lesson || !stage) {
    return (
      <div className="pt-2">
        <BackBtn onClick={onBack} />
        <p className="mt-8 text-center text-muted-foreground">未找到该讲</p>
      </div>
    );
  }

  const stepIndex = STEPS.indexOf(step);
  const stepNum = stepIndex + 1;

  return (
    <div className="anim-fade-in-up">
      <div className="flex items-center justify-between pb-1">
        <BackBtn onClick={onBack} />
        <span className="text-[13px] font-semibold text-muted-foreground">
          {stage.grade} · {lesson.title}
        </span>
        <span className="w-10" />
      </div>

      {/* 步骤条 */}
      <div className="flex items-center justify-between px-1 pb-4">
        <StepDots total={STEPS.length} current={stepIndex} labels={[...STEPS]} />
      </div>

      {/* V0.4 复述提示 banner（所有 step 可见，非模态；练习返回后 step 重置为"前置"仍能曝光） */}
      <button
        type="button"
        onClick={onOpenRecite}
        className={
          "tap-target mb-4 flex w-full items-center justify-between rounded-2xl border px-4 py-2.5 text-left " +
          (recite
            ? "border-[var(--lit)]/30 bg-lit-soft"
            : "border-[var(--warm)]/40 bg-warm-soft/60")
        }
      >
        <span className="text-[13px] font-semibold">
          {recite ? "✓ 原理已讲过 · 可再改" : "🧠 讲一讲原理（讲得出才算学会）"}
        </span>
        <span className="text-[16px] text-[var(--warm)]">→</span>
      </button>

      {/* 内容区 */}
      <div className="min-h-[380px]">
        {step === "前置" && <PrereqStep lesson={lesson} />}
        {step === "情境" && <SituationStep lesson={lesson} />}
        {step === "原理" && <ExploreStep lesson={lesson} onOpenRecite={onOpenRecite} />}
        {step === "方法" && <MethodStep lesson={lesson} />}
        {step === "例题" && <ExamplesStep lesson={lesson} />}
        {step === "易错" && <MistakesStep lesson={lesson} />}
        {step === "练习" && <PracticeStep lesson={lesson} onPractice={onPractice} onOpenRecite={onOpenRecite} recite={recite} />}
      </div>

      {/* 底部导航 */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <Btn variant="ghost" size="md" disabled={stepIndex === 0} onClick={() => setStep(STEPS[stepIndex - 1])}>
          ← 上一步
        </Btn>
        {stepIndex < STEPS.length - 1 ? (
          <Btn
            variant="primary"
            size="md"
            onClick={() => setStep(STEPS[stepIndex + 1])}
            className="min-w-[120px]"
          >
            下一步 →
          </Btn>
        ) : (
          <Btn variant="lit" size="md" onClick={() => onPractice("basic")} className="min-w-[120px]">
            开始练习
          </Btn>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ 各步骤内容 ------------------------------ */

function StepShell({ stepLabel, children }: { stepLabel: string; children: React.ReactNode }) {
  return (
    <section className="anim-fade-in-up">
      <Pill tone="sky" className="mb-2">{stepLabel}</Pill>
      {children}
    </section>
  );
}

function PrereqStep({ lesson }: { lesson: SmartLesson }) {
  return (
    <StepShell stepLabel="① 前置知识检查">
      <Panel className="px-4 py-3">
        <p className="mb-2 text-[14px] font-semibold text-muted-foreground">学这一讲前，先确认已经会：</p>
        <ul className="space-y-2">
          {(lesson.prereq || []).map((p, i) => (
            <li key={i} className="flex items-start gap-2 text-[15px] leading-relaxed">
              <span className="mt-0.5 text-[var(--lit)]">✓</span>
              {p}
            </li>
          ))}
        </ul>
        {(!lesson.prereq || !lesson.prereq.length) && (
          <p className="text-[14px] text-muted-foreground">本讲无需额外前置，直接开始吧。</p>
        )}
      </Panel>
      <p className="mt-3 px-1 text-[13px] text-muted-foreground">缺哪补哪——不默认你已经会。</p>
    </StepShell>
  );
}

function SituationStep({ lesson }: { lesson: SmartLesson }) {
  const s = lesson.situation || { text: "", question: "" };
  return (
    <StepShell stepLabel="② 情境引入">
      <Panel className="px-4 py-4">
        <p className="text-[17px] leading-relaxed text-foreground">{s.text}</p>
        {s.question && (
          <p className="mt-3 rounded-2xl bg-warm-soft px-3 py-2.5 text-[16px] font-bold text-[var(--warm)]">
            🤔 {s.question}
          </p>
        )}
      </Panel>
      <p className="mt-3 px-1 text-[13px] text-muted-foreground">
        先感受一下「直接算有点麻烦」——这正说明巧算有用。
      </p>
    </StepShell>
  );
}

function ExploreStep({ lesson, onOpenRecite }: { lesson: SmartLesson; onOpenRecite: () => void }) {
  const e = lesson.explore || { model: "text", steps: [] };
  const modelLabel =
    e.model === "area" ? "📐 面积图" : e.model === "sticks" ? "🍢 小棒图" : e.model === "numberline" ? "📏 数轴" : "🧠 推导";
  return (
    <StepShell stepLabel="③ 原理探究（为什么能这样算）">
      <Panel className="px-4 py-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[15px] font-bold text-foreground">{lesson.principle}</p>
          <Pill tone="warm">{modelLabel}</Pill>
        </div>
        <ol className="space-y-2.5">
          {(e.steps || []).map((s, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[15px] leading-relaxed">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground">
                {i + 1}
              </span>
              <span className="font-num">{s}</span>
            </li>
          ))}
        </ol>
      </Panel>
      <p className="mt-3 px-1 text-[13px] text-muted-foreground">
        这一讲的核心：讲得出「为什么」，才算学会巧算。{" "}
        <button
          type="button"
          onClick={onOpenRecite}
          className="font-semibold text-[var(--warm)] underline underline-offset-2"
        >
          → 现在讲一讲
        </button>
      </p>
    </StepShell>
  );
}

function MethodStep({ lesson }: { lesson: SmartLesson }) {
  const m = lesson.method || { rhyme: "", steps: [] };
  return (
    <StepShell stepLabel="④ 方法要领">
      <Panel className="px-4 py-4">
        {m.rhyme && (
          <p className="mb-3 rounded-2xl bg-primary px-4 py-3 text-center text-[18px] font-extrabold text-primary-foreground">
            {m.rhyme}
          </p>
        )}
        <ol className="space-y-2">
          {(m.steps || []).map((s, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[15px] leading-relaxed">
              <span className="mt-0.5 text-[var(--warm)]">{i + 1}.</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </Panel>
    </StepShell>
  );
}

function ExamplesStep({ lesson }: { lesson: SmartLesson }) {
  const [revealed, setRevealed] = useState<number | null>(null);
  const examples = lesson.examples || [];
  return (
    <StepShell stepLabel="⑤ 例题精讲（常规算法 vs 巧算）">
      <div className="flex flex-col gap-3">
        {examples.map((ex, i) => (
          <Panel key={i} className="px-4 py-3.5">
            <div className="flex items-center justify-between">
              <span className="font-num text-[20px] font-extrabold text-foreground">{ex.expr}</span>
              <Pill tone="idle">例 {i + 1}</Pill>
            </div>
            <div className="mt-2.5 grid grid-cols-1 gap-2">
              <div className="rounded-2xl bg-secondary/60 px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">常规算法</p>
                <p className="mt-0.5 font-num text-[14.5px] text-muted-foreground">{ex.normal}</p>
              </div>
              <div className="rounded-2xl bg-lit-soft px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--lit)]">巧算</p>
                <p className="mt-0.5 font-num text-[14.5px] font-bold text-foreground">{ex.smart}</p>
                {ex.why && <p className="mt-1 text-[12.5px] text-muted-foreground">✨ {ex.why}</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRevealed(revealed === i ? null : i)}
              className="mt-2.5 w-full rounded-xl bg-secondary py-2 text-[13px] font-semibold text-secondary-foreground"
            >
              {revealed === i ? "收起答案" : "看答案"}
            </button>
            {revealed === i && (
              <p className="mt-2 text-center font-num text-[18px] font-extrabold text-[var(--lit)]">
                = {ex.answer}
              </p>
            )}
          </Panel>
        ))}
      </div>
    </StepShell>
  );
}

function MistakesStep({ lesson }: { lesson: SmartLesson }) {
  const mistakes = lesson.mistakes || [];
  return (
    <StepShell stepLabel="⑥ 变式与易错">
      {mistakes.length === 0 ? (
        <Panel className="px-4 py-3">
          <p className="text-[15px] text-muted-foreground">本讲暂无常见错误条目，直接去练习吧。</p>
        </Panel>
      ) : (
        <div className="flex flex-col gap-3">
          {mistakes.map((m, i) => (
            <Panel key={i} className="px-4 py-3.5">
              <p className="rounded-xl bg-warm-soft px-3 py-2 font-num text-[15px] font-bold text-[var(--warm)]">
                ❌ {m.wrong}
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">🧐 {m.reason}</p>
            </Panel>
          ))}
        </div>
      )}
      <p className="mt-3 px-1 text-[13px] text-muted-foreground">错误也是学习材料——知道错在哪，才不会再错。</p>
    </StepShell>
  );
}

function PracticeStep({
  lesson,
  onPractice,
  onOpenRecite,
  recite,
}: {
  lesson: SmartLesson;
  onPractice: (level: "basic" | "advance" | "challenge") => void;
  onOpenRecite: () => void;
  recite?: { text: string; date: string };
}) {
  const p = lesson.practice || {};
  return (
    <StepShell stepLabel="⑦ 分层练习">
      <div className="flex flex-col gap-3">
        {(["basic", "advance", "challenge"] as const).map((lv) => {
          const meta = p[lv];
          const count = meta?.count || 0;
          const labels = {
            basic: ["基础", "刚学的方法，直接套用", "soft"],
            advance: ["提高", "混合方法，动动脑筋", "warm"],
            challenge: ["挑战", "综合运用 + 限时", "lit"],
          } as const;
          const [name, desc, tone] = labels[lv];
          return (
            <button
              key={lv}
              type="button"
              onClick={() => onPractice(lv)}
              className={
                "panel-border tap-target flex items-center justify-between rounded-3xl border p-4 text-left shadow-soft transition-transform active:scale-[0.985] " +
                (tone === "lit" ? "bg-lit-soft" : tone === "warm" ? "bg-warm-soft" : "bg-secondary/50")
              }
            >
              <span>
                <span className="block text-[16px] font-extrabold text-foreground">{name} · {count} 题</span>
                <span className="mt-0.5 block text-[12.5px] text-muted-foreground">{desc}</span>
              </span>
              <span className="text-[22px] text-[var(--warm)]">→</span>
            </button>
          );
        })}
      </div>

      {/* V0.4 复述入口卡（⑦ 收尾时机） */}
      <button
        type="button"
        onClick={onOpenRecite}
        className={
          "panel-border tap-target mt-3 flex w-full items-center justify-between rounded-3xl border p-4 text-left shadow-soft transition-transform active:scale-[0.985] " +
          (recite ? "bg-lit-soft" : "bg-warm-soft/60")
        }
      >
        <span>
          <span className="block text-[15px] font-extrabold text-foreground">
            {recite ? "🧠 原理已复述 · 再讲一讲" : "🧠 讲一讲原理"}
          </span>
          <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
            {recite ? `上次：${recite.date}，可修改` : "用自己的话说说为什么能这样算（不评分，仅记录）"}
          </span>
        </span>
        <span className="text-[22px] text-[var(--warm)]">→</span>
      </button>

      <p className="mt-3 px-1 text-[13px] text-muted-foreground">做错也不怕——错题会进错题本，之后帮你重点补。</p>
    </StepShell>
  );
}