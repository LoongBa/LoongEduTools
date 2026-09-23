# 点读陪练 · 内容生产 SOP（标准操作流程）

> 版本：v1.2
> 更新：2026-09-22
> 适用：从教材 PDF 到可发布内容包的完整生产流程（步骤 1-7）+ 在线/离线发布流程（步骤 8-10）+ 交付开闸（步骤 11）
> 执行：OpenCode Agent / 本地脚本

---

## 一、流程总览

```
教材 PDF
   ↓ [步骤 1] 教材内容提取
教材提取稿 markdown
   ↓ [步骤 2] 内容包 JSON 设计
内容包 JSON（content_package.json）
   ↓ [步骤 3] 资产提取（TTS 清单 + 图片清单）
tts_list.json / image_list.json
   ↓ [步骤 4] 批量生成 TTS 音频
音频 mp3 批量产出
   ↓ [步骤 5] 批量生成 AI 图片
图片 png 批量产出
   ↓ [步骤 6] 资产分发到各单元目录
各单元 build/g*u*/assets/ 完整
   ↓ [步骤 7] QA 校验
生产完成 ✅
   ↓ [步骤 8] WebH5 数据接入（u01Content.ts 适配层）
   ↓ [步骤 9] 一键离线发布（publish_offline.py）
   ↓ [步骤 10] 合并打包 + 合规验证
发布完成 ✅（在线 dist / 离线 zip ≤10MB）
   ↓ [步骤 11] 更新对齐表与进度看板
开发组开闸 ✅
```

---

## 二、步骤详解

### 步骤 1：教材内容提取

**目标**：把教材 PDF 提取为结构化 markdown，作为内容设计的事实源。

| 项 | 说明 |
|---|---|
| 输入 | 教材 PDF（`F:\_教材素材\人教版（PEP）（主编：吴欣）\`） |
| 输出 | `教材内容提取\<册次>\<册次>U<N>_<单元名>.md` |
| 执行方 | 本地读图模型（图片版 PDF）/ pdftotext（文字版 PDF） |

**格式规范**（严格对照三下/一下提取稿）：
```markdown
# <册次> Unit N <单元名> 教材内容提取
> 来源：xxx.pdf 页 X-Y

## 单元信息
- **单元名**：xxx
- **核心问题**：xxx？

## 0. Look and think
## 1. Part A: xxx？
### Let's talk / Let's learn / Let's spell
## 2. Part B: xxx？
## 3. Part C: Project: xxx
## 4. Self-check
## 5. Reading time
## 核心词汇 / 核心句型
```

**完成后**：更新 `教材内容提取/README.md` 对应册次状态为 ✅

---

### 步骤 2：内容包 JSON 设计

**目标**：把教材提取稿落地为可直接生产的内容包 JSON。

| 项 | 说明 |
|---|---|
| 输入 | 教材提取稿 markdown |
| 输出 | `build\<单元目录>\<单元目录>_content_package.json` |
| Schema | 见 `docs/英语点读陪练_骨架与内容包Schema及提示词模板_v1.0.md` |

**目录命名规则**：
| 册次 | 目录前缀 | 示例 |
|---|---|---|
| 一上 | g1u | g1u1, g1u2... |
| 二上 | g2u | g2u1, g2u2... |
| 三上 | g3u | g3u1, g3u2... |
| 四上 | u0 | u01, u02...（早期试点） |
| 五上 | g5u | g5u1, g5u2... |
| 六上 | g6u | g6u1, g6u2... |
| 一下 | g1bu | g1bu1, g1bu2... |
| 二下 | g2bu | g2bu1, g2bu2... |
| 三下 | g3bu | g3bu1, g3bu2... |
| 四下 | g4bu | g4bu1, g4bu2... |
| Revision | <前缀>rev | g3brev, g4brev... |

**JSON 结构要点**：
- 顶层：`abilities[]` / `segments[]` / `print_version`
- segments 类型：`map` / `vocab` / `pattern` / `pbl` / `phonics` / `story` / `check`
- 三层句库：`original`（教材原文）/ `complete`（补全）/ `extend`（扩展）
- 每个 text 对应 audio 文件名，每个 image_prompt 对应 image 文件名

**低年级段数变体**：
- 一上/一下：5 段极简版
- 二上：5 段
- 三上/三下：7-9 段
- 四上/四下：9 段标准模板
- 五上：9 段
- 六上：7 段

---

### 步骤 3：资产提取（TTS 清单 + 图片清单）

**目标**：从所有内容包 JSON 中提取需要生成的音频和图片清单。

**执行命令**：
```powershell
cd F:\LoongBa_Git\LoongEduTools\点读陪练
python src\extract_assets.py
```

**输出**：
- `build\_assets\tts_list.json` — TTS 批量清单 `[{name, text}]`
- `build\_assets\image_list.json` — 生图批量清单 `[{id, prompt}]`

**提取规则**：
| segment 类型 | TTS 提取 | 图片提取 |
|---|---|---|
| map（S0） | hotspots[].text | scene.image + hotspots[].image |
| vocab（S1） | cards[].word | cards[].image |
| pattern（S2/S3） | layers.original/complete/extend[].text | — |
| phonics（S5） | letter_groups[].words 合成 | letter_groups[].image |
| story（S6） | lines[].text | lines[].image |

---

### 步骤 4：批量生成 TTS 音频

**目标**：用 Edge TTS 批量合成所有句子音频。

**执行命令**：
```powershell
cd F:\LoongBa_Git\LoongMediaTools
python 音频批量生成工具/tts_batch.py `
    --engine edge `
    --voice en-GB-SoniaNeural `
    --rate=-15% `
    --list "F:\LoongBa_Git\LoongEduTools\点读陪练\build\_assets\tts_list.json" `
    --out "F:\LoongBa_Git\LoongEduTools\点读陪练\build\_assets\audio"
```

