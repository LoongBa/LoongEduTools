#!/usr/bin/env python3
"""RedTools 小工具构建框架（多系列共用）

职责：把「系列/工具」目录 + 数据源（book.json）构建为符合
minitool-zip-builder 规范的 dist/ 产物与 zip，并输出 1024 图标到 publish/。

用法（由各工具 build.py 调用）：
    from build_framework import build_tool, ToolConfig
    cfg = ToolConfig(
        series="学科", tool="英语点读",
        version="1.1",
        book=..., img_dir=..., audio_dir=...,
        app_name="新英语四上点读1单元",
    )
    build_tool(cfg, unit_index=0)

音频方案（平台白名单不含音频格式 + CSP 禁 data:/blob: 媒体）：
    每个 track 音频 ffmpeg 压缩 → base64 → 独立 .js（audio/<key>.js，
    window.AUDIO_DATA[key]="base64"），运行时 Web Audio decodeAudioData 解码播放。
"""

from __future__ import annotations

import argparse
import base64
import json
import shutil
import subprocess
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent

IMG_WIDTH = 1200
WEBP_QUALITY = 78
AUDIO_BITRATE = "48k"
AUDIO_RATE = 24000


@dataclass
class ToolConfig:
    series: str                      # 系列名（中文目录，如 学科）
    tool: str                        # 工具名（中文目录，如 英语点读）
    version: str = "1.0"
    datasource: str = "book"         # 'book'（教材数据）| 'static'（静态工具，无数据源）
    book: Path | None = None         # book.json 路径
    img_dir: Path | None = None      # 页面图素材目录
    audio_dir: Path | None = None    # 单句音频素材目录
    app_name: str | None = None      # zip/图标文件名（默认 {tool}；app_name_template 为空时用）
    app_name_template: str | None = None  # 按单元动态命名，如 "新英语四上点读{unit_no}单元"
    default_unit: int = 0            # 默认构建单元下标（bookaudio_v3）
    tool_dir: Path | None = field(default=None, repr=False)   # 自动填充
    src_dir: Path | None = field(default=None, repr=False)
    dist_root: Path | None = field(default=None, repr=False)
    publish_root: Path | None = field(default=None, repr=False)

    def __post_init__(self) -> None:
        self.tool_dir = ROOT / "series" / self.series / self.tool
        self.src_dir = self.tool_dir / "src"
        self.dist_root = ROOT / "dist" / self.series
        self.publish_root = ROOT / "publish" / self.series
        if not self.app_name:
            self.app_name = self.tool


def resolve_app_name(cfg: ToolConfig, book: dict | None, unit_index: int) -> str:
    """生成工具实际 app_name：
    - 配置了 app_name_template → 用单元序号/章节类型替换 {unit_no}
    - 否则用 cfg.app_name（固定名）
    """
    if not cfg.app_name_template:
        return cfg.app_name
    try:
        if book is None:
            # 静态工具（无 book）：直接用 unit_index
            return cfg.app_name_template.format(unit_no=unit_index + 1)
        chapters = book.get("bookaudio_v3", [])
        title = chapters[unit_index].get("title", "") if unit_index < len(chapters) else ""
        import re as _re
        # "Unit 3 ..." → 3
        m = _re.search(r"Unit\s*(\d+)", title, _re.IGNORECASE)
        if m:
            unit_no = int(m.group(1))
        else:
            # 复习/附录：Revision → "复习"；Appendix N → "附录N"
            low = title.lower()
            if low.startswith("revision"):
                unit_no = "复习"
            elif low.startswith("appendix"):
                am = _re.search(r"Appendix\s*(\d+)", title, _re.IGNORECASE)
                unit_no = f"附录{am.group(1)}" if am else "附录"
            else:
                unit_no = unit_index + 1
        return cfg.app_name_template.format(unit_no=unit_no)
    except (KeyError, ValueError):
        return cfg.app_name


def log(msg: str) -> None:
    print(f"[{Path(__file__).parent.name}] {msg}")


def parse_pages_range(spec: str) -> tuple[int, int]:
    a, _, b = spec.partition("-")
    return int(a), int(b)


