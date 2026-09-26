# 数独思维 — UI美化需求与功能设计（交付 UI Agent）

> 本文档基于 **v1.33**（2026-09-26，L0-L7 技巧阶梯全落地，16 技巧教学关）编写，
> 供 **UI Agent 做界面美化与体验优化**时使用：先读懂「功能现状 + 交互行为 + 测试契约」，
> 再按「美化需求」逐项落地。**硬性约束与测试契约（§8/§9）是不可触碰的红线。**

## 0. 文档导航（先读这三条）

| 主题 | 节 | 对 UI Agent 的意义 |
|------|----|--------------------|
| 技术基线 | §2 | Chrome 61 / ES2017 / 离线 CSP，决定可用 CSS/JS 能力 |
| 页面地图与视图规格 | §4 | 全部 17 个界面（页面+浮层）的功能/结构/交互，美化范围清单 |
| **测试契约与硬约束** | **§8/§9** | **不能改的 class / ID / 文案 / 行为，改了冒烟回归必挂** |

配套文档（功能细节权威来源，美化冲突时以本文件 §8 契约为准）：
`数独思维-设计文档.md`（玩法/算法/交互设计）、`数独思维-使用文档.md`（用户手册）。

---

## 1. 产品概述

| 项 | 说明 |
|----|------|
| 产品名 | 数独思维（RedTools/益智/逻辑思维 第 4 款，P1） |
| 定位 | 小学生（K1-3–K4-6）逻辑推理训练：经典数独 + 技巧教学体系 |
| 形态 | **离线 H5 小工具**：静态 zip（双击 index.html 即玩），发布小红书 |
| 核心体验 | 点选填数零门槛 · 技巧教学 4+12 关 · 每日挑战/闯关地图持续激励 · 家长报告 |
| 原则红线 | **无竞技无排行**（分享仅展示自身表现）；**儿童数据最小化**（本地存档，无账号无云同步）；零素材零依赖 |
| 数据 | localStorage `redtools.shudurumen.v1`（同页 17 个冒烟测试断言其结构不回退） |

---

## 2. 技术基线（决定美化手段的天花板）

| 维度 | 基线 | 对美化的限制 |
|------|------|-------------|
| 浏览器 | **Chrome 61**（Android 8.1 WebView 同档） | 无 flex `gap`/`aspect-ratio`/`clamp()`/逻辑属性/`:has`/`@container`/`dvh`；需 -webkit- 前缀（现有 css 已示范） |
| JS | **ES2017 经典脚本**（var+function，无 import/export/module） | 美化逻辑改动须保持同风格，无 `?.`/`??`/对象展开/`replaceAll` |
| CSP/白名单 | 离线容器：无 fetch/XHR/Worker/定位/剪贴板API/`window.open`/外链/`<base>`/`<iframe>`；zip 内仅 `css/js/jpg/png/svg/webp/json/html` | **禁外部字体/图片/CDN**；动画只能 CSS/JS 本地做 |
| 字体 | 系统字体栈（`-apple-system/PingFang SC/Microsoft YaHei` 等） | 无 iconfont，**emoji 即图标体系**（现有 UI 已用 ✅🎯🔒🔓💎✨🏅📅 等） |
| 音效 | Web Audio 合成（Oscillator，无音频文件） | 美化不改音频（行为层） |
| 核心算法 | `solver.js`（`window.SUDOKU`）**自 v1.0 零改动** | **碰都不许碰**（含格式化） |

---

## 3. 视觉体系现状（style.css 1129 行的基底）

| Token | 现值 | 用途 |
|-------|------|------|
| 主色 | `#4aa8ff` | 主按钮 / 用户填数 / 激活态 |
| 主色浅 | `#dceefe` / `#e6f3ff` | 次级按钮 / 浅底 |
| 背景 | `#e8f4ff` | 页面底（天蓝系） |
| 文字主 | `#2a3a4a` | 标题/正文 |
| 文字次 | `#7a8ea3` / `#9db4c8` / `#8ba4bd` | 副标题/注释 |
| 学术灰 | `#3a5a7a` / `#3a6a9a` | 已知格数字/次要按钮字 |
| 强调橙 | `#ff9f43`（选中）/ `#ff9c1a`（打卡）/ `#ff8c42`（建议） | 教学选中描边/打卡日历 |
| 成功绿 | `#12b76a`（ok）/ `#e6f7ee`（闪底） | 填对确认 |
| 错误红 | `#ff6b6b`（计数）/ `#ffc2ba`（闪底）/ `#e06c6c`（danger） | 冲突/删除 |
| 星星金 | `#f5a623` | 星级 |
| 卡片 | 白底 + `border-radius:14px` + 阴影 `0 2px 8px rgba(74,168,255,.12)` | 全站卡片族 |
| 圆角 | 卡片 14 / 按钮 12 / 小块 8-10 | 统一样式语言 |
| 布局 | 三段式 `header / main#view(max-width:480px) / footer`；单列滚动 | 全站骨架 |

