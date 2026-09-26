// 一键启动配置弹窗：双通道钉选（侧栏一键启动 ≤6 / 启动中心快捷方式）/ 菜单名（≤4字）/ 图标 / 配色
import { useState } from "react";
import { Check, ImageIcon, LayoutGrid, Rocket, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LaunchIconBlock, clampMenuLabel, defaultBg, defaultText } from "@/lib/launch-icon";
import type { LaunchConfig, Notification } from "@/lib/types";

interface Props {
  itemId: string;
  /** 条目原名（默认菜单名/默认图标文字来源） */
  name: string;
  config?: LaunchConfig;
  /** 已钉选到侧栏的条目数（不含本条），用于上限提示与拦截 */
  menuPinnedCount?: number;
  /** 通知中心：钉选被上限拦截时写入 warn 事件 */
  notify?: (n: Omit<Notification, "id" | "at" | "read">) => void;
  onCancel: () => void;
  onSave: (next: LaunchConfig) => void;
}

const SWATCHES = [
  "", // 自动
  "oklch(0.55 0.17 145)", // 松绿
  "oklch(0.55 0.19 265)", // 靛蓝
  "oklch(0.58 0.19 15)", // 玫红
  "oklch(0.62 0.16 60)", // 杏橙
  "oklch(0.5 0.02 260)", // 墨灰
];

export const SIDEBAR_MENU_MAX = 6;

/** 读取双通道钉选态（兼容旧 showInSidebar → pinnedMenu） */
export function isPinnedMenu(cfg?: LaunchConfig): boolean {
  return Boolean(cfg?.pinnedMenu ?? cfg?.showInSidebar);
}

