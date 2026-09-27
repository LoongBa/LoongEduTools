// 数学巧算 · 浏览器冒烟（Playwright-core + 本地 chromium）：首页 → 阶段 → 课堂七步 → 练习作答 → 我的
// 环境：CHROMIUM_PATH 指向可执行文件；找不到时跳过浏览器部分并提示
import { createServer } from "http";
import { readFileSync, existsSync, statSync } from "fs";
import { resolve, dirname, extname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, "../dist");

let failed = 0;
const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} | ${name} ${extra}`);
  if (!cond) failed++;
};

// 静态服务（serve dist/）
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = createServer((req, res) => {
  const urlPath = (req.url || "/").split("?")[0];
  let file = urlPath === "/" ? "index.html" : urlPath.slice(1);
  const full = resolve(DIST, file);
  if (!full.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  if (!existsSync(full)) { res.writeHead(404); res.end(); return; }
  const ext = extname(full);
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  res.end(readFileSync(full));
});

const chromium = process.env.CHROMIUM_PATH;
if (!chromium || !existsSync(chromium)) {
  console.log("SKIP | 未设置 CHROMIUM_PATH，跳过浏览器冒烟（引擎单测已覆盖逻辑）");
  process.exit(0);
}

const { chromium: pw } = await import("playwright-core");

server.listen(0, "127.0.0.1", async () => {
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const browser = await pw.launch({ executablePath: chromium, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  try {
    // 首页（file:// 直开 = minitool 真实形态；favicon 自动请求 404 属标准行为，忽略）
    await page.goto("file:///" + DIST.replace(/\\/g, "/") + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(600);
    ok("首页加载（无 JS 错误）", errors.length === 0, errors[0] || "");
    ok("首页渲染阶段卡片", await page.locator("text=一年级").count() > 0 || await page.locator("text=四年级").count() > 0);

    // 进入阶段 4（枢纽）
    await page.locator("text=四年级").first().click();
    await page.waitForTimeout(400);
    ok("阶段页渲染讲次列表", (await page.locator("text=简便运算系统化").count()) > 0);

    // 进入第一讲（运算律总览）
    await page.locator("text=运算律总览").first().click();
    await page.waitForTimeout(400);
    ok("课堂页渲染前置检查", (await page.locator("text=前置知识检查").count()) > 0);

    // 七步走查：走到练习步
    for (let i = 0; i < 7; i++) {
      const next = page.locator("button:has-text('下一步')");
      if (await next.count()) { await next.first().click(); await page.waitForTimeout(250); }
    }
    ok("七步走查后出现开始练习", (await page.locator("button:has-text('开始练习')").count()) > 0);

    // V0.4 原理复述卡：练习步底部入口 → ReciteView → 输入 → 保存（O3-I2：插在七步后、练习前最省）
    const reciteEntry = page.locator("button:has-text('讲一讲原理')");
    ok("练习步渲染复述入口", (await reciteEntry.count()) > 0);
    await reciteEntry.first().click();
    await page.waitForTimeout(400);
    ok("复述卡渲染提问引导", (await page.locator("text=为什么能这样算").count()) > 0);
    ok("复述卡提示先遮后展（默认无全文原理）", (await page.locator("button:has-text('看一眼提示')").count()) > 0);
    await page.locator("textarea").first().fill("因为先找能凑整的一对，先算它们，再算剩下的，这样更简单。");
    await page.waitForTimeout(200);
    await page.locator("button:has-text('保存')").first().click();
    await page.waitForTimeout(400);
    const reBody = await page.evaluate(() => document.body.innerText);
    ok("复述保存成功态", /已保存/.test(reBody));
    ok("复述不评分（无对错）", !/答对|答错|得分/.test(reBody));
    // 返回课堂页：banner 显示已复述（O3-I1 二次曝光位；返回后 step 重置"前置"需重走七步）
    await page.locator("button[aria-label='返回']").first().click();
    await page.waitForTimeout(400);
    ok("课堂页 banner 显示已复述", (await page.locator("text=原理已讲过").count()) > 0);
    for (let i = 0; i < 7; i++) {
      const nxt = page.locator("button:has-text('下一步')");
      if (await nxt.count()) { await nxt.first().click(); await page.waitForTimeout(250); }
    }
    ok("重走七步后复述入口显示已复述态", (await page.locator("text=原理已复述 · 再讲一讲").count()) > 0);

    // 进入基础练习
    await page.locator("button:has-text('开始练习')").first().click();
    await page.waitForTimeout(500);
    ok("练习页渲染题面", (await page.locator("text=提交").count()) > 0);

    // 引擎题面存在（非"降级"）
    const bodyText = await page.evaluate(() => document.body.innerText);
    ok("引擎出题（题面含 = 或 □）", /[=＝]/.test(bodyText));

    // 提交一个输入（数字键盘点"1"再提交）
    await page.locator("button:has-text('1')").first().click();
    await page.locator("button:has-text('提交')").first().click();
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => document.body.innerText);
    ok("提交后有反馈", /答对|答案|错题/.test(after));

    // 我的页
    await page.goto("file:///" + DIST.replace(/\\/g, "/") + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(400);
    await page.locator("button:has-text('👤')").first().click();
    await page.waitForTimeout(400);
    ok("我的页渲染", (await page.locator("text=每日练习").count()) > 0);

    // 阶段 5（小数巧算）：验证新引擎族 8（小数）出题 + 小数点键盘
    await page.goto("file:///" + DIST.replace(/\\/g, "/") + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(400);
    await page.locator("text=五年级").first().click();
    await page.waitForTimeout(400);
    ok("阶段5渲染（小数巧算）", (await page.locator("text=小数巧算").count()) > 0);
    await page.locator("text=化整还原").first().click();
    await page.waitForTimeout(400);
    for (let i = 0; i < 7; i++) {
      const next = page.locator("button:has-text('下一步')");
      if (await next.count()) { await next.first().click(); await page.waitForTimeout(250); }
    }
    await page.locator("button:has-text('开始练习')").first().click();
    await page.waitForTimeout(500);
    const decBody = await page.evaluate(() => document.body.innerText);
    ok("阶段5引擎出题（含小数点）", /[.．]/.test(decBody) && /[=＝]/.test(decBody));
    ok("阶段5小数点键盘可用", (await page.locator("button:has-text('.')").count()) > 0);

    // 口算热身入口
    await page.goto("file:///" + DIST.replace(/\\/g, "/") + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(400);
    ok("首页渲染口算热身入口", (await page.locator("text=口算热身").count()) > 0);
    await page.locator("button:has-text('口算热身')").first().click();
    await page.waitForTimeout(400);
    ok("热身选档页渲染（一年级/二年级/三年级）", (await page.locator("text=一年级").count()) > 0);
    await page.locator("button:has-text('一年级')").first().click();
    await page.waitForTimeout(500);
    const warmBody = await page.evaluate(() => document.body.innerText);
    ok("热身引擎出题（题面含 = 或 □）", /[=＝]/.test(warmBody));
    // 作答反馈
    await page.locator("button:has-text('1')").first().click();
    await page.locator("button:has-text('提交')").first().click();
    await page.waitForTimeout(400);
    const warmAfter = await page.evaluate(() => document.body.innerText);
    ok("热身提交有反馈", /答对|答案|错题/.test(warmAfter));

    // 家长报告（连点 5 次进入）
    await page.goto("file:///" + DIST.replace(/\\/g, "/") + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(400);
    await page.locator("button:has-text('👤')").first().click();
    await page.waitForTimeout(400);
    for (let i = 0; i < 5; i++) {
      await page.locator("button:has-text('家长报告')").first().click();
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(300);
    ok("家长报告视图渲染", (await page.locator("text=今日反馈").count()) > 0);
    ok("家长报告打印按钮存在", (await page.locator("button:has-text('打印')").count()) > 0);
    ok("家长报告复述 Panel 渲染", (await page.locator("text=原理复述").count()) > 0);
    const reportBody = await page.evaluate(() => document.body.innerText);
    ok("家长报告含复述文本（跨页面持久化）", /凑整/.test(reportBody));
    ok("家长报告薄弱方法 Panel 渲染", (await page.locator("text=薄弱方法").count()) > 0);
    ok("家长报告下周建议 Panel 渲染", (await page.locator("text=下周建议").count()) > 0);

    // 防沉迷设置区
    await page.goto("file:///" + DIST.replace(/\\/g, "/") + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(400);
    await page.locator("button:has-text('👤')").first().click();
    await page.waitForTimeout(400);
    await page.locator("button:has-text('防沉迷设置')").first().click();
    await page.waitForTimeout(300);
    ok("防沉迷设置渲染（时长/题量档）", (await page.locator("text=分钟").count()) > 0 && (await page.locator("text=题").count()) > 0);

  } catch (e) {
    ok("冒烟流程无异常", false, String(e).slice(0, 200));
  }

  await browser.close();
  server.close();
  console.log(`\n冒烟 ${failed ? "FAIL " + failed : "全部通过"}`);
  process.exit(failed ? 1 : 0);
});