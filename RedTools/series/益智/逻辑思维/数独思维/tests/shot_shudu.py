#!/usr/bin/env python3
"""数独思维 视觉质检截图（首页 / 4×4 游戏页 / 9×9 游戏页 / 结算 / 打卡）"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

DIST = Path(__file__).resolve().parents[6].joinpath("RedTools", "dist", "益智", "数独思维", "offline")
URL = DIST.joinpath("index.html").as_uri()
OUT = Path(__file__).resolve().parent / "_shots"
STORE_KEY = "redtools.shudurumen.v1"


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
    return size, [d["v"] for d in data], [d["given"] for d in data]


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


def fill_all(page, sol):
    n = int(round(len(sol) ** 0.5))
    _, puzzle, given = read_board(page)
    for i in range(len(sol)):
        if given[i]:
            continue
        page.locator(".cell").nth(i).click()
        page.wait_for_timeout(30)
        page.locator(".num-row .num-btn", has_text=str(sol[i])).click()
        page.wait_for_timeout(30)
    page.wait_for_timeout(300)


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.goto(URL)
    page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / "shot-shudu-home.png"))

    # 4×4 游戏页：选中一格看高亮
    page.locator(".diff-btn").nth(0).click()
    page.wait_for_timeout(500)
    page.locator(".cell").nth(5).click()
    page.wait_for_timeout(150)
    page.screenshot(path=str(OUT / "shot-shudu-game4.png"))

    # 通关结算
    size, puzzle, given = read_board(page)
    sol = solve_via_page(page, puzzle, 4)
    fill_all(page, sol)
    page.screenshot(path=str(OUT / "shot-shudu-win.png"))

    # 打卡页
    page.locator(".overlay button", has_text="打卡日历").click()
    page.wait_for_timeout(300)
    page.screenshot(path=str(OUT / "shot-shudu-calendar.png"))

    # 9×9 宫边界
    page.locator(".btn-checkin").click()
    page.wait_for_timeout(300)
    page.locator(".diff-btn").nth(2).click()
    page.wait_for_timeout(800)
    page.locator(".cell").nth(40).click()
    page.wait_for_timeout(150)
    page.screenshot(path=str(OUT / "shot-shudu-game9.png"))
    browser.close()
print("shots done")

