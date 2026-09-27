#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""小学英语素材管理系统 — 清单/对账/状态/就绪度 CLI（M1：scan + check）

用法:
    python 脚本文件路径.py scan              # 盘点 → manifest.json（JOIN bookaudio_v3 + bookpage[]）
    python 脚本文件路径.py check [--grade G] # 对账 → integrity.json + 摘要
    python 脚本文件路径.py status [--unit U] # 状态 → production.json（M2：重绘/TTS/视频/内容包）
    python 脚本文件路径.py missing [--mode]  # M3 预留
    python 脚本文件路径.py matrix            # M3 预留
    python 脚本文件路径.py report            # M4 预留

原则: 轻量 / 可重建 / SSOT（manifest.json）/ 只读素材 / agent 可查询。
Oracle 评审 M1/M2 修正: 数据来源 JOIN bookaudio_v3（单元→页）+ bookpage[]（页→track/热区）；
字段名对齐 book.json 原生命名；scanner 断言总 track 数一致。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.paths import (  # noqa: E402
    MANIFEST_PATH, INTEGRITY_PATH, PRODUCTION_PATH, READINESS_PATH, REPORT_PATH,
    SCHEMA_DIR, MAT_ROOT, DIANDU_DIR, VOCAB_JSON, REDRAW_TASKS_DIR, QA_REPORTS_DIR,
    PUBLISH_DIR, PEIDIAN_BUILD_DIR, GRADE_TERMS,
)

SCHEMA_VERSION = "1.0"

# 中文「册次」→ 任务名后缀映射（pep{N}{s|x}_u{MM}）
TERM_SUFFIX = {"上册": "s", "下册": "x"}
# 年级 → N
GRADE_NO = {"一年级": "1", "二年级": "2", "三年级": "3",
            "四年级": "4", "五年级": "5", "六年级": "6"}


def load_json(path: Path, default=None):
    if not path or not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8", errors="replace"))
    except Exception:
        return default


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


# ------------------------------------------------------------------
# 工具函数
# ------------------------------------------------------------------
def clean_name(s: str, max_len: int = 60) -> str:
    """本地音频文件名清洗（对齐 diandu_audio.py clean_name：去 HTML/控制字符/Windows 非法字符，
    空白→_，全角标点保留）。用于推导 audio_local，避免重造命名规则。"""
    if not s:
        return "track"
    s = re.sub(r"<[^>]*>", "", s)
    s = re.sub(r"[\x00-\x1F\x7F]+", " ", s)
    for k, v in {"\"": "", "<": "《", ">": "》", ":": "：", "/": "-", "\\": "-",
                 "|": "-", "?": "？", "*": "·"}.items():
        s = s.replace(k, v)
    s = re.sub(r"\s+", " ", s).strip().replace(" ", "_")
    s = re.sub(r"_+", "_", s).strip("_-") or "track"
    if len(s) > max_len:
        s = s[:max_len].rstrip("_-")
    return s


def audio_local_name(page_no: int, track_index: int, track_text: str) -> str:
    """按 diandu_audio.py 命名规则推导本地单句音频文件名。"""
    return f"P{page_no:03d}_{track_index:02d}_{clean_name(track_text)}.mp3"


def find_book_json(grade: str, term: str) -> Path | None:
    """在 diandu 目录找对应册的 book.json（文件名含年级+册次）。"""
    if not DIANDU_DIR.exists():
        return None
    for bj in sorted(DIANDU_DIR.glob("*.json")):
        name = bj.name
        if grade in name and term in name and name.startswith("121"):
            return bj
    return None


