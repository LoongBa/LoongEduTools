# 项目说明（小学英语点读陪练 · Web 版）

纯前端网页应用，**不使用 Meoo Cloud / 云数据库**，所有进度仅存 localStorage。

> 完整的功能规格、数据契约、验收清单与已知技术债见 **`docs/功能设计文档.md`**。本文件只记「改代码前必须知道的事」；两者若冲突，以代码为准并同步修订文档。

## Dependencies

- `@tanstack/react-router`：文件路由（`src/routes/_layout.*.tsx`），`routeTree.gen.ts` 由 Vite 插件自动生成，禁止手改。
- `lucide-react` + 自绘 SVG 图标（`src/components/nav-icons.tsx`、`ui-kit.tsx`）。
- 浏览器原生 API（非第三方库）：`speechSynthesis`（英文朗读/慢速）、`MediaRecorder` + `getUserMedia`（跟读录音）、Canvas 2D（成长卡导出 PNG，未引入 html2canvas 等截图库）。

## Architecture

- `src/styles.css` — 唯一 design system。**支持 7 套主题（浅 4 + 深 3）**：`:root` 为默认「嫩芽黄绿」（底色 hue≈122、明度高彩度低，接近传统豆沙绿护眼色卡），另有 `[data-theme="matcha"]`（抹茶豆沙，绿意更浓、卡片面也带绿相）、`warm` / `sky` 两套浅色，以及 `[data-theme="moss"]`（苔夜黄绿，与默认同色相的暗档）/ `forest`（森林夜绿）/ `night`（墨夜）三套深色——深色一律不用纯黑底+纯白字。组件侧一律消费 `var(--*)` / theme utility，禁止写死色值。两个跨主题工具类：`.panel-border`（浅色半透明描边、深色实色描边，因深色下阴影不可见）、`.ip-plate`（IP 白底插画在深色主题下垫浅底板）——两者的深色分支一律挂在 **`.dark`** class 上，**不要再按 `data-theme` 名逐个枚举**。新增 `--on-lit` token 表达「完成态色块上的文字」，浅色近白、深色为深字。动效 keyframes 集中定义，受 `prefers-reduced-motion` 降级；末尾含 `@media print`（A4 portrait、`.no-print` / `.print-only` / `.print-break`，打印永远走浅色、与屏幕主题解耦）。
- `src/data/content.ts` — 内容层（6 单元 × 8 句卡 + 12 词卡 + 1 首歌 + 4 项能力），每个能力检查带 `remedy: { stage, hint }` 支撑「需要帮助 → 具体补练位置」规则。
- `src/data/ip.ts` — 6 个原创 IP 角色（CDN 图，来自 image-generate）。
- `src/lib/store.ts` — localStorage 进度中枢（key `dianedu.progress.v1`），单一 `useProgress()` hook 暴露全站状态；字号档位、配色主题（`data-theme`）与底色档位通过挂到根元素的 style / dataset 生效。`ThemeKey` 七值（浅：`sprout`/`matcha`/`warm`/`sky`；深：`moss`/`forest`/`night`）+ `THEMES`（含 `swatch` 三色色板与 `dark` 标记，供「我的」页色板选择器渲染）+ `isDarkTheme()`。`followSystem` **默认 true**（深浅主题默认跟随系统）：`systemPrefersDark()` 读 `prefers-color-scheme`，`resolveTheme(pref, followSystem)` 靠模块级 `DARK_PAIR` / `LIGHT_PAIR` 把偏好映射到同色系的浅/深档；挂载 useEffect 在开启时注册 `matchMedia` change 监听并在 cleanup 中移除。**任何新增 ThemeKey 必须同时补 `DARK_PAIR`、`LIGHT_PAIR`、`STANDARD_BG`、`SOFT_BG` 四处，否则 TS 的 `Record<ThemeKey,...>` 会直接报错**（这正是防漏机制）。深色主题会同步 `html.dark` class。新增设置字段靠 `{...DEFAULT_SETTINGS, ...saved}` 向后兼容，**无需数据迁移**（旧数据的 `theme: "green"` 已不在 `THEME_KEYS` 中，会自动回落默认 `sprout`；但旧存档里已写入的 `followSystem: false` 会被保留，不会强行改写用户既有选择）。支持 `?theme=xxx` 临时预览某套配色（只改根元素、不落盘、且优先于跟随系统），便于逐套核对观感。
- `src/lib/speech.ts` — `speak()`（含慢速档、不支持时返回 false 供 UI 降级为音标提示）+ `useRecorder()`（失焦/切页自动放弃录音并 revokeObjectURL）。
- `src/components/icons.tsx` — **图标统一再导出出口**，合并 nav-icons 与 ui-kit 图标；容器组件仍从 `@/components/ui-kit` 导入。

