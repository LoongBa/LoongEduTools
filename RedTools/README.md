# RedTools — 小红书小工具集（多系列）

> 本目录为**小红书小工具开发集**：按「系列 → 工具」组织，数据驱动 + 批量自动化构建。
> 首个系列「学科」已含「英语点读」（v1.1 已交付）；后续持续扩展（数学口算等）。

## 目录导航

| 资源 | 位置 | 说明 |
|------|------|------|
| 本 README | `RedTools/README.md` | 总览：目录结构、构建命令、**全系列进度清单**、开发经验 |
| 目录规则 | `RedTools/AGENTS.md` | **本目录规则**：结构约定、构建/发布流程、git 忽略、进度维护 |
| **产品矩阵规划** | `RedTools/docs/产品矩阵规划.md` | **规划唯一权威**：62 款产品/7 大类/P0-P3/三阶段路线（本地为主） |
| 通用需求：打卡/分享/记录 | `RedTools/docs/通用需求-打卡分享记录.md` | **跨工具通用能力**：打卡记录/成绩记录/分享卡片+文案（含微信/抖音 H5 扩展预留） |
| 系列（可扩展） | `RedTools/series/<系列>/` | 每系列独立 README + 设计文档（当前：学科/） |
| 工具源码 | `RedTools/series/学科/英语点读/src/` | index.html + assets/（main.js/style.css/icon_base.png） |
| 构建框架 | `RedTools/build_framework.py` | 公共构建逻辑（图片/音频 base64/图标角标/zip） |
| 工具注册表 | `RedTools/tools.py` | 各系列工具配置（book/素材/版本/默认单元） |
| 批量构建 | `RedTools/build_all.py` | 遍历工具批量产出 |
| **小工具打包规范** | `RedTools/.skill/minitool-zip-builder/` | 小工具必读：zip 结构、离线约束、端能力限制（SKILL.md + references/） |
| 构建产物 | `RedTools/dist/<系列>/` | 中间产物（**不入 git**） |
| 发布目录 | `RedTools/publish/<系列>/` | **所有系列公共发布目录**：zip + 1024 图标 + 发布文案 + 解压测试版（不入 git，发布文案.txt 除外） |
| 教师客户端立项 | `../docs/龙爸乐学-教师客户端需求分析与设计方案.md` | 桌面壳（Tauri/.NET + 在线验证 + 升级）单独立项 |
| 素材清单（权威） | `F:\_教材素材\人教版（PEP）（主编：吴欣）\素材清单.md` | 每册素材状态、封面、PDF、制作情况 |
| 教材数据 book.json | `Downloader/Diandu/data/*.json`（另有 `book_data.zip` 存档） | **点读核心**：页面 + 热区坐标 + 音频/图片直链 |

---

## 0. 全系列开发与交付进度清单

> 维护规则：每完成一次构建/发布，更新此表。系列内部详情见 `series/<系列>/README.md`。
> 产品排期依据：`docs/产品矩阵规划.md`（三阶段路线，P0 优先）。

| 系列 | 工具 | 版本 | 构建日期 | 发布到小红书 | 产物（publish/<系列>/） | 备注 |
|------|------|------|----------|:---:|------|------|
| 学科 | 英语点读 | v1.1 | 2026-09-17 | ⏳ 待发布 | `新英语四上点读{1-6}单元.zip` + `复习` + `附录1`（8 个） | 四上 Unit1-6+复习+附录1；双模式/变速/自动连播（P0 教材单元点读） |
| 学科 | 数学口算 | v1.0 | 2026-09-17 | — | `数学口算.zip`（1 个） | 1-6 年级 25+ 知识点；point 数字键盘/即时反馈/打卡/错题本（P0 口算每日打卡）；P0+P1 完成（2026-09-18）：g4_big 修复 + validate 反推 + 计时挑战/成就/家长面板，smoke 全部通过 |

> 注：SHA-256 以 `publish/学科/` 内各 zip 实测为准；每次重新构建后更新。审计警告
> （文本合计 >5MiB）为音频 base64 预期行为，实际包体 3.7-4.4 MiB ≪ 10 MiB 硬上限。

---

## 1. 素材库总览

### 1.1 根目录

