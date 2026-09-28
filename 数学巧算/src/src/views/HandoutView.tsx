// 数学巧算 · 打印讲义（V0.6）——每讲 A4 打印版（原理 + 例题 + 练习单 + 答案区）
// 产品依据：需求 §2.3「打印讲义：每讲可生成 A4 打印版，供离线纸张练习」
// 纯 JSX 渲染 .handout-sheet（B3：不用 innerHTML——React 工程与 ReportView .report-root 同构）
// 练习单题面运行时生成（engine 必填注入 B1；失败返回 [] 不降级 B2 → 警告 + 打印按钮置灰）
// 答案区 break-before: page 独立新页（I2 防孩子翻页见答案）；不计 store（N3：不 todaySec/guard/practiced）
import { useMemo, useState } from "react";
import { BackBtn, Btn, Panel } from "@/components/ui-kit";
import { STAGES, type SmartLesson, type SmartStage } from "@/data/stages.generated";
import { buildHandout, generatePractice, hashSeed, type HandoutPractice } from "@/lib/handout";

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

/** V1.1 每档配置：是否打印 + 题数（默认 lesson count，钳制 1..10） */
type LevelConfig = { on: boolean; count: number };

/** V1.1 默认配置：三档全打 + lesson.practice[level].count（缺失兜底 5/5/3，题数钳制 1..10） */
function defaultConfigOf(lesson: SmartLesson | undefined): Record<Level, LevelConfig> {
  const out = {} as Record<Level, LevelConfig>;
  for (const lv of ["basic", "advance", "challenge"] as Level[]) {
    out[lv] = { on: true, count: Math.min(10, Math.max(1, lesson?.practice?.[lv]?.count || 5)) };
  }
  return out;
}

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
  // V1.1 I1：engineOk 每次 render 重算（替代 useState 冻结——与响应式 practiceByLevel 一致）
  const engineOk = !!getEngine();

  const stage: SmartStage | undefined = useMemo(
    () => STAGES.find((s) => String(s.stage) === key),
    [key],
  );
  const lesson: SmartLesson | undefined = useMemo(
    () => stage?.lessons?.find((l) => l.lesson_id === lessonId || l.title === lessonId),
    [stage, lessonId],
  );

  // V1.1 配置状态：默认三档全打 + lesson.practice[level].count（缺失兜底 5/5/3，题数钳制 1..10）
  const [config, setConfig] = useState<Record<Level, LevelConfig>>(() => defaultConfigOf(lesson));
  // V1.1 seed：默认 hashSeed(lessonId) → 同讲恒同默认题单（D1 固定优先）；换一组题 seed+1
  const [seed, setSeed] = useState<number>(() => hashSeed(String(lessonId)));

  // buildHandout 纯变换（I4：count 从 lesson.practice[level].count 动态取，缺失兜底 5/5/3）
  const handout = useMemo(
    () => (lesson ? buildHandout(lesson, stage?.grade || "") : null),
    [lesson, stage],
  );

  // 练习单：useMemo 响应式（config/seed 变化 → 确定性重生成；StrictMode dev 双调无害）
  const practiceByLevel = useMemo<Record<Level, HandoutPractice[]>>(() => {
    const out = {} as Record<Level, HandoutPractice[]>;
    if (!lesson) return out;
    const engine = getEngine();
    for (const lv of ["basic", "advance", "challenge"] as Level[]) {
      out[lv] = config[lv].on
        ? generatePractice(lesson.practice?.[lv]?.gen || "", config[lv].count, engine, seed)
        : [];
    }
    return out;
  }, [lesson, config, seed]);

  if (!lesson || !stage) {
    return (
      <div className="pt-2">
        <BackBtn onClick={onBack} />
        <p className="mt-8 text-center text-muted-foreground">未找到该讲</p>
      </div>
    );
  }

  // 引擎不可用 → 打印置灰（B2：不降级，警告 + 置灰）；全档未勾选是合法配置（打印原理/例题版）
  const engineBroken = !engineOk;
  const anyLevelOn = (["basic", "advance", "challenge"] as Level[]).some((lv) => config[lv].on);
  const practiceEmptyMsg = engineBroken
    ? "（引擎未就绪，练习单未生成）"
    : !anyLevelOn
      ? "（未勾选练习档，仅打印原理/例题）"
      : "（练习单生成失败，请点「换一组题」重试）";

  const toggleLevel = (lv: Level) => setConfig((p) => ({ ...p, [lv]: { ...p[lv], on: !p[lv].on } }));
  const decCount = (lv: Level) => setConfig((p) => ({ ...p, [lv]: { ...p[lv], count: Math.max(1, p[lv].count - 1) } }));
  const incCount = (lv: Level) => setConfig((p) => ({ ...p, [lv]: { ...p[lv], count: Math.min(10, p[lv].count + 1) } }));
  const rollSeed = () => setSeed((s) => (s + 1) >>> 0);
  const resetConfig = () => {
    setSeed(hashSeed(String(lessonId)));
    setConfig(defaultConfigOf(lesson));
  };

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

      {/* V1.1 屏上配置面板（print-hidden，不进纸张）：三档勾选 + 题数 + 换组/恢复默认 */}
      <div className="print-hidden mb-3 rounded-2xl border border-border bg-secondary/30 px-3.5 py-3">
        <p className="text-[12px] font-bold text-muted-foreground">📐 讲义配置（不进纸张）</p>
        <div className="mt-2 flex flex-col gap-2">
          {(["basic", "advance", "challenge"] as Level[]).map((lv) => {
            const [label] = LEVEL_LABEL[lv];
            const c = config[lv];
            return (
              <div key={lv} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleLevel(lv)}
                  aria-label={`${label} 开关`}
                  className={
                    "tap-target flex h-8 items-center gap-1 rounded-xl px-2.5 text-[13px] font-bold " +
                    (c.on ? "bg-lit text-on-lit" : "bg-secondary text-muted-foreground")
                  }
                >
                  {c.on ? "✓" : "○"} {label.replace(/^[一二三]、/, "")}
                </button>
                <button
                  type="button"
                  onClick={() => decCount(lv)}
                  disabled={c.count <= 1}
                  aria-label={`${label} 减题数`}
                  className="tap-target flex h-8 w-8 items-center justify-center rounded-xl bg-secondary text-[16px] font-bold text-secondary-foreground disabled:opacity-40"
                >
                  −
                </button>
                <span className="w-8 text-center text-[13px] font-bold text-foreground">{c.count} 题</span>
                <button
                  type="button"
                  onClick={() => incCount(lv)}
                  disabled={c.count >= 10}
                  aria-label={`${label} 加题数`}
                  className="tap-target flex h-8 w-8 items-center justify-center rounded-xl bg-secondary text-[16px] font-bold text-secondary-foreground disabled:opacity-40"
                >
                  ＋
                </button>
              </div>
            );
          })}
          <div className="mt-1 flex items-center gap-2">
            <Btn variant="soft" size="sm" onClick={rollSeed} aria-label="换一组题">🔄 换一组题</Btn>
            <Btn variant="ghost" size="sm" onClick={resetConfig} aria-label="恢复默认">恢复默认</Btn>
          </div>
        </div>
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

        {/* 四、练习单（V1.1：三档按配置勾选渲染，三态区分——未勾选/生成失败/正常） */}
        <section className="print-block mb-4">
          <h2 className="text-[14px] font-bold text-foreground">四、练习单</h2>
          {allPractice.length === 0 ? (
            <p className="mt-2 text-[13px] text-muted-foreground">{practiceEmptyMsg}</p>
          ) : (
            <div className="mt-2 space-y-4">
              {(["basic", "advance", "challenge"] as Level[]).map((lv) => {
                const [label, desc] = LEVEL_LABEL[lv];
                const items = practiceByLevel[lv];
                if (!config[lv].on) return null; // 未勾选：不渲染
                if (items.length === 0) {
                  // 勾选但生成失败：引导换组脱困（I2）
                  return (
                    <div key={lv}>
                      <p className="text-[13px] font-bold text-foreground">{label}</p>
                      <p className="mt-1 text-[12px] font-semibold text-[var(--warm)]">
                        ⚠ 该组题生成失败，请点「换一组题」
                      </p>
                    </div>
                  );
                }
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
            <p className="mt-2 text-[12.5px] text-muted-foreground">{practiceEmptyMsg}</p>
          )}
        </section>

        {/* 页脚（N1：生成日期；N2：题单组别——家长可对上"第 N 组"复练） */}
        <p className="mt-5 border-t border-border pt-2 text-center text-[11px] text-muted-foreground">
          生成日期：{todayStr()} · 题单组别：{seed - hashSeed(String(lessonId)) + 1} · 巧算乐学 V1.1.0
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