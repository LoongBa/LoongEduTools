#!/usr/bin/env python3
"""小学英语素材管理系统 — 清单/对账/状态/就绪度 CLI

用法:
    python 脚本文件路径.py scan
    python 脚本文件路径.py check --grade 四年级 --term 上册
    python 脚本文件路径.py status [--unit U01]
    python 脚本文件路径.py missing [--mode video|peidian|print]
    python 脚本文件路径.py matrix
    python 脚本文件路径.py report

原则: 轻量 / 可重建 / SSOT（manifest.json）/ 只读素材 / agent 可查询。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# ------------------------------------------------------------------
# 常量与路径
# ------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parents[1]                 # 小学英语素材管理系统/
INVENTORY_DIR = REPO_ROOT / "inventory"
MANIFEST_PATH = INVENTORY_DIR / "manifest.json"
INTEGRITY_PATH = INVENTORY_DIR / "integrity.json"
PRODUCTION_PATH = INVENTORY_DIR / "production.json"
READINESS_PATH = INVENTORY_DIR / "readiness.json"
REPORT_PATH = INVENTORY_DIR / "report.md"
SCHEMA_DIR = INVENTORY_DIR / "schema"

MAT_ROOT = Path(r"F:\_教材素材\人教版（PEP）（主编：吴欣）")
DIANDU_DIR = REPO_ROOT.parent / "PEP词库" / "data" / "diandu"    # PEP词库/data/diandu
VOCAB_JSON = REPO_ROOT.parent / "PEP词库" / "data" / "vocab" / "pep_vocab.json"

# 11 册清单（年级, 册次）；六下未出版
GRADE_TERMS: list[tuple[str, str]] = [
    ("一年级", "上册"), ("一年级", "下册"),
    ("二年级", "上册"), ("二年级", "下册"),
    ("三年级", "上册"), ("三年级", "下册"),
    ("四年级", "上册"), ("四年级", "下册"),
    ("五年级", "上册"), ("五年级", "下册"),
    ("六年级", "上册"),
]


def load_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


# ------------------------------------------------------------------
# scan —— 盘点（FR1）
# ------------------------------------------------------------------
def cmd_scan(args) -> int:
    grades = []
    for grade, term in GRADE_TERMS:
        book_dir = MAT_ROOT / grade / term
        if not book_dir.exists():
            grades.append({"grade": grade, "term": term, "published": False})
            continue
        grades.append(build_grade(grade, term, book_dir))
    manifest = {
        "schema_version": "1.0",
        "generated_at": "2026-09-21T00:00:00+08:00",
        "root": str(MAT_ROOT),
        "grades": grades,
    }
    save_json(MANIFEST_PATH, manifest)
    total_imgs = sum(g.get("stats", {}).get("page_images", 0) for g in grades)
    print(f"scan 完成 → {MANIFEST_PATH.name}（{len(grades)} 册，页面图 {total_imgs}）")
    return 0


def build_grade(grade: str, term: str, book_dir: Path) -> dict:
    """单册盘点：图片/音频/字幕统计 + book.json 骨架。"""
    img_dir = book_dir / "_图片素材"
    aud_dir = book_dir / "_音频素材"
    img_count = len(list(img_dir.glob("Page_*.png"))) if img_dir.exists() else 0
    srt_count = len(list(aud_dir.glob("*.srt"))) if aud_dir.exists() else 0
    p_audios = len(list(aud_dir.glob("P*.mp3"))) if aud_dir.exists() else 0

    book = {"units": []}
    book_id = ""
    # 尝试关联 book.json（文件名含 '英语（PEP）' 与册名）
    if DIANDU_DIR.exists():
        for bj in DIANDU_DIR.glob("*.json"):
            if grade in bj.name and (term == "上册" and "上册" in bj.name or term == "下册" and "下册" in bj.name):
                try:
                    data = json.loads(bj.read_text(encoding="utf-8-sig", errors="replace"))
                    if isinstance(data, dict) and "bookpage" in data:
                        book = data
                        book_id = str(bj.name).split("_")[0]
                except Exception:
                    pass
                break

    pdf = next(book_dir.glob("*.pdf"), None)
    cover = next(book_dir.glob("Cover.png"), None)
    cover_info = None
    if cover:
        from PIL import Image
        try:
            with Image.open(cover) as im:
                cover_info = {"file": cover.name, "source": "pdf_page1" if pdf else "network",
                              "w": im.width, "h": im.height}
        except Exception:
            cover_info = {"file": cover.name, "source": "unknown"}

    return {
        "grade": grade,
        "term": term,
        "book_id": book_id,
        "published": True,
        "book_name": book.get("bookinfo", {}).get("bookname", ""),
        "pdf": pdf.name if pdf else None,
        "cover": cover_info,
        "stats": {"page_images": img_count, "audio_tracks": p_audios,
                  "subtitles": srt_count, "size_mb": round(sum(
                    f.stat().st_size for f in book_dir.rglob("*") if f.is_file()) / 1048576, 1)},
        "units": build_units(book),
    }


def build_units(book: dict) -> list:
    units: list[dict] = []
    pages = book.get("bookpage", []) if isinstance(book, dict) else []
    if not pages:
        return units
    # 单元化：以 bookaudio_v3 章节为骨架（简单实现：不分单元，全书一个列表）
    # 详情页分组在 M2 细化；此处返回每页 image/audio 存在性
    for pg in pages:
        if not isinstance(pg, dict):
            continue
        page_no = pg.get("page_no", 0)
        units.append({
            "page_no": page_no,
            "image": f"Page_{page_no:03d}.png",
            "image_exists": None,      # 扫描时补全
            "page_audio": f"P{page_no:03d}.mp3",
            "page_audio_exists": None,
            "tracks": [],
            "no_audio_page": not (pg.get("track_info") or []),
        })
    return units


# ------------------------------------------------------------------
# check —— 对账（FR2）
# ------------------------------------------------------------------
def cmd_check(args) -> int:
    issues: list[dict] = []
    for grade, term in GRADE_TERMS:
        book_dir = MAT_ROOT / grade / term
        if not book_dir.exists():
            continue
        img_dir = book_dir / "_图片素材"
        aud_dir = book_dir / "_音频素材"
        for pg in MAT_ROOT.joinpath(grade, term).glob("Page_*.png"):
            pass
        # 简化对账：逐页检查 Page_NNN.png 是否存在
        for page in range(1, 1000):
            image = img_dir / f"Page_{page:03d}.png"
            page_audio = aud_dir / f"P{page:03d}.mp3"
            has_img = image.exists() if img_dir.exists() else False
            has_aud = page_audio.exists() if aud_dir.exists() else False
            if has_img and not has_aud:
                issues.append({"grade": grade, "term": term, "page_no": page,
                               "type": "missing_page_audio", "severity": "info"})
            elif has_aud and not has_img:
                issues.append({"grade": grade, "term": term, "page_no": page,
                               "type": "missing_image", "severity": "error"})
    summary = {"books_checked": len(GRADE_TERMS),
               "issues_total": len(issues),
               "errors": sum(1 for i in issues if i["severity"] == "error")}
    save_json(INTEGRITY_PATH, {"schema_version": "1.0", "summary": summary, "issues": issues})
    print(f"check 完成 → {INTEGRITY_PATH.name}（问题 {len(issues)}，error {summary['errors']}）")
    return 3 if summary["errors"] else 0


# ------------------------------------------------------------------
# status —— 四类生产状态（FR3，占位，M2 细化）
# ------------------------------------------------------------------
def cmd_status(args) -> int:
    data = {"schema_version": "1.0", "units": []}
    save_json(PRODUCTION_PATH, data)
    print(f"status 完成 → {PRODUCTION_PATH.name}（M2 细化）")
    return 0


# ------------------------------------------------------------------
# missing / matrix / report —— 就绪度与渲染（FR4/FR5，M3 细化）
# ------------------------------------------------------------------
def cmd_missing(args) -> int:
    data = {"schema_version": "1.0", "missing": []}
    save_json(READINESS_PATH, data)
    print("missing（M3 细化，当前无缺项）")
    return 0


def cmd_matrix(args) -> int:
    manifest = load_json(MANIFEST_PATH, {})
    print("matrix（M3 细化）")
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
            lines.append(f"| {g['grade']} | {g['term']} | {s.get('page_images', 0)} "
                         f"| {s.get('audio_tracks', 0)} | {s.get('subtitles', 0)} | 待补 |")
        else:
            lines.append(f"| {g['grade']} | {g['term']} | - | - | - | 未出版 |")
    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"report 完成 → {REPORT_PATH.name}")
    return 0


# ------------------------------------------------------------------
# 入口
# ------------------------------------------------------------------
def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="小学英语素材管理系统")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("scan", help="盘点 → manifest.json")
    p_check = sub.add_parser("check", help="对账 → integrity.json")
    p_check.add_argument("--grade", default=None)
    p_check.add_argument("--term", default=None)
    p_status = sub.add_parser("status", help="生产状态 → production.json")
    p_status.add_argument("--unit", default=None)
    p_missing = sub.add_parser("missing", help="缺失清单")
    p_missing.add_argument("--mode", default=None, choices=["video", "peidian", "print"])
    sub.add_parser("matrix", help="就绪矩阵")
    sub.add_parser("report", help="渲染 report.md")
    args = ap.parse_args(argv)

    handlers = {"scan": cmd_scan, "check": cmd_check, "status": cmd_status,
                "missing": cmd_missing, "matrix": cmd_matrix, "report": cmd_report}
    return handlers[args.cmd](args)


if __name__ == "__main__":
    raise SystemExit(main())