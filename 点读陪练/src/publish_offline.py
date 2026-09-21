# -*- coding: utf-8 -*-
"""
点读陪练 · 离线版一键发布（V0.2-B 整合脚本）

串联发布全流程（自身同步执行，调用方请后台拉起 / 非阻塞等待）：
  1. 素材准备：build/uXX/assets/audio → WebH5/public/units/uXX/audio（双后缀别名处理）
  2. 图片压缩：build/uXX/assets/images → images_webp（PNG 2048² → WebP ≤500KB）
  3. IP 头像压缩：WebH5/public/ip/*.png → public/ip/webp/（512px WebP）
  4. 压缩图入 public：images_webp → WebH5/public/units/uXX/images
  5. WebH5 pnpm build（生成 dist/）
  6. 离线拆分：dist/ → build/offline/（含合规校验：单文件 ≤10MB）
  7. zip 打包 → RedTools/publish/学科/点读陪练_<年级上UnitNN>_离线版.zip
  8. 合规报告（zip 内单项 ≤10MB + 单元级 ≤10MB）

后台调用示例（不阻塞当前会话）：
  PowerShell:  Start-Process python -ArgumentList 'publish_offline.py','-u','u01' -RedirectStandardOutput publish.log ...
  CMD:         start /b python publish_offline.py -u u01 > publish.log 2>&1

用法：python publish_offline.py [-u uXX] [-b build_dir] [-w webh5_dir] [-p publish_dir]
  -u, --unit      单元目录名（默认 u01）
  -b, --build     单元构建目录（默认 点读陪练/build/<unit>）
  -w, --webh5     WebH5 项目目录（默认 点读陪练/WebH5）
  -p, --publish   发布目录（默认 RedTools/publish/学科）
"""
import argparse, json, os, re, shutil, subprocess, sys, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # 点读陪练/
MAX_FILE = 10 * 1024 * 1024                             # 小红书单文件上限
WEBP_Q = 75
WEBP_TARGET = 1024


# ---------------------------------------------------------------- 工具
def log(msg: str):
    print(msg, flush=True)


def release_name(pkg_path: Path) -> str:
    """按内容包 grade/unit 生成发布标签：四年级上Unit01"""
    with open(pkg_path, encoding='utf-8') as f:
        pkg = json.load(f)
    year_map = {'1': '一', '2': '二', '3': '三', '4': '四', '5': '五', '6': '六'}
    term_map = {'A': '上', 'B': '下'}
    grade_raw = str(pkg.get('grade', ''))
    unit_raw = str(pkg.get('unit', ''))
    m = re.match(r'(\d)([AB]?)', grade_raw)
    grade_label = f"{year_map.get(m.group(1), m.group(1))}年级{term_map.get(m.group(2), '')}" if m else grade_raw
    um = re.match(r'[Uu]?(\d+)', unit_raw)
    unit_label = f'Unit{um.group(1).zfill(2)}' if um else unit_raw
    return f'{grade_label}{unit_label}'


def compress_images(src_dir: Path, dst_dir: Path, target=WEBP_TARGET, q=WEBP_Q, max_bytes=500 * 1024):
    """PNG/JPG → WebP（最长边 ≤target），超 max_bytes 自动降质。返回 (张数, 总字节)"""
    from PIL import Image
    dst_dir.mkdir(parents=True, exist_ok=True)
    total = 0
    n = 0
    for src in sorted(src_dir.iterdir()):
        if src.suffix.lower() not in ('.png', '.jpg', '.jpeg'):
            continue
        im = Image.open(src)
        if im.mode != 'RGB':
            im = im.convert('RGB')
        w, h = im.size
        scale = min(1.0, target / max(w, h))
        if scale < 1.0:
            im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
        out = dst_dir / (src.stem + '.webp')
        qual = q
        im.save(out, 'WEBP', quality=qual, method=6)
        size = out.stat().st_size
        while size > max_bytes and qual > 30:
            qual -= 10
            im.save(out, 'WEBP', quality=qual, method=6)
            size = out.stat().st_size
        total += size
        n += 1
    return n, total


