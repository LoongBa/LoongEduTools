// 数学巧算 · 打印讲义（V0.6）——每讲 A4 打印版（原理 + 例题 + 练习单 + 答案区）
// 产品依据：需求 §2.3「打印讲义：每讲可生成 A4 打印版，供离线纸张练习」
// 纯 JSX 渲染 .handout-sheet（B3：不用 innerHTML——React 工程与 ReportView .report-root 同构）
// 练习单题面运行时生成（engine 必填注入 B1；失败返回 [] 不降级 B2 → 警告 + 打印按钮置灰）
// 答案区 break-before: page 独立新页（I2 防孩子翻页见答案）；不计 store（N3：不 todaySec/guard/practiced）
import { useMemo, useState } from "react";
import { BackBtn, Btn, Panel } from "@/components/ui-kit";
import { STAGES, type SmartLesson, type SmartStage } from "@/data/stages.generated";
import { buildHandout, generatePractice, type HandoutPractice } from "@/lib/handout";

type Level = "basic" | "advance" | "challenge";

/** 引擎存在性检查：离线构建后由 assets/smart_gen/smart_gen.js 挂载（对齐 PracticeView L21-26） */
function getEngine(): { gen: (name: string) => { text: string; answer: number | string } | null } | null {
  const w = window as unknown as {
    SMART_GENERATORS?: { gen: (name: string) => { text: string; answer: number | string } | null };
  };
  return w.SMART_GENERATORS || null;
}

const LEVEL_LABEL: Record<Level, [string, string]> = {
  basic: ["一、基础题", "刚学的方法，直接套用"],
  advance: ["二、提高题", "混合方法，动动脑筋"],
  challenge: ["三、挑战题", "综合运用 + 限时"],
};

