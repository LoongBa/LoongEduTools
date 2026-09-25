#!/usr/bin/env python3
"""数独思维 v1.12 冒烟：每日挑战（当日同题种子生成）+ 成就系统（X3，无竞技）

用例：
  A. 难度页：📅 每日挑战卡（未完成）+ 🏅 成就卡（0/6）
  B. 每日挑战开局：6×6 + 顶栏「· 每日题」
  C. 通关 → store.daily 写入 + 结算浮层「🏅 解锁成就：每日挑战首通」
  D. 返回难度：每日卡变「今日已完成 ✅」+ 成就卡（1/6）
  E. 成就视图：6 卡（🏅 1 解锁 + 🔒 5 未解锁）+ 解锁日期
  F. 每日同题：再次进入每日挑战 → 盘面与首次完全一致
  G. 全程无 JS 报错
"""
from pathlib import Path

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


def board_snapshot(page):
    _, pz, _ = read_board(page)
    return pz


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 390, "height": 844})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL)
        page.evaluate("localStorage.clear()")
        page.reload()

        # A. 难度页入口
        check("A1 每日挑战卡存在", page.locator("button:has-text('每日挑战')").count() == 1)
        daily_sub = page.locator("button:has-text('每日挑战') .teach-btn-sub").inner_text()
        check("A2 未完成 sub（今日一题）", "今日一题" in daily_sub, daily_sub)
        check("A3 成就卡存在 0/8", "0 / 8" in page.locator("button:has-text('成就') .teach-btn-sub").inner_text())

        # B. 每日挑战开局
        first_board = None
        page.locator("button:has-text('每日挑战')").click()
        page.wait_for_timeout(400)
        check("B1 每日挑战 6×6", page.locator(".cell").count() == 36)
        check("B2 顶栏「· 每日题」", "每日题" in page.locator(".level-title").inner_text())
        first_board = board_snapshot(page)

        # C. 通关 → 成就解锁
        size, pz, _ = read_board(page)
        fill_board(page, solve_via_page(page, pz, size))
        page.wait_for_timeout(400)
        check("C1 结算浮层出现", page.locator(".overlay-title").inner_text() == "🎉 数独完成！")
        overlay_text = page.locator(".overlay").inner_text()
        check("C2 解锁成就 note（每日挑战首通）",
              "解锁成就" in overlay_text and "每日挑战首通" in overlay_text, overlay_text[:160])
        store_daily = page.evaluate("JSON.parse(localStorage.getItem('%s')).daily" % STORE_KEY)
        check("C3 store.daily 已写入", store_daily and "date" in store_daily, str(store_daily)[:80])
        page.locator("button:has-text('选难度')").click()
        page.wait_for_timeout(300)

        # D. 返回难度：每日卡已完成 + 成就 1/6
        daily_sub2 = page.locator("button:has-text('每日挑战') .teach-btn-sub").inner_text()
        check("D1 每日卡变「今日已完成 ✅」", "今日已完成" in daily_sub2 and "✅" in daily_sub2, daily_sub2)
        check("D2 成就卡 2/8（首通+三星完美）", "2 / 8" in page.locator("button:has-text('成就') .teach-btn-sub").inner_text())

        # E. 成就视图
        page.locator("button:has-text('成就')").click()
        page.wait_for_timeout(250)
        ach_cards = page.locator(".teach-btn.badge-card")
        check("E1 成就卡 8 张", ach_cards.count() == 8)
        check("E2 已解锁 🏅 2 枚",
              page.locator(".teach-btn.badge-card .teach-btn-head", has_text="🏅").count() == 2)
        check("E3 未解锁 🔒 6 枚",
              page.locator(".teach-btn.badge-card .teach-btn-head", has_text="🔒").count() == 6)
        unlocked_text = ach_cards.locator(".teach-btn-sub").all_inner_texts()
        check("E4 解锁卡含日期", any("解锁于" in s for s in unlocked_text), " | ".join(unlocked_text))
        page.locator("button:has-text('← 返回')").click()
        page.wait_for_timeout(200)

        # F. 每日同题：再次进入 → 盘面一致
        page.locator("button:has-text('每日挑战')").click()
        page.wait_for_timeout(400)
        second_board = board_snapshot(page)
        check("F1 每日同题（再次进入盘面一致）", second_board == first_board)
        page.locator(".topbar button, .btn-ghost").first.click()
        page.wait_for_timeout(200)

        # G. 无 JS 报错
        check("G1 全程无 JS 报错", len(errors) == 0, "; ".join(errors))

        browser.close()

    print("\n=== 结果：%d 项，失败 %d ===" % (16, len(FAILS)))
    if FAILS:
        print("失败项:", ", ".join(FAILS))
        raise SystemExit(1)


if __name__ == "__main__":
    main()



