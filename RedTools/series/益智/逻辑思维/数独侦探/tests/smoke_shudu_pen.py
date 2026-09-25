#!/usr/bin/env python3
"""数独侦探 v1.1 候选笔记（铅笔模式）冒烟测试（Playwright + file://）

用例：
  P1 工具条有「✏ 笔记」按钮；进入铅笔模式 active + 提示说明
  P2 铅笔记候选：空格选中 + 铅笔下点数字 → note-slot.on 出现；再点取消
  P3 冲突候选拒绝：该格行/列/宫已有某数 → 记为候选被拒 + 温和提示 + 错误不增
  P4 自动铅笔：普通模式同行列宫填数 → 其他格同候选被清除
  P5 已填数格不显示 note
  P6 橡皮清空值+笔记，撤销恢复全量笔记
  P7 全程无 JS 报错 / 铅笔不产生错误
"""
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

DIST = Path(__file__).resolve().parents[6].joinpath("RedTools", "dist", "益智", "数独侦探", "offline")
URL = DIST.joinpath("index.html").as_uri()

FAILS = []


def check(name, cond, extra=""):
    if cond:
        print(f"  [PASS] {name}")
    else:
        print(f"  [FAIL] {name} {extra}")
        FAILS.append(name)


def same_box(a, b, n):
    br = 2 if n == 4 else (2 if n == 6 else 3)
    bc = 2 if n == 4 else (3 if n == 6 else 3)
    return (a // n // br) == (b // n // br) and ((a % n) // bc) == ((b % n) // bc)


def read_cell(page, idx):
    return page.evaluate("""function (i) {
      var inner = document.querySelectorAll('.cell-inner')[i];
      var note = inner.querySelector('.cell-note');
      // 有笔记网格时该格为空格（v=0）；否则取主数值文本
      var val;
      if (note) {
        val = 0;
      } else {
        val = inner.textContent === '' ? 0 : parseInt(inner.textContent, 10);
      }
      return {
        v: val,
        notes: [].map.call(inner.querySelectorAll('.note-slot.on'), function (s) {
          return Number(s.getAttribute('data-v'));
        }).sort(function (a, b) { return a - b; }),
        given: inner.className.indexOf('given') >= 0,
        cls: inner.className
      };
    }""", idx)


def read_board(page):
    n = page.evaluate("Math.round(Math.sqrt(document.querySelectorAll('.cell').length))")
    cells = [read_cell(page, i) for i in range(n * n)]
    return n, cells


def click_cell(page, idx):
    page.locator(".cell").nth(idx).click()
    page.wait_for_timeout(60)


def click_num(page, v):
    page.locator(".num-row .num-btn", has_text=str(v)).click()
    page.wait_for_timeout(70)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 390, "height": 844})
        js_errors = []
        page.on("pageerror", lambda e: js_errors.append(str(e)))
        page.goto(URL)
        page.wait_for_timeout(300)

        # 进简单 4×4（等待棋盘渲染稳定：最多重试 3 次等 16 格）
        page.locator(".diff-btn").nth(0).click()
        for _ in range(20):
            page.wait_for_timeout(100)
            if page.locator(".cell").count() == 16:
                break
        page.wait_for_timeout(200)

        pen_btn = page.locator(".tool-btn", has_text="笔记")
        check("P1-0 进入 4×4", page.locator(".cell").count() == 16)

        # 找 (idx, cand, peer?)：idx 空格 + 合法候选 cand；peer 尽量找（供自动铅笔联动）
        n, cells = read_board(page)
        puzzle_cells = cells
        idx_seed = None
        cand_seed = None
        peer_seed = None
        for idx in range(n * n):
            if cells[idx]["given"] or cells[idx]["v"] != 0:
                continue
            r, cc = idx // n, idx % n
            legal = []
            for cand in range(1, n + 1):
                occ = False
                for j in range(n * n):
                    if j == idx or cells[j]["v"] != cand:
                        continue
                    jr, jc = j // n, j % n
                    if jr == r or jc == cc or same_box(idx, j, n):
                        occ = True
                        break
                if not occ:
                    legal.append(cand)
            peers_by_cand = {}
            for cand in legal:
                plist = []
                for peer in range(n * n):
                    if peer == idx or cells[peer]["given"] or cells[peer]["v"] != 0:
                        continue
                    pr, pc = peer // n, peer % n
                    if not (pr == r or pc == cc or same_box(idx, peer, n)):
                        continue
                    ok = True
                    for j in range(n * n):
                        if j == peer or cells[j]["v"] != cand:
                            continue
                        jr, jc = j // n, j % n
                        if jr == pr or jc == pc or same_box(peer, j, n):
                            ok = False
                            break
                    if ok:
                        plist.append(peer)
                peers_by_cand[cand] = plist
            if legal:
                # 首选带 peer 的组合（能联动自动铅笔），否则退而求其次取单个合法候选
                for cand in legal:
                    if peers_by_cand[cand]:
                        idx_seed, cand_seed, peer_seed = idx, cand, peers_by_cand[cand][0]
                        break
                if idx_seed is None:
                    idx_seed, cand_seed = idx, legal[0]
                    peer_seed = None
            if idx_seed is not None:
                break
        check("P1-1 找到 (空格,合法候选)【可联动时带 peer】",
              idx_seed is not None and cand_seed is not None,
              "board=" + str([(c["v"], c["given"]) for c in cells]))
        if idx_seed is None:
            browser.close()
            raise SystemExit(1)
        idx, vkey, peer = idx_seed, cand_seed, peer_seed
        r, cc = idx // n, idx % n

        # P1 铅笔按钮 + 进入模式
        check("P1-2 铅笔按钮存在", pen_btn.count() == 1)
        click_cell(page, idx)
        pen_btn.click()
        page.wait_for_timeout(80)
        check("P2-1 铅笔按钮 active", "active" in pen_btn.get_attribute("class"))
        check("P2-2 提示说明", "铅笔模式" in page.locator(".sudoku-msg").inner_text())

        # P2 记候选 + 取消
        click_num(page, vkey)
        c = read_cell(page, idx)
        check("P2-3 候选已记录", c["v"] == 0 and c["notes"].count(vkey) == 1, str(c))
        click_num(page, vkey)
        c = read_cell(page, idx)
        check("P2-4 再点取消", c["v"] == 0 and c["notes"].count(vkey) == 0, str(c))

        # P2 重新记上（供后续自动铅笔联动）
        click_num(page, vkey)
        c = read_cell(page, idx)
        check("P2-5 重新记录候选", c["v"] == 0 and c["notes"].count(vkey) == 1, str(c))

        # P3 冲突候选拒绝：找该格行/列/宫已有数
        conflict_v = None
        for j in range(n * n):
            if j == idx or cells[j]["v"] == 0:
                continue
            jr, jc = j // n, j % n
            if jr == r or jc == cc or same_box(idx, j, n):
                conflict_v = cells[j]["v"]
                break
        check("P3-0 找到冲突数字", conflict_v is not None)
        if conflict_v:
            before_err = page.locator(".footer-errors").inner_text()
            click_num(page, conflict_v)
            c = read_cell(page, idx)
            check("P3-1 冲突候选被拒绝", c["notes"].count(conflict_v) == 0, str(c))
            check("P3-2 温和提示", "已经有" in page.locator(".sudoku-msg").inner_text())
            check("P3-3 错误不增", page.locator(".footer-errors").inner_text() == before_err)

        # 退出铅笔 → P4 自动铅笔：同行列宫 peer 格填 vkey → idx 候选被清
        pen_btn.click()
        page.wait_for_timeout(60)
        if peer is None:
            print("  [SKIP] P4 本盘无 (空格,候选,同行列宫可放格) 联动组合（自动铅笔由回归冒烟间接覆盖）")
        else:
            _, cells_now = read_board(page)
            pr, pc = peer // n, peer % n
            can_place_peer = True
            for j in range(n * n):
                if j == peer:
                    continue
                jr, jc = j // n, j % n
                if cells_now[j]["v"] == vkey and (jr == pr or jc == pc or same_box(peer, j, n)):
                    can_place_peer = False
                    break
            if can_place_peer:
                click_cell(page, peer)
                click_num(page, vkey)
                c = read_cell(page, idx)
                check("P4-1 自动铅笔清除本格候选", c["notes"].count(vkey) == 0, str(c))
            else:
                print("  [SKIP] P4 peer 不再可放 vkey（后续操作改盘面）")

        # P5 已填数格不显示 note（仅当此前产生了用户落子）
        _, cells_now = read_board(page)
        filled = [i for i in range(n * n) if cells_now[i]["v"] != 0 and not cells_now[i]["given"]]
        if len(filled) == 0:
            print("  [SKIP] P5 本盘无用户落子（P4 未联动，自动铅笔/落子由回归冒烟覆盖）")
        else:
            c = read_cell(page, filled[0])
            check("P5-1 已填格无 note", c["v"] != 0 and len(c["notes"]) == 0, str(c))

        # P6 橡皮+撤销 兼容笔记
        pen_btn.click()
        page.wait_for_timeout(60)
        n, cells_now = read_board(page)
        r, cc = idx // n, idx % n
        legal_cands = []
        for cand in range(1, n + 1):
            occ = False
            for j in range(n * n):
                if j == idx:
                    continue
                jr, jc = j // n, j % n
                if cells_now[j]["v"] == cand and (jr == r or jc == cc or same_box(idx, j, n)):
                    occ = True
                    break
            if not occ:
                legal_cands.append(cand)
        if len(legal_cands) >= 2:
            click_num(page, legal_cands[0])
            click_num(page, legal_cands[1])
            c = read_cell(page, idx)
            has_both = c["notes"].count(legal_cands[0]) == 1 and c["notes"].count(legal_cands[1]) == 1
            check("P6-0 两个候选已记录", has_both, str(c))
            if has_both:
                page.locator(".tool-btn", has_text="橡皮").click()
                page.wait_for_timeout(80)
                c = read_cell(page, idx)
                check("P6-1 橡皮清空值+笔记", c["v"] == 0 and len(c["notes"]) == 0, str(c))
                page.locator(".tool-btn", has_text="撤销").click()
                page.wait_for_timeout(80)
                c = read_cell(page, idx)
                check("P6-2 撤销恢复全量笔记",
                      c["v"] == 0 and c["notes"].count(legal_cands[0]) == 1 and c["notes"].count(legal_cands[1]) == 1,
                      str(c))
        else:
            print("  [SKIP] P6 未找到至少两个合法候选（随机盘面边界）")

        # P7 全程无 JS 报错 + 铅笔不产生错误计数
        err_text = page.locator(".footer-errors").inner_text()
        check("P7-1 铅笔未产生错误计数", "❌ 0" in err_text, err_text)
        check("P7-2 全程无 JS 报错", len(js_errors) == 0, "; ".join(js_errors))

        browser.close()

    print()
    if FAILS:
        print(f"RESULT: {len(FAILS)} FAILED -> {FAILS}")
        raise SystemExit(1)
    print("RESULT: ALL PASS")


if __name__ == "__main__":
    main()
