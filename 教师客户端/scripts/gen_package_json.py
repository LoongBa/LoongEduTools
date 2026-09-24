# -*- coding: utf-8 -*-
"""gen_package_json.py — package.json 预检清单生成（D04 §3.1 ④ · S01 §2.3）

未加密清单：file_index（相对路径 + 明文 SHA-256），供 U 盘导入预检与解密后比对。
"""
from __future__ import annotations

import hashlib
import json
from typing import Iterable


def build_file_index(payload: dict[str, bytes]) -> tuple[list[dict], int]:
    """payload = {明文相对路径: 字节} → (file_index, total_size)"""
    file_index: list[dict] = []
    total_size = 0
    for rel in sorted(payload):
        raw = payload[rel]
        file_index.append({"path": rel, "sha256": hashlib.sha256(raw).hexdigest()})
        total_size += len(raw)
    return file_index, total_size


def build_package_json(
    package_id: str,
    version: str,
    file_index: Iterable[dict],
    total_size: int,
    encrypted: bool,
) -> dict:
    idx = list(file_index)
    return {
        "package_id": package_id,
        "package_version": version,
        "file_count": len(idx),
        "total_size": total_size,
        "encrypted": encrypted,
        "enc_alg": "AES-256-GCM" if encrypted else "none",
        "file_index": idx,
    }


def dumps(pkg: dict) -> bytes:
    return json.dumps(pkg, ensure_ascii=False, indent=2).encode("utf-8")