def parse_book_units(book: dict) -> list[dict]:
    """JOIN bookaudio_v3（章节区间）+ bookpage[]（页→track/热区）。

    JOIN 规则（Oracle 评审 M2 修正，实测四上验证）：
    - bookaudio_v3[i].page_no = 章节起始页（Unit N 含单元封面页）
    - 章节结束页 = 下一章节 page_no - 1（末章 = 全书末页）
    - 单元内全部页 = [start, end] 连续区间，从 bookpage[] 按 page_no 过滤
    - children（Part A/B/C）仅作章节内细分，不直接作为页来源（Part 首页已在区间内）

    返回 [{unit, title, pages:[{page_no, tracks:[...], no_audio_page}]}]
    字段名对齐 book.json 原生：track_text/track_genre/track_duration/
    track_left/top/right/bottom/track_index/track_id；audio_local 为推导文件名。
    """
    pages_by_no: dict[int, dict] = {}
    for pg in book.get("bookpage", []) or []:
        pn = int(pg.get("page_no") or 0)
        if pn:
            pages_by_no[pn] = pg
    if not pages_by_no:
        return []

    # 章节区间：i.page_no .. next.page_no-1（按 bookaudio_v3 顺序）
    chapters = [u for u in (book.get("bookaudio_v3") or []) if u.get("page_no")]
    units: list[dict] = []
    for i, u in enumerate(chapters):
        title = u.get("title") or ""
        start = int(u.get("page_no") or 0)
        if i + 1 < len(chapters):
            end = int(chapters[i + 1].get("page_no") or 0) - 1
        else:
            end = max(pages_by_no.keys())
        page_nos = [pn for pn in range(start, end + 1) if pn in pages_by_no]

        pages_out = []
        for pn in page_nos:
            pg = pages_by_no[pn]
            tracks_raw = pg.get("track_info") or []
            track_out = []
            # 页内序号 seq 从 1 起（对齐磁盘文件名 P{页}_{seq}_）；不能用 track_index 直拼
            # （部分页首条 track idx 缺失/偏移，如二下 P29 idx=2..8 → 磁盘 01..07）
            for seq, t in enumerate(tracks_raw, start=1):
                if not isinstance(t, dict):
                    continue
                track_out.append({
                    "track_id": t.get("track_id"),
                    "track_index": t.get("track_index"),
                    "seq": seq,                     # 页内顺序号（与磁盘文件名一致）
                    "track_text": t.get("track_text", ""),
                    "track_genre": t.get("track_genre", ""),
                    "track_duration": t.get("track_duration"),
                    "hotzone": {
                        "left": t.get("track_left"),
                        "top": t.get("track_top"),
                        "right": t.get("track_right"),
                        "bottom": t.get("track_bottom"),
                    },
                    "audio_local": audio_local_name(
                        pn, seq, t.get("track_text", "")),
                    "audio_exists": None,   # scanner 回填
                })
            pages_out.append({
                "page_no": pn,
                "image": f"Page_{pn:03d}.png",
                "image_exists": None,
                "page_audio": f"P{pn:03d}.mp3",
                "page_audio_exists": None,
                "tracks": track_out,
                "no_audio_page": not track_out,
            })
        if pages_out:
            unit_no_match = re.search(r"Unit\s*(\d+)", title, re.I)
            units.append({
                "unit_no": ("U%02d" % int(unit_no_match.group(1))) if unit_no_match else title,
                "title": title,
                "pages": pages_out,
            })
    return units


def tally_stats(book_dir: Path, units: list[dict]) -> dict:
    """统计册级素材数量（扫描素材根目录）。

    口径（素材清单.md 约定）：audio_tracks = 单句+页+单元 三个子目录 mp3 总数；
    subtitles = _音频素材/*.srt 数；page_images = _图片素材/Page_*.png 数。
    """
    img_dir = book_dir / "_图片素材"
    aud_dir = book_dir / "_音频素材"
    img_count = len(list(img_dir.glob("Page_*.png"))) if img_dir.exists() else 0
    srt_count = len(list(aud_dir.glob("*.srt"))) if aud_dir.exists() else 0
    p_audios = 0
    for sub in ("单句音频", "页音频", "单元音频"):
        sub_dir = aud_dir / sub
        if sub_dir.exists():
            p_audios += len(list(sub_dir.glob("*.mp3")))
    size_mb = 0.0
    if book_dir.exists():
        size_mb = round(sum(f.stat().st_size for f in book_dir.rglob("*")
                            if f.is_file()) / 1048576, 1)
    return {"page_images": img_count, "audio_tracks": p_audios,
            "subtitles": srt_count, "size_mb": size_mb}


