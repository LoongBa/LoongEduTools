#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build_lexue_site.py — 生成 lexue（乐学系列）CF Pages 静态部署目录

背景（2026-09-28 方案 v0.9）：乐学系列统一汇聚到发布仓库 loongba-edu-dist 的 lexue/ 分区，
CF Pages 项目 B（lexue.loongba.cn）从 Git 源拉取自动构建（push 即部署）。

产出目录（--out，缺省 scripts/dist/lexue-site/）：
    index.html                    ← 乐学系列产品页（产品卡片列表）
    _headers                      ← CF Pages 缓存策略（assets immutable / api no-cache）
    products/<path>/index.html    ← 主力单独产品页（旁挂架构：介绍 + 打开应用入口）
    peilian/                      ← 主力① 点读陪练（英语陪练·天天见）
        index.html + assets/...   ←   build:online 前端产物
        api/manifest(.json)       ←   在线内容目录（双写无后缀副本）
        api/units/<id>(.json)     ←   单元内容包（双写无后缀副本）
    shudu/                        ← 主力② 数独思维（dist 直接复制）
    qiaosuan/                     ← 主力③ 数学巧算（dist 直接复制）
    timemanager/                  ← 主力④ 家庭时间管理（占位规划，未开工跳过或 WARN）
    units/<uid>/{audio,images,song}/   ← 点读陪练素材（站点根，URL 直引；align publish_online.py URL 规则）
    MiniApp/<工具>/               ← 双骨架小程序在线包（tools.py online 白名单 − 排除集，相对路径直接复制）

用法：
    python build_lexue_site.py                        # 默认 base=https://lexue.loongba.cn
    python build_lexue_site.py --base https://lexue.loongba.cn --out scripts/dist/lexue-site
    python build_lexue_site.py --no-miniapp          # 调试：跳过 MiniApp 全量
    python build_lexue_site.py --include 数学口算     # 调试：仅汇聚指定工具（MiniApp 白名单子集）

前置校验（--strict 缺失即中止；默认缺失 WARN 跳过）：
    - 点读陪练：WebH5/dist（build:online）+ build/online/manifest.json
    - 数独思维：数独思维/src/dist/index.html
    - 数学巧算：数学巧算/src/dist/index.html
    - MiniApp：RedTools/dist/<系列>/<工具>/online/（按白名单）
依赖：RedTools/tools.py（ToolConfig.modes 判 online 登记）；标准库。
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent          # LoongEduTools 根
DEFAULT_OUT = Path(__file__).resolve().parent / "dist" / "lexue-site"
DEFAULT_BASE = "https://lexue.loongba.cn"
WEB_TEMPLATES = Path(__file__).resolve().parent / "web"   # 首页/系列页模板目录

# 各产品源路径（相对 REPO）
PEILIAN_FRONT = REPO / "点读陪练" / "WebH5" / "dist"          # build:online 前端产物
PEILIAN_CONTENT = REPO / "点读陪练" / "build" / "online"      # build/online（manifest+units+assets）
SHUDU_DIST = REPO / "数独思维" / "src" / "dist"
QIAOSUAN_DIST = REPO / "数学巧算" / "src" / "dist"
TIMEMANAGER_DIST = REPO / "家庭时间管理" / "dist"              # 未开工，仅检测
REDTOOLS_DIST = REPO / "RedTools" / "dist"
REDTOOLS_ROOT = REPO / "RedTools"

# MiniApp 排除集（tools.py 虽登记 online，但不进 lexue/MiniApp）
#   英语点读    → 乐教内容包（taoli/pepdiandu，D09 加密重打包）
#   点读陪练    → 主力 peilian 已独立（WebH5 完整版）
#   数独思维    → 主力 shudu 已独立
#   蜡笔物理/点击反应测试/手速挑战 → 🔒 推迟（版号红线边缘，不宣传）
MINIAPP_EXCLUDE = {"英语点读", "点读陪练", "数独思维", "蜡笔物理", "点击反应测试", "手速挑战"}

