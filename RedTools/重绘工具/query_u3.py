#!/usr/bin/env python3
"""查询各册 U3 页码范围"""
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
    path = f"F:/LoongBa_Git/LoongEduTools/Downloader/Diandu/data/{bookid}_英语（PEP）_{grade}_{vol}.json"
    data = json.load(open(path, "r", encoding="utf-8"))
    ch = data.get("bookaudio_v3", [])
    if len(ch) >= 4:
        u3_start = ch[2]["page_no"]
        u4_start = ch[3]["page_no"]
        print(f"{grade}{vol}: U3={u3_start}-{u4_start-1} ({u4_start-u3_start}页)")
