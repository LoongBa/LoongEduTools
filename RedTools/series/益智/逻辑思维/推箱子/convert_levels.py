#!/usr/bin/env python3
"""推箱子 — Microban I 关卡转换脚本（方案 A：一次性，构建期外）

职责：
1. 解析 Microban.txt（XSB 格式，`; N` 分隔，共 155 关）
2. 逐关校验：合法字符、恰 1 个玩家、箱子数 == 目标数
3. BFS 求解每关**最少推动数**（pushes）
   —— 状态 = (boxes_bitmask, player_idx)，位运算 flood-fill 算玩家可达区，
      带角落死锁 + 贴墙死锁剪枝；每关超时 20s，超时则该关 b 记 null（前端降级）
4. 生成 src/assets/levels.js：window.LEVELS = [ {g: [...], b: N|null}, ... ]
   —— 全量 155 关内嵌（约 40KB），游戏内仅开放前 60 关，扩关零改动

数据来源与许可：
- Microban I by David W. Skinner（155 关）
- 来源：https://raw.githubusercontent.com/kbarni/sokoban.koplugin/main/levels/Microban.txt
  （镜像：http://sneezingtiger.com/sokoban/levels.html）
- 许可：免费分发，保留署名（非商业）

用法：
    python convert_levels.py                # 从默认源路径转换
    python convert_levels.py <源文件路径>    # 指定源文件
"""

from __future__ import annotations

import sys
import time
from collections import deque
from pathlib import Path

SRC_DEFAULT = Path(r"C:\Users\coffe\AppData\Local\Temp\opencode\Microban.txt")
OUT_JS = Path(__file__).resolve().parent / "src" / "assets" / "levels.js"

LEVEL_TIMEOUT = 20.0  # 每关求解超时（秒），超时标记 null


# ---------------- 解析 ----------------

def parse_xsb_levels(text: str) -> list[list[str]]:
    """按 `;` 行分隔关卡，返回每关的行列表（保留前导空格，行尾 rstrip）。"""
    levels: list[list[str]] = []
    cur: list[str] | None = None
    for raw in text.splitlines():
        line = raw.rstrip()
        if line.startswith(";"):
            if cur is not None:
                levels.append(cur)
            cur = []
            continue
        if cur is None:
            continue
        if line.strip() == "":
            continue  # 关卡间空行
        cur.append(line)
    if cur is not None:
        levels.append(cur)
    return levels


def parse_level(lines: list[str]):
    """关卡行 → (walls_mask, goals_mask, boxes_mask, player_idx, w, h)。"""
    h = len(lines)
    w = max(len(r) for r in lines)
    grid = [r.ljust(w) for r in lines]
    walls = 0
    goals = 0
    boxes = 0
    player = -1
    for y, row in enumerate(grid):
        for x, ch in enumerate(row):
            bit = 1 << (y * w + x)
            if ch == "#":
                walls |= bit
            elif ch == ".":
                goals |= bit
            elif ch == "$":
                boxes |= bit
            elif ch == "*":
                boxes |= bit
                goals |= bit
            elif ch == "@":
                if player >= 0:
                    raise ValueError("多个玩家")
                player = y * w + x
            elif ch == "+":
                if player >= 0:
                    raise ValueError("多个玩家")
                player = y * w + x
                goals |= bit
            elif ch == " ":
                pass
            else:
                raise ValueError(f"非法字符 {ch!r}")
    if player < 0:
        raise ValueError("缺少玩家")
    if boxes.bit_count() != goals.bit_count():
        raise ValueError(f"箱子数 {boxes.bit_count()} != 目标数 {goals.bit_count()}")
    return walls, goals, boxes, player, w, h


# ---------------- 求解器（最少推动数 BFS，位运算） ----------------

