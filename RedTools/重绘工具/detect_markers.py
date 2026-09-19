#!/usr/bin/env python3
"""检测重绘图中的品红色（#FF00FF）标记线，提取热区坐标。

用法:
  python detect_markers.py output_v7_marker/Page_012_redrawn.png
  python detect_markers.py output_v7_marker/Page_012_redrawn.png --inpaint clean.png

原理:
  1. BGR → HSV，过滤品红区域 (H≈300°, S≥150, V≥150)
  2. 形态学闭运算连接断线
  3. 轮廓提取 → 过滤长宽比（横线：宽 >> 高）
  4. 输出归一化坐标（与 book.json track_left/top/right/bottom 格式一致）
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


def detect_magenta_lines(img_path: str) -> list[dict]:
    """检测品红色标记线，返回 [{x, y, w, h, cx, cy, area}, ...]（像素坐标）。"""
    img = read_img(img_path)

    h, w = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

    # 品红色 HSV 范围（#FF00FF ≈ H=300°, S=255, V=255）
    # OpenCV H 范围 0-180，300° → 150
    lower = np.array([140, 100, 150])
    upper = np.array([160, 255, 255])
    mask = cv2.inRange(hsv, lower, upper)

    # 形态学：连接断线、去除噪点
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 3))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    # 轮廓提取
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    lines = []
    for cnt in contours:
        x, y, bw, bh = cv2.boundingRect(cnt)
        area = bw * bh
        # 过滤：横线要求 宽 > 高×3，且宽度 > 图宽 5%
        if bw > bh * 2 and bw > w * 0.05:
            lines.append({
                "x": x, "y": y, "w": bw, "h": bh,
                "cx": x + bw // 2, "cy": y + bh // 2,
                "area": area,
            })

    # 按 y 坐标排序（从上到下）
    lines.sort(key=lambda l: l["cy"])
    return lines, img, mask


def to_normalized(lines: list[dict], img_h: int, img_w: int) -> list[dict]:
    """将像素坐标转为 0-1 归一化坐标（匹配 book.json 格式）。"""
    result = []
    for i, l in enumerate(lines):
        result.append({
            "track_index": i + 1,
            "left": round(l["x"] / img_w, 4),
            "top": round(l["y"] / img_h, 4),
            "right": round((l["x"] + l["w"]) / img_w, 4),
            "bottom": round((l["y"] + l["h"]) / img_h, 4),
            "width_px": l["w"],
            "height_px": l["h"],
        })
    return result


def inpaint_lines(img: np.ndarray, mask: np.ndarray, out_path: str, radius: int = 5) -> None:
    """使用 OpenCV inpaint 去除标记线。"""
    # 膨胀 mask 确保完全覆盖标记边缘
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius * 2 + 1, radius * 2 + 1))
    dilated = cv2.dilate(mask, kernel, iterations=1)
    clean = cv2.inpaint(img, dilated, radius, cv2.INPAINT_TELEA)
    # 兼容中文路径
    ok, buf = cv2.imencode('.png', clean)
    if ok:
        Path(out_path).write_bytes(buf.tobytes())
        print(f"✅ 已去除标记线 → {out_path}")
    else:
        print(f"❌ 保存失败: {out_path}")


def main():
    ap = argparse.ArgumentParser(description="检测品红色标记线并提取热区坐标")
    ap.add_argument("image", help="重绘图路径")
    ap.add_argument("--inpaint", help="去除标记线后保存路径（可选）")
    ap.add_argument("--json", action="store_true", help="输出 JSON 格式")
    args = ap.parse_args()

    lines, img, mask = detect_magenta_lines(args.image)
    h, w = img.shape[:2]
    coords = to_normalized(lines, h, w)

    print(f"📐 图片尺寸: {w}×{h}")
    print(f"🔍 检测到 {len(lines)} 条标记线\n")

    if args.json:
        print(json.dumps(coords, indent=2, ensure_ascii=False))
    else:
        for c in coords:
            print(f"  [{c['track_index']}] left={c['left']:.4f}  top={c['top']:.4f}  "
                  f"right={c['right']:.4f}  bottom={c['bottom']:.4f}  "
                  f"({c['width_px']}×{c['height_px']}px)")

    # 对比原始热区（Page_012）
    print("\n📋 对比原始热区坐标:")
    original = [
        {"track_index": 1, "left": 0.0825, "top": 0.0414, "right": 0.3756, "bottom": 0.0849},
        {"track_index": 2, "left": 0.1517, "top": 0.1429, "right": 0.4109, "bottom": 0.2308},
        {"track_index": 3, "left": 0.1576, "top": 0.4400, "right": 0.4860, "bottom": 0.5083},
    ]
    for orig, det in zip(original, coords):
        dl = abs(orig["left"] - det["left"])
        dt = abs(orig["top"] - det["top"])
        dr = abs(orig["right"] - det["right"])
        db = abs(orig["bottom"] - det["bottom"])
        avg_err = (dl + dt + dr + db) / 4
        status = "✅" if avg_err < 0.02 else "⚠️" if avg_err < 0.05 else "❌"
        print(f"  {status} Track {orig['track_index']}: "
              f"Δleft={dl:.4f} Δtop={dt:.4f} Δright={dr:.4f} Δbottom={db:.4f}  avg={avg_err:.4f}")

    if args.inpaint:
        inpaint_lines(img, mask, args.inpaint)


if __name__ == "__main__":
    main()
