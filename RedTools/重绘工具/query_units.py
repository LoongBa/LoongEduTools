#!/usr/bin/env python3
"""查询各册前几单元页码"""
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
    pages = [c.get("page_no") for c in ch]
    print(f"{grade}{vol}: 共{len(ch)}单元 页码序列: {pages}")
