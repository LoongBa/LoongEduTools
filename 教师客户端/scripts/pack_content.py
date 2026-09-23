#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pack_content.py — 内容包打包脚本（D04 / S01 Schema v1.0）

把仓库既有产物（RedTools 教材点读 zip / 目录 / 数据源）打包为符合 S01 Schema 的
加密内容包 zip（manifest.json 签名 + package.json 预检 + data/ AES-256-GCM 加密）。

用法:
  python pack_content.py --source <输入zip或目录> --package-id pep-reader \
      --version 1.3.3 --type app --name "教材点读" --out <输出目录>

P0 说明:
  - 加密: 逐文件 AES-256-GCM（16B IV 前置，iv|ct|tag），HKDF-SHA256 派生密钥
  - 签名: ed25519 自签（开发密钥，P1 换服务端真实签名）
  - 密钥派生 IKM: P0 用开发期口令（DEV_PASSPHRASE），P1 换课堂口令
"""
import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
import zipfile
from datetime import date
from pathlib import Path

try:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
except ImportError:
    print("[ERR] 需安装 cryptography: python -m pip install cryptography", file=sys.stderr)
    sys.exit(2)

SCHEMA_VERSION = "1.0"
SHELL_VERSION = "0.1.0"          # min_shell_version 默认
DEV_PASSPHRASE = b"loongedu-dev-passphrase-v1"  # P0 开发期口令（P1 换课堂口令）
SIGN_KEY_ID = "dev-sign-2026"
DEV_KEY_PATH = Path(__file__).parent / "keys" / "dev-sign.key"


# ------------------------------------------------------------------ 密钥/加密
def derive_key(package_id: str, version: str, passphrase: bytes) -> bytes:
    """HKDF-SHA256 → 32B 内容包密钥（salt = id+version, info = content-pack-v1）"""
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=f"{package_id}+{version}".encode("utf-8"),
        info=b"content-pack-v1",
    )
    return hkdf.derive(passphrase)


def encrypt_bytes(data: bytes, key: bytes) -> bytes:
    """AES-256-GCM：返回 iv(16) | ciphertext | tag"""
    iv = os.urandom(16)
    ct = AESGCM(key).encrypt(iv, data, None)
    return iv + ct


def load_or_create_dev_key() -> Ed25519PrivateKey:
    """加载/生成开发签名密钥（不入库；P0 自签用）"""
    if DEV_KEY_PATH.exists():
        return serialization.load_pem_private_key(DEV_KEY_PATH.read_bytes(), password=None)
    DEV_KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
    key = Ed25519PrivateKey.generate()
    DEV_KEY_PATH.write_bytes(
        key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    return key


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
    out: dict[str, bytes] = {}
    for rel, data in files.items():
        # 去掉可能的顶层目录包裹，保持 index.html 在 app 根
        out[f"app/{rel}"] = data
    return out


def normalize_data(files: dict[str, bytes]) -> dict[str, bytes]:
    """data 型：规整到 data/data/ 下"""
    return {f"data/{rel}": d for rel, d in files.items()}


# ------------------------------------------------------------------ 打包
def build_package(args) -> Path:
    source = Path(args.source).resolve()
    files = collect_source(source)

    payload = normalize_app(files) if args.type == "app" else normalize_data(files)

    # 定位入口（app 型校验 index.html）
    if args.type == "app" and "app/index.html" not in payload:
        raise SystemExit("[ERR] app 型内容包必须在 data/app/index.html 提供入口")

    key = None if args.plain else derive_key(args.package_id, args.version, DEV_PASSPHRASE)

    # ---- 构建 data/（plain=明文；默认 AES-256-GCM 逐文件加密）----
    file_index = []
    stored_blobs: dict[str, bytes] = {}
    total_size = 0
    for rel, raw in sorted(payload.items()):
        sha = hashlib.sha256(raw).hexdigest()
        file_index.append({"path": rel, "sha256": sha})
        total_size += len(raw)
        stored_blobs[rel] = raw if args.plain else encrypt_bytes(raw, key)

    package_json = {
        "package_id": args.package_id,
        "package_version": args.version,
        "file_count": len(file_index),
        "total_size": total_size,
        "encrypted": not args.plain,
        "enc_alg": "none" if args.plain else "AES-256-GCM",
        "file_index": file_index,
    }
    pkg_json_bytes = json.dumps(package_json, ensure_ascii=False, indent=2).encode("utf-8")

    # ---- manifest.json（签名前）----
    data_hash = hashlib.sha256(
        b"".join(stored_blobs[r] for r in sorted(stored_blobs))
    ).hexdigest()

    manifest = {
        "schema_version": SCHEMA_VERSION,
        "package_id": args.package_id,
        "package_type": args.type,
        "name": args.name,
        "display_name": args.display_name or args.name,
        "icon": args.icon,
        "package_version": args.version,
        "content_hash": f"sha256:{data_hash}",
        "size_bytes": total_size,
        "min_shell_version": args.min_shell,
        "required_license_level": args.level,
        "categories": args.categories.split(",") if args.categories else [],
        "description": args.description or "",
        "release_date": date.today().isoformat(),
        "author": "LoongBa",
        "download_url": f"/api/edu/packages/{args.package_id}/{args.version}",
        "checksum": "",  # zip 本体 hash，最后回填
        "min_free_version": None,
    }

    # ---- 签名（ed25519；签名覆盖除 signature/checksum 外的全部字段——
    #      checksum 依赖 zip 本体 hash，存在循环依赖，不入签名）----
    key_priv = load_or_create_dev_key()
    sign_view = {k: v for k, v in manifest.items() if k not in ("signature", "checksum")}
    canon = json.dumps(sign_view, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    sig = key_priv.sign(canon)
    manifest["signature"] = {
        "alg": "ed25519",
        "key_id": SIGN_KEY_ID,
        "nonce": hashlib.sha256(os.urandom(16)).hexdigest()[:16],
        "signed_payload_hash": "sha256:" + hashlib.sha256(canon).hexdigest(),
        "sig": sig.hex(),
    }
    manifest_bytes = json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")

    # ---- 输出：解包目录（--dir-out，预装用）或 zip（默认）----
    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.dir_out:
        pkg_dir = out_dir / args.package_id
        if pkg_dir.exists():
            shutil.rmtree(pkg_dir)
        pkg_dir.mkdir(parents=True)
        for rel, blob in sorted(stored_blobs.items()):
            # rel 相对 data/ 区（如 app/index.html）→ 落盘为 <pkg>/data/<rel>，对齐 zip 模式
            target = pkg_dir / "data" / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(blob)
        (pkg_dir / "package.json").write_bytes(pkg_json_bytes)
        digest = hashlib.sha256()
        for rel in sorted(stored_blobs):
            digest.update(rel.encode("utf-8"))
            digest.update(stored_blobs[rel])
        manifest["checksum"] = "sha256:" + digest.hexdigest()
        (pkg_dir / "manifest.json").write_bytes(
            json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")
        )
        print(f"[OK] 内容包目录: {pkg_dir}")
        print(f"     files={len(file_index)} size={total_size} bytes plain={args.plain}")
        return pkg_dir

    zip_path = out_dir / f"content-pack-{args.package_id}-{args.version}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", manifest_bytes)
        zf.writestr("package.json", pkg_json_bytes)
        for rel, blob in sorted(stored_blobs.items()):
            zf.writestr(f"data/{rel}", blob)

    # ---- 回填 checksum（zip 本体 hash），写旁路 meta（不改 zip 避免破坏 hash）----
    zip_sha = hashlib.sha256(zip_path.read_bytes()).hexdigest()
    manifest["checksum"] = f"sha256:{zip_sha}"
    (out_dir / f"content-pack-{args.package_id}-{args.version}.meta.json").write_bytes(
        json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")
    )

    print(f"[OK] 内容包: {zip_path}")
    print(f"     files={len(file_index)} size={total_size} bytes sha256={zip_sha[:16]}...")
    return zip_path


def main():
    ap = argparse.ArgumentParser(description="内容包打包（S01 Schema v1.0）")
    ap.add_argument("--source", required=True, help="输入源（zip 或目录）")
    ap.add_argument("--package-id", required=True)
    ap.add_argument("--version", required=True)
    ap.add_argument("--type", choices=["app", "data"], default="app")
    ap.add_argument("--name", required=True)
    ap.add_argument("--display-name", default="")
    ap.add_argument("--icon", default=None)
    ap.add_argument("--min-shell", default=SHELL_VERSION)
    ap.add_argument("--level", type=int, default=1, help="required_license_level")
    ap.add_argument("--categories", default="")
    ap.add_argument("--description", default="")
    ap.add_argument("--plain", action="store_true", help="P0 明文模式（不加密，壳 P0 直读）")
    ap.add_argument("--dir-out", action="store_true", help="输出解包目录（预装 packages-embedded 用）而非 zip")
    ap.add_argument("--out", default="./dist")
    args = ap.parse_args()
    build_package(args)


if __name__ == "__main__":
    main()