#!/usr/bin/env python3
"""生成每册独立质检 HTML，嵌入 qa_reviews.json 中的已有审核记录

用法:
  python gen_qa_reports.py                  # 全部 11 册
  python gen_qa_reports.py --book 四年级_上册   # 仅指定册（SSIM 计算较快）
"""
import argparse
import json
import sys
from pathlib import Path

# 可选：SSIM 预检指标（无 cv2 时自动降级，仅显示体积比）
try:
    import cv2
    import numpy as np
    from quality_check import compute_ssim
    HAVE_SSIM = True
except Exception:
    HAVE_SSIM = False

MAT = Path(r"F:\_教材素材\人教版（PEP）（主编：吴欣）")
DATA_DIR = Path(r"F:\LoongBa_Git\LoongEduTools\PEP词库\data\diandu")
OUT_DIR = Path(r"F:\LoongBa_Git\LoongEduTools\RedTools\重绘工具\qa_reports")
TEMPLATE = Path(r"F:\LoongBa_Git\LoongEduTools\RedTools\重绘工具\quality_review_template.html")
MAT = Path(r"F:\_教材素材\人教版（PEP）（主编：吴欣）")
# 审核记录已迁移为每册独立文件：_重绘图片素材/审核记录.json（平面 page→entry，无 book 嵌套）
# 兼容回退：旧全局 qa_reviews.json（嵌套 {book: {page: entry}}）
REVIEWS_GLOBAL = Path(r"F:\LoongBa_Git\LoongEduTools\RedTools\重绘工具\qa_reviews.json")


def load_reviews_for_book(grade: str, vol: str) -> dict:
    """读取指定册的审核记录（册级 审核记录.json 优先，全局 qa_reviews.json 回退）"""
    per_book = MAT / grade / vol / "_重绘图片素材" / "审核记录.json"
    if per_book.exists():
        return json.loads(per_book.read_text(encoding="utf-8"))
    if REVIEWS_GLOBAL.exists():
        allr = json.loads(REVIEWS_GLOBAL.read_text(encoding="utf-8"))
        return allr.get(f"{grade}_{vol}", {})
    return {}

BOOKS = [
    ("1212001101247","一年级","上册"), ("1212001102247","一年级","下册"),
    ("1212001201247","二年级","上册"), ("1212001202247","二年级","下册"),
    ("1212001301245","三年级","上册"), ("1212001302245","三年级","下册"),
    ("1212001401255","四年级","上册"), ("1212001402255","四年级","下册"),
    ("1212001501255","五年级","上册"), ("1212001502255","五年级","下册"),
    ("1212001601265","六年级","上册"),
]

def load_units(grade, vol):
    for bookid, g, v in BOOKS:
        if g == grade and v == vol:
            path = DATA_DIR / f"{bookid}_英语（PEP）_{g}_{v}.json"
            if not path.exists(): return []
            data = json.load(open(path, "r", encoding="utf-8"))
            ch = data.get("bookaudio_v3", [])
            total_pages = max(p["page_no"] for p in data.get("bookpage", []) if p.get("page_no"))
            units = []
            for i, c in enumerate(ch):
                start = c["page_no"]
                end = ch[i+1]["page_no"] if i+1 < len(ch) else total_pages + 1
                units.append({"idx": i+1, "label": c.get("title", f"U{i+1}"), "start": start, "end": end})
            return units
    return []

def read_img_gray(path: Path):
    """cv2.imread 不支持中文路径（Windows），用 np.fromfile + imdecode 代替"""
    try:
        data = np.fromfile(str(path), dtype=np.uint8)
        return cv2.imdecode(data, cv2.IMREAD_GRAYSCALE)
    except Exception:
        return None

def compute_ssim_quick(orig: Path, redr: Path):
    """快速 SSIM（缩到 256px 灰度后计算），供预检参考；失败返回 None"""
    if not HAVE_SSIM:
        return None
    try:
        ia = read_img_gray(orig)
        ib = read_img_gray(redr)
        if ia is None or ib is None:
            return None
        ia = cv2.resize(ia, (256, 256), interpolation=cv2.INTER_AREA)
        ib = cv2.resize(ib, (256, 256), interpolation=cv2.INTER_AREA)
        return round(compute_ssim(ia.astype(np.float64), ib.astype(np.float64)), 3)
    except Exception:
        return None

def check_page(grade, vol, page):
    orig = MAT / grade / vol / "_图片素材" / f"Page_{page:03d}.png"
    redr = MAT / grade / vol / "_重绘图片素材" / f"Page_{page:03d}.png"
    orig_kb = round(orig.stat().st_size/1024) if orig.exists() else 0
    redr_kb = round(redr.stat().st_size/1024) if redr.exists() else 0
    ratio = round(redr_kb / orig_kb, 2) if orig_kb > 0 else 0
    ssim = compute_ssim_quick(orig, redr) if (orig.exists() and redr.exists()) else None
    return {"page": page, "has_orig": orig.exists(), "has_redr": redr.exists(),
            "orig": str(orig).replace("\\","/") if orig.exists() else "",
            "redr": str(redr).replace("\\","/") if redr.exists() else "",
            "orig_kb": orig_kb, "redr_kb": redr_kb, "ratio": ratio, "ssim": ssim}

OUT_DIR.mkdir(exist_ok=True)
template = TEMPLATE.read_text(encoding="utf-8")

ap = argparse.ArgumentParser()
ap.add_argument("--book", help="仅生成指定册（如 四年级_上册），默认全部")
args = ap.parse_args()
book_filter = args.book
books = [b for b in BOOKS if (not book_filter or f"{b[1]}_{b[2]}" == book_filter)]
if not books:
    sys.exit(f"❌ 未知册: {book_filter}，可用: {[f'{b[1]}_{b[2]}' for b in BOOKS]}")
BOOKS = books

for bookid, grade, vol in BOOKS:
    units = load_units(grade, vol)
    if not units:
        print(f"⏭  {grade}{vol} — 无数据"); continue
    pages = []
    for u in units:
        for p in range(u["start"], u["end"]):
            pages.append(check_page(grade, vol, p))
    book_data = {f"{grade}_{vol}": {"grade": grade, "vol": vol, "units": units, "pages": pages}}
    key = f"{grade}_{vol}"
    reviews = load_reviews_for_book(grade, vol)
    html = template
    html = html.replace("PLACEHOLDER_DATA", json.dumps(book_data, ensure_ascii=False))
    html = html.replace("PLACEHOLDER_REVIEWS", json.dumps(reviews, ensure_ascii=False))
    html = html.replace("TITLE_PLACEHOLDER", f"{grade}{vol}")
    (OUT_DIR / f"{grade}_{vol}.html").write_text(html, encoding="utf-8")
    print(f"✅ {grade}_{vol}.html — {len(pages)}页 {len(units)}单元 {len(reviews)}条审核")

print(f"\n📁 {OUT_DIR}")
