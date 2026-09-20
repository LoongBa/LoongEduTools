#!/usr/bin/env python3
"""批量创建剩余单元（U7及以后）重绘任务"""
import json
import shutil
from pathlib import Path

ROOT = Path(r"F:\LoongBa_Git\LoongEduTools\RedTools\重绘工具\tasks")
PROMPT_SRC = ROOT / "pep4s_u01" / "prompts" / "cartoon_redraw_v2.txt"
MAT = Path(r"F:\_教材素材\人教版（PEP）（主编：吴欣）")

# 剩余单元：(任务名, 年级, 册, 起, 止[不含])
TASKS = [
    # 一年级上册 U7-U10
    ("pep1s_u07", "一年级", "上册", 48, 50),
    ("pep1s_u08", "一年级", "上册", 50, 51),
    ("pep1s_u09", "一年级", "上册", 51, 52),
    ("pep1s_u10", "一年级", "上册", 52, 54),
    # 二年级上册 U7-U10
    ("pep2s_u07", "二年级", "上册", 48, 50),
    ("pep2s_u08", "二年级", "上册", 50, 51),
    ("pep2s_u09", "二年级", "上册", 51, 52),
    ("pep2s_u10", "二年级", "上册", 52, 53),
    # 三年级上册 U7-U13
    ("pep3s_u07", "三年级", "上册", 74, 78),
    ("pep3s_u08", "三年级", "上册", 78, 80),
    ("pep3s_u09", "三年级", "上册", 80, 83),
    ("pep3s_u10", "三年级", "上册", 83, 86),
    ("pep3s_u11", "三年级", "上册", 86, 89),
    ("pep3s_u12", "三年级", "上册", 89, 91),
    ("pep3s_u13", "三年级", "上册", 91, 92),
    # 四年级下册 U7-U12
    ("pep4x_u07", "四年级", "下册", 74, 78),
    ("pep4x_u08", "四年级", "下册", 78, 80),
    ("pep4x_u09", "四年级", "下册", 80, 83),
    ("pep4x_u10", "四年级", "下册", 83, 86),
    ("pep4x_u11", "四年级", "下册", 86, 88),
    ("pep4x_u12", "四年级", "下册", 88, 90),
    # 五年级上册 U7-U11
    ("pep5s_u07", "五年级", "上册", 74, 78),
    ("pep5s_u08", "五年级", "上册", 78, 80),
    ("pep5s_u09", "五年级", "上册", 80, 83),
    ("pep5s_u10", "五年级", "上册", 83, 87),
    ("pep5s_u11", "五年级", "上册", 87, 89),
    # 六年级上册 U7-U12
    ("pep6s_u07", "六年级", "上册", 74, 78),
    ("pep6s_u08", "六年级", "上册", 78, 81),
    ("pep6s_u09", "六年级", "上册", 81, 85),
    ("pep6s_u10", "六年级", "上册", 85, 89),
    ("pep6s_u11", "六年级", "上册", 89, 92),
    ("pep6s_u12", "六年级", "上册", 92, 93),
]

for name, grade, vol, start, end in TASKS:
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

    img_src = MAT / grade / vol / "_图片素材"
    n = 0
    for p in pages:
        src = img_src / f"Page_{p:03d}.png"
        if src.exists():
            shutil.copy2(src, task_dir / "input" / src.name)
            n += 1
    print(f"✅ {name} ({grade}{vol}): {n} 张")

print(f"\n完成：共 {len(TASKS)} 个任务")
