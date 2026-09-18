/* ============================================================
   24点 — 出题引擎（纯函数，无 DOM，可独立单测）
   ------------------------------------------------------------
   暴露 window.Game24：
   - solve(nums)            → 全部解文本数组（全括号化，字符串去重）
   - generate(diff, excludeKeys)
                            → { cards: 升序, solutions: 全部解, hint: 最简解, key: 规范键 }
   - classify(diff, nums)   → 是否匹配该难度的出题约束（单测用）
   - bracketDepth(expr) / pickSimplest(sols)（单测/辅助用）
   设计约束：
   - ES2017 经典脚本，无 import/export / eval / new Function
   - 运算符字符：+ - × ÷（- 为 ASCII 连字符）
   - 中间态允许分数；最终 |val-24| < 1e-6 判命中
   - 难度出题约束见 docs/工具文档/学科/24点-设计文档.md §2.3
   ============================================================ */
(function () {
  'use strict';

  /* 二元运算 6 种（a⊕b 与 b⊕a；除数为 0 时返回 NaN 表示非法）。
     swap=true 表示值按 (b op a) 计算，表达式需相应写成 (b.expr op a.expr)。 */
  var OPS = [
    { sym: '+', swap: false, fn: function (a, b) { return a + b; } },
    { sym: '-', swap: false, fn: function (a, b) { return a - b; } },
    { sym: '-', swap: true,  fn: function (a, b) { return b - a; } },
    { sym: '×', swap: false, fn: function (a, b) { return a * b; } },
    { sym: '÷', swap: false, fn: function (a, b) { return b !== 0 ? a / b : NaN; } },
    { sym: '÷', swap: true,  fn: function (a, b) { return a !== 0 ? b / a : NaN; } }
  ];

  var TOL = 1e-6;

  /* 各难度牌面取值范围（设计文档 §2.3） */
  var RANGES = { easy: 9, normal: 10, hard: 13 };

  /* 各难度出题约束（设计文档 §2.3，任务定义见上） */
  var EASY_MAX_DEPTH = 2;    // 入门：无 ÷ 解且深度 ≤2（防嵌套过深）
  var NORMAL_MAX_DEPTH = 2;  // 进阶：无纯 +- 解且最简解深度 ≤2

  function is24(v) { return Math.abs(v - 24) < TOL; }
  function isIntNear(v) { return Math.abs(v - Math.round(v)) < 1e-9; }

  /* 括号嵌套最大深度 */
  function bracketDepth(expr) {
    var max = 0, cur = 0, i, ch;
    for (i = 0; i < expr.length; i++) {
      ch = expr.charAt(i);
      if (ch === '(') { cur += 1; if (cur > max) { max = cur; } }
      else if (ch === ')') { cur -= 1; }
    }
    return max;
  }

  /* 纯 +- 解：不含 × ÷ */
  function isPure(expr) {
    return expr.indexOf('×') === -1 && expr.indexOf('÷') === -1;
  }

  function divCount(expr) {
    var n = 0, i;
    for (i = 0; i < expr.length; i++) {
      if (expr.charAt(i) === '÷') { n += 1; }
    }
    return n;
  }

  function mulCount(expr) {
    var n = 0, i;
    for (i = 0; i < expr.length; i++) {
      if (expr.charAt(i) === '×') { n += 1; }
    }
    return n;
  }

  /* 最简解：4 数恒为 3 次运算，按 ÷ 少 → 深度浅 → × 少 → 无分数 依次偏好。
     括号嵌套是难度维度（设计文档 §2.3），故深度优先于 × 数量。 */
  function pickSimplest(sols) {
    var best = null, i;
    for (i = 0; i < sols.length; i++) {
      var s = sols[i];
      if (!best) { best = s; continue; }
      var d1 = divCount(s.expr), d0 = divCount(best.expr);
      if (d1 < d0) { best = s; continue; }
      if (d1 > d0) { continue; }
      var dep1 = bracketDepth(s.expr), dep0 = bracketDepth(best.expr);
      if (dep1 < dep0) { best = s; continue; }
      if (dep1 > dep0) { continue; }
      var m1 = mulCount(s.expr), m0 = mulCount(best.expr);
      if (m1 < m0) { best = s; continue; }
      if (m1 > m0) { continue; }
      if (best.hasFrac && !s.hasFrac) { best = s; }
    }
    return best;
  }

  /* ---------- 求解：递归归并（设计文档 §3.1） ---------- */
  function solveItems(nums) {
    var items = [], i;
    for (i = 0; i < nums.length; i++) {
      items.push({ val: nums[i], expr: String(nums[i]), hasFrac: false });
    }
    var out = [];
    var seen = {};
    merge(items, out, seen);
    return out;
  }

  function merge(items, out, seen) {
    var n = items.length;
    if (n === 1) {
      var it = items[0];
      if (is24(it.val) && !seen[it.expr]) {
        seen[it.expr] = true;
        out.push({ expr: it.expr, hasFrac: it.hasFrac });
      }
      return;
    }
    var i, j, k, o;
    for (i = 0; i < n; i++) {
      for (j = i + 1; j < n; j++) {
        var rest = [];
        for (k = 0; k < n; k++) {
          if (k !== i && k !== j) { rest.push(items[k]); }
        }
        for (o = 0; o < OPS.length; o++) {
          var op = OPS[o];
          var val = op.fn(items[i].val, items[j].val);
          if (isNaN(val)) { continue; } /* 除零非法 */
          var leftExpr = items[i].expr, rightExpr = items[j].expr;
          if (op.swap) { leftExpr = items[j].expr; rightExpr = items[i].expr; }
          var frac = items[i].hasFrac || items[j].hasFrac || !isIntNear(val);
          var merged = rest.concat([{
            val: val,
            expr: '(' + leftExpr + op.sym + rightExpr + ')',
            hasFrac: frac
          }]);
          merge(merged, out, seen);
        }
      }
    }
  }

  /* ---------- 难度归类 ---------- */
  function matchesDiff(diff, sols) {
    if (!sols || !sols.length) { return false; }
    var simplest = pickSimplest(sols);
    var sd = bracketDepth(simplest.expr);
    var i;

    if (diff === 'easy') {
      /* 存在不含 ÷ 的解，且深度 ≤2 */
      for (i = 0; i < sols.length; i++) {
        if (sols[i].expr.indexOf('÷') === -1 &&
            bracketDepth(sols[i].expr) <= EASY_MAX_DEPTH) {
          return true;
        }
      }
      return false;
    }

    if (diff === 'normal') {
      /* 无纯 +- 解（必须涉及 × 或 ÷），且最简解深度 ≤2 */
      for (i = 0; i < sols.length; i++) {
        if (isPure(sols[i].expr)) { return false; }
      }
      return sd <= NORMAL_MAX_DEPTH;
    }

    /* hard：最简解含 ÷ 且（深度 ≥3 或 存在分数中间态） */
    if (simplest.expr.indexOf('÷') === -1) { return false; }
    return sd >= 3 || simplest.hasFrac;
  }

  /* ---------- 出题 ---------- */
  function drawCards(max) {
    var cards = [], i;
    for (i = 0; i < 4; i++) {
      cards.push(1 + Math.floor(Math.random() * max));
    }
    return cards;
  }

  function keyOf(cards) {
    var sorted = cards.slice().sort(function (a, b) { return a - b; });
    return sorted.join(',');
  }

  function buildResult(cards, sols) {
    var sorted = cards.slice().sort(function (a, b) { return a - b; });
    var exprList = [], i;
    for (i = 0; i < sols.length; i++) { exprList.push(sols[i].expr); }
    return {
      cards: sorted,
      solutions: exprList,
      hint: pickSimplest(sols).expr,
      key: keyOf(cards)
    };
  }

  /* 出题：优先难度匹配（≤200 次，含单局去重），
     放宽 1：难度匹配但忽略排除键；放宽 2：可解即出（设计文档 §3.2） */
  function generate(diff, excludeKeys) {
    var max = RANGES[diff] || 9;
    var excl = excludeKeys || [];
    var cards, key, sols, i;

    for (i = 0; i < 200; i++) {
      cards = drawCards(max);
      key = keyOf(cards);
      if (excl.indexOf(key) !== -1) { continue; }
      sols = solveItems(cards);
      if (matchesDiff(diff, sols)) { return buildResult(cards, sols); }
    }
    /* 放宽 1：难度匹配，忽略排除键（保难度 + 保成功率） */
    for (i = 0; i < 200; i++) {
      cards = drawCards(max);
      sols = solveItems(cards);
      if (matchesDiff(diff, sols)) { return buildResult(cards, sols); }
    }
    /* 放宽 2：可解即出（设计文档 §3.2 兜底） */
    for (i = 0; i < 200; i++) {
      cards = drawCards(max);
      key = keyOf(cards);
      if (excl.indexOf(key) !== -1) { continue; }
      sols = solveItems(cards);
      if (sols.length) { return buildResult(cards, sols); }
    }
    /* 极端兜底：忽略排除键 + 可解即出 */
    for (i = 0; i < 500; i++) {
      cards = drawCards(max);
      sols = solveItems(cards);
      if (sols.length) { return buildResult(cards, sols); }
    }
    return null; /* 理论不可达 */
  }

  /* ---------- 对外接口 ---------- */
  window.Game24 = {
    solve: function (nums) {
      var sols = solveItems(nums);
      var out = [], i;
      for (i = 0; i < sols.length; i++) { out.push(sols[i].expr); }
      return out;
    },
    generate: generate,
    classify: function (diff, nums) {
      return matchesDiff(diff, solveItems(nums));
    },
    bracketDepth: bracketDepth,
    pickSimplest: pickSimplest,
    isSolvable: function (nums) {
      return solveItems(nums).length > 0;
    }
  };
})();
