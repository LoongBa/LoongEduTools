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
import re as _re
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
    series: str                      # 系列名（中文目录，如 学科 / 益智）
    tool: str                        # 工具名（中文目录，如 英语点读 / 舒尔特方格）
    subgroup: str | None = None      # 子系列目录（可选，如 益智 下的 专注力）
    version: str = "1.0"
    datasource: str = "book"         # 'book'（教材数据）| 'static'（静态工具，无数据源）| 'chengyu'（成语词库工具）| 'vocab'（PEP 词汇表工具）
    book: Path | None = None         # book.json 路径
    img_dir: Path | None = None      # 页面图素材目录
    redrawn_img_dir: Path | None = None  # 重绘图目录（优先使用，无则回退 img_dir）
    hotzone_dir: Path | None = None  # 热区校正文件目录（可选；构建时查找 热区校正_<单元标题>.json 覆盖 book.json 热区坐标）
    audio_dir: Path | None = None    # 单句音频素材目录
    vocab_dir: Path | None = None    # PEP 词汇表素材根目录（datasource='vocab' 时：F:\_教材素材\人教版（PEP）（主编：吴欣））
    chengyu_data: Path | None = None # 成语词库 json 路径（datasource='chengyu' 时默认 <系列>/_shared/成语词库/成语词库.json）
    app_name: str | None = None      # zip/图标文件名（默认 {tool}；app_name_template 为空时用）
    app_name_template: str | None = None  # 按单元动态命名，如 "新英语四上点读{unit_no}单元"
    default_unit: int = 0            # 默认构建单元下标（bookaudio_v3）
    tool_dir: Path | None = field(default=None, repr=False)   # 自动填充
    src_dir: Path | None = field(default=None, repr=False)
    dist_root: Path | None = field(default=None, repr=False)
    publish_root: Path | None = field(default=None, repr=False)

    def __post_init__(self) -> None:
        series_dir = ROOT / "series" / self.series
        # 子系列：series/<系列>/<子系列>/<工具>/；无子系列时保持 series/<系列>/<工具>/
        self.tool_dir = series_dir / self.subgroup / self.tool if self.subgroup else series_dir / self.tool
        self.src_dir = self.tool_dir / "src"
        self.dist_root = ROOT / "dist" / self.series
        self.publish_root = ROOT / "publish" / self.series
        if self.chengyu_data is None and self.datasource == 'chengyu':
            # 成语词库默认位置：系列内共享 <系列>/_shared/成语词库/成语词库.json
            self.chengyu_data = series_dir / "_shared" / "成语词库" / "成语词库.json"
        if not self.app_name:
            self.app_name = self.tool


def resolve_unit_no(book: dict | None, unit_index: int) -> str | int:
    """解析单元序号/章节类型标识（供 app_name 模板 {unit_no} 替换）：
    - book 为 None（静态工具）→ unit_index + 1
    - "Unit 3 ..." → 3
    - "Revision ..." → "复习"
    - "Appendix N ..." → "附录N"（无编号 → "附录"）
    - 其他 → unit_index + 1
    与 build_framework 产物命名同源；工作台服务端 app_name 计算复用此函数。
    """
    if book is None:
        return unit_index + 1
    chapters = book.get("bookaudio_v3", [])
    title = chapters[unit_index].get("title", "") if unit_index < len(chapters) else ""
    import re as _re
    # "Unit 3 ..." → 3
    m = _re.search(r"Unit\s*(\d+)", title, _re.IGNORECASE)
    if m:
        return int(m.group(1))
    # 复习/附录：Revision → "复习"；Appendix N → "附录N"
    low = title.lower()
    if low.startswith("revision"):
        return "复习"
    if low.startswith("appendix"):
        am = _re.search(r"Appendix\s*(\d+)", title, _re.IGNORECASE)
        return f"附录{am.group(1)}" if am else "附录"
    return unit_index + 1


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
        unit_no = resolve_unit_no(book, unit_index)
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


