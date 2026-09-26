// 导入题目：粘贴 SD 文本与 SD{N}: 编码（N=4/6/9，逗号或空白分隔均可）→ 校验最少给定格与唯一解 → 进入练习。
// 规则教学浮层：4×4 演示盘分步讲解。

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Overlay, Btn } from "./Overlay";
import { fromSDString, validateImported, type Size } from "@/lib/sudoku";
import { RULE_STEPS } from "@/lib/content";

export function ImportOverlay({ onClose, onStart }: { onClose: () => void; onStart: (board: number[], size: Size) => void }) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => {
    // ① SD{N}: 前缀格式（分享题编码）：SD4:/SD6:/SD9: 后可接逗号或空白分隔的 N×N 个数字
    const sd = /SD(4|6|9)\s*:\s*([0-9.,\s]+)/.exec(text);
    if (sd) {
      const size = Number(sd[1]) as Size;
      const clean = sd[2].replace(/[^0-9.]/g, "");
      const need = size * size;
      if (!clean.length) return { size, board: null, message: "SD 编码里的数字为空，请检查复制内容。" };
      if (clean.length !== need) {
        return { size, board: null, message: `SD${size} 编码需要 ${need} 个数字，当前是 ${clean.length} 个。` };
      }
      const board = fromSDString(clean, size);
      if (!board) return { size, board: null, message: "有无法识别的字符，只允许数字、. 和空格。" };
      const v = validateImported(board, size);
      return { size, board: v.ok ? board : null, message: v.message };
    }
    // ② 无前缀：纯数字按长度判规格
    const clean = text.replace(/[^0-9.\s]/g, "").replace(/\s+/g, "");
    if (!clean.length) return { size: null as Size | null, board: null as number[] | null, message: "" };
    const size: Size | null = clean.length === 16 ? 4 : clean.length === 36 ? 6 : clean.length === 81 ? 9 : null;
    if (!size) {
      return { size: null, board: null, message: `目前是 ${clean.length} 个字符，需要 16（4×4）、36（6×6）或 81（9×9）个。` };
    }
    const board = fromSDString(clean, size);
    if (!board) return { size, board: null, message: "有无法识别的字符，只允许数字、. 和空格。" };
    const v = validateImported(board, size);
    return { size, board: v.ok ? board : null, message: v.message };
  }, [text]);

  const canStart = !!parsed.board;

  return (
    <Overlay
      open
      onClose={onClose}
      wide
      title="📥 导入题目"
      sub="把题目编码粘进来即可开始练习。一行 9 个数字，空格用 . 或 0 表示，可以不分段连写。"
      footer={
        <>
          <Btn variant="primary" size="lg" className="w-full" disabled={!canStart} onClick={() => canStart && onStart(parsed.board!, parsed.size!)}>
            开始练习这道题
          </Btn>
          <Btn variant="ghost" className="w-full" onClick={onClose}>
            取消
          </Btn>
        </>
      }
    >
      <div className="space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder={"例如（9×9）\n53..7....\n6..195...\n.98....6."}
          aria-label="题目编码输入"
          spellCheck={false}
          className="import-zone w-full resize-none rounded-xl border border-border bg-secondary/50 p-3 font-num text-[14px] leading-relaxed tracking-wider text-foreground outline-none focus:border-primary"
        />
        {parsed.message ? (
          <p className={cn("rounded-xl px-3 py-2 text-[12px] leading-relaxed", canStart ? "bg-success/12 text-success" : "bg-destructive/10 text-destructive")}>
            {parsed.message || "校验通过，可以直接开始。"}
          </p>
        ) : text ? (
          <p className="text-[11.5px] text-muted-foreground">正在识别…</p>
        ) : (
          <p className="text-[11.5px] text-muted-foreground">支持从结果页「分享这道题」复制回来的题目编码，也支持从分享题复制的{"SD{N}: 编码"}。</p>
        )}
      </div>
    </Overlay>
  );
}

/* ==================== 规则教学 ==================== */
export function RulesTeach({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const s = RULE_STEPS[step];
  const last = step === RULE_STEPS.length - 1;

  return (
    <Overlay
      open
      onClose={onClose}
      wide
      title={`📖 规则教学 · ${s.title}`}
      sub={`第 ${step + 1} 步 / 共 ${RULE_STEPS.length} 步`}
      footer={
        <>
          <div className="grid grid-cols-2 gap-2">
            <Btn variant="secondary" disabled={step === 0} onClick={() => setStep((v) => Math.max(0, v - 1))}>
              上一步
            </Btn>
            <Btn variant="primary" onClick={() => (last ? onClose() : setStep((v) => v + 1))}>
              {last ? "开始练习" : "下一步"}
            </Btn>
          </div>
          {!last ? (
            <Btn variant="quiet" size="sm" className="w-full" onClick={onClose}>
              跳过讲解
            </Btn>
          ) : null}
        </>
      }
    >
      <div className="space-y-3">
        {/* 步骤点 */}
        <div className="flex items-center gap-1.5">
          {RULE_STEPS.map((_, i) => (
            <span
              key={i}
              className={cn("h-1.5 flex-1 rounded-full transition-colors", i < step ? "bg-primary/45" : i === step ? "bg-primary" : "bg-muted")}
            />
          ))}
        </div>

        {/* 4×4 演示盘 */}
        <div className="mx-auto w-full max-w-[220px] rounded-2xl border border-border bg-board p-1.5 shadow-soft">
          <div className="grid grid-cols-4">
            {s.board.map((v, i) => {
              const hl = s.highlight.indexOf(i) >= 0;
              return (
                <div
                  key={i}
                  className={cn(
                    "relative grid aspect-square place-items-center border-board-line font-num text-[22px] font-semibold",
                    "border-b border-r last:border-r-0",
                    i % 4 === 3 && "border-r-0",
                    i > 11 && "border-b-0",
                    i % 4 === 2 && i < 16 && "border-r-2 border-r-board-box-line",
                    i >= 8 && "border-t-2 border-t-board-box-line",
                    i % 4 === 0 && "border-l-2 border-l-board-box-line",
                    hl ? "bg-hl-selected text-cell-given" : "text-cell-given",
                  )}
                >
                  {v ? v : <span className="text-[18px] text-muted-foreground/45">?</span>}
                </div>
              );
            })}
          </div>
        </div>

        <p className="rounded-2xl border-l-4 border-primary bg-secondary/60 px-3.5 py-3 text-[13px] leading-relaxed">{s.text}</p>
      </div>
    </Overlay>
  );
}
