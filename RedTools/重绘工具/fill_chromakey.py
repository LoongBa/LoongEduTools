#!/usr/bin/env python3
"""AI 在纯绿底上写字 → 色度键去除绿色 → 合成到干净背景"""
import base64, io, os, requests, time
from PIL import Image, ImageDraw
import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
CLEAN = os.path.join(ROOT, 'tasks/pep4s_bg/output_v9_blocks/Page_012_clean.png')
OUT_DIR = os.path.join(ROOT, 'tasks/pep4s_bg/output_v12_ref')
API = 'https://token.sensenova.cn/v1/images/edits'

HOTSPOTS = [
    {'left': 0.0825, 'top': 0.0414, 'right': 0.3756, 'bottom': 0.0849,
     'text': 'Reading time'},
    {'left': 0.1517, 'top': 0.1429, 'right': 0.4109, 'bottom': 0.2308,
     'text': 'My mum is a writer.\nShe writes a lot of good books.'},
    {'left': 0.1576, 'top': 0.4400, 'right': 0.4860, 'bottom': 0.5083,
     'text': 'Mum is also a great cook.\nShe can cook great food!'},
]

# 绿幕色（纯绿 #00FF00）
CHROMA_KEY = (0, 255, 0)
TOLERANCE = 60  # 色度键容差

os.makedirs(OUT_DIR, exist_ok=True)
bg = Image.open(CLEAN).convert('RGBA')
w, h = bg.size
key = os.environ['SENSENOVA_API_KEY']


def remove_chroma(img):
    """用 HSV 色相去除绿色系背景，返回带透明通道的图。"""
    import cv2
    arr = np.array(img.convert('RGB'))
    hsv = cv2.cvtColor(arr, cv2.COLOR_RGB2HSV)
    h, s, v = hsv[:,:,0], hsv[:,:,1], hsv[:,:,2]
    # 绿色 HSV 范围：H=35-85, S>60, V>60（覆盖各种绿色变体）
    green_mask = (h > 35) & (h < 85) & (s > 60) & (v > 60)
    # 创建 RGBA
    rgba = np.dstack([arr, np.full_like(h, 255, dtype=np.uint8)])
    rgba[green_mask, 3] = 0
    return Image.fromarray(rgba)


results = []
for i, hs in enumerate(HOTSPOTS):
    if i > 0:
        time.sleep(3)

    # 创建纯绿底图 + 画框
    # 裁切：对不同热区用不同边距，确保宽高比 <= 1.8:1
    ar = (hs['right'] - hs['left']) / (hs['bottom'] - hs['top'])
    if ar > 1.2:
        pad_x, pad_y = 0.3, 2.0  # 宽矮热区：大幅扩展垂直，确保 AR <= 2:1
    else:
        pad_x, pad_y = 0.5, 1.0
    cx = (hs['left'] + hs['right']) / 2 * w
    cy = (hs['top'] + hs['bottom']) / 2 * h
    hw = (hs['right'] - hs['left']) / 2 * w * (1 + pad_x)
    hh = (hs['bottom'] - hs['top']) / 2 * h * (1 + pad_y)
    hw = max(hw, 160)
    hh = max(hh, 160)
    if hw / hh > 1.8:
        hh = hw / 1.8
    x1 = max(0, int(cx - hw))
    y1 = max(0, int(cy - hh))
    x2 = min(w, int(cx + hw))
    y2 = min(h, int(cy + hh))
    cw, ch = x2 - x1, y2 - y1

    # 绿底 + 红色框标记
    green_img = Image.new('RGB', (cw, ch), CHROMA_KEY)
    draw = ImageDraw.Draw(green_img)
    draw.rectangle([2, 2, cw-3, ch-3], outline=(255, 0, 0), width=2)

    # 保存
    crop_path = os.path.join(OUT_DIR, f'green_crop_{i}.png')
    green_img.save(crop_path)

    # base64
    buf = io.BytesIO()
    green_img.save(buf, format='PNG')
    crop_b64 = base64.b64encode(buf.getvalue()).decode()

    prompt = (
        '在这张纯绿色背景的图片中，红色矩形框内写入指定英文文字。'
        '要求：1）文字写在红框内，居中；2）字体圆润清晰，深色文字；'
        '3）红框外必须保持纯绿色不变；4）文字不能超出红框。\n'
        '写入文字：' + hs['text']
    )

    print(f'[{i+1}/3] {cw}x{ch}px calling API...')
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

            # 色度键去除绿色
            filled_t = remove_chroma(filled)

            # 缩放到裁切尺寸
            filled_t = filled_t.resize((cw, ch), Image.LANCZOS)

            out_path = os.path.join(OUT_DIR, f'chroma_{i}.png')
            filled_t.save(out_path)

            results.append({'idx': i, 'box': (x1, y1, x2, y2), 'img': filled_t})
            print(f'  -> OK ({len(img_data)//1024} KB)')
        else:
            print(f'  ERROR: {data}')
    except Exception as e:
        print(f'  EXCEPTION: {e}')

# 合成
print(f'\n合成 {len(results)} 个区域...')
composite = bg.copy()
for r in results:
    x1, y1, x2, y2 = r['box']
    composite.paste(r['img'], (x1, y1), r['img'])

out_final = os.path.join(OUT_DIR, 'Page_012_final_v2.png')
composite.save(out_final, 'PNG')
print(f'OK -> {out_final} ({os.path.getsize(out_final)//1024} KB)')
