// 教学内容数据：16 阶技巧阶梯、成就、训练地图关卡、规则教学步骤。
// 措辞遵循「教学与训练」语系，不出现竞技/游戏化表述。

import type { Size } from "./sudoku";

export interface Technique {
  key: string;
  name: string;
  emoji: string;
  brief: string;
  /** 讲解正文（教学关引导用） */
  steps: string[];
  tier: "base" | "adv";
  /** 建议适龄段 */
  grade: string;
  size: Size;
}

export const BASE_SKILLS: Technique[] = [
  {
    key: "boxElim",
    name: "单宫排除",
    emoji: "🔍",
    brief: "在一个宫里，把不可能的格子划掉，剩下的就是答案",
    grade: "K1-3",
    tier: "base",
    size: 4,
    steps: [
      "先看这一个宫：数字 3 已经出现在同一行里，所以这一行的空格都不能再放 3。",
      "再看列：同列已有 3，这一列的空格也排除了。",
      "宫里剩下的唯一空格，就是 3 的位置 —— 点它。",
    ],
  },
  {
    key: "rowColElim",
    name: "行列排除",
    emoji: "📏",
    brief: "一整行或一整列里，一个数字只剩一个落脚处",
    grade: "K1-3",
    tier: "base",
    size: 4,
    steps: [
      "把视线移到整一行：这行还缺数字 2。",
      "逐个空格检查它的列和宫 —— 已经有 2 的不能放。",
      "排除后只剩一个空位，把 2 填进去。",
    ],
  },
  {
    key: "blockElim",
    name: "区块占位",
    emoji: "🧱",
    brief: "某个数字在宫里只能站在一行，就能挤掉别处的位置",
    grade: "K2-4",
    tier: "base",
    size: 4,
    steps: [
      "看这个宫里的数字 4：它只能落在上面那一行的两个格子里。",
      "虽然还不知道具体是哪一格，但这一行的其他宫就不能再放 4 了。",
      "用这条「区块结论」去排除别处，找到新的落点。",
    ],
  },
  {
    key: "crossElim",
    name: "交叉排除",
    emoji: "✖️",
    brief: "行和列一起看，两条线索交叉锁定唯一格",
    grade: "K2-4",
    tier: "base",
    size: 4,
    steps: [
      "先按行排除一遍，记下哪些格子被划掉了。",
      "再按列排除一遍。",
      "两次线索交叉之后，还能站住的格子只有一个 —— 就是它。",
    ],
  },
];

