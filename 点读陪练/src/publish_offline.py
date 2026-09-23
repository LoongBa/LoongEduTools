# -*- coding: utf-8 -*-
"""
点读陪练 · 离线版一键发布（V0.3 minitool 合规）

串联发布全流程（自身同步执行，调用方请后台拉起 / 非阻塞等待）：
  1. 就绪校验：内容包 + audio/image 素材与引用一一对应（每单元）
  2. 素材入 public（build 前）：
     - audio：归一 .mp3.mp3 双后缀 → 仅单后缀写入 public
     - images：PNG → WebP 压缩入 public
     - content.json：内容包拷入 public/units/uXX/
     - song：wav→mp3 + song.json（.wav→.mp3）+ textbook 跟读 入 public
  3. manifest → public（扫描 public/units/*/content.json；供 gen_catalog 内联）
  4. IP 头像 PNG → public/ip/webp/
  5. pnpm build（CATALOG_UNITS=uXX,... 按发布单元过滤内联 catalog）
  6. 离线拆分：dist/ → build/offline/（壳 index/assets/theme-boot/logo/ip/webp + 选中单元）
  7. 包体门禁（≤10MB / 无双后缀 / 相对路径 / 无 type=module / 无 a[download]）
     + minitool audit_artifact.py 审目录
  8. zip 打包 → RedTools/publish/学科/点读陪练_<标签>_离线版.zip
  9. minitool audit_artifact.py 审 zip

后台调用示例（不阻塞当前会话）：
  PowerShell:  Start-Process python -ArgumentList 'publish_offline.py','-u','u01,u02' -RedirectStandardOutput publish.log ...
  CMD:         start /b python publish_offline.py -u u01 > publish.log 2>&1

用法：python publish_offline.py [-u u01,u02] [-b build_dir] [-w webh5_dir] [-p publish_dir]
  -u, --unit      单元目录名，逗号分隔多单元（默认 u01；-b 仅单单元可用）
  -b, --build     单元构建目录（默认 点读陪练/build/<unit>，仅单单元）
  -w, --webh5     WebH5 项目目录（默认 点读陪练/WebH5）
  -p, --publish   发布目录（默认 RedTools/publish/学科）
  --zip-name      zip 名自定义（覆盖自动标签）
"""
import argparse, json, os, re, shutil, subprocess, sys, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # 点读陪练/
MAX_FILE = 10 * 1024 * 1024                             # 小红书单文件上限
WEBP_Q = 75
WEBP_TARGET = 1024
SKILL_ZIP = ROOT.parent / 'RedTools' / 'minitool-zip-builder-1.6.0.skill'
AUDIT_SCRIPT = ROOT / 'build' / '_audit' / 'audit_artifact.py'


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


def find_content_pkg(unit_dir: Path, unit_id: str) -> Path | None:
    for name in (f'{unit_id}_content_package.json', '04_content_package.json'):
        cand = unit_dir / name
        if cand.exists():
            return cand
    return None


def combined_label(unit_ids: list[str]) -> str:
    """单单元→四年级上Unit01；多单元同册→四年级上Unit01-02；跨册→拼接。"""
    labels, grade_keys, nums = [], set(), []
    for uid in unit_ids:
        pkg = find_content_pkg(ROOT / 'build' / uid, uid)
        if not pkg:
            continue
        lb = release_name(pkg)
        labels.append(lb)
        m = re.search(r'Unit(\d+)', lb)
        if m:
            nums.append(int(m.group(1)))
        grade_keys.add(re.sub(r'Unit\d+', '', lb))
    if len(unit_ids) == 1:
        return labels[0] if labels else unit_ids[0]
    if len(grade_keys) == 1 and nums:
        g = grade_keys.pop()
        return f'{g}Unit{min(nums):02d}-{max(nums):02d}'
    return '+'.join(labels) if labels else '+'.join(unit_ids)


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