def fill_exists_flags(book_dir: Path, units: list[dict], run_checks: bool) -> None:
    """回填 image_exists / page_audio_exists / track.audio_exists（存在性校验）。

    素材目录结构（实测各册一致）：
      _图片素材/Page_NNN.png
      _音频素材/单句音频/P{页}_{seq}_{文字}.mp3   （tracks）
      _音频素材/页音频/P{页}.mp3                   （page_audio）
    """
    img_dir = book_dir / "_图片素材"
    aud_dir = book_dir / "_音频素材"
    single_aud_dir = aud_dir / "单句音频"
    page_aud_dir = aud_dir / "页音频"
    for u in units:
        for p in u["pages"]:
            p["image_exists"] = (img_dir / p["image"]).exists() if img_dir.exists() else False
            p["page_audio_exists"] = (page_aud_dir / p["page_audio"]).exists() if page_aud_dir.exists() else False
            if run_checks and single_aud_dir.exists():
                for t in p["tracks"]:
                    t["audio_exists"] = (single_aud_dir / t["audio_local"]).exists()
            else:
                for t in p["tracks"]:
                    t["audio_exists"] = None


# ------------------------------------------------------------------
# scan —— 盘点（FR1）
# ------------------------------------------------------------------
def cmd_scan(args) -> int:
    grades = []
    total_tracks_seen = 0
    total_tracks_expected = 0
    for grade, term in GRADE_TERMS:
        book_dir = MAT_ROOT / grade / term
        if not book_dir.exists():
            grades.append({"grade": grade, "term": term, "published": False})
            continue
        bj = find_book_json(grade, term)
        book = load_json(bj, {}) if bj else {}
        units = parse_book_units(book)
        stats = tally_stats(book_dir, units)
        published = bool(book) or book_dir.exists()
        # bookinfo
        bi = book.get("bookinfo", {}) if isinstance(book, dict) else {}
        # 存在性校验（scan 默认全量回填；增量模式可传 --no-exists 跳过音频逐条）
        fill_exists_flags(book_dir, units, run_checks=not getattr(args, "no_exists", False))
        # track 断言：manifest 总 track 数 ≈ bookpage[].track_info[] 总数
        bpages = book.get("bookpage", []) if isinstance(book, dict) else []
        expected = sum(len(pg.get("track_info") or []) for pg in bpages if isinstance(pg, dict))
        seen = sum(len(p["tracks"]) for u in units for p in u["pages"])
        total_tracks_seen += seen
        total_tracks_expected += expected
        pdf = next(book_dir.glob("*.pdf"), None)
        if pdf is None:
            # 四上等册 PDF 在素材根（MAT_ROOT/*.pdf），文件名含册名关键词
            for f in sorted(MAT_ROOT.glob("*.pdf")):
                if grade in f.name and term in f.name:
                    pdf = f
                    break
        cover = next(book_dir.glob("Cover.png"), None)
        cover_info = None
        if cover:
            cover_info = {"file": cover.name, "source": "pdf_page1" if pdf else "network"}
        grades.append({
            "grade": grade,
            "term": term,
            "book_id": str(bj.name).split("_")[0] if bj else "",
            "published": published,
            "book_name": bi.get("bookname", ""),
            "pdf": pdf.name if pdf else None,
            "cover": cover_info,
            "stats": stats,
            "units": units,
        })
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": "2026-09-21T00:00:00+08:00",
        "root": str(MAT_ROOT),
        "diandu_root": str(DIANDU_DIR),
        "track_assert": {"seen": total_tracks_seen, "expected": total_tracks_expected,
                         "ok": total_tracks_seen == total_tracks_expected},
        "grades": grades,
    }
    save_json(MANIFEST_PATH, manifest)
    total_imgs = sum(g.get("stats", {}).get("page_images", 0) for g in grades)
    ok = manifest["track_assert"]["ok"]
    print(f"scan 完成 → {MANIFEST_PATH.name}")
    print(f"  册数 {len(grades)} 页面图 {total_imgs}")
    print(f"  track 断言: seen={total_tracks_seen} expected={total_tracks_expected} "
          f"{'✓ 一致' if ok else '✗ 不一致！'}")
    return 0 if ok else 3