> 现状整体**功能完整但视觉朴素单色**：差异化不足（首页一堆 `teach-btn` 卡片长得一样）、
> 层级感弱、无页间动效、反馈仅色块。美化空间大，但**先保契约再谈美**。

---

## 4. 页面地图与视图规格（美化范围总清单）

```
启动 → 难度页(首页)
├─ 📖 规则教学（浮层 4×4 演示盘，4 步）
├─ 🎯 技巧教学关 ×4 适龄（浮层结算 ×2，进入 renderSkillView）
├─ 🏆 技巧徽章墙（页面）
├─ 🧩 自由解题（adv 技巧入口列表）
│    └─ 技巧教学关 ×12 进阶（浮层结算）
├─ 📕 错题本（页面，有错题时入口）→ ▶ 重练 = 游戏页(回放)
├─ ⭐ 收藏本（页面常驻）→ ▶ 重练 = 游戏页(回放)
├─ 📅 每日挑战（入口卡片 + 周卡）→ 游戏页(isDaily)
├─ 🗺️ 闯关地图（页面 10 关）→ 游戏页(fromMap)
├─ 🏅 成就（页面 16 枚）
├─ ⚙️ 设置（页面）
├─ 📊 家长报告（页面 + 🖨️ 导出/打印=window.print）
├─ 📥 导入题目（浮层）→ 游戏页(createdFrom='import')
├─ ▶ 继续上次（首页条件卡）→ 游戏页(恢复)
│
游戏页（普通/每日/闯关/导入/回放五态共用一套渲染）
├─ 通关 → 结算浮层（🎉 数独完成！）
│    ├─ 📤 分享这题（浮层：文本+打印图+QR）
│    ├─ 📤 分享成绩（浮层：1080×1920 成绩卡+文案）
│    ├─ ⭐ 收藏/💛 取消 / 再来一局 / 选难度 / 📅 打卡日历
└─ 返回/切换 → 首页（未完成自动入错题本）
```

### 4.1 难度页（首页）—— `showDifficultyView`

| 项 | 现状 |
|----|------|
| 结构（渲染顺序） | `page-title` → `home-hint`（规则一句话+可选降档横幅）→ `teach-btn`(📖规则教学) → **适龄技巧教学关卡×4**（`teach-btn skill-btn`，头 `✅/🎯 + 名 + 技巧`，副 `已点亮徽章·可再练一次 / 学一个技巧点亮一个徽章`）→ `teach-btn badge-btn`(🏆技巧徽章墙) → `teach-btn book-btn`(🧩自由解题/📕错题本[条件]/⭐收藏本/📅每日挑战/🗺️闯关地图/🏅成就/⚙️设置/📊家长报告/📥导入题目) → 断局恢复卡（`diff-btn resume-btn` 条件）→ `diff-btn`×3（简单/普通/困难，含建议档 `.suggested` 橙描边） |
| 页脚 | `btn-checkin`（📅 打卡日历 · 连续 N 天） |
| 交互 | 全静态卡片点击进入；`🌱`降档横幅为黄色提醒文本 |
| 美化要点 | **入口最多的页面（≥12 卡），当前视觉同质化严重**——需按类型分组/分区、卡片视觉分级（教学/数据/功能/危险），入口秩序化 |

### 4.2 游戏页（核心）—— `renderGameView`（五态共用）

