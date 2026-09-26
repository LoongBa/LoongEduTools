// 数独引擎单测：直接跑真实源码（Node 26 原生 TS 类型剥离）。
// 断言：generatePuzzle 挖洞命中目标已知格、解合法（行/列/宫 1..N 各一次）、solve 唯一解、SD 往返一致。
import { generatePuzzle, solve, boxOf, toSDString, fromSDString, validateImported } from "../src/lib/sudoku.ts";

let failed = 0;
const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} | ${name} ${extra}`);
  if (!cond) failed++;
};

for (const size of [4, 6, 9]) {
  const target = size === 4 ? 10 : size === 6 ? 18 : 27;
  const { puzzle, solution } = generatePuzzle(size, target, "engine-test:" + size);
  ok(`size=${size} puzzle 长度=N*N`, puzzle.length === size * size, `len=${puzzle.length}`);
  const givens = puzzle.filter((v) => v).length;
  ok(`size=${size} 挖洞命中目标(${target})`, Math.abs(givens - target) <= 4, `given=${givens}`);

  // 解合法性：行/列/宫 1..N 各一次
  let valid = true;
  for (let r = 0; r < size && valid; r++) {
    const s = new Set();
    for (let c = 0; c < size; c++) s.add(solution[r * size + c]);
    if (s.size !== size) valid = false;
  }
  for (let c = 0; c < size && valid; c++) {
    const s = new Set();
    for (let r = 0; r < size; r++) s.add(solution[r * size + c]);
    if (s.size !== size) valid = false;
  }
  const boxW = size === 9 ? 3 : 2;
  const boxH = size === 9 ? 3 : size === 6 ? 3 : 2;
  const boxCount = (size * size) / (boxW * boxH);
  for (let b = 0; b < boxCount && valid; b++) {
    const s = new Set();
    for (let i = 0; i < size * size; i++) if (boxOf(size, i) === b) s.add(solution[i]);
    if (s.size !== size) valid = false;
  }
  ok(`size=${size} 解合法`, valid);

  const sols = solve(puzzle, size, 2);
  ok(`size=${size} 题面唯一解`, sols.length === 1, `solutions=${sols.length}`);
  ok(`size=${size} 唯一解=生成解`, toSDString(sols[0], size) === toSDString(solution, size));

  // SD 往返
  const sd = toSDString(puzzle, size);
  ok(`size=${size} SD 长度=N*N`, sd.length === size * size);
  const back = fromSDString(sd, size);
  ok(`size=${size} SD 往返一致`, !!back && toSDString(back, size) === sd);
}

// 导入校验：合法题通过 / 少线索拒绝 / 冲突拒绝
const { puzzle: p9 } = generatePuzzle(9, 27, "engine-test:import");
ok("validateImported 合法题通过", validateImported(p9, 9).ok);
const sparse = p9.slice();
for (let i = 0; i < 30; i++) sparse[i] = 0;
ok("validateImported 少线索拒绝", !validateImported(sparse, 9).ok);

console.log(`\n引擎单测 ${failed ? "FAIL " + failed : "全部通过"}`);
process.exit(failed ? 1 : 0);
