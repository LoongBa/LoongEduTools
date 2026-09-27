import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { transform as lightningcssTransform } from "lightningcss";

/**
 * minitool 离线包 HTML 后处理：构建产物去掉 type="module" / crossorigin → 经典脚本。
 * （从英语陪练 WebH5 vite.config 移植：离线包必须经典脚本，禁 type=module）
 */
function offlineHtmlPlugin(): Plugin {
  return {
    name: "offline-html-classic-script",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        // 剥 type=module 后必须补 defer：module 默认 defer，经典脚本在 head 同步执行
        // 会在 body/#root 解析前 createRoot → React #299 白屏
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
 * 从英语陪练 WebH5 移植：Tailwind v4 产物的 @layer/@property/:where/:is/dvh/flex gap
 * 在 Chrome 61 不可用，全部在此降级。
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
  out = flattenAtLayer(out);                    // 1) @layer 展平
  out = out.replace(/@property\s+[\w-]+\s*\{[^}]*\}/g, "");  // 2) @property 剥除
  out = addFocusBaseline(out);                  // 3) :focus-visible → :focus
  out = addVhFallback(out);                     // 4) dvh/svh → vh 回退
  out = lightningcssLower(out);                 // 5) lightningcss :is/:where/color-mix 降级
  out = transformModernSelectors(out);          // 6) :where 解包 / :is → :-webkit-any
  out = stripHasRules(out);                     // 7) :has 规则剥除
  out = appendGapFallbacks(out);                // 8) flex/grid gap 基线（margin 回退）
  return out;
}

function stripHasRules(css: string): string {
  let out = css.replace(/([^{}]+)\{([^{}]*)\}/g, (match, sel: string, body: string) => {
    if (sel.includes(":has(")) return "";
    return match;
  });
  out = out.replace(/@(?:supports|media|container)\s*[^{]*\{\s*\}/g, "");
  out = out.replace(/\n{3,}/g, "\n\n");
  return out;
}

function transformModernSelectors(css: string): string {
  let out = css.replace(/:is\(/g, ":-webkit-any(");
  out = unwrapAll(out, ":where(");
  return out;
}

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

function flattenAtLayer(css: string): string {
  let out = css.replace(/@layer\s+[\w-]+\s*;/g, "");
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
    const bodyEnd = i - 1;
    const body = out.slice(bodyStart, bodyEnd);
    out = out.slice(0, start) + body + out.slice(i);
  }
  return out;
}

function addFocusBaseline(css: string): string {
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

function addVhFallback(css: string): string {
  return css.replace(
    /((?:min-|max-)?(?:height|width)):\s*([^;}]*?)(\d*\.?\d+)(d|l|s)(vh|vw)\b/g,
    (match, prop: string, pre: string, num: string, _kind: string, unit: string) => {
      const vh = unit;
      return `${prop}:${pre}${num}${vh};${prop}:${pre}${num}${_kind}${unit}`;
    },
  );
}

function appendGapFallbacks(css: string): string {
  const gapVals: Record<string, string> = {
    "0.5": "0.125rem", "1": "0.25rem", "1.5": "0.375rem", "2": "0.5rem", "2.5": "0.625rem",
    "3": "0.75rem", "4": "1rem", "5": "1.25rem", "6": "1.5rem", "8": "2rem", "10": "2.5rem",
  };
  const rules: string[] = [];
  for (const [k, v] of Object.entries(gapVals)) {
    rules.push(`.gap-${k}{grid-gap:${v}}`);
    rules.push(`.gap-x-${k}{grid-column-gap:${v}}`);
    rules.push(`.gap-y-${k}{grid-row-gap:${v}}`);
  }
  for (const [k, v] of Object.entries(gapVals)) {
    rules.push(`.no-flex-gap .flex-col.gap-${k}>*+*{margin-top:${v}}`);
    rules.push(`.no-flex-gap .flex.gap-${k}:not(.flex-col)>*+*{margin-left:${v}}`);
    rules.push(`.no-flex-gap .gap-x-${k}>*+*{margin-left:${v}}`);
    rules.push(`.no-flex-gap .flex-col.gap-y-${k}>*+*{margin-top:${v}}`);
  }
  return css + rules.join("");
}

/**
 * React + Vite 构建配置：双形态（同一套 src/，构建期区分）
 * - offline（默认 `pnpm build`）：minitool 离线包——全相对路径 + 经典脚本 + Chrome 61
 *   JS/CSS 基线 + 数据构建期内联（gen_stages.mjs）
 * - online（`pnpm build:online`，--mode online）：Web 部署 —— 根路径 + 现代浏览器 target
 *
 * 端口 3016（3014 数独思维 / 3015 英语陪练已占用）
 */
export default defineConfig(({ command, mode }) => {
  const online = mode === "online";
  return {
    base: online ? "/" : command === "serve" ? "/" : "./",
    define: {
      "import.meta.env.VITE_BUILD_TARGET": JSON.stringify(online ? "online" : "offline"),
    },
    plugins: [
      tailwindcss(),
      viteReact(),
      tsConfigPaths(),
      ...(online ? [] : [offlineHtmlPlugin(), offlineCssPlugin()]),
    ],
    server: {
      host: "0.0.0.0",
      port: 3016,
      strictPort: true,
      allowedHosts: true,
      hmr: false,
    },
    css: {
      transformer: "lightningcss",
      lightningcss: {
        targets: online ? undefined : { chrome: 61 << 16, safari: 12 << 16 },
      },
    },
    build: {
      outDir: "dist",
      assetsDir: "assets",
      emptyOutDir: true,
      target: online ? ["chrome90", "safari14"] : ["es2017", "chrome61"],
      modulePreload: false,
      rollupOptions: {
        output: {
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