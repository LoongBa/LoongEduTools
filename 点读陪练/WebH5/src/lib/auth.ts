// 在线验证抽象（P0 桩）。
// 授权验证：在线版走 SCF JWT 激活（架构文档 §3.2：手机号+口令+短信 → JWT 存 localStorage）；
// 离线版走本地口令 hash 校验 + localStorage 激活标记（§3.3，P2 落地）。
// P0 只定义接口 + 默认未激活实现，保证在线能力可挂载、离线形态零影响。
export interface AuthProvider {
  /** 当前是否已通过授权验证（激活） */
  isActivated(): boolean;
  /** 有效 JWT（在线登录态）；离线本地口令激活无 token */
  token(): string | null;
}

/** 默认（未激活）桩：离线 zip / 未登录在线版均未激活。 */
export const localAuth: AuthProvider = {
  isActivated: () => false,
  token: () => null,
};

let authProvider: AuthProvider = localAuth;

export function registerAuthProvider(p: AuthProvider): void {
  authProvider = p;
}

export function currentAuth(): AuthProvider {
  return authProvider;
}
