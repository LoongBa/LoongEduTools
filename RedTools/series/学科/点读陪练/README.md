# 点读陪练（学科 · 双模式试点 v0.1）

> 英语单元同步陪练（不复制教材内容，只同步单元知识点骨架）。
> **双模式骨架**：src/core/ + src/adapters/<mode>/ + _shared/js 公共模块（A 批试点）。
> 设计/使用文档：`RedTools/docs/工具文档/学科/点读陪练-{设计,使用}文档.md`。
> 内容管线：`docs/教育工具/点读陪练/`（点读稿）。
> 实施依据：`docs/教育工具/V0.2-双模式骨架-开发方案.md`。
> 更新：2026-09-21

## 变更记录

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-09-21 | v0.1 | 双模式骨架落地：core/adapters 新结构 + _shared/js 公共模块注入 + 双包构建（offline zip / online 部署目录） |

## 构建

```bash
python build_all.py --tool 点读陪练 --mode offline   # 离线 zip → publish/学科/点读陪练.zip
python build_all.py --tool 点读陪练 --mode online    # 在线部署目录 → dist/学科/点读陪练/online/
```
