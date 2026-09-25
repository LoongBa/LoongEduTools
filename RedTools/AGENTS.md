# RedTools — 目录规则（AGENTS.md）

> 本文件定义 RedTools（教育小工具集，**双模式：在线 + 离线**）的目录结构、构建/发布流程、git 约定与进度维护规则。
> 改代码 / 新增工具 / 提交前先读本文件 + `series/<系列>/设计文档.md`。
> 更新：2026-09-22

## 1. 定位

RedTools = **教育小工具开发集**，按「系列 →（子系列 →）工具」组织，数据驱动 + 批量自动化构建。
**双模式定位（2026-09-22 确立）**：每个工具同时产出「离线包 + 在线包」——
- **离线包**：纯静态 zip（index.html 双击即用），发布到**小红书**（合规红线：禁排行榜/云存档/多人互动，见 `docs/教育工具/教育工具产品指导原则.md`）；
- **在线包**：仅部署目录（不入 publish/小红书），对应**微信**场景（在线服务接口就绪、服务端待接，见 `docs/教育工具/教育工具在线版设计要求.md`）。
- 双模式实现：`_shared/js/` 公共模块（lx-shared.js）+ `build_framework.py` `--mode offline|online` 构建注入，核心玩法逻辑一套代码双模式共用（见 `docs/教育工具/V0.2-双模式骨架-开发方案.md` / `V0.4-...-审核报告.md`）。

离线包须遵守 `RedTools/.skill/minitool-zip-builder/` 打包规范（离线 zip、容器 CSP、平台白名单）。
产品规划唯一权威：`docs/教育工具/教育工具产品矩阵规划.md`（62 款产品 / 7 大类 / P0-P3 / 三阶段路线，
本地维护为主，来源信息图 HTML 仅作历史参考）。

## 2. 目录结构（约定，勿随意改动）

```
RedTools/
├── AGENTS.md                  # 本文件：目录规则
├── README.md                  # 总览 + 全系列进度清单（开发/测试状态总表）+ 开发经验
├── .gitignore                 # 构建/发布产物不入库规则
├── .skill/minitool-zip-builder/   # 小工具打包规范（skill 包解压）
├── build_framework.py         # 公共构建框架（ToolConfig + build_tool + 各转换函数）
├── tools.py                   # 工具注册表（series/工具 → ToolConfig）
├── build_all.py               # 批量构建入口（--tool/--units/--pages/--list）
├── docs/                      # ★ 目录级文档（唯一文档中心，不入代码目录）
│   ├── 通用需求-打卡分享记录.md #   跨工具通用能力（打卡/成绩/分享）
│   ├── 通用需求-防沉迷自控力.md #   跨工具通用能力（防沉迷/自控力/结算三选/自律锁）
│   └── 工具文档/              #   ★ 每个小工具的设计/使用文档（统一收拢于此）
│       └── <系列>/[<子系列>/]  #     按系列（子系列）分目录
│           └── <工具>-<类型>.md #    命名如 英语点读-设计文档.md / 数学口算-使用文档.md
├── series/                    # ★ 系列目录（中文命名，只含代码与系列 README）
│   └── <系列>/                #   每个系列独立
│       ├── README.md          #     系列说明 + 工具清单（独立维护）
│       ├── 设计文档.md         #     系列设计规范（可复用核心 + 新工具接入步骤）
│       ├── <子系列>/          #     可选：子系列分组（如 益智/专注力/）
│       │   ├── README.md      #       子系列说明 + 工具清单
│       │   └── <工具>/        #       工具目录（结构同下方工具目录）
│       └── <工具>/            #     工具目录（无子系列时直接位于系列下）
│           ├── src/           #       index.html + assets/（main.js/style.css/icon_base.png）
│           └── README.md      #       工具说明 + 变更记录
├── dist/                      # 构建中间产物（不入库）
│   └── <系列>/<工具>/...
├── publish/                   # ★ 所有系列公共发布目录（不入库，发布文案.txt 除外）
│   └── <系列>/                #   系列内平铺，不再细分
│       ├── <工具名>.zip
│       ├── <工具名>-图标(1024).png
│       ├── 发布文案.txt        # 人工维护，唯一入库项
│       └── <工具名>_解压测试版/  # 双击 index.html 即测
```

**规则**：
- 系列/工具目录用**中文命名**（学科 / 英语点读 / 数学口算）。
- **工具文档（设计/使用）统一放 `RedTools/docs/教育小程序/`，不混入代码目录**：
  每个小工具一份 `设计文档` + 一份 `使用文档`，命名 `<工具>-<类型>.md`，按系列（子系列）分目录；
  系列/工具 README 只做入口链接，不承载完整文档正文。
- publish 是**所有系列的公共发布目录**，按系列分目录、**系列内不再细分**（用文件名区分工具）。
- 系列资源（README/设计文档）**各自独立维护**；系列间共享资源放 `RedTools/` 根下子目录
- **仓库级共享资源**：跨系列共用数据/素材放 `RedTools/_shared/`（如
  `_shared/js/` 双模式公共模块：lx-shared.js 命名空间 + storage/progress/auth/guard/ui-kit，
  见 `docs/教育工具/V0.2-双模式骨架-开发方案.md`）。
