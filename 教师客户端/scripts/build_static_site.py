#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build_static_site.py — 生成 CF Pages 静态托管部署目录（教师客户端 · CF 免费档起步）

背景（2026-09-27 决策）：壳端 api_base 指向 CF Pages URL，按 `{api_base}/api/edu/...`
静态路径命中（URL 伪装），manifest/toolbox 匿名可读（A01 §4.1 已放开），下载走绝对
download_url（store.rs 优先绝对地址）。

产出目录（--out，缺省 scripts/dist/static-site/）：
    api/edu/packages/manifest.json    ← 聚合内容包清单（4 包，download_url → 绝对 Pages URL）
    api/edu/toolbox/manifest.json     ← 工具箱清单（对齐 Worker DEFAULT_TOOLBOX 结构）
    shell/config.signed.json          ← 壳配置签名包（gen_shell_config 同构，ed25519）
    packs/<id>-<ver>.zip              ← 内容包实体（download_url 指向）

用法：
    python build_static_site.py --base https://<project>.pages.dev
    # 之后把 dist/static-site/ 内容拖入 CF Pages 项目根目录即可

依赖：cryptography（gen_shell_config 同款）；keys/shell-config.key 缺失时自动生成（gitignored）。
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from datetime import date, datetime, timezone
from pathlib import Path

from gen_shell_config import (
    SHELL_CONFIG_KEY_PATH,
    load_or_create_shell_key,
    sign_config,
)

SCRIPT_DIR = Path(__file__).parent
DIST = SCRIPT_DIR / "dist"
DEFAULT_OUT = DIST / "static-site"
WEB_TEMPLATES = Path(__file__).parent / "web"   # 首页模板目录

# Worker DEFAULT_TOOLBOX（server/src/handlers/toolbox.ts，2026-09-25）同构首发种子
DEFAULT_TOOLBOX = {
    "version": "1.0",
    "updated_at": "2026-09-25T00:00:00Z",
    "categories": [
        {"id": "capture", "name": "截屏录屏"},
        {"id": "annotate", "name": "屏幕标注"},
        {"id": "keys", "name": "按键显示"},
        {"id": "keyboard", "name": "虚拟键盘"},
    ],
    "tools": [
        {
            "id": "snip-easy",
            "name": "SnipEasy 截图",
            "type": "exe",
            "source": "builtin",
            "platforms": ["windows"],
            "description": "轻量截图标注（课堂演示用）",
            "download_url": None,
            "size_bytes": None,
            "checksum": None,
            "categories": ["capture"],
        },
        {
            "id": "win-shot",
            "name": "Windows 截图",
            "type": "builtin",
            "source": "os",
            "platforms": ["windows"],
            "description": "系统自带截图（Win+Shift+S）",
            "download_url": None,
            "size_bytes": None,
            "checksum": None,
            "categories": ["capture"],
        },
        {
            "id": "snipaste",
            "name": "Snipaste",
            "type": "exe",
            "source": "download",
            "platforms": ["windows"],
            "description": "截图贴图工具",
            "download_url": None,
            "size_bytes": None,
            "checksum": None,
            "categories": ["capture", "annotate"],
        },
        {
            "id": "inkeys",
            "name": "Inkey 屏幕标注",
            "type": "exe",
            "source": "download",
            "platforms": ["windows"],
            "description": "白板标注/画笔",
            "download_url": None,
            "size_bytes": None,
            "checksum": None,
            "categories": ["annotate"],
        },
        {
            "id": "marker-on",
            "name": "Marker On",
            "type": "exe",
            "source": "download",
            "platforms": ["windows"],
            "description": "鼠标指针高亮",
            "download_url": None,
            "size_bytes": None,
            "checksum": None,
            "categories": ["annotate"],
        },
        {
            "id": "keyviz",
            "name": "Keyviz 按键显示",
            "type": "exe",
            "source": "download",
            "platforms": ["windows"],
            "description": "实时按键可视化",
            "download_url": None,
            "size_bytes": None,
            "checksum": None,
            "categories": ["keys"],
        },
        {
            "id": "osk",
            "name": "虚拟键盘",
            "type": "builtin",
            "source": "os",
            "platforms": ["windows"],
            "description": "系统屏幕键盘（osk.exe）",
            "download_url": None,
            "size_bytes": None,
            "checksum": None,
            "categories": ["keyboard"],
        },
    ],
}


