#!/usr/bin/env python3
"""英语点读 U1 — 字幕改造冒烟测试

验证：
1. 字幕区只显示中文（caption-text 为 track_genre，无 caption-cn 元素）
2. 单行字幕正常（如 Page 2 "第一单元 在家帮忙"）
3. 多行字幕（如 Page 15 歌谣）\n 转 <br>，is-multiline 类 + 可滚动
4. 关闭按钮（×）隐藏字幕区，is-hidden
5. 顶栏「字幕」开关恢复显示
6. localStorage 持久化（重载后保持关闭状态）
"""
import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright

DIST = Path(r"F:\LoongBa_Git\LoongEduTools\RedTools\publish\学科\新英语四上点读1单元_解压测试版")
FAIL = []


def ok(msg):
    print(f"  ✅ {msg}")


def fail(msg):
    print(f"  ❌ {msg}")
    FAIL.append(msg)


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 420, "height": 800})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        index = DIST / "index.html"
        await page.goto(index.as_uri())
        await page.wait_for_timeout(800)
        ok("页面加载")

        # 1. 字幕只显示中文：无 caption-cn 元素
        cn_count = await page.eval_on_selector_all(".caption-cn", "els => els.length")
        assert cn_count == 0, f"caption-cn 仍存在: {cn_count}"
        ok("无 .caption-cn 元素（英文行已移除）")

        # 2. 默认页（Page 2）初始字幕 = 占位文字
        caption_text = await page.text_content(".caption-text")
        assert caption_text and "点击课文区域试听" in caption_text, f"初始字幕异常: {caption_text}"
        ok(f"初始占位字幕: {caption_text.strip()}")

        # 2b. 点击第一条热区 → 字幕 = 中文 track_genre
        await page.click(".hotspot >> nth=0")
        await page.wait_for_timeout(400)
        caption_text = await page.text_content(".caption-text")
        assert caption_text and "第一单元" in caption_text, f"点击后字幕异常: {caption_text}"
        ok(f"点击热区后字幕中文: {caption_text.strip()}")

        # 3. 顶栏有「字幕」开关
        cap_btn = await page.locator(".mode-bar .mode-btn", has_text="字幕").count()
        assert cap_btn == 1, f"字幕开关缺失: {cap_btn}"
        ok("顶栏字幕开关存在")

        # 4. 翻页寻找多行字幕热区（歌谣/拼读页，如 Page 3/6/8）
        multiline_spot = None
        for page_try in range(12):
            has_nl = await page.evaluate(
                "() => [...document.querySelectorAll('.hotspot')].some(s => s.title.includes(String.fromCharCode(10)))")
            if has_nl:
                multiline_spot = 0
                # 找到第一个含换行的热区下标
                multiline_spot = await page.evaluate(
                    "() => [...document.querySelectorAll('.hotspot')].findIndex(s => s.title.includes(String.fromCharCode(10)))")
                break
            next_btn = page.locator(".pager-btn-short", has_text="›")
            if await next_btn.is_disabled():
                break
            await next_btn.click()
            await page.wait_for_timeout(150)
        pager = await page.text_content(".pager-info")
        ok(f"翻页到: {pager.strip()}")

        if multiline_spot is None or multiline_spot < 0:
            fail("未找到多行字幕热区")
        else:
            await page.click(f".hotspot >> nth={multiline_spot}")
            await page.wait_for_timeout(400)
            ml_cls = await page.eval_on_selector(".caption-text", "el => el.className")
            ml_html = await page.eval_on_selector(".caption-text", "el => el.innerHTML")
            assert "is-multiline" in ml_cls, f"多行类缺失: {ml_cls}"
            assert "<br>" in ml_html, "多行未转 <br>"
            ok(f"多行字幕: is-multiline + <br> 生效（{ml_html.count('<br>')} 个换行）")

        # 5. 关闭按钮
        await page.click(".caption-close")
        await page.wait_for_timeout(200)
        hidden = await page.eval_on_selector(".caption", "el => el.className")
        assert "is-hidden" in hidden, f"关闭后未隐藏: {hidden}"
        ok("× 关闭 → .caption.is-hidden")

        # 6. 顶栏开关恢复
        await page.click(".mode-bar .mode-btn >> text=字幕")
        await page.wait_for_timeout(200)
        hidden2 = await page.eval_on_selector(".caption", "el => el.className")
        assert "is-hidden" not in hidden2, "开关未恢复字幕"
        ok("字幕开关恢复显示")

        # 7. localStorage 持久化
        await page.click(".caption-close")
        await page.reload()
        await page.wait_for_timeout(800)
        hidden3 = await page.eval_on_selector(".caption", "el => el.className")
        assert "is-hidden" in hidden3, "重载后未保持关闭"
        ok("localStorage 持久化：重载后仍关闭")

        if errors:
            fail(f"JS 错误: {errors[:3]}")
        else:
            ok("无 JS 运行错误")

        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
    if FAIL:
        print(f"\n❌ 测试失败 {len(FAIL)} 项")
        sys.exit(1)
    print("\n✅ 全部通过")
