#!/usr/bin/env python3
"""数独侦探 v1.7 冒烟测试：分享题（文本导出/复制 + 打印图片 + 答案切换）+ 导入题目（校验/开局/不计成绩）（Playwright + file://）

用例：
  A. 难度页「📥 导入题目」入口存在
  B. 4×4 求解通关 → 结算浮层
  C. 结算含「📤 分享这题」→ 进入分享弹层
  D. 弹层：export-zone 文本含 SD4: / 复制按钮 / img.share-img 可见 / 查看答案版 ↔ 返回题面版
  E. 返回结算 → 再来一局 → 返回难度
  F. 导入弹层：乱输入 → #import-err 温和拒绝、留在弹层
  G. 合法导入（页面生成 SD6 唯一解文本）→ 36 格 + 顶栏「导入题」标记
  H. 导入局通关 → 结算含「不计入成绩」· store.best['6'] 未写 · 打卡天数未增
  I. 全程无 JS 报错
"""
from pathlib import Path
import json

from playwright.sync_api import sync_playwright

DIST = Path(__file__).resolve().parents[6].joinpath("RedTools", "dist", "益智", "数独侦探", "offline")
URL = DIST.joinpath("index.html").as_uri()
STORE_KEY = "redtools.shudurumen.v1"

FAILS = []


def check(name, cond, extra=""):
    if cond:
        print("  PASS  " + name)
    else:
        print("  FAIL  " + name + ("  | " + extra if extra else ""))
        FAILS.append(name)


