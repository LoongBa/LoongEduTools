# 数独思维 · 测试

| 命令 | 说明 |
|---|---|
| `pnpm test:engine` | 引擎单测：`src/lib/sudoku.ts` 真实源码（Node 26 原生 TS），断言生成/挖洞/唯一解/SD 往返/导入校验 |
| `pnpm test` | 浏览器冒烟：自动起 `preview`（3014）→ Playwright 走查核心流程 → 自动停服 |

## 前置

- `pnpm install`（含 `playwright-core`）
- chromium 可执行文件：设置环境变量 `CHROMIUM_PATH`，或使用本机 Chrome / playwright 安装的 `ms-playwright` 浏览器（冒烟脚本自动探测；找不到时跳过浏览器冒烟并提示，引擎单测不受影响）

## 冒烟覆盖

首页 → 自由练习 4×4（棋盘/填数）→ 规则教学 → 技巧教学关（点亮徽章）→ 训练地图 → 导入（SD{N}: 前缀 / 少线索拒绝）→ 断局快照 → 家长报告 → 设置。
