#!/usr/bin/env node
/**
 * smoke.mjs — 本地 E2E 冒烟（D04 §6 · A01）
 *
 * 前置：dev_local.ps1 已起 wrangler dev（默认 http://127.0.0.1:8787）
 *      且 PKG_ADMIN_KEY / JWT_SECRET 已在 .dev.vars 配好。
 *
 * 步骤：
 *   1  GET  /health
 *   2  POST /auth/sms/send + verify（mock 模式从 KV 不可读 → 用 password 路径注册不行，
 *      因此 sms mock 依赖终端日志；改为直接 password 登录需已有账号 → 先 sms 注册）
 *      实际策略：sms/send → 从 wrangler dev 日志不解析，改为
 *      用 SMS mock 的已知行为不可靠 → 写入教师前用 password reset 不可（未注册）
 *      最终：用 sms/send + 从本地 KV 读？不行 → smoke 提供 --phone/--password，
 *      若 password 登录失败则自动走 sms：读取 SMS code 不可行 → 让 wrangler 把
 *      code 打在 stdout，由 dev_local.ps1 捕获写入 code.txt，smoke 轮询读取。
 *   3  POST /auth/password（或 sms verify 取代）→ JWT
 *   4  POST /license/renew → license_pack
 *   5  POST /packages（multipart fixture zip）→ 201
 *   6  GET  /packages/manifest（Bearer JWT）→ 含 package_id
 *   7  GET  /packages/:id/:ver → 200 + content-length / 或 404（R2 mock 空）
 *   8  负例：无 JWT manifest → 401；错 X-Api-Key upload → 403
 *
 * 用法：
 *   node scripts/smoke.mjs --zip ../scripts/dist/content-pack-fixture-app-1.0.0.zip
 *   node scripts/smoke.mjs --phone 13800000000 --password Passw0rd! --sms-code-file ./sms_code.txt
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function arg(name, def = "") {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const BASE = arg("--base", "http://127.0.0.1:8787");
const API_KEY = arg("--api-key", process.env.PKG_ADMIN_KEY || "");
const PHONE = arg("--phone", "13900001111");
const PASSWORD = arg("--password", "Passw0rd!");
const ZIP = arg("--zip", resolve(__dirname, "../scripts/dist/content-pack-fixture-app-1.0.0.zip"));
const PKG_ID = arg("--package-id", "fixture-app");
const PKG_VER = arg("--version", "1.0.0");
const SMS_CODE_FILE = arg("--sms-code-file", resolve(__dirname, "sms_code.txt"));

let passed = 0;
let failed = 0;
const fails = [];

function ok(name, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  [PASS] ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    fails.push(name);
    console.log(`  [FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function req(path, init = {}) {
  const url = path.startsWith("http") ? path : `${BASE}/api/edu${path}`;
  try {
    const res = await fetch(url, init);
    const buf = await res.arrayBuffer();
    const headers = Object.fromEntries(res.headers.entries());
    return { status: res.status, headers, buf, text: Buffer.from(buf).toString("utf8") };
  } catch (e) {
    return { status: 0, headers: {}, buf: new ArrayBuffer(0), text: String(e) };
  }
}

function jsonBody(r) {
  try {
    return JSON.parse(r.text);
  } catch {
    return null;
  }
}

async function waitHealth(timeoutMs = 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await req("/health");
    if (r.status === 200) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/** 从 wrangler 日志抓该手机号最新一条 SMS_MOCK 验证码（绕过被顶掉的旧 code 文件） */
function latestSmsFromLogs(phone, afterMs = 0) {
  const logs = [
    resolve(process.env.TEMP || "/tmp", "wrangler_dev.out"),
    resolve(process.env.TEMP || "/tmp", "wrangler_dev.err"),
  ];
  let best = { code: null, t: afterMs };
  for (const p of logs) {
    if (!existsSync(p)) continue;
    try {
      const st = statSync(p);
      if (st.mtimeMs < afterMs - 50) continue;
      const text = readFileSync(p, "utf8");
      // [SMS_MOCK] 13900001111 => 763694
      const re = new RegExp(
        `\\[SMS_MOCK\\]\\s+${phone}\\s*=>\\s*(\\d{6})`,
        "g",
      );
      let m;
      while ((m = re.exec(text)) !== null) {
        // 取文本中最后一次匹配（日志尾部 = 最新）
        best = { code: m[1], t: st.mtimeMs };
      }
    } catch {
      /* ignore */
    }
  }
  return best.code;
}

