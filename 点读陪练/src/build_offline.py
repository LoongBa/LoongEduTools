# -*- coding: utf-8 -*-
"""
V0.2-B 离线包构建+拆分脚本（小红书兼容）
- 前置：WebH5 已 pnpm build（dist/ 已含 shell + public 素材）
- 作用：从 dist/ 按单元拆分出离线包目录，每个单元独立 ≤10MB
- 输出：点读陪练/build/offline/离线包根/
    ├── index.html          壳入口
    ├── assets/             JS/CSS（shell）
    ├── ip/webp/            IP 头像 webp
    └── units/<机读名>/     每单元独立 audio/ + images/
          （机读名与 WebH5 JS 引用一致，如 u01；中文展示名用于 zip 命名）

用法：python build_offline.py <webh5_dist> [<out_dir>]
  <webh5_dist>  WebH5 的 dist 目录（pnpm build 产物）
  <out_dir>     输出根目录（默认 点读陪练/build/offline）
"""
import json, sys, os, shutil, re, argparse
from pathlib import Path

# 小红书单文件上限（字节）
MAX_FILE = 10 * 1024 * 1024


def find_unit_dirs(dist: Path) -> list[Path]:
    """dist/units/ 下的单元素材目录（含 audio/ 的目录）"""
    units_root = dist / "units"
    if not units_root.is_dir():
        return []
    return [d for d in units_root.iterdir() if d.is_dir() and (d / "audio").is_dir()]


def check_file_sizes(root: Path) -> list[str]:
    """递归检查单文件大小，返回超限清单"""
    over = []
    for p in root.rglob("*"):
        if p.is_file() and p.stat().st_size > MAX_FILE:
            over.append(f"{p.relative_to(root)}  {p.stat().st_size//1024//1024}MB")
    return over


def main(webh5_dist: str, out_dir: str):
    dist = Path(webh5_dist)
    if not (dist / "index.html").exists():
        print(f'❌ 不是有效 dist: {webh5_dist}（缺 index.html，先 pnpm build）')
        sys.exit(1)

    out = Path(out_dir)
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    # 1. 壳：index.html + assets/
    shutil.copy2(dist / "index.html", out / "index.html")
    shutil.copytree(dist / "assets", out / "assets")

    # 2. IP 头像 webp（代码已全量引用 /ip/webp/*.webp，PNG 原图不打包）
    ip_webp = dist / "ip" / "webp"
    if ip_webp.is_dir():
        dst_ip = out / "ip" / "webp"
        dst_ip.mkdir(parents=True)
        for f in ip_webp.glob("*.webp"):
            shutil.copy2(f, dst_ip / f.name)

    # 3. 按单元拆分素材
    units = find_unit_dirs(dist)
    if not units:
        print("⚠️  dist/units/ 无单元素材（本次只有 shell，未发内容）")
    unit_info = []
    for ud in units:
        # 单元目录名 = WebH5 JS 引用的机读名（如 u01），不重命名
        label = ud.name
        dst = out / "units" / label
        for sub in ("audio", "images"):
            s = ud / sub
            if s.is_dir():
                shutil.copytree(s, dst / sub)
        size = sum(p.stat().st_size for p in dst.rglob("*") if p.is_file())
        unit_info.append((label, size, (dst / "audio").is_dir()))
        print(f'  📦 units/{label}  {size/1024/1024:.2f}MB  audio={(dst/"audio").is_dir()}')

    # 4. 合规检查
    print("\n=== 合规检查（单文件 ≤10MB）===")
    over = check_file_sizes(out)
    if over:
        print("❌ 超限文件：")
        for o in over:
            print(f"   {o}")
        sys.exit(2)
    # 单元级检查
    bad_units = [u for u in unit_info if u[1] > MAX_FILE]
    if bad_units:
        print(f'❌ 超 10MB 单元: {[(u[0], f"{u[1]//1024//1024}MB") for u in bad_units]}')
        sys.exit(2)

    total = sum(p.stat().st_size for p in out.rglob("*") if p.is_file())
    nfiles = sum(1 for p in out.rglob("*") if p.is_file())
    print(f"✅ 全部通过：单文件均 ≤10MB")
    print(f"   包总大小 {total/1024/1024:.2f}MB / {nfiles} 文件")
    print(f"   输出: {out}")
    return 0


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='离线包拆分（小红书 ≤10MB）')
    ap.add_argument('webh5_dist', help='WebH5 dist 目录')
    ap.add_argument('out_dir', nargs='?', default=r'F:\LoongBa_Git\LoongEduTools\点读陪练\build\offline',
                    help='输出目录')
    args = ap.parse_args()
    sys.exit(main(args.webh5_dist, args.out_dir))