// 数学巧算 · smart_gen 引擎单测（Node 直接跑经典脚本：global.window = global）
// L1 全量 validate / L2 独立答案验证（用 SG_TOOLS 算术核，覆盖小数/分数）/ L3 难度断言
// L4 规范形断言（小数答案必须字符串、分数答案必须 "p/q" 已约分）
import { readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SG_DIR = resolve(__dirname, "../src/assets/smart_gen");

global.window = global;
// 加载工具核 → 阶段文件 → 主入口（经典脚本 IIFE 依次执行）
const files = ["sg_tools.js", "sg_stage1_2.js", "sg_stage3_4.js", "sg_stage5_6.js", "sg_stageX.js", "smart_gen.js"];
for (const f of files) {
  const code = readFileSync(resolve(SG_DIR, f), "utf-8");
  new Function(code)();
}

const SG = global.SMART_GENERATORS;
const T = global.SG_TOOLS;

let failed = 0;
const ok = (name, cond, extra = "") => {
  if (!cond) { failed++; console.log(`FAIL | ${name} ${extra}`); }
};

// ---------- L1：全量 validate ----------
const PER_TYPE = 100;
const NAMES = SG.list.filter((n) => n.endsWith("_basic") || n.endsWith("_advance") || n.endsWith("_challenge"));

let total = 0;
let invalid = 0;
for (const name of NAMES) {
  for (let i = 0; i < PER_TYPE; i++) {
    const q = SG.gen(name);
    total++;
    if (!q || !SG.validate(q)) {
      invalid++;
      if (invalid <= 5) console.log(`  invalid: ${name} #${i} → ${JSON.stringify(q)}`);
    }
  }
}

// ---------- L2：独立答案验证（SG_TOOLS 分数/小数核重算，不用 eval） ----------
// 覆盖：整数加减乘除、分数、小数、平均/等差/平方差等形状
const FRAC_TYPES = new Set(["reduce_before_mul", "fraction_distributive", "mixed_split", "telescoping", "arithmetic_series", "balance_average", "square_diff", "comprehensive_strategy", "decimal_distributive", "expand_shrink", "decimal_to_int", "decimal_complement"]);

let l2ok = 0;
let l2total = 0;
let l2skip = 0;
const l2failByName = {};
for (const name of NAMES) {
  for (let i = 0; i < 20; i++) {
    const q = SG.gen(name);
    if (!q) { l2skip++; continue; }
    const rv = independentSolve(q);
    if (rv === null || rv === undefined) { l2skip++; continue; }
    l2total++;
    const okL2 = typeof q.answer === "number"
      ? Math.abs(rv[0] / rv[1] - q.answer) < 1e-6
      : fracEqStr(q.answer, rv);
    if (okL2) { l2ok++; }
    else {
      if (!l2failByName[name]) l2failByName[name] = { count: 0, sample: "" };
      l2failByName[name].count++;
      if (!l2failByName[name].sample) l2failByName[name].sample = `"${q.text}" answer=${q.answer} solve=${rv[0]}/${rv[1]}`;
    }
  }
}
for (const k of Object.keys(l2failByName)) {
  console.log(`  L2 FAIL ${k}: ${l2failByName[k].count} 例，如 ${l2failByName[k].sample}`);
}

// 答案字符串（"p/q" / 小数 / 整数）与 [n,d] 分数等价
function fracEqStr(ans, frac) {
  const f = T.parseFrac(ans);
  if (!f) return false;
  const r = T.reduceFrac(frac[0], frac[1]);
  return f[0] === r[0] && f[1] === r[1];
}

// 独立求解器：与生成器不同的路径重算题面
function independentSolve(q) {
  const t = q.text;
  const type = q.type;
  // 分数/小数型：用 evalExpr（工具核自带，非生成器路径）
  try {
    if (type === "mixed_split") {
      const m = t.match(/^(-?\d+)\((-?\d+)\/(-?\d+)\)\s*×\s*(-?\d+)\s*=/);
      if (!m) return null;
      const mi = Number(m[1]), ni = Number(m[2]), di = Number(m[3]), ei = Number(m[4]);
      return T.fracMul([mi * di + ni, di], [ei, 1]);
    }
    if (type === "balance_average") {
      const nums = (t.match(/-?\d+/g) || []).map(Number);
      if (nums.length < 3) return null;
      const s = nums.reduce((x, y) => x + y, 0);
      return [s / nums.length, 1];
    }
    if (type === "telescoping") {
      const terms = t.match(/\d+\/\d+/g);
      if (!terms || terms.length < 2) return null;
      let acc = [0, 1];
      for (const term of terms) {
        const [nn, dd] = term.split("/").map(Number);
        acc = T.fracAdd(acc, [nn, dd]);
      }
      return acc;
    }
    // 其余形状：受限求值器（+−×÷()）
    return evalExprFromTools(t);
  } catch {
    return null;
  }
}

// 直接用工具核的中缀求值（复制主入口的 evalExpr，保持独立性）
function evalExprFromTools(text) {
  const s = String(text).replace(/=/g, "").replace(/\s+/g, "");
  const toks = [];
  const re = /(\d+\.\d+|\d+\/\d+|\d+|[+−×÷()])/g;
  let m;
  while ((m = re.exec(s))) toks.push(m[1]);
  if (!toks.length) return null;
  const numToFrac = (tok) => {
    if (tok.indexOf("/") > 0) return T.parseFrac(tok);
    const d = T.parseDec(tok);
    if (!d) return null;
    return T.reduceFrac(d.intVal, Math.pow(10, d.k));
  };
  const out = [], ops = [];
  const prec = { "+": 1, "−": 1, "×": 2, "÷": 2 };
  let ok2 = true;
  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i];
    if (/^\d/.test(tk)) { const f = numToFrac(tk); if (!f) return null; out.push(f); }
    else if (tk === "(") ops.push(tk);
    else if (tk === ")") { while (ops.length && ops[ops.length - 1] !== "(") out.push(ops.pop()); if (!ops.length) return null; ops.pop(); }
    else if (prec[tk] !== undefined) {
      while (ops.length && ops[ops.length - 1] !== "(" && prec[ops[ops.length - 1]] >= prec[tk]) out.push(ops.pop());
      ops.push(tk);
    } else return null;
  }
  while (ops.length) { const o = ops.pop(); if (o === "(" || o === ")") return null; out.push(o); }
  const st = [];
  for (let j = 0; j < out.length; j++) {
    const v = out[j];
    if (typeof v === "object") { st.push(v); continue; }
    const b = st.pop(), a = st.pop();
    if (a === undefined || b === undefined) return null;
    if (v === "+") st.push(T.fracAdd(a, b));
    else if (v === "−") st.push(T.fracSub(a, b));
    else if (v === "×") st.push(T.fracMul(a, b));
    else if (v === "÷") st.push(T.fracDiv(a, b));
  }
  return st.length === 1 ? st[0] : null;
}

