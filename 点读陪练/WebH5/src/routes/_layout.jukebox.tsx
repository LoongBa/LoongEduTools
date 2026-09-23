// 点唱台：歌词逐句热区 + 跟唱模式（逐句留停顿）
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { UNITS, unitOf, type Song } from "@/data/content";
import { useProgress } from "@/lib/store";
import { speechSupported, speakMp3, stopAudio, setAudioRate } from "@/lib/speech";
import { Btn, PageHead, Panel } from "@/components/ui-kit";
import { SpeakerIcon, StarIcon, TurtleIcon, PlayIcon, PauseIcon, PrevIcon, NextIcon, MusicIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_layout/jukebox")({
  component: JukeboxPage,
});

function JukeboxPage() {
  const p = useProgress();
  const [songId, setSongId] = useState<string | null>(null);
  const song = useMemo(() => {
    if (!songId) return null;
    for (const u of UNITS) {
      const s = (u.songs ?? [u.song]).find((x) => x.id === songId);
      if (s) return s;
    }
    return null;
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
          {UNITS.flatMap((u) =>
            (u.songs ?? [u.song]).map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSongId(s.id)}
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
                    {s.kind === "textbook_lyrics" ? (
                      <SpeakerIcon className="h-5 w-5" />
                    ) : (
                      <MusicIcon className="h-5 w-5" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-[17px] font-bold leading-tight">
                        {s.title}
                      </span>
                      <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-muted-text">
                        Unit {u.no}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                          s.kind === "textbook_lyrics"
                            ? "bg-sky-soft text-[var(--sky)]"
                            : "bg-warm-soft text-[var(--warm)]",
                        )}
                      >
                        {s.kind === "textbook_lyrics" ? "教材跟读" : "原创歌曲"}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[13px] text-muted-text">
                      {s.cn} · {s.lines.length} 句
                    </span>
                  </span>
                </button>
              </li>
            )),
          )}
        </ul>
      </div>
    );
  }

  return (
    <Player
      song={song}
      soundOn={p.state.settings.soundOn}
      slowInit={p.state.settings.slowRate}
      patchSettings={p.patchSettings}
      onBack={() => setSongId(null)}
    />
  );
}

