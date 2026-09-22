// 发音：浏览器内置语音合成（Web Speech API）；不支持时由调用方走文字退化
import { useCallback, useEffect, useRef, useState } from "react";
import { audioUrl } from "./audio";

let cachedVoices: SpeechSynthesisVoice[] = [];

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (!speechSupported()) return null;
  if (!cachedVoices.length) cachedVoices = window.speechSynthesis.getVoices();
  const en = cachedVoices.filter((v) => /^en/i.test(v.lang));
  if (!en.length) return null;
  // 优先美音，其次任意英文语音
  return en.find((v) => /en[-_]US/i.test(v.lang)) ?? en[0];
}

if (speechSupported()) {
  const refresh = () => {
    cachedVoices = window.speechSynthesis.getVoices();
  };
  refresh();
  window.speechSynthesis.addEventListener?.("voiceschanged", refresh);
}

export interface SpeakOptions {
  slow?: boolean;
  onEnd?: () => void;
}

/** 语速档位：normal 与 slow（slow 明显放慢，便于儿童跟读） */
export const RATE_NORMAL = 0.85;
export const RATE_SLOW = 0.55;

/** 朗读一段英文；返回是否真正发声 */
export function speak(text: string, opts: SpeakOptions = {}): boolean {
  if (!speechSupported() || !text.trim()) return false;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = v?.lang ?? "en-US";
    u.rate = opts.slow ? RATE_SLOW : RATE_NORMAL;
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
export function speakMp3(
  key: string | undefined,
  text: string,
  opts: SpeakOptions = {},
): boolean {
  if (!key) return speak(text, opts);
  try {
    const a = new Audio(audioUrl(key));
    // slow 档：MP3 变速播放（preservesPitch 保持音高，避免慢速变调）
    if (opts.slow) {
      a.playbackRate = RATE_SLOW;
      if ("preservesPitch" in a) a.preservesPitch = true;
    }
    let settled = false;
    const settleEnd = () => {
      if (settled) return;
      settled = true;
      opts.onEnd?.();
    };
    const fallback = () => {
      if (settled) return;
      settled = true;
      opts.onEnd?.();
      speak(text, opts);
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
