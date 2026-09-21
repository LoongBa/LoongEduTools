# -*- coding: utf-8 -*-
"""
人教点读教材素材下载工具 (diandu_audio.py)

数据来源：人教点读小程序（微信"人教教材学习"）查看教材时，
book.json 获取见 get_book_json.js（浏览器控制台批量导出，含全部 PEP 教材 book_id）。

功能:
  1. parse     解析 book JSON，输出音频清单预览（mp3 数量、朗读文字样例）
  2. save      把导出的 book JSON 规范化保存到 data/{bookid}_{书名}.json
  3. 下载素材   下载单个 book JSON 的全部素材：音频（单句/页/单元）+ 图片 + 字幕
  4. expand    批量：遍历 data/*.json，逐个下载素材到对应目录（按书名解析学段/科目/版本/年级/册次）
  5. merge     将某目录下所有 mp3 合并为一个文件（ffmpeg concat，对齐老脚本 MergeMp3.py）
  6. tag       为某目录下所有 mp3 写 ID3 标签（album=书名，需 mutagen，可选）

用法:
  python diandu_audio.py parse      <book.json>
  python diandu_audio.py save       <book.json> [--data data]
  python diandu_audio.py 下载素材    <book.json> [--out <目录>] [--audio] [--images] [--delay <秒>] [--force]
  python diandu_audio.py expand     [--data data] [--root <下载根>] [--audio] [--images] [--delay <秒>] [--force]
  python diandu_audio.py merge      <mp3目录> [--name 书名] [--out 上级目录] [--force]
  python diandu_audio.py tag        <mp3目录> [--album 书名]

book JSON 结构:
  { "bookpage": [ { "page_no": 2, "page_url_source": "...png",
                    "track_info": [ { "track_text": "英文朗读", "track_genre": "中文翻译",
                                      "track_url_source": "https://pdpd.mypep.cn/...mp3",
                                      "track_duration": 4.6,
                                      "sentence_evaluating": [ { "audio_start": 0.0, "text": "...", "trans": "..." } ] } ] } ],
    "bookinfo": { "bookname": "英语（PEP） 四年级 上册", "bookid_3rd": "1212001401255" },
    "bookaudio_v3": [ { "title": "Unit 1 ...", ... } ] }
"""
import argparse
import os
import random
import re
import shutil
import sys
import time
import urllib.request
from pathlib import Path

# 公共函数模块（文件名清洗/解析/字幕/合并）
from diandu_common import (
    clean_name,
    load_book,
    extract_tracks,
    get_book_id,
    get_book_name,
    track_display_text,
    write_subtitles,
    write_unit_subtitles,
    build_unit_map,
    page_audio_paths,
    do_ffmpeg_concat,
    merge_mp3_dir,
    tag_mp3_dir,
)

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

# 年级 → 数字（用于目录命名）
_GRADE_NUM = {"一": "1", "二": "2", "三": "3", "四": "4", "五": "5", "六": "6",
              "七": "7", "八": "8", "九": "9"}


# ─────────────────────────── 文件名（页码+页内序号） ───────────────────────────

def make_track_filename(page_no: int, seq_in_page: int, track: dict, name_len: int = 60) -> str:
    """生成文件名: P{页码:03d}_{页内序号:02d}_{音频对应文字}.mp3
    页码+页内序号保证按文件名排序 = 教材顺序（便于老师按顺序播放）；
    文字取朗读内容（track_text 英文，缺失回退 track_genre 中文），经 clean_name 清洗。
    """
    stem = clean_name(track_display_text(track), max_len=name_len)
    return f"P{int(page_no):03d}_{int(seq_in_page):02d}_{stem}.mp3"


def page_seq_filename(tracks, name_len=60):
    """为 tracks 生成 (track, filename) 列表：按页码分组、页内递增序号（对齐老脚本）。"""
    result = []
    current_page = None
    seq = 0
    for t in tracks:
        page = int(t.get("_page_no") or 0)
        if page != current_page:
            current_page = page
            seq = 1
        else:
            seq += 1
        result.append((t, make_track_filename(page, seq, t, name_len)))
    return result


# ─────────────────────────── 目录解析与保存 ───────────────────────────