| 区块 | DOM/class | 交互 |
|------|-----------|------|
| 顶栏 | `topbar`: `btn-ghost-sm`(←返回) + `level-title`（难度名 + `small` 尺寸/已知格/·每日题/·关卡 X-Y/·导入题）+ `top-timer`(⏱ 00.0) | 计时器 100ms 刷新 |
| 棋盘 | `board-card` > `board#sudoku-board` > `.cell`(宽度+padding-bottom %; `box-t/box-l`宫线) > `.cell-inner`（`given/user/selected/peer/same/wrong/ok/replay-mark` + `cell-note > .note-slot[data-v]`笔记格） | 点格选中/取消；点数字条填数；冲突红闪；正确绿闪 |
| 缩放 | `zoom-reset-btn`（固定浮标，pinchScale>1 显示） | 双指捏合 0.5-2.2x + 复位 |
| 提示行 | `sudoku-msg`（ID 硬依赖） | 教学文案/温和提示/讲解型提示 |
| 数字条 | `num-kbd` > `num-row` > `num-btn`×N | 点按填数（≥48px 命中） |
| 工具条 | `tools` > `tool-btn`×4（橡皮/✏️笔记/撤销/提示） | 铅笔模式 `.active` 高亮；提示按档限流并置灰 |
| 页脚 | `game-footer`: `btn-ghost-sm`(返回难度/重新开始) + `footer-errors`(❌ N) | 错误计数 |
| 规则提示 | 9×9 竖屏一次性「📱 建议横屏」浮层 | 非阻塞 |
| 美化要点 | 棋盘信息密度最高：高亮四色（selected橙/peer蓝/same橙/ok绿/wrong红）需语义清晰不刺眼；数字条/工具条与棋盘层级关系；**教学引导高亮（peer）与填错反馈需显著区分** |

### 4.3 技巧教学关（base 4 + adv 12 共用）—— `renderSkillView`

| 项 | 现状 |
|----|------|
| 结构 | `topbar`（←返回 + 🎯技巧名 + small「教学关·不计入进度」）→ `board-card` > `board#skill-board` > `.cell`（外层 `box-t/box-l`+目标格 `.target` 蓝框）> `.cell-inner`（given/peer高亮/selected橙框）→ `sudoku-msg#skill-msg` 引导文案 → `num-kbd` > `num-row` > `num-btn` |
| 交互 | 引导步骤逐条推进（高亮约束格 → 点目标空格 → 点数字）；错填温和提示不计错；完成点亮徽章 + `showOverlay` 结算（base 用「🎉 学会啦！」浮层，adv 用「💎/✨ 进阶徽章」浮层） |
| 当前差异 | base 与 adv 视觉完全相同（仅 emoji 前缀 ✅/🎯 与 ✨/💎 区分） |
| 美化要点 | **16 个技巧关是产品核心卖点**——当前无「教学感」：无步骤进度条、无技巧示意图、无风格化讲解卡；建议增加步骤指示器、技巧名头图区、完成庆祝动效 |

### 4.4 列表型页面（徽章墙/自由解题/成就/错题本/收藏本/打卡日历/家长报告/设置）

| 视图 | class 族 | 数据 | 美化要点 |
|------|----------|------|----------|
| 🏆 技巧徽章墙 | `teach-btn badge-card`（头 `✅已点亮/🎯可学/🔒锁定` + 副文案）+ 返回 `btn-checkin` | `store.skills`（base 4） | 突出「点亮」成就感：建议分区网格/徽章圆章化 |
| 🧩 自由解题 | 同徽章墙卡片（头 `✨已点亮/💎未点亮`）| `store.advSkills`（12） | 与徽章墙同族但语义「进阶」；建议差异化色带 |
| 🏅 成就墙 | 同 `teach-btn badge-card`（头 `🏅已解锁/🔒未解锁` + 副描述/日期）| `store.achievements`（16 枚） | **16 枚成就长得与技巧徽章墙一模一样**——建议成就「奖章/奖杯」化视觉 |
| 📕 错题本 | `teach-btn book-card`（`book-thumb` 72px 迷你盘 + 头标题 + 副统计 + `book-act`(▶重练/🗑)）+ 清空/返回 | `store.mistakes` | 迷你盘缩略已存在；建议空状态插画 |
| ⭐ 收藏本 | 同上结构 | `store.favorites` | 同上 |
| 📅 打卡日历 | `calendar` > `calendar-grid` > `cal-day`（`done`橙/`today`蓝描边）+ `streak-info` | `store.checkin.dates` | 建议月历加「连续 N 天」徽标、今天高亮更突出 |
| 📊 家长报告 | `report-card`×3（今日反馈/近7天/成长进度）+ 每卡 `.report-card-title` + `.report-row/.report-dist/.report-badge-line`；`btn-checkin`(🖨️导出/打印/返回) | `store.history/skills/advSkills/daily/checkin/achievements/mapProgress` 全派生只读 | **打印 CSS 已专门处理**（§8.5）；屏显建议数据可视化（难度分布条/进度条） |
| ⚙️ 设置 | `settings-row`（`settings-label`+`settings-sub` + `settings-toggle.on/off`）；`settings-danger`(🗑️清除)；`settings-about` | `store.settings.sound` | 开关控件当前为文字按钮（开/关），可美化但**保持 `.on/.off` class 与文案「开/关」** |

