# PEP词库 — 人教版（PEP）小学英语公共词库素材

> 定位：**所有英语类小工具的公共词库中心**。PEP 人教版小学英语教材（主编：吴欣）的
> 词汇表数据、点读数据，以及构建/下载这些数据的工具代码，统一收纳于此。
> 仓库根级独立目录（`/PEP词库`），供 RedTools 工具集及后续新工具复用。
> 更新：2026-09-21

## 英语类小工具消费方（当前 3 款）

| 工具 | 位置 | 使用本词库的哪部分 |
|------|------|--------------------|
| 英语点读 | `RedTools/series/学科/英语点读/` | `data/diandu/*.json`（点读数据：页面+热区+音频直链） |
| 打字背单词 | `RedTools/series/学科/打字背单词/` | `tools/vocab` 解析管线 + `data/vocab/pep_vocab.json`（11 册 976 词） |
| 单词闪卡 | `RedTools/series/学科/单词闪卡/` | 同上（共 978 词认读，词库同管线输出） |

依赖关系：RedTools 构建框架（`RedTools/build_framework.py`）在构建上述工具时
自动委托本词库的 `tools/vocab/parse_pep_vocab.py` 解析素材并注入 `data.js`，
同时把规范化词库 JSON 同步回 `data/vocab/pep_vocab.json`。

## 目录结构

```
PEP词库/
├── README.md                  # 本文件
├── data/                      # ★ 词库数据（公共素材）
│   ├── vocab/                 #   PEP 11 册单元词汇表（规范化 JSON 产物）
│   │   └── pep_vocab.json     #     schema v1：{schema, book, word_count, books}，11 册 976 词
│   └── diandu/                #   人教点读 book.json（英语点读数据源）
│       ├── *.json             #     11 册原始点读数据（页面+热区+音频/图片直链）
│       ├── book_data.zip      #     全量归档（分发用）
│       └── .gitignore         #     原始 json 不入库（大文件，zip 分发）
└── tools/                     # ★ 工具代码
    ├── vocab/                 #   PEP 词汇表解析工具
    │   └── parse_pep_vocab.py #     独立 CLI + 库函数（build_framework 委托复用）
    └── diandu/                #   人教点读下载工具（自 LoongMediaTools 复制，原仓留档）
        ├── diandu_audio.py    #     主下载工具（parse/save/下载素材/expand/merge/tag）
        ├── diandu_common.py   #     公共逻辑（清洗/轨道/字幕/目录/合并）
        ├── get_book_json.js   #     浏览器控制台脚本：批量获取 book.json
        ├── download_materials.ps1  # PowerShell 批量下载脚本
        ├── rename_images.py   #     图片重命名辅助
        ├── README.md          #     Diandu 工具使用说明（原仓同步）
        └── TECH_NOTES.md      #     技术原理备忘（原仓同步）
```

## 数据来源与重建

### 词汇表（data/vocab/pep_vocab.json）

- **源素材**：`F:\_教材素材\人教版（PEP）（主编：吴欣）\<年级>\<册次>\_音频素材\`
  - 9 册：`*Words_in_each_unit_en_cn.txt`（独立词汇表，`英文行 + 中文释义行 + 空行`）
  - 三下/五上/五下：整册 `<册名>_en_cn.txt` 的 `Words in each unit` 区块
- **重建**（独立运行，支持按册/按单元过滤）：
  ```bash
  # 全量 11 册
  python PEP词库/tools/vocab/parse_pep_vocab.py \
      --vocab-dir "F:\_教材素材\人教版（PEP）（主编：吴欣）" \
      --out-json "PEP词库/data/vocab/pep_vocab.json" \
      --out-js "<dist目录>"        # 可选：同时生成 data.js

  # 单册（如 四年级 上册）
  python PEP词库/tools/vocab/parse_pep_vocab.py \
      --vocab-dir "F:\_教材素材\人教版（PEP）（主编：吴欣）" \
      --grade 四年级 --term 上册 --out-json "<输出目录>/pep_四年级_上册.json"

  # 单单元（全部册的第 N 单元；可与 --grade/--term 组合）
  python PEP词库/tools/vocab/parse_pep_vocab.py \
      --vocab-dir "F:\_教材素材\人教版（PEP）（主编：吴欣）" \
      --grade 五年级 --term 上册 --unit 2 --out-json "<输出目录>/pep_五年级_上册_Unit2.json"
  ```
  > 过滤参数：`--grade <年级>`（如 四年级）、`--term <上册|下册>`、`--unit <单元号>`
  > （如 2）。过滤结果为空时退出码 2 并提示，避免误写空文件。
- **自动同步**：构建打字背单词/单词闪卡时 `build_framework.py` 自动回写该 JSON。

### 点读数据（data/diandu/*.json）

- **源**：人教点读小程序（`get_book_json.js` 浏览器取）→ 解压 `book_data.zip` 到
  `data/diandu/` 即得 11 册（六下未出版，推测 27 年寒假甚至下学期开学前发布，此前暂缓）。
- **下载素材**（音频/图片/字幕 → 教材素材库）：
  ```bash
  python PEP词库/tools/diandu/diandu_audio.py 下载素材 \
      "PEP词库/data/diandu/1212001401255_英语（PEP）_四年级_上册.json" --out <素材目录>
  ```
- 详细说明见 `tools/diandu/README.md`。

## 消费方接入指南（新工具）

1. **词汇表类工具**（打字/闪卡/拼写等）：
   - `tools.py` 登记 `ToolConfig(datasource="vocab", vocab_dir=Path(r"F:\_教材素材\..."))`
   - 构建期注入 `window.APP_DATA.books`（`[{grade,term,book,units:[{unit,words:[{word,cn}]}]}]`）
   - 或离线直接用 `data/vocab/pep_vocab.json`（纯数据，schema v1）
2. **点读类工具**（课文/点读/听读）：
   - `tools.py` 登记 `book=PEP词库/data/diandu/<书号>.json`
   - `build_framework` 提取单元 pages/tracks（热区坐标 0~1 归一化）→ `data.js`

## 迁移记录

| 日期 | 说明 |
|------|------|
| 2026-09-21 | 立项：`Downloader/Diandu/data`（11 册点读 json）物理移入 `data/diandu/`；`build_framework.py` 的 PEP 词汇表解析管线（VOCAB_BOOKS/清理/解析/加载/写 data.js）提取为独立工具 `tools/vocab/parse_pep_vocab.py`（库方式委托，输出 976 词不变）；`tools/vocab/pep_vocab.json` 规范化词库首次生成；Diandu 下载工具自 `LoongMediaTools/Downloader/Diandu/` 复制入 `tools/diandu/`（原仓留档）；RedTools 内 19 个脚本 + 5 处文档的旧路径引用全部更新；删除空 `Downloader/` 目录 |
| 2026-09-21 | `parse_pep_vocab.py` 新增分册/分单元过滤：`--grade/--term/--unit`，支持单册或跨册单单元导出（过滤为空退出码 2） |