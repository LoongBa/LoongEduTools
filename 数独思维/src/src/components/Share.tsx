// 分享：题面打印图（canvas）+ 成绩长图 1080×1920（canvas）+ SD 文本复制。
// 纯本地绘制，不请求任何外部资源；措辞为教学/训练语系。

import { useEffect, useMemo, useRef, useState } from "react";
import { Overlay, Stars } from "./Overlay";
import { Btn } from "./ui/kit";
import { useStore } from "@/lib/store";
import { cssVar } from "@/lib/theme";
import { toSDString, type Grid, type Size } from "@/lib/sudoku";
import { formatMs } from "./Overlay";

/* ---------- 通用：把盘面画到 canvas ---------- */
function drawBoard(ctx: CanvasRenderingContext2D, board: Grid, size: Size, x: number, y: number, side: number, opts: { fg: string; line: string; boxLine: string; bg: string; userColor?: string }) {
  const dim = size;
  const n = dim * dim;
  const cell = side / dim;
  ctx.fillStyle = opts.bg;
  ctx.fillRect(x, y, side, side);
  ctx.font = `${Math.floor(cell * 0.56)}px "PingFang SC","Microsoft YaHei",sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / dim);
    const c = i % dim;
    const cx = x + c * cell;
    const cy = y + r * cell;
    if (board[i]) {
      ctx.fillStyle = opts.fg;
      ctx.fillText(String(board[i]), cx + cell / 2, cy + cell / 2 + 1);
    }
  }
  // 细线
  ctx.strokeStyle = opts.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = 0; k <= dim; k++) {
    ctx.moveTo(x + k * cell, y);
    ctx.lineTo(x + k * cell, y + side);
    ctx.moveTo(x, y + k * cell);
    ctx.lineTo(x + side, y + k * cell);
  }
  ctx.stroke();
  // 宫粗线
  ctx.strokeStyle = opts.boxLine;
  ctx.lineWidth = Math.max(2, side / 140);
  const boxW = size === 9 ? 3 : 2;
  const boxH = size === 9 ? 3 : size === 6 ? 3 : 2;
  ctx.beginPath();
  for (let br = 0; br <= dim; br += boxH) {
    ctx.moveTo(x, y + br * cell);
    ctx.lineTo(x + side, y + br * cell);
  }
  for (let bc = 0; bc <= dim; bc += boxW) {
    ctx.moveTo(x + bc * cell, y);
    ctx.lineTo(x + bc * cell, y + side);
  }
  ctx.stroke();
}

/* ---------- 伪二维码（确定性图案，用于版式占位说明） ---------- */
function drawQrBlock(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, seed: string, dark: string, light: string) {
  const N = 21;
  const u = size / N;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const rnd = () => {
    h ^= h << 13;
    h >>>= 0;
    h ^= h >> 17;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= h << 5;
    h >>>= 0;
    return h / 4294967296;
  };
  ctx.fillStyle = light;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = dark;
  const finder = (fx: number, fy: number) => {
    ctx.fillRect(x + fx * u, y + fy * u, 7 * u, 7 * u);
    ctx.fillStyle = light;
    ctx.fillRect(x + (fx + 1) * u, y + (fy + 1) * u, 5 * u, 5 * u);
    ctx.fillStyle = dark;
    ctx.fillRect(x + (fx + 2) * u, y + (fy + 2) * u, 3 * u, 3 * u);
  };
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const inFinder = (r < 8 && c < 8) || (r < 8 && c > N - 9) || (r > N - 9 && c < 8);
      if (inFinder) continue;
      if (rnd() > 0.52) ctx.fillRect(x + c * u, y + r * u, u, u);
    }
  }
  finder(0, 0);
  finder(N - 7, 0);
  finder(0, N - 7);
}

/* ==================== 分享这道题 ==================== */
export function SharePuzzleOverlay({
  board,
  solution,
  size,
  skillName,
  onClose,
  onToast,
}: {
  board: Grid;
  solution: Grid;
  size: Size;
  /** 训练地图来源可传技巧标签；无值时行为与现状完全一致 */
  skillName?: string;
  onClose: () => void;
  onToast: (t: string) => void;
}) {
  const [showAnswer, setShowAnswer] = useState(false);
  const ref = useRef<HTMLCanvasElement | null>(null);
  const sd = useMemo(() => toSDString(board, size), [board, size]);
  const text = `数独思维 · ${size}×${size} 练习题\n题目编码：${sd}${skillName ? `\n[技巧标签：${skillName}]` : ""}\n提示：先找「只剩一个位置」的数字，从行和列一起排除。`;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const side = 720;
    const tagH = skillName ? 46 : 0;
    cv.width = side;
    cv.height = side + 120 + tagH;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dark = cssVar("--cell-given") || "#2a3a4a";
    const line = cssVar("--board-line") || "#c9d8e6";
    const boxLine = cssVar("--board-box-line") || "#3a5a7a";
    const bg = cssVar("--board-bg") || "#ffffff";
    const muted = cssVar("--muted-foreground") || "#7a8ea3";
    ctx.fillStyle = cssVar("--card") || "#fff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = dark;
    ctx.font = `bold 30px "PingFang SC",sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`数独思维 · ${size}×${size} ${showAnswer ? "答案" : "练习题"}`, 40, 34);
    if (skillName) {
      // 技巧标签行：标题下行、盘面上方，与 drawBoard 同级排版
      ctx.fillStyle = muted;
      ctx.font = `400 21px "PingFang SC","Microsoft YaHei",sans-serif`;
      ctx.fillText(`技巧标签：${skillName}`, 40, 70);
    }
    drawBoard(ctx, showAnswer ? solution : board, size, 40, 90 + tagH, side - 80, { fg: dark, line, boxLine, bg });
  }, [board, solution, size, showAnswer, skillName]);

  function copy() {
    copyText(text, onToast);
  }

  return (
    <Overlay
      open
      onClose={onClose}
      wide
      title="📤 分享这道题"
      sub="可以打印给孩子做，或把编码存进导入题目里随时再练。"
      footer={
        <>
          <Btn variant="primary" size="lg" className="w-full" onClick={copy}>
            复制题目文本
          </Btn>
          <div className="grid grid-cols-2 gap-2">
            <Btn variant="secondary" onClick={() => setShowAnswer((v) => !v)}>
              {showAnswer ? "看题面" : "看答案"}
            </Btn>
            <Btn variant="ghost" onClick={onClose}>
              返回结果
            </Btn>
          </div>
        </>
      }
    >
      <div className="space-y-3">
        <textarea
          readOnly
          value={text}
          aria-label="题目文本"
          onFocus={(e) => e.currentTarget.select()}
          className="h-24 w-full resize-none rounded-xl border border-border bg-secondary/50 p-3 text-[12px] leading-relaxed text-foreground outline-none focus:border-primary"
        />
        <canvas ref={ref} className="w-full rounded-xl border border-border bg-card" style={{ aspectRatio: skillName ? "1 / 1.23" : "1 / 1.17" }} />
        <p className="text-center text-[11px] text-muted-foreground">📸 长按图片可保存或发给朋友</p>
      </div>
    </Overlay>
  );
}