## What Didn't Work

- ❌ `meoo-cli image-generate --jobs '<长 JSON>'` 内联超长数组 → CLI 报 "must be a valid JSON array"；改用 `$(cat tmp/jobs.json)` → 违反「meoo-cli 必须单独执行、不能与其他 Shell 命令或控制符组合」。✅ 最终拆成多批较短的内联 JSON 数组成功。
- ❌ 各页面直接从 `nav-icons.tsx` 导入 `PrintIcon` 等定义在 `ui-kit.tsx` 的图标 → Rollup "is not exported"。✅ 新增 `icons.tsx` 作为统一出口。
- ❌ 保留脚手架 `src/routes/index.tsx` 同时新增 `_layout.index.tsx` → `/` 路由冲突。✅ 删除前者。
- ❌ 成长卡 canvas 分享图写死十六进制色值 → 切换主题后图片配色与页面脱节。✅ 改为借临时元素的 `getComputedStyle` 读取当前主题语义色（canvas 无法解析 `var()`），并统一 `--overlay` token 供遮罩层使用。
- ❌ 主题从 3 套扩到 6 套后仍用 `Segmented` 一行排开 → 小屏必然溢出挤压。✅ 「我的」页改为两列色板卡片（三色 swatch + 名称 + 深/浅标签），选中态用 `bg-primary`。
- ❌ 深色主题沿用 `text-white` 表达完成态文字 → 深色下「亮绿底 + 白字」对比不足。✅ 新增 `--on-lit` token，浅色近白、深色为深字；canvas 的兜底色也要按主题分支，否则 probe 失效时深色会导出白底图。
- ❌ 想用 `read-browser-screenshot --path "/me"` 验收非默认主题 → 沙箱浏览器每次是全新会话、localStorage 为空，永远回落默认主题，截图结论全部无效。✅ 加 `?theme=xxx` 预览参数（只挂根元素、不落盘），配合 `--source browser` 逐套核对。
- ❌ `.panel-border` / `.ip-plate` 的深色分支按 `[data-theme="forest"], [data-theme="night"]` 逐个枚举 → 每加一套深色主题都要回来补选择器，漏一个就出现「深色下描边消失」。✅ 改用 useEffect 早已在同步的 `html.dark` class 作为唯一深色判据（`.dark .panel-border`）。同理，canvas 兜底判断改调 `isDarkTheme()` 而非硬编码主题名。

## Lessons

- Tailwind v4 下 `getComputedStyle(root).getPropertyValue("--primary")` 返回的是 `oklch(...)` 原始字符串，Canvas 2D 不一定接受；用「临时元素 + color 属性」让浏览器完成换算最稳。
- 多主题只覆盖与色相相关的 token（背景/主色/边框/阴影等），状态色 `--lit` / `--sky` 保持跨主题一致，避免「完成=绿色」的语义被主题改掉。
- 深色主题下阴影几乎不可见，卡片层级要靠**实色描边**维持；`.panel-border` 用 `color-mix` 做「浅色 70% 透明 / 深色实色」的分叉比在组件里写两套 class 干净。
- 「柔和底色 / 标准底色」这类二档设置在深色主题下语义要反过来：standard = 略微提亮的深底，soft = 更暗一档，绝不能复用浅色的提亮逻辑。
- IP 插画是白底生成图，深色主题下不能靠 `bg-card` 承托，需 `.ip-plate` 显式垫浅底板。

- 打印小单页需桌面视口查看（`read-browser-screenshot --h5=false`），A4 预览在手机宽度下会被压缩。
- 儿童数据最小化：不采集任何身份信息，清空数据入口在「我的」页且带二次确认。