# ------------------------------------------------------------------
# check —— 对账（FR2）
# ------------------------------------------------------------------
def cmd_check(args) -> int:
    manifest = load_json(MANIFEST_PATH, {})
    if not manifest.get("grades"):
        print("ERROR: 请先运行 scan（manifest.json 不存在或为空）", file=sys.stderr)
        return 2
    issues: list[dict] = []
    no_audio_pages = 0
    for g in manifest.get("grades", []):
        if not g.get("published"):
            continue
        grade, term = g["grade"], g["term"]
        for u in g.get("units", []):
            for p in u.get("pages", []):
                pn = p["page_no"]
                if p.get("no_audio_page"):
                    no_audio_pages += 1
                    issues.append({"grade": grade, "term": term, "unit": u["unit_no"],
                                   "page_no": pn, "type": "no_audio_page",
                                   "severity": "info",
                                   "detail": "track_info 为空（平台数据源特性）"})
                    continue
                if not p.get("image_exists"):
                    issues.append({"grade": grade, "term": term, "unit": u["unit_no"],
                                   "page_no": pn, "type": "missing_image",
                                   "severity": "error", "detail": p.get("image")})
                if not p.get("page_audio_exists"):
                    issues.append({"grade": grade, "term": term, "unit": u["unit_no"],
                                   "page_no": pn, "type": "missing_page_audio",
                                   "severity": "info", "detail": p.get("page_audio")})
                for t in p.get("tracks", []):
                    if t.get("audio_exists") is False:
                        issues.append({"grade": grade, "term": term, "unit": u["unit_no"],
                                       "page_no": pn, "type": "missing_track_audio",
                                       "severity": "error", "detail": t.get("audio_local")})
    errs = [i for i in issues if i["severity"] == "error"]
    infos = [i for i in issues if i["severity"] == "info"]
    summary = {
        "books_checked": len([g for g in manifest.get("grades", []) if g.get("published")]),
        "issues_total": len(issues), "errors": len(errs), "infos": len(infos),
        "no_audio_pages": no_audio_pages,
    }
    save_json(INTEGRITY_PATH, {"schema_version": SCHEMA_VERSION, "summary": summary,
                               "issues": issues})
    print(f"check 完成 → {INTEGRITY_PATH.name}")
    print(f"  册 {summary['books_checked']} 问题 {summary['issues_total']} "
          f"（error {summary['errors']} / info {summary['infos']}，无音页 {no_audio_pages}）")
    if args.grade:
        g_issues = [i for i in issues if i["grade"] == args.grade and
                    (not args.term or i["term"] == args.term)]
        for i in g_issues[:20]:
            print(f"    [{i['severity']}] {i['type']} {i['grade']}{i['term']} U{i['unit']} "
                  f"P{i['page_no']}: {i.get('detail', '')}")
    return 3 if errs else 0


# ------------------------------------------------------------------
# M2：status —— 四类生产状态推导（FR3，设计文档 §4.3 STATUS_RULES）
# ------------------------------------------------------------------
# 只读数据源（全部不动素材，仅读取）：
#   - 重绘：RedTools/重绘工具/tasks/pep{N}{s|x}_u{MM}/ + qa_reports/<年级>_<册次>.html 内嵌 DATA
#   - TTS：素材根 <年级>/<册次>/_重读音频素材/单句音频/*.mp3（实测仅四上有此目录）
#   - 视频：RedTools/publish/学科/点读陪练_<年级><上|下>Unit01-02_离线版.zip 存在性（简化）
#   - 内容：点读陪练/build/uXX/uXX_content_package.json + 07_qa_report.md 结论行含 PASS
# 视频离线包发布目录（沿用 PUBLISH_DIR 常量，不散落绝对路径）
PUBLISH_XUEKE_DIR = PUBLISH_DIR / "学科"

# 状态值域（设计文档 §3.3，严格中文）
REDRAW_STATES = ("未开始", "进行中", "QA待检", "通过", "返工")
TTS_STATES = ("未生成", "部分", "完整")
VIDEO_STATES = ("未制作", "已生成", "手调保留")
CONTENT_STATES = ("未生产", "草稿", "已审校", "已发布")


