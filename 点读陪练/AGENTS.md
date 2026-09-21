# AGENTS.md — 点读陪练 项目入口

> 英语教材同步拓展练习产品（PEP 四上起步）。本文件只覆盖**点读陪练**项目；
> 两仓库分工、跨项目边界见仓库根 `AGENTS.md`。

---

## 项目定位（一句话）

补教材"举一反三 / PBL / 自检"三处课堂有老师带、回家空缺的断点：
把教材给的 1 个例句，补成完整句库 + 扩展练习 + 能力自检。**不是点读（避开版权），是陪练。**

## 目录结构

```
点读陪练/
├── AGENTS.md              ← 本文件（项目入口）
├── README.md              产品介绍 + 快速开始
├── docs/                  设计文档（10 份，见根 AGENTS.md 文档地图）
├── src/                   管线脚本
│   ├── pipeline.py            端到端主编排（+ ⑤b 配图步骤）
│   ├── complete_layer_enum.py ② 补全枚举
│   ├── review_tag.py          ③ 词库打标
│   ├── schedule_build.py      ⑥ 两周制排天
│   ├── build_full_tts_list.py ⑤ 从内容包提取全量 TTS 清单
│   ├── build_image_list.py    ④b 从内容包生成配图任务（config+jobs）★
│   ├── extract_tts_list.py    ⑤ 递归提取 text+audio 节点
│   ├── assemble.py            ⑦ 打包 zip
│   └── qa_check.py            ⑧ 7 项 QA 校验（含图片绑定检查）
├── build/u01|u02/        各单元构建产物
│   ├── 01_skeleton.json   ① 人工填（唯一人工步骤）
│   ├── 02_complete_layer.json  ②
│   ├── 03_extend_{input,tagged}.json  ③
│   ├── u01_content_package.json  内容包 SSOT（含全部 image_prompt）★
│   ├── 05_schedule.json   ⑥
│   ├── assets/audio/*.mp3  ⑤ TTS 输出
│   ├── assets/images/*.png ④b 配图输出（23 张/单元）★
│   ├── image_task/        配图任务目录（config+jobs+done，可断点续跑）★
│   └── 07_qa_report.md    ⑧
└── dist/                 交付包（u01_pack.zip：JSON+图+音）
```

## 资源位置总览（外部依赖 + 内部文档）

### 外部资源（只读引用，不复制到本仓库）

| 资源 | 位置 | 说明 |
|---|---|---|
| **教材 PDF 原始文件** | `F:\_教材素材\人教版（PEP）（主编：吴欣）\` | 12 册 PDF（一下/五下/六下缺失） |
| **教材内容提取稿**（事实源） | `F:\_教材素材\人教版（PEP）（主编：吴欣）\教材内容提取\` | 每单元一个结构化 markdown，内容设计的唯一事实源 |
| **提取稿清单** | `F:\_教材素材\人教版（PEP）（主编：吴欣）\教材内容提取\README.md` | 全册进度 + 文件索引 |
| **PEP 词库** | `F:\LoongBa_Git\LoongEduTools\PEP词库\data\vocab\pep_vocab.json` | 11 册 976 词，打标判定用 |
| **LoongMediaTools 音频工具** | `F:\LoongBa_Git\LoongMediaTools\音频批量生成工具\tts_batch.py` | edge-tts en-GB-SoniaNeural rate=-15% |
| **LoongMediaTools 配图工具** | `F:\LoongBa_Git\LoongMediaTools\批量生图工具\` | v1.2+ 纯文生图 |

### 内部文档地图（docs/）

| 类别 | 文档 | 用途 |
|---|---|---|
| **方法论** | `英语点读陪练_生产模式与方法论.md` | 三层句库 + 三级载体 + 两周制节奏 |
| **骨架/Schema** | `英语点读陪练_骨架与内容包Schema及提示词模板_v1.0.md` | 内容包 JSON Schema + 提示词模板 |
| **自动化框架** | `英语点读陪练_自动化框架开发规格.md` | 管线开发规格 |
| **产品设计** | `英语点读陪练_产品与架构设计方案.md` | 产品定位 + 架构 |
| **UI 设计** | `UI设计需求方案_给UIAgent.md` | 给 UI Agent 的设计需求 |
| **开发指引** | `产品形态与功能模块开发指引.md` | 功能模块介绍 |
| **交接文档** | `内容交接表_给开发组.md` | 一次性交接（用完删） |
| **日常对齐** | `日常工作对齐表.md` | 内容与开发日常对齐 |
| **进度看板** | `内容设计清单_全册进度看板.md` | 全册内容设计进度（48 单元已完成） |
| **四上推演** | `英语点读陪练_四上全册推演.md` | 四上完整推演 |
| **复习单元模式** | `英语点读陪练_复习单元与附录模式.md` | Revision + 附录模式 |
| **U01 编排** | `英语点读陪练_U01_天天见小阅兵自助餐_Day编排.md` | 七天路线示例 |

### 内容设计文档（按册次）

| 册次 | 文档前缀 | 单元数 | 状态 |
|---|---|---|---|
| 一上 | `英语点读陪练_一上U*_同步练习内容设计.md` | 5 + Revision | ✅ |
| 二上 | `英语点读陪练_二上U*_同步练习内容设计.md` | 5 + Revision | ✅ |
| 三上 | `英语点读陪练_三上U*_同步练习内容设计.md` | 6 + Revision | ✅ |
| 四上 | `英语点读陪练_Unit*_同步练习内容设计.md` | 6 + Revision | ✅ |
| 五上 | `英语点读陪练_五上U*_同步练习内容设计.md` | 6 + Revision | ✅ |
| 六上 | `英语点读陪练_六上U*_同步练习内容设计.md` | 6 + Revision | ✅ |
| 三下 | `英语点读陪练_三下U*_同步练习内容设计.md` | 6 + Revision | ✅ |
| 四下 | `英语点读陪练_四下U*_同步练习内容设计.md` | 6 + Revision | ✅ |
| 二下 | — | 5 + Revision | ❌ 阻塞（需先读图提取教材原文） |
| 一下/五下/六下 | — | — | ❌ 无 PDF |

---

## 八步管线（现状：②③④b⑤b⑥⑦⑧ 已自动化）

```
01_skeleton.json（人工）→ ②枚举 → ③打标 → 内容包(含 image_prompt)
   → ④b 配图（纯文生图，LoongMediaTools v1.2）→ ⑤b TTS → ⑥排天
   → ⑦打包 → ⑧QA
