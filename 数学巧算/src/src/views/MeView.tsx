// 数学巧算 · 我的：今日打卡/阶段完成度/错题列表/设置/防沉迷/家长报告/清空数据（纯本地，儿童数据最小化）
import { useMemo, useState } from "react";
import { BackBtn, Btn, PageHead, Panel, Pill, ProgressBar } from "@/components/ui-kit";
import { STAGES } from "@/data/stages.generated";
import { useProgress } from "@/lib/store";
import { ReportView } from "@/views/ReportView";

export function MeView({ onBack }: { onBack: () => void }) {
  const { store, clearAll, setSetting, setGuardPref } = useProgress();
  const [confirmClear, setConfirmClear] = useState(false);
  const [showMistakes, setShowMistakes] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportTap, setReportTap] = useState(0); // 家长门槛：5 秒内连点 5 次
  const [guardOpen, setGuardOpen] = useState(false);

  const stageProgress = useMemo(() => {
    return STAGES.map((s) => {
      const key = String(s.stage);
      const total = s.lessons?.length || 0;
      const done = (s.lessons || []).filter((l) => store.lessons[`${key}:${l.lesson_id}`]?.done).length;
      return { key, grade: s.grade, theme: s.theme, total, done, pct: total ? done / total : 0 };
    });
  }, [store.lessons]);

  const recentMistakes = useMemo(() => store.mistakes.slice(0, 10), [store.mistakes]);

  /* 家长报告入口门槛：5 秒内连点 5 次（对齐数学口算家长面板） */
  const handleReportTap = () => {
    const n = reportTap + 1;
    setReportTap(n);
    window.setTimeout(() => setReportTap((v) => (v === n ? 0 : v)), 5000);
    if (n >= 5) {
      setReportTap(0);
      setShowReport(true);
    }
  };

  if (showReport) {
    return <ReportView onBack={() => setShowReport(false)} />;
  }

  return (
    <div className="anim-fade-in-up">
      <div className="flex items-center gap-1 pb-1">
        <BackBtn onClick={onBack} />
      </div>
      <PageHead eyebrow="巧算乐学" title="我的" desc="所有进度都存在本机，不收集任何个人信息。" />

      {/* 今日打卡 */}
      <Panel className="mb-4 px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[14px] font-bold text-foreground">每日练习</p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              今天练了 {fmtSec(store.todaySec)} · 连续 {store.streak} 天
            </p>
          </div>
          <Pill tone={store.checkin.includes(today()) ? "lit" : "idle"}>
            {store.checkin.includes(today()) ? "✅ 今日已练" : "今日未练"}
          </Pill>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {last7Days().map((d) => (
            <span
              key={d}
              className={
                "flex h-9 w-9 items-center justify-center rounded-xl text-[13px] font-bold " +
                (store.checkin.includes(d)
                  ? "bg-lit text-on-lit"
                  : d === today()
                    ? "border border-dashed border-border text-muted-foreground"
                    : "bg-muted text-muted-foreground")
              }
            >
              {Number(d.slice(8))}
            </span>
          ))}
        </div>
        {store.selfStreak > 0 && (
          <p className="mt-2 text-[12px] text-[var(--lit)]">🛡 我很自律 · 连续 {store.selfStreak} 天</p>
        )}
      </Panel>

      {/* 阶段完成度 */}
      <Panel className="mb-4 px-5 py-4">
        <p className="mb-3 text-[14px] font-bold text-foreground">阶段进度</p>
        <div className="flex flex-col gap-2.5">
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

      {/* 错题 */}
      <Panel className="mb-4 px-5 py-4">
        <button type="button" onClick={() => setShowMistakes((v) => !v)} className="flex w-full items-center justify-between">
          <p className="text-[14px] font-bold text-foreground">
            错题本 <span className="text-[12px] text-muted-foreground">（{store.mistakes.length}）</span>
          </p>
          <span className="text-[18px] text-muted-foreground">{showMistakes ? "−" : "+"}</span>
        </button>
        {showMistakes && (
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
        )}
      </Panel>

      {/* 防沉迷设置 */}
      <Panel className="mb-4 px-5 py-4">
        <button type="button" onClick={() => setGuardOpen((v) => !v)} className="flex w-full items-center justify-between">
          <p className="text-[14px] font-bold text-foreground">⏱ 防沉迷设置</p>
          <span className="text-[18px] text-muted-foreground">{guardOpen ? "−" : "+"}</span>
        </button>
        {guardOpen && (
          <div className="mt-3 flex flex-col gap-3">
            <div>
              <p className="mb-1.5 text-[12.5px] font-semibold text-muted-foreground">
                单次练习时长：{store.guard.minutePref} 分钟
              </p>
              <div className="flex gap-2">
                {[5, 10, 15].map((m) => (
                  <Btn
                    key={m}
                    size="sm"
                    variant={store.guard.minutePref === m ? "primary" : "soft"}
                    onClick={() => setGuardPref("minute", m)}
                  >
                    {m} 分
                  </Btn>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[12.5px] font-semibold text-muted-foreground">
                今日练习量：{store.guard.gamesPref === 0 ? "不限" : `${store.guard.gamesPref} 题`}
              </p>
              <div className="flex gap-2">
                {[10, 20, 30, 0].map((q) => (
                  <Btn
                    key={q}
                    size="sm"
                    variant={store.guard.gamesPref === q ? "primary" : "soft"}
                    onClick={() => setGuardPref("games", q)}
                  >
                    {q === 0 ? "不限" : `${q} 题`}
                  </Btn>
                ))}
              </div>
            </div>
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              到点后孩子可选择「再练一会儿」或「我很自律，今天足够了」。数据只存本机。
            </p>
          </div>
        )}
      </Panel>

      {/* 家长报告入口（连点 5 次进） */}
      <Panel className="mb-4 px-5 py-4">
        <button type="button" onClick={handleReportTap} className="flex w-full items-center justify-between">
          <p className="text-[14px] font-bold text-foreground">📊 家长报告</p>
          <span className="text-[12px] text-muted-foreground">{reportTap > 0 ? `再点 ${5 - reportTap} 次` : "→"}</span>
        </button>
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
          今日反馈 / 近 7 天 / 阶段掌握度 / 错题摘要 · 可打印导出（连点上方 5 次进入，防孩子误触）
        </p>
      </Panel>

      {/* 设置 */}
      <Panel className="mb-4 px-5 py-4">
        <p className="mb-3 text-[14px] font-bold text-foreground">设置</p>
        <label className="flex items-center justify-between">
          <span className="text-[14px]">提示音</span>
          <button
            type="button"
            role="switch"
            aria-checked={store.settings.sound}
            onClick={() => setSetting("sound", !store.settings.sound)}
            className={
              "relative h-7 w-12 rounded-full transition-colors " +
              (store.settings.sound ? "bg-lit" : "bg-muted")
            }
          >
            <span
              className={
                "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all " +
                (store.settings.sound ? "left-[22px]" : "left-0.5")
              }
            />
          </button>
        </label>
      </Panel>

      {/* 清空数据 */}
      <Panel className="mb-4 px-5 py-4">
        <p className="mb-2 text-[14px] font-bold text-foreground">数据管理</p>
        {confirmClear ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] text-muted-foreground">确定清空全部学习记录？</p>
            <div className="flex gap-2">
              <Btn variant="soft" size="sm" onClick={() => setConfirmClear(false)}>
                取消
              </Btn>
              <Btn
                variant="warm"
                size="sm"
                onClick={() => {
                  clearAll();
                  setConfirmClear(false);
                }}
              >
                清空
              </Btn>
            </div>
          </div>
        ) : (
          <Btn variant="ghost" size="sm" onClick={() => setConfirmClear(true)}>
            清空本机学习记录…
          </Btn>
        )}
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
          只存在本机 localStorage，无账号无云同步，清空后不可恢复。
        </p>
      </Panel>

      <p className="pb-2 text-center text-[11px] text-muted-foreground">巧算乐学 · V0.3.0</p>
    </div>
  );
}

function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function last7Days(): string[] {
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    out.push(`${d.getFullYear()}-${m}-${day}`);
  }
  return out;
}

function fmtSec(sec: number): string {
  const m = Math.floor(sec / 60);
  if (m === 0) return `${sec} 秒`;
  return `${m} 分`;
}