```
F:\_教材素材\人教版（PEP）（主编：吴欣）\
├── 一年级/  二年级/  三年级/  四年级/  五年级/  六年级/   # 6 个年级
│   ├── 上册/  下册/                                        # ≤11 册（六下未出版）
│   │   ├── _图片素材/  Page_NNN.png                        # 每页课本图（页码对齐）
│   │   ├── _音频素材/
│   │   │   ├── 单句音频/  P{页}_{序号}_{文字}.mp3            # 逐句音频（H5 点读优先用）
│   │   │   ├── 页音频/    P{页}.mp3                         # 每页整页合并音频
│   │   │   ├── 单元音频/  Unit{NN}_{单元标题}.mp3            # 每单元合并音频
│   │   │   └── *.srt / *_cn.srt / *_en_cn.txt              # 字幕英/中/双语对照
│   │   ├── Cover.png                                       # 册封面
│   │   └── UnitNN_*/                                      # 每单元素材（封面/音视频）
├── 素材清单.md                                              # 权威清单
└── 各册 *.pdf                                              # 教材原版 PDF（封面提取源）
```

### 1.2 已就绪册次（11 册，六下 2027 寒假待出版）

| 年级 | 上册 | 下册 |
|------|------|------|
| 一年级 | ✅ | ✅ |
| 二年级 | ✅ | ✅ |
| 三年级 | ✅ | ✅ |
| 四年级 | ✅ | ✅ |
| 五年级 | ✅ | ✅ |
| 六年级 | ✅ | ⏳ 未出版 |

### 1.3 每册素材规模（示例：四年级上册）

| 素材 | 数量 | 命名示例 |
|------|------|----------|
| 页面图片 | 86 | `_图片素材/Page_002.png` |
| 单句音频 | 1160 | `P002_01_Unit_1_Helping_at_home.mp3` |
| 页音频 | 86 | `P002.mp3` |
| 单元音频 | 11 | `Unit01_Unit_1_Helping_at_home.mp3` |
| 字幕（英/中/双语） | 24 | `01_Unit_1_Helping_at_home.srt / _cn.srt / _en_cn.txt` |

---

## 2. 点读核心：book.json 数据

H5 点读的**基础数据**是每个单元的 `book.json`（人教点读原始数据，已归档）。

### 2.1 文件位置

```
Downloader/Diandu/data/
├── 1212001101247_英语（PEP）_一年级_上册.json
├── 1212001102247_英语（PEP）_一年级_下册.json
├── …（共 11 本，六下无）
└── book_data.zip   # 全量压缩存档（解压覆盖 data/ 即可刷新）
```

> `data/` 目录不入 git（已 gitignore），用 `book_data.zip` 分发。

### 2.2 顶层结构

```jsonc
{
  "bookinfo": { "bookid": "newpep_4s", "bookid_3rd": "1212001401255",
                "bookname": "英语（PEP） 四年级 上册", "title": "封面图URL" },
  "bookpage": [ /* 每页一条，核心 */ ],
  "bookaudio_v3": [ /* 单元目录（标题、顺序） */ ],
  "resource":   { "track": {...}, "show": {...} }   // 整包 zip（加密，勿用）
}
```

### 2.3 bookpage[]（页面 + 热区 + track）— 点读核心

```jsonc
{
  "page_no": 2,                       // 页码（与 Page_002.png / P002.mp3 对齐）
  "page_name": "page_002.xxx.png",    // 平台内部名
  "page_url_source": "https://pdpd.mypep.cn/digitbook/newpep_4s/show/xxx/page_002...png",  // 图片直链
  "track_info": [ /* 本页点读条目 */ ]
}
```

### 2.4 track_info[]（热区 + 音频）— 点读热区

```jsonc
{
  "track_text": "Unit 1 Helping at home",   // 英文文本（SRT 条目 = 该字段一一对应）
  "track_genre": "第一单元 在家帮忙",          // 中文/栏目
  "track_duration": 4.41,                    // 音频秒
  "track_left": 0.0773,  "track_top": 0.0479,   // 热区左上（归一化 0~1）
  "track_right": 0.8536, "track_bottom": 0.2396, // 热区右下（归一化 0~1）
  "track_url_source": "https://pdpd.mypep.cn/digitbook/newpep_4s/track/xxx.mp3",  // 音频直链
  "track_index": 1, "track_id": 1553610
}
```

---

## 3. H5 点读接入指引

### 3.1 坐标系（重要）

