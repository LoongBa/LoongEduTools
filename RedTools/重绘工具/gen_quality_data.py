#!/usr/bin/env python3
"""生成增强版质检 HTML 报告"""
import json
from pathlib import Path

MAT = Path(r"F:\_教材素材\人教版（PEP）（主编：吴欣）")
OUT = Path(r"F:\LoongBa_Git\LoongEduTools\RedTools\重绘工具\quality_review.html")

# 单元页码范围 book.json 解析
BOOKS = [
    ("1212001101247","一年级","上册"), ("1212001102247","一年级","下册"),
    ("1212001201247","二年级","上册"), ("1212001202247","二年级","下册"),
    ("1212001301245","三年级","上册"), ("1212001302245","三年级","下册"),
    ("1212001401255","四年级","上册"), ("1212001402255","四年级","下册"),
    ("1212001501255","五年级","上册"), ("1212001502255","五年级","下册"),
    ("1212001601265","六年级","上册"),
]

DATA_DIR = Path(r"F:\LoongBa_Git\LoongEduTools\Downloader\Diandu\data")

def load_units(grade, vol):
    """从 book.json 加载单元结构"""
    for bookid, g, v in BOOKS:
        if g == grade and v == vol:
            path = DATA_DIR / f"{bookid}_英语（PEP）_{g}_{v}.json"
            if not path.exists():
                return []
            data = json.load(open(path, "r", encoding="utf-8"))
            ch = data.get("bookaudio_v3", [])
            total_pages = max(p["page_no"] for p in data.get("bookpage", []) if p.get("page_no"))
            units = []
            for i, c in enumerate(ch):
                start = c["page_no"]
                end = ch[i+1]["page_no"] if i+1 < len(ch) else total_pages + 1
                label = c.get("title", f"U{i+1}")
                # 简化标题：取中文部分
                cn = c.get("track_genre", label)
                units.append({"idx": i+1, "label": label, "cn": cn, "start": start, "end": end})
            return units
    return []

def check_page(grade, vol, page):
    orig = MAT / grade / vol / "_图片素材" / f"Page_{page:03d}.png"
    redr = MAT / grade / vol / "_重绘图片素材" / f"Page_{page:03d}.png"
    orig_size = orig.stat().st_size if orig.exists() else 0
    redr_size = redr.stat().st_size if redr.exists() else 0
    ratio = redr_size / orig_size if orig_size > 0 else 0
    return {
        "page": page,
        "has_orig": orig.exists(),
        "has_redr": redr.exists(),
        "orig": str(orig).replace("\\","/") if orig.exists() else "",
        "redr": str(redr).replace("\\","/") if redr.exists() else "",
        "orig_kb": round(orig_size/1024),
        "redr_kb": round(redr_size/1024),
        "ratio": round(ratio, 2),
    }

# 收集所有数据
all_data = {}
for bookid, grade, vol in BOOKS:
    key = f"{grade}_{vol}"
    units = load_units(grade, vol)
    if not units:
        continue
    pages = []
    for u in units:
        for p in range(u["start"], u["end"]):
            pages.append(check_page(grade, vol, p))
    all_data[key] = {"grade": grade, "vol": vol, "units": units, "pages": pages}

# 写 JSON 数据供 HTML 使用
json_path = Path(r"F:\LoongBa_Git\LoongEduTools\RedTools\重绘工具\quality_data.json")
with open(json_path, "w", encoding="utf-8") as f:
    json.dump(all_data, f, ensure_ascii=False, indent=2)
print(f"✅ 数据已生成: {json_path}")
print(f"   共 {sum(len(d['pages']) for d in all_data.values())} 页")
