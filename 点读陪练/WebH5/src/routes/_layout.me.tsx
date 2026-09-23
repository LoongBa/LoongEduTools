// 我的：学习内容 + 陪练方法（主视图），设置（护眼/本机数据）收进右上角齿轮
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { speechSupported } from "@/lib/speech";
import { resolveTheme, THEMES, useProgress } from "@/lib/store";
import { Btn, PageHead, Panel } from "@/components/ui-kit";
import { StarIcon, GearIcon } from "@/components/icons";
import { UnitScope } from "@/components/unit-scope";
import { cn } from "@/lib/utils";
import { APP_VERSION, DATA_STAMP } from "@/lib/version";
import { currentDataStamp } from "@/data/content-provider";

export const Route = createFileRoute("/_layout/me")({
  component: MePage,
});

function MePage() {
  const p = useProgress();
  const s = p.state.settings;
  const [confirmReset, setConfirmReset] = useState(false);
  const [tab, setTab] = useState<"learn" | "guide">("learn");
  const [showSettings, setShowSettings] = useState(false); // 齿轮 → 设置面板
  const [exportedText, setExportedText] = useState<string | null>(null); // 进度文本（页内展示，禁 a[download]）

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        eyebrow={`第 ${p.week} 周`}
        title="我的英语陪练 · 天天见"
        desc="进度只存在这台设备上，不收集任何个人信息。"
        right={
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            aria-pressed={showSettings}
            aria-label={showSettings ? "关闭设置" : "打开设置"}
            className={cn(
              "tap-target grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors duration-200",
              showSettings ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent",
            )}
          >
            <GearIcon className="h-5 w-5" />
          </button>
        }
      />

      {!p.storageOk && (
        <p className="rounded-2xl bg-warm-soft px-4 py-2.5 text-[14px] leading-snug">
          这台设备的本地存储暂时不可用，内容都能正常看，只是进度不会被记录。
        </p>
      )}

      {showSettings ? (
        /* ── 设置面板：护眼与显示 + 本机数据 ── */
        <>
          <Section title="护眼与显示" note="主题、底色与字号档位立即生效">
            <p className="mb-2 text-[15px] font-bold leading-tight">配色主题</p>
            <ul className="grid grid-cols-2 gap-2">
              {THEMES.map((t) => {
                const on = t.k === s.theme;
                return (
                  <li key={t.k}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => p.patchSettings({ theme: t.k })}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors duration-200",
                        on
                          ? "bg-primary text-primary-foreground shadow-soft"
                          : "bg-secondary text-secondary-foreground hover:bg-accent",
                      )}
                    >
                      <span className="flex shrink-0 overflow-hidden rounded-md border border-black/10">
                        {t.swatch.map((c) => (
                          <span key={c} className="h-6 w-2.5" style={{ backgroundColor: c }} />
                        ))}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-bold leading-tight">{t.t}</span>
                        <span
                          className={cn(
                            "block text-[11px] leading-tight",
                            on ? "text-primary-foreground/80" : "text-muted-text",
                          )}
                        >
                          {t.dark ? "深色" : "浅色"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[13px] leading-snug text-muted-text">
              {THEMES.find((t) => t.k === s.theme)?.note}
            </p>
            <Switch
              label="跟随系统深色模式"
              note={
                s.followSystem
                  ? `已开启：按设备的深/浅设置自动切换，当前这套对应${
                      THEMES.find((t) => t.k === resolveTheme(s.theme, true))?.dark ? "深色档" : "浅色档"
                    }；关闭后可固定用上面选中的这套`
                  : "已关闭：固定使用上面选中的这套配色"
              }
              on={s.followSystem}
              onChange={(v) => p.patchSettings({ followSystem: v })}
            />
            <Row label="柔和底色" note="在所选主题内再调深浅，避免纯白反光刺眼">
              <Segmented
                value={s.bgTone}
                options={[
                  { k: "soft", t: "柔和" },
                  { k: "standard", t: "标准" },
                ]}
                onChange={(v) => p.patchSettings({ bgTone: v as "soft" | "standard" })}
              />
            </Row>
            <Row label="字号档位" note="孩子读的句子不小于 18px">
              <Segmented
                value={s.fontScale}
                options={[
                  { k: "normal", t: "默认" },
                  { k: "large", t: "更大" },
                ]}
                onChange={(v) => p.patchSettings({ fontScale: v as "normal" | "large" })}
              />
            </Row>
            <Switch
              label="低年级友好"
              note="放大主句、隐藏长段说明文字"
              on={s.littleKid}
              onChange={(v) => p.patchSettings({ littleKid: v })}
            />
          </Section>

          {/* 本机数据 */}
          <Section title="本机数据" note="导出为文本自行保管，清空后无法恢复">
            <div className="flex flex-col gap-2">
              <Btn variant="soft" onClick={() => setExportedText(exportText())}>
                导出进度为文本
              </Btn>
              {exportedText && (
                <Panel className="px-3 py-2">
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[12px] leading-relaxed text-muted-text">
                    {exportedText}
                  </pre>
                  <Btn size="sm" variant="ghost" className="mt-2" onClick={() => setExportedText(null)}>
                    收起
                  </Btn>
                </Panel>
              )}
              {confirmReset ? (
                <Panel className="border border-warm/45 bg-warm-soft/50 px-4 py-3">
                  <p className="text-[15px] font-bold">确定清空全部本机进度吗？</p>
                  <p className="mt-1 text-[14px] leading-relaxed text-muted-text">
                    打卡记录、能力自评与收集的词卡都会消失，且无法恢复。
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Btn size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
                      我再想想
                    </Btn>
                    <Btn
                      size="sm"
                      onClick={() => {
                        p.resetAll();
                        setConfirmReset(false);
                      }}
                    >
                      确定清空
                    </Btn>
                  </div>
                </Panel>
              ) : (
                <Btn variant="ghost" onClick={() => setConfirmReset(true)}>
                  清空本机进度
                </Btn>
              )}
            </div>
          </Section>
        </>
      ) : (
        /* ── 主视图：学习 / 给家长的陪练方法 ── */
        <>
          {/* Tab 切换 */}
          <div className="flex gap-1.5">
            {(
              [
                { k: "learn", t: "学习设置" },
                { k: "guide", t: "给家长的陪练方法" },
              ] as { k: "learn" | "guide"; t: string }[]
            ).map((x) => (
              <button
                key={x.k}
                type="button"
                onClick={() => setTab(x.k)}
                aria-pressed={tab === x.k}
                className={cn(
                  "flex-1 rounded-2xl py-2.5 text-[15px] font-bold transition-colors duration-200",
                  tab === x.k ? "bg-foreground text-background" : "bg-secondary text-muted-text",
                )}
              >
                {x.t}
              </button>
            ))}
          </div>

          {tab === "learn" ? (
            <>
              {/* 内容与范围（唯一保留单元切换的入口） */}
              <UnitScope switchable title="学习内容" note="切换后各页内容整体替换，历史周卡保留" />

              {/* 朗读与录音（合并到学习） */}
              <Section
                title="朗读与录音"
                note={speechSupported() ? "发音使用设备自带的英文朗读，无需联网" : "这台设备没有可用的英文朗读，点读会改为音标与提示文字"}
              >
                <Switch
                  label="音效开关"
                  note="关闭后点读不发声，仍有视觉反馈"
                  on={s.soundOn}
                  onChange={(v) => p.patchSettings({ soundOn: v })}
                />
                <Switch
                  label="默认慢速朗读"
                  note="打开后所有点读都用较慢语速"
                  on={s.slowRate}
                  onChange={(v) => p.patchSettings({ slowRate: v })}
                />
                {/* 录音：暂未提供（灰色占位） */}
                <div className="mt-4 flex items-center justify-between gap-3 opacity-55">
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold leading-tight">跟读录音</p>
                    <p className="mt-0.5 text-[12px] leading-snug text-muted-text">
                      目前还没有提供录音功能，孩子跟读时家长在旁边听就好
                    </p>
                  </div>
                  <span className="shrink-0 rounded-xl bg-secondary px-3 py-1.5 text-[13px] font-bold text-muted-text">
                    敬请期待
                  </span>
                </div>
              </Section>

              {/* 中文语音提示（听写/词义朗读用系统 TTS） */}
              <div className="rounded-xl bg-secondary/60 px-3.5 py-3 text-[13px] leading-relaxed text-muted-text">
                中文朗读使用手机系统自带语音，音色与语速跟着系统设置走：
                安卓「设置 → 无障碍 → 文字转语音输出」、iPhone「设置 → 辅助功能
                → 朗读内容 → 语音」，可在那里更换默认语音、调快慢。
              </div>

              {/* 朋友墙：暂隐藏，下一步处理 */}
            </>
          ) : (
            /* 给家长的陪练方法（单独并列，常显） */
            <Section title="陪练方法" note="每天 15–20 分钟，晚上一次即可">
              <ol className="space-y-2.5 text-[15px] leading-relaxed">
                {[
                  "开场复习先让孩子说，不要急着纠正；说错了也先接住。",
                  "新学环节只要求「听得清、跟得上」，不要求一次记住拼写。",
                  "巩固环节让孩子当小老师，把句子教给你或玩偶。",
                  "收尾时把今天认识的词念一遍，确认后才点亮当天的圈。",
                  "词卡页的星星不是点出来的：在天天见里认真练过、或补练过关的词，星星才会自动亮起。",
                  "小阅兵的三档自评由孩子自己选，「需要帮助」不是失败，只是回哪几张卡再练。",
                  "周末可以打印一份练习小单，作为无屏补充，不必每天都做。",
                ].map((t, i) => (
                  <li key={t} className="flex gap-2.5">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-bold text-primary-deep">
                      {i + 1}
                    </span>
                    <span>{t}</span>
                  </li>
                ))}
              </ol>
            </Section>
          )}
        </>
      )}

      {/* 关于：Logo | 版本徽章 + 作者（一行两栏；透明底 Logo 全主题自然融入，无需 ip-plate 垫板） */}
      <Section title="关于">
        <div className="flex items-center gap-4">
          <div className="shrink-0 rounded-xl">
            <img src="./logo/logo_full.webp" alt="英语陪练 · 天天见" className="h-24 w-auto" />
          </div>
          <div className="min-w-0">
            <p className="text-base font-bold leading-tight">英语陪练 · 天天见</p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[14px] font-bold leading-tight">
              Ver {APP_VERSION}
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-muted-text">
                数据更新 {currentDataStamp() ?? DATA_STAMP}
              </span>
            </p>
            <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-[15px] font-bold leading-tight">
              爱学习的龙爸
              <span className="text-[13px] font-normal text-muted-text">LoongBa.cn</span>
            </p>
          </div>
        </div>
      </Section>

      <p className="px-2 pb-2 text-center text-[13px] leading-relaxed text-muted-text">
        英语陪练 · 天天见 ｜ 内容依据 PEP 教材同步拓展改写，原创角色与文本
      </p>
    </div>
  );

  function exportText(): string {
    const lines = [
      `英语点读陪练 · 进度导出`,
      `当前单元：Unit ${p.unit.no} ${p.unit.title}`,
      `累计打卡 ${p.stats.totalDays} 天，连续 ${p.stats.streak} 天`,
      `收集词卡 ${p.stats.collected} / ${p.stats.totalWords}`,
      "",
      "打卡明细：",
      ...p.state.days
        .filter((d) => d.finished)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => `  ${d.date}  第${d.week}周 Day${d.dayInWeek}  Unit ${d.unitId}`),
      "",
      "本周能力自评：",
      ...p.unit.skills.map((sk) => {
        const r = p.skillRating(sk.id);
        return `  ${sk.no}) ${sk.name} — ${r === "can" ? "我能做到" : r === "almost" ? "基本可以" : r === "help" ? "需要帮助" : "未评"}`;
      }),
    ];
    // minitool 禁 a[download] — 返回文本由调用方页内展示
    return lines.join("\n");
  }
}

