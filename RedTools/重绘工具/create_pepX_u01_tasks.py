#!/usr/bin/env python3
"""批量创建 一年级/三年级/五年级/六年级 上册 Unit01 重绘任务"""
import json
import shutil
from pathlib import Path

ROOT = Path(r"F:\LoongBa_Git\LoongEduTools\RedTools\重绘工具\tasks")
PROMPT_SRC = ROOT / "pep4s_u01" / "prompts" / "cartoon_redraw_v2.txt"
MAT = Path(r"F:\_教材素材\人教版（PEP）（主编：吴欣）")

# 任务: (任务名, 年级, 起, 止[不含])
TASKS = [
    ("pep1s_u01", "一年级", 2, 10),
    ("pep3s_u01", "三年级", 2, 14),
    ("pep5s_u01", "五年级", 2, 14),
    ("pep6s_u01", "六年级", 2, 14),
]

for name, grade, start, end in TASKS:
    task_dir = ROOT / name
    (task_dir / "prompts").mkdir(parents=True, exist_ok=True)
    (task_dir / "input").mkdir(parents=True, exist_ok=True)
    shutil.copy2(PROMPT_SRC, task_dir / "prompts" / "cartoon_redraw_v2.txt")

    pages = list(range(start, end))
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
        "pages": pages,
    }
    with open(task_dir / "config.json", "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)

    img_src = MAT / grade / "上册" / "_图片素材"
    n = 0
    for p in pages:
        src = img_src / f"Page_{p:03d}.png"
        if src.exists():
            shutil.copy2(src, task_dir / "input" / src.name)
            n += 1
    print(f"✅ {name} ({grade}上册 U1): {n} 张输入图")

print("完成")
