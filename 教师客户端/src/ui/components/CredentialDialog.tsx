// D15 §4.3：凭证对话框（mode="unlock" PIN+课堂口令 / mode="import" 从 U 盘选择凭证文件）
import { useState } from "react";
import { KeyRound, LockKeyhole, Usb, X } from "lucide-react";
import { toast } from "sonner";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "@/api";
import { friendlyErr } from "@/errutil";

interface Props {
  /** unlock = PIN + 课堂口令解锁；import = 从 U 盘选择 credential.enc（Oracle N-3 双模式） */
  mode?: "unlock" | "import";
  /** 导入成功回调（父级刷新状态；import 模式下父级可据此切换到 unlock 继续） */
  onImported?: () => void;
  /** 解锁成功回调（父级刷新状态） */
  onUnlocked?: () => void;
  onClose: () => void;
}

export function CredentialDialog({ mode = "unlock", onImported, onUnlocked, onClose }: Props) {
  const [pin, setPin] = useState("");
  const [classroomPass, setClassroomPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submitUnlock = async () => {
    setErr("");
    if (pin.length < 6) return setErr("PIN 至少 6 位");
    setBusy(true);
    try {
      const res = await api.credentialUnlock(pin, classroomPass);
      if (res.ok && res.key_available) {
        toast.success("凭证已解锁", { description: "加密内容包现在可以正常加载" });
        onUnlocked?.();
        onClose();
      } else {
        setErr("解锁未完成（密钥未就绪），请重试");
      }
    } catch (e) {
      const msg = friendlyErr(e);
      setErr(msg);
      // PIN/口令错误提示补充重新签发路径（D15 §4.3 N-2；同份文件重导会被 strict seq 拒绝）
      if (/PIN|口令|凭证/i.test(msg)) {
        setErr(`${msg}（PIN 遗忘或凭证失效需到办公室用 U 盘重新签发新凭证后重新导入）`);
      }
    } finally {
      setBusy(false);
    }
  };

  const submitImport = async () => {
    setErr("");
    const picked = await open({
      directory: false,
      multiple: false,
      filters: [{ name: "凭证文件", extensions: ["enc", "json"] }],
    });
    if (!picked) return; // 用户取消
    setBusy(true);
    try {
      const meta = await api.credentialImportFromUsb(picked as string);
      toast.success("凭证已导入", {
        description: `验签通过 · 机器指纹匹配 ${meta.machine_fp_ok ? "✓" : "✗"}`,
      });
      onImported?.();
      onClose();
    } catch (e) {
      setErr(friendlyErr(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={mode === "unlock" ? "解锁内容凭证" : "导入内容凭证"}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
            {mode === "unlock" ? <LockKeyhole size={18} aria-hidden /> : <Usb size={18} aria-hidden />}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-[15px] font-bold">
              {mode === "unlock" ? "解锁内容凭证" : "从 U 盘导入凭证"}
            </h3>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {mode === "unlock"
                ? "输入教师凭证 PIN 与课堂口令（签发时设定）"
                : "选择 U 盘中的 credential.enc 凭证文件"}
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
            onClick={onClose}
          >
            <X size={14} aria-hidden />
          </button>
        </div>

        <div className="mt-4 space-y-3.5">
          {mode === "unlock" ? (
            <>
              <div>
                <p className="mb-1.5 text-[12px] font-medium text-muted-foreground">PIN（≥6 位）</p>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  autoFocus
                  aria-label="PIN"
                  className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-[13px] outline-none focus:border-ring"
                />
              </div>
              <div>
                <p className="mb-1.5 text-[12px] font-medium text-muted-foreground">课堂口令</p>
                <input
                  type="password"
                  value={classroomPass}
                  onChange={(e) => setClassroomPass(e.target.value)}
                  aria-label="课堂口令"
                  className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-[13px] outline-none focus:border-ring"
                />
              </div>
            </>
          ) : (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-[12px] text-muted-foreground">
              凭证由学校/管理员签发，含机器指纹绑定。导入后仍需输入 PIN 与课堂口令解锁加密内容包。
            </p>
          )}

          {err && <p className="text-[12px] text-destructive">{err}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="min-h-9 rounded-md border border-input bg-card px-3.5 text-[13px] transition-colors hover:bg-accent"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={mode === "unlock" ? submitUnlock : submitImport}
            className="flex min-h-9 items-center gap-1 rounded-md bg-primary px-3.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <KeyRound size={13} aria-hidden />
            {busy ? "处理中…" : mode === "unlock" ? "解锁" : "选择凭证文件"}
          </button>
        </div>
      </div>
    </div>
  );
}
