# -*- coding: utf-8 -*-
"""数独思维 v1.15 更名截图：首页新名「数独思维」+ 分享成绩卡新名"""
from pathlib import Path
from playwright.sync_api import sync_playwright

DIST = Path(__file__).resolve().parents[6].joinpath("RedTools", "dist", "益智", "数独侦探", "offline")
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


def solve(page, puzzle, n):
    return page.evaluate("""function (arg) {
      var puzzle=arg.puzzle,N=arg.N,b=puzzle.slice();
      function bt(p){while(p<N*N&&b[p]!==0)p++;if(p===N*N)return true;
        var r=Math.floor(p/N),c=p%N;
        for(var v=1;v<=N;v++){if(window.SUDOKU.cellValid(b,N,r,c,v)){b[p]=v;if(bt(p+1))return true;b[p]=0;}}
        return false;}
      return bt(0)?b:null;}""", {"puzzle": puzzle, "N": n})


def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 420, "height": 880})
        pg.goto(URL)
        pg.evaluate("localStorage.clear()")
        pg.reload()
        # 1. 首页（顶栏新名「数独思维 · v1.15」+ 标题）
        pg.screenshot(path=str(OUT / "v115_home_new_name.png"))
        # 2. 分享成绩卡新名
        pg.locator(".diff-btn").nth(0).click()
        pg.wait_for_timeout(400)
        size, pz, _ = read_board(pg)
        sol = solve(pg, pz, size)
        for i in range(len(sol)):
            _, _, given = read_board(pg)
            if not given[i]:
                pg.locator(".cell").nth(i).click()
                pg.wait_for_timeout(25)
                pg.locator(".num-row .num-btn", has_text=str(sol[i])).click()
                pg.wait_for_timeout(30)
        pg.wait_for_timeout(350)
        pg.locator("button:has-text('分享成绩')").click()
        pg.wait_for_timeout(300)
        pg.screenshot(path=str(OUT / "v115_share_result_new_name.png"))
        b.close()
    print("截图已保存到", OUT)


if __name__ == "__main__":
    main()