// ---------- L3：难度断言（basic 数位 <= advance <= challenge，抽查） ----------
function digitSize(q) {
  const nums = q.text.match(/\d+/g) || [];
  return nums.reduce((m, s) => Math.max(m, s.length), 0);
}
let l3ok = 0;
let l3total = 0;
for (const type of ["complement_to_ten", "complement_to_whole", "baseline_num", "extract_common_factor", "decimal_to_int", "arithmetic_series"]) {
  const b = SG.gen(type + "_basic");
  const a = SG.gen(type + "_advance");
  const c = SG.gen(type + "_challenge");
  if (b && a && c) {
    l3total++;
    if (digitSize(b) <= digitSize(a) && digitSize(a) <= digitSize(c)) l3ok++;
  }
}

// ---------- L4：规范形断言（整数答案 number / 小数答案字符串 / 分数答案 "p/q" 已约分） ----------
const DECIMAL_TYPES = new Set(["decimal_to_int", "decimal_complement", "expand_shrink", "decimal_distributive"]);
const FRACTION_ANS_TYPES = new Set(["reduce_before_mul", "telescoping"]);
let l4bad = 0;
let l4total = 0;
for (const name of NAMES) {
  for (let i = 0; i < 20; i++) {
    const q = SG.gen(name);
    if (!q) continue;
    l4total++;
    if (DECIMAL_TYPES.has(q.type)) {
      // 整数结果 → number；非整数结果 → 字符串（禁浮点 number）
      if (typeof q.answer === "number") {
        if (!Number.isInteger(q.answer)) { l4bad++; if (l4bad <= 3) console.log(`  L4 decimal-num: ${name} → ${q.answer}`); }
      } else if (typeof q.answer !== "string" || !/^-?\d+(\.\d+)?$/.test(q.answer)) {
        l4bad++; if (l4bad <= 3) console.log(`  L4 decimal-bad: ${name} → ${JSON.stringify(q.answer)}`);
      }
    }
    if (FRACTION_ANS_TYPES.has(q.type)) {
      // 分数答案：整数结果 → number；非整数 → "p/q" 字符串且已约分
      if (typeof q.answer === "number") {
        if (!Number.isInteger(q.answer)) { l4bad++; if (l4bad <= 3) console.log(`  L4 frac-num: ${name} → ${q.answer}`); }
      } else if (typeof q.answer !== "string" || !/^-?\d+\/-?\d+$/.test(q.answer)) {
        l4bad++; if (l4bad <= 3) console.log(`  L4 frac-bad: ${name} → ${JSON.stringify(q.answer)}`);
      } else {
        const [nn, dd] = q.answer.split("/").map(Number);
        if (dd === 0 || T.gcd(nn, dd) !== 1) { l4bad++; if (l4bad <= 3) console.log(`  L4 frac-not-reduced: ${name} → ${q.answer}`); }
      }
    }
  }
}

// ---------- 输出 ----------
console.log("== smart_gen 引擎单测 ==");
console.log(`生成器数: ${NAMES.length} 个（${new Set(NAMES.map((n) => n.split("_").slice(0, -1).join("_"))).size} 方法 × 3 档）`);
console.log(`L1 全量 validate: ${total - invalid}/${total} 通过`);
console.log(`L2 独立答案验证: ${l2ok}/${l2total}（跳过 ${l2skip}）`);
console.log(`L3 难度断言: ${l3ok}/${l3total}`);
console.log(`L4 规范形断言: ${l4total - l4bad}/${l4total} 通过`);
const l2fail = l2total - l2ok;
console.log(`FAIL 计数: ${failed + invalid + l2fail + l4bad}`);
process.exit(failed || invalid || l2fail || l4bad ? 1 : 0);
