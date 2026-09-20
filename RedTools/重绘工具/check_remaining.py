#!/usr/bin/env python3
import json
from pathlib import Path

MAT = Path(r"F:\_教材素材\人教版（PEP）（主编：吴欣）")
DATA_DIR = Path(r"F:\LoongBa_Git\LoongEduTools\Downloader\Diandu\data")

BOOKS = [
    ("1212001102247","一年级","下册"),
    ("1212001202247","二年级","下册"),
    ("1212001302245","三年级","下册"),
    ("1212001502255","五年级","下册"),
]

for bookid, grade, vol in BOOKS:
    path = DATA_DIR / f"{bookid}_英语（PEP）_{grade}_{vol}.json"
    data = json.load(open(path, "r", encoding="utf-8"))
    ch = data.get("bookaudio_v3", [])
    total_pages = max(p["page_no"] for p in data.get("bookpage", []) if p.get("page_no"))
    units = []
    for i, c in enumerate(ch):
        start = c["page_no"]
        end = ch[i+1]["page_no"] if i+1 < len(ch) else total_pages + 1
        units.append((c.get("title", f"U{i+1}"), start, end))
    redrawn = set()
    redr_dir = MAT / grade / vol / "_重绘图片素材"
    if redr_dir.exists():
        for f in redr_dir.glob("Page_*.png"):
            m = f.stem.replace("Page_","")
            if m.isdigit(): redrawn.add(int(m))
    missing = [p for p in range(2, total_pages+1) if p not in redrawn]
    print(f"\n{grade}{vol}: {len(redrawn)}/{total_pages} 已重绘, {len(missing)} 待重绘")
    for name, start, end in units:
        unit_missing = [p for p in range(start, end) if p in missing]
        if unit_missing:
            print(f"  {name}: {unit_missing}")
