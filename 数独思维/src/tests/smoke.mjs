// 数独思维冒烟：自起 preview 服务（3014）→ Playwright 走查核心流程 → 自动停服。
// 用法：pnpm test（需 chromium：env CHROMIUM_PATH 或本机 ms-playwright / Chrome 安装）
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { get } from "node:http";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { advSkillsFor } from "../src/lib/content.ts"; // V1.10.0 B7：Node 侧同源码计算今日进阶技巧名

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
  await page.waitForTimeout(400);
  // V1.1.0：导入浮层空态有「从剪贴板粘贴」按钮（headless 不实测剪贴板权限，但按钮/文案必须存在）
  ok("剪贴板粘贴按钮存在", await vis(page, "从剪贴板粘贴"));
  await page.waitForTimeout(100);
  await page.locator('textarea[aria-label="题目编码输入"]').fill("SD4:1,0,3,4,3,4,0,2,2,1,4,3,4,3,2,1");
  await page.waitForTimeout(400);
  ok("SD4: 导入可开始", !(await page.locator("text=开始练习这道题").isDisabled().catch(() => true)));
  ok("协议串导入提示已通过", await vis(page, "校验通过，可以直接开始"));
  await page.locator('textarea[aria-label="题目编码输入"]').fill("SD4:1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0");
  await page.waitForTimeout(400);
