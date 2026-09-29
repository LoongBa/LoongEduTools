// 数学巧算 · 家长报告：今日反馈 / 近 7 天 / 阶段掌握度 / 错题摘要 / 薄弱方法 / 下周建议 / 原理复述
// V1.4：新增 🏃 口算热身面板（六档分布 + warmupMist 薄弱 TOP3 + 近 14 天进步曲线）+ 🔁 错题重练面板
// 只读本地数据，不写任何 store 字段
// 打印：window.print + @media print（styles.css），对齐数独思维 v1.23；ReportView 条件渲染保证 print 时 DOM 仅报告
import { useMemo } from "react";
import { BackBtn, Btn, Panel, Pill, ProgressBar } from "@/components/ui-kit";
import { STAGES } from "@/data/stages.generated";
import { useProgress } from "@/lib/store";
import { buildLessonIndex, suggestWeek, topWeakMethods } from "@/lib/weak";
import { LEVEL_LABEL, WARM_LEVELS } from "@/lib/warmup";
import { buildTrend } from "@/lib/report";

export function ReportView({ onBack }: { onBack: () => void }) {
  const { store } = useProgress();

  const todayKey = todayStr();

  const todayStats = useMemo(() => {
    const today = new Date();
    const d0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(d0);
      d.setDate(d0.getDate() - (6 - i));
      return {
        key: todayStr(d),
        checkin: store.checkin.includes(todayStr(d)),
        sec: 0, // todaySec 只有今日；历史秒数未细分，近 7 天仅显示打卡/题量
      };
    });
    const todayDone = week.find((w) => w.key === todayKey)?.checkin || false;
    return { week, todayDone };
  }, [store.checkin, todayKey]);

  const stageProgress = useMemo(() => {
    return STAGES.map((s) => {
      const key = String(s.stage);
      const total = s.lessons?.length || 0;
      const done = (s.lessons || []).filter((l) => store.lessons[`${key}:${l.lesson_id}`]?.done).length;
      return { key, grade: s.grade, theme: s.theme, total, done, pct: total ? done / total : 0 };
    });
  }, [store.lessons]);

  // V0.5 薄弱方法与建议（纯逻辑在 lib/weak.ts，注入 STAGES 一次构建索引；孤儿错题保留可观测）
  const lessonIndex = useMemo(() => buildLessonIndex(STAGES), []);
  const weakMethods = useMemo(() => topWeakMethods(store.mistakes, lessonIndex, 3), [store.mistakes, lessonIndex]);
  const weekSuggestions = useMemo(
    () => suggestWeek(store.mistakes, store.lessons, STAGES, 4),
    [store.mistakes, store.lessons],
  );
  // I5：错题摘要计数排除 warmup（与 weak share 分母口径一致）
  const nonWarmupMistakeCount = useMemo(
    () => store.mistakes.filter((m) => !m.lessonId.startsWith("warmup:")).length,
    [store.mistakes],
  );
  // I4：阶段薄弱标记独立判定（不依赖 top-3 截断）——该阶段任一讲 wrongCount ≥ 2 即亮
  const weakStages = useMemo(() => {
    const set = new Set<string>();
    for (const m of store.mistakes) {
      if (m.lessonId.startsWith("warmup:") || m.wrongCount < 2) continue;
      const ref = lessonIndex.get(m.lessonId);
      if (ref) set.add(String(ref.stage));
    }
    return set;
  }, [store.mistakes, lessonIndex]);

  const lessonCount = useMemo(() => {
    let total = 0;
    let practiced = 0;
    // I4 修复：warmup 热身记录不计入讲次统计
    for (const [k, r] of Object.entries(store.lessons)) {
      if (k.startsWith("warmup:")) continue;
      if (r.done) total++;
      practiced += r.practiced || 0;
    }
    return { total, practiced };
  }, [store.lessons]);

  const recentMistakes = useMemo(() => store.mistakes.slice(0, 10), [store.mistakes]);

  // V1.4 口算热身面板：六档使用分布（all-time practiced）+ warmupMist 薄弱 TOP3 + 近 14 天进步曲线
  const warmLevelRows = useMemo(
    () =>
      WARM_LEVELS.map((lv) => ({
        lv,
        label: LEVEL_LABEL[lv],
        practiced: store.lessons["warmup:" + lv]?.practiced || 0,
      })).filter((x) => x.practiced > 0),
    [store.lessons],
  );
  const warmMistTop = useMemo(
    () =>
      Object.entries(store.warmupMist)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k, count]) => {
          const [, type] = k.split(":", 2); // Oracle N2 防御
          return { type, name: kouName(type), count };
        }),
    [store.warmupMist],
  );
  const warmTrend = useMemo(() => buildTrend(store.warmupDaily, 14, todayKey), [store.warmupDaily, todayKey]);
  // V1.4 错题重练面板：近 7 天 + 全表累计
  const reviewRows = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const key = todayStr(d);
      const p = store.reviewDaily[key];
      return { key, mastered: p?.mastered || 0, retried: p?.retried || 0 };
    });
    const sum = Object.values(store.reviewDaily).reduce(
      (a, p) => ({ mastered: a.mastered + p.mastered, retried: a.retried + p.retried }),
      { mastered: 0, retried: 0 },
    );
    return { days, sum };
  }, [store.reviewDaily]);

  // V0.4 原理复述：STAGES 反查 title/grade（store.lessons 只存 key），recite.date 倒序（YYYY-MM-DD localeCompare 可靠）
  const reciteRows = useMemo(() => {
    const rows: { grade: string; title: string; text: string; date: string }[] = [];
    for (const s of STAGES) {
      for (const l of s.lessons || []) {
        const rec = store.lessons[`${s.stage}:${l.lesson_id}`]?.recite;
        if (rec && rec.text) rows.push({ grade: s.grade, title: l.title, text: rec.text, date: rec.date });
      }
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [store.lessons]);

  const handlePrint = () => {
    window.setTimeout(() => window.print(), 30); // Chrome 61 保用户手势上下文（对齐数独思维）
  };

  return (
    <div className="anim-fade-in-up pt-2">
      <div className="print-hidden flex items-center justify-between pb-3">
        <BackBtn onClick={onBack} />
        <span className="flex-1 text-center text-[15px] font-bold">家长报告</span>
        <Btn variant="soft" size="sm" onClick={handlePrint} aria-label="导出或打印家长报告">
          🖨️ 打印
        </Btn>
      </div>

      <div className="report-root">
        <Panel className="mb-4 px-5 py-4">
          <p className="text-[14px] font-bold text-foreground">📅 今日反馈</p>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
            <span>今日已练：{todayStats.todayDone ? "✅" : "—"}</span>
            <span>今日用时：{fmtSec(store.todaySec)}</span>
            <span>完成讲次：{lessonCount.total}</span>
            <span>练习总题数：{lessonCount.practiced}</span>
            <span>连续打卡：{store.streak} 天</span>
            <span>自律天数：{store.selfStreak} 天</span>
          </div>
        </Panel>

        <Panel className="mb-4 px-5 py-4">
          <p className="text-[14px] font-bold text-foreground">📆 近 7 天</p>
          <div className="mt-3 flex justify-between">
            {todayStats.week.map((d) => (
              <div key={d.key} className="flex flex-col items-center gap-1">
                <span className="text-[11px] text-muted-foreground">{Number(d.key.slice(8))}</span>
                <span
                  className={
                    "flex h-9 w-9 items-center justify-center rounded-xl text-[13px] font-bold " +
                    (d.checkin ? "bg-lit text-on-lit" : "bg-muted text-muted-foreground")
                  }
                >
                  {d.checkin ? "✓" : "·"}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="mb-4 px-5 py-4">
          <p className="text-[14px] font-bold text-foreground">🗺 阶段掌握度</p>
          <div className="mt-3 flex flex-col gap-2.5">
            {stageProgress.map((sp) => (
              <div key={sp.key} className="flex items-center gap-2.5">
                <span className="w-16 shrink-0 text-[13px] font-semibold text-muted-foreground">{sp.grade}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-[12.5px]">{sp.theme}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {weakStages.has(sp.key) && <Pill tone="warm">· 有薄弱</Pill>}
                      <span className="text-[11px] text-muted-foreground">{sp.done}/{sp.total}</span>
                    </span>
                  </div>
                  <ProgressBar value={sp.pct} tone={sp.pct === 1 ? "lit" : "primary"} className="mt-1" />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="mb-4 px-5 py-4">
          <p className="text-[14px] font-bold text-foreground">
            ✏️ 错题摘要 <span className="text-[12px] text-muted-foreground">（{nonWarmupMistakeCount}）</span>
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {recentMistakes.length === 0 && (
              <p className="text-[13px] text-muted-foreground">还没有错题，继续保持！</p>
            )}
            {recentMistakes.map((m) => (
              <div key={m.key} className="rounded-2xl bg-secondary/50 px-3 py-2">
                <p className="font-num text-[14.5px] font-bold text-foreground">
                  {m.expr} <span className="text-[var(--lit)]">= {m.answer}</span>
                </p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">错 {m.wrongCount} 次 · {m.lessonId}</p>
              </div>
            ))}
          </div>
        </Panel>

        {/* V1.4 口算热身面板（六档分布 + 薄弱 TOP3 + 近 14 天进步曲线） */}
        <Panel className="trend-panel mb-4 px-5 py-4">
          <p className="text-[14px] font-bold text-foreground">
            🏃 口算热身 <span className="text-[12px] text-muted-foreground">（六档分布 · 薄弱知识点 · 近 14 天正确率）</span>
          </p>
          {warmLevelRows.length === 0 && (
            <p className="mt-3 text-[13px] text-muted-foreground">还没做过口算热身——做完一组后在这里看进步。</p>
          )}
          {warmLevelRows.length > 0 && (
            <>
              <div className="mt-3 flex flex-col gap-2">
                {warmLevelRows.map((w) => (
                  <div key={w.lv} className="flex items-center gap-2.5">
                    <span className="w-12 shrink-0 text-[12.5px] font-semibold text-muted-foreground">{w.label}</span>
                    <div className="min-w-0 flex-1">
                      <ProgressBar value={Math.min(w.practiced / 200, 1)} tone="primary" className="mt-1" />
                    </div>
                    <span className="shrink-0 text-[11.5px] text-muted-foreground">{w.practiced} 题</span>
                  </div>
                ))}
              </div>
              {warmMistTop.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {warmMistTop.map((t) => (
                    <Pill key={t.type} tone="warm">{t.name} · 错 {t.count} 次</Pill>
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-end justify-between gap-1" aria-label="近14天正确率曲线">
                {warmTrend.map((t) => (
                  <div
                    key={t.key}
                    className="flex flex-1 flex-col items-center gap-1"
                    title={`${t.key}${t.rate === null ? "（未练习）" : ` 正确率 ${Math.round(t.rate * 100)}% · ${t.total} 题`}`}
                  >
                    <div
                      className={
                        "trend-bar " +
                        (t.rate === null ? "trend-bar-empty" : t.rate >= 0.9 ? "trend-bar-high" : t.rate >= 0.6 ? "trend-bar-mid" : "trend-bar-low")
                      }
                      style={{ height: t.rate === null ? 4 : Math.max(8, Math.round(t.rate * 56)) }}
                    />
                    <span className="text-[10px] text-muted-foreground">{Number(t.key.slice(8))}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>

        {/* V0.5 薄弱方法 TOP3（不动 store，纯聚合展示；or​phan 行隐藏） */}
        <Panel className="mb-4 px-5 py-4">
          <p className="text-[14px] font-bold text-foreground">
            🎯 本周薄弱方法 <span className="text-[12px] text-muted-foreground">（{weakMethods.filter((w) => !w.orphan).length}）</span>
          </p>
          <div className="mt-3 flex flex-col gap-2.5">
            {nonWarmupMistakeCount === 0 && (
              <p className="text-[13px] text-muted-foreground">还没有错题，方法掌握得很好 💪</p>
            )}
            {nonWarmupMistakeCount > 0 && weakMethods.filter((w) => !w.orphan).length === 0 && (
              <p className="text-[13px] text-muted-foreground">
                暂未识别到对应讲次的错题（{nonWarmupMistakeCount} 条），建议清空后重新练习。
              </p>
            )}
            {weakMethods.filter((w) => !w.orphan).map((w) => (
              <div key={w.lessonId} className="flex items-center gap-2.5 rounded-2xl bg-secondary/50 px-3 py-2">
                <span className="shrink-0 text-[12px] font-semibold text-muted-foreground">{w.stageGrade}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13.5px] font-semibold text-foreground">{w.title}</span>
                    <Pill tone={w.wrongCount >= 3 ? "warm" : "secondary"}>错 {w.wrongCount} 题</Pill>
                  </div>
                  <ProgressBar value={w.share} tone={w.wrongCount >= 3 ? "lit" : "primary"} className="mt-1" />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* V0.5 下周建议（weak + incomplete 双来源，纯规则生成） */}
        <Panel className="mb-4 px-5 py-4">
          <p className="text-[14px] font-bold text-foreground">📌 下周建议</p>
          <div className="mt-3 flex flex-col gap-2">
            {weekSuggestions.length === 0 && (
              <p className="text-[13px] text-muted-foreground">本周没有明显薄弱方法，继续按阶段推进即可 🎉</p>
            )}
            {weekSuggestions.map((sg) => (
              <div key={sg.lessonId} className="flex items-start gap-2.5 rounded-2xl bg-secondary/50 px-3 py-2">
                <span className="mt-0.5 text-[14px]">{sg.kind === "weak" ? "⚠️" : "📇"}</span>
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold text-foreground">
                    {sg.stageGrade} · {sg.title}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">{sg.action}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* V1.4 错题重练面板（近 7 天掌握 + 全表累计） */}
        <Panel className="trend-panel mb-4 px-5 py-4">
          <p className="text-[14px] font-bold text-foreground">
            🔁 错题重练 <span className="text-[12px] text-muted-foreground">（近 7 天掌握 · 累计 {reviewRows.sum.mastered} 题 / 重练 {reviewRows.sum.retried} 次）</span>
          </p>
          {reviewRows.sum.mastered === 0 && reviewRows.sum.retried === 0 && (
            <p className="mt-3 text-[13px] text-muted-foreground">还没重练过错题——错题答对即掌握，这里看闭环成果。</p>
          )}
          {reviewRows.sum.mastered > 0 && (
            <div className="mt-3 flex items-end justify-between gap-1">
              {reviewRows.days.map((d) => (
                <div key={d.key} className="flex flex-1 flex-col items-center gap-1" title={`${d.key}${d.mastered > 0 ? ` 掌握 ${d.mastered} 题` : ""}`}>
                  <div className={"trend-bar " + (d.mastered > 0 ? "trend-bar-high" : "trend-bar-empty")} style={{ height: d.mastered > 0 ? Math.max(8, d.mastered * 10) : 4 }} />
                  <span className="text-[10px] text-muted-foreground">{Number(d.key.slice(8))}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="mb-4 px-5 py-4 print-truncate">
          <p className="text-[14px] font-bold text-foreground">
            📖 原理复述 <span className="text-[12px] text-muted-foreground">（{reciteRows.length}）</span>
            <span className="print-only float-right text-[11px] text-muted-foreground">打印仅显示最近 5 条</span>
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {reciteRows.length === 0 && (
              <p className="text-[13px] text-muted-foreground">
                还没有原理复述记录——鼓励孩子讲一讲，讲得出原理才算学会。
              </p>
            )}
            {reciteRows.map((r) => (
              <div key={`${r.grade}:${r.title}`} className="recite-row rounded-2xl bg-secondary/50 px-3 py-2">
                <p className="text-[12px] font-bold text-muted-foreground">
                  {r.grade} · {r.title} <span className="ml-1 font-normal text-[11px]">{r.date}</span>
                </p>
                <p className="recite-text-preview mt-1 text-[13px] text-muted-foreground">{r.text.slice(0, 30)}…</p>
                <p className="recite-text-full mt-1 text-[14px] leading-relaxed text-foreground">{r.text}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="mb-4 px-5 py-4 print-hidden">
          <p className="text-[14px] font-bold text-foreground">🔎 家长提示</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
            · 数据全部存在本机，不上传 · 错题多是哪个阶段？看看阶段掌握度<br />
            · 打印：右上角 🖨️，可另存为 PDF（Chrome 61 file:// 可用）
          </p>
        </Panel>

        <p className="pb-2 text-center text-[11px] text-muted-foreground">巧算乐学 · 家长报告</p>
      </div>
    </div>
  );
}

function todayStr(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 口算知识点中文名（window.KOU_META 运行时读，缺失兜底 type id——R4） */
function kouName(type: string): string {
  const w = window as unknown as { KOU_META?: Array<{ id: string; name: string }> };
  return w.KOU_META?.find((m) => m.id === type)?.name || type;
}

function fmtSec(sec: number): string {
  const m = Math.floor(sec / 60);
  if (m === 0) return `${sec} 秒`;
  return `${m} 分`;
}
