# -*- coding: utf-8 -*-
"""gen_manifest.py — manifest.json 生成 + ed25519 签名（D04 §3.1 ③ · S01 §2.2）

签名覆盖除 signature/checksum 外的全部字段（checksum 依赖 zip 本体 hash，
存在循环依赖，不入签名 — 与 pack_content.py P0 行为一致）。
"""
from __future__ import annotations

import hashlib
import json
import os
from datetime import date
from typing import Any

from crypto_out import SIGN_KEY_ID, load_or_create_dev_key

SCHEMA_VERSION = "1.0"


def build_manifest(
    *,
    package_id: str,
    package_type: str,
    name: str,
    display_name: str,
    icon: str | None,
    version: str,
    data_hash_hex: str,
    total_size: int,
    min_shell: str,
    required_license_level: int,
    categories: list[str],
    description: str,
    download_url: str,
    author: str = "LoongBa",
) -> dict[str, Any]:
    """构造未签名 manifest（S01 §2.2 字段全集）"""
    return {
        "schema_version": SCHEMA_VERSION,
        "package_id": package_id,
        "package_type": package_type,
        "name": name,
        "display_name": display_name or name,
        "icon": icon,
        "package_version": version,
        "content_hash": f"sha256:{data_hash_hex}",
        "size_bytes": total_size,
        "min_shell_version": min_shell,
        "required_license_level": required_license_level,
        "categories": categories,
        "description": description,
        "release_date": date.today().isoformat(),
        "author": author,
        "download_url": download_url,
        "checksum": "",
        "min_free_version": None,
    }


def sign_manifest(manifest: dict[str, Any], key_id: str = SIGN_KEY_ID) -> dict[str, Any]:
    """ed25519 签名，写入 manifest["signature"]；原地修改并返回"""
    sign_view = {k: v for k, v in manifest.items() if k not in ("signature", "checksum")}
    canon = json.dumps(sign_view, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode(
        "utf-8"
    )
    key = load_or_create_dev_key()
    sig = key.sign(canon)
    manifest["signature"] = {
        "alg": "ed25519",
        "key_id": key_id,
        "nonce": hashlib.sha256(os.urandom(16)).hexdigest()[:16],
        "signed_payload_hash": "sha256:" + hashlib.sha256(canon).hexdigest(),
        "sig": sig.hex(),
    }
    return manifest


def dumps(manifest: dict[str, Any]) -> bytes:
    return json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")
