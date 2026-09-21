# -*- coding: utf-8 -*-
"""合并全量 TTS 清单：内容包提取 + 补全层枚举（自动编号 audio_id）。"""
import json, sys, io, re

b = r'F:\LoongBa_Git\LoongEduTools\docs\教育工具\点读陪练\build\u01'

# 1. 内容包提取
def walk(node, out):
    if isinstance(node, dict):
        if 'text' in node and 'audio' in node and node.get('audio'):
            out.append({'name': node['audio'], 'text': node['text']})
        for v in node.values(): walk(v, out)
    elif isinstance(node, list):
        for it in node: walk(it, out)

pkg = json.load(open(b + r'\u01_content_package.json', encoding='utf-8'))
items = []
walk(pkg, items)

# 2. 补全层枚举（自动编号 u01_{pattern}_compNNN）
complete = json.load(open(b + r'\02_complete_layer.json', encoding='utf-8'))
for pat in complete:
    pid = pat['pattern_id']
    for i, row in enumerate(pat['rows'], 1):
        items.append({'name': f'u01_{pid}_comp{i:03d}.mp3', 'text': row['text']})

# 去重
seen, uniq = set(), []
for it in items:
    if it['name'] not in seen:
        seen.add(it['name']); uniq.append(it)
uniq.sort(key=lambda x: x['name'])

with io.open(b + r'\assets_tts_list.json', 'w', encoding='utf-8') as f:
    json.dump(uniq, f, ensure_ascii=False, indent=2)
print(f'全量 TTS 清单: {len(uniq)} 条')
