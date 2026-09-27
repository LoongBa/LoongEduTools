// 关闭确认对话框（需求3：点关闭时询问 退出/最小化到托盘 + 「记住，不再询问」复选）
// 默认行为 ask 时由 Shell 的 onCloseRequested 拉起；记住的选择经 close_behavior_set 持久化，
// 设置页「关闭行为」可随时改回 ask 重新弹框。
import { useEffect, useState } from "react";
import { LogOut, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface CloseConfirmDialogProps {
  open: boolean;
  /** 退出：remember=true 行=用户勾了「记住」（Shell 负责先持久化再 appQuit） */
  onExit: (remember: boolean) => void;
  /** 最小化到托盘：remember 同上 */
  onMinimize: (remember: boolean) => void;
  /** 取消（点遮罩/X/取消按钮）：仅收起，不改任何状态 */
  onCancel: () => void;
}

export function CloseConfirmDialog({ open, onExit, onMinimize, onCancel }: CloseConfirmDialogProps) {
  const [remember, setRemember] = useState(false);

  // 每次拉起复位「记住」（与主流桌面应用一致：单次决策不残留）
  useEffect(() => {
    if (open) setRemember(false);
  }, [open]);

  // ESC = 取消（与遮罩点击一致）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4" role="dialog" aria-modal="true" aria-label="关闭桃李助手">
      <div className="absolute inset-0 bg-black/45" onClick={onCancel} aria-hidden />
      <div className="relative w-full max-w-sm rounded-xl border border-border bg-popover p-4 shadow-xl">
        <p className="font-display text-[15px] font-bold text-popover-foreground">关闭桃李助手？</p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          可选择完全退出，或最小化到任务栏托盘图标（后台驻留，点击图标可随时恢复窗口）。
        </p>

        <div className="mt-3 space-y-2">
          <button
            type="button"
            className="flex min-h-10 w-full items-center gap-2.5 rounded-lg border border-border px-3 text-left text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
            onClick={() => onExit(remember)}
          >
            <LogOut size={14} aria-hidden className="shrink-0 opacity-80" />
            退出（完全关闭）
          </button>
          <button
            type="button"
            className="flex min-h-10 w-full items-center gap-2.5 rounded-lg border border-border px-3 text-left text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
            onClick={() => onMinimize(remember)}
          >
            <Minus size={14} aria-hidden className="shrink-0 opacity-80" />
            最小化到托盘
          </button>
        </div>

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground select-none">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="size-3.5 accent-brand"
          />
          记住我的选择，不再询问
        </label>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            className={cn(
              "min-h-8 rounded-md px-3 text-[12.5px] text-muted-foreground transition-colors",
              "hover:bg-accent hover:text-foreground",
            )}
            onClick={onCancel}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
