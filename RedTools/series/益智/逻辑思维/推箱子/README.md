# 推箱子 — 工具说明

> 益智系列 · 逻辑思维子系列首款（P2 经典益智，空间规划问题解决）。
> 设计/使用文档见 `RedTools/docs/教育小程序/益智/逻辑思维/推箱子-{设计,使用}文档.md`。

## 玩法

经典推箱子：玩家把箱子推到黄色目标点即可过关。
- 输入：触屏滑动 / 方向键 WASD（Z 撤销 R 重开）/ 十字 D-pad
- 关卡：Microban I by David W. Skinner 全量内嵌（155 关数据，**开放前 60 关**，`OPEN_LEVELS` 常量扩关）
- 星级：按求解器算出的最少推动数评定（3 星 ≤1.5× 最优、2 星 ≤2.5× 最优）
- 进度：关卡解锁 / 成绩记录 / 每日打卡 / 断局恢复（localStorage `redtools.tuixiangzi.v1`）

## 目录

```
推箱子/
├── src/
│   ├── index.html          # 入口
│   └── assets/
│       ├── main.js         # 游戏逻辑（ES2017 经典脚本）
│       ├── levels.js       # 关卡数据（convert_levels.py 生成，勿手改）
│       ├── style.css       # 样式
│       └── icon_base.png   # 图标母版（构建叠加角标）
└── convert_levels.py       # 关卡转换脚本（解析 XSB + BFS 求解最优推动数）
```

## 变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-09-18 | 首版：经典玩法 + Microban I 数据（开放 60 关）+ 星级/解锁/打卡/断局恢复 |

## 构建与测试

```bash
python build_all.py --tool 推箱子
python .skill/minitool-zip-builder/scripts/audit_artifact.py dist/益智/推箱子
# 冒烟：C:\Users\coffe\AppData\Local\Temp\opencode\pw-smoke\smoke_tuixiangzi.py
```

## 版权

关卡：Microban I by David W. Skinner，免费分发、保留署名、非商业使用（选关页已署名）。
