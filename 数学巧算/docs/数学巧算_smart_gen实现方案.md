# 数学巧算 · smart_gen.js 实现方案（v0.1 草案）

> 版本：v0.1 ｜ 日期：2026-09-27 ｜ 状态：设计草案（待评审，Oracle 只读咨询输出）
> 上游：`数学巧算/docs/数学巧算_需求分析与功能设计文档.md` §1.2/§1.3/§2.4/§4.1/§4.2/§4.3
> 参考：`数学巧算/content/stage*.json`（31 方法 × 3 档 = 93 个 gen 引用）、`RedTools/series/学科/数学口算/src/assets/generators.js`（702 行成熟模式）
> 本文档 = smart_gen.js 的实现蓝图；落地前先评审开放问题（§8.3）。

---

## 一、决策摘要（Oracle 评审结论）

| 决策点 | 结论 | 一句话理由 |
|---|---|---|
| **Q1 导出形态** | **双形态同源**：单源 `smart_gen.js` 写 UMD-IIFE 挂 `window.SMART_GENERATORS`；在线 React 用 3 行 ESM shim re-export | 与 generators.js 完全同构、Chrome 61 零风险、React 侧 shim 极薄 |
| **Q2 模块组织** | **按阶段拆 5 文件 + 1 工具核 + 1 ESM shim**：`sg_tools` + `sg_stage1_2` + `sg_stage3_4` + `sg_stage5_6` + `sg_stageX` + `smart_gen`(聚合 export) | 单文件 2000+ 行过大；离线 zip 多 script 顺序加载零开销，在线可打包合并 |
| **Q3 三档实现** | **方案 C 变体**：注册表 31 键（方法名），每键 `{gen_basic, gen_advance, gen_challenge}`；对外 `gen(genName)` 接受完整名（`ten_split_basic`），内部 split 分发 | content gen 名 1:1 映射零转换、validate case 96→31、错题本记录完整名 |
| **Q4 validate 组织** | **按方法族收敛 15 个校验核**：31 方法归 10 族，每族一个 `ensure*` 核，case 按 type dispatch | 避免线性膨胀 96 case；族核复用高、维护集中 |

---

## 二、文件与目录结构

```
数学巧算/src/assets/smart_gen/
├── smart_gen.js            # ★ 主入口（离线经典脚本）：UMD-IIFE 挂 window.SMART_GENERATORS
│                            #   聚合所有 stage 注册 + export {list, gen, validate, normalizeInput}
├── sg_tools.js              # 工具核：ri/gcd/reduceFrac/fracEq/near + Decimal/Fraction 精确类 + SG_REGISTRY
├── sg_stage1_2.js           # 阶段1+2：8 方法×3档（ten_split/complement_to_ten/carry_break/flat_ten/complement_to_whole/move_number/add_to_mul/combo）
├── sg_stage3_4.js           # 阶段3+4：11 方法×3档（area_split_mul/combine_special_num/quotient_invariant/complement_sum/baseline_num/combine_25_125/distributive_forward/extract_common_factor/subtraction_property/division_property/multiplication_trick/comprehensive_strategy）
├── sg_stage5_6.js           # 阶段5+6：8 方法×3档（decimal_to_int/decimal_complement/expand_shrink/decimal_distributive/reduce_before_mul/fraction_distributive/mixed_split/telescoping）
├── sg_stageX.js             # 拓展：3 方法×3档（arithmetic_series/balance_average/square_diff）
└── smart_gen_esm.mjs        # 在线 React ESM shim（3 行）：export const SMART_GENERATORS = window.SMART_GENERATORS
```

**离线 index.html 加载顺序**（Chrome 61 经典脚本，顺序敏感）：
```html
<script src="./assets/smart_gen/sg_tools.js"></script>
<script src="./assets/smart_gen/sg_stage1_2.js"></script>
<script src="./assets/smart_gen/sg_stage3_4.js"></script>
<script src="./assets/smart_gen/sg_stage5_6.js"></script>
<script src="./assets/smart_gen/sg_stageX.js"></script>
<script src="./assets/smart_gen/smart_gen.js"></script>  <!-- 最后聚合 export -->
```