- `track_left/top/right/bottom` 是 **0~1 归一化**坐标，**原点在页面图左上角、y 轴向下**
- 转像素：`px = track_left * 页面图宽`，`py = track_top * 页面图高`
- 转 CSS `absolute` 百分比：直接 `left: 7.73%; top: 4.79%; width: 77.63%; height: 19.17%`
  （`width = (right-left)*100%`，`height = (bottom-top)*100%`）

### 3.2 页面显示

- **优先本地**：`_图片素材/Page_{page_no}.png`（离线可用，点读小程序常用）
- 或在线 `page_url_source` 直链
- 页码对齐：`Page_002.png` ⇔ `P002.mp3` ⇔ bookpage 中 `page_no: 2`

### 3.3 音频播放

| 场景 | 用 | 示例 |
|------|-----|------|
| 逐句点读（推荐） | 本地单句音频 | `_音频素材/单句音频/P002_01_Unit_1_Helping_at_home.mp3` |
| 逐句点读（在线/轻量） | `track_url_source` 直链 | https://pdpd.mypep.cn/digitbook/...(mp3) |
| 整页朗读 | 页音频 | `P002.mp3` |
| 整单元 | 单元音频 | `Unit01_Unit_1_Helping_at_home.mp3` |

> 本地单句音频文件名 = `P{页:03d}_{track_index:02d}_{clean_name(track_text)}.mp3`
> （下载侧由 `Downloader/Diandu/diandu_audio.py` 生成，与 track 顺序一致；
> 直接用 `book_json[].bookpage[].track_info[]` 按页顺序 + `track_index` 也能无损重建对应关系）

### 3.4 字幕

- 英文：`01_Unit_1_Helping_at_home.srt`
- 中文：`01_Unit_1_Helping_at_home_cn.srt`
- 双语：`_en_cn.txt`
- SRT 条目与 `track_text` 一一对应（点读文本可直接用 `track_text` / `track_genre`）

### 3.5 单元目录

按 `bookpage[0..]` 中的 `track_genre`（"第一单元 在家帮忙"）或素材库
`unit_captions.json`（CapCutTool 模板侧，含 num/title/subtitle）组织单元结构。

---

## 4. 集成建议（供并行开发参考）

1. **数据源两个选一**：
   - **离线包**：单句音频 + 页面图入 zip（体积大，但容器完全离线可用）
   - **在线流**：直链 `track_url_source` + `page_url_source`（light，但需网络）
2. **热区坐标单位**：统一按 0~1 归一化存储，渲染层再乘容器宽度/高度
3. **每页可点条目**：`track_info` 数量不定（封面页 2 条、页面通常 1~5 条；部分特殊页为 0）
4. **点读高亮**：仓库的 CapCut 点读框实现（`CapCutTool/attach_tap_frames.py`）用的是同一套
   热区坐标，可参考其"区域放大 + 边框"交互
5. **回跳点音频时长**：`track_duration` 可直接用于 `new Audio()` 时长展示

---

## 5. 约束与版权

- **小工具场景**（离线 zip）必读 `RedTools/.skill/minitool-zip-builder/SKILL.md`：
  所有资源需打入 zip、不联网、按端能力裁剪
- 素材版权归人教社/权利人所有，仅供个人学习使用
- 六下（1212001602145）未出版：无数据无素材，**勿重复下载**

---

## 6. 开发经验沉淀（minitool-zip-builder 实战）

> 2026-09 完成「新英语四上点读1单元」首个 H5 点读小工具全流程。以下经验
> 供后续所有小工具复用，避免重复踩坑。

### 6.1 平台约束与音频方案（关键）

| 约束 | 事实 | 对策 |
|------|------|------|
| zip 上传白名单 | 仅允许 `jpg css gif svg png js jpeg json html woff2 webp woff`，**不含任何音频格式** | 音频不能以 mp3/wav 入包 |
| 容器 CSP | `<audio>/<video>` 禁止 `data:` / `blob:` 媒体源 | `new Audio(dataUri)` 会被拦截，不能走 `<audio>` 元素 |
| 结论 | **音频打包只有一条合规路** | ffmpeg 压缩 → **base64 纯 payload 写入 `.js`**（`window.AUDIO_DATA[key]="base64"`）→ 运行时 **Web Audio `decodeAudioData` 内存解码播放** |

- 播放实现：`AudioContext.decodeAudioData(ArrayBuffer)` → `createBufferSource` → `start(0)`，
  全程不经过 `<audio>` 元素 / data: URI / 网络请求，完全符合 CSP 与白名单。