# 主力四款（子路径名 → 众口：产品名 / 源目录 / 是否可跳过）
MAIN_PRODUCTS = [
    {"path": "peilian", "name": "点读陪练（英语陪练·天天见）", "front": PEILIAN_FRONT, "content": PEILIAN_CONTENT},
    {"path": "shudu", "name": "数独思维", "dist": SHUDU_DIST},
    {"path": "qiaosuan", "name": "数学巧算（数学巧算·天天练）", "dist": QIAOSUAN_DIST},
    {"path": "timemanager", "name": "家庭时间管理", "dist": TIMEMANAGER_DIST, "optional": True},
]


def log(msg: str):
    print(msg, flush=True)


def warn(msg: str):
    print(f"  [warn] {msg}", file=sys.stderr, flush=True)


def load_online_miniapps() -> dict[str, str]:
    """读取 RedTools tools.py → {工具名: series}（modes 含 online 的登记项）。"""
    sys.path.insert(0, str(REDTOOLS_ROOT))
    try:
        from tools import TOOLS  # type: ignore
    except Exception as e:
        warn(f"tools.py 读取失败（{e}）——MiniApp 白名单置空")
        return {}
    return {name: cfg.series for name, cfg in TOOLS.items() if "online" in (cfg.modes or ["offline"])}


def copy_recursive(src: Path, dst: Path):
    dst.parent.mkdir(parents=True, exist_ok=True)
    if src.is_dir():
        shutil.copytree(src, dst, dirs_exist_ok=True)
    else:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


def write_json_dual(dst_noext: Path, data: dict):
    """双写：无后缀副本（壳端/前端 fetch 形态）+ .json 后缀（校验/人工形态）。"""
    dst_noext.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    dst_noext.write_text(text, encoding="utf-8")
    dst_noext.with_name(dst_noext.name + ".json").write_text(text, encoding="utf-8")


def build_peilian(out: Path, strict: bool) -> int:
    """点读陪练：前端 dist → peilian/；build/online → peilian/api + lexue/units。"""
    manifest_candidates = [PEILIAN_CONTENT / "manifest", PEILIAN_CONTENT / "manifest.json"]
    manifest_path = next((p for p in manifest_candidates if p.is_file()), None)
    if not PEILIAN_FRONT.is_dir() or manifest_path is None:
        msg = f"点读陪练产物缺失（front={PEILIAN_FRONT.is_dir()}, manifest={'/'.join(p.name for p in manifest_candidates)}）"
        if strict:
            raise SystemExit(f"[strict] 前置校验失败：{msg}")
        warn(msg + " —— 跳过 peilian/")
        return 0

    # 1) 前端产物 → peilian/（排除 units/ 内联：在线内容走 api/，不复制离线内联目录）
    front_dst = out / "peilian"
    front_dst.mkdir(parents=True, exist_ok=True)
    skipped_units = False
    for item in PEILIAN_FRONT.iterdir():
        if item.name == "units":  # 离线内联内容，在线形态不含（RemoteProvider 拉 api/）
            skipped_units = True
            continue
        dst = front_dst / item.name
        if dst.exists():
            shutil.rmtree(dst) if dst.is_dir() else dst.unlink()
        copy_recursive(item, dst)
    if skipped_units:
        log("  peilian/ 前端：已跳过离线内联 units/ 目录（在线内容走 api/）")

    # 2) 在线内容 manifest → peilian/api/manifest（双写）
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    write_json_dual(front_dst / "api" / "manifest", manifest)
    n_units = sum(len(g.get("units", [])) for g in manifest.get("grades", []))
    log(f"  peilian/api/manifest（双写）：{len(manifest.get('grades', []))} 册 / {n_units} 单元")

    # 3) 单元内容包 → peilian/api/units/<id>（双写）
    units_src = PEILIAN_CONTENT / "units"
    n_copied = 0
    for uj in sorted(units_src.glob("*.json")):
        if uj.name == "manifest.json":
            continue
        data = json.loads(uj.read_text(encoding="utf-8"))
        write_json_dual(front_dst / "api" / "units" / uj.stem, data)
        n_copied += 1
    log(f"  peilian/api/units：{n_copied} 单元（双写）")

    # 4) 素材 → lexue/units/<uid>/{audio,images,song}（URL base=站点根，align publish_online.py）
    #    新产物（publish_online.py v0.9+）素材在 build/online/units/；旧产物在 assets/ —— 兼容两者
    assets_src = None
    for cand in (PEILIAN_CONTENT / "units", PEILIAN_CONTENT / "assets"):
        if cand.is_dir() and any(p.is_dir() for p in cand.iterdir()):
            assets_src = cand
            break
    n_files = 0
    if assets_src is not None:
        for uid_dir in assets_src.iterdir():
            if not uid_dir.is_dir():
                continue
            for sub in uid_dir.iterdir():
                if sub.is_dir():
                    dst = out / "units" / uid_dir.name / sub.name
                    copy_recursive(sub, dst)
                    n_files += sum(1 for _ in sub.rglob("*") if _.is_file())
    log(f"  lexue/units/ 素材：{n_files} 文件（源 {assets_src.name if assets_src else 'N/A'}）")
    return 1


