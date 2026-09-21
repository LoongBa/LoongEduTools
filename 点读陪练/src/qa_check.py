# -*- coding: utf-8 -*-
"""
步骤⑧ QA 校验脚本（7 项检查）
输入：内容包 JSON + assets 目录 + 词库
输出：qa_report.md（逐项通过/失败/警告）
"""
import json, sys, os, re

def _check_img(node, seg, assets_dir, missing_image, missing_prompt):
    """检查单个节点的 image 文件存在 + image_prompt 是否提供"""
    img = node.get('image')
    if not img:
        return
    if not node.get('image_prompt'):
        missing_prompt.append(f"{seg.get('id')}:{img}")
    p = os.path.join(assets_dir, 'images', img)
    if not os.path.exists(p):
        missing_image.append(img)

def run_qa(pkg_path, assets_dir, vocab_path):
    with open(pkg_path, encoding='utf-8') as f:
        pkg = json.load(f)
    checks = []

    # 1. Schema 合法
    try:
        assert 'schema_version' in pkg and 'segments' in pkg and 'abilities' in pkg
        checks.append(("Schema 合法", "PASS", "顶层字段齐"))
    except Exception as e:
        checks.append(("Schema 合法", "FAIL", str(e)))

    # 2. 词库判定（调 review_tag 的 classify）
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from review_tag import load_index, tag_sentence
    idx, phrases = load_index(vocab_path)
    bad = []
    for seg in pkg.get('segments', []):
        for layer in ['original', 'complete', 'extend']:
            for s in (seg.get('layers', {}) or {}).get(layer, []):
                r = tag_sentence(s['text'], idx, 4, 1, phrases)
                for w in r['advanced']:
                    bad.append((s['text'], w, 'advanced'))
                for w in r['rare']:
                    bad.append((s['text'], w, 'rare'))
    if bad:
        checks.append(("词库判定", "WARN", f"{len(bad)} 处超前/生僻词，需人审：{bad[:3]}..."))
    else:
        checks.append(("词库判定", "PASS", "无超前/生僻词"))

    # 3. 教材比对（跳过——需教材 OCR，人工）
    checks.append(("教材比对", "SKIP", "原文层已标 source:textbook，补全/扩展不照搬教材，人工抽查"))

    # 4. 绑定检查（图↔词↔音 ID 对齐）
    missing_audio, missing_image, missing_prompt = [], [], []
    for seg in pkg.get('segments', []):
        for layer in ['original', 'complete', 'extend']:
            for s in (seg.get('layers', {}) or {}).get(layer, []):
                if s.get('audio'):
                    p = os.path.join(assets_dir, 'audio', s['audio'])
                    if not os.path.exists(p):
                        missing_audio.append(s['audio'])
        for s in seg.get('quiz', []):
            _check_img(s, seg, assets_dir, missing_image, missing_prompt)
        for s in seg.get('produce_tasks', []):
            _check_img(s, seg, assets_dir, missing_image, missing_prompt)
        if seg.get('image'):
            _check_img(seg, seg, assets_dir, missing_image, missing_prompt)
        for h in (seg.get('scene', {}) or {}).get('hotspots', []):
            _check_img(h, seg, assets_dir, missing_image, missing_prompt)
        if seg.get('scene', {}).get('image'):
            _check_img(seg.get('scene'), seg, assets_dir, missing_image, missing_prompt)
        for g in seg.get('groups', []):
            for c in g.get('cards', []):
                _check_img(c, seg, assets_dir, missing_image, missing_prompt)
    lines = []
    if missing_audio:
        lines.append(f"{len(missing_audio)} 个音频缺失")
        checks.append(("绑定检查", "FAIL", f"音频缺失：{missing_audio[:3]}..."))
    elif missing_image or missing_prompt:
        detail = []
        if missing_image: detail.append(f"{len(missing_image)} 个图片缺失：{missing_image[:3]}")
        if missing_prompt: detail.append(f"{len(missing_prompt)} 张图无 prompt：{missing_prompt[:3]}")
        checks.append(("绑定检查", "WARN", '；'.join(detail)))
    else:
        checks.append(("绑定检查", "PASS", "音频文件齐全，图片全存在且全有 prompt"))

    # 5. 数量检查（能力 4 条）
    n_abilities = len(pkg.get('abilities', []))
    if n_abilities >= 4:
        checks.append(("数量检查", "PASS", f"{n_abilities} 条能力"))
    else:
        checks.append(("数量检查", "WARN", f"仅 {n_abilities} 条能力（应 4 条）"))

    # 6. 音频覆盖（同上，已在 4 检查）
    checks.append(("音频覆盖", "PASS" if not missing_audio else "FAIL", "同绑定检查"))

    # 7. 打印渲染（跳过——HTML 模板抽检）
    checks.append(("打印渲染", "SKIP", "打印版 HTML 模板人工抽检"))
    return checks

if __name__ == '__main__':
    pkg_path = sys.argv[1]
    assets_dir = sys.argv[2]
    vocab_path = sys.argv[3]
    out = sys.argv[4] if len(sys.argv) > 4 else '07_qa_report.md'
    checks = run_qa(pkg_path, assets_dir, vocab_path)
    lines = ["# QA 报告\n", "| 检查项 | 结果 | 说明 |", "|---|---|---|"]
    for name, status, note in checks:
        lines.append(f"| {name} | {status} | {note} |")
    with open(out, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    print(f"QA 完成 -> {out}")
    for name, status, note in checks:
        print(f"  [{status}] {name}: {note[:60]}")
