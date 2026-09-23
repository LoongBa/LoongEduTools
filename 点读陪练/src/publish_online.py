# -*- coding: utf-8 -*-
"""
点读陪练 · 在线内容发布（publish_online.py）

从各单元构建产物生成在线版内容目录（manifest@2 + 单元 JSON + 素材 URL 化），供：
  - 前端在线形态（WebH5 build:online + RemoteProvider）消费：
      GET /api/manifest  → 本脚本产出的 manifest.json
      GET /api/units/<id> → 本脚本产出的 units/<id>.json
  - 素材（audio/images）复制到 assets/，由外部上传命令推送 COS/CDN（脚本不依赖腾讯云 SDK）

协议对齐：docs/英语点读陪练_在线能力兼容接口设计.md §3.4
  manifest@2: { schema, updated_at, grades: [{ grade_code, grade_label, units: [{ id, no, title, cn, version, hash }] }] }
  units/<id>.json: { content, song, textbook }（素材字段 = <base> + 相对路径，完整 URL）

用法：
  python publish_online.py -u u01,u02 [--base https://cdn.example.com/edu] [-o out_dir]
    -u, --unit      单元目录名，逗号分隔多单元（默认 u01）
    --base          CDN/素材基地址（默认 https://cdn.loongba.cn/edu；不含结尾 / 时会补）
    -o, --out       输出目录（默认 点读陪练/build/online；每次全量重建）
"""
import argparse, hashlib, json, re, shutil
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # 点读陪练/


def log(msg: str):
    print(msg, flush=True)


def content_hash(p: Path) -> str:
    return hashlib.sha1(p.read_bytes()).hexdigest()[:8]


def grade_label_of(pkg: dict) -> str:
    year_map = {'1': '一', '2': '二', '3': '三', '4': '四', '5': '五', '6': '六'}
    term_map = {'A': '上', 'B': '下'}
    grade_raw = str(pkg.get('grade', ''))
    m = re.match(r'(\d)([AB]?)', grade_raw)
    return f"{year_map.get(m.group(1), m.group(1))}年级{term_map.get(m.group(2), '')}" if m else grade_raw


def unit_no(pkg: dict) -> int:
    m = re.match(r'[Uu]?(\d+)', str(pkg.get('unit', '')))
    return int(m.group(1)) if m else 0


def walk_urlize(obj, unit_id: str, base: str):
    """递归把 content/song/textbook 里的素材字段改写成完整 URL。

    规则（与 WebH5 absAudio 相对化互补——在线形态素材直引）：
      content.json  audio 字段   u01_s0_h01.mp3        → <base>/units/u01/audio/u01_s0_h01.mp3
      content.json  image 字段   u01_s0_h01.webp       → <base>/units/u01/images/u01_s0_h01.webp
      song.json     audio/instrumental  song_vocal.mp3 → <base>/units/u01/song/song_vocal.mp3
      textbook      lines[].audio textbook/line_01.mp3 → <base>/units/u01/song/textbook/line_01.mp3
    已是完整 URL / data: / blob: 的保持原样。
    """
    def urlize(path: str, kind: str) -> str:
        if re.match(r'^(https?:|data:|blob:)', path, re.I) or path.startswith(('./', '../')):
            return path
        p = path.lstrip('/')
        if kind == 'audio':
            # 点唱台整曲/跟读：song/xxx → song 目录；textbook/xxx → song/textbook；wav → mp3（public 已转码）
            if p.startswith('textbook/'):
                return f'{base}/units/{unit_id}/song/{p}'
            if 'song' in p:
                clean = p[len('song/') :] if p.startswith('song/') else p
                clean = re.sub(r'\.wav$', '.mp3', clean, flags=re.I)
                return f'{base}/units/{unit_id}/song/{clean}'
            return f'{base}/units/{unit_id}/audio/{p}'
        return f'{base}/units/{unit_id}/images/{p}'

    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == 'audio' and isinstance(v, str):
                obj[k] = urlize(v, 'audio')
            elif k == 'instrumental' and isinstance(v, str):
                obj[k] = urlize(v, 'audio')
            elif k == 'image' and isinstance(v, str):
                obj[k] = urlize(v, 'image')
            elif isinstance(v, (dict, list)):
                walk_urlize(v, unit_id, base)
    elif isinstance(obj, list):
        for i in obj:
            walk_urlize(i, unit_id, base)


def find_content_pkg(unit_dir: Path, unit_id: str) -> Path | None:
    for name in (f'{unit_id}_content_package.json', '04_content_package.json'):
        cand = unit_dir / name
        if cand.exists():
            return cand
    return None