def resolve_unit_pages(book: dict, unit_index: int, explicit_range: str | None):
    if explicit_range:
        return parse_pages_range(explicit_range)
    chapters = book.get("bookaudio_v3", [])
    if not chapters:
        raise SystemExit("bookaudio_v3 为空，无法自动推断单元范围，请用 --pages 指定")
    if unit_index < 0 or unit_index >= len(chapters):
        raise SystemExit(f"unit {unit_index} 超出 bookaudio_v3 范围 0..{len(chapters) - 1}")
    start = int(chapters[unit_index]["page_no"])
    end = len(book["bookpage"]) + 1
    if unit_index + 1 < len(chapters):
        nxt = chapters[unit_index + 1].get("page_no")
        if nxt:
            end = int(nxt)
    return start, end


def load_book(path: Path) -> dict:
    with open(path, "r", encoding="utf-8-sig") as f:
        return json.load(f)


def build_unit_data(book: dict, unit_index: int, start: int, end: int) -> dict:
    chapters = book.get("bookaudio_v3", [])
    chapter = chapters[unit_index] if unit_index < len(chapters) else {}
    title = chapter.get("title", f"Unit {unit_index + 1}")
    subtitle = ""
    page_by_no = {p["page_no"]: p for p in book["bookpage"]}
    pages = []
    for page_no in range(start, end):
        page = page_by_no.get(page_no)
        if not page:
            continue
        track_list = page.get("track_info") or []
        page_tracks = []
        for t in track_list:
            ti = int(t.get("track_index", 0))
            audio_key = f"p{page_no:03d}_{ti:02d}"
            item = {
                "text": t.get("track_text", ""),
                "cn": t.get("track_genre", ""),
                "audio": audio_key,
                "left": round(float(t.get("track_left", 0)), 4),
                "top": round(float(t.get("track_top", 0)), 4),
                "right": round(float(t.get("track_right", 1)), 4),
                "bottom": round(float(t.get("track_bottom", 1)), 4),
                "duration": t.get("track_duration"),
                "track_index": ti,
            }
            page_tracks.append(item)
            if not subtitle and item["cn"]:
                subtitle = item["cn"]
        pages.append({
            "no": page_no,
            "image": f"images/page_{page_no:03d}.webp",
            "tracks": page_tracks,
        })
    bookinfo = book.get("bookinfo", {})
    return {
        "id": f"{bookinfo.get('bookid', 'book')}-u{unit_index + 1}",
        "title": title,
        "subtitle": subtitle,
        "pages": pages,
    }


def convert_images(pages: list[dict], start: int, out_dir: Path, img_dir: Path) -> None:
    from PIL import Image

    imgs_dir = out_dir / "images"
    imgs_dir.mkdir(parents=True, exist_ok=True)
    for page_no in range(start, start + len(pages)):
        src = img_dir / f"Page_{page_no:03d}.png"
        dst = imgs_dir / f"page_{page_no:03d}.webp"
        if not src.exists():
            log(f"WARN 图片缺失: {src.name}，跳过")
            continue
        with Image.open(src) as im:
            if im.width > IMG_WIDTH:
                h = round(im.height * IMG_WIDTH / im.width)
                im = im.resize((IMG_WIDTH, h), Image.LANCZOS)
            im = im.convert("RGB")
            im.save(dst, "WEBP", quality=WEBP_QUALITY, method=6)
        log(f"图片 {src.name} -> {dst.name} ({dst.stat().st_size // 1024} KB)")


def find_source_audio(audio_dir: Path, page_no: int, track: dict) -> Path | None:
    idx = track.get("track_index")
    pattern = f"P{page_no:03d}_{idx:02d}_*.mp3" if idx else f"P{page_no:03d}_*.mp3"
    matches = sorted(audio_dir.glob(pattern))
    return matches[0] if matches else None


