# 英语点读陪练 · Unit 2 My friends 同步练习内容设计（开发稿）

> 版本：**v1.1**（2026-09-21，按 v1.0 模式复制 + **陪练路线图（7 天制）**）
> 用途：产品开发直接取用（自动配音 / 配图 / 配文字 / 配热区 / 句卡库 / 能力检验 / 打印版）
> 教材依据：人教版（PEP）2022 新课标《英语 四年级上册》Unit 2 My friends（印刷页 14–25）+ Appendix 2 词表（印刷页 80）+ Self-check（印刷页 23）
> 教材提取稿：F:\_教材素材\人教版（PEP）（主编：吴欣）\教材内容提取\四上\四上U2_My_friends.md
> 复制验证：模式 v1.0（三层句库 / 九段 / 方法引导 / 能力检验站 / 打印版五件套）完整适用；本单元特有要点与模式优化见 §8。

---

## 0. 产品逻辑（教材三处断点补齐）

**断点一（举一反三）**：教材句型只给 1 个完整例句，其余组合只有课堂老师带才练得到 → **三层句库**（原文/补全/扩展）把全部合法组合补全、直接给结果。
**断点二（项目）**：教材 Project（Make a book about your friend）只有支架，家长不会带 → **PBL 段**：补全句库 + 选卡生成 + 家长确认。
**断点三（自检）**：教材 Self-check 是能力清单但没人会执行 → **能力检验站**：每条"I can…"变成可执行检验任务，先测后评，未通过自动补练。

> 这是"纸质教材、视频"都做不到的：纸质只给清单，视频只讲不测；我们**练到会、测得准、缺了补**。

**价值三层（递进）**：① 落地（三层句库/PBL/检验站补全执行）② 引导（空缺处教举一反三方法）③ 掌握方法（孩子离开产品也会自己扩展）。

---

## 1. 内容策略：三层句库（原文 / 补全 / 扩展）

| 层 | 定义 | 来源 | 判定 | 数量 |
|---|---|---|---|---|
| **原文** | 教材完整例句（示范锚点） | 教材原句，TTS 重读 | 示范 | 每知识点 1–2 |
| **补全** | 句型框架 × 词表全量合法组合（教材该给没给） | 槽位×词表枚举 + 语法修正（is/has、三单）+ 审核 | 标准答案 | 6–40/知识点 |
| **扩展** | 补全的换位变体 + 融入已学词（复习标签）的新句；**不引入教材外知识点** | LLM + 词用范围检查 | 标准答案/结构 | ≥3/知识点 |

**词用范围（本单元）**：
- 本单元词表（13）：his, strong, hair, kind, quiet, best, read, Chinese, play, game, football, basketball, always
- 已学词池（复习标签，册次待公共词库核对）：tall, short, thin, funny, big, small, long, eyes, ears, legs, body, friend, name, help, like, sing, book, draw, make 等
- 正文词（拓展标签）：nice, great, good, new, smile, share, park, animal, weiqi, picture 等
- 禁止：超前词（Unit 3+ 词表词）与生僻词

**公共词库接口**：复习词引用全册已学词公共词库（`review_from`），不重复建库。
**音频红线**：全部 TTS 重读（含原文层）；配图自绘，不复制教材页面与角色。

---

## 2. 能力目标驱动（Self-check 落地）

| 能力目标（教材 Self-check） | 训练段 | 检验任务（实测，孩子自主产出） | 判定 | 未通过→补练 |
|---|---|---|---|---|
| ① I can talk about my friends. 描述朋友 | 段 1/2/3 | 给 1 个新朋友图（原创人物），孩子自己说 3 句（`He''s/She''s...` + `He/She has...`） | 家长对照句卡确认 | 段 3 |
| ② I can say what I do with my friends. 说和朋友做的事 | 段 0/4 | 看 2 张一起活动的图，孩子说 `We often...` / `He/She often...` 2 句 | 家长确认 | 段 4 |
| ③ I can tell why someone is my friend. 说为什么是朋友 | 段 3/4/5 | 孩子用**两句话组合**说为什么（`He''s kind. He often helps me.`）2 组 | 家长确认（组合句结构） | 段 4 |
| ④ I can read and spell words with "sh". 认读拼读 sh 词 | 段 6 | 指读 6 个 sh 词 + 听写 3 个词 | 工具判定（标准答案） | 段 6 |

