// 设置页：外观（深浅模式 + 主题方案）、音效开关、数据备份/恢复、清除进度（两级确认）、关于。

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SCHEMES, useTheme, type ModeId } from "@/lib/theme";
import { useStore } from "@/lib/store";
import { APP_VERSION } from "@/lib/version";
import { PRIVACY_BADGE, BACKUP_DONE, BACKUP_IOS_HINT, BACKUP_LAST, BACKUP_LAST_NEVER, BACKUP_NEVER_TIP, BACKUP_DUE_TIP, ERROR_MODE_FREE, ERROR_MODE_STRICT, ERROR_MODE_FREE_DESC, ERROR_MODE_STRICT_DESC, RESTORE_TITLE, RESTORE_SUB, RESTORE_WARN, RESTORE_CONFIRM, RESTORE_CANCEL } from "@/lib/copy";
import { buildBackup, validateBackup, downloadBackup, importBackup, saveBackupAt, readBackupAt, clearBackupAt, type BackupFile } from "@/lib/backup";
import { Card, Btn, Toast } from "./ui/kit";
import { Overlay } from "./Overlay";
import { APP_ICON_URL } from "./Shell";

/** 恢复完成反馈的 sessionStorage 旗标（reload 后 Settings 挂载读取） */
const RESTORED_FLAG = "redtools.shudu.restored";

