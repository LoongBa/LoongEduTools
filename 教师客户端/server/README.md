# edu-teacher-api · 教师客户端 P1 Workers 服务端

> 契约权威：`../docs/A01-教师客户端服务端API契约_v1.0.md`｜方案：`../docs/D03-V1.0-Workers服务端-开发方案.md`
> 路径前缀 `/api/edu/*`；错误结构 `{ error: { code, message } }`。

## 快速开始（本地）

```powershell
cd 教师客户端/server
npm install
# 初始化本地 D1
npx wrangler d1 execute edu-teacher-db --local --file=migrations/0001_init.sql
# 本地联调（SMS_MOCK 默认 true，验证码打到终端日志）
npx wrangler dev
# 健康检查
curl http://127.0.0.1:8787/api/edu/health
```

类型检查：

```powershell
npm run typecheck   # tsc --noEmit
```

## 本地冒烟（D04 §6 · E2E）

前置：已 `npm install`；`.dev.vars` 不存在则从 `.dev.vars.example` 复制（或手工创建）。

```powershell
# 方式 A：一键（起 wrangler + 抓 SMS 验证码 + 跑 13 步断言）
.\scripts\dev_local.ps1
# 另开终端：
node scripts\smoke.mjs --api-key local-dev-pkg-admin-key `
  --zip "..\scripts\dist\content-pack-substitute-kit-1.0.0.zip" `
  --package-id substitute-kit --version 1.0.0

# 方式 B：手动（已有 wrangler dev 在跑）
node scripts\smoke.mjs --api-key local-dev-pkg-admin-key
```

冒烟覆盖：health → sms send/verify 登录 → 错密 401 → license renew/pack →
multipart 上传 201 → manifest 含条目 → download 200 → 错 key 403 → 无 JWT 401（manifest/download）。
SMS 验证码优先从 wrangler 日志（`%TEMP%\wrangler_dev.out` 的 `[SMS_MOCK] phone => code`）抓取，
避免与手发验证码互顶。预期 **13 passed, 0 failed**。

## 部署（Cloudflare）

```powershell
npx wrangler d1 create edu-teacher-db          # 回填 database_id 到 wrangler.toml
npx wrangler kv:namespace create KV            # 回填 id
npx wrangler r2 bucket create edu-teacher-pack
npx wrangler secret put JWT_SECRET
npx wrangler secret put LICENSE_SIGN_KEY       # ed25519 PKCS8 PEM
npx wrangler secret put PKG_ADMIN_KEY
npx wrangler deploy
```

## 与 D03 的已知偏离（有意）

| 项 | D03 原文 | 本实现 | 理由 |
|---|---|---|---|
| 密码哈希 | bcryptjs | **PBKDF2-SHA256** 100k | Workers 无原生 bcrypt；bcryptjs 纯 JS 体积大；PBKDF2 WebCrypto 零依赖且 OWASP 可接受 |
| 微信扫码 | OAuth 流程 | **501 桩** | 微信开放平台审核未过（D03 §4.1 预许） |
| 短信 | 腾讯云 API | **SMS_MOCK=true** 落 KV + 日志 | 腾讯云审核未过（D03 §4.2 预许） |
| 口令包下载 | zip | **JSON**（与 renew 同结构） | 壳端直接用 `license_pack` 字段；zip 打包 P2 再补 |
| manifest | R2 静态 JSON | 同左；上传时自动 merge | 上新免改代码 |

## Secrets

| 名 | 用途 |
|---|---|
| `JWT_SECRET` | HS256 签名（必配） |
| `LICENSE_SIGN_KEY` | ed25519 口令包签名私钥（PKCS8 PEM）；缺省时临时自签 + warning |
| `PKG_ADMIN_KEY` | `POST /api/edu/packages` 管理密钥 |
| `SMS_MOCK`（var） | `"true"` 不真发短信 |

## 接口一览

见 A01 §7 速查表；本 Worker 实现 S1-S5（S6 微信生产接入待审核）。
