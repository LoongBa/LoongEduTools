#!/usr/bin/env python3
"""一键应用质检导出 → 合并 qa_reviews.json → 重新生成报告（去 AI 中转）

用法:
  python apply_qa_review.py <导出的审核.json>       # 应用导出并重新生成报告
  python apply_qa_review.py --dry-run <file>        # 预览将发生的变化
  python apply_qa_review.py --regen                 # 仅重新生成报告

合并规则（与质检报告导出逻辑对称，可覆盖、不重复）：
  - 通过页(pass:true)  ：覆盖为干净最终态（issues/reason/labels/history 清空）
  - 需重绘页(pass:false)：覆盖 pass/issues/reason/marks/labels/reviewed_at；
    history 保留导出内容，与已有最后一条内容相同则覆盖时间戳（不追加重复）
  - 导出来自哪一册（book 字段），只更新该册，其他册记录不受影响
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REVIEWS = ROOT / "qa_reviews.json"
GEN = ROOT / "gen_qa_reports.py"


def load_json(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))


def same_entry(a: dict, b: dict) -> bool:
    """内容相同判定（用于历史去重：相同则覆盖时间戳，不追加）"""
    return (
        a.get("pass") == b.get("pass")
        and json.dumps(a.get("issues", []), sort_keys=True) == json.dumps(b.get("issues", []), sort_keys=True)
        and (a.get("reason") or "") == (b.get("reason") or "")
        and json.dumps(a.get("marks", []), sort_keys=True) == json.dumps(b.get("marks", []), sort_keys=True)
    )


def merge_history(old_hist: list | None, new_hist: list | None) -> list:
    """旧历史 + 新历史去重合并：与最后一条相同则覆盖时间戳，否则追加"""
    hist = list(old_hist or [])
    for entry in new_hist or []:
        if hist and same_entry(hist[-1], entry):
            hist[-1]["timestamp"] = entry.get("timestamp", hist[-1].get("timestamp"))
        else:
            hist.append(entry)
    return hist


def main() -> None:
    ap = argparse.ArgumentParser(description="一键应用质检导出（去 AI 中转）")
    ap.add_argument("file", nargs="?", help="质检报告导出的审核 JSON 文件路径")
    ap.add_argument("--dry-run", action="store_true", help="预览将发生的变化，不写入")
    ap.add_argument("--regen", action="store_true", help="仅重新生成质检报告")
    args = ap.parse_args()

    if args.regen:
        subprocess.run([sys.executable, str(GEN)], check=True)
        print("✅ 质检报告已重新生成")
        return

    if not args.file:
        ap.print_help()
        sys.exit(1)

    export = load_json(Path(args.file))
    book = export.get("book")
    reviews = export.get("reviews", {})
    if not book or not reviews:
        print(f"❌ 导出文件缺少 book/reviews 字段: {args.file}")
        sys.exit(1)

    all_reviews = load_json(REVIEWS) if REVIEWS.exists() else {}
    book_rev = all_reviews.setdefault(book, {})
    changed = 0
    for page, rv in reviews.items():
        page = str(page)
        if rv.get("pass") is True:
            clean = {
                "pass": True, "issues": [], "reason": "", "marks": [],
                "labels": [], "reviewed_at": rv.get("reviewed_at"), "history": [],
            }
            if book_rev.get(page) != clean:
                changed += 1
            book_rev[page] = clean
        else:
            old = book_rev.get(page) or {}
            entry = {
                "pass": rv.get("pass", False),
                "issues": rv.get("issues", []),
                "reason": rv.get("reason", ""),
                "marks": rv.get("marks", []),
                "labels": rv.get("labels", []),
                "reviewed_at": rv.get("reviewed_at"),
                "history": merge_history(old.get("history"), rv.get("history", [])),
            }
            if book_rev.get(page) != entry:
                changed += 1
            book_rev[page] = entry

    if args.dry_run:
        print(f"🔍 dry-run: {book} 将更新 {len(reviews)} 页（其中 {changed} 页有变更）")
        return

    REVIEWS.write_text(json.dumps(all_reviews, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"✅ {book} 已合并 {len(reviews)} 页（{changed} 页有变更）")
    subprocess.run([sys.executable, str(GEN)], check=True)
    print("✅ 质检报告已重新生成")


if __name__ == "__main__":
    main()
