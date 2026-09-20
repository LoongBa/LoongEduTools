#!/usr/bin/env python3
"""批量生图工具 CLI — 统一入口"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
# 支持直接 `python batch_cli.py` 运行（相对导入改为包级绝对导入）
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from batch_engine import execute_task, list_tasks, parse_pages, TASKS_DIR  # noqa: E402
from key_manager import get_manager  # noqa: E402
from batch_redraw import create_redraw_task, create_from_book_json  # noqa: E402


def cmd_run(args):
    task_dir = TASKS_DIR / args.task
    if not task_dir.is_dir():
        print(f"❌ 任务不存在: {task_dir}")
        sys.exit(1)
    execute_task(
        task_dir,
        resume=args.resume,
        force=args.force,
        concurrency=args.parallel,
    )


def cmd_list(args):
    list_tasks()


def cmd_status(args):
    km = get_manager()
    status = km.get_status()
    print("\n📊 API Key 状态")
    print("=" * 56)
    for prov_name, prov_status in status.items():
        print(f"  Provider: {prov_name}")
        for k in prov_status.get("keys", []):
            icon = "⏳" if k["exhausted"] else "✅"
            line = f"    {icon} {k['label']}"
            if k["exhausted"]:
                line += f" (额度用完，{k['remaining_minutes']} 分钟后恢复)"
            print(line)
    print("=" * 56)


def cmd_clear(args):
    km = get_manager()
    if args.all:
        km.clear_state()
        print("✅ 已清除所有 Key 状态")
    elif args.provider and args.index is not None:
        km.clear_state(args.provider, args.index - 1)
        print(f"✅ 已清除 {args.provider} Key{args.index}")
    else:
        print("请指定 --provider + --index 或 --all")


def cmd_create(args):
    if args.book_json:
        create_from_book_json(
            args.task_name, args.book_json, args.source_dir,
            prompt=args.prompt, unit=args.unit, size=args.size,
        )
    else:
        pages = parse_pages(args.pages) if args.pages else None
        create_redraw_task(
            args.task_name, args.source_dir,
            prompt=args.prompt, size=args.size, page_filter=pages,
        )

def cmd_init_keys(args):
    keys_file = ROOT / "keys.json"
    if keys_file.exists() and not args.force:
        print(f"✅ keys.json 已存在: {keys_file}")
        print("   使用 --force 覆盖")
        return

    keys_cfg = {
        "sensenova": {
            "keys": args.keys if args.keys else [],
            "cycle_seconds": args.cycle or 18000,
        }
    }
    with open(keys_file, "w", encoding="utf-8") as f:
        json.dump(keys_cfg, f, indent=2, ensure_ascii=False)
    print(f"✅ 已创建: {keys_file}")

def main() -> None:
    ap = argparse.ArgumentParser(description="批量生图工具")
    sub = ap.add_subparsers(dest="cmd")

    # run
    p_run = sub.add_parser("run", help="执行批量任务")
    p_run.add_argument("task", help="任务名")
    p_run.add_argument("--resume", action="store_true", help="断点续跑")
    p_run.add_argument("--force", action="store_true", help="强制重新执行（清除完成记录）")
    p_run.add_argument("--parallel", type=int, help="并发数（默认自动匹配 key 数）")

    # list
    sub.add_parser("list", help="列出任务")

    # status
    sub.add_parser("status", help="查看 Key 状态")

    # clear
    p_clear = sub.add_parser("clear", help="清除 Key 状态")
    p_clear.add_argument("--all", action="store_true", help="清除所有")
    p_clear.add_argument("--provider", help="Provider 名")
    p_clear.add_argument("--index", type=int, help="Key 序号（1-based）")

    # create
    p_create = sub.add_parser("create", help="创建重绘任务")
    p_create.add_argument("task_name", help="任务名")
    p_create.add_argument("source_dir", help="原图目录")
    p_create.add_argument("--book-json", help="book.json 路径（按单元拆分）")
    p_create.add_argument("--unit", help="单元过滤（配合 --book-json）")
    p_create.add_argument("--prompt", default="", help="提示词（空=默认）")
    p_create.add_argument("--size", default="auto", help="图片尺寸")
    p_create.add_argument("--pages", help="页码过滤（如 2,4,6-10,15）")

    # init-keys
    p_keys = sub.add_parser("init-keys", help="初始化 keys.json")
    p_keys.add_argument("--keys", nargs="+", help="API Key 列表")
    p_keys.add_argument("--cycle", type=int, help="冷却周期秒数（默认 18000）")
    p_keys.add_argument("--force", action="store_true", help="覆盖已有配置")

    args = ap.parse_args()

    if args.cmd == "run":
        cmd_run(args)
    elif args.cmd == "list":
        cmd_list(args)
    elif args.cmd == "status":
        cmd_status(args)
    elif args.cmd == "clear":
        cmd_clear(args)
    elif args.cmd == "create":
        cmd_create(args)
    elif args.cmd == "init-keys":
        cmd_init_keys(args)
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
