# -*- coding: utf-8 -*-
"""
人教点读下载工具公共函数 (scripts/diandu_common.py)

从 diandu_audio.py 提取的公共逻辑：文件名清洗、track 解析、字幕生成、目录解析。
供 diandu_audio.py 及其他相关脚本复用。
"""
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import timedelta
from pathlib import Path

# ─────────────────────────── 文件名清洗 ───────────────────────────

# Windows 文件名字符替换表（来源：老脚本 DownloadPEP.py modify_filename_for_ffmpeg，已扩展）
_WIN_INVALID = {
    '"': "",       # 双引号 → 删除（Windows 非法字符）
    "<": "《",      # 书名号
    ">": "》",
    ":": "：",      # 冒号 → 全角（保留可读性，老脚本转全角）
    "/": "-",      # 斜杠 → 连字符
    "\\": "-",
    "|": "-",
    "?": "？",      # 问号 → 全角（保留语义）
    "*": "·",      # 星号 → 间隔号
}

# 控制字符 → 分隔符
_CTRL_PATTERN = re.compile(r"[\x00-\x1F\x7F]+")
# HTML 标签
_HTML_PATTERN = re.compile(r"<[^>]*>")


def clean_name(s: str, max_len: int = 60) -> str:
    """
    文件名安全化（优化版）。

    规则（对齐老脚本 DownloadPEP.py 并修复其缺陷）：
      1. 去掉 HTML 标签（老脚本有）
      2. 控制字符（含 \\n\\r\\t）→ 空格（老脚本只处理 \\n\\r → "-"，\\t 会漏）
      3. Windows 非法字符按表替换（" < > : / \\ | ? *）
      4. 全角逗号/句号/顿号/省略号等保留（非 ASCII 安全）
      5. 空白 → _，合并连续 _（老脚本 .replace(" ", "_") + 手动合并）
      6. 去掉首尾分隔符
      7. 截断到 max_len（按字符，避免按字节截断中文导致乱码）

    注意：老脚本会把 "." 替换为 "_"（导致 "I'm happy." 变 "I'm_happy_"），
    优化为保留英文句点（Windows 安全且语义清晰）。
    """
    s = s or ""
    s = _HTML_PATTERN.sub("", s)
    s = _CTRL_PATTERN.sub(" ", s)
    for k, v in _WIN_INVALID.items():
        s = s.replace(k, v)
    # 空格及重复分隔符规范化
    s = re.sub(r"\s+", " ", s).strip()
    s = s.replace(" ", "_")
    s = re.sub(r"_+", "_", s)
    s = s.strip("_-") or "track"
    if len(s) > max_len:
        s = s[:max_len].rstrip("_-")
    return s


def track_display_text(track: dict) -> str:
    """音频对应的朗读文字：track_text（英文）优先，缺失回退 track_genre（中文）。"""
    return track.get("track_text") or track.get("track_genre") or "track"


# ─────────────────────────── 数据解析 ───────────────────────────

def load_book(path) -> dict:
    """加载 book JSON，兼容：顶层就是 bookpage / 顶层含 bookpage / 小程序输出原始格式"""
    raw = Path(path).read_text(encoding="utf-8-sig", errors="replace")
    data = json.loads(raw)

    # 小程序可能输出 {data: {...}} / {result: [...]} 包装
    while isinstance(data, dict) and "bookpage" not in data:
        for k in ("data", "result", "content", "book"):
            v = data.get(k)
            if isinstance(v, (dict, list)):
                data = v
                break
        else:
            break

    if isinstance(data, dict) and "bookpage" in data:
        return data
    if isinstance(data, list):  # 直接是 bookpage 数组
        return {"bookpage": data, "bookinfo": {}}
    raise ValueError("无法识别的 book JSON 结构（未找到 bookpage 字段）")


