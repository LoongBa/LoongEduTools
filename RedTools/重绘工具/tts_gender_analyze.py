#!/usr/bin/env python3
"""英语点读 — TTS 性别分析（薄适配层，委托 LoongMediaTools 通用 F0 分析）

保留点读特有的"按册/单元遍历、输出 P{页}_{序号}_*.mp3 映射"逻辑，
F0 基频检测（librosa pyin/yin、短音频降门槛、极值截断处理）统一走：
    LoongMediaTools/音频批量生成工具/tts_gender_analyze.py

用法（与原版一致）:
  python tts_gender_analyze.py --book 四年级_上册             # 分析整册
  python tts_gender_analyze.py --book 四年级_上册 --unit 0     # 仅单元
  python tts_gender_analyze.py --book 四年级_上册 --out gender.json

输出 JSON:
  {"U0": {"P002_01": "female", "P003_05": "male", ...}, ...}
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, r"F:\LoongBa_Git\LoongMediaTools")   # 使 `from 音频批量生成工具 import ...` 可用
from 音频批量生成工具 import tts_gender_analyze as _ga  # 通用 F0 分析（f0_median/classify）

MAT = Path(r"F:\_教材素材\人教版（PEP）（主编：吴欣）")
DATA_DIR = Path(r"F:\LoongBa_Git\LoongEduTools\PEP词库\data\diandu")
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


def analyze_book(book_key: str, unit_filter: int | None = None) -> dict:
    """按册/单元遍历原始音频目录 → {U{n}: {P{页}_{序}: gender}}"""
    bid, grade, vol = find_book(book_key)
    audio_dir = MAT / grade / vol / "_音频素材" / "单句音频"
    if not audio_dir.exists():
        sys.exit(f"❌ 音频目录不存在: {audio_dir}")
    book = None
    for cand in (MAT / grade / vol / "_重绘图片素材" / "书数据.json",
                 DATA_DIR / f"{bid}_英语（PEP）_{grade}_{vol}.json"):
        if cand.exists():
            book = json.loads(cand.read_text(encoding="utf-8-sig"))
            break
    if not book:
        sys.exit(f"❌ {book_key}: 未找到 书数据.json")

    chapters = book.get("bookaudio_v3", [])
    result: dict[str, dict[str, str]] = {}
    for ui, ch in enumerate(chapters):
        if unit_filter is not None and ui != unit_filter:
            continue
        start = int(ch.get("page_no", 0))
        end = len(book.get("bookpage", [])) + 1
        if ui + 1 < len(chapters) and chapters[ui + 1].get("page_no"):
            end = int(chapters[ui + 1].get("page_no"))
        key = f"U{ui}"
        result[key] = {}
        for p in book.get("bookpage", []):
            pno = p.get("page_no")
            if not (start <= pno < end):
                continue
            for t in p.get("track_info") or []:
                ti = int(t.get("track_index", 0))
                hits = sorted(audio_dir.glob(f"P{pno:03d}_{ti:02d}_*.mp3"))
                if not hits:
                    continue
                med, _ = _ga.f0_median(hits[0])
                result[key][f"P{pno:03d}_{ti:02d}"] = _ga.classify(med)
    return result


def main() -> None:
    ap = argparse.ArgumentParser(description="英语点读 F0 性别分析（委托通用工具）")
    ap.add_argument("--book", required=True, help="册次，如 四年级_上册")
    ap.add_argument("--unit", type=int, help="仅分析指定单元")
    ap.add_argument("--out", type=Path, help="输出 JSON 路径")
    args = ap.parse_args()

    print(f"🔬 {args.book} F0 分析中…")
    result = analyze_book(args.book, args.unit)
    total = sum(len(v) for v in result.values())
    cnt: dict[str, int] = {}
    for u in result.values():
        for g in u.values():
            cnt[g] = cnt.get(g, 0) + 1
    print(f"共分析 {total} 条：男 {cnt.get('male',0)} / 女 {cnt.get('female',0)} / "
          f"不确定 {cnt.get('uncertain',0)}")

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"✅ 已保存: {args.out}")
    else:
        print(json.dumps(result, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()