export function LaunchConfigDialog({ itemId, name, config, menuPinnedCount = 0, notify, onCancel, onSave }: Props) {
  const [label, setLabel] = useState(config?.menuLabel ?? clampMenuLabel(name));
  const [kind, setKind] = useState<"text" | "image">(config?.iconKind ?? "text");
  const [iconText, setIconText] = useState(config?.iconText ?? "");
  const [iconImage, setIconImage] = useState(config?.iconImage ?? "");
  const [bg, setBg] = useState(config?.bgColor ?? "");
  const [pinnedMenu, setPinnedMenu] = useState(isPinnedMenu(config));
  const [pinnedQuick, setPinnedQuick] = useState(config?.pinnedQuick ?? false);
  const [err, setErr] = useState("");

  // 本条未钉选侧栏且其他条目已满 → 拦截新钉选
  const menuFull = !pinnedMenu && menuPinnedCount >= SIDEBAR_MENU_MAX;

  const previewCfg: LaunchConfig = { menuLabel: label, iconKind: kind, iconText, iconImage, bgColor: bg };

  const submit = () => {
    const l = clampMenuLabel(label.trim());
    if (!l) return setErr("请填写菜单项名");
    if (kind === "image" && !/^https?:\/\//i.test(iconImage.trim())) {
      return setErr("图片地址需以 http(s):// 开头");
    }
    if (menuFull && pinnedMenu) {
      const msg = `侧栏「一键启动」最多 ${SIDEBAR_MENU_MAX} 个，请先到启动中心取消部分钉选`;
      notify?.({ kind: "warn", title: "钉选已达上限", body: `「${clampMenuLabel(name)}」无法钉到侧栏：${msg}` });
      return setErr(msg);
    }
    const wasMenu = isPinnedMenu(config);
    onSave({
      menuLabel: l,
      iconKind: kind,
      iconText: kind === "text" ? iconText.trim().slice(0, 2) : undefined,
      iconImage: kind === "image" ? iconImage.trim() : undefined,
      bgColor: bg || undefined,
      fgColor: config?.fgColor,
      showInSidebar: pinnedMenu || undefined,
      pinnedMenu,
      pinnedQuick,
      // 新钉入侧栏时记录时间戳（组内排序依据）
      pinnedAt: pinnedMenu && !wasMenu ? Date.now() : config?.pinnedAt,
      sidebarGroup: config?.sidebarGroup,
    });
    const where = [pinnedMenu && "侧栏一键启动", pinnedQuick && "启动中心快捷方式"].filter(Boolean).join(" · ");
    toast.success(where ? `已保存，「${l}」将出现在${where}` : `已保存「${l}」的配置`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-label={`配置 ${name}`}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <LaunchIconBlock itemId={itemId} name={name} cfg={previewCfg} size={40} rounded="rounded-xl" />
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-[15px] font-bold">配置启动项</h3>
            <p className="mt-0.5 truncate text-[12px] text-muted-foreground" title={name}>{name}</p>
          </div>
          <button type="button" aria-label="关闭" className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent" onClick={onCancel}>
            <X size={14} aria-hidden />
          </button>
        </div>

        <div className="mt-4 space-y-3.5">
          <Field label="菜单项名（最多 4 字）">
            <input
              value={label}
              maxLength={4}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={clampMenuLabel(name)}
              className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-[13px] outline-none focus:border-ring"
            />
          </Field>

          <Field label="图标">
            <div className="flex items-center gap-1.5">
              <Toggle active={kind === "text"} onClick={() => setKind("text")}>文字</Toggle>
              <Toggle active={kind === "image"} onClick={() => setKind("image")}>图片</Toggle>
              {kind === "text" ? (
                <input
                  value={iconText}
                  maxLength={2}
                  onChange={(e) => setIconText(e.target.value)}
                  placeholder={`默认「${defaultText(name)}」`}
                  aria-label="图标文字"
                  className="ml-auto h-9 w-32 rounded-md border border-input bg-background px-2.5 text-[13px] outline-none focus:border-ring"
                />
              ) : (
                <input
                  value={iconImage}
                  onChange={(e) => setIconImage(e.target.value)}
                  placeholder="图片 URL（https://…）"
                  aria-label="图片地址"
                  className="ml-auto h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 text-[13px] outline-none focus:border-ring"
                />
              )}
            </div>
          </Field>

          <Field label="背景色（默认自动取色）">
            <div className="flex flex-wrap items-center gap-1.5">
              {SWATCHES.map((c, i) => (
                <button
                  key={c || "auto"}
                  type="button"
                  aria-label={i === 0 ? "自动配色" : `使用配色 ${i}`}
                  title={i === 0 ? "按名称自动散列取色" : undefined}
                  className={cn(
                    "relative flex size-7 items-center justify-center rounded-md border transition-colors",
                    bg === c ? "border-ring ring-2 ring-ring/30" : "border-border hover:border-muted-foreground",
                  )}
                  style={c ? { backgroundColor: c } : undefined}
                  onClick={() => setBg(c)}
                >
                  {i === 0 && !c && <ImageIcon size={13} aria-hidden className="text-muted-foreground" />}
                  {bg === c && c && <Check size={13} aria-hidden className="text-on-primary" />}
                </button>
              ))}
              <span className="text-[11px] text-muted-foreground">当前：{bg || `自动 ${defaultBg(itemId).slice(0, 18)}…`}</span>
            </div>
          </Field>

          <Field label={`钉选位置（侧栏限 ${SIDEBAR_MENU_MAX} 个，两通道互不影响）`}>
            <div className="space-y-1.5">
              <button
                type="button"
                aria-pressed={pinnedMenu}
                onClick={() => setPinnedMenu((v) => !v)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-[13px] transition-colors",
                  pinnedMenu
                    ? "border-brand bg-brand-soft font-medium text-brand"
                    : menuFull
                      ? "border-border bg-muted/40 text-muted-foreground/60"
                      : "border-border bg-muted/40 text-muted-foreground hover:bg-accent",
                )}
              >
                <Rocket size={14} aria-hidden />
                钉到侧栏「一键启动」菜单
                <span className="ml-auto text-[11px]">
                  {pinnedMenu ? "点击取消" : menuFull ? `已满 ${menuPinnedCount}/${SIDEBAR_MENU_MAX}` : `${menuPinnedCount}/${SIDEBAR_MENU_MAX}`}
                </span>
              </button>
              <button
                type="button"
                aria-pressed={pinnedQuick}
                onClick={() => setPinnedQuick((v) => !v)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-[13px] transition-colors",
                  pinnedQuick
                    ? "border-brand bg-brand-soft font-medium text-brand"
                    : "border-border bg-muted/40 text-muted-foreground hover:bg-accent",
                )}
              >
                <LayoutGrid size={14} aria-hidden />
                加入启动中心「快捷方式」区
                <span className="ml-auto text-[11px]">{pinnedQuick ? "点击取消" : "不限数量"}</span>
              </button>
            </div>
          </Field>

          {err && <p className="text-[12px] text-destructive">{err}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="min-h-9 rounded-md border border-input bg-card px-3.5 text-[13px] transition-colors hover:bg-accent" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="flex min-h-9 items-center gap-1 rounded-md bg-primary px-3.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90" onClick={submit}>
            <Check size={13} aria-hidden />保存配置
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-md border px-3 text-[13px] transition-colors",
        active ? "border-brand bg-brand-soft font-medium text-brand" : "border-input bg-card text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
