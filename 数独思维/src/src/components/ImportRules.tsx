// 导入题目：粘贴 SD 文本与 SD{N}: 编码（N=4/6/9，逗号或空白分隔均可）→ 校验最少给定格与唯一解 → 进入练习。
// 规则教学浮层：4×4 演示盘分步讲解。

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Overlay, Btn } from "./Overlay";
import { parseImportedText, type Size } from "@/lib/sudoku";
import { importMsg, CLIPBOARD_TIP_NO_SD, CLIPBOARD_TIP_DENIED } from "@/lib/copy";
import { RULE_STEPS } from "@/lib/content";

export function ImportOverlay({ onClose, onStart }: { onClose: () => void; onStart: (board: number[], size: Size, solution: number[]) => void }) {
  const [text, setText] = useState("");
  const [tip, setTip] = useState("");
  const parsed = useMemo(() => parseImportedText(text), [text]);

  const canStart = !!parsed.board;

  /** 显式「从剪贴板粘贴」：用户手势触发，权限弹窗在预期内；读失败静默降级提示手动粘贴 */
  async function pasteClipboard() {
    setTip("");
    try {
      const clip = await navigator.clipboard.readText();
      if (clip && /SD(4|6|9)\s*:/.test(clip)) {
        setText(clip);
        return;
      }
      setTip(CLIPBOARD_TIP_NO_SD);
    } catch {
      setTip(CLIPBOARD_TIP_DENIED);
    }
  }

  return (
    <Overlay
      open
      onClose={onClose}
      wide
      title="📥 导入题目"
      sub="把题目编码粘进来即可开始练习。一行 9 个数字，空格用 . 或 0 表示，可以不分段连写。"
      footer={
        <>
          <Btn variant="primary" size="lg" className="w-full" disabled={!canStart} onClick={() => canStart && onStart(parsed.board!, parsed.size!, parsed.solution!)}>
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
        {text ? (
          <p className={cn("rounded-xl px-3 py-2 text-[12px] leading-relaxed", canStart ? "bg-success/12 text-success" : "bg-destructive/10 text-destructive")}>
            {importMsg(parsed)}
          </p>
        ) : (
          <div className="space-y-1.5">
            <Btn variant="secondary" size="sm" className="w-full" onClick={pasteClipboard}>
              📋 从剪贴板粘贴
            </Btn>
            {tip ? <p className="rounded-xl bg-secondary/60 px-3 py-2 text-[11.5px] leading-relaxed text-muted-foreground">{tip}</p> : null}
            <p className="text-[11.5px] text-muted-foreground">支持从结果页「分享这道题」复制回来的“导入编码”行，也支持直接粘贴{"SD{N}: 编码"}。</p>
          </div>
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
