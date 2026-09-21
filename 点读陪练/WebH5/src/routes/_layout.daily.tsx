// 天天见播放页：四环节 + 句卡点读 + 温和过渡反馈
import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { STAGES, cardsByStage, stageLabel, type Stage } from "@/data/content";
import { DAY_TITLES } from "@/data/content";
import { useProgress } from "@/lib/store";
import { Btn, Panel, StarBurst, StageBar, CheckIcon, ArrowIcon } from "@/components/ui-kit";
import { SentenceCardView } from "@/components/sentence-card";

export const Route = createFileRoute("/_layout/daily")({
  component: DailyPage,
});

function DailyPage() {
  const navigate = useNavigate();
  const p = useProgress();
  const { unit, state } = p;

  const dayInWeek = useMemo(() => p.startDay(), [p]);
  const existing = state.days.find((d) => d.week === p.week && d.dayInWeek === dayInWeek);

  const doneStages = useMemo<Stage[]>(() => {
    if (existing?.finished) return [...STAGES];
    return existing?.stagesDone ?? [];
  }, [existing]);

  const [stageIdx, setStageIdx] = useState<number>(() => {
    const i = STAGES.findIndex((s) => !doneStages.includes(s));
    return i === -1 ? STAGES.length - 1 : i;
  });
  const [cardIdx, setCardIdx] = useState(0);
  const [slow, setSlow] = useState(state.settings.slowRate);
  const [burst, setBurst] = useState(false);
  const [askLeave, setAskLeave] = useState(false);
  const [confirmAgain, setConfirmAgain] = useState(!!p.todayRecord?.finished);

  const stage = STAGES[stageIdx];
  const cards = useMemo(() => cardsByStage(unit, stage), [unit, stage]);
  const card = cards[Math.min(cardIdx, cards.length - 1)];

  /** 本环节累计接触到的词 */
  const touchedWords = useMemo(() => {
    const set = new Set<string>();
    unit.cards
      .filter((c) => STAGES.indexOf(c.stage) <= stageIdx)
      .forEach((c) => c.words.forEach((w) => set.add(w.text)));
    return Array.from(set);
  }, [unit, stageIdx]);

  const goStage = (i: number) => {
    setStageIdx(i);
    setCardIdx(0);
  };

  const advance = () => {
    if (cardIdx < cards.length - 1) {
      setCardIdx((v) => v + 1);
      return;
    }
    // 当前环节结束
    p.markStage(dayInWeek, stage);
    if (stageIdx < STAGES.length - 1) {
      setBurst(true);
      window.setTimeout(() => setBurst(false), 1700);
      window.setTimeout(() => goStage(stageIdx + 1), 620);
    } else {
      setBurst(true);
    }
  };

  const finishToday = () => {
    const words = unit.cards.flatMap((c) => c.words.map((w) => w.text));
    p.finishDay(dayInWeek, words);
    void navigate({ to: "/card" });
  };

  const backHome = () => {
    if (existing?.finished || !doneStages.length) {
      void navigate({ to: "/" });
      return;
    }
    setAskLeave(true);
  };

  const wrapList = useMemo(() => {
    const seen = new Map<string, string>();
    unit.cards.forEach((c) => c.words.forEach((w) => seen.set(w.text, w.cn)));
    return Array.from(seen.entries()).slice(0, 12);
  }, [unit]);

  if (confirmAgain) {
    return (
      <Panel className="p-6 text-center">
        <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-primary-deep">
          Day {dayInWeek}
        </p>
        <h2 className="mt-2 text-[22px] font-bold">今天已经打过卡啦</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-text">
          要不要回看今天的句子？回看不会重复点亮。
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Btn
            size="lg"
            onClick={() => {
              setConfirmAgain(false);
              goStage(0);
            }}
          >
            回看今天的句子
          </Btn>
          <Btn variant="soft" onClick={() => void navigate({ to: "/" })}>
            重新开始一次
          </Btn>
          <Btn variant="ghost" onClick={() => void navigate({ to: "/" })}>
            先回首页
          </Btn>
        </div>
      </Panel>
    );
  }

  return (
    <div className="relative">
      {/* 顶栏 */}
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={backHome}
          aria-label="返回首页"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-secondary text-secondary-foreground transition-colors hover:bg-accent"
        >
          <ArrowIcon dir="left" className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary-deep">
            Unit {unit.no} · {unit.title}
          </p>
          <h1 className="truncate text-[19px] font-bold leading-tight">
            Day {dayInWeek} · {DAY_TITLES[(dayInWeek - 1) % DAY_TITLES.length]}
          </h1>
        </div>
      </div>

      <StageBar
        stages={STAGES}
        index={stageIdx}
        onJump={(i) => i < stageIdx && goStage(i)}
      />

      {/* 主体 */}
      <div className="mt-5">
        {stage !== "wrap" || !burst ? (
          card && (
            <div key={card.id} className="anim-card">
              <SentenceCardView
                card={card}
                index={cardIdx}
                total={cards.length}
                soundOn={state.settings.soundOn}
                slow={slow}
                littleKid={state.settings.littleKid}
                onToggleSlow={() => setSlow((v) => !v)}
                onPrev={cardIdx > 0 ? () => setCardIdx((v) => v - 1) : undefined}
                onNext={cardIdx < cards.length - 1 ? advance : undefined}
              />
            </div>
          )
        ) : (
          <WrapCard words={wrapList} unitCn={unit.cn} />
        )}
      </div>

      {/* 底部动作 */}
      <div className="mt-5">
        {burst && (stage === "wrap" || stageIdx === STAGES.length - 1) ? (
          <Btn size="lg" className="w-full" onClick={finishToday}>
            <CheckIcon className="h-5 w-5" />
            记下今天认识的词，完成打卡
          </Btn>
        ) : (
          <div className="flex gap-2">
            <Btn
              variant="soft"
              className="flex-1"
              onClick={() => {
                if (stageIdx > 0) goStage(stageIdx - 1);
              }}
              disabled={stageIdx === 0}
            >
              上一环节
            </Btn>
            <Btn className="flex-[2]" size="lg" onClick={advance}>
              {cardIdx < cards.length - 1 ? "下一句" : `进入${stageIdx < 3 ? stageLabel(STAGES[stageIdx + 1]) : "收尾"}`}
            </Btn>
          </div>
        )}
      </div>

      <p className="mt-4 px-1 text-center text-[13px] leading-relaxed text-muted-text">
        {stageLabel(stage)}环节 · 已接触 {touchedWords.length} 个词
        {state.settings.littleKid ? " · 低年级模式：句子显示得更大一些" : ""}
      </p>

      <StarBurst show={burst} />

      {askLeave && (
        <div className="bg-overlay fixed inset-0 z-40 grid place-items-center px-6">
          <Panel className="w-full max-w-[380px] p-6">
            <h2 className="text-[19px] font-bold">今天的进度还没记完</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-text">
              已经完成 {doneStages.length} 个环节。可以先记下已完成部分，下次从断点继续。
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Btn
                onClick={() => {
                  p.markStage(dayInWeek, stage);
                  setAskLeave(false);
                  void navigate({ to: "/" });
                }}
              >
                先记下已完成部分
              </Btn>
              <Btn variant="soft" onClick={() => setAskLeave(false)}>
                稍后再说，继续练
              </Btn>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

function WrapCard({ words, unitCn }: { words: [string, string][]; unitCn: string }) {
  return (
    <Panel className="p-6">
      <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-lit">收尾</p>
      <h2 className="mt-2 text-[22px] font-bold">今天认识的词 · {unitCn}</h2>
      <p className="mt-1.5 text-[15px] leading-relaxed text-muted-text">
        指着念一遍给家长听，就能点亮今天的圈。
      </p>
      <ul className="mt-5 grid grid-cols-2 gap-2">
        {words.map(([w, cn]) => (
          <li
            key={w}
            className="rounded-2xl bg-secondary/70 px-3 py-2.5 transition-colors hover:bg-accent"
          >
            <span className="block text-[17px] font-bold leading-tight">{w}</span>
            <span className="block text-[13px] text-muted-text">{cn}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
