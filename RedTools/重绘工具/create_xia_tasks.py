#!/usr/bin/env python3
"""为下册创建重绘任务"""
import json, shutil
from pathlib import Path

MAT = Path(r"F:\_教材素材\人教版（PEP）（主编：吴欣）")
DATA_DIR = Path(r"F:\LoongBa_Git\LoongEduTools\PEP词库\data\diandu")
TASKS_DIR = Path(r"F:\LoongBa_Git\LoongEduTools\RedTools\重绘工具\tasks")
PROMPT = "prompts/cartoon_redraw_v2.txt"

BOOKS = [
    ("1212001102247","一年级","下册","1x"),
    ("1212001202247","二年级","下册","2x"),
    ("1212001302245","三年级","下册","3x"),
    ("1212001502255","五年级","下册","5x"),
]

for bookid, grade, vol, prefix in BOOKS:
    path = DATA_DIR / f"{bookid}_英语（PEP）_{grade}_{vol}.json"
    data = json.load(open(path, "r", encoding="utf-8"))
    ch = data.get("bookaudio_v3", [])
    total_pages = max(p["page_no"] for p in data.get("bookpage", []) if p.get("page_no"))
    
    # Check existing
    redr_dir = MAT / grade / vol / "_重绘图片素材"
    redrawn = set()
    if redr_dir.exists():
        for f in redr_dir.glob("Page_*.png"):
            m = f.stem.replace("Page_","")
            if m.isdigit(): redrawn.add(int(m))
    
    for i, c in enumerate(ch):
        start = c["page_no"]
        end = ch[i+1]["page_no"] if i+1 < len(ch) else total_pages + 1
        unit_name = c.get("title", f"U{i+1}")
        unit_num = i + 1
        task_name = f"pep{prefix}_u{unit_num:02d}"
        
        # Check what pages need redraw
        missing = [p for p in range(start, end) if p not in redrawn]
        if not missing:
            continue
        
        # Create task dir
        task_dir = TASKS_DIR / task_name
        prompts_dir = task_dir / "prompts"
        input_dir = task_dir / "input"
        output_dir = task_dir / "output"
        
        if task_dir.exists():
            print(f"⏭  {task_name} 已存在"); continue
        
        prompts_dir.mkdir(parents=True, exist_ok=True)
        input_dir.mkdir(parents=True, exist_ok=True)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Copy prompt
        shutil.copy2(Path(r"F:\LoongBa_Git\LoongEduTools\RedTools\重绘工具\tasks\pep4s_u01\prompts\cartoon_redraw_v2.txt"), prompts_dir / "cartoon_redraw_v2.txt")
        
        # Copy input images
        src_dir = MAT / grade / vol / "_图片素材"
        for p in missing:
            src = src_dir / f"Page_{p:03d}.png"
            if src.exists():
                shutil.copy2(src, input_dir / f"Page_{p:03d}.png")
        
        # Config
        config = {
            "model": "sensenova-u1.5-lite",
            "api_base": "https://token.sensenova.cn/v1",
            "size": "auto",
            "watermark": False,
            "prompt_extend": True,
            "response_format": "url",
            "prompt_file": "prompts/cartoon_redraw_v2.txt",
            "input_dir": "input",
            "output_dir": "output",
            "pages": missing,
        }
        (task_dir / "config.json").write_text(json.dumps(config, indent=2), encoding="utf-8")
        print(f"✅ {task_name} — {unit_name} — {len(missing)} 页")

print("\n完成！")
