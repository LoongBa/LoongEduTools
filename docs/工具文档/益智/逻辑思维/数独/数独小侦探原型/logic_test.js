// 数独核心逻辑（纯函数，无 DOM）——与 H5 原型内嵌逻辑保持一致
'use strict';

function randInt(n) { return Math.floor(Math.random() * n); }

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function boxDims(N) {
  if (N === 4) return [2, 2];
  if (N === 6) return [2, 3];
  return [3, 3];
}

function cellValid(board, N, r, c, v) {
  for (let i = 0; i < N; i++) {
    if (board[r * N + i] === v) return false;
    if (board[i * N + c] === v) return false;
  }
  const [br, bc] = boxDims(N);
  const r0 = Math.floor(r / br) * br, c0 = Math.floor(c / bc) * bc;
  for (let i = r0; i < r0 + br; i++) {
    for (let j = c0; j < c0 + bc; j++) {
      if (board[i * N + j] === v) return false;
    }
  }
  return true;
}

// 回溯填充完整解
function fillBoard(N) {
  const board = new Array(N * N).fill(0);
  function bt(pos) {
    if (pos === N * N) return true;
    const r = Math.floor(pos / N), c = pos % N;
    for (const v of shuffle([...Array(N).keys()].map(i => i + 1))) {
      if (cellValid(board, N, r, c, v)) {
        board[pos] = v;
        if (bt(pos + 1)) return true;
        board[pos] = 0;
      }
    }
    return false;
  }
  bt(0);
  return board;
}

// 求解并计数（最多数到 limit）
function solveCount(board, N, limit) {
  let count = 0;
  const b = board.slice();
  function bt(pos) {
    if (count >= limit) return;
    while (pos < N * N && b[pos] !== 0) pos++;
    if (pos === N * N) { count++; return; }
    const r = Math.floor(pos / N), c = pos % N;
    for (let v = 1; v <= N; v++) {
      if (cellValid(b, N, r, c, v)) {
        b[pos] = v;
        bt(pos + 1);
        b[pos] = 0;
        if (count >= limit) return;
      }
    }
  }
  bt(0);
  return count;
}

// 挖洞生成：保证唯一解；多轮迭代挖洞 + 换新解重试，尽量逼近目标已知格数
function genPuzzle(N, givens) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const solution = fillBoard(N);
    const puzzle = solution.slice();
    const positions = shuffle([...Array(N * N).keys()]);
    let filled = N * N;
    let round = 0;
    while (filled > givens && round < N * N) {
      let progress = false;
      for (const p of positions) {
        if (filled <= givens) break;
        if (puzzle[p] === 0) continue;
        const backup = puzzle[p];
        puzzle[p] = 0;
        if (solveCount(puzzle, N, 2) === 1) {
          filled--;
          progress = true;
        } else {
          puzzle[p] = backup;
        }
      }
      if (!progress) break;
      round++;
    }
    if (filled <= givens + 4) return { puzzle, solution, givensCount: filled };
  }
  // 兜底：最后一次结果直接返回（仍保证唯一解）
  const solution = fillBoard(N);
  const puzzle = solution.slice();
  const positions = shuffle([...Array(N * N).keys()]);
  let filled = N * N;
  for (const p of positions) {
    if (filled <= givens) break;
    const backup = puzzle[p];
    puzzle[p] = 0;
    if (solveCount(puzzle, N, 2) === 1) filled--;
    else puzzle[p] = backup;
  }
  return { puzzle, solution, givensCount: filled };
}

function getCandidates(board, N, r, c) {
  const out = [];
  for (let v = 1; v <= N; v++) {
    if (cellValid(board, N, r, c, v)) out.push(v);
  }
  return out;
}

function findHintCell(board, N) {
  let best = null, bestLen = Infinity;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (board[r * N + c] !== 0) continue;
      const cands = getCandidates(board, N, r, c);
      if (cands.length < bestLen) { bestLen = cands.length; best = { r, c, cands }; }
      if (bestLen === 1) return best;
    }
  }
  return best;
}

// ---- 测试 ----
function isSolvedValid(board, N) {
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const v = board[r * N + c];
      if (v === 0) return false;
      const b = board.slice();
      b[r * N + c] = 0;
      if (!cellValid(b, N, r, c, v)) return false;
    }
  }
  return true;
}

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name); }
}

const cases = [
  [4, 4, 9], [4, 4, 12],
  [6, 6, 20], [6, 6, 24],
  [9, 9, 24], [9, 9, 30], [9, 9, 36],
];
for (const [N, , givens] of cases) {
  for (let t = 0; t < 5; t++) {
    const { puzzle, solution } = genPuzzle(N, givens);
    const given = puzzle.filter(v => v !== 0).length;
    check(`N=${N} givens=${givens} 实际=${given}`, given >= givens && given <= givens + 4);
    check(`N=${N} 解唯一`, solveCount(puzzle, N, 2) === 1);
    check(`N=${N} 解合法`, isSolvedValid(solution, N));
  }
}
// 提示：空盘上找最小候选格
{
  const { puzzle, solution } = genPuzzle(9, 30);
  const h = findHintCell(puzzle, 9);
  check('hint 非空', !!h && h.cands.length >= 1);
  check('hint 值正确', puzzle[h.r * 9 + h.c] === 0 && solution[h.r * 9 + h.c] === h.cands[0]);
}
console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
