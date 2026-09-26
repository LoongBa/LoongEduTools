// 推理回放：把「已完成的题」还原成一条可讲解的推理链。
// 做法是从最终盘面出发，反复找出「此刻能被逻辑直接确定」的格子并撤回，
// 得到逆序的可解序列；反过来读就是孩子实际走通的推理顺序。
// 纯本地计算，无网络。

import { boxOf, colOf, findLogicStep, rowOf, solve, type Grid, type Size } from "./sudoku";

export interface ReplayStep {
  index: number;
  value: number;
  technique: string;
  reason: string;
  /** 支撑这一步的线索格（同宫/同行/列已落定的同数字） */
  peers: number[];
}

export interface ReplayResult {
  steps: ReplayStep[];
  /** 无法用单步逻辑解释、只能靠试错确定的格子数 */
  unresolved: number;
  /** 用到的技巧种类（按首次出现顺序） */
  techniques: string[];
}

const MAX_STEPS = 120;
/** 单步逻辑求解的总轮次上限：9×9 全量回放约需同等次数求解，收紧以控制同步计算耗时 */
const MAX_ROUNDS = 150;

/** 从 puzzle+solution 还原推理链；puzzle 为初始已知格掩码来源 */
export function buildReplay(puzzle: Grid, solution: Grid, size: Size): ReplayResult {
  const total = size * size;
  // 当前"已经推出来"的盘面：先只放初始已知格
  const filled: Grid = puzzle.slice();
  const pending: number[] = [];
  for (let i = 0; i < total; i++) if (!filled[i]) pending.push(i);

  const steps: ReplayStep[] = [];
  let guard = 0;

  while (pending.length && steps.length < MAX_STEPS && guard < MAX_ROUNDS) {
    guard++;
    const step = findLogicStep(filled, size);
    if (step && !filled[step.index]) {
      const at = pending.indexOf(step.index);
      if (at >= 0) pending.splice(at, 1);
      filled[step.index] = step.value;
      steps.push({ ...step, peers: cluePeers(filled, size, step.index, step.value) });
      continue;
    }
    // 逻辑卡住：按剩余候选最少优先推进一格，避免死循环
    const pick = pending.length ? leastConstrained(filled, size, pending) : -1;
    if (pick < 0) break;
    const at = pending.indexOf(pick);
    if (at >= 0) pending.splice(at, 1);
    filled[pick] = solution[pick];
  }

  const techniques: string[] = [];
  steps.forEach((s) => {
    if (techniques.indexOf(s.technique) < 0) techniques.push(s.technique);
  });

  return { steps, unresolved: pending.length, techniques };
}

/**
 * 在完整题面上预先推导一次，把结果按题目签名缓存。
 * 9×9 全量回放是同步重计算，缓存可保证同一道题只算一次（结算后反复查看不再卡顿）。
 */
const replayCache = new Map<string, ReplayResult>();

export function cachedReplay(puzzle: Grid, solution: Grid, size: Size): ReplayResult {
  const key = `${size}:${puzzle.join("")}`;
  const hit = replayCache.get(key);
  if (hit) return hit;
  const out = buildReplay(puzzle, solution, size);
  replayCache.set(key, out);
  if (replayCache.size > 8) {
    const first = replayCache.keys().next().value;
    if (first) replayCache.delete(first);
  }
  return out;
}

/** 支撑线索：与目标格同宫/同行/同列且已填好的同数字格 */
function cluePeers(grid: Grid, size: Size, index: number, value: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < grid.length; i++) {
    if (i === index || grid[i] !== value) continue;
    if (boxOf(size, i) === boxOf(size, index) || rowOf(size, i) === rowOf(size, index) || colOf(size, i) === colOf(size, index)) {
      out.push(i);
    }
  }
  return out.slice(0, 8);
}

function leastConstrained(grid: Grid, size: Size, pending: number[]): number {
  let best = pending[0];
  let bestScore = Infinity;
  for (const i of pending) {
    let used = 0;
    for (const j of neighbours(size, i)) if (grid[j]) used++;
    if (used < bestScore) {
      bestScore = used;
      best = i;
    }
  }
  return best;
}

function neighbours(size: Size, index: number): number[] {
  const out: number[] = [];
  const n = size * size;
  const r = rowOf(size, index);
  const c = colOf(size, index);
  const b = boxOf(size, index);
  for (let i = 0; i < n; i++) {
    if (i === index) continue;
    if (rowOf(size, i) === r || colOf(size, i) === c || boxOf(size, i) === b) out.push(i);
  }
  return out;
}

/** 校验题目是否唯一解（回放前的一次轻量检查） */
export function isUniqueSolvable(board: Grid, size: Size): boolean {
  return solve(board, size, 2).length === 1;
}
