#!/usr/bin/env python3
"""文字区域合成：AI 重绘图 + 原图文字区域按热区坐标贴回（文字 100% 保真兜底）

背景：AI 对长段落英文文字保真差（Page 21 故事段重叠乱码）。
方案：插画用 AI 重绘（避版权），文字区域从原图按 book.json 热区坐标贴回。

用法:
  python compose_text_region.py --page 21 \
      --book <book.json> --orig <原图.png> --redrawn <重绘图.png> --out <输出.png>
  # --tracks 1,4,5 只贴指定 track（默认全部）；--margin 额外外扩像素
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


def main() -> None:
    ap = argparse.ArgumentParser(description="AI 重绘 + 原图文字区域合成")
    ap.add_argument("--page", type=int, required=True, help="页码（book.json page_no）")
    ap.add_argument("--book", required=True, help="book.json 路径")
    ap.add_argument("--orig", required=True, help="原图路径（_图片素材/Page_NNN.png）")
    ap.add_argument("--redrawn", required=True, help="AI 重绘图路径")
    ap.add_argument("--out", required=True, help="输出合成图路径")
    ap.add_argument("--tracks", help="只贴这些 track_index（逗号分隔），默认全部")
    ap.add_argument("--margin", type=int, default=0, help="文字矩形外扩像素（默认 0）")
    args = ap.parse_args()

    book = json.loads(Path(args.book).read_text(encoding="utf-8-sig"))
    page_data = next((p for p in book.get("bookpage", []) if p.get("page_no") == args.page), None)
    if not page_data:
        raise SystemExit(f"❌ book.json 中无 page_no={args.page}")
    tracks = page_data.get("track_info", [])

    want = {int(x) for x in args.tracks.split(",")} if args.tracks else None

    orig = Image.open(args.orig).convert("RGB")
    redrawn = Image.open(args.redrawn).convert("RGB")
    W1, H1 = orig.size
    W2, H2 = redrawn.size
    print(f"原图 {W1}x{H1}  重绘 {W2}x{H2}  比例偏差 {(W1/W2-1)*100:.2f}%")

    pasted = 0
    for t in tracks:
        ti = int(t.get("track_index", 0))
        if want is not None and ti not in want:
            continue
        L, T, R, B = t["track_left"], t["track_top"], t["track_right"], t["track_bottom"]
        m = args.margin
        box1 = (int(L * W1) - m, int(T * H1) - m, int(R * W1) + m, int(B * H1) + m)
        box2 = (int(L * W2) - m, int(T * H2) - m, int(R * W2) + m, int(B * H2) + m)
        w2, h2 = box2[2] - box2[0], box2[3] - box2[1]
        if w2 <= 0 or h2 <= 0 or box1[2] <= box1[0] or box1[3] <= box1[1]:
            continue
        crop = orig.crop(box1).resize((w2, h2), Image.LANCZOS)
        redrawn.paste(crop, (box2[0], box2[1]))
        pasted += 1
    print(f"✅ 已贴回 {pasted}/{len(tracks)} 个文字区域 → {args.out}")
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    redrawn.save(args.out)


if __name__ == "__main__":
    main()
