/* ============================================================
   数学口算 — 知识点出题生成器（ES2017 经典脚本，Chrome 61）
   ------------------------------------------------------------
   每个知识点一个生成器：随机出题 + 反推校验。
   反推校验（Oracle P0 要求）：生成后用数学运算反向验算答案，
   校验失败则重新生成 —— 保证离线产物不出错题。
   设计约束：
   - 不使用 import/export / type="module"
   - 不超出 ES2017（无 ?. ?? 对象展开等）
   - 无 Math.random 之外的平台依赖（可离线、可测试）
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 工具 ---------- */
  function ri(min, max) {
    // [min, max] 闭区间随机整数
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
      var t = a % b;
      a = b;
      b = t;
    }
    return a || 1;
  }

  /* 分数约分 → [分子, 分母] */
  function reduceFrac(n, d) {
    var g = gcd(n, d);
    return [n / g, d / g];
  }

  /* 确保结果是整数（除法校验）*/
  function ensureDivisible(max, divisor) {
    var q = ri(1, Math.floor(max / divisor));
    return q * divisor;
  }

  /* ---------- 生成器注册表 ---------- */
  /* 每个条目：{ gen: 生成函数, max: 数量级参考 } */

  var GENERATORS = {

    /* ===== 一年级 ===== */
    g1_10addsub: {
      gen: function () {
        var op = ri(0, 1);
        var a = ri(1, 9), b = ri(1, 9);
        if (op === 0) {
          return { type: 'g1_10addsub', text: a + ' + ' + b + ' =', answer: a + b };
        }
        if (a < b) { var t = a; a = b; b = t; }
        return { type: 'g1_10addsub', text: a + ' - ' + b + ' =', answer: a - b };
      }
    },
    g1_20add: {
      gen: function () {
        // 20 以内进位加法：和 11-18，两数 1-9
        var a = ri(2, 9);
        var b = ri(11 - a, 9);
        return { type: 'g1_20add', text: a + ' + ' + b + ' =', answer: a + b };
      }
    },
    g1_20sub: {
      gen: function () {
        // 20 以内退位减法：被减数 11-18，减数 2-9，需退位
        var a = ri(11, 18);
        var b = ri(a - 9, a - 1);
        if (b < 2) { b = 2; }
        return { type: 'g1_20sub', text: a + ' - ' + b + ' =', answer: a - b };
      }
    },
    g1_100: {
      gen: function () {
        // 整十数加减：20-90 整十
        var op = ri(0, 1);
        var a = ri(2, 9) * 10;
        var b = ri(1, 9) * 10;
        if (op === 0) {
          return { type: 'g1_100', text: a + ' + ' + b + ' =', answer: a + b };
        }
        if (a < b) { var t = a; a = b; b = t; }
        return { type: 'g1_100', text: a + ' - ' + b + ' =', answer: a - b };
      }
    },

    /* ===== 二年级 ===== */
    g2_mult: {
      gen: function () {
        var a = ri(2, 9), b = ri(2, 9);
        return { type: 'g2_mult', text: a + ' × ' + b + ' =', answer: a * b };
      }
    },
    g2_div: {
      gen: function () {
        var a = ri(2, 9), b = ri(2, 9);
        var p = a * b;
        return { type: 'g2_div', text: p + ' ÷ ' + a + ' =', answer: b };
      }
    },
    g2_100: {
      gen: function () {
        // 100 以内加减（含进位/退位）
        var op = ri(0, 1);
        if (op === 0) {
          var a = ri(11, 89), b = ri(11, 99 - a);
          return { type: 'g2_100', text: a + ' + ' + b + ' =', answer: a + b };
        }
        var m = ri(21, 99), n = ri(11, m - 1);
        return { type: 'g2_100', text: m + ' - ' + n + ' =', answer: m - n };
      }
    },
    g2_mixed: {
      gen: function () {
        // 混合：先乘除后加减，带小括号
        var kind = ri(0, 2);
        if (kind === 0) {
          var a = ri(2, 9), b = ri(2, 9), c = ri(1, 20);
          return { type: 'g2_mixed', text: a + ' × ' + b + ' + ' + c + ' =', answer: a * b + c };
        }
        if (kind === 1) {
          var d = ri(2, 9), e = ri(2, 9), f = ri(1, 20);
          var p = d * e;
          if (p <= f) { return GENERATORS.g2_mixed.gen(); }
          return { type: 'g2_mixed', text: p + ' ÷ ' + d + ' + ' + f + ' =', answer: e + f };
        }
        var g = ri(2, 9), h = ri(2, 9), i = ri(1, 9);
        // (a+b)×c 或 a×(b+c)
        if (ri(0, 1) === 0) {
          return { type: 'g2_mixed', text: '(' + g + ' + ' + h + ') × ' + i + ' =', answer: (g + h) * i };
        }
        return { type: 'g2_mixed', text: g + ' × (' + h + ' + ' + i + ') =', answer: g * (h + i) };
      }
    },

    /* ===== 三年级 ===== */
    g3_wan: {
      gen: function () {
        // 几百几十加减几百几十
        var op = ri(0, 1);
        var a = ri(2, 9) * 100 + ri(0, 9) * 10;
        if (op === 0) {
          var b = ri(1, 9) * 100 + ri(0, 9) * 10;
          var sum = a + b;
          if (sum > 9999) { return GENERATORS.g3_wan.gen(); }
          return { type: 'g3_wan', text: a + ' + ' + b + ' =', answer: sum };
        }
        var m = a, n = ri(1, 9) * 100 + ri(0, 9) * 10;
        if (n >= m) { n = m - 10; }
        if (n < 100) { return GENERATORS.g3_wan.gen(); }
        return { type: 'g3_wan', text: m + ' - ' + n + ' =', answer: m - n };
      }
    },
    g3_mult1: {
      gen: function () {
        // 整十整百×一位数
        var a = ri(1, 9);
        var kind = ri(0, 1);
        var b = kind === 0 ? a * 10 : a * 100;
        var c = ri(2, 9);
        return { type: 'g3_mult1', text: b + ' × ' + c + ' =', answer: b * c };
      }
    },
    g3_mult2: {
      gen: function () {
        // 两位数×两位数（口算子集：整十数×两位数）
        var a = ri(1, 9) * 10;
        var b = ri(11, 99);
        return { type: 'g3_mult2', text: a + ' × ' + b + ' =', answer: a * b };
      }
    },
    g3_div1: {
      gen: function () {
        // 一位数除法（整除）
        var d = ri(2, 9);
        var q = ri(11, 99);
        return { type: 'g3_div1', text: (d * q) + ' ÷ ' + d + ' =', answer: q };
      }
    },
    g3_frac: {
      gen: function () {
        // 同分母分数加减（结果最简；结果为整数时输出数字）
        var d = ri(2, 9);
        var kind = ri(0, 1);
        if (kind === 0) {
          var a = ri(1, d - 1), b = ri(1, d - a);
          var s = a + b;
          var r = reduceFrac(s, d);
          var ans = r[0] === r[1] ? String(r[0] / r[1]) : r[0] + '/' + r[1];
          return { type: 'g3_frac', text: a + '/' + d + ' + ' + b + '/' + d + ' =', answer: ans };
        }
        var m = ri(2, d);
        var n = ri(1, m - 1);
        var diff = m - n;
        var r2 = reduceFrac(diff, d);
        var ans2 = r2[0] === r2[1] ? String(r2[0] / r2[1]) : r2[0] + '/' + r2[1];
        return { type: 'g3_frac', text: m + '/' + d + ' - ' + n + '/' + d + ' =', answer: ans2 };
      }
    },

    /* ===== 四年级 ===== */
    g4_big: {
      gen: function () {
        // 大数改写：以万/亿作单位（只出整万/整亿数，答案精确整数，单位在题面）
        // 注：非整万数（如 87173570=?万 → 8717.357万）键盘无法输入小数答案，
        //     且"省略尾数"语义需四舍五入；故限定整万/整亿，保证答案唯一可输入。
        var kind = ri(0, 1);
        if (kind === 0) {
          var w = ri(1, 9999);
          var num = w * 10000;
          return { type: 'g4_big', text: num + ' = ? 万', answer: w };
        }
        var yi = ri(1, 999);
        return { type: 'g4_big', text: yi + '00000000 = ? 亿', answer: yi };
      }
    },
    g4_simple: {
      gen: function () {
        // 运算定律简便计算（凑整）
        var kind = ri(0, 2);
        if (kind === 0) {
          var a = ri(2, 9), b = ri(2, 9);
          return { type: 'g4_simple', text: a + ' × 25 × 4 =', answer: a * 100 };
        }
        if (kind === 1) {
          var c = ri(2, 9);
          return { type: 'g4_simple', text: c + ' × 125 × 8 =', answer: c * 1000 };
        }
        var d = ri(1, 99), e = ri(1, 99), f = ri(1, 99);
        return { type: 'g4_simple', text: d + ' + ' + e + ' + ' + f + ' =', answer: d + e + f };
      }
    },
    g4_div2: {
      gen: function () {
        // 整十数÷整十数
        var d = ri(1, 9) * 10;
        var q = ri(2, 9);
        return { type: 'g4_div2', text: (d * q) + ' ÷ ' + d + ' =', answer: q };
      }
    },
    g4_dec: {
      gen: function () {
        // 一位小数加减
        var op = ri(0, 1);
        var a = ri(11, 99), b = ri(1, 99);
        if (op === 0) {
          var sum = a + b;
          if (sum > 999) { return GENERATORS.g4_dec.gen(); }
          return { type: 'g4_dec', text: (a / 10) + ' + ' + (b / 10) + ' =',
                   answer: (sum / 10) };
        }
        if (a < b) { var t = a; a = b; b = t; }
        return { type: 'g4_dec', text: (a / 10) + ' - ' + (b / 10) + ' =',
                 answer: ((a - b) / 10) };
      }
    },

    /* ===== 五年级 ===== */
    g5_decmul: {
      gen: function () {
        // 小数×整数/小数×小数（口算：结果一位或两位小数）
        var kind = ri(0, 1);
        if (kind === 0) {
          var a = ri(11, 99), b = ri(2, 9);
          return { type: 'g5_decmul', text: (a / 10) + ' × ' + b + ' =',
                   answer: Math.round((a / 10) * b * 10) / 10 };
        }
        var c = ri(11, 99), d = ri(11, 99);
        return { type: 'g5_decmul', text: (c / 10) + ' × ' + (d / 10) + ' =',
                 answer: Math.round((c / 10) * (d / 10) * 100) / 100 };
      }
    },
    g5_decdiv: {
      gen: function () {
        // 小数÷整数（口算整除）
        var q = ri(11, 99);
        var d = ri(2, 9);
        return { type: 'g5_decdiv', text: (q * d / 10) + ' ÷ ' + d + ' =',
                 answer: q / 10 };
      }
    },
    g5_frac1: {
      gen: function () {
        // 约分/分数小数互化
        var kind = ri(0, 1);
        if (kind === 0) {
          var n = ri(2, 12), d = ri(2, 12);
          var r = reduceFrac(n, d);
          if (r[0] === r[1]) { return GENERATORS.g5_frac1.gen(); }
          if (r[0] === 1 && r[1] === 1) { return GENERATORS.g5_frac1.gen(); }
          return { type: 'g5_frac1', text: n + '/' + d + ' 约分 =', answer: r[0] + '/' + r[1] };
        }
        // 简单分数 ↔ 小数：分母 2,4,5,8,10
        var pool = [2, 4, 5, 8, 10];
        var dd = pool[ri(0, pool.length - 1)];
        var nn = ri(1, dd - 1);
        if (nn / dd >= 1) { return GENERATORS.g5_frac1.gen(); }
        var dec = Math.round(nn / dd * 1000) / 1000;
        return { type: 'g5_frac1', text: nn + '/' + dd + ' = ? 小数', answer: dec };
      }
    },
    g5_frac2: {
      gen: function () {
        // 异分母分数加减（通分，结果最简；整数结果输出数字）
        var d1 = ri(2, 6), d2 = ri(2, 6);
        if (d1 === d2) { return GENERATORS.g5_frac2.gen(); }
        var n1 = ri(1, d1 - 1), n2 = ri(1, d2 - 1);
        var op = ri(0, 1);
        if (op === 0) {
          var s = n1 * d2 + n2 * d1;
          var sd = d1 * d2;
          var r = reduceFrac(s, sd);
          if (r[0] >= r[1]) { return GENERATORS.g5_frac2.gen(); }
          var ans = r[0] === r[1] ? String(r[0] / r[1]) : r[0] + '/' + r[1];
          return { type: 'g5_frac2', text: n1 + '/' + d1 + ' + ' + n2 + '/' + d2 + ' =',
                   answer: ans };
        }
        var diff = n1 * d2 - n2 * d1;
        if (diff <= 0) { return GENERATORS.g5_frac2.gen(); }
        var r2 = reduceFrac(diff, d1 * d2);
        var ans2 = r2[0] === r2[1] ? String(r2[0] / r2[1]) : r2[0] + '/' + r2[1];
        return { type: 'g5_frac2', text: n1 + '/' + d1 + ' - ' + n2 + '/' + d2 + ' =',
                 answer: ans2 };
      }
    },

    /* ===== 六年级 ===== */
    g6_fracmul: {
      gen: function () {
        // 分数×分数（约分后；整数结果输出数字）
        var n1 = ri(1, 6), d1 = ri(2, 7), n2 = ri(1, 6), d2 = ri(2, 7);
        var r = reduceFrac(n1 * n2, d1 * d2);
        var ans = r[0] === r[1] ? String(r[0] / r[1]) : r[0] + '/' + r[1];
        return { type: 'g6_fracmul', text: n1 + '/' + d1 + ' × ' + n2 + '/' + d2 + ' =',
                 answer: ans };
      }
    },
    g6_fracdiv: {
      gen: function () {
        // 分数÷分数（乘倒数）
        var n1 = ri(1, 6), d1 = ri(2, 7), n2 = ri(1, 6), d2 = ri(2, 7);
        var r = reduceFrac(n1 * d2, d1 * n2);
        var ans = r[0] === r[1] ? String(r[0] / r[1]) : r[0] + '/' + r[1];
        return { type: 'g6_fracdiv', text: n1 + '/' + d1 + ' ÷ ' + n2 + '/' + d2 + ' =',
                 answer: ans };
      }
    },
    g6_pct: {
      gen: function () {
        // 百分数互化
        var kind = ri(0, 2);
        if (kind === 0) {
          var pool = [1, 2, 4, 5, 8, 10, 20, 25, 50, 75];
          var p = pool[ri(0, pool.length - 1)];
          return { type: 'g6_pct', text: p + '% = ? 分数', answer: reduceFrac(p, 100).join('/') };
        }
        if (kind === 1) {
          var pp = ri(1, 99);
          return { type: 'g6_pct', text: pp + '% = ? 小数', answer: pp / 100 };
        }
        var dec = ri(11, 99) / 100;
        // 答案纯数字（百分数值），% 已含在题面
        return { type: 'g6_pct', text: dec + ' = ? %', answer: dec * 100 };
      }
    },
    g6_ratio: {
      gen: function () {
        // 化简比（分数答案）/ 求比值（整数答案）
        var kind = ri(0, 1);
        var a = ri(2, 12), b = ri(2, 12);
        if (kind === 0) {
          var r = reduceFrac(a, b);
          // 化简比 → 分数形式（键盘可输入），如 6:4 化简 = 3/2；整数结果输出数字
          var ans = r[0] === r[1] ? String(r[0] / r[1]) : r[0] + '/' + r[1];
          return { type: 'g6_ratio', text: a + ':' + b + ' 化简 = ?', answer: ans };
        }
        // 求比值：保证 a 是 b 的倍数（答案整数可输入）
        var q2 = ri(2, 6), d2 = ri(2, 12);
        var p = q2 * d2;
        return { type: 'g6_ratio', text: p + ':' + d2 + ' 比值 =', answer: q2 };
      }
    }
  };

  /* ---------- 反推校验（Oracle P0 要求） ---------- */
  /* 生成后用数学运算反向验算答案，校验失败则重新生成。
     仅做校验，不改变 gen() 出题逻辑。
     所有类型均从题面 text 解析数字与运算符、重算并与 q.answer 等价比较。 */

  /* 数值等价比较（容差 1e-6，与 main.js checkAnswer 一致） */
  function near(x, y) {
    return Math.abs(x - y) < 1e-6;
  }

  /* 分数等价比较：answer（"p/q" 字符串 / 整数串 / 数字）与 n/d 约分后是否等价。
     answer 为 "p/q" 时额外校验已约分（gcd == 1）。 */
  function fracEq(ans, n, d) {
    var r = reduceFrac(n, d);
    if (typeof ans === 'number') {
      if (!isFinite(ans)) return false;
      return near(ans, r[0] / r[1]);
    }
    if (typeof ans !== 'string') return false;
    var fm = ans.match(/^(-?\d+)\/(-?\d+)$/);
    if (fm) {
      var fn = Number(fm[1]), fd = Number(fm[2]);
      if (fd === 0) return false;
      if (gcd(fn, fd) !== 1) return false; // 答案必须已约分
      var ra = reduceFrac(fn, fd);
      return ra[0] === r[0] && ra[1] === r[1];
    }
    if (ans.match(/^-?\d+$/)) {
      // 整数结果（如 "3/3" 约分 → "1"）：约分后分母必须为 1
      return r[1] === 1 && Number(ans) === r[0];
    }
    return false;
  }

  function validate(q) {
    if (!q || !q.text || q.answer === undefined || q.answer === null) return false;
    var a = q.answer;
    var t = q.text;
    // 通用：答案必须是非空字符串或数字
    if (a === '' || a === false) return false;

    var matched = true;
    switch (q.type) {

      /* === 整数加减：a + b = / a - b = === */
      case 'g1_10addsub':
      case 'g1_20add':
      case 'g1_20sub':
      case 'g1_100':
      case 'g2_100':
      case 'g3_wan': {
        var iPair = t.match(/(-?\d+)\s*([+-])\s*(-?\d+)\s*=/);
        if (!iPair) { matched = false; break; }
        var iVal = iPair[2] === '+'
          ? Number(iPair[1]) + Number(iPair[3])
          : Number(iPair[1]) - Number(iPair[3]);
        if (typeof a !== 'number' || a !== Math.floor(a) || !near(iVal, a)) {
          matched = false;
        }
        break;
      }

      /* === 整数乘法：a × b = === */
      case 'g2_mult':
      case 'g3_mult1':
      case 'g3_mult2': {
        var mulPair = t.match(/(-?\d+)\s*×\s*(-?\d+)\s*=/);
        if (!mulPair) { matched = false; break; }
        var mulVal = Number(mulPair[1]) * Number(mulPair[2]);
        if (typeof a !== 'number' || a !== Math.floor(a) || !near(mulVal, a)) {
          matched = false;
        }
        break;
      }

      /* === 整除：被除数 ÷ 除数 = 答案 === */
      case 'g2_div':
      case 'g3_div1':
      case 'g4_div2': {
        if (typeof a !== 'number' || a !== Math.floor(a)) { matched = false; break; }
        var divParts = t.replace(/\s/g, '').split(/[÷=]/);
        // 例: "24÷6=" → divParts = ["24", "6", ""]
        if (divParts.length >= 2) {
          var dividend = Number(divParts[0]);
          var divisor = Number(divParts[1]);
          if (!isFinite(dividend) || !isFinite(divisor) || divisor === 0 ||
              !near(dividend / divisor, a)) {
            matched = false;
          }
        }
        break;
      }

      /* === 混合运算：a × b + c / p ÷ d + f / (g + h) × i / g × (h + i) === */
      case 'g2_mixed': {
        var mxVal;
        var paren1 = t.match(/[\(（]\s*(-?\d+)\s*\+\s*(-?\d+)\s*[\)）]\s*×\s*(-?\d+)\s*=/);
        var paren2 = t.match(/(-?\d+)\s*×\s*[\(（]\s*(-?\d+)\s*\+\s*(-?\d+)\s*[\)）]\s*=/);
        if (paren1) {
          mxVal = (Number(paren1[1]) + Number(paren1[2])) * Number(paren1[3]);
        } else if (paren2) {
          mxVal = Number(paren2[1]) * (Number(paren2[2]) + Number(paren2[3]));
        } else {
          var divAdd = t.match(/(-?\d+)\s*÷\s*(-?\d+)\s*\+\s*(-?\d+)\s*=/);
          if (divAdd && Number(divAdd[2]) !== 0) {
            mxVal = Number(divAdd[1]) / Number(divAdd[2]) + Number(divAdd[3]);
          } else {
            var mulAdd = t.match(/(-?\d+)\s*×\s*(-?\d+)\s*\+\s*(-?\d+)\s*=/);
            if (!mulAdd) { matched = false; break; }
            mxVal = Number(mulAdd[1]) * Number(mulAdd[2]) + Number(mulAdd[3]);
          }
        }
        if (typeof a !== 'number' || a !== Math.floor(a) || !near(mxVal, a)) {
          matched = false;
        }
        break;
      }

      /* === 大数改写：整万/整亿，答案精确整数 === */
      case 'g4_big': {
        if (typeof a !== 'number' || a !== Math.floor(a)) { matched = false; break; }
        var eqIdx = t.indexOf('=');
        var qIdx = t.indexOf('?');
        if (eqIdx < 0 || qIdx < 0) { matched = false; break; }
        var numVal = Number(t.substring(0, eqIdx).replace(/[\s,]/g, ''));
        var unit = t.substring(qIdx + 1).replace(/\s/g, '');
        if (!isFinite(numVal)) { matched = false; break; }
        if (unit === '万') {
          // 题面必须是整万数，答案 = 万位数值（精确相等，不允许截断/四舍五入）
          if (numVal % 10000 !== 0 || numVal / 10000 !== a) { matched = false; }
        } else if (unit === '亿') {
          if (numVal % 100000000 !== 0 || numVal / 100000000 !== a) { matched = false; }
        } else {
          matched = false;
        }
        break;
      }

      /* === 简便计算：a × 25 × 4 / c × 125 × 8 / d + e + f === */
      case 'g4_simple': {
        var spVal;
        if (t.indexOf('+') >= 0) {
          var add3 = t.match(/(-?\d+)\s*\+\s*(-?\d+)\s*\+\s*(-?\d+)\s*=/);
          if (!add3) { matched = false; break; }
          spVal = Number(add3[1]) + Number(add3[2]) + Number(add3[3]);
        } else {
          var mul3 = t.match(/(-?\d+)\s*×\s*(-?\d+)\s*×\s*(-?\d+)\s*=/);
          if (!mul3) { matched = false; break; }
          spVal = Number(mul3[1]) * Number(mul3[2]) * Number(mul3[3]);
        }
        if (typeof a !== 'number' || a !== Math.floor(a) || !near(spVal, a)) {
          matched = false;
        }
        break;
      }

      /* === 一位小数加减 === */
      case 'g4_dec': {
        var decPair = t.match(/(-?\d+(?:\.\d+)?)\s*([+-])\s*(-?\d+(?:\.\d+)?)\s*=/);
        if (!decPair) { matched = false; break; }
        var decVal = decPair[2] === '+'
          ? Number(decPair[1]) + Number(decPair[3])
          : Number(decPair[1]) - Number(decPair[3]);
        if (typeof a !== 'number' || !near(decVal, a)) { matched = false; }
        break;
      }

      /* === 小数×整数 / 小数×小数 === */
      case 'g5_decmul': {
        var dmPair = t.match(/(-?\d+(?:\.\d+)?)\s*×\s*(-?\d+(?:\.\d+)?)\s*=/);
        if (!dmPair) { matched = false; break; }
        var dmVal = Number(dmPair[1]) * Number(dmPair[2]);
        if (typeof a !== 'number' || !near(dmVal, a)) { matched = false; }
        break;
      }

      /* === 小数÷整数 === */
      case 'g5_decdiv': {
        var ddPair = t.match(/(-?\d+(?:\.\d+)?)\s*÷\s*(-?\d+(?:\.\d+)?)\s*=/);
        if (!ddPair) { matched = false; break; }
        var ddDiv = Number(ddPair[2]);
        if (ddDiv === 0) { matched = false; break; }
        if (typeof a !== 'number' || !near(Number(ddPair[1]) / ddDiv, a)) {
          matched = false;
        }
        break;
      }

      /* === 分数加减（含通分） === */
      case 'g3_frac':
      case 'g5_frac2': {
        var abPair = t.match(/(-?\d+)\s*\/\s*(-?\d+)\s*([+-])\s*(-?\d+)\s*\/\s*(-?\d+)\s*=/);
        if (!abPair) { matched = false; break; }
        var n1 = Number(abPair[1]), d1 = Number(abPair[2]);
        var n2 = Number(abPair[4]), d2 = Number(abPair[5]);
        if (d1 === 0 || d2 === 0) { matched = false; break; }
        var fDen = d1 * d2;
        var fNum = abPair[3] === '+' ? n1 * d2 + n2 * d1 : n1 * d2 - n2 * d1;
        if (!fracEq(a, fNum, fDen)) { matched = false; }
        break;
      }

      /* === 约分 / 分数化小数 === */
      case 'g5_frac1': {
        if (t.indexOf('约分') >= 0) {
          var redPair = t.match(/(-?\d+)\s*\/\s*(-?\d+)\s*约分/);
          if (!redPair) { matched = false; break; }
          var redDen = Number(redPair[2]);
          if (redDen === 0) { matched = false; break; }
          if (!fracEq(a, Number(redPair[1]), redDen)) { matched = false; }
        } else {
          var fdecPair = t.match(/(-?\d+)\s*\/\s*(-?\d+)\s*=\s*\?\s*小数/);
          if (!fdecPair) { matched = false; break; }
          var fdecDen = Number(fdecPair[2]);
          if (fdecDen === 0) { matched = false; break; }
          if (typeof a !== 'number' || !near(Number(fdecPair[1]) / fdecDen, a)) {
            matched = false;
          }
        }
        break;
      }

      /* === 分数×分数 === */
      case 'g6_fracmul': {
        var fmPair = t.match(/(-?\d+)\s*\/\s*(-?\d+)\s*×\s*(-?\d+)\s*\/\s*(-?\d+)\s*=/);
        if (!fmPair) { matched = false; break; }
        var na = Number(fmPair[1]), da = Number(fmPair[2]);
        var nb = Number(fmPair[3]), db = Number(fmPair[4]);
        if (da === 0 || db === 0) { matched = false; break; }
        if (!fracEq(a, na * nb, da * db)) { matched = false; }
        break;
      }

      /* === 分数÷分数（乘倒数） === */
      case 'g6_fracdiv': {
        var fdPair = t.match(/(-?\d+)\s*\/\s*(-?\d+)\s*÷\s*(-?\d+)\s*\/\s*(-?\d+)\s*=/);
        if (!fdPair) { matched = false; break; }
        var aa = Number(fdPair[1]), ba = Number(fdPair[2]);
        var ab = Number(fdPair[3]), bb = Number(fdPair[4]);
        if (ba === 0 || ab === 0) { matched = false; break; }
        if (!fracEq(a, aa * bb, ba * ab)) { matched = false; }
        break;
      }

      /* === 百分数互化 === */
      case 'g6_pct': {
        var pctMatch;
        if (t.indexOf('分数') >= 0) {
          pctMatch = t.match(/(-?\d+)\s*%\s*=\s*\?\s*分数/);
          if (!pctMatch) { matched = false; break; }
          if (!fracEq(a, Number(pctMatch[1]), 100)) { matched = false; }
        } else if (t.indexOf('小数') >= 0) {
          pctMatch = t.match(/(-?\d+)\s*%\s*=\s*\?\s*小数/);
          if (!pctMatch) { matched = false; break; }
          if (typeof a !== 'number' || !near(Number(pctMatch[1]) / 100, a)) {
            matched = false;
          }
        } else {
          pctMatch = t.match(/(-?\d+(?:\.\d+)?)\s*=\s*\?\s*%/);
          if (!pctMatch) { matched = false; break; }
          if (typeof a !== 'number' || !near(Number(pctMatch[1]) * 100, a)) {
            matched = false;
          }
        }
        break;
      }

      /* === 化简比 / 求比值 === */
      case 'g6_ratio': {
        var ratioMatch;
        if (t.indexOf('化简') >= 0) {
          ratioMatch = t.match(/(-?\d+)\s*:\s*(-?\d+)\s*化简/);
          if (!ratioMatch) { matched = false; break; }
          var rDen = Number(ratioMatch[2]);
          if (rDen === 0) { matched = false; break; }
          if (!fracEq(a, Number(ratioMatch[1]), rDen)) { matched = false; }
        } else {
          ratioMatch = t.match(/(-?\d+)\s*:\s*(-?\d+)\s*比值/);
          if (!ratioMatch) { matched = false; break; }
          var bDen = Number(ratioMatch[2]);
          if (bDen === 0) { matched = false; break; }
          if (typeof a !== 'number' || !near(Number(ratioMatch[1]) / bDen, a)) {
            matched = false;
          }
        }
        break;
      }

      default:
        matched = false;
        break;
    }
    return matched;
  }

  /* ---------- 对外接口 ---------- */
  window.KOU_GENERATORS = {
    list: Object.keys(GENERATORS),
    gen: function (type) {
      if (!GENERATORS[type]) { return null; }
      var q = GENERATORS[type].gen();
      if (!q || !validate(q)) {
        // 生成失败/校验失败 → 重试
        for (var i = 0; i < 5; i++) {
          q = GENERATORS[type].gen();
          if (q && validate(q)) { break; }
        }
      }
      return q;
    },
    validate: validate
  };
})();
