# 热区校正工具（hotzone_editor）

> PC 端人工校正点读热区的纯前端小工具。重绘图与原始图元素位置有偏差时，
> 人工拖动/缩放热区对齐重绘图，导出校正 JSON 供构建管线使用。

## 使用方式

1. **启动**：浏览器直接打开 `hotzone_editor/index.html`（file:// 即可，无需服务器）
2. **加载数据**：
   - ① 选 book.json：`PEP词库/data/diandu/<书号>_英语（PEP）_*.json`
   - ② 选重绘图目录：`F:\_教材素材\...\<年级>\<册>\_重绘图片素材\`（优先使用）
   - ③ 选原图目录：`_图片素材\`（回退，②③至少一个）
   - ④ 选音频目录：`_音频素材\单句音频\`（可选，缺则只显示不发声）
3. **选单元** → 进入校正
4. **校正热区**：
   - 右侧句子列表点击 → 选中对应热区 + 播放音频
   - 拖动热区主体 → 移动位置
   - 拖动 8 个白色手柄 → 缩放
   - 点热区本身 → 选中 + 播放
   - 坐标面板支持数字微调 / 还原（恢复 book.json 原值）/ 删除
5. **保存**：
   - 「💾 保存」→ localStorage 备份（换单元/刷新不丢）
   - 「导出校正」→ 下载 `热区校正_<单元名>.json`（人工另存，建议与素材一起归档）

## 快捷键

- `←` / `→`：上一页 / 下一页

## 导出格式

```json
{
  "tool": "hotzone-corrector",
  "book": "1212001401255_英语（PEP）_四年级_上册.json",
  "bookname": "英语（PEP） 四年级 上册",
  "unit_index": 0,
  "unit_title": "Unit 1 Helping at home",
  "exported_at": "2026-09-19T03:00:00.000Z",
  "pages": {
    "2": { "1": { "left": 0.0773, "top": 0.0479, "right": 0.8536, "bottom": 0.2396 } }
  }
}
```

- `pages.<page_no>.<track_index>` 为归一化坐标（0-1），与 build_framework 的
  `left/top/right/bottom` 字段一致
- 构建管线集成时：读入该文件 → 按 page_no/track_index 覆盖 book.json 热区坐标

## 文件

```
hotzone_editor/
├── index.html        # 首页（加载数据）+ 校正页骨架
├── assets/
│   ├── style.css     # 样式（参照英语点读小程序）
│   └── main.js       # 逻辑：数据加载 / 点读 / 热区拖拽缩放 / 保存导出
test_hotzone_editor.py  # Playwright 冒烟测试（12 项断言，2026-09-19 全过）
```

## 测试

```bash
python test_hotzone_editor.py   # 需 playwright + chromium
```

覆盖：book.json 加载 → 目录选择 → 进入校正 → 热区渲染 → 点列表选中 →
拖动移动 → 手柄缩放 → localStorage 保存 → 导出下载 → 翻页 → 无 JS 错误。

## 后续接入构建管线

`build_framework.py` 的 `convert_images()` 已支持 `redrawn_img_dir` 优先；
下一步让 `build_unit_data()` 接收可选校正 JSON 路径，按 `page_no/track_index`
覆盖热区坐标即可（当前尚未实现）。
