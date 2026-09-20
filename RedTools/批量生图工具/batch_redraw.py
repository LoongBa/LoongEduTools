#!/usr/bin/env python3
"""批量重绘特例 — 基于通用批量引擎，快速创建教材页面重绘任务"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
# 支持直接 `python batch_redraw.py` 运行
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from batch_engine import parse_pages  # noqa: E402

TASKS_DIR = ROOT / "tasks"

# 默认提示词模板
DEFAULT_PROMPT = (
    "将这张教材页面图片重绘为卡通风格。要求：\n"
    "1. 保留原始布局和内容结构\n"
    "2. 人物、动物、物品改为可爱卡通风格\n"
    "3. 背景保留但可以简化美化\n"
    "4. 所有文字必须完整保留，不得修改或遗漏\n"
    "5. 保持整体色彩鲜艳、风格统一"
)


def create_redraw_task(
    task_name: str,
    source_dir: str,
    prompt: str = DEFAULT_PROMPT,
    output_suffix: str = "_redrawn",
    size: str = "auto",
    page_filter: list[int] | None = None,
) -> Path:
    """创建一个重绘任务目录

    Args:
        task_name: 任务名（如 pep4s_u01）
        source_dir: 原图目录路径
        prompt: 重绘提示词
        output_suffix: 输出文件名后缀
        size: 图片尺寸
        page_filter: 页码过滤（如 [2,3,4]）

    Returns:
        任务目录路径
    """
    task_dir = TASKS_DIR / task_name
    task_dir.mkdir(parents=True, exist_ok=True)
    (task_dir / "output").mkdir(exist_ok=True)

    # config.json
    config = {
        "task_name": task_name,
        "provider": "sensenova",
        "model": "sensenova-u1.5-lite",
        "size": size,
        "concurrency": "auto",
        "retry": {"max_attempts": 3, "backoff_seconds": 5},
    }
    with open(task_dir / "config.json", "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)

    # prompts/default.txt
    prompts_dir = task_dir / "prompts"
    prompts_dir.mkdir(exist_ok=True)
    with open(prompts_dir / "default.txt", "w", encoding="utf-8") as f:
        f.write(prompt)

    # 扫描原图，生成 jobs.json
    source = Path(source_dir)
    exts = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
    files = sorted(p for p in source.iterdir() if p.suffix.lower() in exts)

    if page_filter:
        wanted = {f"page_{n:03d}" for n in page_filter} | {f"Page_{n:03d}" for n in page_filter}
        files = [p for p in files if p.stem in wanted]

    jobs = []
    for img in files:
        jobs.append({
            "id": img.stem,
            "prompt": prompt,
            "input_image": str(img),
            "output_path": f"output/{img.stem}{output_suffix}.png",
            "params": {"size": size},
        })

    with open(task_dir / "jobs.json", "w", encoding="utf-8") as f:
        json.dump(jobs, f, indent=2, ensure_ascii=False)

    print(f"✅ 任务已创建: {task_dir}")
    print(f"   原图: {len(jobs)} 张  从 {source}")
    print(f"   提示词: {prompts_dir / 'default.txt'}")
    return task_dir


def create_from_book_json(
    task_name: str,
    book_json_path: str,
    image_dir: str,
    prompt: str = DEFAULT_PROMPT,
    unit_filter: str | None = None,
    size: str = "auto",
) -> Path:
    """从 book.json 创建重绘任务（按单元拆分）

    Args:
        task_name: 任务名前缀（如 pep4s）
        book_json_path: book.json 路径
        image_dir: 原图目录
        prompt: 提示词
        unit_filter: 单元过滤（如 Unit01）
        size: 尺寸
    """
    with open(book_json_path, "r", encoding="utf-8") as f:
        book = json.load(f)

    source = Path(image_dir)
    task_dir = TASKS_DIR / task_name
    task_dir.mkdir(parents=True, exist_ok=True)
    (task_dir / "output").mkdir(exist_ok=True)

    config = {
        "task_name": task_name,
        "provider": "sensenova",
        "model": "sensenova-u1.5-lite",
        "size": size,
        "concurrency": "auto",
        "retry": {"max_attempts": 3, "backoff_seconds": 5},
    }
    with open(task_dir / "config.json", "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)

    prompts_dir = task_dir / "prompts"
    prompts_dir.mkdir(exist_ok=True)
    with open(prompts_dir / "default.txt", "w", encoding="utf-8") as f:
        f.write(prompt)

    # 从 book.json 提取页码
    pages = []
    for page in book.get("bookpage", []):
        page_no = page.get("page_no")
        if page_no is None:
            continue
        pages.append(page_no)

    if unit_filter:
        # 按 track_genre 过滤单元
        filtered_pages = set()
        for page in book.get("bookpage", []):
            for track in page.get("track_info", []):
                genre = track.get("track_genre", "")
                if unit_filter.lower() in genre.lower():
                    filtered_pages.add(page.get("page_no"))
        pages = sorted(filtered_pages)

    jobs = []
    for page_no in pages:
        img_name = f"Page_{page_no:03d}"
        # 尝试多种扩展名
        img_path = None
        for ext in [".png", ".jpg", ".jpeg", ".webp"]:
            candidate = source / f"{img_name}{ext}"
            if candidate.exists():
                img_path = candidate
                break
        if not img_path:
            continue

        jobs.append({
            "id": img_name.lower(),
            "prompt": prompt,
            "input_image": str(img_path),
            "output_path": f"output/{img_name}_redrawn.png",
            "params": {"size": size},
        })

    with open(task_dir / "jobs.json", "w", encoding="utf-8") as f:
        json.dump(jobs, f, indent=2, ensure_ascii=False)

    print(f"✅ 任务已创建: {task_dir}")
    print(f"   页数: {len(jobs)}")
    return task_dir


def main() -> None:
    ap = argparse.ArgumentParser(description="批量重绘任务创建工具")
    sub = ap.add_subparsers(dest="cmd")

    # create 子命令
    p_create = sub.add_parser("create", help="从原图目录创建重绘任务")
    p_create.add_argument("task_name", help="任务名")
    p_create.add_argument("source_dir", help="原图目录")
    p_create.add_argument("--prompt", default=DEFAULT_PROMPT, help="提示词")
    p_create.add_argument("--size", default="auto", help="图片尺寸")
    p_create.add_argument("--pages", help="页码过滤（如 2,4,6-10,15）")

    # create-book 子命令
    p_book = sub.add_parser("create-book", help="从 book.json 创建重绘任务")
    p_book.add_argument("task_name", help="任务名前缀")
    p_book.add_argument("book_json", help="book.json 路径")
    p_book.add_argument("image_dir", help="原图目录")
    p_book.add_argument("--prompt", default=DEFAULT_PROMPT, help="提示词")
    p_book.add_argument("--unit", help="单元过滤（如 Unit01）")
    p_book.add_argument("--size", default="auto", help="图片尺寸")

    args = ap.parse_args()

    if args.cmd == "create":
        pages = parse_pages(args.pages) if args.pages else None
        create_redraw_task(args.task_name, args.source_dir, args.prompt, size=args.size, page_filter=pages)
    elif args.cmd == "create-book":
        create_from_book_json(args.task_name, args.book_json, args.image_dir, args.prompt, args.unit, args.size)
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
