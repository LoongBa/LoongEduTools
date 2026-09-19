# 重绘工具（RedTools 开发支撑 · 公共能力）

> 为 RedTools 小工具/小游戏开发提供**参考图重绘**能力：调用 SenseNova U1.5 Lite
> `/v1/images/edits` 接口，以本地图片（教材页 / 素材图）为参考，生成风格化原创重绘，
> 用于规避教材版权、统一视觉风格、批量生产素材背景。

## 目录结构

```
重绘工具/
├── README.md            # 本文件
├── redraw.py            # 公共脚本（核心：读取任务配置 → 调 API → 下载结果）
└── tasks/               # 任务目录：每个任务一个子目录
    └── <任务名>/         #   任务名如 pep4s_bg
        ├── config.json  #     任务配置（模型/尺寸/输入输出目录/提示词文件/页过滤）
        ├── prompts/     #     提示词（可多套 .txt，config 指定用哪套）
        ├── input/       #     参考图（教材原图/素材图）
        └── output/      #     重绘结果（自动生成，不入 git）
```

## 用法

```bash
# 列出任务
python redraw.py --list-tasks

# 重绘单页 / 多页 / 全部
python redraw.py --task pep4s_bg --page 5
python redraw.py --task pep4s_bg --pages 5,8,12
python redraw.py --task pep4s_bg --all
python redraw.py --task pep4s_bg --page 5 --force   # 覆盖已存在输出
```

前置条件：环境变量 `SENSENOVA_API_KEY`（商汤密钥）；Python 依赖 `requests`（可选 `Pillow` 用于超尺寸输入压缩）。

## 新增任务 checklist

1. `tasks/<任务名>/` 建目录：`config.json` + `prompts/*.txt` + `input/`
2. `config.json` 填模型/尺寸/提示词文件/输入输出目录（可参考 `tasks/pep4s_bg/config.json`）
3. 参考图拷入 `input/`（文件名建议 `Page_NNN.png` 或 `page_NNN.webp` 便于 `--page` 过滤）
4. `python redraw.py --task <任务名> --all` → 目检 output/

## API 要点（librarian 调研结论，2026-09-18）

- 参考图重绘走**独立接口** `POST /v1/images/edits`（不是 `/images/generations`，更不是 `/chat/completions`）
- 请求体：`images: [{image_url: "data:image/png;base64,xxx"}]`（数组，首图为编辑主目标）
  **必须带 `data:image/*;base64,` 前缀**，纯 base64 会被拒绝
- `size: "auto"` 自动适配参考图比例（重绘教材页推荐）；或显式 `WxH`（宽高须为 32 倍数，512~4096）
- `n` 仅支持 1；`watermark: false` 去官方水印（公测期免费）；`prompt_extend: true` 自动扩写
- `response_format: "url"`（24h 有效，须立即下载）或 `"b64_json"`
- 免费额度：公测期 1500 次 / 5 小时

## 任务清单

| 任务名 | 用途 | 状态 |
|--------|------|------|
| `pep4s_bg` | PEP 四年级上册教材页 → 卡通风格原创重绘（避版权背景） | ✅ 实验完成（2026-09-18）：2 页测试通过，质检中上（7~7.5/10），P0 待修：Page_005 "Flee" 徽章残留、Page_012 螺旋装订缺失 |

## 实验结论（2026-09-18，Page_005 + Page_012）

**结论：方案可行，但需提示词增强 + 后处理修复。**

| 维度 | Page_005 | Page_012 |
|------|:---:|:---:|
| 版式保持度（热区兼容） | 好 | 中（装订线圈丢失） |
| 插画原创性（避版权） | 好 | 好 |
| 文字可读性 | 好（无乱码） | 好（含中文） |
| 整体观感 | 中 | 好 |

- 尺寸比例：重绘 1728×2464 vs 原图 1767×2514，比例偏差 0.16% → `size:"auto"` 保持版式，热区归一化坐标可复用
- P0：Page_005 右上角 "Flee" 徽章残留（疑似模型水印）；Page_012 右侧螺旋装订线圈丢失
- 提示词 v2 方向：显式声明 `no watermark/logo/badge/border`、`keep spiral binding`、`keep lined paper texture`
- 备选方案（若文字保真仍不稳）：AI 重绘插画区域 + 原图文字区域合成（保留文字区，仅替换插画区）

## 图文分离方案（2026-09-18，v3 实验）

**核心结论：AI 无法可靠抑制文字生成，必须用 HTML 文字层覆盖。**

| 方案 | 文字清晰度 | 热区兼容 | 实现复杂度 | 版权风险 |
|------|:---------:|:--------:|:---------:|:--------:|
| v1: AI 重绘整页（含文字） | 差（模糊） | 好（0.16%偏差） | 低 | 中 |
| v2: AI 重绘 + HTML 覆盖 | 好（100%） | 好（同上） | 中 | 低 |
| v3: 无文字背景 + HTML 文字 | 好（100%） | 好（同上） | 中 | 低 |

**v3 实验发现**：
- prompt 要求"文字区域留白"→ AI 仍然生成文字（无法可靠抑制）
- 但"AI 重绘 + HTML 覆盖"方案可行：白色遮罩遮住 AI 文字，HTML 渲染清晰文字
- 热区坐标直接复用 book.json 的归一化坐标（left/top/right/bottom），无需重新测量

**推荐方案**：v2/v3（AI 重绘背景 + HTML 文字层），文字清晰度 100%，版权风险最低。

**图文分离质检结论（Page_012）**：
- ✅ 白色遮罩完全覆盖 AI 残留文字（无双重文字）
- ✅ HTML 文字 100% 清晰可读
- ⚠️ 遮罩白色与页面背景色有极轻微色差（可优化，不影响使用）
- ✅ 整体适合点读工具背景

**推荐架构**：
```
┌─────────────────────────────────────┐
│  热区层（透明可点击 div.hotspot）      │
├─────────────────────────────────────┤
│  文字层（HTML span 按 track 坐标定位）  │  ← 文字 100% 清晰
├─────────────────────────────────────┤
│  背景层（AI 重绘插画 + 遮罩）          │  ← 插画原创化
└─────────────────────────────────────┘
```

**产物位置**：
| 文件 | 说明 |
|------|------|
| `output_v2/Page_012_redrawn.png` | v2 重绘图（含 AI 文字） |
| `output_v3_notext/Page_012_overlay_v2.png` | 图文分离叠加版（遮罩 + HTML 文字）✅ 质检通过 |
| `prototype.html` | HTML 原型（可本地预览） |
