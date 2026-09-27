// 数学巧算 · smart_gen 拓展阶段 X：族 10 方法 × 三档（经典脚本，注册进 SG_REGISTRY）
// arithmetic_series（等差数列求和）/ balance_average（移多补少）/ square_diff（平方差）
// 依赖 sg_tools.js：T.ri / T.fmtDecimal / T.reduceFrac / T.gcd / T.fracStr
(function (global) {
  "use strict";
  var R = global.SG_REGISTRY;
  var T = global.SG_TOOLS;
  var ri = T.ri;
  var gcd = T.gcd;
  var fracStr = T.fracStr;
  var fmtDecimal = T.fmtDecimal;

  // ================= 族 10：思维进阶 =================

  // 等差数列求和：首 a，公差 d，项数 n（偶数）→ 和 = (首+末)×n/2
  // 题面完整列出：a + (a+d) + (a+2d) + ... =（n≤10 项全列，避免超长）
  function mkArith(n, aLow, aHigh, dLow, dHigh) {
    var a = ri(aLow, aHigh);
    var d = ri(dLow, dHigh);
    var terms = [];
    var sum = 0;
    for (var i = 0; i < n; i++) {
      var t = a + i * d;
      terms.push(t);
      sum += t;
    }
    return {
      type: "arithmetic_series",
      text: terms.join(" + ") + " =",
      answer: sum,
      hint: "首尾配对：(" + a + "+" + terms[n - 1] + ")×" + (n / 2) + " = " + ((a + terms[n - 1]) * n / 2),
    };
  }
  R.arithmetic_series = {
    gen_basic: function () { return mkArith(4, 1, 9, 1, 2); },
    gen_advance: function () { return mkArith(6, 1, 9, 1, 4); },
    gen_challenge: function () { return mkArith(10, 2, 9, 2, 6); },
  };

  // 移多补少（求平均数）：N 个数围绕基准 B（整十），答案 = B + Σ差额/N（整数）
  // 构造保证：选 N-1 个差额后，末差额 = -(Σ前 N-1 个) mod N 使总和被 N 整除 → 平均数为整数
  function mkBalance(N, B) {
    var diffs = [];
    var sum = 0;
    for (var i = 0; i < N - 1; i++) {
      var d = ri(-8, 8);
      diffs.push(d);
      sum += d;
    }
    // 让 Σ 被 N 整除：last = -sum mod N（范围调整到 [-8,8] 内）
    var rem = ((N - (sum % N)) % N + N) % N;
    var last = rem <= 8 ? rem : rem - N;
    diffs.push(last);
    sum += last;
    var nums = diffs.map(function (d) { return B + d; });
    var avg = B + sum / N;
    var diffStr = diffs.map(function (d) { return d >= 0 ? "+" + d : String(d); }).join("").replace(/^\+/, "");
    return {
      type: "balance_average",
      text: "求 " + nums.join("、") + " 的平均数",
      answer: avg,
      hint: "基准 " + B + "，差额" + diffStr + " = " + sum + "，" + sum + "÷" + N + " = " + (sum / N) + " → " + avg,
    };
  }
  R.balance_average = {
    gen_basic: function () { return mkBalance(3, 90); },
    gen_advance: function () { return mkBalance(4, 100); },
    gen_challenge: function () { return mkBalance(5, 100); },
  };

  // 平方差：a² − b² = (a+b)(a−b)，基准 a 整十/整百，b ∈ [1,9]
  // 题面：(a+b) × (a−b) =，答案 a²−b²
  function mkSquareDiff(aBase, bLow, bHigh) {
    var a = aBase;
    var b = ri(bLow, bHigh);
    var n1 = a + b, n2 = a - b;
    var ans = a * a - b * b;
    return {
      type: "square_diff",
      text: n1 + " × " + n2 + " =",
      answer: ans,
      hint: "平方差：" + a + "² − " + b + "² = " + (a * a) + " − " + (b * b) + " = " + ans,
    };
  }
  R.square_diff = {
    gen_basic: function () { return mkSquareDiff(10, 1, 3); },
    gen_advance: function () { return mkSquareDiff(100, 1, 5); },
    gen_challenge: function () { return mkSquareDiff(100, 4, 9); },
  };
})(typeof window !== "undefined" ? window : globalThis);
