// 家长报告：今日反馈 / 近 7 天 / 成长进度，全部由本地存档派生（只读）。
// 屏显用 CSS 比例条；打印视图仅保留标题与三张卡（no-print 隐藏其余）。

import { useMemo } from "react";
import { Card, Bar, Stat, Btn } from "./ui/kit";
import { useStore, todayStr, type LevelId } from "@/lib/store";
import { ALL_SKILLS, ACHIEVEMENTS } from "@/lib/content";
import { ART_MISTAKES } from "@/lib/art";
import { formatMs } from "./Overlay";

export function ParentReport({ onBack, onExport }: { onBack: () => void; onExport: () => void }) {
  const { store } = useStore();

  const data = useMemo(() => {
    const today = todayStr();
    const todayItems = store.history.filter((h) => h.date === today);
    const week: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      week[todayStr(d)] = 0;
    }
    store.history.forEach((h) => {
      if (week[h.date] != null) week[h.date] += 1;
    });
    const byLevel: Record<LevelId, number> = { easy: 0, normal: 0, hard: 0 };
    store.history.forEach((h) => {
      byLevel[h.level] += 1;
    });
    const starsAvg = store.history.length ? store.history.reduce((s, h) => s + h.stars, 0) / store.history.length : 0;
    const hintFree = store.history.length ? store.history.filter((h) => h.hints === 0).length / store.history.length : 0;
    const litBase = Object.keys(store.skills).length;
    const litAdv = Object.keys(store.advSkills).length;
    const achGot = Object.keys(store.achievements).length;
    const dailyDone = !!store.daily && store.daily.date === today;
    const streak = store.checkin.streak;
    // 最近解锁成就：取 store.achievements 中日期值（YYYYMMDD）最大的一条
    let latestKey: string | null = null;
    let latestNum = 0;
    for (const [k, v] of Object.entries(store.achievements)) {
      if (!v) continue;
      const num = Number(String(v).replace(/\D/g, ""));
      if (num > latestNum) {
        latestNum = num;
        latestKey = k;
      }
    }
    let latestAch: { name: string; date: string } | null = null;
    if (latestKey) {
      const def = ACHIEVEMENTS.find((a) => a.key === latestKey);
      const ds = String(latestNum);
      latestAch = { name: def ? def.name : latestKey, date: ds.length === 8 ? `${ds.slice(0, 4)}-${ds.slice(4, 6)}-${ds.slice(6, 8)}` : ds };
    }
    return {
      todayCount: todayItems.length,
      todayStars: todayItems.reduce((s, h) => s + h.stars, 0),
      todayMs: todayItems.reduce((s, h) => s + h.ms, 0),
      todayHints: todayItems.reduce((s, h) => s + h.hints, 0),
      week,
      weekTotal: Object.values(week).reduce((a, b) => a + b, 0),
      byLevel,
      total: store.history.length,
      starsAvg,
      hintFree,
      litBase,
      litAdv,
      achGot,
      dailyDone,
      streak,
      latestAch,
      mapDone: store.mapProgress.completed.length,
    };
  }, [store]);

  const maxWeek = Math.max(1, ...Object.values(data.week));
  const noPractice = data.total === 0;

  return (
    <div className="pb-4 print-root">
      <h1 className="page-title reveal mb-1 px-1 text-[21px] font-extrabold leading-tight tracking-tight">📊 家长报告</h1>
      <p className="mb-3 px-1 text-[11.5px] leading-relaxed text-muted-foreground">
        以下数据全部来自本机记录，不上传、不比较、不排名。练习节奏比结果更值得关注。
      </p>

      {/* 今日反馈 */}
      <Card pad="normal" className="report-card print-clean mb-3">
        <h2 className="report-card-title mb-3 text-[14px] font-bold">今日反馈</h2>
        {data.todayCount === 0 ? (
          <div className="flex flex-col items-center gap-2 py-3 text-center">
            <img src={ART_MISTAKES} alt="" aria-hidden className="h-[72px] w-[72px] object-contain opacity-90" />
            <p className="report-empty text-[12.5px] text-muted-foreground">今天还没有练习记录。</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Stat k="完成题数" v={data.todayCount} unit="题" />
              <Stat k="合计用时" v={formatMs(data.todayMs)} />
              <Stat k="获得星数" v={data.todayStars} unit="★" />
            </div>
            <p className="mt-3 rounded-xl bg-secondary/60 px-3 py-2 text-[12px] leading-relaxed text-secondary-foreground">
              {data.todayHints === 0
                ? "今天没有使用提示，全程独立推理 —— 这是最值得肯定的部分。"
                : `今天用了 ${data.todayHints} 次提示，提示本身也是学习路径的一部分，不必回避。`}
            </p>
          </>
        )}
      </Card>

      {/* 近 7 天 */}
      <Card pad="normal" className="report-card print-clean mb-3">
        <h2 className="report-card-title mb-3 text-[14px] font-bold">近 7 天节奏</h2>
        {noPractice ? (
          <p className="report-empty py-2 text-center text-[12.5px] text-muted-foreground">最近还没有练习记录。</p>
        ) : (
          <>
            <div className="flex items-end justify-between px-1" style={{ height: 92 }}>
              {Object.entries(data.week).map(([d, c]) => (
                <div key={d} className="flex flex-1 flex-col items-center justify-end">
                  <span className="tnum mb-1 text-[10px] font-semibold text-muted-foreground">{c || ""}</span>
                  <div
                    className="w-5 rounded-t-md bg-primary transition-[height] duration-500"
                    style={{ height: `${Math.max(c ? 8 : 2, Math.round((c / maxWeek) * 62))}px`, opacity: c ? 1 : 0.18 }}
                  />
                  <span className="mt-1.5 text-[9.5px] text-muted-foreground">{d.slice(8)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Stat k="本周题数" v={data.weekTotal} unit="题" />
              <Stat k="连续打卡" v={store.checkin.streak} unit="天" />
              <Stat k="平均评价" v={data.starsAvg.toFixed(1)} unit="★" />
            </div>
          </>
        )}
      </Card>

      {/* 成长进度 */}
      <Card pad="normal" className="report-card print-clean mb-3">
        <h2 className="report-card-title mb-3 text-[14px] font-bold">成长进度</h2>
        <p className="report-row mb-2.5 flex items-center justify-between px-0.5 text-[12.5px] font-semibold">
          <span>{data.dailyDone ? "✅ 今日每日挑战已完成" : "🎯 今日每日挑战未完成"}</span>
          {data.dailyDone ? (
            <span className="tnum text-[11px] font-normal text-muted-foreground">连续打卡 {data.streak} 天</span>
          ) : null}
        </p>
        <Row label="基础技巧" value={data.litBase} total={4} tone="base" />
        <Row label="进阶技巧" value={data.litAdv} total={12} tone="adv" />
        <Row label="训练阶梯" value={data.mapDone} total={10} tone="primary" />
        <Row label="成就徽章" value={data.achGot} total={ACHIEVEMENTS.length} tone="ach" />
        <p className="report-row mb-2.5 px-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
          {data.latestAch ? `最近解锁：${data.latestAch.name}（${data.latestAch.date}）` : "还没有解锁成就，完成练习会自动点亮"}
        </p>
        <div className="mt-3 space-y-2">
          <Dist label="简单" value={data.byLevel.easy} total={data.total} />
          <Dist label="普通" value={data.byLevel.normal} total={data.total} />
          <Dist label="困难" value={data.byLevel.hard} total={data.total} />
        </div>
        <p className="report-badge-line mt-3 rounded-xl bg-secondary/60 px-3 py-2 text-[12px] leading-relaxed text-secondary-foreground">
          {data.total === 0
            ? "从 4×4 开始，每天 5 分钟比一次做很多题更有效。"
            : `独立解出（未用提示）的比例约 ${Math.round(data.hintFree * 100)}%。${data.hintFree > 0.6 ? "推理习惯已经建立得很好。" : "可以多鼓励孩子先自己排除几轮，再考虑提示。"}`}
        </p>
      </Card>

      <div className="no-print space-y-2">
        <Btn variant="primary" size="lg" className="w-full" onClick={onExport}>
          🖨️ 导出 / 打印报告
        </Btn>
        <Btn variant="ghost" className="w-full" onClick={onBack}>
          ← 返回难度
        </Btn>
      </div>
      <p className="no-print mt-3 px-1 text-[10.5px] leading-relaxed text-muted-foreground">
        共 {ALL_SKILLS.length} 个技巧阶梯 · 数据仅保存在本机浏览器中，清除进度后不可恢复。
      </p>
    </div>
  );
}

function Row({ label, value, total, tone }: { label: string; value: number; total: number; tone: "base" | "adv" | "ach" | "primary" }) {
  return (
    <div className="mb-2.5 last:mb-0">
      <div className="report-row mb-1 flex items-baseline justify-between px-0.5">
        <span className="text-[12.5px] font-semibold">{label}</span>
        <span className="tnum text-[11px] text-muted-foreground">
          {value} / {total}
        </span>
      </div>
      <Bar value={value} total={total} tone={tone} />
    </div>
  );
}

function Dist({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="report-dist flex items-center gap-2">
      <span className="w-9 shrink-0 text-[11.5px] text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <span className="tnum w-9 shrink-0 text-right text-[11px] text-muted-foreground">{pct}%</span>
    </div>
  );
}