- **系列内共享资源**：同一系列多个工具共用的数据/素材放 `series/<系列>/_shared/`（如
  `series/学科/_shared/成语词库/`，看图猜成语/成语接龙/成语配对三件套共用）。
- **仓库级英语词库**：英语类工具（英语点读/打字背单词/单词闪卡）的公共词库数据与工具代码
  统一放仓库根目录 `../PEP词库/`（词汇表 `data/vocab/` + 点读数据 `data/diandu/` + 解析/下载
  工具 `tools/`）。`RedTools/build_framework.py` 构建时委托 `PEP词库/tools/vocab/parse_pep_vocab.py`
  解析词汇表并同步规范化 JSON，勿在 RedTools 内另建英语词库。

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

# 构建模式（双模式，2026-09-22 确立）
python build_all.py --tool 数学口算 --mode offline   # 离线包：zip → publish/<系列>/（小红书）
python build_all.py --tool 数学口算 --mode online    # 在线包：仅 dist/<工具>/online/ 部署目录（微信，不入 publish/小红书）

# 审计（体积/文本门禁，发布前必跑）
python .skill/minitool-zip-builder/scripts/audit_artifact.py dist/学科/英语点读
python .skill/minitool-zip-builder/scripts/audit_artifact.py publish/学科/新英语四上点读1单元.zip
```

发布产物自动落到 `publish/<系列>/`（zip + 1024 图标）。**每次构建都会自动解压一份
`<工具名>_解压测试版/`（覆盖更新，双击 index.html 即测）**。发布文案.txt 人工维护（标题/正文/标签）。
**双模式发布边界**：offline 包发布到小红书（合规红线见 §1）；online 包仅存 `dist/<工具>/online/` 部署目录，
**不入 publish/小红书**（在线接口就绪、服务端待接；微信场景上线需另走在线部署流程）。

## 4. Git 约定

- 入库内容：源码、脚本（build_framework/build_all/tools）、系列文档、README、AGENTS.md、
  `.skill/` 规范、`publish/<系列>/发布文案.txt`。
- **不入库**（见 `.gitignore`）：`dist/`、`publish/` 内除发布文案外的一切生成物
  （zip / 1024 图标 / 解压测试版）、`*.zip`、`*.skill` 源包、`__pycache__/`。
- 素材（点读原始 book.json、_教材素材）不入库（仓库级约定，走素材库 / `PEP词库/data/diandu/book_data.zip` 分发；
  `PEP词库/data/vocab/pep_vocab.json` 词汇表规范化产物入库）。

**并行会话边界（2026-09-26 确立，防交叉污染）**：每个会话**仅跟踪、维护、提交、推送本会话自己的更改**，
避免影响并行任务——
- 只 `git add` 本会话负责目录/文件的改动；暂存后 `git diff --cached --name-only` 复核，**确认未混入其它会话/任务的改动再提交**；
- 不 stage / commit / push 其它会话的改动（如并行任务删除旧工具、重构共享文件、生成构建产物）；
- 删除/移动/覆盖/影响他人产物前先列清单征得同意；不确定归属时停手先问；
- 仓库级并行任务细则见根 `AGENTS.md`「并行任务规则」。

## 5. 进度维护规则

- `RedTools/README.md` 顶部「全系列开发与交付进度清单」为**唯一权威清单**：
  每完成一次构建/发布，更新该表（系列 / 工具 / 版本 / 构建日期 / 开发与测试状态 /
  是否发布（小红书离线包 / 微信在线包）/ 产物 / 文档位置 / 备注）。
- 系列内部变更详情（功能/踩坑）记入 `series/<系列>/README.md` 或 `设计文档.md`。
- 新工具立项：先写 `series/<系列>/<工具>/README.md`（含需求草案），再进入开发。
- 工具文档（设计/使用）统一在 `docs/教育小程序/<系列>/` 维护，与代码目录分离。

## 6. 版本管理规则

发布前必须向用户确认版本号升级，默认按以下规则：

| 变更类型 | 升级位 | 示例 |
|---|---|---|
| 微调（bug fix / 样式调整 / 文案修改） | **patch**（0.0.x → 0.0.x+1） | v1.0.0 → v1.0.1 |
| 较大调整（新功能 / 新知识点 / 交互改进） | **minor**（0.x.0 → 0.x+1.0） | v1.0 → v1.1 |
| 重大变更（架构重构 / 不兼容变更 / 全新系列） | **major**（x.0.0 → x+1.0.0） | v1.0 → v2.0 |

**流程**：每次正式发布时，列出本次变更摘要，询问用户"是否升版？升哪位？"，用户确认后修改 `tools.py` 中对应 ToolConfig 的 `version` 字段。

**tag 命名约定（2026-09-26 确立，防 D 系列冲突）**：编程教学 D 系列**各工具 tag 用工具专属命名**
（`方块排列-v1.x` / `合并策略-v1.x` / `循环指令-v1.x`），**不可**共用「编程教学-vX.Y」前缀
（该前缀已被 D1 走迷宫全程使用，且历史混用过 `编程教学-v1.0`=方块排列v1.0、`编程教学-v1.1`=合并策略v1.0、
`编程教学-v1.2`=docs 回写，版本号已错位）。仅 D1 走迷宫保留 `编程教学-v1.16.x` 系列
（其 tag 历史连续、无冲突）。打 tag 前先 `git tag | Select-String '<工具前缀>'` 核对。

## 6A. 迭代开发流程（每轮必修，2026-09-21 确立）

> 适用于任何工具/开发支撑子系统的**功能迭代**（非 trivial 修复）。一轮 = 一个 V 版本。

**标准流程（每轮迭代按序执行）**：
1. **开发方案**：写 `docs/<工具>/V<版本>-开发方案.md`
   - 内容：背景与现状问题（表格：编号/优先级/问题/代码位置）→ 目标与原则 → 变更设计（逐项：现状/方案/涉及文件）→ 验证计划 → 里程碑与验收 → 版本与发布 → 风险表
   - **跨文件接口变更 / 架构决策 → 必须请 oracle 审核方案**（后台 `subagent_type="oracle"`），按审核意见修订后（版本 bump v0.x）再实施
2. **实施**：按方案逐项落地，最小化修复，不借机重构
3. **验证**：API 断言 / Playwright 冒烟（含 file:// 与 http:// 双协议回归）/ 端到端，全部通过才算完成
4. **实施后审核**：请 oracle 复核实施结果（代码级），通过后编写 `docs/<工具>/V<版本>-审核报告.md`（审核范围/验证证据/变更摘要/版本建议/遗留）
5. **提交与发布**：
   - 提交前**精确限定文件**（`git add` 仅本轮文件，勿混入其他会话/无关改动；暂存后 `git diff --cached --name-only` 复核）
   - **提交 → 征求用户同意后 push + 打 tag**（tag 名 = V 版本）；不 push/不打 tag 视为未发布
   - 并行会话活跃时：只提交不 push，等稳定后统一推送
6. **规则沉淀**：流程性变更同步更新本文件（AGENTS.md）

**方案/审核报告文档位置**：`docs/<工具>/`（工具级迭代文档，与 `docs/教育小程序/` 的使用/设计文档区分）。

## 7. 新增工具 checklist

1. `series/<系列>/<工具>/src/`：index.html + assets/（可复制同系列已有工具 src 改造）
2. `tools.py` 登记 `ToolConfig`（series/tool/version/book/素材目录/app_name/default_unit）
3. 构建管线差异 → 扩展 `build_framework.py`（保持向后兼容）
4. `python build_all.py --tool <工具>` → 审计 → 合规自查 → 冒烟测试
5. 在 `docs/教育小程序/<系列>/` 撰写 `<工具>-设计文档.md` + `<工具>-使用文档.md`
6. 更新进度清单（README 总表）+ 系列 README + 本文件（如结构变化）

## 8. 常用规范速查

| 主题 | 依据 |
|------|------|
| zip 白名单 / CSP / 端能力 | `.skill/minitool-zip-builder/references/` |
| 音频 base64 + Web Audio 方案 | `series/学科/设计文档.md` §2.3 |
| Chrome 61 兼容（JS/CSS） | `.skill/.../references/js-compatibility.md`、`css-compatibility.md` |
| 防沉迷 / 自控力（时长/局数/自律锁） | `docs/通用需求-防沉迷自控力.md` |
| 结算三选 / 分享卡片 / 复制文案 | `docs/通用需求-打卡分享记录.md` §2.3/§5.2/§5.3 |
| 视觉质检（多模态看板） | `look_at` 工具 / `task(subagent_type="multimodal-looker")` 可用：全局 opencode 已配置 `sensenova/sensenova-6.8-flash-lite`（视觉模型 + `modalities` 声明），离线截图/PDF 目检直接走此链路 |
| 教师客户端（桌面壳） | `../教师客户端/docs/教育工具-教师客户端需求分析与设计方案.md` |
| 批量生图/批量重绘 | `../LoongMediaTools/批量生图工具/`（README：`LoongMediaTools/批量生图工具/README.md`） | **通用批量 AI 生图引擎**（**已迁移至 LoongMediaTools 仓库**）：多 Key 均衡/并发/断点续跑/Provider 插件，公共 `keys.json` 配置（含密钥不入 git）。其它工具/Agent 程序化调用：`sys.path.insert(0, r"F:\LoongBa_Git\LoongMediaTools")` + `from 批量生图工具 import execute_task, get_manager, get_provider, ...`；或命令行 `python LoongMediaTools/批量生图工具/batch_cli.py run/list/status/create`。前置：Python 3.9+、`pip install requests`。教材重绘（`重绘工具/`）key 已接入其公共配置 |