def read_store(page):
    raw = page.evaluate("localStorage.getItem('%s')" % STORE_KEY)
    return json.loads(raw) if raw else None


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
      return out; }""")
    return size, [d["v"] for d in data], [d["given"] for d in data]


def solve_via_page(page, puzzle, n):
    return page.evaluate("""function (arg) {
      var puzzle = arg.puzzle, N = arg.N; var b = puzzle.slice();
      function bt(pos) {
        while (pos < N*N && b[pos] !== 0) { pos++; }
        if (pos === N*N) { return true; }
        var r = Math.floor(pos/N), c = pos%N;
        for (var v=1; v<=N; v++) { if (window.SUDOKU.cellValid(b,N,r,c,v)) { b[pos]=v; if (bt(pos+1)) return true; b[pos]=0; } }
        return false; }
      return bt(0) ? b : null; }""", {"puzzle": puzzle, "N": n})


def fill_board(page, solution):
    size = len(solution)
    n = int(round(size ** 0.5))
    _, puzzle, given = read_board(page)
    for i in range(size):
        if given[i]:
            continue
        page.locator(".cell").nth(i).click()
        page.wait_for_timeout(40)
        page.locator(".num-row .num-btn", has_text=str(solution[i])).click()
        page.wait_for_timeout(45)
    page.wait_for_timeout(500)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 390, "height": 844})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL)
        page.evaluate("localStorage.clear()")
        page.reload()
        page.wait_for_timeout(300)

        # A. 导入入口
        check("A1 📥导入题目入口存在",
              page.locator(".book-btn", has_text="导入").count() == 1)

        # B. 4×4 通关
        page.locator(".diff-btn").nth(0).click()
        page.wait_for_timeout(400)
        size, puzzle, given = read_board(page)
        sol = solve_via_page(page, puzzle, 4)
        check("B1 盘可解", sol is not None)
        if sol:
            fill_board(page, sol)
            check("B2 结算浮层", page.locator(".overlay").count() == 1)

            # C. 分享这题
            check("C1 结算含「📤 分享这题」",
                  page.locator(".overlay button", has_text="分享这题").count() == 1)
            page.locator(".overlay button", has_text="分享这题").click()
            page.wait_for_timeout(200)

            # D. 分享弹层
            txt = page.locator(".export-zone").input_value()
            check("D1 文本含 SD4:", "SD4:" in txt, txt[:60])
            check("D2 文本含完整 16 位盘面（SD4: 0~4 ×16）",
                  __import__("re").search(r"SD4:[0-4](,[0-4]){15}", txt) is not None, txt[:60])
            check("D3 复制按钮存在",
                  page.locator("button", has_text="复制题目").count() == 1)
            check("D4 题面图片可见", page.locator(".share-img").count() == 1)
            page.locator("button", has_text="查看答案版").click()
            page.wait_for_timeout(150)
            check("D5 答案版切换按钮变'返回题面版'",
                  page.locator("button", has_text="返回题面版").count() == 1)
            page.locator("button", has_text="返回结算").click()
            page.wait_for_timeout(200)

            # E. 返回结算 → 再来一局 → 回难度
            check("E1 回到结算浮层",
                  page.locator(".overlay-title").inner_text().strip().find("数独完成") >= 0)
            page.locator(".overlay button", has_text="再来一局").click()
            page.wait_for_timeout(300)
            page.locator("button:has-text('← 返回')").click()
            page.wait_for_timeout(200)
            check("E2 回难度页", page.locator(".diff-btn").count() == 3)

        # F. 导入：非法输入温和拒绝
        checkin_before = 0
        st = read_store(page)
        if st and st.get("checkin"):
            checkin_before = len(st["checkin"].get("dates", []))
        page.locator(".book-btn", has_text="导入").click()
        page.wait_for_timeout(200)
        check("F1 导入弹层", page.locator(".import-zone").count() == 1)
        page.locator(".import-zone").fill("这是乱填的内容 abc 123")
        page.locator("button", has_text="导入并开始").click()
        page.wait_for_timeout(150)
        check("F2 非法输入温馨拒绝",
              page.locator("#import-err").inner_text().strip() != ""
              and page.locator(".overlay").count() == 1)
        # 数字非法（值越界）
        page.locator(".import-zone").fill("SD4:1,2,3,4,5,6,7,8,9,2,3,4,5,6,7,8")
        page.locator("button", has_text="导入并开始").click()
        page.wait_for_timeout(150)
        check("F3 值越界拒绝", "0~" in page.locator("#import-err").inner_text())

        # G. 合法导入：页面生成 6×6 唯一解
        g = page.evaluate("window.SUDOKU.genPuzzle(6, 21)")
        import_txt = "数独侦探 · 6×6\nSD6:" + ",".join(str(x) for x in g["puzzle"]) + "\n（导入测试）"
        page.locator(".import-zone").fill(import_txt)
        page.locator("button", has_text="导入并开始").click()
        page.wait_for_timeout(400)
        check("G1 导入局 36 格", page.locator(".cell").count() == 36)
        check("G2 顶栏导入题标记",
              "导入题" in page.locator(".level-title small").inner_text())

        # H. 导入局通关：不计成绩/打卡
        size, puzzle, given = read_board(page)
        sol6 = solve_via_page(page, puzzle, 6)
        check("H1 导入局可解", sol6 is not None)
        if sol6:
            fill_board(page, sol6)
            page.wait_for_timeout(400)
            check("H2 通关结算", page.locator(".overlay").count() == 1)
            ov_text = page.locator(".overlay").inner_text()
            check("H3 结算含'不计入成绩'", "不计入成绩" in ov_text, ov_text[:80])
            check("H4 无打卡行", "已打卡" not in ov_text)
            st = read_store(page)
            check("H5 best['6'] 未写（导入局不计最佳）",
                  st and "6" not in st.get("best", {}))
            check("H6 打卡天数未增",
                  st and len(st["checkin"].get("dates", [])) == checkin_before,
                  "before=%d after=%d" % (checkin_before, len(st["checkin"].get("dates", []))))

        # I. 无 JS 报错
        check("I1 全程无 JS 报错", len(errors) == 0, "; ".join(errors))

        browser.close()

    print("\n=== 结果：%d 项，失败 %d ===" % (25, len(FAILS)))
    if FAILS:
        print("失败项:", ", ".join(FAILS))
        raise SystemExit(1)


if __name__ == "__main__":
    main()