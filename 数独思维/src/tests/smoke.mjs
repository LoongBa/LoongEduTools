// 数独思维冒烟：自起 preview 服务（3014）→ Playwright 走查核心流程 → 自动停服。
// 用法：pnpm test（需 chromium：env CHROMIUM_PATH 或本机 ms-playwright / Chrome 安装）
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { get } from "node:http";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const PORT = 3014;
const BASE = `http://localhost:${PORT}/`;
// 版本号动态读取（V1.0.3 I3：断言不硬编码，随 package.json 自动更新）
const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
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
  // playwright 安装的 ms-playwright 浏览器
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

function waitServer(port, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const probe = () => {
      const req = get({ host: "localhost", port, path: "/", timeout: 1500 }, (res) => { res.resume(); resolve(); });
      req.on("error", () => {
        if (Date.now() - t0 > timeoutMs) reject(new Error("vite dev 未就绪"));
        else setTimeout(probe, 300);
      });
      req.on("timeout", () => { req.destroy(); setTimeout(probe, 300); });
    };
    probe();
  });
}

async function main() {
  // 同进程起 vite dev server（读项目 vite.config.ts；3014 strictPort）
  const viteServer = await createServer({ server: { port: PORT, strictPort: true } });
  await viteServer.listen();
  try {
    await waitServer(PORT);
  } catch {
    console.error("vite dev 未在 3014 就绪");
    await viteServer.close();
    process.exit(2);
  }

  const execPath = chromiumPath();
  if (!execPath) {
    console.log("未找到 chromium 可执行文件：设置 CHROMIUM_PATH 或安装 playwright chromium 后重试。");
    console.log("（跳过浏览器冒烟；引擎单测 pnpm test:engine 不受影响）");
    await viteServer.close();
    process.exit(0);
  }

  const browser = await chromium.launch({ headless: true, executablePath: execPath, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const jsErrors = [];
  page.on("pageerror", (e) => jsErrors.push(String(e)));
  // 忽略 favicon 等可选资源的 404（"Failed to load resource"）；真实 JS 异常走 pageerror
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("Failed to load resource")) jsErrors.push(m.text());
  });

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  ok("首页渲染", await vis(page, "点选填数，零门槛上手"));

  // ① 自由练习 4×4：选简单 → 棋盘 16 格 → 填数
  await tapText(page, "简单");
  await page.waitForTimeout(300);
  await tapText(page, "开始自由练习");
  await page.waitForTimeout(900);
  const cells = page.locator('button[role="gridcell"]');
  ok("练习页渲染(简单4×4)", await vis(page, "4×4"));
  ok("棋盘 16 格", (await cells.count()) === 16, `count=${await cells.count()}`);
  const emptyIdx = await cells.evaluateAll((els) => { for (let i = 0; i < els.length; i++) if (!els[i].textContent.trim()) return i; return -1; });
  if (emptyIdx >= 0) {
    // ①a 选中格瞬时闪光（V1.0.2）：点空格后立即断言出现 → 350ms 后消失
    await cells.nth(emptyIdx).evaluate((el) => el.click()).catch(() => {});
    await page.waitForTimeout(60);
    const flashSel = await page.locator(".animate-flash-sel").count().catch(() => 0);
    ok("选中格瞬时闪光出现", flashSel >= 1, `count=${flashSel}`);
    await page.waitForTimeout(400);
    const after = await page.locator(".animate-flash-sel").count().catch(() => 999);
    ok("选中闪光 350ms 后消失", after === 0, `after=${after}`);
    // ①b 填数
    const enabled = page.locator('button[aria-label^="填入数字"]:not([disabled])');
    if (await enabled.count()) {
      await enabled.first().evaluate((el) => el.click()).catch(() => {});
      await page.waitForTimeout(400);
    }
  }
  ok("自由练习可填数", emptyIdx >= 0);
  await tapText(page, "返回难度");
  await page.waitForTimeout(500);

  // ② 规则教学
  await tapText(page, "规则教学");
  await page.waitForTimeout(500);
  ok("规则教学弹出", await vis(page, "每一行都有全部数字"));
  await tapText(page, "跳过讲解");
  await page.waitForTimeout(400);

  // ③ 技巧教学关：单宫排除 → 两步引导 → 点亮徽章
  await tapText(page, "全部技巧");
  await page.waitForTimeout(500);
  ok("技巧徽章墙", await vis(page, "基础技巧 · 4 关"));
  await tapText(page, "单宫排除");
  await page.waitForTimeout(600);
  ok("教学关渲染", await vis(page, "看左上这个宫"));
  await page.locator('button[role="gridcell"]').nth(1).evaluate((el) => el.click()).catch(() => {});
  await page.waitForTimeout(250);
  await page.locator('button[aria-label="填入 2"]').evaluate((el) => el.click()).catch(() => {});
  await page.waitForTimeout(700);
  await page.locator('button[role="gridcell"]').nth(6).evaluate((el) => el.click()).catch(() => {});
  await page.waitForTimeout(250);
  await page.locator('button[aria-label="填入 1"]').evaluate((el) => el.click()).catch(() => {});
  await page.waitForTimeout(900);
  ok("教学关完成", await vis(page, "收下徽章，继续"));
  await tapText(page, "收下徽章，继续");
  await page.waitForTimeout(500);
  ok("徽章已点亮", await vis(page, "已点亮 1 / 4 基础"));
  await page.locator("text=←").first().evaluate((el) => el.click()).catch(() => {});
  await page.waitForTimeout(500);

  // ④ 训练地图
  await page.locator('button:has-text("训练地图")').first().evaluate((el) => el.click()).catch(() => false);
  await page.waitForTimeout(500);
  ok("训练地图渲染", await vis(page, "四格 · 认识盘面"));
  await tapText(page, "四格 · 认识盘面");
  await page.waitForTimeout(700);
  ok("地图关卡开局", await vis(page, "关卡 1-1"));
  await page.locator("text=←").first().evaluate((el) => el.click()).catch(() => {});
  await page.waitForTimeout(400);
  await tapText(page, "返回难度");
