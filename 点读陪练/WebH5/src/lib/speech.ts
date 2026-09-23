// 发音：浏览器内置语音合成（Web Speech API）；不支持时由调用方走文字退化
import { useCallback, useEffect, useRef, useState } from "react";
import { playMp3Buffer, stopCurrentAudio, setCurrentAudioRate } from "./audio";

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
 * 音频优先的朗读：key 对应管线 TTS 音频（base64 内嵌 js）→ 解码播放；加载/解码失败 → 回退 speak()。
 * slow 生效：播放时设 playbackRate（WebAudio 变速同时改变音高——Chrome 61 基线本无 preservesPitch，行为一致）。
 * 返回是否成功发起发声（异步失败会自动回退浏览器朗读）。
 */

/** 停止当前发声（音频 buffer 停止 + 浏览器朗读取消）。用于播放控制（暂停/上/下一句打断）。 */
export function stopAudio(): void {
  stopCurrentAudio();
  if (speechSupported()) window.speechSynthesis.cancel();
}

/** 当前正在播放的音频立即变速（不打断）。用于播放中切换倍率即时生效。 */
export function setAudioRate(r: number): void {
  if (r > 0) setCurrentAudioRate(r);
}

export function speakMp3(
  key: string | undefined,
  text: string,
  opts: SpeakOptions = {},
): boolean {
  if (!key) return speak(text, opts);
  stopAudio();
  const r = opts.rate ?? (opts.slow ? RATE_SLOW : undefined);
  return playMp3Buffer(key, {
    rate: r,
    onEnd: (durationMs) => opts.onEnd?.(durationMs),
    onError: () => {
      // 交给 speak 的 onend 统一回调（不在此处调，避免双 onEnd）；speak 本身也失败时才兜底一次
      const spoke = speak(text, opts);
      if (!spoke) opts.onEnd?.();
    },
  });
}

/** 录音跟读：只在内存中回放，不写存储、不外传。
 * minitool 禁音视频 blob:/data: src — 回放走 Web Audio（decodeAudioData → BufferSource），
 * 不再 URL.createObjectURL + new Audio(blobUrl)。Chrome 61 用回调式 decodeAudioData。
 */
export function useRecorder() {
  const [supported] = useState(() =>
    typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof window !== "undefined" && "MediaRecorder" in window,
  );
  const [state, setState] = useState<"idle" | "recording" | "ready" | "denied">("idle");
  const [error, setError] = useState<string | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    return ctxRef.current;
  }, []);

  const stopPlayback = useCallback(() => {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        /* ignore */
      }
      sourceRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    stopPlayback();
    bufferRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, [stopPlayback]);

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
    stopPlayback();
    bufferRef.current = null;
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
        if (blob.size > 1000) {
          // Blob → ArrayBuffer → decodeAudioData（Chrome 61 回调式；不生成 blob: URL）
          const reader = new FileReader();
          reader.onload = () => {
            const ctx = getCtx();
            const buf = reader.result;
            if (!ctx || !(buf instanceof ArrayBuffer)) {
              setState("idle");
              return;
            }
            const onOk = (audioBuf: AudioBuffer) => {
              bufferRef.current = audioBuf;
              setState("ready");
            };
            const onErr = () => setState("idle");
            const p = ctx.decodeAudioData(buf, onOk, onErr);
            // 新浏览器返回 Promise；老浏览器只认回调（双路径兼容）
            if (p && typeof p.then === "function") {
              p.then(onOk).catch(onErr);
            }
          };
          reader.onerror = () => setState("idle");
          reader.readAsArrayBuffer(blob);
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
  }, [supported, stopPlayback, getCtx]);

  const stop = useCallback(() => {
    if (recRef.current?.state === "recording") recRef.current.stop();
  }, []);

  const play = useCallback(() => {
    const buf = bufferRef.current;
    const ctx = getCtx();
    if (!buf || !ctx) return;
    stopPlayback();
    if (ctx.state === "suspended") void ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    sourceRef.current = src;
  }, [getCtx, stopPlayback]);

  const discard = useCallback(() => {
    cleanup();
    setState("idle");
  }, [cleanup]);

  return { supported, state, error, start, stop, play, discard };
}