def extract_tracks(book: dict):
    """从 bookpage 提取全部 track：page_no + track 字段合并"""
    tracks = []
    book_name = ""
    bi = book.get("bookinfo") or {}
    if isinstance(bi, dict):
        book_name = bi.get("itemname") or bi.get("book_name") or bi.get("name") or ""

    pages = book.get("bookpage") or []
    if isinstance(pages, dict):  # 容错：bookpage 可能是对象
        pages = list(pages.values())
    for pg in pages:
        if not isinstance(pg, dict):
            continue
        page_no = pg.get("page_no") or pg.get("page_number") or 0
        for t in pg.get("track_info") or []:
            if not isinstance(t, dict) or not t.get("track_url_source"):
                continue
            tracks.append({**t, "_page_no": page_no})
    return tracks, book_name


def get_book_id(book: dict) -> str:
    """提取人教点读 book_id（bookinfo.bookid_3rd），失败返回 'unknown'"""
    bi = book.get("bookinfo") or {}
    bid = bi.get("bookid_3rd") or bi.get("book_id") or ""
    return str(bid).strip() or "unknown"


def get_book_name(book: dict) -> str:
    """提取书名"""
    bi = book.get("bookinfo") or {}
    return (bi.get("bookname") or bi.get("itemname") or bi.get("book_name") or "").strip()


# ─────────────────────────── 字幕生成 ───────────────────────────