export function HandoutView({
  stageKey,
  lessonId,
  onBack,
}: {
  stageKey: number | string;
  lessonId: string;
  onBack: () => void;
}) {
  const key = String(stageKey);
  const [engineOk] = useState<boolean>(() => !!getEngine());

  const stage: SmartStage | undefined = useMemo(
    () => STAGES.find((s) => String(s.stage) === key),
    [key],
  );
  const lesson: SmartLesson | undefined = useMemo(
    () => stage?.lessons?.find((l) => l.lesson_id === lessonId || l.title === lessonId),
    [stage, lessonId],
  );

  // buildHandout 纯变换（I4：count 从 lesson.practice[level].count 动态取，缺失兜底 5/5/3）
  const handout = useMemo(
    () => (lesson ? buildHandout(lesson, stage?.grade || "") : null),
    [lesson, stage],
  );

  // 练习单：useState 初始化器生成一次（N4：StrictMode dev 双调无害，纯函数）
  const [practiceByLevel] = useState<Record<Level, HandoutPractice[]>>(() => {
    const out = {} as Record<Level, HandoutPractice[]>;
    if (!lesson) return out;
    const engine = getEngine();
    for (const lv of ["basic", "advance", "challenge"] as Level[]) {
      const count = lesson.practice?.[lv]?.count || 5;
      const gen = lesson.practice?.[lv]?.gen || "";
      out[lv] = generatePractice(gen, count, engine);
    }
    return out;
  });

  if (!lesson || !stage) {
    return (
      <div className="pt-2">
        <BackBtn onClick={onBack} />
        <p className="mt-8 text-center text-muted-foreground">未找到该讲</p>
      </div>
    );
  }

  // 引擎不可用 → 练习单全空（B2：不降级，警告 + 打印置灰）
  const engineBroken = practiceByLevel.basic.length === 0 && practiceByLevel.advance.length === 0 && practiceByLevel.challenge.length === 0 && !engineOk;

  const handlePrint = () => {
    if (engineBroken) return;
    window.setTimeout(() => window.print(), 30); // Chrome 61 保用户手势上下文（对齐 ReportView L52-54）
  };

  const allPractice = [...practiceByLevel.basic, ...practiceByLevel.advance, ...practiceByLevel.challenge];

  return (
    <div className="anim-fade-in-up">
      {/* 屏上工具条（打印时隐藏） */}
      <div className="print-hidden mb-3 flex items-center justify-between">
        <BackBtn onClick={onBack} />
        <span className="flex-1 text-center text-[15px] font-bold">打印讲义 · {stage.grade}《{lesson.title}》</span>
        <Btn variant="soft" size="sm" onClick={handlePrint} disabled={engineBroken} aria-label="打印讲义">
          🖨️ 打印
        </Btn>
      </div>

      {/* 引擎不可用警告（print-hidden，不打印进纸张） */}
      {engineBroken && (
        <Panel className="mb-4 px-4 py-3 print-hidden">
          <p className="text-[13px] font-semibold text-[var(--warm)]">⚠️ 引擎未就绪，练习单未生成</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">请刷新页面后重试；原理与例题部分不受影响。</p>
        </Panel>
      )}

      {/* 讲义纸张内容（.handout-sheet 打印渲染，屏上即预览） */}
      <div className="handout-sheet rounded-3xl border border-border bg-card px-5 py-5 shadow-soft">
        {/* 头部 */}
        <div className="mb-4 border-b border-border pb-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">巧算乐学 · 打印讲义</p>
          <h1 className="mt-1 text-[20px] font-extrabold text-foreground">{stage.grade} · {lesson.title}</h1>
          <p className="mt-1 text-[12px] text-muted-foreground">姓名：____________　日期：________</p>
        </div>

        {/* 一、原理 */}
        <section className="print-block mb-4">
          <h2 className="text-[14px] font-bold text-foreground">一、原理（为什么能这样算）</h2>
          {handout?.principle ? (
            <p className="mt-2 text-[13.5px] leading-relaxed text-foreground">{handout.principle}</p>
          ) : (
            <p className="mt-2 text-[13px] text-muted-foreground">（本讲无原理摘要）</p>
          )}
          {handout && handout.exploreSteps.length > 0 && (
            <ol className="mt-2 space-y-1">
              {handout.exploreSteps.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-muted-foreground">
                  <span className="mt-0.5 shrink-0 font-bold">{i + 1}.</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* 二、方法口诀 */}
        {handout?.methodRhyme && (
          <section className="print-block mb-4">
            <h2 className="text-[14px] font-bold text-foreground">二、方法口诀</h2>
            <p className="mt-2 rounded-xl bg-primary/10 px-4 py-2 text-center text-[15px] font-bold text-primary-foreground">
              {handout.methodRhyme}
            </p>
          </section>
        )}

        {/* 三、例题 */}
        {handout && handout.examples.length > 0 && (
          <section className="print-block mb-4">
            <h2 className="text-[14px] font-bold text-foreground">三、例题（常规算法 vs 巧算）</h2>
            <div className="mt-2 space-y-2.5">
              {handout.examples.map((ex, i) => (
                <div key={i} className="rounded-xl bg-secondary/40 px-3 py-2">
                  <p className="font-num text-[15px] font-extrabold text-foreground">{ex.expr}</p>
                  <div className="mt-1 grid grid-cols-1 gap-1.5 text-[12.5px]">
                    <p className="text-muted-foreground">常规算法：{ex.normal}</p>
                    <p className="font-bold text-foreground">巧算：{ex.smart}</p>
                    {ex.why && <p className="text-muted-foreground">✨ {ex.why}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 四、练习单（三档全打，I5） */}
        <section className="print-block mb-4">
          <h2 className="text-[14px] font-bold text-foreground">四、练习单</h2>
          {allPractice.length === 0 ? (
            <p className="mt-2 text-[13px] text-muted-foreground">（引擎未就绪，练习单未生成）</p>
          ) : (
            <div className="mt-2 space-y-4">
              {(["basic", "advance", "challenge"] as Level[]).map((lv) => {
                const [label, desc] = LEVEL_LABEL[lv];
                const items = practiceByLevel[lv];
                if (items.length === 0) return null;
                return (
                  <div key={lv}>
                    <p className="text-[13px] font-bold text-foreground">{label}（{items.length} 题）</p>
                    <p className="text-[11.5px] text-muted-foreground">{desc}</p>
                    <div className="mt-1.5">
                      {items.map((p, i) => (
                        <div key={i} className="handout-practice-row text-[14px] text-foreground">
                          <span className="shrink-0 font-num">{i + 1}.</span>
                          <span className="font-num">{p.text}</span>
                          <span className="ml-1 flex-1 border-b border-dotted border-muted-foreground/50" />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 答案区（家长用 · 独立新页防泄露，I2） */}
        <section className="handout-answer-area">
          <p className="text-[13px] font-bold text-foreground">答案（家长批改用 · 请沿虚线裁剪）</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {allPractice.map((p, i) => (
              <span key={i} className="font-num text-[12.5px] text-muted-foreground">
                {i + 1}. {p.answer}
              </span>
            ))}
          </div>
          {allPractice.length === 0 && (
            <p className="mt-2 text-[12.5px] text-muted-foreground">（练习单未生成）</p>
          )}
        </section>

        {/* 页脚（N1：生成日期） */}
        <p className="mt-5 border-t border-border pt-2 text-center text-[11px] text-muted-foreground">
          生成日期：{todayStr()} · 巧算乐学 V0.6.0
        </p>
      </div>
    </div>
  );
}

function todayStr(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}