/**
 * 统一打印底座（R8 · D08 §3.2 方案 A）
 *
 * 壳内页面（打卡单 / 未来复盘本等）的打印统一入口：WebView2 `window.print()` 直调，
 * 零新依赖（不走 iframe / print-js——WebView2 下静默 no-op，wry#1557）。
 * content 窗口（内容包 H5）导出 PDF 能力已随 D09 §7 步骤2 壳加固移除
 * （`print_content` 命令整体删除，防内容 JS 经 invoke 调用 window.print()）。
 * 本函数仅服务壳 UI 自身页面打印；所有页面另受 contextmenu/快捷键阻断（main.tsx + Rust 注入）。
 */
export function printCurrentPage(): void {
  window.print();
}
