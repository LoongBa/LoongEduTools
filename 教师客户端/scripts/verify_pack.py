#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""verify_pack.py — 内容包 QA 自检（D04 §5 · S01 §2）

检查项：
  1. 结构完整性 — zip 含 manifest/package.json/data/
  2. 签名校验   — manifest.signature ed25519（开发公钥）
  3. hash 比对  — package.json file_index → 解密后逐文件 SHA-256
  4. 解密抽样   — 加密包抽 ≤3 文件 DEV_PASSPHRASE 解密冒烟
  5. 包体积     — 教材点读 ≤10MiB WARN（其余默认 50MiB）
  6. app 依赖   — app 型 index.html 引用的相对资源在包内
  7. 版本记录   — registry.json 不重复（WARN）

输出：dist/<id>-<ver>-qa.json；任一 FAIL → exit 1。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey  # noqa: E402

from crypto_out import DEV_PASSPHRASE, decrypt_bytes, derive_key, load_dev_public_bytes  # noqa: E402

# 教材点读体积红线（D04 §5）；其余包用通用上限
SIZE_LIMIT_APP = 10 * 1024 * 1024
SIZE_LIMIT_DEFAULT = 50 * 1024 * 1024

PACKER_VERSION = "pack-1.0.0"


def _fail(results: list, name: str, ok: bool, detail: str, hard: bool = True) -> None:
    results.append(
        {"check": name, "status": "PASS" if ok else ("FAIL" if hard else "WARN"), "detail": detail}
    )


