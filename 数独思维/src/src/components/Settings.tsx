// 设置页：外观（深浅模式 + 主题方案）、音效开关、清除进度（两级确认）、关于。

import { useState } from "react";
import { cn } from "@/lib/utils";
import { SCHEMES, useTheme, type ModeId } from "@/lib/theme";
import { useStore } from "@/lib/store";
import { Card, Btn } from "./ui/kit";
import { Overlay } from "./Overlay";
import { APP_ICON_URL } from "./Shell";

export function Settings({ onBack }: { onBack: () => void }) {
  const { scheme, setScheme, mode, setMode, resolved } = useTheme();
  const { store, update, resetAll } = useStore();
  const [confirm, setConfirm] = useState(false);
  const soundOn = store.settings.sound;

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
      </Card>

      {/* 数据 */}
      <Card pad="normal" tone="flat" className="mb-3">
        <h2 className="mb-2 text-[13.5px] font-bold">💾 本机数据</h2>
        <ul className="space-y-1.5 px-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
          <li>· 全部记录保存在这台设备的浏览器里，没有账号、不上传。</li>
          <li>· 换设备或清除浏览器数据会丢失进度，请先用「分享成绩」留存。</li>
          <li>· 已记录练习 {store.history.length} 次 · 收藏 {store.favorites.length} 题 · 待巩固 {store.mistakes.length} 题。</li>
        </ul>
      </Card>

      <Btn variant="danger" size="lg" className="settings-danger mb-4 w-full" onClick={() => setConfirm(true)}>
        🗑️ 清除全部进度
      </Btn>

      <p className="settings-about px-1 text-center text-[10.5px] leading-relaxed text-muted-foreground">
        <img src={APP_ICON_URL} alt="" className="mx-auto mb-2 h-10 w-10 opacity-90" />
        数独思维 · 逻辑推理教学与训练
        <br />
        无竞技 · 无排行 · 不比较，只和孩子自己的上一次对照。
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
    </div>
  );
}
