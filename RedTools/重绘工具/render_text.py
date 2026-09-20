#!/usr/bin/env python3
"""在干净背景上用 PIL 渲染文字（自动换行 + 左对齐）
标题：size 60 + 白色描边 5px；正文：size 48 左对齐"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
CLEAN = os.path.join(ROOT, 'tasks/pep4s_bg/output_v9_blocks/Page_012_clean.png')
OUT_DIR = os.path.join(ROOT, 'tasks/pep4s_bg/output_v14_pil')

# 热区坐标 + 文字
HOTSPOTS = [
    # 标题：大字号 + 描边
    {'left': 0.0825, 'top': 0.0414, 'right': 0.3756, 'bottom': 0.0849,
     'text': 'Reading time', 'font_size': 60, 'bold': True, 'stroke': 5},
    # 正文：左对齐
    {'left': 0.1517, 'top': 0.1429, 'right': 0.4109, 'bottom': 0.2308,
     'text': 'My mum is a writer.\nShe writes a lot of good books.',
     'font_size': 48, 'bold': False, 'stroke': 0},
    {'left': 0.1576, 'top': 0.4400, 'right': 0.4860, 'bottom': 0.5083,
     'text': 'Mum is also a great cook.\nShe can cook great food!',
     'font_size': 48, 'bold': False, 'stroke': 0},
]

os.makedirs(OUT_DIR, exist_ok=True)
bg = Image.open(CLEAN).convert('RGBA')
w, h = bg.size
print(f'背景尺寸: {w}x{h}')

def find_font(bold=False):
    """查找系统中可用的英文字体（优先 Candara）"""
    font_paths = [
        # Candara（优先）
        ('C:/Windows/Fonts/candara.ttf', False),
        ('C:/Windows/Fonts/candarab.ttf', True),
        # 其他候选
        ('C:/Windows/Fonts/segoeui.ttf', False),
        ('C:/Windows/Fonts/segoeuib.ttf', True),
        ('C:/Windows/Fonts/calibri.ttf', False),
        ('C:/Windows/Fonts/calibrib.ttf', True),
        ('C:/Windows/Fonts/arial.ttf', False),
        ('C:/Windows/Fonts/arialbd.ttf', True),
    ]
    for path, is_bold in font_paths:
        if os.path.exists(path) and is_bold == bold:
            return path
    # 回退
    for path, _ in font_paths:
        if os.path.exists(path):
            return path
    return None

def wrap_text(text, font, max_width):
    """按词断行，优先在句子边界（句号、感叹号）后换行"""
    lines = []
    for paragraph in text.split('\n'):
        # 先按句子分割
        sentences = []
        current = ''
        for char in paragraph:
            current += char
            if char in '.!?' and current.strip():
                sentences.append(current.strip())
                current = ''
        if current.strip():
            sentences.append(current.strip())
        
        # 尝试将句子组合成行
        current_line = ''
        for sentence in sentences:
            test_line = (current_line + ' ' + sentence).strip() if current_line else sentence
            bbox = font.getbbox(test_line)
            line_width = bbox[2] - bbox[0]
            if line_width <= max_width:
                current_line = test_line
            else:
                if current_line:
                    lines.append(current_line)
                # 如果单个句子就超宽，按词断行
                words = sentence.split()
                current_line = ''
                for word in words:
                    test = (current_line + ' ' + word).strip() if current_line else word
                    bbox = font.getbbox(test)
                    if bbox[2] - bbox[0] <= max_width:
                        current_line = test
                    else:
                        if current_line:
                            lines.append(current_line)
                        current_line = word
        if current_line:
            lines.append(current_line)
    return lines

def render_hotspot(bg, hs, font_path):
    """渲染单个热区的文字（左对齐 + 可选描边）"""
    # 计算像素坐标
    x1 = int(hs['left'] * w)
    y1 = int(hs['top'] * h)
    x2 = int(hs['right'] * w)
    y2 = int(hs['bottom'] * h)
    box_w = x2 - x1
    box_h = y2 - y1
    
    # 加载字体
    font_size = hs.get('font_size', 24)
    stroke_width = hs.get('stroke', 0)
    font = ImageFont.truetype(font_path, font_size)
    
    # 自动换行（留内边距）
    padding = 10 + stroke_width
    lines = wrap_text(hs['text'], font, box_w - padding * 2)
    
    # 计算文字总高度
    line_height = font_size + 8
    total_height = len(lines) * line_height
    
    # 垂直居中偏移
    y_offset = max(0, (box_h - total_height) // 2)
    
    # 创建临时图层绘制文字
    txt_layer = Image.new('RGBA', (box_w, box_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(txt_layer)
    
    # 绘制每行文字（左对齐）
    text_color = (30, 30, 30, 255)
    stroke_color = (255, 255, 255, 255) if stroke_width > 0 else None
    
    for i, line in enumerate(lines):
        y_pos = y_offset + i * line_height
        if stroke_width > 0:
            # 白色描边：先画白色偏移文字作为描边效果
            for dx in range(-stroke_width, stroke_width + 1, 2):
                for dy in range(-stroke_width, stroke_width + 1, 2):
                    draw.text((padding + dx, y_pos + dy), line, fill=stroke_color, font=font)
            # 再画文字本体
            draw.text((padding, y_pos), line, fill=text_color, font=font)
        else:
            draw.text((padding, y_pos), line, fill=text_color, font=font)
    
    # 合成到背景
    bg.paste(txt_layer, (x1, y1), txt_layer)
    return bg

# 查找字体
font_path = find_font(bold=False)
bold_font_path = find_font(bold=True)
print(f'字体: {font_path}')

# 渲染所有热区
composite = bg.copy()
for i, hs in enumerate(HOTSPOTS):
    fp = bold_font_path if hs.get('bold') else font_path
    composite = render_hotspot(composite, hs, fp)
    print(f'[{i+1}/3] 渲染完成: {hs["text"][:20]}...')

# 保存结果
out_path = os.path.join(OUT_DIR, 'Page_012_pil.png')
composite.save(out_path, 'PNG')
print(f'\n完成 -> {out_path} ({os.path.getsize(out_path)//1024} KB)')
