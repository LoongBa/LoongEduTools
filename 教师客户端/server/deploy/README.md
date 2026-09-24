# deploy · 轻量机上线工件（D03 附录 A）

> 生产 = 腾讯云轻量应用服务器（Ubuntu）自托管；CF 免费档 = 测试/过渡（见 §CF 测试部署）。
> 契约 A01 / 方案 D03 正文 + 附录 A。

## 一、文件

| 文件 | 用途 |
|---|---|
| `install.sh` | 一键部署：Node 22 + npm ci + 生成 /etc/edu-teacher-api.env + systemd + 健康检查（幂等） |
| `edu-teacher-api.service` | systemd 单元模板（install.sh 按实际路径改 WorkingDirectory 后安装） |
| `edu-teacher-api.env.example` | 生产密钥模板（install.sh 拷为 /etc/edu-teacher-api.env，chmod 600） |
| `caddy.example` | Caddy 反代 + 自动 HTTPS（80/443 → 127.0.0.1:8787） |
| `backup.sh` | SQLite 在线备份 + r2 打包，保留 14 天（cron 示例在脚本头） |

## 二、上线步骤（腾讯云 Ubuntu）

```bash
# 0) 服务器上拉代码（或 rsync 本仓库）
git clone https://github.com/LoongBa/LoongEduTools.git /opt/loongedutools

# 1) 一键部署（root）
bash /opt/loongedutools/教师客户端/server/deploy/install.sh /opt/loongedutools

# 2) 反代 + HTTPS
apt install caddy
cp deploy/caddy.example /etc/caddy/Caddyfile   # 改域名 api.example.com
systemctl reload caddy

# 3) 验收：外网健康检查
curl https://<你的域名>/api/edu/health          # {"ok":true,...}

# 4) 冒烟（可从外网机或本机 8787）
node scripts/smoke.mjs --api-key <PKG_ADMIN_KEY> --zip ...   # 期望 13/13
```

腾讯云安全组：放行 80/443；**8787 不对公网开放**（main.ts 固定监听 127.0.0.1）。

## 三、密钥生成

```bash
# JWT_SECRET（≥32 字节随机）
openssl rand -base64 48

# PKG_ADMIN_KEY（与 publish_pack.py --api-key 一致）
openssl rand -base64 32

# ed25519 口令包签名私钥（PKCS8 PEM）——⚠ 公私钥配对随壳分发，私钥务必备份
openssl genpkey -algorithm ed25519 -out keys/license-sign.key
# 公钥（给壳端验签用，提取）：
openssl pkey -in keys/license-sign.key -pubout
```

- 内容包签名密钥（`scripts/keys/dev-sign.key`，key_id=dev-sign-2026）与口令包签名密钥（LICENSE_SIGN_KEY，key_id=license-sign-2026）**是两把 key，勿混用**。
- `LICENSE_SIGN_KEY` 缺省时服务端临时自签（启动有 warning）——**仅供联调，生产必须回填**；更换私钥 = 已发壳端口令验签失败。

## 四、激活码 seed（一次性运维项）

`licenses` 表业务代码只读不写（D03 §4.5 / auth.ts），上线前手工灌码：

```bash
sqlite3 /opt/loongedutools/教师客户端/server/data/app.db \
  "INSERT OR IGNORE INTO licenses (license_key, machine_quota, status, created_at)
   VALUES ('DEMO-KEY-0001', 3, 'unbound', datetime('now'));"
```

## 五、CF 测试部署（免费档 · 过渡）

前置：你在本机完成一次 `npx wrangler login`（浏览器授权，需 Cloudflare 账号——**免费档够测**）。

```powershell
cd 教师客户端\server
# 资源（一次性，回填真实 id 到 wrangler.toml）
npx wrangler d1 create edu-teacher-db
npx wrangler d1 execute edu-teacher-db --remote --file=migrations/0001_init.sql
npx wrangler kv:namespace create KV
npx wrangler r2 bucket create edu-teacher-pack
# Secrets
npx wrangler secret put JWT_SECRET         # openssl rand -base64 48 的输出
npx wrangler secret put LICENSE_SIGN_KEY   # ed25519 PKCS8 PEM
npx wrangler secret put PKG_ADMIN_KEY
# 部署 + 验收
npx wrangler deploy
node scripts/smoke.mjs --base https://edu-teacher-api.<你的子域>.workers.dev --api-key <PKG_ADMIN_KEY> --zip ..\scripts\dist\content-pack-substitute-kit-1.0.0.zip --package-id substitute-kit --version 1.0.0
```

> 冒烟的 SMS 抓码依赖本地日志文件，**对远程 Workers 部署**需把 `--code-file` 指到手填验证码（先 `wrangler tail` 看 `[SMS_MOCK]` 行），或仅跑不依赖 SMS 的子集。
