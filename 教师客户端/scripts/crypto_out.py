# -*- coding: utf-8 -*-
"""crypto_out.py — 加密/签名模块（D04 §3.1 ② · S01 §2.5）

AES-256-GCM 逐文件加密（iv|ct|tag）+ HKDF-SHA256 密钥派生 + ed25519 开发签名。
从 pack_content.py 抽出，保持与 P0 打包产物 100% 兼容。
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

# P0 开发期口令（与 pack_content.py 历史值一致，换钥需同步壳端）
DEV_PASSPHRASE = b"loongedu-dev-passphrase-v1"
SIGN_KEY_ID = "dev-sign-2026"
DEV_KEY_PATH = Path(__file__).parent / "keys" / "dev-sign.key"


def derive_key(package_id: str, version: str, passphrase: bytes) -> bytes:
    """HKDF-SHA256 → 32B 内容包密钥（salt = id+version, info = content-pack-v1 · S01 §2.5）"""
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=f"{package_id}+{version}".encode("utf-8"),
        info=b"content-pack-v1",
    )
    return hkdf.derive(passphrase)


def encrypt_bytes(data: bytes, key: bytes) -> bytes:
    """AES-256-GCM：返回 iv(16) | ciphertext | tag（tag 并入 ct 尾部，AESGCM 默认行为）"""
    iv = os.urandom(16)
    ct = AESGCM(key).encrypt(iv, data, None)
    return iv + ct


def decrypt_bytes(blob: bytes, key: bytes) -> bytes:
    """解密 encrypt_bytes 产物；用于 verify_pack 抽样冒烟"""
    if len(blob) < 16 + 16:
        raise ValueError("密文过短")
    iv, ct = blob[:16], blob[16:]
    return AESGCM(key).decrypt(iv, ct, None)


def load_or_create_dev_key() -> Ed25519PrivateKey:
    """加载/生成开发签名密钥（keys/dev-sign.key，gitignored · D04 §3.4）"""
    if DEV_KEY_PATH.exists():
        return serialization.load_pem_private_key(  # type: ignore[return-value]
            DEV_KEY_PATH.read_bytes(), password=None
        )
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


def load_dev_public_bytes() -> bytes:
    """开发公钥 raw 32B（verify_pack 校验用）；不存在则先生成"""
    priv = load_or_create_dev_key()
    pub = priv.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    return pub
