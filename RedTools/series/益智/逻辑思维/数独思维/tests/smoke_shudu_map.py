#!/usr/bin/env python3
"""数独思维 v1.13 冒烟：闯关地图（X1——3 档×3 关 seed 固定题 + 线性解锁 + 进度记录）

用例：
  A. 难度页：🗺️ 闯关地图卡（0/10 关）
  B. 地图视图：9 节点 3×3（🔓1 可玩 + 🔒8 锁定）+ 无竞技提示 + 技巧 tag（9 🎯 未点亮）
  C. 开始 1-1（简单）：4×4 + 顶栏「· 关卡 1-1」+ 同关同题（再次进入盘面一致）
  D. 通关 1-1 → store.mapProgress.completed=[{i:0,doneAt}] + 地图卡 1/9
  E. 地图视图：✅1 已通 + 🔓1 可玩（2-1）+ 🔒7 锁定；点锁定节点温和提示
  G. adv 关 gate：注入前 7 关完成 → 3-2（uniqueElim 未掌握）点击 → 引导去自由解题 + 跳转教学关
  F. 全程无 JS 报错
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
        check("A1 闯关地图卡存在", page.locator("button:has-text('闯关地图')").count() == 1)
        map_sub = page.locator("button:has-text('闯关地图') .teach-btn-sub").inner_text()
        check("A2 进度 0/10 关", "0 / 10" in map_sub, map_sub)

        # B. 地图视图
        page.locator("button:has-text('闯关地图')").click()
        page.wait_for_timeout(250)
        check("B1 标题'闯关地图'", "闯关地图" in page.locator(".page-title").inner_text())
        nodes = page.locator(".map-node")
        check("B2 10 个节点", nodes.count() == 10)
        check("B3 可玩 🔓 1 个", page.locator(".map-node", has_text="🔓").count() == 1)
        check("B4 锁定 🔒 9 个", page.locator(".map-node", has_text="🔒").count() == 9)
        check("B5 无竞技提示", "无排行" in page.locator(".home-hint").inner_text()
              or "无竞技" in page.locator(".home-hint").inner_text())
        # v1.18：技巧 tag——初始 10 关全部未点亮 🎯（不占用三态 🔒 计数）
        check("B6 技巧 tag 10 个未点亮 🎯", page.locator(".map-skill-tag", has_text="🎯").count() == 10)
        check("B7 技巧 tag 与三态不冲突（🔒 仍 9）", page.locator(".map-node", has_text="🔒").count() == 9)

        # C. 开始 1-1（第一个可玩节点）
        page.locator(".map-node", has_text="🔓").click()
        page.wait_for_timeout(400)
        check("C1 1-1 为 4×4", page.locator(".cell").count() == 16)
        check("C2 顶栏「· 关卡 1-1」", "关卡 1-1" in page.locator(".level-title").inner_text())
        first_board = board_snapshot(page)
        # 同关同题：从 1-1 局返回难度页 → 再进地图 → 点 🔓(1-1) 进入 → 盘面一致
        page.locator(".topbar button, .btn-ghost").first.click()
        page.wait_for_timeout(300)
        page.locator("button:has-text('闯关地图')").click()
        page.wait_for_timeout(250)
        page.locator(".map-node", has_text="🔓").click()
        page.wait_for_timeout(400)
        second_board = board_snapshot(page)
        check("C3 同关同题（1-1 盘面一致）", second_board == first_board)

        # D. 通关 1-1
        size, pz, _ = read_board(page)
        fill_board(page, solve_via_page(page, pz, size))
        page.wait_for_timeout(400)
        mp = page.evaluate("JSON.parse(localStorage.getItem('%s')).mapProgress" % STORE_KEY)
        check("D1 store.mapProgress.completed 含 i=0（v1.18 {i,doneAt}）",
              mp and len(mp["completed"]) == 1 and mp["completed"][0]["i"] == 0, str(mp)[:80])
        page.locator("button:has-text('选难度')").click()
        page.wait_for_timeout(300)
        map_sub2 = page.locator("button:has-text('闯关地图') .teach-btn-sub").inner_text()
        check("D2 地图卡 1/10 关", "1 / 10" in map_sub2, map_sub2)

        # E. 地图视图进度
        page.locator("button:has-text('闯关地图')").click()
        page.wait_for_timeout(250)
        check("E1 已通 ✅ 1（三态 emoji 精确）", page.locator(".map-node .map-emoji", has_text="✅").count() == 1)
        check("E2 可玩 🔓 1（下一关 1-2 线性推进）", page.locator(".map-node", has_text="🔓").count() == 1
              and "1-2" in page.locator(".map-node", has_text="🔓").inner_text(),
              " | ".join(page.locator(".map-node", has_text="🔓").all_inner_texts()))
        check("E3 锁定 🔒 8", page.locator(".map-node", has_text="🔒").count() == 8)
        # 点锁定节点 → 温和提示
        page.locator(".map-node", has_text="🔒").first.click()
        page.wait_for_timeout(150)
        view_text = page.locator(".view, body").first.inner_text()
        check("E4 锁定节点温和提示", "先通关" in view_text, view_text[:120])
        page.locator("button:has-text('← 返回')").click()
        page.wait_for_timeout(200)
        check("E5 地图卡 1/10 + 掌握技巧 1/7（1-1 点亮 boxElim 去重）",
              "1 / 10" in page.locator("button:has-text('闯关地图') .teach-btn-sub").inner_text()
              and "掌握技巧 1 / 7" in page.locator("button:has-text('闯关地图') .teach-btn-sub").inner_text(),
              page.locator("button:has-text('闯关地图') .teach-btn-sub").inner_text())

        # G. v1.18 adv 关 gate：注入前 7 关完成 → 3-2（uniqueElim 进阶）未掌握 → 点击引导去自由解题
        page.evaluate("""function () {
          var s = JSON.parse(localStorage.getItem('redtools.shudurumen.v1'));
          s.mapProgress = { completed: [] };
          for (var n = 0; n < 7; n++) { s.mapProgress.completed.push({ i: n, doneAt: '20260920' }); }
          localStorage.setItem('redtools.shudurumen.v1', JSON.stringify(s)); }""")
        page.reload()
        page.wait_for_timeout(600)
        page.locator("button:has-text('闯关地图')").click()
        page.wait_for_timeout(250)
        # 3-2（i=7，uniqueElim）线性解锁 🔓 + 技巧未点亮 → 点时引导跳转自由解题
        page.locator(".map-node", has_text="3-2").click()
        page.wait_for_timeout(400)
        g_text = page.locator("body").inner_text()
        check("G1 adv 未掌握点击 → 引导去「自由解题」学技巧",
              "学一下" in g_text and "自由解题" in g_text, g_text[:200])
        check("G2 跳转唯一余数教学关", "唯一余数" in g_text, g_text[:160])
        check("G3 mapProgress 未推进", 
              page.evaluate("JSON.parse(localStorage.getItem('%s')).mapProgress.completed.length" % STORE_KEY) == 7)
        page.locator("button:has-text('← 返回')").click()
        page.wait_for_timeout(200)

        # F. 无 JS 报错
        check("F1 全程无 JS 报错", len(errors) == 0, "; ".join(errors))

        browser.close()

    print("\n=== 结果：%d 项，失败 %d ===" % (23, len(FAILS)))
    if FAILS:
        print("失败项:", ", ".join(FAILS))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
