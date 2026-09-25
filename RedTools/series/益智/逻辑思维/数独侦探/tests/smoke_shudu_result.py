#!/usr/bin/env python3
"""数独侦探 v1.7.1 冒烟测试：分享成绩（canvas 成绩卡 + 分享文案复制）（Playwright + file://）

用例：
  A. 4×4 通关 → 结算浮层
  B. 结算含「📤 分享成绩」→ 进入弹层
  C. 弹层：成绩卡图片 share-img 可见 + export-zone 文案
  D. 文案内容：含 通关/难度/★/用时/错/提示/技巧徽章/#数独；**无竞技词**（超过/打败/击败/排行/排名）
  E. 复制按钮存在 → 返回结算 → 再来一局 → 回难度
  F. 全程无 JS 报错
"""
from pathlib import Path

from playwright.sync_api import sync_playwright

DIST = Path(__file__).resolve().parents[6].joinpath("RedTools", "dist", "益智", "数独侦探", "offline")
URL = DIST.joinpath("index.html").as_uri()

FAILS = []


def check(name, cond, extra=""):
    if cond:
        print("  PASS  " + name)
    else:
        print("  FAIL  " + name + ("  | " + extra if extra else ""))
        FAILS.append(name)


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

        # A. 4×4 通关
        page.locator(".diff-btn").nth(0).click()
        page.wait_for_timeout(400)
        size, puzzle, given = read_board(page)
        sol = solve_via_page(page, puzzle, 4)
        check("A1 盘可解", sol is not None)
        if sol:
            for i in range(size * size):
                if given[i]:
                    continue
                page.locator(".cell").nth(i).click()
                page.wait_for_timeout(40)
                page.locator(".num-row .num-btn", has_text=str(sol[i])).click()
                page.wait_for_timeout(45)
            page.wait_for_timeout(500)
            check("A2 结算浮层", page.locator(".overlay").count() == 1)

            # B. 分享成绩入口
            check("B1 结算含「📤 分享成绩」",
                  page.locator(".overlay button", has_text="分享成绩").count() == 1)
            page.locator(".overlay button", has_text="分享成绩").click()
            page.wait_for_timeout(250)

            # C. 弹层内容
            check("C1 成绩卡图片可见", page.locator(".share-img").count() == 1)
            txt = page.locator(".export-zone").input_value()
            check("C2 文案非空", len(txt.strip()) > 0, txt[:80])

            # D. 文案内容
            check("D1 含'通关'", "通关" in txt)
            check("D2 含'×'（盘面）", "×" in txt)
            check("D3 含星级★", "★" in txt)
            check("D4 含'用时'", "用时" in txt)
            check("D5 含'错'", "错" in txt)
            check("D6 含'提示'", "提示" in txt)
            check("D7 含'技巧徽章'", "技巧徽章" in txt)
            check("D8 含'#数独'", "#数独" in txt)
            check("D9 无竞技词（无对比/排行）",
                  not any(w in txt for w in ["超过", "打败", "击败", "排行", "排名"]), txt[:80])
            check("D10 复制按钮存在",
                  page.locator("button", has_text="复制分享文案").count() == 1)

            # E. 返回结算 → 再来一局 → 回难度
            page.locator("button", has_text="返回结算").click()
            page.wait_for_timeout(200)
            check("E1 回到结算", page.locator(".overlay-title").count() == 1)
            page.locator(".overlay button", has_text="再来一局").click()
            page.wait_for_timeout(300)
            page.locator("button:has-text('← 返回')").click()
            page.wait_for_timeout(200)
            check("E2 回难度页", page.locator(".diff-btn").count() == 3)

        # F. 无 JS 报错
        check("F1 全程无 JS 报错", len(errors) == 0, "; ".join(errors))

        browser.close()

    print("\n=== 结果：%d 项，失败 %d ===" % (22, len(FAILS)))
    if FAILS:
        print("失败项:", ", ".join(FAILS))
        raise SystemExit(1)


if __name__ == "__main__":
    main()