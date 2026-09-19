#!/usr/bin/env python3
"""重绘工具 — 公共脚本（RedTools 开发支撑能力）

调用 SenseNova U1.5 Lite `/v1/images/edits` 接口，以本地参考图进行
参考图重绘（图生图 / 风格化 / 避版权重绘）。

任务组织：`重绘工具/tasks/<任务名>/` 下每个任务独立目录，包含：
  config.json       任务配置（模型 / 尺寸 / 输入输出目录 / 提示词文件 / 页过滤）
  prompts/*.txt     提示词（可多套，config 指定用哪套）
  input/            参考图（教材原图 / 素材图）
  output/           重绘结果（自动生成）

用法:
  python redraw.py --task pep4s_bg --page 5            # 重绘单页
  python redraw.py --task pep4s_bg --pages 5,8,12      # 重绘多页
  python redraw.py --task pep4s_bg --all               # 重绘 input/ 全部
  python redraw.py --task pep4s_bg --page 5 --force    # 覆盖已存在输出
  python redraw.py --list-tasks                        # 列出任务
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent
TASKS_DIR = ROOT / "tasks"

API_BASE = "https://token.sensenova.cn/v1"
EDIT_ENDPOINT = "/images/edits"
MODEL = "sensenova-u1.5-lite"

# 输入图预处理：长边超过此值则先缩放（控制 base64 体积，加速请求）
MAX_INPUT_EDGE = 1600

# 并发锁：保护 key_manager 调用
_key_lock = threading.Lock()


def log(msg: str) -> None:
    print(msg, flush=True)


def load_config(task_dir: Path) -> dict:
    cfg_path = task_dir / "config.json"
    if not cfg_path.exists():
        log(f"❌ 缺少配置文件: {cfg_path}")
        sys.exit(1)
    with open(cfg_path, "r", encoding="utf-8") as f:
        return json.load(f)


def resolve_prompt(task_dir: Path, cfg: dict) -> str:
    prompt_file = cfg.get("prompt_file", "prompts/redraw.txt")
    p = task_dir / prompt_file
    if not p.exists():
        log(f"❌ 缺少提示词文件: {p}")
        sys.exit(1)
    with open(p, "r", encoding="utf-8") as f:
        return f.read().strip()


def preprocess_image(src: Path, max_edge: int = MAX_INPUT_EDGE) -> tuple[bytes, str]:
    """读取图片，若超尺寸则用 PIL 等比缩放。

    返回 (字节, 真实MIME) —— 注意预处理可能转换格式（PNG→JPEG），
    MIME 必须以实际输出字节为准，不能按源文件扩展名猜测。
    """
    try:
        from PIL import Image, ImageOps
    except ImportError:
        return src.read_bytes(), guess_mime(src)  # 无 PIL 时直接用原图

    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im)
        w, h = im.size
        if max(w, h) <= max_edge:
            # 未超限：原字节直传（不重编码），MIME 按扩展名
            return src.read_bytes(), guess_mime(src)
        scale = max_edge / max(w, h)
        new_size = (max(1, int(w * scale)), max(1, int(h * scale)))
        im = im.convert("RGB")
        im = im.resize(new_size, Image.LANCZOS)
        import io
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=90)
        return buf.getvalue(), "image/jpeg"  # 缩放后统一 JPEG


def call_edits(cfg: dict, prompt: str, image_bytes: bytes, mime: str, api_key: str | None = None) -> dict:
    # 调用方负责提供 key（一张图换一个）；未提供时回退到环境变量
    if api_key is None:
        api_key = os.environ.get("SENSENOVA_API_KEY")
        if not api_key:
            log("❌ 未设置环境变量 SENSENOVA_API_KEY")
            sys.exit(1)

    b64 = base64.b64encode(image_bytes).decode("ascii")
    data_url = f"data:{mime};base64,{b64}"

    payload = {
        "model": cfg.get("model", MODEL),
        "images": [{"image_url": data_url}],
        "prompt": prompt,
        "n": 1,
        "size": cfg.get("size", "auto"),
        "watermark": cfg.get("watermark", False),
        "prompt_extend": cfg.get("prompt_extend", True),
        "response_format": cfg.get("response_format", "url"),
    }

    base = cfg.get("api_base", API_BASE)
    url = base + EDIT_ENDPOINT
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    log(f"🚀 POST {url}  size={payload['size']}  prompt({len(prompt)}字)")
    t0 = time.time()
    resp = requests.post(url, headers=headers, json=payload, timeout=600)
    log(f"   HTTP {resp.status_code}  耗时 {time.time()-t0:.1f}s")
    if resp.status_code != 200:
        # 抛出带状态码的异常，由调用方判断是否额度用完（换 key 重试）
        raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:500]}")
    return resp.json()


# 服务器判定“额度用完/无余额/限流”的错误信号（换 key 重试）
QUOTA_SIGNALS = (
    "quota", "balance", "insufficient", "limit", "exhausted",
    "额度", "余额", "次数", "限流", "用完",
    "402", "429",
)


def is_quota_error(e: Exception) -> bool:
    text = str(e).lower()
    return any(sig in text for sig in QUOTA_SIGNALS)


def download_image(url: str, out_path: Path) -> None:
    log(f"📥 下载 → {out_path.name}")
    r = requests.get(url, timeout=120)
    r.raise_for_status()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(r.content)
    log(f"✅ 已保存: {out_path} ({len(r.content)/1024:.0f} KB)")


def guess_mime(path: Path) -> str:
    ext = path.suffix.lower()
    return {
        ".png": "image/png",
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(ext, "image/png")


def collect_inputs(task_dir: Path, cfg: dict, page_filter: list[int] | None) -> list[Path]:
    input_dir = task_dir / cfg.get("input_dir", "input")
    if not input_dir.exists():
        log(f"❌ 输入目录不存在: {input_dir}")
        sys.exit(1)

    exts = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
    files = sorted(p for p in input_dir.iterdir() if p.suffix.lower() in exts)

    if page_filter is not None:
        wanted = {f"page_{n:03d}" for n in page_filter} | {f"Page_{n:03d}" for n in page_filter}
        files = [p for p in files if p.stem in wanted]
        if not files:
            log(f"⚠️ 页过滤后无匹配文件（期望 stem 形如 page_005 / Page_005）")
            sys.exit(1)
    return files


def redraw_page(cfg: dict, prompt: str, src: Path, out_path: Path, force: bool) -> bool:
    if out_path.exists() and not force:
        log(f"⏭ 已存在，跳过: {out_path.name}（--force 覆盖）")
        return False

    image_bytes, mime = preprocess_image(src)

    # key_manager 轮换：一张图换一个 key；额度用完自动标记并换下一个重试
    try:
        from key_manager import get_next_key, mark_exhausted, key_label
        km = True
    except ImportError:
        km = False

    attempts = 0
    result = None
    while True:
        attempts += 1
        # 并发安全：使用锁保护 key_manager 调用
        with _key_lock:
            api_key = get_next_key() if km else None
            if km and not api_key:
                log("❌ 所有 API Key 都在额度周期内，无法使用")
                return False

        try:
            result = call_edits(cfg, prompt, image_bytes, mime, api_key)
            break
        except Exception as e:
            if km and is_quota_error(e):
                log(f"  ⚠️ {key_label(api_key)} 额度用完，自动标记并换 Key 重试")
                with _key_lock:
                    mark_exhausted(api_key)
                continue  # 换下一个 key 重试同一张图
            log(f"❌ 请求失败（第 {attempts} 次）: {e}")
            return False

    images = result.get("data", [])
    if not images:
        log(f"❌ 响应无图片数据: {result}")
        return False

    item = images[0]
    if item.get("url"):
        download_image(item["url"], out_path)
        return True
    if item.get("b64_json"):
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "wb") as f:
            f.write(base64.b64decode(item["b64_json"]))
        log(f"✅ 已保存(b64): {out_path.name}")
        return True

    log(f"❌ 响应既无 url 也无 b64_json: {result}")
    return False


def list_tasks() -> None:
    if not TASKS_DIR.exists():
        log("（无任务）")
        return
    for task_dir in sorted(TASKS_DIR.iterdir()):
        if not task_dir.is_dir():
            continue
        cfg = load_config(task_dir)
        in_dir = task_dir / cfg.get("input_dir", "input")
        out_dir = task_dir / cfg.get("output_dir", "output")
        n_in = len(list(in_dir.glob("*"))) if in_dir.exists() else 0
        n_out = len(list(out_dir.glob("*"))) if out_dir.exists() else 0
        log(f"📁 {task_dir.name}  (input {n_in} 项 / output {n_out} 项)  "
            f"size={cfg.get('size','auto')}  prompt={cfg.get('prompt_file','-')}")


def main() -> None:
    ap = argparse.ArgumentParser(description="重绘工具：SenseNova 参考图重绘")
    ap.add_argument("--task", help="任务名（tasks/ 下的子目录名）")
    ap.add_argument("--page", type=int, help="重绘单页（页码，如 5 → Page_005.*）")
    ap.add_argument("--pages", help="重绘多页（逗号分隔，如 5,8,12）")
    ap.add_argument("--all", action="store_true", help="重绘 input/ 全部")
    ap.add_argument("--force", action="store_true", help="覆盖已存在输出")
    ap.add_argument("--out-dir", help="覆盖输出目录名（如 output_v2，便于对比多版提示词）")
    ap.add_argument("--prompt-file", help="覆盖提示词文件路径（相对任务目录或绝对路径）")
    ap.add_argument("--list-tasks", action="store_true", help="列出任务")
    ap.add_argument("--parallel", type=int, default=1, help="并行数（默认1顺序，5=5个key同时）")
    args = ap.parse_args()

    if args.list_tasks:
        list_tasks()
        return

    if not args.task:
        ap.print_help()
        sys.exit(1)

    task_dir = TASKS_DIR / args.task
    if not task_dir.is_dir():
        log(f"❌ 任务不存在: {task_dir}")
        list_tasks()
        sys.exit(1)

    cfg = load_config(task_dir)
    if args.prompt_file:
        # 支持相对路径（相对于任务目录）和绝对路径
        pf = Path(args.prompt_file)
        if not pf.is_absolute():
            pf = task_dir / pf
        if not pf.exists():
            log(f"❌ 提示词文件不存在: {pf}")
            sys.exit(1)
        with open(pf, "r", encoding="utf-8") as f:
            prompt = f.read().strip()
        log(f"📝 使用自定义提示词: {pf.name}")
    else:
        prompt = resolve_prompt(task_dir, cfg)
    out_dir = task_dir / (args.out_dir or cfg.get("output_dir", "output"))

    # 页过滤：--page > --pages > --all > config.pages
    page_filter: list[int] | None = None
    if args.page is not None:
        page_filter = [args.page]
    elif args.pages:
        page_filter = [int(x.strip()) for x in args.pages.split(",") if x.strip()]
    elif not args.all and cfg.get("pages"):
        page_filter = list(cfg["pages"])

    inputs = collect_inputs(task_dir, cfg, page_filter)
    log(f"🎯 任务 [{args.task}] 待重绘 {len(inputs)} 页  并行={args.parallel}")

    ok = 0
    if args.parallel <= 1:
        # 顺序模式（原逻辑）
        for src in inputs:
            out_name = src.stem + "_redrawn.png"
            out_path = out_dir / out_name
            log(f"\n{'='*56}\n🖼 {src.name} → {out_name}")
            try:
                if redraw_page(cfg, prompt, src, out_path, args.force):
                    ok += 1
            except Exception as e:
                log(f"❌ 异常: {e}")
    else:
        # 并行模式：每个线程使用不同 key
        def process_one(src):
            out_name = src.stem + "_redrawn.png"
            out_path = out_dir / out_name
            log(f"\n🖼 开始: {src.name}")
            try:
                if redraw_page(cfg, prompt, src, out_path, args.force):
                    return True
            except Exception as e:
                log(f"❌ {src.name} 异常: {e}")
            return False

        with ThreadPoolExecutor(max_workers=args.parallel) as executor:
            futures = {executor.submit(process_one, src): src for src in inputs}
            for future in as_completed(futures):
                if future.result():
                    ok += 1

    log(f"\n{'='*56}\n✅ 完成: {ok}/{len(inputs)} 成功 → {out_dir}")


if __name__ == "__main__":
    main()