export const ADV_SKILLS: Technique[] = [
  { key: "uniqueElim", name: "唯一余数", emoji: "💎", brief: "一格所在行列宫已出现其余全部数字", grade: "K3-5", tier: "adv", size: 6, steps: ["数一数这一格的同行、同列、同宫里一共出现过几个不同数字。", "如果只差一个数字没出现，那这一格只能是它。"] },
  { key: "xwing", name: "X-Wing", emoji: "🦋", brief: "两行里同一数字都只有两个位置且对齐成矩形", grade: "K4-6", tier: "adv", size: 6, steps: ["找两行，数字 7 在每行都只可能落在两个格子上。", "如果这四个格子刚好落在同样的两列，就形成一个矩形。", "那么这两列的其他格子都不能再放 7。"] },
  { key: "nakedPair", name: "显性数对", emoji: "👯", brief: "两格候选完全相同，锁死这两个数字", grade: "K3-5", tier: "adv", size: 6, steps: ["同一单元里有两格的候选都只有 3 和 5。", "它们俩必然一个 3 一个 5，把这个单元其他格子里的 3 和 5 都划掉。"] },
  { key: "hiddenPair", name: "隐性数对", emoji: "🙈", brief: "两个数字只藏在同样两格里", grade: "K4-6", tier: "adv", size: 6, steps: ["在这条列里，数字 2 和 8 都只能落在同样两个格子。", "那这两格就被 2、8 占用，其他候选可以清掉。"] },
  { key: "nakedTriple", name: "显性三链", emoji: "🔺", brief: "三格共享三个数字，整体封锁", grade: "K4-6", tier: "adv", size: 6, steps: ["三格的候选合起来只有 1、4、6 三个数字。", "这三个数字被这三格包圆，同单元其他格不能再有它们。"] },
  { key: "hiddenTriple", name: "隐性三链", emoji: "🌀", brief: "三个数字只出现在三格中", grade: "K4-6", tier: "adv", size: 6, steps: ["这个宫里，数字 5、7、9 分别只能待在同样三格里。", "这三格成为它们的专属位置，多余候选清除。"] },
  { key: "xyWing", name: "XY-Wing", emoji: "🐝", brief: "三格双候选串成一条因果链", grade: "K4-6", tier: "adv", size: 6, steps: ["找到一个枢纽格候选为 X/Y，两个翅膀分别为 X/Z、Y/Z。", "无论枢纽取 X 还是 Y，两个翅膀里必有一个是 Z。", "于是同时看到两个翅膀的格子都不能放 Z。"] },
  { key: "swordfish", name: "剑鱼", emoji: "🗡️", brief: "三行三列互相咬合的定位网", grade: "K5-6", tier: "adv", size: 6, steps: ["数字 6 在三行里各自只出现在两到三个位置。", "这些位置刚好落在同样三列上，形成一张网。", "这三列的其他格子都要排除 6。"] },
  { key: "uniqueRect", name: "唯一矩形", emoji: "▦", brief: "避免题目出现双解的形状", grade: "K5-6", tier: "adv", size: 6, steps: ["四格构成矩形，其中三格候选都是 A/B。", "若第四格也能填 A 或 B，题目就会有两个答案。", "所以第四格必须排除 A、B 之外的分支。"] },
  { key: "wWing", name: "W-Wing", emoji: "🕊️", brief: "强链加弱链组成的 W 形推理", grade: "K5-6", tier: "adv", size: 6, steps: ["两格都只有 A/B，且各自所在列把 A 逼成强关系。", "两格通过一条不含 A 的链路相连。", "同时看到两格的位子不能放 A。"] },
  { key: "chains", name: "推理链", emoji: "⛓️", brief: "一步推一步，长链定位", grade: "K5-6", tier: "adv", size: 6, steps: ["假设某格不是 4，顺着候选一路推下去。", "推出矛盾，说明最初的假设错了。", "这一格必定是 4。"] },
  { key: "forcing", name: "分情况验证", emoji: "🧭", brief: "把每个可能都走一遍，殊途同归", grade: "K6", tier: "adv", size: 6, steps: ["这一格可能是 2、5 或 8。", "分别假设三种情况往下推。", "三条路都指向同一个结论，那就直接写下它。"] },
];

export const ALL_SKILLS: Technique[] = [...BASE_SKILLS, ...ADV_SKILLS];

export function skillByKey(key: string): Technique | undefined {
  return ALL_SKILLS.find((s) => s.key === key);
}

/** 首页展示的适龄基础技巧（4 个） */
export const HOME_SKILL_KEYS = BASE_SKILLS.map((s) => s.key);

export interface LessonStep {
  /** 引导文案 */
  text: string;
  /** 目标格索引（引导孩子点的空格） */
  cell: number;
  /** 该格应填的数字 */
  num: number;
  /** 高亮线索格索引 */
  hl: number[];
}

export interface LessonData {
  /** 盘面规格（4×4 → 4，6×6 → 6） */
  size: Size;
  /** 真实教学盘（0 = 空格），迁移自老版本节点验证盘面 */
  board: number[];
  /** 分步引导（每步：点目标格 → 点数字 → 进入下一步） */
  steps: LessonStep[];
}

