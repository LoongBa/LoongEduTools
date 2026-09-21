// 词卡收藏册：翻面卡片 + 单元筛选 + 柔性「该复习啦」角标
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { UNIT_ROWS, unitOf, type WordCard } from "@/data/content";
import { ipOf } from "@/data/ip";
import { useProgress } from "@/lib/store";
import { speechSupported, speak } from "@/lib/speech";
import { LeafIcon, SpeakerIcon, StarIcon } from "@/components/icons";
import { PageHead, Panel } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_layout/words")({
  component: WordsPage,
});

type Filter = "all" | "lit" | "todo";

function WordsPage() {
  const p = useProgress();
  const [unitId, setUnitId] = useState(p.state.unitId);
  const [filter, setFilter] = useState<Filter>("all");
  const [flipped, setFlipped] = useState<string | null>(null);
  const [noVoice, setNoVoice] = useState(false);

  const unit = unitOf(unitId);
  const dueSet = useMemo(() => new Set(p.dueReview), [p.dueReview]);

  const list = useMemo(() => {
    return unit.words.filter((w) => {
      if (filter === "all") return true;
      const lit = p.state.litWords.includes(w.word);
      return filter === "lit" ? lit : !lit;
    });
  }, [unit, filter, p.state.litWords]);

  const collected = p.stats.collected;

  const play = (word: string) => {
    const ok = speechSupported() && speak(word, { slow: p.state.settings.slowRate });
    setNoVoice(!ok);
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHead
        eyebrow={`已收集 ${collected} / ${p.stats.totalWords}`}
        title="词卡收藏册"
        desc="点卡片翻面看中文，点小喇叭再听一遍。收集是成就，不是考核。"
      />

      {/* 进度条 */}
      <Panel className="px-4 py-3.5">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-idle">
          <div
            className="h-full rounded-full bg-lit transition-[width] duration-700 ease-out"
            style={{ width: `${Math.min(100, (collected / p.stats.totalWords) * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-[13px] text-muted-text">
          {dueSet.size > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <LeafIcon className="h-4 w-4 text-[var(--warm)]" />
              {dueSet.size} 张三天没碰了，翻一翻就算复习
            </span>
          ) : (
            "最近的词都还热乎着"
          )}
        </p>
      </Panel>

      {/* 单元筛选 */}
      <div className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1">
        {UNIT_ROWS.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => {
              setUnitId(u.id);
              setFlipped(null);
            }}
            className={cn(
              "shrink-0 snap-start rounded-full px-3.5 py-1.5 text-[14px] font-semibold transition-colors duration-200",
              u.id === unitId
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-accent",
            )}
          >
            U{u.no} {u.cn}
          </button>
        ))}
      </div>

      {/* 状态分组 */}
      <div className="flex gap-1.5">
        {(
          [
            { k: "all", t: "全部" },
            { k: "lit", t: "已点亮" },
            { k: "todo", t: "待复习" },
          ] as { k: Filter; t: string }[]
        ).map(({ k, t }) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={cn(
              "flex-1 rounded-xl py-2 text-[14px] font-bold transition-colors duration-200",
              filter === k ? "bg-foreground text-background" : "bg-secondary text-muted-text",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {noVoice && (
        <p className="rounded-2xl bg-warm-soft px-4 py-2.5 text-[14px] leading-snug">
          这台设备暂时没有可用的英文朗读，可以先照着音标和中文读一遍。
        </p>
      )}

      {list.length === 0 ? (
        <Panel className="px-6 py-10 text-center">
          <p className="text-[16px] font-bold">这一组还没有词卡</p>
          <p className="mt-1.5 text-[14px] text-muted-text">
            去天天见练几句，词卡就会出现在这里。
          </p>
        </Panel>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {list.map((w, i) => (
            <li key={w.word}>
              <WordTile
                card={w}
                lit={p.state.litWords.includes(w.word)}
                due={dueSet.has(w.word)}
                open={flipped === w.word}
                delay={i}
                onFlip={() => setFlipped((v) => (v === w.word ? null : w.word))}
                onPlay={() => play(w.word)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WordTile({
  card,
  lit,
  due,
  open,
  delay,
  onFlip,
  onPlay,
}: {
  card: WordCard;
  lit: boolean;
  due: boolean;
  open: boolean;
  delay: number;
  onFlip: () => void;
  onPlay: () => void;
}) {
  const char = ipOf(card.ip);
  return (
    <button
      type="button"
      onClick={onFlip}
      data-reveal-delay={`${Math.min(delay, 8) * 45}`}
      className={cn(
        "panel-border reveal relative block h-full w-full overflow-hidden rounded-3xl border bg-card p-3.5 text-left shadow-soft",
        "transition-transform duration-300 active:scale-[0.98]",
      )}
    >
      {due && (
        <span className="absolute right-2.5 top-2.5 rounded-full bg-warm-soft px-2 py-0.5 text-[11px] font-bold text-[var(--warm)]">
          该复习啦
        </span>
      )}
      {!open ? (
        <>
          <img
            src={char.image}
            alt=""
            className="h-14 w-14 rounded-full bg-accent/50 object-cover"
            draggable={false}
          />
          <p className="mt-2.5 text-[18px] font-bold leading-tight break-words">{card.word}</p>
          <p className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-muted-text">
            <StarIcon className={cn("h-3.5 w-3.5", lit ? "text-[var(--lit)]" : "text-idle")} filled={lit} />
            {lit ? "已点亮" : "待点亮"}
          </p>
        </>
      ) : (
        <>
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-primary-deep">
            {card.word}
          </p>
          <p className="mt-1.5 text-[19px] font-bold leading-tight">{card.cn}</p>
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
            }}
            className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-secondary px-3 text-[13px] font-bold text-secondary-foreground"
          >
            <SpeakerIcon className="h-4 w-4" />
            听一听
          </span>
        </>
      )}
    </button>
  );
}
