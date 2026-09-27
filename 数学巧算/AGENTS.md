# 数学巧算 · 项目入口

> 小学数学巧算学习产品（三产品架构中的重点单独增强项）——口算打基础，教程教技巧，练习见实效。

## 项目定位（一句话）

以**口算、计算为基础**，按阶段教程教小学生**巧算技巧**并**分层练习**——原理先行（讲不出原理不算学会），
一题多解对比（常规算法 vs 巧算），对齐人教版教材编排。

## 版本管理（2026-09-27 确立）

- 初始版本 **V0.1.0**（用户定夺：V0.1.0 起始迭代）；唯一权威字段 = `src/package.json` 的 `version`（发布/迭代时同步修改）。
- 升级规则：**微调（bug fix / 样式 / 文案）→ 升子版本号**；**较大调整（新功能 / 交互改进）→ 升次版本号**；**主版本号升级必须经用户同意**。
- tag 命名：`数学巧算-v0.3.x`；打 tag 前先征得用户同意。
- 当前版本 **V0.3.0**（2026-09-27：口算热身模块 + 防沉迷限时 + 家长报告打印 + minitool zip 打包 SOP）。

## 三架构产品中的位置

| 产品 | 面向 | 本产品关系 |
|---|---|---|
| 桃李助手（教师客户端） | 老师 | 无直接依赖（未来可选课堂巧算） |
| 英语陪练（家长学生端） | 家长/学生 | **UI 设计与离线构建管线参考源**（WebH5：styles.css 设计系统 + vite.config 双形态 + ui-kit） |
| 教育小程序集（RedTools） | 家长/学生/老师 | **数学口算 = 本产品口算基础层引擎来源**（generators.js 复用） |

> 产品口径：数学口算 = 纯口算训练；数学巧算 = 口算基础 + 巧算方法教学 + 技巧练习（产品矩阵规划 §1.1 重点增强）。

## 目录结构

```
数学巧算/
├── AGENTS.md                        # ← 本文件（项目入口）
├── docs/
│   ├── 数学巧算_需求分析与功能设计文档.md   # ★ 需求分析 + 功能设计（v0.1）
│   └── 数学巧算_smart_gen实现方案.md      # smart_gen 引擎实现蓝图（Oracle 评审）
├── content/                         # 教程库 SSOT（stages.json + stageN_*.json，32 讲）
└── src/                             # ★ React 工程（V0.3.0 已迭代）
    ├── publish_offline.py           #   minitool zip 打包管线（audit + zip + 解压测试版）
    ├── scripts/gen_stages.mjs       #   教程库 → src/data/stages.generated.ts
    ├── public/theme-boot.js         #   离线主题预置 + Chrome 61 兜底
    ├── src/
    │   ├── main.tsx                 #   入口（flex-gap 检测 + 引擎注入）
    │   ├── App.tsx                  #   视图状态机（home/stage/lesson/practice/warmup/me）
    │   ├── styles.css               #   设计系统（参考英语陪练，向日葵暖黄主题 + @media print）
    │   ├── data/stages.generated.ts #   教程库构建期内联
    │   ├── lib/store.tsx            #   localStorage 进度中枢（含 guard 防沉迷 schema v2）
    │   ├── lib/guard.ts             #   防沉迷/自控力纯逻辑（对齐 RedTools 通用需求 §4）
    │   ├── components/ui-kit.tsx    #   基础件（Btn/Panel/PageHead/Progress/Stars）
    │   ├── views/                   #   六视图（Home/Stage/Lesson/Practice/Warmup/Me/Report）
    │   ├── assets/smart_gen/        #   巧算引擎（sg_tools + stage 文件 + 主入口）
    │   └── assets/kou_gen/          #   口算热身引擎（内联数学口算 generators.js + KOU_META）
    └── tests/                       #   engine.mjs（引擎单测 L1-L6）+ smoke.mjs（浏览器冒烟）
```

## 文档地图

