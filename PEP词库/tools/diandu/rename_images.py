# -*- coding: utf-8 -*-
"""
重命名教材图片：diandu 命名 → Page_NNN.png（统一按页码，与页音频 P{NNN}.mp3 对齐）

用法:
  python rename_images.py <素材根目录> [--dry-run] [--delete-old]

规则:
  - '英语（PEP）_*_NN.png' / '英语（PEP）_*_NN.png'（diandu 下载命名）→ 'Page_NNN.png'
  - 旧 PDF 提取命名（如 '2024年度：...' / '义务教育教科书·...'）可选删除（--delete-old），
    因为它们页码与 diandu 不一致（PDF 页码 = 页音频+5），与新模板冲突
  - 其余不匹配的文件保留不动
"""
import argparse
import re
import sys
from pathlib import Path

# diandu 命名: 英语（PEP）_三年级_下册_02.png 或 英语（PEP）_四年级_上册_08.png
_DIANDU_RE = re.compile(r"^英语（PEP）_.*?_(\d{1,3})\.png$")
# 旧 PDF 命名（页码与 diandu 不一致，应删除）
_OLD_PDF_RE = re.compile(r"^(2024年度：义务教育教科书·英语|义务教育教科书·英语).*?_(\d{1,3})\.png$")
# 目标命名（幂等，已改名的不再处理）
_PAGE_RE = re.compile(r"^Page_\d{3}\.png$")


def process(img_dir: Path, dry_run: bool, delete_old: bool):
    if not img_dir.is_dir():
        return 0, 0, 0
    renamed = deleted = kept = 0
    for f in sorted(img_dir.iterdir()):
        if not f.is_file() or f.suffix.lower() != ".png":
            kept += 1
            continue
        m = _DIANDU_RE.match(f.name)
        if m:
            new_name = f"Page_{int(m.group(1)):03d}.png"
            target = img_dir / new_name
            if target.exists() and target != f:
                # Page_NNN.png 已存在（同一图重复下载）→ 删除旧命名，保留 Page_NNN
                if dry_run:
                    print(f"  [去重] {f.name} → 删除（{new_name} 已存在）")
                else:
                    f.unlink()
                deleted += 1
                continue
            if dry_run:
                print(f"  [改名] {f.name} → {new_name}")
            else:
                f.rename(target)
            renamed += 1
            continue
        if delete_old and _OLD_PDF_RE.match(f.name):
            if dry_run:
                print(f"  [删除] {f.name}")
            else:
                f.unlink()
            deleted += 1
            continue
        if _PAGE_RE.match(f.name):
            kept += 1  # 已是 Page_NNN，幂等跳过
            continue
        kept += 1
    return renamed, deleted, kept


def main():
    ap = argparse.ArgumentParser(description="重命名教材图片为 Page_NNN.png")
    ap.add_argument("root", help="素材根目录（含 一年级/二年级/.../六年级 子目录）")
    ap.add_argument("--dry-run", action="store_true", help="只预览，不实际改名/删除")
    ap.add_argument("--delete-old", action="store_true",
                    help="同时删除旧 PDF 提取图片（页码与 diandu 不一致）")
    args = ap.parse_args()

    root = Path(args.root)
    total_r = total_d = total_k = 0
    for img_dir in sorted(root.glob("*/**/_图片素材")):
        print(f"=== {img_dir} ===")
        r, d, k = process(img_dir, args.dry_run, args.delete_old)
        total_r += r; total_d += d; total_k += k
        print(f"  改名 {r}，删除 {d}，保留 {k}")

    mode = "（预览）" if args.dry_run else ""
    print(f"\n合计{mode}: 改名 {total_r}，删除 {total_d}，保留 {total_k}")


if __name__ == "__main__":
    sys.exit(main())
