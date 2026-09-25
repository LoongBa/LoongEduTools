#!/usr/bin/env python3
"""数独侦探 v1.11 截图：分享题二维码卡 / 缩放棋盘 + 复位浮标"""
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

        # 1. 分享题二维码卡
        page.locator(".diff-btn").nth(0).click()
        size, pz, _ = read_board(page)
        fill_board(page, solve_via_page(page, pz, size))
        page.wait_for_timeout(300)
        page.locator("button:has-text('分享这题')").click()
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT / "v111_share_qr.png"))

        # 2. 缩放棋盘（9×9 pinch scale 2.0 + 右下复位浮标）
        page.locator("button:has-text('返回结算')").click()  # 分享弹层 → 结算浮层
        page.wait_for_timeout(200)
        page.locator("button:has-text('选难度')").click()    # 结算 → 难度页
        page.wait_for_timeout(200)
        page.locator(".diff-btn").nth(2).click()
        page.wait_for_timeout(400)
        if page.locator("button:has-text('知道了')").count():
            page.locator("button:has-text('知道了')").click()
            page.wait_for_timeout(200)
        cdp = page.context.new_cdp_session(page)
        cdp.send("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 2})
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [
            {"x": 130, "y": 420, "id": 1, "radiusX": 2, "radiusY": 2, "force": 1},
            {"x": 230, "y": 420, "id": 2, "radiusX": 2, "radiusY": 2, "force": 1}]})
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [
            {"x": 60, "y": 420, "id": 1, "radiusX": 2, "radiusY": 2, "force": 1},
            {"x": 300, "y": 420, "id": 2, "radiusX": 2, "radiusY": 2, "force": 1}]})
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT / "v111_zoom_board.png"))

        browser.close()
    print("截图已保存到", OUT)


if __name__ == "__main__":
    main()