/**
 * 错误归一化：纯浏览器环境（未注入 __TAURI_INTERNALS__）下任何 invoke 都会抛
 * `TypeError: Cannot read properties of undefined (reading 'invoke')` —— 对教师
 * 毫无信息量，归一成可读指引；其余错误原样透传。
 */
export function friendlyErr(e: unknown): string {
  const s = String(e);
  return s.includes("reading 'invoke'") || s.includes('reading "invoke"')
    ? "当前以浏览器方式打开页面（非客户端环境），系统命令不可用：请通过「桃李助手」客户端程序启动。"
    : s;
}
