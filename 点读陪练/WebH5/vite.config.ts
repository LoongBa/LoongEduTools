import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { existsSync } from "fs";
import { resolve } from "path";
import { transform as lightningcssTransform } from "lightningcss";

const SOURCE_LOCATION_PLUGIN_CANDIDATES = [
  process.env.MEOO_SOURCE_LOCATION_PLUGIN_PATH,
  "/app/sdk/lib/src/plugins/source-location-babel.js",
  resolve(process.cwd(), "node_modules/@ali/oneday-agent-sdk/lib/src/plugins/source-location-babel.js"),
].filter(Boolean) as string[];

const SOURCE_LOCATION_PLUGIN_PATH = SOURCE_LOCATION_PLUGIN_CANDIDATES.find((path) => existsSync(path));

/** minitool 离线包 HTML 后处理：构建产物去掉 type="module" / crossorigin → 经典脚本。 */
function offlineHtmlPlugin(): Plugin {
  return {
    name: "offline-html-classic-script",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        // 剥 type=module 后必须补 defer：module 默认 defer，经典脚本在 head 同步执行
        // 会在 body/#root 解析前 createRoot → React #299 白屏（踩坑：V0.9.3 离线包）。
        // theme-boot.js 保持同步（主题预置需在首帧前）；仅入口 bundle 变 defer。
        return html
          .replace(/\s+type="module"/g, " defer")
          .replace(/\s+crossorigin(?:="[^"]*")?/g, "");
      },
    },
  };
}

/**
 * minitool Chrome 61 CSS 后处理（generateBundle 阶段，处理最终 .css asset）。
 * lightningcss targets 不处理的项在此补齐：
 *  1. @layer 展平（按 properties→theme→base→utilities 序解包，保留相对顺序）
 *  2. @property 剥除（Chrome 61 不支持，且 Tailwind v4 生成 80+ 个）
 *  3. :focus-visible → 补 :focus 基线（Chrome 86+ 才支持 :focus-visible）
 *  4. dvh/svh → 补 vh 回退（先 vh 后 dvh，旧浏览器取 vh）
 *  5. flex gap → .no-flex-gap 下 margin 基线 + grid 容器补 grid-gap
 *  6. :where() 解包 / :is() → :-webkit-any()（Chrome 61 基线）
 */
function offlineCssPlugin(): Plugin {
  return {
    name: "offline-css-chrome61",
    apply: "build",
    generateBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (!fileName.endsWith(".css")) continue;
        const asset = bundle[fileName];
        if (asset.type !== "asset") continue;
        const source = typeof asset.source === "string" ? asset.source : Buffer.from(asset.source).toString("utf8");
        asset.source = transformCssForChrome61(source);
      }
    },
  };
}

function transformCssForChrome61(css: string): string {
  let out = css;

  // 1) @layer 展平：brace-matching 解包，保留内容顺序（Tailwind 序已是 cascade 序）
  out = flattenAtLayer(out);

  // 2) @property 剥除
  out = out.replace(/@property\s+[\w-]+\s*\{[^}]*\}/g, "");

  // 3) :focus-visible 规则 → 复制一份 :focus 基线（保留原规则供新浏览器）
  out = addFocusBaseline(out);

  // 4) dvh/svh 补 vh 回退
  out = addVhFallback(out);

  // 5) lightningcss 降级 :is()/:where()/color-mix 等（vite css.transformer 可能未覆盖 Tailwind 产物）
  out = lightningcssLower(out);

  // 6) 现代选择器 Chrome61 基线：:where() 解包、:is() → :-webkit-any()
  out = transformModernSelectors(out);

  // 7) 剥除含 :has() 的规则（Chrome 61 不支持；死 UI/tw-animate 残留兜底）
  out = stripHasRules(out);

  // 8) gap 基线：grid-gap 别名 + flex margin 回退
  out = appendGapFallbacks(out);

  return out;
}

/**
 * 移除 selector 含 :has( 的整条规则（Chrome 61 会静默丢弃，且这些来自死 UI/tw-animate）。
 * 同时清理因此变空的 @supports/@media 块。
 */
