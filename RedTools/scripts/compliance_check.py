#!/usr/bin/env python3
"""合规自查脚本：CLI python compliance_check.py <dir|zip>

规则源（注释引用，不运行时解析）：
- `.skill/minitool-zip-builder/references/zip-artifact-spec.md`
    §2 扩展名白名单：.html/.css/.js/.png/.jpg/.jpeg/.gif/.webp/.svg/.woff/.woff2/.json
    §3 CSP 禁项：内联 <script>、onclick= 等事件属性、javascript:、eval(/new Function(、
       外部域名引用(http/https url)、iframe/object → ERROR；style= 明确允许（不 flag）
- `RedTools/AGENTS.md` §1 产品红线（离线包合规红线）：排行榜 / 云存档 / 多人互动 / PK / 排名

用法：
    python scripts/compliance_check.py <dir|zip>

输入：
    目录 → rglob 递归（默认忽略 .git 目录）；zip → zipfile 读取
返回码：
    0 = 通过（仅警告） / 1 = 存在 ERROR / 2 = 用法或路径错误
输出行前缀（与 audit_artifact 输出约定一致，便于统一解析）：
    ERROR: / WARN: / PASS: / FAILED:
"""

from __future__ import annotations

import re
import sys
import zipfile
from pathlib import Path

# ---- 规则常量 ----

# 扩展名白名单（zip-artifact-spec.md §2）；zip/目录内其他扩展名（含无扩展名）→ ERROR
ALLOWED_EXTENSIONS = {
    ".html", ".css", ".js", ".png", ".jpg", ".jpeg", ".gif",
    ".webp", ".svg", ".woff", ".woff2", ".json",
}

# CSP 内容扫描只做 .html/.css（Oracle S2：audio/*.js 为多 MB base64（window.AUDIO_DATA[...]）
# 且无内联脚本风险；白名单扩展名检查对所有文件仍做，>TEXT_SCAN_MAX_SIZE 只跳内容扫描）
TEXT_SCAN_SUFFIXES = {".html", ".css"}

# 产品红线禁词扫描 .html/.js（AGENTS.md §1 离线包红线）
REDLINE_SCAN_SUFFIXES = {".html", ".js"}

# >2MiB 跳过内容扫描（仅做扩展名白名单；Oracle S2 性能）
TEXT_SCAN_MAX_SIZE = 2 * 1024 * 1024

# 红线禁词扫描跳过 audio/ 数据目录（base64 音频负载，非 UI/文案文本；
# 校准：base64 中 "PK" 等子串随机命中会淹没真实违规 → 数据文件只做白名单；
# 以路径段判断（../audio/.. 任意层级命中即跳过，兼容 dist/offline/audio/ 布局）
REDLINE_SKIP_SEGMENTS = {"audio"}

# 合规输入本身（zip 载体）不入白名单检查——白名单是检查 zip/目录内产物，非 zip 文件自身
INPUT_DROP_SUFFIXES = {".zip"}

# 产品红线禁词（离线包合规红线；接受注释类 false positive，报告标注 文件:行号 供人工复核）
# PK 用独立词边界匹配（\bPK\b，大小写不敏感）——base64 内嵌子串不命中；
# 其余中文禁词精确子串（中文无词边界，直接 re.escape）
REDLINE_WORDS = ["排行榜", "云存档", "多人互动", "排名"]
REDLINE_PATTERNS = [
    (re.compile(r"\bPK\b", re.IGNORECASE), "PK"),
]

# CSP 禁项（zip-artifact-spec.md §3）：
# 注意：style= 明确允许（spec §3 允许内联样式），不得报违规
# 1) 内联 <script>：标签内无 src= 属性（有 src= 的本地脚本为白名单内资源，允许；
#    外部 http(s) 引用由 RE_EXTERNAL_URL 兜底）
# 2) 事件属性 onclick= / on[a-z]+=
# 3) javascript: 协议
# 4) eval( / new Function(
# 5) 外部域名引用 http(s)://（非本地 relative、非 data:）
# 6) <iframe / <object
RE_INLINE_SCRIPT = re.compile(r"<script\b[^>]*>", re.IGNORECASE)
RE_EVENT_ATTR = re.compile(r"\bon[a-z]+\s*=", re.IGNORECASE)
RE_JAVASCRIPT_URL = re.compile(r"javascript\s*:", re.IGNORECASE)
RE_EVAL = re.compile(r"\beval\s*\(", re.IGNORECASE)
RE_NEW_FUNCTION = re.compile(r"\bnew\s+Function\s*\(", re.IGNORECASE)
RE_EXTERNAL_URL = re.compile(r"https?://")
RE_IFRAME = re.compile(r"<iframe\b", re.IGNORECASE)
RE_OBJECT = re.compile(r"<object\b", re.IGNORECASE)


def line_no(text: str, pos: int) -> int:
    """pos 所在行号（1 起）。"""
    return text.count("\n", 0, pos) + 1


# ---- 注释区间收集（L2：跳过注释内禁词，行号保持） ----
# 区间法（非替换法）：避免 .js 字符串内 "//"（URL）误吞后续代码；
# 只把"命中位置落在注释区间内"的禁词跳过，其余不变。
RE_BLOCK = re.compile(r"/\*.*?\*/", re.S)      # JS 块注释
RE_LINE_C = re.compile(r"//[^\n]*")            # JS 行注释（含 .html 内联 <script>）
RE_HTML_C = re.compile(r"<!--.*?-->", re.S)    # HTML 注释