### 4.5 浮层（结算/分享/导入/教学）

| 浮层 | 结构 | 要点 |
|------|------|------|
| 通用结算 `showOverlay` | `overlay`(rgba(15,23,42,.5)遮罩) > `overlay-card`(白 340px, cardIn 0.25s) > `overlay-title` + `overlay-sub` + `summary`（`.stars-line`金色 34px + `.checkin-line` + `.record-badge`新纪录绿）/ `overlay-btns`（`btn-main`/`btn-ghost`） | 星级 `starPop` 动画已有；成就/技巧点亮行追加 |
| 🎉 通关结算 | 同上 + 星级 + 打卡行 + 新纪录徽章 + 解锁成就/点亮技巧行 + 6 按钮 | 按钮多（5-6 个）层级需决策 |
| 📤 分享这题 `openSharePuzzleOverlay` | `overlay-card`：标题 + `export-zone`(textarea SD文本) + `btn-main`复制 + `share-img`(canvas打印题面) + 查看答案版 + `share-qr`(二维码) + 提示 + 返回 | 内容长（可滚动 88vh） |
| 📤 分享成绩 `openShareResultOverlay` | `share-img`(1080×1920 长图) + `export-zone`(文案) + 复制 + 返回 | 长图内视觉由 canvas 决定（§8.4 canvas 是独立绘制，改图需改 JS） |
| 📥 导入题目 `openImportOverlay` | `import-zone`(textarea) + `import-err`(ID 硬依赖) + btn-main/btn-ghost | 错误提示槽位 |
| 📖 规则教学 `openTeach` | `overlay-card teach-card`：`teach-title` + `teach-text` + `teach-board`(176px 4×4：`.teach-cell.box-t/box-l.hl` + `.teach-num/.teach-q`?) + 上一步/下一步/跳过 | 讲解型浮层，建议分步指示 |

### 4.6 轻提示与辅助件

| 件 | class | 说明 |
|----|-------|------|
| Toast | `toast`（rgba(30,45,60,.9) 灰条，bottom 90px，2.6s） | 复制/保存反馈 |
| 页头 | `app-header`：`header-brand` > `header-icon`(30px 圆角) + `header-title` + `header-ver`(v1.33) | 全页一致（`renderHeader`），教学页用 `renderSkillHeader` 同构 |
| 周卡 | `streak-card`：`streak-left`(标题/大数字/今日状态) + `streak-week`(7×`streak-day`>`streak-dot[.lit/.today/.future]`+`streak-wd`) + `streak-sub` | 首页每日挑战下 |

---

## 5. 数据模型（localStorage `redtools.shudurumen.v1`，美化不改 schema）

```jsonc
{
  version: 1,
  best: { "4":{ms,errors,hints,stars,date}, "6":{...}, "9":{...} },   // 各档最佳
  recent: { "4":ms, ... },                                            // 最近用时
  checkin: { dates:[], streak:0 },                                    // 打卡
  history: [{date,level,ms,errors,hints,stars}]（滚动30条）,           // 对局史
  skills: { boxElim:true, rowColElim, blockElim, crossElim },         // base 徽章
  advSkills: { uniqueElim, xwing, nakedPair, hiddenPair, nakedTriple, hiddenTriple, xyWing, swordfish, uniqueRect, wWing, chains, forcing },
  mistakes: [{id,ts,level,board,solution,errors,hintIdx,result,stars}]（上限50）,  // 错题
  favorites: [{id,ts,level,board,solution}],                          // 收藏
  daily: { date, level } | null,                                      // 每日挑战
  achievements: { key: 'YYYYMMDD' },                                  // 16 枚成就
  mapProgress: { completed:[{i,doneAt}] },                            // 闯关
  settings: { sound: true },
  cur: {...}                                                          // 断局快照
}
```
> 19 个键全被冒烟断言；**清除进度 = `localStorage.removeItem` + reload**（美化不能引入新存储键）。

