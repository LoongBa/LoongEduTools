/**
 * node 适配层：D1 / KV / R2 shim（D03 附录 · Node 双入口）。
 *
 * 边界约定：只实现 handlers 实际用到的面——
 *   - D1：prepare → bind → first / run（无 batch/exec/all）
 *   - KV：get（含 { type:"json" }）/ put（含 expirationTtl）/ delete
 *   - R2：get（body/size/json()）/ put（string|ArrayBuffer|ArrayBufferView）
 * CF 类型 cast（as unknown as D1Database 等）只在 env.ts 适配边界发生，handlers 零改动。
 */
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { Readable } from "node:stream";

/** node:sqlite 接受的绑定参数（string/number 等，handlers 只传这些） */
type SQLArg = string | number | bigint | Uint8Array | null;

export interface D1RunResult {
  success: true;
  meta: Record<string, unknown>;
  results: unknown[];
}

/** D1 shim：prepare 同步返回 statement；bind 同步；first/run 异步（handlers await）。 */
export class D1Shim {
  constructor(private readonly db: DatabaseSync) {}

  prepare(sql: string): D1StatementShim {
    return new D1StatementShim(this.db, sql);
  }
}

export class D1StatementShim {
  private args: SQLArg[] = [];

  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]): D1StatementShim {
    this.args = values as SQLArg[];
    return this;
  }

  /** 无行时返回 null（不是 undefined），与 D1 行为一致。 */
  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const stmt = this.db.prepare(this.sql);
    const row = stmt.get(...this.args) as T | undefined;
    return row ?? null;
  }

  async run(): Promise<D1RunResult> {
    const stmt = this.db.prepare(this.sql);
    stmt.run(...this.args);
    return { success: true, meta: {}, results: [] };
  }
}

export interface KVGetOptions {
  type?: "text" | "json";
}

export interface KVPutOptions {
  expirationTtl?: number;
  expiration?: number;
}

/**
 * KV shim → kv_store 表（启动时建表，不改 migrations）。
 * expires_at 存 unix 秒；expired 时 get 返回 null 并惰性删除。
 */
export class KVShim {
  constructor(private readonly db: DatabaseSync) {}

  async get(key: string, options?: KVGetOptions): Promise<string | null> {
    const row = this.db
      .prepare("SELECT v, expires_at FROM kv_store WHERE k = ?")
      .get(key) as { v: string; expires_at: number } | undefined;
    if (!row) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    if (row.expires_at !== 0 && row.expires_at < nowSec) {
      this.db.prepare("DELETE FROM kv_store WHERE k = ?").run(key);
      return null;
    }
    if (options?.type === "json") {
      try {
        return JSON.parse(row.v) as unknown as string;
      } catch {
        return null;
      }
    }
    return row.v;
  }

  async put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView,
    options?: KVPutOptions,
  ): Promise<void> {
    const nowSec = Math.floor(Date.now() / 1000);
    let expiresAt = 0;
    if (options?.expiration != null) {
      expiresAt = options.expiration;
    } else if (options?.expirationTtl != null) {
      expiresAt = nowSec + options.expirationTtl;
    }
    const text =
      typeof value === "string"
        ? value
        : Buffer.from(value as ArrayBufferView | ArrayBuffer).toString("utf8");
    this.db
      .prepare(
        "INSERT INTO kv_store (k, v, expires_at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, expires_at = excluded.expires_at",
      )
      .run(key, text, expiresAt);
  }

  async delete(key: string): Promise<void> {
    this.db.prepare("DELETE FROM kv_store WHERE k = ?").run(key);
  }
}

export interface R2ObjectShim {
  readonly key: string;
  readonly size: number;
  readonly body: ReadableStream;
  json<T>(): Promise<T>;
}

/**
 * R2 shim → 文件系统（根目录 R2_DIR，默认 server/data/r2）。
 * key 含 `/` → 相对路径；`..`/`.` 段被剥离做路径消毒。
 */
export class R2Shim {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = rootDir;
    mkdirSync(rootDir, { recursive: true });
  }

  private keyToPath(key: string): string {
    const parts = key.split("/").filter((p) => p.length > 0 && p !== "." && p !== "..");
    if (parts.length === 0) throw new Error(`非法 R2 key: ${key}`);
    return join(this.root, ...parts);
  }

  async get(key: string): Promise<R2ObjectShim | null> {
    const path = this.keyToPath(key);
    if (!existsSync(path)) return null;
    const size = statSync(path).size;
    return {
      key,
      size,
      get body(): ReadableStream {
        return Readable.toWeb(createReadStream(path)) as unknown as ReadableStream;
      },
      async json<T>(): Promise<T> {
        return JSON.parse(readFileSync(path, "utf8")) as T;
      },
    };
  }

  async put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView,
    _options?: { httpMetadata?: { contentType?: string } },
  ): Promise<{ key: string; size: number }> {
    const path = this.keyToPath(key);
    mkdirSync(dirname(path), { recursive: true });
    const buf =
      typeof value === "string"
        ? Buffer.from(value, "utf8")
        : Buffer.from(value as ArrayBufferView | ArrayBuffer);
    writeFileSync(path, buf);
    return { key, size: buf.byteLength };
  }
}
