# lexue 主力单独产品页 · 规划与实现方案

> 系列：LoongEduTools 教育工具｜对应：`在线版静态发布统一机制-开发方案.md` §7 决策点 8（产品页与应用关系）
> 目标站点：https://lexue.loongba.cn（乐学系列）
> 架构决策（用户已确认 2026-09-29）：**旁挂产品页** —— 应用保持占子路径根（peilian/、shudu/、qiaosuan/ 不动），产品页新增到 `lexue/products/<产品>/`，首页主力卡改链产品页，产品页"打开应用"链回应用根。
> 版本：v0.2（2026-09-29）｜ 状态：已修订（Oracle 外审 1B/4I/2N 已落实）
> **否决留痕（Oracle A 条）**：否决 v0.9「应用内移 app/」方向的理由 = 代价（3 个 SPA base/vite 改造 + 18 项 verify 断言重写 + 已部署站点全部入口迁移）>> 旁挂（新增 3 模板 + 1 函数 + N 行规则）。

---

## 一、背景与现状（已实机核对）

| # | 事实 | 证据 |
|---|---|---|
| 1 | lexue 三款主力应用（点读陪练 peilian/、数独思维 shudu/、数学巧算 qiaosuan/）**直接占子路径根**，SPA index.html 即应用本体 | `scripts/dist/lexue-site/peilian/index.html` 等（M3/M4 已部署验证） |
| 2 | 首页主力卡直接链应用：`gen_series_page()` 注入 `href="peilian/"` 等 | `scripts/build_lexue_site.py` main() main_cards |
| 3 | 方案 v0.9 §7 决策点 8 原推荐"产品页 = 独立静态页 + 应用挂子路径（`peilian/app/`）"，**M3 实际落地走"应用合一"**（应用占根），两条路已由用户裁决为**旁挂产品页** | 在线版静态发布统一机制方案 §2.2/§7-8 |
| 4 | 离线 zip（小红书分发渠道）在 `RedTools/publish/`，**不属于 lexue 站分发**——产品页不应链离线 zip（渠道分离） | `RedTools/publish/学科/*_离线版.zip`；lexue 分区无离线包 |
| 5 | 既有模板机制已就绪（`<template data-inject>` 占位 + 唯一性校验 + `PLACEHOLDERS.md` 维护约定） | `scripts/web/` + `scripts/build_lexue_site.py` inject_placeholders |

## 二、目标与非目标

### 目标

1. 为三款主力（点读陪练 / 数独思维 / 数学巧算）各生成**旁挂静态产品页**：`lexue/products/<slug>/index.html`；
2. 首页「主力应用」区卡片**改链产品页**（产品介绍 → 打开应用），产品页主按钮链回 `../<slug>/`（应用本体，相对路径）；
3. 复用既有模板机制（`<template data-inject>` + 唯一性校验），模板可被 UI Agent 独立美化；
4. 缓存策略补齐 `/products/*/index.html` no-cache（入口页高频改文案）。

### 非目标

- **不迁移应用**：peilian/shudu/qiaosuan 子路径根仍是应用本体，不做 `app/` 内移；
- 不提供离线 zip 下载链接（小红书渠道分发，站内不链）；
- 不做 timemanager 产品页（未开工，产品存在时自动生成，可顺延）；
- 不做认证/口令/互动功能（独立立项）；
- 不新增主力产品页之外的页面（MiniApp 仍是目录页，不进 products/）。

---

## 三、产品页信息架构

```
lexue/products/<slug>/index.html（模板 scripts/web/product-<slug>.html，每产品一个）
├── Hero：产品名 + 定位标语 + 一句话简介
├── 特性区（3-4 张卡片：核心能力/适用场景/双模式说明）
├── 打开应用（主按钮 href="/<slug>/" —— **根绝对路径**，Oracle B 条裁决：对 CF Pages trailing slash 分叉零风险）
│   └── 离线提示：文案说明"离线版请通过小红书官方账号获取"（不链 zip，渠道分离）
├── 合规脚注（同首页：数据最小化 · 无社交 · 免费在线）
└── Footer：品牌 + 更新时间（<template data-inject="UPDATED_AT">）+ 返回乐学首页（href="/"）
```

> **产品页按钮用根绝对路径 `"/<slug>/"`（Oracle B 条，阻断必改）**：`products/peilian/` 页内若用相对 `../peilian/`，当用户访问`/products/peilian`（无 trailing slash）且 CF 不重定向时解析错误；根绝对路径对 trailing slash 不敏感，消除全部分叉风险。根路径非"禁止绝对 URL"（`PLACEHOLDERS.md` §二禁的是盘符/外链）。