---

## 6. 游戏规则与行为契约（美化不改变行为语义）

| 规则 | 值 |
|------|-----|
| 三档难度 | 4×4已知10 / 6×6已知21 / 9×9已知33（实际 [目标,目标+4]，顶栏显示） |
| 星级 | 0提示0错=3★；提示≤1且错≤3=2★；其余1★（提示封顶2★；笔记不影响） |
| 每日挑战 | 周轮换 `DAILY_DIFFS=['6','4','4','6','6','6','9']`；当日种子同题（跨天换题） |
| 闯关地图 | 10 关线性（3档×3 + 收官 3-4）；`i<完成` 已通/`=完成` 可玩/其余锁定；同关同题（固定 seed） |
| 提示限流 | 6×6 每局≤3 / 9×9 每局≤2 / 4×4 不限；提示带讲解（定位行/列/宫约束） |
| 铅笔模式 | 笔记开关；行/列/宫已有该数拒绝；自动铅笔（落定后清同伴候选） |
| 错误反馈 | 冲突红闪 400ms + 温和提示 + 计数+1；**答错不惩罚不判负**（静默接受合法、红闪提示非法） |
| 错题规则 | 冲突/提示自动入错题本（上限50去重）；0错0提示重练通关自动消（「掌握即清」） |
| 成就 | 16 枚，通关结算自动解锁（浮层提示） |
| 降档建议 | 最近两局「吃力」→ 首页横幅 + 建议档橙描边（不扣分） |
| 断局恢复 | 每步存快照；首页「▶ 继续上次」；通关/重开清快照 |

---

## 7. 无障碍与触控基线（现状已达标，美化不得回退）

- 触控命中区：数字条 52px / 工具按钮 52px / 主按钮 ≥48px / 文字按钮 ≥36px（CSS 已设）
- 全按钮 `aria-label`：渲染时已设置（`setAttribute('aria-label', ...)`），美化勿删
- 禁选中（`user-select:none`）+ `touch-action:manipulation` + 长按系统菜单禁用（分享长按图片场景靠 `share-hint` 文案引导「📸 长按保存」）
- 动态 `--app-height`（`#app-header + #app-main + #app-footer` 三段式，键盘弹起适配）；安全区 `env(safe-area-inset-*)`
- 字体：输入 ≥16px 防 iOS 聚焦缩放（9×9 窄屏降 14px 是例外，冒烟断言）

---

## 8. 硬性约束（红线——违反即回归失败）

### 8.1 测试契约：class 选择器（冒烟 `page.locator(...)` 全部依赖，**改名/删 class 必挂**）

```
核心（不可动）:
  .num-row .num-btn        .tool-btn（橡皮/✏️笔记/撤销/提示 文本也契约）
  .diff-btn（含 .suggested）  .teach-btn / .teach-btn-head / .teach-btn-sub
  .teach-btn.badge-card     .teach-btn.badge-card.locked
  .skill-btn .book-btn .badge-btn .resume-btn
  .overlay / .overlay-card / .overlay-title / .overlay-sub / .summary
  .overlay-btns / .btn-main / .btn-ghost / .btn-ghost-sm / .btn-checkin
  .book-card / .book-act / .book-thumb / .mini-cell / .book-empty
  .map-node / .map-emoji / .map-name / .map-tip / .map-skill-tag(.off) / .map-done-banner
  .calendar / .calendar-grid / .cal-day(.done/.today) / .streak-info
  .streak-card .streak-left .streak-title .streak-num .streak-today
  .streak-week .streak-day .streak-dot(.lit/.today/.future) .streak-wd .streak-sub
  .settings-row .settings-col .settings-label .settings-sub
  .settings-toggle(.on/.off) .settings-danger .settings-about
  .report-card .report-card-title .report-row .report-dist .report-badge-line .report-empty
  .board-card .board .cell(.box-t/.box-l) .cell-inner(.given/.user/.selected/.peer/.same/.wrong/.ok/.replay-mark/.target)
  .cell-note .note-slot(.on)   .num-kbd .num-row .tools
  .share-img .share-qr .share-hint .export-zone .import-zone #import-err
  .toast .zoom-reset-btn .page-title .home-hint .header-brand .header-icon .header-title .header-ver
  .game-footer .footer-errors .topbar .level-title .top-timer .sudoku-msg(.warn)
```