function waitSmsCode(phone, sentAt, ms = 15_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const fromLog = latestSmsFromLogs(phone, sentAt);
    if (fromLog) return fromLog;
    if (existsSync(SMS_CODE_FILE)) {
      const code = readFileSync(SMS_CODE_FILE, "utf8").trim();
      if (/^\d{6}$/.test(code)) return code;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  return null;
}

async function main() {
  console.log(`== edu-teacher-api smoke → ${BASE} ==`);

  // 1 health
  const healthy = await waitHealth();
  ok("health", healthy, healthy ? "200" : "timeout");
  if (!healthy) {
    summary();
    process.exit(1);
  }

  // 2 sms send → code → verify（注册/登录）
  const sentAt = Date.now();
  const send = await req("/auth/sms/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: PHONE }),
  });
  ok("sms_send", send.status === 200, `HTTP ${send.status}`);

  const code = waitSmsCode(PHONE, sentAt);
  ok("sms_code_extracted", !!code, code || "no code from sms_code.txt / history (is dev_local.ps1 running?)");
  if (!code) {
    summary();
    process.exit(1);
  }

  const verify = await req("/auth/sms/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: PHONE, code, device_id: "smoke-device" }),
  });
  const verifyJson = jsonBody(verify);
  const jwt = verifyJson?.jwt;
  ok("sms_verify_login", verify.status === 200 && !!jwt, `HTTP ${verify.status}`);
  if (!jwt) {
    summary();
    process.exit(1);
  }
  const auth = { authorization: `Bearer ${jwt}` };

  // password login negative（无该手机号密码 → 401）
  const badPw = await req("/auth/password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: PHONE, password: "wrong-password" }),
  });
  ok("password_wrong_401", badPw.status === 401, `HTTP ${badPw.status}`);

  // 3 license renew
  const renew = await req("/license/renew", {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const renewJson = jsonBody(renew);
  ok("license_renew", renew.status === 200 && renewJson?.license_pack, `HTTP ${renew.status}`);

  // pack 下载（同结构 JSON，D03 偏离记录）
  const pack = await req("/license/pack", { headers: auth });
  ok("license_pack_get", pack.status === 200, `HTTP ${pack.status}`);

  // 4 upload package
  let uploadStatus = 0;
  if (API_KEY && existsSync(ZIP)) {
    const zipBuf = readFileSync(ZIP);
    const boundary = "----SmokeBoundary" + Date.now();
    const head = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="package_id"\r\n\r\n${PKG_ID}\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="version"\r\n\r\n${PKG_VER}\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="license_level"\r\n\r\n1\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="name"\r\n\r\nfixture\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="package_type"\r\n\r\napp\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${ZIP.split(/[\\/]/).pop()}"\r\n` +
        `Content-Type: application/zip\r\n\r\n`,
      "utf8",
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
    const body = Buffer.concat([head, zipBuf, tail]);
    const up = await req("/packages", {
      method: "POST",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "x-api-key": API_KEY,
      },
      body,
    });
    uploadStatus = up.status;
    ok("packages_upload", uploadStatus === 201 || uploadStatus === 200, `HTTP ${uploadStatus} ${up.text.slice(0, 120)}`);

    // 5 manifest 含条目
    const mf = await req("/packages/manifest", { headers: auth });
    const mfJson = jsonBody(mf);
    const ids = (mfJson?.packages || []).map((p) => p.package_id);
    ok("manifest_lists_pkg", mf.status === 200 && ids.includes(PKG_ID), `ids=${JSON.stringify(ids)}`);

    // 6 download（本地 R2 mock 可能 404 文件，但鉴权路径须通）
    const dl = await req(`/packages/${PKG_ID}/${PKG_VER}`, { headers: auth });
    ok(
      "download_reachable",
      dl.status === 200 || dl.status === 404,
      `HTTP ${dl.status} (200=ok / 404=R2 body missing locally)`,
    );

    // 错 key 上传 → 403
    const badKey = await req("/packages", {
      method: "POST",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "x-api-key": "wrong-key",
      },
      body,
    });
    ok("upload_wrong_key_403", badKey.status === 403, `HTTP ${badKey.status}`);
  } else {
    ok("packages_upload_skipped", false, `need --api-key and zip exists=${existsSync(ZIP)}`);
  }

  // 负例：manifest 无 JWT → 401
  const noAuth = await req("/packages/manifest");
  ok("manifest_no_auth_401", noAuth.status === 401, `HTTP ${noAuth.status}`);

  // 负例：download 无 JWT → 401
  const dlNoAuth = await req(`/packages/${PKG_ID}/${PKG_VER}`);
  ok("download_no_auth_401", dlNoAuth.status === 401, `HTTP ${dlNoAuth.status}`);

  summary();
  process.exit(failed > 0 ? 1 : 0);
}

function summary() {
  console.log(`\n== smoke result: ${passed} passed, ${failed} failed ==`);
  if (fails.length) console.log(`failed: ${fails.join(", ")}`);
}

mkdirSync(dirname(SMS_CODE_FILE), { recursive: true });
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
