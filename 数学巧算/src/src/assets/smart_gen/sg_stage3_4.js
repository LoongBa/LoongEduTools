// 数学巧算 · smart_gen 阶段 3+4：族 4-7 方法 × 三档（经典脚本，注册进 SG_REGISTRY）
// 族4 分配律：area_split_mul / distributive_forward / extract_common_factor
// 族5 特殊数：combine_special_num / combine_25_125
// 族6 基准数/商不变：baseline_num / quotient_invariant / complement_sum
// 族7 运算性质：subtraction_property / division_property / multiplication_trick / comprehensive_strategy
(function (global) {
  "use strict";
  var R = global.SG_REGISTRY;
  var T = global.SG_TOOLS;
  var ri = T.ri;

  // ================= 族 4：分配律 =================

  // 分配律面积模型（三年级）：a × (b+c)，b+c 凑整十
  function mkArea(aLow, aHigh, bLow, bHigh) {
    var a = ri(aLow, aHigh);
    var b = ri(bLow, bHigh);
    var c = 10 - b; // b+c=10 凑整
    return {
      type: "area_split_mul",
      text: a + " × (" + b + " + " + c + ") =",
      answer: a * 10,
      hint: "分配：(" + a + "×" + b + ") + (" + a + "×" + c + ") = " + (a * b) + "+" + (a * c),
    };
  }
  R.area_split_mul = {
    gen_basic: function () { return mkArea(2, 5, 1, 9); },
    gen_advance: function () { return mkArea(3, 7, 2, 8); },
    gen_challenge: function () { return mkArea(4, 9, 3, 7); },
  };

  // 分配律正用（四年级）：102×56 → (100+2)×56
  function mkFwd(kind) {
    // kind 0: (100+几)×n；kind 1: (整十−几)×n
    var n = ri(11, 99);
    if (kind === 0) {
      var extra = ri(1, 9);
      var base = 100;
      return {
        type: "distributive_forward",
        text: (base + extra) + " × " + n + " =",
        answer: (base + extra) * n,
        hint: "拆成 " + base + "×" + n + " + " + extra + "×" + n,
      };
    }
    var less = ri(1, 9);
    var base2 = 100;
    return {
      type: "distributive_forward",
      text: (base2 - less) + " × " + n + " =",
      answer: (base2 - less) * n,
      hint: "拆成 " + base2 + "×" + n + " − " + less + "×" + n,
    };
  }
  R.distributive_forward = {
    gen_basic: function () { return mkFwd(0); },
    gen_advance: function () { return mkFwd(1); },
    gen_challenge: function () { return Math.random() < 0.5 ? mkFwd(0) : mkFwd(1); },
  };

  // 提取公因数：a×m + a×n，m+n 凑整
  function mkFactor(aLow, aHigh, sum) {
    var a = ri(aLow, aHigh);
    var m = ri(1, sum - 1);
    var n = sum - m;
    return {
      type: "extract_common_factor",
      text: a + " × " + m + " + " + a + " × " + n + " =",
      answer: a * sum,
      hint: "公因数 " + a + " 提出来：" + a + " × (" + m + " + " + n + ") = " + a + " × " + sum,
    };
  }
  R.extract_common_factor = {
    gen_basic: function () { return mkFactor(2, 9, 10); },
    gen_advance: function () { return mkFactor(3, 12, 100); },
    gen_challenge: function () { return mkFactor(5, 25, 100); },
  };

  // ================= 族 5：特殊数 25/125/11 =================

  // 25 找 4 / 125 找 8（三年级特殊数）
  function mkSpecial(kind) {
    if (kind === 0) {
      var k = ri(1, 9);
      return {
        type: "combine_special_num",
        text: "25 × " + (4 * k) + " =",
        answer: 100 * k,
        hint: "25 找 4：25×4=100，再 ×" + k,
      };
    }
    if (kind === 1) {
      var m = ri(1, 9);
      return {
        type: "combine_special_num",
        text: "125 × " + (8 * m) + " =",
        answer: 1000 * m,
        hint: "125 找 8：125×8=1000，再 ×" + m,
      };
    }
    var x = ri(2, 9);
    var n = x * 10 + 1; // 两位数：x1（如 21）
    return {
      type: "combine_special_num",
      text: n + " × 11 =",
      answer: n * 11,
      hint: "×11 = ×10 + 自己：" + n + "×10 + " + n + " = " + (n * 10) + "+" + n,
    };
  }
  R.combine_special_num = {
    gen_basic: function () { return mkSpecial(0); },
    gen_advance: function () { return mkSpecial(1); },
    gen_challenge: function () { return mkSpecial(2); },
  };

  // 25/125 配对（四年级 32 = 4×8）
  R.combine_25_125 = {
    gen_basic: function () {
      var k = ri(1, 6);
      return {
        type: "combine_25_125",
        text: "25 × " + (4 * k) + " × 125 =",
        answer: 100 * k * 125,
        hint: "32=4×8：25 找 4、125 找 8 → 100 × 1000 = 100000（×" + k + "）",
      };
    },
    gen_advance: function () {
      var a = ri(1, 6);
      return {
        type: "combine_25_125",
        text: "125 × " + (8 * a) + " × 25 =",
        answer: 1000 * a * 25,
        hint: "125 找 8、25 找 4 → 1000 × 100 = 100000（×" + a + "）",
      };
    },
    gen_challenge: function () {
      var b = ri(1, 4);
      return {
        type: "combine_25_125",
        text: "25 × 32 × 125 × " + b + " =",
        answer: 100000 * b,
        hint: "32 = 4×8 → (25×4)×(125×8) = 100×1000 = 100000（×" + b + "）",
      };
    },
  };

  // ================= 族 6：基准数 / 商不变 / 四年级补数 =================

  // 基准数法：N 个数围绕基准 B，答案 = B×N + Σdiff
  function mkBaseline(N, B) {
    var diffs = [];
    var sum = 0;
    for (var i = 0; i < N; i++) {
      var d = ri(-9, 9);
      diffs.push(d);
      sum += d;
    }
    // 打乱顺序
    var nums = diffs.map(function (d) { return B + d; });
    for (var j = nums.length - 1; j > 0; j--) {
      var k = ri(0, j);
      var t = nums[j]; nums[j] = nums[k]; nums[k] = t;
    }
    return {
      type: "baseline_num",
      text: nums.join(" + ") + " =",
      answer: B * N + sum,
      hint: "基准 " + B + " × " + N + " 个，差额 " + (sum >= 0 ? "+" : "") + sum,
    };
  }
  R.baseline_num = {
    gen_basic: function () { return mkBaseline(4, 50); },
    gen_advance: function () { return mkBaseline(5, 100); },
    gen_challenge: function () { return mkBaseline(6, 100); },
  };

  // 商不变：除数 25/125，被除数 = 除数×商×扩倍
  function mkQuotient(kind) {
    var q = ri(2, 9);
    if (kind === 0) {
      return {
        type: "quotient_invariant",
        text: (100 * q) + " ÷ 25 =",
        answer: 4 * q,
        hint: "同乘 4：(" + (100 * q) + "×4)÷(25×4) = " + (400 * q) + "÷100 = " + (4 * q),
      };
    }
    return {
      type: "quotient_invariant",
      text: (1000 * q) + " ÷ 125 =",
      answer: 8 * q,
      hint: "同乘 8：÷1000",
    };
  }
  R.quotient_invariant = {
    gen_basic: function () { return mkQuotient(0); },
    gen_advance: function () { return mkQuotient(1); },
    gen_challenge: function () { return Math.random() < 0.5 ? mkQuotient(0) : mkQuotient(1); },
  };

  // 四年级补数凑整（含两对补数）
  R.complement_sum = {
    gen_basic: function () {
      var B = 100;
      var x1 = ri(11, 39), y1 = B - x1;
      var x2 = ri(11, 39), y2 = B - x2;
      return {
        type: "complement_sum",
        text: x1 + " + " + x2 + " + " + y1 + " + " + y2 + " =",
        answer: 200,
        hint: "(" + x1 + "+" + y1 + ") + (" + x2 + "+" + y2 + ") = 100+100",
      };
    },
    gen_advance: function () {
      var B = 100;
      var x1 = ri(21, 49), y1 = B - x1;
      var s = ri(11, 49);
      return {
        type: "complement_sum",
        text: x1 + " + " + s + " + " + y1 + " =",
        answer: B + s,
        hint: x1 + " 与 " + y1 + " 凑 100",
      };
    },
    gen_challenge: function () {
      var B = 1000;
      var x1 = ri(101, 449), y1 = B - x1;
      var s = ri(51, 99);
      return {
        type: "complement_sum",
        text: x1 + " + " + s + " + " + y1 + " =",
        answer: B + s,
        hint: x1 + " 与 " + y1 + " 凑 1000",
      };
    },
  };

  // ================= 族 7：运算性质（减法/除法性质 + 两位数口诀 + 综合策略） =================

  // 减法性质：a − b − c = a − (b+c)，减数和凑整；或去括号 a − (b+c) = a − b − c
  function mkSubProp(R, bracket) {
    if (bracket) {
      // 去括号：a − (b + c)，其中 a − b 得整百（round）
      var round = [200, 300, 400, 500][ri(0, 3)];
      var a = ri(round + 120, round + 500);
      var b = a - round;               // a − b = round（整百）
      var c = ri(11, 99);
      return {
        type: "subtraction_property",
        text: a + " − (" + b + " + " + c + ") =",
        answer: round - c,
        hint: "去括号变号：" + a + " − " + b + " − " + c + "，" + a + " − " + b + " = " + round + "，再 − " + c + " = " + (round - c),
      };
    }
    var a = ri(R + 50, R + 400);
    var b = ri(11, Math.floor(R / 2) - 1);
    var c = R - b;
    var ans = a - R;
    return {
      type: "subtraction_property",
      text: a + " − " + b + " − " + c + " =",
      answer: ans,
      hint: b + " + " + c + " = " + R + "，" + a + " − " + R + " = " + ans,
    };
  }
  R.subtraction_property = {
    gen_basic: function () { return mkSubProp(100, false); },
    gen_advance: function () { return Math.random() < 0.5 ? mkSubProp(200, false) : mkSubProp(100, true); },
    gen_challenge: function () { return Math.random() < 0.5 ? mkSubProp(500, false) : mkSubProp(300, true); },
  };

  // 除法性质：a ÷ b ÷ c = a ÷ (b×c)（b×c 凑整）；或 a ÷ 25 → ×4、a ÷ 125 → ×8
  var DIV_PAIRS = [[7, 9], [8, 9], [9, 9], [6, 9], [5, 9], [4, 9], [7, 8], [8, 8]]; // 积 63/72/81/54/45/36/56/64
  function mkDivProp(kind) {
    if (kind === 1) {
      // ÷25：同乘 4 变 ÷100
      var q = ri(4, 40);
      return {
        type: "division_property",
        text: (25 * q) + " ÷ 25 =",
        answer: q,
        hint: "同乘 4：" + (25 * q * 4) + " ÷ 100 = " + q,
      };
    }
    if (kind === 2) {
      // ÷125：同乘 8 变 ÷1000
      var q2 = ri(2, 19);
      return {
        type: "division_property",
        text: (125 * q2) + " ÷ 125 =",
        answer: q2,
        hint: "同乘 8：" + (125 * q2 * 8) + " ÷ 1000 = " + q2,
      };
    }
    // 连除：a ÷ b ÷ c = a ÷ (b×c)
    var pair = DIV_PAIRS[ri(0, DIV_PAIRS.length - 1)];
    var b = pair[0], c = pair[1];
    var prod = b * c;
    var q3 = ri(2, 12);
    return {
      type: "division_property",
      text: (prod * q3) + " ÷ " + b + " ÷ " + c + " =",
      answer: q3,
      hint: b + " × " + c + " = " + prod + "，" + (prod * q3) + " ÷ " + prod + " = " + q3,
    };
  }
  R.division_property = {
    gen_basic: function () { return mkDivProp(0); },
    gen_advance: function () { return Math.random() < 0.5 ? mkDivProp(1) : mkDivProp(0); },
    gen_challenge: function () { return Math.random() < 0.5 ? mkDivProp(2) : mkDivProp(1); },
  };

  // 两位数口算诀：头同尾合十 / 尾同头合十
  // 头同尾合十：t×(t+1) 接 u×v（u+v=10）；尾同头合十：(m×n+u) 接 u²（m+n=10）
  function mkMulTrick(kind) {
    if (kind === 0) {
      var t = ri(1, 9), u = ri(1, 9), v = 10 - u;
      var n1 = t * 10 + u, n2 = t * 10 + v;
      var head = t * (t + 1), tail = u * v;
      return {
        type: "multiplication_trick",
        text: n1 + " × " + n2 + " =",
        answer: n1 * n2,
        hint: "头同" + t + "：头×（头+1）=" + head + "，尾×尾=" + tail + " → " + head + " 接 " + tail,
      };
    }
    var u2 = ri(1, 9), m = ri(1, 9), n = 10 - m;
    var a = m * 10 + u2, b2 = n * 10 + u2;
    var head2 = m * n + u2, tail2 = u2 * u2;
    return {
      type: "multiplication_trick",
      text: a + " × " + b2 + " =",
      answer: a * b2,
      hint: "尾同" + u2 + "：头×头+尾=" + head2 + "，尾×尾=" + tail2 + " → " + head2 + " 接 " + tail2,
    };
  }
  R.multiplication_trick = {
    gen_basic: function () { return mkMulTrick(0); },
    gen_advance: function () { return mkMulTrick(0); },
    gen_challenge: function () { return mkMulTrick(1); },
  };

  // 综合策略四步法：随机选一种已学策略（提公因数 / 基准数 / 凑整减 / 特殊数）
  function mkComp(kind) {
    if (kind === 0) {
      // 提公因数：a×m + a×n，m+n 凑整
      var a = ri(2, 25), m = ri(2, 97), n = 100 - m;
      return {
        type: "comprehensive_strategy",
        text: a + " × " + m + " + " + a + " × " + n + " =",
        answer: a * 100,
        hint: "提公因数 " + a + "：(" + m + "+" + n + ") = 100",
      };
    }
    if (kind === 1) {
      // 基准数：4 个数围绕整百
      var B = 100, diffs = [], sum = 0;
      for (var i = 0; i < 4; i++) { var d = ri(-8, 8); diffs.push(d); sum += d; }
      var nums = diffs.map(function (x) { return B + x; });
      return {
        type: "comprehensive_strategy",
        text: nums.join(" + ") + " =",
        answer: 400 + sum,
        hint: "基准 100 × 4 个，差额 " + (sum >= 0 ? "+" : "") + sum,
      };
    }
    if (kind === 2) {
      // 凑整减：a − b，b 接近整百（198 → 200−2）
      var a2 = ri(300, 999);
      var r = ri(1, 9);
      var b2 = 100 * ri(1, 8) - r;
      var ans = a2 - b2;
      return {
        type: "comprehensive_strategy",
        text: a2 + " − " + b2 + " =",
        answer: ans,
        hint: b2 + " 接近 " + (b2 + r) + "：多减 " + r + " 要加回 → " + (a2 - (b2 + r)) + " + " + r,
      };
    }
    // 特殊数：125 × 88（88 = 8×11）
    var k = ri(2, 9);
    return {
      type: "comprehensive_strategy",
      text: "125 × " + (8 * k) + " =",
      answer: 1000 * k,
      hint: (8 * k) + " = 8×" + k + "：125 找 8 → 1000 × " + k,
    };
  }
  R.comprehensive_strategy = {
    gen_basic: function () { return Math.random() < 0.5 ? mkComp(0) : mkComp(1); },
    gen_advance: function () { return Math.random() < 0.5 ? mkComp(2) : mkComp(0); },
    gen_challenge: function () { return Math.random() < 0.5 ? mkComp(3) : mkComp(1); },
  };
})(typeof window !== "undefined" ? window : globalThis);