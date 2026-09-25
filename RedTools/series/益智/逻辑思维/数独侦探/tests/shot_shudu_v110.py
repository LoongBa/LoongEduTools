#!/usr/bin/env python3
"""数独侦探 v1.10 截图：自由解题视图 / 唯一余数 6×6 / X-Wing 6×6 / E5 结算+横幅"""
from pathlib import Path
from playwright.sync_api import sync_playwright

DIST = Path(__file__).resolve().parents[6].joinpath("RedTools", "dist", "益智", "数独侦探", "offline")
URL = DIST.joinpath("index.html").as_uri()
OUT = Path(__file__).resolve().parent / "_shots"
OUT.mkdir(parents=True, exist_ok=True)
STORE_KEY = "redtools.shudurumen.v1"


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
    page.wait_for_timeout(200)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 420, "height": 860})
        page.goto(URL)
        page.evaluate("localStorage.clear()")
        page.reload()

        # 1. 自由解题 view
        page.locator("button:has-text('自由解题')").click()
        page.wait_for_timeout(250)
        page.screenshot(path=str(OUT / "v110_adv_view.png"))
        page.locator(".teach-btn.badge-card").nth(0).click()

        # 2. 唯一余数教学关 step1
        page.wait_for_timeout(250)
        page.screenshot(path=str(OUT / "v110_unique_step1.png"))
        # 完成两步
        page.locator("#skill-board .cell:nth-child(22)").click()
        page.locator(".num-btn:nth-child(2)").click()
        page.wait_for_timeout(150)
        page.locator("#skill-board .cell:nth-child(3)").click()
        page.locator(".num-btn:nth-child(3)").click()
        page.wait_for_timeout(200)
        page.screenshot(path=str(OUT / "v110_unique_done_overlay.png"))
        page.locator(".overlay .btn-main").click()
        page.wait_for_timeout(150)

        # 3. X-Wing 教学关 step1
        page.locator(".teach-btn.badge-card").nth(1).click()
        page.wait_for_timeout(250)
        page.screenshot(path=str(OUT / "v110_xwing_step1.png"))
        # 完成
        page.locator("#skill-board .cell:nth-child(7)").click()
        page.locator(".num-btn:nth-child(1)").click()
        page.locator("#skill-board .cell:nth-child(10)").click()
        page.locator(".num-btn:nth-child(4)").click()
        page.wait_for_timeout(200)
        page.locator(".overlay .btn-main").click()
        page.locator("button:has-text('← 返回')").click()
        page.wait_for_timeout(150)

        # 4. E5：注入 history 两局困难 → 通关一局 6×6 造错 → 结算 note + 难度页横幅
        page.evaluate("""(function(k){
          var s=JSON.parse(localStorage.getItem(k));
          s.history=[{date:'20260925',level:'9',ms:1e5,errors:30,hints:0,stars:1},
                     {date:'20260925',level:'9',ms:1e5,errors:30,hints:0,stars:1}];
          localStorage.setItem(k,JSON.stringify(s));})('%s')""" % STORE_KEY)
        page.reload()
        page.locator(".diff-btn", has_text="普通").click()
        size, pz, _ = read_board(page)
        # 造 8 冲突
        empty = [i for i,v in enumerate(pz) if v==0][:8]
        for idx in empty:
            r = idx // size
            rv = sorted({pz[r*size+k] for k in range(size) if pz[r*size+k]})
            if rv: fill(page, idx, rv[0])
        sol = solve_via_page(page, pz, size)
        fill_board(page, sol)
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT / "v110_e5_settle_note.png"))
        page.locator("button:has-text('选难度')").click()
        page.wait_for_timeout(250)
        page.screenshot(path=str(OUT / "v110_e5_difficulty_banner.png"))

        browser.close()
    print("截图已保存到", OUT)


if __name__ == "__main__":
    main()