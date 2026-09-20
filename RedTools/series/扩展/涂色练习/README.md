# 涂色练习（扩展系列）

> 状态：**✅ v1.0 已构建（2026-09-19，审计 PASS + smoke 14/14 + 视觉质检通过）**。
> 定位：教育工具产品矩阵规划 §6 扩展品类 P2「涂色练习」（线稿图点击填色，美育）；扩展系列第三款。
> 需求与设计：`docs/工具文档/扩展/涂色练习-设计文档.md`；用户操作指南：`docs/工具文档/扩展/涂色练习-使用文档.md`。

## 需求摘要（草案）

- **儿童填色美育**：程序化 SVG 线稿（几何构图主题）+ 调色板点选填色 + 作品保存
- 目标用户：preK–K1-3（L1–L2），3-8 岁；自由创作导向，无计时压力
- 形态：离线 zip，纯前端静态工具（`datasource="static"`），**程序化 SVG 线稿零素材**，目标 ≤ 2 MiB
- 核心功能：
  - F1 选图：6 个线稿主题（太阳/苹果/花/房子/小鱼/树，几何构图分区线稿，深色描边 + 白色填充区）
  - F2 填色：调色板 10 色 + 橡皮擦；点选颜色 → 点选区域填色；区域可反复改色；已填色实时呈现
  - F3 完成判定：全部区域都已填色 → 完成（自由色无对错）+ 打卡 + 3★ + 作品自动保存
  - F4 作品集：localStorage 保存已涂作品（填色状态序列化），可回看/重新涂
  - F5 打卡 + 成绩 + 家长面板（复用既定模式，key `redtools.color.v1`）
- 线稿方案：每主题 = {name, w, h, parts: [{id, label, svg}]}；svg 为分区 shape（circle/rect/polygon/path），
  渲染为 fill=当前色 + stroke 深色线稿边框；**所有主题程序化几何构图**（借鉴找不同 scenes.js 的图形小工具）
- 合规：Chrome 61（ES2017 / 无 gap/aspect-ratio/clamp/:has）、CSP 无内联、点击热区 ≥48px

## 构建

```bash
python build_all.py --tool 涂色练习
```

产物：`publish/扩展/涂色练习.zip` + `涂色练习-图标(1024).png`

## 进度

- [x] 立项 README（需求草案 v1）（2026-09-19）
- [x] tools.py 登记 ToolConfig（series=扩展，datasource="static"）
- [x] src/：index.html + assets/（main.js 视图 / coloring.js 线稿库与填色引擎 / style.css / icon_base.png）
- [x] 构建（0.03 MiB）→ 审计 PASS（6 files 0 warning）→ 合规自查 → smoke-color 14/14 + 视觉质检（太阳 9 区线稿/填色/完成）
- [x] docs/工具文档/扩展/涂色练习-{设计,使用}文档.md
- [x] 更新进度清单（README + 系列 README + 产品矩阵 §6）

## 交付记录

- 2026-09-19 v1.0：6 主题程序化 SVG 线稿（太阳/苹果/小花/房子/小鱼/大树）+ 10 色调色板 + 🧽 橡皮 +
  点区填色/完成判定/自动保存作品集 + 完成打卡 + 家长面板；
  修复 renderArt 自闭合标签 + 橡皮标识

## 注意事项

- 零图片素材：全部线稿程序化生成（分区 shape + 描边）
- 完成判定：所有 part 已填色（非白色）即完成；颜色无对错（美育自由）
- 作品保存：每图 part 颜色映射 JSON 存 localStorage（压缩存）
- Chrome 61 / Android 8.1 WebView 真机未实测前如实标记"未实测"