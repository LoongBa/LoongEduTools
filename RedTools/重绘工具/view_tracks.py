#!/usr/bin/env python3
"""查看指定页面的 track 文本（含换行情况）"""
import json
import sys

BOOK = sys.argv[1] if len(sys.argv) > 1 else r"F:\LoongBa_Git\LoongEduTools\Downloader\Diandu\data\1212001401255_英语（PEP）_四年级_上册.json"
pages = [int(x) for x in sys.argv[2].split(",")] if len(sys.argv) > 2 else [15]

with open(BOOK, "r", encoding="utf-8") as f:
    data = json.load(f)

for p in data["bookpage"]:
    if p["page_no"] in pages:
        print(f"=== Page {p['page_no']} ===")
        for t in p.get("track_info", []):
            txt = t.get("track_text", "")
            has_nl = "\n" in txt
            print(f"  idx={t.get('track_index')} 多行={has_nl} len={len(txt)} dur={t.get('track_duration')}")
            if has_nl:
                for line in txt.split("\n"):
                    print(f"      | {line}")
            else:
                print(f"      | {txt[:80]}")
