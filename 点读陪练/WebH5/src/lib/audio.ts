// 音频：平台代码包白名单不含音频扩展名，mp3 以 base64 内嵌 js 存在（encode_audio_b64.py 产出）。
// 运行时动态 <script src="./audio/<key>.js"> 注入 → window.AUDIO_DATA[key] 取 base64 →
// Web Audio decodeAudioData 纯内存播放（不经过 <audio> 元素 / data: / blob:，符合容器 CSP；
// 参考已验证方案：RedTools/publish/学科/新英语四上点读1单元.zip）。
// Chrome 61 基线：AudioContext/webkitAudioContext + 回调式 decodeAudioData。

/** 输入形态 → 统一 key（相对 units/ 根、去扩展名）：
 *  - "u01_s0_h01.mp3"（句子/词卡纯文件名）      → u01/audio/u01_s0_h01
 *  - "./units/u01/song/song_vocal.mp3"（整曲）  → u01/song/song_vocal
 *  - "./units/u01/song/textbook/line_01.mp3"    → u01/song/textbook/line_01
 */
export function normalizeKey(input: string): string {
  let s = (input || "").trim().replace(/^(\.\/|\/)/, "");
  if (s.startsWith("units/")) s = s.slice("units/".length);
  s = s.replace(/\.(mp3|wav|ogg|m4a|aac)$/i, "");
  if (s.includes("/")) return s;
  const m = /^(u\d+|g\d+[ab]?u\d+|p\d+)/i.exec(s);
  const unit = m ? m[1].toLowerCase() : "u01";
  return `${unit}/audio/${s}`;
}

/** 读取已注入的 payload；未注入返回空串。 */
function payloadOf(key: string): string {
  const data = (window as unknown as { AUDIO_DATA?: Record<string, string> }).AUDIO_DATA;
  return data?.[key] ?? "";
}

/** key → 聚合 js 组名（与 encode_audio_b64.py group_of 一致）：
 *  u01/audio/xxx → u01-audio；u01/song/xxx → u01-song；u01/song/textbook/xxx → u01-textbook。 */
export function groupOf(key: string): string {
  const p = key.split("/");
  if (p.length >= 3 && p[1] === "song" && p[2] === "textbook") return `${p[0]}-textbook`;
  if (p.length >= 2 && p[1] === "song") return `${p[0]}-song`;
  return `${p[0]}-audio`;
}

const loading: Record<string, Array<(ok: boolean) => void>> = {};
/** 确保 <script src="./audio/<group>.js"> 已注入并完成（含失败）；回调 ok=false 表示注入失败。 */
export function ensurePayload(key: string, cb: (ok: boolean) => void): void {
  if (payloadOf(key)) {
    cb(true);
    return;
  }
  const group = groupOf(key);
  if (loading[group]) {
    loading[group].push(cb);
    return;
  }
  loading[group] = [cb];
  const s = document.createElement("script");
  s.src = `./audio/${group}.js`;
  s.async = true;
  const settle = () => {
    const q = loading[group];
    delete loading[group];
    q.forEach((f) => f(payloadOf(key) !== ""));
  };
  s.onload = settle;
  s.onerror = settle;
  document.head.appendChild(s);
}

