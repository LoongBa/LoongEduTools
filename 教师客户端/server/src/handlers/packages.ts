/** 内容包：manifest / 下载鉴权 / 管理上传 · A01 §4 / D03 §6 */
import type { Env } from "../types";
import {
  BadRequest,
  Forbidden,
  NotFound,
  json,
} from "../lib/errors";
import { PKG_DOWNLOAD_LIMITS, bumpRate } from "../lib/ratelimit";
import { loadClassroom, machineQuota, parseMachines } from "./license";

interface ManifestPkg {
  package_id: string;
  package_version: string;
  name: string;
  package_type: string;
  /** 内容/扩展分区标签（R03 §3.2，方案 A）；旧条目可能缺省 */
  categories?: string[];
  required_license_level: number;
  min_shell_version: string;
  size_bytes: number;
  checksum: string;
  download_url: string;
}

/** GET /packages/manifest —— R2 静态 JSON `manifest/latest.json`，缺省空清单 */
export async function packagesManifest(_req: Request, env: Env): Promise<Response> {
  try {
    const obj = await env.R2_PACK.get("manifest/latest.json");
    if (obj) {
      return new Response(obj.body, {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
  } catch (e) {
    console.warn("[manifest] R2 read failed", e);
  }
  const empty = { updated_at: new Date().toISOString(), packages: [] };
  return json(empty);
}

async function findPkg(env: Env, id: string, ver: string): Promise<{ required_license_level: number; r2_key: string | null; version: string } | null> {
  const byCombo = await env.DB.prepare(
    "SELECT required_license_level, r2_key, version FROM packages WHERE package_id = ? AND version = ?",
  )
    .bind(id, ver)
    .first();
  if (byCombo) return byCombo as { required_license_level: number; r2_key: string | null; version: string };
  const latest = await env.DB.prepare(
    "SELECT required_license_level, r2_key, version FROM packages WHERE package_id = ? AND is_latest = 1",
  )
    .bind(id)
    .first();
  return (latest as { required_license_level: number; r2_key: string | null; version: string } | null) ?? null;
}

/** GET /packages/:id/:ver —— requireAuth + 当前学期口令级别 */
export async function packagesDownload(
  req: Request,
  env: Env,
  userId: string,
  userLvl: number,
  pkgId: string,
  ver: string,
): Promise<Response> {
  await bumpRate(env.KV, "pkg_dl", userId, PKG_DOWNLOAD_LIMITS);
  const pkg = await findPkg(env, pkgId, ver);
  if (!pkg) {
    // R2 上可能有手工放的包（manifest 直读路径）
    const key = `content/${pkgId}/${ver}.zip`;
    const obj = await env.R2_PACK.get(key);
    if (!obj) throw new NotFound("内容包不存在");
    return streamR2(obj, `content-pack-${pkgId}-${ver}.zip`);
  }
  const semester = currentSemesterSafe();
  const row = await loadClassroom(env, userId, semester);
  const now = Date.now();
  const expired = row ? Date.parse(row.expires_at) < now : true;
  const level = row ? row.license_level : userLvl;
  if (!row || expired) {
    throw new Forbidden("口令已到期，请续期后下载");
  }
  if (level < pkg.required_license_level) {
    throw new Forbidden("口令级别不足，无法下载该内容包");
  }
  const key = pkg.r2_key || `content/${pkgId}/${ver}.zip`;
  const obj = await env.R2_PACK.get(key);
  if (!obj) throw new NotFound("内容包文件缺失");
  return streamR2(obj, `content-pack-${pkgId}-${ver}.zip`);
}

function currentSemesterSafe(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return m >= 9 ? `${y}S` : `${y}A`;
}

function streamR2(obj: R2ObjectBody, filename: string): Response {
  const headers = new Headers({
    "content-type": "application/octet-stream",
    "content-disposition": `attachment; filename="${filename}"`,
  });
  if (obj.size != null) headers.set("content-length", String(obj.size));
  return new Response(obj.body, { headers });
}

/** POST /packages —— X-Api-Key 管理上传（multipart） */
export async function packagesUpload(req: Request, env: Env): Promise<Response> {
  const apiKey = req.headers.get("x-api-key") || "";
  if (!env.PKG_ADMIN_KEY || apiKey !== env.PKG_ADMIN_KEY) {
    throw new Forbidden("管理密钥无效");
  }
  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("multipart/form-data")) {
    throw new BadRequest("须为 multipart/form-data");
  }
  const form = await req.formData();
  const packageId = String(form.get("package_id") || "");
  const version = String(form.get("version") || "");
  const licenseLevel = Number(form.get("license_level") ?? 1);
  const minShell = String(form.get("min_shell_version") ?? "0.1.0");
  const name = String(form.get("name") || packageId);
  const packageType = String(form.get("package_type") || "app");
  // categories：可选表单字段，CSV → 数组；缺省空数组（向后兼容，R03 §3.2 方案 A）
  const categories = String(form.get("categories") || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const file = form.get("file");
  if (!packageId || !version) throw new BadRequest("package_id / version 必填");
  if (!(file instanceof File)) throw new BadRequest("file 字段必填");
  const buf = new Uint8Array(await file.arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const checksum = `sha256:${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  const r2Key = `content/${packageId}/${version}.zip`;
  await env.R2_PACK.put(r2Key, buf, { httpMetadata: { contentType: "application/zip" } });
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE packages SET is_latest = 0 WHERE package_id = ?").bind(packageId).run();
  await env.DB.prepare(
    `INSERT INTO packages (package_id, version, package_type, name, required_license_level, min_shell_version, size_bytes, checksum, r2_key, is_latest, released_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(package_id) DO UPDATE SET
       version=excluded.version, package_type=excluded.package_type, name=excluded.name,
       required_license_level=excluded.required_license_level, min_shell_version=excluded.min_shell_version,
       size_bytes=excluded.size_bytes, checksum=excluded.checksum, r2_key=excluded.r2_key,
       is_latest=1, released_at=excluded.released_at`,
  )
    .bind(packageId, version, packageType, name, licenseLevel, minShell, buf.byteLength, checksum, r2Key, now)
    .run();
  // 同步 manifest/latest.json（读改写，best-effort）
  try {
    let manifest: { updated_at: string; packages: ManifestPkg[] } = {
      updated_at: now,
      packages: [],
    };
    const mobj = await env.R2_PACK.get("manifest/latest.json");
    if (mobj) {
      manifest = (await mobj.json()) as typeof manifest;
    }
    const entry: ManifestPkg = {
      package_id: packageId,
      package_version: version,
      name,
      package_type: packageType,
      categories,
      required_license_level: licenseLevel,
      min_shell_version: minShell,
      size_bytes: buf.byteLength,
      checksum,
      download_url: `/api/edu/packages/${packageId}/${version}`,
    };
    manifest.packages = [...manifest.packages.filter((p) => p.package_id !== packageId), entry];
    manifest.updated_at = now;
    await env.R2_PACK.put("manifest/latest.json", JSON.stringify(manifest), {
      httpMetadata: { contentType: "application/json" },
    });
  } catch (e) {
    console.warn("[upload] manifest update failed", e);
  }
  return json({ package_id: packageId, version, checksum }, 201);
}

export { machineQuota, parseMachines };
