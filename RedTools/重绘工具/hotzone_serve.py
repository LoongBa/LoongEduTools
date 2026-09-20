#!/usr/bin/env python3
"""热区校正工具 — 一键服务入口（副本数据 + 本地 HTTP 自动加载）

用法:
  python hotzone_serve.py                        # 默认四上 U0，端口 8765
  python hotzone_serve.py --book 四年级_上册     # 指定册
  python hotzone_serve.py --book 四年级_上册 --unit 0
  python hotzone_serve.py --port 9000
  python hotzone_serve.py --force                # 强制覆盖 book.json 副本（默认已存在则跳过）

功能:
  1. 【副本数据】把 book.json 复制到素材目录（如 四年级/上册/book.json），
     编辑器加载并修改的是这份副本，与 Downloader/Diandu/data 原始数据断开；
     已存在且未变化则跳过（--force 覆盖，谨慎：会覆盖人工改动）。
  2. 【本地服务】自写 HTTP 服务：
        /redtools/*  →  RedTools 根（编辑器页面）
        其余路径     →  素材库根 F:\\_教材素材\\人教版（PEP）（主编：吴欣）
     浏览器打开 http://localhost:<port>/redtools/重绘工具/hotzone_editor/index.html?book=<册>&unit=<单元>
  3. 编辑器在 http 模式下自动加载 book/图片/重绘/音频，无需手动选目录。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import threading
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

REDTOOLS = Path(r"F:\LoongBa_Git\LoongEduTools\RedTools")
DATA_DIR = Path(r"F:\LoongBa_Git\LoongEduTools\Downloader\Diandu\data")
MAT_ROOT = Path(r"F:\_教材素材\人教版（PEP）（主编：吴欣）")

# 册次映射：key → (bookid, grade, vol, 工具名, 素材册目录)
BOOKS = [
    ("一年级_上册",   "1212001101247", "一年级", "上册", "英语点读"),
    ("一年级_下册",   "1212001102247", "一年级", "下册", "英语点读"),
    ("二年级_上册",   "1212001201247", "二年级", "上册", "英语点读"),
    ("二年级_下册",   "1212001202247", "二年级", "下册", "英语点读"),
    ("三年级_上册",   "1212001301245", "三年级", "上册", "英语点读"),
    ("三年级_下册",   "1212001302245", "三年级", "下册", "英语点读"),
    ("四年级_上册",   "1212001401255", "四年级", "上册", "英语点读"),
    ("四年级_下册",   "1212001402255", "四年级", "下册", "英语点读"),
    ("五年级_上册",   "1212001501255", "五年级", "上册", "英语点读"),
    ("五年级_下册",   "1212001502255", "五年级", "下册", "英语点读"),
    ("六年级_上册",   "1212001601265", "六年级", "上册", "英语点读"),
]
BOOK_MAP = {k: (bid, g, v, tool) for k, (bid, g, v, tool) in [(b[0], (b[1], b[2], b[3], b[4])) for b in BOOKS]}


def fmt_local(ts: float | None) -> str:
    """时间戳 → 本地 'yyyy-MM-dd HH:mm'"""
    if not ts:
        return ""
    import datetime
    return datetime.datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M")


def prepare_book_copy(key: str, force: bool = False) -> Path | None:
    """把 book.json 复制到素材目录的重绘目录（_重绘图片素材/book.json），
    与重绘图对齐存放、与原数据断开；编辑器只读写这份副本。"""
    if key not in BOOK_MAP:
        sys.exit(f"❌ 未知册次: {key}，可用: {list(BOOK_MAP)}")
    bid, grade, vol, _tool = BOOK_MAP[key]
    src = DATA_DIR / f"{bid}_英语（PEP）_{grade}_{vol}.json"
    if not src.exists():
        print(f"⚠️  原始 book.json 不存在（跳过副本复制）: {src.name}")
        return None
    dst = MAT_ROOT / grade / vol / "_重绘图片素材" / "book.json"
    if dst.exists() and not force:
        # 比较内容：相同则跳过，不同则提示
        if dst.read_bytes() == src.read_bytes():
            print(f"⏭  book.json 副本已是最新: {dst}")
        else:
            print(f"⚠️  book.json 副本与原始不同（人工改动过？）。")
            print(f"    --force 覆盖副本，否则保留现状继续。")
        return dst
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    print(f"✅ book.json 副本已就绪: {dst}（{src.stat().st_size // 1024} KB，与重绘对齐存放、与原数据断开）")
    return dst


def build_manifest(grade: str, vol: str) -> Path:
    """扫描单句音频目录，生成重绘目录下 _hotzone_manifest.json 供编辑器自动加载"""
    audio_dir = MAT_ROOT / grade / vol / "_音频素材" / "单句音频"
    audio: dict[str, dict[str, str]] = {}
    if audio_dir.exists():
        for f in sorted(audio_dir.glob("P*_*.mp3")):
            m = re.match(r"^P(\d{3})_(\d{2})_", f.name)
            if m:
                audio.setdefault(str(int(m.group(1))), {})[str(int(m.group(2)))] = f.name
    manifest = {"grade": grade, "vol": vol, "audio": audio}
    out = MAT_ROOT / grade / vol / "_重绘图片素材" / "_hotzone_manifest.json"
    out.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    print(f"✅ 音频清单已生成: {out}（{len(audio)} 页）")
    return out


class Handler(SimpleHTTPRequestHandler):
    """双根服务：/redtools/* → RedTools；其余 → 素材库根；API：status / save_hotzone"""

    # ---- GET /api/status?book=四年级_上册：单元状态汇总（供工作台） ----
    def do_GET(self) -> None:
        if self.path.split("?", 1)[0] == "/api/status":
            self._handle_status()
            return
        super().do_GET()

    def _send_json(self, obj: dict, code: int = 200) -> None:
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _handle_status(self) -> None:
        qs = parse_qs(urlparse(self.path).query)
        book = qs.get("book", ["四年级_上册"])[0]
        if book not in BOOK_MAP:
            self._send_json({"error": f"未知册次: {book}"}, 400)
            return
        bid, grade, vol, _tool = BOOK_MAP[book]
        redr = MAT_ROOT / grade / vol / "_重绘图片素材"
        # 图片最新时间（重绘目录）
        img_mt = None
        if redr.exists():
            fs = [f for f in redr.glob("*.png") if f.is_file()]
            if fs:
                img_mt = max(f.stat().st_mtime for f in fs)
        # 审核统计（qa_reviews.json 全局文件，未来迁移为册级 review.json）
        reviews: dict = {}
        qf = REDTOOLS / "重绘工具" / "qa_reviews.json"
        if qf.exists():
            allr = json.loads(qf.read_text(encoding="utf-8"))
            reviews = allr.get(book, {})
        # 单元列表 + 各单元校正文件
        units: list[dict] = []
        bpath = redr / "book.json"
        if bpath.exists():
            bookdata = json.loads(bpath.read_text(encoding="utf-8-sig"))
            ch = bookdata.get("bookaudio_v3", [])
            pages_max = max((p.get("page_no", 0) for p in bookdata.get("bookpage", [])), default=0)
            for i, c in enumerate(ch):
                start = int(c.get("page_no", 0))
                end = pages_max + 1
                if i + 1 < len(ch) and ch[i + 1].get("page_no"):
                    end = int(ch[i + 1].get("page_no"))
                title = c.get("title", f"Unit {i + 1}")
                # 匹配本单元校正文件（重绘目录；标题归一化）
                hz = None
                if redr.exists():
                    norm = title.replace(" ", "").replace("_", "")
                    for f in redr.glob("热区校正_*.json"):
                        stem = f.stem[len("热区校正_"):]
                        if stem.replace(" ", "").replace("_", "") == norm:
                            hz = {"file": f.name,
                                  "updated_at": fmt_local(f.stat().st_mtime)}
                            break
                # 审核统计（该单元页码范围）
                done = passed = failed = 0
                for pno in range(start, end):
                    rv = reviews.get(str(pno))
                    if not rv or rv.get("pass") is None:
                        continue
                    done += 1
                    if rv.get("pass") is True:
                        passed += 1
                    else:
                        failed += 1
                units.append({"index": i, "title": title, "start": start, "end": end,
                              "pages": max(0, end - start),
                              "hotzone": hz,
                              "review": {"done": done, "pass": passed, "fail": failed}})
        self._send_json({"book": book, "grade": grade, "vol": vol,
                         "img_updated_at": fmt_local(img_mt), "units": units})

    # ---- 热区校正保存：POST /api/save_hotzone {dir, filename, content} → _重绘图片素材/<filename>（覆盖同名=更新） ----
    def do_POST(self) -> None:
        if self.path.split("?", 1)[0] != "/api/save_hotzone":
            self.send_error(404, "unknown api")
            return
        length = int(self.headers.get("Content-Length", 0) or 0)
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            self.send_error(400, "bad json")
            return
        dirname = data.get("dir", "")          # 四年级/上册
        filename = data.get("filename", "")    # 热区校正_*.json
        content = data.get("content")
        grade, _, vol = dirname.partition("/")
        key = f"{grade}_{vol}"
        safe = (Path(filename).name == filename
                and filename.startswith("热区校正_") and filename.endswith(".json"))
        if (not isinstance(content, dict)) or key not in BOOK_MAP or not safe:
            self.send_error(400, "invalid dir/filename/content")
            return
        dst = MAT_ROOT / grade / vol / "_重绘图片素材" / filename
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(json.dumps(content, ensure_ascii=False, indent=2), encoding="utf-8")
        msg = f"已保存: {dst}（覆盖同名=更新）"
        body = msg.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        print(f"[save] {dst}")

    def translate_path(self, path: str) -> str:
        # 去掉查询串 + 中文路径 percent-encode 解码
        path = unquote(path.split("?", 1)[0].split("#", 1)[0])
        if path.startswith("/redtools/"):
            rel = path[len("/redtools/"):]
            base = REDTOOLS
        else:
            rel = path.lstrip("/")
            base = MAT_ROOT
        if not rel:
            rel = "index.html" if base == REDTOOLS else ""
        full = (base / rel).resolve()
        # 防目录穿越：必须落在 base 内
        if full != base and base not in full.parents:
            return str(base / "index.html")
        return str(full)

    def log_message(self, fmt, *args):
        sys.stdout.write(f"[http] {self.address_string()} {fmt % args}\n")


def main() -> None:
    ap = argparse.ArgumentParser(description="热区校正工具一键服务")
    ap.add_argument("--book", default="四年级_上册", help="册次 key，如 四年级_上册")
    ap.add_argument("--unit", type=int, default=0, help="初始单元下标")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--force", action="store_true", help="强制覆盖 book.json 副本")
    ap.add_argument("--no-browser", action="store_true", help="不自动打开浏览器")
    args = ap.parse_args()

    if args.book not in BOOK_MAP:
        sys.exit(f"❌ 未知册次: {args.book}，可用: {list(BOOK_MAP)}")

    _bid, grade, vol, _tool = BOOK_MAP[args.book]
    prepare_book_copy(args.book, force=args.force)
    build_manifest(grade, vol)

    handler = partial(Handler, directory=str(MAT_ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    url = (f"http://127.0.0.1:{args.port}/redtools/重绘工具/hotzone_editor/index.html"
           f"?book={args.book}&unit={args.unit}")
    print(f"\n🚀 热区校正服务已启动: http://127.0.0.1:{args.port}")
    print(f"📖 编辑器: {url}")
    print("Ctrl+C 停止服务\n")

    if not args.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 服务已停止")


if __name__ == "__main__":
    main()