def load_qa_report(grade: str, term: str) -> tuple:
    """读 qa_reports/<年级>_<册次>.html 内嵌 const DATA={...}，返回 (book, html文件名)。

    book = {grade, vol, units:[{idx,label,start,end}], pages:[{page,has_orig,has_redr,...}]}；
    正则提取 JSON（HTML 中可能跨行、键值含中文）；解析失败 → (None, 文件名) 并打 WARN 不中断。
    """
    qa_file = QA_REPORTS_DIR / f"{grade}_{term}.html"
    if not qa_file.exists():
        print(f"WARN: 无 QA 报告 {qa_file.name}，{grade}{term} 重绘降级为未开始", file=sys.stderr)
        return None, None
    text = qa_file.read_text(encoding="utf-8", errors="replace")
    m = re.search(r"const DATA\s*=\s*(\{.*?\})\s*;", text, re.S)
    if not m:
        print(f"WARN: QA 报告 {qa_file.name} 未找到 const DATA，{grade}{term} 重绘降级为未开始", file=sys.stderr)
        return None, qa_file.name
    try:
        data = json.loads(m.group(1))
    except Exception as e:
        print(f"WARN: QA 报告 {qa_file.name} DATA 解析失败（{e}），{grade}{term} 重绘降级为未开始", file=sys.stderr)
        return None, qa_file.name
    book = data.get(f"{grade}_{term}") if isinstance(data, dict) else None
    if not isinstance(book, dict):
        book = next((v for v in data.values() if isinstance(v, dict)), None) if isinstance(data, dict) else None
    if book is None:
        print(f"WARN: QA 报告 {qa_file.name} DATA 无 {grade}_{term}，重绘降级为未开始", file=sys.stderr)
        return None, qa_file.name
    return book, qa_file.name


def qa_unit_range(book: dict, unit_no: str):
    """按 QA units[].label 里的 Unit N 匹配当前单元页区间 [start, end)；找不到返回 None。"""
    num = str(unit_no)[1:].lstrip("0")
    for u in (book.get("units") or []):
        if not isinstance(u, dict):
            continue
        m = re.search(r"Unit\s*(\d+)", str(u.get("label", "")), re.I)
        if m and m.group(1).lstrip("0") == num:
            return int(u.get("start") or 0), int(u.get("end") or 0)
    return None


def derive_redraw(grade: str, term: str, unit_no: str, book, qa_file_name, manifest_unit: dict) -> dict:
    """重绘状态：任务目录 + QA 页级 has_redr 事实推导。

    - 任务目录不存在 / QA 解析失败 → 未开始（pages 用 manifest 兜底）
    - 单元页区间内全部 has_redr → 通过；部分 → 进行中
    """
    mm = str(unit_no)[1:] if re.fullmatch(r"U\d{2}", str(unit_no)) else ""
    task_dir = REDRAW_TASKS_DIR / f"pep{GRADE_NO.get(grade, '')}{TERM_SUFFIX.get(term, '')}_u{mm}"
    m_pages = [p for p in (manifest_unit.get("pages") or []) if isinstance(p, dict)]
    fallback = {"state": "未开始", "pages_total": len(m_pages), "pages_done": 0,
                "qa_file": qa_file_name}
    if book is None or not task_dir.exists():
        return fallback
    rng = qa_unit_range(book, unit_no)
    if rng is None:
        print(f"WARN: {grade}{term} {unit_no} 在 QA units 中未找到页区间，重绘降级为未开始", file=sys.stderr)
        return fallback
    start, end = rng
    total = max(end - start, 0)
    done = 0
    for p in (book.get("pages") or []):
        if not isinstance(p, dict):
            continue
        try:
            pn = int(p.get("page") or -1)
        except (TypeError, ValueError):
            continue
        if start <= pn < end and p.get("has_redr"):
            done += 1
    return {"state": "通过" if done >= total else "进行中",
            "pages_total": total, "pages_done": done, "qa_file": qa_file_name}