---

## 三、SMART_GENERATORS 对外接口契约

```js
window.SMART_GENERATORS = {
  // 全部可用 gen 名（93 个，含档位后缀）
  list: ['ten_split_basic', 'ten_split_advance', 'ten_split_challenge', ...],

  // 主入口：接受完整 gen 名（content JSON practice.gen 字段直接传入）
  // 返回 {type, text, answer, accepted?} 或 null（5 次重试全失败）
  gen: function (genName) {
    // 1. split genName → type='ten_split', level='basic'
    // 2. 查 SG_REGISTRY[type] → 取 gen_basic/gen_advance/gen_challenge
    // 3. 调 gen_fn() 生成 q；4. validate(q) 反推校验，失败重试 5 次；5. 返回 q
  },

  // 反推校验（对齐 KOU_GENERATORS.validate）
  validate: function (q) { /* switch(q.type) 31 case → dispatch 到族核 */ },

  // 归一判定（需求文档 §1.3，巧算练习层新增）
  normalizeInput: function (input, q) {
    // '2/3' == 0.666...? Fraction 比较；'1.5' == '3/2'? Decimal 比较
  }
};
```

**答案规范形（三类，与数学口算对齐）**：

| 类型 | 存储形式 | 示例 | 键盘约束 |
|---|---|---|---|
| 整数 | `number` | `78` | 0-9 |
| 小数 | **字符串**（最简） | `"2.4"` | 0-9 + `.`（一次） |
| 分数 | **字符串** `"p/q"`（已约分） | `"2/3"` | 0-9 + `/`（一次） |

> ⚠️ 对齐项：`content/stage6_*.json` 当前分数答案存浮点（`0.6666666666666666`），需批量修正为 `"2/3"` 字符串（见 §8.2 R1）。

---

## 四、10 个方法族构造策略表

> 构造保证 = gen 天然产合法题（不靠生成后碰运气）；伪代码 ES2017（var/function，Chrome 61）。

### 族 1 · 凑十破十平十（ten_split / complement_to_ten / carry_break / flat_ten）

| 方法 | 构造保证 | 答案 | validate 核 |
|---|---|---|---|
| ten_split | `a=ri(1,9); b=10-a` → 10=□+□ 恒成立 | number | `ensureTenSplit` |
| complement_to_ten | `a=ri(2,9); b=ri(11-a,9)` → a+b∈[11,18] **必进位** | number | `ensureCarry` |
| carry_break | `a=ri(11,18); b=ri(a-9,a-1)` b≥2 → **必退位** | number | `ensureCarry` |
| flat_ten | `a=ri(11,18); b=ri(2,9)` 且 b>a%10 退位 | number | `ensureCarry` |

```js
gen_basic: function () {
  var a = ri(2, 9);
  var b = ri(11 - a, 9);        // 保证 a+b ∈ [11,18] 必进位
  var comp = 10 - a, rest = b - comp;
  return { type: 'complement_to_ten', text: a + ' + ' + b + ' =', answer: a + b };
}
```

### 族 2 · 补数凑整（complement_to_whole / complement_sum）

构造保证：选基准 B∈{100,1000}；补数对 (x, B-x) + 散数 s；题 = 两对补数 + 散数（顺序打乱）。
答案 number；核 `ensureComplementSum`（求和=answer 且至少一对补数和=B，保证"巧算有据"）。

### 族 3 · 搬家/连加转乘（move_number / add_to_mul）

- move_number：多元连加 a+b+c+d，其中 (a+b)、(c+d) 凑整；核 `ensureSum`
- add_to_mul：同数连加 n 次（n∈[3,9]）转乘 a×n；核 `ensureRepeatedAdd`

### 族 4 · 基准数法（baseline_num / balance_average）

构造保证：选基准 B（整十整百），N 个数 = B + diff[i]，diff[i]∈[-9,9] 随机，答案 = B×N + Σdiff。
核 `ensureBaseline`：求和=answer **且各数与 B 差≤阈值**（保证基准有意义）。