**参数说明**：
| 参数 | 值 | 说明 |
|---|---|---|
| engine | edge | Edge TTS 在线引擎 |
| voice | en-GB-SoniaNeural | 英式女声 Sonia |
| rate | -15% | 语速放慢 15%（适合小学生） |
| list | tts_list.json | 批量清单 |
| out | build/_assets/audio | 输出目录 |

**特性**：
- ✅ 断点续传：已产出且 >100B 的自动跳过
- ✅ 自动去重：按 name 去重
- ⏱️ 速度：约 0.3s/条，1673 条约 8-10 分钟

---

### 步骤 5：批量生成 AI 图片

**目标**：用 SenseNova 文生图批量生成所有配图。

**执行命令**：
```powershell
cd F:\LoongBa_Git\LoongEduTools\点读陪练
python src\run_image_gen.py
```

**脚本说明**（`src/run_image_gen.py`）：
- 读取 `build/_assets/image_list.json`
- 调用 `create_generation_task` 创建任务
- 调用 `execute_task` 执行（并发 3，断点续传）

**参数说明**：
| 参数 | 值 | 说明 |
|---|---|---|
| provider | sensenova | SenseNova 文生图 |
| size | 1:1 | 正方形图（词卡/场景图） |
| concurrency | 3 | 3 并发 |
| prompt_extend | False | 关闭自动润色，保画风 |

**特性**：
- ✅ 断点续传：done.json 记录已完成
- ✅ 多 Key 均衡轮换
- ⏱️ 速度：约 3s/张，591 张 / 3 并发 ≈ 10-15 分钟

---

### 步骤 6：资产分发到各单元目录

**目标**：把统一产出的音频和图片，按单元分发到各 `build/g*u*/assets/` 目录。

**待写脚本**：`src/distribute_assets.py`

**分发逻辑**：
1. 遍历所有内容包 JSON
2. 从 JSON 中提取每个单元的 audio/image 文件名列表
3. 从 `build/_assets/audio/` 和 `build/_assets/images/` 复制到对应单元的 `assets/audio/` 和 `assets/images/`

**执行命令**（待实现）：
```powershell
python src\distribute_assets.py
```

---

### 步骤 7：QA 校验

**目标**：验证每个单元的内容包 JSON 与实际资产文件一一对应。

**校验项**：
- [ ] 每个 JSON 中引用的 audio 文件都存在
- [ ] 每个 JSON 中引用的 image 文件都存在
- [ ] 音频文件大小 > 100B（非空）
- [ ] 图片文件大小 > 10KB（非空）
- [ ] 内容包 JSON 结构完整（abilities/segments/print_version）

**执行命令**（待实现）：
```powershell
python src\qa_check.py
```

