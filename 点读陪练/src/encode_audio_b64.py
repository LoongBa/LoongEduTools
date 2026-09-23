# -*- coding: utf-8 -*-
"""
点读陪练 · 音频 base64 编码（minitool / 小红书平台白名单适配）

平台对代码包 zip 有两道硬限制：
  1. 文件类型白名单（html/css/js/png/jpg/jpeg/gif/webp/svg/woff/woff2/json）——**不含音频扩展名**，
     zip 内出现 .mp3/.wav/.ogg 会被上传校验直接打回。
  2. **文件数量 ≤200**（含全部文件）——音频不能每文件一个 js，必须聚合。

容器 CSP 又禁音视频 data:/blob: 来源，因此音频不能走 data URI 或 blob: URL 播放。

本脚本把离线包内所有 mp3 编码为 **按单元×类型聚合的 js**（每单元 3 组）：
    audio/u01-audio.js      units/u01/audio/*.mp3
    audio/u01-song.js       units/u01/song/*.mp3（整曲人声/伴奏）
    audio/u01-textbook.js   units/u01/song/textbook/*.mp3（教材跟读）
    （u02 同构，共 6 个 js）
每个 js 内 window.AUDIO_DATA 聚合多个 key：
    window.AUDIO_DATA["u01/audio/u01_s0_h01"] = "<base64 payload>";
前端运行时按 key 推导 group 动态 <script src="./audio/<group>.js"> 注入 →
base64 → decodeAudioData 纯内存播放（Web Audio，不经过 <audio> 元素 / data: / blob:，符合容器 CSP；
参考已验证方案：RedTools/publish/学科/新英语四上点读1单元.zip）。

key 规则（与 WebH5 src/lib/audio.ts normalizeKey 保持一致）：
    相对 units/ 根的路径去扩展名：
      units/u01/audio/u01_s0_h01.mp3      → u01/audio/u01_s0_h01
      units/u01/song/song_vocal.mp3       → u01/song/song_vocal
      units/u01/song/textbook/line_01.mp3 → u01/song/textbook/line_01

编码完成后删除原 mp3（平台白名单要求 zip 内不得出现音频文件）。

用法：
    python encode_audio_b64.py [-b offline_root]
    -b, --build  离线包根目录（默认 点读陪练/build/offline）
"""
import argparse, base64, os, shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # 点读陪练/

JS_HEAD = 'window.AUDIO_DATA = window.AUDIO_DATA || {};\n'
JS_LINE = 'window.AUDIO_DATA["{key}"] = "{b64}";\n'


def collect_mp3(offline: Path) -> list[tuple[Path, str]]:
    """扫描 offline/units/<uid>/ 下全部 mp3 → (源文件, key)。"""
    found: list[tuple[Path, str]] = []
    units = offline / 'units'
    if not units.is_dir():
        return found
    for uid in sorted(u.name for u in units.iterdir() if u.is_dir()):
        base = units / uid
        # <uid>/audio/*.mp3
        ad = base / 'audio'
        if ad.is_dir():
            for f in sorted(ad.glob('*.mp3')):
                found.append((f, f'{uid}/audio/{f.stem}'))
        # <uid>/song/*.mp3（整曲人声/伴奏）与 <uid>/song/textbook/*.mp3（跟读）
        sd = base / 'song'
        if sd.is_dir():
            for f in sorted(sd.glob('*.mp3')):
                found.append((f, f'{uid}/song/{f.stem}'))
            tb = sd / 'textbook'
            if tb.is_dir():
                for f in sorted(tb.glob('*.mp3')):
                    found.append((f, f'{uid}/song/textbook/{f.stem}'))
    return found


def group_of(key: str) -> str:
    """key → 聚合 js 组名（与 WebH5 audio.ts groupOf 一致）：
    u01/audio/xxx → u01-audio；u01/song/xxx → u01-song；u01/song/textbook/xxx → u01-textbook。"""
    parts = key.split('/')
    if len(parts) >= 3 and parts[1] == 'song' and parts[2] == 'textbook':
        return f'{parts[0]}-textbook'
    if len(parts) >= 2 and parts[1] == 'song':
        return f'{parts[0]}-song'
    return f'{parts[0]}-audio'


def encode(offline: Path) -> None:
    items = collect_mp3(offline)
    if not items:
        print('  ⚠️ 未发现 mp3，跳过编码')
        return

    audio_root = offline / 'audio'
    # 重建 audio/（编码产物目录，整体重建保证干净；与 publish 的 offline 全量重建配套）
    if audio_root.exists():
        shutil.rmtree(audio_root)
    audio_root.mkdir(parents=True, exist_ok=True)

    groups: dict[str, list[tuple[Path, str]]] = {}
    for src, key in items:
        groups.setdefault(group_of(key), []).append((src, key))

    raw_bytes = 0
    b64_bytes = 0
    worst = (0, '')
    n = 0
    for g in sorted(groups):
        out = audio_root / f'{g}.js'
        lines = [JS_HEAD]
        g_b64 = 0
        for src, key in sorted(groups[g], key=lambda x: x[1]):
            data = src.read_bytes()
            raw_bytes += len(data)
            b64 = base64.b64encode(data).decode('ascii')
            b64_bytes += len(b64)
            n += 1
            g_b64 += len(b64)
            lines.append(JS_LINE.format(key=key, b64=b64))
            src.unlink()  # 平台白名单：zip 内不得含 mp3
        out.write_text(''.join(lines), encoding='utf-8')
        if g_b64 > worst[0]:
            worst = (g_b64, out.name)
        print(f'  {out.name}: {len(groups[g])} 个音频 / {g_b64 // 1024}KB（base64）')

    mb = lambda v: v / 1024 / 1024
    print(f'  ✅ 音频 {n} 个编码完成（聚合 {len(groups)} 个 js）')
    print(f'     原始 mp3 {mb(raw_bytes):.2f}MB → base64 {mb(b64_bytes):.2f}MB（zip 可再压）')
    print(f'     最大 js: {worst[1]} = {worst[0] // 1024}KB')
    print(f'     原 mp3 已删除 -> {audio_root}')


def main():
    ap = argparse.ArgumentParser(description='点读陪练音频 base64 编码（平台白名单适配）')
    ap.add_argument('-b', '--build', default=None, help='离线包根目录（默认 点读陪练/build/offline）')
    args = ap.parse_args()
    offline = Path(args.build) if args.build else ROOT / 'build' / 'offline'
    if not (offline / 'index.html').exists():
        print(f'❌ 非离线包目录（缺 index.html）: {offline}')
        raise SystemExit(1)
    print(f'=== 音频 base64 编码 -> {offline} ===')
    encode(offline)


if __name__ == '__main__':
    main()
