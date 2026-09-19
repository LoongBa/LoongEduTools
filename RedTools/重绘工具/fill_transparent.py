#!/usr/bin/env python3
"""分三次调用AI，每次在一个色框内写字（白底），然后合成到干净背景上"""
import base64, io, os, requests, time
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
REF = os.path.join(ROOT, 'tasks/pep4s_bg/output_v12_ref/ref_white_boxes.png')
CLEAN = os.path.join(ROOT, 'tasks/pep4s_bg/output_v9_blocks/Page_012_clean.png')
OUT_DIR = os.path.join(ROOT, 'tasks/pep4s_bg/output_v12_ref')
API = 'https://token.sensenova.cn/v1/images/edits'

HOTSPOTS = [
    {'left': 0.0825, 'top': 0.0414, 'right': 0.3756, 'bottom': 0.0849,
     'text': 'Reading time', 'font_size': 26, 'color': '#2e7d32'},
    {'left': 0.1517, 'top': 0.1429, 'right': 0.4109, 'bottom': 0.2308,
     'text': 'My mum is a writer.\nShe writes a lot of good books.', 'font_size': 20, 'color': '#333333'},
    {'left': 0.1576, 'top': 0.4400, 'right': 0.4860, 'bottom': 0.5083,
     'text': 'Mum is also a great cook.\nShe can cook great food!', 'font_size': 20, 'color': '#333333'},
]

os.makedirs(OUT_DIR, exist_ok=True)
bg = Image.open(CLEAN).convert('RGBA')
w, h = bg.size
key = os.environ['SENSENOVA_API_KEY']

# 加载参考图
ref = Image.open(REF)
rw, rh = ref.size

results = []
for i, hs in enumerate(HOTSPOTS):
    # 裁切参考图中的色框区域（扩大边距，确保 >= 256px 且宽高比 <= 2:1）
    pad_x = 0.5
    pad_y = 1.0  # 垂直方向更大边距，控制宽高比
    cx = (hs['left'] + hs['right']) / 2 * rw
    cy = (hs['top'] + hs['bottom']) / 2 * rh
    hw = (hs['right'] - hs['left']) / 2 * rw * (1 + pad_x)
    hh = (hs['bottom'] - hs['top']) / 2 * rh * (1 + pad_y)
    # 确保最小 280px 且宽高比 <= 2:1
    hw = max(hw, 140)
    hh = max(hh, 140)
    if hw / hh > 2.0:
        hh = hw / 2.0 + 1
    if hh / hw > 2.0:
        hw = hh / 2.0 + 1
    x1 = max(0, int(cx - hw))
    y1 = max(0, int(cy - hh))
    x2 = min(rw, int(cx + hw))
    y2 = min(rh, int(cy + hh))
    crop = ref.crop((x1, y1, x2, y2))

    # 保存裁切
    crop_path = os.path.join(OUT_DIR, f'ref_crop_{i}.png')
    crop.save(crop_path)

    # 转 base64
    buf = io.BytesIO()
    crop.save(buf, format='PNG')
    crop_b64 = base64.b64encode(buf.getvalue()).decode()

    prompt = (
        '请在这张图片的彩色矩形框内写入指定英文文字。'
        '要求：1）文字居中写在框内；2）字体圆润清晰；3）深色文字；'
        '4）文字不能超出框边界；5）框外区域保持纯白色不变。\n'
        '写入文字：' + hs['text']
    )

    print(f'[{i+1}/3] calling API...')
    if i > 0:
        time.sleep(3)  # 避免限流
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
            filled = Image.open(io.BytesIO(img_data)).convert('RGBA')
            out_path = os.path.join(OUT_DIR, f'ai_text_{i}.png')
            filled.save(out_path)
            results.append({'idx': i, 'crop_box': (x1, y1, x2, y2), 'filled': filled})
            print(f'  -> {out_path} ({len(img_data)//1024} KB)')
        else:
            print(f'  ERROR: {data}')
    except Exception as e:
        print(f'  EXCEPTION: {e}')

# 合成：去掉白色背景，贴到干净背景上
print(f'\n合成 {len(results)} 个文字区域...')
composite = bg.copy()

for r in results:
    filled = r['filled']
    x1, y1, x2, y2 = r['crop_box']
    cw, ch = x2 - x1, y2 - y1

    # 缩放填充图到裁切尺寸
    filled_resized = filled.resize((cw, ch), Image.LANCZOS)

    # 去白色：白色像素变透明
    pixels = filled_resized.load()
    for py in range(ch):
        for px in range(cw):
            r_val, g_val, b_val, a_val = pixels[px, py]
            if r_val > 230 and g_val > 230 and b_val > 230:
                pixels[px, py] = (r_val, g_val, b_val, 0)

    # 贴到背景
    composite.paste(filled_resized, (x1, y1), filled_resized)

out_final = os.path.join(OUT_DIR, 'Page_012_composite.png')
composite.save(out_final, 'PNG')
print(f'OK -> {out_final} ({os.path.getsize(out_final)//1024} KB)')
