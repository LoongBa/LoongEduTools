# 英语点读陪练 · 骨架与内容包 Schema 及提示词模板（v1.0 冻结版）

> 版本：**v1.0（冻结）** ｜ 日期：2026-09-21 ｜ 状态：程序骨架（步骤 ①②）的开发接口定稿；冻结后改动须走 §5 修订记录
> 依据：《生产模式与方法论 v1.4》《四上全册推演 v0.1》《复习单元与附录模式 v0.1》
> 用途：骨架提取工具输出、LLM 内容生成 Prompt、小程序内容包解析、打印版模板渲染——四方共用同一规格

---

## 0. 冻结声明

- 本文件定义两类 Schema：**骨架 JSON**（教材提取产物）与**内容包 JSON**（程序骨架最终产物，小程序 + 打印版共用上游）
- **三层句库生成分工**：原文层 = 骨架直接携带（人工从教材抽取）；补全层 = **脚本枚举**（槽位×词表笛卡尔积 + 语法修正，最稳环节）；扩展层 = **LLM 生成**（提示词模板 §4）；词库判定 = **脚本**（review_from 打标）
- 提示词模板 v1.0 可直接粘贴进 LLM 调用；输出必须符合内容包 Schema（用 JSON 校验器把关）

---

## 1. 骨架 JSON Schema（v1.0 冻结）

### 1.1 字段定义

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `unit` | string | ✅ | 单元 ID，如 "U03" |
| `title` | string | ✅ | 单元英文标题 |
| `topic` | string | ✅ | 话题问句（起始页） |
| `words.core` | string[] | ✅ | Let's learn 词卡必学词（进词卡/补全层） |
| `words.extra` | string[] | 条件 | 正文出现词（标"拓展"，默认开启家长可关） |
| `actions` | string[] | 条件 | 行为/活动短语（用于段 4 组合） |
| `patterns` | object[] | ✅ | 主句型（id/frame，槽位用 `{name}` 标注） |
| `grammar_rule` | string | ✅ | 段 4 语法点：a_an / is_has / third_person / there_be / present_progressive / can / possessive |
| `phonics.combo` | string | ✅ | 语音组合（ch/sh/ck/ph/th/wh…） |
| `phonics.words` | string[] | ✅ | 语音词（Let's spell + 正文） |
| `phonics.originals` | string[] | ✅ | Let's spell 完整句（原文层语音段） |
| `project.scaffold` | string[] | ✅ | Project 支架句（含槽位，槽数 4–8） |
| `self_check` | string[] | ✅ | 4 条能力目标（教材 Self-check 原文） |
| `reading.originals` | string[] | ✅ | Reading time 核心句（原文层短文段） |

### 1.2 示例（骨架 JSON）

```json
{
  "unit": "U03",
  "title": "Places we live in",
  "topic": "What makes a community?",
  "words": {
    "core": ["hospital", "park", "playground", "shop", "toilets", "bus stop", "library", "sport"],
    "extra": ["community", "favourite", "place", "photo", "story"]
  },
  "actions": ["go shopping", "take a walk", "do sports", "see a doctor"],
  "patterns": [
    {"id": "p1", "frame": "There is {place}. We often {action} there."},
    {"id": "p2", "frame": "There are {things}. / There is also {place} over there."}
  ],
  "grammar_rule": "there_be",
  "phonics": {"combo": "ck", "words": ["back", "black", "duck", "sock", "tick"],
              "originals": ["Some ducks are in the park.", "For black socks they can wear."]},
  "project": {"scaffold": ["There is {place} in our dream community.", "People can {action} there.", "..."]},
  "self_check": ["I can tell people about places in my community.",
                 "I can say what people do in my community.",
                 "I can say why I like a place in my community.",
                 "I can read and spell words with \"ck\"."],
  "reading": {"originals": ["Hi! I'm Peter. My family moved to Chengdu.", "Bianlian is great!"]}
}
```

---

## 2. 内容包 JSON Schema（v1.0 冻结）

### 2.1 顶层结构

```json
{
  "schema_version": "1.0",
  "unit": "U03",
  "grade": "4A",
  "title": "Places we live in",
  "abilities": [],
  "segments": [],
  "sentence_card_library": {},
  "print_version": {}
}
```

### 2.2 `abilities`（能力检验站 · 段 8）

