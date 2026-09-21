# -*- coding: utf-8 -*-
"""
素材压缩脚本（V0.2-A）：图片 PNG/MIP 2048² → WebP 1024²（≤500KB）
小红书平台约束：单文件 ≤10MB。源图 23 张 2048² ≈ 5MB/张超限，需压缩。

用法：python compress_assets.py <build_dir>
  <build_dir>  单元构建目录（读 assets/images/，输出 assets/images_webp/）

输出：build_dir/assets/images_webp/<同名>.webp（保留原图，另出压缩版）
"""
import json, sys, os, argparse
from pathlib import Path
from PIL import Image

# 目标尺寸/质量（词卡/场景在移动端展示，1024² 足够；1:1 源图统一缩放）
TARGET_SIZE = 1024
WEBP_QUALITY = 75
MAX_BYTES = 500 * 1024  # 500KB


def compress_image(src: Path, dst_dir: Path) -> tuple[bool, int]:
    """压缩单张图 → WebP，返回 (是否成功, 输出字节数)"""
    im = Image.open(src)
    if im.mode != "RGB":
        im = im.convert("RGB")
    # 等比缩放（最长边 ≤ TARGET_SIZE）
    w, h = im.size
    scale = min(1.0, TARGET_SIZE / max(w, h))
    if scale < 1.0:
        im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    out = dst_dir / (src.stem + ".webp")
    im.save(out, "WEBP", quality=WEBP_QUALITY, method=6)  # method=6 最慢但压缩率最高
    size = out.stat().st_size

    # 若仍超 500KB，降质量重试（80→65→55→45）
    q = WEBP_QUALITY
    while size > MAX_BYTES and q > 30:
        q -= 10
        im.save(out, "WEBP", quality=q, method=6)
        size = out.stat().st_size
    return size <= MAX_BYTES, size


def main(build_dir: str):
    img_src = os.path.join(build_dir, 'assets', 'images')
    if not os.path.isdir(img_src):
        print(f'❌ 无 images 目录: {img_src}')
        sys.exit(1)
    img_dst = os.path.join(build_dir, 'assets', 'images_webp')
    os.makedirs(img_dst, exist_ok=True)

    results = []
    for fn in sorted(os.listdir(img_src)):
        if not fn.lower().endswith(('.png', '.jpg', '.jpeg')):
            continue
        ok, size = compress_image(Path(img_src) / fn, Path(img_dst))
        results.append((fn, size, ok))

    ok_n = sum(1 for _, _, ok in results if ok)
    print(f'✅ 压缩完成: {len(results)} 张 -> {img_dst}')
    print(f'   达标 {ok_n}/{len(results)}（≤{MAX_BYTES//1024}KB）')
    for fn, size, ok in results:
        print(f'   {"✅" if ok else "⚠️"}  {fn}  {size//1024}KB')
    return 0 if ok_n == len(results) else 2


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='图片压缩 PNG→WebP')
    ap.add_argument('build_dir', help='单元构建目录')
    args = ap.parse_args()
    sys.exit(main(args.build_dir))