/** 16 个技巧教学关的真实盘面 + 分步引导数据（老版本 node 验证盘面逐字迁移） */
export const LESSON_DATA: Record<string, LessonData> = {
  boxElim: {
    size: 4,
    board: [1, 0, 3, 4, 3, 4, 0, 2, 2, 1, 4, 3, 4, 3, 2, 1],
    steps: [
      { text: "看左上这个宫（粗线框）：已经有 1、3、4，缺 2！点这个空格，再点数字 2。", cell: 1, num: 2, hl: [0, 1, 4, 5] },
      { text: "再看右上这个宫：已经有 3、4、2，缺 1！点这个空格，再点数字 1。", cell: 6, num: 1, hl: [2, 3, 6, 7] },
    ],
  },
  rowColElim: {
    size: 4,
    board: [1, 2, 0, 4, 3, 4, 1, 0, 2, 1, 4, 3, 4, 3, 2, 1],
    steps: [
      { text: "看这一行（浅蓝横排）：已经有 1、2、4，缺 3！点这个空格，再点数字 3。", cell: 2, num: 3, hl: [0, 1, 2, 3] },
      { text: "再看这一列（浅蓝竖列）：已经有 1、3、4，缺 2！点这个空格，再点数字 2。", cell: 7, num: 2, hl: [3, 7, 11, 15] },
    ],
  },
  blockElim: {
    size: 4,
    board: [2, 3, 0, 1, 4, 1, 2, 0, 1, 4, 3, 2, 3, 2, 1, 4],
    steps: [
      { text: "看这个宫（粗线框）：缺 3 和 4。右边的空格，它的竖列已经有 4 了，所以 4 只能放这里！点这个空格，再点数字 4。", cell: 2, num: 4, hl: [2, 3, 6, 7] },
      { text: "剩下这个空格：宫里只剩 3 了！点它，再点数字 3。", cell: 7, num: 3, hl: [2, 3, 6, 7] },
    ],
  },
  crossElim: {
    size: 4,
    board: [0, 2, 3, 0, 3, 4, 0, 0, 2, 1, 4, 3, 0, 0, 2, 1],
    steps: [
      { text: "看这个格子（右上角）：这一行缺 1、4，这一列缺 2、4，这个宫缺 1、2、4——行、列、宫交叉起来，只有 4 三个方向都缺！点这个空格，再点数字 4。", cell: 3, num: 4, hl: [0, 1, 2, 3, 7, 11, 15] },
      { text: "再看这个格子：这一行缺 1、2，这一列缺 2、4，这个宫缺 1、2、4——只有 2 三个方向都缺！点这个空格，再点数字 2。", cell: 7, num: 2, hl: [3, 4, 5, 6, 7, 11, 15] },
    ],
  },
  uniqueElim: {
    size: 6,
    board: [1, 2, 0, 4, 5, 6, 4, 5, 6, 1, 2, 0, 2, 3, 1, 5, 6, 4, 5, 6, 4, 0, 3, 1, 3, 1, 2, 6, 4, 5, 0, 4, 5, 3, 1, 2],
    steps: [
      { text: "看这个格子（浅蓝）：它所在的这一行缺 2、这一列缺 2、这个宫也缺 2——三个方向的线索都指向同一个数字 2！点这个空格，再点数字 2。", cell: 21, num: 2, hl: [3, 9, 15, 18, 19, 22, 23, 21] },
      { text: "再看这个格子：行、列、宫三个方向都缺 3，其它数字都被排除——填 3！点这个空格，再点数字 3。", cell: 2, num: 3, hl: [0, 1, 3, 4, 5, 8, 14, 20, 26, 32, 2] },
    ],
  },
  xwing: {
    size: 6,
    board: [0, 5, 0, 6, 1, 2, 0, 6, 2, 0, 5, 3, 6, 2, 5, 1, 3, 4, 0, 1, 0, 2, 6, 5, 5, 4, 1, 3, 2, 6, 2, 3, 6, 5, 4, 1],
    steps: [
      { text: "看第 1 行和第 4 行（浅蓝矩形）：数字 4 在它们里都只能放在第 1 列或第 3 列 → 4 被锁在这两行两列的矩形里！那第 2 行这个格子，它这一竖列里 4 已经被矩形占住，所以它不能填 4 → 只能填 1！点这个空格，再点数字 1。", cell: 6, num: 1, hl: [0, 2, 18, 20] },
      { text: "再看第 2 行：4 不能放刚才那格了，这一行只有这个位置能放 4 → 点它，再点数字 4。", cell: 9, num: 4, hl: [7, 8, 10, 11, 9] },
    ],
  },
  nakedPair: {
    size: 6,
    board: [1, 2, 3, 4, 5, 0, 0, 5, 6, 0, 2, 3, 0, 0, 0, 5, 6, 4, 5, 6, 0, 0, 3, 0, 0, 1, 2, 0, 4, 5, 0, 0, 5, 3, 1, 0],
    steps: [
      { text: "看这一行（浅蓝横排）：第 4、6 格都只能填 1 或 2——它们俩把 1、2「占位」了！那这一行其它格就不能再填 1、2。看第 3 格：它本来可以填 1、4，现在 1 被占 → 只能填 4！点这个空格，再点数字 4。", cell: 20, num: 4, hl: [18, 19, 20, 21, 22, 23] },
      { text: "再看数对里的这个格子：它这一竖列已经有 6、3、4、5、2 → 只剩 1 能填！点这个空格，再点数字 1。", cell: 23, num: 1, hl: [18, 19, 20, 21, 22, 23] },
    ],
  },
  hiddenPair: {
    size: 6,
    board: [1, 2, 0, 4, 0, 6, 4, 5, 6, 0, 0, 3, 0, 3, 0, 0, 6, 0, 5, 6, 4, 2, 3, 1, 0, 0, 0, 6, 4, 0, 0, 0, 0, 0, 1, 2],
    steps: [
      { text: "看这一列（浅蓝竖列）：数字 1 和 2 都只能放在这两个格子（第 3、5 格）——它俩把 1、2 悄悄藏起来了（这叫「隐性数对」）！那这两格就是 1、2，其它候选数都不要。看这个格子：它本来还能填 3、5，现在 1、2 锁定 → 3、5 都不能放这！那数字 5 在这一列还能去哪？只剩这一格！点这个空格，再点数字 5。", cell: 32, num: 5, hl: [2, 8, 14, 20, 26, 32] },
      { text: "数对锁定了 1、2 就在这两格！看这个格子：它这一行已经有 3、6，这一列已经有 6、4、5 → 只剩 1、2。先填 1，那数对另一格自然就是 2！点这个空格，再点数字 1。", cell: 14, num: 1, hl: [2, 8, 14, 20, 26, 32] },
    ],
  },
  nakedTriple: {
    size: 6,
    board: [3, 4, 5, 6, 2, 0, 2, 1, 6, 3, 0, 5, 4, 3, 0, 0, 0, 0, 5, 6, 2, 0, 3, 0, 1, 5, 3, 0, 0, 2, 6, 2, 4, 5, 1, 3],
    steps: [
      { text: "看这一宫（浅蓝高亮）：第 3、4、6 格都只能填 1、4、6 —— 它们仨把 1、4、6「占位」了！那这一宫里其它格就不能再填 1、4、6。看第 1 格：它本来还可以填别的数，现在 1、4、6 被占 → 只能填 2！点这个空格，再点数字 2。", cell: 15, num: 2, hl: [17, 21, 23, 15] },
      { text: "三数组还在占位！看这一宫里第 2 格：它本来也可以填 1、4、6 里的数，现在被三数组排除 → 只能填 5！点这个空格，再点数字 5。", cell: 16, num: 5, hl: [17, 21, 23, 16] },
    ],
  },
  hiddenTriple: {
    size: 6,
    board: [0, 2, 5, 0, 0, 0, 4, 1, 3, 0, 0, 0, 0, 6, 2, 3, 1, 0, 3, 4, 1, 0, 0, 2, 2, 0, 6, 4, 3, 1, 1, 3, 4, 5, 2, 6],
    steps: [
      { text: "看这一宫（浅蓝高亮）：数字 1、2、3 都只藏在这三个格子里（第 1、3、4 格）——这叫「隐性三数组」！那这三格就是 1、2、3，别的数字都不能放这。看第 2 格：数字 4 本来还能放这里，现在被三数组挤走 → 数字 4 在这一宫里只剩这一格！点这个空格，再点数字 4。", cell: 4, num: 4, hl: [3, 5, 9, 4] },
      { text: "三数组还在锁定！看第 5 格：数字 6 本来还能放三数组的格子里，现在被挤走 → 在这一宫里只剩这一格能放 6！点这个空格，再点数字 6。", cell: 10, num: 6, hl: [3, 5, 9, 10] },
    ],
  },
  xyWing: {
    size: 6,
    board: [3, 0, 2, 0, 1, 0, 6, 0, 1, 0, 2, 0, 1, 0, 6, 2, 4, 5, 5, 2, 4, 1, 0, 0, 2, 6, 0, 0, 5, 1, 4, 0, 5, 6, 3, 2],
    steps: [
      { text: "XY-Wing 像两个翅膀连着一个尖（浅蓝高亮）！pivot 尖格只能填 6 或 3，左翅膀只能填 6 或 4，右翅膀只能填 3 或 4。如果尖格是 6，左翅膀就是 4；如果尖格是 3，右翅膀就是 4——不管哪种，两个翅膀里至少有一个是 4！它们一起看到的这个空格就不能是 4，只能填 5！点这个空格，再点数字 5。", cell: 3, num: 5, hl: [23, 5, 11, 3] },
      { text: "再来一次「XY-Wing」：新尖格只能填 4 或 6，它的两个翅膀一起看到这个空格 → 排除 3 后只能填 4！点这个空格，再点数字 4。", cell: 11, num: 4, hl: [5, 9, 23, 11] },
    ],
  },
  swordfish: {
    size: 6,
    board: [4, 1, 0, 5, 0, 2, 0, 5, 6, 4, 0, 1, 6, 3, 5, 2, 1, 0, 0, 4, 2, 6, 5, 3, 0, 2, 1, 0, 0, 6, 0, 6, 4, 1, 0, 0],
    steps: [
      { text: "数字 3 在玩捉迷藏！看第 1、2、6 行（浅蓝高亮）：数字 3 只可能出现在第 1、3、5 列——三行一起正好盖住这三列，这叫「剑鱼」！那这三列里、这三行之外的格子，都不能是 3。看这个空格：它本来 3 是候选，现在被剑鱼排除 → 只能填 5！点这个空格，再点数字 5。", cell: 24, num: 5, hl: [2, 4, 6, 10, 30, 34, 24] },
      { text: "剑鱼还在！看这个空格：3 也被排除 → 只能填 4！点这个空格，再点数字 4。", cell: 28, num: 4, hl: [2, 4, 6, 10, 30, 34, 28] },
    ],
  },
  uniqueRect: {
    size: 6,
    board: [4, 0, 0, 5, 0, 1, 0, 0, 0, 4, 0, 6, 0, 0, 1, 2, 0, 4, 6, 2, 4, 3, 1, 5, 1, 4, 0, 6, 5, 2, 2, 0, 5, 1, 4, 3],
    steps: [
      { text: "看这四个格子（浅蓝高亮）：它们组成一个「唯一矩形」！前三个格子都只能填 2 或 3——如果第四个格子也填 2 或 3，就会出现两个答案（双解陷阱）！所以第四个格子只能填 6！点这个空格，再点数字 6。", cell: 2, num: 6, hl: [2, 4, 8, 10] },
      { text: "又一个「唯一矩形」！看这四个格子：前三个格子都只能填 3 或 5，如果第四个也填它们就会双解 → 它只能填 1！点这个空格，再点数字 1。", cell: 7, num: 1, hl: [6, 7, 12, 13] },
    ],
  },
  wWing: {
    size: 6,
    board: [0, 1, 5, 0, 4, 2, 0, 4, 3, 1, 0, 0, 1, 5, 0, 2, 0, 4, 3, 2, 4, 0, 1, 0, 0, 6, 1, 0, 2, 3, 5, 3, 2, 4, 0, 1],
    steps: [
      { text: "看这两个格子（浅蓝高亮）：都只能填 5 或 6。数字 5 在左边格子的行里只有两个位置，右边格子的行里也只有两个位置，这两个位置还夹着一条链——所以这两个格子不能同时都是 5，至少有一个是 6！那它们一起看到的这个空格就不能是 6，只能填 3！点这个空格，再点数字 3。", cell: 3, num: 3, hl: [10, 21, 11, 23, 3] },
      { text: "又一个 W-Wing！同样的两个格子和链条 → 它们一起看到的这个空格也排除 6，只能填 3！点这个空格，再点数字 3。", cell: 16, num: 3, hl: [10, 21, 11, 23, 16] },
    ],
  },
  chains: {
    size: 6,
    board: [0, 6, 5, 3, 0, 0, 3, 4, 0, 5, 6, 0, 4, 1, 3, 2, 5, 6, 0, 2, 6, 4, 1, 3, 0, 3, 4, 6, 2, 0, 6, 5, 0, 0, 0, 4],
    steps: [
      { text: "这是「链与着色」！数字 1 的候选格子手拉手连成一条链（浅蓝高亮）：链上格子交替染成 A、B 两色。看这两个格子（同一列）：它们颜色相同——如果这种颜色是真的，这两个格子就都是数字 1，冲突啦！所以这种颜色的格子都不能是 1。看这个空格：排除 1 后只能填 2！点这个空格，再点数字 2。", cell: 0, num: 2, hl: [0, 11, 29, 32] },
    ],
  },
  forcing: {
    size: 6,
    board: [4, 0, 2, 0, 0, 0, 6, 0, 5, 3, 4, 0, 3, 2, 6, 1, 5, 0, 0, 4, 1, 0, 0, 3, 2, 6, 3, 4, 1, 5, 1, 5, 4, 2, 3, 6],
    steps: [
      { text: "这是「强制链」！看这个格子（浅蓝高亮）：它只能填 1 或 3。我们试试看：如果它填 1，推理下去这个空格只能填 5；如果它填 3，再推理下去，这个空格还是只能填 5！不管哪种可能，答案都一样 → 这个空格直接填 5！点这个空格，再点数字 5。", cell: 3, num: 5, hl: [1, 3, 4, 5, 7, 11, 17, 18, 21] },
    ],
  },
};

