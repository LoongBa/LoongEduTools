#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build_lexue_site.py — 生成 lexue（乐学系列）CF Pages 静态部署目录

背景（2026-09-28 方案 v0.9）：乐学系列统一汇聚到发布仓库 loongba-edu-dist 的 lexue/ 分区，
CF Pages 项目 B（lexue.loongba.cn）从 Git 源拉取自动构建（push 即部署）。

产出目录（--out，缺省 scripts/dist/lexue-site/）：
    index.html                    ← 乐学系列产品页（产品卡片列表）
    _headers                      ← CF Pages 缓存策略（assets immutable / api no-cache）
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
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent          # LoongEduTools 根
DEFAULT_OUT = Path(__file__).resolve().parent / "dist" / "lexue-site"
DEFAULT_BASE = "https://lexue.loongba.cn"

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
    if not PEILIAN_FRONT.is_dir() or not (PEILIAN_CONTENT / "manifest.json").is_file():
        msg = f"点读陪练产物缺失（front={PEILIAN_FRONT.is_dir()}, content_manifest={ (PEILIAN_CONTENT / 'manifest.json').is_file() }）"
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
    manifest = json.loads((PEILIAN_CONTENT / "manifest.json").read_text(encoding="utf-8"))
    write_json_dual(front_dst / "api" / "manifest", manifest)
    n_units = sum(len(g.get("units", [])) for g in manifest.get("grades", []))
    log(f"  peilian/api/manifest（双写）：{len(manifest.get('grades', []))} 册 / {n_units} 单元")

    # 3) 单元内容包 → peilian/api/units/<id>（双写）
    units_src = PEILIAN_CONTENT / "units"
    n_copied = 0
    for uj in sorted(units_src.glob("*.json")):
        data = json.loads(uj.read_text(encoding="utf-8"))
        write_json_dual(front_dst / "api" / "units" / uj.stem, data)
        n_copied += 1
    log(f"  peilian/api/units：{n_copied} 单元（双写）")

    # 4) 素材 → lexue/units/<uid>/{audio,images,song}（URL base=站点根，align publish_online.py）
    assets_src = PEILIAN_CONTENT / "assets"
    n_files = 0
    if assets_src.is_dir():
        for uid_dir in assets_src.iterdir():
            if not uid_dir.is_dir():
                continue
            for sub in uid_dir.iterdir():
                if sub.is_dir():
                    dst = out / "units" / uid_dir.name / sub.name
                    copy_recursive(sub, dst)
                    n_files += sum(1 for _ in sub.rglob("*") if _.is_file())
    log(f"  lexue/units/ 素材：{n_files} 文件")
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


def gen_series_page(out: Path, sections: dict[str, list[tuple[str, str]]]) -> Path:
    """生成乐学系列产品页（index.html）：产品卡片列表，链接到各产品/工具。"""
    cards = []
    for section, items in sections.items():
        cards.append(f'<h2>{section}</h2><div class="grid">')
        for label, href in items:
            cards.append(f'<a class="card" href="{href}"><h3>{label}</h3><span>打开 →</span></a>')
        cards.append("</div>")
    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>乐学系列 · LoongBa Edu</title>
<style>
  body {{ font-family: system-ui, sans-serif; max-width: 960px; margin: 0 auto; padding: 24px; background: #f6f7f9; }}
  h1 {{ color: #1a1a2e; }} h2 {{ color: #444; margin-top: 28px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }}
  .card {{ display: block; background: #fff; border-radius: 12px; padding: 16px; text-decoration: none;
           color: #1a1a2e; box-shadow: 0 1px 3px rgba(0,0,0,.08); transition: transform .12s; }}
  .card:hover {{ transform: translateY(-2px); box-shadow: 0 3px 8px rgba(0,0,0,.12); }}
  .card span {{ color: #666; font-size: 13px; }}
</style>
</head>
<body>
<h1>乐学系列</h1>
<p>主力应用 + 专项练习小工具，全部可离线/在线双模式。</p>
{"\n".join(cards)}
<footer style="margin-top: 32px; color: #888; font-size: 12px;">
  <p>本节由 build_lexue_site.py 自动生成 · updated at {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}</p>
</footer>
</body>
</html>
"""
    idx = out / "index.html"
    idx.write_text(html, encoding="utf-8")
    log(f"  乐学系列产品页：index.html（含 {sum(len(v) for v in sections.values())} 个入口）")
    return idx


def gen_headers(out: Path) -> Path:
    """CF Pages 缓存策略：assets immutable / api no-cache / 入口 no-cache / units immutable。"""
    head = out / "_headers"
    head.write_text(
        "# Cache-Control: assets immutable / api + 入口 no-cache / units immutable\n"
        "/assets/*\n"
        "/MiniApp/*/assets/*\n"
        "  Cache-Control: public, max-age=31536000, immutable\n"
        "\n"
        "/api/*\n"
        "/peilian/api/*\n"
        "  Cache-Control: no-cache\n"
        "\n"
        "/index.html\n"
        "/peilian/index.html\n"
        "/shudu/index.html\n"
        "/qiaosuan/index.html\n"
        "/timemanager/index.html\n"
        "  Cache-Control: no-cache\n"
        "\n"
        "/units/*\n"
        "  Cache-Control: public, max-age=31536000, immutable\n",
        encoding="utf-8",
    )
    log("  _headers：assets/MiniApp/units=immutable，api/入口=no-cache")
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

    # 3) 系列页 + _headers
    sections = {
        "主力应用": [
            ("点读陪练（英语陪练·天天见）", "peilian/"),
            ("数独思维", "shudu/"),
            ("数学巧算（数学巧算·天天练）", "qiaosuan/"),
            ("家庭时间管理", "timemanager/"),
        ],
        "练习小工具": [(t, f"MiniApp/{t}/") for t in sorted((out / "MiniApp").iterdir()) if (out / "MiniApp" / t).is_dir()],
    }
    if not (out / "timemanager" / "index.html").is_file():
        sections["主力应用"] = [s for s in sections["主力应用"] if s[0] != "家庭时间管理"]
    gen_series_page(out, sections)
    gen_headers(out)

    # 汇总
    n_files = sum(1 for _ in out.rglob("*") if _.is_file())
    mb = sum(f.stat().st_size for f in out.rglob("*") if f.is_file()) / 1024 / 1024
    log(f"\n=== 完成：{n_files} 文件 / {mb:.1f} MB → {out} ===")
    log("部署：拷贝至发布仓库 lexue/ → publish_lexue.ps1 推送 → CF Pages 自动构建")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())