/** KV 限频计数 · A01 §6 表 */
import type { Env } from "../types";
import { RateLimited } from "./errors";

export interface Limit {
  /** 窗口内允许次数 */
  max: number;
  /** 窗口秒数 */
  windowSec: number;
}

/** 同一 key 在给定窗口内的累计次数；超限抛 RATE_LIMITED。计数 key 含窗口后缀。 */
export async function bumpRate(
  kv: KVNamespace,
  bucket: string,
  key: string,
  limits: Limit[],
): Promise<void> {
  for (const lim of limits) {
    const rk = `rl:${bucket}:${key}:${lim.windowSec}:${Math.floor(Date.now() / 1000 / lim.windowSec)}`;
    const raw = await kv.get(rk);
    const n = raw ? Number(raw) : 0;
    if (n >= lim.max) {
      throw new RateLimited("请求过于频繁，请稍后再试");
    }
    await kv.put(rk, String(n + 1), { expirationTtl: lim.windowSec + 5 });
  }
}

export const SMS_SEND_LIMITS: Limit[] = [
  { max: 1, windowSec: 60 },
  { max: 5, windowSec: 3600 },
  { max: 10, windowSec: 86400 },
];

export const AUTH_FAIL_LIMITS: Limit[] = [{ max: 5, windowSec: 3600 }];

export const PKG_DOWNLOAD_LIMITS: Limit[] = [{ max: 100, windowSec: 3600 }];

export const LICENSE_RENEW_LIMITS: Limit[] = [{ max: 3, windowSec: 86400 }];

/** 认证失败计数（不使用 bump 的「先增后查」语义——此处独立函数便于失败时调用） */
export async function countAuthFail(kv: KVNamespace, phone: string): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000);
  const rk = `rl:authfail:${phone}:${Math.floor(nowSec / 3600)}`;
  const raw = await kv.get(rk);
  const n = raw ? Number(raw) : 0;
  if (n >= 5) throw new RateLimited("登录失败过多，请 1 小时后再试");
  await kv.put(rk, String(n + 1), { expirationTtl: 3605 });
}

export async function resetAuthFail(kv: KVNamespace, phone: string): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000);
  await kv.delete(`rl:authfail:${phone}:${Math.floor(nowSec / 3600)}`);
}

export function envHasJwt(env: Env): string {
  if (!env.JWT_SECRET) {
    throw new Error("JWT_SECRET 未配置");
  }
  return env.JWT_SECRET;
}
