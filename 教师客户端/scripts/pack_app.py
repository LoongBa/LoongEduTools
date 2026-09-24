#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""pack_app.py — app 型内容包入口（D04 §3.1 / §4.1）

等价于 `pack_content.py --type app`：HTML/JS/资源目录 → data/app/** 加密包。
"""
from __future__ import annotations

import sys
from pathlib import Path

# 保证可 import 同目录模块
sys.path.insert(0, str(Path(__file__).parent))

from pack_content import build_package_from_ns, make_parser  # noqa: E402


def main() -> None:
    ap = make_parser(default_type="app")
    ap.description = "app 型内容包打包（教材点读 / RedTools 工具 · D04 §4.1）"
    args = ap.parse_args()
    build_package_from_ns(args)


if __name__ == "__main__":
    main()