export interface Achievement {
  key: string;
  name: string;
  emoji: string;
  desc: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { key: "firstWin", name: "第一步", emoji: "🌟", desc: "完成第一次练习" },
  { key: "threeStars", name: "完美推理", emoji: "✨", desc: "拿到一次三星评价" },
  { key: "noHint", name: "独立解题", emoji: "🧠", desc: "不用提示完成一道难题" },
  { key: "size4", name: "四格上手", emoji: "🔷", desc: "完成 4×4 练习" },
  { key: "size6", name: "六格熟练", emoji: "🔶", desc: "完成 6×6 练习" },
  { key: "size9", name: "九格挑战", emoji: "💠", desc: "完成 9×9 练习" },
  { key: "streak3", name: "三日坚持", emoji: "🔥", desc: "连续打卡 3 天" },
  { key: "streak7", name: "一周习惯", emoji: "📅", desc: "连续打卡 7 天" },
  { key: "dailyFirst", name: "今日打卡", emoji: "🌤️", desc: "完成一次每日挑战" },
  { key: "skill1", name: "学会一招", emoji: "🎯", desc: "点亮第一个技巧徽章" },
  { key: "skillAll4", name: "基础扎实", emoji: "🏅", desc: "点亮全部 4 个基础技巧" },
  { key: "adv1", name: "进阶入门", emoji: "💎", desc: "点亮第一个进阶技巧" },
  { key: "advAll12", name: "思维大师", emoji: "👑", desc: "点亮全部 12 个进阶技巧" },
  { key: "mistakeClear", name: "查漏补缺", emoji: "📕", desc: "重练并掌握一道错题" },
  { key: "mapHalf", name: "半途不歇", emoji: "🗺️", desc: "完成训练地图 5 级" },
  { key: "mapAll", name: "全程毕业", emoji: "🏆", desc: "完成训练地图全部 10 级" },
];

