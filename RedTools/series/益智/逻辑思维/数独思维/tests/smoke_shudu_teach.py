#!/usr/bin/env python3
"""数独思维 规则教学 冒烟测试（Playwright + 本地 chromium，file:// 协议）

用例（v1.3 规则教学）：
  A. 难度页有「📖 规则教学」入口（teach-btn 存在且文案正确）
  B. 点击打开教学弹窗：teach-card 可见 + 标题「每一行」
  C. 演示盘 16 格渲染：第一步行高亮 4 格（.teach-cell.hl）
  D. 下一步 → 标题「每一列」+ 列高亮 4 格
  E. 下一步 → 标题「每个宫」+ 宫高亮 4 格
  F. 末步按钮变「开始挑战」
  G. 上一步 → 回「每个宫」；再下一步 → 末步
  H. 开始挑战 → 弹窗关闭回到难度页
  I. 重新打开 → 跳过 → 弹窗关闭
  J. 翻页全程无 JS 报错
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

        # A. 难度页教学入口
        check("A1 教学入口存在", page.locator(".teach-btn:not(.skill-btn):not(.badge-btn):not(.book-btn)").count() == 1)
        check("A2 入口文案",
              page.locator(".teach-btn:not(.skill-btn):not(.badge-btn):not(.book-btn) .teach-btn-head").inner_text().strip() == "📖 规则教学")
        check("A3 入口副标题含'行'",
              "行" in page.locator(".teach-btn:not(.skill-btn):not(.badge-btn):not(.book-btn) .teach-btn-sub").inner_text())

        # B. 打开教学弹窗
        page.locator(".teach-btn:not(.skill-btn):not(.badge-btn):not(.book-btn)").click()
        check("B1 弹窗可见", page.locator(".teach-card").is_visible())
        check("B2 标题'每一行'",
              page.locator(".teach-title").inner_text().strip() == "每一行")
        check("B3 演示盘 16 格", page.locator(".teach-cell").count() == 16)

        # C. 第一步行高亮 4 格
        hl = page.locator(".teach-cell.hl")
        check("C1 行高亮 4 格", hl.count() == 4)
        row_hl_ok = True
        for i in range(4):
            if not page.locator(f".teach-cell:nth-child({i+1})").evaluate(
                    "el => el.classList.contains('hl')"):
                row_hl_ok = False
        check("C2 高亮=前4格", row_hl_ok)
        check("C3 缺格显示'?'",
              page.locator(".teach-cell:nth-child(2) .teach-q").count() == 1)

        # D. 下一步 → 每一列
        page.locator("button:has-text('下一步')").click()
        check("D1 标题'每一列'",
              page.locator(".teach-title").inner_text().strip() == "每一列")
        col_hl_ok = True
        for r in range(4):
            if not page.locator(f".teach-cell:nth-child({r*4+2})").evaluate(
                    "el => el.classList.contains('hl')"):
                col_hl_ok = False
        check("D2 列高亮=第2列4格", col_hl_ok)

        # E. 下一步 → 每个宫
        page.locator("button:has-text('下一步')").click()
        check("E1 标题'每个宫'",
              page.locator(".teach-title").inner_text().strip() == "每个宫")
        box_hl_ok = True
        for idx in (1, 2, 5, 6):
            if not page.locator(f".teach-cell:nth-child({idx})").evaluate(
                    "el => el.classList.contains('hl')"):
                box_hl_ok = False
        check("E2 宫高亮=左上宫4格", box_hl_ok)

        # F. 末步按钮变「开始挑战」
        page.locator("button:has-text('下一步')").click()
        check("F1 末步标题'开动小脑瓜'",
              page.locator(".teach-title").inner_text().strip() == "开动小脑瓜")
        check("F2 按钮变'开始挑战'",
              page.locator(".teach-card .btn-main").inner_text().strip() == "开始挑战")
        check("F3 末步无高亮", page.locator(".teach-cell.hl").count() == 0)

        # G. 上一步 → 回「每个宫」；再下一步 → 末步
        page.locator("button:has-text('上一步')").click()
        check("G1 上一步回'每个宫'",
              page.locator(".teach-title").inner_text().strip() == "每个宫")
        page.locator("button:has-text('下一步')").click()
        check("G2 再下一步回末步",
              page.locator(".teach-title").inner_text().strip() == "开动小脑瓜")

        # H. 开始挑战 → 关闭弹窗回难度页
        page.locator(".teach-card .btn-main").click()
        check("H1 弹窗关闭", page.locator(".teach-card").count() == 0)
        check("H2 回难度页", page.locator(".diff-btn").count() == 3)

        # I. 重新打开 → 跳过
        page.locator(".teach-btn:not(.skill-btn):not(.badge-btn):not(.book-btn)").click()
        check("I1 再次打开可见", page.locator(".teach-card").is_visible())
        page.locator("button:has-text('跳过')").click()
        check("I2 跳过关闭弹窗", page.locator(".teach-card").count() == 0)

        # J. 无 JS 报错
        check("J1 全程无 JS 报错", len(errors) == 0, "; ".join(errors))

        browser.close()

    print("\n=== 结果：%d 项，失败 %d ===" % (30, len(FAILS)))
    if FAILS:
        print("失败项:", ", ".join(FAILS))
        raise SystemExit(1)


if __name__ == "__main__":
    main()

