#!/usr/bin/env python3
"""数独侦探 技巧教学关 冒烟测试（Playwright + 本地 chromium，file:// 协议）

用例（v1.4 单宫排除教学关；v1.5 起难度页共 3 个技巧入口，本脚本聚焦首个=单宫排除）：
  A. 难度页有 3 个技巧入口（首卡单宫排除，未点亮：🎯 前缀）
  B. 点击进入教学关：顶栏标题「单宫排除」+ 教学关标识
  C. 棋盘 16 格 + 数字条 4 键
  D. 第一步引导：高亮宫 4 格 + 目标格 target
  E. 点错误数字 → 温和提示 + 不计错误（无错误计数 UI）
  F. 点目标格 → 点正确数字 2 → 落子 + 进入第二步
  G. 第二步引导更新（右上宫高亮）
  H. 点正确数字 1 → 完成 → 徽章弹窗（🎉 学会啦）
  I. 关闭 → 难度页入口变 ✅ 已点亮
  J. 返回再进教学关：可再练（重复流程）
  K. 全程无 JS 报错
"""
from pathlib import Path

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


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 390, "height": 844})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL)
        page.evaluate("localStorage.clear()")
        page.reload()

        # A. 技巧教学入口
        check("A1 技巧入口存在(4 个)", page.locator(".skill-btn").count() == 4)
        check("A2 未点亮前缀🎯",
              page.locator(".skill-btn .teach-btn-head").first.inner_text().strip().startswith("🎯"))

        # B. 进入教学关（首个=单宫排除）
        page.locator(".skill-btn").first.click()
        check("B1 教学关标题含'单宫排除'",
              "单宫排除" in page.locator(".level-title").inner_text())
        check("B2 教学关标识'不计入进度'",
              "不计入进度" in page.locator(".level-title small").inner_text())

        # C. 棋盘 + 数字条
        check("C1 教学盘 16 格", page.locator("#skill-board .cell").count() == 16)
        check("C2 数字条 4 键", page.locator(".num-btn").count() == 4)
        check("C3 已知格 14 个", page.locator("#skill-board .cell-inner.given").count() == 14)

        # D. 第一步引导高亮
        check("D1 宫高亮 4 格", page.locator("#skill-board .cell-inner.peer").count() == 4)

        # E. 点错误数字（先选目标空格 → target 加强生效）
        page.locator("#skill-board .cell:nth-child(2)").click()
        check("E0 选中目标格 target 加强",
              page.locator("#skill-board .cell.target").count() == 1)
        page.locator(".num-btn:nth-child(1)").click()  # 点数字 1（错误，应为 2）
        check("E2 错误后温和提示",
              "高亮的地方" in page.locator("#skill-msg").inner_text())
        check("E3 盘面未变（格 2 仍空）",
              page.locator("#skill-board .cell:nth-child(2) .skill-num").count() == 0)
        check("E4 无错误计数 UI", page.locator(".game-footer").count() == 0)

        # F. 点正确数字 2
        page.locator(".num-btn:nth-child(2)").click()
        check("F1 落子成功（格 2 有数字 2）",
              page.locator("#skill-board .cell:nth-child(2) .skill-num").inner_text().strip() == "2")

        # G. 第二步引导
        check("G1 第二步文字含'右上'",
              "右上" in page.locator("#skill-msg").inner_text())
        check("G2 新宫高亮（右上宫=格3,4,7,8）",
              page.locator("#skill-board .cell-inner.peer").count() == 4)

        # H. 完成第二步
        page.locator("#skill-board .cell:nth-child(7)").click()  # 空格 (1,2) → nth-child(7)
        page.locator(".num-btn:nth-child(1)").click()  # 点数字 1
        check("H1 落子成功（格 7 有数字 1）",
              page.locator("#skill-board .cell:nth-child(7) .skill-num").inner_text().strip() == "1")
        check("H2 徽章弹窗'学会啦'",
              page.locator(".overlay-title").inner_text().strip() == "🎉 学会啦！")
        check("H3 弹窗含'单宫排除'徽章",
              "单宫排除" in page.locator(".overlay .summary").inner_text())

        # I. 关闭 → 难度页入口点亮
        page.locator(".overlay .btn-main").click()
        check("I1 回难度页", page.locator(".diff-btn").count() == 3)
        check("I2 入口变✅",
              page.locator(".skill-btn .teach-btn-head").first.inner_text().strip().startswith("✅"))

        # J. 再进可重练
        page.locator(".skill-btn").first.click()
        check("J1 再次进入教学关", page.locator("#skill-board .cell").count() == 16)
        check("J2 重练第一步引导（tip 提示'缺哪个就填哪个'）",
              "缺哪个就填哪个" in page.locator("#skill-msg").inner_text())
        page.locator("button:has-text('← 返回')").click()
        check("J3 返回难度页", page.locator(".diff-btn").count() == 3)

        # K. 无 JS 报错
        check("K1 全程无 JS 报错", len(errors) == 0, "; ".join(errors))

        browser.close()

    print("\n=== 结果：%d 项，失败 %d ===" % (28, len(FAILS)))
    if FAILS:
        print("失败项:", ", ".join(FAILS))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
