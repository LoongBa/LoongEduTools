#!/usr/bin/env python3
"""数独思维 v1.14 截图：设置面板（音效/清除进度/关于）+ 清除确认浮层"""
from pathlib import Path
from playwright.sync_api import sync_playwright

DIST = Path(__file__).resolve().parents[6].joinpath("RedTools", "dist", "益智", "数独思维", "offline")
URL = DIST.joinpath("index.html").as_uri()
OUT = Path(__file__).resolve().parent / "_shots"
OUT.mkdir(parents=True, exist_ok=True)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 420, "height": 880})
        page.goto(URL)
        page.evaluate("localStorage.clear()")
        page.reload()

        # 1. 设置视图（音效开态 + 清除进度 + 关于）
        page.locator("button:has-text('设置')").click()
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT / "v114_settings_view.png"))

        # 2. 清除确认浮层
        page.locator(".settings-row", has_text="清除").locator("button").click()
        page.wait_for_timeout(250)
        page.screenshot(path=str(OUT / "v114_clear_confirm.png"))

        browser.close()
    print("截图已保存到", OUT)


if __name__ == "__main__":
    main()
