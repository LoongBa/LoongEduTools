#!/usr/bin/env python3
"""TTS 性别自动分类：对原始音频做 F0 基频分析，输出每句的男/女声标签。

男声 F0 ~85-165Hz，女声 F0 ~165-280Hz。取有声段（voiced）p50 中位数，
<150Hz → male, >180Hz → female, 中间 → uncertain（人工定）。

用法:
  python tts_gender_analyze.py --book 四年级_上册            # 分析整册
  python tts_gender_analyze.py --book 四年级_上册 --unit 0    # 仅单元
  python tts_gender_analyze.py --book 四年级_上册 --out C:/tmp/gender.json

输出 JSON:
  {"四年级_上册": {"U0": {"P002_01": "female", "P003_05": "male", ...}}, ...}
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import librosa

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

MALE_MAX = 150.0      # <150Hz 判男
FEMALE_MIN = 180.0    # >180Hz 判女


def find_book(book_key: str):
    for k, bid, grade, vol in BOOKS:
        if k == book_key:
            return bid, grade, vol
    sys.exit(f"❌ 未知册次: {book_key}")


def f0_median(path: Path) -> tuple[float | None, float]:
    """pyin 提取 F0，返回 (voiced p50, 音频时长秒)；真无声/检测不可靠 → (None, dur)

    短音频（<1.5s）检测不稳定：仅 3-4 帧有声，常卡在 60Hz 下限或 500Hz 上限 → 返回 None。
    p50 落在 fmin/fmax 边缘（截断）也视为不可靠。
    """
    FMIN, FMAX = 60.0, 500.0
    try:
        y, sr = librosa.load(str(path), sr=22050, mono=True)
        dur = len(y) / sr
        if y.size == 0:
            return None, dur
        # 超短音频：F0 检测不可靠，交给上级按 uncertain 处理（默认女声旁白）
        if dur < 1.5:
            return None, dur
        try:
            f0, voiced, _ = librosa.pyin(y, fmin=FMIN, fmax=FMAX, sr=sr)
            if voiced is not None and voiced.any():
                vals = f0[voiced]
                min_frames = 2 if dur < 2.0 else 5
                if vals.size >= min_frames:
                    med = float(np.nanmedian(vals))
                    # 极值截断 = 检测失败（多数 voiced 帧贴边）
                    if med <= FMIN + 8 or med >= FMAX - 8:
                        return None, dur
                    return med, dur
        except Exception:
            pass
        # 兜底：librosa.yin
        f0 = librosa.yin(y, fmin=FMIN, fmax=FMAX, sr=sr)
        f0_clean = f0[~np.isnan(f0)]
        if f0_clean.size >= 2:
            med = float(np.median(f0_clean))
            if med <= FMIN + 8 or med >= FMAX - 8:
                return None, dur
            return med, dur
        return None, dur
    except Exception:
        return None, 0.0


def classify(med: float, male_max: float, female_min: float) -> str:
    if med < male_max:
        return "male"
    if med > female_min:
        return "female"
    return "uncertain"


def analyze_book(book_key: str, unit_filter: int | None = None,
                 male_max: float = 150.0, female_min: float = 180.0) -> dict:
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
                med, dur = f0_median(hits[0])
                if med is None:
                    result[key][f"P{pno:03d}_{ti:02d}"] = "uncertain"
                else:
                    result[key][f"P{pno:03d}_{ti:02d}"] = classify(med, male_max, female_min)
    return result


def main() -> None:
    ap = argparse.ArgumentParser(description="TTS 性别自动分类（F0 基频分析）")
    ap.add_argument("--book", required=True, help="册次，如 四年级_上册")
    ap.add_argument("--unit", type=int, help="仅分析指定单元")
    ap.add_argument("--out", type=Path, help="输出 JSON 路径")
    ap.add_argument("--threshold-male", type=float, default=150.0)
    ap.add_argument("--threshold-female", type=float, default=180.0)
    args = ap.parse_args()

    print(f"🔬 {args.book} F0 分析中（男<{args.threshold_male} 女>{args.threshold_female}）…")
    result = analyze_book(args.book, args.unit,
                          male_max=args.threshold_male, female_min=args.threshold_female)
    total = sum(len(v) for v in result.values())
    cnt: dict[str, int] = {}
    for u in result.values():
        for g in u.values():
            cnt[g] = cnt.get(g, 0) + 1
    print(f"共分析 {total} 句：男 {cnt.get('male',0)} / 女 {cnt.get('female',0)} / "
          f"不确定 {cnt.get('uncertain',0)} / 无声 {cnt.get('unknown',0)}")

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"✅ 已保存: {args.out}")
    else:
        print(json.dumps(result, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()