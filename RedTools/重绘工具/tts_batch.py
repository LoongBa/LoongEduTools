#!/usr/bin/env python3
"""英语点读 — TTS 批量合成（薄适配层，委托 LoongMediaTools 通用音频批量生成工具）

本文件只保留点读特有逻辑（从 book.json 提取单元 track、F0 性别路由、原始文件名复用、
_重读音频素材 输出目录），实际合成全部走通用工具：
    LoongMediaTools/音频批量生成工具/（tts_batch.py，Edge TTS / Kokoro 双引擎）

用法（与原版一致）:
  python tts_batch.py --book 四年级_上册 --unit 1                     # 单单元
  python tts_batch.py --book 四年级_上册 --units 0,1,2                # 多单元
  python tts_batch.py --book 四年级_上册 --all-units                  # 全册
  python tts_batch.py --book 四年级_上册 --unit 1 --grade 12          # 低年级（1-2年级）慢速
  python tts_batch.py --book 四年级_上册 --gender C:/tmp/gender.json  # 指定性别分析文件
  python tts_batch.py --book 四年级_上册 --engine kokoro              # 换引擎（默认 edge）

特性: 断点续传 / 失败重试 / 句间节流 / 输出复用原始文件名（构建零改动）。
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

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

ENGINE = "edge"                       # 默认引擎（edge 微软神经 / kokoro 开源离线）
VOICE_F = "en-GB-SoniaNeural"         # 女声
VOICE_M = "en-GB-RyanNeural"          # 男声
RATE_NORMAL = "-15%"
RATE_SLOW = "-20%"
REVIEW_DIR_NAME = "_重读音频素材"      # 输出目录（与原版 _音频素材 并存）

sys.path.insert(0, r"F:\LoongBa_Git\LoongMediaTools")  # 使 `from 音频批量生成工具 import ...` 可用


def find_book(book_key: str):
    for k, bid, grade, vol in BOOKS:
        if k == book_key:
            return bid, grade, vol
    sys.exit(f"❌ 未知册次: {book_key}")


def load_book(book_key: str) -> dict:
    bid, grade, vol = find_book(book_key)
    for cand in (MAT / grade / vol / "_重绘图片素材" / "书数据.json",
                 MAT / grade / vol / "_重绘图片素材" / "book.json",
                 DATA_DIR / f"{bid}_英语（PEP）_{grade}_{vol}.json"):
        if cand.exists():
            return json.loads(cand.read_text(encoding="utf-8-sig"))
    sys.exit(f"❌ {book_key}: 未找到 书数据.json")


def unit_range(book: dict, unit_index: int) -> tuple[int, int]:
    ch = book.get("bookaudio_v3", [])
    if unit_index >= len(ch):
        sys.exit(f"❌ 单元下标越界: {unit_index}（共 {len(ch)} 单元）")
    start = int(ch[unit_index].get("page_no", 0))
    end = len(book.get("bookpage", [])) + 1
    if unit_index + 1 < len(ch) and ch[unit_index + 1].get("page_no"):
        end = int(ch[unit_index + 1].get("page_no"))
    return start, end


def build_items(book_key: str, units: list[int], gender_data: dict) -> list[dict]:
    """点读 track 清单 → 通用工具 [{text, name}]，含性别路由与原始文件名"""
    bid, grade, vol = find_book(book_key)
    book = load_book(book_key)
    orig_audio_dir = MAT / grade / vol / "_音频素材" / "单句音频"
    items = []
    for ui in units:
        s, e = unit_range(book, ui)
        g_unit = (gender_data.get(f"U{ui}") or {}) if gender_data else {}
        for p in book.get("bookpage", []):
            pno = p.get("page_no")
            if not (s <= pno < e):
                continue
            for t in p.get("track_info") or []:
                ti = int(t.get("track_index", 0))
                txt = (t.get("track_text") or "").strip()
                if not txt:
                    continue
                hits = sorted(orig_audio_dir.glob(f"P{pno:03d}_{ti:02d}_*.mp3"))
                if not hits:
                    continue
                gender = g_unit.get(f"P{pno:03d}_{ti:02d}")
                name = hits[0].stem  # 复用原始文件名（去扩展名）→ 构建零改动
                voice = VOICE_M if gender == "male" else VOICE_F
                items.append({"text": txt, "name": name, "_voice": voice})
    return items


def main() -> None:
    ap = argparse.ArgumentParser(description="英语点读 TTS 批量合成（委托通用工具）")
    ap.add_argument("--book", required=True, help="册次，如 四年级_上册")
    ap.add_argument("--unit", type=int, help="单单元下标")
    ap.add_argument("--units", help="多单元逗号分隔，如 0,1,2")
    ap.add_argument("--all-units", action="store_true", help="全册单元")
    ap.add_argument("--grade", type=int, default=0, help="年级（1-2 → 慢速 -20%）")
    ap.add_argument("--gender", type=Path, help="F0 性别分析 JSON（optional）")
    ap.add_argument("--engine", default=ENGINE, choices=["edge", "kokoro"], help="语音引擎")
    args = ap.parse_args()

    book = load_book(args.book)
    n_units = len(book.get("bookaudio_v3", []))
    if args.all_units:
        units = list(range(n_units))
    elif args.units:
        units = [int(x) for x in args.units.split(",") if x.strip()]
    elif args.unit is not None:
        units = [args.unit]
    else:
        units = [0]
    units = [u for u in units if 0 <= u < n_units]

    rate = RATE_SLOW if args.grade and args.grade <= 2 else RATE_NORMAL
    gender_data: dict = {}
    if args.gender:
        if not args.gender.exists():
            sys.exit(f"❌ 性别文件不存在: {args.gender}")
        gender_data = json.loads(args.gender.read_text(encoding="utf-8"))
    print(f"🎯 {args.book} 单元 {units} ｜ 引擎 {args.engine} ｜ "
          f"女 {VOICE_F} / 男 {VOICE_M} ｜ "
          f"{'低年级慢速 ' + rate if args.grade and args.grade <= 2 else '标准'}")

    from 音频批量生成工具 import get_engine

    eng = get_engine(args.engine)
    items = build_items(args.book, units, gender_data)
    bid, grade, vol = find_book(args.book)
    out_dir = MAT / grade / vol / REVIEW_DIR_NAME / "单句音频"
    out_dir.mkdir(parents=True, exist_ok=True)

    ok = fail = 0
    for it in items:
        out = out_dir / f"{it['name']}.mp3"
        if out.exists() and out.stat().st_size > 100:
            ok += 1
            continue
        if args.engine == "edge":
            speed = 0.85 if rate == RATE_SLOW else 1.0
            ok1 = eng.synth(it["text"], out, voice=it["_voice"], speed=speed)
        else:
            # Kokoro 引擎（统一英式女声 bf_emma，无男/女路由场景差异时）
            ok1 = eng.synth(it["text"], out, voice="bf_emma", speed=0.92)
        if ok1:
            ok += 1
        else:
            fail += 1
            print(f"  ❌ {it['name']}")
        time.sleep(0.4)  # Edge 节流防风控

    print(f"\n📦 输出: {out_dir}")
    print(f"✅ 成功 {ok} / 失败 {fail}")


if __name__ == "__main__":
    main()