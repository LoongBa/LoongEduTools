#!/usr/bin/env node
/* 数独思维 v1.34 P2⑧：生成器性能防回归断言（node 直接加载 solver.js）
 * 用法：node tests/perf_sudoku_gen.js
 * 断言：9×9 genPuzzle(9,33) 均值 < 500ms、单轮 < 2000ms（防严重退化）；
 *       4×4 / 6×6 均值 < 100ms。
 * 背景：README 声称 9×9 生成 ~5ms（早期快照），此脚本设宽松上限
 *       只防「数量级退化」（挖洞唯一解回溯失控），非精确基准。
 */
'use strict';
var fs = require('fs');
var path = require('path');

var src = path.join(__dirname, '..', 'src', 'assets', 'solver.js');
var code = fs.readFileSync(src, 'utf8');
var sandbox = { window: {} };
new Function('window', code)(sandbox.window);
var S = sandbox.window.SUDOKU;
if (!S) { console.error('FAIL: solver.js 未挂载 window.SUDOKU'); process.exit(1); }

function bench(N, givens, rounds) {
  var times = [];
  for (var i = 0; i < rounds; i++) {
    var t0 = process.hrtime.bigint();
    var g = S.genPuzzle(N, givens);
    var dt = Number(process.hrtime.bigint() - t0) / 1e6;
    times.push(dt);
    if (!g || !g.solution || g.solution.length !== N * N) {
      console.error('FAIL: genPuzzle(' + N + ',' + givens + ') 产出非法');
      process.exit(1);
    }
  }
  times.sort(function (a, b) { return a - b; });
  return {
    mean: times.reduce(function (a, b) { return a + b; }, 0) / times.length,
    max: times[times.length - 1]
  };
}

var fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log('  [PASS] ' + name); }
  else { console.log('  [FAIL] ' + name + '  ' + extra); fail++; }
}

// 预热一轮（JIT 编译后再计时）
S.genPuzzle(9, 33);

var r9 = bench(9, 33, 10);
check('9×9 genPuzzle(9,33) 均值 < 500ms', r9.mean < 500, 'mean=' + r9.mean.toFixed(1) + 'ms');
check('9×9 单轮 < 2000ms（严重退化防线）', r9.max < 2000, 'max=' + r9.max.toFixed(1) + 'ms');

var r6 = bench(6, 21, 20);
check('6×6 genPuzzle(6,21) 均值 < 100ms', r6.mean < 100, 'mean=' + r6.mean.toFixed(1) + 'ms');

var r4 = bench(4, 10, 20);
check('4×4 genPuzzle(4,10) 均值 < 100ms', r4.mean < 100, 'mean=' + r4.mean.toFixed(1) + 'ms');

console.log('\nperf: 9×9 mean=' + r9.mean.toFixed(1) + 'ms max=' + r9.max.toFixed(1) +
            ' | 6×6 mean=' + r6.mean.toFixed(1) + 'ms | 4×4 mean=' + r4.mean.toFixed(1) + 'ms');
if (fail) {
  console.log('RESULT: ' + fail + ' FAILED');
  process.exit(1);
}
console.log('RESULT: ALL PASS');
