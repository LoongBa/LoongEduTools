#!/usr/bin/env python3
"""数独思维 v1.2/v1.34 断局恢复冒烟测试（Playwright + file://）

用例：
  R1 填数后返回难度页 → 出现「继续上次」入口（含已玩秒/已填格数）
  R2 点继续 → 恢复棋盘（已填数保留）+ 难度/已知格信息正确
  R3 计时续算（恢复后计时继续走，不从 0 开始）
  R4 铅笔笔记也在快照中（恢复后候选保留）
  R5 通关后「继续上次」消失（快照清除）
  R6 重开后「继续上次」消失
  R7 恢复局可正常通关（undo/提示/星级正常）
  R8 全程无 JS 报错
  R9 (v1.34 P0) 每日挑战中断 → 恢复 → 顶栏保留「每日题」→ 通关记 store.daily
  R10 (v1.34 P0) 闯关地图中断 → 恢复 → 顶栏保留「关卡」→ 通关记 mapProgress
  R11 (v1.34 P0) 导入局中断 → 恢复 → 顶栏保留「导入题」→ 通关不计成绩（best 未写）
"""
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

DIST = Path(__file__).resolve().parents[6].joinpath("RedTools", "dist", "益智", "数独思维", "offline")
URL = DIST.joinpath("index.html").as_uri()
STORE_KEY = "redtools.shudurumen.v1"

FAILS = []


def check(name, cond, extra=""):
    if cond:
        print(f"  [PASS] {name}")
    else:
        print(f"  [FAIL] {name} {extra}")
        FAILS.append(name)


