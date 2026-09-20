#!/usr/bin/env python3
"""渲染两种模式的演示图：
1. 顺序播放模式：高亮播放项 + 小喇叭图标 + 半透明背景框
2. 点读模式：高亮播放项 + 小喇叭图标 + 半透明背景框"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
CLEAN = os.path.join(ROOT, 'tasks/pep4s_bg/output_v9_blocks/Page_012_clean.png')
OUT_DIR = os.path.join(ROOT, 'tasks/pep4s_bg/output_v15_demo')

HOTSPOTS = [
    {'left': 0.0825, 'top': 0.0414, 'right': 0.3756, 'bottom': 0.0849,
     'text': 'Reading time'},
    {'left': 0.1517, 'top': 0.1429, 'right': 0.4109, 'bottom': 0.2308,
     'text': 'My mum is a writer.\nShe writes a lot of good books.'},
    {'left': 0.1576, 'top': 0.4400, 'right': 0.4860, 'bottom': 0.5083,
     'text': 'Mum is also a great cook.\nShe can cook great food!'},
]

# 样式配置
NORMAL_BG = (255, 255, 255, 60)      # 普通框：半透明白
ACTIVE_BG = (255, 255, 200, 100)     # 播放框：半透明黄
BORDER_NORMAL = (180, 180, 180, 200) # 普通框边框：浅灰
BORDER_ACTIVE = (255, 140, 0, 255)   # 播放框边框：橙色
TEXT_COLOR = (50, 50, 50, 255)
SPEAKER_COLOR = (255, 100, 0, 255)

os.makedirs(OUT_DIR, exist_ok=True)
bg = Image.open(CLEAN).convert('RGBA')
w, h = bg.size

def draw_speaker_icon(draw, x, y, size=32):
    """绘制小喇叭图标（更大更明显）"""
    # 喇叭主体（梯形）
    pts = [
        (x, y - size * 0.25),
        (x + size * 0.35, y - size * 0.45),
        (x + size * 0.35, y + size * 0.45),
        (x, y + size * 0.25),
    ]
    draw.polygon(pts, fill=SPEAKER_COLOR)
    # 声波弧线（更粗更明显）
    for r in [size * 0.55, size * 0.85]:
        draw.arc([x + size * 0.3, y - r, x + size * 0.3 + r * 2, y + r],
                 -45, 45, fill=SPEAKER_COLOR, width=4)

def render_frame(bg, playing_index, mode_label):
    """渲染一帧演示图"""
    frame = bg.copy()
    overlay = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    
    for i, hs in enumerate(HOTSPOTS):
        x1 = int(hs['left'] * w)
        y1 = int(hs['top'] * h)
        x2 = int(hs['right'] * w)
        y2 = int(hs['bottom'] * h)
        is_active = (i == playing_index)
        
        # 半透明背景
        bg_color = ACTIVE_BG if is_active else NORMAL_BG
        draw.rectangle([x1, y1, x2, y2], fill=bg_color)
        
        # 边框
        border_color = BORDER_ACTIVE if is_active else BORDER_NORMAL
        border_w = 4 if is_active else 2
        draw.rectangle([x1, y1, x2, y2], outline=border_color, width=border_w)
        
        # 播放中的框：右上角加小喇叭（突出显示）
        if is_active:
            draw_speaker_icon(draw, x2 - 40, y1 - 5, size=30)
    
    # 合成
    frame = Image.alpha_composite(frame, overlay)
    
    # 添加模式标签（用支持中文的字体）
    txt_layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    txt_draw = ImageDraw.Draw(txt_layer)
    # 优先使用中文字体
    cn_fonts = [
        'C:/Windows/Fonts/msyh.ttc',    # 微软雅黑
        'C:/Windows/Fonts/simhei.ttf',   # 黑体
        'C:/Windows/Fonts/simsun.ttc',   # 宋体
    ]
    font = None
    for f in cn_fonts:
        if os.path.exists(f):
            font = ImageFont.truetype(f, 36)
            break
    if font is None:
        font = ImageFont.load_default()
    txt_draw.text((50, h - 80), mode_label, fill=(100, 100, 100, 200), font=font)
    frame = Image.alpha_composite(frame, txt_layer)
    
    return frame

# 渲染顺序播放模式（正在播放第2项）
print('渲染顺序播放模式...')
seq_frame = render_frame(bg, 1, '顺序播放 - 正在播放第 2/3 项')
seq_path = os.path.join(OUT_DIR, 'demo_sequential.png')
seq_frame.save(seq_path, 'PNG')
print(f'  -> {seq_path}')

# 渲染点读模式（正在播放第2项）
print('渲染点读模式...')
tap_frame = render_frame(bg, 1, '点读模式 - 正在播放第 2 项')
tap_path = os.path.join(OUT_DIR, 'demo_tap.png')
tap_frame.save(tap_path, 'PNG')
print(f'  -> {tap_path}')

print(f'\n完成！输出目录: {OUT_DIR}')