def convert_audio(unit: dict, out_dir: Path, audio_dir: Path) -> None:
    audio_out = out_dir / "audio"
    audio_out.mkdir(parents=True, exist_ok=True)
    for page in unit["pages"]:
        for t in page["tracks"]:
            key = t["audio"]
            dst = audio_out / f"{key}.js"
            if dst.exists():
                continue
            src = find_source_audio(audio_dir, page["no"], t)
            if not src:
                log(f"WARN 音频缺失: {key}（page {page['no']}），生成空 js")
                payload = ""
            else:
                proc = subprocess.run(
                    [
                        "ffmpeg", "-y", "-loglevel", "error",
                        "-i", str(src),
                        "-ac", "1", "-ar", str(AUDIO_RATE), "-b:a", AUDIO_BITRATE,
                        "-map_metadata", "-1",
                        "-f", "mp3", "pipe:1",
                    ],
                    capture_output=True,
                )
                if proc.returncode != 0 or not proc.stdout:
                    log(f"WARN ffmpeg 失败: {src.name}（{proc.stderr.decode(errors='replace').strip()[:120]}）")
                    payload = ""
                else:
                    payload = base64.b64encode(proc.stdout).decode("ascii")
            js = f"window.AUDIO_DATA = window.AUDIO_DATA || {{}};\n" \
                 f"window.AUDIO_DATA[{json.dumps(key)}] = {json.dumps(payload)};\n"
            dst.write_text(js, encoding="utf-8")
            log(f"音频 {src.name if src else '(缺失)'} -> {dst.name} "
                f"({len(payload) // 1024} KB base64)")


def write_data_js(unit: dict, cfg: ToolConfig, book: dict, out_dir: Path, unit_index: int,
                  app_name: str | None = None) -> None:
    bookinfo = book.get("bookinfo", {})
    app_data = {
        "meta": {
            "name": app_name or cfg.app_name,
            "version": cfg.version,
            "series": cfg.series,
            "tool": cfg.tool,
            "book": bookinfo.get("bookname", ""),
            "bookid": bookinfo.get("bookid", ""),
            "bookid_3rd": bookinfo.get("bookid_3rd", ""),
            "unit_index": unit_index,
        },
        "units": [unit],
    }
    js = "window.APP_DATA = " + json.dumps(app_data, ensure_ascii=False, indent=1) + ";\n"
    (out_dir / "data.js").write_text(js, encoding="utf-8")
    log(f"data.js 写入 ({len(js)} 字节, {len(unit['pages'])} 页, "
        f"{sum(len(p['tracks']) for p in unit['pages'])} 热区)")


def write_static_data_js(cfg: ToolConfig, out_dir: Path, unit_index: int, app_name: str) -> None:
    """静态工具（无 book/units）：仅写 meta，不含 units。"""
    app_data = {
        "meta": {
            "name": app_name,
            "version": cfg.version,
            "series": cfg.series,
            "tool": cfg.tool,
            "book": "",
            "bookid": "",
            "bookid_3rd": "",
            "unit_index": unit_index,
        },
        "units": [],
    }
    js = "window.APP_DATA = " + json.dumps(app_data, ensure_ascii=False, indent=1) + ";\n"
    (out_dir / "data.js").write_text(js, encoding="utf-8")
    log(f"data.js 写入（静态工具，{len(js)} 字节）")


