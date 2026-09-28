// 数学巧算 · 口算热身增强纯逻辑层（V1.2）
// 产品依据：需求 §2.2「选题默认跟随当前教程阶段」「计时挑战（30/60/120s）」「薄弱优先出题」
// 纯函数、零 import（对齐 guard.ts / recite.ts / weak.ts 自包含模式）：lessons/mist 全部注入，
// engine.mjs（node --experimental-strip-types，不解析 "@/" 别名）可直接 import 单测。
// 数据口径：
//   - store.lessons 键 = `${stageKey}:${lessonId}`（如 "1:s1l1"、"X:sxl1"）或 "warmup:g1"（跳过）
//   - warmupMist 键 = `${level}:${type}`（如 "g6:g6_pct"），由 mistKey() 生成

/** 口算热身档位（六档，对应年级 g1~g6） */
export type WarmLevel = "g1" | "g2" | "g3" | "g4" | "g5" | "g6";

/** 六档位列表（选档页渲染顺序） */
export const WARM_LEVELS: WarmLevel[] = ["g1", "g2", "g3", "g4", "g5", "g6"];

/** 档位中文名（选档页/结算页展示） */
export const LEVEL_LABEL: Record<WarmLevel, string> = {
  g1: "一年级",
  g2: "二年级",
  g3: "三年级",
  g4: "四年级",
  g5: "五年级",
  g6: "六年级",
};

/** 知识点池：档位 → 知识点 id 列表（每档随机循环出题）
 *  白名单原则：口算性 + 键盘可达（键盘仅 0-9 . /）。
 *  g4 排除 g4_big（大数改写，非口算）；g6 含 g6_pct/g6_ratio（答案均为分数/小数/整数，
 *  不含 %/:，Oracle V1.2 B3 核实后纳入）。 */
export const POOL: Record<WarmLevel, string[]> = {
  g1: ["g1_10addsub", "g1_20add", "g1_20sub", "g1_100"],
  g2: ["g2_mult", "g2_div", "g2_100", "g2_mixed"],
  g3: ["g3_wan", "g3_mult1", "g3_mult2", "g3_div1", "g3_frac"],
  g4: ["g4_simple", "g4_div2", "g4_dec"],
  g5: ["g5_decmul", "g5_decdiv", "g5_frac1", "g5_frac2"],
  g6: ["g6_fracmul", "g6_fracdiv", "g6_pct", "g6_ratio"],
};

/** 定数模式可选题量 */
export const QUANTITIES = [5, 10, 20] as const;

/** 计时模式可选时长（秒） */
export const TIMES = [30, 60, 120] as const;

/** 教程阶段 → 热身档位：1→g1 … 6→g6；<1（0/负/NaN）回退 g1（无进度起点）；>6 回退 g6（拓展能力已达六年级） */
export function stageToLevel(stage: number): WarmLevel {
  if (!Number.isFinite(stage) || stage < 1) return "g1";
  if (stage > 6) return "g6";
  return ("g" + stage) as WarmLevel;
}

/** 当前已学阶段：遍历 store.lessons 键（跳过 warmup:*），取最大数字 stage；"X"（拓展）记为 7；
 *  无任何主线/拓展进度 → 0 */
export function currentStage(lessons: Record<string, unknown>): number {
  let max = 0;
  for (const key of Object.keys(lessons)) {
    if (key.startsWith("warmup:")) continue;
    const stagePart = key.split(":")[0];
    if (stagePart === "X") {
      if (7 > max) max = 7;
      continue;
    }
    const n = Number(stagePart);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

/** 默认档位 = 当前已学阶段对应年级档（无进度 → g1） */
export function defaultLevel(lessons: Record<string, unknown>): WarmLevel {
  return stageToLevel(currentStage(lessons));
}

/** warmup 错题计数键：`${level}:${type}` */
export function mistKey(level: WarmLevel, type: string): string {
  return `${level}:${type}`;
}

/** 加权选型：权重 w(t) = 1 + min(mist 计数, 3)（封顶防薄弱知识点永久霸占）；
 *  按权重累减随机取中；avoid 生效时从池中剔除 avoid 重新加权抽取（保留随机性） */
export function pickType(pool: string[], mist: Record<string, number>, level: WarmLevel, avoid?: string): string {
  if (pool.length === 0) throw new Error("pickType: empty pool");
  if (pool.length === 1) return pool[0];

  const weight = (t: string): number => {
    const c = mist[mistKey(level, t)];
    return 1 + (c ? Math.min(c, 3) : 0);
  };

  const roll = (cands: string[]): string => {
    const total = cands.reduce((s, t) => s + weight(t), 0);
    let r = Math.random() * total;
    for (const t of cands) {
      r -= weight(t);
      if (r < 0) return t;
    }
    return cands[cands.length - 1];
  };

  const picked = roll(pool);
  if (avoid && picked === avoid) {
    const rest = pool.filter((t) => t !== avoid);
    if (rest.length > 0) return roll(rest);
  }
  return picked;
}
