/**
 * P3 抽卡/分组 纯逻辑（D05 §2.4.1 / §2.4.2）
 * 独立于 React / Tauri，可单测；无网络、无依赖。
 *
 * - 洗牌：Fisher-Yates，Math.random —— 课堂随机点名/分组无安全需求，
 *   无 crypto.getRandomValues 强制要求（需要加密强度时再升级）。
 * - 分组三算法同签名：输入名单 + 组数 → 输出组数组，便于替换与单测。
 */

export interface RosterStudent {
  /** 学生姓名（仅存本机 roster.json，零上报） */
  name: string;
  /** 强弱标记："strong"（强）/ "weak"（弱）/ null（未标记） */
  tag: "strong" | "weak" | null;
}

export type Student = RosterStudent;

/** Fisher-Yates 洗牌（返回新数组，不修改入参） */
export function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/** 粘贴名单解析：支持每行一个 / 英文逗号 / 中文逗号 / 顿号 / 分号 分隔 */
export function parseNames(text: string): string[] {
  return text
    .split(/[\n,，、;；]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 解析分组规模：优先 groupCount（按组数）；否则按 perGroup（每组人数）推组数。
 * 组数被夹在 [1, max(n,1)]——名单不足时不产生空组多余组。
 */
export function resolveGroupCount(
  n: number,
  opts: { groupCount?: number; perGroup?: number },
): number {
  const raw =
    opts.groupCount && opts.groupCount > 0
      ? opts.groupCount
      : Math.ceil(n / Math.max(1, opts.perGroup ?? 1));
  return Math.max(1, Math.min(n || 1, raw));
}

/** 轮转落组：顺次 i % count → 组，各组人数尽量均衡 */
function roundRobin(students: readonly Student[], count: number): Student[][] {
  const groups: Student[][] = Array.from({ length: count }, () => []);
  students.forEach((s, i) => {
    groups[i % count].push({ name: s.name, tag: s.tag });
  });
  return groups;
}

/** 随机分组：先洗牌再轮转落组（D05 §2.4.2「随机分组」） */
export function groupRandom(students: readonly Student[], count: number): Student[][] {
  return roundRobin(shuffle(students), count);
}

/**
 * 强弱搭配：强/弱/普通各自洗牌后按 强→弱→普通 顺序轮转落组，
 * 保证每组约 1-2 个强（强人数 > 组数时允许多），弱/普通匀开（D05 §2.4.2「强弱搭配」）。
 * 名单未标记任何强弱时退化为随机分组。
 */
export function groupBalanced(students: readonly Student[], count: number): Student[][] {
  const strong = shuffle(students.filter((s) => s.tag === "strong"));
  const weak = shuffle(students.filter((s) => s.tag === "weak"));
  const normal = shuffle(students.filter((s) => !s.tag));
  return roundRobin([...strong, ...weak, ...normal], count);
}

/** 编号分组：保持名单原序（学号/座次），i % count → 组。1,4,7 → A 组（D05 §2.4.2「编号分组」） */
export function groupByNumber(students: readonly Student[], count: number): Student[][] {
  return roundRobin(students, count);
}