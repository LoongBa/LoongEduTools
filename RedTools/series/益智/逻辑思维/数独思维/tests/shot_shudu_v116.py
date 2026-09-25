# -*- coding: utf-8 -*-
"""数独思维 v1.16 截图：家长报告成长进度卡（注入完成态验证布局）"""
from pathlib import Path
from playwright.sync_api import sync_playwright

DIST = Path(__file__).resolve().parents[6].joinpath("RedTools", "dist", "益智", "数独侦探", "offline")
URL = DIST.joinpath("index.html").as_uri()
STORE_KEY = "redtools.shudurumen.v1"
OUT = Path(__file__).resolve().parent / "_shots"
OUT.mkdir(parents=True, exist_ok=True)


def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 420, "height": 880})
        pg.goto(URL)
        pg.evaluate("localStorage.clear()")
        # 注入完成态：今日每日挑战完成 + 打卡 4 天 + 成就 2 枚 + 闯关 3 关
        pg.evaluate("""(function(k){
          var s={version:1,best:{},recent:{},checkin:{dates:['20260924','20260925'],streak:2},
            history:[{date:'20260925',level:'4',ms:5000,errors:0,hints:0,stars:3}],
            skills:{boxElim:true},advSkills:{},mistakes:[],favorites:[],
            daily:{date:'20260925',level:'6'},
            achievements:{firstDaily:'20260924',perfect3:'20260925'},
            mapProgress:{completed:[0,1,2]},cur:null,settings:{sound:true}};
          localStorage.setItem(k,JSON.stringify(s));})('%s')""" % STORE_KEY)
        pg.reload()
        pg.locator("button:has-text('家长报告')").click()
        pg.wait_for_timeout(300)
        txt = pg.locator(".view").inner_text()
        pg.screenshot(path=str(OUT / "v116_report_growth_card.png"))
        # 打印成长卡三行
        rows = pg.locator(".report-row").all_inner_texts()
        print("成长进度卡行:")
        for r in rows:
            if any(x in r for x in ("每日挑战", "成就", "闯关")):
                print("  -", r[:80])
        b.close()


if __name__ == "__main__":
    main()