# ---------------------------------------------------------------- 素材准备（build 前 → public）
def prepare_audio(unit_dir: Path, pub_audio: Path):
    """复制单元音频到 public；.mp3.mp3 双后缀归一为单后缀（不落双后缀文件）。"""
    src = unit_dir / 'assets' / 'audio'
    if not src.is_dir():
        log(f'  ⚠️ 无音频源: {src}')
        return
    pub_audio.mkdir(parents=True, exist_ok=True)
    # 清理历史双后缀残留
    removed = 0
    for stale in pub_audio.glob('*.mp3.mp3'):
        stale.unlink()
        removed += 1
    copied = normalized = 0
    for f in sorted(src.glob('*')):
        if not f.is_file():
            continue
        name = f.name
        if name.endswith('.mp3.mp3'):
            name = name[:-4]  # 去掉一层 .mp3
            normalized += 1
        shutil.copy2(f, pub_audio / name)
        copied += 1
    log(f'  ✅ 音频 {copied} 入 public（双后缀归一 {normalized}，清理残留 {removed}）-> {pub_audio.parent.name}/audio')


def prepare_images(unit_dir: Path, webh5: Path, unit_id: str):
    """压缩配图并复制到 public/units/uXX/images"""
    src = unit_dir / 'assets' / 'images'
    dst = webh5 / 'public' / 'units' / unit_id / 'images'
    if not src.is_dir():
        log(f'  ⚠️ 无配图源: {src}')
        return
    n, total = compress_images(src, dst)
    log(f'  ✅ 配图 {n} 张压缩 {total // 1024}KB -> {unit_id}/images')


def prepare_content(unit_id: str, unit_dir: Path, webh5: Path) -> Path:
    """内容包 → public/units/uXX/content.json（gen_catalog 构建期读取）。"""
    pkg = find_content_pkg(unit_dir, unit_id)
    if not pkg:
        raise RuntimeError(f'缺内容包: {unit_dir}')
    dst = webh5 / 'public' / 'units' / unit_id / 'content.json'
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(pkg, dst)
    log(f'  ✅ content.json -> {unit_id}/content.json ({dst.stat().st_size} B)')
    return pkg


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
    log(f'  ✅ IP 头像 {n} 张 {total // 1024}KB -> ip/webp')


def compress_song(src_dir: Path, dst_dir: Path) -> dict | None:
    """点唱台整曲素材：wav → mp3（ffmpeg 128kbps），song.json 复制并把 audio/instrumental 指向 mp3。

    输出 mp3 已存在且不旧于源 wav 时跳过转码。返回处理后的 song.json 内容，无素材时返回 None。
    """
    if not src_dir.is_dir():
        return None
    wavs = {p.name: p for p in src_dir.iterdir() if p.suffix.lower() in ('.wav', '.mp3')}
    sj = src_dir / 'song.json'
    if not sj.exists() or not wavs:
        return None
    dst_dir.mkdir(parents=True, exist_ok=True)
    for name, src in wavs.items():
        stem = src.stem
        out = dst_dir / f'{stem}.mp3'
        if out.exists() and out.stat().st_mtime >= src.stat().st_mtime:
            continue  # 已是新鲜 mp3，跳过转码
        r = subprocess.run(
            ['ffmpeg', '-y', '-i', str(src), '-codec:a', 'libmp3lame', '-b:a', '128k', str(out)],
            capture_output=True, text=True,
        )
        if r.returncode != 0:
            log(f'  ⚠️  {name} 压缩失败: {r.stderr[-200:]}')
            shutil.copy2(src, dst_dir / f'{stem}{src.suffix}')  # 兜底：原样复制
    with open(sj, encoding='utf-8') as f:
        data = json.load(f)
    # audio / instrumental 字段残余 .wav → 指向 mp3
    for key in ('audio', 'instrumental'):
        v = str(data.get(key, '') or '')
        if v.lower().endswith('.wav'):
            data[key] = v[:-4] + '.mp3'
    return data