### 族 5 · 分配律正逆用 + 提取公因数（area_split_mul / distributive_forward / extract_common_factor / decimal_distributive / fraction_distributive）

| 方法 | 构造保证 | 答案 | 核 |
|---|---|---|---|
| distributive_forward | a×(b+c)，b+c 凑整十；拆后 a×b/a×c 口算 | number | `ensureDistributive` |
| extract_common_factor | a×m + a×n，a 公共因子，(m+n) 凑整 | number | `ensureDistributive` |
| decimal_distributive | 同上含小数；**全程整数×10^k**，末尾点位移 | 小数字符串 | `ensureDistributive`(Decimal) |
| fraction_distributive | 同上含分数；Fraction 精确 | "p/q" | `ensureDistributive`(Fraction) |

> **非平凡保证**：b+c 凑整或 a×(b+c)≥20 门槛，避免"常规算更快"。

### 族 6 · 特殊数 25/125/11（combine_special_num / combine_25_125）

25×4k（k=ri(1,9)）、125×8m、11×(10+a)；核 `ensureSpecialMul`（存在 4/8 因子配对）。

### 族 7 · 商不变（quotient_invariant / division_property）

除数∈{25,125,0.25,1.25}，商 q=ri(2,9)，被除数=除数×q×扩倍因子；核 `ensureQuotient`。

### 族 8 · 小数巧算（decimal_to_int / decimal_complement / expand_shrink / decimal_distributive）

**全程整数×10^k 运算 + 字符串规范形 → 浮点陷阱根除**。核 `ensureDecimal`（整数重算 + 字符串归一 + 容差 1e-9 兜底）。

### 族 9 · 分数巧算（reduce_before_mul / fraction_distributive / mixed_split / telescoping）

- reduce_before_mul：先选已约分结果 (p,q,r,s)，构造题面 (p×r)/(q×s)，答案 p/q；交叉约分天然确定
- telescoping：1/(n(n+1))=1/n−1/(n+1)，n=ri(2,9)，连加 k≤4 项；答案 = 1/n−1/(n+k)（Fraction 精确）
- 核：`ensureFraction` / `ensureTelescoping`（项数≤4 防超纲）

### 族 10 · 拓展（arithmetic_series / balance_average / square_diff)

- arithmetic_series：首 a 公差 d 项数 n（偶数），和=(a+末)×n/2；核 `ensureArithmeticSeries`
- square_diff：a²−b²=(a−b)(a+b)，a+b 凑整；核 `ensureSquareDiff`

---

## 五、validate 15 族核组织

| 族核 | 覆盖 type | 校验逻辑 |
|---|---|---|
| `ensureTenSplit` | ten_split | 两数和=10 且=answer |
| `ensureCarry` | complement_to_ten, carry_break, flat_ten | 和/差=answer + 进位/退位结构断言 |
| `ensureComplementSum` | complement_to_whole, complement_sum | 求和=answer + 至少一对补数和=B |
| `ensureSum` | move_number, combo, comprehensive_strategy | 受限求值器（无 eval）+−×÷括号=answer |
| `ensureRepeatedAdd` | add_to_mul | 同数×次数=answer |
| `ensureBaseline` | baseline_num, balance_average | 求和=answer + 各数与基准差≤阈值 |
| `ensureDistributive` | area_split_mul, distributive_forward, extract_common_factor, decimal_distributive, fraction_distributive | a×b+a×c 或 a×(m+n)=answer |
| `ensureSpecialMul` | combine_special_num, combine_25_125 | 重算=answer + 4/8 因子配对存在 |
| `ensureQuotient` | quotient_invariant, division_property | 被除数÷除数=answer + 除数可凑 25/125 |
| `ensureSubProperty` | subtraction_property | a−b−c = a−(b+c) 重算=answer |
| `ensureTwoDigitMul` | multiplication_trick | 两位数拆数重算=answer |
| `ensureDecimal` | decimal_to_int, decimal_complement, expand_shrink | 整数×10^k 重算 + 字符串归一 + 容差 |
| `ensureFraction` | reduce_before_mul, mixed_split | Fraction 精确 + fracEq |
| `ensureTelescoping` | telescoping | 裂项和=answer + 项数≤4 |
| `ensureArithmeticSeries` / `ensureSquareDiff` | arithmetic_series, square_diff | 公式重算=answer |

