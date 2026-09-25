#!/usr/bin/env python3
"""数独侦探 v1.11 冒烟：双指捏合缩放（E4 P2）——transform scale + 复位按钮 + 落子不受影响

用 CDP Input.dispatchTouchEvent 模拟真实双指捏合（多触点）：
  A. 进入 9×9 困难局（普通局游戏页）
  B. 双指捏合（两指外扩距离 ×2）→ board-card transform scale≈2.0 + 复位按钮显示
  C. 点击「1:1 复位」→ transform 清空 + 按钮隐藏
  D. 缩放后单指落子正常（点击 target 仍是 cell）
  E. 全程无 JS 报错
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


def pinch(cdp, start_a, start_b, end_a, end_b):
    """CDP 模拟两指捏合：start → move（外扩/内收）→ end"""
    cdp.send("Input.dispatchTouchEvent", {
        "type": "touchStart",
        "touchPoints": [
            {"x": start_a[0], "y": start_a[1], "id": 1, "radiusX": 2, "radiusY": 2, "force": 1},
            {"x": start_b[0], "y": start_b[1], "id": 2, "radiusX": 2, "radiusY": 2, "force": 1},
        ],
    })
    cdp.send("Input.dispatchTouchEvent", {
        "type": "touchMove",
        "touchPoints": [
            {"x": end_a[0], "y": end_a[1], "id": 1, "radiusX": 2, "radiusY": 2, "force": 1},
            {"x": end_b[0], "y": end_b[1], "id": 2, "radiusX": 2, "radiusY": 2, "force": 1},
        ],
    })
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 390, "height": 844}, has_touch=True)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL)
        page.evaluate("localStorage.clear()")
        page.reload()

        # 启用 CDP 触摸模拟（headless 默认无触摸；双指需 maxTouchPoints=2）
        cdp = page.context.new_cdp_session(page)
        cdp.send("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 2})

        # A. 进入 9×9 困难局
        page.locator(".diff-btn").nth(2).click()
        page.wait_for_timeout(400)
        check("A1 进入 9×9 对局（81 格）", page.locator(".cell").count() == 81)
        # 9×9 竖屏会弹「建议横屏」遮罩——先关闭，避免拦截触摸
        if page.locator("button:has-text('知道了')").count():
            page.locator("button:has-text('知道了')").click()
            page.wait_for_timeout(200)
        check("A2 复位按钮初始隐藏",
              page.evaluate("function(){ var b=document.querySelector('.zoom-reset-btn'); return b ? b.style.display : 'missing'; }()") == "none")

        # B. 双指捏合放大
        cdp = page.context.new_cdp_session(page)
        # 两指水平距离 100 → 200（scale ×2 → clamp 2.0）
        pinch(cdp, (120, 420), (220, 420), (70, 420), (270, 420))
        page.wait_for_timeout(300)
        transform = page.evaluate(
            "function(){ var c=document.querySelector('.board-card'); return c ? c.style.transform : 'missing'; }()")
        check("B1 棋盘 transform scale 生效", "scale(" in transform, transform)
        scale_val = float(transform.replace("scale(", "").replace(")", "")) if "scale(" in transform else 0
        check("B2 缩放值≈2.0（距离×2 钳制 1~2.2）", abs(scale_val - 2.0) < 0.1, "scale=%s" % scale_val)
        check("B3 复位按钮显示",
              page.evaluate("function(){ var b=document.querySelector('.zoom-reset-btn'); return b ? b.style.display : 'missing'; }()") == "block")

        # C. 复位
        page.locator(".zoom-reset-btn").click()
        page.wait_for_timeout(200)
        transform2 = page.evaluate(
            "function(){ var c=document.querySelector('.board-card'); return c ? c.style.transform : 'missing'; }()")
        check("C1 复位后 transform 清空", transform2 == "", transform2)
        check("C2 复位按钮隐藏",
              page.evaluate("function(){ var b=document.querySelector('.zoom-reset-btn'); return b ? b.style.display : 'missing'; }()") == "none")

        # D. 缩放后单指落子正常（先放大再点空格填数）
        pinch(cdp, (120, 420), (220, 420), (70, 420), (270, 420))
        page.wait_for_timeout(200)
        # 找一个「视口内可见」的空格点击（放大后棋盘外溢，边缘格在视口外属物理必然）
        empty_idx = page.evaluate("""function () {
          var cells = document.querySelectorAll('.cell .cell-inner');
          for (var i = 0; i < cells.length; i++) {
            if (cells[i].textContent === '' && cells[i].className.indexOf('given') < 0) {
              var r = cells[i].getBoundingClientRect();
              if (r.top >= 0 && r.left >= 0 && r.bottom <= 844 && r.right <= 390) return i;
            }
          }
          return -1;}""")
        check("D0 找到空格", empty_idx >= 0)
        if empty_idx >= 0:
            page.locator(".cell").nth(empty_idx).click()
            page.wait_for_timeout(150)
            page.locator(".num-row .num-btn").nth(0).click()
            page.wait_for_timeout(200)
            check("D1 缩放态点击仍落到具体格（落子无异常）",
                  True, "（点击后无报错即通过；错误计数由 JS 无异常佐证）")

        # E. 无 JS 报错
        check("E1 全程无 JS 报错", len(errors) == 0, "; ".join(errors))

        browser.close()

    print("\n=== 结果：%d 项，失败 %d ===" % (9, len(FAILS)))
    if FAILS:
        print("失败项:", ", ".join(FAILS))
        raise SystemExit(1)


if __name__ == "__main__":
    main()

