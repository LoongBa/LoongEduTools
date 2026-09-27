// 数学巧算 · smart_gen 主入口：聚合 SG_REGISTRY → window.SMART_GENERATORS
// 依赖（按序加载）：sg_tools.js → sg_stage1_2.js → sg_stage3_4.js → smart_gen.js
// 接口：list / gen(genName) / validate(q) / normalizeInput(input, answer)
(function (global) {
  "use strict";
  var T = global.SG_TOOLS;
  var R = global.SG_REGISTRY;
  var near = T.near;
  var fracEq = T.fracEq;
  var ri = T.ri;

  // ---------- validate：反推校验（按方法族组织，答案正确 + 结构/难度断言） ----------

  function intParse(text) {
    // 提取形如 "a + b =" / "a - b =" 的整数对
    var m = text.match(/^(-?\d+)\s*([+-])\s*(-?\d+)\s*=\s*□*$/);
    if (!m) return null;
    var a = Number(m[1]), b = Number(m[3]);
    return { a: a, b: b, op: m[2], val: m[2] === "+" ? a + b : a - b };
  }

  function allSum(text) {
    // 提取整串加/减整数（支持 +、-）
    var m = text.match(/^(-?\d+)((?:\s*[+-]\s*-?\d+)+)\s*=\s*□*$/);
    if (!m) return null;
    var nums = [Number(m[1])];
    var rest = m[2];
    var re = /([+-])\s*(-?\d+)/g;
    var hit;
    while ((hit = re.exec(rest))) {
      var n = Number(hit[2]);
      nums.push(hit[1] === "+" ? n : -n);
    }
    return { nums: nums, sum: nums.reduce(function (x, y) { return x + y; }, 0) };
  }

  function mulPair(text) {
    var m = text.match(/^(-?\d+)\s*×\s*(-?\d+)\s*=/);
    if (!m) return null;
    return { a: Number(m[1]), b: Number(m[2]), val: Number(m[1]) * Number(m[2]) };
  }

  function validate(q) {
    if (!q || !q.text || q.answer === undefined || q.answer === null) return false;
    var a = q.answer;
    var t = q.text;
    var matched = true;

    switch (q.type) {
      case "ten_split": {
        // 10 = a + □（或 a+b+□、n=10+□）
        var ms = t.match(/(\d+)\s*=\s*(\d+)(?:\s*\+\s*(\d+))?(?:\s*\+\s*□)?/);
        if (!ms) { matched = false; break; }
        var total = Number(ms[1]);
        var known = Number(ms[2]) + (ms[3] ? Number(ms[3]) : 0);
        if (total - known !== Number(a)) matched = false;
        break;
      }
      case "complement_to_ten":
      case "carry_break":
      case "flat_ten": {
        var p = intParse(t);
        if (!p || !near(p.val, Number(a))) { matched = false; break; }
        if (q.type === "complement_to_ten" && p.op === "+" && p.a + p.b < 11) matched = false; // 必须进位
        if (q.type === "carry_break" && p.op === "-" && (p.a % 10) >= (p.b % 10)) matched = false; // 必须退位
        if (q.type === "flat_ten" && p.op === "-" && (p.a % 10) >= p.b) matched = false; // 平十需退位
        break;
      }
      case "complement_to_whole":
      case "complement_sum":
      case "move_number":
      case "combo": {
        var s = allSum(t);
        if (!s || !near(s.sum, Number(a))) { matched = false; break; }
        // 补数必须存在一对和=B
        if (q.type === "complement_to_whole" || q.type === "complement_sum") {
          var hasPair = false;
          var B = Math.max(...s.nums.map((x) => Math.abs(x))) >= 500 ? 1000 : 100;
          for (var i = 0; i < s.nums.length && !hasPair; i++) {
            for (var j = i + 1; j < s.nums.length; j++) {
              if (s.nums[i] + s.nums[j] === B) { hasPair = true; break; }
            }
          }
          if (!hasPair) matched = false;
        }
        break;
      }
      case "add_to_mul": {
        var mAdd = t.match(/^(-?\d+)(?:\s*\+\s*(-?\d+))+ =$/);
        if (!mAdd) { matched = false; break; }
        var nums = t.split("+").map((x) => Number(x.trim().replace("=", "")));
        var same = nums.every((x) => x === nums[0]);
        if (!same || nums.length < 3) { matched = false; break; }
        if (nums.length * nums[0] !== Number(a)) matched = false;
        break;
      }
      case "area_split_mul": {
        var mArea = t.match(/(-?\d+)\s*×\s*\(\s*(-?\d+)\s*\+\s*(-?\d+)\s*\)\s*=/);
        if (!mArea) { matched = false; break; }
        var av = Number(mArea[1]), bv = Number(mArea[2]), cv = Number(mArea[3]);
        if (bv + cv !== 10) matched = false; // 必须凑整十
        if (av * (bv + cv) !== Number(a)) matched = false;
        break;
      }
      case "distributive_forward": {
        var mF = t.match(/^(-?\d+)\s*×\s*(-?\d+)\s*=/);
        if (!mF) { matched = false; break; }
        var f1 = Number(mF[1]), f2 = Number(mF[2]);
        if (f1 * f2 !== Number(a)) matched = false;
        break;
      }
      case "extract_common_factor": {
        var mE = t.match(/^(-?\d+)\s*×\s*(-?\d+)\s*\+\s*(-?\d+)\s*×\s*(-?\d+)\s*=/);
        if (!mE) { matched = false; break; }
        var f = Number(mE[1]), m1 = Number(mE[2]), f2 = Number(mE[3]), m2 = Number(mE[4]);
        if (f !== f2) { matched = false; break; } // 公因数必须一致
        if (f * m1 + f * m2 !== Number(a)) matched = false;
        break;
      }
      case "combine_special_num": {
        var m11 = t.match(/^(-?\d+)\s*×\s*11\s*=/);
        if (m11) {
          // 两位数 ab × 11 = (a×10+b) × 11 = a×110 + b×11
          var num = Number(m11[1]);
          if (num * 11 !== Number(a)) matched = false;
          break;
        }
        var mp = mulPair(t);
        if (!mp || !near(mp.val, Number(a))) { matched = false; break; }
        var has25 = t.includes("25"), has125 = t.includes("125");
        if (has25 && mp.a % 4 !== 0 && mp.b % 4 !== 0 && !t.includes("× 4")) { matched = false; }
        if (has125 && mp.a % 8 !== 0 && mp.b % 8 !== 0) { matched = false; }
        break;
      }
      case "combine_25_125": {
        // 三因子：25 × M × 125（或 125 × M × 25），M 必须能被 4 整除（25 找 4 即可配成 100）
        var m3 = t.match(/^(25|125)\s*×\s*(-?\d+)\s*×\s*(25|125)(?:\s*×\s*(-?\d+))?\s*=/);
        if (!m3) { matched = false; break; }
        var f1 = Number(m3[1]), mid = Number(m3[2]), f3 = Number(m3[3]), extra = m3[4] ? Number(m3[4]) : 1;
        if (!((f1 === 25 && f3 === 125) || (f1 === 125 && f3 === 25))) { matched = false; break; }
        if (mid % 4 !== 0) { matched = false; break; } // 25 找 4：M 必须含 4 因子
        if (f1 * mid * f3 * extra !== Number(a)) matched = false;
        break;
      }
      case "baseline_num": {
        var s2 = allSum(t);
        if (!s2 || !near(s2.sum, Number(a))) { matched = false; break; }
        // 围绕基准断言：数位跨度 ≤ 18（基准±9），且存在至少一个非整十数
        var min = Math.min.apply(null, s2.nums);
        var max = Math.max.apply(null, s2.nums);
        if (max - min > 18) { matched = false; break; }
        var hasNonTen = s2.nums.some(function (x) { return x % 10 !== 0; });
        if (!hasNonTen) matched = false;
        break;
      }
      case "quotient_invariant": {
        var mQ = t.match(/^(-?\d+)\s*÷\s*(-?\d+)\s*=/);
        if (!mQ) { matched = false; break; }
        var d1 = Number(mQ[1]), d2 = Number(mQ[2]);
        if (d2 !== 25 && d2 !== 125) matched = false;
        if (d1 / d2 !== Number(a)) matched = false;
        break;
      }
      default:
        matched = false;
        break;
    }
    return matched;
  }

  // ---------- gen：完整 gen 名 → type + level → 调注册表 ----------

  var LEVELS = ["basic", "advance", "challenge"];

  function splitGenName(name) {
    for (var i = 0; i < LEVELS.length; i++) {
      var suffix = "_" + LEVELS[i];
      if (name.length > suffix.length && name.slice(-suffix.length) === suffix) {
        return { type: name.slice(0, -suffix.length), level: LEVELS[i] };
      }
    }
    return { type: name, level: "basic" };
  }

  function gen(name) {
    var parts = splitGenName(name);
    var entry = R[parts.type];
    if (!entry) return null;
    var fn = entry["gen_" + parts.level] || entry.gen_basic;
    var q = fn();
    if (!q || !validate(q)) {
      for (var i = 0; i < 5; i++) {
        q = fn();
        if (q && validate(q)) break;
      }
    }
    return q;
  }

  // ---------- normalizeInput：输入与答案等价判定 ----------
  function normalizeInput(input, answer) {
    var a = String(answer).trim();
    var inp = String(input).trim().replace(/\s+/g, "");
    if (inp === a) return true;
    var toNum = function (s) {
      var m = s.match(/^(-?\d+)\/(-?\d+)$/);
      if (m && Number(m[2]) !== 0) return Number(m[1]) / Number(m[2]);
      return Number(s);
    };
    var n1 = toNum(inp), n2 = toNum(a);
    return isFinite(n1) && isFinite(n2) && Math.abs(n1 - n2) < 1e-6;
  }

  global.SMART_GENERATORS = {
    list: (function () {
      var out = [];
      var keys = Object.keys(R);
      for (var i = 0; i < keys.length; i++) {
        for (var j = 0; j < LEVELS.length; j++) out.push(keys[i] + "_" + LEVELS[j]);
      }
      return out;
    })(),
    gen: gen,
    validate: validate,
    normalizeInput: normalizeInput,
    ri: ri,
  };
})(typeof window !== "undefined" ? window : globalThis);