### 8.2 测试契约：文案与 emoji（`has_text` 断言，**改文案/emoji 必挂**）

- **难度按钮**：「简单 / 普通 / 困难」（smoke_shudu_easy 按 `has_text="普通"` 点进普通局）
- **工具按钮**：橡皮 / ✏️笔记（smoke 用 `has_text="笔记"`）/ 撤销 / 提示
- **徽章墙三态 emoji**：✅（已点亮）/ 🎯（可学习）/ 🔒（锁定占位）
- **自由解题二态**：✨（已点亮）/ 💎（未点亮）
- **地图三态**：✅ 已通 / 🔓 可玩 / 🔒 锁定；地图技巧 tag：✅/🎯
- **地图关卡名**：1-1 … 3-4（含长名「简单 4×4 · 初试身手」等 tip 文本）
- **结算按钮**：再来一局 / 选难度 / 打卡日历 / ⭐ 收藏这局 / 💛 取消收藏 / 📤 分享这题 / 📤 分享成绩 / 返回结算 / 复制分享文案 / 知道了(横屏提示)
- **列表按钮**：▶ 重练 / 🗑（删）/ 清空错题本 / 清空收藏本 / ← 返回 / ← 返回难度
- **首页入口词**：规则教学 / 技巧徽章墙 / 自由解题 / 错题本 / 收藏本 / 每日挑战 / 闯关地图 / 成就 / 设置 / 家长报告 / 导入题目 / 打卡日历 / ▶ 继续上次
- **固定文案**：⏱ 计时格式（00.0 / 07.5）/ 星级 ★☆ / ❌ 错误计数 / 掌握技巧 X/Y 🏆 / 打卡日历 · 连续 N 天 / 今日已完成 ✅

> 允许：给卡片/按钮**增加**装饰性子元素（图标、背景、角标）——只要**保留上述 class 与可见文本**；
> 禁止：改文本、改 emoji 前缀、删 class、改 DOM 嵌套层级中冒烟依赖的部分。

### 8.3 JS 硬依赖 ID 与选择器（main.js `getElementById`/`querySelector`）

| 目标 | 依赖方式 |
|------|----------|
| `#app-header` / `#view` / `#app-footer` | `getElementById`（index.html 静态三段式，**不可移动这三者层级**） |
| `#sudoku-msg` | `getElementById('sudoku-msg')`（游戏页提示行） |
| `#skill-msg` | `getElementById('skill-msg')`（教学关引导行） |
| `.cell-inner` | `cell.querySelector('.cell-inner')`（**每个 .cell 的第一个子节点必须是 .cell-inner**，两层渲染结构不可破坏） |
| `.summary` | `overlayEl.querySelector('.summary')`（结算浮层星级/记录徽章注入点） |

### 8.4 分享图是 canvas 绘制（美化需改 JS，双层维护）

- `drawPuzzleImage`（分享题打印图）：白底 + 深色网格 + 宫粗线 + 题面/答案切换 —— 与棋盘 CSS 视觉独立
- `drawResultCard`（分享成绩 1080×1920 长图）：渐变底 + 装饰圆点 + 标题 + 成绩卡 + 迷你盘 + 二维码 + 文案 —— **含「龙爸乐学 · 数独思维」落款与技巧掌握行**
- **规则**：若美化「分享图」需同步改这两段 canvas 代码；**二维码、SD 文本、文案为功能契约不可删**
- `shareTextForCurrent()` / `shareResultText()`：SD 文本格式与分享文案为外部传播契约，**文案不可改**

### 8.5 打印样式（家长报告 PDF 导出）

- `@media print`：隐藏 `.app-header/.app-footer/.home-hint` + `.view > *:not(.report-card):not(.page-title)`；报告卡去阴影加边框、`break-inside:avoid`
- **规则**：美化后必须用 `window.print()` 实测「导出 PDF 仅含报告内容」；新增屏显元素若不加 `print` 隐藏会污染 PDF

