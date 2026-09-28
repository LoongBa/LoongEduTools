// 备份/恢复工具：导出全量存档为 JSON 文件、校验外部文件、导入恢复。
// 纯客户端，零网络；恢复是破坏性操作，调用方（Settings）负责两级确认。
// V1.2.0 新增；校验强于 store.load()（备份文件是跨信任边界的外部输入）。

import type { StoreShape } from "./store";

const KEY = "redtools.shudu.v1";
const FORMAT = "sudoku-tutor-backup";

/** 备份文件名前缀（实际名含日期：数独思维-备份-20260927.json） */
export const BACKUP_PREFIX = "数独思维-备份";

/* ================= 上次备份时间戳（V1.9.1 B9 备份提醒） ================= */
/** 单独键（本机行为）：不随 store 备份/恢复，避免备份文件自指与跨设备误同步 */
const LAST_BACKUP_KEY = "redtools.shudu.backupAt";

export function saveBackupAt(ts: number): void {
  try {
    window.localStorage.setItem(LAST_BACKUP_KEY, String(ts));
  } catch { /* 隐私模式等：忽略，仅丢失提醒状态 */ }
}

export function readBackupAt(): number | null {
  try {
    const raw = window.localStorage.getItem(LAST_BACKUP_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function clearBackupAt(): void {
  try {
    window.localStorage.removeItem(LAST_BACKUP_KEY);
  } catch { /* 忽略 */ }
}

/** 备份文件结构（v1） */
export interface BackupFile {
  format: typeof FORMAT;
  v: 1;
  appVersion: string;
  createdAt: string;
  stats: { history: number; mistakes: number; favorites: number; achievements: number; checkinDays: number };
  data: StoreShape;
}

export type ValidateResult = { ok: true; file: BackupFile } | { ok: false; reason: string };

/** 组装备份：data = store 深拷贝 + 元信息与记录数摘要 */
export function buildBackup(store: StoreShape, appVersion: string): BackupFile {
  const data: StoreShape = JSON.parse(JSON.stringify(store));
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return {
    format: FORMAT,
    v: 1,
    appVersion,
    createdAt: now.toISOString(),
    stats: {
      history: data.history.length,
      mistakes: data.mistakes.length,
      favorites: data.favorites.length,
      achievements: Object.keys(data.achievements).length,
      checkinDays: data.checkin.dates.length,
    },
    data,
  };
}

/** 校验外部备份文件（强校验：format/v/data.version + 顶层类型 + 元素形状 + __proto__ 拒绝） */
export function validateBackup(raw: unknown): ValidateResult {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "不是有效的备份文件（内容为空或格式错误）。" };
  const f = raw as Record<string, unknown>;

  if (f.format !== FORMAT) return { ok: false, reason: "不是数独思维的备份文件（格式标识不符）。" };
  if (f.v !== 1) return { ok: false, reason: `备份文件版本不兼容（v=${String(f.v)}），请更新应用后重试。` };

  const d = f.data;
  if (!d || typeof d !== "object" || Array.isArray(d)) return { ok: false, reason: "备份文件缺少存档数据（data 字段损坏）。" };
  const data = d as Record<string, unknown>;
  if (data.version !== 1) return { ok: false, reason: "存档数据版本不兼容，无法恢复。" };

  // 顶层类型（缺失字段允许——load() 浅合并会用空档默认值兜底）
  for (const arrKey of ["history", "mistakes", "favorites"] as const) {
    if (data[arrKey] !== undefined && !Array.isArray(data[arrKey])) return { ok: false, reason: `存档数据「${arrKey}」格式损坏。` };
  }
  if (data.settings !== undefined && (!data.settings || typeof data.settings !== "object" || Array.isArray(data.settings)))
    return { ok: false, reason: "存档数据「设置」格式损坏。" };
  if (data.cur !== undefined && data.cur !== null && (typeof data.cur !== "object" || Array.isArray(data.cur)))
    return { ok: false, reason: "存档数据「当前练习」格式损坏。" };

  // 元素形状（B1）：防损坏文件白屏渲染
  const bookItems = [...(data.mistakes as unknown[] | undefined || []), ...(data.favorites as unknown[] | undefined || [])];
  for (const it of bookItems) {
    if (!it || typeof it !== "object" || Array.isArray(it)) return { ok: false, reason: "错题/收藏中有损坏的条目。" };
    const b = it as Record<string, unknown>;
    if (!Array.isArray(b.board) || !Array.isArray(b.solution)) return { ok: false, reason: "错题/收藏中有损坏的盘面数据。" };
  }
  const history = (data.history as unknown[] | undefined) || [];
  for (const h of history) {
    if (!h || typeof h !== "object" || Array.isArray(h)) return { ok: false, reason: "练习历史中有损坏的条目。" };
    const it = h as Record<string, unknown>;
    if (typeof it.date !== "string" || typeof it.ms !== "number") return { ok: false, reason: "练习历史中有损坏的记录。" };
  }
  if (data.cur && typeof data.cur === "object" && !Array.isArray(data.cur)) {
    const c = data.cur as Record<string, unknown>;
    if (!Array.isArray(c.puzzle) || !Array.isArray(c.solution) || !Array.isArray(c.board) || !c.notes || typeof c.notes !== "object" || Array.isArray(c.notes))
      return { ok: false, reason: "存档数据「当前练习」盘面损坏。" };
  }

  // 纵深防御（I5）：拒绝原型污染键
  if (hasProtoKey(data)) return { ok: false, reason: "备份文件包含异常字段，已拒绝恢复。" };

  return { ok: true, file: raw as BackupFile };
}

function hasProtoKey(o: Record<string, unknown>): boolean {
  // 只查自有属性（in 会命中原型链上继承的 constructor，误拒所有文件）
  return Object.prototype.hasOwnProperty.call(o, "__proto__") || Object.prototype.hasOwnProperty.call(o, "constructor");
}

/** 触发浏览器下载 JSON 文件（纯客户端；iOS Safari 可能忽略 download 属性，调用方补兜底提示） */
export function downloadBackup(file: BackupFile): void {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const ymd = file.createdAt.slice(0, 10).replace(/-/g, "");
  a.href = url;
  a.download = `${BACKUP_PREFIX}-${ymd}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 写入 localStorage 并触发重载（恢复的最后一步）。
 * 配额满（QuotaExceededError）→ 返回 reason 不重载（setItem 原子，旧数据安全保留）。
 */
export function importBackup(file: BackupFile): { ok: boolean; reason?: string } {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(file.data));
  } catch {
    return { ok: false, reason: "存储空间不足，请先清理浏览器数据后重试。" };
  }
  return { ok: true };
}