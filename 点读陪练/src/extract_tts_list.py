# -*- coding: utf-8 -*-
"""从内容包递归提取全量 TTS 清单：找所有 {text, audio} 节点。"""
import json, sys, io

def walk(node, out):
    if isinstance(node, dict):
        if 'text' in node and 'audio' in node and node.get('audio'):
            out.append({'name': node['audio'], 'text': node['text']})
        for v in node.values():
            walk(v, out)
    elif isinstance(node, list):
        for it in node:
            walk(it, out)

pkg_path = sys.argv[1]
out_path = sys.argv[2]
pkg = json.load(open(pkg_path, encoding='utf-8'))
out = []
walk(pkg, out)
# 去重（按 name）
seen, uniq = set(), []
for it in out:
    if it['name'] not in seen:
        seen.add(it['name']); uniq.append(it)
with io.open(out_path, 'w', encoding='utf-8') as f:
    json.dump(uniq, f, ensure_ascii=False, indent=2)
print(f'提取 {len(uniq)} 条 TTS 任务 -> {out_path}')
