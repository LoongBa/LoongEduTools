// 数学巧算 · smart_gen 阶段 3+4：族 4-6 方法 × 三档（经典脚本，注册进 SG_REGISTRY）
// 族4 分配律：area_split_mul / distributive_forward / extract_common_factor
// 族5 特殊数：combine_special_num / combine_25_125
// 族6 基准数/商不变：baseline_num / quotient_invariant / complement_sum
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
})(typeof window !== "undefined" ? window : globalThis);