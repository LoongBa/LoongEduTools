// 练习完成后的小结页：把这道题的推理链一步步回放出来。
// 迷你盘面按「回放进度」呈现：初始已知 + 已推出的格子，当前步高亮、支撑线索次高亮。
// 数据由 src/lib/replay.ts 在本地即时推导，不依赖任何网络。

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Overlay, Btn, formatMs } from "./Overlay";
import { colOf, rowOf, type Grid, type Size } from "@/lib/sudoku";
import { cachedReplay } from "@/lib/replay";

interface Props {
  open: boolean;
  puzzle: Grid;
  solution: Grid;
  size: Size;
  ms: number;
  errors: number;
  hints: number;
  onClose: () => void;
}

/** 技巧 → 色带（复用三墙徽章色） */
const TECH_TONE: Record<string, "base" | "adv" | "ach"> = {
  唯一候选: "base",
  宫内排除: "adv",
  行排除: "ach",
  列排除: "ach",
};

export function StepReview({ open, puzzle, solution, size, ms, errors, hints, onClose }: Props) {
  const [cursor, setCursor] = useState(0);
  const replay = useMemo(() => (open ? cachedReplay(puzzle, solution, size) : null), [open, puzzle, solution, size]);

  const total = replay ? replay.steps.length : 0;
  const clamped = total ? Math.min(cursor, total - 1) : 0;
  const cur = replay && total ? replay.steps[clamped] : undefined;

  /** 截至当前步，盘面上已经确定的格子 */
  const revealed = useMemo(() => {
    const g = puzzle.slice();
    if (!replay) return g;
    for (let i = 0; i <= clamped; i++) g[replay.steps[i].index] = replay.steps[i].value;
    return g;
  }, [replay, puzzle, clamped]);

  if (!open || !replay) return null;

  const progress = total ? ((clamped + 1) / total) * 100 : 0;
  const givenMask = useMemo(() => puzzle.map((v) => v > 0), [puzzle]);

  return (
    <Overlay
      open
      onClose={onClose}
      wide
      title="🧠 这道题是怎么推出来的"
      sub={`把盘面从初始已知格开始重演了一遍，还原出 ${total} 个可讲解的步骤${replay.unresolved ? `，另有 ${replay.unresolved} 处需要更长的推理链` : ""}。`}
      footer={<Btn variant="secondary" size="lg" className="w-full" onClick={onClose}>回到结果</Btn>}
    >
      {/* 概览 */}
      <div className="mb-3 grid grid-cols-4 gap-2">
        <Mini k="用时" v={formatMs(ms)} />
        <Mini k="失误" v={`${errors}`} tone={errors ? "warn" : undefined} />
        <Mini k="提示" v={`${hints}`} tone={hints ? "warn" : undefined} />
        <Mini k="技巧" v={`${replay.techniques.length}`} unit="种" />
      </div>

      {/* 技巧种类 chips */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {replay.techniques.map((t) => (
          <span key={t} className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", toneClass(TECH_TONE[t]))}>
            {t}
          </span>
        ))}
        {!replay.techniques.length ? <span className="text-[11.5px] text-muted-foreground">这道题主要靠观察直接落子。</span> : null}
      </div>

      {total ? (
        <>
          {/* 进度条 */}
          <div className="mb-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress}%` }} />
            </div>
            <span className="tnum shrink-0 text-[11px] font-semibold text-muted-foreground">
              {clamped + 1} / {total}
            </span>
          </div>

          <div className="flex gap-3">
            {/* 迷你盘面 */}
            <div className="shrink-0">
              <MiniBoard size={size} board={revealed} givenMask={givenMask} step={cur} />
            </div>

            {/* 讲解卡 */}
            <div className="min-w-0 flex-1 rounded-2xl border-l-4 border-primary bg-secondary/60 p-3">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <span className={cn("rounded-md px-1.5 py-0.5 text-[10.5px] font-bold", toneSolid(TECH_TONE[cur!.technique]))}>{cur!.technique}</span>
                <span className="tnum text-[11px] text-muted-foreground">
                  第 {rowOf(size, cur!.index) + 1} 行 · 第 {colOf(size, cur!.index) + 1} 列
                </span>
              </div>
              <p className="text-[12.5px] leading-relaxed">
                这里填 <b className="font-num text-[15px] text-primary">{cur!.value}</b> 。{cur!.reason}
              </p>
              {cur!.peers.length ? (
                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">用到了盘面上 {cur!.peers.length} 个已确定的同数字格作为线索。</p>
              ) : null}
            </div>
          </div>

          {/* 步进控制 */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Btn variant="secondary" disabled={clamped === 0} onClick={() => setCursor(Math.max(0, clamped - 1))}>
              ← 上一步
            </Btn>
            <Btn variant="primary" disabled={clamped >= total - 1} onClick={() => setCursor(Math.min(total - 1, clamped + 1))}>
              下一步 →
            </Btn>
          </div>
          <div className="mt-2 flex gap-2">
            <Btn variant="quiet" size="sm" className="flex-1" onClick={() => setCursor(0)}>
              ⏮ 回到开头
            </Btn>
            <Btn variant="quiet" size="sm" className="flex-1" onClick={() => setCursor(total - 1)}>
              看到最后 ⏭
            </Btn>
          </div>
        </>
      ) : (
        <p className="rounded-2xl bg-secondary/60 px-3 py-4 text-center text-[12.5px] leading-relaxed text-muted-foreground">
          这道题的每一步都来自直接观察，没有可拆解的排除过程 —— 说明你对盘面的整体感已经不错了。
        </p>
      )}

      <p className="mt-3 text-[10.5px] leading-relaxed text-muted-foreground">
        回放是按标准逻辑顺序重演的，不一定和你当时的思路完全一致；如果某一步你用了别的办法，那也是对的。
      </p>
    </Overlay>
  );
}

/* ---------- 迷你盘面：随回放进度逐格点亮 ---------- */
function MiniBoard({
  size,
  board,
  givenMask,
  step,
}: {
  size: Size;
  board: Grid;
  givenMask: boolean[];
  step?: { index: number; value: number; peers: number[] };
}) {
  const n = size;
  const cells = n * n;
  return (
    <div className="rounded-xl border border-border bg-board p-1 shadow-soft" style={{ width: 132 }}>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }}>
        {Array.from({ length: cells }, (_, i) => {
          const isGiven = givenMask[i];
          const isCur = step?.index === i;
          const isPeer = !!step && step.peers.indexOf(i) >= 0;
          return (
            <div
              key={i}
              className={cn(
                "grid aspect-square place-items-center border-b border-r border-board-line font-num text-[11px] leading-none",
                i % n === n - 1 && "border-r-0",
                i >= cells - n && "border-b-0",
                isCur && "animate-flash-ok bg-hl-selected font-bold text-cell-given",
                isPeer && !isCur && "bg-hl-same text-cell-given",
                !isCur && !isPeer && (isGiven ? "text-cell-given" : "text-cell-user"),
              )}
            >
              {board[i] || ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function toneClass(tone?: "base" | "adv" | "ach") {
  if (tone === "adv") return "bg-badge-adv/12 text-badge-adv";
  if (tone === "ach") return "bg-badge-ach/15 text-badge-ach";
  return "bg-badge-base/12 text-badge-base";
}

function toneSolid(tone?: "base" | "adv" | "ach") {
  if (tone === "adv") return "bg-badge-adv text-primary-foreground";
  if (tone === "ach") return "bg-badge-ach text-primary-foreground";
  return "bg-badge-base text-primary-foreground";
}

function Mini({ k, v, unit, tone }: { k: string; v: string; unit?: string; tone?: "warn" }) {
  return (
    <div className="rounded-xl bg-secondary/70 py-2 text-center">
      <div className={cn("tnum text-[14px] font-bold leading-none", tone === "warn" ? "text-warning" : "text-foreground")}>
        {v}
        {unit ? <span className="ml-0.5 text-[9.5px] font-normal text-muted-foreground">{unit}</span> : null}
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">{k}</div>
    </div>
  );
}
