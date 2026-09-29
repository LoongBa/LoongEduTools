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

/** 读取当前练习页题面（一年级档加减式），解析并返回答案字符串；无法解析返回 null */
async function solveG1(page) {
  return page.evaluate(() => {
    const body = document.body.innerText;
    const m = body.match(/(\d+)\s*([+-])\s*(\d+)\s*[=＝]/);
    if (!m) return null;
    const a = Number(m[1]), b = Number(m[3]);
    return String(m[2] === "+" ? a + b : a - b);
  });
}

/** 用数字键盘逐位输入答案并提交 */
async function typeAnswer(page, ans) {
  for (const ch of String(ans)) {
    await page.locator(`button:has-text('${ch}')`).first().click();
    await page.waitForTimeout(50);
  }
  await page.locator("button[aria-label='提交']").first().click();
}

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
    ok("阶段页讲次行渲染打印讲义按钮（V0.6）", (await page.locator("button[aria-label^='打印讲义']").count()) > 0);

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

    // V0.6 打印讲义：LessonView 顶部入口 → HandoutView 渲染断言 → 返回
    const handoutEntry = page.locator("button:has-text('打印讲义')");
    ok("课堂页渲染打印讲义入口", (await handoutEntry.count()) > 0);
    await handoutEntry.first().click();
    await page.waitForTimeout(400);
    ok("讲义视图渲染标题", (await page.locator("text=打印讲义").count()) > 0);
    ok("讲义渲染练习单分区", (await page.locator("text=练习单").count()) > 0);
    ok("讲义渲染基础题小标题", (await page.locator("text=一、基础题").count()) > 0);
    const handoutBody = await page.evaluate(() => document.body.innerText);
    ok("讲义练习单含题面", /[=＝]/.test(handoutBody));
    ok("讲义渲染答案区（家长批改）", /答案（家长/.test(handoutBody));

    // V1.1 讲义增强：配置面板 / 三档全打 / 换一组题 / 关档 / 题单组别
    ok("讲义渲染配置面板（换一组题）", (await page.locator("button[aria-label='换一组题']").count()) > 0);
    ok("讲义渲染配置面板（恢复默认）", (await page.locator("button[aria-label='恢复默认']").count()) > 0);
    ok("讲义默认三档全打（提高/挑战）", (await page.locator("text=二、提高题").count()) > 0 && (await page.locator("text=三、挑战题").count()) > 0);
    const rowsBefore = await page.locator(".handout-practice-row").allInnerTexts();
    await page.locator("button[aria-label='换一组题']").first().click();
    await page.waitForTimeout(400);
    const rowsAfter = await page.locator(".handout-practice-row").allInnerTexts();
    ok("换一组题后题单变化", JSON.stringify(rowsBefore) !== JSON.stringify(rowsAfter));
    ok("讲义页脚含题单组别", (await page.evaluate(() => document.body.innerText)).includes("题单组别"));
    await page.locator("button[aria-label='一、基础题 开关']").first().click();
    await page.waitForTimeout(300);
    const bodyAfterToggle = await page.evaluate(() => document.body.innerText);
    ok("关档后基础题消失", !/一、基础题/.test(bodyAfterToggle));
    ok("关档后提高题仍在", (await page.locator("text=二、提高题").count()) > 0);
    await page.locator("button[aria-label='恢复默认']").first().click();
    await page.waitForTimeout(300);
    ok("恢复默认后基础题复原", (await page.locator("text=一、基础题").count()) > 0);

    await page.locator("button[aria-label='返回']").first().click();
    await page.waitForTimeout(400);
    ok("讲义返回后回课堂页", (await page.locator("text=原理已讲过").count()) > 0);

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

    // 全阶回归（阶段 3 收官）：6 阶段 + 拓展逐阶走查 —— 阶段页渲染 / 打印讲义按钮 / 首讲七步 / 引擎出题 / 提交反馈
    const FULL_STAGES = [
      { card: "凑十破十平十", title: "10 的分与合（凑十歌）" },
      { card: "凑整与搬家", title: "补数与凑整（连加）" },
      { card: "拆数与特殊数", title: "乘法分配律 · 面积模型" },
      { card: "简便运算系统化", title: "运算律总览 · 补数凑整" },
      { card: "小数巧算", title: "化整还原（小数数位）" },
      { card: "分数与综合巧算", title: "乘前先约分" },
      { card: "思维进阶", title: "等差数列求和（高斯配对）" },
    ];
    for (const st of FULL_STAGES) {
      await page.goto("file:///" + DIST.replace(/\\/g, "/") + "/index.html", { waitUntil: "load" });
      await page.waitForTimeout(400);
      await page.locator(`text=${st.card}`).first().click();
      await page.waitForTimeout(400);
      ok(`全阶[${st.card}]阶段页渲染+打印讲义按钮`, (await page.locator("button[aria-label^='打印讲义']").count()) > 0);
      await page.locator(`text=${st.title}`).first().click();
      await page.waitForTimeout(400);
      ok(`全阶[${st.card}]首讲课堂渲染（前置检查）`, (await page.locator("text=前置知识检查").count()) > 0);
      for (let i = 0; i < 7; i++) {
        const next = page.locator("button:has-text('下一步')");
        if (await next.count()) { await next.first().click(); await page.waitForTimeout(200); }
      }
      ok(`全阶[${st.card}]七步走查后出现开始练习`, (await page.locator("button:has-text('开始练习')").count()) > 0);
      await page.locator("button:has-text('开始练习')").first().click();
      await page.waitForTimeout(500);
      const qBody = await page.evaluate(() => document.body.innerText);
      ok(`全阶[${st.card}]引擎出题（题面含 = 或 □）`, /[=＝]/.test(qBody));
      await page.locator("button:has-text('1')").first().click();
      await page.locator("button[aria-label='提交']").first().click();
      await page.waitForTimeout(400);
      const fbBody = await page.evaluate(() => document.body.innerText);
      ok(`全阶[${st.card}]提交有反馈`, /答对|答案|错题/.test(fbBody));
    }

    // 口算热身（V1.2 增强：六档/推荐档/定数 5 题结算/计时挑战到期/薄弱错题持久化）
    await page.goto("file:///" + DIST.replace(/\\/g, "/") + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(400);
    ok("首页渲染口算热身入口", (await page.locator("text=口算热身").count()) > 0);
    await page.locator("button:has-text('口算热身')").first().click();
    await page.waitForTimeout(400);
    ok("热身选档页六档渲染（四/五/六年级）", (await page.locator("text=四年级").count()) > 0 && (await page.locator("text=五年级").count()) > 0 && (await page.locator("text=六年级").count()) > 0);
    ok("热身推荐档标记渲染（跟随教程进度）", (await page.locator("text=按当前进度推荐").count()) > 0);

    // 定数 5 题流程：切 5 题 → 一年级 → 逐题作答（真实读题算答案）→ 结算
    await page.locator("button:has-text('5 题')").first().click();
    await page.waitForTimeout(200);
    await page.locator("button:has-text('一年级')").first().click();
    await page.waitForTimeout(500);
    ok("定数模式题头渲染（第 1 / 5 题）", (await page.evaluate(() => document.body.innerText)).includes("第 1 / 5 题"));
    for (let i = 0; i < 5; i++) {
      const ans = await solveG1(page);
      if (ans === null) { ok("定数流程作答推进", false, "无法解析题目"); break; }
      await typeAnswer(page, ans);
      await page.waitForTimeout(450);
    }
    ok("定数 5 题结算文案（答对 X / 5 题）", /答对 \d+ \/ 5 题/.test(await page.evaluate(() => document.body.innerText)));

    // 计时挑战：clock 加速到期 → 自动结算
    await page.goto("file:///" + DIST.replace(/\\/g, "/") + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(400);
    await page.locator("button:has-text('口算热身')").first().click();
    await page.waitForTimeout(400);
    await page.locator("button:has-text('计时挑战')").first().click();
    await page.waitForTimeout(200);
    await page.locator("button:has-text('30 秒')").first().click();
    await page.waitForTimeout(200);
    await page.clock.install(); // 倒计时 setInterval 在点击一年级后注册 → install 须在此之前
    await page.locator("button:has-text('一年级')").first().click();
    await page.waitForTimeout(500);
    ok("计时倒计时条渲染（剩余）", (await page.evaluate(() => document.body.innerText)).includes("剩余"));
    const ans0 = await solveG1(page);
    if (ans0 !== null) {
      await typeAnswer(page, ans0);
      await page.waitForTimeout(350);
    }
    ok("计时作答有反馈", /答对|答案|错题/.test(await page.evaluate(() => document.body.innerText)));
    await page.clock.runFor(31000); // runFor 连续触发 interval（fastForward 每个 timer 至多 fire 一次）
    await page.waitForTimeout(400);
    ok("计时到期自动结算（限时 30 秒文案）", /限时 30 秒/.test(await page.evaluate(() => document.body.innerText)));

    // 薄弱错题持久化：答错 → warmupMist 写入 localStorage（加权出题纯逻辑由 engine L11 覆盖）
    await page.goto("file:///" + DIST.replace(/\\/g, "/") + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(400);
    await page.locator("button:has-text('口算热身')").first().click();
    await page.waitForTimeout(400);
    await page.locator("button:has-text('一年级')").first().click();
    await page.waitForTimeout(500);
    await typeAnswer(page, "999999"); // 必然错误
    await page.waitForSelector("text=/答案是/", { timeout: 2000 });
    ok("答错即时反馈（答案是 …）", true);
    const mistStored = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem("redtools.qiaosuanlein.v1");
        const s = raw ? JSON.parse(raw) : {};
        return !!(s.warmupMist && Object.keys(s.warmupMist).length >= 1);
      } catch { return false; }
    });
    ok("warmupMist 错题计数持久化（V1.2）", mistStored);

    // 错题重练闭环（V1.3）——清空现存错题（前段练习/热身已积累多条）→ 空态 → 重新生成 1 道闭环
    await page.goto("file:///" + DIST.replace(/\\/g, "/") + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(400);
    const base = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("redtools.qiaosuanlein.v1") || "{}");
      return {
        played: s.guard?.playedToday || 0,
        checkin: (s.checkin || []).length,
        lessonKeys: Object.keys(s.lessons || {}).length,
        mist: (s.mistakes || []).length,
      };
    });
    ok("Home 错题重练入口卡显示待掌握数", /道待掌握/.test(await page.evaluate(() => document.body.innerText)));
    await page.locator("button:has-text('错题重练')").first().click();
    await page.waitForTimeout(500);
    ok("重练题面渲染（= ?）", /=\s*\?/.test(await page.evaluate(() => document.body.innerText)));
    // 循环清空：逐道读 answer 答对，直到结算卡
    let answered = 0;
    for (let g2 = 0; g2 < 30; g2++) {
      const body = await page.evaluate(() => document.body.innerText);
      if (body.includes("错题重练完成")) break;
      const a = await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem("redtools.qiaosuanlein.v1") || "{}");
        return s.mistakes && s.mistakes[0] ? s.mistakes[0].answer : null;
      });
      if (a === null) break;
      await typeAnswer(page, String(a));
      answered++;
      await page.waitForTimeout(550);
    }
    ok("重练全部掌握结算（多题闭环）", /错题重练完成/.test(await page.evaluate(() => document.body.innerText)), `（共答对 ${answered} 题）`);
    const afterRetry = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("redtools.qiaosuanlein.v1") || "{}");
      return {
        played: s.guard?.playedToday || 0,
        checkin: (s.checkin || []).length,
        lessonKeys: Object.keys(s.lessons || {}).length,
        mist: (s.mistakes || []).length,
      };
    });
    ok("防沉迷：重练题量累计恰为答对数（不打卡不新增 lessons 记录）", afterRetry.played === base.played + answered && afterRetry.checkin === base.checkin && afterRetry.lessonKeys === base.lessonKeys);
    ok("错题本清空（mistakes 0）", afterRetry.mist === 0);
    await page.goto("file:///" + DIST.replace(/\\/g, "/") + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(400);
    ok("Home 错题卡空态文案", (await page.evaluate(() => document.body.innerText)).includes("错题都清光啦"));
    await page.locator("button:has-text('错题重练')").first().click();
    await page.waitForTimeout(400);
    ok("重练空态表扬卡", (await page.evaluate(() => document.body.innerText)).includes("继续保持，错一道练一道"));

    // 答错保留：重新生成 1 道（热身答错）→ 重练答错 → 错题数不减
    await page.goto("file:///" + DIST.replace(/\\/g, "/") + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(400);
    await page.locator("button:has-text('口算热身')").first().click();
    await page.waitForTimeout(400);
    await page.locator("button:has-text('一年级')").first().click();
    await page.waitForTimeout(500);
    await typeAnswer(page, "999999"); // 生成新错题
    await page.waitForSelector("text=/答案是/", { timeout: 2000 });
    await page.goto("file:///" + DIST.replace(/\\/g, "/") + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(400);
    await page.locator("button:has-text('错题重练')").first().click();
    await page.waitForTimeout(500);
    await typeAnswer(page, "999999"); // 重练答错 → 保留
    await page.waitForSelector("text=/答案是/", { timeout: 2000 });
    await page.goto("file:///" + DIST.replace(/\\/g, "/") + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(400);
    ok("重练答错保留（错题数不减）", (await page.evaluate(() => document.body.innerText)).includes("1 道待掌握"));

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
    // V1.4 热身面板：六档分布（前序热身已生成 warmupDaily + practiced）+ 进步曲线
    ok("家长报告热身面板渲染（六档/曲线）", (await page.locator("text=口算热身").count()) > 0 && (await page.locator("text=近 14 天正确率").count()) > 0);
    ok("家长报告热身曲线容器存在", (await page.locator("[aria-label='近14天正确率曲线']").count()) > 0);
    // V1.4 重练面板：前序重练段已清空 8 题 → reviewDaily 有记录
    ok("家长报告重练面板渲染（累计掌握）", /错题重练/.test(await page.evaluate(() => document.body.innerText)));

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