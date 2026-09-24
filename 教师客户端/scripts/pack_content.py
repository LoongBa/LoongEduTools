#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pack_content.py — 内容包打包脚本（D04 / S01 Schema v1.0）

把仓库既有产物（RedTools 教材点读 zip / 目录 / 数据源）打包为符合 S01 Schema 的
加密内容包 zip（manifest.json 签名 + package.json 预检 + data/ AES-256-GCM 加密）。

用法:
  python pack_content.py --source <输入zip或目录> --package-id pep-reader \
      --version 1.3.3 --type app --name "教材点读" --out <输出目录>

说明（P2 重构为薄入口，逻辑在同目录模块）：
  - crypto_out.py / gen_manifest.py / gen_package_json.py = 加密·签名·清单
  - pack_app.py / pack_data.py = 按类型入口（本文件保留全参数 CLI）
  - verify_pack.py = QA（D04 §5）；publish_pack.py = 发布（D04 §6）
  - 加密: 逐文件 AES-256-GCM（16B IV 前置），HKDF-SHA256（S01 §2.5）
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import zipfile
from pathlib import Path

# 同目录模块
sys.path.insert(0, str(Path(__file__).parent))

try:
    from crypto_out import DEV_PASSPHRASE, derive_key, encrypt_bytes, load_or_create_dev_key
    from gen_manifest import SCHEMA_VERSION, build_manifest, dumps as manifest_dumps, sign_manifest
    from gen_package_json import build_file_index, build_package_json, dumps as pkg_dumps
except ImportError:
    print("[ERR] 需安装 cryptography: python -m pip install cryptography", file=sys.stderr)
    sys.exit(2)

SHELL_VERSION = "0.1.0"  # min_shell_version 默认
# 保持向后兼容的常量（旧代码/文档可能 import）
SIGN_KEY_ID = "dev-sign-2026"
DEV_KEY_PATH = Path(__file__).parent / "keys" / "dev-sign.key"


# ------------------------------------------------------------------ 输入收集
def collect_source(source: Path) -> dict[str, bytes]:
    """收集输入源为 {相对路径: 字节}。支持 zip 或目录。"""
    files: dict[str, bytes] = {}
    if source.is_file() and source.suffix.lower() == ".zip":
        with zipfile.ZipFile(source) as zf:
            for info in zf.infolist():
                if info.is_dir():
                    continue
                name = info.filename.replace("\\", "/")
                files[name] = zf.read(info)
    elif source.is_dir():
        for p in source.rglob("*"):
            if p.is_file():
                rel = p.relative_to(source).as_posix()
                files[rel] = p.read_bytes()
    else:
        raise SystemExit(f"[ERR] 输入源不存在或类型不支持: {source}")
    return files


def normalize_app(files: dict[str, bytes]) -> dict[str, bytes]:
    """app 型：规整到 data/app/ 下（保留相对路径）"""
    return {f"app/{rel}": data for rel, data in files.items()}


def normalize_data(files: dict[str, bytes]) -> dict[str, bytes]:
    """data 型：规整到 data/data/ 下"""
    return {f"data/{rel}": d for rel, d in files.items()}


