/** ed25519 口令包签名 · S01 §3.2 / D03 §5.3。LICENSE_SIGN_KEY 缺省时临时自签并 warning。 */
import type { Env } from "../types";

export interface LicenseScope {
  machine_quota: number;
  bound_machines: string[];
  license_level: number;
}

export interface LicenseBody {
  schema_version: string;
  license_type: string;
  teacher_id: string;
  semester: string;
  issued_at: string;
  expires_at: string;
  scope: LicenseScope;
}

export interface SignatureBlock {
  alg: "ed25519";
  key_id: string;
  signed_payload_hash: string;
  sig: string;
}

export interface LicensePack {
  license: LicenseBody;
  signature: SignatureBlock;
}

function canonicalize(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalize).join(",")}]`;
  const rec = v as Record<string, unknown>;
  const keys = Object.keys(rec).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(rec[k])}`).join(",")}}`;
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

async function importEd25519(env: Env): Promise<CryptoKey> {
  const pemOrB64 = env.LICENSE_SIGN_KEY;
  if (!pemOrB64) {
    console.warn("[sign] LICENSE_SIGN_KEY 缺省，使用临时自签密钥（仅供本地联调，勿用于生产）");
    const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    return kp.privateKey;
  }
  // PEM
  const der = pemOrB64.includes("BEGIN")
    ? pemToRaw(pemOrB64)
    : (() => {
        const bin = atob(pemOrB64.replace(/\s+/g, ""));
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        return u8;
      })();
  if (!der) throw new Error("LICENSE_SIGN_KEY 格式无法解析");
  return crypto.subtle.importKey("pkcs8", der as unknown as BufferSource, { name: "Ed25519" }, false, [
    "sign",
  ]);
}

export async function signLicensePack(body: LicenseBody, env: Env): Promise<LicensePack> {
  const canonical = canonicalize(body);
  const hash = await sha256Hex(canonical);
  const key = await importEd25519(env);
  const sigBuf = await crypto.subtle.sign(
    { name: "Ed25519" },
    key,
    new TextEncoder().encode(canonical),
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
  return {
    license: body,
    signature: {
      alg: "ed25519",
      key_id: env.LICENSE_SIGN_KEY_ID || "license-sign-2026",
      signed_payload_hash: `sha256:${hash}`,
      sig: sigB64,
    },
  };
}
