/* ============================================================
   数独入门 — 数独核心算法（纯算法模块，无 DOM，Chrome 61 基线）
   ------------------------------------------------------------
   移植自 docs/工具文档/益智/逻辑思维/数独/数独小侦探原型/logic_test.js（已验证：唯一解 /
   已知格范围 / 解合法性）。ES2015+ 语法降级为 ES2017（var + function，
   去除解构 / spread / Array.prototype.fill / 箭头函数）。
   出口：window.SUDOKU = { boxDims, cellValid, fillBoard, solveCount,
         genPuzzle, getCandidates, findHintCell }
   用法：var g = window.SUDOKU.genPuzzle(9, 33);
         g.puzzle（挖洞后盘面，0=空格）/ g.solution（唯一解）/ g.givensCount（已知格数）
   ============================================================ */
(function () {
  'use strict';

  /** 随机整数 [0, n) */
  function randInt(n) { return Math.floor(Math.random() * n); }

  /** Fisher-Yates 洗牌（返回新数组，不修改入参） */
  function shuffle(arr) {
    var a = arr.slice();
    var i, j, t;
    for (i = a.length - 1; i > 0; i--) {
      j = randInt(i + 1);
      t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /** 宫格尺寸：4 → [2,2]、6 → [2,3]、9 → [3,3] */
  function boxDims(N) {
    if (N === 4) { return [2, 2]; }
    if (N === 6) { return [2, 3]; }
    return [3, 3];
  }

  /** 在 (r,c) 填入 v 是否合法（所在行/列/宫内不重复） */
  function cellValid(board, N, r, c, v) {
    var i;
    for (i = 0; i < N; i++) {
      if (board[r * N + i] === v) { return false; }
      if (board[i * N + c] === v) { return false; }
    }
    var dims = boxDims(N);
    var br = dims[0];
    var bc = dims[1];
    var r0 = Math.floor(r / br) * br;
    var c0 = Math.floor(c / bc) * bc;
    var a, b;
    for (a = r0; a < r0 + br; a++) {
      for (b = c0; b < c0 + bc; b++) {
        if (board[a * N + b] === v) { return false; }
      }
    }
    return true;
  }

  /** 回溯填充一个完整解 */
  function fillBoard(N) {
    var board = new Array(N * N);
    var i;
    for (i = 0; i < board.length; i++) { board[i] = 0; }
    function bt(pos) {
      if (pos === N * N) { return true; }
      var r = Math.floor(pos / N);
      var c = pos % N;
      var vals = [];
      var n, k;
      for (n = 1; n <= N; n++) { vals.push(n); }
      var cands = shuffle(vals);
      for (k = 0; k < cands.length; k++) {
        var v = cands[k];
        if (cellValid(board, N, r, c, v)) {
          board[pos] = v;
          if (bt(pos + 1)) { return true; }
          board[pos] = 0;
        }
      }
      return false;
    }
    bt(0);
    return board;
  }

  /** 求解并计数（最多数到 limit）：0 无解 / 1 唯一解 / >=limit 至少 limit 个解 */
  function solveCount(board, N, limit) {
    var count = 0;
    var b = board.slice();
    function bt(pos) {
      if (count >= limit) { return; }
      while (pos < N * N && b[pos] !== 0) { pos++; }
      if (pos === N * N) { count++; return; }
      var r = Math.floor(pos / N);
      var c = pos % N;
      var v;
      for (v = 1; v <= N; v++) {
        if (cellValid(b, N, r, c, v)) {
          b[pos] = v;
          bt(pos + 1);
          b[pos] = 0;
          if (count >= limit) { return; }
        }
      }
    }
    bt(0);
    return count;
  }

  /** 挖洞生成：保证唯一解；多轮迭代挖洞 + 换新解重试，尽量逼近目标已知格数 */
  function genPuzzle(N, givens) {
    var attempt, p;
    for (attempt = 0; attempt < 4; attempt++) {
      var solution = fillBoard(N);
      var puzzle = solution.slice();
      var positions = [];
      var i;
      for (i = 0; i < N * N; i++) { positions.push(i); }
      positions = shuffle(positions);
      var filled = N * N;
      var round = 0;
      while (filled > givens && round < N * N) {
        var progress = false;
        for (p = 0; p < positions.length; p++) {
          if (filled <= givens) { break; }
          var pos = positions[p];
          if (puzzle[pos] === 0) { continue; }
          var backup = puzzle[pos];
          puzzle[pos] = 0;
          if (solveCount(puzzle, N, 2) === 1) {
            filled--;
            progress = true;
          } else {
            puzzle[pos] = backup;
          }
        }
        if (!progress) { break; }
        round++;
      }
      if (filled <= givens + 4) { return { puzzle: puzzle, solution: solution, givensCount: filled }; }
    }
    // 兜底：最后一次结果直接返回（仍保证唯一解）
    var solution2 = fillBoard(N);
    var puzzle2 = solution2.slice();
    var positions2 = [];
    var i2;
    for (i2 = 0; i2 < N * N; i2++) { positions2.push(i2); }
    var posList = shuffle(positions2);
    var filled2 = N * N;
    var q;
    for (q = 0; q < posList.length; q++) {
      if (filled2 <= givens) { break; }
      var idx = posList[q];
      var bk = puzzle2[idx];
      puzzle2[idx] = 0;
      if (solveCount(puzzle2, N, 2) === 1) { filled2--; }
      else { puzzle2[idx] = bk; }
    }
    return { puzzle: puzzle2, solution: solution2, givensCount: filled2 };
  }

  /** 当前盘面下 (r,c) 可合法填入的数字列表（升序） */
  function getCandidates(board, N, r, c) {
    var out = [];
    var v;
    for (v = 1; v <= N; v++) {
      if (cellValid(board, N, r, c, v)) { out.push(v); }
    }
    return out;
  }

  /** 找候选最少的空格（提示用）：返回 { r, c, cands } 或 null（已填满） */
  function findHintCell(board, N) {
    var best = null;
    var bestLen = N * N + 1;
    var r, c;
    for (r = 0; r < N; r++) {
      for (c = 0; c < N; c++) {
        if (board[r * N + c] !== 0) { continue; }
        var cands = getCandidates(board, N, r, c);
        if (cands.length < bestLen) {
          bestLen = cands.length;
          best = { r: r, c: c, cands: cands };
        }
        if (bestLen === 1) { return best; }
      }
    }
    return best;
  }

  window.SUDOKU = {
    boxDims: boxDims,
    cellValid: cellValid,
    fillBoard: fillBoard,
    solveCount: solveCount,
    genPuzzle: genPuzzle,
    getCandidates: getCandidates,
    findHintCell: findHintCell
  };
})();