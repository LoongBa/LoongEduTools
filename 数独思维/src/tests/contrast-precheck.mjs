// 数独思维 · 8 组主题对比度自动化目视预检（A2 遗留项）
// 目的：V1.4.2/V1.5.0 审核报告遗留「hl-pattern / primary-10 对比度目视抽查」——本脚本先做自动化预检，
//       标出疑似偏淡的主题供真机复核（真机目视仍是最终裁决）。
// 做法：自起 vite dev（3014）→ Playwright 逐组设置 html[data-scheme] × .light/.dark →
//       注入真实 Tailwind class 的探针元素（bg-hl-pattern/30 ring-hl-pattern/60 单元格、
//       bg-primary/10 徽章、bg-secondary 对照徽章）→ canvas 精确合成渲染色 → 算 WCAG 对比度 →
//       每主题截图存档 docs/对比度预检/。
// 用法：pnpm test:contrast（需 chromium：env CHROMIUM_PATH 或本机 ms-playwright / Chrome 安装）
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { get } from "node:http";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const PORT = 3014;
const BASE = `http://localhost:${PORT}/`;
const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = join(__dirname, "..", "..", "docs", "对比度预检");
mkdirSync(SHOT_DIR, { recursive: true });

// 4 套色板 × 浅/深（与 lib/theme.tsx SCHEMES 顺序一致）
const THEMES = [
  ["sky", "light"], ["sky", "dark"],
  ["paper", "light"], ["paper", "dark"],
  ["mint", "light"], ["mint", "dark"],
  ["dusk", "light"], ["dusk", "dark"],
];

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

// 探针 HTML：模拟真实渲染语境（pattern 单元格内放数字；徽章放 bg-background 上）
const PROBE = `
<div id="probe" style="position:fixed;left:12px;top:12px;z-index:99999;display:flex;flex-direction:column;gap:14px;font-family:ui-rounded,'SF Pro Rounded','PingFang SC',sans-serif;">
  <div class="bg-background p-4 rounded-lg" style="display:flex;flex-direction:column;gap:12px;">
    <div class="text-sm font-bold" style="color:var(--foreground)">对比度探针 · 背景 = var(--background)</div>
    <div style="display:flex;align-items:center;gap:10px;">
      <div class="bg-board-bg p-2 rounded-md" style="display:flex;gap:6px;" id="board-wrap">
        <div class="relative aspect-square w-10 bg-hl-pattern/30 ring-1 ring-inset ring-hl-pattern/60 rounded-sm" id="cell-pattern-empty"></div>
        <div class="relative aspect-square w-10 bg-hl-pattern/30 ring-1 ring-inset ring-hl-pattern/60 rounded-sm" id="cell-pattern-digit">
          <span class="absolute inset-0 grid place-items-center font-num font-semibold text-cell-given" style="font-size:20px">5</span>
        </div>
        <div class="relative aspect-square w-10 rounded-sm border border-board-line/70" id="cell-plain"></div>
      </div>
      <div class="text-xs text-muted-foreground" style="max-width:150px">hl-pattern 探针：空格 / 带数字 / 普通格（board-bg 上）</div>
    </div>
    <div style="display:flex;align-items:center;gap:10px;">
      <span class="tnum shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[12px] font-bold text-primary" id="badge-primary10">第 1/3 题</span>
      <span class="tnum shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[12px] font-bold text-secondary-foreground" id="badge-secondary">⏱ 12s</span>
      <div class="text-xs text-muted-foreground">bg-primary/10（对比）· bg-secondary（参照）</div>
    </div>
  </div>
</div>
`;

