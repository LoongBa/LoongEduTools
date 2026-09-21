# 英语点读陪练（PEP 教材同步拓展练习）

> 配合人教版 PEP 教材的**同步拓展练习工具**——补教材"举一反三 / PBL / 自检"三处只能课堂落地、回家空缺的断点。
> 不是点读（避开版权），是**陪练**：把教材给的 1 个例句，补成完整句库 + 扩展练习 + 能力自检。

---

## 产品逻辑（补教材三处断点）

| 教材断点 | 课堂有老师带 | 回家空缺 | 本产品做法 |
|---|---|---|---|
| **举一反三** | 句型只给 1 例句，其余组合老师带练 | 家长不会补 | **三层句库**：原文（教材句重读）→ 补全（槽×词表枚举全合法组合）→ 扩展（融入已学词） |
| **PBL 项目** | Project 有支架，老师带做 | 家长不会带 | **PBL 段**：补全句库 + 选卡生成 + 家长确认 |
| **自检 Self-check** | 能力清单，老师带验 | 没人执行 | **能力检验站**：每条"I can…"变可执行检验任务，先测后评，未过补练 |

**价值**：纸质教材只给清单，视频只讲不测；本产品**练到会、测得准、缺了补**。

## 三级载体命名

| 名称 | 形态 | 节奏 |
|---|---|---|
| **天天见** | 每日小课包（开场复习/新学/巩固/收尾） | Week1 上课日 1-3 + Week2 上课日 4-5 |
| **小阅兵** | 周末：能力检验站（测）+ 打印小单（练+家长判） | Week2 周末 |
| **自助餐** | 可选增强：闪卡背单词/听写/点唱台 | 碎片随时 |

> Week2 周末小阅兵做完出 **成长卡**（本周学习结果收集卡，非分数评判）。

## 目录结构

```
点读陪练/
├── README.md            ← 本文件
├── docs/                设计文档（18 份：单元设计/方法论/Schema/产品形态/UI 需求/交接表等）
├── src/                 管线脚本
│   ├── pipeline.py           端到端主编排（一条命令）
│   ├── complete_layer_enum.py ② 补全枚举（槽×词表笛卡尔积 + a/an/三单修正）
│   ├── review_tag.py          ③ 词库打标（功能词过滤 + 词形还原 + 短语挖除）
│   ├── schedule_build.py      ⑥ 两周制排天
│   ├── build_full_tts_list.py ⑤ 从内容包提取全量 TTS 清单
│   ├── extract_tts_list.py    ⑤ 递归提取 text+audio 节点
│   ├── assemble.py            ⑦ 打包 zip
│   └── qa_check.py            ⑧ 7 项 QA 校验
├── build/               各单元构建产物
│   ├── u01/                U01（骨架/补全 56 句/音频 128 个/QA）
│   └── u02/                U02（骨架/补全 92 句/打标）
└── dist/                交付包（u01_pack.zip）
```

## 快速开始

### 新单元生产
```powershell
# 1. 填骨架（唯一人工步骤，30 分钟）
#    build\uXX\01_skeleton.json —— 句型框架 + 词表槽（见 docs/骨架Schema与使用说明.md）

# 2. 跑管线（全自动）
cd 点读陪练\build\uXX
python ..\..\src\pipeline.py . 4 <单元号> ..\..\..\PEP词库\data\vocab\pep_vocab.json
```

### 管线流程
```
① 01_skeleton.json（人工填）
   ↓
② complete_layer_enum → 02_complete_layer.json（补全全句）
③ review_tag → 03_extend_tagged.json（扩展句打标）
⑥ schedule_build → 05_schedule.json（两周制排天）
⑤ tts_batch（LoongMediaTools）→ assets/audio/*.mp3
⑦ assemble → dist/uXX_pack.zip
⑧ qa_check → 07_qa_report.md（7 项校验）
```

## 依赖外部工具

| 工具 | 位置 | 用途 |
|---|---|---|
| **音频批量生成工具** | `LoongMediaTools/音频批量生成工具/tts_batch.py` | EdgeTT en-GB-SoniaNeural，rate=-15% |
| **批量生图工具** | `LoongMediaTools/批量生图工具/` | ⏳ gap：需补纯文生图（需求见 docs/需求_生图工具补纯文生图.md） |
| **PEP 词库** | `LoongEduTools/PEP词库/data/vocab/pep_vocab.json` | 11 册 976 词，打标判定 |

## 关键约定

- **不复制教材**：原文层 TTS 重读（不录原版），配图自绘（不复制教材页/角色）
- **标准答案原则**：无 PK/排行，儿童数据最小化
- **完全围绕教材**：不额外扩展，只补三处断点
- **两周制**：每周 2-3 节英语课，两周一个单元

## 文档索引

详见 `AGENTS.md`（仓库根）的"点读陪练文档地图"。
