#!/usr/bin/env python3
"""热区校正本地数据包：把素材生成到编辑器可离线加载的数据包（免服务器，双击即用）

为什么：file:// 下浏览器禁止 fetch/XHR（无法自动读素材库），但 <img>/<script>/<audio>
相对引用可用 → 把数据/图片/音频生成到 hotzone_editor/data/<册>/，双击 index.html
即自动加载，无需启动服务器。

用法:
  python hotzone_prepare.py --book 四年级_上册              # 图片缩略 + book（默认）
  python hotzone_prepare.py --book 四年级_上册 --with-audio # 含单句音频（体积大）
  python hotzone_prepare.py --book 四年级_上册 --clean      # 删除该册数据包
  python hotzone_prepare.py --all                            # 全部 11 册

数据包结构（hotzone_editor/data/<key>/）:
  book.js        window.HZ_BOOK = {...}   （从 _重绘图片素材/书数据.json 副本读取）
  manifest.js    window.HZ_MANIFEST = {audio:{...}}
  img/Page_NNN_orig.jpg   原图缩略（宽 800）
  img/Page_NNN_redr.jpg   重绘缩略（宽 800）
  audio/*.mp3              单句音频（--with-audio）
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

from PIL import Image

REDTOOLS = Path(r"F:\LoongBa_Git\LoongEduTools\RedTools")
MAT = Path(r"F:\_教材素材\人教版（PEP）（主编：吴欣）")
DATA_DIR = Path(r"F:\LoongBa_Git\LoongEduTools\Downloader\Diandu\data")
OUT_ROOT = REDTOOLS / "重绘工具" / "hotzone_editor" / "data"

BOOKS = [
    ("一年级_上册", "1212001101247", "一年级", "上册"), ("一年级_下册", "1212001102247", "一年级", "下册"),
    ("二年级_上册", "1212001201247", "二年级", "上册"), ("二年级_下册", "1212001202247", "二年级", "下册"),
    ("三年级_上册", "1212001301245", "三年级", "上册"), ("三年级_下册", "1212001302245", "三年级", "下册"),
    ("四年级_上册", "1212001401255", "四年级", "上册"), ("四年级_下册", "1212001402255", "四年级", "下册"),
    ("五年级_上册", "1212001501255", "五年级", "上册"), ("五年级_下册", "1212001502255", "五年级", "下册"),
    ("六年级_上册", "1212001601265", "六年级", "上册"),
]
BOOK_MAP = {k: (b, g, v) for k, b, g, v in BOOKS}

THUMB_W = 800
JPEG_Q = 82


def load_book_for(key: str) -> dict:
    """优先读重绘目录副本（书数据.json，与数据原则一致），否则回退原始数据"""
    bid, grade, vol = BOOK_MAP[key]
    for cand in (MAT / grade / vol / "_重绘图片素材" / "书数据.json",
                 MAT / grade / vol / "_重绘图片素材" / "book.json",   # 旧名兼容
                 DATA_DIR / f"{bid}_英语（PEP）_{grade}_{vol}.json"):
        if cand.exists():
            return json.loads(cand.read_text(encoding="utf-8-sig"))
    sys.exit(f"❌ {key}: 未找到 书数据.json（副本或原始）")


def make_thumb(src: Path, dst: Path) -> bool:
    try:
        with Image.open(src) as im:
            if im.width > THUMB_W:
                h = round(im.height * THUMB_W / im.width)
                im = im.resize((THUMB_W, h), Image.LANCZOS)
            im.convert("RGB").save(dst, "JPEG", quality=JPEG_Q)
        return True
    except Exception as e:
        print(f"  ⚠️ 缩略失败 {src.name}: {e}")
        return False


def prepare(key: str, with_audio: bool, clean_only: bool) -> None:
    if key not in BOOK_MAP:
        sys.exit(f"❌ 未知册次: {key}，可用: {list(BOOK_MAP)}")
    bid, grade, vol = BOOK_MAP[key]
    out = OUT_ROOT / key
    if clean_only:
        if out.exists():
            shutil.rmtree(out)
            print(f"🗑  已删除数据包: {out}")
        else:
            print(f"⏭  数据包不存在: {out}")
        return

    if out.exists():
        shutil.rmtree(out)
    (out / "img").mkdir(parents=True)

    # 1. book.js（含 bookinfo/bookpage/bookaudio_v3）
    book = load_book_for(key)
    (out / "book.js").write_text(
        "window.HZ_BOOK = " + json.dumps(book, ensure_ascii=False) + ";\n", encoding="utf-8")

    # 2. 图片缩略（原图 + 重绘）
    redr_dir = MAT / grade / vol / "_重绘图片素材"
    orig_dir = MAT / grade / vol / "_图片素材"
    page_nos = sorted({p.get("page_no") for p in book.get("bookpage", []) if p.get("page_no")})
    img_ok = 0
    for no in page_nos:
        n = f"Page_{no:03d}"
        redr = redr_dir / f"{n}.png"
        orig = orig_dir / f"{n}.png"
        if redr.exists():
            if make_thumb(redr, out / "img" / f"{n}_redr.jpg"):
                img_ok += 1
        if orig.exists():
            if make_thumb(orig, out / "img" / f"{n}_orig.jpg"):
                img_ok += 1
    print(f"✅ {key}: 图片缩略 {img_ok} 张")

    # 3. 音频（可选）
    audio_map: dict[str, dict[str, str]] = {}
    if with_audio:
        audio_dir = MAT / grade / vol / "_音频素材" / "单句音频"
        (out / "audio").mkdir(exist_ok=True)
        import re
        n_audio = 0
        if audio_dir.exists():
            for f in sorted(audio_dir.glob("P*_*.mp3")):
                m = re.match(r"^P(\d{3})_(\d{2})_", f.name)
                if not m:
                    continue
                shutil.copy2(f, out / "audio" / f.name)
                audio_map.setdefault(str(int(m.group(1))), {})[str(int(m.group(2)))] = f.name
                n_audio += 1
        print(f"✅ {key}: 音频 {n_audio} 条")
    (out / "manifest.js").write_text(
        "window.HZ_MANIFEST = " + json.dumps({"audio": audio_map}, ensure_ascii=False) + ";\n",
        encoding="utf-8")

    size_mb = sum(f.stat().st_size for f in out.rglob("*")) / 1024 / 1024
    print(f"📦 数据包就绪: {out}（{size_mb:.1f} MB）—— 双击 hotzone_editor/index.html 即自动加载，免服务器")


def main() -> None:
    ap = argparse.ArgumentParser(description="热区校正本地数据包生成（免服务器）")
    ap.add_argument("--book", help="册次 key，如 四年级_上册（默认全部或 --all）")
    ap.add_argument("--all", action="store_true", help="生成全部 11 册")
    ap.add_argument("--with-audio", action="store_true", help="含单句音频（体积大）")
    ap.add_argument("--clean", action="store_true", help="删除数据包")
    args = ap.parse_args()

    if args.all:
        for k in BOOK_MAP:
            prepare(k, args.with_audio, args.clean)
    elif args.book:
        prepare(args.book, args.with_audio, args.clean)
    else:
        ap.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()

