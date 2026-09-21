# -*- coding: utf-8 -*-
"""
步骤③ 词库打标脚本
输入：pep_vocab.json（公共词库）+ 扩展句列表 + 当前册次单元（grade_num, unit_num）
输出：打标后的句列表（review:gX_uY / 超前标红 / 生僻标红）
判定规则（学四上 Unit N 时）：
  已学   = grade_num < 4  或 (grade_num==4 且 unit_num < N)
  本单元 = grade_num==4 且 unit_num==N
  超前   = grade_num==4 且 unit_num > N，或 grade_num>4
  生僻   = 词库未收录
"""
import json, sys, re

GRADE_MAP = {'一年级':1,'二年级':2,'三年级':3,'四年级':4,'五年级':5,'六年级':6}

# ---- 功能词白名单（词表只收实义词，冠词/代词/介词不算生僻）----
STOPWORDS = set(("what which whose who where when how why your his her its my our their "
                 "a an the this that these those i you he she it we they me him us them "
                 "is are am was were be been can could do does did have has had "
                 "to of in on at for with and or but not no yes so too very also").split())

# 不规则复数/词形（手工小词典）
IRREGULAR = {'children': 'child', 'men': 'man', 'women': 'woman',
             'feet': 'foot', 'teeth': 'tooth', 'mice': 'mouse', 'people': 'people'}

def normalize_candidates(w: str) -> list:
    """生成所有词形候选：原词 / 去s / 去es / 不规则 / 去缩略"""
    w = w.lower().strip()
    cands = [w]
    if w.endswith("'s"): cands.append(w[:-2])
    if w.endswith("'re"): cands.append(w[:-3])
    if w.endswith("'ve"): cands.append(w[:-3])
    if w in IRREGULAR: cands.append(IRREGULAR[w])
    if w.endswith('s') and not w.endswith('ss') and len(w) > 3: cands.append(w[:-1])
    if w.endswith('es') and len(w) > 4: cands.append(w[:-2])
    # 去重保序
    seen, out = set(), []
    for c in cands:
        if c not in seen:
            seen.add(c); out.append(c)
    return out

def load_index(vocab_path: str) -> dict:
    """建词索引: word(小写) -> (grade_num, unit_num)。短语词也单独建短语索引。"""
    with open(vocab_path, encoding='utf-8') as f:
        data = json.load(f)
    idx, phrases = {}, {}
    for book in data['books']:
        g = GRADE_MAP.get(book['grade'])
        if g is None: continue
        for u in book['units']:
            for w in u['words']:
                word = w['word'].lower().strip()
                idx.setdefault(word, []).append((g, u['unit']))
                if ' ' in word:   # 短语（office worker / look after）
                    phrases.setdefault(word, []).append((g, u['unit']))
    return idx, phrases

def classify(word: str, idx: dict, cur_g: int, cur_u: int, phrases: dict = None) -> str:
    """判定一个词的状态：learned/current/unknown/advanced/rare/stop。遍历词形候选。"""
    w = word.lower().strip()
    # 任一候选命中 STOPWORDS 即功能词
    cands = normalize_candidates(w)
    if any(c in STOPWORDS for c in cands):
        return 'stop'
    # 依次试候选查词库
    hit = None
    for c in cands:
        if c in idx:
            hit = c; break
    if hit is None:
        return 'rare'
    tags = idx[hit]
    for (g, u) in tags:
        if g < cur_g or (g == cur_g and u < cur_u):
            return f'review:g{g}_u{u}'
    for (g, u) in tags:
        if g == cur_g and u == cur_u:
            return 'current'
    return 'advanced'

def tag_sentence(text: str, idx: dict, cur_g: int, cur_u: int, phrases: dict = None) -> dict:
    """给一句打标：先挖掉短语，再逐词判定。"""
    t = text.lower()
    # 短语匹配：命中的短语从文本挖掉，逐词时不再拆判
    if phrases:
        for ph in phrases:
            t = t.replace(ph, ' ' * len(ph))
    words = re.findall(r"[a-zA-Z']+", t)
    reviews, advanced, rare = [], [], []
    for w in words:
        st = classify(w, idx, cur_g, cur_u, phrases)
        if st.startswith('review:'):
            reviews.append(st)
        elif st == 'advanced':
            advanced.append(w)
        elif st == 'rare':
            rare.append(w)
    return {
        'text': text,
        'tags': list(set(reviews)),   # review:gX_uY（去重）
        'advanced': list(set(advanced)),       # 超前词（标红）
        'rare': list(set(rare))                # 生僻词（标红）
    }

if __name__ == '__main__':
    vocab_path = sys.argv[1]
    cur_g = int(sys.argv[2])   # 当前年级（4）
    cur_u = int(sys.argv[3])   # 当前单元（1）
    extend_file = sys.argv[4] if len(sys.argv) > 4 else '03_extend_input.json'
    out_file = sys.argv[5] if len(sys.argv) > 5 else '03_extend_tagged.json'

    idx, phrases = load_index(vocab_path)
    with open(extend_file, encoding='utf-8') as f:
        sents = json.load(f)   # 例: ["What's your uncle's job?", ...]
    tagged = [tag_sentence(s, idx, cur_g, cur_u, phrases) for s in sents]
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(tagged, f, ensure_ascii=False, indent=2)
    n_review = sum(1 for t in tagged if t['tags'])
    n_bad = sum(1 for t in tagged if t['advanced'] or t['rare'])
    print(f'打标完成: {len(tagged)} 句, {n_review} 句含复习词, {n_bad} 句有超前/生僻 -> {out_file}')
