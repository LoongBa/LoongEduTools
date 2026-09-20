#!/usr/bin/env python3
"""英语点读 — TTS 批量合成管线（Edge TTS 英式，男女声自动路由）

数据流:
  book.json ──► 提取单元 track（页/序号/文本）
  原始音频 ──► F0 基频分析 → 性别（男/女/不确定）
  ──► 女 → gb_sonia / 男 → gb_ryan / 不确定+无声 → gb_sonia（默认）
  ──► 输出到 册目录/_重读音频素材/单句音频/（与原目录结构一致，文件名复用原始）

用法:
  python tts_batch.py --book 四年级_上册 --unit 0                     # 单单元
  python tts_batch.py --book 四年级_上册 --units 0,1,2                # 多单元
  python tts_batch.py --book 四年级_上册 --all-units                  # 全册
  python tts_batch.py --book 四年级_上册 --unit 0 --grade 12          # 低年级慢速
  python tts_batch.py --book 四年级_上册 --gender C:/tmp/gender.json  # 指定性别分析文件

特性: 断点续传 / 失败重试 3 次 / 句间节流 0.4s / 输出文件复用原始文件名（构建零改动）。
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

import edge_tts

MAT = Path(r"F:\_教材素材\人教版（PEP）（主编：吴欣）")
DATA_DIR = Path(r"F:\LoongBa_Git\LoongEduTools\Downloader\Diandu\data")
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

VOICE_F = "en-GB-SoniaNeural"   # 女声（定音）
VOICE_M = "en-GB-RyanNeural"    # 男声（定音）
RATE_NORMAL = "-15%"
RATE_SLOW = "-20%"
RETRY = 3
THROTTLE = 0.4

REVIEW_DIR_NAME = "_重读音频素材"  # 输出目录（与原版 _音频素材 并存）


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


def original_filename(audio_dir: Path, page_no: int, track_index: int) -> str | None:
    """复用原始文件名（P{page}_{idx}_*.mp3 → 取第一个），使构建零改动"""
    hits = sorted(audio_dir.glob(f"P{page_no:03d}_{track_index:02d}_*.mp3"))
    return hits[0].name if hits else None


def voice_for(gender: str | None) -> str:
    """男→男声，其余（女/不确定/无声/None）→女声"""
    return VOICE_M if gender == "male" else VOICE_F


async def synth_one(text: str, out: Path, voice: str, rate: str) -> str:
    for attempt in range(1, RETRY + 1):
        try:
            c = edge_tts.Communicate(text, voice, rate=rate)
            await c.save(str(out))
            if out.exists() and out.stat().st_size > 100:
                return "ok"
            return "empty"
        except Exception:
            if attempt < RETRY:
                await asyncio.sleep(1.5 * attempt)
    return "fail"


async def synth_book(book_key: str, units: list[int], rate: str,
                     gender_data: dict, progress: dict) -> list[str]:
    bid, grade, vol = find_book(book_key)
    book = load_book(book_key)
    orig_audio_dir = MAT / grade / vol / "_音频素材" / "单句音频"
    out_dir = MAT / grade / vol / REVIEW_DIR_NAME / "单句音频"
    out_dir.mkdir(parents=True, exist_ok=True)
    results: list[str] = []
    cnt = {"female": 0, "male": 0}

    for ui in units:
        s, e = unit_range(book, ui)
        title = book.get("bookaudio_v3", [])[ui].get("title", f"Unit {ui + 1}")
        pu_key = f"U{ui}"
        g_unit = (gender_data.get(pu_key) or {}) if gender_data else {}
        print(f"\n[{book_key}] U{ui} {title}: 页 {s}..{e-1}")
        pages = [p for p in book.get("bookpage", []) if s <= p.get("page_no", 0) < e]
        n = sum(len(p.get("track_info") or []) for p in pages)
        i = 0
        for p in pages:
            pno = p.get("page_no")
            for t in p.get("track_info") or []:
                ti = int(t.get("track_index", 0))
                i += 1
                txt = (t.get("track_text") or "").strip()
                if not txt:
                    continue
                fname = original_filename(orig_audio_dir, pno, ti)
                if not fname:
                    results.append(f"⏭ {pno}/{ti}: 原始音频未找到")
                    continue
                gender = g_unit.get(f"P{pno:03d}_{ti:02d}")
                voice = voice_for(gender)
                cnt[gender if gender == "male" else "female"] += 1
                key = f"{book_key}|U{ui}|{fname}"
                if key in progress:
                    continue
                out = out_dir / fname
                if out.exists() and out.stat().st_size > 100:
                    progress[key] = True
                    continue
                status = await synth_one(txt, out, voice, rate)
                progress[key] = status == "ok"
                if status != "ok":
                    results.append(f"❌ {fname}: {status}")
                    continue
                if i % 10 == 0 or i == n:
                    gs = "男" if gender == "male" else "女"
                    print(f"  [{i}/{n}] {fname} ({gs})")
                await asyncio.sleep(THROTTLE)
    print(f"  → 输出: {out_dir}（女 {cnt['female']} / 男 {cnt['male']}）")
    return results


def main() -> None:
    ap = argparse.ArgumentParser(description="英语点读 TTS 批量合成（Edge TTS 男女声路由）")
    ap.add_argument("--book", required=True, help="册次，如 四年级_上册")
    ap.add_argument("--unit", type=int, help="单单元下标")
    ap.add_argument("--units", help="多单元逗号分隔，如 0,1,2")
    ap.add_argument("--all-units", action="store_true", help="全册单元")
    ap.add_argument("--grade", type=int, default=0, help="年级（1-2 → 慢速 -20%）")
    ap.add_argument("--gender", type=Path, help="F0 性别分析 JSON（tts_gender_analyze.py 输出）")
    ap.add_argument("--resume-file", type=Path, help="断点续传 JSON（默认 <out>/_progress.json）")
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
    grade_hint = f"低年级慢速 {rate}" if args.grade and args.grade <= 2 else f"标准 {rate}"
    print(f"🎯 {args.book} 单元 {units} ｜ 女 {VOICE_F} / 男 {VOICE_M} ｜ {grade_hint}")

    gender_data: dict = {}
    if args.gender:
        if not args.gender.exists():
            sys.exit(f"❌ 性别文件不存在: {args.gender}")
        gender_data = json.loads(args.gender.read_text(encoding="utf-8"))
        print(f"🔬 载入性别分析: {args.gender}")

    _, grade, vol = find_book(args.book)
    out_dir = MAT / grade / vol / REVIEW_DIR_NAME / "单句音频"
    resume = args.resume_file or (out_dir / "_progress.json")
    progress: dict = {}
    if resume.exists():
        progress = json.loads(resume.read_text(encoding="utf-8"))
        print(f"♻ 已存在进度 {len(progress)} 条，断点续传")

    fails = asyncio.run(synth_book(args.book, units, rate, gender_data, progress))

    resume.write_text(json.dumps(progress, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n📦 输出目录: {out_dir}")
    print(f"♻ 进度: {resume}")
    if fails:
        print(f"⚠ 异常 {len(fails)} 条（重跑同命令续传）：")
        for f in fails:
            print(f"   {f}")
    else:
        print("✅ 全部完成")


if __name__ == "__main__":
    main()