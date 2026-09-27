// 数学巧算 · 打印讲义纯逻辑层（V0.6）
// 产品依据：需求 §2.3「打印讲义：每讲可生成 A4 打印版（原理 + 例题 + 练习单），供离线纸张练习」
// 纯函数、零 import（对齐 guard/recite/weak 自包含模式）：engine 必填注入、不读 window（B1），
// 失败返回空数组不降级（B2）——engine.mjs（node --experimental-strip-types）可直接 import 单测。

/** 讲义例题（SmartLesson.examples 子集） */
export interface HandoutExample {
  expr: string;
  normal: string;
  smart: string;
  why: string;
}

/** 讲义练习单一行（运行时引擎生成） */
export interface HandoutPractice {
  text: string;
  answer: number | string;
}

/** 组装后的讲义结构 */
export interface HandoutSheet {
  lessonTitle: string;
  grade: string;
  principle: string;
  exploreSteps: string[];
  methodRhyme: string;
  examples: HandoutExample[];
}

/** 引擎最小接口（PracticeView 同源 window.SMART_GENERATORS 的结构子集） */
export interface HandoutEngine {
  gen(name: string): { text: string; answer: number | string } | null;
}

/**
 * 组装讲义结构（纯数据变换）。
 * - examples 截断 ≤3（讲义篇幅控制）
 * - 缺省兜底：explore.steps / method.rhyme 缺失 → 空数组/空串
 */
export function buildHandout(
  lesson: {
    title: string;
    principle?: string;
    explore?: { steps?: string[] };
    method?: { rhyme?: string };
    examples?: { expr: string; normal: string; smart: string; why: string }[];
  },
  grade: string,
): HandoutSheet {
  return {
    lessonTitle: lesson.title || "",
    grade,
    principle: lesson.principle || "",
    exploreSteps: (lesson.explore?.steps || []).slice(0, 8),
    methodRhyme: lesson.method?.rhyme || "",
    examples: (lesson.examples || []).slice(0, 3).map((e) => ({
      expr: e.expr,
      normal: e.normal,
      smart: e.smart,
      why: e.why,
    })),
  };
}

/**
 * 生成练习单题面（B1：engine 必填注入、不读 window；B2：失败返回 [] 不静默降级）。
 * @param genName 生成器名（lesson.practice[level].gen）
 * @param count   题数（调用方传 lesson.practice[level].count，I4）
 * @param engine  引擎实例（HandoutView 传 getEngine()；测试传 mock）；null → 返回 []
 * @returns 题面数组；引擎不可用或某题生成失败 → []
 */
export function generatePractice(
  genName: string,
  count: number,
  engine: HandoutEngine | null,
): HandoutPractice[] {
  if (!engine || !genName || count <= 0) return [];
  const out: HandoutPractice[] = [];
  for (let i = 0; i < count; i++) {
    const q = engine.gen(genName);
    if (!q || typeof q.text !== "string" || q.text === "") return [];
    out.push({ text: q.text, answer: q.answer });
  }
  return out;
}