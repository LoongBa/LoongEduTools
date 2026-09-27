// V1.0.4 分享题二维码验证：解一局 4×4 → 结算 → 分享题浮层 → canvas 扩高 + drawRealQr 无错 + 协议串断言（data-qr-text）。
// 用法：pnpm test:share（需 chromium，同 smoke.mjs 探测）
import { createServer } from "vite";
import { existsSync, readdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { solve, toSDString } from "../src/lib/sudoku.ts";

const PORT = 3014;
const BASE = `http://localhost:${PORT}/`;
const results = [];
const ok = (name, cond, extra = "") => results.push(`${cond ? "PASS" : "FAIL"} | ${name} ${extra}`);
const tapText = (page, text) => page.locator(`text=${text}`).first().evaluate((el) => el.click()).catch(() => false);
const vis = (page, text) => page.locator(`text=${text}`).first().isVisible().catch(() => false);

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const direct = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ];
  for (const p of direct) if (existsSync(p)) return p;
  const home = process.env.USERPROFILE || process.env.HOME;
  if (home) {
    const base = `${home}\\AppData\\Local\\ms-playwright`;
    try {
      const hit = readdirSync(base, { withFileTypes: true }).find((d) => d.isDirectory() && d.name.startsWith("chromium-"));
      if (hit) {
        const exe = `${base}\\${hit.name}\\chrome-win\\chrome.exe`;
        if (existsSync(exe)) return exe;
      }
    } catch { /* 无 ms-playwright 目录 */ }
  }
  return null;
}

async function main() {
  const viteServer = await createServer({ server: { port: PORT, strictPort: true } });
  await viteServer.listen();
  await new Promise((r) => setTimeout(r, 800));

  const execPath = chromiumPath();
  if (!execPath) {
    console.log("未找到 chromium：设置 CHROMIUM_PATH 或安装 playwright chromium 后重试（跳过）");
    await viteServer.close();
    process.exit(0);
  }

  const browser = await chromium.launch({ headless: true, executablePath: execPath, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const jsErrors = [];
  page.on("pageerror", (e) => jsErrors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("Failed to load resource")) jsErrors.push(m.text()); });

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await tapText(page, "简单");
  await page.waitForTimeout(200);
  await tapText(page, "开始自由练习");
  await page.waitForTimeout(900);

  // 读棋盘 givens → Node 侧求解 → 逐格填正确解
  const cells = page.locator('button[role="gridcell"]');
  const givens = await cells.evaluateAll((els) => els.map((el) => Number(el.textContent.trim()) || 0));
  ok("读到 16 格盘面", givens.length === 16);
  const sol = solve(givens.slice(), 4, 1)[0];
  ok("引擎求出唯一解", !!sol);
  for (let i = 0; i < 16; i++) {
    if (givens[i]) continue;
    const b = await cells.nth(i).boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(120);
    const btn = page.locator(`button[aria-label^="填入数字 ${sol[i]}"]`).first();
    const nb = await btn.boundingBox();
    await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(800);
  ok("填满 16 格完成", await vis(page, "完成啦"));

  // 打开分享题浮层 → canvas 扩高 + 无 JS 错误（B1 断言：canvas 尺寸属性，非元素数量）
  await tapText(page, "分享这道题");
  await page.waitForTimeout(600);
  const cv = page.locator("canvas").first();
  const w = await cv.evaluate((el) => el.width).catch(() => 0);
  const h = await cv.evaluate((el) => el.height).catch(() => 0);
  ok("分享题 canvas 存在且扩高(≥900)", (await cv.count()) >= 1 && h >= 900, `w=${w} h=${h}`);
  ok("无 JS 错误（含 drawRealQr 路径）", jsErrors.length === 0, jsErrors.slice(0, 3).join(";"));

  // V1.0.4（I3/I4）：二维码内容 = 协议串，正则 ^SD4:[0-9.]+$ 且长度 4+16=20
  const qrText = await cv.getAttribute("data-qr-text").catch(() => null);
  ok("data-qr-text 钩子存在", !!qrText, `qr=${qrText}`);
  ok("二维码内容为协议串 SD4:", !!qrText && /^SD4:[0-9.]+$/.test(qrText), `qr=${qrText}`);
  ok("协议串长度=4+4²=20", !!qrText && qrText.length === 20, `len=${qrText ? qrText.length : 0}`);
  ok("协议串与盘面 givens 一致", !!qrText && qrText.slice(4) === toSDString(givens, 4),
    `qr=${qrText && qrText.slice(4)} givens=${toSDString(givens, 4)}`);

  console.log(results.join("\n"));
  console.log(`\n分享题二维码验证 ${results.filter((r) => r.startsWith("PASS")).length}/${results.length}`);
  await browser.close();
  await viteServer.close();
  process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
}

main().catch((e) => { console.error("SHARE VERIFY CRASH:", e.message); process.exit(2); });