---

### 步骤 8：WebH5 数据接入（u01Content.ts 适配层）

**目标**：把生产完成的内容包接入 WebH5 播放壳，使在线/离线版都能消费真实数据。

**背景**：WebH5 的 `src/data/u01Content.ts` 是内容包的 **TypeScript 静态快照**（`PIPELINE_U01: Unit`），把 `content_package.json` + `schedule.json` 转录为前端 `Unit` 类型。程序代码（shell）在线/离线共用，仅资源目录独立。

| 项 | 说明 |
|---|---|
| 内容源 | `build/u01/u01_content_package.json` + `05_schedule.json` |
| 适配层 | `WebH5/src/data/u01Content.ts`（PIPELINE_U01 常量） |
| 音频引擎 | `WebH5/src/lib/audio.ts`（mp3 优先，speechSynthesis 兜底） |
| 素材目录 | `WebH5/public/units/<机读名>/audio|images/`（由发布脚本生成，gitignore） |

**映射规则**（content_package → WebH5 Unit）：
- `cards`：segments 各段 layers 拉平为句卡；stage 映射 `original→warm` / `complete→new` / `extend→drill` / 收尾句→`wrap`
- `words`：S1 vocab 词卡（word/zh）
- `skills`：顶层 abilities A1-A4（name 中文意译 / demo / task / remedy）
- `song`：S7 story 原文句拼歌词
- `mp3`：句卡 audio 文件名原样存入 `card.mp3`

**注意事项**：
- 新增单元时：更新 `u01Content.ts` 加入新单元数据 + `UNIT_ROWS` 枚举（首页/词卡页显示用）
- `WebH5/public/units/` 与 `public/ip/*.png` 已 gitignore（可再生成，不入库）

---

### 步骤 9：一键离线发布（publish_offline.py）

**目标**：素材压缩 + WebH5 构建 + 离线拆分 + zip 打包，一条命令完成。

**执行命令**（推荐后台运行，不阻塞会话）：
```powershell
# 前台同步
python src\publish_offline.py -u u01

# 后台运行（日志落地，立即返回）
Start-Process python -ArgumentList "src\publish_offline.py","-u","u01" `
    -WorkingDirectory "F:\LoongBa_Git\LoongEduTools\点读陪练" `
    -RedirectStandardOutput publish.log -RedirectStandardError publish.err
```

**脚本 9 个环节**（`src/publish_offline.py`）：
| # | 环节 | 说明 |
|---|---|---|
| 1 | 就绪校验 | 内容包 + audio/image 与引用一一对应 + 对齐表「交付」标记（不齐 exit 3） |
| 2 | 素材入 public | audio `.mp3.mp3` 双后缀**归一为单后缀**；配图 PNG→WebP；content.json；点唱台 wav→mp3 |
| 3 | manifest → public | 扫 `public/units/*/content.json`（`gen_catalog` 构建期读取；`CATALOG_UNITS` 过滤内联） |
| 4 | IP 头像压缩 | `public/ip/*.png` → `public/ip/webp/`（512px） |
| 5 | WebH5 构建 | `pnpm build`，env `CATALOG_UNITS=u01,u02` 指定本次嵌入单元 |
| 6 | 离线拆分 | dist → `build/offline/` **全量重建**（壳 index/assets/**theme-boot.js**/**logo/**/ip/webp + 仅选中单元） |
| 7 | 门禁 + audit(目录) | ≤10MB / 无双后缀 / 相对路径 / 经典脚本 / 无 `a[download]` / theme-boot+logo 必在 + skill `audit_artifact.py`（FAIL exit 4） |
| 8 | zip 打包 | → `RedTools/publish/学科/点读陪练_<标签>_离线版.zip`（超 10MB 抛错） |
| 9 | audit(zip) | skill audit 对 zip 终审 |

**参数**：
| 参数 | 说明 |
|---|---|
| `-u, --unit` | 单元目录名，**逗号分隔多单元**（默认 u01；`-b` 仅单单元可用） |
| `-b, --build` | 单元构建目录（默认 build/<unit>，仅单单元） |
| `-w, --webh5` | WebH5 目录（默认 点读陪练/WebH5） |
| `-p, --publish` | 发布目录（默认 RedTools/publish/学科） |
| `--zip-name` | zip 名自定义（覆盖自动标签） |

