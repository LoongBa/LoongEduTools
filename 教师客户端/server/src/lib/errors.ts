import type { ErrCode } from "../types";

const STATUS: Record<ErrCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  AUTH_EXPIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/** A01 §1.2 统一错误 JSON */
export function jsonError(
  code: ErrCode,
  message: string,
  detail?: unknown,
): Response {
  const body = detail === undefined
    ? { error: { code, message } }
    : { error: { code, message, detail } };
  return json(body, STATUS[code]);
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function requireStr(v: unknown, field: string): string {
  if (typeof v !== "string" || v.length === 0) {
    throw new BadRequest(`${field} 必填`);
  }
  return v;
}

export class BadRequest extends Error {
  readonly code = "BAD_REQUEST" as const;
  constructor(msg: string) {
    super(msg);
  }
}
export class Forbidden extends Error {
  readonly code = "FORBIDDEN" as const;
  constructor(msg: string) {
    super(msg);
  }
}
export class Unauthorized extends Error {
  readonly code = "UNAUTHORIZED" as const;
  constructor(msg: string) {
    super(msg);
  }
}
export class AuthExpired extends Error {
  readonly code = "AUTH_EXPIRED" as const;
  constructor(msg: string) {
    super(msg);
  }
}
export class NotFound extends Error {
  readonly code = "NOT_FOUND" as const;
  constructor(msg: string) {
    super(msg);
  }
}
export class RateLimited extends Error {
  readonly code = "RATE_LIMITED" as const;
  constructor(msg: string) {
    super(msg);
  }
}

export function errToResponse(e: unknown): Response {
  if (
    e instanceof BadRequest ||
    e instanceof Forbidden ||
    e instanceof Unauthorized ||
    e instanceof AuthExpired ||
    e instanceof NotFound ||
    e instanceof RateLimited
  ) {
    return jsonError(e.code, e.message);
  }
  console.error("[edu-teacher-api]", e);
  return jsonError("INTERNAL", "服务端错误");
}
