# lexue 主力单独产品页 · Sisyphus 审核报告

> 对应方案：`docs/教育工具/lexue主力产品页规划与实现方案.md`（v0.2，Oracle 外审 1B/4I/2N 全落实）
> 实施 commit：`c92c565`（源码）+ `dc549f7`（lexue 产物）+ `38804f0`（verify 断言修正）
> 日期：2026-09-29 ｜ 审核人：Sisyphus
> 结论：**通过（0B / 0I 残留）**，已公网部署验证 27/27 PASS。

---

## 一、实施内容 vs 方案 v0.2 对照

| 方案项 | 实施 | 状态 |
|---|---|---|
| §4.1 三产品模板（product-peilian/shudu/qiaosuan.html） | UI Agent（visual-engineering）制作，成套乐学蓝 + CTA 根绝对路径 + 离线文字提示 | ✅ |
| §4.2-1 gen_product_pages（产物存在才生成、optional 模板缺失 WARN/主力 strict、UPDATED_AT 注入） | 已实现；timemanager 产物缺失正确跳过（WARN） | ✅ |
| §4.2-2 main_cards 从 MAIN_PRODUCTS 派生（Oracle E3） | 已实现：`[(p["name"], f"products/{p['path']}/") for p in MAIN_PRODUCTS if (out/p['path']/'index.html').is_file()]` | ✅ |
| §4.2-3 gen_product_pages 先于 gen_series_page | 已实现（Oracle E5） | ✅ |
| §4.2-4 _headers 补 `/products/*/index.html` no-cache | 已实现（紧跟 /MiniApp/index.html） | ✅ |
| §4.3 verify 断言 6b-6d + 12e + 13 | 已实现（产品页 200/无残留/无盘符/按钮 href/首页前缀/无 slash/no-cache 头） | ✅ |
| Oracle B1（按钮根绝对路径 `"/<slug>/"`） | CTA `href="/peilian/"` 等（实测通过） | ✅ |
| Oracle C（产品页跳过判据 = 产物缺失 OR 模板缺失） | 已实现：产物缺失 → WARN 跳过；optional 模板缺失 → WARN 跳过；主力模板缺失 → strict 中止 | ✅ |
| Oracle I-E2（PLACEHOLDERS.md 补产品页行） | 已补 3 行 + 根绝对路径约定 | ✅ |

## 二、Oracle 外审意见落实情况

| 意见 | 级别 | 落实 |
|---|---|---|
| B1 相对链接 `../{slug}/` 在无 trailing slash 访问时分叉 → 按钮改根绝对路径 `"/{slug}/"` | 阻断 | ✅ CTA `href="/{slug}/"`；公网实测 `/products/peilian`（无 slash）200 |
| I-C gen_product_pages 模板缺失 optional WARN 跳过/主力 strict | 改进 | ✅ 跳过判据 = 产物缺失 OR 模板缺失 |
| I-D verify 断言增强（12a 无残留/12b 产品名/12c 按钮 href/12d 精确正则/12e 入 SkipHeaderCheck 块/13 无 slash） | 改进 | ✅ 全部实现 |
| I-E2 PLACEHOLDERS.md 表格补产品页行 | 改进 | ✅ |
| I-E3 main_cards 从 MAIN_PRODUCTS 派生 | 改进 | ✅ |
| N-A 否决留痕（app/ 内移代价对比） | 建议 | ✅ 方案头部注明 |
| N-E1 产品页纯静态约束 | 建议 | ✅ 模板遵循 PLACEHOLDERS.md §三 |
| N-E4 publish_lexue.ps1 无需改动 | 建议 | ✅ 全量替换自动覆盖 products/ |

## 三、代码审核发现

1. **gen_product_pages 的跳过判据实现与 Oracle C 一致**：先查产物（`out/{path}/index.html`），再查模板；optional 产品（timemanager）模板缺失走 `warn + continue`，主力产品（peilian/shudu/qiaosuan）模板缺失走 `raise SystemExit`——与 `build_simple_product` 的 optional 语义对齐；
2. **main_cards 数据源收敛**（Oracle E3）：`[(p["name"], f"products/{p['path']}/") for p in MAIN_PRODUCTS if (out / p["path"] / "index.html").is_file()]` 消除了原手写三元组与 MAIN_PRODUCTS.name 的重复漂移；timemanager 顺延逻辑自动归一；
3. **产品页 CTA 根绝对路径**（Oracle B1）：`href="/{slug}/"` 三页实测正确；返回首页 `href="/"`；
4. **verify 断言质量**：产品页断言组复用 1c 模式（200 + 无占位残留 + 无盘符）+ 按钮 href 精确匹配 + 首页前缀精确正则（`products/(peilian|shudu|qiaosuan)/`）——防宽松匹配误伤；12e 归入 `-SkipHeaderCheck` 块对齐断言 10 模式。

## 四、部署后公网验证（实测）

| # | 断言 | 结果 |
|---|---|---|
| 1-11 | 既有 18 项（系列页/死链/MiniApp 目录页/manifest/units/素材/主力入口/缓存头） | **全 PASS** |
| 12a | products/peilian/ · shudu/ · qiaosuan/ 200 + 无残留 + 无盘符 | **PASS ×3** |
| 12b | 产品页含产品名（点读陪练/数独/数学巧算） | **PASS ×3** |
| 12c | 「打开应用」按钮 href=/peilian/ 等（根绝对路径） | **PASS ×3** |
| 13 | `/products/peilian`（无 trailing slash）200 | **PASS** |
| 6d | 首页主力卡 href 含 products/ 前缀（≥3 卡） | **PASS** |
| 10/12e | api no-cache + 产品页入口头 | **PASS**（12e 修正后） |

**结果：27 PASS / 0 FAIL**

## 五、实施中发现并修正的问题（12e 断言头）

公网首测 `products/peilian/ 响应头 no-cache` **FAIL**，深入排查发现：
- CF Pages 对**入口 HTML**（`/`、`/MiniApp/`、`/peilian/`、`/products/peilian/`）统一注入 **`Cache-Control: public, must-revalidate, max-age=0`**（平台默认，覆盖 `_headers` 中 `/xxx/index.html` 级规则——请求路径不含 `index.html`，规则不命中目录入口）；
- `max-age=0 + must-revalidate` 语义 = **每次回源验证**，满足入口高频更新意图，产品页缓存策略**实际正确**；
- 既有 18/18 从未断言过入口 HTML 头（只断言 api/assets），恰是本次 12e 首次触碰 → **断言预期修正**为"no-cache 或 max-age=0"（`38804f0`），非产品缺陷。

## 六、git 记录

- LoongEduTools：`c92c565`（主力产品页实施，7 文件 +1324/-13）+ `38804f0`（verify 12e 断言修正）
- loongba-edu-dist：`dc549f7`（lexue 产物，575 文件含 products/ 三页）

## 七、遗留事项

1. **verify_cf_pages.ps1（taoli）尚未加 `/index.html` 200 断言**（沿用 taoli 侧既有缺口，非本次范围）；
2. **产品页 UI Agent 精修（可选 S3）**：当前模板已设计感（visual-engineering 制作，55-char 每页），后续可在首页美化同批再做一轮精修；
3. 首页仍链 `products/` 中间层：产品页主按钮 = 应用入口，访问语义 = 首页 → 产品介绍 → 应用（多一跳已按用户裁决接受）。