def load_meta(meta_path: Path) -> dict:
    return json.loads(meta_path.read_text(encoding="utf-8"))


def build_package_manifest(base: str) -> dict:
    """聚合 dist/*.meta.json → StoreManifest 结构（{updated_at, packages}）。
    download_url 改绝对 Pages URL：packs/<id>-<ver>.zip（StoreManifest/RemotePkg 字段对齐）。"""
    metas = sorted(DIST.glob("content-pack-*.meta.json"))
    packages = []
    for meta_path in metas:
        m = load_meta(meta_path)
        pid = m["package_id"]
        ver = m["package_version"]
        packages.append(
            {
                "package_id": pid,
                "package_version": ver,
                "name": m.get("name", pid),
                "package_type": m.get("package_type", "app"),
                "categories": m.get("categories", []),
                "description": m.get("description"),
                "required_license_level": m.get("required_license_level", 1),
                "min_shell_version": m.get("min_shell_version", "0.1.0"),
                "size_bytes": m.get("size_bytes"),
                "checksum": m.get("checksum"),
                "download_url": f"{base}/packs/{pid}-{ver}.zip",
            }
        )
    return {
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "packages": packages,
    }


PLACEHOLDER_RE = re.compile(r'<template\s+data-inject="(?P<key>[A-Z_]+)"\s*>(?P<body>.*?)</template>', re.DOTALL)


def load_template(name: str) -> str:
    """读 taoli 首页模板（静态 HTML，UI Agent 可美化；含 <template data-inject="KEY"> 占位元素）。"""
    tpl = WEB_TEMPLATES / name
    if not tpl.is_file():
        raise SystemExit(f"[strict] 模板缺失: {tpl}（首页必须由模板生成）")
    return tpl.read_text(encoding="utf-8")


def inject_placeholders(html: str, values: dict[str, str]) -> str:
    """占位符替换 + 唯一性校验：每个 KEY 必须恰好出现 1 次（防 UI Agent 增删后静默错页）。"""
    missing = []
    for key, val in values.items():
        marker = f'data-inject="{key}"'
        n = html.count(marker)
        if n != 1:
            missing.append(f"{key}×{n}")
        html = PLACEHOLDER_RE.sub(lambda m: val if m.group("key") == key else m.group(0), html)
    if missing:
        raise SystemExit(f"[strict] 占位符唯一性校验失败（须恰好 1 次）: {', '.join(missing)}  ← 模板被改动，勿增删/复制 data-inject 元素")
    if "<template data-inject=" in html:
        raise SystemExit("[strict] 产物残留未替换的 template 占位元素 → 模板与注入值不匹配，中止")
    return html


def fmt_size(b: int | None) -> str:
    if not b:
        return "—"
    for unit in ("B", "KB", "MB", "GB"):
        if b < 1024:
            return f"{b:.0f} {unit}"
        b /= 1024
    return f"{b:.1f} TB"


