// 数学巧算 · 原理复述卡（V0.4）——"讲不出原理不算学会"落地
// 需求 §2.3：孩子用自己的话解释"为什么能这样算"（自由输入 2-3 句，家长可回看；不评分，仅记录）
// 零音频（§4.3）→ 仅文字输入；非受控 textarea + ref（规避中文 IME composition 坑，O3-B2）
// 提示卡"先遮后展"（O2-B3）：默认只显示提问引导，点「看一眼提示」才展开 principle/explore/method
import { useMemo, useRef, useState } from "react";
import { BackBtn, Btn, Panel, Pill } from "@/components/ui-kit";
import { STAGES, type SmartLesson, type SmartStage } from "@/data/stages.generated";
import { useProgress } from "@/lib/store";

export function ReciteView({
  stageKey,
  lessonId,
  onBack,
}: {
  stageKey: number | string;
  lessonId: string;
  onBack: () => void;
}) {
  const key = String(stageKey);
  const { store, saveRecite } = useProgress();
  const [showHint, setShowHint] = useState(false);
  const [len, setLen] = useState(0);
  const [saved, setSaved] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const stage: SmartStage | undefined = useMemo(
    () => STAGES.find((s) => String(s.stage) === key),
    [key],
  );
  const lesson: SmartLesson | undefined = useMemo(
    () => stage?.lessons?.find((l) => l.lesson_id === lessonId || l.title === lessonId),
    [stage, lessonId],
  );

  const lessonKey = `${key}:${lessonId}`;
  const prevRecite = store.lessons[lessonKey]?.recite;

  if (!lesson || !stage) {
    return (
      <div className="pt-2">
        <BackBtn onClick={onBack} />
        <p className="mt-8 text-center text-muted-foreground">未找到该讲</p>
      </div>
    );
  }

  const e = lesson.explore || { model: "text", steps: [] };
  const m = lesson.method || { rhyme: "", steps: [] };

  const handleSave = () => {
    const text = taRef.current?.value.trim() ?? "";
    if (text === "" && !prevRecite) {
      setLen(0);
      return; // 空输入且无旧复述：不保存（避免误触清空）
    }
    saveRecite(lessonKey, text);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="anim-fade-in-up">
      <div className="flex items-center justify-between pb-1">
        <BackBtn onClick={onBack} />
        <span className="text-[13px] font-semibold text-muted-foreground">{stage.grade} · {lesson.title}</span>
        <span className="w-10" />
      </div>

      {/* 提问引导卡（默认态，先遮后展） */}
      <Panel className="mb-4 px-5 py-5">
        <div className="flex items-center gap-2">
          <Pill tone="warm">🧠 原理复述</Pill>
          {prevRecite && <Pill tone="lit">已复述 ✓</Pill>}
        </div>
        <p className="mt-3 text-[17px] font-bold leading-relaxed text-foreground">
          讲一讲：为什么能这样算？
        </p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
          这一讲刚刚教的方法，用你自己的话说说它背后的道理。讲得出「为什么」，才算学会巧算。
        </p>
        {!showHint && (
          <button
            type="button"
            onClick={() => setShowHint(true)}
            className="mt-3 rounded-xl bg-secondary px-3.5 py-2 text-[13px] font-semibold text-secondary-foreground"
          >
            🔎 看一眼提示
          </button>
        )}
      </Panel>

      {/* 提示卡（点击展开） */}
      {showHint && (
        <Panel className="anim-fade-in-up mb-4 px-5 py-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-bold text-[var(--warm)]">小提示（看完记得折叠再写哦）</p>
            <button
              type="button"
              onClick={() => setShowHint(false)}
              className="rounded-lg bg-secondary px-2.5 py-1 text-[12px] font-semibold text-secondary-foreground"
            >
              收起
            </button>
          </div>
          {lesson.principle && <p className="mt-2.5 text-[14.5px] font-semibold leading-relaxed text-foreground">{lesson.principle}</p>}
          <ol className="mt-2.5 space-y-1.5">
            {(e.steps || []).map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-[13.5px] leading-relaxed text-muted-foreground">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          {m.rhyme && (
            <p className="mt-2.5 rounded-xl bg-primary px-3 py-2 text-center text-[15px] font-bold text-primary-foreground">{m.rhyme}</p>
          )}
        </Panel>
      )}

      {/* 复述输入区（非受控 defaultValue + ref，规避 IME composition 坑） */}
      <Panel className="mb-4 px-5 py-4">
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-[14px] font-bold text-foreground">✍️ 写下来</p>
          <span className={"text-[11.5px] " + (len >= 180 ? "text-[var(--warm)]" : "text-muted-foreground")}>
            已写 {len} 字 {len >= 180 ? "· 快写完了" : "· 2-3 句就好"}
          </span>
        </div>
        <textarea
          ref={taRef}
          defaultValue={prevRecite?.text ?? ""}
          maxLength={200}
          rows={4}
          onInput={() => setLen(taRef.current?.value.length ?? 0)}
          placeholder="把你对原理的理解写下来，2-3 句就好"
          className="w-full resize-none rounded-2xl border border-border bg-secondary/40 px-3.5 py-3 text-[15px] leading-relaxed text-foreground outline-none focus:border-primary"
        />
        {prevRecite && (
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            上次复述：{prevRecite.date} · 已存内容默认显示，可直接修改
          </p>
        )}
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            不评分、不打分——家长会在报告里看到你的想法。
          </p>
          <Btn variant="lit" size="sm" onClick={handleSave}>
            {saved ? "已保存 ✓" : "保存"}
          </Btn>
        </div>
      </Panel>
    </div>
  );
}