### 8.6 行为契约（美化不能破坏）

- 点击即反馈：所有按钮 `:active` 态有变色（现有 CSS 定义，美化需为每个交互元素提供按下反馈）
- 冲突/正确/选中高亮必须清晰可辨（四色语义）
- 提示按钮 disabled 状态视觉（`opacity:.45`）保留
- 星级计算/成就判定/打卡数据链路不受任何视觉层影响
- 9×9 竖屏「建议横屏」浮层保留

---

## 9. UI 美化需求（按优先级 P0 必做 → P2 增强）

> 原则：**保持天蓝系基调**（品牌一致），用「层级/留白/卡片分区/微动效/反馈强化」提升质感；
> 不引入新依赖、不破坏 §8 契约。每项给出 = 现状问题 → 建议方案 → 涉及文件。

### P0（体验正确性——先做）

| # | 目标/页面 | 现状问题 | 建议方案 | 涉及 |
|---|-----------|----------|----------|------|
| U1 | 首页信息架构 | 12+ 入口卡同质化（全是白卡 text 行），用户找不到重点 | 按四组分区并加组标题：① 开始（难度 3 档大卡）② 每日/闯关（每日挑战+周卡+闯关地图）③ 学习（规则教学+技巧教学+徽章墙+自由解题）④ 更多（错题/收藏/成就/报告/设置/导入）；主次级视觉（难度卡最大、核心 CTA 用主色实心） | main.js `showDifficultyView` + CSS |
| U2 | 游戏页层级 | 棋盘/数字条/工具条无主次，提示行文案抢占视觉 | 棋盘区强化（更大阴影+圆角+内衬）；数字条与工具条分组描边；提示行弱化为辅助色带（当前蓝 `#4a90d9` 可保留但降视觉权重） | renderGameView + CSS |
| U3 | 教学关步骤感 | 16 技巧关无步骤进度指示，用户不知道「学几步/到哪了」 | 顶部加步骤指示器（第 1/2 步点状或「第 x 步 / 共 n 步」标签）；完成步给✅角标 | renderSkillView + CSS |
| U4 | 高亮对比度 | 教学 peer 浅蓝与普通局 peer 同色，用户分不清「教学引导」vs「选中提示」 | 教学关高亮区加「目标格脉动环/引导箭头」；冲突红闪与 ok 绿对比度校核（WCAG AA 起步） | CSS（.cell.target / .peer / .wrong） |
| U5 | 空状态 | 错题本/收藏本/报告空数据只有一行灰字 | 三态空状态：emoji 插画（📭/⭐ 大号）+ 主文案 + 引导副文案 + 主色 CTA（去玩一局） | showMistake/Favorite/Report + CSS |

### P1（视觉质感——完工观感）

| # | 目标 | 建议 |
|---|------|------|
| U6 | 卡片体系 | 统一卡片组件 token（圆角/阴影/边框/内衬），列表页全部套用；`teach-btn` 虚线卡 vs 实线白卡语义区分（教学=虚线准入门，数据=实体卡） |
| U7 | 徽章墙/成就墙差异化 | base 徽章＝圆形徽章（技能图标区），adv＝菱形/星形（进阶感），成就＝奖杯/奖章（🏅 已解锁带日期缎带）——保留 `.badge-card` class 与 head/sub 文本，内部可加图标容器 |
| U8 | 星级动效 | 结算 3 星依次弹出（当前整行 `starPop` 一次）＋ 新纪录/成就解锁发光环；`@keyframes` 温和 ≤400ms，双写 -webkit- |
| U9 | 按钮体系 | 三级按钮 token：主（实心主色）、次（浅蓝）、幽灵（描边/透明），全站统一 `:active` 按压反馈（当前已有变色，可加 `scale(.97)` 微按，注意触控无 hover 依赖） |
| U10 | 打卡日历 | 今日格强化（白底橙字描边 → 实心橙+白字+「今」角标）；连续打卡显示火焰🔥徽标（复用 streak-num） |
| U11 | 家长报告 | 难度分布/技巧掌握改轻量进度条（CSS 比例条，非 canvas）；打印版保持简洁黑白 |
| U12 | 设置开关 | `.settings-toggle` 从文字钮改 **iOS 风 switch**（保持 `.on/.off` class + 文案「开/关」aria）；清除进度行危险色突出并加两级确认（已有浮层） |