export interface MapLevel {
  i: number;
  code: string;
  name: string;
  size: Size;
  level: "easy" | "normal" | "hard";
  skillKey?: string;
}

export const MAP_LEVELS: MapLevel[] = [
  { i: 0, code: "1-1", name: "四格 · 认识盘面", size: 4, level: "easy", skillKey: "boxElim" },
  { i: 1, code: "1-2", name: "四格 · 行列配合", size: 4, level: "easy", skillKey: "rowColElim" },
  { i: 2, code: "1-3", name: "四格 · 稳步提速", size: 4, level: "normal" },
  { i: 3, code: "2-1", name: "六格 · 区块占位", size: 6, level: "easy", skillKey: "blockElim" },
  { i: 4, code: "2-2", name: "六格 · 交叉排除", size: 6, level: "normal", skillKey: "crossElim" },
  { i: 5, code: "2-3", name: "六格 · 综合演练", size: 6, level: "normal" },
  { i: 6, code: "3-1", name: "九格 · 初探全局", size: 9, level: "normal" },
  { i: 7, code: "3-2", name: "九格 · 数对与链", size: 9, level: "hard", skillKey: "nakedPair" },
  { i: 8, code: "3-3", name: "九格 · 高阶推理", size: 9, level: "hard", skillKey: "xyWing" },
  { i: 9, code: "3-4", name: "九格 · 毕业挑战", size: 9, level: "hard" },
];