def load_hotzone_corrections(cfg: ToolConfig, book: dict, unit_index: int) -> dict | None:
    """按单元标题查找热区校正文件（hotzone_editor 导出）。

    文件名约定：`热区校正_<bookaudio_v3[unit_index].title>.json`，如
    `热区校正_Unit 1 Helping at home.json`（导出时可能把空格替换为下划线）。
    返回原始内容（含 pages: {page: {track_index: {left,top,right,bottom}}}），
    找不到或无配置时返回 None。
    """
    if not cfg.hotzone_dir:
        return None
    chapters = book.get("bookaudio_v3", [])
    if unit_index >= len(chapters):
        return None
    title = chapters[unit_index].get("title", "")
    if not title:
        return None

    def try_load(path: Path):
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            n_pages = len(data.get("pages", {}))
            n_tracks = sum(len(v) for v in data.get("pages", {}).values())
            log(f"热区校正: {path.name}（{n_pages} 页 {n_tracks} 条）")
            return data
        except Exception as e:
            log(f"WARN 热区校正文件解析失败: {path.name}: {e}")
            return None

    # 1) 精确候选：标题原样 / 空格→下划线 / 去空格（扫两处：hotzone_dir + hotzone_dir/_重绘图片素材）
    search_dirs = [cfg.hotzone_dir]
    if cfg.hotzone_dir and (cfg.hotzone_dir / "_重绘图片素材").exists():
        search_dirs.append(cfg.hotzone_dir / "_重绘图片素材")
    for base in search_dirs:
        for variant in {title, title.strip(), title.replace(" ", "_"), title.replace(" ", "")}:
            data = try_load(base / f"热区校正_{variant}.json")
            if data is not None:
                return data
        # 2) 宽松扫描：归一化（去空格/下划线）后与标题一致
        if base.exists():
            norm = title.replace(" ", "").replace("_", "")
            for f in base.glob("热区校正_*.json"):
                stem = f.stem[len("热区校正_"):]
                if stem.replace(" ", "").replace("_", "") == norm:
                    return try_load(f)
    return None