def comment_ranges(text: str) -> list[tuple[int, int]]:
    """收集三型注释区间 [start, end)，排序。"""
    spans: list[tuple[int, int]] = []
    for pat in (RE_BLOCK, RE_LINE_C, RE_HTML_C):
        spans.extend((m.start(), m.end()) for m in pat.finditer(text))
    spans.sort()
    return spans


def in_comment(spans: list[tuple[int, int]], pos: int) -> bool:
    """pos 是否落在任一注释区间内（spans 已排序）。"""
    for s, e in spans:
        if s <= pos < e:
            return True
        if s > pos:
            break
    return False


def scan_csp(text: str, label: str, errors: list[str]) -> None:
    """CSP 禁项扫描（只扫 .html/.css 文本）。命中 → ERROR（附 文件:行号）。"""
    for m in RE_INLINE_SCRIPT.finditer(text):
        if "src=" not in m.group(0).lower():
            errors.append(f"{label}:{line_no(text, m.start())} CSP 禁项: 内联 <script>（无 src= 属性）")
    for pat, name in (
        (RE_EVENT_ATTR, "事件属性 onclick=/on[a-z]+="),
        (RE_JAVASCRIPT_URL, "javascript: 协议"),
        (RE_EVAL, "eval("),
        (RE_NEW_FUNCTION, "new Function("),
        (RE_EXTERNAL_URL, "外部域名引用 http(s)://"),
        (RE_IFRAME, "<iframe"),
        (RE_OBJECT, "<object"),
    ):
        for m in pat.finditer(text):
            errors.append(f"{label}:{line_no(text, m.start())} CSP 禁项: {name}")


def scan_redline(text: str, label: str, errors: list[str]) -> None:
    """产品红线禁词扫描（.html/.js，audio/ 数据目录跳过在前）。
    注释区间内的禁词跳过（L2：如「无排行榜 UI」注释声明，避免人工复核噪音）；命中 → ERROR（附 文件:行号）。"""
    if REDLINE_SKIP_SEGMENTS & set(label.split("/")):
        return
    spans = comment_ranges(text)
    for w in REDLINE_WORDS:
        for m in re.finditer(re.escape(w), text):
            if in_comment(spans, m.start()):
                continue
            errors.append(f"{label}:{line_no(text, m.start())} 红线禁词: {w}")
    for pat, name in REDLINE_PATTERNS:
        for m in pat.finditer(text):
            if in_comment(spans, m.start()):
                continue
            errors.append(f"{label}:{line_no(text, m.start())} 红线禁词: {name}")


def check_bytes(rel: str, data: bytes, errors: list[str]) -> None:
    """对单个文件执行：扩展名白名单（必做）→ 内容扫描（.html/.css CSP / .html/.js 红线，>2MiB 跳过）。
    输入载体（zip 自身）与目录内 zip 产物跳过白名单（zip 是审计输入，白名单检查 zip 内部内容）。"""
    if Path(rel).suffix.lower() in INPUT_DROP_SUFFIXES:
        return
    ext = Path(rel).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        errors.append(f"{rel} 非白名单扩展名 {ext or '(无扩展名)'}")
        return
    if len(data) > TEXT_SCAN_MAX_SIZE:
        return  # 大文件：仅白名单检查，跳过内容扫描（Oracle S2）
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return  # 二进制文件（png/jpg 等）：仅白名单检查
    if ext in TEXT_SCAN_SUFFIXES:
        scan_csp(text, rel, errors)
    if ext in REDLINE_SCAN_SUFFIXES:
        scan_redline(text, rel, errors)


def check_dir(root: Path, errors: list[str]) -> int:
    """目录输入：rglob 递归，默认忽略 .git 目录。返回文件数。"""
    n = 0
    for p in root.rglob("*"):
        if not p.is_file() or ".git" in p.parts:
            continue
        rel = p.relative_to(root).as_posix()
        n += 1
        check_bytes(rel, p.read_bytes(), errors)
    return n


def check_zip(path: Path, errors: list[str]) -> int:
    """zip 输入：zipfile 读取。返回文件数。"""
    n = 0
    with zipfile.ZipFile(path) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            name = info.filename.replace("\\", "/")
            if "/.git/" in "/" + name or name.startswith(".git/"):
                continue
            n += 1
            check_bytes(name, zf.read(info), errors)
    return n


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else list(argv)
    if len(args) != 1:
        print("FAILED: 用法: python compliance_check.py <dir|zip>")
        return 2
    target = Path(args[0])
    if not target.exists():
        print(f"FAILED: 路径不存在: {target}")
        return 2

    errors: list[str] = []
    if target.is_dir():
        n = check_dir(target, errors)
    elif target.is_file():
        if not zipfile.is_zipfile(target):
            print(f"FAILED: 不是有效 zip: {target}")
            return 2
        n = check_zip(target, errors)
    else:
        print(f"FAILED: 无法识别的路径: {target}")
        return 2

    for e in errors:
        print(f"ERROR: {e}")
    if errors:
        print(f"FAILED: 合规检查未通过：{len(errors)} 项错误（{n} 个文件）")
        return 1
    print(f"PASS: 合规检查通过（{n} 个文件，0 项错误）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