def build_simple_product(prod: dict, out: Path, strict: bool) -> int:
    """数独/巧算/家庭时间管理：dist 直接复制到子路径。"""
    src = prod["dist"]
    if not (src / "index.html").is_file():
        msg = f"{prod['name']} 产物缺失（{src} 无 index.html）"
        if prod.get("optional"):
            warn(msg + " —— 跳过（占位规划）")
            return 0
        if strict:
            raise SystemExit(f"[strict] 前置校验失败：{msg}")
        warn(msg + " —— 跳过")
        return 0
    dst = out / prod["path"]
    if dst.exists():
        shutil.rmtree(dst)
    copy_recursive(src, dst)
    n = sum(1 for _ in dst.rglob("*") if _.is_file())
    log(f"  {prod['path']}/（{prod['name']}）：{n} 文件直接复制")
    return 1


def build_miniapps(out: Path, strict: bool, include: set[str] | None, no_miniapp: bool) -> int:
    """MiniApp 白名单（tools.py online 登记 − 排除集）→ MiniApp/<工具>/。"""
    if no_miniapp:
        log("  MiniApp/：跳过（--no-miniapp）")
        return 0
    registered = load_online_miniapps()
    whitelist = {k: v for k, v in registered.items() if k not in MINIAPP_EXCLUDE}
    if include:
        missing = include - set(whitelist)
        if missing:
            raise SystemExit(f"[args] --include 包含未登记/被排除工具: {sorted(missing)}")
        whitelist = {k: v for k, v in whitelist.items() if k in include}

    copied = 0
    skipped = []
    for tool, series in sorted(whitelist.items()):
        src = REDTOOLS_DIST / series / tool / "online"
        if not (src / "index.html").is_file():
            skipped.append(tool)
            continue
        dst = out / "MiniApp" / tool
        if dst.exists():
            shutil.rmtree(dst)
        copy_recursive(src, dst)
        copied += 1
    if skipped:
        warn(f"MiniApp 跳过 {len(skipped)} 款（无 online 产物）: {', '.join(sorted(skipped))}")
    log(f"  MiniApp/：{copied} 款（白名单 {len(whitelist)}，排除 {len(MINIAPP_EXCLUDE)}）")
    return copied


PLACEHOLDER_RE = re.compile(r'<template\s+data-inject="(?P<key>[A-Z_]+)"\s*>(?P<body>.*?)</template>', re.DOTALL)


def load_template(name: str) -> str:
    """读模板文件。模板 = 静态 HTML（UI Agent 可美化），含 <template data-inject="KEY"> 占位元素。"""
    tpl = WEB_TEMPLATES / name
    if not tpl.is_file():
        raise SystemExit(f"[strict] 模板缺失: {tpl}（首页必须由模板生成）")
    return tpl.read_text(encoding="utf-8")


