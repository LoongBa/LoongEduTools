#!/usr/bin/env python3
"""批量创建 PEP 四年级下册重绘任务（6 单元 + 复习 + 附录）"""
import json
import shutil
from pathlib import Path

ROOT = Path(r"F:\LoongBa_Git\LoongEduTools\RedTools\重绘工具\tasks")
PROMPT_SRC = ROOT / "pep4s_u01" / "prompts" / "cartoon_redraw_v2.txt"
IMG_SRC = Path(r"F:\_教材素材\人教版（PEP）（主编：吴欣）\四年级\下册\_图片素材")

# 任务定义: (任务名, 页码范围)
TASKS = [
    ("pep4x_u01", range(2, 14)),     # 002-013
    ("pep4x_u02", range(14, 26)),    # 014-025
    ("pep4x_u03", range(26, 38)),    # 026-037
    ("pep4x_u04", range(38, 50)),    # 038-049
    ("pep4x_u05", range(50, 62)),    # 050-061
    ("pep4x_u06", range(62, 74)),    # 062-073
    ("pep4x_rev", range(74, 78)),    # 074-077
    ("pep4x_app", range(78, 90)),    # 078-089
]

for name, pages in TASKS:
    task_dir = ROOT / name
    (task_dir / "prompts").mkdir(parents=True, exist_ok=True)
    (task_dir / "input").mkdir(parents=True, exist_ok=True)
    shutil.copy2(PROMPT_SRC, task_dir / "prompts" / "cartoon_redraw_v2.txt")

    cfg = {
        "model": "sensenova-u1.5-lite",
        "api_base": "https://token.sensenova.cn/v1",
        "size": "auto",
        "watermark": False,
        "prompt_extend": True,
        "response_format": "url",
        "prompt_file": "prompts/cartoon_redraw_v2.txt",
        "input_dir": "input",
        "output_dir": "output",
        "pages": list(pages),
    }
    with open(task_dir / "config.json", "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)

    # 复制输入图
    for n in pages:
        src = IMG_SRC / f"Page_{n:03d}.png"
        if src.exists():
            shutil.copy2(src, task_dir / "input" / src.name)

    n_imgs = len(list((task_dir / "input").glob("*.png")))
    print(f"✅ {name}: {n_imgs} 张输入图 ({pages[0]:03d}-{pages[-1]:03d})")

print("完成")
