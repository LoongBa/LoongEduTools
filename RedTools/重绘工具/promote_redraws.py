#!/usr/bin/env python3
"""质检通过 → 提材（任务 output → 素材目录）→ 可选重建点读 zip，一键闭环

用法:
  python promote_redraws.py --book 四年级_上册                # 该册所有 pass:true 页提材
  python promote_redraws.py --book 四年级_上册 --pages 9      # 仅指定页（逗号分隔）
  python promote_redraws.py --book 四年级_上册 --dry-run      # 只预览不复制
  python promote_redraws.py --book 四年级_上册 --build        # 提材后重建点读 zip
  python promote_redraws.py --book 四年级_上册 --build --units 0   # 重建指定单元

逻辑:
  1. 读 qa_reviews.json 中指定册（book 字段）pass:true 的页
  2. 仅在对应册前缀的任务目录（tasks/pep<年级><册>_*/output*，如 四年级_上册 → pep4s_*）
     下找 Page_NNN_redrawn.png（同名多版本取最新 mtime）
  3. 复制到素材目录 _重绘图片素材/Page_NNN.png（原素材先备份到 _重绘图片素材_backup/）
  4. --build 时调用 build_all.py（--tool 默认 英语点读，可用 --units 过滤单元）
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MAT = Path(r"F:\_教材素材\人教版（PEP）（主编：吴欣）")
REVIEWS = ROOT / "qa_reviews.json"
BUILD_ALL = ROOT.parent / "build_all.py"

# 册次 → 任务前缀：四年级_上册 → pep4s（年级数字 + s/x）
GRADE_NO = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6}
VOL_CODE = {"上册": "s", "下册": "x"}


def book_to_prefix(book: str) -> str:
    """'四年级_上册' → 'pep4s'（任务目录前缀，防跨册串图）"""
    grade, _, vol = book.partition("_")
    if not grade or not vol or grade[0] not in GRADE_NO or vol not in VOL_CODE:
        sys.exit(f"❌ book 格式应为 年级_册次（如 四年级_上册），收到: {book}")
    return f"pep{GRADE_NO[grade[0]]}{VOL_CODE[vol]}"


def find_latest_redrawn(page: int, prefix: str) -> Path | None:
    """在 tasks/<prefix>*/output*/ 下找 Page_NNN_redrawn.png，同名多版本取最新 mtime"""
    hits: list[Path] = []
    for task_dir in (ROOT / "tasks").glob(f"{prefix}*"):
        if not task_dir.is_dir():
            continue
        for out_dir in task_dir.glob("output*"):
            if out_dir.is_dir():
                hits.extend(out_dir.glob(f"Page_{page:03d}_redrawn.png"))
    if not hits:
        return None
    return max(hits, key=lambda p: p.stat().st_mtime)


def book_to_mat_dir(book: str) -> Path:
    """'四年级_上册' → F:\_教材素材\...\四年级\上册（素材目录）"""
    grade, _, vol = book.partition("_")
    if not vol:
        sys.exit(f"❌ book 格式应为 年级_册次（如 四年级_上册），收到: {book}")
    return MAT / grade / vol


def main() -> None:
    ap = argparse.ArgumentParser(description="质检通过 → 提材 → 可选重建（一键闭环）")
    ap.add_argument("--book", required=True, help="册次，如 四年级_上册")
    ap.add_argument("--pages", help="仅指定页（逗号分隔），默认该册全部 pass:true 页")
    ap.add_argument("--dry-run", action="store_true", help="只预览不复制")
    ap.add_argument("--build", action="store_true", help="提材后重建点读 zip")
    ap.add_argument("--tool", default="英语点读", help="重建时用的工具名（默认 英语点读）")
    ap.add_argument("--units", help="重建时指定单元（如 0 或 0,1），默认全部")
    args = ap.parse_args()

    if not REVIEWS.exists():
        sys.exit("❌ qa_reviews.json 不存在")
    all_reviews = json.loads(REVIEWS.read_text(encoding="utf-8"))
    book_rev = all_reviews.get(args.book, {})
    if not book_rev:
        sys.exit(f"❌ qa_reviews.json 中无 {args.book} 的审核记录")

    if args.pages:
        wanted = {str(int(x.strip())) for x in args.pages.split(",") if x.strip()}
    else:
        wanted = {p for p, rv in book_rev.items() if rv.get("pass") is True}
    if not wanted:
        sys.exit("❌ 没有需要提材的页（--pages 指定或 pass:true 页为空）")

    mat_dir = book_to_mat_dir(args.book)
    target_dir = mat_dir / "_重绘图片素材"
    backup_dir = mat_dir / "_重绘图片素材_backup"
    if not target_dir.exists():
        sys.exit(f"❌ 素材目录不存在: {target_dir}")

    todo = []
    prefix = book_to_prefix(args.book)
    print(f"📁 任务前缀过滤: {prefix}*")
    for page in sorted(int(p) for p in wanted):
        src = find_latest_redrawn(page, prefix)
        if src is None:
            print(f"⏭  Page_{page:03d}: 任务 output 中未找到重绘图，跳过")
            continue
        dst = target_dir / f"Page_{page:03d}.png"
        todo.append((page, src, dst))

    if not todo:
        print("❌ 无可提材页面"); sys.exit(1)
    print(f"🎯 {args.book} 待提材 {len(todo)} 页" + ("（dry-run）" if args.dry_run else ""))

    for page, src, dst in todo:
        existed = dst.exists()
        if existed and not args.dry_run:
            backup_dir.mkdir(exist_ok=True)
            shutil.copy2(dst, backup_dir / f"Page_{page:03d}_v_prev.png")
        action = f"{src} → {dst.name}" + (f"（备份旧版）" if existed else "（新提材）")
        print(f"  ✅ Page_{page:03d}: {action}")
        if not args.dry_run:
            shutil.copy2(src, dst)

    if args.build and not args.dry_run:
        cmd = [sys.executable, str(BUILD_ALL), "--tool", args.tool]
        if args.units:
            cmd += ["--units"] + args.units.split(",")
        print(f"\n🔨 重建: {' '.join(cmd)}")
        subprocess.run(cmd, check=True)
        print("✅ 重建完成")
    elif args.build:
        print("\n🔨 dry-run 跳过重建（加 --build 实际执行）")


if __name__ == "__main__":
    main()