def inject_placeholders(html: str, values: dict[str, str]) -> str:
    """占位符替换 + Oracle B1 唯一性校验：每个 KEY 必须恰好出现 1 次（str.replace 会替换全部匹配）。"""
    missing = []
    for key, val in values.items():
        marker = f'data-inject="{key}"'
        n = html.count(marker)
        if n != 1:
            missing.append(f"{key}×{n}")
        html = PLACEHOLDER_RE.sub(lambda m: val if m.group("key") == key else m.group(0), html)
    if missing:
        raise SystemExit(f"[strict] 占位符唯一性校验失败（须恰好 1 次）: {', '.join(missing)}  ← 模板被 UI Agent 改动，勿增删/复制 data-inject 元素")
    if "<template data-inject=" in html:
        raise SystemExit("[strict] 产物残留未替换的 template 占位元素 → 模板与注入值不匹配，中止")
    return html


def gen_series_page(out: Path, main_cards: list[tuple[str, str]], updated_at: str) -> Path:
    """乐学系列产品页（模板驱动）：读 lexue-home.html → 注入主力卡 + 更新时间。"""
    html = load_template("lexue-home.html")
    cards = "".join(
        f'<a class="card" href="{href}"><h3>{label}</h3><span class="go">打开 →</span></a>'
        for label, href in main_cards
    )
    out_html = inject_placeholders(html, {"MAIN_CARDS": cards, "UPDATED_AT": updated_at})
    idx = out / "index.html"
    idx.write_text(out_html, encoding="utf-8")
    log(f"  乐学系列产品页：index.html（模板 lexue-home.html，{len(main_cards)} 主力卡）")
    return idx


def gen_miniapp_page(out: Path, tool_names: list[str], updated_at: str) -> Path:
    """MiniApp 目录页（模板驱动）：读 lexue-miniapp-home.html → 注入工具卡 + 更新时间。

    Oracle B1/I2：链接用 t.name（Path 名）而非 Path 对象整体（修复 L336 死链根因）。
    """
    html = load_template("lexue-miniapp-home.html")
    cards = "".join(
        f'<a class="card" href="{t}/"><span class="name">{t}</span><div class="go">打开 →</div></a>'
        for t in sorted(tool_names)
    )
    out_html = inject_placeholders(html, {"MINIAPP_CARDS": cards, "UPDATED_AT": updated_at})
    idx = out / "MiniApp" / "index.html"
    idx.parent.mkdir(parents=True, exist_ok=True)
    idx.write_text(out_html, encoding="utf-8")
    log(f"  MiniApp 目录页：MiniApp/index.html（模板 lexue-miniapp-home.html，{len(tool_names)} 款）")
    return idx


def gen_product_pages(out: Path, updated_at: str) -> int:
    """主力单独产品页（旁挂架构，Oracle B1）：products/<path>/index.html ← 模板 product-<path>.html。

    - 产物存在才生成（timemanager 未开工顺延）；
    - 模板缺失：optional 产品（timemanager）WARN 跳过；主力（非 optional）strict 中止（防主力产品页漏写）；
    - 只注入 UPDATED_AT（每模板恰好 1 次），文案/按钮/链接为模板内静态内容。
    """
    n = 0
    for prod in MAIN_PRODUCTS:
        p = prod["path"]
        if not (out / p / "index.html").is_file():
            warn(f"产品页跳过：{p} 产物不存在")
            continue
        tpl = WEB_TEMPLATES / f"product-{p}.html"
        if not tpl.is_file():
            if prod.get("optional"):
                warn(f"产品页模板缺失（optional，跳过）: {tpl.name} —— 待开工后补模板")
                continue
            raise SystemExit(f"[strict] 主力产品页模板缺失: {tpl.name}（产物已发布但模板未写）")
        html = tpl.read_text(encoding="utf-8")
        out_html = inject_placeholders(html, {"UPDATED_AT": updated_at})
        idx = out / "products" / p / "index.html"
        idx.parent.mkdir(parents=True, exist_ok=True)
        idx.write_text(out_html, encoding="utf-8")
        n += 1
        log(f"  产品页：products/{p}/（模板 {tpl.name}）")
    return n


