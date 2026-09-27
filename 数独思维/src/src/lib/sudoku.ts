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

/** 单元种类：行 / 列 / 宫 */
type UnitKind = "row" | "col" | "box";

/** 按单元种类返回该单元的全部格子索引（row/col 按编号；box 按宫编号） */
function unitCells(size: Size, kind: UnitKind, unit: number): number[] {
  const total = size * size;
  const out: number[] = [];
  for (let i = 0; i < total; i++) {
    if (kind === "row" && rowOf(size, i) === unit) out.push(i);
    else if (kind === "col" && colOf(size, i) === unit) out.push(i);
    else if (kind === "box" && boxOf(size, i) === unit) out.push(i);
  }
  return out;
}

/** 单元数量（row/col = size；box = 宫数） */
function unitCount(size: Size, kind: UnitKind): number {
  if (kind === "box") return (size / SIZES[size].boxW) * (size / SIZES[size].boxH);
  return size;
}

export function findLogicStep(grid: Grid, size: Size): LogicStep | null {
  const total = size * size;
  const max = size;

  // 候选矩阵：懒计算共享（I6）——进阶识别器与基础识别共用，避免 9×9 candidatesFor 重复扫描
  const candCache = new Map<number, number[]>();
  const cand = (i: number): number[] => {
    let c = candCache.get(i);
    if (!c) {
      c = candidatesFor(grid, size, i);
      candCache.set(i, c);
    }
    return c;
  };

  // ① 唯一候选数
  for (let i = 0; i < total; i++) {
    if (grid[i]) continue;
    const cs = cand(i);
    if (cs.length === 1) {
      return { index: i, value: cs[0], technique: "唯一候选", reason: `这一格的行、列、宫里已经出现过其余 ${max - 1} 个数字，只剩 ${cs[0]} 能填。` };
    }
  }

  // ② 宫排除
  for (let b = 0; b < unitCount(size, "box"); b++) {
    const cells = unitCells(size, "box", b);
    for (let v = 1; v <= max; v++) {
      if (cells.some((i) => grid[i] === v)) continue;
      const spots = cells.filter((i) => !grid[i] && cand(i).indexOf(v) >= 0);
      if (spots.length === 1) {
        return { index: spots[0], value: v, technique: "宫内排除", reason: `第 ${b + 1} 宫里，数字 ${v} 被同行同列的其他宫挤到只剩一个位置。` };
      }
    }
  }

  // ③ 行列排除
  for (let unit = 0; unit < size; unit++) {
    for (const kind of ["row", "col"] as const) {
      const cells = unitCells(size, kind, unit);
      for (let v = 1; v <= max; v++) {
        if (cells.some((i) => grid[i] === v)) continue;
        const spots = cells.filter((i) => !grid[i] && cand(i).indexOf(v) >= 0);
        if (spots.length === 1) {
          const label = kind === "row" ? `第 ${unit + 1} 行` : `第 ${unit + 1} 列`;
          return { index: spots[0], value: v, technique: kind === "row" ? "行排除" : "列排除", reason: `${label}里，数字 ${v} 只能落在这一个空格。` };
        }
      }
    }
  }

  // ④ 显性数对（裸对）：单元内 2 个空格候选集各恰 = {a,b}（并集恰 2 数）→ 锁定
  for (const kind of ["row", "col", "box"] as const) {
    for (let u = 0; u < unitCount(size, kind); u++) {
      const cells = unitCells(size, kind, u).filter((i) => !grid[i]);
      if (cells.length < 3) continue;
      for (let p = 0; p < cells.length - 1; p++) {
        const cpa = cand(cells[p]);
        if (cpa.length !== 2) continue;
        for (let q = p + 1; q < cells.length; q++) {
          const cpb = cand(cells[q]);
          if (cpb.length !== 2 || cpa[0] !== cpb[0] || cpa[1] !== cpb[1]) continue;
          // 锁定 a,b → 单元其他格排除 → 找变单候选的落子格
          const a = cpa[0], b = cpa[1];
          const unitLabel = kind === "row" ? `第 ${u + 1} 行` : kind === "col" ? `第 ${u + 1} 列` : `第 ${u + 1} 宫`;
          const victim = findSingleAfterExclude(cells, cand, a, b, grid);
          if (victim) {
            return { index: victim.index, value: victim.value, technique: "显性数对", reason: `${unitLabel}里，有两格都只能填 ${a} 或 ${b}——它们把 ${a}、${b} 占住了，其它格不能再填这两个数，这一格就只能填 ${victim.value}。` };
          }
          // （数对两格自身恒不额外产生落子——候选各 {a,b} 即互为占位，主路径见上）
        }
      }
    }
  }

  // ⑤ 隐性数对 —— 单步落子已在 V1.4.0 裁剪（24000 盘零命中「排除后变单」落子）；V1.5.0 落为独立纯模式识别 findHiddenPairPattern（标注不落子，见其定义）。

  // ⑥ X-Wing（行向 + 列向对称）：数字 v 在两行候选位各恰 2 个且列对齐 → 这两列其他格排除 v
  for (const v of rangeOf(size)) {
    // 行向：找两行，v 候选位各 2 个且列集相同
    const rowCandCols: { row: number; cols: number[] }[] = [];
    for (let r = 0; r < size; r++) {
      const cells = unitCells(size, "row", r).filter((i) => !grid[i]);
      const cols = cells.filter((i) => cand(i).includes(v)).map((i) => colOf(size, i));
      if (cols.length === 2) rowCandCols.push({ row: r, cols: [...cols].sort((x, y) => x - y) });
    }
    for (let p = 0; p < rowCandCols.length - 1; p++) {
      for (let q = p + 1; q < rowCandCols.length; q++) {
        const A = rowCandCols[p], B = rowCandCols[q];
        if (A.cols[0] !== B.cols[0] || A.cols[1] !== B.cols[1]) continue;
        const victim = findXWingVictim(size, grid, cand, [A.row, B.row], A.cols, v, true);
        if (victim) {
          return { index: victim.index, value: victim.value, technique: "X-Wing", reason: `数字 ${v} 在第 ${A.row + 1}、${B.row + 1} 行里都只能放在第 ${A.cols[0] + 1}、${A.cols[1] + 1} 列，形成矩形 → 这两列其他格不能再有 ${v} → 这一格就只能填 ${victim.value}。` };
        }
      }
    }
    // 列向：找两列，v 候选位各 2 个且行集相同
    const colCandRows: { col: number; rows: number[] }[] = [];
    for (let c = 0; c < size; c++) {
      const cells = unitCells(size, "col", c).filter((i) => !grid[i]);
      const rows = cells.filter((i) => cand(i).includes(v)).map((i) => rowOf(size, i));
      if (rows.length === 2) colCandRows.push({ col: c, rows: [...rows].sort((x, y) => x - y) });
    }
    for (let p = 0; p < colCandRows.length - 1; p++) {
      for (let q = p + 1; q < colCandRows.length; q++) {
        const A = colCandRows[p], B = colCandRows[q];
        if (A.rows[0] !== B.rows[0] || A.rows[1] !== B.rows[1]) continue;
        const victim = findXWingVictim(size, grid, cand, A.rows, [A.col, B.col], v, false);
        if (victim) {
          return { index: victim.index, value: victim.value, technique: "X-Wing", reason: `数字 ${v} 在第 ${A.col + 1}、${B.col + 1} 列里都只能放在第 ${A.rows[0] + 1}、${A.rows[1] + 1} 行，形成矩形 → 这两行其他格不能再有 ${v} → 这一格就只能填 ${victim.value}。` };
        }
      }
    }
  }

  return null;
}

