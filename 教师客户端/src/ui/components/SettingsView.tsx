// 设置：通用 / 服务器 / 外观（主题模式 + 配色皮肤）/ 账号 / 存储与数据
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  DownloadCloud,
  FolderOpen,
  Info,
  Loader,
  Monitor,
  Moon,
  Server,
  Star,
  Sun,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAccountInfo } from "@/lib/store";
import { SKIN_META, useThemeCtx, type SkinId, type ThemeMode } from "@/lib/theme";
import type { InstalledMap } from "@/lib/store";
import type { ToolShortcut } from "@/lib/types";
import { api, type CloseBehavior, type ConfigStatus } from "@/api";
import { friendlyErr } from "@/errutil";

interface SettingsViewProps {
  loggedIn: boolean;
  onToggleLoggedIn: () => void;
  installed: InstalledMap;
  shortcuts: ToolShortcut[];
}

const MODES: { id: ThemeMode; label: string; icon: typeof Sun; desc: string }[] = [
  { id: "system", label: "跟随系统", icon: Monitor, desc: "随操作系统深浅自动切换" },
  { id: "light", label: "浅色", icon: Sun, desc: "明亮的课堂投影友好" },
  { id: "dark", label: "深色", icon: Moon, desc: "晚自习护眼" },
];

/** 皮肤在浅底上的主色近似值，仅用于设置页色板示意 */
const SKIN_SWATCH: Record<SkinId, { light: string; dark: string }> = {
  clay: { light: "oklch(0.52 0.14 38)", dark: "oklch(0.68 0.15 42)" },
  pine: { light: "oklch(0.48 0.09 165)", dark: "oklch(0.7 0.11 160)" },
  indigo: { light: "oklch(0.5 0.13 262)", dark: "oklch(0.68 0.13 258)" },
  rose: { light: "oklch(0.52 0.15 5)", dark: "oklch(0.7 0.14 8)" },
  ink: { light: "oklch(0.35 0.02 255)", dark: "oklch(0.82 0.015 250)" },
};

