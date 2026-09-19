#!/usr/bin/env python3
"""裁切热区 → AI 在小区域内写文字 → 贴回原位"""
import base64
import io
import os
import requests
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
CLEAN = os.path.join(ROOT, 'tasks/pep4s_bg/output_v9_blocks/Page_012_clean.png')
OUT_DIR = os.path.join(ROOT, 'tasks/pep4s_bg/output_v11_fill')
API = 'https://token.sensenova.cn/v1/images/edits'

HOTSPOTS = [
    {'left': 0.0825, 'top': 0.0414, 'right': 0.3756, 'bottom': 0.0849,
     'text': 'Reading time'},
    {'left': 0.1517, 'top': 0.1429, 'right': 0.4109, 'bottom': 0.2308,
     'text': 'My mum is a writer.\nShe writes a lot of good books.'},
    {'left': 0.1576, 'top': 0.4400, 'right': 0.4860, 'bottom': 0.5083,
     'text': 'Mum is also a great cook.\nShe can cook great food!'},
]

os.makedirs(OUT_DIR, exist_ok=True)
bg = Image.open(CLEAN)
w, h = bg.size
key = os.environ['SENSENOVA_API_KEY']

for i, hs in enumerate(HOTSPOTS):
    # 裁切热区（扩大 20% 留边距）
    pad = 0.2
    x1 = max(0, int(hs['left'] * w * (1 - pad)))
    y1 = max(0, int(hs['top'] * h * (1 - pad)))
    x2 = min(w, int(hs['right'] * w * (1 + pad)))
    y2 = min(h, int(hs['bottom'] * h * (1 + pad)))
    crop = bg.crop((x1, y1, x2, y2))

    # 保存裁切
    crop_path = os.path.join(OUT_DIR, f'crop_{i}.png')
    crop.save(crop_path)

    # 转 base64
    buf = io.BytesIO()
    crop.save(buf, format='PNG')
    crop_b64 = base64.b64encode(buf.getvalue()).decode()

    prompt = (
        '在这张图片的文字区域写入以下英文文字，'
        '字体清晰圆润，深色文字，居中显示：\n' + hs['text']
    )

    print(f'[{i+1}/3] calling API...')
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
        out_path = os.path.join(OUT_DIR, f'filled_{i}.png')
        filled.save(out_path)
        print(f'  -> {out_path} ({len(img_data)//1024} KB)')
    else:
        print(f'  ERROR: {data}')

print('All done')
