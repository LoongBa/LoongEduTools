# 数独思维 · 项目上下文

## 版本管理（2026-09-27 确立）
- 初始版本 **V1.0.0**；唯一权威字段 = `package.json` 的 `version`（发布/迭代时同步修改）。
- 升级规则：**微调（bug fix / 样式 / 文案）→ 升子版本号**（V1.0.0 → V1.0.1，自主）；**较大调整（新功能 / 交互改进）→ 升次版本号**（V1.0.0 → V1.1.0）；**主版本号（V2.0.0）升级必须经用户同意**。
- tag 命名：`数独思维-react-v1.0.x`（与 RedTools 老版本 `数独思维-v1.34` 系列区分）；打 tag 前先征得用户同意。

## 硬性约束（勿违反）
- **不使用任何云服务/数据库/网络请求**：全部状态存 localStorage，单一键 `redtools.shudu.v1`；外观偏好另存 `redtools.shudu.scheme` / `.mode`。禁止引入 Supabase、Edge Functions、fetch 外部接口。
- **措辞去游戏化**：全站文案不得出现「游戏」「一局」「玩家」「通关」等竞技表述，统一用「练习 / 这道题 / 完成 / 孩子」。新增任何界面文案前先自检这条红线。
- 无排行、无对战、不采集儿童个人信息。

## 架构
- `src/lib/sudoku.ts` 纯算法引擎（回溯求解 + 唯一解挖洞 + seeded PRNG + `findLogicStep` 逻辑步讲解），无任何 UI 依赖，可单测。
- `src/lib/store.tsx` 存档与音效（Web Audio 合成，无音频文件）；`theme.tsx` 主题；`content.ts` 教学内容数据（4+12 技巧、16 成就、10 级地图 + `LESSON_DATA` 16 关真实教学盘面与分步引导，迁移自老版本 v1.34 SKILLS）。
- **主题是两个正交维度**：`html[data-scheme="sky|paper|mint|dusk"]` × `html.dark`，共 8 组变量块。任一方案都能出浅/深两版；组件只消费 theme utility，不要写死色值。
- 页面为**单路由视图状态机**：`src/routes/index.tsx` 用 `View` 联合类型切换首页/练习/教学关/地图/墙/报告/设置，Provider 接在 `routes/__root.tsx`。刻意不用多路由，避免离线场景下的 history 基路径问题。
- 紧耦合父子件同文件内联（Board+NumberPad+ToolBar、SkillWall+AchievementWall+BookList+Calendar+WeekCard）。

## 踩坑与经验
- ❌ 在组件里用 `require("@/lib/sudoku")` → Vite/ESM 下不可用，必须顶部静态 import。
- ⚠️ `@theme inline` 里的 `--font-sans: var(--font-sans)` 会自引用导致字体失效（emoji 回退异常），必须写完整字体栈。
- ⚠️ canvas 绘制分享图时不能直接读 oklch 变量做数值混色，需用 `cssVar()` 取生效色值；渐变混色退化为纯色底。
- ⚠️ 9×9 唯一解题生成较慢，用 `genCache`（Map，上限 24 条 FIFO）按 `size:level:seed` 缓存，否则切难度会卡顿。
- ⚠️ 「推理步骤回顾」的回放（`src/lib/replay.ts`）是同步重计算：每步都要跑一次全盘逻辑求解扫描。必须同时受 `MAX_STEPS`（可讲解步数）与 `MAX_ROUNDS`（总轮次）双上限约束，并用 `cachedReplay` 按题面签名缓存，否则 9×9 结算后打开浮层会长时间卡住主线程。
- ❌ 在 Node 侧写脚本复刻引擎逻辑做验证 → 复刻版缺少原实现的剪枝（候选数为 1 即 break），大规格下必然超时。要验证就走真实源码或浏览器运行时。
- ⚠️ **引擎几何量纲（2026-09-27 合并老版本时修复的交付 bug）**：数独盘是 `size×size` 共 `size*size` 格、数值域 `1..size`。UI Agent 交付版曾把「总格数」写成 `size*size*size*size`（N⁴）、「值域上限/网格列数」误用 `size*size`，导致 `rowOf/colOf/boxOf/peersOf` 几何错乱、4×4 生成指数级回溯卡死、导入必拒。修复后基准：`rowOf=floor(i/size)`、`colOf=i%size`、`boxOf` 用 `size` 列宽、`total=size*size`、`max=size`；渲染网格 `repeat(size)` 列 × `size*size` 格；数字条/笔记候选/教学关数字条均 `1..size`。改引擎几何前先对照老版本 `solver.js` 与这条量纲。
- ⚠️ Playwright 冒烟注意：本工程首屏元素带 reveal 动画（opacity 门控），`text=` 定位会误匹配页面提示文案（如「去训练地图按阶梯走」），点按钮请用 `button:has-text(...)`；`isVisible()` 对 opacity:0 元素返回 false，必要时直接 `evaluate(el => el.click())`。**合成 `el.click()` 绕过命中测试，可能掩盖「元素被覆盖吞事件」的问题——涉及真实交互的验证必须用 `page.mouse.click(x, y)` 真实坐标点击**。
- ⚠️ **棋盘手势层（2026-09-27 修复）**：双指缩放切不可用 `absolute inset-0 z-0` 的覆盖 div 接 touch 事件——它盖在棋盘上会吞掉所有单击/单指触摸，表现为「点空格没反应、点数字总提示先点格子」（合成事件测不出，真实鼠标一点就现形）。正确做法：监听直接绑在棋盘外层容器（`ref` + 原生 `addEventListener`，`touchmove` 用 `{ passive: false }`），**仅两指捏合时 `preventDefault()`，单指放行点击与滚动**。
- 打印视图靠 `.no-print` / `.print-clean`，家长报告是唯一可打印页；导出即 `window.print()`。
