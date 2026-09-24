#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""pack_data.py — data 型内容包入口（D04 §3.1 / §4.2）

等价于 `pack_content.py --type data`：JSON/词库/素材目录 → data/data/** 加密包。
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from pack_content import build_package_from_ns, make_parser  # noqa: E402


def main() -> None:
    ap = make_parser(default_type="data")
    ap.description = "data 型内容包打包（词卡/代课/复习 · D04 §4.2）"
    args = ap.parse_args()
    build_package_from_ns(args)


if __name__ == "__main__":
    main()
