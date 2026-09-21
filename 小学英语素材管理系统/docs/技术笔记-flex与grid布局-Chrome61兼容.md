# 技术笔记 · display:flex 与 display:grid 布局（Chrome 61 兼容视角）

> 场景：RedTools 系列小工具前端（离线 zip，基线 Chrome 61 / 移动端 WebView）。
> 素材管理系统仅引用本笔记（系统本身是 Python CLI，无前端布局需求）。

## 1. display: flex（一维布局）

- 主轴（main axis）由 `flex-direction` 决定：`row`（默认，水平）/ `column`（垂直）
- `justify-content`：主轴对齐（`flex-start/center/flex-end/space-between/space-around`）
- `align-items`：交叉轴对齐（`stretch/flex-start/center/flex-end`）
- `flex: grow shrink basis` 控制伸缩；`flex-wrap: wrap` 换行

### Chrome 61 兼容约束（基线）

| 特性 | Chrome 61 | 对策 |
|------|-----------|------|
| `gap`（flex 容器间距） | ❌ 不支持 | 用 margin 替代 |
| `aspect-ratio` | ❌ | 用 padding-top 百分比或固定尺寸 |
| `min-width: auto` 溢出 | 有坑 | Flex 子项设 `min-width: 0` |
| `place-content` 简写 | ❌ | 分开写 `justify-content` + `align-items` |
| 安全区 | 部分 | `env(safe-area-inset-*)` + var() 组合 |

## 2. display: grid（二维布局）

- `grid-template-columns/rows` 定义轨道；`repeat(N, 1fr)` / `minmax(min, max)`
- `grid-gap`（Chrome 61 用 `grid-gap`，**不是** `gap`）控制间距
- 子项 `grid-column/row: start / end` 或 `span N` 占位
- 隐式轨道：超出模板的行列自动创建

### Chrome 61 兼容约束

| 特性 | Chrome 61 | 对策 |
|------|-----------|------|
| `gap`/`row-gap`/`column-gap` 简写 | 部分支持（grid-gap 可用） | 统一用 `grid-gap` |
| `dvh/lvh/svh` 视口单位 | ❌ | `vh` + JS 同步 `--app-height` |
| 子网格 `subgrid` | ❌ | 不用 |
| `place-items/place-content` | ❌ | 分开写 |
| `:has()`、`@container` | ❌ | 不用 |

## 3. 通用（Chrome 61 + 桌面投影双端）

- 弹性滚动容器：`-webkit-overflow-scrolling: touch`
- `backdrop-filter` ❌ → 用半透明背景色
- `position: sticky` 部分支持 → 谨慎；必要时 fallback `fixed`
- `writing-mode` / 逻辑属性 ❌ → 用物理属性（left/right/top/bottom）
- 字体：`font-family` 中文字体栈（msyh/simhei），`-webkit-font-smoothing`

> 完整规则见 `RedTools/.skill/minitool-zip-builder/references/css-compatibility.md`（权威）。
> 本笔记为素材管理系统 docs 侧的速记引用，不替代原权威文档。