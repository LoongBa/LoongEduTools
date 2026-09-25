#!/usr/bin/env python3
"""数独侦探 v1.10 冒烟：自由解题模块（进阶技巧教学：唯一余数 / X-Wing，独立 advSkills 徽章）

用例：
  A. 难度页：base 技巧卡仍 4 个 + 🧩 自由解题入口
  B. 自由解题 view：标题 + 2 张进阶卡（唯一余数 / X-Wing，未点亮 💎）
  C. 唯一余数教学关（6×6）：36 格 + 数字条 6 键 + 行/列/宫高亮 → 落 2 → 落 3 → 进阶徽章弹窗
  D. 完成 2 步返回 → 自由解题 view 唯一余数卡变 ✨
  E. X-Wing 教学关（6×6）：矩形高亮 → 落 1 → 落 4 → 进阶徽章弹窗
  F. 返回难度页 → 徽章墙仍 4 卡（adv 不混入适龄徽章）+ 家长报告仍 X/4
  G. 全程无 JS 报错
"""
from pathlib import Path

from playwright.sync_api import sync_playwright

DIST = Path(__file__).resolve().parents[6].joinpath("RedTools", "dist", "益智", "数独侦探", "offline")
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
        out.push({ v: inner.textContent === '' ? 0 : parseInt(inner.textContent, 10),
                   given: inner.className.indexOf('given') >= 0 });
      }
      return out;
    }""")
    puzzle = [d["v"] for d in data]
    given = [d["given"] for d in data]
    return size, puzzle, given


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
    _, puzzle, given = read_board(page)
    for i in range(len(solution)):
        if given[i]:
            continue
        fill_cell(page, i, solution[i])
    page.wait_for_timeout(300)


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
        check("A1 base 技巧卡仍 4 个", page.locator(".skill-btn").count() == 4)
        check("A2 🧩 自由解题入口", page.locator("button:has-text('自由解题')").count() == 1)

        # B. 自由解题 view
        page.locator("button:has-text('自由解题')").click()
        check("B1 标题'自由解题·进阶'",
              "自由解题" in page.locator(".page-title").inner_text())
        adv_cards = page.locator(".teach-btn.badge-card")
        check("B2 进阶卡 2 张", adv_cards.count() == 2)
        adv_heads = adv_cards.locator(".teach-btn-head").all_inner_texts()
        check("B3 含唯一余数 / X-Wing",
              any("唯一余数" in h for h in adv_heads)
              and any("X-Wing" in h for h in adv_heads))
        check("B4 未点亮 💎 2 张",
              page.locator(".teach-btn.badge-card .teach-btn-head", has_text="💎").count() == 2)

        # C. 唯一余数教学关（第一张卡）
        adv_cards.nth(0).click()
        check("C1 标题含'唯一余数'",
              "唯一余数" in page.locator(".level-title").inner_text())
        check("C2 教学盘 36 格（6×6）", page.locator("#skill-board .cell").count() == 36)
        check("C3 数字条 6 键", page.locator(".num-row .num-btn").count() == 6)
        # step1：行/列/宫高亮（hl 8 格）
        hl1 = page.locator("#skill-board .cell-inner.peer")
        check("C4 step1 高亮 8 格", hl1.count() == 8)
        # 错数温和提示
        page.locator("#skill-board .cell:nth-child(22)").click()  # 目标格 idx21 (r3c3)
        check("C5 目标格 target 加强",
              page.locator("#skill-board .cell.target").count() == 1)
        page.locator(".num-btn:nth-child(1)").click()  # 数字 1（错，应 2）
        check("C6 温和提示'高亮的地方'",
              "高亮的地方" in page.locator("#skill-msg").inner_text())
        page.locator(".num-btn:nth-child(2)").click()  # 落 2
        check("C7 落子 2",
              page.locator("#skill-board .cell:nth-child(22) .skill-num").inner_text().strip() == "2")
        # step2
        check("C8 step2 文字含'唯一余数/排除'",
              ("唯一" in page.locator("#skill-msg").inner_text())
              or ("排除" in page.locator("#skill-msg").inner_text()))
        page.locator("#skill-board .cell:nth-child(3)").click()  # 目标格 idx2 (r0c2)
        page.locator(".num-btn:nth-child(3)").click()  # 落 3
        check("C9 落子 3",
              page.locator("#skill-board .cell:nth-child(3) .skill-num").inner_text().strip() == "3")
        check("C10 进阶徽章弹窗'学会啦'",
              page.locator(".overlay-title").inner_text().strip() == "🎉 学会啦！")
        check("C11 弹窗含'唯一余数'",
              "唯一余数" in page.locator(".overlay").inner_text())
        page.locator(".overlay .btn-main").click()

        # D. 返回自由解题 view，唯一余数卡点亮 ✨
        check("D1 返回自由解题（非徽章墙）",
              page.locator(".teach-btn.badge-card").count() == 2
              and "自由解题" in page.locator(".page-title").inner_text())
        check("D2 已点亮 ✨ 1 + 未点亮 💎 1",
              page.locator(".teach-btn.badge-card .teach-btn-head", has_text="✨").count() == 1
              and page.locator(".teach-btn.badge-card .teach-btn-head", has_text="💎").count() == 1)

        # E. X-Wing 教学关（第二张卡）
        page.locator(".teach-btn.badge-card").nth(1).click()
        check("E1 标题含'X-Wing'",
              "X-Wing" in page.locator(".level-title").inner_text())
        check("E2 教学盘 36 格", page.locator("#skill-board .cell").count() == 36)
        hl_x = page.locator("#skill-board .cell-inner.peer")
        check("E3 X-Wing 矩形高亮 4 格", hl_x.count() == 4)
        # step1：目标格 idx6 落 1
        page.locator("#skill-board .cell:nth-child(7)").click()  # 目标格 idx6 (r1c0)
        page.locator(".num-btn:nth-child(1)").click()  # 落 1
        check("E4 落子 1",
              page.locator("#skill-board .cell:nth-child(7) .skill-num").inner_text().strip() == "1")
        # step2：目标格 idx9 落 4
        page.locator("#skill-board .cell:nth-child(10)").click()  # idx9 (r1c3)
        page.locator(".num-btn:nth-child(4)").click()  # 落 4
        check("E5 落子 4",
              page.locator("#skill-board .cell:nth-child(10) .skill-num").inner_text().strip() == "4")
        check("E6 X-Wing 徽章弹窗",
              page.locator(".overlay-title").inner_text().strip() == "🎉 学会啦！")
        page.locator(".overlay .btn-main").click()
        check("E7 返回自由解题",
              page.locator(".teach-btn.badge-card").count() == 2)
        check("E8 X-Wing 已点亮 ✨", page.locator(".teach-btn.badge-card .teach-btn-head", has_text="✨").count() == 2)

        # 返回难度页
        page.locator("button:has-text('← 返回')").click()

        # F. 徽章墙仍 4 卡（adv 不混入）
        page.locator("button:has-text('技巧徽章墙')").click()
        check("F1 徽章墙 4 卡（不含 adv）",
              page.locator(".teach-btn.badge-card").count() == 4)
        check("F2 无 ✨/💎 进阶徽章",
              page.locator(".teach-btn.badge-card .teach-btn-head", has_text="✨").count() == 0)
        page.locator("button:has-text('← 返回')").click()

        # 家长报告仍 X/4（adv 完成不改变分母）——先通关一局 4×4 报告才有技巧掌握度行
        page.locator(".diff-btn").nth(0).click()  # 选简单 4×4
        size, puzzle, given = read_board(page)
        sol = solve_via_page(page, puzzle, size)
        fill_board(page, sol)
        page.wait_for_timeout(400)
        page.locator("button:has-text('选难度')").click()
        page.locator("button:has-text('家长报告')").click()
        report_rows = page.locator(".report-row").all_inner_texts()
        check("F3 家长报告含 '/4 枚技巧徽章'",
              any("/4" in r for r in report_rows), " | ".join(report_rows))

        # G. 无 JS 报错
        check("G1 全程无 JS 报错", len(errors) == 0, "; ".join(errors))

        browser.close()

    print("\n=== 结果：%d 项，失败 %d ===" % (22, len(FAILS)))
    if FAILS:
        print("失败项:", ", ".join(FAILS))
        raise SystemExit(1)


if __name__ == "__main__":
    main()