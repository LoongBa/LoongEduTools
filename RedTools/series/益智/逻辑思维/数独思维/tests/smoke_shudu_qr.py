#!/usr/bin/env python3
"""数独思维 v1.11 冒烟：分享题二维码卡（微信识别导入）+ 分享成绩微信文案适配

用例：
  A. 通关一局 4×4 → 结算「📤 分享这题」
  B. 二维码卡：.share-qr canvas 存在 + canvas 有暗模块（QR 真实内容）+ 微信长按提示文案
  C. 分享成绩：微信适配文案（长按保存/转发）
  D. 全程无 JS 报错
"""
from pathlib import Path

from playwright.sync_api import sync_playwright

DIST = Path(__file__).resolve().parents[6].joinpath("RedTools", "dist", "益智", "数独思维", "offline")
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
        page = browser.new_page(viewport={"width": 390, "height": 844})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL)
        page.evaluate("localStorage.clear()")
        page.reload()

        # A. 通关一局 4×4
        page.locator(".diff-btn").nth(0).click()
        size, pz, _ = read_board(page)
        sol = solve_via_page(page, pz, size)
        fill_board(page, sol)
        page.wait_for_timeout(300)
        check("A1 结算浮层出现", page.locator(".overlay-title").inner_text() == "🎉 数独完成！")

        # B. 分享这题 → 二维码卡
        page.locator("button:has-text('分享这题')").click()
        page.wait_for_timeout(300)
        check("B1 二维码 canvas 存在", page.locator(".share-qr").count() == 1)
        qr_dark = page.evaluate("""function () {
          var c = document.querySelector('.share-qr');
          if (!c) return -1;
          var ctx = c.getContext('2d');
          var d = ctx.getImageData(0, 0, c.width, c.height).data;
          var dark = 0;
          for (var i = 3; i < d.length; i += 4) { if (d[i] > 200) dark++; }
          return dark;
        }""")
        check("B2 二维码含暗模块（QR 真实内容）", qr_dark > 50, "dark=%s" % qr_dark)
        ov_text = page.locator(".overlay-card").inner_text()
        check("B3 微信长按识别提示文案",
              "长按二维码" in ov_text and "识别图中二维码" in ov_text, ov_text[:160])
        check("B4 导入引导文案（粘贴即玩）", "导入题目" in ov_text and "粘贴" in ov_text, ov_text[:160])
        page.locator("button:has-text('返回结算')").click()

        # C. 分享成绩微信适配
        page.locator("button:has-text('分享成绩')").click()
        page.wait_for_timeout(250)
        res_text = page.locator(".overlay-card").inner_text()
        check("C1 分享成绩含微信适配（长按保存/转发）",
              "微信" in res_text and ("保存" in res_text or "转发" in res_text), res_text[:160])

        # D. 无 JS 报错
        check("D1 全程无 JS 报错", len(errors) == 0, "; ".join(errors))

        browser.close()

    print("\n=== 结果：%d 项，失败 %d ===" % (8, len(FAILS)))
    if FAILS:
        print("失败项:", ", ".join(FAILS))
        raise SystemExit(1)


if __name__ == "__main__":
    main()


