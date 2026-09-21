#!/usr/bin/env python3
"""热区校正工具 — Playwright 冒烟测试

验证：
1. 首页加载 book.json（file input）→ 单元下拉启用
2. 选择重绘/原图/音频目录（webkitdirectory）
3. 进入校正 → 页面图渲染 + 热区渲染
4. 句子列表渲染
5. 热区拖动（pointer 事件）→ corr 更新
6. 保存（localStorage）/ 导出（download 事件）
"""
import asyncio
import json
import sys
from pathlib import Path

from playwright.async_api import async_playwright

REDTOOLS = Path(r"F:\LoongBa_Git\LoongEduTools\RedTools")
EDITOR = REDTOOLS / "重绘工具" / "hotzone_editor" / "index.html"
BOOK = r"F:\LoongBa_Git\LoongEduTools\PEP词库\data\diandu\1212001401255_英语（PEP）_四年级_上册.json"
REDRAWN_DIR = r"F:\_教材素材\人教版（PEP）（主编：吴欣）\四年级\上册\_重绘图片素材"
AUDIO_DIR = r"F:\_教材素材\人教版（PEP）（主编：吴欣）\四年级\上册\_音频素材\单句音频"

FAIL = []


def ok(msg):
    print(f"  ✅ {msg}")


def fail(msg):
    print(f"  ❌ {msg}")
    FAIL.append(msg)


async def collect_files(directory: str, limit: int | None = None) -> list[str]:
    """收集目录内文件路径（webkitdirectory input 需要）"""
    d = Path(directory)
    files = sorted(str(p) for p in d.iterdir() if p.is_file())
    return files[:limit] if limit else files


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        await page.goto(EDITOR.as_uri())
        await page.wait_for_timeout(500)
        ok("首页加载")

        # 1. 加载 book.json
        await page.set_input_files("#file-book", BOOK)
        await page.wait_for_timeout(500)
        info = await page.text_content("#book-info")
        assert "✓" in info, f"book-info 异常: {info}"
        sel_disabled = await page.get_attribute("#sel-unit", "disabled")
        assert sel_disabled is None, "单元下拉未启用"
        ok(f"book.json 加载: {info.strip()}")

        # 单元下拉有值
        unit_opts = await page.eval_on_selector_all("#sel-unit option", "els => els.map(e => e.textContent)")
        assert len(unit_opts) > 1, "单元列表为空"
        ok(f"单元列表: {unit_opts[0]} (共 {len(unit_opts)} 个)")

        # 2. 选择目录（webkitdirectory 需要目录路径）
        await page.set_input_files("#dir-redrawn", REDRAWN_DIR)
        await page.set_input_files("#dir-audio", AUDIO_DIR)
        await page.wait_for_timeout(300)
        ok("目录加载: 重绘目录 + 音频目录")

        # 3. 进入校正
        await page.click("#btn-enter")
        await page.wait_for_timeout(800)
        editor_visible = await page.is_visible("#editor")
        assert editor_visible, "校正页未显示"
        ok("进入校正页")

        # 4. 页面图 + 热区渲染
        img_src = await page.get_attribute("#page-canvas img", "src")
        assert img_src, "页面图未渲染"
        spots = await page.eval_on_selector_all("#page-canvas .hotzone", "els => els.length")
        tracks = await page.eval_on_selector_all("#track-list .track-item", "els => els.length")
        assert spots > 0, "热区未渲染"
        assert tracks > 0, "句子列表为空"
        ok(f"页面渲染: {spots} 热区 / {tracks} 句子")

        # 5. 点击句子 → 选中热区
        await page.click("#track-list .track-item >> nth=0")
        await page.wait_for_timeout(300)
        selected = await page.eval_on_selector_all("#page-canvas .hotzone.is-selected", "els => els.length")
        assert selected == 1, "点击句子后未选中热区"
        coords_visible = await page.is_visible("#coords-panel")
        assert coords_visible, "坐标面板未显示"
        ok("点击句子 → 热区选中 + 坐标面板")

        # 6. 拖动热区（pointer 事件）
        box = await page.eval_on_selector("#page-canvas .hotzone.is-selected",
                                          "el => {const r = el.getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2};}")
        before = await page.eval_on_selector("#c-left", "el => el.value")
        await page.mouse.move(box["x"], box["y"])
        await page.mouse.down()
        await page.mouse.move(box["x"] + 60, box["y"] + 40, steps=5)
        await page.mouse.up()
        await page.wait_for_timeout(300)
        after = await page.eval_on_selector("#c-left", "el => el.value")
        assert after != before, f"拖动后左坐标未变化: {before} -> {after}"
        ok(f"拖动热区: left {before} → {after}")

        # 7. 缩放热区（拖 SE 手柄）
        await page.click("#track-list .track-item >> nth=0")
        await page.wait_for_timeout(200)
        se_box = await page.eval_on_selector("#page-canvas .hotzone.is-selected .handle-se",
                                             "el => {const r = el.getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2};}")
        w_before = await page.eval_on_selector("#c-right", "el => parseFloat(el.value)")
        await page.mouse.move(se_box["x"], se_box["y"])
        await page.mouse.down()
        await page.mouse.move(se_box["x"] + 50, se_box["y"] + 30, steps=5)
        await page.mouse.up()
        await page.wait_for_timeout(300)
        w_after = await page.eval_on_selector("#c-right", "el => parseFloat(el.value)")
        assert w_after > w_before, f"缩放后右坐标未变化: {w_before} -> {w_after}"
        ok(f"缩放热区: right {w_before} → {w_after}")

        # 8. 保存（localStorage）
        await page.click("#btn-save")
        await page.wait_for_timeout(300)
        ls = await page.evaluate("localStorage.length")
        assert ls > 0, "localStorage 无数据"
        ok(f"保存到 localStorage ({ls} 键)")

        # 8. 导出（download 事件）
        async with page.expect_download(timeout=8000) as dl_info:
            await page.click("#btn-export")
        dl = await dl_info.value
        fname = dl.suggested_filename
        assert fname.endswith(".json"), f"导出文件名异常: {fname}"
        ok(f"导出: {fname}")

        # 9. 翻页
        await page.click("#p-next")
        await page.wait_for_timeout(300)
        p_info = await page.text_content("#p-info")
        assert p_info.startswith("2 /"), f"翻页异常: {p_info}"
        ok(f"翻页: {p_info.strip()}")

        # 10. 无 JS 错误
        real_errors = [e for e in errors if "favicon" not in e.lower()]
        if real_errors:
            fail(f"JS 错误: {real_errors[:3]}")
        else:
            ok("无 JS 运行错误")

        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
    if FAIL:
        print(f"\n❌ 测试失败 {len(FAIL)} 项")
        sys.exit(1)
    print("\n✅ 全部通过")