def sync_unit_song(unit_id: str, webh5: Path):
    """build/<unit>/assets/song → public/units/<id>/song（build 前；vite 会拷入 dist）。

    内容：
      - song.json + song_vocal/instrumental.mp3（原创儿歌整曲，wav→mp3 压缩）
      - textbook_lyrics.json + textbook/*.mp3（教材歌词跟读，逐句 TTS 原样复制）
    """
    src = ROOT / 'build' / unit_id / 'assets' / 'song'
    if not src.is_dir():
        log(f'  ⚠️ 无点唱台素材: {src}')
        return None
    root = webh5 / 'public' / 'units' / unit_id
    root.mkdir(parents=True, exist_ok=True)
    song_dst = root / 'song'
    data = compress_song(src, song_dst)
    if data:
        with open(song_dst / 'song.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    tb_src = src / 'textbook'
    if tb_src.is_dir():
        shutil.copytree(tb_src, song_dst / 'textbook', dirs_exist_ok=True)
    tb_json = src / 'textbook_lyrics.json'
    if tb_json.exists():
        shutil.copy2(tb_json, song_dst / 'textbook_lyrics.json')
    log(f'  ✅ 点唱台 -> {unit_id}/song（wav→mp3 + song.json + textbook 跟读）')
    return True


def check_ready(unit_dir: Path) -> tuple[bool, list[str]]:
    """发布前就绪校验：内容包存在 + audio/image 素材与内容包引用一一对应。

    返回 (是否就绪, 问题清单)。不齐打回，防止缺素材发布。
    """
    issues = []
    pkg_path = find_content_pkg(unit_dir, unit_dir.name)
    if not pkg_path:
        return False, [f'缺内容包: {unit_dir.name}_content_package.json（先完成步骤 2）']
    with open(pkg_path, encoding='utf-8') as f:
        pkg_data = json.load(f)

    auds, imgs = set(), set()

    def walk(n):
        if isinstance(n, dict):
            if n.get('audio'):
                auds.add(n['audio'])
            if n.get('image'):
                imgs.add(n['image'])
            for v in n.values():
                walk(v)
        elif isinstance(n, list):
            for i in n:
                walk(i)

    walk(pkg_data)

    def audio_ok(ref: str) -> bool:
        # 路径引用（song/song_vocal.wav 等）相对 assets/
        if '/' in ref:
            return (unit_dir / 'assets' / ref).exists()
        audio_dir = unit_dir / 'assets' / 'audio'
        return (audio_dir / ref).exists() or (audio_dir / (ref + '.mp3')).exists() \
            or (audio_dir / ref.replace('.mp3', '')).exists()

    audio_dir = unit_dir / 'assets' / 'audio'
    img_dir = unit_dir / 'assets' / 'images'
    miss_aud = [a for a in sorted(auds) if not audio_ok(a)]
    miss_img = [i for i in sorted(imgs) if not (img_dir / i).exists()]
    if miss_aud:
        issues.append(f'缺音频 {len(miss_aud)} 个: {miss_aud[:5]}')
    if miss_img:
        issues.append(f'缺图片 {len(miss_img)} 个: {miss_img[:5]}')

    empty_aud = []
    for a in auds:
        if '/' in a:
            p = unit_dir / 'assets' / a
            if p.exists() and p.stat().st_size == 0:
                empty_aud.append(a)
            continue
        for cand in (audio_dir / a, audio_dir / (a + '.mp3'), audio_dir / a.replace('.mp3', '')):
            if cand.exists():
                if cand.stat().st_size == 0:
                    empty_aud.append(a)
                break
    if empty_aud:
        issues.append(f'空音频 {len(empty_aud)} 个: {empty_aud[:5]}')

    return not issues, issues


def find_ready_units_from_schedule() -> list[str]:
    """从 日常工作对齐表.md 读取「交付」列已标 ✅ 的四上单元目录名。

    四上单元行格式: | U<N> <.> | ... | ✅ ...|（交付列=最后一列 ✅）
    返回如 ['u01','u02']。对齐表不可达时不阻塞（静默返回 []）。
    """
    candidates = []
    table = ROOT / 'docs' / '日常工作对齐表.md'
    if not table.exists():
        return candidates
    try:
        for line in table.read_text(encoding='utf-8').splitlines():
            m = re.match(r'\|\s*U(\d+)\b.*\|.*\|\s*✅', line)
            if m and line.strip().startswith('| U'):
                candidates.append(f'u{int(m.group(1)):02d}')
    except Exception:
        pass
    return candidates


def webh5_build(webh5: Path, unit_ids: list[str]):
    """pnpm build；CATALOG_UNITS 指定本次嵌入单元。失败抛异常。"""
    env = os.environ.copy()
    env['CATALOG_UNITS'] = ','.join(unit_ids)
    log(f'  ⏳ pnpm build（CATALOG_UNITS={env["CATALOG_UNITS"]}）...')
    r = subprocess.run(['pnpm', 'build'], cwd=webh5, capture_output=True, text=True,
                       encoding='utf-8', env=env)
    if r.returncode != 0:
        raise RuntimeError(f'pnpm build 失败: {r.stderr[-800:] or r.stdout[-800:]}')
    dist = webh5 / 'dist'
    js = sum(p.stat().st_size for p in dist.joinpath('assets').glob('*.js'))
    css = sum(p.stat().st_size for p in dist.joinpath('assets').glob('*.css'))
    log(f'  ✅ build 完成: JS {js // 1024}KB / CSS {css // 1024}KB')


# ---------------------------------------------------------------- manifest / 拆分 / 打包
def write_manifest(units_root: Path) -> dict:
    """扫描 units_root/*/content.json，聚合生成 units_root/manifest.json。

    manifest 结构：
      { "schema": "manifest@1", "grades": [{ "grade_code", "grade_label",
          "units": [{ "id", "no", "title", "cn" }] }] }
    public 侧在 build 前调用（供 gen_catalog）；offline 侧在拆分后调用（供 zip）。
    """
    manifest = {"schema": "manifest@1", "grades": []}
    by_grade: dict[str, dict] = {}
    if units_root.is_dir():
        for ud in sorted(units_root.iterdir()):
            if not ud.is_dir():
                continue
            cj = ud / 'content.json'
            if not cj.exists():
                continue
            try:
                with open(cj, encoding='utf-8') as f:
                    pkg = json.load(f)
            except Exception:
                continue
            unit = str(pkg.get('unit', ud.name))
            um = re.match(r'[Uu]?(\d+)', unit)
            no = int(um.group(1)) if um else 0
            grade_raw = str(pkg.get('grade', ''))
            gm = re.match(r'(\d)([AB]?)', grade_raw)
            year_map = {'1': '一', '2': '二', '3': '三', '4': '四', '5': '五', '6': '六'}
            term_map = {'A': '上', 'B': '下'}
            grade_label = f"{year_map.get(gm.group(1), gm.group(1))}年级{term_map.get(gm.group(2), '')}" if gm else grade_raw
            g = by_grade.setdefault(grade_label, {"grade_code": grade_raw, "grade_label": grade_label, "units": []})
            g["units"].append({
                "id": ud.name,
                "no": no,
                "title": str(pkg.get('title', '')),
                "cn": str(pkg.get('topic', '')) or str(pkg.get('title', '')),
            })
    manifest["grades"] = [by_grade[k] for k in sorted(by_grade)]
    units_root.mkdir(parents=True, exist_ok=True)
    with open(units_root / 'manifest.json', 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    n_units = sum(len(g["units"]) for g in manifest["grades"])
    log(f'  ✅ manifest: {len(manifest["grades"])} 册 / {n_units} 单元 -> {units_root}')
    return manifest


def split_offline(webh5: Path, out_root: Path, unit_ids: list[str]):
    """dist → build/offline/ 全量重建（本次发布的精确单元集合）。

    壳：index.html + assets/ + theme-boot.js + logo/ + ip/webp/
    单元：只拷选中 unit_ids（dist/units 可能含 public 里其它单元，不带入本包）。
    """
    dist = webh5 / 'dist'
    if not (dist / 'index.html').exists():
        raise RuntimeError('dist/ 缺 index.html，build 未完成')
    if out_root.exists():
        shutil.rmtree(out_root)
    out_root.mkdir(parents=True)

    shutil.copy2(dist / 'index.html', out_root / 'index.html')
    shutil.copytree(dist / 'assets', out_root / 'assets')
    if (dist / 'theme-boot.js').exists():
        shutil.copy2(dist / 'theme-boot.js', out_root / 'theme-boot.js')
    else:
        raise RuntimeError('dist/ 缺 theme-boot.js（public/theme-boot.js 未拷入？）')
    if (dist / 'logo').is_dir():
        shutil.copytree(dist / 'logo', out_root / 'logo')
    else:
        raise RuntimeError('dist/ 缺 logo/（public/logo 未拷入？）')
    ip_webp = dist / 'ip' / 'webp'
    if ip_webp.is_dir():
        shutil.copytree(ip_webp, out_root / 'ip' / 'webp')

    for unit_id in unit_ids:
        ud = dist / 'units' / unit_id
        if not ud.is_dir():
            raise RuntimeError(f'dist/units/{unit_id} 不存在（public 未就绪？）')
        shutil.copytree(ud, out_root / 'units' / unit_id)

    log(f'  ✅ 离线拆分 [{", ".join(unit_ids)}] -> {out_root}')


# ---------------------------------------------------------------- 合规门禁 + minitool audit
def ensure_audit_script() -> Path | None:
    """从 minitool skill zip 解包 audit_artifact.py 到 build/_audit/。"""
    if not SKILL_ZIP.exists():
        return None
    try:
        with zipfile.ZipFile(SKILL_ZIP) as z:
            data = z.read('minitool-zip-builder/scripts/audit_artifact.py')
        AUDIT_SCRIPT.parent.mkdir(parents=True, exist_ok=True)
        if not AUDIT_SCRIPT.exists() or AUDIT_SCRIPT.read_bytes() != data:
            AUDIT_SCRIPT.write_bytes(data)
        return AUDIT_SCRIPT
    except (KeyError, OSError, zipfile.BadZipFile) as e:
        log(f'  ⚠️ 解包 audit_artifact.py 失败: {e}')
        return None


def run_audit(path: Path, label: str) -> bool:
    """调用 skill 的 audit_artifact.py 审目录或 zip。返回是否 PASS。"""
    script = ensure_audit_script()
    if script is None:
        log(f'  ❌ {label} audit: 无法获取 audit_artifact.py（skill 缺失: {SKILL_ZIP}）')
        return False
    r = subprocess.run([sys.executable, str(script), str(path)],
                       capture_output=True, text=True, encoding='utf-8')
    out = ((r.stdout or '') + (r.stderr or '')).strip()
    for line in out.splitlines():
        log(f'    {line}')
    if r.returncode != 0:
        log(f'  ❌ minitool audit FAIL: {label}')
        return False
    log(f'  ✅ minitool audit PASS: {label}')
    return True


def check_package(root: Path) -> list[str]:
    """包体门禁：返回问题清单（空 = 通过）。"""
    issues: list[str] = []
    if not (root / 'index.html').exists():
        issues.append('缺 index.html')
        return issues
    if not (root / 'theme-boot.js').exists():
        issues.append('缺 theme-boot.js')
    if not (root / 'logo').is_dir():
        issues.append('缺 logo/')

    for p in root.rglob('*'):
        if not p.is_file():
            continue
        if p.stat().st_size > MAX_FILE:
            issues.append(f'超10MB: {p.relative_to(root)}')
        if p.name.endswith('.mp3.mp3'):
            issues.append(f'双后缀: {p.relative_to(root)}')

    html = (root / 'index.html').read_text(encoding='utf-8')
    if re.search(r'(?:src|href)\s*=\s*["\']/', html):
        issues.append('index.html 含绝对路径')
    if re.search(r'type\s*=\s*["\']module', html):
        issues.append('index.html 含 type=module')
    if 'crossorigin' in html:
        issues.append('index.html 含 crossorigin')
    if re.search(r'<a\b[^>]*\sdownload(\s|=|>)', html, re.I):
        issues.append('index.html 含 a[download]')

    assets = root / 'assets'
    if assets.is_dir():
        for js in assets.glob('*.js'):
            t = js.read_text(encoding='utf-8', errors='ignore')
            if re.search(r'setAttribute\(\s*["\']download', t):
                issues.append(f'{js.name}: setAttribute(download)')
            if re.search(r'\.download\s*=\s*["\']', t):
                issues.append(f'{js.name}: .download=')
    return issues


def zip_package(out_root: Path, publish_dir: Path, label: str) -> Path:
    publish_dir.mkdir(parents=True, exist_ok=True)
    zip_path = publish_dir / f'点读陪练_{label}_离线版.zip'
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for p in sorted(out_root.rglob('*')):
            if p.is_file():
                z.write(p, p.relative_to(out_root))
    if zip_path.stat().st_size > MAX_FILE:
        raise RuntimeError(f'zip 超10MB: {zip_path} ({zip_path.stat().st_size} B)')
    return zip_path


# ---------------------------------------------------------------- 主入口
def main():
    ap = argparse.ArgumentParser(description='点读陪练离线版一键发布')
    ap.add_argument('-u', '--unit', default='u01',
                    help='单元目录名，逗号分隔多单元（默认 u01）')
    ap.add_argument('-b', '--build', default=None, help='单元构建目录（仅单单元）')
    ap.add_argument('-w', '--webh5', default=None, help='WebH5 目录（默认 点读陪练/WebH5）')
    ap.add_argument('-p', '--publish', default=None, help='发布目录（默认 RedTools/publish/学科）')
    ap.add_argument('--zip-name', default=None,
                    help='zip 名自定义（如 "四年级上Unit01-02"）；默认按单元生成')
    args = ap.parse_args()

    unit_ids = [u.strip().lower() for u in args.unit.split(',') if u.strip()]
    if not unit_ids:
        log('❌ -u 未指定单元')
        sys.exit(1)
    if args.build and len(unit_ids) != 1:
        log('❌ -b 仅支持单单元发布')
        sys.exit(1)

    webh5 = Path(args.webh5) if args.webh5 else ROOT / 'WebH5'
    publish_dir = Path(args.publish) if args.publish else ROOT.parent / 'RedTools' / 'publish' / '学科'
    out_root = ROOT / 'build' / 'offline'

    unit_dirs = []
    for uid in unit_ids:
        ud = Path(args.build) if args.build else ROOT / 'build' / uid
        if not (ud / 'assets').is_dir():
            log(f'❌ 单元目录不存在: {ud}')
            sys.exit(1)
        unit_dirs.append(ud)

    label = combined_label(unit_ids)
    zip_label = args.zip_name or label
    multi = len(unit_ids) > 1

    log(f'=== 发布 {label}（{", ".join(unit_ids)}）===')

    # [1/9] 就绪校验
    sched_ready = find_ready_units_from_schedule()
    for uid, ud in zip(unit_ids, unit_dirs):
        ready, issues = check_ready(ud)
        if not ready:
            log(f'❌ 发布前就绪校验未通过（{uid}，参考 docs/日常工作对齐表.md 交付列）：')
            for i in issues:
                log(f'   - {i}')
            sys.exit(3)
        if uid in sched_ready:
            log(f'  ✅ {uid} 对齐表「交付」标记确认')
    log(f'  ✅ {len(unit_ids)} 个单元素材与内容包引用一一对应')

    # [2/9] 素材入 public（build 前）
    log('[2/9] 素材入 public（audio / images / content / song）')
    for uid, ud in zip(unit_ids, unit_dirs):
        prepare_audio(ud, webh5 / 'public' / 'units' / uid / 'audio')
        prepare_images(ud, webh5, uid)
        prepare_content(uid, ud, webh5)
        sync_unit_song(uid, webh5)

    # [3/9] manifest → public（gen_catalog 读取）
    log('[3/9] manifest -> public')
    write_manifest(webh5 / 'public' / 'units')

    # [4/9] IP 头像
    log('[4/9] IP 头像压缩')
    compress_ip(webh5)

    # [5/9] 构建（按单元过滤 catalog）
    log('[5/9] WebH5 构建')
    webh5_build(webh5, unit_ids)

    # [6/9] 离线拆分
    log('[6/9] 离线拆分')
    split_offline(webh5, out_root, unit_ids)
    write_manifest(out_root / 'units')

    # [7/9] 包体门禁 + audit(目录)
    log('[7/9] 包体门禁 + minitool audit(目录)')
    problems = check_package(out_root)
    if problems:
        log('❌ 包体门禁未通过：')
        for p in problems:
            log(f'   - {p}')
        sys.exit(2)
    log('  ✅ 门禁通过（≤10MB / 无双后缀 / 相对路径 / 经典脚本 / 无 a[download]）')
    if not run_audit(out_root, 'offline目录'):
        sys.exit(4)

    # [8/9] zip
    log('[8/9] zip 打包发布')
    zip_path = zip_package(out_root, publish_dir, zip_label)
    with zipfile.ZipFile(zip_path) as z:
        worst = max(z.infolist(), key=lambda i: i.file_size)
        n_entries = len(z.infolist())
    n_units = len([d for d in (out_root / 'units').iterdir() if d.is_dir()]) \
        if (out_root / 'units').is_dir() else 0
    mb = zip_path.stat().st_size / (1024 * 1024)
    log(f'  ✅ {zip_path}  {mb:.2f}MB'
        f'（{n_entries} 项，{n_units} 个单元，最大 {worst.file_size // 1024}KB）')

    # [9/9] audit(zip)
    log('[9/9] minitool audit(zip)')
    if not run_audit(zip_path, 'zip'):
        sys.exit(4)

    log('=== 发布完成 ===')
    log(str(zip_path))


if __name__ == '__main__':
    args = sys.argv[1:]
    # 支持直接 python publish_offline.py u01 / u01,u02
    if args and not args[0].startswith('-'):
        args = ['-u', args[0]] + args[1:]
    sys.argv = [sys.argv[0]] + args
    main()
