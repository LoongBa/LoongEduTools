#!/usr/bin/env python3
"""查看指定页码范围的信息"""
import json
import sys

BOOK = r"F:\LoongBa_Git\LoongEduTools\PEP词库\data\diandu\1212001401255_英语（PEP）_四年级_上册.json"

with open(BOOK, "r", encoding="utf-8") as f:
    data = json.load(f)

start = int(sys.argv[1]) if len(sys.argv) > 1 else 2
end = int(sys.argv[2]) if len(sys.argv) > 2 else start

for p in data["bookpage"]:
    if start <= p["page_no"] <= end:
        genres = [t.get("track_genre", "")[:25] for t in p.get("track_info", [])[:2]]
        print(f"Page {p['page_no']}: {genres}")
