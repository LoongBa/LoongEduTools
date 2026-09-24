# 点唱台 · 歌曲生产 SOP（标准操作流程）

> 版本：v1.0
> 日期：2026-09-22
> 用途：从歌词设计 → Suno 生成 → 下载 → 自动化处理 → 最终交付的完整流程
> 执行：设计组（人）+ 自动化脚本（程序）
> **待补追踪**：当前无有效原创歌的单元见 `点唱台_原创歌曲待补充清单.md`（8 单元，补完一首更新一行）

---

## 一、流程总览

```
[步骤 1] 写歌词设计稿
    ↓
[步骤 2] 用 Suno 生成歌曲（人操作）
    ↓
[步骤 3] 下载歌曲，放到指定目录（人操作）
    ↓
[步骤 4] 自动化处理（程序自动跑）
    ├─ 分离人声/伴奏轨（Demucs）
    ├─ 歌词对齐时间戳（Whisper + forced alignment）
    └─ 生成歌曲 JSON 数据文件
    ↓
[步骤 5] QA 校验 + 入单元目录
    ↓
[步骤 6] 更新对齐表
```

---

## 二、步骤详解

### 步骤 1：写歌词设计稿

**谁做**：设计组（我）
**产出**：`docs/点唱台_原创儿歌设计稿.md` 里新增单元的歌曲

**要求**：
- 歌词围绕本单元核心词汇和句型
- 2 段 Verse + 2 段 Chorus，~60-75 秒
- 句子短，重复度高，适合小学生跟唱
- 附带完整的 Suno Style prompt

---

### 步骤 2：用 Suno 生成歌曲

**谁做**：设计组（人手动操作）
**操作**：
1. 打开 Suno，开启 Custom Mode
2. **Lyrics 框** → 粘贴设计稿里的歌词（带 `[Verse]` `[Chorus]` 标签）
3. **Style of Music 框** → 粘贴设计稿里的风格 prompt
4. **Title** → 写歌名
5. 点 Create，生成 2 版
6. 挑最好的一版下载

**下载格式**：
- 下载 MP3 格式（音质够就行，不用 WAV）
- 命名规则：见步骤 3

---

### 步骤 3：下载歌曲到指定目录

**谁做**：设计组（人手动操作）
**目标目录**：
```
F:\LoongBa_Git\LoongEduTools\点读陪练\build\_assets\songs_inbox\
```

**文件命名规则**：
```
<单元目录名>_song_raw.mp3
```

**示例**：
| 单元 | 文件名 |
|---|---|
| 四上 U1 | `u01_song_raw.mp3` |
| 四上 U2 | `u02_song_raw.mp3` |
| 一上 U1 | `g1u1_song_raw.mp3` |
| 一下 U1 | `g1bu1_song_raw.mp3` |

> 命名要和内容包的单元目录名一致，方便程序自动识别。

---

### 步骤 4：自动化处理（程序自动跑）

**触发**：inbox 目录里有新文件，运行脚本自动处理

**脚本**：`src/process_song.py`（待写）

**处理流程**：

```
输入：<unit>_song_raw.mp3
    ↓
1. 分离人声/伴奏轨（Demucs）
    ├─ 输出：vocals.mp3（人声示范）
    └─ 输出：instrumental.mp3（卡拉OK伴奏）
    ↓
2. 歌词对齐时间戳（Whisper）
    ├─ 输入：歌词文本（从设计稿读）
    ├─ 输入：人声音频
    └─ 输出：每句歌词的 start / end 时间戳
    ↓
3. 生成歌曲 JSON 数据文件
    └─ 输出：song.json（title / lyrics[] / audio / duration）
```

**输出到单元目录**：
```
build/<单元目录>/assets/song/
├── song_vocal.mp3      （人声示范版）
├── song_instrumental.mp3 （伴奏版）
└── song.json           （歌词+时间戳数据）
```

---

### 步骤 5：QA 校验

**校验项**：
- [ ] 人声轨干净，能听清歌词
- [ ] 伴奏轨没有明显人声残留
- [ ] 歌词时间戳对齐准确（抽 3 句试听）
- [ ] song.json 格式正确
- [ ] 总时长 60-90 秒

---

### 步骤 6：更新对齐表

**更新文件**：`docs/日常工作对齐表.md`

在对应单元行，把"点唱台"列标记为 ✅

---

### 步骤 7：开发组打包（对接说明）

**素材位置**：每首歌处理完后，产物在单元目录的 `assets/song/` 下：

