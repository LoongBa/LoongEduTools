#!/usr/bin/env python3
"""数独思维 冒烟测试（Playwright + 本地 chromium，file:// 协议）

用例：
  A. 首页：标题/版本/3 难度卡片/打卡入口
  B. 进入简单 4×4：16 格 + 数字条 4 键 + 已知格存在
  C. 选格：selected + peer（同行列宫）高亮
  D. 冲突填数：红闪 + 错误计数 +1 + 温和提示
  E. 合法填数：user 填充 + 无错误增加
  F. 橡皮：清除选中格
  G. 撤销：恢复上一步
  H. 提示：hints 使用 + 提示消息
  I. 通关（DOM 读盘 + 内联求解器填满）→ 结算 + 打卡 + history
  J. 再来一局 0 错 0 提示通关 → ★★★
  K. 困难 9×9：81 格 + 宫边界 box-t/box-l
  L. 全程无 JS 报错
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


def read_store(page):
    raw = page.evaluate("localStorage.getItem('%s')" % STORE_KEY)
    return json.loads(raw) if raw else None


def read_board(page):
    n = page.evaluate("document.querySelectorAll('.cell').length")
    size = int(round(n ** 0.5))
    data = page.evaluate("""function () {
      var cells = document.querySelectorAll('.cell .cell-inner');
      var out = [];
      for (var i = 0; i < cells.length; i++) {
        var inner = cells[i];
        out.push({ v: inner.textContent === '' ? 0 : parseInt(inner.textContent, 10),
                   given: inner.className.indexOf('given') >= 0 });
      }
      return out;
    }""")
    puzzle = [d["v"] for d in data]
    given = [d["given"] for d in data]
    return size, puzzle, given


def solve_via_page(page, puzzle, n):
    """页面上下文回溯求解（复用 window.SUDOKU.cellValid）"""
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
    size = len(solution)
    n = int(round(size ** 0.5))
    _, puzzle, given = read_board(page)
    for i in range(size):
        if given[i]:
            continue
        fill_cell(page, i, solution[i])
    page.wait_for_timeout(300)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 390, "height": 844})
        js_errors = []
        page.on("pageerror", lambda e: js_errors.append(str(e)))
        page.goto(URL)
        page.wait_for_timeout(300)

        # A. 首页
        check("A1 标题", page.locator(".header-title").inner_text() == "数独思维")
        check("A2 版本", page.locator(".header-ver").inner_text().startswith("v1.24"))
        check("A3 三张难度卡片", page.locator(".diff-btn").count() == 3)
        check("A4 打卡入口", page.locator(".btn-checkin").count() == 1)

        # B. 进入简单 4×4
        page.locator(".diff-btn").nth(0).click()
        page.wait_for_timeout(400)  # 出题（4×4 毫秒级）
        cells = page.locator(".cell")
        check("B1 16 格", cells.count() == 16)
        check("B2 数字条 4 键", page.locator(".num-row .num-btn").count() == 4)
        check("B3 已知格存在", page.locator(".cell-inner.given").count() >= 6)
        check("B4 计时可见", "⏱" in page.locator(".top-timer").inner_text())

        # C. 选格高亮
        size, puzzle, given = read_board(page)
        empty = [i for i in range(size * size) if not given[i]]
        check("C0 存在空格", len(empty) > 0)
        if empty:
            idx = empty[0]
            page.locator(".cell").nth(idx).click()
            page.wait_for_timeout(80)
            check("C1 选中高亮", "selected" in page.locator(".cell-inner").nth(idx).get_attribute("class"))
            peers = page.evaluate("""function () {
              var n = Math.round(Math.sqrt(document.querySelectorAll('.cell').length));
              var r = %d, c = %d;
              function sameBox(a, b) {
                var br = n === 4 ? 2 : (n === 6 ? 2 : 3), bc = n === 4 ? 2 : (n === 6 ? 3 : 3);
                return Math.floor(Math.floor(a / n) / br) === Math.floor(r / br) &&
                       Math.floor((a %% n) / bc) === Math.floor(c / bc);
              }
              var cnt = 0;
              for (var i = 0; i < n * n; i++) {
                if (i === r * n + c) { continue; }
                var rr = Math.floor(i / n), cc = i %% n;
                if (rr === r || cc === c || sameBox(i, r * n + c)) {
                  var cls = document.querySelectorAll('.cell-inner')[i].className;
                  if (cls.indexOf('peer') >= 0) { cnt++; }
                }
              }
              return cnt;
            }""" % (idx // 4, idx % 4))
            check("C2 同行列宫高亮 peer 数正确", peers == 7, str(peers))  # 4×4: 同行3+同列3+同宫2=8? 实测
            page.locator(".cell").nth(idx).click()  # 取消选中
            page.wait_for_timeout(80)

        # D. 冲突填数（找一个空格，填其行内已有数）
        if empty:
            idx = empty[0]
            r, c = idx // 4, idx % 4
            row_vals = [puzzle[r * 4 + x] for x in range(4) if puzzle[r * 4 + x] != 0]
            if row_vals:
                conflict_v = row_vals[0]
                before = page.locator(".footer-errors").inner_text()
                page.locator(".cell").nth(idx).click()
                page.wait_for_timeout(50)
                page.locator(".num-row .num-btn", has_text=str(conflict_v)).click()
                page.wait_for_timeout(60)
                check("D1 错误计数 +1", "❌ 1" in page.locator(".footer-errors").inner_text(), before)
                check("D2 温和提示", "已经有这个数" in page.locator(".sudoku-msg").inner_text())
                page.wait_for_timeout(400)

        # E. 合法填数（用求解器求该格正确值）
        size, puzzle, given = read_board(page)
        empty = [i for i in range(size * size) if not given[i]]
        sol = solve_via_page(page, puzzle, 4)
        check("E0 求解器可解", sol is not None)
        if empty and sol:
            idx = empty[0]
            v = sol[idx]
            errs_before = page.locator(".footer-errors").inner_text()
            # D 步冲突后选中可能仍停留在该格：已选中则不再点击（避免取消选中）
            cls = page.locator(".cell-inner").nth(idx).get_attribute("class")
            if "selected" not in cls:
                page.locator(".cell").nth(idx).click()
                page.wait_for_timeout(50)
            page.locator(".num-row .num-btn", has_text=str(v)).click()
            page.wait_for_timeout(80)
            check("E1 user 填充", str(v) in page.locator(".cell-inner").nth(idx).inner_text())
            check("E2 错误未增", page.locator(".footer-errors").inner_text() == errs_before)

        # F. 橡皮清除
        size, puzzle, given = read_board(page)
        filled_user = [i for i in range(size * size) if not given[i] and puzzle[i] != 0]
        if filled_user:
            idx = filled_user[0]
            cls = page.locator(".cell-inner").nth(idx).get_attribute("class")
            if "selected" not in cls:
                page.locator(".cell").nth(idx).click()
                page.wait_for_timeout(50)
            page.locator(".tool-btn", has_text="橡皮").click()
            page.wait_for_timeout(80)
            check("F1 橡皮清除", page.locator(".cell-inner").nth(idx).inner_text() == "")

        # G. 撤销恢复
        page.locator(".tool-btn", has_text="撤销").click()
        page.wait_for_timeout(80)
        check("G1 撤销恢复", page.locator(".cell-inner").nth(filled_user[0]).inner_text() != "")

        # H. 提示
        page.locator(".tool-btn", has_text="提示").click()
        page.wait_for_timeout(120)
        check("H1 提示消息", "提示" in page.locator(".sudoku-msg").inner_text())

        # I. 通关（当前局有错误+提示 → 结算 + 打卡）
        size, puzzle, given = read_board(page)
        sol2 = solve_via_page(page, puzzle, 4)
        check("I0 当前盘可解", sol2 is not None)
        if sol2:
            fill_board(page, sol2)
            check("I1 结算浮层", page.locator(".overlay").count() == 1)
            check("I2 打卡行", "今日已打卡" in page.locator(".checkin-line").inner_text())
            store = read_store(page)
            check("I3 store.best['4'] 已写", store and "4" in store.get("best", {}))
            check("I4 checkin 已打卡", store and len(store["checkin"]["dates"]) >= 1)
            check("I5 history 1 条", store and len(store.get("history", [])) == 1)

        # J. 再来一局 0 错 0 提示 → ★★★
        page.locator(".overlay button", has_text="再来一局").click()
        page.wait_for_timeout(400)
        size, puzzle, given = read_board(page)
        sol3 = solve_via_page(page, puzzle, 4)
        check("J0 新局可解", sol3 is not None)
        if sol3:
            fill_board(page, sol3)
            page.wait_for_timeout(300)
            check("J1 结算出现", page.locator(".overlay").count() == 1)
            check("J2 0 错 0 提示 3 星", "★★★" in page.locator(".stars-line").inner_text())
            check("J3 错误 0 次", "错误 0 次" in page.locator(".overlay-sub").inner_text())

        # 回到难度页 → K. 困难 9×9
        page.locator(".overlay button", has_text="选难度").click()
        page.wait_for_timeout(300)
        page.locator(".diff-btn").nth(2).click()
        page.wait_for_timeout(600)  # 9×9 出题
        check("K1 81 格", page.locator(".cell").count() == 81)
        check("K2 数字条 9 键", page.locator(".num-row .num-btn").count() == 9)
        check("K3 宫上边界存在", page.locator(".cell.box-t").count() >= 6)
        check("K4 宫左边界存在", page.locator(".cell.box-l").count() >= 6)
        size9, puzzle9, given9 = read_board(page)
        given_cnt = sum(1 for g in given9 if g)
        check("K5 已知格 33±4", 33 <= given_cnt <= 37, str(given_cnt))

        # L. 无 JS 报错
        check("L1 全程无 JS 报错", len(js_errors) == 0, "; ".join(js_errors))

        browser.close()

    print()
    if FAILS:
        print(f"RESULT: {len(FAILS)} FAILED -> {FAILS}")
        raise SystemExit(1)
    print("RESULT: ALL PASS")


if __name__ == "__main__":
    main()







