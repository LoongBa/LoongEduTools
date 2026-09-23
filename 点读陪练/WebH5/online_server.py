# -*- coding: utf-8 -*-
"""
点读陪练 · 在线版单文件测试服务器（零第三方依赖，Python 3.8+ 标准库）

一个文件即可在真实服务器上跑通在线版全链路：
  静态 dist（WebH5 在线构建产物） + /api/* 三端点 + 素材直引

端点：
  GET  /                    在线版应用（dist/index.html + assets/）
  GET  /assets/units/...    在线内容素材（build/online/assets/，publish_online.py 产物）
  GET  /api/manifest        manifest@2（build/online/manifest.json）
  GET  /api/units/<id>      单元 JSON（build/online/units/<id>.json）
  POST /api/progress        学习统计上报（追加写入 progress_log.jsonl，零数据库）

部署三步：
  1. 在线构建：  cd WebH5 && pnpm build:online
  2. 在线内容：  python ../src/publish_online.py -u u01,u02 --base http://<主机>:<端口>（素材与站点同源时）
  3. 启动：      python3 online_server.py --port 8080（dist 与 build/online 默认路径，dist 可分开上传）

用法：
  python online_server.py [--port 8080] [--dist <dist目录>] [--data <publish_online输出>] [--log <progress落盘>]
"""
import argparse, json, mimetypes, os, re, sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIST_DIR = ROOT / 'dist'
DATA_DIR = ROOT.parent / 'build' / 'online'

mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('application/json', '.json')
mimetypes.add_type('image/webp', '.webp')


class OnlineHandler(BaseHTTPRequestHandler):
    dist_dir = DIST_DIR  # main() 里可覆盖
    data_dir = DATA_DIR
    progress_log: Path | None = None

    # ---- 路由 ----
    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/api/manifest':
            return self._serve_file(self.data_dir / 'manifest.json', 'application/json')
        m = re.match(r'^/api/units/([^/]+)$', path)
        if m:
            return self._serve_file(self.data_dir / 'units' / f'{m.group(1)}.json', 'application/json')
        if path.startswith('/assets/units/'):
            return self._serve_file(self.data_dir / 'assets' / path[len('/assets/') :])
        # 素材直引（publish_online.py URL 化规则：{base}/units/<uid>/... → build/online/assets/<uid>/...）
        if path.startswith('/units/'):
            return self._serve_file(self.data_dir / 'assets' / path[len('/units/') :])
        if path == '/':
            return self._serve_file(self.dist_dir / 'index.html')
        if path.startswith('/assets/'):
            return self._serve_file(self.dist_dir / path.lstrip('/'))
        # 其余 dist 根目录静态文件（theme-boot.js 等）
        f = self.dist_dir / path.lstrip('/')
        if not f.is_file():
            self.send_error(404, f'not found: {path}')
            return
        self._serve_file(f)

    def do_POST(self):
        if self.path == '/api/progress':
            return self._recv_progress()
        self.send_error(404)

    # ---- 实现 ----
    def _serve_file(self, p: Path, ct: str | None = None):
        if not p.is_file():
            self.send_error(404, f'not found: {p}')
            return
        self.send_response(200)
        self.send_header('Content-Type', ct or mimetypes.guess_type(str(p))[0] or 'application/octet-stream')
        # 静态资源可缓存；API 不缓存
        self.send_header('Cache-Control', 'no-store' if '/api/' in self.path else 'public, max-age=3600')
        self.send_header('Content-Length', str(p.stat().st_size))
        self.end_headers()
        with open(p, 'rb') as f:
            self.wfile.write(f.read())

    def _recv_progress(self):
        length = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(length) if length else b''
        rec: dict = {}
        try:
            rec = json.loads(body.decode('utf-8'))
        except Exception:
            pass
        rec['_receivedAt'] = datetime.now(timezone.utc).isoformat()
        log = self.progress_log or (self.data_dir / 'progress_log.jsonl')
        try:
            log.parent.mkdir(parents=True, exist_ok=True)
            with open(log, 'a', encoding='utf-8') as f:
                f.write(json.dumps(rec, ensure_ascii=False) + '\n')
        except Exception as e:
            self.send_error(500, f'progress log write failed: {e}')
            return
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(
            json.dumps({'ok': True, 'lastSubmittedAt': int(datetime.now().timestamp() * 1000)}).encode('utf-8')
        )

    def log_message(self, fmt, *args):  # 精简 access log（过滤心跳噪音）
        msg = fmt % args
        if not re.search(r'/(favicon|__)', msg):
            sys.stderr.write('[%s] %s\n' % (self.log_date_time_string(), msg))


def main():
    ap = argparse.ArgumentParser(description='点读陪练在线版单文件测试服务器（零依赖）')
    ap.add_argument('--port', type=int, default=int(os.environ.get('PORT', '8080')))
    ap.add_argument('--dist', default=str(DIST_DIR), help='在线 dist 构建产物目录')
    ap.add_argument('--data', default=str(DATA_DIR), help='publish_online.py 输出目录')
    ap.add_argument('--log', default=None, help='progress 落盘文件（默认 <data>/progress_log.jsonl）')
    args = ap.parse_args()

    OnlineHandler.dist_dir = Path(args.dist).resolve()
    OnlineHandler.data_dir = Path(args.data).resolve()
    OnlineHandler.progress_log = Path(args.log).resolve() if args.log else None

    print(f'点读陪练在线版服务器 http://0.0.0.0:{args.port}')
    print(f'  dist  : {OnlineHandler.dist_dir}')
    print(f'  data  : {OnlineHandler.data_dir}')
    print('  progress 落盘:', OnlineHandler.progress_log or (OnlineHandler.data_dir / 'progress_log.jsonl'))
    ThreadingHTTPServer(('0.0.0.0', args.port), OnlineHandler).serve_forever()


if __name__ == '__main__':
    main()