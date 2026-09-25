#!/usr/bin/env python3
"""数独思维 v1.18 截图：闯关×技巧徽章联动（技巧 tag）+ 每日挑战打卡卡 + 成就 10 枚"""
from pathlib import Path
from playwright.sync_api import sync_playwright

DIST = Path(__file__).resolve().parents[6].joinpath("RedTools", "dist", "益智", "数独思维", "offline")
URL = DIST.joinpath("index.html").as_uri()
STORE_KEY = "redtools.shudurumen.v1"
OUT = Path(__file__).resolve().parent.parent.joinpath("shots_v118")
OUT.mkdir(exist_ok=True)


def inject(page, patch_js):
    page.evaluate("""function () {
      var s = JSON.parse(localStorage.getItem('redtools.shudurumen.v1'));
      if (!s) { s = {}; }
      %s;
      localStorage.setItem('redtools.shudurumen.v1', JSON.stringify(s));
    }""" % patch_js)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 390, "height": 2100})  # 高视口容纳难度页全卡片（.view 为滚动容器，full_page 无效）
        page.goto(URL)
        page.evaluate("localStorage.clear()")
        page.reload(); page.wait_for_timeout(400)

        # 1. 难度页：streak 卡（注入近 3 天打卡）+ 闯关卡 sub（0/9 · 0/6）
        import datetime
        d = datetime.date.today()
        d2 = (d - datetime.timedelta(days=2)).strftime("%Y%m%d")
        d1 = (d - datetime.timedelta(days=1)).strftime("%Y%m%d")
        d0 = d.strftime("%Y%m%d")
        inject(page, "s.checkin = { dates: ['%s','%s','%s'], streak: 3 }; s.daily = { date: '%s', level: '6' };"
               % (d2, d1, d0, d0))
        page.reload(); page.wait_for_timeout(400)
        page.screenshot(path=str(OUT.joinpath("1_home_streak.png")), full_page=True)

        # 2. 闯关地图：技巧 tag 初始（9 🎯）
        page.locator("button:has-text('闯关地图')").click(); page.wait_for_timeout(300)
        page.screenshot(path=str(OUT.joinpath("2_map_tags_initial.png")), full_page=True)

        # 3. 闯关地图 + 联动态：注入 boxElim 点亮 + 通关 1-1 → tag ✅ + sub 1/6（注入后须 reload 让内存 store 同步）
        inject(page, "s.skills = s.skills || {}; s.skills.boxElim = true;"
                     "s.mapProgress = { completed: [{ i: 0, doneAt: '%s' }] };" % d0)
        page.reload(); page.wait_for_timeout(400)
        page.locator("button:has-text('闯关地图')").click(); page.wait_for_timeout(300)
        page.screenshot(path=str(OUT.joinpath("3_map_linked.png")), full_page=True)

        # 4. 成就视图 10 枚（注入 2 解锁）
        page.locator("button:has-text('← 返回')").click(); page.wait_for_timeout(200)
        inject(page, "s.achievements = { firstDaily: '20260925', perfect3: '20260925' };")
        page.reload(); page.wait_for_timeout(400)
        page.locator("button:has-text('成就')").click(); page.wait_for_timeout(300)
        page.screenshot(path=str(OUT.joinpath("4_achievements_10.png")), full_page=True)

        browser.close()
    print("OK:", OUT)


if __name__ == "__main__":
    main()