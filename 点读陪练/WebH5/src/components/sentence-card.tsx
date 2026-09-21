// 句卡：图在上 → 英文主句（逐词可点）→ 中文释义；点读按钮固定在右下
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { splitSentence, type SentenceCard } from "@/data/content";
import { ipOf } from "@/data/ip";
import { speechSupported, speak, speakMp3 } from "@/lib/speech";
import { ArrowIcon, MicIcon, Panel, SpeakerIcon, StarIcon, TurtleIcon } from "./ui-kit";
import { useRecorder } from "@/lib/speech";

interface Props {
  card: SentenceCard;
  index: number;
  total: number;
  soundOn: boolean;
  slow: boolean;
  onToggleSlow: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  littleKid?: boolean;
}

export function SentenceCardView({
  card,
  index,
  total,
  soundOn,
  slow,
  onToggleSlow,
  onPrev,
  onNext,
  littleKid,
}: Props) {
  const char = ipOf(card.ip);
  const [playing, setPlaying] = useState(false);
  const [activeWord, setActiveWord] = useState<string | null>(null);
  const [noVoice, setNoVoice] = useState(false);
  const rec = useRecorder();
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    setPlaying(false);
    setActiveWord(null);
    setNoVoice(!speechSupported());
    rec.discard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id]);

  const parts = useMemo(() => splitSentence(card.en, card.words), [card.en, card.words]);

  const playSentence = (slowIt: boolean) => {
    setActiveWord(null);
    // 有管线 mp3 则播放 mp3，否则回退浏览器朗读（speakMp3 内部处理）
    const ok = soundOn && speakMp3(card.mp3, card.en, { slow: slowIt, onEnd: () => setPlaying(false) });
    if (!ok) {
      setNoVoice(true);
      return;
    }
    setNoVoice(false);
    setPlaying(true);
  };

  const playWord = (text: string, cn2?: string) => {
    setActiveWord(text);
    const bare = text.replace(/[.,!?;:]/g, "");
    const ok = soundOn && speak(bare, { slow, onEnd: () => setActiveWord(null) });
    if (!ok) setNoVoice(true);
    if (cn2) window.setTimeout(() => setActiveWord((v) => (v === text ? null : v)), 1400);
  };

  return (
    <Panel
      className="relative overflow-hidden"
      as="article"
    >
      {/* 插画区 */}
      <button
        type="button"
        onClick={() => playSentence(slow)}
        onPointerDown={(e) => (touchX.current = e.clientX)}
        onPointerUp={(e) => {
          if (touchX.current === null) return;
          const dx = e.clientX - touchX.current;
          if (dx > 56) onPrev?.();
          else if (dx < -56) onNext?.();
          touchX.current = null;
        }}
        aria-label={`朗读整句：${card.en}`}
        className={cn(
          "group relative block w-full bg-accent/45 px-6 pt-6 pb-5",
          "transition-colors duration-300 hover:bg-accent/70",
        )}
      >
        <div className="mx-auto h-[132px] w-[132px] sm:h-[152px] sm:w-[152px]">
          <img
            src={char.image}
            alt={`${char.cn}的插画`}
            className={cn(
              "ip-plate h-full w-full rounded-full bg-card object-cover shadow-soft",
              playing && "anim-float",
            )}
            draggable={false}
          />
        </div>
        <span className="absolute left-5 top-5 inline-flex items-center gap-1.5 rounded-full bg-card/85 px-3 py-1 text-[12px] font-bold text-muted-text">
          {char.name}
          <span className="font-medium opacity-70">{char.trait}</span>
        </span>
        <span className="absolute right-5 top-5 rounded-full bg-card/85 px-2.5 py-1 text-[12px] font-semibold text-muted-text tabular-nums">
          {index + 1} / {total}
        </span>
      </button>

      {/* 文本区 */}
      <div className="px-5 pb-5 pt-4 sm:px-7">
        <p
          className={cn(
            "font-bold leading-[1.35] tracking-[0.01em] text-foreground",
            littleKid ? "text-[30px] sm:text-[38px]" : "text-sentence",
          )}
        >
          {parts.map((p, i) =>
            !p.clickable ? (
              <span key={i}>{p.text}</span>
            ) : (
              <button
                key={i}
                type="button"
                onClick={() => playWord(p.text, p.cn)}
                className={cn(
                  "relative rounded-lg px-0.5 transition-colors duration-200",
                  "hover:bg-warm-soft focus-visible:outline-2 focus-visible:outline-ring",
                  activeWord === p.text &&
                    "anim-word bg-warm-soft text-primary-deep underline decoration-warm decoration-2 underline-offset-4",
                )}
                title={p.cn ? `点读：${p.text} · ${p.cn}` : `点读：${p.text}`}
              >
                {p.text}
                {p.cn && activeWord === p.text && (
                  <span className="anim-word absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-lit px-2.5 py-1 text-[13px] font-bold leading-none text-on-lit shadow-soft">
                    {p.cn}
                  </span>
                )}
              </button>
            ),
          )}
        </p>
        <p className="mt-2.5 text-[16px] leading-relaxed text-muted-text">{card.cn}</p>

        {noVoice && (
          <p className="mt-3 rounded-xl bg-warm-soft px-3 py-2 text-[14px] leading-snug text-foreground">
            这台设备暂时没有可用的英文朗读，先跟着下面的提示读：重音在加粗的音节上，句子末尾声音轻轻降下来。
          </p>
        )}

        {/* 操作条 */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => playSentence(false)}
            className={cn(
              "tap-target inline-flex min-h-12 items-center gap-2 rounded-2xl bg-primary px-5 text-[16px] font-bold text-primary-foreground shadow-soft",
              "transition-transform duration-200 active:scale-[0.97]",
              playing && "anim-pop",
            )}
          >
            <SpeakerIcon className="h-5 w-5" />
            听一听
          </button>

          <button
            type="button"
            onClick={() => {
              onToggleSlow();
              playSentence(true);
            }}
            className={cn(
              "tap-target inline-flex min-h-12 items-center gap-2 rounded-2xl px-4 text-[15px] font-semibold transition-colors duration-200",
              slow ? "bg-sky-soft text-[var(--sky)]" : "bg-secondary text-secondary-foreground",
            )}
            aria-pressed={slow}
          >
            <TurtleIcon className="h-5 w-5" />
            慢一点
          </button>

          {rec.supported ? (
            <button
              type="button"
              onPointerDown={() => void rec.start()}
              onPointerUp={rec.stop}
              onPointerLeave={() => rec.state === "recording" && rec.stop()}
              className={cn(
                "tap-target inline-flex min-h-12 items-center gap-2 rounded-2xl px-4 text-[15px] font-semibold select-none touch-none",
                rec.state === "recording"
                  ? "bg-lit text-on-lit"
                  : "bg-secondary text-secondary-foreground",
              )}
            >
              <MicIcon className="h-5 w-5" />
              {rec.state === "recording" ? "松手结束" : "按住跟读"}
            </button>
          ) : (
            <span className="tap-target inline-flex min-h-12 items-center gap-2 rounded-2xl bg-idle px-4 text-[14px] font-medium text-idle-foreground">
              <MicIcon className="h-5 w-5" />
              没有麦克风也能完成今天的陪练
            </span>
          )}

          {rec.state === "ready" && (
            <>
              <button
                type="button"
                onClick={rec.play}
                className="tap-target inline-flex min-h-12 items-center gap-1.5 rounded-2xl bg-lit-soft px-4 text-[15px] font-bold text-[var(--lit)]"
              >
                <SpeakerIcon className="h-5 w-5" />
                听听自己
              </button>
              <button
                type="button"
                onClick={rec.discard}
                className="tap-target inline-flex min-h-12 items-center rounded-2xl px-3 text-[14px] font-medium text-muted-text hover:bg-secondary"
              >
                再录一次
              </button>
            </>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={onPrev}
              disabled={!onPrev}
              aria-label="上一句"
              className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground transition-colors hover:bg-accent disabled:opacity-40"
            >
              <ArrowIcon dir="left" className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!onNext}
              aria-label="下一句"
              className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground transition-colors hover:bg-accent disabled:opacity-40"
            >
              <ArrowIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 单词点读提示 */}
        <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted-text">
          <StarIcon className="h-3.5 w-3.5 text-warm" filled />
          句子里的每个单词都可以单独点来听，左右滑动或按箭头换句。
        </p>
      </div>
    </Panel>
  );
}