def _srt_time(sec: float) -> str:
    sec = max(0, int(round(sec * 1000)))
    ms = sec % 1000
    total_s = sec // 1000
    h, rem = divmod(total_s, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def build_subtitles(tracks, no_sentence: bool = False):
    """为每个 track 生成 srt（英）+ cn（中）+ en_cn.txt（中英对照）。返回 dict 文件内容。

    no_sentence=True 时**跳过 sentence_evaluating 逐句展开**，只保留整段 track 条目
    （SRT 条目 = book.json track 一一对应，供 CapCutTool 点读框对齐 / 人工拆分字幕）。
    """
    srt_en = []
    srt_cn = []
    en_cn_lines = []
    idx = 0
    cursor = timedelta(seconds=0)

    for t in tracks:
        text = (t.get("track_text") or "").replace("\n", "").strip()
        trans = (t.get("track_genre") or "").replace("\n", "").strip()
        dur = float(t.get("track_duration") or 0)
        sentences = t.get("sentence_evaluating") or []

        # 分组标题（每段音频本身算一条）
        idx += 1
        start = cursor
        end = cursor + timedelta(seconds=max(dur, 0.1))
        if text or trans:
            ts = _srt_time(start.total_seconds())
            te = _srt_time(end.total_seconds())
            srt_en.append(f"{idx}\n{ts} --> {te}\n{text}\n")
            srt_cn.append(f"{idx}\n{ts} --> {te}\n{trans}\n")
            en_cn_lines.append(text)
            en_cn_lines.append(trans)
            en_cn_lines.append("")
        cursor = end

        # 逐句（sentence_evaluating 提供音频内精确时间轴）—— no_sentence 时跳过
        if sentences and not no_sentence:
            last_start = 0.0
            for i, s in enumerate(sentences):
                s_text = (s.get("text") or "").replace("\n", "").strip()
                s_trans = (s.get("trans") or "").replace("\n", "").strip()
                s_start = float(s.get("audio_start") or last_start)
                if i + 1 < len(sentences):
                    s_end = float(sentences[i + 1].get("audio_start") or s_start)
                else:
                    s_end = max(float(s.get("audio_end") or 0), dur)
                last_start = s_start
                idx += 1
                ts = _srt_time(start.total_seconds() + s_start)
                te = _srt_time(start.total_seconds() + s_end)
                if s_text or s_trans:
                    srt_en.append(f"{idx}\n{ts} --> {te}\n{s_text}\n")
                    srt_cn.append(f"{idx}\n{ts} --> {te}\n{s_trans}\n")
                    en_cn_lines.append(f"\t{s_text}")
                    en_cn_lines.append(f"\t{s_trans}")
                    en_cn_lines.append("")

    return {
        "srt": "\n".join(srt_en).strip() + "\n",
        "cn_srt": "\n".join(srt_cn).strip() + "\n",
        "en_cn_txt": "\n".join(en_cn_lines).strip() + "\n",
    }


def write_subtitles(tracks, book_name, out_dir: Path, no_sentence: bool = False):
    """生成字幕文件: .srt 英文 / _cn.srt 中文 / _en_cn.txt 中英对照"""
    subs = build_subtitles(tracks, no_sentence=no_sentence)
    base = out_dir / (book_name or "book")
    for ext, content in [(".srt", subs["srt"]), ("_cn.srt", subs["cn_srt"]), ("_en_cn.txt", subs["en_cn_txt"])]:
        sub_path = Path(str(base) + ext)
        sub_path.write_text(content, encoding="utf-8")
        print(f"字幕: {sub_path.name}")


def write_unit_subtitles(book, tracks, book_name, out_dir: Path, no_sentence: bool = False):
    """按单元/附件拆分字幕：每个单元一个 .srt + _cn.srt + _en_cn.txt。
    文件名: Unit01_Unit_1_Helping_at_home.srt / 09_Appendix_1_Songs.srt 等（带序号便于排序）。
    同时生成总字幕文件（book_name.srt 等）。
    no_sentence=True 时跳过逐句展开（见 build_subtitles）。
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    unit_pages = build_unit_map(book, tracks)
    if not unit_pages:
        return

    # 序号: Unit 1-6 → 01-06, Revision → 07, Appendix → 08-11（按 bookaudio_v3 顺序）
    v3_titles = []
    for u in (book.get("bookaudio_v3") or []):
        t = u.get("title")
        if t:
            v3_titles.append(t)

    def unit_no(title):
        try:
            return v3_titles.index(title) + 1
        except ValueError:
            return 0

    # 总字幕（全部 track）
    subs_all = build_subtitles(tracks, no_sentence=no_sentence)
    base = out_dir / (book_name or "book")
    for ext, content in [(".srt", subs_all["srt"]), ("_cn.srt", subs_all["cn_srt"]), ("_en_cn.txt", subs_all["en_cn_txt"])]:
        Path(str(base) + ext).write_text(content, encoding="utf-8")
    print(f"总字幕: {base.name}.srt / _cn.srt / _en_cn.txt")

    # 分单元字幕
    for title, pages in unit_pages.items():
        unit_tracks = [t for t in tracks if int(t.get("_page_no") or 0) in set(pages)]
        if not unit_tracks:
            continue
        no = unit_no(title)
        prefix = f"{no:02d}"
        fname = f"{prefix}_{clean_name(title, max_len=60)}"
        subs = build_subtitles(unit_tracks, no_sentence=no_sentence)
        for ext, content in [(".srt", subs["srt"]), ("_cn.srt", subs["cn_srt"]), ("_en_cn.txt", subs["en_cn_txt"])]:
            Path(out_dir / (fname + ext)).write_text(content, encoding="utf-8")
        print(f"单元字幕: {fname}.srt")


# ─────────────────────────── 章节合并（ffmpeg concat） ───────────────────────────

_APPENDIX_CN_NUM = {"1": "一", "2": "二", "3": "三", "4": "四", "5": "五", "6": "六"}


def appendix_keywords(title: str) -> list:
    """根据 Appendix 标题返回中英文匹配关键词（完整短语，防误匹配正文页）。

    实测各册 track 标记不一致：
      - 老数据：text='Appendix 1' genre='附录一'
      - 新数据（一下/二下）：text='Songs' genre='歌曲' / 'Listening scripts for …' / 'Words in each unit' / 'Useful expressions'
    """
    m = re.match(r"Appendix\s*(\d+)\b\s*(.*)", title, re.I | re.S)
    if not m:
        return []
    no, rest = m.group(1), m.group(2).strip()
    base = [f"Appendix {no}", f"附录{_APPENDIX_CN_NUM.get(no, no)}"]
    if "Song" in rest:
        base += ["Songs", "歌曲"]
    elif "Listening" in rest:
        base += ["Listening scripts", "听力文本"]
    elif "Words" in rest:
        base += ["Words in each unit", "单元词汇表"]
    elif "Useful" in rest:
        base += ["Useful expressions", "常用表达法"]
    return base


def build_unit_map(book: dict, tracks: list):
    """构建 页码 → 单元名 映射 + 单元页码范围。

    规则（实测验证）：
      - Unit N 首页 = bookaudio_v3.children[0].page_no - 2（如 Unit1 children[0]=4 → 首页 P2）
      - Revision/Appendix 无 children：优先用页面探测（track 文字含标题关键词）；
        探测不到时按 bookaudio_v3 顺序用"上一段末尾+1"推断，最后一个到书末。
      - Unit 探测用前缀 `Unit N`（部分册 track 只标 "Unit 1" 不带完整标题）；
        Revision 匹配 "Revision"/"复习"；Appendix 匹配中英文关键词（Songs/歌曲 等）。
    返回 {unit_title: [page_no, ...]}，保持单元顺序。
    """
    _CN_NUM = {"1": "一", "2": "二", "3": "三", "4": "四", "5": "五", "6": "六"}
    v3 = book.get("bookaudio_v3") or []
    titles = [u.get("title") for u in v3 if u.get("title")]
    if not titles:
        return {}

    all_pages = sorted(set(int(t.get("_page_no") or 0) for t in tracks))
    if not all_pages:
        return {}
    first_page, last_page = all_pages[0], all_pages[-1]

    # 1) 计算每段首页
    starts = {}  # title -> page
    for u in v3:
        title = u.get("title") or ""
        if not title:
            continue
        children = u.get("children") or []
        if children:
            p0 = int(children[0].get("page_no") or 0)
            starts[title] = max(p0 - 2, first_page) if p0 else None
        else:
            # 无 children：页面探测标题关键词
            # Unit N → 匹配前缀 "Unit N"（部分册 track 只写 "Unit 1" 不带完整标题）
            # Revision → 匹配 "Revision"/"复习"；Appendix N → 匹配中英文关键词
            hit = None
            um = re.match(r"Unit\s*(\d+)\b", title)
            rm = re.match(r"^Revision\b", title)
            am = re.match(r"^Appendix\s*\d+\b", title, re.I)
            kw = appendix_keywords(title) if am else []
            for pg in book.get("bookpage") or []:
                pn = pg.get("page_no")
                tis = pg.get("track_info") or []
                for t in tis:
                    tt = (t.get("track_text") or "") + " " + (t.get("track_genre") or "")
                    tt_norm = re.sub(r"\s+", " ", tt)
                    if am:
                        if any(k and k in tt_norm for k in kw):
                            hit = pn
                            break
                    elif rm and ("Revision" in tt_norm or "复习" in tt_norm):
                        hit = pn
                        break
                    elif um and re.search(rf"Unit\s*{um.group(1)}\b", tt_norm, re.I):
                        hit = pn
                        break
                if hit:
                    break
            starts[title] = hit

    # 2) 按 bookaudio_v3 顺序遍历：探测不到首页的段，
    #    用上一个已知首页的段末尾 + 1；第一个段用 first_page。
    ordered_titles = [t for t in titles if t in starts]
    result = {}
    prev_end = first_page - 1
    for i, title in enumerate(ordered_titles):
        start = starts.get(title)
        if start is None or start <= prev_end:
            start = prev_end + 1  # 顺序推断
        # 确定 end：下一段探测首页 - 1，否则到最后
        nxt = None
        for j in range(i + 1, len(ordered_titles)):
            s2 = starts.get(ordered_titles[j])
            if s2 is not None and s2 > start:
                nxt = s2
                break
        end = (nxt - 1) if nxt else last_page
        pages = [p for p in all_pages if start <= p <= end]
        if pages:
            result[title] = pages
        prev_end = end
    return result


def page_audio_paths(tracks, out_dir: Path):
    """按页码分组：返回 [(page_no, [track...])]。tracks 已含 _page_no。"""
    groups = {}
    order = []
    for t in tracks:
        pn = int(t.get("_page_no") or 0)
        if pn not in groups:
            groups[pn] = []
            order.append(pn)
        groups[pn].append(t)
    return [(pn, groups[pn]) for pn in order]


def merge_track_group(tracks_in_group, out_dir: Path, out_name: str, force: bool) -> bool:
    """将一组 track 对应的 mp3 合并为一个文件。
    直接从 track_url_source 逐条下载到临时目录再合并，或复用已下载文件。
    返回是否成功。
    """
    import tempfile

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"{clean_name(out_name, max_len=100)}.mp3"
    if out_file.exists() and not force:
        print(f"  已存在: {out_file.name}")
        return True

    # 下载该组全部 mp3 到临时目录
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        mp3s = []
        for i, t in enumerate(tracks_in_group):
            src = t.get("track_url_source") or ""
            if not src:
                continue
            fname = f"{i:03d}.mp3"
            dest = tmp_dir / fname
            try:
                req = urllib.request.Request(src, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=60) as r:
                    dest.write_bytes(r.read())
                mp3s.append(dest)
            except Exception as e:
                print(f"    [下载失败] {e}")
                return False
        if not mp3s:
            return False
        return do_ffmpeg_concat(mp3s, out_file, force)


def do_ffmpeg_concat(mp3s, out_file: Path, force: bool, quiet: bool = False) -> bool:
    """用 ffmpeg concat 合并 mp3 列表到 out_file。
    concat 列表格式：file '路径'，路径中的单引号需转义为 '\\''（ffmpeg 规范）。
    quiet=True 时成功静默（配合 tqdm 进度条）。
    """
    with tempfile.NamedTemporaryFile("w", suffix=".txt", encoding="utf-8", delete=False) as f:
        for m in mp3s:
            p = str(m).replace("'", "'\\''")  # ffmpeg concat 单引号转义
            f.write(f"file '{p}'\n")
        list_path = f.name
    try:
        cmd = [
            "ffmpeg", "-fflags", "+genpts", "-f", "concat", "-safe", "0",
            "-i", list_path, "-c", "copy", str(out_file), "-y",
        ]
        if not quiet:
            print(f"  ffmpeg 合并 {len(mp3s)} 个 → {out_file.name}")
        r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode != 0:
            print(f"  ✗ ffmpeg 失败: {r.stderr[-300:] if r.stderr else ''}")
            return False
        if not quiet:
            print(f"  ✅ {out_file.name} ({out_file.stat().st_size / 1048576:.1f} MB)")
        return True
    except FileNotFoundError:
        print("✗ 未找到 ffmpeg，请安装并加入 PATH")
        return False
    finally:
        try:
            os.unlink(list_path)
        except OSError:
            pass

def group_tracks_by_unit(tracks):
    """将 tracks 按单元分组。优先用 bookaudio_v3 的章节结构，
    否则按书名内关键词（Unit N / Revision / Appendix）粗分。返回 [(unit_title, [track...])]。
    """
    units = []
    order = []
    seen = {}
    for t in tracks:
        # 尝试从 track 里找 unit 归属（bookpage 的 track 无 unit 字段，
        # 实际分组信息来自 bookaudio_v3，这里从 URL/页号推导不可靠 → 默认单组）
        key = "全书"
        if key not in seen:
            seen[key] = []
            order.append(key)
        seen[key].append(t)
    for k in order:
        units.append((k, seen[k]))
    return units


def merge_mp3_dir(song_dir: str, out_name: str, out_parent: str = None, force: bool = False) -> str:
    """用 ffmpeg concat 合并指定目录下所有 mp3 为一个文件。
    返回合并后的文件路径；失败返回空串。
    """
    song_dir = Path(song_dir)
    if not song_dir.is_dir():
        print(f"✗ 目录不存在: {song_dir}")
        return ""

    mp3s = sorted([f for f in song_dir.iterdir() if f.suffix.lower() == ".mp3"])
    if not mp3s:
        print(f"✗ 目录下无 mp3: {song_dir}")
        return ""

    # 输出到上级目录（对齐老脚本 MergeMp3.py）
    parent = Path(out_parent) if out_parent else song_dir.parent
    parent.mkdir(parents=True, exist_ok=True)
    out_file = parent / f"{clean_name(out_name, max_len=80)}.mp3"

    if out_file.exists() and not force:
        print(f"已存在，跳过: {out_file}")
        return str(out_file)

    # 生成 concat 列表文件
    with tempfile.NamedTemporaryFile("w", suffix=".txt", encoding="utf-8", delete=False) as f:
        for m in mp3s:
            f.write(f"file '{str(m).replace(chr(39), chr(96))}'\n")
        list_path = f.name

    try:
        cmd = [
            "ffmpeg", "-fflags", "+genpts", "-f", "concat", "-safe", "0",
            "-i", list_path, "-c", "copy", str(out_file), "-y",
        ]
        print(f"  ffmpeg 合并 {len(mp3s)} 个文件 → {out_file.name}")
        r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode != 0:
            print(f"  ✗ ffmpeg 失败: {r.stderr[-300:] if r.stderr else ''}")
            return ""
        print(f"  ✅ {out_file.name} ({out_file.stat().st_size / 1048576:.1f} MB)")
        return str(out_file)
    except FileNotFoundError:
        print("✗ 未找到 ffmpeg，请安装并加入 PATH")
        return ""
    finally:
        try:
            os.unlink(list_path)
        except OSError:
            pass


def merge_mp3_by_units(tracks, song_dir: str, force: bool = False) -> int:
    """按单元合并整本书 mp3。当前数据无 unit 分组信息 → 全书合成一个。
    返回成功合并数。
    """
    units = group_tracks_by_unit(tracks)
    ok = 0
    for title, unit_tracks in units:
        if not unit_tracks:
            continue
        # 临时子目录：软链/复制该单元的 mp3？直接用整目录合并太粗，
        # 由于无分组信息，这里合并整目录（等价于 MergeMp3 单目录模式）
        break
    # 简单模式：合并整个 song_dir（无单元分组时全书一个文件）
    if tracks and song_dir:
        # 从第一个 track 找书名的上级目录命名
        out = merge_mp3_dir(song_dir, "全书音频", force=force)
        if out:
            ok += 1
    return ok


def add_mp3_tags(file_path, title=None, artist=None, album=None, lyrics=None, copyright_text=None):
    """写 MP3 ID3 标签（mutagen，可选依赖）。失败时返回 False。"""
    try:
        from mutagen.easyid3 import EasyID3
        from mutagen.id3 import ID3, COMM
    except ImportError:
        print("  ⚠ 未安装 mutagen（pip install mutagen），跳过标签写入")
        return False

    try:
        audio = EasyID3(file_path)
        if title:
            audio["title"] = title
        if artist:
            audio["artist"] = artist
        if album:
            audio["album"] = album
        if copyright_text:
            audio["copyright"] = copyright_text
        audio.save()

        if lyrics:
            id3 = ID3(file_path)
            id3.add(COMM(encoding=3, lang="eng", desc="desc", text=lyrics))
            id3.save(v2_version=3)
        return True
    except Exception as e:
        print(f"  ⚠ 标签写入失败: {e}")
        return False


def tag_mp3_dir(song_dir: str, album: str = "", copyright_text: str = "人民教育出版社•版权所有") -> int:
    """为目录下所有 mp3 写标签（album=书名）。返回成功数。"""
    song_dir = Path(song_dir)
    if not song_dir.is_dir():
        return 0
    count = 0
    for f in sorted(song_dir.iterdir()):
        if f.suffix.lower() == ".mp3":
            if add_mp3_tags(str(f), album=album, copyright_text=copyright_text):
                count += 1
    return count