| 文档 | 位置 | 用途 |
|---|---|---|
| 需求分析与功能设计 | `数学巧算/docs/数学巧算_需求分析与功能设计文档.md` | **本文档（项目入口）**：产品定义/架构/功能/路线/风险/决策点 |
| smart_gen 实现方案 | `数学巧算/docs/数学巧算_smart_gen实现方案.md` | 巧算题生成器实现蓝图（Oracle 评审：双形态 UMD-IIFE + 5 文件拆分 + 三档 gen + 15 族核 validate） |
| 教程总规划（上游） | `docs/草稿/小学数学巧算_学习教程规划.md` | 教程设计原则 / 七步每讲结构 / 原理工具库 / 六阶段路线（**内容权威源**） |
| 分阶段教程（上游） | `docs/草稿/小学数学巧算_教程/` | 阶段 1-6 + 拓展 7 篇落地教程（转为 content JSON 的源） |
| 知识路线信息图 | `docs/草稿/小学数学巧算_知识路线图.html` | 视觉化路线（参考，不迁移） |
| 口算引擎来源 | `RedTools/series/学科/数学口算/` | generators.js 25+ 知识点 + 练习/打卡/防沉迷样板，**复用不重写** |
| 结构参考 | `点读陪练/docs/英语点读陪练_产品与架构设计方案.md` | 本文档结构与方法参考 |
| 产品规划 | `docs/教育工具/教育工具产品矩阵规划.md` §1.1 | 三产品架构 + 重点增强定位 |

## 硬性约束（勿违反）

- **原理先行**：任何教程讲次必须包含"为什么能这样算"的原理探究；对只有口诀无原理的讲法说 NO。
- **有标准答案**：练习全部可判定对错（normalizeInput 归一），无 PK/排行/晒分。
- **儿童数据最小化**：只存本地进度/打卡/错题，不上传个人数据；防沉迷复用。
- **完全对齐教材**：章节对照人教版单元（教程规划 §八），不额外扩展超纲内容。
- **干扰常错**：分配律与结合律混淆 / 漏乘括号内项 / 去括号忘变号 / 裂项漏头尾 —— QA 重点查这些。

## 快速入口

```powershell
# 数学巧算 React 工程（V0.3.0 已迭代）
cd 数学巧算\src
pnpm dev                # 开发（3016）
pnpm build              # 离线 minitool 包（Chrome 61 基线 + 经典脚本，dist/）
pnpm build:online       # 在线形态（Web 部署，现代浏览器）
pnpm typecheck          # tsc --noEmit
pnpm test:engine        # smart_gen 引擎单测（31 方法 + 口算 25 知识点 + guard 纯逻辑）
pnpm test               # 浏览器冒烟（需 CHROMIUM_PATH，file:// 直开 = minitool 形态）
python publish_offline.py   # minitool zip 打包 + audit + 解压测试版（→ RedTools/publish/学科/）

# 教程库 SSOT（改内容后需重生成）
node scripts/gen_stages.mjs   # content/*.json → src/data/stages.generated.ts

# 参考源（UI/构建复用）
点读陪练\WebH5\src\styles.css       # 设计系统
点读陪练\WebH5\vite.config.ts       # 双形态构建
```

## 并行任务规则（继承仓库级）

只维护本会话负责的 `数学巧算/` 目录；不碰 docs/草稿/ 其它草稿产品；删除/移动共享产物先问。

## 后续待办

- [x] V0.1.0 工程骨架（React+Vite 双形态：offline minitool + online）
- [x] 教程库 content SSOT（32 讲，gen_stages.mjs 内联）
- [x] smart_gen.js 引擎族 1-6（16 方法 × 3 档，9600 题 validate 0 失败）
- [x] 五视图（课程地图/七步课堂/三档练习/打卡/我的，参考英语陪练 UI）
- [x] 引擎补齐族 7-10（15 方法：减法/除法性质 + 小数 4 + 分数 4 + 拓展 3，含 Fraction/Decimal 精确类）→ **V0.2.0**
- [x] 口算热身模块（内联数学口算 generators.js，三档年级知识点池 + WarmupView + 防沉迷联动）→ **V0.3.0**
- [x] 防沉迷限时（guard.ts 对齐 RedTools 通用需求 §4：两段式拦截 + 自律锁 + MeView 设置）
- [x] 家长报告打印（ReportView + 连点 5 次家长门槛 + @media print）
- [x] minitool zip 打包 + 发布 SOP（publish_offline.py 6 步管线 + SOP 文档）→ **V0.3.0**