# ------------------------------------------------------------------ 打包
def build_package(args: argparse.Namespace) -> Path:
    source = Path(args.source).resolve()
    files = collect_source(source)

    payload = normalize_app(files) if args.type == "app" else normalize_data(files)

    if args.type == "app" and "app/index.html" not in payload:
        raise SystemExit("[ERR] app 型内容包必须在 data/app/index.html 提供入口")

    key = None if args.plain else derive_key(args.package_id, args.version, DEV_PASSPHRASE)

    # 明文 file_index + 总大小（package.json 用明文 hash）
    file_index, total_size = build_file_index(payload)

    # data/ 存储 blob（加密或明文）
    stored_blobs: dict[str, bytes] = {}
    for rel, raw in sorted(payload.items()):
        stored_blobs[rel] = raw if args.plain else encrypt_bytes(raw, key)  # type: ignore[arg-type]

    package_json = build_package_json(
        args.package_id, args.version, file_index, total_size, encrypted=not args.plain
    )
    pkg_json_bytes = pkg_dumps(package_json)

    # content_hash = data/ 存储区整体 SHA-256（S01 §2.2 — 按存储序）
    data_hash = hashlib.sha256(
        b"".join(stored_blobs[r] for r in sorted(stored_blobs))
    ).hexdigest()

    manifest = build_manifest(
        package_id=args.package_id,
        package_type=args.type,
        name=args.name,
        display_name=args.display_name or args.name,
        icon=args.icon,
        version=args.version,
        data_hash_hex=data_hash,
        total_size=total_size,
        min_shell=args.min_shell,
        required_license_level=args.level,
        categories=args.categories.split(",") if args.categories else [],
        description=args.description or "",
        download_url=f"/api/edu/packages/{args.package_id}/{args.version}",
    )
    sign_manifest(manifest)
    manifest_bytes = manifest_dumps(manifest)

    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.dir_out:
        pkg_dir = out_dir / args.package_id
        if pkg_dir.exists():
            shutil.rmtree(pkg_dir)
        pkg_dir.mkdir(parents=True)
        for rel, blob in sorted(stored_blobs.items()):
            target = pkg_dir / "data" / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(blob)
        (pkg_dir / "package.json").write_bytes(pkg_json_bytes)
        digest = hashlib.sha256()
        for rel in sorted(stored_blobs):
            digest.update(rel.encode("utf-8"))
            digest.update(stored_blobs[rel])
        manifest["checksum"] = "sha256:" + digest.hexdigest()
        (pkg_dir / "manifest.json").write_bytes(manifest_dumps(manifest))
        print(f"[OK] 内容包目录: {pkg_dir}")
        print(f"     files={len(file_index)} size={total_size} bytes plain={args.plain}")
        return pkg_dir

    zip_path = out_dir / f"content-pack-{args.package_id}-{args.version}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", manifest_bytes)
        zf.writestr("package.json", pkg_json_bytes)
        for rel, blob in sorted(stored_blobs.items()):
            zf.writestr(f"data/{rel}", blob)

    zip_sha = hashlib.sha256(zip_path.read_bytes()).hexdigest()
    manifest["checksum"] = f"sha256:{zip_sha}"
    (out_dir / f"content-pack-{args.package_id}-{args.version}.meta.json").write_bytes(
        manifest_dumps(manifest)
    )

    # registry.json 版本记录（verify_pack §7）
    reg_path = out_dir / "registry.json"
    entries = []
    if reg_path.is_file():
        try:
            reg = json.loads(reg_path.read_text(encoding="utf-8"))
            entries = reg if isinstance(reg, list) else reg.get("entries", [])
        except Exception:  # noqa: BLE001
            entries = []
    entries = [
        e
        for e in entries
        if not (e.get("package_id") == args.package_id and e.get("version") == args.version)
    ]
    entries.append({"package_id": args.package_id, "version": args.version, "sha256": zip_sha})
    reg_path.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[OK] 内容包: {zip_path}")
    print(f"     files={len(file_index)} size={total_size} bytes sha256={zip_sha[:16]}...")
    return zip_path


def make_parser(default_type: str = "app") -> argparse.ArgumentParser:
    """共享 CLI（pack_app/pack_data 薄封装也用）"""
    ap = argparse.ArgumentParser(description="内容包打包（S01 Schema v1.0）")
    ap.add_argument("--source", required=True, help="输入源（zip 或目录）")
    ap.add_argument("--package-id", required=True)
    ap.add_argument("--version", required=True)
    ap.add_argument("--type", choices=["app", "data"], default=default_type)
    ap.add_argument("--name", required=True)
    ap.add_argument("--display-name", default="")
    ap.add_argument("--icon", default=None)
    ap.add_argument("--min-shell", default=SHELL_VERSION)
    ap.add_argument("--level", type=int, default=1, help="required_license_level")
    ap.add_argument("--categories", default="")
    ap.add_argument("--description", default="")
    ap.add_argument("--plain", action="store_true", help="P0 明文模式（不加密，壳 P0 直读）")
    ap.add_argument(
        "--dir-out",
        action="store_true",
        help="输出解包目录（预装 packages-embedded 用）而非 zip",
    )
    ap.add_argument("--out", default="./dist")
    return ap


def build_package_from_ns(args: argparse.Namespace) -> Path:
    return build_package(args)


def main() -> None:
    ap = make_parser()
    args = ap.parse_args()
    build_package(args)


if __name__ == "__main__":
    main()
