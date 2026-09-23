// 发音：浏览器内置语音合成（Web Speech API）；不支持时由调用方走文字退化
import { useCallback, useEffect, useRef, useState } from "react";
import { audioUrl } from "./audio";

let cachedVoices: SpeechSynthesisVoice[] = [];

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (!speechSupported()) return null;
  if (!cachedVoices.length) cachedVoices = window.speechSynthesis.getVoices();
  const vs = cachedVoices.filter((v) => new RegExp(`^${lang}`, "i").test(v.lang));
  if (!vs.length) return null;
  // 美/中优先，其次任意
  return vs.find((v) => new RegExp(`${lang}[-_](US|CN)`, "i").test(v.lang)) ?? vs[0];
}

/** 文本是否含中文（用于中文听写/词义朗读选中文语音） */
const CJK_RE = /[\u4e00-\u9fff]/;

if (speechSupported()) {
  const refresh = () => {
    cachedVoices = window.speechSynthesis.getVoices();
  };
  refresh();
  window.speechSynthesis.addEventListener?.("voiceschanged", refresh);
}

export interface SpeakOptions {
  slow?: boolean;
  /** 直接指定倍率（如 0.75 / 1.25），优先于 slow */
  rate?: number;
  /** 播放结束回调；参数为该句 mp3 实际时长（ms），浏览器朗读回退时为 undefined */
  onEnd?: (durationMs?: number) => void;
}

/** 语速档位：normal 与 slow（slow 明显放慢，便于儿童跟读） */
export const RATE_NORMAL = 0.85;
export const RATE_SLOW = 0.55;

/** 朗读一段文字（英文/中文自动选语音）；返回是否真正发声 */
export function speak(text: string, opts: SpeakOptions = {}): boolean {
  if (!speechSupported() || !text.trim()) return false;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const isZh = CJK_RE.test(text);
    const lang = isZh ? "zh" : "en";
    const v = pickVoice(lang);
    if (v) u.voice = v;
    u.lang = v?.lang ?? (isZh ? "zh-CN" : "en-US");
    u.rate = opts.rate ?? (opts.slow ? RATE_SLOW : RATE_NORMAL);
    u.pitch = 1.05;
    if (opts.onEnd) {
      u.onend = () => opts.onEnd?.();
      u.onerror = () => opts.onEnd?.();
    }
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}

/**
 * mp3 优先的朗读：key 对应管线 TTS 文件 → 播放 mp3；文件缺失/播放失败 → 回退 speak()。
 * slow 生效：mp3 播放时设 playbackRate（并保持音高不失真）。
 * 返回是否成功发起发声（mp3 的异步失败会自动回退浏览器朗读）。
 */
let currentAudio: HTMLAudioElement | null = null;

/** 停止当前发声（mp3 暂停 + 浏览器朗读取消）。用于播放控制（暂停/上/下一句打断）。 */
export function stopAudio(): void {
  if (currentAudio) {
    try {
      currentAudio.pause();
    } catch {
      /* ignore */
    }
    currentAudio = null;
  }
  if (speechSupported()) window.speechSynthesis.cancel();
}

/** 当前正在播放的 mp3 立即变速（不打断）。用于播放中切换倍率即时生效。 */
export function setAudioRate(r: number): void {
  if (!currentAudio || !r || r <= 0) return;
  try {
    currentAudio.playbackRate = r;
    if ("preservesPitch" in currentAudio) currentAudio.preservesPitch = true;
  } catch {
    /* ignore */
  }
}

export function speakMp3(
  key: string | undefined,
  text: string,
  opts: SpeakOptions = {},
): boolean {
  if (!key) return speak(text, opts);
  stopAudio();
  try {
    const a = new Audio(audioUrl(key));
    // 倍率：rate 优先，slow 档回落 RATE_SLOW（preservesPitch 保持音高，避免变调）
    const r = opts.rate ?? (opts.slow ? RATE_SLOW : undefined);
    if (r && r !== 1) {
      a.playbackRate = r;
      if ("preservesPitch" in a) a.preservesPitch = true;
    }
    currentAudio = a;
    let settled = false;
    // 实际播放耗时（ms）：mp3 原始时长 ÷ 倍速（叠加加速效果后的真实时长）
    const actualMs = () => {
      if (Number.isFinite(a.duration) && a.duration > 0) {
        const r = a.playbackRate || 1;
        return (a.duration / r) * 1000;
      }
      return undefined;
    };
    const settleEnd = () => {
      if (settled) return;
      settled = true;
      if (currentAudio === a) currentAudio = null;
      opts.onEnd?.(actualMs());
    };
    const fallback = () => {
      if (settled) return;
      settled = true;
      if (currentAudio === a) currentAudio = null;
      // 交给 speak 的 onend 统一回调（不在此处调，避免双 onEnd）；
      // speak 本身也失败时才兜底一次
      const spoke = speak(text, opts);
      if (!spoke) opts.onEnd?.(actualMs());
    };
    a.addEventListener("ended", settleEnd, { once: true });
    a.addEventListener("error", fallback, { once: true });
    const p = a.play();
    if (p) p.catch(fallback);
    return true;
  } catch {
    return speak(text, opts);
  }
}

/** 录音跟读：只在内存中回放，不写存储、不外传 */
export function useRecorder() {
  const [supported] = useState(() =>
    typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof window !== "undefined" && "MediaRecorder" in window,
  );
  const [state, setState] = useState<"idle" | "recording" | "ready" | "denied">("idle");
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  // 切后台/失焦时放弃本次录音
  useEffect(() => {
    const abort = () => {
      if (recRef.current?.state === "recording") {
        try {
          recRef.current.stop();
        } catch {
          /* ignore */
        }
      }
    };
    const onVisibility = () => {
      if (document.hidden) abort();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", abort);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", abort);
    };
  }, []);

  const start = useCallback(async () => {
    if (!supported) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const chunks: BlobPart[] = [];
      const rec = new MediaRecorder(stream);
      recRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        if (blob.size > 1000 && urlRef.current === null) {
          urlRef.current = URL.createObjectURL(blob);
          setState("ready");
        } else {
          setState("idle");
        }
      };
      rec.start();
      setState("recording");
    } catch {
      setState("denied");
      setError("没有拿到麦克风权限");
    }
  }, [supported]);

  const stop = useCallback(() => {
    if (recRef.current?.state === "recording") recRef.current.stop();
  }, []);

  const play = useCallback(() => {
    if (!urlRef.current) return;
    const a = new Audio(urlRef.current);
    void a.play();
  }, []);

  const discard = useCallback(() => {
    cleanup();
    setState("idle");
  }, [cleanup]);

  return { supported, state, error, start, stop, play, discard };
}