- 预加载：渲染页面时动态注入本页全部音频 js（`<script src="./audio/<key>.js">`），
  点读零延迟；翻页自动补载新页音频。
- 体积真相：base64 膨胀约 33%，但 **zip 对 base64 文本压缩率高（实测 42%）**，
  最终包体与直接塞 mp3 几乎持平 —— base64 方案体积代价≈0。

### 6.2 构建流程（build_framework.py / build_all.py 数据驱动）

```
python build_all.py --tool 英语点读 --units 0   # 单工具；不带 --tool 则批量全部
book.json ──► 提取单元 pages/tracks（热区坐标 0~1 归一化）
           ├─► 图片: PIL 转 WebP（1200w, q78）
           ├─► 音频: ffmpeg 48k mono → base64 → audio/<key>.js
           ├─► 图标: 母版 icon_base.png + 自动叠加角标（如「四上 Unit01」）
           │         → 128px 入包（页面用）+ 1024px 到 publish（上传用）
           ├─► data.js: window.APP_DATA = {meta, units:[{pages:[{tracks}]}]}
           └─► zip（index.html 在根目录，压缩目录内容而非目录本身）
                └─► 复制到 publish/<系列>/（公共发布目录，系列内平铺）
```

- 工具配置集中在 `tools.py`（ToolConfig：series/tool/version/book/素材目录/app_name）。
- 扩展性：新增工具 = 建 `series/<系列>/<工具>/src/` + `tools.py` 登记 + （如需）扩展框架；
  换册/换单元 `--units` 自动按 `bookaudio_v3` 推断页码范围，渲染逻辑零改动。
- 版本号：`ToolConfig.version` 注入 data.js meta，顶栏小字显示，便于调测。

### 6.3 前端合规要点（Chrome 61 基线）

- **JS**：经典脚本（无 `type="module"`/import/export）、不超 ES2017（无 `?.` `??` 对象展开
  `replaceAll`）、事件全部 `addEventListener`、无 eval/内联事件。
- **CSS**：无 flex `gap` / `aspect-ratio` / `clamp()` / 逻辑属性 / `:has` / `@container` / `dvh`；
  Flex 子项设 `min-width:0`；安全区用 `var(--safe-area-inset-*, env(...))` 组合。
- **CSP 自检**：无 `fetch`/XHR/Worker/定位/剪贴板/`window.open`、无外部 `http(s)://` 引用、
  无 `<base>`/`<iframe>`/自建 CSP meta。

### 6.4 功能设计模式（点读类工具）

- **双模式**：点读（热区虚线框标识可点区域 + 点击播单句）/ 顺序（整页自动连播）。
- **顺序播放**：上一条/下一条/重听本页/重播当前句/暂停继续/进度「第 x/y 句」。
- **重复 ×2**：每条播两遍再进下一条；**变速四档**：0.75 / 1 / 1.25 / 1.5（`playbackRate`，
  伴随音高变化为 WebAudio 原生行为）。
- **自动连播**：本页播完自动翻下一页继续，末页提示；可开关，localStorage 记忆
  （模式/重复/变速/自动连播全持久化）。
- **导航**：封面 / ‹ / 页码 / › / 末页 + **触屏滑动翻页**（左右滑，阈值 48px、水平占优）。
- **内部坑位**：`decodeAudioData` 结果按 key 缓存避免重复解码；`source.stop()` 会触发
  `onended`，回调须校验 `currentSource === src` 防止误推进；顺序播放自动切句须
  `clearAllHotspots()` 清旧高亮。

### 6.5 测试与交付门禁

- 审计：`python .skill/minitool-zip-builder/scripts/audit_artifact.py <dist|zip>`（体积/文本门禁）。
- 合规自查：grep 扫描禁止项（内联脚本/onclick/https 引用/禁 API）+ zip 内扩展名白名单核对。
- 冒烟测试：Playwright（playwright-core + 本地 chromium）file:// 与 http:// 双协议，
  验证渲染/预加载/解码/高亮/翻页/滑动/顺序控制，见
  `C:\Users\coffe\AppData\Local\Temp\opencode\pw-smoke\`（临时，重做时按需重建）。
- 发布目录 `publish/`：zip（附 SHA-256）+ 1024 图标（小红书要求）+ 发布文案 txt
  （标题/正文/标签直接复制）+ 解压测试版（双击 index.html 即测）。
- ⚠️ Chrome 61 / Android 8.1 / 真机 WebView 未实测时如实标记，不宣称真机通过。