// 个人信息：账号卡片 + 本机授权信息 + 使用统计（数据来自本地持久化状态，模拟）
import {
  BadgeCheck,
  CalendarDays,
  DownloadCloud,
  GraduationCap,
  HardDriveDownload,
  LogOut,
  Pencil,
  ShieldCheck,
  Star,
  Timer as TimerIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MOCK_USER } from "@/lib/mockData";
import type { ToolShortcut } from "@/lib/types";
import type { InstalledMap } from "@/lib/store";

interface ProfileViewProps {
  loggedIn: boolean;
  onToggleLoggedIn: () => void;
  installed: InstalledMap;
  shortcuts: ToolShortcut[];
  onGoToolbox: () => void;
  onGoSettings: () => void;
}

export function ProfileView({
  loggedIn,
  onToggleLoggedIn,
  installed,
  shortcuts,
  onGoToolbox,
  onGoSettings,
}: ProfileViewProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState<string>(MOCK_USER.name);

  const usedCount = shortcuts.filter((s) => s.last_used).length;
  const pinnedCount = shortcuts.filter((s) => s.pinned).length;
  const downloadedCount = shortcuts.filter((s) => s.source === "download").length;
  const installedCount = Object.keys(installed).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 px-6 py-8 max-md:px-4">
        {/* 账号卡片 */}
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="h-20 bg-gradient-to-r from-brand to-primary opacity-90" aria-hidden />
          <div className="-mt-9 flex flex-col gap-3 px-6 pb-6 sm:flex-row sm:items-end">
            <span className="flex size-[72px] shrink-0 items-center justify-center rounded-2xl border-4 border-card bg-brand-soft text-[26px] font-bold text-brand shadow-sm">
              {(name || MOCK_USER.name).slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              {editing ? (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    autoFocus
                    value={name}
                    maxLength={12}
                    onChange={(e) => setName(e.target.value)}
                    className="h-9 w-44 rounded-md border border-input bg-background px-2.5 text-[15px] outline-none focus-visible:border-ring"
                    aria-label="昵称"
                  />
                  <button
                    type="button"
                    className="h-9 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
                    onClick={() => {
                      setEditing(false);
                      toast.success("昵称已保存到本机");
                    }}
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    className="h-9 rounded-md px-2 text-[13px] text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setName(MOCK_USER.name);
                      setEditing(false);
                    }}
                  >
                    取消
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 pt-1">
                  <h2 className="font-display truncate text-xl font-bold">{name}</h2>
                  <button
                    type="button"
                    aria-label="修改昵称"
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil size={13} aria-hidden />
                  </button>
                </div>
              )}
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
                <span>{MOCK_USER.school}</span>
                <span aria-hidden>·</span>
                <span>{MOCK_USER.subject}</span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                    loggedIn
                      ? "bg-ok/10 text-ok"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {loggedIn ? <BadgeCheck size={11} aria-hidden /> : null}
                  {loggedIn ? "已登录 · 本机授权" : "未登录 · 仅可浏览"}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={onToggleLoggedIn}
              className={cn(
                "h-9 shrink-0 rounded-lg border px-4 text-[13px] font-medium transition-colors",
                loggedIn
                  ? "border-border text-foreground hover:bg-accent"
                  : "border-transparent bg-primary text-primary-foreground hover:opacity-90",
              )}
            >
              {loggedIn ? "退出登录" : "去登录（模拟）"}
            </button>
          </div>
        </section>

        {/* 使用统计 */}
        <section>
          <SectionTitle icon={CalendarDays} label="本机使用概览" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={DownloadCloud} value={installedCount} label="已安装内容包" />
            <StatCard icon={HardDriveDownload} value={downloadedCount} label="已下载工具" />
            <StatCard icon={Star} value={pinnedCount} label="收藏工具" />
            <StatCard icon={TimerIcon} value={usedCount} label="启动过的工具" />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            统计仅记录在本机浏览器中，换电脑可通过「启动中心 → 工具 → 导出随身工具包」带走。
          </p>
        </section>

        {/* 授权与设备 */}
        <section>
          <SectionTitle icon={ShieldCheck} label="授权与设备" />
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card text-[13px]">
            <InfoRow k="授权方式" v="本机授权（离线可用，续期需联网）" />
            <InfoRow k="授权到期" v={MOCK_USER.licenseUntil} />
            <InfoRow k="客户端版本" v={MOCK_USER.clientVersion} />
            <InfoRow k="清单通道" v="packages / toolbox manifest（演示为内置模拟数据）" />
            <InfoRow k="本机标识" v={<code className="rounded bg-muted px-1.5 py-0.5 text-[12px]">{MOCK_USER.deviceId}</code>} />
          </ul>
        </section>

        {/* 快捷入口 */}
        <section className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onGoToolbox}
            className="flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-[13px] font-medium transition-colors hover:bg-accent"
          >
            <GraduationCap size={15} aria-hidden />
            管理我的工具
          </button>
          <button
            type="button"
            onClick={onGoSettings}
            className="flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-[13px] font-medium transition-colors hover:bg-accent"
          >
            <LogOut size={15} aria-hidden className="rotate-180" />
            前往设置
          </button>
        </section>
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, label }: { icon: typeof Star; label: string }) {
  return (
    <h3 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
      <Icon size={14} aria-hidden className="text-brand" />
      {label}
    </h3>
  );
}

function StatCard({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Star;
  value: number;
  label: string;
}) {
  return (
    <div className="reveal rounded-xl border border-border bg-card p-4 shadow-sm">
      <Icon size={16} aria-hidden className="text-brand" />
      <div className="mt-2 font-display text-2xl font-bold tabular-nums leading-none">{value}</div>
      <div className="mt-1.5 text-[12px] text-muted-foreground">{label}</div>
    </div>
  );
}

function InfoRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-1 px-4 py-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </li>
  );
}
