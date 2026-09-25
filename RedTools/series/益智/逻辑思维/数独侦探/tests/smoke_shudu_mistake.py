#!/usr/bin/env python3
"""数独侦探 v1.6 冒烟测试：错题本/收藏本 + 提示带讲解·限流（Playwright + file://）

用例：
  A. 难度页：无📕错题本入口（空）· ⭐收藏本入口存在
  B. 4×4 冲突填数（错 1）→ 用一次提示（记 hintIdx）→ 求解通关（errors=1,hints=1 → 2★，结算含收藏按钮）
  C. 结算点「⭐ 收藏这局」→ 变「💛 取消收藏」；store 记 favorites 1 条 + mistakes 1 条
  D. 回难度页：📕错题本入口出现（1 条）· ⭐收藏本（1 条）
  E. 错题本：卡片 1 张（错 1/提示 1）→ ▶重练 → 错格浅红 replay-mark + 来源提示 → 全对通关
  F. 掌握即清：回难度 → 📕入口消失；⭐收藏本仍在
  G. 收藏本：卡片 1 张 → 🗑移除 → 空态
  H. 6×6 提示限流：用满 3 次后提示按钮 disabled
  I. 全程无 JS 报错
"""
from pathlib import Path
import json

from playwright.sync_api import sync_playwright

DIST = Path(__file__).resolve().parents[6].joinpath("RedTools", "dist", "益智", "数独侦探", "offline")
URL = DIST.joinpath("index.html").as_uri()
STORE_KEY = "redtools.shudurumen.v1"

FAILS = []


