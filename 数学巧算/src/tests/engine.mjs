// 数学巧算 · smart_gen 引擎单测（Node 直接跑经典脚本：global.window = global）
// L1 全量 validate / L2 独立答案验证（用 SG_TOOLS 算术核，覆盖小数/分数）/ L3 难度断言
// L4 规范形断言（小数答案必须字符串、分数答案必须 "p/q" 已约分）
import { readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { checkDue, extend, enough, isLocked, todayReset } from "../src/lib/guard.ts";
import { applyRecite } from "../src/lib/recite.ts";
import { buildLessonIndex, suggestWeek, topWeakMethods } from "../src/lib/weak.ts";
import { buildHandout, generatePractice, hashSeed } from "../src/lib/handout.ts";
import { currentStage, defaultLevel, mistKey, pickType, POOL, QUANTITIES, stageToLevel, TIMES, WARM_LEVELS } from "../src/lib/warmup.ts";
import { applyRetry, reviewQueue } from "../src/lib/review.ts";
import { buildTrend, mergeReviewDay, mergeWarmDay, pruneDaily } from "../src/lib/report.ts";
import { STAGES } from "../src/data/stages.generated.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SG_DIR = resolve(__dirname, "../src/assets/smart_gen");

global.window = global;
// 加载工具核 → 阶段文件 → 主入口（经典脚本 IIFE 依次执行）
const files = [
  "sg_tools.js",
  "sg_stage1_2.js",
  "sg_stage3_4.js",
  "sg_stage5_6.js",
  "sg_stageX.js",
  "smart_gen.js",
];
for (const f of files) {
  const code = readFileSync(resolve(SG_DIR, f), "utf-8");
  new Function(code)();
}
// 口算热身引擎（内联数学口算 generators.js，挂 window.KOU_GENERATORS + KOU_META）
const KOU_DIR = resolve(SG_DIR, "../kou_gen");
const kouCode = readFileSync(resolve(KOU_DIR, "kou_gen.js"), "utf-8");
new Function(kouCode)();

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

// ---------- L5：口算热身引擎（KOU_GENERATORS）全量 validate + KOU_META 完整性 ----------
const KOU = global.KOU_GENERATORS;
const KOU_META = global.KOU_META || [];
let kouTotal = 0;
let kouInvalid = 0;
for (const type of KOU.list) {
  for (let i = 0; i < 50; i++) {
    const q = KOU.gen(type);
    kouTotal++;
    if (!q || !KOU.validate(q)) kouInvalid++;
  }
}
let l5bad = 0;
// KOU_META 25 条且与 list 一一对应
if (KOU_META.length !== 25) { l5bad++; console.log(`  L5 meta-count: ${KOU_META.length}（应 25）`); }
for (const m of KOU_META) {
  if (!KOU.list.includes(m.id)) { l5bad++; console.log(`  L5 meta-orphan: ${m.id}`); }
}

// ---------- L6：防沉迷 guard 纯逻辑（checkDue/extend/enough/跨日重置） ----------
let l6bad = 0;
const GUARD_DEFAULT_T = {
  minutePref: 5,
  gamesPref: 10,
  today: "",
  playedToday: 0,
  delayMinTimes: 0,
  delayGamesTimes: 0,
};
{
  // 跨日重置：today 变化清零
  const g1 = { ...GUARD_DEFAULT_T, today: "2026-09-26", playedToday: 8, delayMinTimes: 1, delayGamesTimes: 1 };
  const g2 = todayReset(g1, new Date(2026, 8, 27)); // 2026-09-27
  if (g2.playedToday !== 0 || g2.delayMinTimes !== 0) { l6bad++; console.log("  L6 cross-day reset FAIL"); }
  // 同日不重置
  const g3 = todayReset(g1, new Date(2026, 8, 26));
  if (g3.playedToday !== 8) { l6bad++; console.log("  L6 same-day reset FAIL"); }
  // checkDue：时长到点
  const dueT = checkDue({ ...GUARD_DEFAULT_T, today: "2026-09-27" }, 5 * 60, 2);
  if (!dueT || dueT.kind !== "time" || dueT.canExtend !== true) { l6bad++; console.log("  L6 due-time FAIL"); }
  // checkDue：题量到点
  const dueQ = checkDue({ ...GUARD_DEFAULT_T, gamesPref: 10, today: "2026-09-27" }, 10, 10);
  if (!dueQ || dueQ.kind !== "questions") { l6bad++; console.log("  L6 due-q FAIL"); }
  // checkDue：未到点
  const dueNone = checkDue({ ...GUARD_DEFAULT_T, gamesPref: 10, today: "2026-09-27" }, 10, 3);
  if (dueNone !== null) { l6bad++; console.log("  L6 due-none FAIL"); }
  // extend：时长 +5，上限 2
  let g4 = { ...GUARD_DEFAULT_T, today: "2026-09-27", delayMinTimes: 0 };
  g4 = extend(g4, "time");
  if (g4.minutePref !== 10 || g4.delayMinTimes !== 1) { l6bad++; console.log("  L6 extend-time-1 FAIL"); }
  g4 = extend(g4, "time");
  if (g4.minutePref !== 15 || g4.delayMinTimes !== 2) { l6bad++; console.log("  L6 extend-time-2 FAIL"); }
  const g5 = extend(g4, "time");
  if (g5.minutePref !== 15 || g5.delayMinTimes !== 2) { l6bad++; console.log("  L6 extend-time-cap FAIL"); }
  // enough：记今日 + 锁 + 连续自律
  const e1 = enough({ selfDaily: [], selfStreak: 0, selfLocked: false }, new Date(2026, 8, 27));
  if (!e1.selfLocked || e1.selfDaily.length !== 1 || e1.selfStreak !== 1) { l6bad++; console.log("  L6 enough-1 FAIL"); }
  const e2 = enough({ selfDaily: ["2026-09-26"], selfStreak: 1, selfLocked: false }, new Date(2026, 8, 27));
  if (e2.selfStreak !== 2) { l6bad++; console.log("  L6 enough-streak FAIL"); }
  // isLocked：今日锁 true / 跨日 false
  if (!isLocked({ ...GUARD_DEFAULT_T, today: "2026-09-27" }, true, new Date(2026, 8, 27))) { l6bad++; console.log("  L6 locked-today FAIL"); }
  if (isLocked({ ...GUARD_DEFAULT_T, today: "2026-09-26" }, true, new Date(2026, 8, 27))) { l6bad++; console.log("  L6 locked-crossday FAIL"); }
}

// ---------- L7：原理复述卡纯逻辑（applyRecite：trim/删除/覆盖计数/无记录新建/不动 done/保留其它字段） ----------
let l7bad = 0;
{
  // 覆盖更新：recite 写入 + reciteCount 累计 + 其它字段保留
  const base = { done: true, best: { basic: 0.8 }, practiced: 5 };
  const r1 = applyRecite(base, "  25找4先结对  ", "2026-09-27");
  if (!r1.recite || r1.recite.text !== "25找4先结对" || r1.recite.date !== "2026-09-27") { l7bad++; console.log("  L7 recite-write FAIL"); }
  if (r1.reciteCount !== 1) { l7bad++; console.log("  L7 recite-count-1 FAIL"); }
  if (r1.done !== true || r1.best.basic !== 0.8 || r1.practiced !== 5) { l7bad++; console.log("  L7 retain-fields FAIL"); }
  // 覆盖更新累计 +1
  const r2 = applyRecite(r1, "先找能凑整的一对", "2026-09-28");
  if (r2.reciteCount !== 2 || r2.recite.text !== "先找能凑整的一对") { l7bad++; console.log("  L7 recite-count-2 FAIL"); }
  // 空串删除：recite 置 undefined，reciteCount 保留不累加（语义=撤销，O2-I2）
  const r3 = applyRecite(r2, "   ", "2026-09-28");
  if (r3.recite !== undefined || r3.reciteCount !== 2) { l7bad++; console.log(`  L7 recite-delete FAIL recite=${JSON.stringify(r3.recite)} count=${r3.reciteCount}`); }
  // 空输入且无旧复述：不产生 recite 字段
  const r4 = applyRecite({ done: false }, "", "2026-09-27");
  if (r4.recite !== undefined || r4.reciteCount !== undefined) { l7bad++; console.log("  L7 empty-noop FAIL"); }
  // 移动旧字段保留（recite 追加在旧记录上，donw 不置位——补 done:false 场景）
  const r5 = applyRecite({ done: false, best: {}, practiced: 0 }, "讲得出加法交换律", "2026-09-27");
  if (r5.done !== false || !r5.recite || r5.recite.text !== "讲得出加法交换律") { l7bad++; console.log("  L7 new-record-no-done FAIL"); }
}

// ---------- L8：薄弱方法与建议纯逻辑（buildLessonIndex / topWeakMethods / suggestWeek，注入 mock 数据） ----------
let l8bad = 0;
{
  // mock stages：两个主线阶段（stage 4/5）+ 拓展 X（断言 X 不进建议），lesson_id 全局唯一风格
  const mockStages = [
    { stage: 4, grade: "四年级", lessons: [
      { lesson_id: "s4l1", title: "结合律配对" },
      { lesson_id: "s4l2", title: "基准数法" },
    ]},
    { stage: 5, grade: "五年级", lessons: [
      { lesson_id: "s5l1", title: "化整还原" },
    ]},
    { stage: "X", grade: "拓展", lessons: [
      { lesson_id: "sxl1", title: "等差数列" },
    ]},
  ];
  const mockIndex = buildLessonIndex(mockStages);
  if (mockIndex.size !== 4) { l8bad++; console.log(`  L8 index-size: ${mockIndex.size}（应 4）`); }
  const ref = mockIndex.get("s4l1");
  if (!ref || ref.grade !== "四年级" || ref.title !== "结合律配对" || ref.stage !== 4) { l8bad++; console.log("  L8 index-resolve FAIL"); }

  // topWeakMethods：聚合 + warmup 排除 + 降序 + orphan 标记
  const mistakes = [
    { lessonId: "s4l2", wrongCount: 3 },
    { lessonId: "warmup:g1", wrongCount: 9 },   // 应排除（口算热身）
    { lessonId: "s4l1", wrongCount: 5 },
    { lessonId: "s9l9", wrongCount: 2 },        // 孤儿（index 无此讲）
  ];
  const weak = topWeakMethods(mistakes, mockIndex, 3);
  if (weak.length !== 3) { l8bad++; console.log(`  L8 weak-len: ${weak.length}（应 3：warmup 排除）`); }
  if (weak[0].lessonId !== "s4l1" || weak[0].wrongCount !== 5) { l8bad++; console.log(`  L8 weak-top: ${weak[0].lessonId}/${weak[0].wrongCount}`); }
  if (weak[1].lessonId !== "s4l2") { l8bad++; console.log("  L8 weak-second FAIL"); }
  if (weak[2].lessonId !== "s9l9" || weak[2].orphan !== true) { l8bad++; console.log("  L8 weak-orphan FAIL"); }
  // share：非 warmup 总错题 = 5+3+2 = 10；s4l1 share = 0.5
  if (weak[0].share !== 0.5) { l8bad++; console.log(`  L8 weak-share: ${weak[0].share}（应 0.5）`); }

  // suggestWeek：weak（wrongCount≥2）+ incomplete（未开始，跨阶段按序，排除 X）+ 去重 + limit
  const lessons = {
    "4:s4l2": { done: true, practiced: 8 },   // 已练：不作为 incomplete 来源
    "5:s5l1": { done: false, practiced: 0, recite: "xxx" }, // recite-only 未练：照常推荐（O2-I1）
    // 4:s4l1 无记录 → incomplete 候选；X:sxl1 无记录但应被排除
  };
  const sug = suggestWeek(mistakes, lessons, mockStages, 4);
  if (sug.length !== 3) { l8bad++; console.log(`  L8 sug-len: ${sug.length}（应 3：weak s4l1/s4l2 + incomplete s5l1；s4l1 去重合并为 weak 不重复计）`); }
  const kinds = sug.map((s) => `${s.kind}:${s.lessonId}`);
  if (kinds[0] !== "weak:s4l1") { l8bad++; console.log(`  L8 sug-w1: ${kinds[0]}`); }
  if (kinds[1] !== "weak:s4l2") { l8bad++; console.log(`  L8 sug-w2: ${kinds[1]}`); }
  // incomplete：s5l1（recite-only 照常推荐，O2-I1）；s4l1 因 weak 去重不重复出现
  if (!kinds.includes("incomplete:s5l1")) { l8bad++; console.log(`  L8 sug-rec:`); }
  if (kinds.some((k) => k.includes("sxl1"))) { l8bad++; console.log("  L8 sug-x FAIL（拓展不应进建议）"); }
  // done=true 的不应作为 incomplete；去重无重复
  if (kinds.some((k) => k === "incomplete:s4l2")) { l8bad++; console.log("  L8 sug-done FAIL"); }
  const single = new Set(sug.map((s) => s.lessonId));
  if (single.size !== sug.length) { l8bad++; console.log("  L8 sug-dupe FAIL"); }
}

// ---------- L9：打印讲义纯逻辑（buildHandout 纯变换 + generatePractice 引擎注入，零全局污染） ----------
let l9bad = 0;
{
  // mock lesson（结构对齐 SmartLesson 子集）
  const mockLesson = {
    title: "结合律配对",
    principle: "25 找 4，125 找 8，先结对再相乘",
    explore: { model: "area", steps: ["先找能凑整的一对", "先算它们", "再算剩下的"] },
    method: { rhyme: "先配对，再相乘", steps: [] },
    examples: [
      { expr: "25×16×4", normal: "25×16=400, 400×4=1600", smart: "25×4=100, 100×16=1600", why: "25 找 4" },
      { expr: "125×8×7", normal: "125×8=1000, 1000×7=7000", smart: "125×8=1000, 1000×7=7000", why: "125 找 8" },
      { expr: "4×37×25", normal: "4×37=148, 148×25=3700", smart: "4×25=100, 100×37=3700", why: "4 找 25" },
      { expr: "9×16×125", normal: "9×16=144, 144×125=18000", smart: "16×125=2000, 2000×9=18000", why: "16 找 125" },
    ],
  };
  const h = buildHandout(mockLesson, "四年级");
  if (h.lessonTitle !== "结合律配对" || h.grade !== "四年级") { l9bad++; console.log("  L9 handout-head FAIL"); }
  if (h.principle.indexOf("25 找 4") < 0) { l9bad++; console.log("  L9 handout-principle FAIL"); }
  if (h.exploreSteps.length !== 3) { l9bad++; console.log("  L9 handout-explore FAIL"); }
  if (h.methodRhyme !== "先配对，再相乘") { l9bad++; console.log("  L9 handout-rhyme FAIL"); }
  if (h.examples.length !== 3) { l9bad++; console.log(`  L9 handout-examples-trunc: ${h.examples.length}（应 3，第 4 个被截断）`); }

  // 缺省兜底：无 explore/method/examples
  const h2 = buildHandout({ title: "空讲", principle: "" }, "一年级");
  if (h2.exploreSteps.length !== 0 || h2.methodRhyme !== "" || h2.examples.length !== 0) { l9bad++; console.log("  L9 handout-empty-fallback FAIL"); }

  // generatePractice：mock engine 生成 count 题（B1 引擎必填注入）
  const mockEngine = {
    gen: (name) => {
      if (name !== "combo_basic") return null;
      return { text: "30 + 18 + 9 =", answer: 57 };
    },
  };
  const p1 = generatePractice("combo_basic", 3, mockEngine);
  if (p1.length !== 3) { l9bad++; console.log(`  L9 practice-count: ${p1.length}（应 3）`); }
  if (p1[0].text.indexOf("=") < 0 || p1[0].answer !== 57) { l9bad++; console.log("  L9 practice-text FAIL"); }
  // B2：engine null → []；gen 返回 null → []；genName 空 → []；count ≤ 0 → []
  if (generatePractice("combo_basic", 3, null).length !== 0) { l9bad++; console.log("  L9 practice-engine-null FAIL"); }
  if (generatePractice("combo_advance", 3, mockEngine).length !== 0) { l9bad++; console.log("  L9 practice-gen-null FAIL"); }
  if (generatePractice("", 3, mockEngine).length !== 0) { l9bad++; console.log("  L9 practice-empty-gen FAIL"); }
  if (generatePractice("combo_basic", 0, mockEngine).length !== 0) { l9bad++; console.log("  L9 practice-zero-count FAIL"); }
}

// ---------- L10：教程库 → 生成器契约（32 讲 × 3 档 practice.gen 全部合法；全阶回归内容侧） ----------
let l10bad = 0;
{
  const genNames = new Set(SG.list);
  let checked = 0;
  for (const st of STAGES) {
    for (const l of st.lessons || []) {
      const p = l.practice || {};
      for (const level of ["basic", "advance", "challenge"]) {
        const g = p[level]?.gen;
        checked++;
        if (!g || !genNames.has(g)) {
          l10bad++;
          if (l10bad <= 10) console.log(`  L10 gen-missing: stage${st.stage}:${l.lesson_id} ${level} → ${g}`);
        }
      }
    }
  }
  if (checked !== 96) { l10bad++; console.log(`  L10 lesson-ref-count: ${checked}（应 96 = 32 讲 × 3 档）`); }
}

// ---------- L9b：V1.1 seed 固定（确定性/题序稳定/还原/重入/边界，mock 随机引擎） ----------
{
  // mock 引擎消费 Math.random（真随机路径验证 seed 注入生效）
  const randEngine = {
    gen: () => ({ text: String(Math.random()).slice(2, 8) + " + 1 =", answer: 1 }),
  };
  // 同 seed 两次全等（确定性）
  const p1 = generatePractice("any_gen", 4, randEngine, 12345);
  const p2 = generatePractice("any_gen", 4, randEngine, 12345);
  if (JSON.stringify(p1) !== JSON.stringify(p2)) { l9bad++; console.log("  L9b seed-determinism FAIL"); }
  // 不同 seed 至少一项不同（防假等）
  const p3 = generatePractice("any_gen", 4, randEngine, 54321);
  if (JSON.stringify(p1) === JSON.stringify(p3)) { l9bad++; console.log("  L9b seed-diff FAIL"); }
  // 题序稳定：count=5 与 count=3（同 seed）前 3 题全等
  const p5 = generatePractice("any_gen", 5, randEngine, 12345);
  const p3b = generatePractice("any_gen", 3, randEngine, 12345);
  if (p5.slice(0, 3).map((x) => x.text).join("|") !== p3b.map((x) => x.text).join("|")) { l9bad++; console.log("  L9b seed-count-stability FAIL"); }
  // Math.random 还原（引用同一）
  const before = Math.random;
  generatePractice("any_gen", 2, randEngine, 999);
  if (Math.random !== before) { l9bad++; console.log("  L9b math-restore FAIL"); }
  // 重入检测不误报（正常路径 console.warn 不应触发）
  const warns = [];
  const origWarn = console.warn;
  console.warn = (m) => warns.push(String(m));
  generatePractice("any_gen", 2, randEngine, 1);
  console.warn = origWarn;
  if (warns.length !== 0) { l9bad++; console.log(`  L9b reentry-fp FAIL: ${warns[0]}`); }
  // 边界：seed=0 / 小数 / 超大（>>> 截断）不抛错、仍返回 count 题
  if (generatePractice("any_gen", 2, randEngine, 0).length !== 2) { l9bad++; console.log("  L9b seed-zero FAIL"); }
  if (generatePractice("any_gen", 2, randEngine, 3.7).length !== 2) { l9bad++; console.log("  L9b seed-float FAIL"); }
  if (generatePractice("any_gen", 2, randEngine, 4294967295).length !== 2) { l9bad++; console.log("  L9b seed-huge FAIL"); }
}

// ---------- L9c：V1.1 真实引擎确定性（I3：≥3 genName × ≥2 seed，覆盖不同随机消费形态） ----------
{
  const realGens = ["combo_basic", "subtraction_property_challenge", "fraction_distributive_advance"];
  const baseSeed = hashSeed("s4l1");
  const seeds = [baseSeed, baseSeed + 1];
  for (const g of realGens) {
    for (const s of seeds) {
      const a1 = generatePractice(g, 5, SG, s);
      const a2 = generatePractice(g, 5, SG, s);
      if (a1.length === 0 || JSON.stringify(a1) !== JSON.stringify(a2)) {
        l9bad++; console.log(`  L9c real-determinism FAIL: ${g} seed=${s} len=${a1.length}`);
      }
    }
    // 不同 seed 至少一项不同（防假等；同 genName 两 seed 对比）
    const b1 = generatePractice(g, 5, SG, seeds[0]);
    const b2 = generatePractice(g, 5, SG, seeds[1]);
    if (JSON.stringify(b1) === JSON.stringify(b2)) { l9bad++; console.log(`  L9c real-seed-diff FAIL: ${g}`); }
  }
}

// ---------- L11：V1.2 口算热身增强纯逻辑（六档池/跟随阶段/加权出题/键盘可达性） ----------
let l11bad = 0;
{
  // stageToLevel：1..6 → g1..g6；<1（0/负/NaN）→ g1；>6 → g6（Oracle B2 修订）
  const stl = stageToLevel;
  const stlCases = [
    [1, "g1"], [2, "g2"], [3, "g3"], [4, "g4"], [5, "g5"], [6, "g6"],
    [0, "g1"], [-1, "g1"], [7, "g6"], [100, "g6"],
  ];
  for (const [n, want] of stlCases) {
    if (stl(n) !== want) { l11bad++; console.log(`  L11 stageToLevel(${n}) FAIL → ${stl(n)}（应 ${want}）`); }
  }
  if (stl(NaN) !== "g1") { l11bad++; console.log("  L11 stageToLevel(NaN) FAIL"); }

  // currentStage：warmup 跳过；"X" → 7；多讲取 max；空 → 0
  if (currentStage({}) !== 0) { l11bad++; console.log("  L11 currentStage-empty FAIL"); }
  if (currentStage({ "warmup:g1": {} }) !== 0) { l11bad++; console.log("  L11 currentStage-warmup-only FAIL"); }
  if (currentStage({ "1:s1l1": {}, "3:s3l2": {}, "warmup:g2": {} }) !== 3) { l11bad++; console.log("  L11 currentStage-max FAIL"); }
  if (currentStage({ "X:sxl1": {} }) !== 7) { l11bad++; console.log("  L11 currentStage-X FAIL"); }
  if (currentStage({ "1:s1l1": {}, "X:sxl1": {} }) !== 7) { l11bad++; console.log("  L11 currentStage-X-with-main FAIL"); }

  // defaultLevel：空 → g1；学到 s3 → g3；仅拓展 → g6
  if (defaultLevel({}) !== "g1") { l11bad++; console.log("  L11 defaultLevel-empty FAIL"); }
  if (defaultLevel({ "3:s3l1": {} }) !== "g3") { l11bad++; console.log("  L11 defaultLevel-s3 FAIL"); }
  if (defaultLevel({ "X:sxl1": {} }) !== "g6") { l11bad++; console.log("  L11 defaultLevel-X FAIL"); }

  // pickType：均匀覆盖 / 加权提升 / 封顶 / avoid 生效
  const pool4 = POOL.g6; // 4 型
  // 均匀：无错题，抽样 400 覆盖全池
  const seen = new Set();
  for (let i = 0; i < 400; i++) seen.add(pickType(pool4, {}, "g6"));
  if (seen.size !== pool4.length) { l11bad++; console.log(`  L11 pickType-uniform FAIL: ${seen.size}/${pool4.length}`); }
  // 加权：mist 注入 g6_pct=10 → 权重 4 vs 其余 1，命中率应显著高于均匀 25%
  const weightedMist = { [mistKey("g6", "g6_pct")]: 10 };
  let wHits = 0;
  const N = 400;
  for (let i = 0; i < N; i++) if (pickType(pool4, weightedMist, "g6") === "g6_pct") wHits++;
  if (wHits <= N * 0.5 || wHits >= N * 0.9) { l11bad++; console.log(`  L11 pickType-weighted FAIL: g6_pct 命中 ${wHits}/${N}（应 >50% 且 <90%）`); }
  // 封顶：count=100 命中率不显著高于 count=3（权重同为 1+3=4）
  const mist3 = { [mistKey("g6", "g6_pct")]: 3 };
  const mist100 = { [mistKey("g6", "g6_pct")]: 100 };
  let h3 = 0, h100 = 0;
  for (let i = 0; i < 300; i++) { if (pickType(pool4, mist3, "g6") === "g6_pct") h3++; if (pickType(pool4, mist100, "g6") === "g6_pct") h100++; }
  if (Math.abs(h3 - h100) > 60) { l11bad++; console.log(`  L11 pickType-cap FAIL: count3=${h3} count100=${h100}（应近似）`); }
  // avoid 生效：池 2 型 avoid="a" 时结果永不为 "a"
  const pool2 = ["a", "b"];
  for (let i = 0; i < 30; i++) {
    const t = pickType(pool2, {}, "g1", "a");
    if (t === "a") { l11bad++; console.log("  L11 pickType-avoid FAIL"); break; }
  }

  // 键盘可达性抽查：POOL 六档全部 type 的 gen 返回 answer 可被键盘输入域表达（整数/小数/分数 a/b）
  const keyRe = /^-?\d+(\/-?\d+)?(\.\d+)?$/;
  const keyReAlt = /^\.\d+$/; // "0.75" 归一为 ".75" 兜底（键盘按 . 起头补 0.）
  for (const lv of WARM_LEVELS) {
    for (const type of POOL[lv]) {
      for (let i = 0; i < 10; i++) {
        const qq = KOU.gen(type);
        if (!qq) { l11bad++; console.log(`  L11 kou-gen-missing: ${lv}/${type}`); break; }
        const a = String(qq.answer);
        if (!keyRe.test(a) && !keyReAlt.test(a)) {
          l11bad++;
          console.log(`  L11 keyboard-reach FAIL: ${lv}/${type} answer="${a}"`);
        }
      }
    }
  }
}

// ---------- L12：V1.3 错题重练纯逻辑（applyRetry 掌握判定 / reviewQueue 副本） ----------
let l12bad = 0;
{
  const mk = (key, lessonId, expr, answer, wrongCount) => ({ key, lessonId, expr, answer, wrongCount });

  // applyRetry：答对 → null（掌握移除）；答错 → wrongCount+1
  const m1 = mk("s4l3:25×16×4 =", "s4l3", "25×16×4 =", 1600, 2);
  if (applyRetry(m1, true) !== null) { l12bad++; console.log("  L12 applyRetry-correct FAIL（应 null）"); }
  const m2 = applyRetry(m1, false);
  if (!m2 || m2.wrongCount !== 3) { l12bad++; console.log(`  L12 applyRetry-wrong FAIL: wrongCount=${m2?.wrongCount}（应 3）`); }
  if (m2 && m2.key !== m1.key || m2 && m2.answer !== 1600) { l12bad++; console.log("  L12 applyRetry-preserve FAIL（其余字段不变）"); }
  // 边界：wrongCount:0 → 1（I4 防御，pushMistake 不产生 0 但函数应自洽）
  const m0 = applyRetry(mk("a:1+1 =", "a", "1+1 =", 2, 0), false);
  if (!m0 || m0.wrongCount !== 1) { l12bad++; console.log("  L12 applyRetry-zero FAIL"); }

  // reviewQueue：副本（引用不等）/ 序保持 / 空入参
  const arr = [m1, mk("warmup:g1:3+5 =", "warmup:g1", "3+5 =", 8, 1)];
  const q = reviewQueue(arr);
  if (q === arr) { l12bad++; console.log("  L12 reviewQueue-copy FAIL（应新数组）"); }
  if (q.length !== 2 || q[0].key !== arr[0].key || q[1].key !== arr[1].key) { l12bad++; console.log("  L12 reviewQueue-order FAIL"); }
  if (reviewQueue([]).length !== 0) { l12bad++; console.log("  L12 reviewQueue-empty FAIL"); }
  // 副本隔离：修改副本不影响入参
  q.pop();
  if (arr.length !== 2) { l12bad++; console.log("  L12 reviewQueue-isolation FAIL"); }
}

// ---------- L13：V1.4 家长报告统计纯逻辑（每日聚合/滚动裁剪/趋势序列） ----------
let l13bad = 0;
{
  // mergeWarmDay：无既有 → 点本身；有既有 → 四字段聚合；undefined 字段默认 0
  const m1 = mergeWarmDay(undefined, { total: 10, correct: 8, sec: 60, sessions: 1 });
  if (m1.total !== 10 || m1.correct !== 8 || m1.sec !== 60 || m1.sessions !== 1) { l13bad++; console.log("  L13 mergeWarmDay-fresh FAIL"); }
  const m2 = mergeWarmDay(m1, { total: 5, correct: 5, sec: 30, sessions: 1 });
  if (m2.total !== 15 || m2.correct !== 13 || m2.sec !== 90 || m2.sessions !== 2) { l13bad++; console.log("  L13 mergeWarmDay-agg FAIL"); }
  const m3 = mergeWarmDay({ total: 1, correct: 1, sec: undefined, sessions: 1 }, { total: 2, correct: 2, sec: 3, sessions: 1 });
  if (m3.sec !== 3 || isNaN(m3.sec)) { l13bad++; console.log("  L13 mergeWarmDay-undefined-sec FAIL"); }

  // mergeReviewDay：聚合
  const r1 = mergeReviewDay(undefined, { mastered: 2, retried: 1 });
  const r2 = mergeReviewDay(r1, { mastered: 3, retried: 0 });
  if (r2.mastered !== 5 || r2.retried !== 1) { l13bad++; console.log("  L13 mergeReviewDay FAIL"); }

  // pruneDaily：超限裁剪 / 恰 N 边界 / 畸形 key 自洽
  const keys60 = Array.from({ length: 60 }, (_, i) => `2026-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`);
  if (pruneDaily(keys60, 60).length !== 0) { l13bad++; console.log("  L13 pruneDaily-boundary FAIL（恰 60 应删 0）"); }
  if (pruneDaily(keys60, 30).length !== 30) { l13bad++; console.log("  L13 pruneDaily-30 FAIL"); }
  if (pruneDaily(["2026-09-01", "2026-09-03", "2026-09-02"], 2).sort().join() !== "2026-09-01") { l13bad++; console.log("  L13 pruneDaily-oldest FAIL（应删最旧 09-01）"); }
  if (pruneDaily(["2026-9-5", "2026-09-06"], 1).length !== 1) { l13bad++; console.log("  L13 pruneDaily-malformed FAIL（畸形 key 不崩）"); }

  // buildTrend：升序 / 长度恰 days / 补缺失日 / 窗口外剔除
  const daily = {
    "2026-09-10": { total: 10, correct: 9, sec: 60, sessions: 1 },
    "2026-09-12": { total: 10, correct: 5, sec: 60, sessions: 1 },
    "2026-08-01": { total: 10, correct: 10, sec: 60, sessions: 1 }, // 窗口外应剔除
  };
  const t = buildTrend(daily, 5, "2026-09-12");
  if (t.length !== 5) { l13bad++; console.log(`  L13 buildTrend-length: ${t.length}（应 5）`); }
  if (t[0].key !== "2026-09-08" || t[4].key !== "2026-09-12") { l13bad++; console.log("  L13 buildTrend-window FAIL（升序 09-08→09-12）"); }
  if (t[0].rate !== null || t[1].rate !== null) { l13bad++; console.log("  L13 buildTrend-missing FAIL（缺失日 rate=null）"); }
  if (t[2].rate !== 0.9) { l13bad++; console.log(`  L13 buildTrend-rate: ${t[2].rate}（应 0.9）`); }
  if (t[4].rate !== 0.5) { l13bad++; console.log("  L13 buildTrend-rate-last FAIL"); }
  if (t.some((x) => x.key === "2026-08-01")) { l13bad++; console.log("  L13 buildTrend-outside-window FAIL（窗口外未剔除）"); }
  if (buildTrend(daily, 5, "bad-key").length !== 0) { l13bad++; console.log("  L13 buildTrend-bad-end FAIL"); }
}

// ---------- 输出 ----------
console.log("== smart_gen 引擎单测 ==");
console.log(`生成器数: ${NAMES.length} 个（${new Set(NAMES.map((n) => n.split("_").slice(0, -1).join("_"))).size} 方法 × 3 档）`);
console.log(`L1 全量 validate: ${total - invalid}/${total} 通过`);
console.log(`L2 独立答案验证: ${l2ok}/${l2total}（跳过 ${l2skip}）`);
console.log(`L3 难度断言: ${l3ok}/${l3total}`);
console.log(`L4 规范形断言: ${l4total - l4bad}/${l4total} 通过`);
console.log(`L5 口算热身 validate: ${kouTotal - kouInvalid}/${kouTotal} 通过 + KOU_META ${KOU_META.length} 条完整（bad=${l5bad}）`);
console.log(`L6 guard 纯逻辑: ${l6bad === 0 ? "全部通过" : `${l6bad} 项失败`}`);
console.log(`L7 recite 纯逻辑: ${l7bad === 0 ? "全部通过" : `${l7bad} 项失败`}`);
console.log(`L8 weak 纯逻辑: ${l8bad === 0 ? "全部通过" : `${l8bad} 项失败`}`);
console.log(`L9 handout 纯逻辑: ${l9bad === 0 ? "全部通过" : `${l9bad} 项失败`}`);
console.log(`L10 教程库→生成器契约: ${l10bad === 0 ? "全部通过" : `${l10bad} 项失败`}`);
console.log(`L11 口算热身增强纯逻辑: ${l11bad === 0 ? "全部通过" : `${l11bad} 项失败`}`);
console.log(`L12 错题重练纯逻辑: ${l12bad === 0 ? "全部通过" : `${l12bad} 项失败`}`);
console.log(`L13 报告统计纯逻辑: ${l13bad === 0 ? "全部通过" : `${l13bad} 项失败`}`);
const l2fail = l2total - l2ok;
const totalBad = failed + invalid + l2fail + l4bad + kouInvalid + l5bad + l6bad + l7bad + l8bad + l9bad + l10bad + l11bad + l12bad + l13bad;
console.log(`FAIL 计数: ${totalBad}`);
process.exit(totalBad ? 1 : 0);
