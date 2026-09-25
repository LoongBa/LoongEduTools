#!/usr/bin/env python3
"""数独思维 v1.9 冒烟测试：家长报告（今日反馈/近 7 天/技巧掌握度）+ 9×9 小屏适配（Playwright + file://）

用例：
  A. 难度页「📊 家长报告」入口存在
  B. 完成 2 局 4×4（1 局带错误提示）→ 通关后进家长报告
  C. 今日反馈卡：完成 2 局 · 平均用时 / 错误合计 1 次 · 提示合计 1 次 / 平均星级
  D. 近 7 天卡：完成 2 局 · 难度分布（简单 4×4：2 局）· 技巧掌握度（X/4 枚 + 徽章状态行）
  E. 9×9 竖屏进入：建议横屏浮层出现（一次性）→ 知道了关闭
  F. 家长报告 ← 返回 → 难度页
  G. 全程无 JS 报错
"""
from pathlib import Path
import json

from playwright.sync_api import sync_playwright

DIST = Path(__file__).resolve().parents[6].joinpath("RedTools", "dist", "益智", "数独思维", "offline")
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
      return out; }""")
    return size, [d["v"] for d in data], [d["given"] for d in data]


def solve_via_page(page, puzzle, n):
    return page.evaluate("""function (arg) {
      var puzzle = arg.puzzle, N = arg.N; var b = puzzle.slice();
      function bt(pos) {
        while (pos < N*N && b[pos] !== 0) { pos++; }
        if (pos === N*N) { return true; }
        var r = Math.floor(pos/N), c = pos%N;
        for (var v=1; v<=N; v++) { if (window.SUDOKU.cellValid(b,N,r,c,v)) { b[pos]=v; if (bt(pos+1)) return true; b[pos]=0; } }
        return false; }
      return bt(0) ? b : null; }""", {"puzzle": puzzle, "N": n})


def win_4x4(page, with_error):
    page.locator(".diff-btn").nth(0).click()
    page.wait_for_timeout(400)
    size, puzzle, given = read_board(page)
    if with_error:
        # 制造一次冲突：找一个所在行有已知数的空格填错（errors+1）
        empty = [i for i in range(size * size) if not given[i]]
        for cand in empty:
            r = cand // 4
            rv = [puzzle[r * 4 + x] for x in range(4) if puzzle[r * 4 + x] != 0]
            if rv:
                page.locator(".cell").nth(cand).click(); page.wait_for_timeout(50)
                page.locator(".num-row .num-btn", has_text=str(rv[0])).click(); page.wait_for_timeout(60)
                page.wait_for_timeout(400)
                break
        # 用一次提示（hints+1，凑足报告断言'提示合计 1 次'；且刷新盘面状态）
        page.locator(".tool-btn", has_text="提示").click()
        page.wait_for_timeout(150)
        size, puzzle, given = read_board(page)
    sol = solve_via_page(page, puzzle, 4)
    if not sol:
        return False
    # toggle-safe 填充：已选中格先取消再选中，避免点击取消竞态
    for i in range(size * size):
        if given[i]:
            continue
        cls = page.locator(".cell-inner").nth(i).get_attribute("class")
        if "selected" in cls:
            page.locator(".cell").nth(i).click(); page.wait_for_timeout(40)
        page.locator(".cell").nth(i).click(); page.wait_for_timeout(40)
        page.locator(".num-row .num-btn", has_text=str(sol[i])).click(); page.wait_for_timeout(45)
    page.wait_for_timeout(500)
    return page.locator(".overlay").count() == 1


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

        # A. 报告入口
        check("A1 📊家长报告入口存在",
              page.locator(".book-btn", has_text="家长报告").count() == 1)

        # B. 完成 2 局 4×4（1 局带冲突错误）
        ok1 = win_4x4(page, with_error=False)
        check("B1 第 1 局通关", ok1)
        if ok1:
            page.locator(".overlay button", has_text="再来一局").click()
            page.wait_for_timeout(300)
            page.locator("button:has-text('← 返回')").click()  # 回难度页再开第 2 局
            page.wait_for_timeout(200)
        ok2 = win_4x4(page, with_error=True)
        check("B2 第 2 局通关（含错误）", ok2)
        if ok2:
            page.locator(".overlay button", has_text="再来一局").click()
            page.wait_for_timeout(300)
            page.locator("button:has-text('← 返回')").click()
            page.wait_for_timeout(200)

            # C. 今日反馈
            page.locator(".book-btn", has_text="家长报告").click()
            page.wait_for_timeout(200)
            check("C1 报告视图标题", "家长报告" in page.locator(".page-title").inner_text())
            txt = page.locator(".report-card").first.inner_text()
            check("C2 今日反馈含'完成 2 局'", "完成 2 局" in txt, txt[:80])
            check("C3 今日含'平均用时'", "平均用时" in txt)
            check("C4 今日含'错误合计 1 次'", "错误合计 1 次" in txt)
            check("C5 今日含'提示合计 1 次'", "提示合计 1 次" in txt)
            check("C6 今日含'平均星级'", "平均星级" in txt)

            # D. 近 7 天卡
            week_txt = page.locator(".report-card").nth(1).inner_text()
            check("D1 近7天含'完成 2 局'", "完成 2 局" in week_txt, week_txt[:80])
            check("D2 难度分布含'简单 4×4：2 局'", "简单 4×4：2 局" in week_txt)
            check("D3 技巧掌握度含'技巧徽章'", "技巧徽章" in week_txt)
            check("D4 徽章状态行存在",
                  any(m in week_txt for m in ["单宫排除", "行列排除", "区块排除", "交叉排除"]))

        # E. 9×9 竖屏横屏提示
        page.locator("button:has-text('← 返回')").click()
        page.wait_for_timeout(200)
        page.locator(".diff-btn").nth(2).click()  # 9×9 困难
        page.wait_for_timeout(500)
        check("E1 9×9 横屏提示出现", page.locator(".overlay").count() == 1)
        check("E2 提示文案'建议横屏'",
              "建议横屏" in page.locator(".overlay").inner_text())
        page.locator(".overlay button", has_text="知道了").click()
        page.wait_for_timeout(150)
        check("E3 关闭提示进入棋盘", page.locator(".cell").count() == 81)
        # 一次性：重开 9×9 不再提示
        page.locator("button:has-text('← 返回')").click()
        page.wait_for_timeout(200)
        page.locator(".diff-btn").nth(2).click()
        page.wait_for_timeout(500)
        check("E4 二次进入不再提示（一次性）", page.locator(".overlay").count() == 0)

        # F. 返回
        page.locator("button:has-text('← 返回')").click()
        page.wait_for_timeout(200)
        check("F1 回难度页", page.locator(".diff-btn").count() == 3)

        # G. 无 JS 报错
        check("G1 全程无 JS 报错", len(errors) == 0, "; ".join(errors))

        browser.close()

    print("\n=== 结果：%d 项，失败 %d ===" % (23, len(FAILS)))
    if FAILS:
        print("失败项:", ", ".join(FAILS))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
