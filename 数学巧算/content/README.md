# 数学巧算 · 教程库（content SSOT）

> 本目录是教程内容的**单源真值**（SSOT），由 `docs/草稿/小学数学巧算_教程/*.md` 结构化而来。
> 需求/设计见 `../docs/数学巧算_需求分析与功能设计文档.md` §1.2/§3。

## 文件清单

| 文件 | 阶段 | 年级 | 讲次 | 状态 |
|---|---|---|---|---|
| `stages.json` | — | — | 总索引 | ✅ |
| `stage1_凑十破十平十.json` | 1 | 一年级 | 4 讲 | 待结构化 |
| `stage2_凑整与搬家.json` | 2 | 二年级 | 4 讲 | 待结构化 |
| `stage3_拆数与特殊数.json` | 3 | 三年级 | 4 讲 | 待结构化 |
| `stage4_简便运算系统化.json` | 4 | 四年级（枢纽） | 9 讲 | 待结构化 |
| `stage5_小数巧算.json` | 5 | 五年级 | 4 讲 | 待结构化 |
| `stage6_分数巧算.json` | 6 | 六年级 | 4 讲 | 待结构化 |
| `stageX_思维进阶.json` | 拓展 | 四~六年级 | 3 讲 | 待结构化 |

## lesson JSON Schema（每讲七步，对应教程规划 §二）

```jsonc
{
  "stage": 4,                // 阶段号（1-6 或 "X" 拓展）
  "lesson_id": "s4l3",       // 唯一 id：s{阶段}l{讲次}
  "title": "乘法结合律 · 25/125 配对",
  "goal": "学习目标（一句话）",
  "principle": "核心原理一句话（讲不出原理不算学会）",
  "prereq": ["前置知识1", "前置知识2"],          // ① 前置知识检查
  "situation": { "text": "生活/游戏情境", "question": "让孩子有'算起来麻烦'的体验" },  // ② 情境引入
  "explore": { "model": "area|sticks|numberline|text", "steps": ["推导步骤1", "…"] },  // ③ 原理探究（直观模型）
  "method": { "rhyme": "口诀（简短可复述）", "steps": ["步骤化1", "…"] },              // ④ 方法要领
  "examples": [                                 // ⑤ 例题精讲（2-4 道由易到难，常规 vs 巧算对照）
    { "expr": "25×32×125", "normal": "常规算法路径", "smart": "巧算路径",
      "answer": 100000, "accepted": [100000], "why": "巧在哪（一句话）" }
  ],
  "mistakes": [                                 // ⑥ 变式与易错
    { "wrong": "错误写法", "reason": "算理原因" }
  ],
  "practice": {                                 // ⑦ 分层练习（基础/提高/挑战）
    "basic":     { "count": 5, "gen": "combo_basic",     "params": {} },
    "advance":   { "count": 5, "gen": "combo_advance",   "params": {} },
    "challenge": { "count": 3, "gen": "combo_challenge", "params": {} }
  },
  "answers": { "basic": [123, 456], "advance": [789, 0], "challenge": [0, 0] }   // 本讲参考答案（数值数组）
}
```

## stages.json 结构

```jsonc
{
  "schema_version": "1.0",
  "stages": [
    { "no": 1, "grade": "一年级", "theme": "20 以内加减", "file": "stage1_凑十破十平十.json",
      "lessons": ["s1l1", "s1l2", "s1l3", "s1l4"], "status": "todo" },
    // …阶段 2-6 + 拓展
  ]
}
```

## 规则与约定

1. **答案必须准确**：每题 answer/accepted 与 `docs/草稿/*_参考答案` 逐字核对；`normalizeInput()` 判定用数值等价（如 2000−1 展开式不接受，只收最终数值）。
2. **原理先行**：每讲 principle + explore.steps 不可省略；"为什么能这样算"必须落在运算律/数位原理，不写"记住就行"。
3. **improve 表单**：examples 的 why 字段一句话点明"巧在哪"。
4. **生成器引用**：practice.gen 引用 `src/assets/smart_gen.js` 的生成器名 + params（阶段 0 先写占位，实现时补全）。
5. **来源回标**：每个 stage JSON 顶部注释来源 md 文件名。