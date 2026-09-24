/**
 * node 适配层：配置加载 + Env 组装（D03 附录 · Node 双入口）。
 *
 * - .dev.vars 简单解析（KEY=VALUE / KEY="VALUE"，跳过注释/空行），process.env 优先
 * - 必配 JWT_SECRET 缺失 → 启动即抛错
 * - DB / KV / R2 shim 在此边界 cast 成 CF 类型（as unknown as），handlers 零改动
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Env } from "../types";
import { D1Shim, KVShim, R2Shim } from "./adapters";

/** 读取 .dev.vars（KEY=VALUE / KEY="VALUE"），跳过 # 注释与空行 */
export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

/** 加载 server/.dev.vars，process.env 优先合并 */
export function loadEnvVars(rootDir: string): Record<string, string> {
  const fileVars: Record<string, string> = {};
  const devVarsPath = join(rootDir, ".dev.vars");
  if (existsSync(devVarsPath)) {
    Object.assign(fileVars, parseDotEnv(readFileSync(devVarsPath, "utf8")));
  }
  const known = [
    "JWT_SECRET",
    "LICENSE_SIGN_KEY",
    "LICENSE_SIGN_KEY_ID",
    "PKG_ADMIN_KEY",
    "SMS_MOCK",
    "SMS_SECRET",
    "R2_DIR",
    "DB_PATH",
  ] as const;
  for (const k of known) {
    const v = process.env[k];
    if (v !== undefined) fileVars[k] = v;
  }
  return fileVars;
}

/** 若 teachers 表不存在，则执行 0001_init.sql（按 ; 拆分逐条 exec） */
export function applyMigrations(db: DatabaseSync, sqlPath: string): void {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'teachers'")
    .get();
  if (row) return;
  const sql = readFileSync(sqlPath, "utf8");
  for (const rawStmt of sql.split(";")) {
    const stmt = rawStmt.trim();
    if (!stmt) continue;
    db.exec(stmt);
  }
}

/** KV shim 依赖的 kv_store 表（不改 migrations/0001_init.sql） */
export function createKvTable(db: DatabaseSync): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS kv_store (k TEXT PRIMARY KEY, v TEXT NOT NULL, expires_at INTEGER NOT NULL)",
  );
}

/** 组装 CF Env（shim cast 只在此边界） */
export function buildEnv(
  db: DatabaseSync,
  r2Dir: string,
  vars: Record<string, string>,
): Env {
  const jwt = vars.JWT_SECRET;
  if (!jwt) {
    throw new Error(
      "JWT_SECRET 未配置：请在 server/.dev.vars 设置 JWT_SECRET（或设环境变量 JWT_SECRET）",
    );
  }
  return {
    DB: new D1Shim(db) as unknown as D1Database,
    KV: new KVShim(db) as unknown as KVNamespace,
    R2_PACK: new R2Shim(r2Dir) as unknown as R2Bucket,
    JWT_SECRET: jwt,
    LICENSE_SIGN_KEY: vars.LICENSE_SIGN_KEY,
    LICENSE_SIGN_KEY_ID: vars.LICENSE_SIGN_KEY_ID || "license-sign-2026",
    PKG_ADMIN_KEY: vars.PKG_ADMIN_KEY,
    SMS_MOCK: vars.SMS_MOCK || "true",
    SMS_SECRET: vars.SMS_SECRET,
  };
}
