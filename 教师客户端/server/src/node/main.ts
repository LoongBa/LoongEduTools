/**
 * node 双入口：node:http → worker.fetch 桥（D03 附录）。
 *
 * 零 handler 改动：把 IncomingMessage 攒成 Buffer 后构造成标准 Request，
 * 交给 src/index.ts 的 worker.fetch(env)，再回写 status/headers/body。
 * 存储：server/data/app.db（node:sqlite）+ server/data/r2（R2 shim 根目录）。
 */
import { mkdirSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import worker from "../index";
import {
  applyMigrations,
  buildEnv,
  createKvTable,
  loadEnvVars,
} from "./env";

const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function collectBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolvePromise(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  env: ReturnType<typeof buildEnv>,
  port: number,
): Promise<void> {
  const method = (req.method || "GET").toUpperCase();
  const url = `http://127.0.0.1:${port}${req.url || "/"}`;

  // 转发请求头（去掉传输层头，body 由 undici 按 Buffer 重新计算 content-length）
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      for (const item of v) headers.append(k, item);
    } else {
      headers.append(k, v);
    }
  }
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  headers.delete("connection");

  let body: Buffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await collectBody(req);
  }

  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = body;

  const request = new Request(url, init);
  const response = await worker.fetch(request, env, {} as ExecutionContext);

  const out = Buffer.from(await response.arrayBuffer());
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  if (method === "HEAD") {
    res.end();
  } else {
    res.end(out);
  }
}

async function main(): Promise<void> {
  const vars = loadEnvVars(SERVER_ROOT);

  const dbPath = vars.DB_PATH
    ? resolve(vars.DB_PATH)
    : join(SERVER_ROOT, "data", "app.db");
  const r2Dir = vars.R2_DIR ? resolve(vars.R2_DIR) : join(SERVER_ROOT, "data", "r2");
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  applyMigrations(db, join(SERVER_ROOT, "migrations", "0001_init.sql"));
  createKvTable(db);

  const env = buildEnv(db, r2Dir, vars);
  const port = Number(process.env.PORT) || 8787;

  const server = createServer((req, res) => {
    handle(req, res, env, port).catch((e) => {
      console.error("[node] unhandled error", e);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: { code: "INTERNAL", message: "服务端错误" } }));
      } else {
        res.end();
      }
    });
  });

  server.on("clientError", (err, socket) => {
    console.warn("[node] clientError", err.message);
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`[node] listening on http://127.0.0.1:${port}`);
    console.log(`[node] db=${dbPath} r2=${r2Dir}`);
  });
}

main().catch((e) => {
  console.error("[node] startup failed:", e);
  process.exit(1);
});
