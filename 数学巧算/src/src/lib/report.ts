// 数学巧算 · 家长报告统计纯逻辑层（V1.4）
// 产品依据：需求 §2.2「进步曲线」+ §2.5「家长报告」——家长报告增强（热身每日聚合/进步曲线/重练统计）
// 纯函数、零 import（对齐 guard.ts / recite.ts / weak.ts / review.ts 自包含模式）：daily 全部注入，
// engine.mjs（node --experimental-strip-types，不解析 "@/" 别名）可直接 import 单测。
// 数据口径：daily key = YYYY-MM-DD（零填充，lexicographic = chronological）；滚动上限 120 天（Oracle I3：整学期）

/** 口算热身单日聚合点 */
export interface WarmDayPoint {
  total: number;
  correct: number;
  sec: number;
  sessions: number;
}

/** 错题重练单日聚合点 */
export interface ReviewDayPoint {
  mastered: number;
  retried: number;
}

/** 按日聚合口算热身（total/correct/sec/sessions 各 +；undefined 字段默认 0 防 NaN，Oracle I5） */
export function mergeWarmDay(existing: WarmDayPoint | undefined, point: WarmDayPoint): WarmDayPoint {
  const e = existing || { total: 0, correct: 0, sec: 0, sessions: 0 };
  return {
    total: (e.total || 0) + (point.total || 0),
    correct: (e.correct || 0) + (point.correct || 0),
    sec: (e.sec || 0) + (point.sec || 0),
    sessions: (e.sessions || 0) + (point.sessions || 0),
  };
}

/** 按日聚合错题重练 */
export function mergeReviewDay(existing: ReviewDayPoint | undefined, point: ReviewDayPoint): ReviewDayPoint {
  const e = existing || { mastered: 0, retried: 0 };
  return {
    mastered: (e.mastered || 0) + (point.mastered || 0),
    retried: (e.retried || 0) + (point.retried || 0),
  };
}

/**
 * 滚动裁剪：日期降序（YYYY-MM-DD lexicographic 零填充前提）留最近 maxDays，
 * 返回应删除的 key 列表（两步分离更易单测，Oracle N3 否决合并）。
 * 畸形 date key（非零填充）仍可排序但语义不可靠——写入方唯一为 todayStr，实际不产生。
 */
export function pruneDaily(keys: string[], maxDays: number): string[] {
  if (keys.length <= maxDays) return [];
  const sorted = keys.slice().sort().reverse(); // 降序（最新在前）
  return sorted.slice(maxDays);
}

/**
 * 近 N 天趋势序列：升序输出（最旧→最新，Oracle I2），长度恰为 days；
 * 窗口 [endKey-(days-1), endKey] 外条目一律剔除；窗口内缺失日插占位 rate=null。
 */
export function buildTrend(
  daily: Record<string, WarmDayPoint>,
  days: number,
  endKey: string,
): Array<{ key: string; total: number; correct: number; rate: number | null }> {
  const out: Array<{ key: string; total: number; correct: number; rate: number | null }> = [];
  const end = parseDate(endKey);
  if (!end) return [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const key = fmtDate(d);
    const p = daily[key];
    out.push(
      p
        ? { key, total: p.total, correct: p.correct, rate: p.total > 0 ? p.correct / p.total : null }
        : { key, total: 0, correct: 0, rate: null },
    );
  }
  return out;
}

/** YYYY-MM-DD 零填充（与 guard todayStr / ReportView todayStr 同构） */
function fmtDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 解析 YYYY-MM-DD；非法返回 null */
function parseDate(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (fmtDate(d) !== key) return null; // 零填充校验（如 2026-9-5 拒）
  return d;
}
