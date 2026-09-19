#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""华容道关卡生成器：经典布局 → levels.js（一次性转换脚本，可复算）

盘面：4 列 × 5 行，出口在底部中央。
胜：曹操(2×2) 左上角到达 (EXIT_R, EXIT_C) = (3,1)（占据 3-4 行、1-2 列）。
棋子：曹操 2×2、关羽 2×1（横）、四将 1×2（竖，同型互换）、小兵 1×1（同型互换）。

步数口径：单格步进（点箭头一次 = 1 步）——与游戏交互一致。
星级基准：BFS 最少步数 b：3 星 ≤1.5×b；2 星 ≤2.5×b；超时关卡 b=null（通关 2 星封顶）。

布局字符：c=曹操 g=关羽 z=张飞 y=赵云 m=马超 h=黄忠 b=小兵 .=空
输出：src/assets/levels.js  →  window.HRD = { levels: [...] }
"""
import json, collections, time, os

ROWS, COLS = 5, 4
EXIT_R, EXIT_C = 3, 1

LAYOUTS = [
    ("jinzai", "近在咫尺"),
    ("bingfen", "兵分三路"),
    ("cengceng", "层层设防"),
    ("hengdao", "横刀立马"),
]

BOARDS = {
    # 近在咫尺：曹操左上 (0,1)，出口正下方，路径短
    "jinzai": [
        ".cc.",
        "mcc h".replace(" ", ""),
        "mgg h".replace(" ", ""),
        "zbb y".replace(" ", ""),
        "zbb y".replace(" ", ""),
    ],
    # 兵分三路：曹操左上 (0,1)，中层兵阵
    "bingfen": [
        "mcc h".replace(" ", ""),
        "mcc h".replace(" ", ""),
        "zbb y".replace(" ", ""),
        "zgg y".replace(" ", ""),
        "b .. b".replace(" ", ""),
    ],
    # 层层设防：曹操左上 (0,0)，多道防线
    "cengceng": [
        "ccm h".replace(" ", ""),
        "ccm h".replace(" ", ""),
        "zbb y".replace(" ", ""),
        "zgg y".replace(" ", ""),
        "b .. b".replace(" ", ""),
    ],
    # 横刀立马：经典 81 步
    "hengdao": [
        "zcc y".replace(" ", ""),
        "zcc y".replace(" ", ""),
        "mgg h".replace(" ", ""),
        "mbb h".replace(" ", ""),
        "b .. b".replace(" ", ""),
    ],
}

PIECE_MAP = {'c': 'cao', 'g': 'guan', 'z': 'zhang', 'y': 'zhaoyun',
             'm': 'machao', 'h': 'huangzhong', 'b': 'soldier'}
# 每类棋子的固定尺寸 (w,h)：曹操2×2、关羽2×1、四将1×2、小兵1×1
PIECE_SIZE = {'cao': (2, 2), 'guan': (2, 1), 'zhang': (1, 2), 'zhaoyun': (1, 2),
              'machao': (1, 2), 'huangzhong': (1, 2), 'soldier': (1, 1)}


def parse_board(board):
    grid = [list(r) for r in board]
    pieces, claimed = {}, set()
    soldier_n = 0
    for r in range(ROWS):
        for c in range(COLS):
            if (r, c) in claimed or grid[r][c] == '.':
                continue
            ch = grid[r][c]
            pid = PIECE_MAP[ch]
            w, h = PIECE_SIZE[pid]
            # 校验该区域全部同字符（防御误布局）
            ok = all(grid[r + dr][c + dc] == ch
                     for dr in range(h) for dc in range(w))
            if not ok:
                raise ValueError("布局在 (%d,%d) 处尺寸不匹配 %s" % (r, c, pid))
            for dr in range(h):
                for dc in range(w):
                    claimed.add((r + dr, c + dc))
            if pid == 'soldier':
                soldier_n += 1
                pid = 'soldier%d' % soldier_n
            pieces[pid] = (w, h, r, c)
    # 校验小兵数量
    if soldier_n != 4:
        raise ValueError("小兵数量 %d != 4" % soldier_n)
    # 校验总占用 = 18（2 空）
    assert len(claimed) == 18, "占用格 %d != 18" % len(claimed)
    return pieces


def encode(pieces):
    cao = pieces['cao']
    g = pieces.get('guan')
    gens = sorted(pieces[k][2:] for k in ('zhang', 'zhaoyun', 'machao', 'huangzhong'))
    sols = sorted(pieces['soldier%d' % i][2:] for i in range(1, 5))
    return (cao[2], cao[3], g[2], g[3] if g else -1, tuple(gens), tuple(sols))


def decode(st):
    cao_r, cao_c, guan_r, guan_c, gens, sols = st
    out = {'cao': (2, 2, cao_r, cao_c)}
    if guan_r >= 0:
        out['guan'] = (2, 1, guan_r, guan_c)
    for i, (r, c) in enumerate(gens):
        out[['zhang', 'zhaoyun', 'machao', 'huangzhong'][i]] = (1, 2, r, c)
    for i, (r, c) in enumerate(sols):
        out['soldier%d' % (i + 1)] = (1, 1, r, c)
    return out


def occupied(pieces):
    occ = set()
    for w, h, r, c in pieces.values():
        for dr in range(h):
            for dc in range(w):
                occ.add((r + dr, c + dc))
    return occ


def neighbors(st):
    pcs = decode(st)
    occ = occupied(pcs)
    res = []
    for pid, (w, h, r, c) in pcs.items():
        own = set((r + rr, c + cc) for rr in range(h) for cc in range(w))
        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nr, nc = r + dr, c + dc
            if nr < 0 or nc < 0 or nr + h > ROWS or nc + w > COLS:
                continue
            conflict = False
            for rr in range(h):
                for cc in range(w):
                    cell = (nr + rr, nc + cc)
                    if cell in occ and cell not in own:
                        conflict = True
                        break
                if conflict:
                    break
            if conflict:
                continue
            np = dict(pcs)
            np[pid] = (w, h, nr, nc)
            ns = encode(np)
            if ns != st:
                res.append(ns)
    return res


def solve_min(board):
    pieces = parse_board(board)
    start = encode(pieces)
    if start[0] == EXIT_R and start[1] == EXIT_C:
        return 0, 0
    q = collections.deque([(start, 0)])
    seen = {start}
    t0 = time.time()
    while q:
        st, d = q.popleft()
        if time.time() - t0 > 240:
            return None, len(seen)
        for ns in neighbors(st):
            if ns in seen:
                continue
            if ns[0] == EXIT_R and ns[1] == EXIT_C:
                return d + 1, len(seen)
            seen.add(ns)
            q.append((ns, d + 1))
    return None, len(seen)


def build():
    levels = []
    for lid, name in LAYOUTS:
        board = BOARDS[lid]
        assert all(len(r) == COLS for r in board), (lid, [len(r) for r in board])
        print("[%s] %s BFS 求解中..." % (lid, name), flush=True)
        b, n = solve_min(board)
        if b is None:
            print("  ⚠ 超时/不可达（探索 %d 态），b=null" % n)
            star3 = star2 = None
        else:
            star3 = max(1, int(b * 1.5))
            star2 = max(1, int(b * 2.5))
            print("  ✅ 最少 %d 步（探索 %d 态） 3★≤%d 2★≤%d" % (b, n, star3, star2))
        levels.append({"id": lid, "name": name, "board": board,
                       "min": b, "star3": star3, "star2": star2})
    js = "/* 华容道关卡数据（构建期生成，勿手改）：4 关经典布局 + BFS 最少步数星级基准 */\n"
    js += "window.HRD = " + json.dumps({"levels": levels}, ensure_ascii=False) + ";\n"
    out = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "src", "assets", "levels.js"))
    with open(out, "w", encoding="utf-8") as f:
        f.write(js)
    print("\n已写出 %s（%d 字节）" % (out, len(js)))


if __name__ == "__main__":
    build()
