// 数学巧算 · smart_gen 阶段 1+2：族 1-3 方法 × 三档（经典脚本，注册进 SG_REGISTRY）
// 族1 凑十破十平十：ten_split / complement_to_ten / carry_break / flat_ten
// 族2 补数凑整/搬家/连加转乘：complement_to_whole / move_number / add_to_mul / combo
(function (global) {
  "use strict";
  var R = global.SG_REGISTRY;
  var T = global.SG_TOOLS;
  var ri = T.ri;

  // ================= 族 1：凑十破十平十 =================

  // 10 的分与合：10 = a + (10-a)，a∈[1,9]
  R.ten_split = {
    gen_basic: function () {
      var a = ri(1, 9);
      return { type: "ten_split", text: "10 = " + a + " + □", answer: 10 - a };
    },
    gen_advance: function () {
      // 三连分解：10 = a + b + c（a+b+c=10，逐项填空）
      var a = ri(1, 7), b = ri(1, 8 - a);
      return { type: "ten_split", text: "10 = " + a + " + " + b + " + □", answer: 10 - a - b };
    },
    gen_challenge: function () {
      // 十几 = 10 + 几：13 = 10 + □
      var n = ri(11, 19);
      return { type: "ten_split", text: n + " = 10 + □", answer: n - 10 };
    },
  };

  // 凑十法：a + b，必进位（a+b∈[11,18]），b 拆成 (10-a)+余数
  function mkCompose(low, high) {
    var a = ri(low, high);
    var b = ri(11 - a, 9); // 保证进位
    var comp = 10 - a;
    var rest = b - comp;
    return {
      type: "complement_to_ten",
      text: a + " + " + b + " =",
      answer: a + b,
      hint: "看大数 " + a + "，凑 " + comp + "，拆 " + b + " 成 " + comp + "+" + rest + "，先算 " + a + "+" + comp + "=10",
    };
  }
  R.complement_to_ten = {
    gen_basic: function () { return mkCompose(2, 9); },
    gen_advance: function () { return mkCompose(4, 9); },
    gen_challenge: function () { return mkCompose(6, 9); },
  };

  // 破十法：a - b，必退位（a∈[11,18], b∈[2,9], b>a%10）
  function mkBreak(low, high) {
    var a = ri(low, high);
    var unit = a % 10;
    var b = ri(unit + 1, Math.min(9, a - 1));
    return {
      type: "carry_break",
      text: a + " - " + b + " =",
      answer: a - b,
      hint: "破十：" + a + " = 10+" + unit + "，先算 10-" + b + "=" + (10 - b) + "，再加 " + unit + "=" + (a - b),
    };
  }
  R.carry_break = {
    gen_basic: function () { return mkBreak(11, 14); },
    gen_advance: function () { return mkBreak(12, 16); },
    gen_challenge: function () { return mkBreak(13, 18); },
  };

  // 平十法：a - b，b 拆成 个位 + 余（先平到整十再减）
  function mkFlat(low, high) {
    var a = ri(low, high);
    var unit = a % 10;
    var b = ri(unit + 1, Math.min(9, a - 1)); // 必退位
    var first = unit;
    var rest = b - first;
    return {
      type: "flat_ten",
      text: a + " - " + b + " =",
      answer: a - b,
      hint: "平十：" + a + " - " + first + "=" + (a - first) + "（整十），再 - " + rest + "=" + (a - b),
    };
  }
  R.flat_ten = {
    gen_basic: function () { return mkFlat(11, 13); },
    gen_advance: function () { return mkFlat(12, 15); },
    gen_challenge: function () { return mkFlat(13, 18); },
  };

  // ================= 族 2：补数凑整 / 搬家 / 连加转乘 / 综合 =================

  // 补数凑整：两对补数和=100 + 散数
  function mkWhole(B) {
    var x1 = ri(11, Math.floor(B * 0.5) - 1);
    var y1 = B - x1;
    var s = ri(10, 50);
    // 打乱：x1 + s + y1
    return {
      type: "complement_to_whole",
      text: x1 + " + " + s + " + " + y1 + " =",
      answer: B + s,
      hint: x1 + " 和 " + y1 + " 互为补数，先加 = " + B,
    };
  }
  R.complement_to_whole = {
    gen_basic: function () { return mkWhole(100); },
    gen_advance: function () { return mkWhole(100); },
    gen_challenge: function () { return mkWhole(1000); },
  };

  // 带符号搬家：a + b - c（先算 a - c 或 a + b）
  R.move_number = {
    gen_basic: function () {
      var a = ri(21, 99), c = ri(11, a - 1), b = ri(1, 40);
      return { type: "move_number", text: a + " + " + b + " - " + c + " =", answer: a - c + b, hint: "先算 " + a + " - " + c + "=" + (a - c) + "，再 + " + b };
    },
    gen_advance: function () {
      var a = ri(51, 99), c = ri(21, a - 1), b = ri(1, 60);
      return { type: "move_number", text: a + " - " + c + " + " + b + " =", answer: a - c + b, hint: "先把能凑整的放一起" };
    },
    gen_challenge: function () {
      var a = ri(101, 199), c = ri(51, a - 1), b = ri(21, 80);
      return { type: "move_number", text: a + " - " + c + " + " + b + " =", answer: a - c + b };
    },
  };

  // 同数连加转乘法：a+a+...a（n 次）→ a×n
  function mkRepeated(nLow, nHigh, aLow, aHigh) {
    var n = ri(nLow, nHigh);
    var a = ri(aLow, aHigh);
    var terms = [];
    for (var i = 0; i < n; i++) terms.push(String(a));
    return {
      type: "add_to_mul",
      text: terms.join(" + ") + " =",
      answer: a * n,
      hint: n + " 个 " + a + " 连加 = " + a + " × " + n,
    };
  }
  R.add_to_mul = {
    gen_basic: function () { return mkRepeated(3, 5, 2, 9); },
    gen_advance: function () { return mkRepeated(4, 6, 5, 12); },
    gen_challenge: function () { return mkRepeated(5, 9, 9, 15); },
  };

  // 综合巧算（阶段2）：混合加减凑整
  R.combo = {
    gen_basic: function () {
      var x = ri(11, 49), y = ri(11, 49);
      var s = ri(5, 30);
      return { type: "combo", text: x + " + " + y + " + " + s + " =", answer: x + y + s };
    },
    gen_advance: function () {
      var x = ri(21, 79), y = ri(21, 79);
      var c = ri(11, Math.min(x + y - 1, 60));
      return { type: "combo", text: x + " + " + y + " - " + c + " =", answer: x + y - c };
    },
    gen_challenge: function () {
      // 两对补数 + 散数（百位）
      var B = 100;
      var x1 = ri(21, 49), y1 = B - x1;
      var s = ri(11, 30);
      return { type: "combo", text: x1 + " + " + s + " + " + y1 + " =", answer: B + s };
    },
  };
})(typeof window !== "undefined" ? window : globalThis);