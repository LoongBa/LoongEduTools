// D11 §5 素材归档：自动识别 + 级联数据源 + 规则工具（纯函数，零 React 依赖）
// 识别策略（§5.2）：文件名关键词 → 元数据预填（不锁定）；置信度三档（高/中/低）。
// 两级识别：① 整体规则（单元号/教材组合关键词直接给完整 meta，high）
//            ② 维度降级（学科/年级/册次/版本独立打分，部分命中 medium，全无 low）
// 级联（§5.3）：学科 → 版本 → 年级 → 册次；父未选→子禁用，父变更→子清空。
import type { ArchiveConfidence, ArchiveMeta } from "./types";

// ── 级联数据源（学科 → 版本；年级/册次全局）──

export const ARCHIVE_SUBJECTS = [
  "英语",
  "语文",
  "数学",
  "音乐",
  "科学",
  "美术",
  "道德与法治",
] as const;

/** 学科 → 可选版本（级联）；未列出的学科回退全集（手输场景由用户自行填版本） */
export const VERSIONS_BY_SUBJECT: Record<string, string[]> = {
  英语: ["人教版", "外研版", "北师大版"],
  语文: ["部编版", "人教版"],
  数学: ["人教版", "北师大版", "苏教版"],
  音乐: ["人音版", "人教版"],
  科学: ["教科版", "人教版"],
  美术: ["人教版", "湘美版"],
  道德与法治: ["统编版"],
};

/** 版本全集（学科未命中/手输时的候选） */
export const ARCHIVE_VERSIONS = [
  "人教版",
  "部编版",
  "统编版",
  "外研版",
  "北师大版",
  "苏教版",
  "人音版",
  "教科版",
  "湘美版",
] as const;

export const ARCHIVE_GRADES = [
  "一年级",
  "二年级",
  "三年级",
  "四年级",
  "五年级",
  "六年级",
] as const;

export const ARCHIVE_VOLUMES = ["上册", "下册"] as const;

export type ArchiveVolume = (typeof ARCHIVE_VOLUMES)[number];

/** 学科识别成功但未显式出现版本词时，按学科给默认版本（主流教材优先） */
const DEFAULT_VERSION: Record<string, string> = {
  英语: "人教版",
  语文: "部编版",
  数学: "人教版",
  音乐: "人音版",
  科学: "教科版",
  美术: "人教版",
  道德与法治: "统编版",
};

// ── 整体规则（§5.2：PEP 单元号组合信号直接给完整 meta，高置信）──
// 仅保留单元号强规则：U0[1-4]=四上 / U0[5-8]=四下（教材下载扩展命名惯例，无条件可靠）；
// 显式教材组合词（部编版语文等）走维度降级——年级/册次由文件名独立打分，避免错配。

interface WholeRule {
  re: RegExp;
  meta: ArchiveMeta;
}

const WHOLE_RULES: WholeRule[] = [
  { re: /U0[1-4]/i, meta: { subject: "英语", version: "人教版", grade: "四年级", volume: "上册" } },
  { re: /U0[5-8]/i, meta: { subject: "英语", version: "人教版", grade: "四年级", volume: "下册" } },
];

// ── 维度规则（降级：独立打分，部分命中给 medium）──

const SUBJECT_PATTERNS: [RegExp, string][] = [
  [/英语|PEP|English|english/i, "英语"],
  [/语文/i, "语文"],
  [/数学/i, "数学"],
  [/音乐|歌曲|歌|song|audio|唱|儿歌/i, "音乐"],
  [/科学/i, "科学"],
  [/美术|绘画/i, "美术"],
  [/道德与法治/i, "道德与法治"],
];

const GRADE_PATTERNS: [RegExp, string][] = [
  [/一年级|Grade.?1|G1[^\w]/i, "一年级"],
  [/二年级|Grade.?2|G2[^\w]/i, "二年级"],
  [/三年级|Grade.?3|G3[^\w]/i, "三年级"],
  [/四年级|Grade.?4|G4[^\w]/i, "四年级"],
  [/五年级|Grade.?5|G5[^\w]/i, "五年级"],
  [/六年级|Grade.?6|G6[^\w]/i, "六年级"],
];