def verify(zip_path: Path) -> dict:
    results: list[dict] = []
    checks_fail = 0

    def rec(name: str, ok: bool, detail: str, hard: bool = True) -> bool:
        nonlocal checks_fail
        status = "PASS" if ok else ("FAIL" if hard else "WARN")
        if not ok and hard:
            checks_fail += 1
        results.append({"check": name, "status": status, "detail": detail})
        return ok

    if not zip_path.is_file():
        rec("structure", False, f"zip 不存在: {zip_path}")
        return {
            "zip": str(zip_path),
            "passed": False,
            "checks": results,
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "packer": PACKER_VERSION,
        }

    zf = zipfile.ZipFile(zip_path)
    names = set(zf.namelist())

    # 1. 结构
    need = {"manifest.json", "package.json"}
    missing = need - names
    has_data = any(n.startswith("data/") for n in names)
    if not rec(
        "structure",
        not missing and has_data,
        f"missing={sorted(missing)} has_data={has_data}",
    ):
        zf.close()
        return {
            "zip": str(zip_path),
            "passed": False,
            "checks": results,
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "packer": PACKER_VERSION,
        }

    manifest = json.loads(zf.read("manifest.json"))
    package = json.loads(zf.read("package.json"))
    pkg_id = manifest.get("package_id", "?")
    version = manifest.get("package_version", "?")
    pkg_type = manifest.get("package_type", "data")

    # 2. 签名校验
    sig = manifest.get("signature") or {}
    try:
        pub_raw = load_dev_public_bytes()
        pub = Ed25519PublicKey.from_public_bytes(pub_raw)
        sign_view = {k: v for k, v in manifest.items() if k not in ("signature", "checksum")}
        canon = json.dumps(
            sign_view, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        ).encode("utf-8")
        pub.verify(bytes.fromhex(sig.get("sig", "")), canon)
        rec("signature", True, f"key_id={sig.get('key_id')} alg={sig.get('alg')}")
    except Exception as e:  # noqa: BLE001 — QA 需要吞掉并报告
        rec("signature", False, f"签名校验失败: {e}")

    # 3+4. 解密 / hash
    encrypted = bool(package.get("encrypted"))
    key = derive_key(pkg_id, version, DEV_PASSPHRASE) if encrypted else None
    file_index: list = package.get("file_index", [])
    hash_bad: list[str] = []
    decrypt_bad: list[str] = []
    sample_targets = file_index[:3] if encrypted else file_index
    for entry in file_index:
        rel = entry["path"]
        raw_entry = f"data/{rel}"
        if raw_entry not in names:
            hash_bad.append(f"{rel}: 文件缺失")
            continue
        blob = zf.read(raw_entry)
        if encrypted:
            try:
                plain = decrypt_bytes(blob, key)  # type: ignore[arg-type]
            except Exception as e:  # noqa: BLE001
                decrypt_bad.append(f"{rel}: {e}")
                if entry in sample_targets:
                    hash_bad.append(f"{rel}: 解密失败")
                continue
        else:
            plain = blob
        got = hashlib.sha256(plain).hexdigest()
        if got != entry.get("sha256"):
            hash_bad.append(f"{rel}: hash 不符")

    rec("hash", not hash_bad, f"bad={hash_bad[:5]} total_checked={len(file_index)}")
    if encrypted:
        rec(
            "decrypt_smoke",
            not decrypt_bad,
            f"sample≤3 bad={decrypt_bad[:3]}",
        )

    # 5. 体积
    size = zip_path.stat().st_size
    limit = SIZE_LIMIT_APP if pkg_type == "app" and "点读" in str(manifest.get("name", "")) else SIZE_LIMIT_DEFAULT
    if pkg_id.startswith("pep-reader"):
        limit = SIZE_LIMIT_APP
    rec("size", size <= limit, f"{size} bytes limit={limit}", hard=False)

    # 6. app 依赖（index.html 引用的相对 src/href）
    if pkg_type == "app":
        idx_name = "data/app/index.html"
        if idx_name not in names:
            rec("app_entry", False, "data/app/index.html 缺失")
        else:
            html = zf.read(idx_name).decode("utf-8", errors="replace")
            refs = re.findall(r'(?:src|href)=["\']([^"\']+)["\']', html)
            bad_refs = []
            for r in refs:
                if r.startswith(("http://", "https://", "data:", "#", "javascript:", "/")):
                    continue
                # 相对 app/ 根解析
                target = "data/app/" + r
                # 去掉 ./ 前缀
                while target.startswith("data/app/."):
                    target = target.replace("data/app/./", "data/app/", 1)
                if target not in names:
                    # 尝试 URL 去 query
                    bare = target.split("?")[0].split("#")[0]
                    if bare not in names:
                        bad_refs.append(r)
            rec("app_deps", not bad_refs, f"missing_refs={bad_refs[:5]}")

    # 7. registry（同目录 registry.json）
    reg_path = zip_path.parent / "registry.json"
    if reg_path.is_file():
        try:
            reg = json.loads(reg_path.read_text(encoding="utf-8"))
            entries = reg if isinstance(reg, list) else reg.get("entries", [])
            hits = sum(
                1
                for e in entries
                if e.get("package_id") == pkg_id and e.get("version") == version
            )
            # 打包后应恰有 1 条记录；>1 才是重复
            rec("registry", hits <= 1, f"hits={hits} (expect ≤1)", hard=False)
        except Exception as e:  # noqa: BLE001
            rec("registry", False, f"registry 解析失败: {e}", hard=False)

    zf.close()
    passed = checks_fail == 0
    return {
        "zip": str(zip_path),
        "package_id": pkg_id,
        "version": version,
        "passed": passed,
        "checks": results,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "packer": PACKER_VERSION,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="内容包 QA 自检（D04 §5）")
    ap.add_argument("zip", help="内容包 zip 路径")
    ap.add_argument("--out", default=None, help="qa json 输出（默认 zip 同目录 <id>-<ver>-qa.json）")
    args = ap.parse_args()

    zip_path = Path(args.zip).resolve()
    report = verify(zip_path)

    out_path = Path(args.out) if args.out else zip_path.parent / (
        f"{report.get('package_id', 'unknown')}-{report.get('version', 'unknown')}-qa.json"
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    for c in report["checks"]:
        print(f"  [{c['status']:4}] {c['check']}: {c['detail']}")
    print(f"[{'QA-PASS' if report['passed'] else 'QA-FAIL'}] → {out_path}")
    sys.exit(0 if report["passed"] else 1)


if __name__ == "__main__":
    main()