def make_static_icon(cfg: ToolConfig, out_dir: Path, publish_dir: Path | None = None,
                     app_name: str | None = None) -> None:
    """静态工具图标：母版 + 无角标（或固定角标），输出 128px + 1024px。"""
    from PIL import Image, ImageDraw, ImageFont

    base = cfg.src_dir / "assets" / "icon_base.png"
    if not base.exists():
        log("WARN 母版图标缺失: assets/icon_base.png，跳过图标生成")
        return
    font_path = "C:/Windows/Fonts/msyhbd.ttc"
    if not Path(font_path).exists():
        font_path = "C:/Windows/Fonts/simhei.ttf"
    label = cfg.tool  # 静态工具角标 = 工具名（如 数学口算）

    def render(size: int) -> Image.Image:
        with Image.open(base) as src:
            side = min(src.size)
            im = src.crop(((src.width - side) // 2, (src.height - side) // 2,
                           (src.width + side) // 2, (src.height + side) // 2))
            im = im.resize((size, size), Image.LANCZOS)
            font_size = max(16, size // 16)
            try:
                font = ImageFont.truetype(font_path, font_size)
            except OSError:
                font = ImageFont.load_default()
            d = ImageDraw.Draw(im, "RGBA")
            bbox = d.textbbox((0, 0), label, font=font)
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            pad_x, pad_y = font_size // 2, font_size // 4
            bar_w = tw + pad_x * 2
            bar_h = th + pad_y * 2
            bx0 = (size - bar_w) // 2
            by0 = size - bar_h - size // 20
            bx1, by1 = bx0 + bar_w, by0 + bar_h
            overlay = Image.new("RGBA", im.size, (0, 0, 0, 0))
            od = ImageDraw.Draw(overlay)
            od.rounded_rectangle([bx0, by0, bx1, by1], radius=bar_h // 2, fill=(0, 0, 0, 150))
            im = Image.alpha_composite(im.convert("RGBA"), overlay)
            ImageDraw.Draw(im).text(((size - tw) // 2, by0 + pad_y - bbox[1]),
                                    label, font=font, fill=(255, 255, 255, 255))
            return im.convert("RGB")

    render(128).save(out_dir / "assets" / "icon.png", "PNG", optimize=True)
    log(f"图标生成: assets/icon.png（角标「{label}」，128px，zip 内页面用）")
    if publish_dir:
        publish_dir.mkdir(parents=True, exist_ok=True)
        png_path = publish_dir / f"{app_name or cfg.app_name}-图标(1024).png"
        render(1024).save(png_path, "PNG", optimize=True)
        log(f"图标生成: {png_path.name}（角标「{label}」，1024px，上传用）")


def copy_static(cfg: ToolConfig, out_dir: Path) -> None:
    shutil.copytree(cfg.src_dir / "assets", out_dir / "assets", dirs_exist_ok=True)
    shutil.copy2(cfg.src_dir / "index.html", out_dir / "index.html")
    base = out_dir / "assets" / "icon_base.png"
    if base.exists():
        base.unlink()
    log("静态文件复制完成 (index.html + assets/)")


def badge_text(book: dict, unit_index: int) -> str:
    bookinfo = book.get("bookinfo", {})
    bookname = bookinfo.get("bookname", "")
    grade = term = ""
    for g in ("一年级", "二年级", "三年级", "四年级", "五年级", "六年级"):
        if g in bookname:
            grade = g[0]
            break
    for t in ("上册", "下册"):
        if t in bookname:
            term = t[0]
            break
    chapters = book.get("bookaudio_v3", [])
    title = chapters[unit_index].get("title", "") if unit_index < len(chapters) else ""
    unit_no = ""
    parts = title.split()
    for i, part in enumerate(parts):
        low = part.lower().strip(",：:()（）")
        if low == "unit" and i + 1 < len(parts):
            nxt = "".join(ch for ch in parts[i + 1] if ch.isdigit())
            if nxt:
                unit_no = f"Unit{int(nxt):02d}"
                break
        digits = "".join(ch for ch in part if ch.isdigit())
        if low.startswith("unit") and digits:
            unit_no = f"Unit{int(digits):02d}"
            break
    label = f"{grade}{term}".strip()
    if unit_no:
        label = f"{label} {unit_no}".strip()
    return label or "点读"


def make_icon(cfg: ToolConfig, book: dict, unit_index: int, out_dir: Path,
              publish_dir: Path | None = None, app_name: str | None = None) -> None:
    from PIL import Image, ImageDraw, ImageFont

    base = cfg.src_dir / "assets" / "icon_base.png"
    if not base.exists():
        log("WARN 母版图标缺失: assets/icon_base.png，跳过图标生成")
        return
    label = badge_text(book, unit_index)
    font_path = "C:/Windows/Fonts/msyhbd.ttc"
    if not Path(font_path).exists():
        font_path = "C:/Windows/Fonts/simhei.ttf"

    def render(size: int) -> Image.Image:
        with Image.open(base) as src:
            side = min(src.size)
            im = src.crop(((src.width - side) // 2, (src.height - side) // 2,
                           (src.width + side) // 2, (src.height + side) // 2))
            im = im.resize((size, size), Image.LANCZOS)
            font_size = max(16, size // 16)
            try:
                font = ImageFont.truetype(font_path, font_size)
            except OSError:
                font = ImageFont.load_default()
            d = ImageDraw.Draw(im, "RGBA")
            bbox = d.textbbox((0, 0), label, font=font)
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            pad_x, pad_y = font_size // 2, font_size // 4
            bar_w = tw + pad_x * 2
            bar_h = th + pad_y * 2
            bx0 = (size - bar_w) // 2
            by0 = size - bar_h - size // 20
            bx1, by1 = bx0 + bar_w, by0 + bar_h
            overlay = Image.new("RGBA", im.size, (0, 0, 0, 0))
            od = ImageDraw.Draw(overlay)
            od.rounded_rectangle([bx0, by0, bx1, by1], radius=bar_h // 2, fill=(0, 0, 0, 150))
            im = Image.alpha_composite(im.convert("RGBA"), overlay)
            ImageDraw.Draw(im).text(((size - tw) // 2, by0 + pad_y - bbox[1]),
                                    label, font=font, fill=(255, 255, 255, 255))
            return im.convert("RGB")

    render(128).save(out_dir / "assets" / "icon.png", "PNG", optimize=True)
    log(f"图标生成: assets/icon.png（角标「{label}」，128px，zip 内页面用）")
    if publish_dir:
        publish_dir.mkdir(parents=True, exist_ok=True)
        png_name = f"{app_name or cfg.app_name}-图标(1024).png"
        png_path = publish_dir / png_name
        render(1024).save(png_path, "PNG", optimize=True)
        log(f"图标生成: {png_path.name}（角标「{label}」，1024px，上传用）")


def package_zip(out_dir: Path, name: str) -> Path:
    zip_path = out_dir.parent / name
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(out_dir.rglob("*")):
            if f.is_file():
                zf.write(f, f.relative_to(out_dir).as_posix())
    return zip_path


def build_tool(cfg: ToolConfig, unit_index: int, pages: str | None = None,
               out_root: Path | None = None, publish_root: Path | None = None,
               publish: bool = True) -> Path | None:
    """构建单个工具单单元，返回 zip 路径。

    cfg.datasource:
      - 'book': 教材数据源（英语点读等），需 book/img_dir/audio_dir
      - 'static': 静态工具（数学口算等），无数据源，仅复制 src/
    """
    dist_dir = (out_root or cfg.dist_root) / cfg.tool
    pub_dir = publish_root or cfg.publish_root   # publish/<系列>/ 系列内平铺，不按工具细分
    if dist_dir.exists():
        shutil.rmtree(dist_dir)
    dist_dir.mkdir(parents=True)
    copy_static(cfg, dist_dir)

    if cfg.datasource == 'static':
        # 静态工具：无 book / 图片 / 音频，只生成 meta data.js
        app_name = resolve_app_name(cfg, None, unit_index)
        write_static_data_js(cfg, dist_dir, unit_index, app_name)
        if publish:
            make_static_icon(cfg, dist_dir, pub_dir, app_name)
    else:
        if not cfg.book.exists():
            raise SystemExit(f"book.json 不存在: {cfg.book}")
        book = load_book(cfg.book)
        start, end = resolve_unit_pages(book, unit_index, pages)
        log(f"[{cfg.series}/{cfg.tool}] 单元 {unit_index} 页码范围: {start}..{end - 1}")

        unit = build_unit_data(book, unit_index, start, end)
        if not unit["pages"]:
            raise SystemExit("未提取到任何页面数据")
        for p in unit["pages"]:
            for t in p["tracks"]:
                if not t.get("track_index"):
                    raise SystemExit(f"page {p['no']} 存在缺失 track_index 的 track: {t.get('text')}")

        app_name = resolve_app_name(cfg, book, unit_index)
        convert_images(unit["pages"], start, dist_dir, cfg.img_dir)
        convert_audio(unit, dist_dir, cfg.audio_dir)
        if publish:
            make_icon(cfg, book, unit_index, dist_dir, pub_dir, app_name)
        write_data_js(unit, cfg, book, dist_dir, unit_index, app_name)

    zip_path = package_zip(dist_dir, f"{app_name}.zip")
    # zip 复制到发布目录（系列公共目录）
    if publish:
        pub_dir.mkdir(parents=True, exist_ok=True)
        dest = pub_dir / zip_path.name
        shutil.copy2(zip_path, dest)
        log(f"发布 zip 复制: {dest}")
    log(f"zip 打包完成: {zip_path} ({zip_path.stat().st_size / 1024 / 1024:.2f} MiB)")
    return zip_path


def main() -> int:
    parser = argparse.ArgumentParser(description="RedTools 小工具构建（框架入口）")
    parser.add_argument("--series", default="学科")
    parser.add_argument("--tool", required=True)
    parser.add_argument("--book", type=Path, default=None)
    parser.add_argument("--unit", type=int, default=0)
    parser.add_argument("--pages", default=None)
    args = parser.parse_args()

    from tools import TOOLS
    if args.tool not in TOOLS:
        raise SystemExit(f"未知工具: {args.tool}，可用: {list(TOOLS)}")
    cfg = TOOLS[args.tool]
    if args.book:
        cfg.book = args.book
    build_tool(cfg, args.unit, args.pages)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
