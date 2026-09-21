#!/usr/bin/env python3
"""RedTools 批量构建入口：遍历工具注册表，全量构建所有单元。

用法:
    python build_all.py              # 构建所有工具（默认单元）
    python build_all.py --tool 英语点读
    python build_all.py --units 0,1,2   # 指定单元（逗号分隔）
    python build_all.py --pages 2-13    # 显式页码范围（覆盖单元推断）
    python build_all.py --tool 数学口算 --bump minor  # 升版后构建
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from build_framework import build_tool, log
from tools import TOOLS

TOOLS_PY = Path(__file__).resolve().parent / "tools.py"


def bump_version(current: str, level: str) -> str:
    """递增版本号。支持 X.Y 和 X.Y.Z 两种格式。"""
    parts = current.split(".")
    while len(parts) < 3:
        parts.append("0")
    major, minor, patch = int(parts[0]), int(parts[1]), int(parts[2])
    if level == "major":
        major += 1; minor = 0; patch = 0
    elif level == "minor":
        minor += 1; patch = 0
    elif level == "patch":
        patch += 1
    else:
        raise ValueError(f"未知升版级别: {level}")
    # 省略末尾的 .0（保持与现有风格一致：1.0 而非 1.0.0）
    if patch == 0:
        return f"{major}.{minor}"
    return f"{major}.{minor}.{patch}"


def apply_bump(tool_name: str, level: str) -> str:
    """修改 tools.py 中指定工具的 version 字段，返回新版本号。"""
    content = TOOLS_PY.read_text(encoding="utf-8")
    # 匹配工具块内的 version="X.Y" 或 version="X.Y.Z"
    # 策略：找到 tool_name 所在的 ToolConfig 块，替换其中的 version="..."
    pattern = re.compile(
        r'("工具名"\s*:\s*ToolConfig\(|'  # 不用这个，直接找 tool_name 后的 version
        r')', re.DOTALL
    )
    # 更稳健：按行扫描，找到 tool_name 所在块的 version 行
    lines = content.splitlines(keepends=True)
    in_block = False
    new_lines = []
    new_version = None
    for line in lines:
        if f'"{tool_name}"' in line and "ToolConfig(" in line:
            in_block = True
        if in_block and "version=" in line:
            old_ver = re.search(r'version="([^"]+)"', line)
            if old_ver:
                old = old_ver.group(1)
                new_version = bump_version(old, level)
                line = line.replace(f'version="{old}"', f'version="{new_version}"')
                in_block = False
        new_lines.append(line)
    if new_version is None:
        raise ValueError(f"未找到工具 {tool_name} 的 version 字段")
    TOOLS_PY.write_text("".join(new_lines), encoding="utf-8")
    return new_version


def main() -> int:
    parser = argparse.ArgumentParser(description="RedTools 批量构建")
    parser.add_argument("--tool", default=None, help="只构建指定工具（默认全部）")
    parser.add_argument("--units", default=None, help="逗号分隔单元下标（默认各工具 default_unit）")
    parser.add_argument("--pages", default=None, help="显式页码范围如 2-13")
    parser.add_argument("--list", action="store_true", help="列出已登记工具")
    parser.add_argument("--bump", choices=["patch", "minor", "major"], default=None,
                        help="升版后构建（需配合 --tool 使用）")
    parser.add_argument("--mode", default="offline", choices=["offline", "online"],
                        help="构建模式：offline（zip+发布）/ online（仅部署目录，默认 offline）")
    parser.add_argument("--strict", action="store_true",
                        help="严格校验：热区坐标异常 / 音频缺失 >0 时构建失败（collect-then-fail）")
    args = parser.parse_args()

    if args.list:
        for name, cfg in TOOLS.items():
            print(f"  [{cfg.series}] {name}  v{cfg.version}  默认单元 {cfg.default_unit}")
        return 0

    # 升版
    if args.bump:
        if not args.tool:
            print("ERROR: --bump 需配合 --tool 使用")
            return 2
        if args.tool not in TOOLS:
            print(f"ERROR: 未知工具 {args.tool}，可用: {list(TOOLS)}")
            return 2
        new_ver = apply_bump(args.tool, args.bump)
        log(f"版本升级: {TOOLS[args.tool].version} → {new_ver}（{args.bump}）")
        # 刷新 TOOLS 字典（重新导入太重，直接改属性）
        TOOLS[args.tool].version = new_ver

    units: list[int] | None = None
    if args.units:
        units = [int(x) for x in args.units.split(",") if x.strip()]

    tools = {args.tool: TOOLS[args.tool]} if args.tool else TOOLS
    if args.tool and args.tool not in TOOLS:
        print(f"ERROR: 未知工具 {args.tool}，可用: {list(TOOLS)}")
        return 2

    built = 0
    failed = 0
    skipped = 0
    for name, cfg in tools.items():
        # V0.4 P5：modes 守卫——工具未登记目标模式则跳过（如经典游戏 offline-only 不被 --mode online 构建）
        modes = getattr(cfg, "modes", None) or ["offline"]
        if args.mode not in modes:
            log(f"[{cfg.series}/{name}] 跳过 {args.mode}（未登记模式 {modes}）")
            skipped += 1
            continue
        unit_list = units if units else [cfg.default_unit]
        for u in unit_list:
            try:
                zip_path = build_tool(cfg, u, args.pages, mode=args.mode, strict=args.strict)
                if zip_path:
                    built += 1
            except SystemExit as e:
                print(f"ERROR: [{cfg.series}/{name}] unit {u}: {e}")
                failed += 1
            except Exception as e:  # noqa: BLE001
                print(f"ERROR: [{cfg.series}/{name}] unit {u}: {e!r}")
                failed += 1

    log(f"批量构建完成: 成功 {built}，失败 {failed}，跳过 {skipped}（未登记模式）")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