```

- **人工点仅 ① 骨架 + 内容包审校**（词表/句型/能力判对；prompt 随 image 字段填）
- **④b 配图 = 全自动**：内容包每个 `image` 字段旁必须有 `image_prompt`（单一事实源），`build_image_list.py` 收集 → 拼画风后缀 → jobs.json（`input_image:null`）→ 批量生图引擎执行 → 直落 `assets/images/`

## 快速入口

```powershell
# 新单元生产（骨架 + 内容包填好后）
cd 点读陪练\build\uXX
python ..\..\src\pipeline.py . 4 <单元号> ..\..\..\PEP词库\data\vocab\pep_vocab.json

# 仅跑配图（不重跑其他步骤）
python ..\..\src\build_image_list.py . .\image_task
python <LoongMediaTools>\批量生图工具\batch_cli.py run uXX_images --resume
```

## 对接 LoongMediaTools（只读调用，不放本仓库）

| 需求 | 工具 | 说明 |
|---|---|---|
| 音频批量 | `音频批量生成工具/tts_batch.py` | edge + en-GB-SoniaNeural + rate=-15% |
| 配图批量 | `批量生图工具/` v1.2+ | 纯文生图（`/images/generations`），input_image:null + size:"1:1" → 2048²；多 Key/断点续跑/重试引擎全复用 |
| 词库 | `PEP词库/data/vocab/pep_vocab.json` | 打标判定（本仓库，非工具） |

## 配图关键约定（踩坑记录）

- **每图必带 prompt**：内容包一切 `image` 字段必须有同节点 `image_prompt`，缺失 QA 检查 #4 打 WARN
- **统一画风后缀**：`build_image_list.py` 自动拼「扁平卡通暖色调、圆角白底卡片、简洁可爱、画面无任何文字、原创儿童插画风格」
- **命名**：`u01_<segment>_<kind><seq>.png`（与音频命名平行）；由内容包 `image` 字段唯一决定
- **无文字是硬要求**：prompt 若把句子写进画面描述，模型会渲染出文字 → 描述动作/姿势，不写句子本身（踩过：Can she help? 被渲进图）
- **人物数量/一致性**：群体场景（家庭树/全家福）必须显式列成员数与人名前角色（"几位爷爷/奶奶/爸爸…"），模型会漏人（踩过：五口→6 人、家庭树 7→6 人）
- **prompt_extend 默认 false**：v1.2 文生图默认关自动润色保画风（oracle 评审决定），勿在 params 里开
- **改 prompt 重跑**：改内容包 → 重跑 `build_image_list.py` → 删 `image_task/done.json` 中对应 id + 删旧图 → `execute_task(resume=True)`（或 --resume）

## 并行任务规则（继承仓库级）

只维护本任务相关目录；删除/移动共享产物（如 `assets/`、`dist/`、`image_task/`）先问。配图任务目录 `image_task/` 含 API 输出状态（done.json），勿与其他任务混用。

## 后续待办

- U02 按本流程量产（内容包填 image_prompt → ④b 出图）
- U3-U6 量产；Revision/Appendix 按《复习单元与附录模式》单独管线
- 音频 `.mp3.mp3` 双后缀 + pipeline TTS 输出 `sample/` vs `assets/audio/` 对齐（遗留）