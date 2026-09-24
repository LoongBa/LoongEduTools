/** 白名单上报 · A01 §5 / D03 §7。强制过滤 + ≤64KB。 */
import type { Env } from "../types";
import { BadRequest, isRecord, json, readJson } from "../lib/errors";

const MAX_BYTES = 64 * 1024;

/** 只保留白名单字段（顶层 + 嵌套），未知字段丢弃 */
function filterReport(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof input.client_version === "string") out.client_version = input.client_version.slice(0, 32);
  if (Array.isArray(input.installed_packages)) {
    out.installed_packages = input.installed_packages
      .filter(isRecord)
      .slice(0, 100)
      .map((p) => ({
        package_id: typeof p.package_id === "string" ? p.package_id.slice(0, 64) : "",
        version: typeof p.version === "string" ? p.version.slice(0, 32) : "",
      }));
  }
  if (isRecord(input.license)) {
    const lic = input.license;
    out.license = {
      semester: typeof lic.semester === "string" ? lic.semester.slice(0, 8) : "",
      status: typeof lic.status === "string" ? lic.status.slice(0, 16) : "",
      expires_at: typeof lic.expires_at === "string" ? lic.expires_at.slice(0, 32) : "",
    };
  }
  if (Array.isArray(input.usage)) {
    out.usage = input.usage
      .filter(isRecord)
      .slice(0, 200)
      .map((u) => ({
        package_id: typeof u.package_id === "string" ? u.package_id.slice(0, 64) : "",
        runs: Number(u.runs) || 0,
        seconds: Number(u.seconds) || 0,
        day: typeof u.day === "string" ? u.day.slice(0, 10) : "",
      }));
  }
  if (typeof input.crash_log === "string" && input.crash_log.length > 0) {
    out.crash_log = input.crash_log.slice(0, 8192);
  } else {
    out.crash_log = null;
  }
  return out;
}

export async function reportIngest(req: Request, env: Env, userId: string): Promise<Response> {
  const text = await req.text();
  if (text.length > MAX_BYTES) throw new BadRequest("请求体超过 64KB");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BadRequest("JSON 解析失败");
  }
  if (!isRecord(parsed)) throw new BadRequest("请求体须为对象");
  const filtered = filterReport(parsed);
  const day = new Date().toISOString().slice(0, 10);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO reports (id, teacher_id, day, data, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, userId, day, JSON.stringify(filtered), new Date().toISOString())
    .run();
  return json({ ok: true });
}
