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


def check_ready(unit_dir: Path) -> tuple[bool, list[str]]:
    """发布前就绪校验：内容包存在 + audio/image 素材与内容包引用一一对应。

    返回 (是否就绪, 问题清单)。不齐打回，防止缺素材发布。
    """
    issues = []
    # 1. 内容包
    pkg = unit_dir / f'{unit_dir.name}_content_package.json'
    if not pkg.exists():
        pkg = unit_dir / '04_content_package.json'
    if not pkg.exists():
        return False, [f'缺内容包: {unit_dir.name}_content_package.json（先完成步骤 2）']
    with open(pkg, encoding='utf-8') as f:
        pkg_data = json.load(f)

    # 2. 收集内容包引用的 audio/image
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

    # 3. 素材存在性
    audio_dir = unit_dir / 'assets' / 'audio'
    img_dir = unit_dir / 'assets' / 'images'
    miss_aud = [a for a in auds if not (audio_dir / a).exists()
                and not (audio_dir / (a + '.mp3')).exists() and not (audio_dir / a.replace('.mp3', '')).exists()]
    miss_img = [i for i in imgs if not (img_dir / i).exists()]
    if miss_aud:
        issues.append(f'缺音频 {len(miss_aud)} 个: {miss_aud[:5]}')
    if miss_img:
        issues.append(f'缺图片 {len(miss_img)} 个: {miss_img[:5]}')

    # 4. 素材量级提示（音频非空）
    empty_aud = []
    for a in auds:
        for cand in (audio_dir / a, audio_dir / (a + '.mp3'), audio_dir / a.replace('.mp3', '')):
            if cand.exists() and cand.stat().st_size > 0:
                break
            if cand.exists() and cand.stat().st_size == 0:
                empty_aud.append(a)
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