await page.waitForTimeout(500);

  // ⑤ 导入 SD4: 前缀 + 少线索拒绝（V1.0.4 协议串）
  await tapText(page, "导入题目");
  await page.waitForTimeout(500);
  await page.locator('textarea[aria-label="题目编码输入"]').fill("SD4:1,0,3,4,3,4,0,2,2,1,4,3,4,3,2,1");
  await page.waitForTimeout(400);
  ok("SD4: 导入可开始", !(await page.locator("text=开始练习这道题").isDisabled().catch(() => true)));
  ok("协议串导入提示已通过", await vis(page, "校验通过，可以直接开始"));
  await page.locator('textarea[aria-label="题目编码输入"]').fill("SD4:1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0");
  await page.waitForTimeout(400);
  ok("SD4: 少线索被拒", await vis(page, "线索太少"));
  await tapText(page, "取消");
  await page.waitForTimeout(300);

  // ⑥ 断局三态
  await tapText(page, "开始自由练习");
  await page.waitForTimeout(600);
  await page.locator("text=←").first().evaluate((el) => el.click()).catch(() => {});
  await page.waitForTimeout(500);
  ok("断点快照 → 继续上次", await vis(page, "继续上次未完成的题"));
  await tapText(page, "返回难度");
  await page.waitForTimeout(500);

  // ⑦ 家长报告 / 设置
  await tapText(page, "家长报告");
  await page.waitForTimeout(500);
  ok("家长报告渲染", await vis(page, "今日反馈"));
  ok("报告含每日挑战行", await vis(page, "今日每日挑战"));
  await tapText(page, "返回难度");
  await page.waitForTimeout(400);
  await tapText(page, "外观设置");
  await page.waitForTimeout(500);
  ok("设置页渲染", await vis(page, "主题方案"));
  // ⑦b 版本号显示（V1.0.3）：设置页关于区 + 首页 footer 规范串
  ok(`设置页显示版本 V${VERSION}`, await vis(page, `版本 V${VERSION}`));
  await tapText(page, "返回难度");
  await page.waitForTimeout(500);
  ok("首页 footer 规范串", await vis(page, "数据只存本机"));

  console.log(results.join("\n"));
  const fails = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n冒烟 ${results.length} 项 · PASS ${results.length - fails} · FAIL ${fails} · JS错误 ${jsErrors.length}`);
  if (jsErrors.length) console.log("JS ERRORS:\n" + jsErrors.slice(0, 8).join("\n"));

  await browser.close();
  await viteServer.close();
  process.exit(fails || jsErrors.length ? 1 : 0);
}

main().catch((e) => { console.error("SMOKE CRASH:", e.message); process.exit(2); });

