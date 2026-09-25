#!/usr/bin/env python3
"""数独思维 v1.5 冒烟测试：行列排除/区块排除教学关 + 技巧徽章墙（Playwright + 本地 chromium，file:// 协议）

用例：
  A. 难度页技巧入口 4 个（单宫/行列/区块/交叉）+ 🏆 徽章墙入口
  B. 行列排除教学关：标题 + 首步行高亮 4 格 → 错数温和提示不计错 → 落 3 → 步 2 列高亮 4 格 → 落 2 → 徽章弹窗
  C. 区块排除教学关：标题 + 宫高亮 → 落 4 → 落 3 → 徽章弹窗
  C8+. 交叉排除教学关（L4）：标题 + 行0+列3 交叉高亮 7 格 → 错数提示 → 落 4 → 行1+列3 交叉高亮 → 落 2 → 徽章弹窗
  D. 徽章墙：4 张卡 = 3 枚 ✅（行列/区块/交叉）+ 1 枚 🎯（单宫未做）+ 🔒 0（四技巧全可学）
  E. 徽章墙 → 点可学卡 → 教学关 → 返回徽章墙（返回路由）
  F. 徽章墙返回 → 难度页
  G. 全程无 JS 报错
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
        check("A1 技巧入口 4 个", page.locator(".skill-btn").count() == 4)
        check("A2 徽章墙入口存在", page.locator(".badge-btn").count() == 1)
        heads = page.locator(".skill-btn .teach-btn-head").all_inner_texts()
        check("A3 四技巧文案齐备",
              any("单宫排除" in h for h in heads)
              and any("行列排除" in h for h in heads)
              and any("区块排除" in h for h in heads)
              and any("交叉排除" in h for h in heads))

        # B. 行列排除教学关（第 2 个入口）
        page.locator(".skill-btn").nth(1).click()
        check("B1 标题含'行列排除'",
              "行列排除" in page.locator(".level-title").inner_text())
        check("B2 教学盘 16 格", page.locator("#skill-board .cell").count() == 16)
        # 第一步：行高亮 = 前 4 格 (row0)
        hl = page.locator("#skill-board .cell-inner.peer")
        check("B3 行高亮 4 格", hl.count() == 4)
        row_ok = all(page.locator(f"#skill-board .cell:nth-child({i+1}) .cell-inner.peer").count() == 1
                     for i in range(4))
        check("B4 高亮=第 1 行", row_ok)
        # 错数温和提示（目标格 idx2 = nth-child 3）
        page.locator("#skill-board .cell:nth-child(3)").click()
        check("B5 目标格 target 加强",
              page.locator("#skill-board .cell.target").count() == 1)
        page.locator(".num-btn:nth-child(1)").click()  # 数字 1（错，应为 3）
        check("B6 温和提示'高亮的地方'",
              "高亮的地方" in page.locator("#skill-msg").inner_text())
        check("B7 盘面未变",
              page.locator("#skill-board .cell:nth-child(3) .skill-num").count() == 0)
        # 正确落 3
        page.locator(".num-btn:nth-child(3)").click()
        check("B8 落子 3",
              page.locator("#skill-board .cell:nth-child(3) .skill-num").inner_text().strip() == "3")
        # 第二步：列高亮 = 第 4 列 (idx 3,7,11,15 → nth 4,8,12,16)
        check("B9 第二步文字含'这一列'",
              "这一列" in page.locator("#skill-msg").inner_text())
        hl2 = page.locator("#skill-board .cell-inner.peer")
        col_ok = (hl2.count() == 4
                  and all(page.locator(f"#skill-board .cell:nth-child({n}) .cell-inner.peer").count() == 1
                          for n in (4, 8, 12, 16)))
        check("B10 列高亮=第 4 列", col_ok)
        # 落 2 完成
        page.locator("#skill-board .cell:nth-child(8)").click()
        page.locator(".num-btn:nth-child(2)").click()
        check("B11 落子 2",
              page.locator("#skill-board .cell:nth-child(8) .skill-num").inner_text().strip() == "2")
        check("B12 徽章弹窗'学会啦'",
              page.locator(".overlay-title").inner_text().strip() == "🎉 学会啦！")
        check("B13 弹窗含'行列排除'",
              "行列排除" in page.locator(".overlay .summary").inner_text())
        page.locator(".overlay .btn-main").click()

        # C. 区块排除教学关（第 3 个入口）
        page.locator(".skill-btn").nth(2).click()
        check("C1 标题含'区块排除'",
              "区块排除" in page.locator(".level-title").inner_text())
        # 第一步：宫高亮 = 右上宫 (idx 2,3,6,7 → nth 3,4,7,8)
        hl3 = page.locator("#skill-board .cell-inner.peer")
        box_ok = (hl3.count() == 4
                  and all(page.locator(f"#skill-board .cell:nth-child({n}) .cell-inner.peer").count() == 1
                          for n in (3, 4, 7, 8)))
        check("C2 宫高亮=右上宫", box_ok)
        # 错数提示
        page.locator("#skill-board .cell:nth-child(3)").click()
        page.locator(".num-btn:nth-child(2)").click()  # 数字 2（错，应为 4）
        check("C3 温和提示'高亮的地方'",
              "高亮的地方" in page.locator("#skill-msg").inner_text())
        # 落 4 完成第一步
        page.locator(".num-btn:nth-child(4)").click()
        check("C4 落子 4",
              page.locator("#skill-board .cell:nth-child(3) .skill-num").inner_text().strip() == "4")
        # 落 3 完成
        page.locator("#skill-board .cell:nth-child(8)").click()
        page.locator(".num-btn:nth-child(3)").click()
        check("C5 落子 3",
              page.locator("#skill-board .cell:nth-child(8) .skill-num").inner_text().strip() == "3")
        check("C6 徽章弹窗'学会啦'",
              page.locator(".overlay-title").inner_text().strip() == "🎉 学会啦！")
        page.locator(".overlay .btn-main").click()
        check("C7 回难度页", page.locator(".diff-btn").count() == 3)

        # C8+. 交叉排除教学关（第 4 个入口）
        page.locator(".skill-btn").nth(3).click()
        check("C8 标题含'交叉排除'",
              "交叉排除" in page.locator(".level-title").inner_text())
        # 第一步：交叉高亮 = 行0 + 列3（7 格：nth 1,2,3,4,8,12,16）
        hl4 = page.locator("#skill-board .cell-inner.peer")
        cross_ok = (hl4.count() == 7
                    and all(page.locator(f"#skill-board .cell:nth-child({n}) .cell-inner.peer").count() == 1
                            for n in (1, 2, 3, 4, 8, 12, 16)))
        check("C9 交叉高亮 7 格（行0+列3）", cross_ok)
        # 错数提示
        page.locator("#skill-board .cell:nth-child(4)").click()  # 目标格 (0,3)
        page.locator(".num-btn:nth-child(2)").click()  # 数字 2（错，应为 4）
        check("C10 温和提示'高亮的地方'",
              "高亮的地方" in page.locator("#skill-msg").inner_text())
        # 落 4 完成第一步
        page.locator(".num-btn:nth-child(4)").click()
        check("C11 落子 4",
              page.locator("#skill-board .cell:nth-child(4) .skill-num").inner_text().strip() == "4")
        # 第二步：交叉高亮 = 行1 + 列3（7 格：nth 4,5,6,7,8,12,16）
        hl5 = page.locator("#skill-board .cell-inner.peer")
        cross2_ok = (hl5.count() == 7
                     and all(page.locator(f"#skill-board .cell:nth-child({n}) .cell-inner.peer").count() == 1
                             for n in (4, 5, 6, 7, 8, 12, 16)))
        check("C12 第二步行1+列3 交叉高亮 7 格", cross2_ok)
        check("C13 第二步文字含'三个方向'",
              "三个方向" in page.locator("#skill-msg").inner_text())
        # 落 2 完成
        page.locator("#skill-board .cell:nth-child(8)").click()  # 目标格 (1,3)
        page.locator(".num-btn:nth-child(2)").click()
        check("C14 落子 2",
              page.locator("#skill-board .cell:nth-child(8) .skill-num").inner_text().strip() == "2")
        check("C15 徽章弹窗'学会啦'",
              page.locator(".overlay-title").inner_text().strip() == "🎉 学会啦！")
        page.locator(".overlay .btn-main").click()
        check("C16 回难度页", page.locator(".diff-btn").count() == 3)

        # D. 徽章墙（完成 行列/区块/交叉 3 枚）
        page.locator(".badge-btn").click()
        check("D1 徽章墙标题", "技巧徽章墙" in page.locator(".page-title").inner_text())
        cards = page.locator(".teach-btn.badge-card")
        check("D2 卡片 4 张", cards.count() == 4)
        # 本脚本完成了 行列/区块/交叉 三枚 → ✅ 3 + 🎯 1（单宫排除未做）+ 🔒 0
        check("D3 已点亮 ✅ 3 枚",
              page.locator(".teach-btn.badge-card .teach-btn-head", has_text="✅").count() == 3)
        check("D3b 可学习 🎯 1 枚",
              page.locator(".teach-btn.badge-card .teach-btn-head", has_text="🎯").count() == 1)
        check("D4 无锁定卡（四技巧全部可学）",
              page.locator(".teach-btn.badge-card.locked").count() == 0)

        # E. 徽章墙 → 已点亮卡 → 教学关 → 返回徽章墙
        page.locator(".teach-btn.badge-card:not(.locked)").first.click()
        check("E1 进入教学关（单宫排除）",
              page.locator("#skill-board .cell").count() == 16)
        page.locator("button:has-text('← 返回')").click()
        check("E2 返回徽章墙（非难度页）",
              page.locator(".teach-btn.badge-card").count() == 4
              and "技巧徽章墙" in page.locator(".page-title").inner_text())

        # F. 徽章墙返回难度页
        page.locator("button:has-text('← 返回')").click()
        check("F1 回难度页", page.locator(".diff-btn").count() == 3)

        # G. 无 JS 报错
        check("G1 全程无 JS 报错", len(errors) == 0, "; ".join(errors))

        browser.close()

    print("\n=== 结果：%d 项，失败 %d ===" % (41, len(FAILS)))
    if FAILS:
        print("失败项:", ", ".join(FAILS))
        raise SystemExit(1)


if __name__ == "__main__":
    main()