**先测后评**：检验结果 → 三档自评（我能做到/基本可以/需要帮助），自评有实测依据。
**补练闭环**：未通过自动映射回训练段；**能力 ③ 检验为组合句表达**（非单句），是"为什么是朋友"的落地形态。

---

## 3. 单元知识骨架（同步清单）

| 知识点 | 原文（教材例句） | 补全（句型×词表/已学） | 扩展（复习/正文词） | 落点 |
|---|---|---|---|---|
| 姓名问答 | His name is Zhang Peng. / What''s your friend''s name? / Her name is Sarah. | 6 原创朋友 × 问答 ≈12 句 | What''s his/her name?（his/her 辨析） | 段 2 |
| 外貌性格 is/has | He''s tall and strong. He has nice short hair too. / She has long hair. | 6 朋友 × is/has 属性 ≈30 句 | +kind/funny/big eyes 组合 | 段 3 |
| 行为三单 | He often reads books with me. / He helps me with Chinese. / We play games together. | 主语 × 动作三单 × with me/us/together ≈24 句 | +always/best；We often play football together. | 段 4 |
| 为什么是朋友 | She''s funny. She often makes me smile. / He''s very kind. He often helps me with English. | 两句话组合（is + often）≈8 组 | +My best friend... | 段 5 收口 |
| sh 语音 | I have no shell. Can we share? / ...（Let''s spell 4 句） | 填空句：True friends share. Tall or short... | 原创 7 句 + ch/sh 对比复习 | 段 6 |
| 好友小书（PBL） | I have a friend. His/Her name is...（8 槽） | 8 槽 × 词库全量句库 | 不同组合（We play football together.） | 段 5 |
| Reading time | Tell me about your good friend. / He has small eyes and very big ears. / ... | 原文其余句（Oh, he''s great. 等） | 续写 | 段 7 |

---

## 4. 练习路径总览（9 段）

| 段 | 段名 | 类型 | 三层运用 | 对应能力 | 判定 |
|---|---|---|---|---|---|
| 0 | 朋友聚会地图 | 热身探索 | 原文示范 + 轮播 | ② | 听音选图 |
| 1 | 词汇大本营 | 词图配对 | 词池（16：8 外貌 + 8 行为） | ①④ | 词↔图绑定 |
| 2 | 我的朋友是谁 | 姓名问答操练 | 原文 2 → 补全 12 → 扩展 | ① | 人物图鉴绑定 |
| 3 | 他是什么样 | is/has 描述操练 | 原文 2 → 补全 30 → 扩展 8 | ①③ | 标准答案 + is/has 辨析 |
| 4 | 我们一起做的事 | 三单变位操练 | 原文 3 → 补全 24 → 扩展 | ②③ | 结构校验 + 词形判定 |
| 5 | 我的好友小书 | PBL 支架输出 | PBL 补全句库（8 槽）+ 扩展 | ①②③ | 卡池 + 家长确认 |
| 6 | sh 乐园 | 语音拼读 | 原文 4 + 填空句 + 扩展 7 | ④ | 标准答案 |
| 7 | 快乐朋友读一读 | 综合阅读 | 原文 + 扩展续写 | ①②③ | 理解题 |
| **8** | **能力检验站** | Self-check 落地 | 4 条能力 × 检验任务 | **①②③④** | 家长/工具判定 + 补练 |

---

## 5. 分段详细设计

### 段 0 · 朋友聚会地图（热身）
场景：公园聚会插画（原创朋友群 IP：Leo/Mia/Sam/Nana/Kiki/Bubu 与小虎）。8 热区：

| 热区 | 画面 | 原文（教材句） | 补全/扩展（轮播） |
|---|---|---|---|
| H1 | 高个男孩 | He''s tall and strong. | He''s tall. / He''s strong. |
| H2 | 短发男孩 | He has short hair. | Sam has short hair. / He has nice short hair. |
| H3 | 一起读书 | He often reads books with me. | We read books together. |
| H4 | 一起踢球 | We play football together. | We play games together.（教材句） |
| H5 | 安静女孩 | She''s quiet. | She''s quiet and kind. |
| H6 | 长头发女孩 | She has long hair. | Mia has long hair. |
| H7 | 帮我学英语 | He often helps me with English. | He helps me with Chinese.（教材句） |
| H8 | 好朋友 | He is my best friend. | She is my best friend. |

