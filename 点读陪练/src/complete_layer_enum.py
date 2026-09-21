# -*- coding: utf-8 -*-
"""
步骤② 补全层枚举脚本
输入：骨架 JSON（patterns 含 frame + slot_map）+ 本单元词表
输出：02_complete_layer.json（句型框架 × 词表全量合法组合 + a/an 语法修正）
"""
import json, sys, itertools, re, os

# ---- a/an 修正规则：名词以元音音素开头用 an ----
VOWEL_SOUND = ('a', 'e', 'i', 'o', 'u')
def fix_a_an(noun: str) -> str:
    """名词前的 a/an 修正：返回正确的冠词"""
    n = noun.strip()
    # 简单规则：首字母元音音素开头（office worker / old / egg）
    if n and n[0].lower() in VOWEL_SOUND:
        return 'an ' + noun
    return 'a ' + noun

def build_complete_layer(skeleton: dict) -> list:
    """把每个 pattern 的 frame × slot_map 枚举成全部组合句"""
    layers = []
    for p in skeleton.get('patterns', []):
        frame = p['frame']
        slot_map = p['slot_map']          # {who: [father, grandpa...], job: [farmer, nurse...]}
        slots = list(slot_map.keys())     # [who, job]
        rows = []
        # 笛卡尔积：每槽位取一个词
        for combo in itertools.product(*[slot_map[s] for s in slots]):
            ctx = dict(zip(slots, combo))
            # 渲染句子
            sent = frame
            for s, v in ctx.items():
                sent = sent.replace('{' + s + '}', v)
            # a/an 修正：如果 frame 里有 a/{job} 或 a {job}，按 job 修正
            # 找到 job 槽位对应的名词，判断冠词
            job_slot = [s for s in slots if s in ('job', 'noun', 'place')]
            if job_slot:
                js = job_slot[0]
                noun = ctx[js]
                correct = fix_a_an(noun)
                # 把句子里 "a {noun}" 或 "a{noun}" 替换成正确冠词
                sent = re.sub(r'\b[an]\s+' + re.escape(noun), correct, sent, flags=re.IGNORECASE)
            rows.append({'text': sent, 'bind': ctx})
        layers.append({'pattern_id': p['id'], 'frame': frame, 'rows': rows})
    return layers

if __name__ == '__main__':
    # 读骨架（U01 示例）
    sk_path = sys.argv[1] if len(sys.argv) > 1 else '01_skeleton.json'
    out_path = sys.argv[2] if len(sys.argv) > 2 else '02_complete_layer.json'
    with open(sk_path, encoding='utf-8') as f:
        sk = json.load(f)
    result = build_complete_layer(sk)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    total = sum(len(l['rows']) for l in result)
    print(f'补全层生成: {len(result)} 个句型, 共 {total} 句 -> {out_path}')
