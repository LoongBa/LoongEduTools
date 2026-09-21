#!/usr/bin/env python3
"""热区校正工具 — 一键服务入口（副本数据 + 本地 HTTP 自动加载）

用法:
  python hotzone_serve.py                        # 默认四上 U0，端口 8765
  python hotzone_serve.py --book 四年级_上册     # 指定册
  python hotzone_serve.py --book 四年级_上册 --unit 0
  python hotzone_serve.py --port 9000
  python hotzone_serve.py --force                # 强制覆盖 book.json 副本（默认已存在则跳过）

功能:
  1. 【副本数据】把 book.json 复制到素材目录的重绘目录（如 四年级/上册/_重绘图片素材/书数据.json），
     编辑器加载并修改的是这份副本，与 PEP词库/data/diandu 原始数据断开；
     已存在且未变化则跳过（--force 覆盖，谨慎：会覆盖人工改动）。
  2. 【本地服务】自写 HTTP 服务：
        /redtools/*  →  RedTools 根（编辑器页面）
        其余路径     →  素材库根 F:\\_教材素材\\人教版（PEP）（主编：吴欣）
     浏览器打开 http://localhost:<port>/redtools/重绘工具/hotzone_editor/index.html?book=<册>&unit=<单元>
  3. 编辑器在 http 模式下自动加载 book/图片/重绘/音频，无需手动选目录。
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

REDTOOLS = Path(r"F:\LoongBa_Git\LoongEduTools\RedTools")
if str(REDTOOLS) not in sys.path:
    sys.path.insert(0, str(REDTOOLS))  # 允许 from build_framework import resolve_unit_no 等复用
DATA_DIR = Path(r"F:\LoongBa_Git\LoongEduTools\PEP词库\data\diandu")
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

# ---- 重绘任务队列（内存 + 后台 worker 线程） ----
TASK_QUEUE: list[dict] = []
TASK_LOCK = threading.Lock()
FILE_LOCK = threading.Lock()  # 校验记录.json / 审核记录.json 并发读写一致性（read-modify-write 整段持锁）
TASK_WORKER_STARTED = False
REDRAW_PROMPT = "prompts/cartoon_redraw_clear_text.txt"  # 强化提示词（文字清晰）
REDRAW_OUTDIR = "output_v2fix"


def task_name_for(book_key: str, unit_index: int, title: str) -> str:
    """单元 → 重绘任务名：四年级_上册 U02 → pep4s_u02；Revision → pep4s_rev；Appendix 1 → pep4s_app1"""
    bid, grade, vol, _tool = BOOK_MAP[book_key]
    grade_no = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6}[grade[0]]
    vol_code = {"上册": "s", "下册": "x"}[vol]
    prefix = f"pep{grade_no}{vol_code}"
    low = (title or "").lower()
    if low.startswith("revision"):
        return f"{prefix}_rev"
    if low.startswith("appendix"):
        m = re.search(r"appendix\s*(\d+)", title, re.I)
        return f"{prefix}_app{m.group(1)}" if m else f"{prefix}_app"
    m = re.search(r"unit\s*(\d+)", title, re.I)
    return f"{prefix}_u{int(m.group(1)):02d}" if m else f"{prefix}_u{unit_index + 1:02d}"


def _now_iso() -> str:
    import datetime
    return datetime.datetime.now().isoformat(timespec="seconds")


def redraw_worker() -> None:
    """顺序执行队列中的重绘任务（subprocess 调 redraw.py，强化提示词 → output_v2fix）"""
    while True:
        with TASK_LOCK:
            task = next((t for t in TASK_QUEUE if t["status"] == "queued"), None)
        if not task:
            time.sleep(1)
            continue
        with TASK_LOCK:
            task["status"] = "running"
            task["started_at"] = _now_iso()
        cmd = [sys.executable, str(REDTOOLS / "重绘工具" / "redraw.py"),
               "--task", task["task"], "--page", str(task["page"]),
               "--out-dir", REDRAW_OUTDIR, "--prompt-file", REDRAW_PROMPT,
               "--force"]  # 强制覆盖输出（任务语义=重新重绘该页）
        err = ""
        try:
            # 增量日志：stdout/stderr 并流收集；线程读 stdout 入队 + 主循环带超时 poll——
            # 子进程零输出挂起时也能每 1s 检查 deadline 后 kill（纯 for line 会永久阻塞读）
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                    text=True, encoding="utf-8", errors="replace")
            q: queue.Queue[str | None] = queue.Queue()
            _end = object()

            def _reader() -> None:
                try:
                    for ln in proc.stdout:
                        q.put(ln)
                except Exception:
                    pass
                finally:
                    q.put(_end)  # EOF sentinel

            threading.Thread(target=_reader, daemon=True).start()
            deadline = time.time() + 600
            while True:
                try:
                    ln = q.get(timeout=1.0)
                    if ln is _end:
                        break
                    task["logs"].append(ln.rstrip())
                    if len(task["logs"]) > 500:
                        task["logs"] = task["logs"][-500:]
                except queue.Empty:
                    if time.time() > deadline:
                        task["logs"].append("[timeout] 子进程超时，强制终止")
                        proc.kill()
                        break
                    if proc.poll() is not None:
                        break  # 子进程已退出但 stdout 未 EOF（异常）→ 结束收集
            proc.wait(timeout=10)  # kill/退出后 wait 快速返回
            ok = proc.returncode == 0
            if not ok:
                err = "\n".join(task["logs"][-300:])
        except Exception as e:
            ok = False
            err = str(e)
        with TASK_LOCK:
            task["status"] = "done" if ok else "failed"
            task["done_at"] = _now_iso()
            task["error"] = err


def ensure_worker() -> None:
    global TASK_WORKER_STARTED
    if not TASK_WORKER_STARTED:
        TASK_WORKER_STARTED = True
        threading.Thread(target=redraw_worker, daemon=True).start()


def fmt_local(ts: float | None) -> str:
    """时间戳 → 本地 'yyyy-MM-dd HH:mm'"""
    if not ts:
        return ""
    import datetime
    return datetime.datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M")


def prepare_book_copy(key: str, force: bool = False) -> Path | None:
    """把 book.json 复制到素材目录的重绘目录（_重绘图片素材/书数据.json），
    与重绘图对齐存放、与原数据断开；编辑器只读写这份副本。"""
    if key not in BOOK_MAP:
        sys.exit(f"❌ 未知册次: {key}，可用: {list(BOOK_MAP)}")
    bid, grade, vol, _tool = BOOK_MAP[key]
    src = DATA_DIR / f"{bid}_英语（PEP）_{grade}_{vol}.json"
    if not src.exists():
        print(f"⚠️  原始 book.json 不存在（跳过副本复制）: {src.name}")
        return None
    dst = MAT_ROOT / grade / vol / "_重绘图片素材" / "书数据.json"
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
    print(f"✅ 书数据副本已就绪: {dst}（{src.stat().st_size // 1024} KB，与重绘对齐存放、与原数据断开）")
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

    # ---- GET 路由：/api/status / api/tasks ----
    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        if path == "/api/status":
            self._handle_status()
            return
        if path == "/api/tasks":
            self._api_tasks()
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
        # 审核统计（每册独立审核记录：_重绘图片素材/审核记录.json）
        reviews: dict = {}
        qf = MAT_ROOT / grade / vol / "_重绘图片素材" / "审核记录.json"
        if qf.exists():
            with FILE_LOCK:
                reviews = json.loads(qf.read_text(encoding="utf-8"))
        # 单元列表 + 各单元校正文件
        units: list[dict] = []
        bpath = redr / "书数据.json"
        if not bpath.exists():
            bpath = redr / "book.json"  # 旧名兼容
        if bpath.exists():
            bookdata = json.loads(bpath.read_text(encoding="utf-8-sig"))
            ch = bookdata.get("bookaudio_v3", [])
            pages_max = max((int(p.get("page_no") or 0) for p in bookdata.get("bookpage", [])), default=0)
            # 产物名前缀：新英语{grade首字}{vol首字}点读（BOOK_MAP 派生，非硬编码）
            app_prefix = f"新英语{grade[0]}{vol[0]}点读"
            for i, c in enumerate(ch):
                start = int(c.get("page_no", 0))
                end = pages_max + 1
                if i + 1 < len(ch) and ch[i + 1].get("page_no"):
                    end = int(ch[i + 1].get("page_no"))
                title = c.get("title", f"Unit {i + 1}")
                # 匹配本单元校正文件（重绘目录；标题归一化）——hz=展示元数据，hz_data=内容（校验用）
                hz = None
                hz_data = None
                if redr.exists():
                    norm = title.replace(" ", "").replace("_", "")
                    for f in redr.glob("热区校正_*.json"):
                        stem = f.stem[len("热区校正_"):]
                        if stem.replace(" ", "").replace("_", "") == norm:
                            hz = {"file": f.name,
                                  "updated_at": fmt_local(f.stat().st_mtime)}
                            try:
                                hz_data = json.loads(f.read_text(encoding="utf-8"))
                            except Exception:
                                hz_data = None
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
                # 页数：按实际 bookpage 计数（缺页/末单元边界自动正确）
                actual_pages = sum(1 for p in bookdata.get("bookpage", [])
                                   if start <= int(p.get("page_no") or 0) < end)
                try:
                    from build_framework import resolve_unit_no, build_unit_data, validate_hotzones, validate_page_completeness
                    unit_no = resolve_unit_no(bookdata, i)
                    # 热区坐标校验：纯计算、无 IO 成本，status 自动算（校正后最终坐标）
                    hz_issues = 0
                    page_issues = 0
                    page_zt = 0
                    try:
                        unit = build_unit_data(bookdata, i, start, end, hz)
                        hz_issues = len(validate_hotzones(unit))
                        # 书页完整性：缺页 + 双缺图（原版兜底 WARN 不计数）；零track 单独 page_zt 展示
                        comp = validate_page_completeness(bookdata, unit, start, end,
                                                          MAT_ROOT / grade / vol / "_图片素材", redr)
                        page_issues = len(comp["missing_pages"]) + len(comp["both_missing_imgs"])
                        page_zt = len(comp["zero_track_pages"])
                    except Exception:
                        hz_issues = -1  # 无法构建单元（数据异常）
                        page_issues = -1
                        page_zt = -1
                except ImportError:
                    unit_no = title
                    hz_issues = -1
                    page_issues = -1
                    page_zt = -1
                app_name = f"{app_prefix}{unit_no}单元"
                # 音频缺失：读缓存（校验记录.json；null=未校验；mtime 变化=stale→null）
                audio_missing = None
                vf = redr / "校验记录.json"
                if vf.exists():
                    try:
                        with FILE_LOCK:
                            vdata = json.loads(vf.read_text(encoding="utf-8"))
                        am = vdata.get("audio", {}).get(str(i))
                        if am is not None:
                            # staleness：书数据/校正/音频任一 mtime 变化 → 缓存过期 → null
                            stale = False
                            mt = vdata.get("mtime") or {}
                            if mt.get("book") != (bpath.stat().st_mtime if bpath.exists() else 0):
                                stale = True
                            elif mt.get("hotzone") != (
                                    max((f.stat().st_mtime for f in redr.glob("热区校正_*.json")), default=0)
                                    if redr.exists() else 0):
                                stale = True
                            else:
                                ad = MAT_ROOT / grade / vol / "_重读音频素材" / "单句音频"
                                if not ad.exists():
                                    ad = MAT_ROOT / grade / vol / "_音频素材" / "单句音频"
                                if mt.get("audio") != (
                                        max((f.stat().st_mtime for f in ad.glob("*.mp3")), default=0)
                                        if ad.exists() else 0):
                                    stale = True
                            if not stale:
                                audio_missing = am.get("missing", 0)
                    except Exception:
                        pass
                units.append({"index": i, "title": title, "start": start, "end": end,
                              "pages": actual_pages,
                              "hotzone": hz,
                              "app_name": app_name,
                              "review": {"done": done, "pass": passed, "fail": failed},
                              "validation": {"hz_issues": hz_issues, "page_issues": page_issues,
                                              "page_zt": page_zt, "audio_missing": audio_missing}})
        self._send_json({"book": book, "grade": grade, "vol": vol,
                         "img_updated_at": fmt_local(img_mt), "units": units})

    # ---- 热区校正保存：POST /api/save_hotzone {dir, filename, content} → _重绘图片素材/<filename>（覆盖同名=更新） ----
    def do_POST(self) -> None:
        path = self.path.split("?", 1)[0]
        if path == "/api/save_hotzone":
            self._api_save_hotzone()
        elif path == "/api/save_review":
            self._api_save_review()
        elif path == "/api/promote":
            self._api_promote()
        elif path == "/api/rebuild":
            self._api_rebuild()
        elif path == "/api/redraw":
            self._api_redraw()
        elif path == "/api/tasks":
            self._api_tasks()
        elif path == "/api/tasks/clear":
            self._api_tasks_clear()
        elif path == "/api/validate":
            self._api_validate()
        elif path == "/api/audit":
            self._api_audit()
        else:
            self.send_error(404, "unknown api")

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", 0) or 0)
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def _api_save_hotzone(self) -> None:
        try:
            data = self._read_json()
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

    # ---- 审核保存：POST /api/save_review {book, reviews} → 合并 册级审核记录.json + 重生成报告 ----
    def _api_save_review(self) -> None:
        try:
            data = self._read_json()
        except Exception:
            self._send_json({"error": "bad json"}, 400)
            return
        book = data.get("book", "")
        reviews = data.get("reviews")
        if not book or not isinstance(reviews, dict):
            self._send_json({"error": "需 book + reviews"}, 400)
            return
        if book not in BOOK_MAP:
            self._send_json({"error": f"未知册次: {book}"}, 400)
            return
        _bid, grade, vol, _tool = BOOK_MAP[book]
        try:
            from apply_qa_review import merge_history
        except ImportError:
            def merge_history(old, new):
                hist = list(old or [])
                for e in new or []:
                    hist.append(e)
                return hist
        qf = MAT_ROOT / grade / vol / "_重绘图片素材" / "审核记录.json"
        with FILE_LOCK:
            bref = json.loads(qf.read_text(encoding="utf-8")) if qf.exists() else {}
            changed = 0
            for page, rv in reviews.items():
                page = str(page)
                if rv.get("pass") is True:
                    clean = {"pass": True, "issues": [], "reason": "", "marks": [], "labels": [],
                             "reviewed_at": rv.get("reviewed_at"), "history": []}
                    if bref.get(page) != clean:
                        changed += 1
                    bref[page] = clean
                else:
                    old = bref.get(page) or {}
                    entry = {"pass": rv.get("pass", False), "issues": rv.get("issues", []),
                             "reason": rv.get("reason", ""), "marks": rv.get("marks", []),
                             "labels": rv.get("labels", []), "reviewed_at": rv.get("reviewed_at"),
                             "history": merge_history(old.get("history"), rv.get("history", []))}
                    if bref.get(page) != entry:
                        changed += 1
                    bref[page] = entry
            qf.write_text(json.dumps(bref, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        # 重生成报告（限本册，避免全量 SSIM 拖慢）
        subprocess.run([sys.executable, str(REDTOOLS / "重绘工具" / "gen_qa_reports.py"),
                        "--book", book], capture_output=True, timeout=600)
        self._send_json({"ok": True, "book": book, "pages": len(reviews), "changed": changed})

    # ---- 提材：POST /api/promote {book, pages?} → 审核通过页从任务 output 复制到重绘目录 ----
    def _api_promote(self) -> None:
        try:
            data = self._read_json()
        except Exception:
            self._send_json({"error": "bad json"}, 400)
            return
        book = data.get("book", "四年级_上册")
        if book not in BOOK_MAP:
            self._send_json({"error": f"未知册次: {book}"}, 400)
            return
        try:
            import promote_redraws as PR
            prefix = PR.book_to_prefix(book)
            matdir = PR.book_to_mat_dir(book)
            target = matdir / "_重绘图片素材"
            backup_dir = matdir / "_重绘图片素材_backup"
            qf = matdir / "_重绘图片素材" / "审核记录.json"
            bref = json.loads(qf.read_text(encoding="utf-8")) if qf.exists() else {}
            if data.get("pages"):
                wanted = {str(x) for x in data["pages"]}
            else:
                wanted = {p for p, rv in bref.items() if rv.get("pass") is True}
            promoted = []
            missing = []
            for page in sorted(int(p) for p in wanted):
                src = PR.find_latest_redrawn(page, prefix)
                if not src:
                    missing.append(page)
                    continue
                dst = target / f"Page_{page:03d}.png"
                if dst.exists():
                    backup_dir.mkdir(exist_ok=True)
                    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                    shutil.copy2(dst, backup_dir / f"Page_{page:03d}_v_{ts}.png")
                shutil.copy2(src, dst)
                promoted.append(page)
            self._send_json({"ok": True, "book": book, "promoted": promoted,
                             "missing": missing, "target": str(target)})
        except Exception as e:
            self._send_json({"error": str(e)}, 500)

    # ---- 重建：POST /api/rebuild {tool, units} → build_all.py，返回发布状态 ----
    def _api_rebuild(self) -> None:
        try:
            data = self._read_json()
        except Exception:
            self._send_json({"error": "bad json"}, 400)
            return
        tool = data.get("tool", "英语点读")
        units = data.get("units", [0])
        cmd = [sys.executable, str(REDTOOLS / "build_all.py"), "--tool", tool]
        if units:
            cmd += ["--units", ",".join(str(u) for u in units)]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=900)
        except subprocess.TimeoutExpired:
            self._send_json({"error": "rebuild 超时"}, 500)
            return
        out = (proc.stdout or "") + (proc.stderr or "")
        status_line = next((l.strip() for l in out.splitlines() if "发布状态" in l), "")
        self._send_json({"ok": proc.returncode == 0, "rc": proc.returncode,
                         "status": status_line, "tail": out[-1200:]})

    # ---- 审计：POST /api/audit {target} → audit_artifact.py（体积/文本门禁）+ compliance_check.py（合规自查） ----
    def _api_audit(self) -> None:
        try:
            data = self._read_json()
        except Exception:
            self._send_json({"error": "bad json"}, 400)
            return
        target = data.get("target", "")  # dist 目录或 zip 绝对路径
        if not target:
            self._send_json({"error": "需 target（dist 目录或 zip 绝对路径）"}, 400)
            return
        scripts = {
            "audit": REDTOOLS / ".skill" / "minitool-zip-builder" / "scripts" / "audit_artifact.py",
            "compliance": REDTOOLS / "scripts" / "compliance_check.py",
        }
        results: dict = {}
        tail_lines: list[str] = []
        all_ok = True
        for name, script in scripts.items():
            if not script.exists():
                results[name] = {"error": "script not found"}
                all_ok = False
                continue
            try:
                proc = subprocess.run([sys.executable, str(script), target],
                                      capture_output=True, text=True, encoding="utf-8", timeout=60)
            except subprocess.TimeoutExpired:
                results[name] = {"error": "audit 超时"}
                all_ok = False
                continue
            out = (proc.stdout or "") + (proc.stderr or "")
            lines = out.splitlines()
            errs = [l for l in lines if l.startswith("ERROR:")]
            warns = [l for l in lines if l.startswith("WARN:")]
            fails = [l for l in lines if l.startswith("FAILED:")]
            passes = [l for l in lines if l.startswith("PASS:")]
            ok = proc.returncode == 0
            if not ok:
                all_ok = False
            results[name] = {"rc": proc.returncode, "ok": ok,
                             "errors": errs, "warnings": warns,
                             "failed": fails, "passed": passes}
            tail_lines.append(out[-600:])
        self._send_json({"ok": all_ok, "target": target,
                         "audit": results.get("audit", {}),
                         "compliance": results.get("compliance", {}),
                         "tail": "\n".join(tail_lines)[-1200:]})

    # ---- 发送重绘任务：POST /api/redraw {book, unit, page} → 入队后台执行 ----
    def _api_redraw(self) -> None:
        try:
            data = self._read_json()
        except Exception:
            self._send_json({"error": "bad json"}, 400)
            return
        book = data.get("book", "四年级_上册")
        unit = int(data.get("unit", 0))
        page = int(data.get("page", 0))
        if book not in BOOK_MAP or page <= 0:
            self._send_json({"error": "book/page 无效"}, 400)
            return
        # 从重绘目录副本读单元标题 → 任务名
        _bid, grade, vol, _tool = BOOK_MAP[book]
        title = ""
        bpath = MAT_ROOT / grade / vol / "_重绘图片素材" / "书数据.json"
        if not bpath.exists():
            bpath = MAT_ROOT / grade / vol / "_重绘图片素材" / "book.json"  # 旧名兼容
        if bpath.exists():
            bd = json.loads(bpath.read_text(encoding="utf-8-sig"))
            ch = bd.get("bookaudio_v3", [])
            if unit < len(ch):
                title = ch[unit].get("title", "")
        tname = task_name_for(book, unit, title)
        tasks_dir = REDTOOLS / "重绘工具" / "tasks"
        if not (tasks_dir / tname).exists():
            self._send_json({"error": f"任务目录不存在: {tname}"}, 400)
            return
        with TASK_LOCK:
            if any(t["task"] == tname and t["page"] == page and t["status"] in ("queued", "running")
                   for t in TASK_QUEUE):
                self._send_json({"ok": True, "message": "已在队列中", "task": tname, "page": page})
                return
            TASK_QUEUE.append({"task": tname, "page": page, "unit": unit, "book": book,
                               "status": "queued", "created_at": _now_iso(),
                               "started_at": None, "done_at": None, "error": "", "logs": []})
        ensure_worker()
        q = sum(1 for t in TASK_QUEUE if t["status"] in ("queued", "running"))
        d = sum(1 for t in TASK_QUEUE if t["status"] in ("done", "failed"))
        self._send_json({"ok": True, "message": f"已入队 {tname} P{page}（队列 {q} / 完成 {d}）",
                         "task": tname, "page": page, "queue": q, "done": d})

    # ---- 任务列表：GET /api/tasks ----
    def _api_tasks(self) -> None:
        with TASK_LOCK:
            items = [dict(t) for t in reversed(TASK_QUEUE)]
        # logs 截尾 200 行（浅拷贝，避免共享可变列表的心理预期，保持 reversed 顺序）
        items = [{**t, "logs": t.get("logs", [])[-200:]} for t in items]
        self._send_json({"tasks": items,
                         "queue": sum(1 for t in items if t["status"] in ("queued", "running")),
                         "done": sum(1 for t in items if t["status"] in ("done", "failed"))})

    # ---- 清空已完成：POST /api/tasks/clear ----
    def _api_tasks_clear(self) -> None:
        with TASK_LOCK:
            kept = [t for t in TASK_QUEUE if t["status"] not in ("done", "failed")]
            removed = len(TASK_QUEUE) - len(kept)
            TASK_QUEUE[:] = kept
        self._send_json({"ok": True, "removed": removed})

    # ---- 校验：POST /api/validate {book, unit?} → 跑热区+音频校验，写 _重绘图片素材/校验记录.json（缓存） ----
    def _api_validate(self) -> None:
        try:
            data = self._read_json()
        except Exception:
            self._send_json({"error": "bad json"}, 400)
            return
        book = data.get("book", "四年级_上册")
        unit_filter = data.get("unit")  # None=全部单元
        if book not in BOOK_MAP:
            self._send_json({"error": f"未知册次: {book}"}, 400)
            return
        _bid, grade, vol, _tool = BOOK_MAP[book]
        redr = MAT_ROOT / grade / vol / "_重绘图片素材"
        bpath = redr / "书数据.json"
        if not bpath.exists():
            bpath = redr / "book.json"
        if not bpath.exists():
            self._send_json({"error": "书数据.json 不存在（该册未初始化重绘目录）"}, 400)
            return
        bookdata = json.loads(bpath.read_text(encoding="utf-8-sig"))
        ch = bookdata.get("bookaudio_v3", [])
        pages_max = max((int(p.get("page_no") or 0) for p in bookdata.get("bookpage", [])), default=0)
        try:
            from build_framework import build_unit_data, validate_hotzones, validate_audio_coverage
        except ImportError:
            self._send_json({"error": "build_framework 不可用（缺少依赖）"}, 500)
            return
        audio_dir = MAT_ROOT / grade / vol / "_重读音频素材" / "单句音频"
        if not audio_dir.exists():
            audio_dir = MAT_ROOT / grade / vol / "_音频素材" / "单句音频"
        # 读缓存（保留未变更单元的旧结果）；read-modify-write 整段持锁
        vf = redr / "校验记录.json"
        with FILE_LOCK:
            vdata = json.loads(vf.read_text(encoding="utf-8")) if vf.exists() else {}
            vdata.setdefault("audio", {})
            audio_res = vdata.get("audio", {})
            results = []
            for i, c in enumerate(ch):
                if unit_filter is not None and int(unit_filter) != i:
                    continue
                start = int(c.get("page_no", 0))
                end = pages_max + 1
                if i + 1 < len(ch) and ch[i + 1].get("page_no"):
                    end = int(ch[i + 1].get("page_no"))
                # 加载本单元校正文件（校验校正后最终坐标，与 build 同口径）
                title = c.get("title", f"Unit {i + 1}")
                hz_data = None
                if redr.exists():
                    norm = title.replace(" ", "").replace("_", "")
                    for f in redr.glob("热区校正_*.json"):
                        stem = f.stem[len("热区校正_"):]
                        if stem.replace(" ", "").replace("_", "") == norm:
                            try:
                                hz_data = json.loads(f.read_text(encoding="utf-8"))
                            except Exception:
                                hz_data = None
                            break
                try:
                    unit = build_unit_data(bookdata, i, start, end, hz_data)
                    hz = len(validate_hotzones(unit))
                    ac = validate_audio_coverage(unit, audio_dir)
                    missing = len(ac["missing_audio"])
                except Exception as e:
                    self._send_json({"error": f"单元 {i} 校验失败: {e}"}, 500)
                    return
                audio_res[str(i)] = {"missing": missing, "total": ac["total_tracks"]}
                results.append({"unit": i, "hz_issues": hz, "audio_missing": missing,
                                "audio_total": ac["total_tracks"]})
            vdata["audio"] = audio_res
            vdata["checked_at"] = _now_iso()
            # 缓存失效键：书数据 / 热区校正 / 音频目录 mtime——任一变化 → status 判 stale
            vdata["mtime"] = {
                "book": bpath.stat().st_mtime if bpath.exists() else 0,
                "hotzone": max((f.stat().st_mtime for f in redr.glob("热区校正_*.json")), default=0)
                           if redr.exists() else 0,
                "audio": max((f.stat().st_mtime for f in audio_dir.glob("*.mp3")), default=0)
                         if audio_dir.exists() else 0,
            }
            vf.write_text(json.dumps(vdata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        self._send_json({"ok": True, "results": results, "file": str(vf)})

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