# ---------------------------------------------------------------- 步骤
def prepare_audio(unit_dir: Path, pub_audio: Path):
    """复制单元音频到 WebH5 public；处理 .mp3.mp3 双后缀 → 单后缀别名"""
    src = unit_dir / 'assets' / 'audio'
    if not src.is_dir():
        log(f'  ⚠️ 无音频源: {src}')
        return
    pub_audio.mkdir(parents=True, exist_ok=True)
    copied = aliased = 0
    for f in src.glob('*'):
        if f.is_file():
            dst = pub_audio / f.name
            shutil.copy2(f, dst)
            copied += 1
            if f.name.endswith('.mp3.mp3'):
                alias = pub_audio / f.name[:-len('.mp3')]
                if not alias.exists():
                    shutil.copy2(f, alias)
                    aliased += 1
    log(f'  ✅ 音频 {copied} 复制 + {aliased} 别名 -> {pub_audio.parent}')


def prepare_images(unit_dir: Path, webh5: Path, unit_id: str):
    """压缩配图并复制到 public/units/uXX/images"""
    src = unit_dir / 'assets' / 'images'
    dst = webh5 / 'public' / 'units' / unit_id / 'images'
    if not src.is_dir():
        log(f'  ⚠️ 无配图源: {src}')
        return
    n, total = compress_images(src, dst)
    log(f'  ✅ 配图 {n} 张压缩 {total // 1024}KB -> {dst.parent}')


def compress_ip(webh5: Path):
    """IP 头像 PNG → public/ip/webp/（512px）"""
    from PIL import Image
    src = webh5 / 'public' / 'ip'
    dst = src / 'webp'
    dst.mkdir(parents=True, exist_ok=True)
    n, total = 0, 0
    for png in sorted(src.glob('ip-*.png')):
        im = Image.open(png).convert('RGB')
        w, h = im.size
        scale = min(1.0, 512 / max(w, h))
        if scale < 1.0:
            im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
        out = dst / (png.stem + '.webp')
        im.save(out, 'WEBP', quality=78, method=6)
        total += out.stat().st_size
        n += 1
    log(f'  ✅ IP 头像 {n} 张 {total // 1024}KB -> {dst}')


def webh5_build(webh5: Path):
    """pnpm build；失败抛异常"""
    log('  ⏳ pnpm build ...')
    r = subprocess.run(['pnpm', 'build'], cwd=webh5, capture_output=True, text=True, encoding='utf-8')
    if r.returncode != 0:
        raise RuntimeError(f'pnpm build 失败: {r.stderr[-800:]}')
    # 打印构建产物统计
    dist = webh5 / 'dist'
    js = sum(p.stat().st_size for p in dist.joinpath('assets').glob('*.js'))
    css = sum(p.stat().st_size for p in dist.joinpath('assets').glob('*.css'))
    log(f'  ✅ build 完成: JS {js // 1024}KB / CSS {css // 1024}KB')


def split_offline(webh5: Path, out_root: Path, unit_id: str):
    """从 dist 拆离线包（壳 + ip/webp + units/uXX）"""
    dist = webh5 / 'dist'
    if not (dist / 'index.html').exists():
        raise RuntimeError('dist/ 缺 index.html，build 未完成')
    if out_root.exists():
        shutil.rmtree(out_root)
    out_root.mkdir(parents=True)
    shutil.copy2(dist / 'index.html', out_root / 'index.html')
    shutil.copytree(dist / 'assets', out_root / 'assets')
    ip_webp = dist / 'ip' / 'webp'
    if ip_webp.is_dir():
        shutil.copytree(ip_webp, out_root / 'ip' / 'webp')
    ud = dist / 'units' / unit_id
    if ud.is_dir():
        dst = out_root / 'units' / unit_id
        for sub in ('audio', 'images'):
            s = ud / sub
            if s.is_dir():
                shutil.copytree(s, dst / sub)
    log(f'  ✅ 离线拆分 -> {out_root}')