export function Settings({ onBack }: { onBack: () => void }) {
  const { scheme, setScheme, mode, setMode, resolved } = useTheme();
  const { store, update, resetAll } = useStore();
  const [confirm, setConfirm] = useState(false); // 清除进度确认
  const [restorePending, setRestorePending] = useState<BackupFile | null>(null); // 恢复确认
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false); // 备份/恢复操作防双击
  const [lastBackup, setLastBackup] = useState<number | null>(() => readBackupAt()); // V1.9.1 B9：上次备份时间戳
  const fileRef = useRef<HTMLInputElement | null>(null);
  const soundOn = store.settings.sound;
  const errorMode = store.settings.errorMode; // V1.11.0：练习容错模式

  // V1.9.1 B9：备份提醒状态（天数；从未备份且已有数据 / 超期才提示，零打扰）
  const backupDays = lastBackup === null ? null : Math.max(0, Math.floor((Date.now() - lastBackup) / 86400000));
  const hasData = store.history.length + store.mistakes.length + store.favorites.length > 0;
  const backupDue = lastBackup === null ? hasData : (backupDays ?? 0) >= 14;

  // 恢复完成反馈（V1.2.0）：reload 后读取 sessionStorage 旗标显示摘要
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(RESTORED_FLAG);
      if (!raw) return;
      window.sessionStorage.removeItem(RESTORED_FLAG);
      const stats = JSON.parse(raw) as { history: number; mistakes: number; favorites: number; achievements: number; checkinDays: number };
      setToast(`已恢复：${stats.history} 次练习 · ${stats.mistakes} 题待巩固 · ${stats.checkinDays} 天打卡`);
    } catch { /* 旗标损坏忽略 */ }
  }, []);

  function showToast(t: string) {
    setToast(t);
    window.setTimeout(() => setToast(""), 2200);
  }

  function onBackup() {
    if (busy) return;
    setBusy(true);
    // 每次成功都附 iOS 兜底提示：downloadBackup 内 a.click 在 iOS Safari 静默忽略 download 属性【不抛异常】，
    // 若只在 catch 提示则 iOS 用户永远看不到兜底（审核发现 A2）
    downloadBackup(buildBackup(store, APP_VERSION));
    showToast(`${BACKUP_DONE}${BACKUP_IOS_HINT}`);
    saveBackupAt(Date.now()); // V1.9.1 B9：记录本次备份时间，提醒清零
    setLastBackup(Date.now());
    window.setTimeout(() => setBusy(false), 800);
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允许重复选同一文件
    if (!file) return;
    if (busy) return;
    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      setBusy(false);
      try {
        const raw: unknown = JSON.parse(String(reader.result));
        const v = validateBackup(raw);
        if (v.ok) setRestorePending(v.file);
        else showToast(v.reason);
      } catch {
        showToast("无法读取这个文件，请选择「数独思维」导出的备份文件。");
      }
    };
    reader.onerror = () => {
      setBusy(false);
      showToast("文件读取失败，请重试。");
    };
    reader.readAsText(file);
  }

  function onRestore() {
    if (!restorePending) return;
    const r = importBackup(restorePending);
    if (!r.ok) {
      showToast(r.reason || "恢复失败，请重试。");
      setRestorePending(null);
      return;
    }
    // 成功：写旗标供 reload 后展示 → 重载全量重建
    // V1.9.1 B9：恢复后「上次备份」= 备份文件创建时刻（恢复的数据即该快照，诚实一致）
    saveBackupAt(new Date(restorePending.createdAt).getTime());
    try {
      window.sessionStorage.setItem(RESTORED_FLAG, JSON.stringify(restorePending.stats));
    } catch { /* 旗标写失败仅丢失反馈，不影响恢复 */ }
    setRestorePending(null);
    window.location.reload();
  }

  return (
    <div className="pb-4">
      <h1 className="reveal mb-1 px-1 text-[21px] font-extrabold leading-tight tracking-tight">⚙️ 设置</h1>
      <p className="mb-3 px-1 text-[11.5px] leading-relaxed text-muted-foreground">外观选择只影响这台设备，不会同步到任何地方。</p>

      {/* 外观 */}
      <Card pad="normal" className="mb-3">
        <h2 className="mb-3 text-[13.5px] font-bold">🎨 外观</h2>

        <div className="settings-row mb-4">
          <div className="settings-col">
            <p className="settings-label text-[13px] font-semibold">深浅模式</p>
            <p className="settings-sub mt-0.5 text-[11px] leading-snug text-muted-foreground">
              当前生效：{resolved === "dark" ? "深色" : "浅色"}
              {mode === "system" ? "（跟随系统）" : "（已手动锁定）"}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(["system", "light", "dark"] as ModeId[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cn(
                "press rounded-xl border px-2 py-2.5 text-[12.5px] font-semibold",
                mode === m ? "border-primary bg-primary text-primary-foreground shadow-soft" : "border-border bg-secondary text-secondary-foreground",
              )}
            >
              {m === "system" ? "🌗 跟随系统" : m === "light" ? "☀️ 浅色" : "🌙 深色"}
            </button>
          ))}
        </div>

        <div className="my-4 h-px bg-border" />

        <p className="text-[13px] font-semibold">主题方案</p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">每套都含浅色与深色两版，色块为两版预览。</p>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {SCHEMES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setScheme(s.id)}
              aria-pressed={scheme === s.id}
              className={cn(
                "press overflow-hidden rounded-2xl border-2 p-0 text-left transition-colors",
                scheme === s.id ? "border-primary bg-primary/6" : "border-border bg-card",
              )}
            >
              <span className="flex h-12 w-full">
                {[s.light, s.dark].map((p, i) => (
                  <span key={i} className="relative flex-1" style={{ background: p.bg }}>
                    <span className="absolute left-1.5 top-1.5 h-4 w-4 rounded-full" style={{ background: p.primary }} />
                    <span className="absolute bottom-1.5 right-1.5 h-2.5 w-2.5 rounded-full" style={{ background: p.accent }} />
                    <span className="absolute left-1.5 bottom-1.5 block h-2.5 w-8 rounded-sm opacity-45" style={{ background: p.primary }} />
                  </span>
                ))}
              </span>
              <span className="block px-2.5 py-2">
                <span className="flex items-center gap-1 text-[12.5px] font-bold leading-tight">
                  {s.name}
                  {scheme === s.id ? <span className="text-primary">✓</span> : null}
                </span>
                <span className="mt-0.5 block truncate text-[10.5px] text-muted-foreground">{s.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </Card>

      {/* 练习偏好 */}
      <Card pad="normal" className="mb-3">
        <h2 className="mb-1 text-[13.5px] font-bold">🔊 练习偏好</h2>
        <div className="settings-row flex items-center justify-between py-2">
          <div className="settings-col min-w-0 pr-3">
            <p className="settings-label text-[13px] font-semibold">操作音效</p>
            <p className="settings-sub mt-0.5 text-[11px] leading-snug text-muted-foreground">填数、完成时的轻提示音，不影响任何记录。</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={soundOn}
            aria-label={`操作音效 ${soundOn ? "开" : "关"}`}
            onClick={() =>
              update((d) => {
                d.settings.sound = !d.settings.sound;
              })
            }
            className={cn(
              "press relative h-8 w-[52px] shrink-0 rounded-full border transition-colors",
              soundOn ? "settings-toggle on border-transparent bg-success" : "settings-toggle off border-border bg-muted",
            )}
          >
            <span
              className={cn(
                "absolute top-[3px] grid h-[25px] w-[25px] place-items-center rounded-full bg-card text-[9px] font-bold shadow-soft transition-all duration-200",
                soundOn ? "left-[25px] text-success" : "left-[3px] text-muted-foreground",
              )}
            >
              {soundOn ? "开" : "关"}
            </span>
          </button>
        </div>

        {/* V1.11.0：练习容错模式（free=自由试错现状 / strict3=三次引导；家长按孩子特质选择，两者都不影响任何记录） */}
        <div className="settings-row py-2">
          <div className="settings-col min-w-0 pr-3">
            <p className="settings-label text-[13px] font-semibold">练习容错模式</p>
            <p className="settings-sub mt-0.5 text-[11px] leading-snug text-muted-foreground">填错后的引导方式，不改变星星与成绩记录。</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { id: "free", name: ERROR_MODE_FREE, desc: ERROR_MODE_FREE_DESC },
              { id: "strict3", name: ERROR_MODE_STRICT, desc: ERROR_MODE_STRICT_DESC },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() =>
                update((d) => {
                  d.settings.errorMode = m.id;
                })
              }
              aria-pressed={errorMode === m.id}
              className={cn(
                "press rounded-xl border px-2.5 py-2 text-left",
                errorMode === m.id ? "border-primary bg-primary/6" : "border-border bg-secondary",
              )}
            >
              <span className="block text-[12.5px] font-bold">{m.name}</span>
              <span className="mt-0.5 block text-[10.5px] leading-snug text-muted-foreground">{m.desc}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* 数据 */}
      <Card pad="normal" tone="flat" className="mb-3">
        <h2 className="mb-2 text-[13.5px] font-bold">💾 本机数据</h2>
        <ul className="space-y-1.5 px-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
          <li>· 全部记录保存在这台设备的浏览器里，无账号、无云同步，数据只存本机。</li>
          <li>· 换设备或清除浏览器数据会丢失进度，可先「备份到文件」留存。</li>
          <li>· 已记录练习 {store.history.length} 次 · 收藏 {store.favorites.length} 题 · 待巩固 {store.mistakes.length} 题。</li>
          {/* V1.9.1 B9：上次备份状态行（常驻） */}
          <li>· {lastBackup === null ? BACKUP_LAST_NEVER : BACKUP_LAST(backupDays ?? 0)}。</li>
        </ul>
        {/* V1.9.1 B9：超期 / 未备份建议行（零打扰：仅设置页内联，不弹窗不推首页） */}
        {backupDue ? (
          <p className="mt-2 rounded-lg bg-warning/10 px-2.5 py-2 text-[11px] font-semibold leading-snug text-warning">
            {lastBackup === null ? BACKUP_NEVER_TIP : BACKUP_DUE_TIP(backupDays ?? 0)}
          </p>
        ) : null}
        {/* 备份/恢复（V1.2.0） */}
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <Btn variant="secondary" size="sm" className="w-full" disabled={busy} onClick={onBackup}>
            📤 备份到文件
          </Btn>
          <Btn variant="secondary" size="sm" className="w-full" disabled={busy} onClick={() => fileRef.current?.click()}>
            📥 从文件恢复
          </Btn>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            aria-label="选择备份文件"
            className="hidden"
            onChange={onPickFile}
          />
        </div>
      </Card>

      <Btn variant="danger" size="lg" className="settings-danger mb-4 w-full" onClick={() => setConfirm(true)}>
        🗑️ 清除全部进度
      </Btn>

      <p className="settings-about px-1 text-center text-[10.5px] leading-relaxed text-muted-foreground">
        <img src={APP_ICON_URL} alt="" className="mx-auto mb-2 h-10 w-10 opacity-90" />
        数独思维 · 逻辑推理教学与训练
        <br />
        版本 V{APP_VERSION}
        <br />
        无竞技 · 无排行 · 不比较，只和孩子自己的上一次对照。
        <br />
        {PRIVACY_BADGE}
      </p>

      <div className="mt-4">
        <Btn variant="ghost" className="w-full" onClick={onBack}>
          ← 返回难度
        </Btn>
      </div>

      <Overlay
        open={confirm}
        title="确认清除全部进度？"
        sub="技巧徽章、成就、打卡记录、错题本、收藏本与最佳成绩都会一起删除，且无法恢复。"
        footer={
          <>
            <Btn
              variant="danger"
              size="lg"
              className="w-full"
              onClick={() => {
                resetAll();
                clearBackupAt(); // V1.9.1 B9：数据已清，备份提醒状态一并清除
                setConfirm(false);
                window.location.reload();
              }}
            >
              我已确认，清除
            </Btn>
            <Btn variant="ghost" className="w-full" onClick={() => setConfirm(false)}>
              再想想
            </Btn>
          </>
        }
      >
        <div className="rounded-xl bg-destructive/10 px-3 py-3 text-[12px] leading-relaxed text-destructive">
          这一步不可撤销。如果只是想重新开始某一道题，可以在练习页点「重新开始」。
        </div>
      </Overlay>

      {/* 恢复确认（V1.2.0）：显示备份摘要 + 覆盖警示 → 确认后写入并重载 */}
      <Overlay
        open={!!restorePending}
        title={RESTORE_TITLE}
        sub={restorePending ? RESTORE_SUB(restorePending.stats) : ""}
        footer={
          <>
            <Btn variant="danger" size="lg" className="w-full" disabled={busy} onClick={onRestore}>
              {RESTORE_CONFIRM}
            </Btn>
            <Btn variant="ghost" className="w-full" onClick={() => setRestorePending(null)}>
              {RESTORE_CANCEL}
            </Btn>
          </>
        }
      >
        <div className="rounded-xl bg-destructive/10 px-3 py-3 text-[12px] leading-relaxed text-destructive">{RESTORE_WARN}</div>
      </Overlay>

      {toast ? <Toast text={toast} /> : null}
    </div>
  );
}
