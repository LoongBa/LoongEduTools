#!/usr/bin/env python3
"""数独侦探 v1.10 E5 冒烟：连败自动降难度（最近 2 局高错 → 建议降档，不惩罚）

流程（真实完成 2 局 6×6 普通，各故意冲突 8 次 → 累计 err ≥ 8 = 空格半数的 ceil）：
  A. 第一局 6×6：冲突 8 次 + 正确通关 → 结算无降档建议（history 不足 2）
     → 返回难度页无横幅、无高亮按钮
  B. 第二局 6×6：冲突 8 次 + 正确通关 → onWin 读最近 2 局均超阈值
     → 结算浮层出现「🌱 最近两局有点吃力」note
  C. 返回难度页：顶部出现温和横幅 + 简单 4×4 按钮高亮（.diff-btn.suggested）
  D. 进入一局（消费）→ 返回难度 → 横幅消失、高亮消失
  E. 全程无 JS 报错
"""
from pathlib import Path

from playwright.sync_api import sync_playwright

DIST = Path(__file__).resolve().parents[6].joinpath("RedTools", "dist", "益智", "数独侦探", "offline")
URL = DIST.joinpath("index.html").as_uri()

FAILS = []
ERR_TARGET = 8  # 6×6: ceil((36-21)/2)=8


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


def fill_cell(page, idx, val):
    page.locator(".cell").nth(idx).click()
    page.wait_for_timeout(40)
    page.locator(".num-row .num-btn", has_text=str(val)).click()
    page.wait_for_timeout(50)


def make_conflicts(page, puzzle, n, target):
    """在 up to target 个不同空格各填一次"与其行已有数相同的冲突值" → errors 各 +1"""
    empty = [i for i, v in enumerate(puzzle) if v == 0]
    used = 0
    for idx in empty:
        if used >= target:
            break
        r = idx // n
        row_vals = sorted({puzzle[r*n + k] for k in range(n) if puzzle[r*n + k] != 0})
        if not row_vals:
            continue
        fill_cell(page, idx, row_vals[0])  # 与行已有数冲突 → errors +1
        used += 1


def fill_board(page, solution):
    _, puzzle, given = read_board(page)
    for i in range(len(solution)):
        if given[i]:
            continue
        fill_cell(page, i, solution[i])
    page.wait_for_timeout(300)


def play_bad_to_settle(page):
    """选 6×6 普通，冲突 ERR_TARGET 次 + 正确通关 → 停留在结算浮层（不点『选难度』）"""
    page.locator(".diff-btn", has_text="普通").click()
    size, puzzle, _ = read_board(page)
    assert size == 6, "expected 6x6 round"
    make_conflicts(page, puzzle, size, ERR_TARGET)
    sol = solve_via_page(page, puzzle, size)
    fill_board(page, sol)
    page.wait_for_timeout(400)
    h = page.evaluate("JSON.parse(localStorage.getItem('redtools.shudurumen.v1')).history")
    print("   [history 尾部]", h[-2:] if h else h)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 390, "height": 844})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL)
        page.evaluate("localStorage.clear()")
        page.reload()

        # 第一局（history 不足 2 → 不触发降档建议）
        play_bad_to_settle(page)
        page.locator("button:has-text('选难度')").click()  # 关闭结算回难度页
        home_text = page.locator(".view").inner_text()
        check("A2 难度页无 '🌱' 横幅", "🌱" not in home_text)
        check("A3 无 .diff-btn.suggested 高亮", page.locator(".diff-btn.suggested").count() == 0)

        # 第二局（触发降档建议）
        play_bad_to_settle(page)
        settle2 = page.locator(".overlay").inner_text()
        check("B1 结算浮层出现 '🌱 建议'",
              "🌱" in settle2 and "建议" in settle2, settle2[:120])
        check("B2 建议措辞含 '不扣分'", "不扣分" in settle2, settle2[:120])
        page.locator("button:has-text('选难度')").click()

        # 难度页：横幅 + 建议档高亮
        home2 = page.locator(".view").inner_text()
        check("C1 难度页出现 '🌱' 横幅", "🌱" in home2, home2[:120])
        sug = page.locator(".diff-btn.suggested")
        check("C2 建议档按钮高亮 1 个", sug.count() == 1)
        check("C3 高亮的是「简单」4×4", sug.count() == 1 and "简单" in sug.first.inner_text())

        # 进入任一局（消费建议）→ 返回 → 横幅/高亮消失
        sug_btn = page.locator(".diff-btn.suggested").first
        sug_label = sug_btn.inner_text() if sug_btn.count() else ""
        sug_btn.click()
        page.wait_for_timeout(400)
        check("D0 进入建议档对局", page.locator(".cell").count() > 0)
        # 返回难度页（游戏页返回按钮）
        page.locator(".topbar button, .btn-ghost").first.click()
        page.wait_for_timeout(400)
        if page.locator(".diff-btn").count() == 0:
            page.locator("button:has-text('返回'), button:has-text('难度'), .btn-ghost").first.click()
            page.wait_for_timeout(400)
        home3 = page.locator(".view").inner_text()
        check("D1 进入对局后横幅已消费", "🌱" not in home3, home3[:120])
        check("D2 无高亮按钮残留", page.locator(".diff-btn.suggested").count() == 0)

        # E. 无 JS 报错
        check("E1 全程无 JS 报错", len(errors) == 0, "; ".join(errors))

        browser.close()

    print("\n=== 结果：%d 项，失败 %d ===" % (8, len(FAILS)))
    if FAILS:
        print("失败项:", ", ".join(FAILS))
        raise SystemExit(1)


if __name__ == "__main__":
    main()