def gen_home_page(out: Path, manifest: dict, now: str) -> Path:
    """乐教系列产品页（模板驱动）：读 taoli-home.html → 注入内容包清单 + 更新时间。"""
    html = load_template("taoli-home.html")
    packs = manifest.get("packages", [])
    cards = []
    for p in packs:
        cards.append(
            f'<div class="pack"><div><strong>{p.get("name", p["package_id"])}</strong>'
            f'<div class="meta">{p["package_version"]} · {p.get("package_type", "app")} · {fmt_size(p.get("size_bytes"))}</div></div>'
            f'<a class="dl" href="{p["download_url"]}">下载 →</a></div>'
        )
    out_html = inject_placeholders(html, {"PACKS_LIST": "\n".join(cards) if cards else "<p>暂无内容包</p>", "UPDATED_AT": now})
    idx = out / "index.html"
    idx.write_text(out_html, encoding="utf-8")
    print(f"taoli/index.html: 已生成（模板 taoli-home.html，{len(packs)} 包）")
    return idx


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--base", required=True, help="CF Pages 根 URL，如 https://edu-teacher.pages.dev")
    ap.add_argument("--out", default=str(DEFAULT_OUT), help="输出目录")
    ap.add_argument("--shell-config", default="", help="壳配置 JSON（含 api_base 等；缺省自动构造只含 api_base）")
    args = ap.parse_args()

    out = Path(args.out)
    if out.exists():
        shutil.rmtree(out)
    (out / "api/edu/packages").mkdir(parents=True)
    (out / "api/edu/toolbox").mkdir(parents=True)
    (out / "shell").mkdir(parents=True)
    (out / "packs").mkdir(parents=True)

    # 1) 聚合内容包清单
    manifest = build_package_manifest(args.base.rstrip("/"))
    (out / "api/edu/packages/manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    # 无后缀副本：壳端 store.rs 请求 `{base}/api/edu/packages/manifest`（无 .json），
    # CF Pages 只自动补 .html 不补 .json → 必须提供精确无后缀路径文件（2026-09-28 本地验证发现）
    (out / "api/edu/packages/manifest").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"packages/manifest: {len(manifest['packages'])} 包（含无后缀副本）")

    # 2) 工具箱清单（首发种子）
    (out / "api/edu/toolbox/manifest.json").write_text(
        json.dumps(DEFAULT_TOOLBOX, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (out / "api/edu/toolbox/manifest").write_text(
        json.dumps(DEFAULT_TOOLBOX, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"toolbox/manifest: {len(DEFAULT_TOOLBOX['tools'])} 工具（含无后缀副本）")

    # 3) 拷贝内容包 zip → packs/（download_url 指向）
    copied = 0
    for meta_path in sorted(DIST.glob("content-pack-*.meta.json")):
        m = load_meta(meta_path)
        zip_src = meta_path.with_name(meta_path.name.replace(".meta.json", ".zip"))
        if not zip_src.exists():
            print(f"  [warn] 缺 zip: {zip_src}", file=sys.stderr)
            continue
        pid, ver = m["package_id"], m["package_version"]
        shutil.copy2(zip_src, out / "packs" / f"{pid}-{ver}.zip")
        copied += 1
    print(f"packs/: {copied} 个 zip")

    # 4) 壳配置签名包（shell/config.signed.json）
    if args.shell_config:
        cfg = json.loads(Path(args.shell_config).read_text(encoding="utf-8"))
    else:
        cfg = {"api_base": args.base.rstrip("/"), "schema_version": "1.0"}
    key = load_or_create_shell_key(SHELL_CONFIG_KEY_PATH)
    enveloped = sign_config(cfg, key)
    (out / "shell/config.signed.json").write_text(
        json.dumps(enveloped, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    pub = key.public_key().public_bytes_raw().hex()
    print(f"shell/config.signed.json 已签名（key_id=shell-config-2026）")
    print(f"公钥 raw 32B hex（与壳端 shell_config.rs SHELL_CONFIG_PUBKEYS 对比）: {pub}")

    # 5) CF Pages 缓存策略（_headers，随站点根部署；2026-09-28 三层分发设计·层2）
    #    - packs 文件名带版本 → immutable 永久缓存，命中即不回源
    #    - manifest/壳配置 → no-cache，客户端 If-None-Match 轮询（304=无更新），保证更新信号即时
    #    - index.html（首页模板生成）→ no-cache（入口页随内容包更新）
    (out / "_headers").write_text(
        "/packs/*\n"
        "  Cache-Control: public, max-age=31536000, immutable\n"
        "\n"
        "/api/edu/*\n"
        "  Cache-Control: no-cache\n"
        "\n"
        "/shell/*\n"
        "  Cache-Control: no-cache\n"
        "\n"
        "/index.html\n"
        "  Cache-Control: no-cache\n",
        encoding="utf-8",
    )
    print("_headers: packs=immutable，manifest/shell/index=no-cache")

    # 6) 乐教系列首页（模板驱动，读 taoli-home.html → 注入内容包清单 + 更新时间）
    gen_home_page(out, manifest, datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))

    print(f"\n完成 → {out}")
    print("部署：把该目录内容拖入 CF Pages 项目根目录（index.html api/ shell/ packs/ 与页面根平级）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
