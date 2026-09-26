/** 签名凭证：签发/续期 · D09 §2.2/§2.6 / A01 §4.5（同一接口：新 seq + 新 issued_at/expires_at） */
import type { Env } from "../types";
import {
  BadRequest,
  Forbidden,
  isRecord,
  json,
  readJson,
  requireStr,
} from "../lib/errors";
import { CREDENTIAL_SIGN_LIMITS, bumpRate } from "../lib/ratelimit";
import { currentSemester } from "../lib/semester";
import { loadClassroom, machineQuota, parseMachines } from "./license";
import {
  CREDENTIAL_FORMAT_VER,
  CREDENTIAL_TTL_SEC,
  signCredential,
} from "../lib/credentialSign";

/** 请求侧 key_material 上限：64KB（包裹后内容密钥实际仅 ~100B，防滥用） */
const KEY_MATERIAL_MAX = 65536;

/** POST /credential/sign —— 签发（首次）/ 续期（再次调用）；Bearer JWT（7 天会话，A01 §1.3） */
export async function credentialSign(
  req: Request,
  env: Env,
  userId: string,
  userLvl: number,
): Promise<Response> {
  await bumpRate(env.KV, "cred_sign", userId, CREDENTIAL_SIGN_LIMITS);
  const body = await readJson(req);
  if (!isRecord(body)) throw new BadRequest("请求体须为 JSON");

  const fp = requireStr(body.machine_fp, "machine_fp").trim().toLowerCase();
  // D09 §2.2 fingerprint.rs：HKLM MachineGuid + 计算机名 → SHA256 前 32 hex
  if (!/^[0-9a-f]{32}$/.test(fp)) throw new BadRequest("machine_fp 须为 32 位小写 hex");
  const keyMaterial = requireStr(body.key_material, "key_material").trim();
  // key_material = 签发机本地包裹后的不透明字节（base64）；服务端不解析内容、不落明文
  if (keyMaterial.length > KEY_MATERIAL_MAX) throw new BadRequest("key_material 过长（≤64KB）");

  if (userLvl < 1) throw new Forbidden("教师身份认证未通过");

  // 报失拒签（D09 §8 R8 软吊销：KV 黑名单 cred:blk:<machine_fp>，运维手工维护）
  const blocked = await env.KV.get(`cred:blk:${fp}`);
  if (blocked !== null) throw new Forbidden("该机器已报失，拒签后续凭证");

  // quota_ref / 配额校验（A01 §2.5/§3.3 机器配额联动；quota_ref 服务端权威，客户端不得自报）
  const lic = await env.DB.prepare(
    "SELECT license_key, machine_quota FROM licenses WHERE teacher_id = ? AND status = 'bound' ORDER BY bound_at DESC LIMIT 1",
  )
    .bind(userId)
    .first<{ license_key: string; machine_quota: number }>();
  const quota = lic?.machine_quota ?? 3;
  const quota_ref = lic?.license_key ? `lic:${lic.license_key}` : "lic:default";
  const row = await loadClassroom(env, userId, currentSemester());
  const machines = row ? parseMachines(row.machines) : [];
  if (!machines.includes(fp) && machines.length >= quota) {
    throw new Forbidden(`已达绑定上限（${quota} 台），请先解绑或升级配额`);
  }

  // seq：按（教师, machine_fp）配对单调递增（首签 = 1，续期 = 前值 + 1）
  const seqKey = `cred:seq:${userId}:${fp}`;
  const prev = Number(await env.KV.get(seqKey)) || 0;
  const seq = prev + 1;
  await env.KV.put(seqKey, String(seq));

  const issuedAt = Math.floor(Date.now() / 1000);
  const pack = await signCredential(
    {
      format_ver: CREDENTIAL_FORMAT_VER,
      machine_fp: fp,
      issued_at: issuedAt,
      expires_at: issuedAt + CREDENTIAL_TTL_SEC, // 14 天硬过期（D09 §2.6）
      seq,
      key_material: keyMaterial,
      quota_ref,
    },
    env,
  );
  return json({ credential: pack.credential, signature: pack.signature });
}
