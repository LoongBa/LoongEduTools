// 原版教材·学科归类（保留自设计源 pdf-scan.ts）
// 目录扫描本体已由 Tauri Rust 命令 textbook_scan（commands/textbook.rs）接管——
// 浏览器 File System Access API 在桌面壳不可用；本文件仅保留前端学科归类逻辑
// （toTextbook 组合 dir_name + titles 后调用），与 Rust 端识别口径解耦。

/** 依据目录名与识别出的标题猜学科标签 */
export function guessSubject(dirName: string, titles: string[]): string {
  const hay = `${dirName} ${titles.join(" ")}`.toLowerCase();
  if (/(eng|english|pep-eng|oxford|phonics|raz|英语|绘本)/.test(hay)) return "英语";
  if (/(yuwen|chinese|语文|统编|古诗|诗词|识字)/.test(hay)) return "语文";
  if (/(math|数学|口算|计算)/.test(hay)) return "数学";
  if (/(sci|science|科学|实验)/.test(hay)) return "科学";
  return "综合";
}