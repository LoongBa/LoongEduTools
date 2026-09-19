#!/usr/bin/env python3
"""按 track_genre 中的"第X单元"识别每页归属单元，输出单元页码范围"""
import json
import re
import sys

BOOK = sys.argv[1] if len(sys.argv) > 1 else r"F:\LoongBa_Git\LoongEduTools\Downloader\Diandu\data\1212001402255_英语（PEP）_四年级_下册.json"

with open(BOOK, "r", encoding="utf-8") as f:
    data = json.load(f)

# 收集每页的 genre
page_genres = {}
for p in data["bookpage"]:
    page_no = p["page_no"]
    genres = [t.get("track_genre", "") for t in p.get("track_info", []) if t.get("track_genre")]
    page_genres[page_no] = genres

# 按页码排序输出每页首 genre
pages = sorted(page_genres.keys())
print(f"总页数: {len(pages)}  (from {pages[0]} to {pages[-1]})")
for page_no in pages:
    first = page_genres[page_no][0] if page_genres[page_no] else "(无)"
    print(f"Page {page_no:03d}: {first[:40]}")
