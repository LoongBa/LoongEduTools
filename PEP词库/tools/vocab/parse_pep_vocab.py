#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PEP 词汇表解析工具（/PEP词库 公共素材工具，独立于 RedTools build_framework）

数据来源（外部素材库）：
    F:\\_教材素材\\人教版（PEP）（主编：吴欣）\\<年级>\\<册次>\\_音频素材\\
      - 9 册：*Words_in_each_unit_en_cn.txt（独立词汇表，单词行 + 中文释义行 + 空行，
        Unit N 标题分隔）
      - 三下/五上/五下：整册 <册名>_en_cn.txt 中 "Words in each unit" 区块
        （格式一致，至 "Useful expressions" 结束）
统一解析规则：非空行两两配对（第1行=英文单词，第2行=中文释义），跳过标题行；
释义清理括号注释前缀，单词清理星号/HTML/尾部括号复数注释。

本模块既可被 RedTools/build_framework.py 以库方式导入（保持 976/978 词输出一致），
也可独立运行生成规范化词库 JSON：
    python parse_pep_vocab.py --vocab-dir "F:\\_教材素材\\人教版（PEP）（主编：吴欣）" \\
        --out-json "..\\..\\data\\vocab\\pep_vocab.json" --out-js dist\\data.js
"""

from __future__ import annotations

import argparse
import json
import re as _re
import sys
from datetime import date
from pathlib import Path

# ---------------------------------------------------------------
# 11 册清单（年级, 册次, 词汇表文件 glob, 是否整册提取区块）
# 注意：三下/五上/五下无独立"单元词汇表"文件（独立 Words 文件实际是字母序 Vocabulary
#       或缺失），单元词汇表在整册 <册名>_en_cn.txt 的 "Words in each unit" 区块中。
# ---------------------------------------------------------------
VOCAB_BOOKS: list[tuple[str, str, str, bool]] = [
    ("一年级", "上册", "*Words_in_each_unit_en_cn.txt", False),
    ("一年级", "下册", "*Words_in_each_unit_en_cn.txt", False),
    ("二年级", "上册", "*Words_in_each_unit_en_cn.txt", False),
    ("二年级", "下册", "*Words_in_each_unit_en_cn.txt", False),
    ("三年级", "上册", "*Words_in_each_unit_en_cn.txt", False),
    ("三年级", "下册", "*三年级*下册*_en_cn.txt", True),          # 无独立词汇表，取整册区块
    ("四年级", "上册", "*Words_in_each_unit_en_cn.txt", False),
    ("四年级", "下册", "*Words_in_each_unit_en_cn.txt", False),
    ("五年级", "上册", "*五年级*上册*_en_cn.txt", True),          # 无独立词汇表，取整册区块
    ("五年级", "下册", "*五年级*下册*_en_cn.txt", True),          # 独立 Words 文件为字母序 Vocabulary，单元表在整册
    ("六年级", "上册", "*Words_in_each_unit_en_cn.txt", False),
]

# 标题行（跳过）：Appendix / 附录 / Words in each unit / 单元词汇表 / Unit N / 第N单元
VOCAB_SKIP_RE = _re.compile(
    r"^(Appendix\s*\d*|附录\s*\d*|Words in each unit|单元词汇表|"
    r"Unit\s*\d+|第[一二三四五六七八九十\d]+单元)$",
    _re.IGNORECASE,
)
# 区块结束标记：整册 txt 中词汇表区块后紧跟字母序 Vocabulary / 常用表达法 / 语音 等
VOCAB_END_RE = _re.compile(
    r"^(Appendix\s*\d*|附录\s*\d*|Vocabulary|词汇表|"
    r"Useful expressions|常用表达法|Pronunciation|语音|"
    r"Irregular verbs|不规则动词|The alphabet|字母表)$",
    _re.IGNORECASE,
)


def clean_cn(cn: str) -> str:
    """清理中文释义：剥离首尾空白、剥离去声调音标/复数注释前缀
    （如 （复数children） 儿童；小孩 → 儿童；小孩）。"""
    cn = cn.strip()
    # 剥离形如 （复数children） （复数leaves /liːvz/） 等括号前缀注释
    m = _re.match(r"^（[^）]*[a-zA-Z][^）]*）\s*(.+)$", cn)
    if m:
        cn = m.group(1).strip()
    return cn


def clean_word(word: str) -> str:
    """清理英文单词：剥离星号标记（教材听力/重点词汇标记 *）、HTML 标签
    （<i>pl.</i> 等）、尾部括号复数注释（tooth (pl. teeth) → tooth）。"""
    w = word.strip()
    w = _re.sub(r"<[^>]+>", "", w).strip()          # HTML 标签
    w = w.lstrip("*").strip()                        # 星号标记
    m = _re.match(r"^(.+?)\s*[（(][^）)]*[）)]\s*$", w)  # 尾部括号注释
    if m:
        w = m.group(1).strip()
    return w


def parse_vocab_lines(lines: list[str]) -> list[dict]:
    """解析词汇表行列表（已按区块裁剪），返回 [{unit, word, cn}]。

    规则：非空行两两配对（第1行=英文单词，第2行=中文释义）；跳过标题行；
    单元标题行（Unit N / 第N单元）作为单元分隔。释义清理括号注释前缀。
    """
    entries: list[dict] = []
    unit = 0
    pending_word: str | None = None
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        if VOCAB_SKIP_RE.match(line):
            if _re.match(r"^Unit\s*\d+$", line, _re.IGNORECASE):
                unit = int(_re.search(r"\d+", line).group(0))
            continue
        # 配对：英文单词行（含字母）或中文释义行
        if pending_word is None:
            # 首行应为英文单词（含英文字母）
            if _re.search(r"[a-zA-Z]", line):
                pending_word = clean_word(line)
        else:
            entries.append({"unit": unit, "word": pending_word, "cn": clean_cn(line)})
            pending_word = None
    # 末尾未配对行丢弃（解析容错）
    return entries


def load_vocab_book(vocab_dir: Path, grade: str, term: str, pattern: str,
                    from_full_book: bool) -> dict:
    """加载一册词汇表，返回 {grade, term, book, units:[{unit, words:[{word, cn}]}]}。"""
    book_dir = vocab_dir / grade / term / "_音频素材"
    if not book_dir.exists():
        raise SystemExit(f"词汇表目录不存在: {book_dir}")
    matches = sorted(book_dir.glob(pattern))
    if not matches:
        raise SystemExit(f"词汇表文件缺失: {grade}/{term} pattern={pattern}")
    src_path = matches[0]

    if from_full_book:
        # 整册 txt：定位 "Words in each unit" 区块，至 Useful expressions 结束
        lines = src_path.read_text(encoding="utf-8", errors="replace").splitlines()
        start = None
        for i, ln in enumerate(lines):
            if ln.strip() == "Words in each unit":
                start = i + 1
                break
        if start is None:
            raise SystemExit(f"{src_path.name} 中未找到 Words in each unit 区块")
        end = len(lines)
        for i in range(start, len(lines)):
            if VOCAB_END_RE.match(lines[i].strip()):
                end = i
                break
        entries = parse_vocab_lines(lines[start:end])
    else:
        text = src_path.read_text(encoding="utf-8", errors="replace")
        entries = parse_vocab_lines(text.splitlines())

    if not entries:
        raise SystemExit(f"{src_path.name} 词汇表解析为空")

    # 按单元分组
    units: list[dict] = []
    cur: dict | None = None
    for e in entries:
        if cur is None or e["unit"] != cur["unit"]:
            cur = {"unit": e["unit"], "words": []}
            units.append(cur)
        cur["words"].append({"word": e["word"], "cn": e["cn"]})
    # 单元序号保序排序
    units.sort(key=lambda u: u["unit"])
    return {"grade": grade, "term": term, "book": f"英语（PEP）{grade}{term}", "units": units}


def parse_all_books(vocab_dir: Path) -> tuple[list[dict], int]:
    """遍历 VOCAB_BOOKS 解析 11 册，返回 (books, total_words)。"""
    books: list[dict] = []
    total_words = 0
    for grade, term, pattern, from_full in VOCAB_BOOKS:
        book = load_vocab_book(vocab_dir, grade, term, pattern, from_full)
        n = sum(len(u["words"]) for u in book["units"])
        total_words += n
        books.append(book)
    return books, total_words


def build_app_data(app_name: str, version: str, series: str, tool: str,
                   unit_index: int, books: list[dict]) -> dict:
    """组装 window.APP_DATA 结构（与打字背单词/单词闪卡前端约定一致）。"""
    return {
        "meta": {
            "name": app_name,
            "version": version,
            "series": series,
            "tool": tool,
            "book": "人教版（PEP）小学英语 1-6 年级",
            "bookid": "",
            "bookid_3rd": "",
            "unit_index": unit_index,
        },
        "books": books,
    }


def filter_books(books: list[dict], grade: str | None = None, term: str | None = None,
                 unit: int | None = None) -> list[dict]:
    """按年级/册次/单元过滤词库，返回过滤后的 books（每册重建 units）。

    - grade：如 "四年级"（缺省全部）
    - term ：如 "上册" / "下册"（缺省全部）
    - unit ：单元号，如 3（缺省全部单元）
    过滤后某册若无可匹配单元（或年级/册次不匹配）则整册剔除。
    """
    out: list[dict] = []
    for b in books:
        if grade and b["grade"] != grade:
            continue
        if term and b["term"] != term:
            continue
        units = b["units"]
        if unit is not None:
            units = [u for u in units if u["unit"] == unit]
            if not units:
                continue
        out.append({"grade": b["grade"], "term": b["term"], "book": b["book"],
                    "units": units})
    return out


def write_data_js(app_data: dict, out_dir: Path) -> int:
    """写 data.js（window.APP_DATA = ...）到 out_dir，返回字节数。"""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    js = "window.APP_DATA = " + json.dumps(app_data, ensure_ascii=False, indent=1) + ";\n"
    (out_dir / "data.js").write_text(js, encoding="utf-8")
    return len(js.encode("utf-8"))


def write_vocab_json(books: list[dict], total_words: int, out_file: Path,
                     generated_at: str | None = None) -> int:
    """写规范化词库 JSON（/PEP词库/data/vocab/pep_vocab.json），返回字节数。

    公共素材格式（schema v1，独立于任何工具的 app_data）：
    {schema, book, book_count, word_count, generated_at, books:[...]}
    """
    doc = {
        "schema": "pep-vocab@1",
        "book": "人教版（PEP）小学英语 1-6 年级",
        "book_count": len(books),
        "word_count": total_words,
        "generated_at": generated_at or date.today().isoformat(),
        "books": books,
    }
    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    return len(json.dumps(doc, ensure_ascii=False, indent=1).encode("utf-8"))


# ---------------------------------------------------------------
# 独立 CLI：Python-3 脚本用（无第三方依赖）
# ---------------------------------------------------------------
def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="PEP 11 册词汇表解析 → data.js / pep_vocab.json")
    ap.add_argument("--vocab-dir", required=True,
                    help=r"PEP 教材素材根目录，如 F:\_教材素材\人教版（PEP）（主编：吴欣）")
    ap.add_argument("--out-js", default=None, help="输出 data.js 目录（缺省不写）")
    ap.add_argument("--out-json", default=None, help="输出规范化词库 JSON 路径（缺省不写）")
    ap.add_argument("--grade", default=None, help="按年级过滤，如 四年级（缺省全部）")
    ap.add_argument("--term", default=None, help="按册次过滤，如 上册/下册（缺省全部）")
    ap.add_argument("--unit", type=int, default=None,
                    help="按单元号过滤，如 3（缺省全部单元；仅输出该单元词）")
    ap.add_argument("--app-name", default="打字背单词")
    ap.add_argument("--version", default="1.0")
    ap.add_argument("--series", default="学科")
    ap.add_argument("--tool", default="打字背单词")
    ap.add_argument("--unit-index", type=int, default=0)
    args = ap.parse_args(argv)

    vocab_dir = Path(args.vocab_dir)
    if not vocab_dir.exists():
        print(f"ERROR: vocab-dir 不存在: {vocab_dir}", file=sys.stderr)
        return 2

    books, total_words = parse_all_books(vocab_dir)
    filters = []
    if args.grade:
        filters.append(f"年级={args.grade}")
    if args.term:
        filters.append(f"册次={args.term}")
    if args.unit is not None:
        filters.append(f"单元={args.unit}")
    if filters:
        books = filter_books(books, args.grade, args.term, args.unit)
        total_words = sum(len(u["words"]) for b in books for u in b["units"])
        if not books:
            print(f"ERROR: 过滤结果为空（{'，'.join(filters)}），请检查参数", file=sys.stderr)
            return 2
        print(f"按 {'、'.join(filters)} 过滤后：{len(books)} 册 / {total_words} 词")
    else:
        print(f"解析完成：{len(books)} 册 / {total_words} 词")
    for b in books:
        n = sum(len(u["words"]) for u in b["units"])
        print(f"  {b['grade']}{b['term']}: {len(b['units'])} 单元 / {n} 词")

    if args.out_js:
        app_data = build_app_data(args.app_name, args.version, args.series,
                                  args.tool, args.unit_index, books)
        size = write_data_js(app_data, Path(args.out_js))
        print(f"data.js 写入：{Path(args.out_js) / 'data.js'}（{size / 1024:.0f} KB）")
    if args.out_json:
        size = write_vocab_json(books, total_words, Path(args.out_json))
        print(f"词库 JSON 写入：{Path(args.out_json)}（{size / 1024:.0f} KB）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())