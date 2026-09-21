/* ============================================================
   数学口算 content.js — 双模式内容切分源（V0.4 M2）
   ------------------------------------------------------------
   - 顺序必须与 main.js 的 POINTS 定义顺序一致（Object.keys 顺序 = 插入顺序）
     → free_units=3 切分时取前 3 条 = 一年级前 3 知识点（§9.4 默认决议）
   - 构建期由 write_static_data_js 解析 window.CONTENT_DATA：
       offline → content[: free_units]（3 条）
       online  → content 全量（24 条）
   - 注：main.js 出题引擎仍读内嵌 POINTS（核心逻辑不重构）；
     content 数组供在线范围控制/审计使用（C 批接入服务端时消费）
   ============================================================ */
window.CONTENT_DATA = [
  { "id": "g1_10addsub", "name": "10以内加减法", "grade": 1 },
  { "id": "g1_20add", "name": "20以内进位加法", "grade": 1 },
  { "id": "g1_20sub", "name": "20以内退位减法", "grade": 1 },
  { "id": "g1_100", "name": "整十数加减", "grade": 1 },
  { "id": "g2_mult", "name": "表内乘法", "grade": 2 },
  { "id": "g2_div", "name": "表内除法", "grade": 2 },
  { "id": "g2_100", "name": "100以内加减法", "grade": 2 },
  { "id": "g2_mixed", "name": "混合运算", "grade": 2 },
  { "id": "g3_wan", "name": "万以内加减法", "grade": 3 },
  { "id": "g3_mult1", "name": "整十整百乘一位数", "grade": 3 },
  { "id": "g3_mult2", "name": "两位数乘两位数", "grade": 3 },
  { "id": "g3_div1", "name": "一位数除法", "grade": 3 },
  { "id": "g3_frac", "name": "同分母分数加减", "grade": 3 },
  { "id": "g4_big", "name": "大数改写", "grade": 4 },
  { "id": "g4_simple", "name": "运算定律简算", "grade": 4 },
  { "id": "g4_div2", "name": "整十数除法", "grade": 4 },
  { "id": "g4_dec", "name": "小数加减法", "grade": 4 },
  { "id": "g5_decmul", "name": "小数乘法", "grade": 5 },
  { "id": "g5_decdiv", "name": "小数除法", "grade": 5 },
  { "id": "g5_frac1", "name": "约分与互化", "grade": 5 },
  { "id": "g5_frac2", "name": "异分母分数加减", "grade": 5 },
  { "id": "g6_fracmul", "name": "分数乘法", "grade": 6 },
  { "id": "g6_fracdiv", "name": "分数除法", "grade": 6 },
  { "id": "g6_pct", "name": "百分数互化", "grade": 6 },
  { "id": "g6_ratio", "name": "化简比求比值", "grade": 6 }
];