### P2（锦上添花——有余力再做）

| # | 目标 | 建议 |
|---|------|------|
| U13 | 页间过渡 | 视图切换轻量 fade/slide（300ms 内，双写前缀；**冒烟点击后立即断言，过渡不能阻塞定位**——建议 opacity 过渡而非位移，或过渡只作用于装饰层） |
| U14 | 棋盘触感 | 选中格微阴影/脉冲；填数成功数字轻微上浮归位（300ms）；9×9 填数时同行列宫 tint 渐变呼吸（注意 Chrome 61 性能，9×9 81 格勿用高开销动画） |
| U15 | 技巧名头图 | 每技巧教学关顶部加技巧 emoji 主视觉区（如 🔍 单宫排除 / ⚡ X-Wing），从 `SKILLS` 数据加 `emoji` 字段 + 头图容器（新增字段零 schema 风险，仅 UI 层） |
| U16 | 分享长图升级 | `drawResultCard` canvas 排版优化（星级更大、盘面区留白、二维码区加圆角白卡底）——需 JS 同步改 |
| U17 | 背景装饰 | 页面底色加极淡的几何纹样（CSS 重复渐变 / 径向圆点，成本≈0） |
| U18 | 文字排版 | 标题字重/字号梯度统一（页面标题 20-22 / 卡片主 16-17 / 副 12-13 / 注释 10-11）；数字使用等宽 `font-variant-numeric: tabular-nums`（计时已用） |

### 动效规范（全局）

- 时长 ≤400ms；入场动画 `cardIn`/`starPop` 已存在（0.25-0.35s）——可增强不可改时长节奏
- 动画必须双写 `@-webkit-keyframes` + `@keyframes`（现有全站已示范）
- 避免频闪/大面积位移（儿童视力 + Chrome 61 性能）：`transform/opacity` 优先

---

## 10. 验证清单（美化交付门槛）

| 项 | 命令/方式 | 期望 |
|----|-----------|------|
| 单元/回归冒烟 | `cd RedTools/series/益智/逻辑思维/数独思维/tests` 逐项运行 `smoke_shudu*.py`（17 个：主/adv/badge/calendar/daily/easy/map/mistake/pen/qr/report/resume/result/settings/share/skill/teach/zoom） | **17/17 全 PASS**（file:// 与 http:// 双协议各跑一遍） |
| 布局回放 | `shot_shudu*.py` 截图 5 个关键页 | 首页/游戏页/教学关/结算浮层/家长报告无溢出、无遮挡 |
| 打印 | `window.print()` 另存 PDF | 仅报告卡+标题，无顶栏/底栏/按钮污染 |
| 视觉质检 | `look_at` / `task(subagent_type="multimodal-looker")` 目检截图 | 高亮四色语义清晰、卡片对齐、无重叠 |
| 兼容抽查 | DevTools 模拟 Chrome 61 + 小屏 340px | 无 flex gap 等现代属性告警、9×9 字号 14px 生效 |
| 分享图 | 打开分享题/分享成绩浮层 | canvas 出图正常、二维码可扫、SD 文案完整 |
| 存储兼容 | 替换 style.css/main.js 后用旧存档打开 | 无 schema 回退、无 JS 报错（`node 0`） |

---

## 11. 变更最小化建议（给实施 UI Agent 的操作指引）

1. **90% 的美化落地在 `style.css`**（token/层级/动效/响应式）——优先只改 CSS。
2. 需调整 DOM 结构时（如首页分区、教学步骤条），改 `main.js` 对应**渲染函数内 `makeEl` 语句**（追加新容器/装饰元素），**保留原有 class 与文本节点**。
3. **禁止**：删/改冒烟依赖的 class 与文案（§8.1/8.2）；移动 `#view` 或 `.cell > .cell-inner` 层级；改 `solver.js`；引入外部资源/语法超 ES2017/CSS 超 Chrome 61。
4. 每完成一组（建议按 P0→P1→P2 顺序），跑对应冒烟切片 + `look_at` 截图目检，全绿再进入下一组。
5. 完成后跑 §10 全量清单，输出变更摘要（改了什么/哪些页面/截图证据），等待人工审核。

---

*文档版本：v1.0（对齐数独思维 v1.33）｜ 编写：Sisyphus ｜ 用途：UI Agent 美化实施输入*