#!/usr/bin/env python3
"""七巧板图案数据解析器（开发期一次性脚本，可复算/扩图案）。

数据源：OMerkel/Tangram（MIT License, (c) 2019 Oliver Merkel）
  - data/challenges.js : HmiChallenge[]，每款 = { transform[7], silhouette, viewbox, level }
  - data/hmi.js        : Hmi.tiles[7]，7 块基准形状（SVG path）

坐标系：SVG（y 向下）。基准形状以各块局部原点定义；
transform "tX,YrDeg,0,0" = 绕原点旋转 deg 后平移 (X,Y)（SVG transform 顺序）。
绝对顶点 P_abs = R(deg)·P + (X,Y)。

转换到游戏格式：
- 每块参考点 = R(deg)·mean(P) + (X,Y)（对三角形/正方形/平行四边形 = 几何质心）
- 每款图案：统一缩放 + 居中到游戏区（前端 320×320 viewBox，图案长边 280）
  scale 字段供前端渲染块时对 pts 做等比例缩放
- 7 块 key 映射（tiles 下标）：0=pa 1=bigA 2=bigB 3=smA 4=sq 5=med 6=smB

验证：7 块两两无重叠（多边形裁剪面积 ≤ 1）+ 采样并集覆盖 outline ≥ 95%。

输出：src/assets/tangram.js（window.TAN = { shapes, puzzles }）
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
OUT = HERE / "src" / "assets" / "tangram.js"

GAME_SIZE = 320.0      # 前端游戏区边长
MAX_EDGE = 280.0       # 图案缩放后长边

# tiles 下标 → 游戏块 key / 中文名 / 配色
TILE_KEYS = ["pa", "bigA", "bigB", "smA", "sq", "med", "smB"]
COLORS = {
    "bigA": "#ff7a59", "bigB": "#ff5a7a", "med": "#4aa8ff",
    "smA": "#ffd23f", "smB": "#7bd88f", "sq": "#b389ff", "pa": "#4dd6c9",
}
# 12 款图案（level 名, 中文名, 档位 0=简单 1=进阶 2=挑战）
SELECT = [
    ("Square",   "正方形", 0),
    ("House",    "小房子", 0),
    ("Fish",     "小鱼",   0),
    ("Bowl",     "小碗",   0),
    ("Arrow",    "箭头",   1),
    ("Goose",    "大鹅",   1),
    ("Cat",      "小猫",   1),
    ("Dog",      "小狗",   1),
    ("Swan 1",   "天鹅",   2),
    ("Rocket",   "火箭",   2),
    ("Dolphin",  "海豚",   2),
    ("Elephant", "大象",   2),
]


# ---------------------------------------------------------------- 解析
def parse_svg_path(d: str) -> list:
    """解析 SVG path（"m x,y dx,dy ... z" 相对线段，支持多段）→ [多边形...]。
    m 后第一对 = 起点（路径开头相对 (0,0) = 绝对起点）。"""
    polys = []
    segs = re.split(r"[zZ]", d)
    for seg in segs:
        seg = seg.strip()
        if not seg:
            continue
        mm = re.match(r"[mM]\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)", seg)
        if not mm:
            continue
        sx, sy = float(mm.group(1)), float(mm.group(2))
        rest = re.sub(r"[a-zA-Z]", " ", seg[mm.end():]).replace(",", " ").split()
        nums = [float(x) for x in rest]
        pts = [(sx, sy)]
        cx, cy = sx, sy
        for i in range(0, len(nums) - 1, 2):
            cx += nums[i]
            cy += nums[i + 1]
            pts.append((cx, cy))
        while len(pts) > 1 and abs(pts[-1][0] - pts[0][0]) < 1e-9 and \
                abs(pts[-1][1] - pts[0][1]) < 1e-9:
            pts.pop()
        if len(pts) >= 3:
            polys.append(pts)
    return polys


def parse_transform(s: str) -> tuple:
    """transform "tX,YrDeg,0,0" → (tx, ty, deg)；空串 → (0,0,0)。"""
    s = s.strip()
    if not s:
        return (0.0, 0.0, 0.0)
    m = re.match(r"t(-?\d+),(-?\d+)(?:r(-?\d+))?", s)
    if not m:
        return (0.0, 0.0, 0.0)
    return (float(m.group(1)), float(m.group(2)), float(m.group(3) or 0))


def load_json_array(path: Path):
    """读取 JS 数组字面量（首 [ 到配对 ]，去尾逗号）→ Python 对象。"""
    text = path.read_text(encoding="utf-8")
    start = text.index("[")
    depth = 0
    end = None
    for i in range(start, len(text)):
        c = text[i]
        if c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0:
                end = i
                break
    if end is None:
        raise ValueError(f"{path.name}: 未找到配对 ]")
    body = re.sub(r",\s*([\]}])", r"\1", text[start:end + 1])  # 去尾逗号
    return json.loads(body)


def rot_deg(p: tuple, deg: float) -> tuple:
    """绕原点旋转 deg 度（SVG rotate 方向）。"""
    r = math.radians(deg)
    c, s = math.cos(r), math.sin(r)
    x, y = p
    return (x * c - y * s, x * s + y * c)


# ---------------------------------------------------------------- 几何判定（复用）
def poly_area(pts):
    s = 0.0
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


def clip_poly(subject, clip):
    """Sutherland-Hodgman：subject 被凸多边形 clip 裁剪。"""
    output = [tuple(p) for p in subject]
    n = len(clip)
    if n < 3:
        return []
    for i in range(n):
        a = clip[i]
        b = clip[(i + 1) % n]
        if not output:
            return []
        inp = output
        output = []
        s = inp[-1]
        for e in inp:
            s_in = ((b[0] - a[0]) * (s[1] - a[1]) - (b[1] - a[1]) * (s[0] - a[0])) >= -1e-9
            e_in = ((b[0] - a[0]) * (e[1] - a[1]) - (b[1] - a[1]) * (e[0] - a[0])) >= -1e-9
            if e_in:
                if not s_in:
                    x1, y1 = s
                    x2, y2 = e
                    den = (x2 - x1) * (b[1] - a[1]) - (y2 - y1) * (b[0] - a[0])
                    r = ((a[0] - x1) * (b[1] - a[1]) - (a[1] - y1) * (b[0] - a[0])) / den if den != 0 else 0.0
                    output.append((x1 + r * (x2 - x1), y1 + r * (y2 - y1)))
                output.append(e)
            elif s_in:
                x1, y1 = s
                x2, y2 = e
                den = (x2 - x1) * (b[1] - a[1]) - (y2 - y1) * (b[0] - a[0])
                r = ((a[0] - x1) * (b[1] - a[1]) - (a[1] - y1) * (b[0] - a[0])) / den if den != 0 else 0.0
                output.append((x1 + r * (x2 - x1), y1 + r * (y2 - y1)))
            s = e
    res = []
    for p in output:
        if not res or abs(res[-1][0] - p[0]) > 1e-7 or abs(res[-1][1] - p[1]) > 1e-7:
            res.append(p)
    if len(res) > 1 and abs(res[0][0] - res[-1][0]) < 1e-7 and abs(res[0][1] - res[-1][1]) < 1e-7:
        res.pop()
    return res


def point_in_poly(pt, poly):
    """射线法：点在多边形内（含边界）。"""
    x, y = pt
    n = len(poly)
    inside = False
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xin = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < xin:
                inside = not inside
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        dx, dy = x2 - x1, y2 - y1
        if abs(dx) + abs(dy) < 1e-12:
            continue
        t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
        px, py = x1 + t * dx, y1 + t * dy
        if (x - px) ** 2 + (y - py) ** 2 < 1e-6:
            return True
    return inside


def poly_samples(poly, step=2.0):
    """多边形内部采样点（全局统一 step 网格，从原点对齐）。"""
    out = set()
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    i0 = int(math.floor(min(xs) / step))
    i1 = int(math.ceil(max(xs) / step))
    j0 = int(math.floor(min(ys) / step))
    j1 = int(math.ceil(max(ys) / step))
    for i in range(i0, i1 + 1):
        for j in range(j0, j1 + 1):
            px = i * step
            py = j * step
            if point_in_poly((px, py), poly):
                out.add((round(px, 3), round(py, 3)))
    return out


# ---------------------------------------------------------------- 主流程
def main():
    challenges = load_json_array(DATA / "challenges.js")
    tiles_raw = load_json_array(DATA / "hmi.js")
    tiles = [parse_svg_path(d)[0] for d in tiles_raw]
    assert len(tiles) == 7

    by_level = {}
    for ch in challenges:
        by_level.setdefault(ch["level"], ch)

    shapes = {}
    for idx, key in enumerate(TILE_KEYS):
        p = tiles[idx]
        cx = sum(v[0] for v in p) / len(p)
        cy = sum(v[1] for v in p) / len(p)
        shapes[key] = {
            "pts": [[round(v[0] - cx, 4), round(v[1] - cy, 4)] for v in p],
            "color": COLORS[key],
        }

    puzzles = []
    for level_name, cn_name, lvl in SELECT:
        ch = by_level.get(level_name)
        if ch is None:
            print(f"✗ {cn_name}: 数据中无 {level_name!r}")
            continue
        transforms = [parse_transform(s) for s in ch["transform"]]
        outline_polys = parse_svg_path(ch["silhouette"])

        # 旋转角必须是 45° 倍数（前端旋转按钮 45° 步进）
        if any(abs((deg % 45)) > 1e-6 for _, _, deg in transforms):
            print(f"✗ {cn_name}: 存在非 45° 倍数旋转角，跳过")
            continue

        abs_polys = []
        refs = []
        for idx, (tx, ty, deg) in enumerate(transforms):
            p = tiles[idx]
            abs_pts = [(rot_deg(v, deg)[0] + tx, rot_deg(v, deg)[1] + ty) for v in p]
            abs_polys.append(abs_pts)
            mx = sum(v[0] for v in abs_pts) / len(abs_pts)
            my = sum(v[1] for v in abs_pts) / len(abs_pts)
            refs.append((mx, my, deg))

        all_xs = [v[0] for p in abs_polys for v in p]
        all_ys = [v[1] for p in abs_polys for v in p]
        for op in outline_polys:
            all_xs += [v[0] for v in op]
            all_ys += [v[1] for v in op]
        w = max(all_xs) - min(all_xs)
        h = max(all_ys) - min(all_ys)
        scale = MAX_EDGE / max(w, h, 1e-9)
        cx0 = (min(all_xs) + max(all_xs)) / 2
        cy0 = (min(all_ys) + max(all_ys)) / 2
        ox = GAME_SIZE / 2 - cx0 * scale
        oy = GAME_SIZE / 2 - cy0 * scale

        def tr(pt):
            return (round(pt[0] * scale + ox, 3), round(pt[1] * scale + oy, 3))

        scaled_polys = [[tr(v) for v in p] for p in abs_polys]
        outline_tr = [[tr(v) for v in op] for op in outline_polys]

        bad = False
        for i in range(7):
            for j in range(i + 1, 7):
                if poly_area(clip_poly(scaled_polys[i], scaled_polys[j])) > 1.0:
                    bad = True
                    print(f"✗ {cn_name}: 块 {TILE_KEYS[i]} 与 {TILE_KEYS[j]} 重叠")
        covered = set()
        for p in scaled_polys:
            covered |= poly_samples(p, step=MAX_EDGE / 60)
        target = set()
        for op in outline_tr:
            target |= poly_samples(op, step=MAX_EDGE / 60)
        cov = len(covered & target) / max(len(target), 1)
        if cov < 0.95:
            bad = True
            print(f"✗ {cn_name}: 覆盖 {cov:.3f}")

        targets = {}
        for idx, key in enumerate(TILE_KEYS):
            x, y, deg = refs[idx]
            targets[key] = {"x": round(x * scale + ox, 3),
                            "y": round(y * scale + oy, 3),
                            "rot": int(round(deg % 360))}
        puzzles.append({
            "name": cn_name,
            "level": lvl,
            "scale": round(scale, 6),
            "outline": [[[v[0], v[1]] for v in op] for op in outline_tr],
            "targets": targets,
        })
        print(f"{'✓' if not bad else '⚠'} {cn_name} ({level_name}): 覆盖 {cov:.3f}")

    data = {"shapes": shapes, "puzzles": puzzles}
    js = ("/* 七巧板数据（由 build_tangram.py 从 OMerkel/Tangram 解析生成，勿手改）\n"
          " * 数据源: OMerkel/Tangram (MIT, c) 2019 Oliver Merkel - data/challenges.js\n"
          " * 坐标系: SVG y 向下；块 pts 以参考点（顶点平均=质心）为原点，\n"
          " *          渲染 <g transform=\"translate(x,y) rotate(rot) scale(scale)\">。\n"
          " * 图案: targets 7 块 {x, y, rot}（已缩放 320 区）；outline 剪影（多段）；scale 渲染因子。\n"
          " */\n"
          "window.TAN = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(js, encoding="utf-8")
    print(f"\n输出: {OUT}（{len(puzzles)}/12 款图案）")
    return 0 if len(puzzles) == len(SELECT) else 1


if __name__ == "__main__":
    raise SystemExit(main())