```
build/<单元目录名>/assets/song/
├── song_vocal.wav          （人声示范版，前端点唱台用这个）
├── song_instrumental.wav   （伴奏版，卡拉OK模式用）
└── song.json               （歌词+时间戳数据）
```

**打包规范**：
开发组打包时，把每个单元的 `assets/song/` 整个目录原样打包进去：

```
小程序包/
└── units/
    ├── u01/
    │   └── song/
    │       ├── song_vocal.wav
    │       ├── song_instrumental.wav
    │       └── song.json
    ├── u02/
    │   └── song/
    │       └── ...
    └── ...
```

**开闸标准**：
对齐表中某单元"点唱台"列标记为 ✅，即表示该单元的点唱台素材已就绪，开发组可以打包进版本。

---

## 三、文件命名规范

| 文件 | 命名规则 | 说明 |
|---|---|---|
| 原始下载 | `<unit>_song_raw.mp3` | Suno 下载的原始文件 |
| 人声轨 | `song_vocal.mp3` | 分离后的人声 |
| 伴奏轨 | `song_instrumental.mp3` | 分离后的伴奏 |
| 歌词数据 | `song.json` | 歌词+时间戳 |

---

## 四、目录结构

```
点读陪练/
├── build/
│   ├── _assets/
│   │   └── songs_inbox/          ← 你下载的原始歌曲放这里
│   │       ├── u01_song_raw.mp3
│   │       ├── u02_song_raw.mp3
│   │       └── ...
│   └── u01/
│       └── assets/
│           └── song/              ← 自动化处理后的产物
│               ├── song_vocal.mp3
│               ├── song_instrumental.mp3
│               └── song.json
├── src/
│   └── process_song.py           ← 自动化处理脚本（待写）
└── docs/
    └── 点唱台_原创儿歌设计稿.md    ← 歌词设计稿
```

---

## 五、单次生产 Checklist

新增一首歌曲时，按此执行：

- [ ] 步骤 1：写歌词设计稿（带 [Verse] [Chorus] 标签）
- [ ] 步骤 2：Suno Custom Mode 生成，挑最好的一版
- [ ] 步骤 3：下载 MP3，命名为 `<unit>_song_raw.mp3`，放到 `_assets/songs_inbox/`
- [ ] 步骤 4：运行 `python src/process_song.py` 自动处理
- [ ] 步骤 5：QA 校验（抽 3 句试听时间戳准不准）
- [ ] 步骤 6：更新对齐表

---

## 七、教材歌词跟读 · 生产流程

### 内容来源

人教版教材附录里的 Songs 部分，按单元拆出来的歌词。

### 生产步骤

```
[步骤 1] 从教材提取对应单元的歌词
    ↓
[步骤 2] 逐句拆分，每句一行
    ↓
[步骤 3] 用 Edge TTS 逐句生成音频（Sonia 音色）
    ↓
[步骤 4] 生成 textbook_lyrics.json 数据文件
    ↓
[步骤 5] 更新对齐表
```

### 产物位置

```
build/<单元目录>/assets/song/
├── song_vocal.wav              （原创儿歌人声）
├── song_instrumental.wav       （原创儿歌伴奏）
├── song.json                   （原创儿歌数据）
├── textbook_lyrics.json        （教材歌词跟读数据）
└── textbook/                   （教材歌词逐句音频）
    ├── line_01.mp3
    ├── line_02.mp3
    └── ...
```

### 说明

- **版权安全**：只用 TTS 朗读歌词，不用教材旋律，纯教学用途
- **音色统一**：和我们其他 TTS 音频一样，用 en-GB-SoniaNeural
- **速度**：正常语速（点读功能本身可以慢放）

---

## 六、脚本清单

| 脚本 | 功能 | 状态 |
|---|---|---|
| `process_song.py` | 一键处理原创儿歌：分离 + 对齐 + 生成 JSON | ✅ 已完成 |
| `separate_vocals.py` | 集成在 process_song.py 里 | ✅ 已完成 |
| `align_lyrics.py` | 集成在 process_song.py 里 | ✅ 已完成（简化版） |
| `batch_process_songs.py` | 批量处理 inbox 里所有新歌 | ✅ process_song.py 已支持 |
| `process_textbook_lyrics.py` | 教材歌词逐句 TTS + 生成 JSON | ⏳ 待写 |

---

*歌曲生产 SOP v1.2 · 2026-09-23*
