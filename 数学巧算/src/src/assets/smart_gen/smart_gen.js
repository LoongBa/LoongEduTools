// 数学巧算 · smart_gen 主入口：聚合 SG_REGISTRY → window.SMART_GENERATORS
// 依赖（按序加载）：sg_tools.js → sg_stage1_2.js → sg_stage3_4.js → sg_stage5_6.js → sg_stageX.js → smart_gen.js
// 接口：list / gen(genName) / validate(q) / normalizeInput(input, answer)
(function (global) {
  "use strict";
  var T = global.SG_TOOLS;
  var R = global.SG_REGISTRY;
  var near = T.near;
  var fracEq = T.fracEq;
  var ri = T.ri;
  var parseFrac = T.parseFrac;
  var fracAdd = T.fracAdd;
  var fracSub = T.fracSub;
  var fracMul = T.fracMul;
  var fracDiv = T.fracDiv;
  var fracEq2 = T.fracEq2;
  var gcd = T.gcd;
  var parseDec = T.parseDec;
  var reduceFrac = T.reduceFrac;

  // ---------- 受限算术求值器（无 eval）：整数/小数/分数 +−×÷() → [n,d] ----------
  // 供 validate 反推校验 comprehensive_strategy 等多形状题型
  function numToFrac(tok) {
    if (tok.indexOf("/") > 0) return parseFrac(tok);
    var d = parseDec(tok);
    if (!d) return null;
    return reduceFrac(d.intVal, Math.pow(10, d.k));
  }
  function evalExpr(text) {
    var s = String(text).replace(/=/g, "").replace(/\s+/g, "");
    if (!s) return null;
    // 词法：小数/分数/整数 + 运算符
    var toks = [];
    var re = /(\d+\.\d+|\d+\/\d+|\d+|[+−×÷()])/g;
    var m;
    while ((m = re.exec(s))) toks.push(m[1]);
    if (!toks.length) return null;
    // 中缀转后缀（Shunting-yard，×÷ 优先）
    var out = [], ops = [];
    var prec = { "+": 1, "−": 1, "×": 2, "÷": 2 };
    var ok = true;
    for (var i = 0; i < toks.length; i++) {
      var tk = toks[i];
      if (/^\d/.test(tk)) { out.push(numToFrac(tk)); if (!out[out.length - 1]) { ok = false; break; } }
      else if (tk === "(") ops.push(tk);
      else if (tk === ")") {
        while (ops.length && ops[ops.length - 1] !== "(") out.push(ops.pop());
        if (!ops.length) { ok = false; break; }
        ops.pop();
      } else if (prec[tk] !== undefined) {
        while (ops.length && ops[ops.length - 1] !== "(" && prec[ops[ops.length - 1]] >= prec[tk]) out.push(ops.pop());
        ops.push(tk);
      } else { ok = false; break; }
    }
    if (!ok) return null;
    while (ops.length) { var o = ops.pop(); if (o === "(" || o === ")") { ok = false; break; } out.push(o); }
    if (!ok) return null;
    // 后缀求值
    var st = [];
    for (var j = 0; j < out.length; j++) {
      var v = out[j];
      if (typeof v === "object") { st.push(v); continue; }
      var b = st.pop(), a = st.pop();
      if (a === undefined || b === undefined) return null;
      var r = null;
      if (v === "+") r = fracAdd(a, b);
      else if (v === "−") r = fracSub(a, b);
      else if (v === "×") r = fracMul(a, b);
      else if (v === "÷") { if (b[0] === 0) return null; r = fracDiv(a, b); }
      if (!r) return null;
      st.push(r);
    }
    return st.length === 1 ? st[0] : null;
  }

  // 答案与 [n,d] 分数等价（answer 可为 number / "p/q" / "2.4" 等）
  function ansEq(ans, n, d) {
    var f = parseFrac(ans);
    if (!f) return false;
    var r = reduceFrac(n, d);
    return f[0] === r[0] && f[1] === r[1];
  }

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
      case "subtraction_property": {
        // 直接式 a − b − c（b+c 凑整）或括号式 a − (b + c)（a−b 凑整）
        var mSub = t.match(/^(-?\d+)\s*−\s*\(\s*(-?\d+)\s*\+\s*(-?\d+)\s*\)\s*=/);
        if (mSub) {
          var sA = Number(mSub[1]), sB = Number(mSub[2]), sC = Number(mSub[3]);
          if (sA - sB - sC !== Number(a)) matched = false;
          else if ((sA - sB) % 100 !== 0) matched = false; // 去括号后 a−b 须整百
          break;
        }
        var mSub2 = t.match(/^(-?\d+)\s*−\s*(-?\d+)\s*−\s*(-?\d+)\s*=/);
        if (!mSub2) { matched = false; break; }
        var xA = Number(mSub2[1]), xB = Number(mSub2[2]), xC = Number(mSub2[3]);
        if (xA - xB - xC !== Number(a)) matched = false;
        else if ((xB + xC) % 100 !== 0) matched = false; // 减数和须整百
        break;
      }
      case "division_property": {
        // a ÷ b ÷ c（b×c 凑整）或 a ÷ 25 / a ÷ 125（商不变）
        var mDiv = t.match(/^(-?\d+)\s*÷\s*(-?\d+)\s*(?:÷\s*(-?\d+))?\s*=/);
        if (!mDiv) { matched = false; break; }
        var qA = Number(mDiv[1]), qB = Number(mDiv[2]);
        if (mDiv[3]) {
          var qC = Number(mDiv[3]);
          var prod = qB * qC;
          if (prod % 9 !== 0 && prod % 8 !== 0) matched = false; // 凑整断言
          if (qA / prod !== Number(a)) matched = false;
        } else {
          if (qB !== 25 && qB !== 125) matched = false;
          if (qA / qB !== Number(a)) matched = false;
        }
        break;
      }
      case "multiplication_trick": {
        var mTrick = t.match(/^(-?\d+)\s*×\s*(-?\d+)\s*=/);
        if (!mTrick) { matched = false; break; }
        var t1 = Number(mTrick[1]), t2 = Number(mTrick[2]);
        if (t1 * t2 !== Number(a)) matched = false;
        else {
          var tens1 = Math.floor(t1 / 10), tens2 = Math.floor(t2 / 10);
          var unit1 = t1 % 10, unit2 = t2 % 10;
          var headSame = tens1 === tens2 && unit1 + unit2 === 10; // 头同尾合十
          var tailSame = unit1 === unit2 && tens1 + tens2 === 10; // 尾同头合十
          if (!headSame && !tailSame) matched = false;
        }
        break;
      }
      case "comprehensive_strategy": {
        var eComp = evalExpr(t);
        if (!eComp || !ansEq(a, eComp[0], eComp[1])) matched = false;
        break;
      }
      case "decimal_to_int": {
        var mDec = t.match(/^(-?\d+(?:\.\d+)?)\s*×\s*(-?\d+)\s*=/);
        if (!mDec) { matched = false; break; }
        var dDec = parseDec(mDec[1]);
        if (!dDec) { matched = false; break; }
        var prodInt = dDec.intVal * Number(mDec[2]);
        var ansStr = T.fmtDecimal(prodInt, dDec.k);
        if (!ansEq(a, prodInt, Math.pow(10, dDec.k))) matched = false;
        break;
      }
      case "decimal_complement": {
        // 0.25×m×4 / 1.25×m×8 / 0.125×m×8（配对断言：任意两因子为天生一对）
        var mDC = t.match(/^(-?\d+(?:\.\d+)?)\s*×\s*(-?\d+(?:\.\d+)?)\s*×\s*(-?\d+(?:\.\d+)?)\s*=/);
        if (!mDC) { matched = false; break; }
        var fs = [parseDec(mDC[1]), parseDec(mDC[2]), parseDec(mDC[3])];
        if (!fs[0] || !fs[1] || !fs[2]) { matched = false; break; }
        var hasPair = false;
        for (var iP = 0; iP < 3 && !hasPair; iP++) {
          for (var jP = iP + 1; jP < 3 && !hasPair; jP++) {
            var va = fs[iP].intVal / Math.pow(10, fs[iP].k);
            var vb = fs[jP].intVal / Math.pow(10, fs[jP].k);
            hasPair =
              (near(va, 0.25) && near(vb, 4)) || (near(va, 4) && near(vb, 0.25)) ||
              (near(va, 1.25) && near(vb, 8)) || (near(va, 8) && near(vb, 1.25)) ||
              (near(va, 0.125) && near(vb, 8)) || (near(va, 8) && near(vb, 0.125));
          }
        }
        if (!hasPair) { matched = false; break; }
        var prodInt = fs[0].intVal * fs[1].intVal * fs[2].intVal;
        var prodK = fs[0].k + fs[1].k + fs[2].k;
        if (!ansEq(a, prodInt, Math.pow(10, prodK))) matched = false;
        break;
      }
      case "expand_shrink": {
        var mES = t.match(/^(-?\d+(?:\.\d+)?)\s*÷\s*(-?\d+(?:\.\d+)?)\s*=/);
        if (!mES) { matched = false; break; }
        var n1 = parseDec(mES[1]), n2 = parseDec(mES[2]);
        if (!n1 || !n2 || n2.intVal === 0) { matched = false; break; }
        // 商 = n1.intVal/10^k1 ÷ n2.intVal/10^k2
        var qNum = n1.intVal * Math.pow(10, n2.k);
        var qDen = n2.intVal * Math.pow(10, n1.k);
        if (!ansEq(a, qNum, qDen)) matched = false;
        break;
      }
      case "decimal_distributive": {
        // a×9.9（a 一位小数）或 d×99+d 或 a×1.01 —— 用受限求值器重算
        var eDD = evalExpr(t);
        if (!eDD || !ansEq(a, eDD[0], eDD[1])) matched = false;
        break;
      }
      case "reduce_before_mul": {
        var mRB = t.match(/^\((-?\d+)\/(-?\d+)\)\s*×\s*\((-?\d+)\/(-?\d+)\)\s*=/);
        if (!mRB) { matched = false; break; }
        var p = Number(mRB[1]), q = Number(mRB[2]), r = Number(mRB[3]), s = Number(mRB[4]);
        // 交叉约分断言：p 与 s、r 与 q 须有公约数
        if (gcd(p, s) <= 1 || gcd(r, q) <= 1) { matched = false; break; }
        var fRB = fracMul([p, q], [r, s]);
        if (!ansEq(a, fRB[0], fRB[1])) matched = false;
        break;
      }
      case "fraction_distributive": {
        // (a/b + c/d) × m 或 (a/b) × m + (c/d) × m
        var eFD = evalExpr(t);
        if (!eFD || !ansEq(a, eFD[0], eFD[1])) matched = false;
        break;
      }
      case "mixed_split": {
        // m(n/d) × e = (m×d+n)/d × e
        var mMix = t.match(/^(-?\d+)\((-?\d+)\/(-?\d+)\)\s*×\s*(-?\d+)\s*=/);
        if (!mMix) { matched = false; break; }
        var mi = Number(mMix[1]), ni = Number(mMix[2]), di = Number(mMix[3]), ei = Number(mMix[4]);
        if (di === 0 || ei % di !== 0) { matched = false; break; } // e 须为 d 倍数（约分式相乘）
        var fMix = fracMul([mi * di + ni, di], [ei, 1]);
        if (!ansEq(a, fMix[0], fMix[1])) matched = false;
        break;
      }
      case "telescoping": {
        // 1/[n(n+1)] 连加 k≤4 项：和 = 1/n − 1/(n+k)
        var terms = t.match(/\d+\/\d+/g);
        if (!terms || terms.length < 2 || terms.length > 4) { matched = false; break; }
        var ns = [];
        var okTerms = true;
        for (var iT = 0; iT < terms.length; iT++) {
          var mT2 = terms[iT].match(/^1\/(\d+)$/);
          if (!mT2) { okTerms = false; break; }
          var den = Number(mT2[1]);
          var n = Math.floor(Math.sqrt(den));
          if (n * (n + 1) !== den) { okTerms = false; break; }
          ns.push(n);
        }
        if (!okTerms) { matched = false; break; }
        // 连续 n：n, n+1, n+2...
        for (var iN = 1; iN < ns.length; iN++) {
          if (ns[iN] !== ns[iN - 1] + 1) { matched = false; break; }
        }
        var startN = ns[0], endN = ns[ns.length - 1];
        var fTel = fracSub([1, startN], [1, endN + 1]);
        if (!ansEq(a, fTel[0], fTel[1])) matched = false;
        break;
      }
      case "arithmetic_series": {
        // 等差数列连加：首+末 × 项数/2
        var nums = (t.match(/-?\d+/g) || []).map(Number);
        if (nums.length < 3 || nums.length % 2 !== 0) { matched = false; break; }
        var diff = nums[1] - nums[0];
        if (diff <= 0) { matched = false; break; }
        var isAp = true;
        for (var iA = 2; iA < nums.length; iA++) {
          if (nums[iA] - nums[iA - 1] !== diff) { isAp = false; break; }
        }
        if (!isAp) { matched = false; break; }
        var sumAp = nums.reduce(function (x, y) { return x + y; }, 0);
        if (sumAp !== Number(a)) matched = false;
        break;
      }
      case "balance_average": {
        // 求 a、b、c 的平均数 → 和/个数
        var numsBA = (t.match(/-?\d+/g) || []).map(Number);
        if (numsBA.length < 3) { matched = false; break; }
        var sumBA = numsBA.reduce(function (x, y) { return x + y; }, 0);
        if (sumBA % numsBA.length !== 0) { matched = false; break; } // 平均数须整除
        if (sumBA / numsBA.length !== Number(a)) matched = false;
        break;
      }
      case "square_diff": {
        // (a+b)×(a−b)，a 整十整百，b∈[1,9]
        var mSD = t.match(/^(-?\d+)\s*×\s*(-?\d+)\s*=/);
        if (!mSD) { matched = false; break; }
        var x1 = Number(mSD[1]), x2 = Number(mSD[2]);
        if (x1 * x2 !== Number(a)) { matched = false; break; }
        if ((x1 + x2) % 2 !== 0 || (x1 - x2) % 2 !== 0) { matched = false; break; }
        var base = (x1 + x2) / 2, bDiff = (x1 - x2) / 2;
        if (base % 10 !== 0 || bDiff < 1 || bDiff > 9) matched = false;
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