def parse_book_dir(book_name: str):
    """从书名解析 学段/科目/版本/年级/册次。
    示例: '英语（PEP） 四年级 上册' → (小学, 英语, 人教版（PEP）（主编：吴欣）, 四年级, 上册)
    """
    n = book_name or ""
    vol = "上册" if "上册" in n else ("下册" if "下册" in n else "")
    m = re.search(r"([一二三四五六七八九])年级", n)
    grade = (m.group(0) if m else "")
    grade_no = _GRADE_NUM.get(m.group(1), "") if m else ""
    subject = "英语" if "英语" in n else ("语文" if "语文" in n else "")
    if "PEP" in n:
        version = "人教版（PEP）（主编：吴欣）"
    elif subject == "语文":
        version = "统编版"
    else:
        version = ""
    stage = "小学" if grade_no and int(grade_no) <= 6 else ("初中" if grade_no and int(grade_no) <= 9 else "")
    return {"stage": stage, "subject": subject, "version": version,
            "grade": grade, "grade_no": grade_no, "volume": vol}


def resolve_save_dir(root: Path, book_name: str) -> Path:
    """生成展开目录: {root}/教材/{学段}/{科目}/{版本}/{年级}/{册次}
    册次（上册/下册）独立成目录，避免同年级上下册文件互相覆盖/混淆。
    """
    d = parse_book_dir(book_name)
    parts = ["教材"]
    for k in ("stage", "subject", "version", "grade"):
        v = d[k]
        parts.append(v if v else "未知")
    # 册次：上册/下册 → 独立目录；无册次信息则省略
    vol = d.get("volume") or ""
    if vol:
        parts.append(vol)
    return root.joinpath(*parts)


def cmd_save(args):
    """把导出的 book JSON 规范化保存到 data/{bookid}_{书名}.json"""
    book = load_book(args.book)
    book_id = get_book_id(book)
    book_name = get_book_name(book) or "book"

    data_dir = Path(args.data)
    data_dir.mkdir(parents=True, exist_ok=True)
    fname = f"{book_id}_{clean_name(book_name, max_len=80)}.json"
    dest = data_dir / fname

    if dest.exists() and not args.force:
        print(f"已存在，跳过: {dest}")
        return 0
    shutil.copy2(args.book, dest)
    print(f"已保存: {dest}")
    print(f"  book_id: {book_id} | 书名: {book_name}")
    return 0


def cmd_expand(args):
    """批量: 遍历 data/*.json，逐个下载 mp3 + 字幕到对应目录"""
    data_dir = Path(args.data)
    root = Path(args.root)
    if not data_dir.exists():
        print(f"✗ 数据目录不存在: {data_dir}")
        return 2

    files = sorted(data_dir.glob("*.json"))
    if not files:
        print(f"✗ {data_dir} 下没有 *.json")
        return 2

    # --book 过滤：模糊匹配书名（支持多个关键词，逗号分隔，全部命中才选中）
    book_filter = None
    if args.book:
        book_filter = [kw.strip().lower() for kw in args.book.split(",") if kw.strip()]

    print(f"发现 {len(files)} 本教材数据，开始展开...")
    total_ok = total_fail = total_skip = 0
    for f in files:
        try:
            book = load_book(f)
        except Exception as e:
            print(f"✗ {f.name}: 解析失败 {e}")
            total_fail += 1
            continue

        book_name = get_book_name(book) or f.stem
        # 按关键词过滤（书名内含所有关键词才选中）
        if book_filter and not all(kw in book_name.lower() for kw in book_filter):
            total_skip += 1
            continue

        save_dir = resolve_save_dir(root, book_name)
        print(f"\n{'=' * 60}\n▶ {book_name}  →  {save_dir}")
        rc = download_tracks(book, save_dir, args.force,
                             organize=not args.flat, delay_max=args.delay,
                             do_audio=not args.no_audio, do_images=not args.no_images,
                             no_sentence=args.no_sentence)
        if rc == 0:
            total_ok += 1
        else:
            total_fail += 1

    skip_msg = f"，跳过 {total_skip} 本" if total_skip else ""
    print(f"\n{'=' * 60}\n全部完成: 成功 {total_ok} 本，失败 {total_fail} 本{skip_msg}")
    return 0 if total_fail == 0 else 1


# ─────────────────────────── 下载 ───────────────────────────

def download_file(url: str, path: str, force: bool = False) -> bool:
    if os.path.exists(path) and not force:
        return True
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        if len(data) < 1000:
            print(f"      [警告] 文件过小({len(data)}B)，跳过: {url}")
            return False
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
        return True
    except Exception as e:
        print(f"      [失败] {type(e).__name__}: {e}")
        return False