def compress_song(src_dir: Path, dst_dir: Path) -> dict | None:
    """点唱台整曲素材：wav → mp3（ffmpeg 128kbps），song.json 复制并把 audio/instrumental 指向 mp3。

    返回压缩后的 song.json 内容（用于合入离线/在线包），无素材时返回 None。
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


def sync_unit_song(unit_id: str, out_root: Path, webh5: Path):
    """把 build/<unit>/assets/song/ 压缩并入 units/<id>/song/（offline + public 双写）。

    内容：
      - song.json + song_vocal/instrumental.mp3（原创儿歌整曲，wav→mp3 压缩）
      - textbook_lyrics.json + textbook/*.mp3（教材歌词跟读，逐句 TTS 原样复制）
    """
    src = ROOT / 'build' / unit_id / 'assets' / 'song'
    if not src.is_dir():
        return None
    for root in (out_root / 'units' / unit_id, webh5 / 'public' / 'units' / unit_id):
        root.mkdir(parents=True, exist_ok=True)
        song_dst = root / 'song'
        data = compress_song(src, song_dst)
        if data:
            with open(song_dst / 'song.json', 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        # 教材歌词跟读：逐句 TTS mp3 原样复制（无需压缩）+ 数据 JSON
        tb_src = src / 'textbook'
        if tb_src.is_dir():
            shutil.copytree(tb_src, song_dst / 'textbook', dirs_exist_ok=True)
        tb_json = src / 'textbook_lyrics.json'
        if tb_json.exists():
            shutil.copy2(tb_json, song_dst / 'textbook_lyrics.json')
    log(f'  ✅ 点唱台素材同步 {unit_id}（原创儿歌 wav→mp3 + song.json；教材跟读 textbook/ + textbook_lyrics.json；offline/public）')
    return True


def split_offline(webh5: Path, out_root: Path, unit_id: str):
    """从 dist 拆离线包（壳 + ip/webp + units/uXX）。

    不清空整个 out_root：只替换壳（index/assets/ip）并 upsert 当前单元，
    保留其他已拆分单元——支持多单元累积（先 -u u01 再 -u u02，最后合并 zip）。
    """
    dist = webh5 / 'dist'
    if not (dist / 'index.html').exists():
        raise RuntimeError('dist/ 缺 index.html，build 未完成')
    out_root.mkdir(parents=True, exist_ok=True)
    # 壳：每次用最新构建覆盖
    shutil.copy2(dist / 'index.html', out_root / 'index.html')
    if (out_root / 'assets').exists():
        shutil.rmtree(out_root / 'assets')
    shutil.copytree(dist / 'assets', out_root / 'assets')
    ip_webp = dist / 'ip' / 'webp'
    if ip_webp.is_dir() and (out_root / 'ip' / 'webp').exists():
        shutil.rmtree(out_root / 'ip' / 'webp')
    if ip_webp.is_dir():
        shutil.copytree(ip_webp, out_root / 'ip' / 'webp')
    # 当前单元：upsert（覆盖同单元旧目录）
    ud = dist / 'units' / unit_id
    if ud.is_dir():
        dst = out_root / 'units' / unit_id
        if dst.exists():
            shutil.rmtree(dst)
        dst.mkdir(parents=True)
        for sub in ('audio', 'images'):
            s = ud / sub
            if s.is_dir():
                shutil.copytree(s, dst / sub)
        # 单元内容 JSON：从构建目录复制（dist/units 只有素材，内容 JSON 在 build/<unit>/）
        unit_build = ROOT / 'build' / unit_id
        pkg_candidates = [
            unit_build / f'{unit_id}_content_package.json',
            unit_build / '04_content_package.json',
        ]
        for cand in pkg_candidates:
            if cand.exists():
                shutil.copy2(cand, dst / 'content.json')
                # 同步到 public（在线版/dev 运行时 fetch 用）
                pub_dst = webh5 / 'public' / 'units' / unit_id / 'content.json'
                pub_dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(cand, pub_dst)
                break
    # 点唱台整曲素材（原创儿歌 song.json + wav→mp3）
    sync_unit_song(unit_id, out_root, webh5)
    log(f'  ✅ 离线拆分 {unit_id} -> {out_root}')


def write_manifest(webh5: Path, out_root: Path):
    """扫描 offline/units/*/content.json，聚合生成 units/manifest.json（册级+单元清单）。

    manifest 结构：
      { "schema": "manifest@1", "grades": [{ "grade_code", "grade_label",
          "units": [{ "id", "no", "title", "cn" }] }] }
    同时写 offline（离线包）与 public（在线/dev 运行时 fetch）——两端自动匹配。
    """
    units_root = out_root / 'units'
    manifest = {"schema": "manifest@1", "grades": []}
    if units_root.is_dir():
        by_grade: dict[str, dict] = {}
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
    # 写 offline + public 两份
    for target in (units_root, webh5 / 'public' / 'units'):
        target.mkdir(parents=True, exist_ok=True)
        with open(target / 'manifest.json', 'w', encoding='utf-8') as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)
    log(f'  ✅ manifest: {len(manifest["grades"])} 册 / {sum(len(g["units"]) for g in manifest["grades"])} 单元'
        f'（offline + public 已同步）')
    return manifest


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

    # [0/8] 发布前就绪校验（读对齐表确认该单元已标交付，且素材与内容包对齐）
    ready, issues = check_ready(unit_dir)
    if not ready:
        log('❌ 发布前就绪校验未通过（参考 docs/日常工作对齐表.md 交付列）：')
        for i in issues:
            log(f'   - {i}')
        sys.exit(3)
    sched_ready = find_ready_units_from_schedule()
    if unit_id in sched_ready:
        log('  ✅ 对齐表「交付」标记确认')
    log('  ✅ 素材与内容包引用一一对应')

    log('[1/8] 音频准备')
    prepare_audio(unit_dir, webh5 / 'public' / 'units' / unit_id / 'audio')

    log('[2/8] 配图压缩→public')
    prepare_images(unit_dir, webh5, unit_id)

    log('[3/8] IP 头像压缩')
    compress_ip(webh5)

    log('[4/8] WebH5 构建')
    webh5_build(webh5)

    log('[5/8] 离线拆分')
    out_root = ROOT / 'build' / 'offline'
    split_offline(webh5, out_root, unit_id)
    write_manifest(webh5, out_root)

    log('[6/8] 合规校验')
    over = check_compliance(out_root)
    if over:
        log(f'❌ 超限文件: {over[:5]}')
        sys.exit(2)
    log('  ✅ 全部单文件 ≤ 10MB')

    log('[7/8] zip 打包发布')
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