#!/usr/bin/env python3
"""RedTools 工具注册表：series/工具 → ToolConfig。

新增工具：在这里登记一个 ToolConfig（或子类），并在
series/<系列>/<工具>/ 下放 src/（index.html + assets/icon_base.png 等）。
批量构建见 build_all.py。
"""

from __future__ import annotations

from pathlib import Path

from build_framework import ToolConfig, ROOT

TOOLS: dict[str, ToolConfig] = {
    # ---------------- 学科系列 ----------------
    "英语点读": ToolConfig(
        series="学科",
        tool="英语点读",
        modes=["offline", "online"],
        free_units=None,
        version="1.3.0",
        book=ROOT.parent / "PEP词库" / "data" / "diandu" / "1212001401255_英语（PEP）_四年级_上册.json",
        img_dir=Path(r"F:\_教材素材\人教版（PEP）（主编：吴欣）\四年级\上册\_图片素材"),
        redrawn_img_dir=Path(r"F:\_教材素材\人教版（PEP）（主编：吴欣）\四年级\上册\_重绘图片素材"),
        hotzone_dir=Path(r"F:\_教材素材\人教版（PEP）（主编：吴欣）\四年级\上册"),
        audio_dir=Path(r"F:\_教材素材\人教版（PEP）（主编：吴欣）\四年级\上册\_重读音频素材\单句音频"),
        app_name="新英语四上点读1单元",
        app_name_template="新英语四上点读{unit_no}单元",
        default_unit=0,
    ),
    "数学口算": ToolConfig(
        series="学科",
        tool="数学口算",
        version="1.2.1",      # v1.2.1（patch）：feedback 迁移 uikit setFeedback（V0.6 行为不变内部替换）；v1.2：防沉迷接入（V0.5）
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="数学口算",
        modes=["offline", "online"],
        free_units=3,
        default_unit=0,
    ),
    "24点": ToolConfig(
        series="学科",
        tool="24点",
        version="1.2",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="24点",
        modes=["offline", "online"],
        free_units=None,
        default_unit=0,
    ),
    "乘法口诀练习": ToolConfig(
        series="学科",
        tool="乘法口诀练习",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="乘法口诀练习",
        modes=["offline", "online"],
        free_units=2,
        default_unit=0,
    ),
    "打字背单词": ToolConfig(
        series="学科",
        tool="打字背单词",
        version="1.0",
        datasource="vocab",    # PEP 词汇表工具：解析 11 册教材词汇表 → data.js（books）
        vocab_dir=Path(r"F:\_教材素材\人教版（PEP）（主编：吴欣）"),
        app_name="打字背单词",
        modes=["offline", "online"],
        free_units=200,
        default_unit=0,
    ),
    "单词闪卡": ToolConfig(
        series="学科",
        tool="单词闪卡",
        version="1.0",
        datasource="vocab",    # PEP 词汇表工具：与打字背单词同管线，词库 data.js（books）
        vocab_dir=Path(r"F:\_教材素材\人教版（PEP）（主编：吴欣）"),
        app_name="单词闪卡",
        modes=["offline", "online"],
        free_units=200,
        default_unit=0,
    ),
    # ---------------- 学科系列 · 成语（共享词库 _shared/成语词库/） ----------------
    "看图猜成语": ToolConfig(
        series="学科",
        tool="看图猜成语",
        version="1.0",
        datasource="chengyu",  # 成语词库工具：复制 src/ + 注入共享词库 data.js
        app_name="看图猜成语",
        modes=["offline", "online"],
        free_units=1,
        default_unit=0,
    ),
    "成语接龙": ToolConfig(
        series="学科",
        tool="成语接龙",
        version="1.1",
        datasource="chengyu",  # 成语词库工具：复制 src/ + 注入共享词库 data.js
        app_name="成语接龙",
        modes=["offline", "online"],
        free_units=1,
        default_unit=0,
    ),
    "成语配对": ToolConfig(
        series="学科",
        tool="成语配对",
        version="1.0",
        datasource="chengyu",  # 成语词库工具：复制 src/ + 注入共享词库 data.js
        app_name="成语配对",
        modes=["offline", "online"],
        free_units=1,
        default_unit=0,
    ),
    # ---- 双模式试点（V0.2 骨架）：新结构 src/core/ + src/adapters/<mode>/ ----
    "点读陪练": ToolConfig(
        series="学科",
        tool="点读陪练",
        version="0.1",
        datasource="static",   # 静态工具：复制 src/（含 core/ adapters/）+ 注入公共模块
        app_name="点读陪练",
        default_unit=0,
        modes=["offline", "online"],   # 双模式：offline（zip 发布）/ online（部署目录）
        free_units=1,                  # 离线免费 Unit1（设计要求书 §六：首单元免费）
        shared_js=True,                # 合并 _shared/js 公共模块
    ),
    # ---------------- 益智系列 · 专注力子系列 ----------------
"舒尔特方格": ToolConfig(
    series="益智",
    subgroup="专注力",     # 子系列目录：series/益智/专注力/舒尔特方格/
    tool="舒尔特方格",
    version="1.0",
    datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
    app_name="舒尔特方格",
    modes=["offline", "online"],
    free_units=2,
    default_unit=0,
),
"找相同": ToolConfig(
    series="益智",
    subgroup="专注力",     # 子系列目录：series/益智/专注力/找相同/
    tool="找相同",
    version="1.0",
    datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
    app_name="找相同",
    modes=["offline", "online"],
    free_units=2,
    default_unit=0,
),
"划消训练": ToolConfig(
    series="益智",
    subgroup="专注力",     # 子系列目录：series/益智/专注力/划消训练/
    tool="划消训练",
    version="1.0",
    datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
    app_name="划消训练",
    modes=["offline", "online"],
    free_units=2,
    default_unit=0,
),
"视觉追踪": ToolConfig(
    series="益智",
    subgroup="专注力",     # 子系列目录：series/益智/专注力/视觉追踪/
    tool="视觉追踪",
    version="1.0",
    datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
    app_name="视觉追踪",
    modes=["offline", "online"],
    free_units=2,
    default_unit=0,
),
    # ---------------- 益智系列 · 观察力子系列 ----------------
    "找不同": ToolConfig(
        series="益智",
        subgroup="观察力",     # 子系列目录：series/益智/观察力/找不同/
        tool="找不同",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="找不同",
        modes=["offline", "online"],
        free_units=2,
        default_unit=0,
    ),
    "影子配对": ToolConfig(
        series="益智",
        subgroup="观察力",     # 子系列目录：series/益智/观察力/影子配对/
        tool="影子配对",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="影子配对",
        modes=["offline", "online"],
        free_units=2,
        default_unit=0,
    ),
    "细节搜索": ToolConfig(
        series="益智",
        subgroup="观察力",     # 子系列目录：series/益智/观察力/细节搜索/
        tool="细节搜索",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="细节搜索",
        modes=["offline", "online"],
        free_units=2,
        default_unit=0,
    ),
    "错误在哪里": ToolConfig(
        series="益智",
        subgroup="观察力",     # 子系列目录：series/益智/观察力/错误在哪里/
        tool="错误在哪里",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="错误在哪里",
        modes=["offline", "online"],
        free_units=2,
        default_unit=0,
    ),
    # ---------------- 益智系列 · 记忆力子系列 ----------------
    "翻牌记忆配对": ToolConfig(
        series="益智",
        subgroup="记忆力",    # 子系列目录：series/益智/记忆力/翻牌记忆配对/
        tool="翻牌记忆配对",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="翻牌记忆配对",
        modes=["offline", "online"],
        free_units=2,
        default_unit=0,
    ),
"数字记忆": ToolConfig(
    series="益智",
    subgroup="记忆力",    # 子系列目录：series/益智/记忆力/数字记忆/
    tool="数字记忆",
    version="1.0",
    datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
    app_name="数字记忆",
    modes=["offline", "online"],
    free_units=2,
    default_unit=0,
),
"图形序列复刻": ToolConfig(
    series="益智",
    subgroup="记忆力",    # 子系列目录：series/益智/记忆力/图形序列复刻/
    tool="图形序列复刻",
    version="1.0",
    datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
    app_name="图形序列复刻",
    modes=["offline", "online"],
    free_units=2,
    default_unit=0,
),
"位置记忆": ToolConfig(
    series="益智",
    subgroup="记忆力",    # 子系列目录：series/益智/记忆力/位置记忆/
    tool="位置记忆",
    version="1.0",
    datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
    app_name="位置记忆",
    modes=["offline", "online"],
    free_units=2,
    default_unit=0,
),
    # ---------------- 益智系列 · 逻辑思维子系列 ----------------
    "推箱子": ToolConfig(
        series="益智",
        subgroup="逻辑思维",   # 子系列目录：series/益智/逻辑思维/推箱子/
        tool="推箱子",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="推箱子",
        modes=["offline", "online"],
        free_units=20,
        default_unit=0,
    ),
    "迷宫寻路": ToolConfig(
        series="益智",
        subgroup="逻辑思维",   # 子系列目录：series/益智/逻辑思维/迷宫寻路/
        tool="迷宫寻路",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="迷宫寻路",
        modes=["offline", "online"],
        free_units=2,
        default_unit=0,
    ),
    "分类整理": ToolConfig(
        series="益智",
        subgroup="逻辑思维",   # 子系列目录：series/益智/逻辑思维/分类整理/
        tool="分类整理",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="分类整理",
        modes=["offline", "online"],
        free_units=2,
        default_unit=0,
    ),
    "数独思维": ToolConfig(
        series="益智",
        subgroup="逻辑思维",   # 子系列目录：series/益智/逻辑思维/数独思维/
        tool="数独思维",
        version="1.32",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="数独思维",
        modes=["offline", "online"],
        free_units=1,
        default_unit=0,
    ),
    "因果排序": ToolConfig(
        series="益智",
        subgroup="逻辑思维",   # 子系列目录：series/益智/逻辑思维/因果排序/
        tool="因果排序",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="因果排序",
        modes=["offline", "online"],
        free_units=2,
        default_unit=0,
    ),
    "蜡笔物理": ToolConfig(
        series="益智",
        subgroup="逻辑思维",   # 子系列目录：series/益智/逻辑思维/蜡笔物理/
        tool="蜡笔物理",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="蜡笔物理",
        modes=["offline", "online"],
        free_units=5,
        default_unit=0,
    ),
    # ---------------- 益智系列 · 空间感知子系列 ----------------
    "简单拼图": ToolConfig(
        series="益智",
        subgroup="空间感知",   # 子系列目录：series/益智/空间感知/简单拼图/
        tool="简单拼图",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="简单拼图",
        modes=["offline", "online"],
        free_units=2,
        default_unit=0,
    ),
    "七巧板": ToolConfig(
        series="益智",
        subgroup="空间感知",   # 子系列目录：series/益智/空间感知/七巧板/
        tool="七巧板",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="七巧板",
        modes=["offline", "online"],
        free_units=4,
        default_unit=0,
    ),
    "华容道": ToolConfig(
        series="益智",
        subgroup="空间感知",   # 子系列目录：series/益智/空间感知/华容道/
        tool="华容道",
        version="1.1",        # v1.1：角色头像升级为 AI 生成（SenseNova U1.5 + 抠图透明 WebP）
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="华容道",
        modes=["offline", "online"],
        free_units=2,
        default_unit=0,
    ),
    "机器人走迷宫": ToolConfig(
        series="益智",
        subgroup="编程教学",     # 子系列目录：series/益智/编程教学/机器人走迷宫/
        tool="机器人走迷宫",
        version="1.16.1",      # v1.16.1: patch——toggle 参数化递归对齐（I1 既有缺口修复，执行零改动）
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="机器人走迷宫",
        modes=["offline", "online"],
        free_units=2,
        default_unit=0,
    ),
    "方块排列指令": ToolConfig(
        series="益智",
        subgroup="编程教学",     # 子系列目录：series/益智/编程教学/方块排列指令/
        tool="方块排列指令",
        version="1.2",        # v1.2：关卡编辑器（创作闭环——自画图案/可拼校验/保存挑战；checkSolvable 两阶段 + refPieces）
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="方块排列指令",
        modes=["offline", "online"],
        free_units=2,
        default_unit=0,
    ),
    "合并策略编程": ToolConfig(
        series="益智",
        subgroup="编程教学",     # 子系列目录：series/益智/编程教学/合并策略编程/
        tool="合并策略编程",
        version="1.1",        # v1.1：关卡编辑器（创作闭环——自摆数字块/选目标/BFS 可解校验/保存挑战；真实 BFS 最优星级）
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="合并策略编程",
        modes=["offline", "online"],
        free_units=2,
        default_unit=0,
    ),
    "循环指令": ToolConfig(
        series="益智",
        subgroup="编程教学",     # 子系列目录：series/益智/编程教学/循环指令/
        tool="循环指令",
        version="1.2.1",      # v1.2.1（patch）：回退到中间格 UX + 3 项 N 加固（trace 浅拷贝/L491+L944 null guard/V1.2 方案文本 [0,9] 校正）
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="循环指令",
        modes=["offline", "online"],
        free_units=2,
        default_unit=0,
    ),
    "扫雷推理": ToolConfig(
        series="益智",
        subgroup="逻辑思维",     # 子系列目录：series/益智/逻辑思维/扫雷推理/
        tool="扫雷推理",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="扫雷推理",
        modes=["offline", "online"],
        free_units=2,
        default_unit=0,
    ),
    "旋转拼图": ToolConfig(
        series="益智",
        subgroup="空间感知",     # 子系列目录：series/益智/空间感知/旋转拼图/
        tool="旋转拼图",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="旋转拼图",
        modes=["offline", "online"],
        free_units=2,
        default_unit=0,
    ),
    # ---------------- 益智系列 · 反应力子系列 ----------------
    "点击反应测试": ToolConfig(
        series="益智",
        subgroup="反应力",     # 子系列目录：series/益智/反应力/点击反应测试/
        tool="点击反应测试",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="点击反应测试",
        modes=["offline", "online"],
        free_units=2,
        default_unit=0,
    ),
    "手速挑战": ToolConfig(
        series="益智",
        subgroup="反应力",     # 子系列目录：series/益智/反应力/手速挑战/
        tool="手速挑战",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="手速挑战",
        modes=["offline", "online"],
        free_units=2,
        default_unit=0,
    ),
    "颜色反应": ToolConfig(
        series="益智",
        subgroup="反应力",     # 子系列目录：series/益智/反应力/颜色反应/
        tool="颜色反应",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="颜色反应",
        modes=["offline", "online"],
        free_units=2,
        default_unit=0,
    ),
    # ---------------- 益智系列 · 语言子系列 ----------------
"看图说话排序": ToolConfig(
    series="益智",
    subgroup="语言",       # 子系列目录：series/益智/语言/看图说话排序/
    tool="看图说话排序",
    version="1.0",
    datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
    app_name="看图说话排序",
    modes=["offline", "online"],
    free_units=2,
    default_unit=0,
),
"反义词配对": ToolConfig(
        series="益智",
        subgroup="语言",       # 子系列目录：series/益智/语言/反义词配对/
        tool="反义词配对",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="反义词配对",
    modes=["offline", "online"],
    free_units=2,
        default_unit=0,
    ),
    "绕口令节奏": ToolConfig(
        series="益智",
        subgroup="语言",       # 子系列目录：series/益智/语言/绕口令节奏/
        tool="绕口令节奏",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="绕口令节奏",
        modes=["offline", "online"],
        free_units=2,
        default_unit=0,
    ),
    # ---------------- 经典游戏系列（情怀引流） ----------------
    "2048": ToolConfig(
        series="经典游戏",
        tool="2048",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="2048",
        shared_js=False,   # 经典游戏暂缓，index.html 不引用 lx-shared，禁止合并死文件
        default_unit=0,
    ),
    "俄罗斯方块": ToolConfig(
        series="经典游戏",
        tool="俄罗斯方块",
        version="1.1",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="俄罗斯方块",
        shared_js=False,   # 经典游戏暂缓，index.html 不引用 lx-shared，禁止合并死文件
        default_unit=0,
    ),
    "扫雷": ToolConfig(
        series="经典游戏",
        tool="扫雷",
        version="1.1",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="扫雷",
        shared_js=False,   # 经典游戏暂缓，index.html 不引用 lx-shared，禁止合并死文件
        default_unit=0,
    ),
    "贪吃蛇": ToolConfig(
        series="经典游戏",
        tool="贪吃蛇",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="贪吃蛇",
        shared_js=False,   # 经典游戏暂缓，index.html 不引用 lx-shared，禁止合并死文件
        default_unit=0,
    ),
    # ---------------- 扩展系列（生活常识/财商启蒙等补充款） ----------------
    "认识时间": ToolConfig(
        series="扩展",
        tool="认识时间",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="认识时间",
        modes=["offline", "online"],
        free_units=2,
        default_unit=0,
    ),
    "认识钱币": ToolConfig(
        series="扩展",
        tool="认识钱币",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="认识钱币",
        modes=["offline", "online"],
        free_units=2,
        default_unit=0,
    ),
    "涂色练习": ToolConfig(
        series="扩展",
        tool="涂色练习",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="涂色练习",
        modes=["offline", "online"],
        free_units=2,
        default_unit=0,
    ),
    "动物配对": ToolConfig(
        series="扩展",
        tool="动物配对",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/（含 elements.js 元素库）
        app_name="动物配对",
        modes=["offline", "online"],
        free_units=2,
        default_unit=0,
    ),
    "安全常识问答": ToolConfig(
        series="扩展",
        tool="安全常识问答",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="安全常识问答",
        modes=["offline", "online"],
        free_units=2,
        default_unit=0,
    ),
    "情绪识别": ToolConfig(
        series="扩展",
        tool="情绪识别",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="情绪识别",
        modes=["offline", "online"],
        free_units=2,
        default_unit=0,
    ),
    # 已登记工具清单（2026-09-21）：学科 9 款——英语点读/数学口算/24点/打字背单词/单词闪卡/乘法口诀练习/看图猜成语/成语接龙/成语配对（成语三件套全交付）；
    # 益智 26 款；经典游戏 2048/俄罗斯方块/扫雷/贪吃蛇（⏸ 暂缓）；扩展 认识时间/认识钱币/涂色练习/动物配对。
    # 新工具立项：建 series/<系列>/<工具>/src/ 后在此登记 ToolConfig（series/tool/version/book/素材目录/app_name）。
}