```json
"abilities": [
  {
    "id": "A1",
    "desc": "tell people about places",
    "training_segments": ["S1", "S3"],
    "check": {
      "type": "oral_produce | point_read | dictation",
      "items": ["item1 场景提示", "item2"],
      "pass_rule": ">=2 of 3",
      "retrain_segment": "S3"
    }
  }
]
```

- `type` 三选一：`oral_produce`（自主产出，家长确认）/ `point_read`（指读，工具判定）/ `dictation`（听写，工具判定）
- 能力 ③ 类（tell why）检验任务可为**两句话组合**（`items` 给出组合要求）

### 2.3 `segments[].layers`（三层句库，段 2/3/4/6/7 共用）

```json
"layers": {
  "original": [{"text": "...", "zh": "...", "audio": "u03_p1_orig_01.mp3", "source": "textbook"}],
  "complete": [{"text": "...", "zh": "...", "audio": "u03_p1_comp_01.mp3"}],
  "extend":   [{"text": "...", "zh": "...", "audio": "u03_p1_ext_01.mp3",
                "tags": ["review:g3_u2", "extra"]}]
}
```

- 句条目字段：`text`（英文句）/ `zh`（中文释义）/ `audio`（TTS 文件名）/ `source`（仅原文层 = "textbook"）/ `tags`（扩展层：`review:<册次_单元>` 或 `extra`）
- **补全层由脚本枚举生成**（输入 patterns + words.core + grammar_rule），LLM 不手写；人工审核后并入

### 2.4 `segments` 各段类型（0–8）

| id | type | 必含字段 |
|---|---|---|
| S0 | `map` | `scene.image_prompt`、`hotspots[8]`（text/zh/audio/image）、`locate_items[4]`（audio + 正确图） |
| S1 | `vocab` | `groups[2]`（每组 8 卡：word/zh/audio/image） |
| S2 | `pattern` | `layers`、`quiz[6]`（fill/match）、`method_card`、`produce_tasks[2]`、`tutor` |
| S3 | `pattern` | `layers`、`quiz[6]`（choose/match/judge）、`method_card`、`produce_tasks[2]`、`tutor` |
| S4 | `pattern` | `layers`、`grammar_rule`、`quiz[6]`（fill/judge）、`method_card`（语法口诀）、`produce_tasks`、`tutor` |
| S5 | `pbl` | `scaffold`（槽位句库：每槽候选词表）、`method_card`、`flow`（示范→组合→对照→朗读→家长确认） |
| S6 | `phonics` | `layers`（原文 = phonics.originals；扩展 = 原创句）、`words`、`quiz[4]`（听辨/归类/拼读/听写） |
| S7 | `story` | `layers`（原文 = reading.originals；扩展 = 续写）、`quiz[4]`（理解题 + 答案） |
| S8 | `check` | `abilities`（见 2.2） |

`quiz` 条目统一结构：

```json
{"id": "q1", "type": "fill | match | choose | judge | listen_point | listen_write",
 "image": "u03_s3_q1.png", "prompt": "显示文本/题目", "answer": {"expect": "标准答案", "bind": ["word_id", "image_id"]}}
```

`method_card`（举一反三方法卡，段 2/3/4/5 必配）：

```json
{"visual": "槽位可视化描述（如：There is [地点]. We often [活动] there.）",
 "script": "引导话术（如：一个句子 = 两个口袋，换 [地点] 或 [活动] 就是新句子）"}
```

### 2.5 `sentence_card_library`（句卡库，家长端）

```json
"sentence_card_library": {
  "rows": [
    {"layer": "original", "text": "...", "zh": "...", "audio": "...", "source": "textbook"},
    {"layer": "complete", "text": "...", "zh": "...", "audio": "..."},
    {"layer": "extend", "text": "...", "zh": "...", "audio": "...", "tags": ["review:g3_u2"]}
  ]
}
```

### 2.6 `print_version`（打印版五件套）

```json
"print_version": {
  "cards": "句卡库 → A4 三栏页（复用 2.5）",
  "pbl_template": "PBL 空槽模板 + 候选句库",
  "check_record": "4 能力 × 三档 + 家长签名栏",
  "vocab_cards": "16 词卡页",
  "worksheet": {
    "parts": [{"title": "Part 1 职业问答", "items": [{"sentence": "What's your ___'s job?", "blank": "job|职业词", "hint": "家庭树小图"}]}],
    "answers": [{"blank": "…", "answer": "…"}]
  }
}
```

- worksheet 挖空规则：优先四会词/重点槽；每空带 hint（图/中文）；背面答案 + 中文释义

