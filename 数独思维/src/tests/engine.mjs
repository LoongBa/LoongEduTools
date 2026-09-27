// 数独引擎单测：直接跑真实源码（Node 26 原生 TS 类型剥离）。
// 断言：generatePuzzle 挖洞命中目标已知格、解合法（行/列/宫 1..N 各一次）、solve 唯一解、SD 往返一致。
// V1.0.4 增：parseImportedText 全分支、长度不变式、协议串 round-trip。
import { generatePuzzle, solve, boxOf, toSDString, fromSDString, validateImported, parseImportedText } from "../src/lib/sudoku.ts";

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

// ===== V1.0.4：parseImportedText 全分支 =====
// 合法协议串 SD4:（含逗号分隔）→ 解析成功
const sd4board = [1, 0, 3, 4, 3, 4, 0, 2, 2, 1, 4, 3, 4, 3, 2, 1]; // 4×4 合法题面（见冒烟用例）
const r1 = parseImportedText(`SD4:1,0,3,4,3,4,0,2,2,1,4,3,4,3,2,1`);
ok("parseImportedText SD4: 前缀可解析", r1.board && !r1.error, `error=${r1.error}`);
ok("parseImportedText SD4: board 与原始 givens 一致",
  !!r1.board && r1.board.every((v, i) => v === sd4board[i]));

// 纯数字（无前缀）16 位 → 4×4
const r2 = parseImportedText("1034340221434321");
ok("parseImportedText 纯数字判 4×4", r2.size === 4 && !!r2.board, `size=${r2.size} error=${r2.error}`);

// 协议串 + 中文标题混排（V1.0.4 复制文本「数独思维 · 4×4 练习题」不含 4×4 数字污染——标题数字不再进入 parse）
const r3 = parseImportedText(`数独思维 · 4×4 练习题\n导入编码：SD4:1034340221434321\n提示：…`);
ok("parseImportedText 混排含导入编码行可解析", r3.size === 4 && !!r3.board, `error=${r3.error}`);

// 少线索 → TOO_FEW
const r4 = parseImportedText("SD4:1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0");
ok("parseImportedText 少线索 TOO_FEW", r4.error === "TOO_FEW", `error=${r4.error}`);

// 冲突 → CONFLICT（同行重复 1）
const r5 = parseImportedText("SD4:1,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0");
ok("parseImportedText 冲突 CONFLICT", r5.error === "CONFLICT", `error=${r5.error}`);

// 长度不符 → BAD_LEN（SD4 前缀下 15 位）
const r6 = parseImportedText("SD4:1,0,3,4,3,4,0,2,2,1,4,3,4,3,2");
ok("parseImportedText SD 长度不符 BAD_LEN", r6.error === "BAD_LEN", `error=${r6.error}`);
ok("parseImportedText BAD_LEN 记录 cleanLen", r6.cleanLen === 15, `len=${r6.cleanLen}`);

// 空输入 → EMPTY
const r7 = parseImportedText("");
ok("parseImportedText 空输入 EMPTY", r7.error === "EMPTY", `error=${r7.error}`);

// 非法字符（9×9 里出现字母）→ 剥离后长度不符 BAD_LEN（字母被 clean 剔除）
const r8 = parseImportedText("abc");
ok("parseImportedText 纯字母 EMPTY", r8.error === "EMPTY", `error=${r8.error}`);

// ===== V1.0.4：round-trip + 长度不变式 =====
for (const size of [4, 6, 9]) {
  const { puzzle } = generatePuzzle(size, size === 4 ? 10 : size === 6 ? 18 : 27, "engine-test:rt:" + size);
  const sd = toSDString(puzzle, size);
  const proto = `SD${size}:${sd}`;
  ok(`size=${size} 协议串长度=前缀4+size²`, proto.length === 4 + size * size, `len=${proto.length}, sd=${proto}`);
  const back = parseImportedText(proto);
  ok(`size=${size} 协议串 round-trip 与原始 givens 一致`,
    back.board && back.board.every((v, i) => v === puzzle[i]), `error=${back.error}`);
}

console.log(`\n引擎单测 ${failed ? "FAIL " + failed : "全部通过"}`);
process.exit(failed ? 1 : 0);
