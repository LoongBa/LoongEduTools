/** 课堂口令：签发/续期/下载/机器绑定 · A01 §3 / D03 §5 / S01 §3.2 */
import type { Env } from "../types";
// Env 仅作类型标注，运行时由 index.ts 注入
import {
  BadRequest,
  Forbidden,
  NotFound,
  isRecord,
  json,
  readJson,
  requireStr,
} from "../lib/errors";
import {
  LICENSE_RENEW_LIMITS,
  bumpRate,
} from "../lib/ratelimit";
import {
  currentSemester,
  isValidSemester,
  newLicenseId,
  semesterExpiresAt,
} from "../lib/semester";
import { signLicensePack, type LicenseScope } from "../lib/sign";

interface ClassroomRow {
  id: string;
  teacher_id: string;
  semester: string;
  license_level: number;
  expires_at: string;
  machine_count: number;
  machines: string;
  status: string;
  created_at: string;
}

function parseMachines(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function loadClassroom(
  env: Env,
  teacherId: string,
  semester: string,
): Promise<ClassroomRow | null> {
  return env.DB.prepare(
    "SELECT * FROM classroom_licenses WHERE teacher_id = ? AND semester = ?",
  )
    .bind(teacherId, semester)
    .first<ClassroomRow>();
}

async function upsertClassroom(
  env: Env,
  teacherId: string,
  semester: string,
  licenseLevel: number,
): Promise<ClassroomRow> {
  const existing = await loadClassroom(env, teacherId, semester);
  const now = new Date().toISOString();
  const expires = semesterExpiresAt(semester);
  if (existing) {
    await env.DB.prepare(
      `UPDATE classroom_licenses SET license_level = ?, expires_at = ?, status = 'valid' WHERE id = ?`,
    )
      .bind(licenseLevel, expires, existing.id)
      .run();
    const re = await loadClassroom(env, teacherId, semester);
    if (!re) throw new Error("口令更新失败");
    return re;
  }
  const id = newLicenseId();
  await env.DB.prepare(
    `INSERT INTO classroom_licenses (id, teacher_id, semester, license_level, expires_at, machine_count, machines, status, created_at)
     VALUES (?, ?, ?, ?, ?, 0, '[]', 'valid', ?)`,
  )
    .bind(id, teacherId, semester, licenseLevel, expires, now)
    .run();
  const created = await loadClassroom(env, teacherId, semester);
  if (!created) throw new Error("口令创建失败");
  return created;
}

function toScope(row: ClassroomRow, quota: number): LicenseScope {
  return {
    machine_quota: quota,
    bound_machines: parseMachines(row.machines),
    license_level: row.license_level,
  };
}

async function machineQuota(env: Env, teacherId: string): Promise<number> {
  const lic = await env.DB.prepare(
    "SELECT machine_quota FROM licenses WHERE teacher_id = ? AND status = 'bound' ORDER BY bound_at DESC LIMIT 1",
  )
    .bind(teacherId)
    .first<{ machine_quota: number }>();
  return lic?.machine_quota ?? 3;
}

/** POST /license/renew */
export async function licenseRenew(req: Request, env: Env, userId: string, userLvl: number): Promise<Response> {
  await bumpRate(env.KV, "lic_renew", userId, LICENSE_RENEW_LIMITS);
  const body = await readJson(req);
  if (!isRecord(body)) throw new BadRequest("请求体须为 JSON");
  const semRaw = typeof body.semester === "string" && body.semester ? body.semester : currentSemester();
  if (!isValidSemester(semRaw)) throw new BadRequest("学期格式须为 YYYYA 或 YYYYS");
  const semester = semRaw.trim();
  if (userLvl < 1) throw new Forbidden("教师身份认证未通过");
  // 未绑激活码也可签发 level=1；绑定后升 2
  const t = await env.DB.prepare("SELECT license_level FROM teachers WHERE id = ?")
    .bind(userId)
    .first<{ license_level: number }>();
  const level = t?.license_level ?? userLvl;
  const row = await upsertClassroom(env, userId, semester, level);
  const quota = await machineQuota(env, userId);
  const scope = toScope(row, quota);
  const pack = await signLicensePack(
    {
      schema_version: "1.0",
      license_type: "classroom",
      teacher_id: userId,
      semester,
      issued_at: row.created_at || new Date().toISOString(),
      expires_at: row.expires_at,
      scope,
    },
    env,
  );
  // 存 R2（best-effort）
  try {
    await env.R2_PACK.put(
      `license/${userId}/${semester}.json`,
      JSON.stringify(pack),
      { httpMetadata: { contentType: "application/json" } },
    );
  } catch (e) {
    console.warn("[license] R2 put failed", e);
  }
  return json({
    license_pack: pack,
    download_url: `/api/edu/license/pack?tid=${encodeURIComponent(userId)}&sem=${encodeURIComponent(semester)}`,
  });
}

/** GET /license/pack?tid&sem */
export async function licensePack(req: Request, env: Env, userId: string): Promise<Response> {
  const url = new URL(req.url);
  const tid = url.searchParams.get("tid") || userId;
  const sem = url.searchParams.get("sem") || currentSemester();
  if (tid !== userId) throw new Forbidden("只能下载本人口令包");
  if (!isValidSemester(sem)) throw new BadRequest("学期格式不正确");
  const key = `license/${userId}/${sem}.json`;
  const obj = await env.R2_PACK.get(key);
  if (!obj) {
    // 回退：现场重签
    const row = await loadClassroom(env, userId, sem);
    if (!row) throw new NotFound("口令不存在，请先申请");
    const quota = await machineQuota(env, userId);
    const pack = await signLicensePack(
      {
        schema_version: "1.0",
        license_type: "classroom",
        teacher_id: userId,
        semester: sem,
        issued_at: row.created_at || new Date().toISOString(),
        expires_at: row.expires_at,
        scope: toScope(row, quota),
      },
      env,
    );
    return json(pack);
  }
  return new Response(obj.body, {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** POST /license/bind */
export async function licenseBind(req: Request, env: Env, userId: string): Promise<Response> {
  const body = await readJson(req);
  if (!isRecord(body)) throw new BadRequest("请求体须为 JSON");
  const fp = requireStr(body.machine_fp, "machine_fp");
  const semRaw = typeof body.semester === "string" && body.semester ? body.semester : currentSemester();
  if (!isValidSemester(semRaw)) throw new BadRequest("学期格式须为 YYYYA 或 YYYYS");
  const semester = semRaw.trim();
  const row = await loadClassroom(env, userId, semester);
  if (!row || row.status !== "valid") throw new Forbidden("口令无效，请先申请/续期");
  const machines = parseMachines(row.machines);
  if (machines.includes(fp)) {
    return json({ bound_machines: machines.length, quota: await machineQuota(env, userId) });
  }
  const quota = await machineQuota(env, userId);
  if (machines.length >= quota) {
    throw new Forbidden(`已达绑定上限（${quota} 台）`);
  }
  machines.push(fp);
  await env.DB.prepare(
    "UPDATE classroom_licenses SET machines = ?, machine_count = ? WHERE id = ?",
  )
    .bind(JSON.stringify(machines), machines.length, row.id)
    .run();
  // 重签口令包（含新 machines）
  const t = await env.DB.prepare("SELECT license_level FROM teachers WHERE id = ?")
    .bind(userId)
    .first<{ license_level: number }>();
  const pack = await signLicensePack(
    {
      schema_version: "1.0",
      license_type: "classroom",
      teacher_id: userId,
      semester,
      issued_at: row.created_at || new Date().toISOString(),
      expires_at: row.expires_at,
      scope: {
        machine_quota: quota,
        bound_machines: machines,
        license_level: t?.license_level ?? row.license_level,
      },
    },
    env,
  );
  try {
    await env.R2_PACK.put(`license/${userId}/${semester}.json`, JSON.stringify(pack));
  } catch (e) {
    console.warn("[license] R2 put failed", e);
  }
  return json({ bound_machines: machines.length, quota, license_pack: pack });
}

export { loadClassroom, machineQuota, parseMachines };