export function SettingsView({
  loggedIn,
  onToggleLoggedIn,
  installed,
  shortcuts,
}: SettingsViewProps) {
  const { mode, setMode, resolved, skin, setSkin } = useThemeCtx();
  const acct = useAccountInfo();
  const [confirmReset, setConfirmReset] = useState(false);

  const downloadedCount = shortcuts.filter((s) => s.source === "download").length;
  const pinnedCount = shortcuts.filter((s) => s.pinned).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-6 px-6 py-8 max-md:px-4">
        {/* ── 外观 ── */}
        <Group title="外观" hint="主题模式与配色皮肤，保存于本机并立即生效">
          <Row label="主题模式" desc={mode === "system" ? `跟随系统 · 当前为${resolved === "dark" ? "深色" : "浅色"}` : undefined}>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="主题模式">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.id}
                  title={m.desc}
                  onClick={() => setMode(m.id)}
                  className={cn(
                    "flex min-h-10 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2.5 text-[12px] transition-colors",
                    mode === m.id
                      ? "border-brand bg-brand-soft font-medium text-brand"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <m.icon size={15} aria-hidden />
                  {m.label}
                </button>
              ))}
            </div>
          </Row>

          <Row label="配色皮肤" desc="深浅两档各自调校，保证对比度">
            <div className="flex flex-wrap gap-2">
              {SKIN_META.map((s) => {
                const active = skin === s.id;
                const swatch = resolved === "dark" ? SKIN_SWATCH[s.id].dark : SKIN_SWATCH[s.id].light;
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSkin(s.id)}
                    className={cn(
                      "flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-[13px] transition-colors",
                      active
                        ? "border-brand bg-brand-soft font-medium text-brand"
                        : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <span
                      className="size-3.5 rounded-full ring-1 ring-black/10"
                      style={{ backgroundColor: swatch }}
                      aria-hidden
                    />
                    {s.label}
                    {active && <Check size={12} aria-hidden />}
                  </button>
                );
              })}
            </div>
          </Row>

          <Row label="动效减弱" desc="遵循系统 prefers-reduced-motion，折叠与进度动画自动关闭">
            <span className="inline-flex h-7 items-center rounded-full bg-ok/10 px-2.5 text-[12px] font-medium text-ok">
              已跟随系统
            </span>
          </Row>
        </Group>

        {/* ── 通用 ── */}
        <Group title="通用" hint="启动行为类偏好（演示项保存在本机）">
          <ToggleRow
            label="登录后恢复上次视图"
            desc="下次打开客户端直接进入上次使用的页面"
            storageKey="taoli.settings.restoreView"
          />
          <ToggleRow
            label="工具下载完成后提示启动"
            desc="工具落盘生成快捷方式后弹出启动确认"
            storageKey="taoli.settings.notifyLaunch"
            defaultOn
          />
          <ToggleRow
            label="侧栏分组默认全部展开"
            desc="关闭后按上次的折叠状态恢复"
            storageKey="taoli.settings.expandAllGroups"
          />
        </Group>

        {/* ── 服务器 ── */}
        <Group title="服务器" hint="服务端地址（api_base）：换服务器/下载托管源只改这一处，保存后立即生效">
          <ServerEditor />
        </Group>

        {/* ── 关闭行为（需求3/4：ask 弹框 / tray 托盘 / quit 直退，持久化 shell_close.json）── */}
        <Group title="关闭行为" hint="点击窗口关闭按钮时的处理；选「每次询问」可随时在弹框中勾选「记住」改回直退或托盘">
          <CloseBehaviorPicker />
        </Group>

        {/* ── 账号 ── */}
        <Group title="账号" hint={acct.real ? "真实壳端登录态" : "演示环境无真实账号体系"}>
          <Row label="登录状态" desc={loggedIn ? "已登录 · 本机授权，可下载安装内容包" : "未登录 · 仅可浏览，不能下载"}>
            <button
              type="button"
              onClick={onToggleLoggedIn}
              className={cn(
                "h-9 rounded-lg border px-4 text-[13px] font-medium transition-colors",
                loggedIn
                  ? "border-border text-foreground hover:bg-accent"
                  : "border-transparent bg-primary text-primary-foreground hover:opacity-90",
              )}
            >
              {loggedIn ? "退出登录" : "去登录"}
            </button>
          </Row>
          <Row label="授权信息" desc={`${acct.school} · ${acct.clientVersion}`}>
            <span className="text-[12px] text-muted-foreground">到期 {acct.licenseUntil}</span>
          </Row>
        </Group>

        {/* ── 存储与数据 ── */}
        <Group title="存储与数据" hint="本演示不接云服务，所有数据仅存于本机浏览器">
          <Row label="本地数据概览" desc={`已安装内容包 ${Object.keys(installed).length} 个 · 已下载工具 ${downloadedCount} 个 · 收藏 ${pinnedCount} 个`}>
            <div className="flex gap-2">
              <span className="inline-flex h-7 items-center gap-1 rounded-full bg-muted px-2.5 text-[11px] text-muted-foreground">
                <DownloadCloud size={11} aria-hidden /> packages/
              </span>
              <span className="inline-flex h-7 items-center gap-1 rounded-full bg-muted px-2.5 text-[11px] text-muted-foreground">
                <FolderOpen size={11} aria-hidden /> toolbox.json
              </span>
            </div>
          </Row>
          <Row label="随身工具包" desc="换电脑前请在「启动中心 → 工具」导出 JSON，再于新机器导入恢复">
            <span className="inline-flex h-7 items-center gap-1 rounded-full bg-brand-soft px-2.5 text-[11px] font-medium text-brand">
              <Star size={11} aria-hidden /> 推荐流程
            </span>
          </Row>
          <Row label="清除本机数据" desc="删除折叠态、收藏、最近使用、已装记录等全部本地缓存" danger>
            {confirmReset ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-destructive px-3.5 text-[13px] font-medium text-destructive-foreground transition-opacity hover:opacity-90"
                  onClick={() => {
                    window.localStorage.clear();
                    window.location.reload();
                  }}
                >
                  <Trash2 size={13} aria-hidden />
                  确认清除并刷新
                </button>
                <button
                  type="button"
                  className="h-9 rounded-lg px-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setConfirmReset(false)}
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="flex h-9 items-center gap-1.5 rounded-lg border border-destructive/40 px-3.5 text-[13px] font-medium text-destructive transition-colors hover:bg-destructive/10"
                onClick={() => {
                  setConfirmReset(true);
                  toast.warning("清除后不可恢复，建议先导出随身工具包");
                }}
              >
                <AlertTriangle size={13} aria-hidden />
                清除数据…
              </button>
            )}
          </Row>
        </Group>

        {/* ── 关于 ── */}
        <Group title="关于">
          <Row label="桃李助手 · 龙爸易教 教师客户端" desc={`${acct.clientVersion} · 依据 R03 v1.1 需求实现（二级导航 / 下载中心 / 启动中心）`}>
            <span className="inline-flex h-7 items-center gap-1 rounded-full bg-muted px-2.5 text-[11px] text-muted-foreground">
              <Info size={11} aria-hidden /> 桌面版
            </span>
          </Row>
        </Group>
      </div>
    </div>
  );
}

