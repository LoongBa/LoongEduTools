# -*- coding: utf-8 -*-
"""
数学巧算 · 离线版一键发布（V0.3 minitool 合规，对齐点读陪练 publish_offline.py 精简 6 步）

数学巧算无音频 / 无单元拆分 / 无 IP 头像 → 精简管线：
  1. pnpm build（离线：经典脚本 + Chrome 61 CSS 降级，vite.config 内置）
  2. 包体门禁 check_package()（index.html / theme-boot.js / ≤10MB / 相对路径
     / 无 type=module / 无 crossorigin / 无 a[download] / assets JS 无 download 动态设置）
  3. run_audit()：minitool audit_artifact.py 审 dist 目录（路径探测：解压目录 → .skill zip 解包）
  4. zip 打包 → RedTools/publish/学科/数学巧算_<版本>_离线版.zip（index.html 在根）
  5. 自动解压一份（zip 旁同名目录）→ 供 file:// 直接打开 index.html 测试
  6. 二次 audit zip

用法：python publish_offline.py [-v 0.3.0] [-s src_dir] [-p publish_dir]
  -v, --version    版本号（默认读 src/package.json version）
  -s, --src        React 工程目录（默认 数学巧算/src）
  -p, --publish    发布目录（默认 RedTools/publish/学科）
"""
import argparse, json, os, re, shutil, subprocess, sys, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # 数学巧算/
SRC = ROOT / 'src'
MAX_FILE = 10 * 1024 * 1024                             # 小红书单文件上限
SKILL_DIR = ROOT.parent / 'RedTools' / '.skill' / 'minitool-zip-builder'
SKILL_ZIP = ROOT.parent / 'RedTools' / 'minitool-zip-builder-1.6.0.skill'
AUDIT_SCRIPT = SRC / 'build' / '_audit' / 'audit_artifact.py'


# ---------------------------------------------------------------- 工具
def log(msg: str):
    print(msg, flush=True)


def ensure_audit_script() -> Path:
    """audit_artifact.py 路径探测：优先 .skill 解压目录，fallback 从 .skill zip 解包。"""
    candidates = [
        SKILL_DIR / 'scripts' / 'audit_artifact.py',
        SKILL_ZIP,
    ]
    for c in candidates:
        if c.exists() and c.is_file() and c.suffix == '.py':
            return c
    # fallback：解包 .skill zip
    if SKILL_ZIP.exists():
        AUDIT_SCRIPT.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(SKILL_ZIP) as z:
            target = 'minitool-zip-builder/scripts/audit_artifact.py'
            if target in z.namelist():
                with z.open(target) as f, open(AUDIT_SCRIPT, 'wb') as out:
                    out.write(f.read())
                return AUDIT_SCRIPT
    raise FileNotFoundError('未找到 audit_artifact.py（.skill 目录 / .skill zip 均缺失）')


def run_audit(path: Path, label: str) -> bool:
    """调 audit_artifact.py 审目录或 zip。"""
    try:
        script = ensure_audit_script()
    except FileNotFoundError as e:
        log(f'❌ {e}')
        return False
    r = subprocess.run([sys.executable, str(script), str(path)],
                       capture_output=True, text=True, encoding='utf-8')
    for line in (r.stdout or '').splitlines():
        log(f'    {line}')
    if r.returncode != 0:
        log(f'❌ audit({label}) 失败: {(r.stderr or "")[-300:]}')
        return False
    return True


# ---------------------------------------------------------------- 门禁
def check_package(out_root: Path) -> list:
    """包体门禁：对齐点读陪练 check_package（去音频检查，数学巧算无音频）。"""
    problems = []
    # 1. index.html 在根
    if not (out_root / 'index.html').exists():
        problems.append('缺 index.html（必须在根）')
    # 2. theme-boot.js 存在（离线主题预置 + Chrome 61 兜底）
    if not (out_root / 'theme-boot.js').exists():
        problems.append('缺 theme-boot.js')
    # 3. 单文件 ≤10MB
    for p in out_root.rglob('*'):
        if p.is_file() and p.stat().st_size > MAX_FILE:
            problems.append(f'单文件超限: {p.relative_to(out_root)} ({p.stat().st_size // (1024*1024)}MB)')
    # 4. 相对路径 / 无 type=module / 无 crossorigin（绝对路径 = 开头 / 或 http(s)://）
    html = (out_root / 'index.html').read_text(encoding='utf-8', errors='ignore')
    if re.search(r'\b(?:src|href)="/', html) or re.search(r'https?://', html):
        problems.append('index.html 含绝对路径/外链引用')
    if 'type="module"' in html or "type='module'" in html:
        problems.append('index.html 含 type="module"（须为经典脚本）')
    if 'crossorigin' in html:
        problems.append('index.html 含 crossorigin')
    if 'download' in html.lower():
        problems.append('index.html 含 a[download]')
    # 5. assets/*.js 无动态 download 设置
    for p in (out_root / 'assets').glob('*.js') if (out_root / 'assets').is_dir() else []:
        js = p.read_text(encoding='utf-8', errors='ignore')
        if re.search(r"setAttribute\(['\"]download|\.download\s*=", js):
            problems.append(f'assets JS 含动态 download: {p.name}')
    return problems