### 2.7 词库引用（review_from 格式）

- 扩展词标签：`review:g3_u2`（三年级下册第二单元）；`extra`（本单元正文词）
- 判定脚本：学 Unit N 时——已学 = `grade<4 ∪ (grade=4 且 unit<N)`；超前 = `grade>4 ∪ (grade=4 且 unit>N) ∪ 未收录`；脚本产出 `review:` 标签，LLM 不得自编

---

## 3. 校验规则（QA 闸门 · 程序骨架步骤 ⑥）

| # | 校验项 | 方法 | 失败处理 |
|---|---|---|---|
| 1 | Schema 合法 | JSON Schema 校验器 | 打回 |
| 2 | 词库判定 | 词库脚本扫全部扩展/补全句 | 超前词/生僻词标红打回 |
| 3 | 教材比对 | 补全/扩展句与教材 OCR 句比对，≥1 成分不同；原文层标记放行 | 撞车句打回重写 |
| 4 | 绑定检查 | 图↔词↔音、图↔主语↔动作、人物↔属性 ID 对应 | 补图/改绑定 |
| 5 | 数量检查 | 扩展 ≥3/知识点；句卡全量；quiz 题数达标；检验任务 4 条齐 | 补齐 |
| 6 | 音频覆盖 | 三层全量句 + 词卡 + 检验任务均有 TTS 文件 | 补配 |
| 7 | 打印版渲染 | 五件套模板渲染抽检（中文不溢出、答案正确） | 修模板 |

---

## 4. 提示词模板（v1.0 冻结 · LLM 内容生成）

> 直接粘贴使用；输入 = 骨架 JSON；输出 = 内容包 JSON（须过 §3 校验）

```
你是「点读陪练」的小学英语同步练习内容作者（人教版 PEP）。
生成单元的三层句库与九段内容，输出严格符合内容包 JSON Schema。

【红线（硬规则）】
1. 内容完全围绕教材：不引入教材外知识点；不复制教材页面/角色形象/原版录音
2. 词用范围：补全层用词 = 骨架 words.core；扩展层用词 ∈ {words.core ∪ 已学词(复习) ∪ words.extra(拓展)}
   ——禁止超前词（grade>当前册 或 当前册未学单元）、禁止生僻词；已学词标签必须用 review:<册次_单元>，不得自编
3. 原文层 = 骨架携带的教材完整例句（source: textbook，TTS 重读）；补全层由脚本枚举，你不手写补全句
4. 句长：单句 ≤ 8 词（原句豁免）；人名一律用原创 IP（Leo/Mia/Sam/Nana/Kiki/Bubu、小虎一家）

【你的职责 = 扩展层 + 各段参数】
1. 扩展层：每知识点 ≥3 句——补全的换位变体（换主语/人物/场景/动作，仍用教材句型与词）+ 融入已学词（带 review 标签）的新句
2. 方法卡（每句型 1 张）：visual（槽位可视化）+ script（引导话术，教"换哪个词 = 新句子"）
3. 产出型任务：每句型 2–3 题（给槽位 + 新词卡，孩子自己造句，非选项）
4. 小老师：每句型段末 1 题（孩子教家长）
5. 九段参数：段 0 场景插画 prompt + 8 热区句 + 4 定位题；段 1 两组词卡（每组 8，core 不足用 extra 补）；段 2/3/4 题型与绑定表（图↔词↔音、图↔主语↔动作、人物↔属性）；段 5 PBL 槽位候选句库；段 6 语音扩展句（组合词自组，ch/sh/ck/ph/th/wh）；段 7 短文续写（前 1–4 句用原文，后 3–5 句扩展）
6. 能力检验站：4 条能力（骨架 self_check）→ 检验任务（oral_produce/point_read/dictation）+ 训练段映射 + 补练段映射
7. 句卡库：三层全量句 rows；打印版五件套参数（含 worksheet 挖空：优先四会词/重点槽，每空带 hint）
8. 配图 prompt 遵循统一人设与画风（扁平卡通、暖色调、圆角白底卡图、无文字水印；原创 IP，不复制教材角色）

【输入】骨架 JSON：{骨架内容}
【输出】内容包 JSON（见 Schema v1.0），直接输出 JSON 本体，不输出其他文字。
```

---

## 5. 修订记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-09-21 | **冻结**：骨架 Schema / 内容包 Schema（三层句库 + 九段 + 检验站 + 句卡 + 打印版）/ 词库 review_from / 校验规则 / 提示词模板 |
