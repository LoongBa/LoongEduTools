// 数学巧算 · smart_gen 工具核（经典脚本 Chrome 61 基线：无 import/export、无箭头、无 class）
// 提供：ri/gcd/reduceFrac/near/fracEq + 注册表 SG_REGISTRY
(function (global) {
  "use strict";

  // ---------- 工具函数 ----------
  function ri(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { var t = b; b = a % b; a = t; }
    return a || 1;
  }
  // 约分 → [分子, 分母]
  function reduceFrac(n, d) {
    var g = gcd(n, d);
    return [n / g, d / g];
  }
  function near(x, y) {
    return Math.abs(x - y) < 1e-6;
  }
  // 分数等价：ans（"p/q" 已约分字符串 / 整数串 / 数字）与 n/d 约分后比较
  function fracEq(ans, n, d) {
    var r = reduceFrac(n, d);
    if (typeof ans === "number") {
      return isFinite(ans) && near(ans, r[0] / r[1]);
    }
    if (typeof ans !== "string") return false;
    var fm = ans.match(/^(-?\d+)\/(-?\d+)$/);
    if (fm) {
      var fn = Number(fm[1]), fd = Number(fm[2]);
      if (fd === 0) return false;
      if (gcd(fn, fd) !== 1) return false; // 已约分约束
      var ra = reduceFrac(fn, fd);
      return ra[0] === r[0] && ra[1] === r[1];
    }
    if (ans.match(/^-?\d+$/)) {
      return r[1] === 1 && Number(ans) === r[0];
    }
    return false;
  }
  // 小数转字符串规范形（避免 0.1+0.2 浮点陷阱）：整数×10^k → 点位移
  function fmtDecimal(intVal, k) {
    var neg = intVal < 0;
    var s = String(Math.abs(intVal));
    while (s.length <= k) s = "0" + s;
    var dot = s.length - k;
    var out = dot <= 0 ? "0." + "0".repeat(-dot) + s : s.slice(0, dot) + "." + s.slice(dot);
    out = out.replace(/0+$/, "").replace(/\.$/, "");
    return (neg ? "-" : "") + (out || "0");
  }

  // ---------- Fraction 精确类（内部表示 [n, d]，恒已约分、d>0） ----------

  // 分数串/整数串/小数串/数字 → [n, d]（已约分）；非法返回 null
  function parseFrac(v) {
    if (typeof v === "number") {
      if (!isFinite(v)) return null;
      // 浮点小数 → 用字符串规整化
      var ds = String(v);
      var dm = ds.match(/^(-?\d+)(?:\.(\d+))?$/);
      if (dm) {
        var frac = dm[2] || "";
        var k = frac.length;
        var num = Number(dm[1] + frac);
        if (dm[1].charAt(0) === "-" && frac) num = -Number(dm[1].slice(1) + frac);
        return reduceFrac(num, Math.pow(10, k));
      }
      return reduceFrac(v, 1);
    }
    var s = String(v).trim();
    var m = s.match(/^(-?\d+)\/(-?\d+)$/);
    if (m && Number(m[2]) !== 0) return reduceFrac(Number(m[1]), Number(m[2]));
    if (/^-?\d+$/.test(s)) return reduceFrac(Number(s), 1);
    var dm2 = s.match(/^(-?)(\d+)(?:\.(\d+))?$/);
    if (dm2) {
      var frac2 = dm2[3] || "";
      var k2 = frac2.length;
      var num2 = Number(dm2[2] + frac2);
      if (dm2[1] === "-") num2 = -num2;
      return reduceFrac(num2, Math.pow(10, k2));
    }
    return null;
  }
  function fracAdd(a, b) { return reduceFrac(a[0] * b[1] + b[0] * a[1], a[1] * b[1]); }
  function fracSub(a, b) { return reduceFrac(a[0] * b[1] - b[0] * a[1], a[1] * b[1]); }
  function fracMul(a, b) { return reduceFrac(a[0] * b[0], a[1] * b[1]); }
  function fracDiv(a, b) { return reduceFrac(a[0] * b[1], a[1] * b[0]); }
  // [n,d] → 规范形字符串："p/q"（约分后）或整数串
  function fracStr(f) {
    var r = reduceFrac(f[0], f[1]);
    return r[1] === 1 ? String(r[0]) : r[0] + "/" + r[1];
  }
  // [n,d] → 规范答案：整数结果返回 number，分数结果返回 "p/q" 字符串（对齐方案 §三）
  function fracAns(n, d) {
    var r = reduceFrac(n, d);
    return r[1] === 1 ? r[0] : r[0] + "/" + r[1];
  }
  // 两个分数等价（跨分数/整数/数字）
  function fracEq2(a, b) {
    return a[0] === b[0] && a[1] === b[1];
  }

  // ---------- Decimal 精确类（内部表示 {intVal, k}，值 = intVal / 10^k） ----------

  // 十进制串（"3.5" / "-0.25" / 整数串）→ {intVal, k}；非法返回 null
  function parseDec(s) {
    var m = String(s).match(/^(-?)(\d+)(?:\.(\d+))?$/);
    if (!m) return null;
    var neg = m[1] === "-";
    var intPart = m[2] || "0";
    var fracPart = m[3] || "";
    var k = fracPart.length;
    var intVal = Number(intPart + fracPart);
    if (neg) intVal = -intVal;
    return { intVal: intVal, k: k };
  }
  // 两个十进制值（{intVal,k} 或普通数字/串）等价 → 规整化比较
  function decEq2(a, b) {
    var pa = typeof a === "object" ? a : parseDec(String(a));
    var pb = typeof b === "object" ? b : parseDec(String(b));
    if (!pa || !pb) return false;
    // 通分到 k 较大者后比较整数
    var kmax = Math.max(pa.k, pb.k);
    var na = pa.intVal * Math.pow(10, kmax - pa.k);
    var nb = pb.intVal * Math.pow(10, kmax - pb.k);
    return na === nb;
  }
  // 小数乘法：a × b（对象或数字）
  function decMul(a, b) {
    var pa = typeof a === "object" ? a : parseDec(String(a));
    var pb = typeof b === "object" ? b : parseDec(String(b));
    if (!pa || !pb) return null;
    return { intVal: pa.intVal * pb.intVal, k: pa.k + pb.k };
  }
  // 小数 → 规范形字符串（整数返回 "7"，小数返回 "2.4"）
  function decStr(d) {
    return fmtDecimal(d.intVal, d.k);
  }
  // 小数结果 → 规范答案：整数结果返回 number，小数结果返回字符串（对齐方案 §三）
  function decAns(intVal, k) {
    if (k <= 0 || intVal % Math.pow(10, k) === 0) {
      return intVal / Math.pow(10, k);
    }
    return fmtDecimal(intVal, k);
  }

  // ---------- 注册表 ----------
  global.SG_REGISTRY = global.SG_REGISTRY || {};

  global.SG_TOOLS = {
    ri: ri,
    gcd: gcd,
    reduceFrac: reduceFrac,
    near: near,
    fracEq: fracEq,
    fmtDecimal: fmtDecimal,
    parseFrac: parseFrac,
    fracAdd: fracAdd,
    fracSub: fracSub,
    fracMul: fracMul,
    fracDiv: fracDiv,
    fracStr: fracStr,
    fracAns: fracAns,
    fracEq2: fracEq2,
    parseDec: parseDec,
    decEq2: decEq2,
    decMul: decMul,
    decStr: decStr,
    decAns: decAns,
    registry: global.SG_REGISTRY,
  };
})(typeof window !== "undefined" ? window : globalThis);