/* ==================== 分享成绩长图 ==================== */
export function ShareResultOverlay({
  size,
  level,
  stars,
  ms,
  errors,
  hints,
  board,
  onClose,
  onToast,
}: {
  size: Size;
  level: string;
  stars: number;
  ms: number;
  errors: number;
  hints: number;
  board: Grid;
  onClose: () => void;
  onToast: (t: string) => void;
}) {
  const { store } = useStoreLite();
  const ref = useRef<HTMLCanvasElement | null>(null);
  const litCount = Object.keys(store.skills).length + Object.keys(store.advSkills).length;
  const text = `我在数独思维完成了 ${size}×${size}（${level}）练习\n用时 ${formatMs(ms)} 秒 · 获得 ${stars}★\n已点亮 ${litCount} 个推理技巧徽章`;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const W = 1080;
    const H = 1920;
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const primary = cssVar("--primary") || "#4aa8ff";
    const fg = cssVar("--foreground") || "#2a3a4a";
    const muted = cssVar("--muted-foreground") || "#7a8ea3";
    const card = cssVar("--card") || "#ffffff";
    const line = cssVar("--board-line") || "#c9d8e6";
    const boxLine = cssVar("--board-box-line") || "#3a5a7a";
    const star = cssVar("--star") || "#f5a623";

    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, mix(primary, 0.22, card));
    g.addColorStop(1, mix(primary, 0.06, card));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 装饰圆点
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = primary;
    ctx.beginPath();
    ctx.arc(W - 90, 150, 190, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(70, H - 260, 150, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = muted;
    ctx.font = `500 34px "PingFang SC",sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("逻辑推理练习记录", W / 2, 150);

    ctx.fillStyle = fg;
    ctx.font = `bold 76px "PingFang SC",sans-serif`;
    ctx.fillText("数独思维", W / 2, 240);

    // 成绩卡
    roundRect(ctx, 90, 320, W - 180, 470, 40);
    ctx.fillStyle = card;
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = fg;
    ctx.font = `bold 46px "PingFang SC",sans-serif`;
    ctx.fillText(`${size}×${size} · ${level}`, W / 2, 410);

    ctx.fillStyle = star;
    ctx.font = `bold 96px sans-serif`;
    ctx.fillText("★".repeat(stars) + "☆".repeat(3 - stars), W / 2, 520);

    const cols = [
      ["用时", `${formatMs(ms)}s`],
      ["失误", `${errors}`],
      ["提示", `${hints}`],
    ];
    cols.forEach((c, i) => {
      const cx = 90 + ((W - 180) / 3) * (i + 0.5);
      ctx.fillStyle = fg;
      ctx.font = `bold 54px "PingFang SC",sans-serif`;
      ctx.fillText(c[1], cx, 640);
      ctx.fillStyle = muted;
      ctx.font = `400 30px "PingFang SC",sans-serif`;
      ctx.fillText(c[0], cx, 690);
    });

    // 迷你盘
    const bSide = W - 320;
    roundRect(ctx, 160, 840, bSide + 40, bSide + 40, 32);
    ctx.fillStyle = card;
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.stroke();
    drawBoard(ctx, board, size, 180, 860, bSide, { fg, line, boxLine, bg: card });

    // 技巧掌握行
    ctx.fillStyle = fg;
    ctx.font = `500 36px "PingFang SC",sans-serif`;
    ctx.fillText(`已点亮推理技巧 ${litCount} / 16`, W / 2, 840 + bSide + 120);

    // 二维码区
    const qrSize = 260;
    roundRect(ctx, (W - qrSize) / 2 - 26, H - 460, qrSize + 52, qrSize + 52, 28);
    ctx.fillStyle = card;
    ctx.fill();
    drawQrBlock(ctx, (W - qrSize) / 2, H - 434, qrSize, `sd-${size}-${toSDString(board, size)}`, fg, card);
    ctx.fillStyle = muted;
    ctx.font = `400 30px "PingFang SC",sans-serif`;
    ctx.fillText("扫码进入离线练习页", W / 2, H - 130);
    ctx.fillStyle = fg;
    ctx.font = `500 32px "PingFang SC",sans-serif`;
    ctx.fillText("龙爸乐学 · 数独思维", W / 2, H - 76);
  }, [size, level, stars, ms, errors, hints, board, litCount]);

  function copy() {
    copyText(text, onToast);
  }

  return (
    <Overlay
      open
      onClose={onClose}
      wide
      title="📤 分享成绩"
      sub="只展示你自己的表现，不和任何人比较。"
      footer={
        <>
          <Btn variant="primary" size="lg" className="w-full" onClick={copy}>
            复制分享文案
          </Btn>
          <Btn variant="ghost" className="w-full" onClick={onClose}>
            返回结果
          </Btn>
        </>
      }
    >
      <div className="space-y-3">
        <canvas ref={ref} className="mx-auto w-full max-w-[240px] rounded-xl border border-border shadow-soft" style={{ aspectRatio: "9 / 16" }} />
        <textarea
          readOnly
          value={text}
          aria-label="分享文案"
          onFocus={(e) => e.currentTarget.select()}
          className="h-24 w-full resize-none rounded-xl border border-border bg-secondary/50 p-3 text-[12px] leading-relaxed text-foreground outline-none focus:border-primary"
        />
        <p className="text-center text-[11px] text-muted-foreground">📸 长按保存这张成绩卡</p>
      </div>
    </Overlay>
  );
}

/* ==================== 工具 ==================== */
function copyText(text: string, onToast: (t: string) => void) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    onToast(ok ? "已复制到剪贴板" : "请长按文本手动复制");
  } catch {
    onToast("请长按文本手动复制");
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** oklch 变量无法直接做数值混色，长图渐变退化为纯色底 */
function mix(_color: string, _amount: number, base: string): string {
  return base;
}

/** 复用全局存档，读取已点亮技巧数 */
function useStoreLite() {
  return useStore();
}