任务 1 全点过点亮；任务 2 听音定位 ×4（听扩展句选图）。

### 段 1 · 词汇大本营（词图配对）
16 词分两组：**A 外貌性格 8**：strong, kind, quiet, best（本单元）+ tall, short, thin, funny（已学）；**B 行为 8**：read, play（本单元）+ help, share, draw, make, like, sing（已学/正文）。
玩法 A 听音选图 / B 看图选词 / C 听音点词；词↔图↔音绑定；一轮全对打卡。词卡 = 补全/扩展层词池（全局词 ID，一词多标签，如 share=sh 语音+行为）。

### 段 2 · 我的朋友是谁（姓名问答 · 三层句库）
- **原文**：His name is Zhang Peng. / Really? What''s your friend''s name? / Her name is Sarah.
- **补全**：What''s your friend''s name? His/Her name is [Leo/Mia/Sam/Nana/Kiki/Bubu].（6 组问答，His/Her 自动匹配性别）
- **扩展**：What''s his name? His name is Leo. / What''s her name? Her name is Mia.（his/her 辨析，复习）
- 玩法：人物图鉴问答（6 朋友卡，问名字→答特征）；方法卡：名字回答 = "His/Her name is + 名字"；产出型任务 2 题 + 小老师 1 题。

### 段 3 · 他是什么样（is/has 描述 · 三层句库）
- **原文**：He''s tall and strong. He has nice short hair too. / She has long hair.
- **补全**：6 朋友 × is/has 属性全量 ≈30 句（人物属性卡）：
  - Leo：tall, strong, short hair, big eyes → He''s tall and strong. He has short hair.
  - Mia：tall, long hair, small eyes → She''s tall. She has long hair.
  - Sam：short, thin, small eyes → He''s short and thin. He has small eyes.
  - Nana：quiet, kind, long hair, big eyes → She''s quiet and kind. She has long hair.
  - Kiki：funny, short hair, big eyes → He''s funny. He has short hair.
  - Bubu：short, strong, big eyes → He''s short and strong. He has big eyes.
- **扩展**：My friend is tall and kind. He has short hair and big eyes.（组合已学词）
- **方法卡**：**"人 = is（是什么样）+ has（有什么）"两口袋**——is 后面接形容词（tall/kind），has 后面接身体部位（hair/eyes）；产出型任务 2 题（给新人物自己说）+ 小老师 1 题。
- 玩法 A 看图选句 / B 补全 / C 连线 / D **is vs has 判定**（He ___ tall. He ___ short hair. 辨析，段 4 语法点前置预热）。

### 段 4 · 我们一起做的事（三单变位 · 三层句库）
- **原文**：He often reads books with me. / He helps me with Chinese. / We play games together.
- **补全**：主语（He/She/We）× 动作三单（reads, plays, helps, makes, shares, draws, likes）× with me/us/together ≈24 句：
  - He often reads books with me. / She often plays games with me. / He often helps me with English. / She often makes me smile. / We often play games together. / He often shares books with me.
- **扩展**：We often play football together. / He always reads books with me.（+always 本单元词）/ My friend likes Chinese. I like English.
- **方法卡（语法点）**：**三单变位口诀**——"我 read，他 reads；我 play，他 plays；help→helps，make→makes"；主语是 He/She/My friend 时动词加 s。产出型任务 2 题（自己说 He/She often...）+ 小老师 1 题。
- 玩法：选卡组句 + 三单填空（I read books. My friend ___ books with me.）+ 判定结构/词形。

### 段 5 · 我的好友小书（PBL · 8 槽补全 + 扩展）
- **PBL 补全（8 槽 × 词库全量句库）**：
  - I have a friend. / His/Her name is [6 名]. / He/She is [6 属性]. / He/She has [hair/eyes]. / He/She likes [books/games/football/Chinese]. / He/She often [三单动作]. / We often [play/sing/read together]. / We have so much fun. / He/She is my best friend.
- **PBL 扩展**：We play football together. / He always makes me smile. / We are good friends.
- **方法卡**："介绍朋友 = 名字 + 样子 + 喜好 + 一起做的事"，四步成书。
- 流程：示范（教材小书模板）→ 方法卡 → 自己组合 3–4 句 → 从补全句库对照补足 → 点读跟读 → 完整朗读 → 家长确认 → 打卡。

