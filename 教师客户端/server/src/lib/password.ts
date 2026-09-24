/** PBKDF2-SHA256 密码哈希（Workers 原生 WebCrypto；bcrypt 不可用，见 README 偏离说明） */
const ITER = 100_000;

function b64(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: ITER, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return `pbkdf2$${ITER}$${b64(salt.buffer)}$${b64(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iter = Number(parts[1]);
  if (!Number.isFinite(iter) || iter <= 0) return false;
  const salt = unb64(parts[2]!);
  const expected = unb64(parts[3]!);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: iter, hash: "SHA-256" },
      keyMaterial,
      expected.length * 8,
    ),
  );
  if (bits.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < bits.length; i++) diff |= bits[i]! ^ expected[i]!;
  return diff === 0;
}