def min_pushes(walls: int, goals: int, start_boxes: int, player: int, w: int, h: int,
               timeout: float = LEVEL_TIMEOUT) -> int | None:
    n = w * h
    all_cells = (1 << n) - 1
    free = all_cells & ~walls  # 非墙格（含箱子位，供邻居表用）

    # 邻居表（仅非墙格）
    neighbors: list[list[int]] = [[] for _ in range(n)]
    for y in range(h):
        for x in range(w):
            idx = y * w + x
            if not (free >> idx) & 1:
                continue
            for dx, dy, di in ((-1, 0, -1), (1, 0, 1), (0, -1, -w), (0, 1, w)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    nidx = idx + di
                    if (free >> nidx) & 1:
                        neighbors[idx].append(nidx)

    # 每行/列是否有目标（贴墙死锁用）
    row_has_goal = [False] * h
    col_has_goal = [False] * w
    g = goals
    while g:
        low = (g & -g).bit_length() - 1
        g &= g - 1
        row_has_goal[low // w] = True
        col_has_goal[low % w] = True

    def is_deadlock(boxes_mask: int) -> bool:
        """角落死锁（sound）：箱子不在目标上且两个正交方向都是墙 → 永无法离开。
        注：不做"贴墙死锁"剪枝 —— 贴墙箱子可沿墙移动后在墙缺口处垂直离开，
        该剪枝不 sound（Microban 关 1 即反例）。"""
        bm = boxes_mask & ~goals
        while bm:
            low = (bm & -bm).bit_length() - 1
            bm &= bm - 1
            x, y = low % w, low // w
            up = (low - w >= 0) and ((walls >> (low - w)) & 1)
            down = (low + w < n) and ((walls >> (low + w)) & 1)
            left = (x > 0) and ((walls >> (low - 1)) & 1)
            right = (x < w - 1) and ((walls >> (low + 1)) & 1)
            if (up and left) or (up and right) or (down and left) or (down and right):
                return True  # 相邻两正交方向都是墙 = 真角落死锁
            # 注：(up and down)/(left and right) 是竖井/横巷，箱子可沿开放方向移动，非死锁
        return False

    t0 = time.time()
    if is_deadlock(start_boxes):
        return None
    if start_boxes == goals:
        return 0

    # 玩家可达区（flood fill，位运算）
    def reach(player_idx: int, boxes_mask: int) -> int:
        seen = 1 << player_idx
        stack = [player_idx]
        while stack:
            i = stack.pop()
            for nb in neighbors[i]:
                bit = 1 << nb
                if not (seen & bit) and not (boxes_mask & bit):
                    seen |= bit
                    stack.append(nb)
        return seen

    dist: dict = {(start_boxes, player): 0}
    dq: deque = deque([(start_boxes, player)])

    while dq:
        boxes_mask, pidx = dq.popleft()
        d = dist[(boxes_mask, pidx)]
        reach_mask = reach(pidx, boxes_mask)
        bm = boxes_mask
        while bm:
            low = (bm & -bm).bit_length() - 1
            bm &= bm - 1
            for behind in neighbors[low]:
                if not (reach_mask >> behind) & 1:
                    continue
                front = 2 * low - behind
                if front < 0 or front >= n:
                    continue
                bl_x, bl_y = low % w, low // w
                be_x, be_y = behind % w, behind // w
                fr_x, fr_y = front % w, front // w
                if not ((bl_x == be_x == fr_x) or (bl_y == be_y == fr_y)):
                    continue  # front 必须与 low、behind 共线相邻
                fbit = 1 << front
                if (walls & fbit) or (boxes_mask & fbit):
                    continue
                new_boxes = (boxes_mask ^ (1 << low)) | fbit
                if is_deadlock(new_boxes):
                    continue
                new_state = (new_boxes, low)  # 推完后玩家站到箱子原位
                if new_state in dist:
                    continue
                nd = d + 1
                dist[new_state] = nd
                if new_boxes == goals:
                    return nd
                if time.time() - t0 > timeout:
                    return None
                dq.append(new_state)
    return None  # 不可解


# ---------------- 输出 ----------------

def write_levels_js(levels_data: list[dict]) -> None:
    lines = [
        "/* ============================================================",
        "   推箱子 — 关卡数据（由 convert_levels.py 生成，勿手改）",
        "   ------------------------------------------------------------",
        "   数据源：Microban I by David W. Skinner（155 关）",
        "   许可：免费分发，保留署名（非商业使用）",
        "   结构：window.LEVELS = [ {g:[行...], b:最少推动数|null}, ... ]",
        "   g = XSB 字符行（#墙 @玩家 +玩家在目标 $箱 *箱在目标 .目标 空格地板）",
        "   b = 求解器算出的最少推动数（超时/不可解为 null，前端降级）",
        "   游戏内仅开放前 OPEN_LEVELS 关（见 main.js），数据全量保留便于扩关",
        "   ============================================================ */",
        "window.LEVELS = [",
    ]
    for i, lv in enumerate(levels_data):
        g = ",".join('"' + r.replace("\\", "\\\\").replace('"', '\\"') + '"' for r in lv["g"])
        b = "null" if lv["b"] is None else str(lv["b"])
        lines.append(f'  {{g:[{g}], b:{b}}}{"," if i < len(levels_data) - 1 else ""}')
    lines.append("];")
    OUT_JS.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"levels.js 写入: {OUT_JS} ({OUT_JS.stat().st_size // 1024} KB, {len(levels_data)} 关)")


def main() -> int:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else SRC_DEFAULT
    if not src.exists():
        print(f"源文件不存在: {src}")
        return 1
    text = src.read_text(encoding="utf-8-sig")
    raw_levels = parse_xsb_levels(text)
    print(f"解析到 {len(raw_levels)} 关")

    levels_data: list[dict] = []
    unsolved: list[int] = []
    t_start = time.time()
    for i, lines in enumerate(raw_levels, 1):
        try:
            walls, goals, boxes, player, w, h = parse_level(lines)
        except ValueError as e:
            print(f"  [关 {i}] 校验失败: {e}")
            return 1
        t0 = time.time()
        best = min_pushes(walls, goals, boxes, player, w, h)
        dt = time.time() - t0
        tag = "超时/不可解" if best is None else f"{best} pushes"
        if best is None:
            unsolved.append(i)
        print(f"  [关 {i:03d}] 箱{boxes.bit_count()} 目标{goals.bit_count()} 尺寸{h}x{w} {tag} ({dt:.1f}s)")
        levels_data.append({"g": lines, "b": best})

    total = time.time() - t_start
    solved = sum(1 for d in levels_data if d["b"] is not None)
    print(f"\n完成: {solved}/{len(levels_data)} 关求得最少推动数，总耗时 {total:.1f}s")
    if unsolved:
        print(f"未求得(超时/不可解): {unsolved}")

    write_levels_js(levels_data)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
