/// Cloudflare Workers 环境绑定（A01 §1.1 / D03 §2.1）
export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  R2_PACK: R2Bucket;
  /** HS256 签名密钥（Secret，必配） */
  JWT_SECRET?: string;
  /** ed25519 口令包签名私钥（PKCS8 PEM 或 base64 raw 32B，Secret；缺省时自签并打 warning） */
  LICENSE_SIGN_KEY?: string;
  LICENSE_SIGN_KEY_ID?: string;
  /** 内容包管理接口密钥（Secret） */
  PKG_ADMIN_KEY?: string;
  /** "true" = 不真发短信，验证码打日志 */
  SMS_MOCK?: string;
  SMS_SECRET?: string;
}

/** A01 §1.2 统一错误结构 */
export type ErrCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "AUTH_EXPIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "INTERNAL";

export interface AuthUser {
  id: string;
  license_level: number;
  status: string;
}
