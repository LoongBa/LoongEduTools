# RedTools — 目录规则（AGENTS.md）

> 本文件定义 RedTools（小红书小工具集）的目录结构、构建/发布流程、git 约定与进度维护规则。
> 改代码 / 新增工具 / 提交前先读本文件 + `series/<系列>/设计文档.md`。
> 更新：2026-09-17

## 1. 定位

RedTools = **小红书小工具开发集**，按「系列 → 工具」两级组织，数据驱动 + 批量自动化构建。
所有工具须遵守 `RedTools/.skill/minitool-zip-builder/` 打包规范（离线 zip、容器 CSP、平台白名单）。
产品规划唯一权威：`RedTools/docs/产品矩阵规划.md`（62 款产品 / 7 大类 / P0-P3 / 三阶段路线，
本地维护为主，来源信息图 HTML 仅作历史参考）。

## 2. 目录结构（约定，勿随意改动）

```
RedTools/
├── AGENTS.md                  # 本文件：目录规则
├── README.md                  # 总览 + 全系列进度清单 + 开发经验
├── .gitignore                 # 构建/发布产物不入库规则
├── .skill/minitool-zip-builder/   # 小工具打包规范（skill 包解压）
├── build_framework.py         # 公共构建框架（ToolConfig + build_tool + 各转换函数）
├── tools.py                   # 工具注册表（series/工具 → ToolConfig）
├── build_all.py               # 批量构建入口（--tool/--units/--pages/--list）
├── docs/
│   └── 产品矩阵规划.md         # ★ 规划唯一权威：62 款产品/7 大类/P0-P3/三阶段路线
├── series/                    # ★ 系列目录（中文命名）
│   └── <系列>/                #   每个系列独立
│       ├── README.md          #     系列说明 + 工具清单（独立维护）
│       ├── 设计文档.md         #     系列设计规范（可复用核心 + 新工具接入步骤）
│       └── <工具>/            #     工具目录
│           ├── src/           #       index.html + assets/（main.js/style.css/icon_base.png）
│           ├── docs/          #       工具文档：设计文档.md + 使用文档.md（+ 交接文档.md 等）
│           └── README.md      #       工具说明 + 变更记录
├── dist/                      # 构建中间产物（不入库）
│   └── <系列>/<工具>/...
├── publish/                   # ★ 所有系列公共发布目录（不入库，发布文案.txt 除外）
│   └── <系列>/                #   系列内平铺，不再细分
│       ├── <工具名>.zip
│       ├── <工具名>-图标(1024).png
│       ├── 发布文案.txt        # 人工维护，唯一入库项
│       └── <工具名>_解压测试版/  # 双击 index.html 即测
└── docs/                      # 目录级文档
```

**规则**：
- 系列/工具目录用**中文命名**（学科 / 英语点读 / 数学口算）。
- publish 是**所有系列的公共发布目录**，按系列分目录、**系列内不再细分**（用文件名区分工具）。
- 系列资源（README/设计文档）**各自独立维护**；系列间共享资源放 `RedTools/` 根下子目录
  （当前无共享资源；如出现，建 `RedTools/_shared/`）。

## 3. 构建与发布流程

```bash
# 列出已登记工具
python build_all.py --list

# 构建单个工具（默认单元）
python build_all.py --tool 英语点读

# 构建指定单元 / 页码范围 / 全部
python build_all.py --tool 英语点读 --units 0,1,2
python build_all.py --tool 英语点读 --pages 2-13
python build_all.py                          # 批量全部

# 审计（体积/文本门禁，发布前必跑）
python .skill/minitool-zip-builder/scripts/audit_artifact.py dist/学科/英语点读
python .skill/minitool-zip-builder/scripts/audit_artifact.py publish/学科/新英语四上点读1单元.zip
```

发布产物自动落到 `publish/<系列>/`（zip + 1024 图标）。**发布文案.txt 人工维护**（标题/正文/标签）。

## 4. Git 约定

- 入库内容：源码、脚本（build_framework/build_all/tools）、系列文档、README、AGENTS.md、
  `.skill/` 规范、`publish/<系列>/发布文案.txt`。
- **不入库**（见 `.gitignore`）：`dist/`、`publish/` 内除发布文案外的一切生成物
  （zip / 1024 图标 / 解压测试版）、`*.zip`、`*.skill` 源包、`__pycache__/`。
- 素材（book.json data/、_教材素材）不入库（仓库级约定，走素材库 / book_data.zip）。

## 5. 进度维护规则

- `RedTools/README.md` 顶部「全系列开发与交付进度清单」为**唯一权威清单**：
  每完成一次构建/发布，更新该表（系列 / 工具 / 版本 / 构建日期 / 是否发布到小红书 / 产物 / 备注）。
- 系列内部变更详情（功能/踩坑）记入 `series/<系列>/README.md` 或 `设计文档.md`。
- 新工具立项：先写 `series/<系列>/<工具>/README.md`（含需求草案），再进入开发。

## 6. 版本管理规则

发布前必须向用户确认版本号升级，默认按以下规则：

| 变更类型 | 升级位 | 示例 |
|---|---|---|
| 微调（bug fix / 样式调整 / 文案修改） | **patch**（0.0.x → 0.0.x+1） | v1.0.0 → v1.0.1 |
| 较大调整（新功能 / 新知识点 / 交互改进） | **minor**（0.x.0 → 0.x+1.0） | v1.0 → v1.1 |
| 重大变更（架构重构 / 不兼容变更 / 全新系列） | **major**（x.0.0 → x+1.0.0） | v1.0 → v2.0 |

**流程**：每次正式发布时，列出本次变更摘要，询问用户"是否升版？升哪位？"，用户确认后修改 `tools.py` 中对应 ToolConfig 的 `version` 字段。

## 7. 新增工具 checklist

1. `series/<系列>/<工具>/src/`：index.html + assets/（可复制同系列已有工具 src 改造）
2. `tools.py` 登记 `ToolConfig`（series/tool/version/book/素材目录/app_name/default_unit）
3. 构建管线差异 → 扩展 `build_framework.py`（保持向后兼容）
4. `python build_all.py --tool <工具>` → 审计 → 合规自查 → 冒烟测试
5. 更新进度清单 + 系列 README + 本文件（如结构变化）

## 8. 常用规范速查

| 主题 | 依据 |
|------|------|
| zip 白名单 / CSP / 端能力 | `.skill/minitool-zip-builder/references/` |
| 音频 base64 + Web Audio 方案 | `series/学科/设计文档.md` §2.3 |
| Chrome 61 兼容（JS/CSS） | `.skill/.../references/js-compatibility.md`、`css-compatibility.md` |
| 教师客户端（桌面壳） | `../docs/龙爸乐学-教师客户端需求分析与设计方案.md` |
