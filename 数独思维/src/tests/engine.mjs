// 数独引擎单测：直接跑真实源码（Node 26 原生 TS 类型剥离）。
// 断言：generatePuzzle 挖洞命中目标已知格、解合法（行/列/宫 1..N 各一次）、solve 唯一解、SD 往返一致。
// V1.0.4 增：parseImportedText 全分支、长度不变式、协议串 round-trip。
// V1.3.0 增：analyzeTechniques 题面技巧画像。
import { generatePuzzle, solve, boxOf, toSDString, fromSDString, validateImported, parseImportedText, analyzeTechniques, findLogicStep, findHiddenPairPattern } from "../src/lib/sudoku.ts";
import { TECHNIQUE_LESSON_MAP, ADV_SKILLS, LESSON_DATA, TECHNIQUE_GROUPS, advSkillsFor } from "../src/lib/content.ts";

let failed = 0;
const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} | ${name} ${extra}`);
  if (!cond) failed++;
};

for (const size of [4, 6, 9]) {
  const target = size === 4 ? 10 : size === 6 ? 18 : 27;
  const { puzzle, solution } = generatePuzzle(size, target, "engine-test:" + size);
  ok(`size=${size} puzzle 长度=N*N`, puzzle.length === size * size, `len=${puzzle.length}`);
  const givens = puzzle.filter((v) => v).length;
  ok(`size=${size} 挖洞命中目标(${target})`, Math.abs(givens - target) <= 4, `given=${givens}`);

  // 解合法性：行/列/宫 1..N 各一次
  let valid = true;
  for (let r = 0; r < size && valid; r++) {
    const s = new Set();
    for (let c = 0; c < size; c++) s.add(solution[r * size + c]);
    if (s.size !== size) valid = false;
  }
  for (let c = 0; c < size && valid; c++) {
    const s = new Set();
    for (let r = 0; r < size; r++) s.add(solution[r * size + c]);
    if (s.size !== size) valid = false;
  }
  const boxW = size === 9 ? 3 : 2;
  const boxH = size === 9 ? 3 : size === 6 ? 3 : 2;
  const boxCount = (size * size) / (boxW * boxH);
  for (let b = 0; b < boxCount && valid; b++) {
    const s = new Set();
    for (let i = 0; i < size * size; i++) if (boxOf(size, i) === b) s.add(solution[i]);
    if (s.size !== size) valid = false;
  }
  ok(`size=${size} 解合法`, valid);

  const sols = solve(puzzle, size, 2);
  ok(`size=${size} 题面唯一解`, sols.length === 1, `solutions=${sols.length}`);
  ok(`size=${size} 唯一解=生成解`, toSDString(sols[0], size) === toSDString(solution, size));

  // SD 往返
  const sd = toSDString(puzzle, size);
  ok(`size=${size} SD 长度=N*N`, sd.length === size * size);
  const back = fromSDString(sd, size);
  ok(`size=${size} SD 往返一致`, !!back && toSDString(back, size) === sd);
}

// 导入校验：合法题通过 / 少线索拒绝 / 冲突拒绝（V1.1.0：validateImported 返回 solution）
const { puzzle: p9 } = generatePuzzle(9, 27, "engine-test:import");
const v9 = validateImported(p9, 9);
ok("validateImported 合法题通过", v9.ok);
ok("validateImported 返回 solution", !!v9.solution && v9.solution.length === 81, `solLen=${v9.solution?.length}`);
const sparse = p9.slice();
for (let i = 0; i < 30; i++) sparse[i] = 0;
ok("validateImported 少线索拒绝", !validateImported(sparse, 9).ok);

// ===== V1.0.4：parseImportedText 全分支 =====
// 合法协议串 SD4:（含逗号分隔）→ 解析成功
const sd4board = [1, 0, 3, 4, 3, 4, 0, 2, 2, 1, 4, 3, 4, 3, 2, 1]; // 4×4 合法题面（见冒烟用例）
const r1 = parseImportedText(`SD4:1,0,3,4,3,4,0,2,2,1,4,3,4,3,2,1`);
ok("parseImportedText SD4: 前缀可解析", r1.board && !r1.error, `error=${r1.error}`);
ok("parseImportedText SD4: board 与原始 givens 一致",
  !!r1.board && r1.board.every((v, i) => v === sd4board[i]));

// 纯数字（无前缀）16 位 → 4×4
const r2 = parseImportedText("1034340221434321");
ok("parseImportedText 纯数字判 4×4", r2.size === 4 && !!r2.board, `size=${r2.size} error=${r2.error}`);

// 协议串 + 中文标题混排（V1.0.4 复制文本「数独思维 · 4×4 练习题」不含 4×4 数字污染——标题数字不再进入 parse）
const r3 = parseImportedText(`数独思维 · 4×4 练习题\n导入编码：SD4:1034340221434321\n提示：…`);
ok("parseImportedText 混排含导入编码行可解析", r3.size === 4 && !!r3.board, `error=${r3.error}`);

// 少线索 → TOO_FEW
const r4 = parseImportedText("SD4:1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0");
ok("parseImportedText 少线索 TOO_FEW", r4.error === "TOO_FEW", `error=${r4.error}`);

// 冲突 → CONFLICT（同行重复 1）
const r5 = parseImportedText("SD4:1,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0");
ok("parseImportedText 冲突 CONFLICT", r5.error === "CONFLICT", `error=${r5.error}`);

// 长度不符 → BAD_LEN（SD4 前缀下 15 位）
const r6 = parseImportedText("SD4:1,0,3,4,3,4,0,2,2,1,4,3,4,3,2");
ok("parseImportedText SD 长度不符 BAD_LEN", r6.error === "BAD_LEN", `error=${r6.error}`);
ok("parseImportedText BAD_LEN 记录 cleanLen", r6.cleanLen === 15, `len=${r6.cleanLen}`);

// 空输入 → EMPTY
const r7 = parseImportedText("");
ok("parseImportedText 空输入 EMPTY", r7.error === "EMPTY", `error=${r7.error}`);

// 非法字符（9×9 里出现字母）→ 剥离后长度不符 BAD_LEN（字母被 clean 剔除）
const r8 = parseImportedText("abc");
ok("parseImportedText 纯字母 EMPTY", r8.error === "EMPTY", `error=${r8.error}`);

// ===== V1.0.4：round-trip + 长度不变式 =====
for (const size of [4, 6, 9]) {
  const { puzzle } = generatePuzzle(size, size === 4 ? 10 : size === 6 ? 18 : 27, "engine-test:rt:" + size);
  const sd = toSDString(puzzle, size);
  const proto = `SD${size}:${sd}`;
  ok(`size=${size} 协议串长度=前缀4+size²`, proto.length === 4 + size * size, `len=${proto.length}, sd=${proto}`);
  const back = parseImportedText(proto);
  ok(`size=${size} 协议串 round-trip 与原始 givens 一致`,
    back.board && back.board.every((v, i) => v === puzzle[i]), `error=${back.error}`);
}

// ===== V1.3.0：analyzeTechniques 题面技巧画像 =====
// 4×4 简单题（少空格）：应能完整推理链判定，返回非空集合且仅含已知技巧名
{
  const { puzzle, solution } = generatePuzzle(4, 12, "engine-test:tech:simple");
  const techs = analyzeTechniques(puzzle, 4);
  ok("4×4 简单题画像非空", techs.length > 0, `techs=${techs.join(",")}`);
  const known = new Set(["唯一候选", "宫内排除", "行排除", "列排除"]);
  ok("画像仅含诚实已知技巧", techs.every((t) => known.has(t)), `techs=${techs.join(",")}`);
  // 缓存命中：同题二次调用返回同一引用内容
  const techs2 = analyzeTechniques(puzzle, 4);
  ok("画像缓存命中（内容一致）", techs.join("|") === techs2.join("|"));
}
// 卡住不抛错：用解（已填满）调用 → 返回空数组（无空格无可推）
{
  const { solution } = generatePuzzle(4, 12, "engine-test:tech:full");
  const techs = analyzeTechniques(solution, 4);
  ok("已解盘面画像为空", techs.length === 0, `techs=${techs.join(",")}`);
}
// 空盘面（全空格）不抛错且能推进
{
  const empty = new Array(16).fill(0);
  const techs = analyzeTechniques(empty, 4);
  ok("空盘面画像可推进不抛错", Array.isArray(techs), `len=${techs.length}`);
}
// 去重：同一题多次命中同一技巧只记一次（画像长度 ≤ 3）
{
  const { puzzle } = generatePuzzle(4, 10, "engine-test:tech:dedup");
  const techs = analyzeTechniques(puzzle, 4);
  ok("画像去重（≤3 种）", techs.length <= 3 && new Set(techs).size === techs.length, `techs=${techs.join(",")}`);
}

// ===== V1.4.0：进阶技巧识别器（显性数对 / X-Wing） =====
// 夹具盘 1：X-Wing（6×6，唯一解），迭代中 findLogicStep 应返回 X-Wing 且落子与解一致
{
  const board = [0,0,0,0,0,6, 1,0,0,2,0,0, 0,0,0,1,2,0, 0,0,0,0,0,0, 3,0,0,5,4,0, 0,4,2,0,0,0];
  const sol = solve(board.slice(), 6, 1)[0];
  ok("X-Wing 夹具唯一解", !!sol);
  const g = board.slice();
  let sawXwing = false, allLegal = true;
  for (let k = 0; k < 40; k++) {
    const s = findLogicStep(g, 6);
    if (!s) break;
    if (s.technique === "X-Wing") sawXwing = true;
    if (sol[s.index] !== s.value) allLegal = false;
    g[s.index] = s.value;
  }
  ok("X-Wing 识别命中", sawXwing);
  ok("X-Wing 盘全部落子合法且解完", allLegal && !g.some((x) => !x));
}
// 夹具盘 2：显性数对（6×6，唯一解），迭代中 findLogicStep 应返回显性数对且落子正确
{
  const board = [0,0,4,0,2,0, 0,0,0,6,0,4, 0,0,0,5,0,0, 0,6,0,4,0,3, 0,0,0,0,1,0, 3,0,0,0,0,0];
  const sol = solve(board.slice(), 6, 1)[0];
  ok("显性数对夹具唯一解", !!sol);
  const g = board.slice();
  let sawPair = false, allLegal = true;
  for (let k = 0; k < 40; k++) {
    const s = findLogicStep(g, 6);
    if (!s) break;
    if (s.technique === "显性数对") sawPair = true;
    if (sol[s.index] !== s.value) allLegal = false;
    g[s.index] = s.value;
  }
  ok("显性数对识别命中", sawPair);
  ok("显性数对盘全部落子合法且解完", allLegal && !g.some((x) => !x));
}
// null 语义（oracle I2/I5）：卡住盘（基础+进阶都用尽）findLogicStep 返回 null 不抛错、无错误落子
{
  const board = [1,2,3,4,5,0, 0,5,6,0,2,3, 0,0,0,5,6,4, 5,6,0,0,3,0, 0,1,2,0,4,5, 0,0,5,3,1,0]; // LESSON_DATA.nakedPair 快照
  const r = findLogicStep(board.slice(), 6);
  ok("卡住盘返回 null 或有效步（不抛错）", r === null || !!r.index, `r=${JSON.stringify(r)}`);
}
// 不抢占（oracle I5）：基础可解题首次返回基础技巧（显性数对等不抢先）
{
  const { puzzle } = generatePuzzle(4, 12, "engine-test:adv:basic");
  const first = findLogicStep(puzzle.slice(), 4);
  ok("基础可解题首次返回基础技巧", first !== null, first ? `first=${first.technique}` : "null");
  // 4×4 简单题不可能在首次就触发进阶技巧（空间不足以支撑数对/X-Wing）
  const basics = new Set(["唯一候选", "宫内排除", "行排除", "列排除"]);
  ok("简单盘首次不触发进阶识别器", basics.has(first.technique), `first=${first.technique}`);
}
// 命名一致性（oracle I5）：显性数对 / X-Wing 名字与 LESSON map / ADV_SKILLS.name 对齐（防 B2 漂移）
{
  ok("显性数对映射裸数对", TECHNIQUE_LESSON_MAP["显性数对"] === "nakedPair");
  ok("X-Wing 映射 xwing", TECHNIQUE_LESSON_MAP["X-Wing"] === "xwing");
  ok("显性数对名对齐 ADV_SKILLS", ADV_SKILLS.find((s) => s.key === "nakedPair")?.name === "显性数对");
  ok("X-Wing 名对齐 ADV_SKILLS", ADV_SKILLS.find((s) => s.key === "xwing")?.name === "X-Wing");
}

// V1.5.0 隐性数对模式标注
// B1 一致性：LESSON map + adv 组 techniques 均含「隐性数对」（V1.4.0 裁剪时遗漏，V1.5.0 B1 补回）
{
  ok("隐性数对映射 hiddenPair", TECHNIQUE_LESSON_MAP["隐性数对"] === "hiddenPair");
  ok("隐性数对入 adv 组", TECHNIQUE_GROUPS.find((g) => g.id === "adv")?.techniques.includes("隐性数对"));
  ok("隐性数对名对齐 ADV_SKILLS", ADV_SKILLS.find((s) => s.key === "hiddenPair")?.name === "隐性数对");
}
// B2：手工构造盘（findLogicStep 卡住 + findHiddenPairPattern 确定性命中）——不依赖教学盘作 fixture
{
  const board = [0,0,0,0,0,0,0,5,0,4,1,0,0,2,3,0,0,0,0,1,5,0,0,0,5,0,4,0,0,1,0,4,1,6,0,0]; // generatePuzzle(6,18) 挖格衍生
  ok("人工盘 findLogicStep 卡住", findLogicStep(board.slice(), 6) === null);
  const p = findHiddenPairPattern(board.slice(), 6);
  ok("人工盘命中隐性数对", p !== null && p.unitKind === "col" && p.unitIdx === 0, `p=${JSON.stringify(p)}`);
  ok("隐性数对藏身格", !!p && p.cells[0] === 0 && p.cells[1] === 12, p ? `cells=${p.cells}` : "null");
  ok("隐性数对数字对", !!p && p.values[0] === 1 && p.values[1] === 4, p ? `values=${p.values}` : "null");
  ok("重复调用稳定", !!p && JSON.stringify(p) === JSON.stringify(findHiddenPairPattern(board.slice(), 6)));
  // I1：analyzeTechniques 命中即 add「隐性数对」
  const tips = analyzeTechniques(board.slice(), 6);
  ok("analyzeTechniques 含隐性数对", tips.includes("隐性数对"), `tips=${JSON.stringify(tips)}`);
}
// 显性数对不误报 + 空盘/已解盘 null（oracle N1 B2/I6）
{
  const np = LESSON_DATA.nakedPair.board;
  ok("裸数对教学盘 findLogicStep 非卡住", findLogicStep(np.slice(), 6) !== null);
  ok("裸数对盘不误报隐性", findHiddenPairPattern(np.slice(), 6) === null);
  ok("空盘无模式", findHiddenPairPattern(new Array(36).fill(0), 6) === null);
  const solved = [1,2,3,4,5,6,4,5,6,1,2,3,2,3,1,6,4,5,5,6,4,3,1,2,3,1,2,5,6,4,6,4,5,2,3,1];
  ok("已解盘无模式", findHiddenPairPattern(solved.slice(), 6) === null);
}

// V1.10.0 B7 进阶技巧盘轮换 advSkillsFor（日期驱动零存储）
{
  const keys = ADV_SKILLS.map((s) => s.key);
  const day = (ds) => advSkillsFor(ds).map((s) => s.key);
  const a = day("2026-09-28");
  const b = day("2026-09-29");
  ok("同日返回 2 个", a.length === 2, `len=${a.length}`);
  ok("同日不重复", a[0] !== a[1], `${a}`);
  ok("相邻天组合不同", !a.some((k) => b.includes(k)), `A=${a} B=${b}`);
  // N1：连续 12 天 i1 集合 = 全部 12 个技巧（对应「12 天遍历全部 12 个」承诺）
  const i1s = new Set();
  for (let i = 0; i < 12; i++) i1s.add(advSkillsFor(`2026-09-${String(i + 1).padStart(2, "0")}`)[0].key);
  ok("12 天 i1 覆盖全部 12 个技巧", i1s.size === 12 && [...i1s].every((k) => keys.includes(k)), `size=${i1s.size}`);
  // 12 天窗口内任意两天组合唯一
  const combos = new Set();
  for (let i = 0; i < 12; i++) combos.add(day(`2026-09-${String(i + 1).padStart(2, "0")}`).sort().join(","));
  ok("12 天窗口组合两两唯一", combos.size === 12, `size=${combos.size}`);
  // 边界：基准日稳定 + 负 epoch 前不抛错长度恒 2（防御性）
  ok("基准日稳定", advSkillsFor("2020-01-01").length === 2 && advSkillsFor("2020-01-02")[0].key !== advSkillsFor("2020-01-01")[0].key);
  ok("负 epoch 前安全", advSkillsFor("1969-12-31").length === 2, `${day("1969-12-31")}`);
}

console.log(`\n引擎单测 ${failed ? "FAIL " + failed : "全部通过"}`);
process.exit(failed ? 1 : 0);
