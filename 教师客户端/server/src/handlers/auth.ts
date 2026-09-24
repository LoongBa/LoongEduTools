/** 认证：微信桩 / 短信 / 密码 / profile / activate / refresh · A01 §2 / D03 §4 */
import type { Env } from "../types";
import {
  AuthExpired,
  BadRequest,
  Forbidden,
  NotFound,
  Unauthorized,
  isRecord,
  json,
  jsonError,
  readJson,
  requireStr,
} from "../lib/errors";
import { signJwt, verifyJwt, type JwtPayload } from "../lib/jwt";
import { hashPassword, verifyPassword } from "../lib/password";
import {
  AUTH_FAIL_LIMITS,
  SMS_SEND_LIMITS,
  bumpRate,
  countAuthFail,
  envHasJwt,
  resetAuthFail,
} from "../lib/ratelimit";
import { newTeacherId } from "../lib/semester";

export interface TeacherRow {
  id: string;
  openid: string | null;
  phone: string | null;
  password_hash: string | null;
  name: string | null;
  grade: string | null;
  subject: string | null;
  agree_terms: number;
  license_level: number;
  status: string;
}

export function teacherPublic(t: TeacherRow) {
  return {
    id: t.id,
    name: t.name,
    grade: t.grade,
    subject: t.subject,
    license_level: t.license_level,
    phone_masked: t.phone ? maskPhone(t.phone) : null,
    status: t.status,
    agree_terms: t.agree_terms === 1,
  };
}

export function maskPhone(p: string): string {
  if (p.length < 7) return p;
  return `${p.slice(0, 3)}****${p.slice(-4)}`;
}

/** 从 Authorization: Bearer 解析并校验 JWT，返回 payload */
export async function requireAuth(req: Request, env: Env): Promise<JwtPayload> {
  const secret = envHasJwt(env);
  const h = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  if (!m || !m[1]) throw new Unauthorized("未登录");
  const v = await verifyJwt(m[1], secret);
  if (!v.ok) {
    if (v.reason === "expired") throw new AuthExpired("登录已过期");
    throw new Unauthorized("凭证无效");
  }
  const row = await env.DB.prepare("SELECT status, license_level FROM teachers WHERE id = ?")
    .bind(v.payload.sub)
    .first<{ status: string; license_level: number }>();
  if (!row) throw new Unauthorized("账号不存在");
  if (row.status === "disabled") throw new Forbidden("账号已被停用");
  return { ...v.payload, lvl: row.license_level };
}

async function issueSession(
  env: Env,
  t: TeacherRow,
  deviceId: string,
): Promise<Response> {
  const secret = envHasJwt(env);
  const { jwt, expiresIn, jti } = await signJwt(
    { sub: t.id, lvl: t.license_level },
    secret,
  );
  const refresh = crypto.randomUUID();
  await env.KV.put(`rt:${jti}`, JSON.stringify({ teacher_id: t.id, refresh, device_id: deviceId }), {
    expirationTtl: 604800,
  });
  // 也可用 refresh 直接查：存一份 refresh → jti
  await env.KV.put(`rtoken:${refresh}`, jti, { expirationTtl: 604800 });
  return json({ jwt, expires_in: expiresIn, refresh_token: refresh, teacher: teacherPublic(t) });
}

