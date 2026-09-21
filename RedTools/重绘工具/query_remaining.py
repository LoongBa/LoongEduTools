#!/usr/bin/env python3
"""查询各册剩余单元（U7及以后）"""
import json

BOOKS = [
    ("1212001101247", "一年级", "上册"),
    ("1212001201247", "二年级", "上册"),
    ("1212001301245", "三年级", "上册"),
    ("1212001402255", "四年级", "下册"),
    ("1212001501255", "五年级", "上册"),
    ("1212001601265", "六年级", "上册"),
]

for bookid, grade, vol in BOOKS:
    path = f"F:/LoongBa_Git/LoongEduTools/PEP词库/data/diandu/{bookid}_英语（PEP）_{grade}_{vol}.json"
    data = json.load(open(path, "r", encoding="utf-8"))
    ch = data.get("bookaudio_v3", [])
    print(f"\n{grade}{vol}: 共{len(ch)}单元")
    for i in range(6, len(ch)):
        start = ch[i]["page_no"]
        if i+1 < len(ch):
            end = ch[i+1]["page_no"]
        else:
            end = max(p["page_no"] for p in data["bookpage"] if p.get("page_no")) + 1
        print(f"  U{i+1}: Page {start}-{end-1} ({end-start}页)")
