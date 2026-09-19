#!/usr/bin/env python3
"""生成蜡笔物理工具图标母版 icon_base.png（1024×1024，程序化绘制）。

主题：纸张背景 + 红色蜡笔斜坡（粗笔触）+ 红色小球 + 黄色星星。
几何构图，无外部素材。运行后输出到 src/assets/icon_base.png。
"""
from PIL import Image, ImageDraw

S = 1024
im = Image.new("RGB", (S, S), "#f7f2e5")
d = ImageDraw.Draw(im)

# 纸张噪点
import random
random.seed(42)
for _ in range(12000):
    x, y = random.random() * S, random.random() * S
    a = random.randint(10, 40)
    d.point((x, y), fill=(150, 140, 120, a) if False else (166 + int(a), 158 + int(a * 0.6), 138 + int(a * 0.4)))

# 背景横线（纸纹）
for y in range(0, S, 26):
    d.line([(0, y + random.randint(-2, 2)), (S, y + random.randint(-2, 2))], fill=(170, 160, 140, 40) if False else (183, 175, 158), width=2)

def crayon_line(points, color, width):
    """多遍抖动粗线，模拟蜡笔笔触（一次性生成，无动画）。"""
    for wdt in (width, width + 6, width + 12):
        for _ in range(3):
            pts = []
            for (px, py) in points:
                pts.append((px + random.randint(-4, 4), py + random.randint(-4, 4)))
            d.line(pts, fill=color, width=wdt, joint="curve")

# 红色蜡笔斜坡（从左下到右中）
crayon_line([(80, 900), (420, 700), (760, 520)], "#d9503f", 46)
# 深色描边
crayon_line([(80, 900), (420, 700), (760, 520)], "#8e2f24", 8)

# 红色小球（在斜坡上）
bx, by, br = 500, 640, 92
d.ellipse([bx - br, by - br, bx + br, by + br], fill="#d64f3f", outline="#8e2f24", width=10)
d.ellipse([bx - br + 22, by - br + 22, bx - br + 68, by - br + 58], fill="#fdf3ec")

# 黄色星星（右上）
def star(cx, cy, r_out, r_in, fill, outline, w):
    pts = []
    for i in range(10):
        r = r_out if i % 2 == 0 else r_in
        ang = -3.14159 / 2 + i * 3.14159 / 5
        pts.append((cx + math.cos(ang) * r, cy + math.sin(ang) * r))
    d.polygon(pts, fill=fill, outline=outline, width=w)

import math
# 光晕
d.ellipse([720 - 150, 240 - 150, 720 + 150, 240 + 150], fill="#ffe27a")
star(720, 240, 130, 58, "#f2c41b", "#b9890f", 10)
star(720, 240, 130, 58, None, "#8e6a00", 5)

# 左下角小文字块（工具名角标由构建框架叠加，此处留白）
im.save(r"F:\LoongBa_Git\LoongEduTools\RedTools\series\益智\逻辑思维\蜡笔物理\src\assets\icon_base.png", "PNG", optimize=True)
print("icon_base.png 生成完成")

