# -*- coding: utf-8 -*-
"""数独思维 v1.17 截图：每日挑战卡动态难度 + 成就 8 枚视图"""
from pathlib import Path
from playwright.sync_api import sync_playwright

DIST = Path(r"F:\LoongBa_Git\LoongEduTools\RedTools\dist\益智\数独思维\offline")
URL = DIST.joinpath("index.html").as_uri()
OUT = Path(r"C:\Users\coffe\AppData\Local\Temp\opencode\pw-smoke\shots_v117")
OUT.mkdir(parents=True, exist_ok=True)


def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 420, "height": 880})
        pg.goto(URL)
        pg.evaluate("localStorage.clear()")
        pg.reload()
        # 1. 难度页（每日挑战卡动态难度 sub）
        pg.screenshot(path=str(OUT / "v117_home_daily_dynamic.png"))
        # 2. 成就视图（8 枚）
        pg.locator("button:has-text('成就')").click()
        pg.wait_for_timeout(250)
        pg.screenshot(path=str(OUT / "v117_achievement_8.png"))
        b.close()
    print("截图已保存到", OUT)


if __name__ == "__main__":
    main()