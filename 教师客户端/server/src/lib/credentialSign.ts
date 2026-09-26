/**
 * ed25519 签名凭证签发 · D09 §2.2 / A01 §4.5。
 *
 * 信任域独立：内容包/口令包签名走 lib/sign.ts（LICENSE_SIGN_KEY，key_id=license-sign-2026），
 * 签名凭证走本文件（CREDENTIAL_SIGN_PRIVATE_KEY，key_id=credential-sign-2026）——两个密钥对不共用（D09 §2.2）。
 *
 * 规范化：与 package.rs::canonical_json_sign_view 逐字节对齐（serde_json 风格转义：
 * 非 ASCII 原样 UTF-8、控制符 \u00xx 小写；TS 实现不可用 JSON.stringify 转义字符串）。
 * sig 用 hex 小写（与内容包 manifest 验签侧一致）。
 */
import type { Env } from "../types";

export const CREDENTIAL_KEY_ID = "credential-sign-2026";

/** 凭证有效期：14 天硬过期（D09 §2.6） */
export const CREDENTIAL_TTL_SEC = 14 * 24 * 3600;

/** format_ver：字符串 "1"（与旧 credential.enc 的 AES-GCM JWT 结构区分，D09 §2.1） */
export const CREDENTIAL_FORMAT_VER = "1";

export interface CredentialBody {
  format_ver: string;
  machine_fp: string;
  issued_at: number;
  expires_at: number;
  seq: number;
  /** 签发机本地 Argon2id 包裹后的不透明内容密钥（base64）；服务端不理解的字节 */
  key_material: string;
  quota_ref: string;
}

export interface CredentialSignature {
  alg: "ed25519";
  key_id: string;
  signed_payload_hash: string;
  /** ed25519 签名，hex 小写（64 字节 → 128 字符） */
  sig: string;
}

export interface CredentialPack {
  credential: CredentialBody;
  signature: CredentialSignature;
}

/** serde_json 风格字符串转义：与 package.rs esc() 对齐（非 ASCII 原样 UTF-8） */
function escString(s: string): string {
  let out = '"';
  for (const ch of s) {
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\b") out += "\\b";
    else if (ch === "\f") out += "\\f";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else {
      const c = ch.codePointAt(0) as number;
      if (c < 0x20) out += `\\u${c.toString(16).padStart(4, "0")}`;
      else out += ch; // 非 ASCII 原样 UTF-8（与 JSON.stringify 的 \uXXXX 不同）
    }
  }
  return out + '"';
}

/**
 * 凭证规范化（A01 §4.5.2）：剔除顶层 signature/checksum → 键升序 → 紧凑分隔 → serde_json 转义。
 * 与 package.rs::canonical_json_sign_view 逐字节一致，保证 Rust/TS 双端产出相同签名负载。
 */
export function canonicalizeCredential(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "string") return escString(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return JSON.stringify(v); // 整数十进制；本契约数字均在安全整数内
  if (Array.isArray(v)) return `[${v.map(canonicalizeCredential).join(",")}]`;
  if (typeof v === "object") {
    const rec = v as Record<string, unknown>;
    const keys = Object.keys(rec).sort(); // UTF-8 字节序（本契约键名全 ASCII = 字典序）
    return `{${keys
      .map((k) => `${escString(k)}:${canonicalizeCredential(rec[k])}`)
      .join(",")}}`;
  }
  return "null"; // undefined 等 —— 契约不允许，按 null 兜底不参与签名
}

async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function pemToRaw(pem: string): Uint8Array | null {
  const m = /-----BEGIN (?:PRIVATE|ENCRYPTED PRIVATE) KEY-----([\s\S]+?)-----END/.exec(pem);
  if (!m || !m[1]) return null;
  const b64 = m[1].replace(/\s+/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 导入签名凭证私钥（PKCS8 PEM 或 base64 raw 32B；缺省临时自签，仅本地联调） */
async function importCredentialKey(env: Env): Promise<CryptoKey> {
  const pemOrB64 = env.CREDENTIAL_SIGN_PRIVATE_KEY;
  if (!pemOrB64) {
    console.warn("[credential] CREDENTIAL_SIGN_PRIVATE_KEY 缺省，使用临时自签密钥（仅供本地联调，勿用于生产）");
    const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    return kp.privateKey;
  }
  const der = pemOrB64.includes("BEGIN")
    ? pemToRaw(pemOrB64)
    : (() => {
        const bin = atob(pemOrB64.replace(/\s+/g, ""));
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        return u8;
      })();
  if (!der) throw new Error("CREDENTIAL_SIGN_PRIVATE_KEY 格式无法解析");
  return crypto.subtle.importKey("pkcs8", der as unknown as BufferSource, { name: "Ed25519" }, false, [
    "sign",
  ]);
}

/** 对已组装好的凭证体做 Ed25519 签名（含 canonical + sha256 hash + hex sig） */
export async function signCredential(body: CredentialBody, env: Env): Promise<CredentialPack> {
  const canonical = canonicalizeCredential(body);
  const hash = await sha256Hex(canonical);
  const key = await importCredentialKey(env);
  const sigBuf = await crypto.subtle.sign(
    { name: "Ed25519" },
    key,
    new TextEncoder().encode(canonical),
  );
  const sigHex = [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return {
    credential: body,
    signature: {
      alg: "ed25519",
      key_id: CREDENTIAL_KEY_ID,
      signed_payload_hash: `sha256:${hash}`,
      sig: sigHex,
    },
  };
}