**发布标签**：单单元按内容包 grade/unit（如 `四年级上Unit01`）；多单元同册自动合并（如 `四年级上Unit01-02`）。

---

### 步骤 10：多单元合并打包 + 合规红线

**背景**：小红书要求单文件 ≤10MB。实测 u01 单包 5.61MB、u01+02 合并 8.41MB，同一次 `-u u01,u02` 构建产出合并包。

| 打包策略 | 命令 | 实测 |
|---|---|---|
| 单单元包 | `-u u01` | `点读陪练_四年级上Unit01_离线版.zip` **5.61MB**（157 项，audit PASS） |
| 多单元合并 | `-u u01,u02` | `点读陪练_四年级上Unit01-02_离线版.zip` **8.41MB**（254 项，audit PASS） |

> offline/ 每次运行**按本次 `-u` 单元集全量重建**（不做跨运行累积）；合并包须一次跑齐全部单元。

**合规红线**（不可违反）：
- ✅ 离线包内**每个单文件** ≤10MB（脚本步骤 7 自动校验，超限 exit 2）
- ✅ zip 本体 ≤10MiB（超限抛错）；skill audit 对 >2MiB 报 WARN 不阻塞
- ✅ 无 `.mp3.mp3` 双后缀、无 `a[download]`、index.html 全相对路径 + 经典脚本
- ✅ 壳必含 `theme-boot.js` + `logo/`（缺一 exit）
- ⚠️ 素材需压缩：源图 PNG 2048² 必须经 WebP 压缩后才可发布
- ⚠️ 音频 mp3 管线产出时已压缩（edge TTS 默认）

**发布位置汇总**：
| 产物 | 位置 |
|---|---|
| 离线 zip | `RedTools/publish/学科/点读陪练_<标签>_离线版.zip` |
| 离线包源目录 | `点读陪练/build/offline/`（每次发布全量重建，可再构建） |
| skill audit 脚本 | 解包至 `点读陪练/build/_audit/audit_artifact.py`（读 skill zip，自动刷新） |
| 在线版 dist | `WebH5/dist/`（部署到 Web 服务器即可） |

---

### 步骤 11：更新对齐表与进度看板（★ 交付开闸）

**目标**：把生产完成的单元状态同步到对齐表，开发组才能看到并开工。**这一步不做，开发组无法开闸。**

**更新文件**：
| 文件 | 更新内容 |
|---|---|
| `docs/日常工作对齐表.md` | 对应单元行：音频 ✅ / 配图 ✅ / 组装 ⏳ 可打包；对齐记录加一行 |
| `docs/内容设计清单_全册进度看板.md` | 对应册次行：音频/图片状态更新 |

**更新规则**：
1. **单元级**：每完成一个单元的素材生产（音频+图片+JSON），就更新该单元行
2. **对齐记录**：在"五、设计组 ↔ 开发组对齐记录"表格加一行，写清日期 + 事项
3. **进度看板**：按册次更新内容包/音频/图片三列状态

**触发时机**：
- ✅ 单单元素材全部齐了 → 更新对齐表（开闸组装）
- ✅ 一批单元批量跑完 → 更新进度看板（批量状态）
- ✅ 有阻塞变化 → 立即更新（阻塞表 + 对齐记录）

**示例**：
```
| 日期 | 事项 | 结论 |
|---|---|---|
| 2026-09-22 | U02 素材齐 | 52 音频 + 25 图，可打包 |
```

---

## 三、目录结构总览