def download_tracks(book: dict, out_dir: Path, force: bool = False,
                    organize: bool = True, do_merge_pages: bool = True, do_merge_units: bool = True,
                    do_audio: bool = True, do_images: bool = True,
                    delay_max: float = 0.0, no_sentence: bool = False) -> int:
    """下载素材（音频 + 图片 + 字幕）。返回 0=全部成功，1=有失败。

    organize=True（默认）时按素材库目录组织（对齐教材素材库）:
      _音频素材/单句音频/  P{页:03d}_{序号:02d}_{文字}.mp3   ← 单句
      _音频素材/页音频/    P{页:03d}.mp3                     ← 每页合并为一个
      _音频素材/单元音频/  Unit{NN}_{单元标题}.mp3            ← 每单元合并为一个
      _音频素材/*.srt 等                                     ← 总字幕 + 分单元字幕
      _图片素材/           {页码:03d}.png 或 {书名}_{页码:02d}.png  ← 每页截图
    organize=False 时所有单句直接放 out_dir（旧布局）。

    do_audio=True 下载 mp3 + 生成字幕；do_images=True 下载每页图片（page_url_source）。
    delay_max：每个文件下载后的随机延迟上限（秒），默认 0 不延迟；
               设置 >0 时每次下载后随机 sleep [0, delay_max)，避免对服务器压力过大。
    no_sentence=True 时字幕跳过逐句展开（SRT 条目 = book.json track 一一对应）。

    注意：audio 只能逐条直链下载（resource.track.zip 内容为加密格式，不可用）。
    """
    tracks, book_name = extract_tracks(book)
    if not tracks:
        print("✗ 未找到任何 track（含 mp3 直链）")
        return 2

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"track 数: {len(tracks)}")

    # tqdm 进度条（可选依赖，缺失则退化纯文本）
    try:
        from tqdm import tqdm
        _tqdm = tqdm
    except ImportError:
        _tqdm = None

    if organize:
        audio_root = out_dir / "_音频素材"
        sentence_dir = audio_root / "单句音频"
        page_dir = audio_root / "页音频"
        unit_dir = audio_root / "单元音频"
        image_dir = out_dir / "_图片素材"
        for d in (sentence_dir, page_dir, unit_dir, audio_root, image_dir):
            d.mkdir(parents=True, exist_ok=True)
    else:
        sentence_dir = out_dir
        page_dir = None
        unit_dir = None
        audio_root = out_dir
        image_dir = None

    # ═══════════════ 音频部分（do_audio=True 时执行） ═══════════════
    if do_audio:
        # ── 1. 单句音频：逐条直链下载（tqdm 进度条） ──
        # 注：resource.track.zip 整包内容为加密格式（非标准 MP3），不可用，
        #     必须用 track_url_source 直链逐条下载（公开可访问、标准 MP3）。
        ok, fail = 0, 0
        files = list(page_seq_filename(tracks))
        iterator = _tqdm(files, desc="下载单句音频", unit="个") if _tqdm else files
        for t, fname in iterator:
            path = sentence_dir / fname
            if not _tqdm:
                print(f"  [{ok + fail + 1}/{len(tracks)}] {fname}")
            downloaded = download_file(t["track_url_source"], str(path), force)
            if downloaded:
                ok += 1
            else:
                fail += 1
            # 随机延迟，避免对服务器压力过大（仅在本次实际下载时延迟，跳过已存在不延迟）
            if downloaded and delay_max > 0:
                import random
                time.sleep(random.uniform(0, delay_max))
        print(f"单句音频完成: 成功 {ok}，失败 {fail}")
        if fail:
            return 1

        # ── 2. 页音频：按页合并 ──
        if do_merge_pages and page_dir is not None:
            print("▶ 按页合并音频...")
            page_groups = [(pn, g) for pn, g in page_audio_paths(tracks, page_dir)
                           if list(sentence_dir.glob(f"P{pn:03d}_*.mp3"))]
            pbar = _tqdm(page_groups, desc="合并页音频", unit="页") if _tqdm else page_groups
            for pn, group in pbar:
                mp3s = [sentence_dir / f for f in sorted(sentence_dir.glob(f"P{pn:03d}_*.mp3"))]
                out_file = page_dir / f"P{pn:03d}.mp3"
                if out_file.exists() and not force:
                    continue
                if not do_ffmpeg_concat(mp3s, out_file, force, quiet=bool(_tqdm)):
                    if not _tqdm:
                        print(f"  ✗ 页合并失败 P{pn}")

        # ── 3. 单元音频：按单元合并 ──
        if do_merge_units and unit_dir is not None:
            unit_pages = build_unit_map(book, tracks)
            if unit_pages:
                print("▶ 按单元合并音频...")
                # 序号: 按 bookaudio_v3 顺序
                v3_titles = [u.get("title") for u in (book.get("bookaudio_v3") or []) if u.get("title")]
                for i, (title, pages) in enumerate(unit_pages.items(), start=1):
                    try:
                        no = v3_titles.index(title) + 1
                    except ValueError:
                        no = i
                    pageset = set(pages)
                    # 按页码筛选单句音频（文件名 P{page:03d}_*.mp3，页码在名字前 3 位）
                    sel = [m for m in sentence_dir.glob("P*_*.mp3")
                           if m.name[1:4].isdigit() and int(m.name[1:4]) in pageset]
                    if sel:
                        out_file = unit_dir / f"Unit{no:02d}_{clean_name(title, max_len=60)}.mp3"
                        if out_file.exists() and not force:
                            continue
                        if do_ffmpeg_concat(sorted(sel), out_file, force, quiet=bool(_tqdm)):
                            if not _tqdm:
                                print(f"  ✅ {out_file.name}")

        # ── 4. 字幕：总字幕 + 分单元字幕 ──
        if organize:
            write_unit_subtitles(book, tracks, book_name, audio_root, no_sentence=no_sentence)
        else:
            write_subtitles(tracks, book_name, out_dir, no_sentence=no_sentence)

    # ═══════════════ 图片部分（do_images=True 时执行） ═══════════════
    if do_images and image_dir is not None:
        pages = book.get("bookpage") or []
        if isinstance(pages, dict):
            pages = list(pages.values())
        # 无页码页（如 page_001 封面变体）也下载，作为素材（可内嵌视频）：
        # 分配补位页码——从 1 递增找第一个未被 page_no 占用的编号（通常为 1，即 Page_001.png）
        used = set()
        for pg in pages:
            if isinstance(pg, dict) and pg.get("page_no") is not None:
                used.add(int(pg["page_no"]))
        fill = 1
        for pg in pages:
            if isinstance(pg, dict) and pg.get("page_no") is None:
                while fill in used:
                    fill += 1
                pg["_fill_page_no"] = fill
                used.add(fill)
        print(f"▶ 下载图片 ({len(pages)} 页" +
              (f"，其中无页码封面补位 {sum(1 for pg in pages if pg.get('_fill_page_no'))} 页" if any(pg.get('_fill_page_no') for pg in pages if isinstance(pg, dict)) else "") + ")...")
        img_ok = img_fail = 0
        iterator = _tqdm(pages, desc="下载图片", unit="页") if _tqdm else pages
        for pg in iterator:
            if not isinstance(pg, dict):
                continue
            url = pg.get("page_url_source") or pg.get("page_url") or ""
            if not url:
                img_fail += 1
                continue
            pn = pg.get("_fill_page_no") if pg.get("_fill_page_no") is not None else pg.get("page_no")
            # 图片命名：Page_{页码:03d}.png —— 与页音频 P{页码:03d}.mp3 按页码对齐，
            # 且不含教材名前缀（目录层级已包含教材信息），减少草稿 JSON 冗余长度
            fname = f"Page_{int(pn):03d}.png"
            path = image_dir / fname
            downloaded = download_file(url, str(path), force)
            if downloaded:
                img_ok += 1
            else:
                img_fail += 1
            if downloaded and delay_max > 0:
                import random
                time.sleep(random.uniform(0, delay_max))
        print(f"图片完成: 成功 {img_ok}，失败 {img_fail}")

    print(f"完成: 目录 {out_dir}")
    return 0


