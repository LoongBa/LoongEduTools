# 英语点读陪练 · Unit 3 Places we live in 同步练习内容设计（开发稿）

> 版本：**v1.0**（2026-09-22，按 v1.0 模式复制）
> 用途：产品开发直接取用（自动配音 / 配图 / 配文字 / 配热区 / 句卡库 / 能力检验 / 打印版）
> 教材依据：人教版（PEP）2022 新课标《英语 四年级上册》Unit 3 Places we live in + Appendix 词表 + Self-check
> 教材提取稿：F:\_教材素材\人教版（PEP）（主编：吴欣）\教材内容提取\四上\四上U3_Places_we_live_in.md
> 复制验证：模式 v1.0（三层句库 / 九段 / 方法引导 / 能力检验站 / 打印版五件套）完整适用

---

## 0. 产品逻辑（教材三处断点补齐）

**断点一（举一反三）**：教材 "There is a park. / There are shops." 只给 1-2 例句，场所×单复数组合只有课堂老师带才练得到 → **三层句库**补全。
**断点二（项目）**：教材 Project（梦想社区模型）只有支架，家长不会带 → **PBL 段**：补全句库 + 选卡生成 + 家长确认。
**断点三（自检）**：教材 Self-check 能力清单没人执行 → **能力检验站**：每条 "I can…" 变可执行检验任务。

---

## 1. 内容策略：三层句库

| 层 | 定义 | 来源 | 数量 |
|---|---|---|---|
| **原文** | 教材完整例句（示范锚点） | TTS 重读 | 每知识点 1-2 |
| **补全** | 句型框架 × 词表全量合法组合 | 槽×词表枚举 + There is/are 单复数修正 | 6-40/知识点 |
| **扩展** | 补全换位变体 + 融入已学词 | LLM + 词库打标 | ≥3/知识点 |

**词用范围（本单元）**：
- 本单元词表（~17）：park, shop, school, hospital, library, zoo, cinema, supermarket, playground, restaurant, bank, bus stop, there, near, behind, next to, live
- 已学复习词（前 2 单元）：family, friend, job, tall/short/strong, read/play/help, clean/cook/sweep
- 正文扩展词：nice, big, small, new, beautiful, quiet, busy, clean

---

## 2. 能力目标驱动（Self-check 落地）

| 能力目标 | 训练段 | 检验任务 | 判定 | 未过→补练 |
|---|---|---|---|---|
| ① I can talk about places in my community. 介绍社区场所 | 段 1/2/3 | 给社区地图图，孩子说 3 句（There is/are...） | 家长确认 | 段 3 |
| ② I can say what people do in the community. 说社区里的人做什么 | 段 4 | 看 2 张场所图，孩子说 people work there / We often... | 家长确认 | 段 4 |
| ③ I can say why I like a place. 说为什么喜欢某地 | 段 3/5 | 孩子用两句话组合说（It's big. I can play there.）2 组 | 家长确认 | 段 4 |
| ④ I can read and spell words with "ck". 认读拼读 ck 词 | 段 6 | 指读 6 个 ck 词 + 听写 3 词 | 工具判定 | 段 6 |

---

## 3. 单元知识骨架

| 知识点 | 原文（教材例句） | 补全（句型×词表） | 扩展 | 落点 |
|---|---|---|---|---|
| There is/are | There is a park. / There are two shops. | 场所×单复数 ≈24 句 | There is a big park near my home. | 段 2 |
| 方位介词 | The park is near my home. / It's next to the school. | 场所×方位 ≈18 句 | My home is behind the library. | 段 3 |
| 社区活动 | We often play in the park. / People work in the hospital. | 场所×活动 ≈20 句 | We often read in the library. | 段 4 |
| 为什么喜欢 | It's big. I can play there. / I like the zoo because animals are cute. | 两句组合 ≈8 组 | +My favorite place is... | 段 5 |
| ck 语音 | back, black, duck, sock, tick（Let's spell） | 填空句 | 原创 7 句 + ch/sh 复习对比 | 段 6 |
| 梦想社区模型（PBL） | I have a dream community. There is...（6 槽） | 6 槽×词库全量句库 | 不同组合 | 段 5 |
| Reading time | Welcome to my community. ... | 原文其余句 | 续写 | 段 7 |

---

## 4. 练习路径（9 段）

| 段 | 段名 | 类型 | 三层运用 | 对应能力 |
|---|---|---|---|---|
| 0 | 社区地图漫步 | 热身探索 | 原文示范 + 轮播 | ① |
| 1 | 场所词大本营 | 词图配对 | 词池（17：场所 12 + 方位 5） | ①④ |
| 2 | There is/are 操练 | 三层句库 | 原文 2 → 补全 24 → 扩展 | ① |
| 3 | 方位描述 | 三层句库 | 原文 2 → 补全 18 → 扩展 | ①③ |
| 4 | 我们在社区做什么 | 三层句库 | 原文 3 → 补全 20 → 扩展 | ②③ |
| 5 | 梦想社区模型（PBL） | PBL 支架输出 | 6 槽补全句库 + 扩展 | ①②③ |
| 6 | ck 乐园 | 语音拼读 | 原文 4 + 填空句 + 扩展 7 | ④ |
| 7 | 社区读一读 | 综合阅读 | 原文 + 续写 | ①②③ |
| **8** | **能力检验站** | Self-check 落地 | 4 条能力 × 检验任务 | **①②③④** |