三产品内容源（模板内文案手写，勿放脚本注入，UI Agent 可独立改文案）：

| slug | 产品名 | 定位标语 | 产品页路径 |
|---|---|---|---|
| peilian | 点读陪练（英语陪练·天天见） | 小学英语原创作文句/图/音 · 天天陪练 | `products/peilian/` |
| shudu | 数独思维 | 逻辑思维阶梯训练 · L0-L7 技巧体系 | `products/shudu/` |
| qiaosuan | 数学巧算（数学巧算·天天练） | 口算巧算双引擎 · 32 讲教程体系 | `products/qiaosuan/` |

> 模板名称 = `product-<path>.html`（peilian→product-peilian.html），脚本按 MAIN_PRODUCTS 对齐 slug（Oracle 外审确认命名锚点）。

---

## 四、技术方案

### 4.1 模板机制（复用既有，新增 3 产品模板）

```
模板文件（scripts/web/）                      构建脚本（build_lexue_site.py）
product-peilian.html  →  lexue/products/peilian/index.html
product-shudu.html    →  lexue/products/shudu/index.html
product-qiaosuan.html →  lexue/products/qiaosuan/index.html
```

- 每产品模板**独立文件**（文案/特性手写，UI Agent 可独立美化任意一款），复用 `load_template()` + `inject_placeholders()`；
- 占位符约定（沿用 `PLACEHOLDERS.md`）：
  - `<template data-inject="UPDATED_AT"></template>` — footer 更新时间（脚本注入），每模板恰好 1 次；
  - **打开应用链接为模板内静态相对链接**（`../peilian/` 等），不走注入（应用路径固化，手写更直观、UI Agent 可见）。

### 4.2 build_lexue_site.py 改造

1. **新增 `gen_product_pages(out, updated_at)`**：
   - 遍历 `MAIN_PRODUCTS`，对每个**产物存在**（`(out/{path}/index.html).is_file()`）的产品：
     - 读 `scripts/web/product-{path}.html` → 注入 UPDATED_AT → 写 `out/products/{path}/index.html`；
   - **模板缺失处理（Oracle C 条）**：对 optional 产品（timemanager）模板缺失 → **WARN 跳过**（与 `build_simple_product` optional 语义对齐，防"产物已开工但模板未写"殃及三款主力）；对主力三款（非 optional）模板缺失 → **仍 strict 中止**（防主力产品页漏写）；
   - 跳过判据 = **产物缺失 OR 模板缺失** 任一触发；
   - 复用 `inject_placeholders()`（占位符唯一性 + 残留双校验）。
2. **首页主力卡改链 + 数据源收敛（Oracle E3 条）**：`main()` 中 `main_cards` 从 `MAIN_PRODUCTS` 派生（消除手写三元组与 name 字段重复漂移）：
   ```python
   main_cards = [(p["name"], f"products/{p['path']}/") for p in MAIN_PRODUCTS
                  if (out / p["path"] / "index.html").is_file()]
   ```
   timemanager 顺延逻辑自动归一（产物存在才进卡片）；`gen_series_page` 卡片生成逻辑不变。
3. **调用顺序（Oracle E5 条）**：`gen_product_pages` 置于 `gen_series_page` **之前**（先建产品页，再建首页链向产品页）。
4. **`gen_headers()` 增补**：`rules` 加 `/products/*/index.html` → no-cache（紧跟 `/MiniApp/index.html` 之后，Oracle I4 风格锚点）。产品页纯静态单 HTML，无独立 assets 目录，无需 `/products/*/assets/*` immutable 规则（Oracle E1 条：模板遵循 PLACEHOLDERS.md §三纯静态约束）。

### 4.3 verify_lexue.ps1 增补断言（Oracle D 条增强）

| # | 新断言 | 预期 |
|---|---|---|
| 12a | `GET /products/<slug>/`（三产品） | 200 + **无占位残留 + 无盘符泄漏**（对齐 1c 模式） |
| 12b | 产品页含对应产品名 | peilian 页含「点读陪练」/ shudu 含「数独」/ qiaosuan 含「数学巧算」（防模板写错 slug） |
| 12c | 产品页"打开应用"按钮 | HTML 含 `href="/<slug>/"`（根绝对路径，防按钮死链） |
| 12d | 首页主力卡 | 精确正则 `href="products/(peilian\|shudu\|qiaosuan)/"`（防宽松匹配误伤） |
| 12e | 产品页 no-cache 头 | 在 `if (-not $SkipHeaderCheck)` 块内（同断言 10 条件，防本地误报） |
| 13 | `GET /products/peilian`（无 trailing slash） | 200 或 301（Oracle B 条：验证 CF 无 slash 行为；根绝对路径按钮下此断言可降级为 N，保留观察） |