def derive_tts(grade: str, term: str, unit_no: str, manifest_unit: dict) -> dict:
    """TTS 状态：_重读音频素材/单句音频/*.mp3 数 vs manifest 该单元 tracks 总数。

    无目录 / 该单元 0 条 → 未生成 + done=0；有目录按完成率 → 完整/部分。
    """
    tts_dir = MAT_ROOT / grade / term / "_重读音频素材" / "单句音频"
    page_nos = set()
    tracks_total = 0
    for p in (manifest_unit.get("pages") or []):
        if isinstance(p, dict):
            try:
                page_nos.add(int(p.get("page_no") or -1))
            except (TypeError, ValueError):
                pass
            tracks_total += len(p.get("tracks") or [])
    if not tts_dir.exists():
        return {"state": "未生成", "tracks_total": 0, "tracks_done": 0}
    tracks_done = 0
    for f in tts_dir.glob("*.mp3"):
        m = re.match(r"P(\d+)_", f.name)
        if m and int(m.group(1)) in page_nos:
            tracks_done += 1
    if tracks_done == 0:
        return {"state": "未生成", "tracks_total": tracks_total, "tracks_done": 0}
    return {"state": "完整" if tracks_done >= tracks_total else "部分",
            "tracks_total": tracks_total, "tracks_done": tracks_done}


def video_zip_exists(grade: str, term: str) -> bool:
    """视频状态（简化）：RedTools/publish/学科/点读陪练_<年级><上|下>Unit01-02_离线版.zip 存在性。"""
    sh = "上" if term == "上册" else "下"
    return (PUBLISH_XUEKE_DIR / f"点读陪练_{grade}{sh}Unit01-02_离线版.zip").exists()


_GRADE_BY_NO = {v: k for k, v in GRADE_NO.items()}   # "4" → "四年级"
_TERM_BY_LETTER = {"A": "上册", "B": "下册"}


def _pkg_grade_term(s) -> tuple | None:
    """内容包 grade 字段（如 "4A"）→ (年级, 册次)；解析失败返回 None。"""
    m = re.fullmatch(r"(\d+)([ABab])", str(s).strip())
    if not m:
        return None
    grade = _GRADE_BY_NO.get(m.group(1))
    term = _TERM_BY_LETTER.get(m.group(2).upper())
    return (grade, term) if grade and term else None


def _norm_unit(s):
    """内容包 unit 字段（"U01"/"U2"）→ 规范化单元序号 int；失败返回 None。"""
    m = re.fullmatch(r"U(\d+)", str(s).strip(), re.I)
    return int(m.group(1)) if m else None


def derive_content(grade: str, term: str, unit_no: str) -> dict:
    """内容包状态：点读陪练/build/uXX/uXX_content_package.json + 07_qa_report.md PASS 结论。

    - 无内容包 → 未生产；有包无 PASS 结论 → 草稿；有包且 PASS → 已审校
    - 归属校验：包内 grade/unit 与当前单元一致才算（build/u01 属四年级上，防跨册误配）
    """
    ukey = str(unit_no).lower()
    pkg_dir = PEIDIAN_BUILD_DIR / ukey
    pkg_file = pkg_dir / f"{ukey}_content_package.json"
    if not pkg_file.exists():
        return {"state": "未生产"}
    pkg = load_json(pkg_file, None)
    if pkg is None:
        return {"state": "未生产"}
    if _pkg_grade_term(pkg.get("grade")) != (grade, term) or \
       _norm_unit(pkg.get("unit")) != _norm_unit(unit_no):
        return {"state": "未生产"}
    qa_report = pkg_dir / "07_qa_report.md"
    if qa_report.exists() and "PASS" in qa_report.read_text(encoding="utf-8", errors="replace"):
        return {"state": "已审校"}
    return {"state": "草稿"}


