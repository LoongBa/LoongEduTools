#!/usr/bin/env python3
"""查询各册 U5 页码范围"""
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
    if len(ch) >= 6:
        u5_start = ch[4]["page_no"]
        u6_start = ch[5]["page_no"]
        print(f"{grade}{vol}: U5={u5_start}-{u6_start-1} ({u6_start-u5_start}页)")