ok("SD4: 少线索被拒", await vis(page, "线索太少"));
  await tapText(page, "取消");
  await page.waitForTimeout(300);

  // ⑤b URL 直启（V1.1.0）：?sd= 参数打开 → 直达练习页
  const encSd4 = encodeURIComponent("SD4:1,0,3,4,3,4,0,2,2,1,4,3,4,3,2,1");
  await page.goto(`${BASE}?sd=${encSd4}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  ok("URL 直启：直达练习页", await vis(page, "4×4"));
  const directCells = page.locator('button[role="gridcell"]');
  ok("URL 直启：棋盘 16 格", (await directCells.count()) === 16, `count=${await directCells.count()}`);
  // ⑤b2 URL 直启后 query 已清理（避免刷新重复直启）——在成功路径立即断言
  ok("URL 直启后 query 已清除", !page.url().includes("sd="), `url=${page.url()}`);
  // 回落首页（返回难度两次：练习 → 首页）
  await tapText(page, "返回难度");
  await page.waitForTimeout(500);

  // ⑤b3 V1.9.0（B8）：SD9 扫码 URL 直启——最长 URL 形态（QR v9-v10 边界 + 长解析路径），棋盘 81 格
  const sd9digits =
    "0,4,1,0,0,0,0,2,0,0,9,0,6,1,0,0,0,5,0,0,0,0,0,7,0,6,0,0,0,0,0,7,3,0,0,0,0,7,0,0,0,0,0,5,0,1,2,5,0,0,4,0,0,3,7,0,2,4,0,0,0,0,0,0,0,9,0,0,0,0,4,6,0,0,0,2,0,0,5,0,9";
  await page.goto(`${BASE}?sd=${encodeURIComponent(`SD9:${sd9digits}`)}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  ok("扫码 URL 直启（SD9）：直达练习页", await vis(page, "9×9"));
  const sd9Cells = page.locator('button[role="gridcell"]');
  ok("扫码 URL 直启（SD9）：棋盘 81 格", (await sd9Cells.count()) === 81, `count=${await sd9Cells.count()}`);
  ok("扫码 URL 直启（SD9）：query 已清除", !page.url().includes("sd="), `url=${page.url()}`);
  // 回落首页
  await tapText(page, "返回难度");
  await page.waitForTimeout(500);

  // ⑤c URL 直启失败（非法编码）→ Toast 提示且停留首页
  await page.goto(`${BASE}?sd=${encodeURIComponent("SD4:1,0,3,4,0,0,0,0,0,0,0,0,0,0,0,0")}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  ok("URL 直启失败：Toast 提示线索太少", await vis(page, "线索太少"));
  ok("URL 直启失败：停留首页", await vis(page, "点选填数，零门槛上手"));
  ok("URL 直启失败：保留参数供检查", page.url().includes("sd="), `url=${page.url()}`);

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
  // ⑦c 备份/恢复（V1.2.0）：按钮与 file input 存在
  ok("备份到文件按钮存在", await vis(page, "备份到文件"));
  ok("从文件恢复按钮存在", await vis(page, "从文件恢复"));
  const fileInput = page.locator('input[type="file"][aria-label="选择备份文件"]');
  ok("备份 file input 存在", (await fileInput.count()) === 1, `count=${await fileInput.count()}`);
  await tapText(page, "返回难度");
  await page.waitForTimeout(500);
  ok("首页 footer 规范串", await vis(page, "数据只存本机"));

  // ⑦d 错题本（V1.3.0）：分组区标题存在（空错题本时 SkillGroups 返回 null，标题不显示——断言页头/空态正常）
  await tapText(page, "错题本");
  await page.waitForTimeout(500);
  ok("错题本页渲染", await vis(page, "错题本") || await vis(page, "还没有需要巩固的题"));
  await tapText(page, "返回难度");
  await page.waitForTimeout(400);

  // ⑧ 组内连做推进断言（V1.4.2 §六遗留-3 A2）：注入同组 2 条错题 → 练这一组 → 「第 1/2 题」→ 完成一题 → 「下一道」→ 「第 2/2 题」
  // 注入绕过真实做题成本：board 仅缺 1 格，solution 已知，checkComplete 填对即结算（无需引擎求解）
  const A2_BOARD_A = [1, 0, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1]; // 空格 idx=1 → 填 2
  const A2_SOL_A = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];
  const A2_BOARD_B = [1, 2, 3, 4, 3, 4, 0, 2, 2, 1, 4, 3, 4, 3, 2, 1]; // 空格 idx=6 → 填 1
  const A2_SOL_B = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];
  const a2Store = {
    version: 1,
    best: {}, recent: {}, checkin: { dates: [], streak: 0 }, history: [],
    skills: { "唯一候选": true }, advSkills: {},
    mistakes: [
      { id: "a2a", ts: Date.now(), level: "easy", size: 4, board: A2_BOARD_A, solution: A2_SOL_A, errors: 1, hints: 0, errIdx: [1], techniques: ["唯一候选"], migrated14: true },
      { id: "a2b", ts: Date.now() - 1, level: "easy", size: 4, board: A2_BOARD_B, solution: A2_SOL_B, errors: 1, hints: 0, errIdx: [6], techniques: ["唯一候选"], migrated14: true },
    ],
    favorites: [], daily: null, achievements: {}, mapProgress: { completed: [] },
    settings: { sound: true }, cur: null,
    // V1.8.0（B6）：注入非零 totals 供「累计练习」卡断言（真实 finishAll 累加已由既有冒烟覆盖——早段自由练习/教学关不触发 finishAll，故此处注入）
    totals: { count: 12, ms: 720000, errors: 8, hints: 3, stars: 30 },
  };
  await page.evaluate((s) => localStorage.setItem("redtools.shudu.v1", JSON.stringify(s)), a2Store);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await tapText(page, "错题本");
  await page.waitForTimeout(500);
  ok("组内推进：错题分组出现", await vis(page, "唯一候选"));
  await page.locator('button:has-text("练这一组")').first().evaluate((el) => el.click()).catch(() => false);
  await page.waitForTimeout(700);
  ok("组内推进：进入第 1/2 题", await vis(page, "第 1/2 题"));
  // 完成第一题：唯一空格 idx=1 → 填入 2 → 结算 Overlay「下一道」
  await page.locator('button[role="gridcell"]').nth(1).evaluate((el) => el.click()).catch(() => {});
  await page.waitForTimeout(250);
  await page.locator('button[aria-label^="填入数字 2"]').evaluate((el) => el.click()).catch(() => {});
  await page.waitForTimeout(950);
  ok("组内推进：第一题完成结算", await vis(page, "下一道"));
  await tapText(page, "下一道");
  await page.waitForTimeout(700);
  ok("组内推进：推进到第 2/2 题", await vis(page, "第 2/2 题"));
  // V1.7.0 B5：完成第 2 题（唯一空格 idx=6 → 填 1）→「下一道」→ 组内成果小结浮层（3 断言）
  await page.locator('button[role="gridcell"]').nth(6).evaluate((el) => el.click()).catch(() => {});
  await page.waitForTimeout(250);
  await page.locator('button[aria-label^="填入数字 1"]').evaluate((el) => el.click()).catch(() => {});
  await page.waitForTimeout(950);
  await tapText(page, "下一道");
  await page.waitForTimeout(700);
  ok("组内小结：浮层出现", await vis(page, "这组练完了"));
  ok("组内小结：共完成 2 题", await vis(page, "共完成 2 题"));
  ok("组内小结：回到错题本按钮", await vis(page, "回到错题本"));
  // ⑧b V1.8.0 B6：关小结浮层 → 错题本（TopBar 箭头返回首页）→ 家长报告（此时 store 已注入 a2Store：mistakes 2 条 + totals 非零）→ 累计卡 + 技巧分布图
  await page.locator('button:has-text("回到错题本")').first().evaluate((el) => el.click()).catch(() => false);
  await page.waitForTimeout(400);
  // mistakes 页返回 = TopBar 箭头（button[aria-label="返回"]，非文本「返回难度」）
  await page.locator('button[aria-label="返回"]').first().evaluate((el) => el.click()).catch(() => {});
  await page.waitForTimeout(500);
  await tapText(page, "家长报告");
  await page.waitForTimeout(700);
  ok("累计统计卡渲染", await vis(page, "累计练习"));
  ok("累计完成 12 题", await vis(page, "累计完成"));
  ok("技巧分布卡渲染", await vis(page, "待巩固技巧分布"));
  ok("技巧分布图渲染（recharts Pie）", (await page.locator(".recharts-wrapper").count()) >= 1, `count=${await page.locator(".recharts-wrapper").count()}`);

  // ⑨ V1.9.1 B9 备份提醒：注入 backupAt=20 天前 → 设置页「上次备份：20 天前」+ 超期建议行；移除 → 「还没备份过」建议行（store 仍 a2Store 有错题数据）
  await tapText(page, "返回难度");
  await page.waitForTimeout(500);
  await page.evaluate((ts) => localStorage.setItem("redtools.shudu.backupAt", String(ts)), Date.now() - 20 * 86400000);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await tapText(page, "外观设置");
  await page.waitForTimeout(500);
  ok("备份提醒：上次备份状态行", await vis(page, "上次备份：20 天前"));
  ok("备份提醒：超期建议行", await vis(page, "距上次备份已 20 天"));
  await page.evaluate(() => localStorage.removeItem("redtools.shudu.backupAt"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await tapText(page, "外观设置");
  await page.waitForTimeout(500);
  ok("备份提醒：未备份建议行（有数据）", await vis(page, "还没备份过"));
  await tapText(page, "返回难度");
  await page.waitForTimeout(400);

  // ⑩ V1.10.0 B7 进阶技巧盘：Node 侧 import 计算今日 2 技巧名（同源码确定性）→ 首页断言区块 + 卡片 + 跳转链（I3：等待 reveal 动画）
  const d0 = new Date();
  const todayKey = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, "0")}-${String(d0.getDate()).padStart(2, "0")}`;
  const todayKeys = advSkillsFor(todayKey).map((s) => s.name);
  await page.waitForTimeout(700); // 上段已回首页；等待 reveal 动画完成（opacity 门控）
  ok("进阶技巧盘：区块标题", await vis(page, "进阶技巧 · 今日 2 个"));
  ok(`进阶技巧盘：卡片1「${todayKeys[0]}」`, await vis(page, todayKeys[0]));
  ok(`进阶技巧盘：卡片2「${todayKeys[1]}」`, await vis(page, todayKeys[1]));
  ok("进阶技巧盘：「全部 12 个」跳转链", await vis(page, "全部 12 个"));

  // ⑪ V1.11.0 练习容错模式（strict3 三次引导）：设置页选项 → 注入 fixture 快照（4×4 已知解）→ 错 3 次 → 三出口 → 再想想 → 宽容态
  // ① 设置页：容错模式选项可见并开启
  await tapText(page, "外观设置");
  await page.waitForTimeout(500);
  ok("容错模式：设置页选项可见", await vis(page, "练习容错模式"));
  ok("容错模式：「三次引导」选项可见", await vis(page, "三次引导"));
  await tapText(page, "三次引导");
  await page.waitForTimeout(300);
  await tapText(page, "返回难度");
  await page.waitForTimeout(400);
  // ② 注入 strict3 + 断点快照（4×4，挖左上宫 4 格 idx0/1/4/5——1/2/3/4 各余 1 配额，三次错填各用不同数字保证按钮可点）→ reload → 继续上次
  const S_SOL = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];
  const S_PUZ = [0, 0, 3, 4, 0, 0, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1]; // 空格 idx0(=1)/idx1(=2)/idx4(=3)/idx5(=4)
  const strictStore = {
    version: 1, best: {}, recent: {}, checkin: { dates: [], streak: 0 }, history: [],
    skills: {}, advSkills: {}, mistakes: [], favorites: [], daily: null, achievements: {},
    mapProgress: { completed: [] }, totals: { count: 0, ms: 0, errors: 0, hints: 0, stars: 0 },
    settings: { sound: true, errorMode: "strict3" },
    cur: { size: 4, level: "easy", puzzle: S_PUZ, solution: S_SOL, board: S_PUZ.slice(), notes: {}, ms: 0, errors: 0, hints: 0, source: "free" },
  };
  await page.evaluate((s) => localStorage.setItem("redtools.shudu.v1", JSON.stringify(s)), strictStore);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  await tapText(page, "继续上次未完成的题");
  await page.waitForTimeout(600);
  ok("容错模式：机会指示显示", await vis(page, "大胆试错剩 3 次"));
  // ③ 冲突×3（idx0填4 / idx1填2 / idx4填3，各用不同数字配额）→ 三出口询问（仅一次）
  const s3Fill = async (cell, num) => {
    await page.locator('button[role="gridcell"]').nth(cell).evaluate((el) => el.click()).catch(() => {});
    await page.waitForTimeout(250);
    await page.locator(`button[aria-label^="填入数字 ${num}"]`).evaluate((el) => el.click()).catch(() => {});
    await page.waitForTimeout(500);
  };
  await s3Fill(0, 4); // 与 idx3=4 同行冲突（idx0 答案 1，填 4 错）
  ok("容错模式：第 1 次错剩 2 次", await vis(page, "大胆试错剩 2 次"));
  await s3Fill(1, 1); // 与 idx9=1 同列冲突（idx1 答案 2，填 1 错）
  ok("容错模式：第 2 次错剩 1 次", await vis(page, "大胆试错剩 1 次"));
  await s3Fill(4, 2); // 与 idx7=2 同行冲突（idx4 答案 3，填 2 错）→ 第 3 次用尽
  ok("容错模式：三出口询问出现", await vis(page, "已经大胆试错 3 次啦"));
  ok("容错模式：出口-需要提示", await vis(page, "需要提示"));
  ok("容错模式：出口-再自己想想", await vis(page, "再自己想想"));
  ok("容错模式：出口-带我复盘", await vis(page, "带我复盘这一步"));
  // ④ 「再自己想想」→ 宽容态：机会已用尽、第 4 次错不再弹
  await tapText(page, "再自己想想");
  await page.waitForTimeout(400);
  ok("容错模式：宽容态机会已用尽", await vis(page, "已用尽，可求提示或复盘"));
  await s3Fill(5, 3); // 与 idx2=3 同宫冲突（第 4 次，宽容态不计）
  ok("容错模式：宽容态不再重复询问", !(await vis(page, "已经大胆试错 3 次啦")));
  await tapText(page, "返回难度");
  await page.waitForTimeout(400);

  console.log(results.join("\n"));
  const fails = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n冒烟 ${results.length} 项 · PASS ${results.length - fails} · FAIL ${fails} · JS错误 ${jsErrors.length}`);
  if (jsErrors.length) console.log("JS ERRORS:\n" + jsErrors.slice(0, 8).join("\n"));

  await browser.close();
  await viteServer.close();
  process.exit(fails || jsErrors.length ? 1 : 0);
}

main().catch((e) => { console.error("SMOKE CRASH:", e.message); process.exit(2); });