def check(name, cond, extra=""):
    if cond:
        print("  PASS  " + name)
    else:
        print("  FAIL  " + name + ("  | " + extra if extra else ""))
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
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL)
        page.evaluate("localStorage.clear()")
        page.reload()
        page.wait_for_timeout(300)

        # A. 难度页入口
        check("A1 📕错题本入口不存在（空）",
              page.locator(".book-btn", has_text="错题本").count() == 0)
        check("A2 ⭐收藏本入口存在",
              page.locator(".book-btn", has_text="收藏本").count() == 1)

        # B. 4×4 制造错题（冲突 + 提示 + 通关）
        page.locator(".diff-btn").nth(0).click()
        page.wait_for_timeout(400)
        size, puzzle, given = read_board(page)
        empty = [i for i in range(size) if not given[i]]
        # 选一个「所在行有已知数」的空格作为冲突目标（随机盘面下首个空格所在行可能全空）
        idx = None
        row_vals = []
        for cand in empty:
            r = cand // 4
            rv = [puzzle[r * 4 + x] for x in range(4) if puzzle[r * 4 + x] != 0]
            if rv:
                idx, row_vals = cand, rv
                break
        assert idx is not None and row_vals, "随机盘面无可行冲突目标（概率极低）"
        page.locator(".cell").nth(idx).click()
        page.wait_for_timeout(50)
        page.locator(".num-row .num-btn", has_text=str(row_vals[0])).click()
        page.wait_for_timeout(60)
        check("B1 冲突错误计数 1", "❌ 1" in page.locator(".footer-errors").inner_text())
        page.wait_for_timeout(400)
        page.locator(".tool-btn", has_text="提示").click()  # 记 hintIdx
        page.wait_for_timeout(150)
        check("B2 提示消息含'提示'", "提示" in page.locator(".sudoku-msg").inner_text())
        size, puzzle, given = read_board(page)
        sol = solve_via_page(page, puzzle, 4)
        check("B3 当前盘可解", sol is not None)
        if sol:
            fill_board(page, sol)
            page.wait_for_timeout(300)
            check("B4 结算浮层", page.locator(".overlay").count() == 1)
            check("B5 结算含「⭐ 收藏这局」",
                  page.locator(".overlay button", has_text="⭐ 收藏这局").count() == 1)

            # C. 收藏 toggle
            page.locator(".overlay button", has_text="⭐ 收藏这局").click()
            page.wait_for_timeout(150)
            check("C1 变「💛 取消收藏」",
                  page.locator(".overlay button", has_text="💛 取消收藏").count() == 1)
            store = read_store(page)
            check("C2 store.favorites 1 条", store and len(store.get("favorites", [])) == 1)
            check("C3 store.mistakes 1 条", store and len(store.get("mistakes", [])) == 1)

            # D. 返回难度页
            page.locator(".overlay button", has_text="再来一局").click()
            page.wait_for_timeout(300)
            page.locator("button:has-text('← 返回')").click()
            page.wait_for_timeout(200)
            check("D1 回难度页", page.locator(".diff-btn").count() == 3)
            check("D2 📕错题本入口出现(1)",
                  page.locator(".book-btn", has_text="错题本").count() == 1)
            check("D3 ⭐收藏本入口(1)",
                  page.locator(".book-btn", has_text="收藏本").count() == 1)

            # E. 错题本重练闭环
            page.locator(".book-btn", has_text="错题本").click()
            page.wait_for_timeout(200)
            check("E1 错题本视图", "错题本" in page.locator(".page-title").inner_text())
            check("E2 卡片 1 张", page.locator(".book-card").count() == 1)
            sub = page.locator(".book-card .teach-btn-sub").first.inner_text()
            check("E3 卡片含错/提示计数", ("错 1" in sub) and ("提示 1" in sub), sub)
            page.locator(".book-card .book-act", has_text="▶ 重练").click()
            page.wait_for_timeout(300)
            check("E4 重练进入对局", page.locator(".cell").count() == 16)
            check("E5 错格浅红 replay-mark",
                  page.locator(".cell-inner.replay-mark").count() >= 1)
            check("E6 重练来源提示", "错题本" in page.locator(".sudoku-msg").inner_text())
            size, puzzle, given = read_board(page)
            sol2 = solve_via_page(page, puzzle, 4)
            if sol2:
                fill_board(page, sol2)
                page.wait_for_timeout(300)
                check("E7 重练通关结算", page.locator(".overlay").count() == 1)
                store = read_store(page)
                check("E8 掌握即清（mistakes 空）",
                      store and len(store.get("mistakes", [])) == 0)

                # F. 回难度 → 📕消失
                page.locator(".overlay button", has_text="再来一局").click()
                page.wait_for_timeout(300)
                page.locator("button:has-text('← 返回')").click()
                page.wait_for_timeout(200)
                check("F1 📕入口消失（掌握即清）",
                      page.locator(".book-btn", has_text="错题本").count() == 0)
                check("F2 ⭐收藏本仍在",
                      page.locator(".book-btn", has_text="收藏本").count() == 1)

                # G. 收藏本移除 + 空态
                page.locator(".book-btn", has_text="收藏本").click()
                page.wait_for_timeout(200)
                check("G1 收藏本视图", "收藏本" in page.locator(".page-title").inner_text())
                check("G2 卡片 1 张", page.locator(".book-card").count() == 1)
                page.locator(".book-card .book-act", has_text="🗑").click()
                page.wait_for_timeout(200)
                check("G3 移除后空态", "还没有收藏" in page.locator(".book-empty").inner_text())
                store = read_store(page)
                check("G4 store.favorites 空", store and len(store.get("favorites", [])) == 0)
                page.locator("button:has-text('← 返回')").click()
                page.wait_for_timeout(200)

        # H. 6×6 提示限流
        page.locator(".diff-btn").nth(1).click()
        page.wait_for_timeout(400)
        for k in range(3):
            page.locator(".tool-btn", has_text="提示").click()
            page.wait_for_timeout(120)
        check("H1 提示按钮限流 disabled（3/3 用尽）",
              page.locator(".tool-btn", has_text="提示").is_disabled())

        # I. 无 JS 报错
        check("I1 全程无 JS 报错", len(errors) == 0, "; ".join(errors))

        browser.close()

    print("\n=== 结果：%d 项，失败 %d ===" % (29, len(FAILS)))
    if FAILS:
        print("失败项:", ", ".join(FAILS))
        raise SystemExit(1)


if __name__ == "__main__":
    main()