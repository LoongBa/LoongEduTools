// 我的：学习概览 + 护眼与朗读设置 + 内容范围 + 数据管理 + 家长说明
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { UNIT_ROWS } from "@/data/content";
import { IP_CHARACTERS } from "@/data/ip";
import { speechSupported } from "@/lib/speech";
import { resolveTheme, THEMES, useProgress } from "@/lib/store";
import { Btn, PageHead, Panel } from "@/components/ui-kit";
import { PrintIcon, StarIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_layout/me")({
  component: MePage,
});

function MePage() {
  const p = useProgress();
  const s = p.state.settings;
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <PageHead eyebrow={`第 ${p.week} 周`} title="我的" desc="进度只存在这台设备上，不收集任何个人信息。" />

      {/* 概览 */}
      <Panel className="px-5 py-4">
        <ul className="grid grid-cols-2 gap-y-4">
          <Stat label="累计打卡" value={p.stats.totalDays} unit="天" />
          <Stat label="连续天数" value={p.stats.streak} unit="天" />
          <Stat label="已学单元" value={`${p.stats.unitsDone} / ${UNIT_ROWS.length}`} />
          <Stat label="收集词卡" value={p.stats.collected} unit={`/ ${p.stats.totalWords}`} />
        </ul>
      </Panel>

      {!p.storageOk && (
        <p className="rounded-2xl bg-warm-soft px-4 py-2.5 text-[14px] leading-snug">
          这台设备的本地存储暂时不可用，内容都能正常看，只是进度不会被记录。
        </p>
      )}

      {/* 内容与范围 */}
      <Section title="学习内容" note="切换后各页内容整体替换，历史周卡保留">
        <div className="flex flex-wrap gap-1.5">
          {UNIT_ROWS.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => p.setUnit(u.id)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[14px] font-semibold transition-colors duration-200",
                u.id === p.state.unitId
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent",
              )}
            >
              U{u.no} {u.cn}
            </button>
          ))}
        </div>
      </Section>

      {/* 护眼与显示 */}
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

      {/* 朗读 */}
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
      </Section>

      {/* 朋友墙 */}
      <Section title="这一册的朋友" note="原创角色，用于句卡插画与陪伴">
        <ul className="grid grid-cols-3 gap-2.5">
          {IP_CHARACTERS.map((c) => (
            <li key={c.key} className="rounded-2xl bg-secondary/60 px-2.5 py-3 text-center">
              <img src={c.image} alt={c.cn} className="mx-auto h-12 w-12 rounded-full object-cover" draggable={false} />
              <p className="mt-1.5 text-[14px] font-bold leading-tight">{c.name}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-text">{c.trait}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* 家长说明 */}
      <Section title="给家长的陪练方法" note="每天 15–20 分钟，晚上一次即可">
        <ol className="space-y-2.5 text-[15px] leading-relaxed">
          {[
            "开场复习先让孩子说，不要急着纠正；说错了也先接住。",
            "新学环节只要求「听得清、跟得上」，不要求一次记住拼写。",
            "巩固环节让孩子当小老师，把句子教给你或玩偶。",
            "收尾时把今天认识的词念一遍，确认后才点亮当天的圈。",
            "小阅兵的三档自评由孩子自己选，「需要帮助」不是失败，只是回哪几张卡再练。",
            "周末可以打印一份练习小单，作为无屏补充，不必每天都做。",
          ].map((t, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-bold text-primary-deep">
                {i + 1}
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
      </Section>

      {/* 数据管理 */}
      <Section title="本机数据" note="导出为文本自行保管，清空后无法恢复">
        <div className="flex flex-col gap-2">
          <Link to="/print">
            <Btn variant="soft" className="w-full">
              <PrintIcon className="h-5 w-5" />
              去打印小单
            </Btn>
          </Link>
          <Btn variant="soft" onClick={exportText}>
            导出进度为文本
          </Btn>
          {confirmReset ? (
            <Panel className="border border-warm/45 bg-warm-soft/50 px-4 py-3">
              <p className="text-[15px] font-bold">确定清空全部本机进度吗？</p>
              <p className="mt-1 text-[14px] leading-relaxed text-muted-text">
                打卡记录、能力自评与收集的词卡都会消失，且无法恢复。
              </p>
              <div className="mt-3 flex gap-2">
                <Btn
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmReset(false)}
                >
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

      <p className="px-2 pb-2 text-center text-[13px] leading-relaxed text-muted-text">
        英语点读陪练 · 天天见 ｜ 内容依据 PEP 四上同步拓展改写，原创角色与文本
      </p>
    </div>
  );

  function exportText() {
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
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "progress.txt";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function Stat({ label, value, unit }: { label: string; value: number | string; unit?: string }) {
  return (
    <li>
      <p className="text-[13px] text-muted-text">{label}</p>
      <p className="mt-0.5 text-[26px] font-bold tabular-nums leading-none">
        {value}
        {unit && <span className="ml-1 text-[13px] font-medium text-muted-text">{unit}</span>}
      </p>
    </li>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <h2 className="text-[16px] font-bold">{title}</h2>
        {note && <StarIcon className="h-3.5 w-3.5 shrink-0 text-warm" filled />}
      </div>
      <Panel className="px-5 py-4">
        {note && <p className="mb-3 text-[13px] leading-snug text-muted-text">{note}</p>}
        {children}
      </Panel>
    </section>
  );
}

function Row({ label, note, children }: { label: string; note: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-[15px] font-bold leading-tight">{label}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-muted-text">{note}</p>
      </div>
      {children}
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { k: string; t: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex shrink-0 gap-1 rounded-xl bg-secondary p-1">
      {options.map((o) => (
        <button
          key={o.k}
          type="button"
          onClick={() => onChange(o.k)}
          aria-pressed={value === o.k}
          className={cn(
            "min-h-9 rounded-lg px-3.5 text-[14px] font-bold transition-colors duration-200",
            value === o.k ? "bg-card text-foreground shadow-soft" : "text-muted-text",
          )}
        >
          {o.t}
        </button>
      ))}
    </div>
  );
}

function Switch({
  label,
  note,
  on,
  onChange,
}: {
  label: string;
  note: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Row label={label} note={note}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={cn(
          "relative h-8 w-14 shrink-0 rounded-full transition-colors duration-300",
          on ? "bg-lit" : "bg-idle",
        )}
      >
        <span
          className={cn(
            "absolute top-1 h-6 w-6 rounded-full bg-card shadow-soft transition-transform duration-300",
            on ? "translate-x-7" : "translate-x-1",
          )}
        />
      </button>
    </Row>
  );
}
