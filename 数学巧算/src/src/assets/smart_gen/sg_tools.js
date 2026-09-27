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

  // ---------- 注册表 ----------
  global.SG_REGISTRY = global.SG_REGISTRY || {};

  global.SG_TOOLS = {
    ri: ri,
    gcd: gcd,
    reduceFrac: reduceFrac,
    near: near,
    fracEq: fracEq,
    fmtDecimal: fmtDecimal,
    registry: global.SG_REGISTRY,
  };
})(typeof window !== "undefined" ? window : globalThis);