def cmd_parse(args):
    book = load_book(args.book)
    tracks, book_name = extract_tracks(book)
    print(f"书名: {book_name or '未知'}")
    print(f"bookpage 解析 track 数: {len(tracks)}")
    for i, t in enumerate(tracks[:args.limit]):
        page = t["_page_no"]
        print(f"  P{page:<4} {t.get('track_text','')[:60]!r} | {t.get('track_genre','')[:30]!r}")
        print(f"        {t.get('track_url_source','')[:100]}")


def cmd_download(args):
    book = load_book(args.book)
    book_name = get_book_name(book)
    out = args.out or (book_name if book_name else "素材")
    out = out.strip() or "素材"
    print(f"书名: {book_name or '未知'} → {out}")
    rc = download_tracks(book, Path(out), args.force,
                         organize=not args.flat, delay_max=args.delay,
                         do_audio=not args.no_audio, do_images=not args.no_images,
                         no_sentence=args.no_sentence)
    return rc


def cmd_merge(args):
    """将指定目录下所有 mp3 合并为一个文件（ffmpeg concat，对齐老脚本 MergeMp3.py）。"""
    song_dir = args.dir
    out_name = args.name or Path(song_dir).name or "合并音频"
    path = merge_mp3_dir(song_dir, out_name, out_parent=args.out, force=args.force)
    return 0 if path else 1


