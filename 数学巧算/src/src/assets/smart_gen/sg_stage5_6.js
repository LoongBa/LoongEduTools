// 数学巧算 · smart_gen 阶段 5+6：族 8-9 方法 × 三档（经典脚本，注册进 SG_REGISTRY）
// 族8 小数巧算：decimal_to_int / decimal_complement / expand_shrink / decimal_distributive
// 族9 分数巧算：reduce_before_mul / fraction_distributive / mixed_split / telescoping
// 依赖 sg_tools.js：T.parseDec / T.decMul / T.decStr / T.fracStr / T.parseFrac / T.fracAdd / T.fracSub / T.fracMul / T.fracDiv
(function (global) {
  "use strict";
  var R = global.SG_REGISTRY;
  var T = global.SG_TOOLS;
  var ri = T.ri;
  var fmtDecimal = T.fmtDecimal;
  var decAns = T.decAns;
  var fracAns = T.fracAns;
  var fracStr = T.fracStr;
  var reduceFrac = T.reduceFrac;
  var gcd = T.gcd;
  var parseFrac = T.parseFrac;
  var fracAdd = T.fracAdd;
  var fracSub = T.fracSub;
  var fracMul = T.fracMul;
  var fracDiv = T.fracDiv;

  // ================= 族 8：小数巧算（全程整数×10^k，答案用 fmtDecimal 字符串规范形） =================

  // 化整还原：d × m（d 为 k 位小数），先按整数乘再点回小数点
  // 构造保证：a=整数, k=小数位, m=整数 → 题面 fmtDecimal(a,k) × m，答案 decAns(a*m,k)
  function mkDecToInt(aLow, aHigh, k, mLow, mHigh) {
    var a = ri(aLow, aHigh);
    var m = ri(mLow, mHigh);
    var d = fmtDecimal(a, k);
    return {
      type: "decimal_to_int",
      text: d + " × " + m + " =",
      answer: decAns(a * m, k),
      hint: "化整：" + a + "×" + m + "=" + (a * m) + "，还原" + k + " 位：" + decAns(a * m, k),
    };
  }
  R.decimal_to_int = {
    gen_basic: function () { return mkDecToInt(2, 9, 1, 2, 9); },        // 一位小数×一位数：3.5×2
    gen_advance: function () { return mkDecToInt(11, 49, 2, 2, 9); },    // 两位小数：0.25×4 = 1.00
    gen_challenge: function () { return mkDecToInt(5, 99, 2, 4, 19); },  // 大数两位小数：0.75×16
  };

  // 小数凑整（0.25/1.25/0.125 找伙伴）：0.25×4=1、1.25×8=10、0.125×8=1
  // 题面：a × b × m，其中 a、b 是天生一对，答案 = 配对结果 × m
  function mkDecComp(kind) {
    var m = ri(2, 9);
    if (kind === 0) {
      // 0.25 × m × 4 = m
      return {
        type: "decimal_complement",
        text: "0.25 × " + m + " × 4 =",
        answer: m,
        hint: "0.25 找 4：0.25×4 = 1，再 ×" + m + " = " + m,
      };
    }
    if (kind === 1) {
      // 1.25 × m × 8 = 10×m
      var ans1 = 10 * m;
      return {
        type: "decimal_complement",
        text: "1.25 × " + m + " × 8 =",
        answer: ans1,
        hint: "1.25 找 8：1.25×8 = 10，再 ×" + m + " = " + ans1,
      };
    }
    // 0.125 × m × 8 = m（m 带一位小数）
    var dec = fmtDecimal(m, 1);
    return {
      type: "decimal_complement",
      text: "0.125 × " + dec + " × 8 =",
      answer: dec,
      hint: "0.125 找 8：0.125×8 = 1，再 ×" + dec + " = " + dec,
    };
  }
  R.decimal_complement = {
    gen_basic: function () { return Math.random() < 0.5 ? mkDecComp(0) : mkDecComp(1); },
    gen_advance: function () { return Math.random() < 0.5 ? mkDecComp(2) : mkDecComp(0); },
    gen_challenge: function () {
      // 挑战：0.25 × m × 4，m 带一位小数（0.25×4=1 后剩小数）
      var k = ri(2, 9);
      var dec = fmtDecimal(k, 1);
      return {
        type: "decimal_complement",
        text: "0.25 × " + dec + " × 4 =",
        answer: dec,
        hint: "0.25 找 4 = 1，1×" + dec + " = " + dec,
      };
    },
  };

  // 扩倍缩倍（商不变）：a ÷ b，b ∈ {0.25, 0.5, 0.125, 1.25, 0.7...} → 同乘 4/8/10 化整
  // 构造保证：答案 q 整数，被除数 = 除数 × q（用整数运算）
  function mkExpand(dKind) {
    var q = ri(2, 9);
    if (dKind === 0) {
      // ÷0.25：同乘 4 → 整数
      var dividend = fmtDecimal(q * 25, 2); // q*25/100
      return {
        type: "expand_shrink",
        text: dividend + " ÷ 0.25 =",
        answer: q,
        hint: "同乘 4：(" + dividend + "×4) ÷ (0.25×4) = " + fmtDecimal(q * 100, 2) + " ÷ 1 = " + q,
      };
    }
    if (dKind === 1) {
      // ÷1.25：同乘 8 → ÷10
      var dividend2 = fmtDecimal(q * 125, 2);
      return {
        type: "expand_shrink",
        text: dividend2 + " ÷ 1.25 =",
        answer: q,
        hint: "同乘 8：(" + dividend2 + "×8) ÷ (1.25×8) = " + fmtDecimal(q * 1000, 2) + " ÷ 10 = " + q,
      };
    }
    // ÷0.125：同乘 8 → 整数
    var dividend3 = fmtDecimal(q * 125, 3);
    return {
      type: "expand_shrink",
      text: dividend3 + " ÷ 0.125 =",
      answer: q,
      hint: "同乘 8：(" + dividend3 + "×8) ÷ (0.125×8) = " + fmtDecimal(q * 1000, 3) + " ÷ 1 = " + q,
    };
  }
  R.expand_shrink = {
    gen_basic: function () { return mkExpand(0); },
    gen_advance: function () { return Math.random() < 0.5 ? mkExpand(1) : mkExpand(0); },
    gen_challenge: function () { return Math.random() < 0.5 ? mkExpand(2) : mkExpand(1); },
  };

  // 小数分配律：a × (b ± c) 拆整（9.9 → 10−0.1；99 → 100−1；1.01 → 1+0.01）
  function mkDecDist(kind) {
    if (kind === 0) {
      // 正用：d × 9.9（d 一位小数）→ d×(10−0.1)
      var dInt = ri(2, 9);
      var d = fmtDecimal(dInt, 1);
      var ans = decAns(dInt * 99, 2); // dInt/10 × 99/10 = dInt*99/100
      return {
        type: "decimal_distributive",
        text: d + " × 9.9 =",
        answer: ans,
        hint: "9.9 = 10−0.1：" + d + "×10 − " + d + "×0.1 = " + decAns(dInt * 10, 1) + " − " + decAns(dInt, 2) + " = " + ans,
      };
    }
    if (kind === 1) {
      // 逆用提取公因数：d×99 + d = d×(99+1) = d×100
      var dInt2 = ri(11, 99);
      var d2 = fmtDecimal(dInt2, 2);
      var ans2 = dInt2;
      return {
        type: "decimal_distributive",
        text: d2 + " × 99 + " + d2 + " =",
        answer: ans2,
        hint: "提公因数 " + d2 + "：×(99+1) = ×100 → " + d2 + "×100 = " + ans2,
      };
    }
    // 挑战：d × 1.01（d 一位小数）→ d×(1+0.01)
    var dInt3 = ri(2, 9);
    var d3 = fmtDecimal(dInt3, 1);
    var ans3 = decAns(dInt3 * 101, 3); // dInt3/10 × 101/100 = dInt3*101/1000
    return {
      type: "decimal_distributive",
      text: d3 + " × 1.01 =",
      answer: ans3,
      hint: "1.01 = 1+0.01：" + d3 + "×1 + " + d3 + "×0.01 = " + d3 + " + " + decAns(dInt3, 3) + " = " + ans3,
    };
  }
  R.decimal_distributive = {
    gen_basic: function () { return mkDecDist(0); },
    gen_advance: function () { return Math.random() < 0.5 ? mkDecDist(1) : mkDecDist(0); },
    gen_challenge: function () { return Math.random() < 0.5 ? mkDecDist(2) : mkDecDist(1); },
  };

  // ================= 族 9：分数巧算（Fraction 精确类，答案 "p/q" 字符串） =================

  // 乘前先约分：(p/q) × (r/s)，分子分母交叉可约
  // 构造保证：答案 n/d（已约分），交叉因子 g1、g2 → p=g1, q=g2, r=n×g2, s=d×g1
  //   题面 = (g1/g2) × (n×g2 / d×g1)，p 与 s 约 g1、r 与 q 约 g2 → 剩 n/d
  //   内容示例 (3/4)×(8/9)：n=2, d=3, g1=3, g2=4 → (3/4)×(8/9) ✓ 完全匹配
  function mkReduce(low, high) {
    var n = ri(low, high), d = ri(low, high);
    var g = gcd(n, d);
    if (g > 1) { n = n / g; d = d / g; } // 保证 n/d 已约分
    var g1 = ri(2, high), g2 = ri(2, high);
    var p = g1, q = g2, r = n * g2, s = d * g1;
    return {
      type: "reduce_before_mul",
      text: "(" + p + "/" + q + ") × (" + r + "/" + s + ") =",
      answer: fracAns(n, d),
      hint: "交叉约分：" + p + " 与 " + s + " 约 " + g1 + "、" + r + " 与 " + q + " 约 " + g2 + " → " + fracStr([n, d]),
    };
  }
  R.reduce_before_mul = {
    gen_basic: function () { return mkReduce(2, 4); },
    gen_advance: function () { return mkReduce(2, 6); },
    gen_challenge: function () { return mkReduce(3, 9); },
  };

  // 分数分配律：(a/b ± c/d) × m，m 是 b、d 的公倍数（约分式相乘）
  // 构造保证：选 b,d,m，使 m 是 lcm(b,d) 的倍数 → a×m/b、c×m/d 均为整数
  function lcm(a, b) { return (a * b) / gcd(a, b); }
  function mkFracDist(kind) {
    if (kind === 0) {
      // 正用：(1/b + 1/d) × m，m = lcm(b,d)
      var b = ri(2, 5), d = ri(2, 5);
      var m = lcm(b, d) * ri(1, 2);
      var ans = m / b + m / d;
      return {
        type: "fraction_distributive",
        text: "(1/" + b + " + 1/" + d + ") × " + m + " =",
        answer: ans,
        hint: "分配：" + m + "/" + b + " + " + m + "/" + d + " = " + (m / b) + " + " + (m / d) + " = " + ans,
      };
    }
    if (kind === 1) {
      // 正用带分数：(a/b + c/d) × m
      var b2 = ri(2, 6), d2 = ri(2, 6);
      var a = ri(1, b2 - 1), c = ri(1, d2 - 1);
      var m2 = lcm(b2, d2) * ri(1, 2);
      var ans2 = a * m2 / b2 + c * m2 / d2;
      return {
        type: "fraction_distributive",
        text: "(" + a + "/" + b2 + " + " + c + "/" + d2 + ") × " + m2 + " =",
        answer: ans2,
        hint: "分配：" + a + "×" + m2 + "/" + b2 + " + " + c + "×" + m2 + "/" + d2 + " = " + (a * m2 / b2) + " + " + (c * m2 / d2) + " = " + ans2,
      };
    }
    // 逆用提取公因数：(a/b) × m + (c/b) × m = (a+c)/b × m，a+c=b → 答案 = m
    var b3 = ri(2, 9);
    var a3 = ri(1, b3 - 1), c3 = b3 - a3;
    var m3 = b3 * ri(1, 3);
    var ans3 = m3;
    return {
      type: "fraction_distributive",
      text: "(" + a3 + "/" + b3 + ") × " + m3 + " + (" + c3 + "/" + b3 + ") × " + m3 + " =",
      answer: ans3,
      hint: "提公因数 " + m3 + "：(" + a3 + "/" + b3 + " + " + c3 + "/" + b3 + ") × " + m3 + " = 1 × " + m3 + " = " + ans3,
    };
  }
  R.fraction_distributive = {
    gen_basic: function () { return mkFracDist(0); },
    gen_advance: function () { return Math.random() < 0.5 ? mkFracDist(1) : mkFracDist(0); },
    gen_challenge: function () { return Math.random() < 0.5 ? mkFracDist(2) : mkFracDist(1); },
  };

  // 带分数拆分：m(n/d) × e = (m + n/d) × e = m×e + n×e/d
  // 构造保证：e 是 d 的倍数 → n×e/d 为整数
  function mkMixed(low, high) {
    var m = ri(low, high);          // 整数部分
    var d = ri(2, 9);               // 分母
    var n = ri(1, d - 1);           // 分子（真分数）
    var k = ri(1, 3);               // 倍数
    var e = d * k;
    var ans = m * e + n * k;        // (m + n/d)×e = m×e + n×k
    return {
      type: "mixed_split",
      text: m + "(" + n + "/" + d + ") × " + e + " =",
      answer: ans,
      hint: m + "(" + n + "/" + d + ") = " + m + "+" + n + "/" + d + "：" + m + "×" + e + " + (" + n + "/" + d + ")×" + e + " = " + (m * e) + " + " + (n * k) + " = " + ans,
    };
  }
  R.mixed_split = {
    gen_basic: function () { return mkMixed(2, 4); },
    gen_advance: function () { return mkMixed(3, 6); },
    gen_challenge: function () { return mkMixed(5, 9); },
  };

  // 裂项相消：1/[n(n+1)] = 1/n − 1/(n+1)；连加 k≤4 项
  // 构造保证：首 n，项数 c，题面为从 n 到 n+c−1 的 1/(i(i+1))，答案 = 1/n − 1/(n+c)
  function mkTelescope(low, high) {
    var start = ri(low, high);
    var count = ri(2, 4);
    var terms = [];
    for (var i = start; i < start + count; i++) {
      terms.push("1/" + (i * (i + 1)));
    }
    // 裂项和：1/n − 1/(n+c) = c / (n(n+c))
    var n = start, c = count;
    var ansNum = c, ansDen = n * (n + c);
    var g = gcd(ansNum, ansDen);
    var ans = fracAns(ansNum / g, ansDen / g);
    var hint = terms.map(function (t, idx) { return "1/" + (start + idx) + "−1/" + (start + idx + 1); }).join(" + ");
    return {
      type: "telescoping",
      text: terms.join(" + ") + " =",
      answer: ans,
      hint: "裂项：" + hint + "，中间抵消 → " + ans,
    };
  }
  R.telescoping = {
    gen_basic: function () { return mkTelescope(1, 2); },
    gen_advance: function () { return mkTelescope(1, 4); },
    gen_challenge: function () { return mkTelescope(3, 6); },
  };
})(typeof window !== "undefined" ? window : globalThis);