def cmd_status(args) -> int:
    manifest = load_json(MANIFEST_PATH, {})
    if not manifest.get("grades"):
        print("ERROR: 请先运行 scan（manifest.json 不存在或为空）", file=sys.stderr)
        return 2
    units: list[dict] = []
    for g in manifest.get("grades", []):
        if not g.get("published"):
            continue                      # 六下未出版：跳过（输出空 units，不报错）
        grade, term = g["grade"], g["term"]
        book, qa_file_name = load_qa_report(grade, term)
        for mu in g.get("units", []):
            if not isinstance(mu, dict):
                continue
            unit_no = mu.get("unit_no")
            if not isinstance(unit_no, str) or not re.fullmatch(r"U\d{2}", unit_no):
                continue                  # 只处理主单元，跳过 Revision/Appendix/cover
            title = mu.get("title") or unit_no
            units.append({
                "grade": grade, "term": term, "unit_no": unit_no, "title": title,
                "redraw": derive_redraw(grade, term, unit_no, book, qa_file_name, mu),
                "tts": derive_tts(grade, term, unit_no, mu),
                "video": {"state": "已生成" if video_zip_exists(grade, term) else "未制作"},
                "content": derive_content(grade, term, unit_no),
            })
    if getattr(args, "unit", None):
        want = str(args.unit).upper()
        units = [u for u in units if u["unit_no"] == want]
    # 值域校验（设计文档 §3.3，防御性）
    for u in units:
        assert u["redraw"]["state"] in REDRAW_STATES
        assert u["tts"]["state"] in TTS_STATES
        assert u["video"]["state"] in VIDEO_STATES
        assert u["content"]["state"] in CONTENT_STATES
    data = {"schema_version": SCHEMA_VERSION,
            "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "units": units}
    save_json(PRODUCTION_PATH, data)
    print(f"status 完成 → {PRODUCTION_PATH.name}（units {len(units)}，M2 四状态追踪）")
    return 0


def cmd_missing(args) -> int:
    data = {"schema_version": SCHEMA_VERSION, "missing": []}
    save_json(READINESS_PATH, data)
    print("missing（M3 待实施）")
    return 0


def cmd_matrix(args) -> int:
    manifest = load_json(MANIFEST_PATH, {})
    print("matrix（M3 待实施，当前 manifest 册数:", len(manifest.get("grades", [])), "）")
    return 0


def cmd_report(args) -> int:
    manifest = load_json(MANIFEST_PATH, {})
    lines = ["# 人教版（PEP）英语教材素材清单", "",
             "> 由小学英语素材管理系统自动生成（report.md），勿手改。", ""]
    lines.append("| 年级 | 册次 | 图片 | 音频 | 字幕 | 制作状态 |")
    lines.append("|------|------|------|------|------|----------|")
    for g in manifest.get("grades", []):
        if g.get("published"):
            s = g.get("stats", {})
            line = f"| {g['grade']} | {g['term']} | {s.get('page_images', 0)} | " \
                   f"{s.get('audio_tracks', 0)} | {s.get('subtitles', 0)} | 待补 |"
        else:
            line = f"| {g['grade']} | {g['term']} | - | - | - | 未出版 |"
        lines.append(line)
    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"report 完成 → {REPORT_PATH.name}")
    return 0


# ------------------------------------------------------------------
# 入口
# ------------------------------------------------------------------
def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="小学英语素材管理系统")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p_scan = sub.add_parser("scan", help="盘点 → manifest.json（JOIN bookaudio_v3+bookpage[]）")
    p_scan.add_argument("--no-exists", action="store_true",
                        help="跳过音频逐条存在性回填（快速盘点）")
    p_check = sub.add_parser("check", help="对账 → integrity.json")
    p_check.add_argument("--grade", default=None)
    p_check.add_argument("--term", default=None)
    p_status = sub.add_parser("status", help="生产状态 → production.json（M2）")
    p_status.add_argument("--unit", default=None)
    p_missing = sub.add_parser("missing", help="缺失清单（M3）")
    p_missing.add_argument("--mode", default=None, choices=["video", "peidian", "print"])
    sub.add_parser("matrix", help="就绪矩阵（M3）")
    sub.add_parser("report", help="渲染 report.md（M4）")
    args = ap.parse_args(argv)

    handlers = {"scan": cmd_scan, "check": cmd_check, "status": cmd_status,
                "missing": cmd_missing, "matrix": cmd_matrix, "report": cmd_report}
    return handlers[args.cmd](args)


if __name__ == "__main__":
    raise SystemExit(main())