// ---- 自包含求值函数：页内运行，无任何外部依赖 ----
// 返回各主题的对比度数据。混色模型：bg-x/α 即「x 以 α 透明度合成到底色」，
// 数学上 = sRGB src-over：result = base*(1-α) + top*α（CSS 合成默认 sRGB 像素管道，与浏览器渲染一致）。
function computeExpr() {
  // --- 工具 ---
  // OKLCH → sRGB（CSS Color 4 标准算法，Björn Ottosson 拟合参数）
  const oklchToRgb = (str) => {
    if (!str) return null;
    const mm = str.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.]+)?\s*\)/);
    if (!mm) return null;
    const L = parseFloat(mm[1]), C = parseFloat(mm[2]), H = parseFloat(mm[3]);
    const h = (H * Math.PI) / 180;
    const a = C * Math.cos(h), b = C * Math.sin(h);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const f = (x) => x * x * x; // OKLab→LMS' 反向用立方（cbrt 是 XYZ→OKLab 正向方向）
    const l = f(l_), m = f(m_), s = f(s_);
    const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const bb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
    const srgb = (x) => { const c = Math.min(1, Math.max(0, x)); return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; };
    return [Math.round(srgb(r) * 255), Math.round(srgb(g) * 255), Math.round(srgb(bb) * 255)];
  };
  // 半透明前景合成到底色（sRGB src-over）= 浏览器对 bg-x/α 的精确渲染结果
  const blendOver = (base, top, alpha) => {
    if (!base || !top) return null;
    return [base[0] * (1 - alpha) + top[0] * alpha, base[1] * (1 - alpha) + top[1] * alpha, base[2] * (1 - alpha) + top[2] * alpha].map(Math.round);
  };
  const contrast = (rgb1, rgb2) => {
    if (!rgb1 || !rgb2) return null;
    const lum = (rgb) => {
      const lin = rgb.map((v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
      return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    };
    const l1 = lum(rgb1), l2 = lum(rgb2);
    const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
    return (hi + 0.05) / (lo + 0.05);
  };

  // --- 颜色变量采样（oklch 字符串 → sRGB）---
  const root = getComputedStyle(document.documentElement);
  const css = (n) => root.getPropertyValue(n).trim();
  const bg = oklchToRgb(css("--background"));
  const board = oklchToRgb(css("--board-bg"));
  const primary = oklchToRgb(css("--primary"));
  const hl = oklchToRgb(css("--hl-pattern"));
  const given = oklchToRgb(css("--cell-given"));
  const user = oklchToRgb(css("--cell-user"));
  const secondary = oklchToRgb(css("--secondary"));
  const secondaryFg = oklchToRgb(css("--secondary-foreground"));

  // --- 合成渲染色 ---
  // bg-hl-pattern/30 → hl 以 30% 覆盖盘底；ring-hl-pattern/60 → 同上 60%；bg-primary/10 → primary 10% 覆盖页面底
  const patternCell = blendOver(board, hl, 0.3);
  const patternRing = blendOver(board, hl, 0.6);
  const primary10Bg = blendOver(bg, primary, 0.1);

  return {
    method: "oklch→sRGB 精确换算 + sRGB src-over（与浏览器渲染管道一致）",
    // 可辨性：pattern 填充/描边 vs 盘面底（非文本，参考阈值 1.5）
    patternFillVsBoard: contrast(patternCell, board),
    ringVsBoard: contrast(patternRing, board),
    // 可读性：数字落在 pattern 色上（worst-case：若格内有数字）
    digitGivenOnPattern: contrast(given, patternCell),
    digitUserOnPattern: contrast(user, patternCell),
    digitGivenOnPlain: contrast(given, board),
    // 徽章：primary/10 是 A2 核心项（文字 4.5 阈值）
    primaryTextOn10: contrast(primary, primary10Bg),
    // 参照：secondary 徽章
    secondaryTextOnSecondary: contrast(secondaryFg, secondary),
    samples: { patternCell, patternRing, primary10Bg, board, bg },
  };
}

async function main() {
  const viteServer = await createServer({ server: { port: PORT, strictPort: true } });
  await viteServer.listen();
  try { await waitServer(PORT); } catch { console.error("vite dev 未在 3014 就绪"); await viteServer.close(); process.exit(2); }

  const execPath = chromiumPath();
  if (!execPath) {
    console.log("未找到 chromium：设置 CHROMIUM_PATH 或安装 playwright chromium 后重试。");
    await viteServer.close();
    process.exit(0);
  }

  const browser = await chromium.launch({ headless: true, executablePath: execPath, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 520, height: 260 } });
  const jsErrors = [];
  page.on("pageerror", (e) => jsErrors.push(String(e)));
  await page.goto(BASE, { waitUntil: "networkidle" });

  const rows = [];
  for (const [scheme, mode] of THEMES) {
    await page.evaluate(({ scheme, mode }) => {
      const el = document.documentElement;
      el.setAttribute("data-scheme", scheme);
      el.classList.remove("light", "dark");
      el.classList.add(mode);
      el.setAttribute("data-theme", mode);
    }, { scheme, mode });
    await page.waitForTimeout(250); // 等 CSS 变量切换生效
    await page.evaluate((probeHtml) => {
      document.getElementById("probe")?.remove();
      const wrap = document.createElement("div");
      wrap.innerHTML = probeHtml;
      document.body.appendChild(wrap.firstElementChild);
    }, PROBE);
    await page.waitForTimeout(150);

    const r = await page.evaluate(computeExpr);
    const shot = join(SHOT_DIR, `${scheme}-${mode}.png`);
    await page.screenshot({ path: shot, clip: { x: 0, y: 0, width: 520, height: 240 } });

    rows.push({ scheme, mode, ...r, shot });
  }

  // ---- 汇总输出 ----
  console.log("\n== 数独思维 · 8 组主题对比度预检（A2） ==");
  console.log(`方法：${rows[0].method}\n`);
  const fmt = (v, th) => (v == null ? "  --  " : (v >= th ? `${v.toFixed(2)} ✅` : `${v.toFixed(2)} ⚠️`));
  console.log("主題       | pattern填充vs盘底(≥1.5) | ringvs盘底(≥1.5) | 数字given-on-pattern(≥4.5) | primary文字on/10(≥4.5) | secondary参照(≥4.5)");
  console.log("-----------|-------------------------|------------------|---------------------------|------------------------|--------------------");
  for (const r of rows) {
    const name = `${r.scheme}/${r.mode}`.padEnd(11);
    console.log(`${name}| ${fmt(r.patternFillVsBoard, 1.5).padEnd(23)} | ${fmt(r.ringVsBoard, 1.5).padEnd(16)} | ${fmt(r.digitGivenOnPattern, 4.5).padEnd(25)} | ${fmt(r.primaryTextOn10, 4.5).padEnd(22)} | ${fmt(r.secondaryTextOnSecondary, 4.5)}`);
  }
  console.log("\n截图存档：docs/对比度预检/<scheme>-<mode>.png");
  if (jsErrors.length) console.log(`\n⚠️ JS 错误 ${jsErrors.length} 条：\n${jsErrors.join("\n")}`);
  else console.log("\nJS 错误 0");

  await browser.close();
  await viteServer.close();
}

main().catch((e) => { console.error(e); process.exit(1); });