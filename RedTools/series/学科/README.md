# 学科系列（subject）— 小红书小工具

> 学科系列：面向小学学科学习场景的小工具集（英语点读、数学口算等）。
> 本系列 README 独立维护；系列级设计规范见 `设计文档.md`。
> 更新：2026-09-17

## 系列定位

| 项 | 说明 |
|---|---|
| 系列名 | 学科 |
| 目标用户 | 小学生 / 家长 / 教师（教室投影） |
| 形态 | 小红书小工具（离线 zip + H5） |
| 数据源 | 仓库已下载整理的教材素材（book.json + 图片 + 音频） |

## 系列内工具

| 工具 | 状态 | 版本 | 说明 |
|------|------|------|------|
| 英语点读 | ✅ 已开发 | v1.1 | PEP 英语教材逐句点读（点读/顺序双模式），8 个包已构建 |
| 数学口算 | ✅ v1.0 已构建 | v1.0 | 1-6 年级口算（25+ 知识点），smoke-math4 已通过（100%/打卡） |

## 目录结构

```
series/学科/
├── README.md            # 本文件：系列说明 + 工具清单
├── 设计文档.md           # 系列设计规范（点读方案/数据结构/构建约定）
├── 英语点读/             # 工具：英语点读
│   ├── src/             #   index.html + assets/（main.js / style.css / icon_base.png）
│   ├── docs/            #   工具文档：设计文档.md + 使用文档.md
│   └── README.md        #   工具专属说明（可选）
└── 数学口算/             # 工具：数学口算（v1.0 已构建）
    ├── src/             #   index.html + assets/（main.js / generators.js / style.css / icon_base.png）
    ├── docs/            #   工具文档：设计文档.md + 使用文档.md + 交接文档.md
    └── README.md        #   工具说明 + 进度
```

## 构建命令

```bash
# 构建系列内全部工具（默认单元）
python build_all.py --tool 英语点读

# 批量构建所有系列所有工具
python build_all.py

# 构建指定单元
python build_all.py --tool 英语点读 --units 0,1,2
```

## 发布产物位置

- 所有系列的发布产物统一放 `RedTools/publish/<系列>/`（系列内平铺，不按工具细分）
- 每个工具产物：`<工具名>.zip` + `<工具名>-图标(1024).png` + `发布文案.txt` + `<工具名>_解压测试版/`
- 构建中间产物（dist/）与发布产物均**不入 git**（见 `RedTools/.gitignore`）

## 系列原则

1. **数据驱动**：新增工具尽量复用 `build_framework.py`，数据源用 book.json 等已有素材，
   渲染逻辑放 src/，换数据不换代码。
2. **合规**：所有工具遵守 `RedTools/.skill/minitool-zip-builder/` 规范（离线、CSP、白名单）；
   素材版权归原出版社，仅供个人学习/课堂教学。
3. **可追溯**：进度与交付记录维护在 `RedTools/README.md`（全系列清单）与本系列 README。