def check_compliance(root: Path) -> list[str]:
    """返回超限文件清单（空 = 通过）"""
    return [str(p.relative_to(root)) for p in root.rglob('*')
            if p.is_file() and p.stat().st_size > MAX_FILE]


def zip_package(out_root: Path, publish_dir: Path, label: str):
    zip_path = publish_dir / f'点读陪练_{label}_离线版.zip'
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for p in sorted(out_root.rglob('*')):
            if p.is_file():
                z.write(p, p.relative_to(out_root))
    return zip_path


# ---------------------------------------------------------------- 主入口
def main():
    ap = argparse.ArgumentParser(description='点读陪练离线版一键发布')
    ap.add_argument('-u', '--unit', default='u01', help='单元目录名（默认 u01）')
    ap.add_argument('-b', '--build', default=None, help='单元构建目录（默认 build/<unit>）')
    ap.add_argument('-w', '--webh5', default=None, help='WebH5 目录（默认 点读陪练/WebH5）')
    ap.add_argument('-p', '--publish', default=None, help='发布目录（默认 RedTools/publish/学科）')
    ap.add_argument('--zip-name', default=None,
                    help='zip 名自定义（如 "四年级上Unit01-02"）；默认按单元名生成')
    args = ap.parse_args()

    unit_id = args.unit
    unit_dir = Path(args.build) if args.build else ROOT / 'build' / unit_id
    webh5 = Path(args.webh5) if args.webh5 else ROOT / 'WebH5'
    publish_dir = Path(args.publish) if args.publish else ROOT.parent / 'RedTools' / 'publish' / '学科'

    if not (unit_dir / 'assets').is_dir():
        log(f'❌ 单元目录不存在: {unit_dir}')
        sys.exit(1)
    pkg = unit_dir / f'{unit_id}_content_package.json'
    if not pkg.exists():
        pkg = unit_dir / '04_content_package.json'
    label = release_name(pkg) if pkg.exists() else f'Unit{unit_id[1:].zfill(2)}'
    zip_label = args.zip_name or label

    log(f'=== 发布 {label}（{unit_id}）===')

    log('[1/7] 音频准备')
    prepare_audio(unit_dir, webh5 / 'public' / 'units' / unit_id / 'audio')

    log('[2/7] 配图压缩→public')
    prepare_images(unit_dir, webh5, unit_id)

    log('[3/7] IP 头像压缩')
    compress_ip(webh5)

    log('[4/7] WebH5 构建')
    webh5_build(webh5)

    log('[5/7] 离线拆分')
    out_root = ROOT / 'build' / 'offline'
    split_offline(webh5, out_root, unit_id)

    log('[6/7] 合规校验')
    over = check_compliance(out_root)
    if over:
        log(f'❌ 超限文件: {over[:5]}')
        sys.exit(2)
    log('  ✅ 全部单文件 ≤ 10MB')

    log('[7/7] zip 打包发布')
    zip_path = zip_package(out_root, publish_dir, zip_label)
    with zipfile.ZipFile(zip_path) as z:
        worst = max(z.infolist(), key=lambda i: i.file_size)
    n_units = len([d for d in (out_root / 'units').iterdir() if d.is_dir()]) if (out_root / 'units').is_dir() else 0
    log(f'  ✅ {zip_path.name}  {zip_path.stat().st_size//1024//1024}MB'
        f'  （{len(z.infolist())} 项，{n_units} 个单元，最大 {worst.file_size//1024}KB）')
    log('=== 发布完成 ===')


if __name__ == '__main__':
    args = sys.argv[1:]
    # 支持直接 python publish_offline.py u01
    if args and not args[0].startswith('-'):
        args = ['-u', args[0]] + args[1:]
    sys.argv = [sys.argv[0]] + args
    main()