**难度断言（R2 治理）**：ensureCarry 必须进位退位 / ensureDistributive 凑整门槛 / ensureBaseline diff 有正有负 / ensureTelescoping 项数≤4。

---

## 六、参数与命名约定

- **type 1:1 映射**：content `practice.gen`（如 `ten_split_basic`）→ `SMART_GENERATORS.gen("ten_split_basic")` 零转换。
- **params 默认空 `{}`**：档位区间由 gen_basic/advance/challenge 硬编码；params 仅"主题特化"覆盖（如 `{"max":1000}`），count 已在 practice.count 不参与。

---

## 七、测试门禁

```
# 对齐数独思维 engine.mjs 先例：Node 直接跑源码（global.window = global 后 require IIFE）
node tests/smart_gen_test.js
```

| 层 | 内容 | 标准 |
|---|---|---|
| L1 全量 validate | 93 gen 名 × 200 题 = 18600 题全过 validate | 0 失败 |
| L2 独立验证 | 用自实现 Fraction/Decimal 类独立重算对比 | 0 失败 |
| L3 难度断言 | basic<advance<challenge（数位/步数/混合度）+ 进位/退位/凑整结构存在 | 100% |
| 浮点专项 | stage5/6 答案必须字符串规范形，禁用浮点 number | 0 例违规 |

---

## 八、风险与开放问题

### 8.1 工作量与排期

| 项 | 估算 | 说明 |
|---|---|---|
| 93 个 gen 函数 | 约 2000-2800 行 | 构造保证+难度断言，30-100 行/方法 |
| validate 15 族核 + 31 case | 约 400-600 行 | 族核复用率高 |
| 工具核（Fraction/Decimal 类） | 约 200 行 | 新增点（数学口算只有 reduceFrac） |
| 测试脚本 | 约 500 行 | L1+L2+L3 |
| **合计** | **约 3100-4100 行（3-5 人天）** | **Large** |

**排期**：阶段 0 已定"核心生成器先行"→ 先族 1-6（16 方法覆盖阶段 1-4 枢纽，MVP 离线首包）；族 7-10（15 方法）阶段 2 全量。

### 8.2 风险

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R1 | stage6 content 浮点答案（0.666…）与规范形冲突 | 高 | smart_gen 落地后批量修正 content：answer 改 "p/q" 字符串 |
| R2 | `combine_25_125` 在 stage4 content 无 practice 引用（grep 未找到） | 中 | 设计已纳入 31 方法；content 需补 s4l3 practice.gen |
| R3 | area_split_mul 跨两讲复用（s3l1+s3l2） | 低 | 同一生成器两讲合理（面积模型→拆数递进） |
| R4 | 小数浮点陷阱 | 高 | 全程整数×10^k + 字符串规范形 + Decimal 核 |
| R5 | 裂项超纲 | 中 | n≤9 k≤4 + ensureTelescoping 项数断言 |
| R6 | "非平凡"判定模糊 | 中 | 族核难度断言 + 人工 QA 抽检 basic 50 题 |
| R7 | 受限求值器复杂度 | 中 | 不用 eval；受限中缀→后缀求值（对齐 g2_mixed） |

### 8.3 开放问题（需用户决策）

1. **stage4 第 3 讲 `combine_25_125` 是否补入 content JSON**？（需求文档列为 9 讲之一，grep 未见 practice 引用）→ 补则 31 方法全齐。
2. **小数答案是否接受 number 浮点**（`2.4`）？→ 推荐字符串规范形 `"2.4"`，UI normalizeInput 已可兼容（数学口算 checkAnswer 支持 `"3/2"=="1.5"`）。
3. **挑战档限时**：需求 §2.4"挑战=综合+限时"。限时是 UI 层计时器逻辑，smart_gen 只产题不掺时间——确认此分工。

---

*本文档为 smart_gen.js 实现蓝图；评审通过后按 §二 结构开工，族 1-6 先行。*