const VERSION_PATTERNS: [RegExp, string][] = [
  [/人教版|人教/i, "人教版"],
  [/部编版|统编版/i, "部编版"],
  [/外研版/i, "外研版"],
  [/北师大版/i, "北师大版"],
  [/苏教版/i, "苏教版"],
  [/人音版/i, "人音版"],
  [/教科版/i, "教科版"],
  [/湘美版/i, "湘美版"],
];

function matchFirst(patterns: [RegExp, string][], text: string): string | null {
  for (const [re, value] of patterns) {
    if (re.test(text)) return value;
  }
  return null;
}

/** 册次推断：显式"上/下"优先；无显式词时按单元号惯例 U0[1-4]→上、U0[5-8]→下（次要信号） */
function inferVolume(filename: string): ArchiveVolume | null {
  const upper = /(上册|（上）|\(上\)|_上|上$)/i.test(filename);
  const lower = /(下册|（下）|\(下\)|_下|下$)/i.test(filename);
  if (upper && !lower) return "上册";
  if (lower && !upper) return "下册";
  const unit = filename.match(/U0?(\d)/i);
  if (unit) {
    const n = Number(unit[1]);
    if (n >= 1 && n <= 4) return "上册";
    if (n >= 5 && n <= 8) return "下册";
  }
  return null;
}

/**
 * 文件名 → 归档元数据预填（不锁定，用户可改）。
 * - high：整体规则命中，或 学科+年级+册次 齐全（版本可默认）
 * - medium：部分维度命中（识别到的字段预填，其余留空）
 * - low：完全未命中 → meta=null（全手动）
 */
export function detectArchiveMeta(filename: string): {
  meta: ArchiveMeta | null;
  confidence: ArchiveConfidence;
} {
  // ① 整体规则：单元号/教材组合词 → 直接完整 meta（高置信）
  for (const rule of WHOLE_RULES) {
    if (rule.re.test(filename)) {
      return { meta: { ...rule.meta }, confidence: "high" };
    }
  }

  // ② 维度降级
  const subject = matchFirst(SUBJECT_PATTERNS, filename);
  const grade = matchFirst(GRADE_PATTERNS, filename);
  const volume = inferVolume(filename);
  const version = matchFirst(VERSION_PATTERNS, filename) ?? (subject ? DEFAULT_VERSION[subject] : null);

  const hits = [subject, grade, volume].filter(Boolean).length;
  if (hits === 0 && !version) return { meta: null, confidence: "low" };

  const meta: ArchiveMeta = {
    subject: subject ?? "",
    version: version ?? "",
    grade: grade ?? "",
    volume: volume ?? "上册",
  };
  const complete = Boolean(subject && grade && volume);
  return { meta, confidence: complete ? "high" : "medium" };
}

// ── 规则工具（§5.4：「下次同类自动整理」记忆 → taoli.archive.rules）──

/** 正则特殊字符转义（文件名主干存为规则 pattern 的安全化） */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 由文件名生成规则 pattern：去扩展名的主干关键词（同类 = 文件名包含该主干） */
export function detectPatternFor(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, "").trim();
  return escapeRegex(stem);
}

/** 规则匹配：文件名是否命中某条规则的 pattern（正则测试，非全等） */
export function ruleMatches(rule: { pattern: string }, filename: string): boolean {
  try {
    return new RegExp(rule.pattern, "i").test(filename);
  } catch {
    return false;
  }
}

// ── 文件类型标签（卡片展示；对应 D11 §6.3 ARCHIVE_EXT）──

const PDF_EXT = ["pdf"];
const IMAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];
const AUDIO_EXT = ["mp3", "m4a", "wav", "ogg", "flac", "aac"];
const VIDEO_EXT = ["mp4", "mkv", "avi", "mov", "wmv", "webm", "flv"];

export function fileKindLabel(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (PDF_EXT.includes(ext)) return "教材 PDF";
  if (IMAGE_EXT.includes(ext)) return "课堂图片";
  if (AUDIO_EXT.includes(ext)) return "音频";
  if (VIDEO_EXT.includes(ext)) return "视频";
  return "其它文件";
}
