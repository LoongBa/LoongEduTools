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
 * V1.1 新增 seed 参数：提供数字 seed → 确定性题单（同讲恒同题，复练价值）；
 * 缺省 → V0.6 随机行为完全等价。
 *
 * ⚠ 同步窗口约束（Oracle I4）：engine.gen 必须纯同步，禁止 async/await/Promise——
 * try/finally 仅保护同步路径；未来引擎若引入异步需改此方案。
 *
 * @param genName 生成器名（lesson.practice[level].gen）
 * @param count   题数（调用方传 lesson.practice[level].count，I4）
 * @param engine  引擎实例（HandoutView 传 getEngine()；测试传 mock）；null → 返回 []
 * @param seed    V1.1：数字 seed → 确定性；缺省 → 随机
 * @returns 题面数组；引擎不可用或某题生成失败 → []
 */
export function generatePractice(
  genName: string,
  count: number,
  engine: HandoutEngine | null,
  seed?: number,
): HandoutPractice[] {
  if (!engine || !genName || count <= 0) return [];
  const originalRandom = Math.random;
  // I4 dev 防重入：进入前若已被播种 PRNG 覆写 → 疑似调用链重入，告警（不阻断）
  if (originalRandom.toString().indexOf("mulberry32") !== -1) {
    console.warn("[handout] Math.random 已被覆写——疑似 generatePractice 重入，请检查调用链");
  }
  const seeded = typeof seed === "number" && Number.isFinite(seed);
  const out: HandoutPractice[] = [];
  try {
    for (let i = 0; i < count; i++) {
      // 题序子 seed：第 i 题 = (floor(seed) + i)，改 count 时前 i 题保持稳定（加题不重洗）
      if (seeded) Math.random = mulberry32((Math.floor(seed) + i) >>> 0);
      const q = engine.gen(genName);
      if (!q || typeof q.text !== "string" || q.text === "") return [];
      out.push({ text: q.text, answer: q.answer });
    }
    return out;
  } finally {
    Math.random = originalRandom; // 必还原（中途 return [] 也执行）
  }
}

/**
 * 字符串 → 32 位数字 seed（FNV-1a，同字符串恒同值，作默认题单 seed）。
 * lesson_id 稳定 → 同讲恒同默认题单（D1：固定优先，换一组题补新鲜感）。
 */
export function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 播种 32 位 PRNG（mulberry32，零依赖；Chrome 28+ 兼容） */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function mulberry32() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}