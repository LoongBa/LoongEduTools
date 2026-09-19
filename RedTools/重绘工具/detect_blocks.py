#!/usr/bin/env python3
"""检测重绘图中的青色（#00FFFF）矩形色块，提取热区坐标。

用法:
  python detect_blocks.py <image_path> [--inpaint clean.png] [--json]

原理:
  1. BGR → HSV，过滤纯青色区域 (H≈90°, S≥200, V≥200)
  2. 形态学闭运算填充色块内部
  3. 轮廓提取 → 矩形拟合 → 输出归一化坐标
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np


def read_img(path: str) -> np.ndarray:
    """读取图片，兼容中文路径。"""
    data = Path(path).read_bytes()
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        print(f"❌ 无法读取: {path}", file=sys.stderr)
        sys.exit(1)
    return img


def detect_cyan_blocks(img_path: str) -> tuple[list[dict], np.ndarray, np.ndarray]:
    """检测青色矩形色块，返回 (blocks, img, mask)。"""
    img = read_img(img_path)
    h, w = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

    # 青色 HSV 范围（#00FFFF ≈ H=90°, S=255, V=255）
    lower = np.array([80, 180, 180])
    upper = np.array([100, 255, 255])
    mask = cv2.inRange(hsv, lower, upper)

    # 形态学：填充色块内部空洞
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    # 轮廓提取
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    blocks = []
    for cnt in contours:
        x, y, bw, bh = cv2.boundingRect(cnt)
        area = bw * bh
        # 过滤：色块面积 > 图片面积 0.1%，且宽高都 > 10px
        if area > w * h * 0.001 and bw > 10 and bh > 10:
            # 矩形度（面积比）：接近 1 说明是矩形
            rect_ratio = area / (bw * bh)  # boundingRect 面积比恒为 1
            # 用 contourArea / boundingRectArea 判断矩形度
            cnt_area = cv2.contourArea(cnt)
            rect_fit = cnt_area / area if area > 0 else 0
            blocks.append({
                "x": x, "y": y, "w": bw, "h": bh,
                "cx": x + bw // 2, "cy": y + bh // 2,
                "area": area,
                "cnt_area": cnt_area,
                "rect_fit": rect_fit,
            })

    # 按 y 坐标排序
    blocks.sort(key=lambda b: b["cy"])
    return blocks, img, mask


def to_normalized(blocks: list[dict], img_h: int, img_w: int) -> list[dict]:
    """将像素坐标转为 0-1 归一化坐标。"""
    result = []
    for i, b in enumerate(blocks):
        result.append({
            "track_index": i + 1,
            "left": round(b["x"] / img_w, 4),
            "top": round(b["y"] / img_h, 4),
            "right": round((b["x"] + b["w"]) / img_w, 4),
            "bottom": round((b["y"] + b["h"]) / img_h, 4),
            "width_px": b["w"],
            "height_px": b["h"],
            "rect_fit": round(b["rect_fit"], 3),
        })
    return result


def inpaint_blocks(img: np.ndarray, mask: np.ndarray, out_path: str, radius: int = 7) -> None:
    """使用 OpenCV inpaint 去除色块。"""
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius * 2 + 1, radius * 2 + 1))
    dilated = cv2.dilate(mask, kernel, iterations=2)
    clean = cv2.inpaint(img, dilated, radius, cv2.INPAINT_TELEA)
    ok, buf = cv2.imencode('.png', clean)
    if ok:
        Path(out_path).write_bytes(buf.tobytes())
        print(f"✅ 已去除色块 → {out_path}")
    else:
        print(f"❌ 保存失败: {out_path}")


def main():
    ap = argparse.ArgumentParser(description="检测青色矩形色块并提取热区坐标")
    ap.add_argument("image", help="重绘图路径")
    ap.add_argument("--inpaint", help="去除色块后保存路径（可选）")
    ap.add_argument("--json", action="store_true", help="输出 JSON 格式")
    ap.add_argument("--compare", help="对比原始热区 JSON 文件路径")
    args = ap.parse_args()

    blocks, img, mask = detect_cyan_blocks(args.image)
    h, w = img.shape[:2]
    coords = to_normalized(blocks, h, w)

    print(f"📐 图片尺寸: {w}×{h}")
    print(f"🔍 检测到 {len(blocks)} 个青色色块\n")

    if args.json:
        print(json.dumps(coords, indent=2, ensure_ascii=False))
    else:
        for c in coords:
            print(f"  [{c['track_index']}] left={c['left']:.4f}  top={c['top']:.4f}  "
                  f"right={c['right']:.4f}  bottom={c['bottom']:.4f}  "
                  f"({c['width_px']}×{c['height_px']}px)  rect_fit={c['rect_fit']}")

    if args.compare:
        with open(args.compare, "r", encoding="utf-8") as f:
            original = json.load(f)
        print(f"\n📋 对比原始热区:")
        for orig, det in zip(original, coords):
            dl = abs(orig["left"] - det["left"])
            dt = abs(orig["top"] - det["top"])
            dr = abs(orig["right"] - det["right"])
            db = abs(orig["bottom"] - det["bottom"])
            avg_err = (dl + dt + dr + db) / 4
            status = "✅" if avg_err < 0.02 else "⚠️" if avg_err < 0.05 else "❌"
            print(f"  {status} Track {orig.get('track_index', '?')}: "
                  f"Δleft={dl:.4f} Δtop={dt:.4f} Δright={dr:.4f} Δbottom={db:.4f}  avg={avg_err:.4f}")

    if args.inpaint:
        inpaint_blocks(img, mask, args.inpaint)


if __name__ == "__main__":
    main()
