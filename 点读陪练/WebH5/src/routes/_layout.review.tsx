// 小阅兵：4 项能力逐条自评（我能做到 / 基本可以 / 需要帮助），绝不用红色
import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { SelfRating } from "@/lib/store";
import { useProgress } from "@/lib/store";
import { Btn, PageHead, Panel, StarBurst } from "@/components/ui-kit";
import { CheckIcon, PrintIcon, RepeatIcon, StarIcon } from "@/components/icons";

export const Route = createFileRoute("/_layout/review")({
  component: ReviewPage,
});

const OPTIONS: { key: SelfRating; label: string; cls: string }[] = [
  { key: "can", label: "我能做到", cls: "bg-lit text-on-lit" },
  { key: "almost", label: "基本可以", cls: "bg-warm-soft text-[var(--warm)] ring-1 ring-[var(--warm)]/40" },
  { key: "help", label: "需要帮助", cls: "bg-idle text-idle-foreground" },
];

function ReviewPage() {
  const p = useProgress();
  const navigate = useNavigate();
  const { unit, skillRating, litDays, isWeekend } = p;
  const open = litDays.length >= 5 || isWeekend;

  const [active, setActive] = useState(() => {
    const i = unit.skills.findIndex((s) => !skillRating(s.id));
    return i === -1 ? 0 : i;
  });
  const [burst, setBurst] = useState(false);

  const ratings = useMemo(() => {
    const m: Record<string, SelfRating> = {};
    unit.skills.forEach((s) => {
      const r = skillRating(s.id);
      if (r) m[s.id] = r;
    });
    return m;
  }, [unit, skillRating]);

  const allPassed = unit.skills.every((s) => ratings[s.id] === "can" || ratings[s.id] === "almost");
  const doneCount = Object.keys(ratings).length;
  const skill = unit.skills[active];

  if (!open) {
    return (
      <div className="flex flex-col gap-5">
        <PageHead eyebrow={`第 ${p.week} 周`} title="小阅兵 · 本周检验" desc="这一关在等本周先攒满五天。" />
        <Panel className="px-6 py-8 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-idle text-idle-foreground">
            <StarIcon className="h-7 w-7" />
          </span>
          <p className="mt-4 text-[17px] font-bold">还差 {5 - litDays.length} 天就能来检验</p>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-text">
            周六、周日随时开放；也可以先把五天的天天见练完。
          </p>
          <Link to="/" className="mt-5 block">
            <Btn className="w-full">回首页继续今天的陪练</Btn>
          </Link>
        </Panel>
      </div>
    );
  }

  const choose = (key: SelfRating) => {
    p.rateSkill(skill.id, key);
    if (key === "help") p.reviewSkills(unit.id, { [skill.id]: key });
    const nextIdx = active + 1;
    if (nextIdx >= unit.skills.length) {
      setBurst(true);
      window.setTimeout(() => setBurst(false), 1800);
    } else {
      window.setTimeout(() => setActive(nextIdx), 260);
    }
  };

  const rating = ratings[skill.id];

  return (
    <div className="relative flex flex-col gap-5">
      <PageHead
        eyebrow={`第 ${p.week} 周 · Unit ${unit.no}`}
        title="小阅兵"
        desc={`${doneCount} / ${unit.skills.length} 条已评 · 不打分、不比较，只说现在能不能做到`}
      />

      {/* 四条能力导航 */}
      <ol className="flex gap-1.5">
        {unit.skills.map((s, i) => {
          const r = ratings[s.id];
          return (
            <li key={s.id} className="flex-1">
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-current={i === active ? "step" : undefined}
                className={
                  "w-full rounded-xl px-1 py-2 text-[14px] font-bold transition-colors duration-300 " +
                  (i === active
                    ? "bg-primary text-primary-foreground"
                    : r
                      ? "bg-lit-soft text-[var(--lit)]"
                      : "bg-secondary text-idle-foreground")
                }
              >
                {r ? <CheckIcon className="mx-auto h-4 w-4" /> : `①②③④`[i]}
              </button>
            </li>
          );
        })}
      </ol>

      <Panel key={skill.id} as="article" className="anim-card px-5 py-5 sm:px-6">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary-deep">
          能力 {skill.no}
        </p>
        <h2 className="mt-1.5 text-[21px] font-bold leading-snug">{skill.name}</h2>

        <div className="mt-4 rounded-2xl bg-secondary/70 px-4 py-3">
          <p className="text-[13px] font-semibold text-muted-text">示范句子</p>
          <p className="mt-1 text-[17px] font-bold leading-snug">“{skill.demo}”</p>
        </div>

        <p className="mt-4 text-[15px] leading-relaxed">
          <b className="font-bold">怎么做：</b>
          {skill.task}
        </p>

        <div className="mt-5 flex flex-col gap-2">
          {OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => choose(o.key)}
              className={
                "tap-target min-h-12 rounded-2xl px-4 text-[16px] font-bold transition-transform duration-200 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring " +
                o.cls +
                (rating === o.key ? " ring-2 ring-offset-2 ring-offset-card ring-foreground/25" : "")
              }
            >
              {o.label}
            </button>
          ))}
        </div>

        {rating === "help" && (
          <div className="mt-4 rounded-2xl border border-warm/40 bg-warm-soft/60 px-4 py-3">
            <p className="flex items-center gap-1.5 text-[14px] font-bold text-[var(--warm)]">
              <RepeatIcon className="h-4 w-4" />
              补练一下就好
            </p>
            <p className="mt-1 text-[14px] leading-relaxed">{skill.remedy.hint}</p>
            <Link to="/daily" className="mt-2.5 inline-block">
              <Btn size="sm" variant="soft">
                去补练
              </Btn>
            </Link>
          </div>
        )}
      </Panel>

      {allPassed ? (
        <Panel className="border-l-4 border-l-[var(--lit)] px-5 py-4">
          <p className="text-[16px] font-bold">本周四项都过关啦</p>
          <p className="mt-1 text-[14px] leading-relaxed text-muted-text">
            成长卡已经点亮，去看看这周攒下的词。
          </p>
          <div className="mt-3 flex gap-2">
            <Btn size="sm" onClick={() => void navigate({ to: "/card" })}>
              打开成长卡
            </Btn>
            <Link to="/print">
              <Btn size="sm" variant="soft">
                <PrintIcon className="h-4 w-4" />
                打印记录单
              </Btn>
            </Link>
          </div>
        </Panel>
      ) : (
        <p className="px-1 text-center text-[13px] text-muted-text">
          选「需要帮助」不会扣分，只会告诉你回哪几张句卡再练一次。
        </p>
      )}

      <StarBurst show={burst} />
    </div>
  );
}