---

## 5. 分段详细设计

### 段 0 · 社区地图漫步（热身）
社区全景插画（原创 IP：Leo/Mia/Sam/Nana/Kiki/Bubu 的社区）。8 热区：公园/商店/学校/医院/图书馆/动物园/电影院/公交站，各配原文句轮播。

### 段 1 · 场所词大本营
17 词分两组：**A 场所 12**（park/shop/school/hospital/library/zoo/cinema/supermarket/playground/restaurant/bank/bus stop）；**B 方位 5**（near/behind/next to/in front of/beside）。玩法：听音选图/看图选词/听音点词。

### 段 2 · There is/are 操练（三层句库）
- **原文**：There is a park. / There are two shops near my home.
- **补全**：6 场所 × 单复数 ≈24 句（There is a park. / There are three shops.）
- **扩展**：There is a big park near my home. / There are many books in the library.
- **方法卡**："一个用 is，多个用 are"——后面名词单数 is，复数 are。

### 段 3 · 方位描述（三层句库）
- **原文**：The park is near my home. / It's next to the school.
- **补全**：6 场所 × 5 方位 ≈18 句
- **扩展**：My home is behind the library. The zoo is next to the cinema.
- **方法卡**："问在哪 = 方位介词（near/next to/behind）+ 场所"。

### 段 4 · 我们在社区做什么（三层句库）
- **原文**：We often play in the park. / People work in the hospital.
- **补全**：6 场所 × 4 活动 ≈20 句
- **扩展**：We often read in the library. People watch films in the cinema.
- **方法卡**："场所 + 做的事"组合。

### 段 5 · 梦想社区模型（PBL · 6 槽）
- **PBL 补全（6 槽）**：I have a dream community. / There is [6 场所]. / It's [方位] my home. / We can [活动] there. / I like it because [原因]. / It's my favorite place.
- **PBL 扩展**：There is a beautiful park. We can play football there.
- **方法卡**："介绍地方 = 在哪 + 有什么 + 做什么 + 为什么喜欢"，四步说清。
- 流程：示范 → 方法卡 → 自己组合 3-4 句 → 对照补足 → 点读跟读 → 家长确认。

### 段 6 · ck 乐园（语音）
- **原文（4）**：Let's spell 原文句（含 back/black/duck/sock/tick）
- **填空句**：Let's go back. The duck is black.（填 back/black/duck）
- **ck 词（6）**：back, black, duck, sock, tick, clock
- **扩展（7，原创）**：The duck is black. / Tick tock. / Put on your socks. / Look at the black clock.
- **玩法**：听辨 / ck vs ch/sh 归类（U1 ch + U2 sh 复习对比）/ 拼读 / 听写。

### 段 7 · 社区读一读（综合阅读）
- **原文**：Welcome to my community. There is a big park. We often play there. I like my community.
- **扩展续写**：There is a library too. We read books there.
- 理解题 ×4。

### 段 8 · 能力检验站
- ① 给社区地图，孩子说 3 句 There is/are
- ② 看 2 张场所图，说 people work / We often... 2 句
- ③ 两句组合说为什么喜欢某地 2 组
- ④ 指读 6 ck 词 + 听写 3 词
- 4 条全过 → 单元完成 → 解锁 U04。

---

## 6. 句卡库与打印版

**句卡库**：约 100 句（原文 ~12 + 补全 ~68 + 扩展 ~20）。

**打印版五件套**：
1. 三层句卡
2. 梦想社区模型模板（6 槽句库 + 空槽）
3. 能力检验记录单
4. 单元地图/词汇卡
5. 单元练习小单（Part1 There is/are 6 空 / Part2 方位 6 空 / Part3 活动 6 空 / Part4 ck 词 4 空，背面答案）

## 7. 陪练路线图（7 天制）

| 天 | 内容 | 时长 |
|---|---|---|
| Day 1 | 段 0 社区地图 + 段 1 场所词 | 20 分 |
| Day 2 | 段 2 There is/are + 段 3 方位 | 20 分 |
| Day 3 | 段 4 社区活动 + 方法卡复习 | 15 分 |
| Day 4 | 段 5 梦想社区模型（PBL） | 20 分 |
| Day 5 | 段 6 ck 乐园 + 段 7 阅读 | 20 分 |
| Day 6 | 段 8 能力检验站 | 15 分 |
| Day 7（周末） | 打印版巩固（句卡+练习小单+报告） | 15-30 分 |

---

## 8. 复制验证发现（模式优化）

1. **语法点参数**：U3 = There be 单复数 → grammar_rule 加 "there_be" 类型（is/are 自动判定）
2. **方位介词组**：本单元新增"方位介词"词类（near/next to/behind），段 1 词卡分组 A=场所 B=方位
3. **语音对比**：ck 乐园可做 ch/sh/ck 三拼归类（U1/U2/U3 螺旋复习）
4. **PBL 槽位**：梦想社区模型 6 槽（< U2 小书 8 槽）

---

*下一步：U04 Helping in the community（进行时 be+doing，ph 语音）*