### 段 6 · sh 乐园（语音 · 三层句库）
- **原文（4）**：I have no shell. Can we share? / Share? No, we can''t. / You can share my shell! / Shoo! Go away, Fish!
- **填空句（原文，Let''s spell 挖空）**：True friends share. Tall or short, strong or not, they help each other.（填 share / short）
- **sh 词（6）**：English, fish, share, she, ship, shop
- **扩展（7，原创）**：She shares her fish with me. / The ship is in the shop. / I read English books. / He likes the ship. / This is a big fish. / We share our books. / She is my friend.（sh 词高亮）
- **玩法**：A 听辨 / B **sh vs ch 归类**（sh 词 6 + 干扰 ch 词：Chinese/teach/chair/lunch——Unit 1 复习对比）/ C 拼读 / D 听写填空（fish/she/ship/share）。

### 段 7 · 快乐朋友读一读（综合阅读）
- **原文（核心句）**：Liu Jia is tall. She has long hair. She often reads books with me. Liu Jia is kind. She always makes me smile. We are best friends.（Read and write）+ Tell me about your good friend. / He has small eyes and very big ears. / He has short legs, but his body is very long.（Reading time）
- **扩展续写**：I like my friend. We often play games together. He is my best friend.
- 理解题 ×4：1. Is Liu Jia tall? → Yes, she is. 2. What does Liu Jia always do? → She always makes me smile. 3. What does your good friend look like? → He has small eyes and very big ears. 4. Do we play games together? → Yes, we do.

### 段 8 · 能力检验站（Self-check 落地）
**定位**：教材 Self-check 的"落地执行版"，也是**举一反三的最终检验**。4 条能力逐条检验，先测后评，未通过自动补练。
- **能力 ① 检验**：给新朋友图（非练习中出现过的人物），孩子自己说 3 句（is + has 混合）
- **能力 ② 检验**：看 2 张一起活动图，孩子说 We often... / He often... 2 句
- **能力 ③ 检验**：孩子用**两句话组合**说"为什么"（He''s kind. He often helps me.）2 组
- **能力 ④ 检验**：指读 6 sh 词 + 听写 3 词（工具判定）
- 通过 → ✅ 点亮；未通过 → 🔁 映射补练段 → 回来重测；4 条全过 → 单元完成 → 家长能力报告 + 打卡 → 解锁 U03。

---

## 6. 句卡库输出格式（家长端）

| 栏 | 句 | 中文 | 音频 | 来源 |
|---|---|---|---|---|
| 原文 | What''s your friend''s name? His name is Zhang Peng. | 你朋友叫什么？他叫张鹏。 | u02_core.mp3 | 教材 |
| 补全 | What''s your friend''s name? Her name is Mia. | 你朋友叫什么？她叫 Mia。 | u02_p01.mp3 | 句型×词表 |
| 扩展 | What''s his name? His name is Leo. | 他叫什么？他叫 Leo。 | u02_e01.mp3 | 复习词：his/her |

> 全单元约 120 句（原文 ~14 + 补全 ~85 + 扩展 ~20）；句卡与检验站联动。

### 6.1 打印版（粉丝福利 · 正式交付物）
**五件套**（A4，黑白友好）：① 三层句卡 ② 好友小书模板（8 槽句库 + 空槽）③ 能力检验记录单 ④ 单元地图/词汇卡 ⑤ **单元练习小单**（纯填空空白卷 / 背面答案）。
**练习小单**（4 部分）：Part 1 姓名问答 6 空（What''s your friend''s ___? His ___ is Leo.）／Part 2 is/has 描述 8 空（He ___ tall. He ___ short hair.）／Part 3 三单填空 6 空（I read books. My friend ___ books with me.）／Part 4 sh 词 4 空（fish/she/ship/share 配图）。挖空优先四会词/重点槽；背面答案 + 中文释义。

---

## 6.2 陪练路线图（7 天制 · 落地到每天）

