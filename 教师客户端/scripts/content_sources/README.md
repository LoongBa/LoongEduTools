# content_sources — 首发内容包内容源（R2 + R14 · D04 §6）

> 本目录是 `pack_app.py` / `pack_data.py` 的输入源，打成 zip 后进入 `scripts/dist/`。
> 首发两包：**R2 代课应急**（data 型）+ **R14 游戏复习**（app 型）。

## 目录

| 源目录 | 包 | 类型 | 打包命令 |
|--------|----|------|----------|
| `substitute-kit/` | R2 代课应急包 | data | `python pack_data.py --source content_sources/substitute-kit --package-id substitute-kit --version 1.0.0 --name "代课应急包" --categories "代课,应急" --out dist` |
| `game-review-pack/` | R14 游戏复习 | app | 见 `game-review-pack/README.md`（含 index.html 入口，整体作 app 源） |

## 版权与红线

- 教材相关内容：课堂教学 = 合理使用，不复制教材页扫描件/原版音频；点读原文 TTS 重读。
- RedTools 游戏：从 `RedTools/series/**/src/` 只读复制，不改源，仅加选择页壳。
- PEP 词库：`PEP词库/data/vocab/pep_vocab.json` 只读引用（976 词）。

## 验收

- `python verify_pack.py dist/content-pack-<id>-<ver>.zip` 全 PASS。
- 记录 zip 路径 / file_count / size_bytes（看板回写用）。
