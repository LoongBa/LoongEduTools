/**
 * P3 R1 多班进度看板 · 纯计算层（D05 §2.4.5）
 * 无 React / 无网络依赖，只为 ClassesView 提供进度推导与两周制定位。
 * 看板纯本地、不做班际排名/不上传（红线）。
 */

/** 总单元数（U1-U6），进度条分母 */
export const TOTAL_UNITS = 6;

/** 每单元小节数（进度百分比按 (unit-1 + section 小数) / 6 估算，取 4 为典型值） */
export const SECTIONS_PER_UNIT = 4;

/** 解析 unit 字段：取首位整数并夹在 1..TOTAL_UNITS，非法回退 1 */
export function parseUnit(unit: string): number {
  const n = parseInt(unit, 10);
  if (Number.isNaN(n)) return 1;
  return Math.min(TOTAL_UNITS, Math.max(1, n));
}

/** 解析 section 字段：取首位整数，非法回退 1 */
export function parseSection(section: string): number {
  const n = parseInt(section, 10);
  if (Number.isNaN(n)) return 1;
  return Math.max(1, n);
}

/** 单元进度小数（0..1）：(unit-1 + section 小数) / TOTAL_UNITS */
export function unitDecimal(unit: string, section: string): number {
  const u = parseUnit(unit);
  const s = parseSection(section);
  const frac = Math.max(0, Math.min(1, (s - 1) / SECTIONS_PER_UNIT));
  const raw = (u - 1 + frac) / TOTAL_UNITS;
  return Math.max(0, Math.min(1, raw));
}

/** 进度百分比（0..100，取整） */
export function unitPercent(unit: string, section: string): number {
  return Math.round(unitDecimal(unit, section) * 100);
}

/** 卡片"上次位置"文案：U{单元} 第{节}节（节非数字时回退"已到 {section}"） */
export function classPosLabel(unit: string, section: string): string {
  const u = parseUnit(unit);
  const s = parseInt(section, 10);
  return Number.isNaN(s) ? `U${u} · ${section}` : `U${u} 第${s}节`;
}

/**
 * 两周制定位：把 section 映射到两周模板中的一个槽位（近似，注释说明）
 *   s<=3 → 第1周 Day1-3 天天见；s==4 → 周末 PBL；s==5/6 → 第2周 Day4/5；s>=7 → 周末小阅兵。
 * 每周按单元滚动（template 仅为课堂节奏参照，不强制 = 实际课表）。
 */
export type ScheduleSlotId =
  | "w1d1"
  | "w1d2"
  | "w1d3"
  | "w1pbl"
  | "w2d4"
  | "w2d5"
  | "w2para";

export function scheduleSlotFor(section: string): ScheduleSlotId | null {
  const s = parseSection(section);
  if (s <= 3) return `w1d${s}` as ScheduleSlotId;
  if (s === 4) return "w1pbl";
  if (s === 5) return "w2d4";
  if (s === 6) return "w2d5";
  return "w2para";
}

/** 最近更新时间展示：ISO → "09-25 14:30"，非法原样回退 */
export function fmtUpdatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || "—";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}