function stripHasRules(css: string): string {
  let out = css.replace(/([^{}]+)\{([^{}]*)\}/g, (match, sel: string, body: string) => {
    if (sel.includes(":has(")) return "";
    return match;
  });
  // 清理空 at-rule 块：@supports (...) { } / @media ... { }
  out = out.replace(/@(?:supports|media|container)\s*[^{]*\{\s*\}/g, "");
  // 压缩连续空白（仅空行，不动结构）
  out = out.replace(/\n{3,}/g, "\n\n");
  return out;
}

/**
 * Chrome 61 不支持 :where()/:is()（浏览器会静默丢弃整条规则）。
 *  - :where(X) → 解包为 X（specificity 从 0 升为 X 自身，对 space-y/divide 等工具类可接受）
 *  - :is(X)    → :-webkit-any(X)（Chrome 61 支持的历史前缀名，语义等价）
 * 嵌套用递归 brace-matching 展开，不用简单正则（避免括号错配）。
 */
function transformModernSelectors(css: string): string {
  // 先把 :is( 换成 :-webkit-any(（纯 token 替换，:is 内部不含同名嵌套场景）
  let out = css.replace(/:is\(/g, ":-webkit-any(");
  // 再解包所有 :where( ... )
  out = unwrapAll(out, ":where(");
  return out;
}

/** 递归解包 token（如 ":where("）的匹配括号内容，保留内部结构。 */
function unwrapAll(css: string, token: string): string {
  let result = "";
  let i = 0;
  for (;;) {
    const idx = css.indexOf(token, i);
    if (idx === -1) {
      result += css.slice(i);
      break;
    }
    result += css.slice(i, idx);
    let depth = 1;
    let j = idx + token.length;
    while (j < css.length && depth > 0) {
      const ch = css[j];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      j++;
    }
    const inner = css.slice(idx + token.length, Math.max(idx + token.length, j - 1));
    result += unwrapAll(inner, token);
    i = j;
  }
  return result;
}

/** 程序化调用 lightningcss 做选择器/颜色降级；失败时保留原样。 */
function lightningcssLower(css: string): string {
  try {
    const result = lightningcssTransform({
      code: Buffer.from(css, "utf8"),
      filename: "bundle.css",
      targets: { chrome: 61 << 16, safari: 12 << 16 },
      minify: false,
    });
    return Buffer.from(result.code).toString("utf8");
  } catch {
    return css;
  }
}

/** 展平 @layer name { ... } — 递归 brace-matching，保留内部内容顺序。 */
function flattenAtLayer(css: string): string {
  // 先处理空语句 @layer components;
  let out = css.replace(/@layer\s+[\w-]+\s*;/g, "");
  // 循环展平块级 @layer（可能嵌套）
  for (;;) {
    const m = out.match(/@layer\s+[\w-]+\s*\{/);
    if (!m || m.index === undefined) break;
    const start = m.index;
    const bodyStart = start + m[0].length;
    let depth = 1;
    let i = bodyStart;
    while (i < out.length && depth > 0) {
      const ch = out[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    const bodyEnd = i - 1; // 指向匹配的 }
    const body = out.slice(bodyStart, bodyEnd);
    out = out.slice(0, start) + body + out.slice(i);
  }
  return out;
}

/**
 * :focus-visible 规则复制为 :focus 基线。
 * 匹配 selector{body} 中 selector 含 :focus-visible 的规则，
 * 在原规则前插入一份 :focus 版（Chrome 61 只认 :focus）。
 */
function addFocusBaseline(css: string): string {
  // 规则形如 selector{...} — 非贪婪匹配到第一个 }
  return css.replace(
    /([^{}]+)\{([^{}]*)\}/g,
    (match, sel: string, body: string) => {
      if (!sel.includes(":focus-visible")) return match;
      const focusSel = sel.replace(/:focus-visible/g, ":focus").trim();
      if (!focusSel || focusSel === sel.trim()) return match;
      return `${focusSel}{${body}}${sel}{${body}}`;
    },
  );
}

/** dvh/svh 前插入等值 vh 回退（同属性重复声明，旧浏览器忽略后者）。 */
function addVhFallback(css: string): string {
  return css.replace(
    /((?:min-|max-)?(?:height|width)):\s*([^;}]*?)(\d*\.?\d+)(d|l|s)(vh|vw)\b/g,
    (match, prop: string, pre: string, num: string, _kind: string, unit: string) => {
      const vh = unit; // vh/vw 不变
      return `${prop}:${pre}${num}${vh};${prop}:${pre}${num}${_kind}${unit}`;
    },
  );
}

/** 追加 gap 基线：grid-gap 别名 + .no-flex-gap 下 flex margin 回退。 */
function appendGapFallbacks(css: string): string {
  // Tailwind v4 间距刻度（rem）
  const gapVals: Record<string, string> = {
    "0.5": "0.125rem",
    "1": "0.25rem",
    "1.5": "0.375rem",
    "2": "0.5rem",
    "2.5": "0.625rem",
    "3": "0.75rem",
    "4": "1rem",
    "5": "1.25rem",
    "6": "1.5rem",
    "8": "2rem",
    "10": "2.5rem",
  };
  const rules: string[] = [];

  // grid-gap 别名：给 .gap-* 补 grid-gap（Chrome 61 grid 只认 grid-gap）
  for (const [k, v] of Object.entries(gapVals)) {
    rules.push(`.gap-${k}{grid-gap:${v}}`);
    rules.push(`.gap-x-${k}{grid-column-gap:${v}}`);
    rules.push(`.gap-y-${k}{grid-row-gap:${v}}`);
  }

  // flex margin 回退（仅 .no-flex-gap 时生效；行为测量在 main.tsx 注入该 class）
  // gap-N：列向 → margin-top；行向（非 flex-col）→ margin-left
  for (const [k, v] of Object.entries(gapVals)) {
    rules.push(`.no-flex-gap .flex-col.gap-${k}>*+*{margin-top:${v}}`);
    rules.push(`.no-flex-gap .flex.gap-${k}:not(.flex-col)>*+*{margin-left:${v}}`);
    // gap-x：水平方向
    rules.push(`.no-flex-gap .gap-x-${k}>*+*{margin-left:${v}}`);
    // gap-y：垂直方向（列向容器）
    rules.push(`.no-flex-gap .flex-col.gap-y-${k}>*+*{margin-top:${v}}`);
  }

  return css + rules.join("");
}

/**
 * React + Vite 构建配置
 *
 * 两种构建形态（同一套 src/，构建期区分）：
 * - offline（默认 `pnpm build`）：minitool 离线包——全相对路径 + 经典脚本(iife→es)
 *   + Chrome 61 JS/CSS 基线 + 数据构建期内联（gen_catalog.mjs）+ 禁网络（在线模块被
 *   `VITE_BUILD_TARGET === "offline"` 常量折叠 tree-shake 掉）
 * - online（`pnpm build:online`，`--mode online`）：Web 部署——根路径 + 现代浏览器
 *   target + 保留 Chrome 61 CSS 降级之外的现代特性；运行时注册 RemoteProvider（在线
 *   内容更新，见 src/data/remote-provider.ts）与 AuthProvider
 *
 * 硬约束：
 * - dev server 必须监听 3015 + strictPort（沙箱只开放一个代理端口）
 * - outDir 'dist' / assetsDir 'assets' — 归一化产物目录
 * - 离线包（minitool-zip-builder 规范）：build 产物全相对路径 + 经典脚本(iife)
 *   + Chrome 61 JS/CSS 基线 + 数据构建期内联（gen_catalog.mjs，见 package.json）
 */
export default defineConfig(({ command, mode }) => {
  const online = mode === "online";
  return {
    // 离线包：构建期 base './'（index.html 内资源引用全相对）；dev 保持根路径；在线部署根路径
    base: online ? "/" : command === "serve" ? "/" : "./",
    define: {
      // 构建形态常量：offline 构建折叠为 false → 在线模块（RemoteProvider/AuthProvider）被 tree-shake
      "import.meta.env.VITE_BUILD_TARGET": JSON.stringify(online ? "online" : "offline"),
    },
    plugins: [
      tailwindcss(),
      TanStackRouterVite(),
      viteReact({
        babel: {
          plugins: SOURCE_LOCATION_PLUGIN_PATH
            ? [[SOURCE_LOCATION_PLUGIN_PATH, { projectRoot: process.cwd() }]]
            : [],
        },
      }),
      tsConfigPaths(),
      ...(online ? [] : [offlineHtmlPlugin(), offlineCssPlugin()]),
    ],
    server: {
      host: "0.0.0.0",
      port: 3015,
      strictPort: true,
      allowedHosts: true,
      // HMR 默认关闭：沙箱预览 iframe 下 HMR 的整页 reload 会放大任何 transform error
      // 如需热更，改为: hmr: { clientPort: 443, protocol: 'wss' }
      hmr: false,
    },
    css: {
      // Chrome 61 CSS 基线（offline）：@layer 展平、oklch/color-mix → rgb/hex、inset → 物理属性
      // online：现代浏览器，不降级
      transformer: "lightningcss",
      lightningcss: {
        targets: online ? undefined : { chrome: 61 << 16, safari: 12 << 16 },
      },
    },
    build: {
      outDir: "dist",
      assetsDir: "assets",
      emptyOutDir: true,
      // offline：Chrome 61 JS 基线（es2017 兜底）；online：Chrome 90+/Safari 14+
      target: online ? ["chrome90", "safari14"] : ["es2017", "chrome61"],
      // 禁 modulepreload 注入（离线无动态 import）
      modulePreload: false,
      rollupOptions: {
        output: {
          // 经典脚本：es 格式产出独立 CSS + 无模块语法 JS（实测 0 import/export）；
          // offlineHtmlPlugin 剥 type=module 后即为合规经典脚本。
          // iife 格式会把 CSS 内联进 JS 导致 CSS 不独立落盘（已踩坑）。
          format: "es",
          inlineDynamicImports: true,
          entryFileNames: "assets/[name]-[hash].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
  };
});
