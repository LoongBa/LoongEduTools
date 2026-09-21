#!/usr/bin/env python3
"""查询各册 U6 页码范围"""
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
    if len(ch) >= 7:
        u6_start = ch[5]["page_no"]
        u7_start = ch[6]["page_no"]
        print(f"{grade}{vol}: U6={u6_start}-{u7_start-1} ({u7_start-u6_start}页)")
    else:
        print(f"{grade}{vol}: U6 不存在")