function Player({
  song,
  soundOn,
  slowInit,
  patchSettings,
  onBack,
}: {
  song: Song;
  soundOn: boolean;
  slowInit: boolean;
  patchSettings: (patch: Partial<{ slowRate: boolean }>) => void;
  onBack: () => void;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [singAlong, setSingAlong] = useState(false);
  const [auto, setAuto] = useState(false);
  // refs 镜像：onEnd 回调里读最新值，避免闭包捕获陈旧 state（播放中切换模式要即时生效）
  const autoRef = useRef(false);
  const singAlongRef = useRef(false);
  const setAutoBoth = (v: boolean) => {
    setAuto(v);
    autoRef.current = v;
  };
  const setSingAlongBoth = (v: boolean) => {
    setSingAlong(v);
    singAlongRef.current = v;
  };
  const [slow, setSlow] = useState(slowInit); // 初始取全局设置，之后页面内可切换
  const [playing, setPlaying] = useState(false); // 当前是否有句正在发声
  const [cur, setCur] = useState(0); // 整曲模式：当前播放位置（秒）
  const [prompt, setPrompt] = useState<string | null>(null); // 跟读弹窗提示
  const [promptDur, setPromptDur] = useState(0); // 跟读弹窗倒计时剩余（ms）
  const [promptTotal, setPromptTotal] = useState(0); // 跟读弹窗倒计时总时长（ms，用于转圈角度）
  const [trackMode, setTrackMode] = useState<"original" | "instrumental" | "vocal">("original"); // 整曲：原曲/伴奏/清唱
  const [rate, setRate] = useState<number>(slowInit ? 0.85 : 1); // 倍率：0.75/0.85/1/1.25/1.5
  const timer = useRef<number | null>(null);
  const vocalRef = useRef<HTMLAudioElement | null>(null);
  const instRef = useRef<HTMLAudioElement | null>(null);

  // 倍率档位（"慢一点"选择器）
  const RATES = [0.75, 0.85, 1, 1.25, 1.5];

  // 整曲模式：song.json 提供整曲 audio + 每句时间戳 → 双轨并行（人声+伴奏可独立开关）
  const isTrack =
    song.kind === "original_song" && !!song.audio && !!song.instrumental && !!song.timeline && song.timeline.length === song.lines.length;

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
    stopAudio();
    vocalRef.current?.pause();
    instRef.current?.pause();
  }, []);

  // 整曲双轨 audio 生命周期：创建 → timeupdate 驱动高亮/进度 → 清理
  useEffect(() => {
    if (!isTrack || !song.audio) return;
    const v = new Audio(song.audio);
    const it = new Audio(song.instrumental!);
    vocalRef.current = v;
    instRef.current = it;
    v.preload = "metadata";
    it.preload = "metadata";
    // 三态：原曲=双开 / 伴奏=只伴奏 / 清唱=只人声
    v.muted = trackMode === "instrumental";
    it.muted = trackMode === "vocal";
    const tl = song.timeline!;
    const onTime = () => {
      setCur(v.currentTime);
      const idx = tl.findIndex((t) => v.currentTime >= t.start && v.currentTime < t.end);
      if (idx >= 0) setActive(idx);
      else if (tl.length > 0 && v.currentTime >= tl[tl.length - 1].end) setActive(null);
    };
    const onEnd = () => {
      setPlaying(false);
      setActive(null);
      setCur(0);
      v.currentTime = 0;
      it.currentTime = 0;
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("ended", onEnd);
    return () => {
      v.pause();
      it.pause();
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("ended", onEnd);
      vocalRef.current = null;
      instRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTrack, song.audio]);

  // 倍率：双轨同步（0.75/0.85/1/1.25/1.5）
  useEffect(() => {
    if (!isTrack) return;
    if (vocalRef.current) vocalRef.current.playbackRate = rate;
    if (instRef.current) instRef.current.playbackRate = rate;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate, isTrack, playing]);

  // 跟读弹窗倒计时：promptDur 每秒递减，到 0 自动进入下一句
  useEffect(() => {
    if (!prompt || promptDur <= 0) return;
    const iv = window.setInterval(() => {
      setPromptDur((d) => {
        const nd = d - 100;
        if (nd <= 0) {
          window.clearInterval(iv);
          setPrompt(null);
          if (active !== null) nextFrom(active);
          return 0;
        }
        return nd;
      });
    }, 100);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, promptDur > 0]);

  /** 双轨同步播放/暂停/跳转 */
  const syncPlay = () => {
    vocalRef.current?.play();
    instRef.current?.play();
  };
  const syncPause = () => {
    vocalRef.current?.pause();
    instRef.current?.pause();
  };
  const syncSeek = (t: number) => {
    if (vocalRef.current) vocalRef.current.currentTime = t;
    if (instRef.current) instRef.current.currentTime = t;
  };

  /** 三态切换：原曲/伴奏/清唱（播放中即时生效 muted） */
  const setTrackModeVal = (m: "original" | "instrumental" | "vocal") => {
    setTrackMode(m);
    if (vocalRef.current) vocalRef.current.muted = m === "instrumental";
    if (instRef.current) instRef.current.muted = m === "vocal";
  };

  /** 从第 i 句续播：非最后一句→下一句；最后一句→安全收尾（供 onEnd 与跟读弹窗共用） */
  const nextFrom = (i: number) => {
    if (i + 1 < song.lines.length) {
      timer.current = window.setTimeout(() => playLine(i + 1), 900);
    } else {
      // 最后一句：播完安全收尾
      setActive(null);
      setPlaying(false);
      setAutoBoth(false);
    }
  };

  const playLine = (i: number) => {
    if (timer.current) window.clearTimeout(timer.current);
    setPrompt(null); // 新句开始：清掉上一句的跟读提示
    setActive(i);
    const line = song.lines[i];
    const ok = soundOn && speakMp3(line.audio, line.en, {
      rate,
      onEnd: (durationMs) => {
        setPlaying(false);
        // 记录本句真实播放耗时（叠加倍速），供后续复用
        if (durationMs) {
          durCache.current[i] = durationMs;
        }
        // 用 ref 读最新模式：连播+跟读 → 弹窗等孩子读（点击"读完啦"或倒计时结束才下一句）
        if (autoRef.current && singAlongRef.current) {
          setPrompt(line.en);
          // 倒计时 = 本句实际播放时长 + 2s（给孩子留跟读时间）
          const total = (durationMs ?? lineDur(i)) + 2000;
          setPromptTotal(total);
          setPromptDur(total);
          return; // 不自动 advance，等弹窗
        }
        // 仅连播 / 仅跟读 → 播完直接续
        if (autoRef.current || singAlongRef.current) nextFrom(i);
      },
    });
    if (!ok) {
      setActive(null);
      setPlaying(false);
      return;
    }
    setPlaying(true);
  };

  /** 句长（ms）：metadata 预取真实 duration，未加载完先回默认、异步再更新 */
  const durCache = useRef<Record<number, number>>({});
  const lineDur = (i: number): number => {
    const c = durCache.current;
    if (c[i] !== undefined) return c[i];
    const line = song.lines[i];
    if (!line.audio) {
      c[i] = 2800;
      return c[i];
    }
    const a = new Audio(line.audio);
    a.preload = "metadata";
    a.addEventListener(
      "loadedmetadata",
      () => {
        if (Number.isFinite(a.duration) && a.duration > 0) {
          c[i] = a.duration * 1000;
        }
      },
      { once: true },
    );
    c[i] = 2800; // 未加载完先用默认；加载后后续查询命中真实值
    return c[i];
  };

  /** 整曲模式：跳转到第 i 句开头（双轨同步 seek） */
  const seekTo = (i: number) => {
    const v = vocalRef.current;
    const tl = song.timeline;
    if (!v || !tl || i < 0 || i >= tl.length) return;
    const t = tl[i].start;
    syncSeek(t);
    setCur(t);
    setActive(i);
    if (v.paused) {
      syncPlay();
      setPlaying(true);
    }
  };

  /** 暂停：停住当前句；继续：当前句从头重播（逐句 mp3 无时间戳，断点续播不可行） */
  const togglePlay = () => {
    if (isTrack) {
      const v = vocalRef.current;
      if (!v) return;
      if (v.paused) {
        syncPlay();
        setPlaying(true);
      } else {
        syncPause();
        setPlaying(false);
      }
      return;
    }
    if (active === null) {
      // 未选过句：从头开始
      playLine(0);
      return;
    }
    if (playing) {
      if (timer.current) window.clearTimeout(timer.current);
      stopAudio();
      setPlaying(false);
    } else {
      playLine(active);
    }
  };

  const step = (dir: -1 | 1) => {
    if (isTrack) {
      const base = active ?? 0;
      const next = Math.min(song.lines.length - 1, Math.max(0, base + dir));
      seekTo(next);
      return;
    }
    if (song.lines.length === 0 || active === null) {
      playLine(dir === 1 ? 0 : Math.max(0, song.lines.length - 1));
      return;
    }
    const next = active + dir;
    if (next < 0 || next >= song.lines.length) {
      // 到头/到尾：停住
      onEnd();
      return;
    }
    playLine(next);
  };

  const onEnd = () => {
    if (timer.current) window.clearTimeout(timer.current);
    stopAudio();
    setActive(null);
    setPlaying(false);
  };

  const setRateVal = (r: number) => {
    setRate(r);
    // 倍速即时生效：正在播放的 mp3 立即变速（逐句模式）；整曲模式由 effect 同步双轨
    setAudioRate(r);
    // 速度记忆：写回全局设置（倍率 <1 视为慢一点），下次进来默认延续
    patchSettings({ slowRate: r < 1 });
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHead
        eyebrow="点唱台"
        eyebrowBadge={
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-bold leading-none tracking-normal",
              song.kind === "textbook_lyrics"
                ? "bg-sky-soft text-[var(--sky)]"
                : "bg-warm-soft text-[var(--warm)]",
            )}
          >
            {song.kind === "textbook_lyrics" ? "教材跟读" : "原创歌曲"}
          </span>
        }
        title={song.title}
        desc={isTrack ? `${song.cn} · 整首连唱，点歌词可以跳到那一句` : `${song.cn} · 点任意一句，只有那一句会唱`}
        right={
          <Btn size="sm" variant="soft" onClick={onBack}>
            换一首
          </Btn>
        }
      />

      {isTrack && (
        <div className="flex items-center gap-3 px-1">
          <input
            type="range"
            min={0}
            max={Math.max(1, Math.floor(song.duration ?? 100))}
            value={Math.min(Math.floor(cur), Math.floor(song.duration ?? 100))}
            onChange={(e) => {
              const t = Number(e.target.value);
              setCur(t);
              syncSeek(t);
            }}
            aria-label="播放进度"
            className="h-2 flex-1 cursor-pointer accent-[var(--primary)]"
          />
          <span className="shrink-0 text-[12px] font-semibold tabular-nums text-muted-text">
            {fmtTime(cur)} / {fmtTime(song.duration ?? 0)}
          </span>
        </div>
      )}

      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="上一句"
          className="tap-target grid h-13 w-13 place-items-center rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80"
          style={{ height: 52, width: 52 }}
        >
          <PrevIcon className="h-6 w-6" />
        </button>
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "暂停" : "播放"}
          className={cn(
            "tap-target grid h-16 w-16 place-items-center rounded-full shadow-sm transition-transform active:scale-95",
            playing ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground",
          )}
          style={{ height: 64, width: 64 }}
        >
          {playing ? <PauseIcon className="h-8 w-8" /> : <PlayIcon className="ml-1 h-8 w-8" />}
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="下一句"
          className="tap-target grid h-13 w-13 place-items-center rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80"
          style={{ height: 52, width: 52 }}
        >
          <NextIcon className="h-6 w-6" />
        </button>
      </div>

      <div className="flex items-stretch gap-1.5">
        {isTrack ? (
          <>
            {/* 三态：原曲/伴奏/清唱 */}
            <div className="flex items-stretch gap-1 rounded-2xl bg-secondary p-1">
              {(
                [
                  { k: "original", t: "原曲", n: "人声+伴奏" },
                  { k: "instrumental", t: "伴奏", n: "仅伴奏" },
                  { k: "vocal", t: "清唱", n: "仅人声" },
                ] as { k: "original" | "instrumental" | "vocal"; t: string; n: string }[]
              ).map((m) => (
                <button
                  key={m.k}
                  type="button"
                  onClick={() => setTrackModeVal(m.k)}
                  aria-pressed={trackMode === m.k}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-xl px-2.5 py-1 transition-colors duration-200",
                    trackMode === m.k
                      ? "bg-primary text-primary-foreground shadow-soft"
                      : "text-secondary-foreground hover:bg-secondary/80",
                  )}
                >
                  <span className="text-[13px] font-bold leading-tight">{m.t}</span>
                  <span className={cn("text-[10px] leading-tight", trackMode === m.k ? "opacity-80" : "text-muted-text")}>
                    {m.n}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <Toggle
              on={auto}
              onClick={() => {
                setAutoBoth(!auto);
                if (!auto && active === null) playLine(0);
              }}
              label="连播"
              note="从头放到尾"
            />
            <Toggle on={singAlong} onClick={() => setSingAlongBoth(!singAlong)} label="跟读" note="每句读完停留" />
          </>
        )}
        {/* 倍率选择（慢一点） */}
        <div className="flex flex-1 items-stretch gap-1 rounded-2xl bg-secondary p-1">
          {RATES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRateVal(r)}
              aria-pressed={rate === r}
              className={cn(
                "flex-1 rounded-xl px-2 py-1.5 text-[13px] font-bold tabular-nums transition-colors duration-200",
                rate === r ? "bg-primary text-primary-foreground shadow-soft" : "text-secondary-foreground hover:bg-secondary/80",
              )}
            >
              {r === 1 ? "1x" : `${r}x`}
            </button>
          ))}
        </div>
      </div>

      <Panel as="ol" className="divide-y divide-border/60 px-1 py-1">
        {song.lines.map((line, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => (isTrack ? seekTo(i) : playLine(i))}
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
              <span className="min-w-0 flex-1 text-center">
                <span
                  className={cn(
                    "block leading-snug transition-all duration-300",
                    active === i
                      ? "text-[21px] font-extrabold text-primary-deep"
                      : "text-[16px] font-semibold text-muted-text",
                  )}
                >
                  {line.en}
                </span>
                <span className="mt-1 block text-[14px] leading-snug text-muted-text">{line.cn}</span>
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

      {singAlong && !auto && (
        <p className="flex items-center justify-center gap-1.5 text-[13px] text-muted-text">
          <StarIcon className="h-3.5 w-3.5 text-warm" filled />
          每句唱完会停一下，那段时间轮到你唱
        </p>
      )}

      {/* 跟读弹窗：连播+跟读时，播完一句弹出提示；点"读完啦"或倒计时结束进入下一句 */}
      {prompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-6">
          <div className="anim-pop w-full max-w-sm rounded-3xl bg-card px-6 py-7 text-center shadow-lift">
            <p className="text-[15px] font-bold text-primary-deep">请跟读</p>
            <p className="mt-3 text-[22px] font-extrabold leading-snug text-foreground">{prompt}</p>
            <p className="mt-2 text-[13px] text-muted-text">跟着读一遍，读完点"读完啦"</p>
            <div
              className="mx-auto mt-6 h-16 w-16"
              style={
                promptDur > 0 && promptTotal > 0
                  ? {
                      background: `conic-gradient(var(--primary) ${(promptDur / promptTotal) * 360}deg, transparent 0deg)`,
                      borderRadius: "9999px",
                      padding: 4,
                    }
                  : undefined
              }
            >
              <button
                type="button"
                onClick={() => {
                  setPrompt(null);
                  if (active !== null) nextFrom(active);
                }}
                className="grid h-full w-full place-items-center rounded-full bg-primary text-[15px] font-bold text-primary-foreground"
              >
                读完啦
              </button>
            </div>
            {promptDur > 0 && (
              <p className="mt-3 text-[12px] text-muted-text">
                倒计时 {Math.max(1, Math.round(promptDur / 1000))} 秒后自动继续
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function fmtTime(s: number): string {
  const mm = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${mm}:${String(ss).padStart(2, "0")}`;
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