def same_box(a, b, n):
    br = 2 if n == 4 else (2 if n == 6 else 3)
    bc = 2 if n == 4 else (3 if n == 6 else 3)
    return (a // n // br) == (b // n // br) and ((a % n) // bc) == ((b % n) // bc)


def read_board(page):
    return page.evaluate("""function(){
      var cs = document.querySelectorAll('.cell .cell-inner');
      var out = [];
      for (var i = 0; i < cs.length; i++) {
        var inner = cs[i];
        var note = inner.querySelector('.cell-note');
        out.push({
          v: note ? 0 : (inner.textContent === '' ? 0 : parseInt(inner.textContent, 10)),
          notes: [].map.call(inner.querySelectorAll('.note-slot.on'), function(s){ return Number(s.getAttribute('data-v')); }).sort(function(a,b){return a-b;}),
          given: inner.className.indexOf('given') >= 0
        });
      }
      return out;
    }""")


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


def fill_cell(page, idx, val):
    page.locator(".cell").nth(idx).click()
    page.wait_for_timeout(50)
    page.locator(".num-row .num-btn", has_text=str(val)).click()
    page.wait_for_timeout(60)


def fill_board(page, solution):
    n = int(round(len(solution) ** 0.5))
    cells = read_board(page)
    for i in range(len(solution)):
        if cells[i]["given"]:
            continue
        fill_cell(page, i, solution[i])
    page.wait_for_timeout(300)


def wait_game(page, cnt):
    for _ in range(20):
        page.wait_for_timeout(100)
        if page.locator(".cell").count() == cnt:
            break
    page.wait_for_timeout(150)


def wait_any_game(page):
    """等棋盘出现（每日/闯关/导入难度不定，只等 .cell 数量 > 0）"""
    for _ in range(30):
        page.wait_for_timeout(100)
        if page.locator(".cell").count() > 0:
            break
    page.wait_for_timeout(150)


def dismiss_landscape_hint(page):
    """v1.9 E4：9×9 竖屏「建议横屏」提示（周六 9×9 每日题触发）→ 点「知道了」"""
    ov = page.locator(".overlay", has_text="建议横屏")
    if ov.count() > 0:
        page.locator(".overlay .btn-main", has_text="知道了").click()
        page.wait_for_timeout(200)


def read_store(page):
    return json.loads(page.evaluate("localStorage.getItem('%s')" % STORE_KEY) or "null")


def today_str():
    import datetime
    return datetime.date.today().strftime("%Y%m%d")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 390, "height": 844})
        js_errors = []
        page.on("pageerror", lambda e: js_errors.append(str(e)))
        page.goto(URL)
        page.evaluate("localStorage.clear()")
        page.reload()
        page.wait_for_timeout(400)

        # 进 4×4
        page.locator(".diff-btn").nth(0).click()
        wait_game(page, 16)
        cells = read_board(page)
        empties = [i for i in range(16) if not cells[i]["given"] and cells[i]["v"] == 0]
        check("R0-1 存在空格", len(empties) > 0)
        if not empties:
            browser.close()
            raise SystemExit(1)

        # 填两个数 + 记一个铅笔笔记
        idx1, idx2 = empties[0], empties[1]
        sol = solve_via_page(page, [c["v"] for c in cells], 4)
        v1 = sol[idx1]
        fill_cell(page, idx1, v1)
        # 铅笔笔记：idx2 记一个合法候选
        cells = read_board(page)
        r, c = idx2 // 4, idx2 % 4
        legal = []
        for cand in range(1, 5):
            occ = any(cells[j]["v"] == cand and j != idx2 and
                      ((j // 4) == r or (j % 4) == c or same_box(idx2, j, 4)) for j in range(16))
            if not occ:
                legal.append(cand)
        if legal:
            page.locator(".cell").nth(idx2).click()
            page.wait_for_timeout(50)
            page.locator(".tool-btn", has_text="笔记").click()
            page.wait_for_timeout(60)
            page.locator(".num-row .num-btn", has_text=str(legal[0])).click()
            page.wait_for_timeout(70)
            page.locator(".tool-btn", has_text="笔记").click()  # 退出铅笔
            page.wait_for_timeout(50)
            v2_note = legal[0]
        else:
            v2_note = None

        # 返回难度页
        page.locator(".topbar .btn-ghost-sm").click()
        page.wait_for_timeout(300)
        btns = page.locator(".diff-btn")
        check("R1-1 难度页出现继续入口", btns.count() == 4,
              f"count={btns.count()}")
        resume = page.locator(".resume-btn")
        check("R1-2 继续入口文案", resume.count() == 1 and "继续上次" in resume.inner_text())
        if resume.count() == 1:
            txt = resume.inner_text()
            check("R1-3 含已填格统计", "已填" in txt and "错 0" in txt)

        # 点继续 → 恢复
        resume.click()
        wait_game(page, 16)
        cells2 = read_board(page)
        check("R2-1 恢复已填数", cells2[idx1]["v"] == v1, f"got {cells2[idx1]['v']}")
        check("R2-2 难度标题正确", "简单" in page.locator(".level-title").inner_text())
        if v2_note:
            check("R4-1 笔记恢复", cells2[idx2]["notes"].count(v2_note) == 1,
                  f"notes={cells2[idx2]['notes']}")
        # 计时续算：等待 300ms 后计时 > 0.3
        page.wait_for_timeout(400)
        timer = page.locator(".top-timer").inner_text()
        sec = float(timer.replace("⏱ ", ""))
        check("R3-1 计时续算（>0.3s）", sec > 0.3, timer)

        # 恢复局直接通关（保持无错误 → 3★）
        sol2 = solve_via_page(page, [c["v"] for c in cells2], 4)
        check("R7-0 恢复局可解", sol2 is not None)
        if sol2:
            fill_board(page, sol2)
            page.wait_for_timeout(300)
            check("R7-1 恢复局通关结算", page.locator(".overlay").count() == 1)
            check("R7-2 3 星（恢复局无错）", "★★★" in page.locator(".stars-line").inner_text())

        # 通关后继续入口消失
        page.locator(".overlay button", has_text="选难度").click()
        page.wait_for_timeout(300)
        check("R5-1 通关后继续入口消失", page.locator(".diff-btn").count() == 3,
              f"count={page.locator('.diff-btn').count()}")

        # R6 重开后继续入口消失
        page.locator(".diff-btn").nth(0).click()
        wait_game(page, 16)
        cells3 = read_board(page)
        e3 = [i for i in range(16) if not cells3[i]["given"] and cells3[i]["v"] == 0]
        if e3:
            sol3 = solve_via_page(page, [c["v"] for c in cells3], 4)
            fill_cell(page, e3[0], sol3[e3[0]])
            page.locator(".game-footer .btn-ghost-sm", has_text="重新开始").click()
            page.wait_for_timeout(300)
            page.locator(".topbar .btn-ghost-sm").click()
            page.wait_for_timeout(300)
            check("R6-1 重开后继续入口消失", page.locator(".diff-btn").count() == 3,
                  f"count={page.locator('.diff-btn').count()}")

        # ============ v1.34 P0：三态恢复（每日挑战 / 闯关 / 导入） ============
        # R9 每日挑战中断 → 恢复 → 顶栏保留「· 每日题」→ 通关记 store.daily
        page.locator("button:has-text('每日挑战')").click()
        page.wait_for_timeout(400)
        dismiss_landscape_hint(page)
        wait_any_game(page)
        d_cells = read_board(page)
        d_size = int(round(len(d_cells) ** 0.5))
        d_sol = solve_via_page(page, [c["v"] for c in d_cells], d_size)
        check("R9-0 每日题可解", d_sol is not None)
        if d_sol:
            d_empty = [i for i in range(d_size * d_size) if not d_cells[i]["given"] and d_cells[i]["v"] == 0]
            fill_cell(page, d_empty[0], d_sol[d_empty[0]])
            page.locator(".topbar .btn-ghost-sm").click()
            page.wait_for_timeout(300)
            page.locator(".resume-btn").click()
            wait_any_game(page)
            check("R9-1 恢复顶栏保留「· 每日题」",
                  "每日题" in page.locator(".level-title").inner_text(),
                  page.locator(".level-title").inner_text())
            d_cells2 = read_board(page)
            d_sol2 = solve_via_page(page, [c["v"] for c in d_cells2], d_size)
            if d_sol2:
                fill_board(page, d_sol2)
                page.wait_for_timeout(400)
                st9 = read_store(page)
                check("R9-2 通关记 store.daily（当日）",
                      st9 and st9.get("daily") and st9["daily"].get("date") == today_str(),
                      str((st9 or {}).get("daily"))[:80])
        page.locator(".overlay button", has_text="选难度").click()
        page.wait_for_timeout(300)

        # R10 闯关地图 1-1 中断 → 恢复 → 顶栏保留「· 关卡」→ 通关记 mapProgress
        page.locator("button:has-text('闯关地图')").click()
        page.wait_for_timeout(300)
        page.locator(".map-node", has_text="🔓").click()
        page.wait_for_timeout(400)
        wait_any_game(page)
        m_cells = read_board(page)
        m_size = int(round(len(m_cells) ** 0.5))
        m_sol = solve_via_page(page, [c["v"] for c in m_cells], m_size)
        check("R10-0 闯关 1-1 可解", m_sol is not None)
        if m_sol:
            m_empty = [i for i in range(m_size * m_size) if not m_cells[i]["given"] and m_cells[i]["v"] == 0]
            fill_cell(page, m_empty[0], m_sol[m_empty[0]])
            page.locator(".topbar .btn-ghost-sm").click()
            page.wait_for_timeout(300)
            page.locator(".resume-btn").click()
            wait_any_game(page)
            check("R10-1 恢复顶栏保留「· 关卡 1-1」",
                  "关卡" in page.locator(".level-title").inner_text(),
                  page.locator(".level-title").inner_text())
            m_cells2 = read_board(page)
            m_sol2 = solve_via_page(page, [c["v"] for c in m_cells2], m_size)
            if m_sol2:
                fill_board(page, m_sol2)
                page.wait_for_timeout(400)
                st10 = read_store(page)
                comp = (st10 or {}).get("mapProgress", {}).get("completed", [])
                check("R10-2 通关记 mapProgress 含 1-1（i=0）",
                      any((isinstance(e, dict) and e.get("i") == 0) or e == 0 for e in comp),
                      str(comp)[:80])
        page.locator(".overlay button", has_text="选难度").click()
        page.wait_for_timeout(300)

        # R11 导入局中断 → 恢复 → 顶栏保留「· 导入题」→ 通关不计成绩（best 快照不变）
        st_before = read_store(page)
        best_before = dict((st_before or {}).get("best") or {})
        imp_puzzle = page.evaluate("window.SUDOKU.genPuzzle(4, 10).puzzle")
        imp_txt = "数独思维\nSD4:" + ",".join(str(x) for x in imp_puzzle)
        page.locator("button:has-text('导入题目')").click()
        page.wait_for_timeout(200)
        page.locator(".import-zone").fill(imp_txt)
        page.locator("button:has-text('导入并开始')").click()
        page.wait_for_timeout(400)
        wait_any_game(page)
        check("R11-0 导入局顶栏标记「· 导入题」",
              "导入题" in page.locator(".level-title small").inner_text())
        i_cells = read_board(page)
        i_size = int(round(len(i_cells) ** 0.5))
        i_sol = solve_via_page(page, [c["v"] for c in i_cells], i_size)
        check("R11-0b 导入局可解", i_sol is not None)
        if i_sol:
            i_empty = [i for i in range(i_size * i_size) if not i_cells[i]["given"] and i_cells[i]["v"] == 0]
            fill_cell(page, i_empty[0], i_sol[i_empty[0]])
            page.locator(".topbar .btn-ghost-sm").click()
            page.wait_for_timeout(300)
            page.locator(".resume-btn").click()
            wait_any_game(page)
            check("R11-1 恢复顶栏保留「· 导入题」",
                  "导入题" in page.locator(".level-title small").inner_text(),
                  page.locator(".level-title small").inner_text())
            i_cells2 = read_board(page)
            i_sol2 = solve_via_page(page, [c["v"] for c in i_cells2], i_size)
            if i_sol2:
                fill_board(page, i_sol2)
                page.wait_for_timeout(400)
                st11 = read_store(page)
                best_after = dict((st11 or {}).get("best") or {})
                check("R11-2 导入恢复通关不计最佳（best 快照不变）",
                      best_after == best_before,
                      "before=%s after=%s" % (best_before, best_after))
        page.locator(".overlay button", has_text="选难度").click()
        page.wait_for_timeout(300)

        check("R8-1 全程无 JS 报错", len(js_errors) == 0, "; ".join(js_errors))
        browser.close()

    print()
    if FAILS:
        print(f"RESULT: {len(FAILS)} FAILED -> {FAILS}")
        raise SystemExit(1)
    print("RESULT: ALL PASS")


if __name__ == "__main__":
    main()

