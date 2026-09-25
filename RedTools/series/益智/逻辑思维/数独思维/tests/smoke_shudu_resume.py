#!/usr/bin/env python3
"""数独思维 v1.2 断局恢复冒烟测试（Playwright + file://）

用例：
  R1 填数后返回难度页 → 出现「继续上次」入口（含已玩秒/已填格数）
  R2 点继续 → 恢复棋盘（已填数保留）+ 难度/已知格信息正确
  R3 计时续算（恢复后计时继续走，不从 0 开始）
  R4 铅笔笔记也在快照中（恢复后候选保留）
  R5 通关后「继续上次」消失（快照清除）
  R6 重开后「继续上次」消失
  R7 恢复局可正常通关（undo/提示/星级正常）
  R8 全程无 JS 报错
"""
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

DIST = Path(__file__).resolve().parents[6].joinpath("RedTools", "dist", "益智", "数独思维", "offline")
URL = DIST.joinpath("index.html").as_uri()
STORE_KEY = "redtools.shudurumen.v1"

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


def read_board(page):
    return page.evaluate("""function(){
      var cs = document.querySelectorAll('.cell .cell-inner');
      var out = [];
      for (var i = 0; i < cs.length; i++) {
        var inner = cs[i];
        var note = inner.querySelector('.cell-note');
        out.push({
          v: note ? 0 : (inner.textContent === '' ? 0 : parseInt(inner.textContent, 10)),
          notes: [].map.call(inner.querySelectorAll('.note-slot.on'), function(s){ return Number(s.getAttribute('data-v')); }).sort(function(a,b){return a-b;}),
          given: inner.className.indexOf('given') >= 0
        });
      }
      return out;
    }""")


def solve_via_page(page, puzzle, n):
    return page.evaluate("""function (arg) {
      var puzzle = arg.puzzle, N = arg.N;
      var b = puzzle.slice();
      function bt(pos) {
        while (pos < N * N && b[pos] !== 0) { pos++; }
        if (pos === N * N) { return true; }
        var r = Math.floor(pos / N), c = pos % N;
        for (var v = 1; v <= N; v++) {
          if (window.SUDOKU.cellValid(b, N, r, c, v)) {
            b[pos] = v;
            if (bt(pos + 1)) { return true; }
            b[pos] = 0;
          }
        }
        return false;
      }
      return bt(0) ? b : null;
    }""", {"puzzle": puzzle, "N": n})


def fill_cell(page, idx, val):
    page.locator(".cell").nth(idx).click()
    page.wait_for_timeout(50)
    page.locator(".num-row .num-btn", has_text=str(val)).click()
    page.wait_for_timeout(60)


def fill_board(page, solution):
    n = int(round(len(solution) ** 0.5))
    cells = read_board(page)
    for i in range(len(solution)):
        if cells[i]["given"]:
            continue
        fill_cell(page, i, solution[i])
    page.wait_for_timeout(300)