export const RULE_STEPS: { title: string; text: string; highlight: number[]; board: number[] }[] = [
  {
    title: "每一行都有全部数字",
    text: "这是一个 4×4 盘面，每行要填入 1、2、3、4，不能重复也不能少。",
    highlight: [0, 1, 2, 3],
    board: [1, 2, 3, 4, 3, 4, 1, 0, 2, 1, 4, 3, 4, 3, 0, 2],
  },
  {
    title: "每一列也一样",
    text: "竖着看每一列，同样要凑齐 1 到 4，一个都不能重复。",
    highlight: [4, 8, 12, 13],
    board: [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1],
  },
  {
    title: "每个粗线小方块也要齐",
    text: "深色粗线围起来的 2×2 小方块（叫「宫」），里面同样是 1 到 4 各一个。",
    highlight: [0, 1, 4, 5],
    board: [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1],
  },
  {
    title: "用排除法找答案",
    text: "空格右下角这一格：同行有 4、同列有 2、同宫有 3，所以它只能是 1。",
    highlight: [15],
    board: [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 0],
  },
];

/** 自由练习的三档难度：每档绑定固定规格，避免跨规格不可比的组合 */
export const FREE_TIERS: { id: "easy" | "normal" | "hard"; size: Size; name: string; spec: string; desc: string; given: number }[] = [
  { id: "easy", size: 4, name: "简单", spec: "4×4", desc: "四宫格，认识行列宫", given: 10 },
  { id: "normal", size: 6, name: "普通", spec: "6×6", desc: "六宫格，练排除推理", given: 18 },
  { id: "hard", size: 9, name: "困难", spec: "9×9", desc: "九宫格，用技巧与笔记", given: 27 },
];

/** 各规格下的线索数（训练地图、每日挑战等内部指定规格的场景使用） */
export const LEVEL_GIVEN: Record<"easy" | "normal" | "hard", Record<Size, number>> = {
  easy: { 4: 10, 6: 21, 9: 33 },
  normal: { 4: 8, 6: 18, 9: 30 },
  hard: { 4: 6, 6: 15, 9: 27 },
};

export const HINT_LIMIT: Record<Size, number> = { 4: Infinity, 6: 3, 9: 2 };

/** 每日挑战周轮换难度档 */
export const DAILY_DIFFS: ("easy" | "normal" | "hard")[] = ["normal", "easy", "easy", "normal", "normal", "normal", "hard"];

export function dailyFor(dateStr: string): { level: "easy" | "normal" | "hard"; size: Size } {
  const d = new Date(dateStr + "T00:00:00");
  const idx = (d.getDay() + 6) % 7;
  const level = DAILY_DIFFS[idx];
  const size: Size = level === "hard" ? 9 : level === "easy" ? 4 : 6;
  return { level, size };
}