def cmd_tag(args):
    """为目录下所有 mp3 写 ID3 标签（album=书名，可选 mutagen）。"""
    song_dir = args.dir
    album = args.album or Path(song_dir).name or ""
    count = tag_mp3_dir(song_dir, album=album)
    print(f"已写标签 {count} 个 mp3（album={album}）")
    return 0


def main():
    p = argparse.ArgumentParser(prog="diandu_audio.py", description="人教点读教材音频下载工具")
    sub = p.add_subparsers(dest="cmd", required=True)

    pp = sub.add_parser("parse", help="解析 book JSON，预览音频清单")
    pp.add_argument("book", help="book JSON 文件路径")
    pp.add_argument("--limit", type=int, default=20)
    pp.set_defaults(func=cmd_parse)

    ps = sub.add_parser("save", help="规范化保存到 data/{bookid}_{书名}.json")
    ps.add_argument("book", help="book JSON 文件路径")
    ps.add_argument("--data", default="data", help="数据目录（默认 data/）")
    ps.add_argument("--force", action="store_true", help="覆盖已存在")
    ps.set_defaults(func=cmd_save)

    pd = sub.add_parser("下载素材", help="下载单个 book JSON 的 音频+图片+字幕")
    pd.add_argument("book", help="book JSON 文件路径")
    pd.add_argument("--out", help="输出目录（默认书名）")
    pd.add_argument("--flat", action="store_true", help="不按单句/页/单元分目录，单句直接放输出目录")
    pd.add_argument("--no-audio", action="store_true", help="不下载音频+字幕（默认下载）")
    pd.add_argument("--no-images", action="store_true", help="不下载页面图片（默认下载）")
    pd.add_argument("--delay", type=float, default=5.0,
                    help="每个文件下载后的随机延迟上限秒数（默认 5，设为 0 关闭）")
    pd.add_argument("--force", action="store_true", help="覆盖已存在文件")
    pd.add_argument("--no-sentence", action="store_true",
                    help="字幕跳过逐句展开（SRT 条目 = book.json track 一一对应，供点读框对齐）")
    pd.set_defaults(func=cmd_download)

    pe = sub.add_parser("expand", help="批量展开 data/*.json → 下载素材到对应目录")
    pe.add_argument("--data", default="data", help="数据目录（默认 data/）")
    pe.add_argument("--root", default="已下载", help="下载根目录（默认 已下载/）")
    pe.add_argument("--book", help="按书名过滤（模糊匹配，逗号分隔多关键词，如 '一年级,上册'）")
    pe.add_argument("--flat", action="store_true", help="不按单句/页/单元分目录")
    pe.add_argument("--no-audio", action="store_true", help="不下载音频+字幕（默认下载）")
    pe.add_argument("--no-images", action="store_true", help="不下载页面图片（默认下载）")
    pe.add_argument("--delay", type=float, default=5.0,
                    help="每个文件下载后的随机延迟上限秒数（默认 5，设为 0 关闭）")
    pe.add_argument("--force", action="store_true", help="覆盖已存在文件")
    pe.add_argument("--no-sentence", action="store_true",
                    help="字幕跳过逐句展开（SRT 条目 = book.json track 一一对应，供点读框对齐）")
    pe.set_defaults(func=cmd_expand)

    pm = sub.add_parser("merge", help="合并目录下所有 mp3 为一个文件（需 ffmpeg）")
    pm.add_argument("dir", help="mp3 所在目录")
    pm.add_argument("--name", help="输出文件名（默认目录名）")
    pm.add_argument("--out", help="输出目录（默认上级目录）")
    pm.add_argument("--force", action="store_true", help="覆盖已存在")
    pm.set_defaults(func=cmd_merge)

    pt = sub.add_parser("tag", help="为目录下所有 mp3 写 ID3 标签（需 mutagen）")
    pt.add_argument("dir", help="mp3 所在目录")
    pt.add_argument("--album", help="专辑名（默认目录名）")
    pt.set_defaults(func=cmd_tag)

    args = p.parse_args()
    sys.exit(args.func(args) or 0)


if __name__ == "__main__":
    main()