```
点读陪练/
├── docs/                          # 设计文档
│   ├── 内容设计清单_全册进度看板.md
│   ├── 英语点读陪练_生产模式与方法论.md
│   ├── 英语点读陪练_骨架与内容包Schema及提示词模板_v1.0.md
│   └── ...
├── src/                           # 生产脚本
│   ├── extract_assets.py          # 步骤 3：资产提取
│   ├── run_image_gen.py           # 步骤 5：生图执行
│   ├── distribute_assets.py       # 步骤 6：资产分发（待写）
│   ├── qa_check.py                # 步骤 7：QA 校验（待写）
│   ├── compress_assets.py         # 步骤 9：图片压缩工具（PNG→WebP）
│   ├── build_offline.py           # 步骤 9：离线包拆分（小红书合规）
│   └── publish_offline.py         # 步骤 9：一键发布主编排（后台运行）
├── WebH5/                         # H5 播放壳（在线/离线共用，V0.2）
│   ├── src/data/u01Content.ts     # 步骤 8：内容包→Unit 适配层（静态快照）
│   ├── src/lib/audio.ts           # 步骤 8：mp3 优先播放引擎
│   ├── public/units/<机读名>/     # 单元素材（gitignore，发布脚本生成）
│   └── public/ip/webp/            # IP 头像压缩版
├── build/                         # 生产产物
│   ├── _assets/                   # 批量产出临时目录
│   │   ├── tts_list.json
│   │   ├── image_list.json
│   │   ├── audio/                 # 所有音频 mp3
│   │   └── images/                # 所有图片 png
│   ├── offline/                   # 离线包源目录（步骤 9 产物）
│   ├── g1u1/                      # 一上 U1
│   │   ├── g1u1_content_package.json
│   │   └── assets/
│   │       ├── audio/
│   │       └── images/
│   ├── g4bu1/                     # 四下 U1
│   └── ...
└── AGENTS.md
```

---

## 四、依赖工具

| 工具 | 位置 | 用途 |
|---|---|---|
| Edge TTS | `LoongMediaTools/音频批量生成工具/` | TTS 音频合成 |
| SenseNova 生图 | `LoongMediaTools/批量生图工具/` | AI 图片生成 |
| PEP 词库 | `LoongEduTools/PEP词库/data/vocab/pep_vocab.json` | 扩展词汇参考 |
| Pillow | Python 包（本地已装 11.3.0） | 图片压缩 PNG→WebP |
| pnpm + Vite | `WebH5/`（React 19/Vite 7） | WebH5 构建 |
| ffprobe/ffmpeg | 系统（Scoop shims） | 音频检查（可选） |

---

## 五、常见问题

| 问题 | 解决方案 |
|---|---|
| TTS 中途断网 | 重新跑同一条命令，断点续传自动跳过已完成 |
| 生图 Key 冷却 | 等待恢复，或 `python batch_cli.py status` 查看剩余时间 |
| 某条 TTS 失败 | 检查文本是否有特殊字符，修正后重跑 |
| 图片风格不一致 | prompt_extend=False 已固定画风，抽检即可 |
| 资产文件名不匹配 | 以内容包 JSON 中的 audio/image 字段为准 |
| 离线包有文件超 10MB | 检查是否混入未压缩 PNG 源图；跑 `publish_offline.py` 会 exit 2 提示超限文件 |
| 单元目录里音频 404 | 确认音频在 `public/units/<机读名>/audio/`（机器名 u01，非中文名）；合并打包时勿改名 units 目录 |
| WebH5 合并打包后歌曲/单元不显示 | 单元数据在 `u01Content.ts` 静态快照中，新增单元需先同步适配层与 `UNIT_ROWS` |
| pnpm 供应链校验拦截 | `WebH5/pnpm-workspace.yaml` 已配 `minimumReleaseAge: 0` + `onlyBuiltDependencies: [esbuild]`；勿移除 |

---

## 六、单次生产 Checklist

新增一册/一个单元时，按此 Checklist 执行：

- [ ] 步骤 1：教材内容提取（markdown）
- [ ] 步骤 2：内容包 JSON 设计（content_package.json）
- [ ] 步骤 3：资产提取（extract_assets.py）
- [ ] 步骤 4：批量 TTS（tts_batch.py）
- [ ] 步骤 5：批量生图（run_image_gen.py）
- [ ] 步骤 6：资产分发（distribute_assets.py）
- [ ] 步骤 7：QA 校验（qa_check.py）
- [ ] 步骤 8：WebH5 数据接入（u01Content.ts 适配层 + UNIT_ROWS）
- [ ] 步骤 9：一键离线发布（publish_offline.py，可后台运行）
- [ ] 步骤 10：合并打包 + 合规验证（单文件 ≤10MB）
- [ ] 步骤 11：更新对齐表与进度看板（★ 交付开闸）

> 发布标准：离线 zip 单文件 ≤10MB（脚本自动校验）；在线 dist 部署 Web 服务器即可。

---

*SOP v1.2（新增步骤 11：交付开闸） · 2026-09-22*
