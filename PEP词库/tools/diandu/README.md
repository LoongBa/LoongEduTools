# Diandu — 人教点读教材素材下载工具

从**人教点读**（微信小程序"人教教材学习"）下载教材**音频 + 页面图片 + 字幕（SRT）**，
输出到教材素材库，供 CapCutTool 等上游工具使用。

## 脚本

| 脚本 | 功能 |
|------|------|
| `get_book_json.js` | **浏览器控制台脚本**：批量获取 book.json（人教点读页面 DevTools 执行） |
| `diandu_audio.py` | 主工具：parse / save / 下载素材 / expand / merge / tag |
| `diandu_common.py` | 公共逻辑：文件名清洗、track 解析、字幕生成、目录解析、mp3 合并/标签 |
| `TECH_NOTES.md` | 技术原理备忘：接口链路、加密格式、命名规则、常见问题 |

## 数据获取方式（两步）

### 第一步：获取 book.json（浏览器，唯一手工步骤）

在人教点读小程序页面打开浏览器 DevTools 控制台，执行 `get_book_json.js`：

- 前置：页面已加载 `namibox_jssdk`（`window.namibox_jssdk` 可用）
- 产物：为每个 `book_id` 下载 `{book_id}_book.json`
- 内置全部英语（PEP）教材 12 册 book_id（一年级~六年级 × 上下册）
- 如需单本：将 `bookIds` 数组改为只留目标 id

> **book.json 存档**：仓库内已打包 `book_data.zip`（11 本，约 1.3MB），
> 使用前解压到 `data/` 目录：
> ```powershell
> Expand-Archive -Path PEP词库/data/diandu/book_data.zip -DestinationPath PEP词库/data/diandu -Force
> ```
> `data/` 不入库（已 gitignore），更新数据时重新打包 zip 替换。

> **数据状态**：`book_data.zip` 现有 11 本（一年级~六年级上下册，共 12 本），2026-09 全量覆盖更新。
> 缺 **六年级下册**（`1212001602145`）—— 新版教材尚未出版，**推测 27 年寒假甚至下学期开学前发布，此前暂缓**。

### 第二步：下载素材（音频 + 图片 + 字幕）

```powershell
python diandu_audio.py 下载素材 "data/1212001401255_英语（PEP）_四年级_上册.json" --out <素材目录>
```

默认同时下载音频与图片；可用 `--no-audio` 关闭音频、`--no-images` 关闭图片
（`--audio/--images` 默认开启）。

## 输出目录结构（对齐教材素材库）

```
{out}/                               # 如: _教材素材/人教版（PEP）（主编：吴欣）/四年级/上册
├── _音频素材/
│   ├── 单句音频/   P{页:03d}_{序号:02d}_{朗读文字}.mp3
│   ├── 页音频/     P{页:03d}.mp3
│   ├── 单元音频/   Unit{NN}_{单元标题}.mp3
│   └── *.srt       # 总字幕 + 分单元字幕（.srt 英 / _cn.srt 中 / _en_cn.txt 中英对照）
└── _图片素材/
    └── {书名}_{页码:02d}.png          # 每页课本截图
```

## 子命令

| 命令 | 作用 |
|------|------|
| `parse <book.json>` | 解析 book.json，打印/校验轨道（track）信息 |
| `save <book.json> [--data data]` | 规范化保存到 `data/{bookid}_{书名}.json` |
| `下载素材 <book.json> [--out 目录] [--audio/--no-audio] [--images/--no-images] [--delay 秒] [--force] [--no-sentence]` | 下载单本素材（音频+图片+字幕） |
| `expand [--data data] [--root 下载根] [--audio/--no-audio] [--images/--no-images] [--delay 秒] [--force] [--no-sentence]` | 批量：遍历 data/*.json 逐个下载 |
| `merge <mp3目录> [--name 书名] [--out 上级目录] [--force]` | 合并 mp3（ffmpeg concat） |
| `tag <mp3目录> [--album 书名]` | 写入 ID3 标签（专辑/版权信息） |

> `--no-sentence`：字幕跳过 `sentence_evaluating` 逐句展开，只保留整段 track 条目
> （**SRT 条目 = book.json track 一一对应**，供 CapCutTool 点读框对齐/人工拆分字幕）。

## 典型流程

```powershell
# 1. （浏览器）执行 get_book_json.js → 得到各 {book_id}_book.json
# 2. 保存到 data/
python diandu_audio.py save "1212001401255_book.json"

# 3. 批量下载素材到素材库（音频 + 图片 + 字幕）
python diandu_audio.py expand --root "F:/_工作中视频素材库/_课本和教材_/_教材素材" --delay 0.3

#    或单本下载到指定目录
python diandu_audio.py 下载素材 "data/1212001401255_英语（PEP）_四年级_上册.json" --out "F:/.../四年级/上册" --delay 0.3

# 4.（可选）只补图片 / 只补音频
python diandu_audio.py 下载素材 "data/xxx.json" --out "F:/.../四年级/上册" --no-audio   # 只下图片
python diandu_audio.py 下载素材 "data/xxx.json" --out "F:/.../四年级/上册" --no-images # 只下音频
```

## 依赖

```powershell
pip install tqdm mutagen
# ffmpeg（用于 merge 合并，需在 PATH 中）
```

## 注意

- 下载素材仅供个人学习使用，版权归人教社/权利人所有。
- 技术原理、接口链路与常见问题见 [TECH_NOTES.md](TECH_NOTES.md)。
