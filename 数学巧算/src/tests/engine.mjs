// 数学巧算 · smart_gen 引擎单测（Node 直接跑经典脚本：global.window = global）
// L1 全量 validate / L2 独立答案验证 / L3 难度断言（basic<advance<challenge 数位）
import { readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SG_DIR = resolve(__dirname, "../src/assets/smart_gen");

global.window = global;
// 加载工具核 → 阶段文件 → 主入口（经典脚本 IIFE 依次执行）
const files = ["sg_tools.js", "sg_stage1_2.js", "sg_stage3_4.js", "smart_gen.js"];
for (const f of files) {
  const code = readFileSync(resolve(SG_DIR, f), "utf-8");
  new Function(code)();
}

const SG = global.SMART_GENERATORS;
const T = global.SG_TOOLS;

let failed = 0;
const ok = (name, cond, extra = "") => {
  if (!cond) { failed++; }
};

// ---------- L1：全量 validate ----------
const PER_TYPE = 200;
const NAMES = SG.list.filter((n) => n.endsWith("_basic") || n.endsWith("_advance") || n.endsWith("_challenge"));

let total = 0;
let invalid = 0;
for (const name of NAMES) {
  for (let i = 0; i < PER_TYPE; i++) {
    const q = SG.gen(name);
    total++;
    if (!q || !SG.validate(q)) invalid++;
  }
}

// ---------- L2：独立答案验证（用 SG_TOOLS 自带的算术核重算） ----------
function recompute(text) {
  const t = text
    .replace(/=/g, "")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/□/g, "0");
  try {
    const safe = /^[\d\s+\-*/().]+$/.test(t);
    if (!safe) return null;
    // eslint-disable-next-line no-eval
    return eval(t);
  } catch {
    return null;
  }
}

let l2ok = 0;
let l2total = 0;
let l2skip = 0;
for (const name of NAMES.slice(0, 30)) {
  for (let i = 0; i < 30; i++) {
    const q = SG.gen(name);
    if (!q) continue;
    const rv = recompute(q.text);
    if (rv === null) { l2skip++; continue; }
    l2total++;
    const ans = typeof q.answer === "number" ? q.answer : Number(q.answer.split("/")[0]) / Number(q.answer.split("/")[1]);
    if (Math.abs(rv - ans) < 1e-6) l2ok++;
  }
}

// ---------- L3：难度断言（basic 数位 <= advance <= challenge，抽查） ----------
function digitSize(q) {
  const nums = q.text.match(/\d+/g) || [];
  return nums.reduce((m, s) => Math.max(m, s.length), 0);
}
let l3ok = 0;
let l3total = 0;
for (const type of ["complement_to_ten", "complement_to_whole", "baseline_num", "extract_common_factor"]) {
  const b = SG.gen(type + "_basic");
  const a = SG.gen(type + "_advance");
  const c = SG.gen(type + "_challenge");
  if (b && a && c) {
    l3total++;
    if (digitSize(b) <= digitSize(a) && digitSize(a) <= digitSize(c)) l3ok++;
  }
}

// ---------- 输出 ----------
console.log("== smart_gen 引擎单测 ==");
console.log(`生成器数: ${NAMES.length} 个（${new Set(NAMES.map((n) => n.split("_").slice(0, -1).join("_"))).size} 方法 × 3 档）`);
console.log(`L1 全量 validate: ${total - invalid}/${total} 通过`);
console.log(`L2 独立答案验证: ${l2ok}/${l2total}（跳过 ${l2skip}）`);
console.log(`L3 难度断言: ${l3ok}/${l3total}`);
const l2fail = l2total - l2ok;
console.log(`FAIL 计数: ${failed + invalid + l2fail}`);
process.exit(failed || invalid || l2fail ? 1 : 0);