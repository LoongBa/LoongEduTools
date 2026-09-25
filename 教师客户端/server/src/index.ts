/**
 * edu-teacher-api · 教师客户端 P1 Workers 服务端
 * 契约：A01-教师客户端服务端API契约_v1.0.md（路径/字段/错误码逐字对齐）
 * 方案：D03-V1.0-Workers服务端-开发方案.md
 * 前缀：/api/edu/*
 */
import type { Env } from "./types";
import { errToResponse, json } from "./lib/errors";
import {
  authActivate,
  authProfile,
  authRefresh,
  passwordLogin,
  passwordReset,
  smsSend,
  smsVerify,
  wechatQr,
  wechatStatus,
} from "./handlers/auth";
import { licenseBind, licensePack, licenseRenew } from "./handlers/license";
import { packagesDownload, packagesManifest, packagesUpload } from "./handlers/packages";
import { toolboxManifest } from "./handlers/toolbox";
import { reportIngest } from "./handlers/report";
import { requireAuth } from "./handlers/auth";

const PREFIX = "/api/edu";

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-api-key",
    "access-control-max-age": "86400",
  };
}

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders())) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    try {
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }
      const url = new URL(req.url);
      let path = url.pathname;
      if (!path.startsWith(PREFIX)) {
        return withCors(json({ error: { code: "NOT_FOUND", message: "未知路径" } }, 404));
      }
      path = path.slice(PREFIX.length) || "/";
      // 去掉尾斜杠
      if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

      const method = req.method.toUpperCase();

      // ---- health（无鉴权，S1 验收）----
      if (method === "GET" && path === "/health") {
        return withCors(json({ ok: true, service: "edu-teacher-api", ts: new Date().toISOString() }));
      }

      // ---- 认证 A01 §2 ----
      if (method === "POST" && path === "/auth/wechat/qr") return withCors(await wechatQr(req, env));
      if (method === "GET" && path === "/auth/wechat/status") return withCors(await wechatStatus(req, env));
      if (method === "POST" && path === "/auth/sms/send") return withCors(await smsSend(req, env));
      if (method === "POST" && path === "/auth/sms/verify") return withCors(await smsVerify(req, env));
      if (method === "POST" && path === "/auth/password") return withCors(await passwordLogin(req, env));
      if (method === "POST" && path === "/auth/password/reset") return withCors(await passwordReset(req, env));
      if (method === "POST" && path === "/auth/refresh") return withCors(await authRefresh(req, env));
      if (method === "POST" && path === "/auth/profile") {
        return withCors(await authProfile(req, env));
      }
      if (method === "POST" && path === "/auth/activate") {
        return withCors(await authActivate(req, env));
      }

      // ---- 口令 A01 §3（均需 JWT）----
      if (method === "POST" && path === "/license/renew") {
        const p = await requireAuth(req, env);
        return withCors(await licenseRenew(req, env, p.sub, p.lvl));
      }
      if (method === "GET" && path === "/license/pack") {
        const p = await requireAuth(req, env);
        return withCors(await licensePack(req, env, p.sub));
      }
      if (method === "POST" && path === "/license/bind") {
        const p = await requireAuth(req, env);
        return withCors(await licenseBind(req, env, p.sub));
      }

      // ---- 内容包 A01 §4 ----
      if (method === "GET" && path === "/packages/manifest") {
        await requireAuth(req, env);
        return withCors(await packagesManifest(req, env));
      }
      const dl = /^\/packages\/([^/]+)\/([^/]+)$/.exec(path);
      if (method === "GET" && dl && dl[1] && dl[2] && dl[1] !== "manifest") {
        const p = await requireAuth(req, env);
        return withCors(await packagesDownload(req, env, p.sub, p.lvl, dl[1], dl[2]));
      }
      if (method === "POST" && path === "/packages") {
        return withCors(await packagesUpload(req, env));
      }

      // ---- 工具箱 A01 §4.4（R03 §4.4；鉴权姿态与 packages/manifest 一致）----
      if (method === "GET" && path === "/toolbox/manifest") {
        await requireAuth(req, env);
        return withCors(await toolboxManifest(req, env));
      }

      // ---- 上报 A01 §5 ----
      if (method === "POST" && path === "/report/ingest") {
        const p = await requireAuth(req, env);
        return withCors(await reportIngest(req, env, p.sub));
      }

      return withCors(notFoundResponse(`${method} ${path}`));
    } catch (e) {
      return withCors(errToResponse(e));
    }
  },
} satisfies ExportedHandler<Env>;

export function notFoundResponse(path: string): Response {
  return json({ error: { code: "NOT_FOUND", message: `未知接口: ${path}` } }, 404);
}
