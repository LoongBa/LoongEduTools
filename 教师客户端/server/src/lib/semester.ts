/** 学期与口令到期日规则 · D03 §5.1：A=春(2-8月) → YYYY-08-31；S=秋(9-次年1月) → (YYYY+1)-01-31 */

export function currentSemester(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1; // 1-12
  // 9-12 月 → 当年秋 S；1-8 月 → 当年春 A（春学期从当年 2 月起算，1 月仍属上一秋尾）
  if (m >= 9) return `${y}S`;
  return `${y}A`;
}

export function semesterExpiresAt(semester: string): string {
  const m = /^(\d{4})([AS])$/.exec(semester.trim());
  if (!m) throw new Error(`非法学期: ${semester}`);
  const year = Number(m[1]);
  const tag = m[2];
  if (tag === "A") {
    // 春学期：当年 8-31
    return `${year}-08-31T23:59:59.000Z`;
  }
  // 秋学期：次年 1-31
    return `${year + 1}-01-31T23:59:59.000Z`;
}

export function isValidSemester(s: string): boolean {
  return /^\d{4}[AS]$/.test(s.trim());
}

export function nanoid12(): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  const buf = crypto.getRandomValues(new Uint8Array(12));
  let out = "";
  for (const b of buf) out += alphabet[b % alphabet.length];
  return out;
}

export function newTeacherId(): string {
  return `t_${nanoid12()}`;
}

export function newLicenseId(): string {
  return `lcs_${nanoid12()}`;
}
