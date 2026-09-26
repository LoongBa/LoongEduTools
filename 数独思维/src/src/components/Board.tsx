// 盘面渲染：五类高亮语义（选中/同伴/同数/正确/冲突）+ 笔记格 + 教学目标格引导环。
// 紧耦合的格子子组件内联在本文件，宫线用边框叠加实现（不依赖 flex gap / aspect-ratio）。

import { cn } from "@/lib/utils";
import { boxOf, colOf, rowOf, type Grid, type Size } from "@/lib/sudoku";

export interface BoardProps {
  size: Size;
  board: Grid;
  given: boolean[];
  selected: number | null;
  notes: Record<number, number[]>;
  /** 冲突格索引 */
  wrong?: number[];
  /** 刚填对的格（绿闪） */
  okCell?: number | null;
  /** 教学关：约束提示格（peer 引导） */
  peerGuide?: number[];
  /** 教学关：目标格 */
  target?: number | null;
  /** 回放标记 */
  replay?: boolean;
  onPick?: (i: number) => void;
  className?: string;
}

export function Board({
  size,
  board,
  given,
  selected,
  notes,
  wrong = [],
  okCell = null,
  peerGuide = [],
  target = null,
  replay = false,
  onPick,
  className,
}: BoardProps) {
  const n = size * size;
  const selVal = selected != null ? board[selected] : 0;
  const wrongSet = new Set(wrong);
  const peerSet = new Set(peerGuide.length ? peerGuide : selected != null ? peersLite(size, selected) : []);

  return (
    <div
      className={cn("mx-auto w-full max-w-[min(94vw,460px)] overflow-hidden rounded-2xl border border-border bg-board p-1.5 shadow-lift", className)}
      role="grid"
      aria-label={`${size}乘${size} 数独盘面`}
    >
      <div className="grid" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
        {Array.from({ length: n }, (_, i) => {
          const r = rowOf(size, i);
          const c = colOf(size, i);
          const b = boxOf(size, i);
          const boxW = size === 4 || size === 6 ? 2 : 3;
          const boxH = size === 9 ? 3 : size === 6 ? 3 : 2;
          const isTopEdge = r % boxH === 0;
          const isLeftEdge = c % boxW === 0;
          const val = board[i];
          const isGiven = given[i];
          const isSel = selected === i;
          const isSame = selVal > 0 && val === selVal && !isSel;
          const isWrong = wrongSet.has(i);
          const isPeer = peerSet.has(i) && !val;
          const isTarget = target === i;
          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              onClick={onPick ? () => onPick(i) : undefined}
              aria-label={`第${r + 1}行第${c + 1}列 ${val ? `数字${val}` : isGiven ? "空格已知" : "空格"}`}
              className={cn(
                "relative aspect-square w-full select-none transition-colors duration-150",
                // 细网格线
                "border-r border-b border-board-line/70",
                c === size - 1 && "border-r-0",
                r === size - 1 && "border-b-0",
                // 宫粗线
                isTopEdge && "border-t-2 border-t-board-box-line",
                isLeftEdge && "border-l-2 border-l-board-box-line",
                isPeer && "bg-hl-peer hl-shape-peer",
                isSame && "bg-hl-same hl-shape-same rounded-md",
                isSel && "bg-hl-selected hl-shape-selected",
                isWrong && "bg-hl-wrong hl-shape-wrong",
                !isSel && !isWrong && !isSame && !isPeer && "bg-transparent hover:bg-muted/60",
                onPick ? "press" : "cursor-default",
              )}
            >
              <span
                className={cn(
                  "absolute inset-0 grid place-items-center font-num leading-none",
                  size === 9 ? "text-[clamp(15px,4.2vw,24px)]" : "text-[clamp(20px,6.4vw,34px)]",
                  "font-semibold",
                  isGiven ? "text-cell-given" : "text-cell-user",
                  isTarget && "animate-star-pop",
                  replay && !isGiven && "italic opacity-80",
                )}
              >
                {val ? val : null}
              </span>
              {/* 笔记候选 */}
              {!val && notes[i] && notes[i].length > 0 ? (
                <span className="absolute inset-0 grid grid-cols-3 p-[6%]">
                  {Array.from({ length: size }, (_, k) => k + 1).map((v) => (
                    <span
                      key={v}
                      className={cn(
                        "grid place-items-center text-[min(2.6vw,9px)] leading-none tnum",
                        notes[i].indexOf(v) >= 0 ? "font-medium text-muted-foreground" : "text-transparent",
                      )}
                    >
                      {v}
                    </span>
                  ))}
                </span>
              ) : null}
              {okCell === i ? <span className="pointer-events-none absolute inset-0 animate-flash-ok rounded-md" /> : null}
              {isTarget ? (
                <span className="pointer-events-none absolute inset-[6%] animate-pulse-ring rounded-lg ring-2 ring-target-ring" />
              ) : null}
              {b < 0 ? null : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 轻量同伴集合（避免每次渲染重建大数组分配） */
function peersLite(size: Size, i: number): number[] {
  const total = size * size;
  const r = Math.floor(i / size);
  const c = i % size;
  const out: number[] = [];
  for (let j = 0; j < total; j++) {
    if (j === i) continue;
    if (Math.floor(j / size) === r || j % size === c || boxOf(size, j) === boxOf(size, i)) out.push(j);
  }
  return out;
}

/* ---------- 数字条 ---------- */
export function NumberPad({
  size,
  remaining,
  disabled,
  onFill,
}: {
  size: Size;
  remaining: Record<number, number>;
  disabled: boolean;
  onFill: (v: number) => void;
}) {
  const max = size;
  const nums = Array.from({ length: max }, (_, i) => i + 1);
  const rows = max <= 4 ? [nums] : max <= 6 ? [nums.slice(0, 3), nums.slice(3)] : [nums.slice(0, 5), nums.slice(5)];
  return (
    <div className="rounded-2xl border border-border bg-card/80 px-2 py-2 shadow-soft" role="group" aria-label="数字输入条">
      {rows.map((row, ri) => (
        <div key={ri} className="mb-1.5 flex justify-center last:mb-0">
          {row.map((v) => {
            const left = remaining[v] ?? 0;
            const done = left <= 0;
            return (
              <button
                key={v}
                type="button"
                disabled={disabled || done}
                onClick={() => onFill(v)}
                aria-label={`填入数字 ${v}，剩余 ${Math.max(0, left)} 个`}
                className={cn(
                  "press mx-[3px] h-[52px] min-w-[44px] flex-1 rounded-xl border text-[19px] font-bold tnum transition-colors",
                  done
                    ? "border-transparent bg-muted text-muted-foreground/40"
                    : "border-border bg-secondary text-primary hover:bg-accent",
                  disabled && !done && "opacity-45",
                )}
              >
                {v}
                <span className="mt-0.5 block text-[9px] font-normal leading-none text-muted-foreground">{Math.max(0, left)}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ---------- 工具条 ---------- */
export interface ToolState {
  eraser: boolean;
  note: boolean;
  undo: boolean;
  hint: boolean;
}

export function ToolBar({
  state,
  noteOn,
  onEraser,
  onNote,
  onUndo,
  onHint,
}: {
  state: ToolState;
  noteOn: boolean;
  onEraser: () => void;
  onNote: () => void;
  onUndo: () => void;
  onHint: () => void;
}) {
  const items = [
    { key: "eraser", label: "橡皮", icon: "🧽", active: state.eraser, fn: onEraser, disabled: false },
    { key: "note", label: "✏️笔记", icon: "✏️", active: noteOn, fn: onNote, disabled: !state.note },
    { key: "undo", label: "撤销", icon: "↩️", active: false, fn: onUndo, disabled: !state.undo },
    { key: "hint", label: "提示", icon: "💡", active: false, fn: onHint, disabled: !state.hint },
  ];
  return (
    <div className="flex rounded-2xl border border-border bg-card/80 p-1.5 shadow-soft" role="group" aria-label="练习工具">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          disabled={it.disabled}
          onClick={it.fn}
          aria-label={it.label}
          aria-pressed={it.key === "note" ? noteOn : undefined}
          className={cn(
            "press flex h-[52px] flex-1 flex-col items-center justify-center rounded-xl text-[10.5px] font-medium leading-none transition-colors",
            it.active ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-muted",
            it.disabled && "opacity-45",
          )}
        >
          <span className="mb-1 text-[17px]">{it.icon}</span>
          {it.label}
        </button>
      ))}
    </div>
  );
}
