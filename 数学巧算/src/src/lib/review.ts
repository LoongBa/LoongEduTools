// 数学巧算 · 错题重练闭环纯逻辑层（V1.3）
// 产品依据：需求 §2.4「错题集」+ §2.5「薄弱方法」——错题只进不出无闭环，本轮补重练 + 掌握判定
// 纯函数、零 import（对齐 guard.ts / recite.ts / weak.ts 自包含模式）：mistakes 全部注入，
// engine.mjs（node --experimental-strip-types，不解析 "@/" 别名）可直接 import 单测。
// 数据口径：与 StoreShape.mistakes 元素结构一致（结构化兼容）；key = `${lessonId}:${expr}`

/** 一条错题（StoreShape.mistakes 元素子集，结构化兼容） */
export interface ReviewMistake {
  key: string;
  lessonId: string;
  expr: string;
  answer: number | string;
  wrongCount: number;
}

/**
 * 重练结果判定：答对 → null（已掌握，从错题本移除）；答错 → wrongCount + 1（保留）。
 * 纯函数，store.retryMistake 经 flatMap 调用——本函数为唯一逻辑源（Oracle I2）。
 */
export function applyRetry(m: ReviewMistake, correct: boolean): ReviewMistake | null {
  if (correct) return null;
  return { ...m, wrongCount: m.wrongCount + 1 };
}

/**
 * 重练队列：按数组序（pushMistake 已最新优先，无需再排序）。
 * 返回新数组副本（不污染入参——L12 以引用不等断言验证）。
 */
export function reviewQueue(mistakes: ReviewMistake[]): ReviewMistake[] {
  return mistakes.slice();
}
