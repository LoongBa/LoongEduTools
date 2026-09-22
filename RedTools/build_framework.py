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
    # ---- 双模式骨架（V0.2）新增字段，全部带默认值向后兼容 ----
    modes: list[str] = field(default_factory=lambda: ["offline"])  # ["offline"] | ["offline","online"]
    free_units: int | None = None   # 离线免费章节数（None=全部；offline 构建时截取 content）
    shared_js: bool = True          # 是否合并 _shared/js 公共模块（lx-shared.js）
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
    - "Revision ..." → "复习"；"Recycle N ..." → "复习N"（PEP 含 Recycle 单元）
    - "Appendix N ..." → "附录N"（无编号 → "附录"）
    - 其他 → unit_index + 1
    与 build_framework 产物命名同源；工作台服务端 app_name 计算复用此函数。
    """
    if book is None:
        return unit_index + 1
    chapters = book.get("bookaudio_v3", [])
    title = chapters[unit_index].get("title", "") if unit_index < len(chapters) else ""
    # "Unit 3 ..." → 3
    m = _re.search(r"Unit\s*(\d+)", title, _re.IGNORECASE)
    if m:
        return int(m.group(1))
    # 复习/附录：Revision → "复习"；Recycle N → "复习N"；Appendix N → "附录N"
    low = title.lower()
    if low.startswith("revision"):
        return "复习"
    if low.startswith("recycle"):
        rm = _re.search(r"Recycle\s*(\d+)", title, _re.IGNORECASE)
        return f"复习{rm.group(1)}" if rm else "复习"
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
                # 内部标记：该坐标来自热区校正覆盖（供 validate_hotzones 溯源；序列化前剥离）
                "_from_correction": bool(corr),
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


def _resolve_audio_dirs(audio_dir: Path) -> tuple[Path, Path | None]:
    """解析音频目录 + 回退目录：
    - 主目录为 <册>/_重读音频素材/单句音频 时，同级 <册>/_音频素材/单句音频 兜底（TTS 重读优先、原版兜底）
    - 其他路径无回退（直接用主目录）
    convert_audio 与 validate_audio_coverage 共用，保证口径一致。"""
    fallback: Path | None = None
    if audio_dir.name == "单句音频" and audio_dir.parent.name == "_重读音频素材":
        book_root = audio_dir.parent.parent  # <册>/
        sibling = book_root / "_音频素材" / "单句音频"
        if sibling != audio_dir and sibling.exists():
            fallback = sibling
    return audio_dir, fallback


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


def validate_hotzones(unit: dict) -> list[dict]:
    """校验单元最终产物（post-correction）热区坐标合法性。

    unit = build_unit_data() 返回值（已是校正后坐标，仅校验打进包的这份）。
    返回异常列表 [{page, track, kind, detail, from_correction}]：
      out_of_range — left/top/right/bottom 超出 [0,1]
      inverted     — right<=left 或 bottom<=top
      zero_area    — 面积 <= 1e-6
      corrupt      — 坐标非数值
    from_correction: True=该坐标来自热区校正覆盖（便于编辑器定位上游）
    """
    issues: list[dict] = []
    for page in unit.get("pages", []):
        pno = page.get("no")
        for t in page.get("tracks", []):
            ti = t.get("track_index")
            corr = bool(t.get("_from_correction"))
            try:
                left = float(t.get("left"))
                top = float(t.get("top"))
                right = float(t.get("right"))
                bottom = float(t.get("bottom"))
            except (TypeError, ValueError):
                issues.append({"page": pno, "track": ti, "kind": "corrupt",
                               "detail": "坐标非数值", "from_correction": corr})
                continue
            if not (0.0 <= left <= 1.0 and 0.0 <= top <= 1.0
                    and 0.0 <= right <= 1.0 and 0.0 <= bottom <= 1.0):
                issues.append({"page": pno, "track": ti, "kind": "out_of_range",
                               "detail": f"left={left} top={top} right={right} bottom={bottom}",
                               "from_correction": corr})
            elif right <= left or bottom <= top:
                issues.append({"page": pno, "track": ti, "kind": "inverted",
                               "detail": f"right={right} left={left} bottom={bottom} top={top}",
                               "from_correction": corr})
            elif (right - left) * (bottom - top) <= 1e-6:
                # 宽度/高度均非负（倒置已在上方排除），面积 <= 阈值 → 退化矩形
                issues.append({"page": pno, "track": ti, "kind": "zero_area",
                               "detail": f"w={right - left:.6f} h={bottom - top:.6f}",
                               "from_correction": corr})
    return issues


def validate_audio_coverage(unit: dict, audio_dir: Path) -> dict:
    """校验单元音频覆盖矩阵（与 convert_audio 完全同口径：_resolve_audio_dirs + find_source_audio）。

    返回 {total_tracks, missing_audio: [{page, track, key}], ok: bool}
    不重新实现 glob 匹配——直接调 find_source_audio 判存在性。
    """
    primary, fallback = _resolve_audio_dirs(audio_dir)
    total = 0
    missing: list[dict] = []
    for page in unit.get("pages", []):
        pno = page.get("no")
        for t in page.get("tracks", []):
            total += 1
            src = find_source_audio(primary, pno, t, fallback)
            if not src:
                missing.append({"page": pno, "track": t.get("track_index"),
                                "key": t.get("audio")})
    return {"total_tracks": total, "missing_audio": missing, "ok": not missing}


def validate_page_completeness(book: dict, unit: dict, start: int, end: int,
                               img_dir: Path, redrawn_img_dir: Path | None = None) -> dict:
    """校验单元书页完整性。
    missing_pages: range(start,end) 中 book["bookpage"] 缺 page_no（对 book 判——unit 已被过滤）
    zero_track_pages: unit["pages"] 中 len(tracks)==0
    redrawn_missing_imgs: 重绘缺但原版兜底（WARN 级，不入 strict 桶）
    both_missing_imgs: 双缺（ERROR 级，strict 必触发；即 convert_images 会 continue 跳过的页集）
    返回 {missing_pages, zero_track_pages, redrawn_missing_imgs, both_missing_imgs, total_pages, ok}
    """
    page_by_no = {p["page_no"]: p for p in book["bookpage"]}
    missing, zero, redr_miss, both_miss = [], [], [], []
    for page_no in range(start, end):
        if page_no not in page_by_no:
            missing.append(page_no)
            continue
    for p in unit.get("pages", []):
        if not p.get("tracks"):
            zero.append(p.get("no"))
    # Oracle B1：分别判两目录（不能用 (redrawn_img_dir or img_dir) 只查一个目录），
    # 与 convert_images 回退顺序一致：重绘优先，缺则原版兜底
    for p in unit.get("pages", []):
        pno = p.get("no")
        redr_ok = bool(redrawn_img_dir and (Path(redrawn_img_dir) / f"Page_{pno:03d}.png").exists())
        orig_ok = bool(img_dir and (Path(img_dir) / f"Page_{pno:03d}.png").exists())
        if not redr_ok and not orig_ok:
            both_miss.append(pno)
        elif redrawn_img_dir and not redr_ok and orig_ok:
            redr_miss.append(pno)
    return {"missing_pages": missing, "zero_track_pages": zero, "redrawn_missing_imgs": redr_miss,
            "both_missing_imgs": both_miss, "total_pages": len(unit.get("pages", [])),
            "ok": not (missing or both_miss or zero)}


def convert_audio(unit: dict, out_dir: Path, audio_dir: Path) -> None:
    audio_out = out_dir / "audio"
    audio_out.mkdir(parents=True, exist_ok=True)
    # 回退目录：主目录为 <册>/_重读音频素材/单句音频 时，同级 <册>/_音频素材/单句音频 兜底
    primary_dir, fallback_dir = _resolve_audio_dirs(audio_dir)
    for page in unit["pages"]:
        for t in page["tracks"]:
            key = t["audio"]
            dst = audio_out / f"{key}.js"
            if dst.exists():
                continue
            src = find_source_audio(primary_dir, page["no"], t, fallback_dir)
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
                  app_name: str | None = None, mode: str = "offline") -> None:
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
            # V0.4 P4：双模式契约字段（对齐 write_static_data_js）
            "mode": mode,
            "free_units": cfg.free_units,
            "api_version": "v0",
            # 独立时间标记（与版本分离；只显示时间，用于确认数据是否最新）
            "img_updated_at": fmt_local(img_mt),
            "hotzone_updated_at": fmt_local(hz_mt),
        },
        "units": [unit],
    }
    # 剥离内部标记（_from_correction 仅供校验溯源，不进产物 data.js）
    def _strip_internal(obj):
        if isinstance(obj, dict):
            return {k: _strip_internal(v) for k, v in obj.items() if not k.startswith("_")}
        if isinstance(obj, list):
            return [_strip_internal(x) for x in obj]
        return obj
    app_data["units"] = [_strip_internal(u) for u in app_data["units"]]
    js = "window.APP_DATA = " + json.dumps(app_data, ensure_ascii=False, indent=1) + ";\n"
    (out_dir / "data.js").write_text(js, encoding="utf-8")
    log(f"data.js 写入 ({len(js)} 字节, {len(unit['pages'])} 页, "
        f"{sum(len(p['tracks']) for p in unit['pages'])} 热区)")


def write_static_data_js(cfg: ToolConfig, out_dir: Path, unit_index: int, app_name: str,
                         mode: str = "offline") -> None:
    """静态工具：写 meta + content（V0.2 双模式扩展）。
    - meta.mode = 'offline'|'online'
    - content：offline 时截取前 cfg.free_units 条（若 src/content.js 提供）；
      online 时全量。content 来源优先 src/content.js（window.CONTENT_DATA），
      否则为空数组（静态工具如 24点/涂色 无章节概念，content=[]）。
    """
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
            "mode": mode,
            "free_units": cfg.free_units,
            "api_version": "v0",
        },
        "units": [],
        "content": [],
    }
    # content：若 src 提供 content.js（window.CONTENT_DATA），按 mode 切分
    # 实现：JS 文件不能按 Python 语法编译（注释符不同），改用「剥离注释 + 正则提取 JSON 数组」
    content_js = cfg.src_dir / "content.js"
    if content_js.exists():
        try:
            content_src = content_js.read_text(encoding="utf-8")
            if content_src.startswith("\ufeff"):
                content_src = content_src[1:]
            # 剥离 /* */ 与 // 注释（避免中文/特殊字符干扰）
            content_src = _re.sub(r"/\*.*?\*/", "", content_src, flags=_re.S)
            content_src = _re.sub(r"//[^\n]*", "", content_src)
            m = _re.search(r"window\.CONTENT_DATA\s*=\s*(\[[\s\S]*?\])\s*;", content_src)
            if m:
                content = json.loads(m.group(1))
                if mode == "offline" and cfg.free_units is not None:
                    content = content[: cfg.free_units]
                app_data["content"] = content
        except Exception as e:  # noqa: BLE001
            log(f"WARN content.js 解析失败（{e}），content 为空")
    js = "window.APP_DATA = " + json.dumps(app_data, ensure_ascii=False, indent=1) + ";\n"
    (out_dir / "data.js").write_text(js, encoding="utf-8")
    log(f"data.js 写入（静态工具，{len(js)} 字节，mode={mode}，content={len(app_data['content'])} 条）")


def write_chengyu_data_js(cfg: ToolConfig, out_dir: Path, unit_index: int, app_name: str,
                          mode: str = "offline") -> None:
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
            # V0.4 P4：双模式契约字段（对齐 write_static_data_js）
            "mode": mode,
            "free_units": cfg.free_units,
            "api_version": "v0",
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


# ---------------- PEP 词汇表（公共素材：/PEP词库/tools/vocab/parse_pep_vocab.py） ----------------
PEP_VOCAB_TOOL = ROOT.parent / "PEP词库" / "tools" / "vocab" / "parse_pep_vocab.py"


def _load_pep_vocab_tool():
    """动态加载 PEP词库 词汇解析模块（库方式复用，保持 976/978 词输出一致）。"""
    import importlib.util
    import sys
    spec = importlib.util.spec_from_file_location("parse_pep_vocab", PEP_VOCAB_TOOL)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["parse_pep_vocab"] = mod
    spec.loader.exec_module(mod)
    return mod


def _truncate_books_to_words(books: list[dict], max_words: int | None) -> list[dict]:
    """B1（V0.5）：词汇表工具 content 级切分——按累计词数截断 books。

    语义：保留前 max_words 个单词（按册顺序 → 单元顺序 → 词顺序），
    截断发生在单词粒度，册/单元结构完整（截断的单元整体剔除，避免半单元）。
    max_words=None（free_units=None，如英语点读走 book 源不适用）或 >= 总量时返回原样。
    """
    if max_words is None or max_words <= 0:
        return books
    out: list[dict] = []
    remain = max_words
    for b in books:
        new_units: list[dict] = []
        for u in b["units"]:
            ws = u["words"]
            if remain <= 0:
                break
            if len(ws) <= remain:
                new_units.append(u)
                remain -= len(ws)
            else:
                new_units.append({"unit": u["unit"], "words": ws[:remain]})
                remain = 0
        if new_units:
            out.append({"grade": b["grade"], "term": b["term"],
                        "book": b["book"], "units": new_units})
        if remain <= 0:
            break
    return out


def write_vocab_data_js(cfg: ToolConfig, out_dir: Path, unit_index: int,
                        app_name: str, mode: str = "offline") -> None:
    """打字背单词/单词闪卡：委托 /PEP词库 解析 PEP 11 册词汇表 → data.js（books）。

    同时将规范化词库 JSON 同步到 /PEP词库/data/vocab/pep_vocab.json（公共素材，schema v1）。
    V0.4 P4：RedTools 侧包装补双模式契约字段（mode/free_units/api_version），不改 PEP 核心模块。
    B1（V0.5）：content 级切分——offline 按 cfg.free_units 截取前 N 词（如 200），online 全量。
    """
    if not cfg.vocab_dir or not cfg.vocab_dir.exists():
        raise SystemExit(f"vocab_dir 不存在: {cfg.vocab_dir}")
    mod = _load_pep_vocab_tool()
    books, total_words = mod.parse_all_books(cfg.vocab_dir)
    # B1：offline 按 free_units 截断；online 全量（free_units 语义 = 前 N 词）
    cut = None if mode == "online" else cfg.free_units
    shipped_books = _truncate_books_to_words(books, cut)
    shipped_words = sum(len(u["words"]) for b in shipped_books for u in b["units"])
    app_data = mod.build_app_data(app_name, cfg.version, cfg.series, cfg.tool,
                                  unit_index, shipped_books)
    # V0.4 P4：补双模式契约字段（PEP 模块 meta 无 mode/free_units/api_version）
    app_data.setdefault("meta", {})
    app_data["meta"]["mode"] = mode
    app_data["meta"]["free_units"] = cfg.free_units
    app_data["meta"]["api_version"] = "v0"
    size = mod.write_data_js(app_data, out_dir)
    cut_note = f"，切分 {shipped_words}/{total_words} 词" if shipped_words != total_words else ""
    log(f"data.js 写入（词汇表工具，{size / 1024:.0f} KB，{len(shipped_books)} 册 / {shipped_words} 词，mode={mode}{cut_note}）")
    # 公共素材同步：PEP词库/data/vocab/pep_vocab.json（始终全量——公共素材不受工具免费切分影响）
    vocab_json = ROOT.parent / "PEP词库" / "data" / "vocab" / "pep_vocab.json"
    mod.write_vocab_json(books, total_words, vocab_json)
    log(f"PEP词库 规范化词库 JSON 已同步：{vocab_json.name}（{total_words} 词）")


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


def copy_static(cfg: ToolConfig, out_dir: Path, mode: str = "offline") -> None:
    """静态工具复制（V0.2 双模式扩展）：
    - src/assets/ → out_dir/assets/（现有）
    - src/index.html → out_dir/index.html（现有）
    - 新：src/core/ → out_dir/core/（若存在，双模式共用核心）
    - 新：src/adapters/<mode>/ → out_dir/adapters/（若存在，按模式注入适配层）
    - 新：cfg.shared_js → 合并 _shared/js/src/*.js → out_dir/_shared/lx-shared.js
    """
    if (cfg.src_dir / "assets").exists():
        shutil.copytree(cfg.src_dir / "assets", out_dir / "assets", dirs_exist_ok=True)
    shutil.copy2(cfg.src_dir / "index.html", out_dir / "index.html")
    # 双模式新结构：core/（共用）+ adapters/<mode>/（按模式）
    if (cfg.src_dir / "core").exists():
        shutil.copytree(cfg.src_dir / "core", out_dir / "core", dirs_exist_ok=True)
    mode_adapters = cfg.src_dir / "adapters" / mode
    if mode_adapters.exists():
        shutil.copytree(mode_adapters, out_dir / "adapters", dirs_exist_ok=True)
    elif (cfg.src_dir / "adapters").exists():
        # 无按模式子目录时回退复制 adapters/ 根（单套适配层）
        shutil.copytree(cfg.src_dir / "adapters", out_dir / "adapters", dirs_exist_ok=True)
    # 公共模块合并：_shared/js/src/*.js → out_dir/_shared/lx-shared.js
    if cfg.shared_js:
        merge_shared_js(cfg, out_dir)
    base = out_dir / "assets" / "icon_base.png"
    if base.exists():
        base.unlink()
    log(f"静态文件复制完成 (index.html + assets/ + core/ + adapters/{mode} + shared)")


def merge_shared_js(cfg: ToolConfig, out_dir: Path) -> None:
    """合并 _shared/js/src/*.js → out_dir/_shared/lx-shared.js（构建注入公共模块）。
    合并顺序：lx-shared-core → storage → progress → auth → guard → ui-kit
    （core 先定义命名空间与 register，各模块随后注册进 LX_SHARED）
    """
    shared_src = ROOT / "_shared" / "js" / "src"
    if not shared_src.exists():
        log("WARN _shared/js/src 不存在，跳过公共模块合并")
        return
    order = ["lx-shared-core.js", "storage.js", "progress.js", "auth.js", "guard.js", "ui-kit.js"]
    parts = []
    for name in order:
        f = shared_src / name
        if f.exists():
            parts.append(f.read_text(encoding="utf-8"))
        else:
            log(f"WARN 公共模块缺失: {name}")
    if not parts:
        return
    out_shared = out_dir / "_shared"
    out_shared.mkdir(parents=True, exist_ok=True)
    (out_shared / "lx-shared.js").write_text("\n".join(parts), encoding="utf-8")
    log(f"公共模块合并: _shared/lx-shared.js ({sum(len(p) for p in parts) // 1024} KB)")


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
               publish: bool = True, mode: str = "offline",
               strict: bool = False) -> Path | None:
    """构建单个工具单单元，返回 zip 路径（offline）/ 部署目录（online）。

    strict=True 时：热区坐标异常 / 音频缺失累计 >0 → SystemExit（collect-then-fail）。

    cfg.datasource:
      - 'book': 教材数据源（英语点读等），需 book/img_dir/audio_dir
      - 'static': 静态工具（数学口算等），无数据源，仅复制 src/
      - 'chengyu': 成语词库工具（看图猜成语/成语接龙），复制 src/ + 注入共享成语词库 data.js

    mode（V0.2 双模式）:
      - 'offline': 产物 dist/<tool>/offline/，zip → publish/<系列>/（小红书发布）
      - 'online':  产物 dist/<tool>/online/，仅部署目录（不入 zip、不入 publish、不入小红书）
    """
    mode_dir = mode if mode in ('offline', 'online') else 'offline'
    dist_dir = (out_root or cfg.dist_root) / cfg.tool / mode_dir
    pub_dir = publish_root or cfg.publish_root   # publish/<系列>/ 系列内平铺，不按工具细分
    unit = None   # 仅 datasource='book' 时赋值（静态/成语/词汇表工具无单元数据）
    validation_issues: list[str] = []
    if dist_dir.exists():
        shutil.rmtree(dist_dir)
    dist_dir.mkdir(parents=True)
    copy_static(cfg, dist_dir, mode=mode_dir)

    if cfg.datasource in ('static', 'chengyu', 'vocab'):
        # 静态/成语词库/词汇表工具：无 book / 图片 / 音频
        app_name = resolve_app_name(cfg, None, unit_index)
        if cfg.datasource == 'chengyu':
            write_chengyu_data_js(cfg, dist_dir, unit_index, app_name, mode=mode_dir)
        elif cfg.datasource == 'vocab':
            write_vocab_data_js(cfg, dist_dir, unit_index, app_name, mode=mode_dir)
        else:
            write_static_data_js(cfg, dist_dir, unit_index, app_name, mode=mode_dir)
        # 图标：offline 生成（zip+发布图）；online 也生成 128px 页面 icon.png（防资源 404）
        #（修正：icon.png 生成原先仅 offline 分支，online 部署目录缺 icon → index.html 引用 404）
        make_static_icon(cfg, dist_dir, pub_dir if publish and mode_dir == 'offline' else None, app_name)
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

        # ---- V1.3.1 校验：热区坐标合法性 + 音频覆盖（默认 WARN；--strict 硬失败） ----
        hz_issues = validate_hotzones(unit)
        if hz_issues:
            log(f"⚠️ 热区坐标校验: {len(hz_issues)} 个异常（top 5）")
            for it in hz_issues[:5]:
                corr_tag = "[校正]" if it["from_correction"] else ""
                log(f"  page {it['page']} track {it['track']} {it['kind']}{corr_tag}: {it['detail']}")
            validation_issues.append(f"热区坐标 {len(hz_issues)} 个异常")
        audio_cov = validate_audio_coverage(unit, cfg.audio_dir)
        if not audio_cov["ok"]:
            log(f"⚠️ 音频覆盖校验: {len(audio_cov['missing_audio'])}/{audio_cov['total_tracks']} 缺音频（top 5）")
            for m in audio_cov["missing_audio"][:5]:
                log(f"  page {m['page']} track {m['track']}: {m['key']}")
            validation_issues.append(f"音频缺失 {len(audio_cov['missing_audio'])}/{audio_cov['total_tracks']}")

        # ---- V1.3.2 校验：书页完整性（页码连续 / 零 track / 图片对齐；默认 WARN；--strict 硬失败） ----
        comp = validate_page_completeness(book, unit, start, end, cfg.img_dir, cfg.redrawn_img_dir)
        if comp["missing_pages"] or comp["both_missing_imgs"] or comp["zero_track_pages"]:
            log(f"⚠️ 书页完整性: {len(comp['missing_pages'])} 缺页, {len(comp['zero_track_pages'])} 零track(可能为扉页), {len(comp['both_missing_imgs'])} 双缺图")
            for pno in comp["missing_pages"][:5]: log(f"  缺页: page {pno}")
            for pno in comp["zero_track_pages"][:5]: log(f"  零track页: page {pno}")
            for pno in comp["both_missing_imgs"][:5]: log(f"  双缺图: page {pno}")
            validation_issues.append(f"书页完整性 {len(comp['missing_pages'])+len(comp['zero_track_pages'])+len(comp['both_missing_imgs'])} 项")
        if comp["redrawn_missing_imgs"]:
            log(f"⚠️ 重绘缺图(原版兜底): {len(comp['redrawn_missing_imgs'])} 页")

        app_name = resolve_app_name(cfg, book, unit_index)
        convert_images(unit["pages"], start, dist_dir, cfg.img_dir, cfg.redrawn_img_dir)
        convert_audio(unit, dist_dir, cfg.audio_dir)
        if publish and mode_dir == 'offline':
            make_icon(cfg, book, unit_index, dist_dir, pub_dir, app_name)
        write_data_js(unit, cfg, book, dist_dir, unit_index, app_name, mode=mode_dir)

    # --strict：收集全部问题后统一失败（collect-then-fail，一次看全）
    if strict and validation_issues:
        raise SystemExit(f"strict 模式校验失败: {'; '.join(validation_issues)}")

    # online 模式：仅部署目录（不入 zip、不入 publish、不入小红书——合规红线 §4.4）
    if mode_dir == 'online':
        log(f"在线包构建完成（仅部署目录，不入 publish/小红书）: {dist_dir}")
        return dist_dir

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
    parser.add_argument("--mode", default="offline", choices=["offline", "online"],
                        help="构建模式：offline（zip+发布）/ online（仅部署目录）")
    parser.add_argument("--strict", action="store_true",
                        help="严格模式：校验异常时构建失败（热区坐标/音频缺失/书页完整性，collect-then-fail）")
    args = parser.parse_args()

    from tools import TOOLS
    if args.tool not in TOOLS:
        raise SystemExit(f"未知工具: {args.tool}，可用: {list(TOOLS)}")
    cfg = TOOLS[args.tool]
    if args.book:
        cfg.book = args.book
    build_tool(cfg, args.unit, args.pages, mode=args.mode, strict=args.strict)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
