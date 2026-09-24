/** HS256 JWT 自实现（WebCrypto，零依赖）。payload { sub, lvl, exp, iat, jti } · A01 §1.3 */

export interface JwtPayload {
  sub: string;
  lvl: number;
  exp: number;
  iat: number;
  jti: string;
}

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signJwt(
  payload: Omit<JwtPayload, "iat" | "exp" | "jti"> & { sub: string; lvl: number },
  secret: string,
  ttlSec = 604800, // 7 天
): Promise<{ jwt: string; expiresIn: number; jti: string }> {
  const now = Math.floor(Date.now() / 1000);
  const jti = crypto.randomUUID();
  const full: JwtPayload = { ...payload, iat: now, exp: now + ttlSec, jti };
  const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64url(enc.encode(JSON.stringify(full)));
  const data = `${header}.${body}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return { jwt: `${data}.${b64url(sig)}`, expiresIn: ttlSec, jti };
}

export type VerifyResult =
  | { ok: true; payload: JwtPayload }
  | { ok: false; reason: "malformed" | "bad_sig" | "expired" };

export async function verifyJwt(token: string, secret: string): Promise<VerifyResult> {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    return { ok: false, reason: "malformed" };
  }
  const key = await hmacKey(secret);
  const sig = b64urlDecode(parts[2]);
  const data = `${parts[0]}.${parts[1]}`;
  const good = await crypto.subtle.verify(
    "HMAC",
    key,
    sig as unknown as BufferSource,
    enc.encode(data),
  );
  if (!good) return { ok: false, reason: "bad_sig" };
  try {
    const json = new TextDecoder().decode(b64urlDecode(parts[1]));
    const payload = JSON.parse(json) as JwtPayload;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
      return { ok: false, reason: "expired" };
    }
    if (typeof payload.sub !== "string") return { ok: false, reason: "malformed" };
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}
