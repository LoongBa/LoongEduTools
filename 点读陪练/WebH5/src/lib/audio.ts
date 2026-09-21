// 音频：优先播放管线 TTS 生成的 mp3（public/units/u01/audio/），失败由调用方回退浏览器朗读
const AUDIO_DIR = "/units/u01/audio";

/** 把内容包 audio 字段值（可能已带 .mp3 后缀）规整成 public 下的可播放相对路径 */
export function audioUrl(key: string): string {
  const file = key.toLowerCase().endsWith(".mp3") ? key : `${key}.mp3`;
  return `${AUDIO_DIR}/${file}`;
}

/** 尝试播放 mp3。
 *  同步失败（无 key / 非法路径）返回 false；
 *  404 或解码失败等异步错误通过 onEnd 通知（调用方可借机回退浏览器朗读）。 */
export function playAudioFile(key: string, onEnd?: () => void): boolean {
  if (!key) return false;
  try {
    const a = new Audio(audioUrl(key));
    const done = () => onEnd?.();
    a.addEventListener("ended", done, { once: true });
    a.addEventListener("error", done, { once: true });
    const p = a.play();
    if (p) p.catch(done);
    return true;
  } catch {
    return false;
  }
}
