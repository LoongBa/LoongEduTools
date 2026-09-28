# 系列首页/产品页模板 · 维护约定（UI Agent 必读）

> 范围：`scripts/web/`（lexue 两页 + 三款主力产品页）+ `教师客户端/scripts/web/`（taoli 一页）静态模板。
> 用途：构建脚本读模板 → 注入数据 → 生成线上 index.html（CF Pages 纯静态，随 push 部署）。
> 权威约束来源：`docs/教育工具/系列首页规划与实现方案.md` v0.2 §10（S3 UI 美化 brief）+ `docs/教育工具/lexue主力产品页规划与实现方案.md` v0.2（产品页架构）。

---

## 一、占位符（KEY 占位，不可违反）

每个占位元素为 `<template data-inject="KEY"></template>`（真实 HTML 元素，非注释）：

| 模板文件 | 占位 KEY | 脚本注入内容 |
|---|---|---|
| `scripts/web/lexue-home.html` | `MAIN_CARDS` | 主力应用卡片（peilian/shudu/qiaosuan[/timemanager]）|
| `scripts/web/lexue-home.html` | `UPDATED_AT` | footer 更新时间（ISO8601）|
| `scripts/web/lexue-miniapp-home.html` | `MINIAPP_CARDS` | 43 款小工具卡片（网格）|
| `scripts/web/lexue-miniapp-home.html` | `UPDATED_AT` | 同上 |
| `scripts/web/product-peilian.html` | `UPDATED_AT` | 产品页 footer 更新时间（产品介绍文案为静态内联，不注入）|
| `scripts/web/product-shudu.html` | `UPDATED_AT` | 同上 |
| `scripts/web/product-qiaosuan.html` | `UPDATED_AT` | 同上 |
| `教师客户端/scripts/web/taoli-home.html` | `PACKS_LIST` | 内容包清单卡片（4 包）|
| `教师客户端/scripts/web/taoli-home.html` | `UPDATED_AT` | 同上 |

**硬约束**：
1. 每 KEY 在对应模板中**恰好 1 次**——增删/复制/移动到 fragment 文件都会使 `build_lexue_site.py` / `build_static_site.py` 构建中止（唯一性校验 + 残留检测双保险）；
2. 占位元素**不得加空格、不得嵌套其它元素、不得改写 `data-inject` 属性名**；
3. 美化 `<template>` 元素**外**的结构（颜色/字体/间距/卡片样式/响应式/品牌感）完全自由；
4. `<template>` 内脚本注入的卡片是**既有 class 结构**（`.card` / `.card h3` / `.card p` / `.card .go` / `.name` / `.pack` / `.pack .meta` / `.pack .dl`），CSS 应**以这些 class 为选择器**美化注入内容——不要依赖注入卡片的 id/内联 style（无）；
5. **产品页模板**（`product-<slug>.html`）仅含 `UPDATED_AT` 一个注入占位：产品名/标语/特性文案/「打开应用」按钮/返回链接均为**模板内静态内容**（不走注入），UI Agent 可自由改文案与排版，但保持结构语义。

## 二、链接约束

- 页面间导航保持**相对路径**：`peilian/`、`shudu/`、`MiniApp/`、`../`、`api/edu/packages/manifest` 等；
- **根绝对路径允许**（非禁止）：`"/peilian/"`、`"/"`——产品页「打开应用」按钮**必须用根绝对路径 `"/<slug>/"`**（Oracle B1 裁决：`../` 相对链接在无 trailing slash 访问 `/products/peilian` 时分叉；根路径对 trailing slash 不敏感）；
- **禁止** Windows 盘符（`F:\`、`/F:/`）；唯一允许的 `http(s)://` 外链 = 双系列互链（`https://lexue.loongba.cn` ↔ `https://taoli.loongba.cn`）；
- link 标签的 href 语义不变。

## 三、纯静态约束

- **不引入外部资源**：无 CDN/字体/图标库/外部脚本/外部样式（`<link>` 仅允许 noop）；
- 字体用系统栈（system-ui / PingFang SC / Microsoft YaHei）；
- 图标用内联 SVG / Emoji / CSS 绘制，不用 icon font CDN；
- JS 仅允许内联、非必须不写（页面无需交互功能）。

## 四、品牌识别

- **lexue（乐学）**：主色 `#2b5ce6`（蓝），面向家长/孩子的教育工具集——亲和、明亮、活泼；
- **taoli（乐教）**：主色 `#0f766e`（青绿），面向教师课堂——稳重、专业、权威；
- 两站 footer 互链（乐学 footer → taoli，taoli footer → lexue），勿删。

## 五、验证

美化完成后（提交前）本地执行，全绿才算完成：
```powershell
# lexue 两页（会同时修死链校验 + 占位符校验）
python scripts/build_lexue_site.py   # exit=0，且产物无 <!--残留占位-->
# taoli 首页
python 教师客户端/scripts/build_static_site.py --base https://taoli.loongba.cn
# 产物抽查
Select-String scripts/dist/lexue-site/index.html -Pattern 'data-inject'  # 0 hits
Select-String 教师客户端/scripts/dist/static-site/index.html -Pattern 'data-inject'  # 0 hits
```
美化后部署由 Sisyphus 负责（rebuild → verify_lexue.ps1 / verify_cf_pages.ps1 全 PASS → publish 两站）。

---

*2026-09-29 · 与 `系列首页规划与实现方案.md` v0.2 §10 保持一致；UI Agent 美化以本文 + 模板头部注释为唯一约束。*