| 天 | 内容 | 时长 | 要点 |
|---|---|---|---|
| Day 1 | 段 0 朋友聚会地图 + 段 1 词汇大本营 | 20 分 | 认识场景和 16 词（外貌 8 + 行为 8） |
| Day 2 | 段 2 我的朋友是谁 + 段 3 他是什么样 | 20 分 | 主句型 A/B（姓名问答 / is-has 描述） |
| Day 3 | 段 4 我们一起做的事（语法点）+ 方法卡复习 | 15 分 | 三单变位 + 举一反三 |
| Day 4 | 段 5 我的好友小书（PBL） | 20 分 | 8 槽小书，家长确认 |
| Day 5 | 段 6 sh 乐园 + 段 7 快乐朋友读一读 | 20 分 | 语音 + 综合阅读 |
| Day 6 | 段 8 能力检验站 | 15 分 | 先测后评；未过当天补练重测 |
| Day 7（周末） | 打印版巩固（句卡陪读 + 练习小单 + 能力报告） | 15–30 分 | 纸面落地，家长判卷 |

> 弹性：学校同步期可拉伸为 2 周（每天 10 分钟，Day1–3 前半周 / Day4–7 后半周）。产品形态：App 首页"今日陪练"卡片按日解锁 + 家长进度看板。
## 7. 生产与验证

**生产管线**：骨架 → 原文抽取 → 补全枚举（is/has 与三单自动修正）→ 扩展生成（复习/正文词扫词）→ 检验任务（4 能力 × 组合句）→ 配图/配音 → 组装 JSON → 句卡库 + 打印版五件套 → QA。
**JSON 示意**：
```json
{
  "unit": "U02",
  "abilities": [
    { "id": "A1", "desc": "talk about friends", "training_segments": ["S1","S2","S3"],
      "check": { "type": "oral_produce", "new_character": "friend_img.png",
                 "items": ["is x1", "has x1", "is+has x1"], "pass_rule": ">=2 of 3", "retrain_segment": "S3" } }
  ],
  "segments": [{
    "id": "S3", "type": "pattern_three_layer",
    "grammar_rule": "is_has",
    "layers": {
      "original": [{ "text": "He''s tall and strong. He has nice short hair too.", "audio": "core.mp3", "source": "textbook" }],
      "complete": [{ "text": "Leo is tall and strong. He has short hair.", "audio": "p01.mp3" }],
      "extend":   [{ "text": "My friend is tall and kind. He has big eyes.", "audio": "e01.mp3", "tags": ["review:big", "review:eyes"] }]
    }
  }]
}
```
**验证清单**：4 能力 × 检验任务（能力③为组合句）／补全层 is/has、三单修正抽样／扩展层复习标签 + 扫词／原文层 TTS 重读／句卡 + 打印版五件套／sh-ch 对比归类正确／无 PK 排行云端数据。

---

## 8. 版本记录与复制验证发现（模式优化）

| 版本 | 变更 |
|---|---|
| v0.1 | 首版（早于三层模型，句句原创路线） |
| **v1.0** | **按 v1.0 模式完整重写**：三层句库 / 九段 / 方法引导 / 能力检验站 / 打印版五件套 |
| **v1.1** | **陪练路线图（7 天制）**：每天内容/时长/要点落地；与模式 V1.1 同步 |

**复制验证发现（已反馈并吸收进模式 v1.0）**：
1. **语法点多样性**：U02 语法点 = is/has 辨析 + 三单变位 → 模式段 4 `grammar_rule` 参数扩展为"三单 / is-has / a-an"多类型 ✅
2. **PBL 槽位差异**：U02 小书 8 槽 > U01 海报 4 槽 → `scaffold[4-8 槽]` 参数化 ✅
3. **一词多标签**：share 既是 sh 语音词又是行为动词 → 词 ID 复用规则 ✅
4. **能力 ③ 检验形态**："tell why"需要两句话组合表达（非单句）→ 检验任务可为组合句（本单元特有，模板已兼容）
5. **语音对比复习机会**：U02 sh 乐园可做 sh vs ch（U01）归类对比——跨单元螺旋复习的天然落点（建议进入模式增强池）
6. **词表词少**：U02 词表仅 13 词且形容词多为已学词 → 更依赖已学词扩展池，公共词库（待 Agent 整理）优先级提升

---

## 9. 待确认事项

1. sh vs ch 对比复习（U01/U02 联动）：是否纳入正式练习还是仅热身？（建议：段 6 归类干扰题即可，正式对比复习放全册复习单元）
2. 人物属性卡（6 朋友 is/has 定版）与 U01 小虎一家是否同框出现（聚会场景）——建议同框，全册 IP 连贯
3. 公共词库字段对齐（同 U01 §9-3）
4. 练习小单挖空难度（同 U01：图/中文提示 + 可抄写）