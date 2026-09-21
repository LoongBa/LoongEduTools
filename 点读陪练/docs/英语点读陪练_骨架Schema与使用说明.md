# 英语点读陪练 · 骨架 Schema 与使用说明

> 版本：v1.0（2026-09-21）
> 用途：新单元生产时，只需填骨架 JSON + 跑管线，全自动出补全/打标/音频/QA
> 适用：PEP 教材四上起各单元

---

## 1. 骨架是什么

**骨架 = 单元的"句型框架 + 词表槽"**。是每个单元唯一需要人工填的输入。
其余（补全枚举 / 词库打标 / 音频批量 / schedule / QA）全自动化。

```
01_skeleton.json  ──►  complete_layer_enum  ──►  02_complete_layer.json（补全层全句）
       │
       └─►  人工列扩展句  ──►  review_tag  ──►  03_extend_tagged.json（打标）
```

## 2. 骨架 Schema（01_skeleton.json）

```json
{
  "unit": "U02",
  "title": "My friends",
  "patterns": [
    {
      "id": "p1",
      "frame": "What's your friend's name? {his_her} name is {name}.",
      "slot_map": {
        "his_her": ["His", "Her"],
        "name": ["Leo", "Mia", "Sam", "Nana", "Kiki", "Bubu"]
      }
    }
  ]
}
```

### 字段说明
| 字段 | 说明 |
|---|---|
| `unit` | 单元号（U01/U02...） |
| `title` | 单元标题 |
| `patterns` | 句型列表，每单元 2-4 个 |
| `pattern.id` | 句型编号（p1/p2...） |
| `pattern.frame` | 句型框架，槽位用 `{槽名}` 标记 |
| `pattern.slot_map` | 槽名 → 词表数组。枚举时做笛卡尔积 |

### 槽位语法
- `{his_her}`：词性槽，词表里放 His/Her，枚举自动组合
- `{job}`：名词槽，词表放职业词
- 特殊语法（complete_layer_enum 自动处理）：
  - a/an 修正：`He's a {job}` → office worker 自动变 `an office worker`
  - 三单：`{he_she} often {verb_s}` → 词表放原形，枚举自动加 s

## 3. 怎么填骨架（四步）

1. **读教材单元**：找出 2-4 个核心句型（教材只给 1 个完整例句的那些）
2. **拆槽位**：句型里可替换的部分用 `{}` 标记
3. **列词表**：每个槽位的合法替换词（教材词表 + 已学复习词）
4. **写 JSON**：照上面 Schema 填

## 4. 跑管线（一条命令）

```powershell
cd build\uXX
python ..\u01\scripts\pipeline.py . 4 <单元号> <词库路径>
```

管线流程：
```
① 读 01_skeleton.json（人工填）
② complete_layer_enum  → 02_complete_layer.json（补全全句，自动）
③ review_tag           → 03_extend_tagged.json（扩展句打标，自动）
⑥ schedule_build       → 05_schedule.json（两周制排天，自动）
⑤ tts_batch（LoongMediaTools）→ assets/audio/*.mp3（音频，自动）
⑦ assemble             → uXX_pack.zip（打包）
⑧ qa_check             → 07_qa_report.md（7 项校验）
```

## 5. 产物清单（每单元）

| 文件 | 内容 |
|---|---|
| `01_skeleton.json` | 骨架（人工） |
| `02_complete_layer.json` | 补全层全句（脚本枚举） |
| `03_extend_tagged.json` | 扩展句打标（LLM+打标） |
| `05_schedule.json` | 两周制排天 |
| `assets/audio/*.mp3` | 全量音频（edge-tts） |
| `07_qa_report.md` | QA 报告 |

## 6. 词库打标判定规则（review_tag.py）

学四上 Unit N 时：
| 词状态 | 判定 |
|---|---|
| **已学** | grade < 4，或 grade=4 且 unit < N → 打 `review:gX_uY` 标签 |
| **本单元** | grade=4 且 unit=N → current |
| **超前** | grade=4 且 unit>N，或 grade>4 → advanced（标红） |
| **生僻** | 词库未收录 → rare（标红） |
| **功能词** | what/is/the/can... STOPWORDS 白名单 → stop（不算生僻） |

**词形还原**：多候选依次试（chores→chore, children→child, teaches→teach）
**短语匹配**：office worker / factory worker 整词挖除后再逐词
**缩略**：what's→what, uncle's→uncle

## 7. 已知限制
- 扩展层需 LLM 生成（提示词模板见 Schema 文档 v1.0）
- 配图需 LoongMediaTools 纯文生图（gap，需求已提）
- 词形还原是规则，teaches/children 等不规则靠手工 IRREGULAR 表

---
*骨架固定后，新单元生产 = 填骨架 JSON（30 分钟）+ 跑管线（自动）*