async function findOrCreateByPhone(env: Env, phone: string): Promise<TeacherRow> {
  const exist = await env.DB.prepare("SELECT * FROM teachers WHERE phone = ?")
    .bind(phone)
    .first<TeacherRow>();
  if (exist) return exist;
  const id = newTeacherId();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO teachers (id, phone, license_level, status, created_at, updated_at)
     VALUES (?, ?, 1, 'active', ?, ?)`,
  )
    .bind(id, phone, now, now)
    .run();
  const created = await env.DB.prepare("SELECT * FROM teachers WHERE id = ?")
    .bind(id)
    .first<TeacherRow>();
  if (!created) throw new Error("注册失败");
  return created;
}

// ------------------------------------------------------------------ 微信扫码（501 桩 · D03 §4.1）

export async function wechatQr(_req: Request, _env: Env): Promise<Response> {
  return jsonError("INTERNAL", "微信扫码登录尚未开放（微信开放平台审核中），请使用短信或密码登录");
}

export async function wechatStatus(_req: Request, _env: Env): Promise<Response> {
  return jsonError("INTERNAL", "微信扫码登录尚未开放（微信开放平台审核中）");
}

// ------------------------------------------------------------------ 短信

export async function smsSend(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  if (!isRecord(body)) throw new BadRequest("请求体须为 JSON");
  const phone = requireStr(body.phone, "phone");
  if (!/^1\d{10}$/.test(phone)) throw new BadRequest("手机号格式不正确");
  await bumpRate(env.KV, "sms_send", phone, SMS_SEND_LIMITS);
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, "0");
  await env.KV.put(`sms:${phone}`, JSON.stringify({ code, exp: Date.now() + 300_000 }), {
    expirationTtl: 300,
  });
  if ((env.SMS_MOCK || "true") === "true") {
    console.log(`[SMS_MOCK] ${phone} => ${code}`);
  } else {
    // 腾讯云短信：审核通过后接入（D03 §4.2），P1 不阻塞
    console.warn("[sms] SMS_MOCK=false 但腾讯云短信未接入，仅 KV 落码");
  }
  return json({ retry_in: 60 });
}

export async function smsVerify(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  if (!isRecord(body)) throw new BadRequest("请求体须为 JSON");
  const phone = requireStr(body.phone, "phone");
  const code = requireStr(body.code, "code");
  const deviceId = typeof body.device_id === "string" ? body.device_id : "unknown";
  const raw = await env.KV.get(`sms:${phone}`);
  if (!raw) throw new BadRequest("验证码已过期，请重新获取");
  let stored: { code: string; exp: number };
  try {
    stored = JSON.parse(raw) as { code: string; exp: number };
  } catch {
    throw new BadRequest("验证码已过期");
  }
  if (Date.now() > stored.exp) throw new BadRequest("验证码已过期");
  if (stored.code !== code) {
    await countAuthFail(env.KV, phone);
    throw new Unauthorized("验证码错误");
  }
  await env.KV.delete(`sms:${phone}`);
  await resetAuthFail(env.KV, phone);
  const t = await findOrCreateByPhone(env, phone);
  if (t.status === "disabled") throw new Forbidden("账号已被停用");
  return issueSession(env, t, deviceId);
}

// ------------------------------------------------------------------ 密码

export async function passwordLogin(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  if (!isRecord(body)) throw new BadRequest("请求体须为 JSON");
  const phone = requireStr(body.phone, "phone");
  const password = requireStr(body.password, "password");
  const deviceId = typeof body.device_id === "string" ? body.device_id : "unknown";
  const t = await env.DB.prepare("SELECT * FROM teachers WHERE phone = ?")
    .bind(phone)
    .first<TeacherRow>();
  if (!t || !t.password_hash) {
    await countAuthFail(env.KV, phone);
    throw new Unauthorized("手机号或密码错误");
  }
  const ok = await verifyPassword(password, t.password_hash);
  if (!ok) {
    await countAuthFail(env.KV, phone);
    throw new Unauthorized("手机号或密码错误");
  }
  if (t.status === "disabled") throw new Forbidden("账号已被停用");
  await resetAuthFail(env.KV, phone);
  return issueSession(env, t, deviceId);
}

export async function passwordReset(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  if (!isRecord(body)) throw new BadRequest("请求体须为 JSON");
  const phone = requireStr(body.phone, "phone");
  const code = requireStr(body.code, "code");
  const newPassword = requireStr(body.new_password, "new_password");
  if (newPassword.length < 6) throw new BadRequest("密码至少 6 位");
  const raw = await env.KV.get(`sms:${phone}`);
  if (!raw) throw new BadRequest("验证码已过期，请重新获取");
  const stored = JSON.parse(raw) as { code: string; exp: number };
  if (Date.now() > stored.exp || stored.code !== code) throw new Unauthorized("验证码错误");
  const t = await env.DB.prepare("SELECT id FROM teachers WHERE phone = ?")
    .bind(phone)
    .first<{ id: string }>();
  if (!t) throw new BadRequest("该手机号未注册");
  const hash = await hashPassword(newPassword);
  await env.DB.prepare("UPDATE teachers SET password_hash = ?, updated_at = ? WHERE id = ?")
    .bind(hash, new Date().toISOString(), t.id)
    .run();
  await env.KV.delete(`sms:${phone}`);
  return json({ ok: true });
}

// ------------------------------------------------------------------ profile / activate / refresh

export async function authProfile(req: Request, env: Env): Promise<Response> {
  const payload = await requireAuth(req, env);
  const body = await readJson(req);
  if (!isRecord(body)) throw new BadRequest("请求体须为 JSON");
  const grade = requireStr(body.grade, "grade");
  const subject = requireStr(body.subject, "subject");
  const agree = body.agree_terms === true;
  if (!agree) throw new BadRequest("需同意条款");
  if (!/^[1-6]$/.test(grade)) throw new BadRequest("任教年级须为 1-6");
  await env.DB.prepare(
    "UPDATE teachers SET grade = ?, subject = ?, agree_terms = 1, updated_at = ? WHERE id = ?",
  )
    .bind(grade, subject, new Date().toISOString(), payload.sub)
    .run();
  const t = await env.DB.prepare("SELECT * FROM teachers WHERE id = ?")
    .bind(payload.sub)
    .first<TeacherRow>();
  if (!t) throw new Unauthorized("账号不存在");
  return json({ teacher: teacherPublic(t) });
}

export async function authActivate(req: Request, env: Env): Promise<Response> {
  const payload = await requireAuth(req, env);
  const body = await readJson(req);
  if (!isRecord(body)) throw new BadRequest("请求体须为 JSON");
  const licenseKey = requireStr(body.license_key, "license_key");
  const lic = await env.DB.prepare("SELECT * FROM licenses WHERE license_key = ?")
    .bind(licenseKey)
    .first<{ license_key: string; teacher_id: string | null; license_level: number; machine_quota: number; status: string }>();
  if (!lic) throw new NotFound("激活码不存在");
  if (lic.status === "revoked") throw new Forbidden("激活码已作废");
  if (lic.status === "bound" && lic.teacher_id !== payload.sub) {
    throw new Forbidden("该激活码已绑定其他账号");
  }
  const now = new Date().toISOString();
  if (lic.status === "unused") {
    await env.DB.prepare(
      "UPDATE licenses SET teacher_id = ?, status = 'bound', bound_at = ? WHERE license_key = ?",
    )
      .bind(payload.sub, now, licenseKey)
      .run();
    await env.DB.prepare("UPDATE teachers SET license_level = ?, updated_at = ? WHERE id = ?")
      .bind(Math.max(2, lic.license_level || 2), now, payload.sub)
      .run();
  }
  const t = await env.DB.prepare("SELECT * FROM teachers WHERE id = ?")
    .bind(payload.sub)
    .first<TeacherRow>();
  const bound = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM licenses WHERE teacher_id = ?",
  )
    .bind(payload.sub)
    .first<{ n: number }>();
  return json({
    ok: true,
    license_level: t?.license_level ?? 2,
    machine_quota: lic.machine_quota,
    bound_machines: 0,
    bound_licenses: bound?.n ?? 0,
  });
}

export async function authRefresh(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  if (!isRecord(body)) throw new BadRequest("请求体须为 JSON");
  const refreshToken = requireStr(body.refresh_token, "refresh_token");
  const jti = await env.KV.get(`rtoken:${refreshToken}`);
  if (!jti) throw new AuthExpired("刷新凭证已失效，请重新登录");
  const rec = await env.KV.get(`rt:${jti}`);
  if (!rec) throw new AuthExpired("刷新凭证已失效，请重新登录");
  const { teacher_id } = JSON.parse(rec) as { teacher_id: string };
  const t = await env.DB.prepare("SELECT * FROM teachers WHERE id = ?")
    .bind(teacher_id)
    .first<TeacherRow>();
  if (!t || t.status === "disabled") throw new Unauthorized("账号无效");
  // 旧 refresh 作废，签发新 JWT + 新 refresh
  await env.KV.delete(`rt:${jti}`);
  await env.KV.delete(`rtoken:${refreshToken}`);
  return issueSession(env, t, "refresh");
}