function Section({
  title,
  note,
  badge,
  children,
}: {
  title: string;
  note?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 px-1">
        <h2 className="shrink-0 text-[16px] font-bold">{title}</h2>
        {note && <StarIcon className="h-3.5 w-3.5 shrink-0 text-warm" filled />}
        {badge && <span className="ml-auto">{badge}</span>}
      </div>
      <Panel className="px-5 py-4">
        {note && <p className="mb-3 text-[13px] leading-snug text-muted-text">{note}</p>}
        {children}
      </Panel>
    </section>
  );
}

function Row({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[15px] font-bold leading-tight">{label}</p>
        {note && <p className="mt-0.5 text-[12px] leading-snug text-muted-text">{note}</p>}
      </div>
      {children}
    </div>
  );
}

function Switch({ label, note, on, onChange }: { label: string; note?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[15px] font-bold leading-tight">{label}</p>
        {note && <p className="mt-0.5 text-[12px] leading-snug text-muted-text">{note}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={cn(
          "tap-target relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200",
          on ? "bg-[var(--lit)]" : "bg-secondary",
        )}
      >
        <span
          className={cn(
            "absolute top-1 h-6 w-6 rounded-full bg-white shadow-soft transition-transform duration-200",
            on ? "translate-x-7" : "translate-x-1",
          )}
        />
      </button>
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { k: T; t: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex shrink-0 gap-1 rounded-xl bg-secondary p-1">
      {options.map((o) => (
        <button
          key={o.k}
          type="button"
          onClick={() => onChange(o.k)}
          aria-pressed={value === o.k}
          className={cn(
            "rounded-lg px-3 py-1.5 text-[13px] font-bold transition-colors duration-200",
            value === o.k ? "bg-primary text-primary-foreground" : "text-secondary-foreground",
          )}
        >
          {o.t}
        </button>
      ))}
    </div>
  );
}
