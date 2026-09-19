#!/usr/bin/env python3
"""AI 在纯绿底上写字 → 色度键去除绿色 → 合成到干净背景
绿底上画原始热区红框（精确坐标），裁切时加边距满足 API 要求"""
import base64, io, os, requests, time
from PIL import Image, ImageDraw
import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
CLEAN = os.path.join(ROOT, 'tasks/pep4s_bg/output_v9_blocks/Page_012_clean.png')
OUT_DIR = os.path.join(ROOT, 'tasks/pep4s_bg/output_v12_ref')
API = 'https://token.sensenova.cn/v1/images/edits'

# 原始热区坐标 + 对应文字
HOTSPOTS = [
    {'left': 0.0825, 'top': 0.0414, 'right': 0.3756, 'bottom': 0.0849,
     'text': 'Reading time'},
    {'left': 0.1517, 'top': 0.1429, 'right': 0.4109, 'bottom': 0.2308,
     'text': 'My mum is a writer.\nShe writes a lot of good books.'},
    {'left': 0.1576, 'top': 0.4400, 'right': 0.4860, 'bottom': 0.5083,
     'text': 'Mum is also a great cook.\nShe can cook great food!'},
]

os.makedirs(OUT_DIR, exist_ok=True)
bg = Image.open(CLEAN).convert('RGBA')
w, h = bg.size
key = os.environ['SENSENOVA_API_KEY']


def remove_chroma(img):
    """HSV 色相去除绿色系背景。"""
    import cv2
    arr = np.array(img.convert('RGB'))
    hsv = cv2.cvtColor(arr, cv2.COLOR_RGB2HSV)
    hue, sat, val = hsv[:,:,0], hsv[:,:,1], hsv[:,:,2]
    green_mask = (hue > 35) & (hue < 85) & (sat > 60) & (val > 60)
    rgba = np.dstack([arr, np.full_like(hue, 255, dtype=np.uint8)])
    rgba[green_mask, 3] = 0
    return Image.fromarray(rgba)


# 先生成绿底参考图（精确红框）
ref_full = Image.new('RGB', (w, h), (0, 255, 0))
ref_draw = ImageDraw.Draw(ref_full)
for hs in HOTSPOTS:
    x1, y1 = int(hs['left']*w), int(hs['top']*h)
    x2, y2 = int(hs['right']*w), int(hs['bottom']*h)
    ref_draw.rectangle([x1,y1,x2,y2], outline=(255,0,0), width=3)
ref_full.save(os.path.join(OUT_DIR, 'ref_green_exact.png'), 'PNG')

results = []
for i, hs in enumerate(HOTSPOTS):
    if i > 0:
        time.sleep(3)

    # 原始热区像素坐标
    bx1 = int(hs['left'] * w)
    by1 = int(hs['top'] * h)
    bx2 = int(hs['right'] * w)
    by2 = int(hs['bottom'] * h)
    bw, bh = bx2 - bx1, by2 - by1

    # 加边距裁切（满足 API 2:1 宽高比限制）
    target_ar = 1.8
    px = int(bw * 0.3)
    needed_h = bw / target_ar
    py = max(int(bh * 0.3), int((needed_h - bh) / 2) + 1)
    cx1 = max(0, bx1 - px)
    cy1 = max(0, by1 - py)
    cx2 = min(w, bx2 + px)
    cy2 = min(h, by2 + py)
    cw, ch = cx2 - cx1, cy2 - cy1

    # 绿底裁切 + 原始热区红框（在裁切区域内精确定位）
    green_crop = Image.new('RGB', (cw, ch), (0, 255, 0))
    gd = ImageDraw.Draw(green_crop)
    # 红框在裁切图中的相对坐标
    rx1 = bx1 - cx1
    ry1 = by1 - cy1
    rx2 = bx2 - cx1
    ry2 = by2 - cy1
    gd.rectangle([rx1, ry1, rx2, ry2], outline=(255, 0, 0), width=3)

    crop_path = os.path.join(OUT_DIR, f'green_crop_{i}.png')
    green_crop.save(crop_path)

    # base64
    buf = io.BytesIO()
    green_crop.save(buf, format='PNG')
    crop_b64 = base64.b64encode(buf.getvalue()).decode()

    prompt = (
        '在这张纯绿色背景的图片中，红色矩形框内写入指定英文文字。'
        '要求：1）文字写在红框内，居中；2）字体圆润清晰，深色文字；'
        '3）红框外必须保持纯绿色不变；4）文字不能超出红框。\n'
        '写入文字：' + hs['text']
    )

    print(f'[{i+1}/3] crop={cw}x{ch}px  box={bw}x{bh}px  calling API...')
    try:
        resp = requests.post(API, headers={
            'Authorization': f'Bearer {key}',
            'Content-Type': 'application/json'
        }, json={
            'model': 'sensenova-u1.5-lite',
            'images': [{'image_url': f'data:image/png;base64,{crop_b64}'}],
            'prompt': prompt,
            'size': 'auto',
            'n': 1,
            'watermark': False,
            'prompt_extend': True,
            'response_format': 'url'
        }, timeout=600)

        data = resp.json()
        if 'data' in data and len(data['data']) > 0:
            img_url = data['data'][0].get('url') or data['data'][0].get('b64_json')
            if img_url and img_url.startswith('http'):
                img_data = requests.get(img_url, timeout=60).content
            else:
                img_data = base64.b64decode(img_url)
            filled = Image.open(io.BytesIO(img_data))

            # 色度键去绿
            filled_t = remove_chroma(filled)
            # 缩放到裁切尺寸
            filled_t = filled_t.resize((cw, ch), Image.LANCZOS)

            out_path = os.path.join(OUT_DIR, f'chroma_{i}.png')
            filled_t.save(out_path)

            # 合成时用原始热区坐标（不是裁切坐标）
            results.append({
                'orig_box': (bx1, by1, bx2, by2),
                'crop_box': (cx1, cy1, cx2, cy2),
                'img': filled_t
            })
            print(f'  -> OK')
        else:
            print(f'  ERROR: {data}')
    except Exception as e:
        print(f'  EXCEPTION: {e}')

# 合成：将 AI 文字贴到原始热区位置
print(f'\n合成 {len(results)} 个区域...')
composite = bg.copy()
for r in results:
    bx1, by1, bx2, by2 = r['orig_box']
    cx1, cy1, cx2, cy2 = r['crop_box']
    # 从裁切图中提取原始热区对应的像素，贴到背景
    img = r['img']
    # 相对坐标
    rel_x = bx1 - cx1
    rel_y = by1 - cy1
    box_w = bx2 - bx1
    box_h = by2 - by1
    # 裁切出原始热区范围
    region = img.crop((rel_x, rel_y, rel_x + box_w, rel_y + box_h))
    composite.paste(region, (bx1, by1), region)

out_final = os.path.join(OUT_DIR, 'Page_012_final_v3.png')
composite.save(out_final, 'PNG')
print(f'OK -> {out_final} ({os.path.getsize(out_final)//1024} KB)')
