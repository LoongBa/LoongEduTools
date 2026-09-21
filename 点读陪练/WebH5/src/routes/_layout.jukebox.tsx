// 点唱台：歌词逐句热区 + 跟唱模式（逐句留停顿）
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { UNITS, unitOf, type Song } from "@/data/content";
import { useProgress } from "@/lib/store";
import { speechSupported, speak } from "@/lib/speech";
import { Btn, PageHead, Panel } from "@/components/ui-kit";
import { SpeakerIcon, StarIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_layout/jukebox")({
  component: JukeboxPage,
});

function JukeboxPage() {
  const p = useProgress();
  const [songId, setSongId] = useState<string | null>(null);
  const song = useMemo(() => {
    if (!songId) return null;
    const u = UNITS.find((x) => x.song.id === songId);
    return u ? u.song : null;
  }, [songId]);

  if (!song) {
    return (
      <div className="flex flex-col gap-4">
        <PageHead
          eyebrow={`当前单元 Unit ${p.unit.no}`}
          title="点唱台"
          desc="点一句只唱那一句，也可以整首连着放。"
        />
        <ul className="flex flex-col gap-3">
          {UNITS.map((u) => (
            <li key={u.song.id}>
              <button
                type="button"
                onClick={() => setSongId(u.song.id)}
                className={cn(
                  "tap-target flex w-full items-center gap-4 rounded-3xl border px-5 py-4 text-left transition-colors duration-200",
                  u.id === p.state.unitId
                    ? "border-primary/35 bg-accent/60"
                    : "panel-border bg-card hover:bg-secondary/70",
                )}
              >
                <span
                  className={cn(
                    "grid h-11 w-11 shrink-0 place-items-center rounded-full",
                    u.id === p.state.unitId ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-text",
                  )}
                >
                  <SpeakerIcon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px] font-bold leading-tight">
                    {u.song.title}
                  </span>
                  <span className="mt-0.5 block text-[13px] text-muted-text">
                    {u.song.cn} · U{u.no} {u.cn} · {u.song.lines.length} 句
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return <Player song={song} soundOn={p.state.settings.soundOn} slow={p.state.settings.slowRate} onBack={() => setSongId(null)} />;
}

function Player({
  song,
  soundOn,
  slow,
  onBack,
}: {
  song: Song;
  soundOn: boolean;
  slow: boolean;
  onBack: () => void;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [singAlong, setSingAlong] = useState(false);
  const [auto, setAuto] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const playLine = (i: number) => {
    if (timer.current) window.clearTimeout(timer.current);
    setActive(i);
    const ok = soundOn && speak(song.lines[i].en, { slow });
    if (!ok) {
      setActive(null);
      return;
    }
    // 跟唱模式：唱完留一段停顿给孩子唱；连播：稍作间隔后自动下一句
    const gap = singAlong ? 3200 : 900;
    if (auto || singAlong) {
      timer.current = window.setTimeout(() => {
        if (i + 1 < song.lines.length) playLine(i + 1);
        else {
          setActive(null);
          setAuto(false);
        }
      }, gap + (singAlong ? 0 : 1600));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHead
        eyebrow="点唱台"
        title={song.title}
        desc={`${song.cn} · 点任意一句，只有那一句会唱`}
        right={
          <Btn size="sm" variant="soft" onClick={onBack}>
            换一首
          </Btn>
        }
      />

      <div className="flex gap-1.5">
        <Toggle on={singAlong} onClick={() => setSingAlong((v) => !v)} label="跟唱模式" note="每句留一拍" />
        <Toggle
          on={auto}
          onClick={() => {
            setAuto((v) => {
              const next = !v;
              if (next && active === null) playLine(0);
              return next;
            });
          }}
          label="全部连播"
          note="从头放到尾"
        />
      </div>

      <Panel as="ol" className="divide-y divide-border/60 px-1 py-1">
        {song.lines.map((line, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => playLine(i)}
              className={cn(
                "tap-target flex w-full items-start gap-3 rounded-2xl px-4 py-3 text-left transition-colors duration-300",
                active === i ? "bg-accent" : "hover:bg-secondary/60",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold tabular-nums",
                  active === i ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-text",
                )}
              >
                {active === i ? <SpeakerIcon className="h-4 w-4" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-[19px] font-bold leading-snug transition-colors",
                    active === i ? "text-primary-deep" : "text-foreground",
                  )}
                >
                  {line.en}
                </span>
                <span className="mt-0.5 block text-[14px] leading-snug text-muted-text">{line.cn}</span>
              </span>
            </button>
          </li>
        ))}
      </Panel>

      {!speechSupported() && (
        <p className="rounded-2xl bg-warm-soft px-4 py-2.5 text-[14px] leading-snug">
          这台设备不支持朗读，可以照着歌词自己唱，中文行就是提示。
        </p>
      )}

      {singAlong && (
        <p className="flex items-center justify-center gap-1.5 text-[13px] text-muted-text">
          <StarIcon className="h-3.5 w-3.5 text-warm" filled />
          每句唱完会停一下，那段时间轮到你唱
        </p>
      )}
    </div>
  );
}

function Toggle({ on, onClick, label, note }: { on: boolean; onClick: () => void; label: string; note: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "tap-target flex-1 rounded-2xl px-3 py-2.5 text-left transition-colors duration-200",
        on ? "bg-lit-soft ring-1 ring-[var(--lit)]/35" : "bg-secondary",
      )}
    >
      <span className={cn("block text-[15px] font-bold", on ? "text-[var(--lit)]" : "text-secondary-foreground")}>
        {label}
      </span>
      <span className="block text-[12px] text-muted-text">{note}</span>
    </button>
  );
}