/** 服务端地址编辑器：真实读写 config.json api_base（config.rs，保留未知字段）→ serverPing 验证 */
function ServerEditor() {
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  // 非 Tauri 环境（网页演示版）configGet 抛错 → 降级只读提示
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    void api
      .configGet()
      .then((s) => {
        setStatus(s);
        setValue(s.api_base);
      })
      .catch(() => setUnavailable(true));
  }, []);

  /** 保存（空串 = 恢复默认/清除显式配置）→ 写回状态 → serverPing 验证连通 */
  const apply = useCallback(async (next: string) => {
    setBusy(true);
    try {
      const s = await api.configSetApiBase(next);
      setStatus(s);
      setValue(s.api_base);
      try {
        await api.serverPing();
        toast.success("服务器地址已保存并连通", {
          description: s.api_base ? `立即生效：${s.api_base}` : "已清除显式配置，当前为 P0 离线模式",
        });
      } catch {
        toast.warning("地址已保存，但暂时无法连接服务器", {
          description: "地址立即生效；请核对地址是否正确、网络是否可达。",
        });
      }
    } catch (e) {
      toast.error("保存失败", { description: friendlyErr(e) });
    } finally {
      setBusy(false);
    }
  }, []);

  if (unavailable) {
    return (
      <div className="px-4 py-3.5">
        <div className="text-[13.5px] font-medium">服务端地址</div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
          网页演示版不接真实配置，服务器地址请在桌面版 exe 同目录的 config.json 中配置。
        </p>
        <span className="mt-2 inline-flex h-7 items-center gap-1 rounded-full bg-muted px-2.5 text-[11px] text-muted-foreground">
          <Server size={11} aria-hidden /> 演示环境不可配置
        </span>
      </div>
    );
  }

  const sourceLabel = status?.explicit
    ? "config.json 显式配置"
    : status?.detected_default
      ? "编译期默认（打包注入）"
      : "未配置 · P0 离线模式";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3.5">
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium">当前服务端地址</div>
          <div className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground" title={status?.config_path}>
            来源：{sourceLabel}
            {status?.config_path ? ` · 配置：${status.config_path}` : ""}
          </div>
        </div>
        <span className="inline-flex h-7 max-w-64 items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-full bg-brand-soft px-2.5 text-[11px] font-medium text-brand" title={status?.api_base}>
          <Server size={11} aria-hidden className="shrink-0" />
          {status?.api_base || "P0 离线模式"}
        </span>
      </div>
      <div className="space-y-2.5 px-4 py-3.5">
        <div className="text-[13.5px] font-medium">更换地址</div>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://api.loongba.education"
          aria-label="服务器地址"
          className="h-9 w-full rounded-md border border-input bg-card px-3 text-[12.5px] text-foreground outline-none transition-colors focus:border-brand"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-45"
            onClick={() => apply(value.trim())}
          >
            {busy ? <Loader size={11} aria-hidden className="animate-spin" /> : <Check size={11} aria-hidden />}
            保存并验证
          </button>
          <button
            type="button"
            disabled={busy}
            title="清空显式配置，回退编译期默认地址"
            className="flex h-8 items-center rounded-md border border-input bg-card px-3 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-45"
            onClick={() => apply("")}
          >
            恢复默认
          </button>
          {status?.detected_default && !status.explicit && (
            <span className="text-[10.5px] text-muted-foreground">默认 {status.detected_default}</span>
          )}
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          保存后立即生效（每次请求实时读取 config.json，无需重启客户端）；换机器/U 盘拷贝时随 exe 一起带走。
        </p>
      </div>
    </>
  );
}

