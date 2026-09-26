# -*- coding: utf-8 -*-
"""gen_shell_config.py — 生成壳配置签名包（决策点4 · 服务端签名配置）

输入：--config <json 文件>（含 api_base 等字段）+ 可选 --key（私钥 PEM，缺省 keys/shell-config.key）
输出：签名包（对齐 S01 §2.2 信封：signature 覆盖除 signature 外的全部字段）→ --out 或 stdout。

信任链：
    api_base（明文引导，config.example.json）→ GET {api_base}/shell/config.signed.json
        → 壳端 ed25519 验签（key_id=shell-config-2026，公钥硬编码于 shell_config.rs）
        → 通过 → 采信 + AES-GCM 加密缓存（离线可重验）；失败 → 拒绝。

用法：
    python gen_shell_config.py --config config.prod.json --key keys/prod.key --out dist/shell/config.signed.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

SCRIPT_DIR = Path(__file__).parent
# 独立于内容包 dev-key：壳配置签名专用密钥对（私钥仅管理员持有，gitignored）
SHELL_CONFIG_KEY_ID = "shell-config-2026"
SHELL_CONFIG_KEY_PATH = SCRIPT_DIR / "keys" / "shell-config.key"


def load_or_create_shell_key(path: Path) -> Ed25519PrivateKey:
    if path.exists():
        key = serialization.load_pem_private_key(path.read_bytes(), password=None)
        assert isinstance(key, Ed25519PrivateKey)
        return key
    path.parent.mkdir(parents=True, exist_ok=True)
    key = Ed25519PrivateKey.generate()
    path.write_bytes(
        key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    return key


def canonical_sign_view(obj: dict) -> bytes:
    """对齐壳端 canonical_json_sign_view：剔除 signature/checksum 后 sort_keys + separators + ensure_ascii=False"""
    sign_view = {k: v for k, v in obj.items() if k not in ("signature", "checksum")}
    return json.dumps(
        sign_view, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def sign_config(config: dict, key: Ed25519PrivateKey) -> dict:
    canon = canonical_sign_view(config)
    sig = key.sign(canon)
    config["signature"] = {
        "alg": "ed25519",
        "key_id": SHELL_CONFIG_KEY_ID,
        "nonce": hashlib.sha256(os.urandom(16)).hexdigest()[:16],
        "signed_payload_hash": "sha256:" + hashlib.sha256(canon).hexdigest(),
        "sig": sig.hex(),
    }
    return config


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--config", required=True, help="配置 JSON 文件（api_base 等字段）")
    ap.add_argument("--key", default=str(SHELL_CONFIG_KEY_PATH), help="私钥 PEM 路径")
    ap.add_argument("--out", default="", help="输出路径（缺省 stdout）")
    args = ap.parse_args()

    config = json.loads(Path(args.config).read_text(encoding="utf-8"))
    if not isinstance(config, dict):
        print("config 必须为 JSON 对象", file=sys.stderr)
        return 2

    key = load_or_create_shell_key(Path(args.key))
    enveloped = sign_config(config, key)

    payload = json.dumps(enveloped, ensure_ascii=False, indent=2) + "\n"
    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(payload, encoding="utf-8")
        print(f"已写入 {out}（key_id={SHELL_CONFIG_KEY_ID}）")
        # 打印公钥 32B hex：管理员需写回壳端 shell_config.rs 的 SHELL_CONFIG_PUBKEYS
        pub = key.public_key().public_bytes(
            encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw
        )
        print(f"公钥 raw 32B hex（壳端需预置）: {pub.hex()}")
    else:
        sys.stdout.write(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())