# 益智系列 · 逻辑思维子系列

> 逻辑思维训练：通过经典益智玩法锻炼规划、推理与问题解决能力。
> 产品排期见 `RedTools/docs/产品矩阵规划.md` §3.4（逻辑思维训练：数独入门 P1 / 迷宫寻路 P1 / 分类整理 P1 / 推箱子 P2 / 因果排序 P2）。
> 更新：2026-09-19

## 子系列定位

| 项 | 说明 |
|---|---|
| 子系列 | 逻辑思维（益智六大能力之一） |
| 目标用户 | 小学生 / 家长（家庭训练）/ 教师（课堂） |
| 形态 | 小红书小工具（离线 zip + H5，Chrome 61 基线，无网络） |
| 核心价值 | 经典空间规划/推理玩法，训练问题拆解与逆向思维 |

## 工具清单

| 工具 | 优先级 | 状态 | 版本 | 说明 |
|------|:---:|------|------|------|
| 迷宫寻路 | P1 | ✅ 已构建 | v1.0 | 程序化完美迷宫（递归回溯，7×7/11×11/15×15 三档随机生成）；BFS 最短步数星级；足迹 + BFS 提示（封顶 2 星）；计时/各难度最佳/打卡/断局恢复（seed 重放） |
| 分类整理 | P1 | ✅ 已构建 | v1.0 | 点按式分类整理（物品按类别入盒，2/3/4 类三档）；程序化 SVG 图标库（8 类 43 图标零素材）；防卡错3提示；计时星级（0 错 3 星）；各难度最佳/打卡 |
| 数独入门 | P1 | ✅ 已构建 | v1.0 | 程序化出题零题库（回溯终盘 + 挖洞唯一解，4×4/6×6/9×9 三档，9×9 生成 5ms）；点格选数 + 同行列宫/同数字高亮；橡皮/撤销/智能提示；即时反馈（冲突红闪）；星级（提示×错误）；各难度最佳/打卡 |
| 因果排序 | P2 | ✅ 已构建 | v1.0 | 打乱卡片按因果/时间顺序排好（点选两张交换排序，3/4/5 步三档）；程序化 SVG 步骤卡片库（8 序列 32 卡零素材：昼夜/花开/晨起/蝴蝶/蛋糕/青蛙/植物/洗手）；提示高亮首张错位卡（封顶 2★）；星级（提示×步数）；各难度最佳/打卡 |
| 推箱子 | P2 | ✅ 已构建 | v1.0 | 经典推箱子；Microban I 全量数据内嵌（开放前 60 关）；求解器最优推动数星级；关卡解锁/选关；撤销/重开；打卡；断局恢复 |

## 目录结构

```
series/益智/逻辑思维/
├── README.md            # 本文件：子系列说明 + 工具清单
├── 推箱子/              # 工具：推箱子（逻辑思维首款）
│   ├── src/             #   index.html + assets/（main.js/levels.js/style.css/icon_base.png）
│   ├── convert_levels.py #   关卡转换脚本（方案 A：解析 XSB + 求解最优推动数 → levels.js）
│   └── README.md        #   工具说明 + 变更记录
├── 迷宫寻路/            # 工具：迷宫寻路（逻辑思维第 2 款，P1）
│   ├── src/             #   index.html + assets/（main.js/style.css/icon_base.png）
│   └── README.md        #   工具说明 + 变更记录
├── 分类整理/            # 工具：分类整理（逻辑思维第 3 款，P1）
│   ├── src/             #   index.html + assets/（main.js/icons.js/style.css/icon_base.png）
│   └── README.md        #   工具说明 + 变更记录
├── 数独入门/            # 工具：数独入门（逻辑思维第 4 款，P1）
│   ├── src/             #   index.html + assets/（main.js/solver.js/style.css/icon_base.png）
│   └── README.md        #   工具说明 + 变更记录
└── 因果排序/            # 工具：因果排序（逻辑思维第 5 款，P2，子系列收官）
    ├── src/             #   index.html + assets/（main.js/causals.js/style.css/icon_base.png）
    └── README.md        #   工具说明 + 变更记录
                        # （工具文档见 RedTools/docs/工具文档/益智/逻辑思维/）
```

## 构建命令

```bash
python build_all.py --tool 推箱子     # 构建推箱子（静态工具，无单元概念）
python build_all.py --tool 迷宫寻路   # 构建迷宫寻路（静态工具，无单元概念）
python build_all.py --tool 分类整理   # 构建分类整理
python build_all.py --tool 数独入门   # 构建数独入门
python build_all.py --tool 因果排序   # 构建因果排序
python .skill/minitool-zip-builder/scripts/audit_artifact.py dist/益智/推箱子
python .skill/minitool-zip-builder/scripts/audit_artifact.py dist/益智/迷宫寻路
python .skill/minitool-zip-builder/scripts/audit_artifact.py dist/益智/分类整理
python .skill/minitool-zip-builder/scripts/audit_artifact.py dist/益智/数独入门
python .skill/minitool-zip-builder/scripts/audit_artifact.py dist/益智/因果排序
```

## 待建工具（产品矩阵 §3.4）

- **✅ 全部完成**：逻辑思维子系列产品矩阵 5 款（迷宫寻路 P1 / 分类整理 P1 / 数独入门 P1 / 推箱子 P2 / 因果排序 P2）已全部交付（2026-09-19）。
- 远期扩展参考产品矩阵 §4.4 扩展任务灵感：规律补全、编码解码。