### 4.4 部署

- 沿用 `publish_lexue.ps1`（全量替换语义，产品页作为构建产物随 push 部署）；
- 本次流程：方案审核 → 实施 → 本地重建+verify（-SkipHeaderCheck）→ publish → 公网 verify 全绿；
- 无需动 taoli 站（仅 lexue 变更）。

---

## 五、验收清单

| # | 断言 |
|---|---|
| 1 | `lexue/products/peilian/`、`shudu/`、`qiaosuan/` 三页生成，模板各含 UPDATED_AT 恰好 1 次 |
| 2 | 首页主力卡 href = `products/<slug>/`（非直接链应用）；产品页"打开应用"按钮 = `href="/<slug>/"`（根绝对路径，无盘符） |
| 3 | 三页 hero 含产品名 + 定位标语；离线提示无 zip 链接（渠道分离） |
| 4 | `_headers` 含 `/products/*/index.html` no-cache |
| 5 | 产物无 `data-inject` 残留、无盘符 href |
| 6 | 重建 exit=0；公网 verify 全绿（含 12a-12e + 13 新断言） |

---

## 六、里程碑

| 步骤 | 产出 |
|---|---|
| S1 方案审核 | 本稿 v0.1 → 自审 + Oracle 外审 → 修订 v0.2 |
| S2 实施 | 3 产品模板 + build_lexue_site.py 改造 + _headers + verify 断言 |
| S3 部署验证 | 重建 → publish lexue → 公网 verify 全绿 |
| S4 收尾 | 方案/审核报告/看板回写 |

---

## 七、风险与缓解

| 风险 | 缓解 |
|---|---|
| 首页主力卡改链产品页 → 用户多一跳 | 产品页主按钮 = 应用入口，视觉第一动作；验收 #2 断言锁定 products/ 前缀 |
| 产品页文案过长/枯燥 | 模板手写 + UI Agent 可独立美化；S3 后续可再提交 UI 美化（与首页同批或后置） |
| 无 trailing slash 访问分叉（CF Pages） | 按钮用根绝对路径 `"/<slug>/"`（Oracle B 条）；verify 13 公网观察 `/products/peilian` 无 slash 行为 |
| timemanager 开工后产品页自动生成 | gen_product_pages 按产物存在性 + 模板存在性驱动，零配置接入（模板缺失 optional 跳过） |
| publish_lexue.ps1 全量替换 | 无需改动：`products/` 作为构建产物被全量替换语义自动覆盖（Oracle E4 条） |

---

## 八、变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v0.1 | 2026-09-29 | 初稿 |
| v0.2 | 2026-09-29 | Oracle 外审修订（1B/4I/2N）：B 按钮改根绝对路径 `"/{slug}/"`；I-C gen_product_pages 模板缺失 optional WARN 跳过/主力 strict；I-D verify 断言增强（12a 无残留无盘符/12b 产品名/12c 按钮 href/12d 精确正则/12e 入 SkipHeaderCheck 块/13 无 slash 观察）；I-E2 PLACEHOLDERS.md 表格补产品页行；I-E3 main_cards 从 MAIN_PRODUCTS 派生；N-A 否决留痕；N-E1 纯静态约束；N-E4 publish 无需改动 |

## 九、审核记录

| 轮次 | 意见 | 处理 |
|---|---|---|
| 自审 v0.1 | 无阻断。I1 相对路径解析确认；I2 模板命名按 MAIN_PRODUCTS 驱动；I3 模板即设计感 | 并入 v0.2 §4.2/§4.3 |
| Oracle 外审 | **B1**：相对链接 `../{slug}/` 在无 trailing slash 访问时分叉 → **按钮改根绝对路径 `"/{slug}/"`** + 公网验证 `/products/peilian` 无 slash 行为。**I-C**：模板缺失 optional 产品 WARN 跳过（防殃及主力）、主力 strict；跳过判据 = 产物缺失 OR 模板缺失。**I-D**：12a 增无占位残留+无盘符；12b 新增产品名；12c 新增按钮 href；12d 精确正则；12e 入 `-SkipHeaderCheck` 块；13 无 slash 观察。**I-E2**：PLACEHOLDERS.md 表格补 3 行。**I-E3**：main_cards 从 MAIN_PRODUCTS 派生。**N-A/E1/E4**：否决留痕/纯静态约束/publish 无需改动 | B1 并入 §三+§4.1；I-C 并入 §4.2-1；I-D 并入 §4.3；I-E2 并入 §4.1、PLACEHOLDERS.md 实施时更新；I-E3 并入 §4.2-2；N 全部并入正文 |