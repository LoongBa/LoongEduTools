// 数学巧算 · 薄弱方法统计 + 下周建议纯逻辑层（V0.5）
// 产品依据：需求 §2.5「薄弱方法 TOP 3（按错题分类统计）+ 下周建议（建议重练哪几讲）」
// 纯函数、零 import（对齐 guard.ts / recite.ts 自包含模式）：stages/lessons 全部注入，
// engine.mjs（node --experimental-strip-types，不解析 "@/" 别名）可直接 import 单测。
// 数据口径：mistakes[].lessonId = raw lesson_id（"s4l3"）或 "warmup:g1"（O2-B1 双审修正：
// 不是复合键 "${stageKey}:${lessonId}"——那是 store.lessons 的键，与 mistakes.lessonId 无关）

/** 讲次元数据（从注入的 stages 提取） */
export interface WeakLessonRef {
  /** stage 键（number 主线 / "X" 拓展） */
  stage: number | string;
  /** 年级名（"四年级"） */
  grade: string;
  /** 讲次标题（"结合律配对"） */
  title: string;
}

/** 一条错题的最小结构（StoreShape.mistakes 元素子集，结构化兼容） */
export interface WeakMistake {
  lessonId: string;
  wrongCount: number;
}

/** 一条学习的讲次记录（StoreShape.lessons 值子集，结构化兼容） */
export interface WeakLessonState {
  done?: boolean;
  practiced?: number;
  recite?: unknown;
}

/** 薄弱方法统计行 */
export interface WeakMethod {
  /** raw lesson_id（"s4l3"） */
  lessonId: string;
  /** stage 键（"4" / "X"） */
  stage: number | string;
  /** 年级名 */
  stageGrade: string;
  /** 讲次标题 */
  title: string;
  /** 该讲错题总数 */
  wrongCount: number;
  /** 占非 warmup 总错题比例（0-1，保留 1 位小数） */
  share: number;
  /** 反查不到对应讲次（数据残缺/历史孤儿） */
  orphan: boolean;
}

/** 下周建议行 */
export interface WeekSuggestion {
  kind: "weak" | "incomplete";
  lessonId: string;
  stage: number | string;
  stageGrade: string;
  title: string;
  action: string;
}

/**
 * 一次遍历 STAGES 构建 lessonId → 讲次元数据索引。
 * @param stages 注入的 stages 数组（SmartStage[] 结构化兼容即可）
 */
export function buildLessonIndex(stages: Array<{ stage: number | string; grade: string; lessons?: Array<{ lesson_id: string; title: string }> }>): Map<string, WeakLessonRef> {
  const index = new Map<string, WeakLessonRef>();
  for (const s of stages) {
    for (const l of s.lessons || []) {
      index.set(l.lesson_id, { stage: s.stage, grade: s.grade, title: l.title });
    }
  }
  return index;
}

/**
 * 薄弱方法 TOP N：按错题聚合（O2-B1：lessonId 直查 index，非复合键）。
 * - warmup:* 前缀排除（口算热身非方法讲）
 * - 排序：wrongCount 降序 → 并列按 lessonId 字典序（稳定输出）
 * - orphan 标记：index 无匹配 → 保留在结果（供调试/空态区分），不静默丢弃
 * - share = 该讲错题 / 非 warmup 总错题（保留 1 位小数）
 */
export function topWeakMethods(
  mistakes: WeakMistake[],
  index: Map<string, WeakLessonRef>,
  limit = 3,
): WeakMethod[] {
  const agg = new Map<string, number>();
  let total = 0;
  for (const m of mistakes) {
    if (m.lessonId.startsWith("warmup:")) continue;
    agg.set(m.lessonId, (agg.get(m.lessonId) || 0) + m.wrongCount);
    total += m.wrongCount;
  }
  const rows: WeakMethod[] = [];
  for (const [lessonId, wrongCount] of agg) {
    const ref = index.get(lessonId);
    rows.push({
      lessonId,
      stage: ref?.stage ?? "",
      stageGrade: ref?.grade ?? "",
      title: ref?.title ?? "",
      wrongCount,
      share: total > 0 ? Math.round((wrongCount / total) * 10) / 10 : 0,
      orphan: !ref,
    });
  }
  rows.sort((a, b) =>
    b.wrongCount - a.wrongCount || a.lessonId.localeCompare(b.lessonId),
  );
  return rows.slice(0, limit);
}

/**
 * 下周建议：weak（错题 ≥2 的薄弱讲）+ incomplete（未开始的讲，跨阶段按序取前 2）。
 * - incomplete 判定：done !== true 且 practiced === 0（recite-only 讲照常推荐——复述不置 done，O2-I1）
 * - 排除 stage "X"（拓展阶段不进自动建议，O3-I2）
 * - 合并去重（lessonId），weak 优先，来源不足不强凑
 */
export function suggestWeek(
  mistakes: WeakMistake[],
  lessons: Record<string, WeakLessonState | undefined>,
  stages: Array<{ stage: number | string; grade: string; lessons?: Array<{ lesson_id: string; title: string }> }>,
  limit = 4,
): WeekSuggestion[] {
  const index = buildLessonIndex(stages);
  const out: WeekSuggestion[] = [];
  const seen = new Set<string>();

  // 来源一：薄弱讲（wrongCount ≥ 2 且非孤儿）
  for (const w of topWeakMethods(mistakes, index, 2)) {
    if (w.wrongCount < 2 || w.orphan) continue;
    if (seen.has(w.lessonId)) continue;
    seen.add(w.lessonId);
    out.push({
      kind: "weak",
      lessonId: w.lessonId,
      stage: w.stage,
      stageGrade: w.stageGrade,
      title: w.title,
      action: "错题较多，建议重练基础档",
    });
    if (out.length >= limit) return out;
  }

  // 来源二：未开始的讲（跨阶段按序取，主线 1-6，排除拓展 X）
  for (const s of stages) {
    if (s.stage === "X") continue; // O3-I2：拓展不进自动建议
    for (const l of s.lessons || []) {
      const key = `${s.stage}:${l.lesson_id}`;
      const rec = lessons[key];
      const practiced = rec?.practiced || 0;
      if (rec?.done === true || practiced > 0) continue;
      if (seen.has(l.lesson_id)) continue;
      seen.add(l.lesson_id);
      out.push({
        kind: "incomplete",
        lessonId: l.lesson_id,
        stage: s.stage,
        stageGrade: s.grade,
        title: l.title,
        action: "建议本周学完，点亮阶段进度",
      });
      if (out.length >= limit) return out;
    }
  }

  return out;
}