/** 关闭行为三态（需求3/4）：mount 读 close_behavior_get，点选即写 shell_close.json + toast */
const CLOSE_BEHAVIOR: { id: CloseBehavior; label: string; desc: string }[] = [
  { id: "ask", label: "每次询问", desc: "点关闭弹确认框，可临时选择退出或托盘（勾选「记住」即改默认）" },
  { id: "tray", label: "最小化到托盘", desc: "关窗后驻留任务栏托盘，点击图标恢复窗口" },
  { id: "quit", label: "直接退出", desc: "点关闭即完全退出，不驻留后台" },
];

function CloseBehaviorPicker() {
  const [value, setValue] = useState<CloseBehavior>("ask");

  useEffect(() => {
    let alive = true;
    void api
      .closeBehaviorGet()
      .then((b) => {
        if (alive) setValue(b);
      })
      .catch(() => {
        /* 读取失败按默认 ask 展示 */
      });
    return () => {
      alive = false;
    };
  }, []);

  const pick = (b: CloseBehavior) => {
    if (b === value) return;
    setValue(b);
    void api
      .closeBehaviorSet(b)
      .then(() => toast.success(`关闭行为已设为「${CLOSE_BEHAVIOR.find((x) => x.id === b)?.label ?? b}」`))
      .catch((e) => {
        setValue(value); // 写失败回滚选中态
        toast.error(friendlyErr(e));
      });
  };

  return (
    <Row label="关闭窗口时" desc="保存于本机（shell_close.json），立即生效">
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="关闭行为">
        {CLOSE_BEHAVIOR.map((b) => (
          <button
            key={b.id}
            type="button"
            role="radio"
            aria-checked={value === b.id}
            title={b.desc}
            disabled={value === null}
            onClick={() => pick(b.id)}
            className={cn(
              "flex min-h-10 items-center justify-center rounded-lg border px-2 text-[12.5px] transition-colors",
              value === b.id
                ? "border-brand bg-brand-soft font-medium text-brand"
                : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {b.label}
          </button>
        ))}
      </div>
    </Row>
  );
}

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      <div className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {children}
      </div>
    </section>
  );
}

function Row({
  label,
  desc,
  danger,
  children,
}: {
  label: string;
  desc?: string;
  danger?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3.5">
      <div className="min-w-0">
        <div className={cn("text-[13.5px] font-medium", danger ? "text-destructive" : "text-foreground")}>
          {label}
        </div>
        {desc && <div className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{desc}</div>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  storageKey,
  defaultOn,
}: {
  label: string;
  desc: string;
  storageKey: string;
  defaultOn?: boolean;
}) {
  const [on, setOn] = useState<boolean>(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw === null ? !!defaultOn : (JSON.parse(raw) as boolean);
    } catch {
      return !!defaultOn;
    }
  });

  const flip = () =>
    setOn((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* 隐私模式静默降级为内存态 */
      }
      return next;
    });

  return (
    <Row label={label} desc={desc}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={flip}
        className={cn(
          "relative h-6 w-11 rounded-full transition-colors",
          on ? "bg-brand" : "bg-input",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-card shadow transition-transform",
            on ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
    </Row>
  );
}