def build_unit(unit_dir: Path, unit_id: str, base: str) -> dict | None:
    """产出单元素材：{ content, song, textbook }（URL 化）+ 复制静态素材（压缩版）。

    素材源用 WebH5/public/units/<uid>/（发布脚本产物：PNG→WebP、wav→mp3、双后缀归一），
    非 build/uXX/assets 原始素材（避免 2048² PNG / wav 源混入在线包）。
    """
    pkg = find_content_pkg(unit_dir, unit_id)
    if not pkg:
        log(f'  ⚠️ 缺内容包: {unit_dir}')
        return None
    with open(pkg, encoding='utf-8') as f:
        content = json.load(f)

    pub = ROOT / 'WebH5' / 'public' / 'units' / unit_id
    if not pub.is_dir():
        log(f'  ⚠️ 缺压缩素材（先跑 publish_offline.py 素材入 public）: {pub}')

    # song/textbook JSON：优先 public（compress 后，audio 字段指向 mp3），回退 build/assets
    sj_candidates = [pub / 'song' / 'song.json', unit_dir / 'assets' / 'song' / 'song.json']
    tj_candidates = [pub / 'song' / 'textbook_lyrics.json', unit_dir / 'assets' / 'song' / 'textbook_lyrics.json']
    song = None
    textbook = None
    for cand in sj_candidates:
        if cand.exists():
            song = json.loads(cand.read_text(encoding='utf-8'))
            break
    for cand in tj_candidates:
        if cand.exists():
            textbook = json.loads(cand.read_text(encoding='utf-8'))
            break

    # 素材 URL 化（深拷贝，不改源）
    for src in (content, song, textbook):
        if src:
            walk_urlize(src, unit_id, base)

    # 压缩素材复制（public 优先；回退 build/assets 同名目录）
    def copy_media(src_dir: Path):
        if src_dir.is_dir():
            shutil.copytree(src_dir, OUT_ASSETS / unit_id / src_dir.name, dirs_exist_ok=True)
    for sub in ('audio', 'images', 'song'):
        copy_media(pub / sub if (pub / sub).is_dir() else unit_dir / 'assets' / sub)

    return {'content': content, 'song': song, 'textbook': textbook}


def main():
    ap = argparse.ArgumentParser(description='点读陪练在线内容发布（manifest@2 + 单元 JSON + 素材 URL 化）')
    ap.add_argument('-u', '--unit', default='u01', help='单元目录名，逗号分隔多单元（默认 u01）')
    ap.add_argument('--base', default='https://cdn.loongba.cn/edu', help='CDN/素材基地址')
    ap.add_argument('-o', '--out', default=None, help='输出目录（默认 点读陪练/build/online）')
    args = ap.parse_args()

    unit_ids = [u.strip().lower() for u in args.unit.split(',') if u.strip()]
    base = args.base.rstrip('/')
    out_root = Path(args.out) if args.out else ROOT / 'build' / 'online'
    global OUT_ASSETS
    OUT_ASSETS = out_root / 'assets'

    if out_root.exists():
        shutil.rmtree(out_root)

    log(f'=== 在线内容发布 -> {out_root}（base={base}）===')
    manifest = {'schema': 'manifest@2', 'updated_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'grades': []}
    by_grade: dict[str, dict] = {}
    n_units = 0

    for uid in unit_ids:
        unit_dir = ROOT / 'build' / uid
        if not (unit_dir / 'assets').is_dir():
            log(f'  ⚠️ 单元目录不存在: {unit_dir}')
            continue
        data = build_unit(unit_dir, uid, base)
        if not data or not data['content']:
            continue
        pkg = data['content']
        label = grade_label_of(pkg)
        g = by_grade.setdefault(label, {'grade_code': str(pkg.get('grade', '')), 'grade_label': label, 'units': []})
        g['units'].append({
            'id': uid,
            'no': unit_no(pkg),
            'title': str(pkg.get('title', '')),
            'cn': str(pkg.get('topic', '')) or str(pkg.get('title', '')),
            'version': str(pkg.get('schema_version', '1.0')),
            'hash': content_hash(find_content_pkg(unit_dir, uid)),
        })
        out_units = out_root / 'units'
        out_units.mkdir(parents=True, exist_ok=True)
        with open(out_units / f'{uid}.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        n_units += 1
        log(f'  ✅ {uid} -> units/{uid}.json（hash={g["units"][-1]["hash"]}，素材已 URL 化）')

    if n_units == 0:
        log('❌ 无可用单元，退出')
        raise SystemExit(1)

    manifest['grades'] = [by_grade[k] for k in sorted(by_grade)]
    with open(out_root / 'manifest.json', 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    mb = lambda p: sum(x.stat().st_size for x in p.rglob('*') if x.is_file()) / 1024 / 1024
    log(f'  ✅ manifest.json（{len(manifest["grades"])} 册 / {n_units} 单元）')
    log(f'  ✅ assets/ 素材 {mb(OUT_ASSETS):.2f}MB（audio/images/song 复制，待上传 COS）')
    log('=== 完成 ===')
    log(f'内容目录: {out_root}')
    log(f'部署：assets/ 上传 COS（同 base 路径）；manifest.json + units/ 托管为 /api/manifest + /api/units/<id>（可纯静态）')


if __name__ == '__main__':
    main()