let audioCtx: AudioContext | null = null;
export function ensureAudioCtx(): AudioContext | null {
  if (audioCtx) return audioCtx;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  audioCtx = new AC();
  return audioCtx;
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

const bufferCache: Record<string, AudioBuffer> = {};
/** 解码（缓存）后回调；失败回调 null。Chrome 61 回调式 + 新浏览器 Promise 双路径。 */
export function getAudioBuffer(key: string, cb: (buf: AudioBuffer | null) => void): void {
  const hit = bufferCache[key];
  if (hit) {
    cb(hit);
    return;
  }
  ensurePayload(key, (ok) => {
    if (!ok) {
      cb(null);
      return;
    }
    const ctx = ensureAudioCtx();
    if (!ctx) {
      cb(null);
      return;
    }
    const bytes = base64ToArrayBuffer(payloadOf(key));
    const onOk = (buf: AudioBuffer) => {
      bufferCache[key] = buf;
      cb(buf);
    };
    const onErr = () => cb(null);
    const p = ctx.decodeAudioData(bytes, onOk, onErr);
    if (p && typeof p.then === "function") p.then(onOk).catch(onErr);
  });
}

/** 当前播放的 BufferSource（供 stopAudio / setAudioRate 控制）。 */
let currentSource: AudioBufferSourceNode | null = null;
/** 当前播放的远程 Audio 元素（在线形态 URL 播放；供 stopAudio / setAudioRate 控制）。 */
let currentElement: HTMLAudioElement | null = null;
/** 播放代际：每次发起/停止 +1，异步解码回调校验代际，旧请求不再开播（防快速连点竞态）。 */
let playSeq = 0;

export interface PlayMp3Opts {
  /** 播放倍率（默认 1；WebAudio 变速同时改变音高——Chrome 61 基线本无 preservesPitch，行为一致） */
  rate?: number;
  /** 播放结束回调；参数为该句原始时长 ms（原始 duration ÷ rate 的实际播放耗时） */
  onEnd?: (durationMs?: number) => void;
  /** 加载/解码/播放失败（调用方可回退浏览器朗读） */
  onError?: () => void;
}

/** 是否为远程 URL 音频（在线形态素材直引；非 base64 路径）。 */
export function isRemoteUrl(key: string): boolean {
  return /^https?:/i.test(key);
}

/** 播放一个音频（base64 → decodeAudioData → BufferSource；https URL → <audio> 直播）。
 * 返回是否成功发起（异步失败走 onError）。 */
export function playMp3Buffer(key: string, opts: PlayMp3Opts = {}): boolean {
  if (!key) return false;
  if (isRemoteUrl(key)) return playRemoteUrl(key, opts);
  const k = normalizeKey(key);
  const mySeq = ++playSeq;
  getAudioBuffer(k, (buf) => {
    if (mySeq !== playSeq) return; // 已被更新的播放/停止取代
    if (!buf) {
      opts.onError?.();
      return;
    }
    const ctx = ensureAudioCtx();
    if (!ctx) {
      opts.onError?.();
      return;
    }
    if (ctx.state === "suspended" && ctx.resume) {
      try {
        void ctx.resume();
      } catch {
        /* ignore */
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const r = opts.rate && opts.rate > 0 ? opts.rate : 1;
    src.playbackRate.value = r;
    src.connect(ctx.destination);
    src.onended = () => {
      if (mySeq !== playSeq || currentSource !== src) return;
      currentSource = null;
      const dur = (buf.duration / (src.playbackRate.value || 1)) * 1000;
      opts.onEnd?.(dur);
    };
    currentSource = src;
    try {
      src.start(0);
    } catch {
      currentSource = null;
      opts.onError?.();
    }
  });
  return true;
}

/** 远程 URL 播放（在线形态；现代浏览器支持 preservesPitch 保音高）。 */
function playRemoteUrl(url: string, opts: PlayMp3Opts = {}): boolean {
  const mySeq = ++playSeq;
  try {
    const a = new Audio(url);
    const r = opts.rate && opts.rate > 0 ? opts.rate : 1;
    a.playbackRate = r;
    if ("preservesPitch" in a) a.preservesPitch = true;
    const durMs = () =>
      Number.isFinite(a.duration) && a.duration > 0 ? (a.duration / (a.playbackRate || 1)) * 1000 : undefined;
    const settle = (failed: boolean) => {
      if (mySeq !== playSeq || currentElement !== a) return;
      currentElement = null;
      if (failed) opts.onError?.();
      else opts.onEnd?.(durMs());
    };
    a.onended = () => settle(false);
    a.onerror = () => settle(true);
    currentElement = a;
    const p = a.play();
    if (p) p.catch(() => settle(true));
    return true;
  } catch {
    return false;
  }
}

/** 立即停止当前播放（远程元素 + base64 buffer，并使进行中的异步加载/解码失效）。 */
export function stopCurrentAudio(): void {
  playSeq += 1;
  if (currentElement) {
    try {
      currentElement.pause();
    } catch {
      /* ignore */
    }
    currentElement = null;
  }
  if (currentSource) {
    try {
      currentSource.stop();
    } catch {
      /* ignore */
    }
    currentSource = null;
  }
}

/** 当前正在播放的音频立即变速（不打断；远程元素 + buffer source 双态）。 */
export function setCurrentAudioRate(r: number): void {
  if (r <= 0) return;
  if (currentElement) currentElement.playbackRate = r;
  if (currentSource) currentSource.playbackRate.value = r;
}

/** 调试/兼容：原「路径化」函数（句子/词卡 mp3 时代遗留；base64 时代不再用于播放）。 */
export function audioUrl(key: string): string {
  if (/^(https?:|data:|blob:)/i.test(key)) return key;
  const k = normalizeKey(key);
  return `./audio/${groupOf(k)}.js`;
}