def build_unit_data(book: dict, unit_index: int, start: int, end: int,
                    hotzone: dict | None = None) -> dict:
    chapters = book.get("bookaudio_v3", [])
    chapter = chapters[unit_index] if unit_index < len(chapters) else {}
    title = chapter.get("title", f"Unit {unit_index + 1}")
    subtitle = ""
    page_by_no = {p["page_no"]: p for p in book["bookpage"]}
    hotzone_pages = (hotzone or {}).get("pages", {})
    hotzone_deleted = (hotzone or {}).get("deleted", {})  # {page_no: [track_index,...]} 已删除热区
    pages = []
    for page_no in range(start, end):
        page = page_by_no.get(page_no)
        if not page:
            continue
        track_list = page.get("track_info") or []
        deleted_idx = set(hotzone_deleted.get(str(page_no), []))
        page_tracks = []
        for t in track_list:
            ti = int(t.get("track_index", 0))
            if ti in deleted_idx:
                continue  # 热区校正中标记删除的条目，跳过
            audio_key = f"p{page_no:03d}_{ti:02d}"
            # 热区校正覆盖（按 page + track_index 精确匹配，只覆盖校正过的条目）
            corr = hotzone_pages.get(str(page_no), {}).get(str(ti))
            if corr:
                left = round(float(corr.get("left", t.get("track_left", 0))), 4)
                top = round(float(corr.get("top", t.get("track_top", 0))), 4)
                right = round(float(corr.get("right", t.get("track_right", 1))), 4)
                bottom = round(float(corr.get("bottom", t.get("track_bottom", 1))), 4)
            else:
                left = round(float(t.get("track_left", 0)), 4)
                top = round(float(t.get("track_top", 0)), 4)
                right = round(float(t.get("track_right", 1)), 4)
                bottom = round(float(t.get("track_bottom", 1)), 4)
            item = {
                "text": t.get("track_text", ""),
                "cn": t.get("track_genre", ""),
                "audio": audio_key,
                "left": left,
                "top": top,
                "right": right,
                "bottom": bottom,
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


def convert_images(pages: list[dict], start: int, out_dir: Path, img_dir: Path, redrawn_img_dir: Path | None = None) -> None:
    from PIL import Image

    imgs_dir = out_dir / "images"
    imgs_dir.mkdir(parents=True, exist_ok=True)
    for page_no in range(start, start + len(pages)):
        # 优先使用重绘图，没有则回退原图
        if redrawn_img_dir:
            src = redrawn_img_dir / f"Page_{page_no:03d}.png"
        else:
            src = None
        if not src or not src.exists():
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


def find_source_audio(audio_dir: Path, page_no: int, track: dict,
                      fallback_dir: Path | None = None) -> Path | None:
    """查找单句音频：主 audio_dir 优先，缺失回退 fallback_dir。

    fallback_dir 用于「TTS 重读音频（_重读音频素材）优先，原版音频兜底」模式：
    已合成的单元用 TTS 版，未合成的自动用原录音，逐单元渐进替换零风险。
    """
    idx = track.get("track_index")
    pattern = f"P{page_no:03d}_{idx:02d}_*.mp3" if idx else f"P{page_no:03d}_*.mp3"
    for d in (audio_dir, fallback_dir):
        if not d or not d.exists():
            continue
        matches = sorted(d.glob(pattern))
        if matches:
            return matches[0]
    return None


def convert_audio(unit: dict, out_dir: Path, audio_dir: Path) -> None:
    audio_out = out_dir / "audio"
    audio_out.mkdir(parents=True, exist_ok=True)
    # 回退目录：主目录为 <册>/_重读音频素材/单句音频 时，同级 <册>/_音频素材/单句音频 兜底
    fallback_dir: Path | None = None
    if audio_dir.name == "单句音频" and audio_dir.parent.name == "_重读音频素材":
        book_root = audio_dir.parent.parent  # <册>/
        sibling = book_root / "_音频素材" / "单句音频"
        if sibling != audio_dir and sibling.exists():
            fallback_dir = sibling
    for page in unit["pages"]:
        for t in page["tracks"]:
            key = t["audio"]
            dst = audio_out / f"{key}.js"
            if dst.exists():
                continue
            src = find_source_audio(audio_dir, page["no"], t, fallback_dir)
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


def fmt_local(ts: float | None) -> str:
    """时间戳 → 本地 'yyyy-MM-dd HH:mm'（独立时间标记，小字显示用）"""
    if not ts:
        return ""
    import datetime
    return datetime.datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M")


def data_source_times(cfg: ToolConfig, unit_title: str | None = None) -> tuple[float | None, float | None]:
    """图片数据最新 mtime + 热区校正文件最新 mtime。

    unit_title 传入时，热区时间只匹配该单元的校正文件（按标题归一化）；
    否则取 hotzone_dir 下全部校正文件 max（兼容无单元上下文的调用）。
    用于发布状态检查与点读工具独立时间标记（与版本号分离）。
    """
    img_mt: float | None = None
    for d in (cfg.redrawn_img_dir, cfg.img_dir):
        if d and d.exists():
            fs = [f for f in d.glob("*.png") if f.is_file()]
            if fs:
                m = max(f.stat().st_mtime for f in fs)
                img_mt = m if img_mt is None else max(img_mt, m)
    hz_mt: float | None = None
    bases = []
    if cfg.hotzone_dir:
        bases = [cfg.hotzone_dir]
        if (cfg.hotzone_dir / "_重绘图片素材").exists():
            bases.append(cfg.hotzone_dir / "_重绘图片素材")
    for base in bases:
        if not base.exists():
            continue
        if unit_title:
            norm = unit_title.replace(" ", "").replace("_", "")
            for f in base.glob("热区校正_*.json"):
                stem = f.stem[len("热区校正_"):]
                if stem.replace(" ", "").replace("_", "") == norm:
                    m = f.stat().st_mtime
                    hz_mt = m if hz_mt is None else max(hz_mt, m)
        else:
            for f in base.glob("热区校正_*.json"):
                m = f.stat().st_mtime
                hz_mt = m if hz_mt is None else max(hz_mt, m)
    return img_mt, hz_mt


def write_data_js(unit: dict, cfg: ToolConfig, book: dict, out_dir: Path, unit_index: int,
                  app_name: str | None = None) -> None:
    bookinfo = book.get("bookinfo", {})
    img_mt, hz_mt = data_source_times(cfg, unit_title=unit.get("title"))
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
            # 独立时间标记（与版本分离；只显示时间，用于确认数据是否最新）
            "img_updated_at": fmt_local(img_mt),
            "hotzone_updated_at": fmt_local(hz_mt),
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


def write_chengyu_data_js(cfg: ToolConfig, out_dir: Path, unit_index: int, app_name: str) -> None:
    """成语词库工具（看图猜成语/成语接龙）：
    - meta（同静态工具）+ 共享成语词库 window.CHENGYU_DATA
    - 预建接龙索引 window.CHENGYU_CHAIN：{尾字: [以该字开头的成语...]}（课本+扩展全量）
    词库来源：cfg.chengyu_data（默认 <系列>/_shared/成语词库/成语词库.json）。
    """
    import json as _json

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
    if not cfg.chengyu_data or not cfg.chengyu_data.exists():
        raise SystemExit(f"成语词库不存在: {cfg.chengyu_data}")
    data = _json.loads(cfg.chengyu_data.read_text(encoding="utf-8"))
    # 接龙索引：首字 → 以该字开头的成语（课本 + 接龙扩展全量，按拼音排序保证确定性）。
    # 接龙规则：当前成语尾字 X → 候选 = chain.get(X)（以 X 开头的成语）；无候选 = 死路。
    chain: dict[str, list[str]] = {}
    for e in data.get("课本", []) + data.get("接龙扩展", []):
        chain.setdefault(e["首字"], []).append(e["成语"])
    for k in chain:
        chain[k].sort()

    js = (
        "window.APP_DATA = " + _json.dumps(app_data, ensure_ascii=False, indent=1) + ";\n"
        "window.CHENGYU_DATA = " + _json.dumps(data, ensure_ascii=False, indent=1) + ";\n"
        "window.CHENGYU_CHAIN = " + _json.dumps(chain, ensure_ascii=False, indent=1) + ";\n"
    )
    (out_dir / "data.js").write_text(js, encoding="utf-8")
    log(f"data.js 写入（成语词库工具，{len(js) / 1024:.0f} KB，课本 {len(data.get('课本', []))} 条 + 扩展 {len(data.get('接龙扩展', []))} 条，接龙索引首字 {len(chain)} 个）")


# ---------------- PEP 词汇表（打字背单词） ----------------
# 词汇表素材：F:\_教材素材\人教版（PEP）（主编：吴欣）\<年级>\<册次>\_音频素材\
#   - 9 册：*Words_in_each_unit_en_cn.txt（独立词汇表，单词行 + 中文释义行 + 空行，Unit N 标题分隔）
#   - 三下/五上：整册 <册名>_en_cn.txt 中 "Words in each unit" 区块（格式一致，至 "Useful expressions" 结束）
# 统一解析规则：非空行两两配对（第1行=英文单词，第2行=中文释义），跳过标题行。

# 11 册清单（年级, 册次, 词汇表文件 glob, 是否整册提取区块）
# 注意：三下/五上/五下无独立"单元词汇表"文件（独立 Words 文件实际是字母序 Vocabulary 或缺失），
#       单元词汇表在整册 <册名>_en_cn.txt 的 "Words in each unit" 区块中。
VOCAB_BOOKS: list[tuple[str, str, str, bool]] = [
    ("一年级", "上册", "*Words_in_each_unit_en_cn.txt", False),
    ("一年级", "下册", "*Words_in_each_unit_en_cn.txt", False),
    ("二年级", "上册", "*Words_in_each_unit_en_cn.txt", False),
    ("二年级", "下册", "*Words_in_each_unit_en_cn.txt", False),
    ("三年级", "上册", "*Words_in_each_unit_en_cn.txt", False),
    ("三年级", "下册", "*三年级*下册*_en_cn.txt", True),     # 无独立词汇表，取整册区块
    ("四年级", "上册", "*Words_in_each_unit_en_cn.txt", False),
    ("四年级", "下册", "*Words_in_each_unit_en_cn.txt", False),
    ("五年级", "上册", "*五年级*上册*_en_cn.txt", True),      # 无独立词汇表，取整册区块
    ("五年级", "下册", "*五年级*下册*_en_cn.txt", True),      # 独立 Words 文件为字母序 Vocabulary，单元表在整册
    ("六年级", "上册", "*Words_in_each_unit_en_cn.txt", False),
]

# 标题行（跳过）：Appendix / 附录 / Words in each unit / 单元词汇表 / Unit N / 第N单元
_VOCAB_SKIP_RE = _re.compile(
    r"^(Appendix\s*\d*|附录\s*\d*|Words in each unit|单元词汇表|"
    r"Unit\s*\d+|第[一二三四五六七八九十\d]+单元)$",
    _re.IGNORECASE,
)
# 区块结束标记：整册 txt 中词汇表区块后紧跟字母序 Vocabulary / 常用表达法 / 语音 等
_VOCAB_END_RE = _re.compile(
    r"^(Appendix\s*\d*|附录\s*\d*|Vocabulary|词汇表|"
    r"Useful expressions|常用表达法|Pronunciation|语音|"
    r"Irregular verbs|不规则动词|The alphabet|字母表)$",
    _re.IGNORECASE,
)


def _clean_cn(cn: str) -> str:
    """清理中文释义：剥离首尾空白、剥离去声调音标/复数注释前缀（如 （复数children） 儿童；小孩 → 儿童；小孩）。"""
    cn = cn.strip()
    # 剥离形如 （复数children） （复数leaves /liːvz/） 等括号前缀注释
    m = _re.match(r"^（[^）]*[a-zA-Z][^）]*）\s*(.+)$", cn)
    if m:
        cn = m.group(1).strip()
    return cn


def _clean_word(word: str) -> str:
    """清理英文单词：剥离星号标记（教材听力/重点词汇标记 *）、HTML 标签（<i>pl.</i> 等）、
    尾部括号复数注释（tooth (pl. teeth) → tooth）。"""
    w = word.strip()
    w = _re.sub(r"<[^>]+>", "", w).strip()      # HTML 标签
    w = w.lstrip("*").strip()                    # 星号标记
    m = _re.match(r"^(.+?)\s*[（(][^）)]*[）)]\s*$", w)  # 尾部括号注释
    if m:
        w = m.group(1).strip()
    return w


def _parse_vocab_lines(lines: list[str]) -> list[dict]:
    """解析词汇表行列表（已按区块裁剪），返回 [{unit, word, cn}]。

    规则：非空行两两配对（第1行=英文单词，第2行=中文释义）；跳过标题行；
    单元标题行（Unit N / 第N单元）作为单元分隔。释义清理括号注释前缀。
    """
    entries: list[dict] = []
    unit = 0
    pending_word: str | None = None
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        if _VOCAB_SKIP_RE.match(line):
            if _re.match(r"^Unit\s*\d+$", line, _re.IGNORECASE):
                unit = int(_re.search(r"\d+", line).group(0))
            continue
        # 配对：英文单词行（含字母）或中文释义行
        if pending_word is None:
            # 首行应为英文单词（含英文字母）
            if _re.search(r"[a-zA-Z]", line):
                pending_word = _clean_word(line)
        else:
            entries.append({"unit": unit, "word": pending_word, "cn": _clean_cn(line)})
            pending_word = None
    # 末尾未配对行丢弃（解析容错）
    return entries


def _load_vocab_book(vocab_dir: Path, grade: str, term: str, pattern: str,
                     from_full_book: bool) -> dict:
    """加载一册词汇表，返回 {grade, term, book, units:[{unit, words:[{word, cn}]}]}。"""
    book_dir = vocab_dir / grade / term / "_音频素材"
    if not book_dir.exists():
        raise SystemExit(f"词汇表目录不存在: {book_dir}")
    matches = sorted(book_dir.glob(pattern))
    if not matches:
        raise SystemExit(f"词汇表文件缺失: {grade}/{term} pattern={pattern}")
    src_path = matches[0]

    if from_full_book:
        # 整册 txt：定位 "Words in each unit" 区块，至 Useful expressions 结束
        lines = src_path.read_text(encoding="utf-8", errors="replace").splitlines()
        start = None
        for i, ln in enumerate(lines):
            if ln.strip() == "Words in each unit":
                start = i + 1
                break
        if start is None:
            raise SystemExit(f"{src_path.name} 中未找到 Words in each unit 区块")
        end = len(lines)
        for i in range(start, len(lines)):
            if _VOCAB_END_RE.match(lines[i].strip()):
                end = i
                break
        entries = _parse_vocab_lines(lines[start:end])
    else:
        text = src_path.read_text(encoding="utf-8", errors="replace")
        entries = _parse_vocab_lines(text.splitlines())

    if not entries:
        raise SystemExit(f"{src_path.name} 词汇表解析为空")

    # 按单元分组
    units: list[dict] = []
    cur: dict | None = None
    for e in entries:
        if cur is None or e["unit"] != cur["unit"]:
            cur = {"unit": e["unit"], "words": []}
            units.append(cur)
        cur["words"].append({"word": e["word"], "cn": e["cn"]})
    # 单元序号保序排序
    units.sort(key=lambda u: u["unit"])
    return {"grade": grade, "term": term, "book": f"英语（PEP）{grade}{term}", "units": units}


def write_vocab_data_js(cfg: ToolConfig, out_dir: Path, unit_index: int,
                        app_name: str) -> None:
    """打字背单词：解析 PEP 11 册词汇表 → window.APP_DATA.books（数据驱动按册构建）。"""
    if not cfg.vocab_dir or not cfg.vocab_dir.exists():
        raise SystemExit(f"vocab_dir 不存在: {cfg.vocab_dir}")
    books = []
    total_words = 0
    for grade, term, pattern, from_full in VOCAB_BOOKS:
        book = _load_vocab_book(cfg.vocab_dir, grade, term, pattern, from_full)
        n = sum(len(u["words"]) for u in book["units"])
        total_words += n
        books.append(book)
        log(f"  词汇表 {grade}{term}: {len(book['units'])} 单元 / {n} 词")

    app_data = {
        "meta": {
            "name": app_name,
            "version": cfg.version,
            "series": cfg.series,
            "tool": cfg.tool,
            "book": "人教版（PEP）小学英语 1-6 年级",
            "bookid": "",
            "bookid_3rd": "",
            "unit_index": unit_index,
        },
        "books": books,
    }
    js = "window.APP_DATA = " + json.dumps(app_data, ensure_ascii=False, indent=1) + ";\n"
    (out_dir / "data.js").write_text(js, encoding="utf-8")
    log(f"data.js 写入（词汇表工具，{len(js) / 1024:.0f} KB，{len(books)} 册 / {total_words} 词）")


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
      - 'chengyu': 成语词库工具（看图猜成语/成语接龙），复制 src/ + 注入共享成语词库 data.js
    """
    dist_dir = (out_root or cfg.dist_root) / cfg.tool
    pub_dir = publish_root or cfg.publish_root   # publish/<系列>/ 系列内平铺，不按工具细分
    unit = None   # 仅 datasource='book' 时赋值（静态/成语/词汇表工具无单元数据）
    if dist_dir.exists():
        shutil.rmtree(dist_dir)
    dist_dir.mkdir(parents=True)
    copy_static(cfg, dist_dir)

    if cfg.datasource in ('static', 'chengyu', 'vocab'):
        # 静态/成语词库/词汇表工具：无 book / 图片 / 音频
        app_name = resolve_app_name(cfg, None, unit_index)
        if cfg.datasource == 'chengyu':
            write_chengyu_data_js(cfg, dist_dir, unit_index, app_name)
        elif cfg.datasource == 'vocab':
            write_vocab_data_js(cfg, dist_dir, unit_index, app_name)
        else:
            write_static_data_js(cfg, dist_dir, unit_index, app_name)
        if publish:
            make_static_icon(cfg, dist_dir, pub_dir, app_name)
    else:
        if not cfg.book.exists():
            raise SystemExit(f"book.json 不存在: {cfg.book}")
        book = load_book(cfg.book)
        start, end = resolve_unit_pages(book, unit_index, pages)
        log(f"[{cfg.series}/{cfg.tool}] 单元 {unit_index} 页码范围: {start}..{end - 1}")

        hotzone = load_hotzone_corrections(cfg, book, unit_index)
        unit = build_unit_data(book, unit_index, start, end, hotzone)
        if not unit["pages"]:
            raise SystemExit("未提取到任何页面数据")
        for p in unit["pages"]:
            for t in p["tracks"]:
                if not t.get("track_index"):
                    raise SystemExit(f"page {p['no']} 存在缺失 track_index 的 track: {t.get('text')}")

        app_name = resolve_app_name(cfg, book, unit_index)
        convert_images(unit["pages"], start, dist_dir, cfg.img_dir, cfg.redrawn_img_dir)
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
        # 解压测试版：每次构建后解压覆盖（双击 index.html 即测，与 zip 同目录平铺）
        extract_dir = pub_dir / f"{app_name}_解压测试版"
        if extract_dir.exists():
            shutil.rmtree(extract_dir)
        extract_dir.mkdir(parents=True)
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(extract_dir)
        log(f"解压测试版: {extract_dir}")
    log(f"zip 打包完成: {zip_path} ({zip_path.stat().st_size / 1024 / 1024:.2f} MiB)")

    # 发布状态检查：版本 / 图片是否最新 / 热区是否最新
    if publish:
        zip_mt = zip_path.stat().st_mtime
        unit_title = unit.get("title") if unit else None
        img_mt, hz_mt = data_source_times(cfg, unit_title=unit_title)
        img_s, hz_s = fmt_local(img_mt), fmt_local(hz_mt)
        status = (f"发布状态: 版本 {cfg.version} | 图片 {img_s or '无'} "
                  f"| 热区 {hz_s or '无'} | 构建 {fmt_local(zip_mt)}")
        if img_mt and img_mt > zip_mt + 1:
            status += " | ⚠️ 图片晚于构建（产物非最新）"
        if hz_mt and hz_mt > zip_mt + 1:
            status += " | ⚠️ 热区晚于构建（产物非最新）"
        log(status)
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
