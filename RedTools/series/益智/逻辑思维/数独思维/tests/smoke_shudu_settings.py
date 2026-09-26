#!/usr/bin/env python3
"""数独思维 v1.17 冒烟：设置面板（音效开关 / 清除本地进度 / 关于）

用例：
  A. 难度页 ⚙️ 设置卡存在
  B. 设置视图：音效行 toggle 开态 + 清除进度行 + 关于版本
  C. 音效 toggle 关 → store.settings.sound=false + toggle 变「关」灰态；再开 → true
  D. 清除进度 → 确认浮层 → 确认 → localStorage 键清除 + 重载后空态（难度页初始）
  E. 全程无 JS 报错
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
        check("A1 ⚙️ 设置卡存在", page.locator("button:has-text('设置')").count() == 1)

        # B. 设置视图
        page.locator("button:has-text('设置')").click()
        page.wait_for_timeout(300)
        check("B1 标题'设置'", "设置" in page.locator(".page-title").inner_text())
        check("B2 本地数据提示", "只保存在本机" in page.locator(".home-hint").inner_text())
        check("B3 音效行存在", page.locator(".settings-row", has_text="音效").count() == 1)
        toggle = page.locator(".settings-toggle")
        check("B4 音效初始开态", toggle.count() == 1 and "on" in toggle.first.get_attribute("class")
              and toggle.first.inner_text() == "开")
        check("B5 清除进度行存在", page.locator(".settings-row", has_text="清除").count() == 1)
        check("B6 关于含版本 v1.27",
              "v1.27" in page.locator(".settings-about").inner_text()
              or "v1.27" in page.locator(".view").inner_text())

        # C. 音效 toggle
        toggle.first.click()
        page.wait_for_timeout(200)
        st = page.evaluate("JSON.parse(localStorage.getItem('%s')).settings" % STORE_KEY)
        check("C1 关闭后 store.settings.sound=false", st and st["sound"] is False, str(st)[:50])
        check("C2 toggle 变关态", "off" in page.locator(".settings-toggle").first.get_attribute("class")
              and page.locator(".settings-toggle").first.inner_text() == "关")
        page.locator(".settings-toggle").first.click()
        page.wait_for_timeout(200)
        st2 = page.evaluate("JSON.parse(localStorage.getItem('%s')).settings" % STORE_KEY)
        check("C3 再开 store.settings.sound=true", st2 and st2["sound"] is True)

        # D. 清除进度
        page.locator(".settings-row", has_text="清除").locator("button").click()
        page.wait_for_timeout(200)
        check("D1 确认浮层出现", "确定清除" in page.locator(".overlay").inner_text()
              or "清除" in page.locator(".overlay-title").inner_text())
        page.locator("button:has-text('确认清除')").click()
        page.wait_for_timeout(800)
        store_now = page.evaluate("JSON.parse(localStorage.getItem('%s') || '{}')" % STORE_KEY)
        check("D2 清除后 store 为默认空态",
              store_now.get("version") == 1
              and len(store_now.get("history", [])) == 0
              and store_now.get("best", {}) == {}
              and not store_now.get("daily")
              and store_now.get("mapProgress", {}).get("completed", []) == [],
              str(store_now)[:80])
        # reload 后空态
        page.wait_for_timeout(400)
        check("D3 重载后难度页初始态", page.locator(".diff-btn").count() == 3
              and page.locator(".page-title").inner_text() == "选择难度")

        # E. 无 JS 报错
        check("E1 全程无 JS 报错", len(errors) == 0, "; ".join(errors))

        browser.close()

    print("\n=== 结果：%d 项，失败 %d ===" % (14, len(FAILS)))
    if FAILS:
        print("失败项:", ", ".join(FAILS))
        raise SystemExit(1)


if __name__ == "__main__":
    main()