/** 隐性数对模式标注（V1.5.0）：某单元内数字对 {a,b} 的候选位置集全集落于同 2 格（藏身格）。
 *  纯模式识别，不产出落子——与 findLogicStep 单步落子语义分离（V1.4.0 裁剪根因）。
 *  排除显性数对误报：藏身格候选集中至少一格 ≥3 候选（两格候选恰 {a,b} 是显性数对，findLogicStep ④ 已覆盖）。
 *  前置条件（I5）：调用方应确保 findLogicStep(grid) 返回 null（即无隐性唯一/宫排除/行列排除可推进）——
 *   否则对「某数字唯一位=1 格」的 pair 结构会漏检（该结构已被 ②③ 覆盖，属预期）。
 *  返回 null = 无隐性数对模式。 */
export interface HiddenPairPattern {
  /** 藏身两格 (locked cells) */
  cells: [number, number];
  /** 被藏的两个数字 */
  values: [number, number];
  /** 所在单元（row/col/box） */
  unitKind: "row" | "col" | "box";
  unitIdx: number;
}

export function findHiddenPairPattern(grid: Grid, size: Size): HiddenPairPattern | null {
  const max = size;
  // row → col → box 固定序（稳定可测，I6-3）
  for (const kind of ["row", "col", "box"] as const) {
    for (let u = 0; u < unitCount(size, kind); u++) {
      const cells = unitCells(size, kind, u).filter((i) => !grid[i]);
      if (cells.length < 3) continue; // 藏身 2 格 + 至少 1 排除对象
      // 单元内每个数字的候选位集合（懒计算单格候选；9×9 轻量，不跨调用缓存）
      const posOf = (v: number): number[] => cells.filter((i) => candidatesFor(grid, size, i).indexOf(v) >= 0);
      for (let x = 1; x <= max; x++) {
        const px = posOf(x);
        if (px.length !== 2) continue; // 前置条件下：1=隐性唯一（②③已覆盖）、0=已放置、>2=非数对
        for (let y = x + 1; y <= max; y++) {
          const py = posOf(y);
          if (py.length !== 2 || px[0] !== py[0] || px[1] !== py[1]) continue; // 交集=并集=同 2 格
          // 显性数对排除：两格候选均恰 {x,y} → ④ 裸对；至少一格 ≥3 才是隐性（I6-1 允许「一格恰2另一格≥3」）
          const c1 = px[0], c2 = px[1];
          const c1n = candidatesFor(grid, size, c1).length;
          const c2n = candidatesFor(grid, size, c2).length;
          if (c1n === 2 && c2n === 2) continue;
          return { cells: [c1, c2], values: [x, y], unitKind: kind, unitIdx: u };
        }
      }
    }
  }
  return null;
}

