#!/usr/bin/env python3
"""从 书数据.json（或原始 book.json）提取单元 track 文本清单，供 TTS 批量合成。

用法:
  python extract_tts_text.py --book 四年级_上册 --unit 0      # 提取指定册指定单元
  python extract_tts_text.py --book 四年级_上册 --unit 0 --out C:/tmp/u1.json

输出 JSON:
  {
    "book": "四年级_上册", "unit_index": 0, "unit_title": "Unit 1 Helping at home",
    "page_start": 2, "page_end": 14,
    "tracks": [
      {"page_no": 2, "track_index": 1, "text": "Unit 1 Helping at home",
       "duration": 4.41, "filename": "P002_01.mp3"}
    ]
  }

命名规则与 build_framework.find_source_audio 对齐：P{页:03d}_{序号:02d}.mp3
（原始素材文件名含 clean_name(track_text) 后缀，但构建时用通配符匹配，后缀不影响）
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

MAT = Path(r"F:\_教材素材\人教版（PEP）（主编：吴欣）")
DATA_DIR = Path(r"F:\LoongBa_Git\LoongEduTools\PEP词库\data\diandu")

# 与 hotzone_serve.BOOKS 一致
BOOKS = [
    ("一年级_上册", "1212001101247", "一年级", "上册"),
    ("一年级_下册", "1212001102247", "一年级", "下册"),
    ("二年级_上册", "1212001201247", "二年级", "上册"),
    ("二年级_下册", "1212001202247", "二年级", "下册"),
    ("三年级_上册", "1212001301245", "三年级", "上册"),
    ("三年级_下册", "1212001302245", "三年级", "下册"),
    ("四年级_上册", "1212001401255", "四年级", "上册"),
    ("四年级_下册", "1212001402255", "四年级", "下册"),
    ("五年级_上册", "1212001501255", "五年级", "上册"),
    ("五年级_下册", "1212001502255", "五年级", "下册"),
    ("六年级_上册", "1212001601265", "六年级", "上册"),
]


def find_book(book_key: str):
    for k, bid, grade, vol in BOOKS:
        if k == book_key:
            return bid, grade, vol
    sys.exit(f"❌ 未知册次: {book_key}")


def load_book(book_key: str) -> dict:
    """优先读重绘目录 书数据.json 副本，否则回退原始"""
    bid, grade, vol = find_book(book_key)
    for cand in (MAT / grade / vol / "_重绘图片素材" / "书数据.json",
                 MAT / grade / vol / "_重绘图片素材" / "book.json",
                 DATA_DIR / f"{bid}_英语（PEP）_{grade}_{vol}.json"):
        if cand.exists():
            return json.loads(cand.read_text(encoding="utf-8-sig"))
    sys.exit(f"❌ {book_key}: 未找到 书数据.json")


def resolve_unit_range(book: dict, unit_index: int) -> tuple[int, int]:
    """与 build_framework.resolve_unit_pages 一致：start..end（end 独占）"""
    chapters = book.get("bookaudio_v3", [])
    if unit_index >= len(chapters):
        sys.exit(f"❌ 单元下标越界: {unit_index}（共 {len(chapters)} 单元）")
    start = int(chapters[unit_index].get("page_no", 0))
    total = len(book.get("bookpage", []))
    end = total + 1
    if unit_index + 1 < len(chapters) and chapters[unit_index + 1].get("page_no"):
        end = int(chapters[unit_index + 1].get("page_no"))
    return start, end


def main() -> None:
    ap = argparse.ArgumentParser(description="提取单元 track 文本 → TTS 批量合成清单")
    ap.add_argument("--book", required=True, help="册次，如 四年级_上册")
    ap.add_argument("--unit", type=int, default=0, help="单元下标（0 起）")
    ap.add_argument("--out", help="输出 JSON 路径（默认打印计数）")
    args = ap.parse_args()

    book = load_book(args.book)
    chapters = book.get("bookaudio_v3", [])
    if args.unit >= len(chapters):
        sys.exit(f"❌ 单元下标越界: {args.unit}（共 {len(chapters)} 单元）")
    start, end = resolve_unit_range(book, args.unit)
    title = chapters[args.unit].get("title", f"Unit {args.unit + 1}")

    tracks = []
    for p in book.get("bookpage", []):
        pno = p.get("page_no")
        if not (start <= pno < end):
            continue
        for t in p.get("track_info") or []:
            ti = int(t.get("track_index", 0))
            txt = (t.get("track_text") or "").strip()
            if not txt:
                continue
            tracks.append({
                "page_no": pno,
                "track_index": ti,
                "text": txt,
                "duration": round(float(t.get("track_duration", 0)) or 0, 2),
                "filename": f"P{pno:03d}_{ti:02d}.mp3",
            })

    data = {
        "book": args.book, "unit_index": args.unit, "unit_title": title,
        "page_start": start, "page_end": end,
        "tracks": tracks,
    }
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"✅ {title}: {len(tracks)} 条 track → {args.out}")
    else:
        print(f"{title}: {len(tracks)} 条 track（页 {start}..{end-1}）")
        for t in tracks[:5]:
            print(f"  {t['filename']}: {t['text'][:60]}")
        if len(tracks) > 5:
            print(f"  … 共 {len(tracks)} 条")


if __name__ == "__main__":
    main()