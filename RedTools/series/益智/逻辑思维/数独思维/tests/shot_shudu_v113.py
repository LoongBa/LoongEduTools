#!/usr/bin/env python3
"""数独思维 v1.13 截图：闯关地图视图 / 关卡对局顶栏 / 地图进度态"""
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

        # 1. 闯关地图初始（9 节点：🔓1 + 🔒8）
        page.locator("button:has-text('闯关地图')").click()
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT / "v113_map_initial.png"))

        # 2. 关卡 1-1 对局（顶栏「· 关卡 1-1」）
        page.locator(".map-node", has_text="🔓").click()
        page.wait_for_timeout(400)
        page.screenshot(path=str(OUT / "v113_level_1_1.png"))
        # 通关
        size, pz, _ = read_board(page)
        fill_board(page, solve_via_page(page, pz, size))
        page.wait_for_timeout(350)
        page.locator("button:has-text('选难度')").click()
        page.wait_for_timeout(200)
        page.locator("button:has-text('闯关地图')").click()
        page.wait_for_timeout(300)

        # 3. 地图进度态（✅1-1 + 🔓1-2 + 🔒7）
        page.screenshot(path=str(OUT / "v113_map_progress.png"))

        browser.close()
    print("截图已保存到", OUT)


if __name__ == "__main__":
    main()