/**
 * 辅助：在单元内排除某两个数字（数对锁定）后，找「变单候选」的落子格。
 * 不改 grid——用「原始候选过滤」模拟排除后状态（保持 findLogicStep 内 cand 缓存有效）。
 * 返回 { index, value }（value = 排除后的唯一候选）；无落子返回 null。
 */
function findSingleAfterExclude(
  cells: number[],
  cand: (i: number) => number[],
  a: number,
  b: number,
  grid: Grid,
): { index: number; value: number } | null {
  for (const i of cells) {
    if (grid[i]) continue;
    const c = cand(i);
    if (c.includes(a) || c.includes(b)) {
      const reduced = c.filter((v) => v !== a && v !== b);
      if (reduced.length === 1) return { index: i, value: reduced[0] };
    }
  }
  return null;
}

/**
 * 辅助：X-Wing 矩形排除后，在排除区寻找变单候选的落子格。
 * 行向 X-Wing（rowForm=true）：矩形 = 两行 rectRows × 两列 rectCols；
 *   排除区 = rectCols 两列中，行 ∉ rectRows 的格子（v 被矩形锁定在两行，这两列其它行不能再有 v）。
 * 列向 X-Wing（rowForm=false）：排除区 = rectRows 两行中，列 ∉ rectCols 的格子。
 * 返回 { index, value }（value = 排除 v 后的唯一候选）；无落子返回 null。
 * 不改 grid——用「原始候选过滤」模拟排除（保持 cand 缓存有效）。
 */
function findXWingVictim(
  size: Size,
  grid: Grid,
  cand: (i: number) => number[],
  rectRows: number[],
  rectCols: number[],
  v: number,
  rowForm: boolean,
): { index: number; value: number } | null {
  if (rowForm) {
    for (const c of rectCols) {
      for (let r = 0; r < size; r++) {
        if (rectRows.includes(r)) continue; // 矩形顶点除外
        const i = r * size + c;
        if (grid[i] || !cand(i).includes(v)) continue;
        const reduced = cand(i).filter((x) => x !== v);
        if (reduced.length === 1) return { index: i, value: reduced[0] };
      }
    }
  } else {
    for (const r of rectRows) {
      for (let c = 0; c < size; c++) {
        if (rectCols.includes(c)) continue; // 矩形顶点除外
        const i = r * size + c;
        if (grid[i] || !cand(i).includes(v)) continue;
        const reduced = cand(i).filter((x) => x !== v);
        if (reduced.length === 1) return { index: i, value: reduced[0] };
      }
    }
  }
  return null;
}
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

/** 导入解析错误码（引擎层零文案，中文映射见 lib/copy.ts importMsg） */
export type ImportError =
  | "EMPTY" // 未识别到任何数字
  | "BAD_LEN" // 数字点串长度与规格不符
  | "BAD_CHAR" // 有超出规格的字符/数字
  | "CONFLICT" // 行/列/宫重复
  | "TOO_FEW" // 线索不足
  | "NO_SOLUTION" // 无解
  | "MULTI_SOLUTION"; // 多解

/** 导入文本解析结果 */
export interface ParseResult {
  size: Size | null;
  board: Grid | null;
  /** 错误码；null = 校验通过可开始 */
  error: ImportError | null;
  /** 纯净数字点串长度（供 BAD_LEN 消息动态拼接） */
  cleanLen: number;
  /** 校验通过时的参考解（validateImported 顺带求出，避免直启二次求解） */
  solution?: Grid;
}