def gen_headers(out: Path) -> Path:
    """CF Pages 缓存策略：assets immutable / api no-cache / 入口 no-cache / units immutable。

    每 path 独立块（taoli 已验证格式）——避免多 path 共享块在 CF Pages 的部分生效问题。
    """
    head = out / "_headers"
    rules = [
        ("# Cache-Control: assets immutable / api + 入口 no-cache / units immutable", None),
        ("/assets/*", "Cache-Control: public, max-age=31536000, immutable"),
        ("/peilian/assets/*", "Cache-Control: public, max-age=31536000, immutable"),
        ("/shudu/assets/*", "Cache-Control: public, max-age=31536000, immutable"),
        ("/qiaosuan/assets/*", "Cache-Control: public, max-age=31536000, immutable"),
        ("/timemanager/assets/*", "Cache-Control: public, max-age=31536000, immutable"),
        ("/MiniApp/*/assets/*", "Cache-Control: public, max-age=31536000, immutable"),
        ("/api/*", "Cache-Control: no-cache"),
        ("/peilian/api/*", "Cache-Control: no-cache"),
        ("/index.html", "Cache-Control: no-cache"),
        ("/peilian/index.html", "Cache-Control: no-cache"),
        ("/shudu/index.html", "Cache-Control: no-cache"),
        ("/qiaosuan/index.html", "Cache-Control: no-cache"),
        ("/timemanager/index.html", "Cache-Control: no-cache"),
        ("/MiniApp/index.html", "Cache-Control: no-cache"),
        ("/products/*/index.html", "Cache-Control: no-cache"),
        ("/units/*", "Cache-Control: public, max-age=31536000, immutable"),
    ]
    lines = []
    for path, header in rules:
        if path is None:
            lines.append(header)
        else:
            lines.append(path)
            lines.append(f"  {header}")
            lines.append("")
    head.write_text("\n".join(lines), encoding="utf-8")
    log("  _headers：独立块格式（assets(主力+MiniApp)/units=immutable，api/入口/products=no-cache）")
    return head


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--base", default=DEFAULT_BASE, help=f"站点根 URL（默认 {DEFAULT_BASE}）")
    ap.add_argument("--out", default=str(DEFAULT_OUT), help="产物目录（默认 scripts/dist/lexue-site/）")
    ap.add_argument("--strict", action="store_true", help="产物缺失即中止（默认 WARN 跳过）")
    ap.add_argument("--no-miniapp", action="store_true", help="跳过 MiniApp 全量汇聚（调试用）")
    ap.add_argument("--include", nargs="*", default=None, help="仅汇聚指定 MiniApp 工具名")
    args = ap.parse_args()

    out = Path(args.out)
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    log(f"=== build_lexue_site.py → {out}（base={args.base}）===")

    # 1) 主力四款
    n_main = 0
    for prod in MAIN_PRODUCTS:
        if "content" in prod:
            n_main += build_peilian(out, args.strict)
        else:
            n_main += build_simple_product(prod, out, args.strict)
    log(f"主力：{n_main}/4 汇聚完成")

    # 2) MiniApp
    n_mini = build_miniapps(out, args.strict, set(args.include) if args.include else None, args.no_miniapp)

    # 3) 主力产品页（旁挂：products/<path>/，先于系列页生成）
    updated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    n_prod = gen_product_pages(out, updated_at)

    # 4) 系列页（主流卡从 MAIN_PRODUCTS 派生，Oracle E3：消除手写三元组；链接指向产品页）
    main_cards = [(p["name"], f"products/{p['path']}/") for p in MAIN_PRODUCTS
                  if (out / p["path"] / "index.html").is_file()]
    gen_series_page(out, main_cards, updated_at)
    miniapp_names = [t.name for t in (out / "MiniApp").iterdir() if (out / "MiniApp" / t.name).is_dir()] if (out / "MiniApp").is_dir() else []
    gen_miniapp_page(out, miniapp_names, updated_at)
    gen_headers(out)

    # 汇总
    n_files = sum(1 for _ in out.rglob("*") if _.is_file())
    mb = sum(f.stat().st_size for f in out.rglob("*") if f.is_file()) / 1024 / 1024
    log(f"\n=== 完成：{n_files} 文件 / {mb:.1f} MB → {out} ===")
    log("部署：拷贝至发布仓库 lexue/ → publish_lexue.ps1 推送 → CF Pages 自动构建")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())