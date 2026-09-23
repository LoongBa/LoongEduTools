// 音频：优先播放管线 TTS 生成的 mp3（public/units/u01/audio/），失败由调用方回退浏览器朗读
// 注意：不再写死单元——管线文件名（u01_s7_01.mp3）由内容包定位到对应单元的 audio/；
// 完整路径（/units/u01/song/line_01.mp3，点唱台教材跟读）原样返回。

/** 把内容包 audio 字段值规整成 public 下的可播放路径。
 *  已带 /units/ 完整路径 → 原样；否则按管线约定落到当前单元 audio/。 */
export function audioUrl(key: string): string {
  if (key.startsWith("/")) return key;
  const file = key.toLowerCase().endsWith(".mp3") ? key : `${key}.mp3`;
  // 管线文件按单元目录：取文件名前缀的 uXX（如 u01_s7_01.mp3 → u01）
  const m = /^(u\d+|g\d+[ab]?u\d+|[a-z]+\d+)/i.exec(file);
  const unitDir = m ? m[1].toLowerCase() : "u01";
  return `/units/${unitDir}/audio/${file}`;
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
