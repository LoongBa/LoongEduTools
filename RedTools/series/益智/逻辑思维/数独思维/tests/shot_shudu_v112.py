#!/usr/bin/env python3
"""数独思维 v1.12 截图：每日挑战入口 / 每日题局 / 成就视图"""
from pathlib import Path
from playwright.sync_api import sync_playwright

DIST = Path(__file__).resolve().parents[6].joinpath("RedTools", "dist", "益智", "数独思维", "offline")
URL = DIST.joinpath("index.html").as_uri()
OUT = Path(__file__).resolve().parent / "_shots"
OUT.mkdir(parents=True, exist_ok=True)


def read_board(page):
    n = page.evaluate("document.querySelectorAll('.cell').length")
    size = int(round(n ** 0.5))
    data = page.evaluate("""function () {
      var cells = document.querySelectorAll('.cell .cell-inner');
      var out = [];
      for (var i = 0; i < cells.length; i++) {
        var inner = cells[i];
        out.push({ v: inner.textContent === '' ? 0 : parseInt(inner.textContent,10),
                   given: inner.className.indexOf('given') >= 0 });
      }
      return out;}""")
    return size, [d["v"] for d in data], [d["given"] for d in data]


def solve_via_page(page, puzzle, n):
    return page.evaluate("""function (arg) {
      var puzzle=arg.puzzle,N=arg.N,b=puzzle.slice();
      function bt(p){while(p<N*N&&b[p]!==0)p++;if(p===N*N)return true;
        var r=Math.floor(p/N),c=p%N;
        for(var v=1;v<=N;v++){if(window.SUDOKU.cellValid(b,N,r,c,v)){b[p]=v;if(bt(p+1))return true;b[p]=0;}}
        return false;}
      return bt(0)?b:null;}""", {"puzzle": puzzle, "N": n})


def fill(page, idx, val):
    page.locator(".cell").nth(idx).click(); page.wait_for_timeout(30)
    page.locator(".num-row .num-btn", has_text=str(val)).click(); page.wait_for_timeout(40)


def fill_board(page, sol):
    _, pz, given = read_board(page)
    for i in range(len(sol)):
        if not given[i]:
            fill(page, i, sol[i])
    page.wait_for_timeout(250)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 420, "height": 880})
        page.goto(URL)
        page.evaluate("localStorage.clear()")
        page.reload()

        # 1. 难度页（每日挑战未完成 + 成就 0/6）
        page.screenshot(path=str(OUT / "v112_home_daily.png"))

        # 2. 每日挑战局（顶栏·每日题）
        page.locator("button:has-text('每日挑战')").click()
        page.wait_for_timeout(400)
        page.screenshot(path=str(OUT / "v112_daily_game.png"))
        # 通关解锁成就
        size, pz, _ = read_board(page)
        fill_board(page, solve_via_page(page, pz, size))
        page.wait_for_timeout(350)
        page.screenshot(path=str(OUT / "v112_daily_settle_ach.png"))
        page.locator("button:has-text('选难度')").click()
        page.wait_for_timeout(200)

        # 3. 成就视图（2 解锁：首通 + 三星完美）
        page.locator("button:has-text('成就')").click()
        page.wait_for_timeout(250)
        page.screenshot(path=str(OUT / "v112_achievement_view.png"))

        browser.close()
    print("截图已保存到", OUT)


if __name__ == "__main__":
    main()
