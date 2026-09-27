// 数学巧算 · 家长报告：今日反馈 / 近 7 天 / 阶段掌握度 / 错题摘要（只读本地数据，不写任何 store 字段）
// 打印：window.print + @media print（styles.css），对齐数独思维 v1.23；ReportView 条件渲染保证 print 时 DOM 仅报告
import { useMemo } from "react";
import { BackBtn, Btn, Panel, Pill, ProgressBar } from "@/components/ui-kit";
import { STAGES } from "@/data/stages.generated";
import { useProgress } from "@/lib/store";

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

  const lessonCount = useMemo(() => {
    let total = 0;
    let practiced = 0;
    for (const r of Object.values(store.lessons)) {
      if (r.done) total++;
      practiced += r.practiced || 0;
    }
    return { total, practiced };
  }, [store.lessons]);

  const recentMistakes = useMemo(() => store.mistakes.slice(0, 10), [store.mistakes]);

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
                    <span className="text-[11px] text-muted-foreground">{sp.done}/{sp.total}</span>
                  </div>
                  <ProgressBar value={sp.pct} tone={sp.pct === 1 ? "lit" : "primary"} className="mt-1" />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="mb-4 px-5 py-4">
          <p className="text-[14px] font-bold text-foreground">
            ✏️ 错题摘要 <span className="text-[12px] text-muted-foreground">（{store.mistakes.length}）</span>
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

function fmtSec(sec: number): string {
  const m = Math.floor(sec / 60);
  if (m === 0) return `${sec} 秒`;
  return `${m} 分`;
}
