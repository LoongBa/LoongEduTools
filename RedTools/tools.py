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
        version="1.1",
        book=ROOT.parent / "Downloader" / "Diandu" / "data" / "1212001401255_英语（PEP）_四年级_上册.json",
        img_dir=Path(r"F:\_教材素材\人教版（PEP）（主编：吴欣）\四年级\上册\_图片素材"),
        audio_dir=Path(r"F:\_教材素材\人教版（PEP）（主编：吴欣）\四年级\上册\_音频素材\单句音频"),
        app_name="新英语四上点读1单元",
        app_name_template="新英语四上点读{unit_no}单元",
        default_unit=0,
    ),
    "数学口算": ToolConfig(
        series="学科",
        tool="数学口算",
        version="1.0",
        datasource="static",   # 静态工具：无 book/图片/音频，仅复制 src/
        app_name="数学口算",
        default_unit=0,
    ),
    # TODO: 其他学科系列工具（单词闪卡等）待立项
}