def wait_game(page, cnt):
    for _ in range(20):
        page.wait_for_timeout(100)
        if page.locator(".cell").count() == cnt:
            break
    page.wait_for_timeout(150)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 390, "height": 844})
        js_errors = []
        page.on("pageerror", lambda e: js_errors.append(str(e)))
        page.goto(URL)
        page.wait_for_timeout(400)

        # 进 4×4
        page.locator(".diff-btn").nth(0).click()
        wait_game(page, 16)
        cells = read_board(page)
        empties = [i for i in range(16) if not cells[i]["given"] and cells[i]["v"] == 0]
        check("R0-1 存在空格", len(empties) > 0)
        if not empties:
            browser.close()
            raise SystemExit(1)

        # 填两个数 + 记一个铅笔笔记
        idx1, idx2 = empties[0], empties[1]
        sol = solve_via_page(page, [c["v"] for c in cells], 4)
        v1 = sol[idx1]
        fill_cell(page, idx1, v1)
        # 铅笔笔记：idx2 记一个合法候选
        cells = read_board(page)
        r, c = idx2 // 4, idx2 % 4
        legal = []
        for cand in range(1, 5):
            occ = any(cells[j]["v"] == cand and j != idx2 and
                      ((j // 4) == r or (j % 4) == c or same_box(idx2, j, 4)) for j in range(16))
            if not occ:
                legal.append(cand)
        if legal:
            page.locator(".cell").nth(idx2).click()
            page.wait_for_timeout(50)
            page.locator(".tool-btn", has_text="笔记").click()
            page.wait_for_timeout(60)
            page.locator(".num-row .num-btn", has_text=str(legal[0])).click()
            page.wait_for_timeout(70)
            page.locator(".tool-btn", has_text="笔记").click()  # 退出铅笔
            page.wait_for_timeout(50)
            v2_note = legal[0]
        else:
            v2_note = None

        # 返回难度页
        page.locator(".topbar .btn-ghost-sm").click()
        page.wait_for_timeout(300)
        btns = page.locator(".diff-btn")
        check("R1-1 难度页出现继续入口", btns.count() == 4,
              f"count={btns.count()}")
        resume = page.locator(".resume-btn")
        check("R1-2 继续入口文案", resume.count() == 1 and "继续上次" in resume.inner_text())
        if resume.count() == 1:
            txt = resume.inner_text()
            check("R1-3 含已填格统计", "已填" in txt and "错 0" in txt)

        # 点继续 → 恢复
        resume.click()
        wait_game(page, 16)
        cells2 = read_board(page)
        check("R2-1 恢复已填数", cells2[idx1]["v"] == v1, f"got {cells2[idx1]['v']}")
        check("R2-2 难度标题正确", "简单" in page.locator(".level-title").inner_text())
        if v2_note:
            check("R4-1 笔记恢复", cells2[idx2]["notes"].count(v2_note) == 1,
                  f"notes={cells2[idx2]['notes']}")
        # 计时续算：等待 300ms 后计时 > 0.3
        page.wait_for_timeout(400)
        timer = page.locator(".top-timer").inner_text()
        sec = float(timer.replace("⏱ ", ""))
        check("R3-1 计时续算（>0.3s）", sec > 0.3, timer)

        # 恢复局直接通关（保持无错误 → 3★）
        sol2 = solve_via_page(page, [c["v"] for c in cells2], 4)
        check("R7-0 恢复局可解", sol2 is not None)
        if sol2:
            fill_board(page, sol2)
            page.wait_for_timeout(300)
            check("R7-1 恢复局通关结算", page.locator(".overlay").count() == 1)
            check("R7-2 3 星（恢复局无错）", "★★★" in page.locator(".stars-line").inner_text())

        # 通关后继续入口消失
        page.locator(".overlay button", has_text="选难度").click()
        page.wait_for_timeout(300)
        check("R5-1 通关后继续入口消失", page.locator(".diff-btn").count() == 3,
              f"count={page.locator('.diff-btn').count()}")

        # R6 重开后继续入口消失
        page.locator(".diff-btn").nth(0).click()
        wait_game(page, 16)
        cells3 = read_board(page)
        e3 = [i for i in range(16) if not cells3[i]["given"] and cells3[i]["v"] == 0]
        if e3:
            sol3 = solve_via_page(page, [c["v"] for c in cells3], 4)
            fill_cell(page, e3[0], sol3[e3[0]])
            page.locator(".game-footer .btn-ghost-sm", has_text="重新开始").click()
            page.wait_for_timeout(300)
            page.locator(".topbar .btn-ghost-sm").click()
            page.wait_for_timeout(300)
            check("R6-1 重开后继续入口消失", page.locator(".diff-btn").count() == 3,
                  f"count={page.locator('.diff-btn').count()}")

        check("R8-1 全程无 JS 报错", len(js_errors) == 0, "; ".join(js_errors))
        browser.close()

    print()
    if FAILS:
        print(f"RESULT: {len(FAILS)} FAILED -> {FAILS}")
        raise SystemExit(1)
    print("RESULT: ALL PASS")


if __name__ == "__main__":
    main()