export function parseImportedText(text: string): ParseResult {
  // ① SD{N}: 前缀格式（分享题编码协议串）：SD4:/SD6:/SD9: 后可接逗号或空白分隔的 N×N 个数字
  const sd = /SD(4|6|9)\s*:\s*([0-9.,\s]+)/.exec(text);
  if (sd) {
    const size = Number(sd[1]) as Size;
    return finishParse({ text: sd[2], size });
  }
  // ② 无前缀：纯数字按长度判规格（16/36/81 → 4/6/9）
  const clean = text.replace(/[^0-9.\s]/g, "").replace(/\s+/g, "");
  const size: Size | null = clean.length === 16 ? 4 : clean.length === 36 ? 6 : clean.length === 81 ? 9 : null;
  if (!size) return { size, board: null, error: clean.length ? "BAD_LEN" : "EMPTY", cleanLen: clean.length };
  return finishParse({ text: clean, size });
}

/** ①/② 共用：从给定文本解析出纯净数字点串 → 校验格式与规则 */
function finishParse(seg: { text: string; size: Size }): ParseResult {
  // clean = 保留 [0-9.]（. 与 0 均表空），仅剥离 [,\s]
  const clean = seg.text.replace(/[^0-9.]/g, "");
  const need = seg.size * seg.size;
  if (clean.length !== need) return { size: seg.size, board: null, error: "BAD_LEN", cleanLen: clean.length };
  const board = fromSDString(clean, seg.size);
  if (!board) return { size: seg.size, board: null, error: "BAD_CHAR", cleanLen: clean.length };
  const v = validateImported(board, seg.size);
  return { size: seg.size, board: v.ok ? board : null, error: v.error, cleanLen: clean.length, solution: v.solution };
}

/** 题面是否合法：无冲突、线索充足且唯一解（返回错误码与参考解，文案见 copy.ts） */
export function validateImported(grid: Grid, size: Size): { ok: boolean; error: ImportError | null; solution?: Grid } {
  const total = size * size;
  for (let i = 0; i < total; i++) {
    if (!grid[i]) continue;
    if (peersOf(size, i).some((j) => grid[j] === grid[i])) {
      return { ok: false, error: "CONFLICT" };
    }
  }
  if (countGiven(grid) < MIN_GIVENS[size]) {
    return { ok: false, error: "TOO_FEW" };
  }
  const sols = solve(grid, size, 2);
  if (sols.length === 0) return { ok: false, error: "NO_SOLUTION" };
  if (sols.length > 1) return { ok: false, error: "MULTI_SOLUTION" };
  return { ok: true, error: null, solution: sols[0] };
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

/** analyzeTechniques 循环上限：同 replay.ts 经验（9×9 全盘扫描必须双上限兜底，防卡主线程） */
const TECHNIQUE_MAX_ROUNDS = 100;
/** 题面技巧画像缓存：按 `size:SD` 签名，FIFO 上限防无界增长 */
const techniqueCache = new Map<string, string[]>();

/**
 * 题面技巧画像（V1.3.0+V1.5.0）：模拟完整推理链，收集去重的 findLogicStep technique 集合。
 * 语义边界（oracle B2）：结果是「题面推理链前段（基础技巧可推进部分）涉及的技巧近似标签」，
 * 不等于孩子填错那格对应的技巧；findLogicStep 只能诚实识别唯一候选/宫内排除/行列排除，
 * 卡住（需进阶技巧）时返回已收集子集，不抛错。
 * V1.5.0（I1 修订）：卡住时补一次 findHiddenPairPattern 探测——命中即 add「隐性数对」并终止
 * （不猜测、不推进，保持「诚实子集」语义；least-constrained 猜测会引入伪阳性标签）。
 */
export function analyzeTechniques(board: Grid, size: Size): string[] {
  const sig = `${size}:${toSDString(board, size)}`;
  const hit = techniqueCache.get(sig);
  if (hit) return hit;
  const set = new Set<string>();
  const grid = board.slice();
  for (let i = 0; i < TECHNIQUE_MAX_ROUNDS; i++) {
    const step = findLogicStep(grid, size);
    if (!step) break; // 卡住（需进阶技巧）或已解完
    set.add(step.technique);
    grid[step.index] = step.value; // 每轮必填一格 → ≤size² 轮必然终止（N1）
  }
  // V1.5.0：卡住时探测隐性数对模式（纯标注；命中可能=卡住原因），非卡住（已解完）不探测
  if (!findLogicStep(grid, size)) {
    const pattern = findHiddenPairPattern(grid, size);
    if (pattern) set.add("隐性数对");
  }
  const out = [...set];
  if (techniqueCache.size > 200) techniqueCache.clear(); // FIFO 上限
  techniqueCache.set(sig, out);
  return out;
}
