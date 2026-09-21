# 英语点读陪练 · 现状与后续工作交接（给执行 Agent）

> 版本：v1.0（2026-09-22）
> 用途：设计与模式已定稿，具体执行（骨架运行、批量生产）由执行 Agent（OpenCode）按本文档推进。
> 设计原则、模式、Schema 见 `docs/` 下各文档；本文档只说"现在到哪了、接下来做什么"。

---

## 一、现状（已完成）

### 1. 产品模式（冻结 v1.7）
- **三层句库**：原文（教材句 TTS 重读）→ 补全（槽×词表枚举）→ 扩展（LLM 生成+词库打标）
- **三级命名**：天天见（每日小课包）/ 小阅兵（周末检验站+打印小单）/ 自助餐（可选增强）
- **两周制**：Week1 上课日 1-3 + 周末 PBL + Week2 上课日 4-5 + 周末小阅兵
- **核心价值**：补教材"举一反三 / PBL / 自检"三处只能课堂落地、回家空缺的断点

### 2. 技术管线（8 步）
| 步骤 | 脚本 | 状态 |
|---|---|---|
| ① 骨架 | `01_skeleton.json`（人工填） | 格式定 |
| ② 补全枚举 | `src/complete_layer_enum.py` | ✅ 跑通（U01 56 句，a/an/三单修正） |
| ③ 扩展打标 | `src/review_tag.py` | ✅ 跑通（功能词白名单+词形还原+短语挖除） |
| ④ 配图 | 等 LoongMediaTools 补纯文生图 | ⏳ gap |
| ⑤ 音频批量 | 复用 LoongMediaTools `音频批量生成工具/tts_batch.py` | ✅ 跑通（EdgeTT Sonia，U01 128 个 mp3） |
| ⑥ 排天 | `src/schedule_build.py` | ✅ 跑通（7 天） |
| ⑦ 组装 | `src/assemble.py` | ✅ 跑通（zip） |
| ⑧ QA | `src/qa_check.py` | ✅ 跑通（7 项校验） |
| 主编排 | `src/pipeline.py` | ✅ 端到端跑通 |

### 3. 单元进度
| 单元 | 状态 |
|---|---|
| **U01 Helping at home** | 骨架+补全+打标+音频128个+QA 全通 |
| **U02 My friends** | 骨架+补全92句+打标跑通，待接 LLM 扩展+音频 |
| U03-U06 | 待做 |
| 复习单元/附录 | 模式 v0.1 已定，待落地 |

### 4. 外部依赖
- **PEP 词库**：`PEP词库/data/vocab/pep_vocab.json`（11 册 976 词，已补 U1 课文词）
- **LoongMediaTools 音频工具**：`F:\LoongBa_Git\LoongMediaTools\音频批量生成工具\tts_batch.py`（EdgeTT en-GB-SoniaNeural，rate=-15%）
- **LoongMediaTools 生图工具**：`F:\LoongBa_Git\LoongMediaTools\批量生图工具\`（⏳ 只图生图，需补纯文生图，需求见 `docs/需求_生图工具补纯文生图.md`）

---

## 二、后续工作（执行 Agent 按序推进）

### P0：每单元标准生产流程（可复制）
```
1. 填骨架：build\uXX\01_skeleton.json（句型框架+词表槽，见 骨架Schema与使用说明.md）
2. 跑管线：python src\pipeline.py . 4 <单元号> PEP词库路径
3. 接 LLM 扩展层：提示词模板见 骨架与内容包Schema及提示词模板_v1.0.md
4. 批量音频：tts_batch --list assets_tts_list.json
5. QA：检查 07_qa_report.md，WARN 词人审
```

### P1：U02 走完全流程
- 接 LLM 扩展层（提示词模板）
- 批量音频
- schedule + 组装 + QA

### P2：U03-U06 批量复制
- 每单元填骨架 → 跑管线
- 跨单元螺旋复习（sh vs ch 等）

### P3：生图工具补纯文生图（依赖 LoongMediaTools 组）
- 补完后：跑 `assets_image_prompts.csv` 批量配图
- 配图统一画风后缀：扁平卡通暖色调/圆角白底/无文字/原创 IP

### P4：打印版渲染
- `print_worksheet_sample.html` → PDF（weasyprint 或无头浏览器）
- 五件套：三层句卡 / PBL 模板 / 检验记录单 / 单元地图 / 练习小单

### P5：复习单元 + 附录模式落地
- 模式 v0.1 已定（见 复习单元与附录模式.md）
- 第 7 单元 Revision + 歌曲 + 单元词汇表（听写/背单词）

---

## 三、硬约束（不可违反）

- **不复制教材**：原文 TTS 重读（不录原版），配图自绘（不复制教材页/角色）
- **标准答案原则**：无 PK/排行，儿童数据最小化
- **完全围绕教材**：只补三断点，不额外扩展
- **并行任务规则**：只操作本任务目录；删除/移动/影响他人前先问（见仓库根 AGENTS.md）

---

## 四、关键文件索引

| 文件 | 用途 |
|---|---|
| `docs/英语点读陪练_生产模式与方法论.md` | 产品模式 v1.7 |
| `docs/英语点读陪练_骨架Schema与使用说明.md` | **新单元生产入口** |
| `docs/英语点读陪练_骨架与内容包Schema及提示词模板_v1.0.md` | Schema 冻结 + LLM 提示词 |
| `docs/英语点读陪练_自动化框架开发规格.md` | 管线施工图纸 |
| `docs/需求_生图工具补纯文生图.md` | 给 LoongMediaTools 的 gap 需求 |
| `src/pipeline.py` | 端到端主编排 |
| `build/u01/` | U01 完整产物（参考样本） |
