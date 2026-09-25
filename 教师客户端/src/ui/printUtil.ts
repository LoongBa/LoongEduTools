/**
 * 统一打印底座（R8 · D08 §3.2 方案 A）
 *
 * 壳内页面（打卡单 / 未来反思本等）的打印统一入口：WebView2 `window.print()` 直调，
 * 零新依赖（不走 iframe / print-js——WebView2 下静默 no-op，wry#1557）。
 * content 窗口（内容包 H5）走 Rust 侧 `window::print_content`（见 api.printContent），
 * 壳内页面一律经本函数。
 */
export function printCurrentPage(): void {
  window.print();
}