# ---------------------------------------------------------------- 构建 / zip
def build_offline(src: Path):
    """pnpm build（离线形态）。"""
    log('  [1/6] pnpm build（离线）')
    r = subprocess.run(['pnpm', 'build'], cwd=str(src), capture_output=True, text=True, encoding='utf-8')
    for line in (r.stdout or '').splitlines():
        log(f'    {line}')
    if r.returncode != 0:
        raise RuntimeError(f'pnpm build 失败: {(r.stderr or "")[-300:]}')


def zip_package(out_root: Path, publish_dir: Path, label: str) -> Path:
    """zip 打包：index.html 在根（压缩目录内容而非目录本身）。"""
    publish_dir.mkdir(parents=True, exist_ok=True)
    zip_path = publish_dir / f'数学巧算_{label}_离线版.zip'
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for p in sorted(out_root.rglob('*')):
            if p.is_file():
                z.write(p, p.relative_to(out_root))
    return zip_path


# ---------------------------------------------------------------- 主流程
def main():
    ap = argparse.ArgumentParser(description='数学巧算离线发布')
    ap.add_argument('-v', '--version', default=None, help='版本号（默认读 package.json）')
    ap.add_argument('-s', '--src', default=str(SRC), help='React 工程目录')
    ap.add_argument('-p', '--publish', default=str(ROOT.parent / 'RedTools' / 'publish' / '学科'), help='发布目录')
    args = ap.parse_args()

    src = Path(args.src)
    publish_dir = Path(args.publish)
    if not (src / 'package.json').exists():
        log(f'❌ 缺 package.json: {src}')
        sys.exit(1)

    version = args.version or json.loads((src / 'package.json').read_text(encoding='utf-8'))['version']
    dist = src / 'dist'
    if not dist.exists():
        log(f'❌ 缺 dist/: {dist}（先 pnpm build）')
        sys.exit(1)

    # [1/6] 构建（默认 dist 已有则跳过？不——每次强制重构建保证产物最新）
    build_offline(src)

    # [2/6] 包体门禁
    log('  [2/6] 包体门禁 check_package()')
    problems = check_package(dist)
    if problems:
        log('❌ 包体门禁未通过：')
        for p in problems:
            log(f'   - {p}')
        sys.exit(2)
    log('  ✅ 门禁通过（≤10MB / 相对路径 / 经典脚本 / 无 download）')

    # [3/6] audit(目录)
    log('  [3/6] minitool audit(dist)')
    if not run_audit(dist, 'offline目录'):
        sys.exit(4)

    # [4/6] zip
    log('  [4/6] zip 打包发布')
    label = f'v{version}'
    zip_path = zip_package(dist, publish_dir, label)
    mb = zip_path.stat().st_size / (1024 * 1024)
    n_entries = len(zipfile.ZipFile(zip_path).infolist())
    worst = max(zipfile.ZipFile(zip_path).infolist(), key=lambda i: i.file_size)
    log(f'  ✅ {zip_path}  {mb:.2f}MB（{n_entries} 项，最大 {worst.file_size // 1024}KB）')

    # [5/6] 自动解压一份
    log('  [5/6] 自动解压一份供测试')
    extract_dir = publish_dir / f'数学巧算_{label}_离线版'
    if extract_dir.exists():
        shutil.rmtree(extract_dir)
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(extract_dir)
    log(f'  ✅ 解压完成 -> {extract_dir}（打开其中 index.html 即可测试）')

    # [6/6] audit(zip)
    log('  [6/6] minitool audit(zip)')
    if not run_audit(zip_path, 'zip'):
        sys.exit(4)

    log('=== 发布完成 ===')
    log(f'zip 包:   {zip_path}')
    log(f'解压目录: {extract_dir}')
    log(f'版本:     数学巧算_{label}')


if __name__ == '__main__':
    main()
