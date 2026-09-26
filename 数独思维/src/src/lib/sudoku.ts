// 数独核心引擎：纯本地计算，无任何网络依赖。
// 支持 4×4 / 6×6 / 9×9 三种规格（宫尺寸 2 / 3 / 3）。

export type Size = 4 | 6 | 9;
/** 0 表示空格 */
export type Grid = number[];

export interface Technique {
  key: string;
  name: string;
  emoji: string;
  brief: string;
  tier: "base" | "adv";
}

const SIZES: Record<Size, { boxW: number; boxH: number }> = {
  4: { boxW: 2, boxH: 2 },
  6: { boxW: 2, boxH: 3 },
  9: { boxW: 3, boxH: 3 },
};

export function boxOf(size: Size, i: number): number {
  const { boxW, boxH } = SIZES[size];
  const r = Math.floor(i / size);
  const c = i % size;
  return Math.floor(r / boxH) * (size / boxW) + Math.floor(c / boxW);
}

export function rowOf(size: Size, i: number): number {
  return Math.floor(i / size);
}

export function colOf(size: Size, i: number): number {
  return i % size;
}

/** 同行 + 同列 + 同宫的同伴格索引 */
export function peersOf(size: Size, i: number): number[] {
  const total = size * size;
  const r = rowOf(size, i);
  const c = colOf(size, i);
  const b = boxOf(size, i);
  const out: number[] = [];
  for (let j = 0; j < total; j++) {
    if (j === i) continue;
    if (rowOf(size, j) === r || colOf(size, j) === c || boxOf(size, j) === b) out.push(j);
  }
  return out;
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/** 可复现的字符串种子随机源 */
export function seededRandom(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return function () {
    h ^= h << 13;
    h >>>= 0;
    h ^= h >> 17;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= h << 5;
    h >>>= 0;
    return (h >>> 0) / 4294967296;
  };
}

function candidatesFor(grid: Grid, size: Size, i: number): number[] {
  const max = size;
  const used = new Set<number>();
  const ps = peersOf(size, i);
  for (let k = 0; k < ps.length; k++) {
    const v = grid[ps[k]];
    if (v) used.add(v);
  }
  const out: number[] = [];
  for (let v = 1; v <= max; v++) if (!used.has(v)) out.push(v);
  return out;
}

/** 回溯求解；limit 限制解数量用于唯一解校验 */
export function solve(grid: Grid, size: Size, limit = 1): Grid[] {
  const solutions: Grid[] = [];
  const total = size * size;

  function step(g: Grid): void {
    if (solutions.length >= limit) return;
    let best = -1;
    let bestCount = 99;
    for (let i = 0; i < total; i++) {
      if (g[i]) continue;
      const cs = candidatesFor(g, size, i);
      if (cs.length === 0) return;
      if (cs.length < bestCount) {
        bestCount = cs.length;
        best = i;
        if (cs.length === 1) break;
      }
    }
    if (best === -1) {
      solutions.push(g.slice());
      return;
    }
    const cs = candidatesFor(g, size, best);
    for (let k = 0; k < cs.length; k++) {
      g[best] = cs[k];
      step(g);
      g[best] = 0;
      if (solutions.length >= limit) return;
    }
  }

  step(grid.slice());
  return solutions;
}

function makeSolution(size: Size, rnd: () => number): Grid {
  const total = size * size;
  const g: Grid = new Array(total).fill(0);

  function fill(pos: number): boolean {
    if (pos === total) return true;
    if (g[pos]) return fill(pos + 1);
    const nums = shuffle(rangeOf(size), rnd);
    for (let k = 0; k < nums.length; k++) {
      const ok = peersOf(size, pos).every((j) => g[j] !== nums[k]);
      if (!ok) continue;
      g[pos] = nums[k];
      if (fill(pos + 1)) return true;
      g[pos] = 0;
    }
    return false;
  }

  fill(0);
  return g;
}

export function rangeOf(size: Size): number[] {
  const max = size;
  const out: number[] = [];
  for (let v = 1; v <= max; v++) out.push(v);
  return out;
}

/** 逻辑求解步骤（用于提示讲解与技巧教学演示） */
export interface LogicStep {
  index: number;
  value: number;
  technique: string;
  reason: string;
}

export function findLogicStep(grid: Grid, size: Size): LogicStep | null {
  const total = size * size;
  const max = size;

  // ① 唯一候选数
  for (let i = 0; i < total; i++) {
    if (grid[i]) continue;
    const cs = candidatesFor(grid, size, i);
    if (cs.length === 1) {
      return { index: i, value: cs[0], technique: "唯一候选", reason: `这一格的行、列、宫里已经出现过其余 ${max - 1} 个数字，只剩 ${cs[0]} 能填。` };
    }
  }

  // ② 宫排除
  const boxCount = (size / SIZES[size].boxW) * (size / SIZES[size].boxH);
  for (let b = 0; b < boxCount; b++) {
    const cells: number[] = [];
    for (let i = 0; i < total; i++) if (boxOf(size, i) === b) cells.push(i);
    for (let v = 1; v <= max; v++) {
      if (cells.some((i) => grid[i] === v)) continue;
      const spots = cells.filter((i) => !grid[i] && candidatesFor(grid, size, i).indexOf(v) >= 0);
      if (spots.length === 1) {
        return { index: spots[0], value: v, technique: "宫内排除", reason: `第 ${b + 1} 宫里，数字 ${v} 被同行同列的其他宫挤到只剩一个位置。` };
      }
    }
  }

  // ③ 行列排除
  const n = size;
  for (let unit = 0; unit < n; unit++) {
    for (const kind of ["row", "col"] as const) {
      const cells: number[] = [];
      for (let i = 0; i < total; i++) {
        if (kind === "row" ? rowOf(size, i) === unit : colOf(size, i) === unit) cells.push(i);
      }
      for (let v = 1; v <= max; v++) {
        if (cells.some((i) => grid[i] === v)) continue;
        const spots = cells.filter((i) => !grid[i] && candidatesFor(grid, size, i).indexOf(v) >= 0);
        if (spots.length === 1) {
          const label = kind === "row" ? `第 ${unit + 1} 行` : `第 ${unit + 1} 列`;
          return { index: spots[0], value: v, technique: kind === "row" ? "行排除" : "列排除", reason: `${label}里，数字 ${v} 只能落在这一个空格。` };
        }
      }
    }
  }

  return null;
}

/** 按目标已知格数挖洞，保证唯一解 */
export function generatePuzzle(
  size: Size,
  targetGiven: number,
  seed: string,
): { puzzle: Grid; solution: Grid } {
  const rnd = seededRandom(seed + ":" + size);
  const solution = makeSolution(size, rnd);
  const total = size * size;
  const puzzle: Grid = solution.slice();
  const order = shuffle(
    Array.from({ length: total }, (_, i) => i),
    rnd,
  );

  let given = total;
  for (let k = 0; k < order.length && given > targetGiven; k++) {
    const i = order[k];
    const backup = puzzle[i];
    puzzle[i] = 0;
    if (solve(puzzle, size, 2).length === 1) {
      given--;
    } else {
      puzzle[i] = backup;
    }
  }
  return { puzzle, solution };
}

/** 技巧教学关用的盘面：给定解 + 保留指定线索，使目标格可由该技巧推出 */
export function teachingBoard(solution: Grid, clues: number[]): Grid {
  const g = solution.slice();
  for (let i = 0; i < g.length; i++) if (clues.indexOf(i) < 0) g[i] = 0;
  return g;
}

export function toSDString(grid: Grid, size: Size): string {
  const total = size * size;
  let s = "";
  for (let i = 0; i < total; i++) s += grid[i] ? String(grid[i]) : ".";
  return s;
}

export function fromSDString(s: string, size: Size): Grid | null {
  const total = size * size;
  const clean = s.replace(/\s+/g, "").slice(0, total);
  if (clean.length !== total) return null;
  const g: Grid = [];
  for (let i = 0; i < total; i++) {
    const ch = clean[i];
    if (ch === "." || ch === "0") {
      g.push(0);
      continue;
    }
    const v = Number(ch);
    if (!v || v > size) return null;
    g.push(v);
  }
  return g;
}

/** 各规格下的最少已知格数：低于该值无法保证唯一推理（9×9 数学下界 17，4×4/6×6 取生成目标半程保守线） */
export const MIN_GIVENS: Record<Size, number> = { 4: 4, 6: 10, 9: 17 };

/** 题面是否合法：无冲突、线索充足且唯一解 */
export function validateImported(grid: Grid, size: Size): { ok: boolean; message: string } {
  const total = size * size;
  for (let i = 0; i < total; i++) {
    if (!grid[i]) continue;
    if (peersOf(size, i).some((j) => grid[j] === grid[i])) {
      return { ok: false, message: "题面有冲突：同一行/列/宫里出现了重复数字。" };
    }
  }
  if (countGiven(grid) < MIN_GIVENS[size]) {
    return { ok: false, message: `题面线索太少：至少需要 ${MIN_GIVENS[size]} 个已知数才能保证唯一推理。` };
  }
  const sols = solve(grid, size, 2);
  if (sols.length === 0) return { ok: false, message: "这道题无解，请检查填入的数字。" };
  if (sols.length > 1) return { ok: false, message: "这道题不止一个答案，请再补充几个数字。" };
  return { ok: true, message: "" };
}

export function countGiven(grid: Grid): number {
  let c = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i]) c++;
  return c;
}

/** 剩余数字计数（数字条上的已填/总数） */
export function remainingMap(grid: Grid, size: Size): Record<number, number> {
  const max = size;
  const out: Record<number, number> = {};
  for (let v = 1; v <= max; v++) out[v] = max;
  for (let i = 0; i < grid.length; i++) if (grid[i]) out[grid[i]] -= 1;
  return out;
}
