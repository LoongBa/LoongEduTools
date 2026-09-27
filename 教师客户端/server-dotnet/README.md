# EduTeacher.Api · 教师客户端 D03 服务端（.NET）

> 状态：v0.2（2026-09-27）——**配置下发 + 认证（手机号+验证码+绑定微信 mock）+ 离线激活码兑换**全链路落地；短信为 mock（控制台打印 + dev_code），微信为 mock openid，生产接入见 §4。
> 前序：D03-V1.0-Workers服务端-开发方案.md、A01-教师客户端服务端API契约_v1.0.md（路径/字段语义对齐）、D10-签名与加密方案.md（壳配置签名包）。
> 技术栈：ASP.NET Core **Minimal API（.NET 10 LTS）**，存储 = JSON 文件（零第三方依赖），JWT = HS256 自实现。
> 与 `../server/`（TS Workers 实现）并行演进：本 .NET 版按「配置下行 → 认证 → 激活码」顺序落地，端点语义与 A01 对齐。

---

## 1. 定位与边界

### 1.1 解决的问题

教师客户端已存在完整云服务端（TS Workers：认证/口令包/签名凭证/内容包市场/上报）。本 .NET 版按「**简单设计**」重做：

| 完整版（TS） | 本 .NET 简单版 |
|---|---|
| 三认证 + 口令包 + 签名凭证 + 市场 + 上报 | **仅配置文件下发 + 认证（手机号+验证码+绑定微信）+ 离线激活码验证** |
| D1/KV/R2/Secrets 云设施 | 一个 exe + 一个 `wwwroot/config/` 静态目录，可跑在任意 Windows/Linux 主机 |
| Workers 前端托管 | 无需云函数，配置即产物（`/config/*.json`） |

### 1.2 设计原则

1. **配置即服务**：服务端的核心产物是「配置文件」（内容包清单 / 工具箱清单 / 壳配置签名包），HTTP 下发即可，不做重业务
2. **认证极简**：手机号 + 验证码（短信）登录；绑定微信为可选增强（后续登录可用微信授权）
3. **离线激活码**：管理员**离线批量签发**激活码（不依赖在线支付），家长/教师输入授权码 → 兑换绑定到账号 → 解锁
4. **分阶段落地**：当前 v0.1 只落「配置下发 + 健康检查」骨架，认证/激活码以 501 占位明确扩展位

---

## 2. 当前实现（v0.2 认证 + 离线激活码）

### 2.1 端点

| 方法 | 路径 | 说明 | 状态 |
|---|---|---|---|
| GET | `/api/edu/health` | 健康检查（对齐 A01：壳端 `server_ping` 冒烟基线） | ✅ 200 |
| GET | `/config/manifest.json` | 内容包清单（A01 §4.1 结构：`{updated_at, packages[]}`） | ✅ 200 |
| GET | `/config/toolbox.json` | 工具箱清单（A01 §4.4 结构） | ✅ 200 |
| GET | `/config/shell.config.signed.json` | 壳配置签名包（D10 静态托管：壳端验签后启用） | ✅ 200 |
| POST | `/api/edu/auth/sms/send` | 发送短信验证码（手机号校验 / 60s 重发间隔 / 15min 有效） | ✅ 200/429 |
| POST | `/api/edu/auth/sms/verify` | 验证码登录（首次自动注册 level 1）→ 签发 JWT 7 天 | ✅ 200/400 |
| POST | `/api/edu/auth/bind/wechat` | 绑定微信（需 JWT；mock：code → openid） | ✅ 200/401 |
| POST | `/api/edu/codes/activate` | 离线激活码兑换（需 JWT；散列校验 → 绑定 + 提 level） | ✅ 200/400/401/403/404 |

- 配置响应统一带 `Access-Control-Allow-Origin: *` + `Cache-Control: no-cache`（跨域/CDN 友好，配置更新即时感知）
- 认证响应统一 `{ error: { code, message } }`（对齐 A01 错误结构）；JWT payload `{ sub, lvl, exp, iat }`（A01 §1.3）

### 2.2 运行与冒烟

```powershell
cd 教师客户端/server-dotnet
# JWT_SECRET 必配（生产）；SMS_MOCK=true 时 send 响应带 dev_code 供本地冒烟
$env:JWT_SECRET = "你的密钥"          # 不配则用 dev 默认并打印 WARN（仅限本地）
dotnet run --urls http://127.0.0.1:5088

# 冒烟（PowerShell）
# 1 send → 拿 dev_code（mock 模式）→ 2 verify → 拿 jwt → 3 activate → 4 bind
Invoke-RestMethod http://127.0.0.1:5088/api/edu/auth/sms/send -Method POST -ContentType application/json -Body '{"phone":"13900002222"}'
# { retry_in:60, dev_code:"xxxxxx" }
# 2 verify + 3 activate（Authorization: Bearer <jwt>）+ 4 bind/wechat，详见 git 历史冒烟记录
```

### 2.3 目录

```
server-dotnet/
├── Program.cs                     # 接线：配置读取 / 存储 seed / 路由
├── Storage.cs                     # JSON 文件存储（users/sms/codes，互斥锁 + 落盘）
├── Jwt.cs                         # HS256 JWT 签发/校验（零依赖自实现）
├── AuthHandlers.cs                # 认证：sms/send、sms/verify、bind/wechat
├── CodeHandlers.cs                # 激活码：codes/activate（需 JWT）
├── EduTeacher.Api.csproj          # net10.0，零 NuGet 依赖
├── wwwroot/config/                # 配置文件目录（改 JSON 即生效，无需重编译）
│   ├── manifest.json / toolbox.json / shell.config.signed.json
├── data/                          # 运行时数据（users/sms/codes.json，gitignore）
└── README.md
```

### 2.4 配置项

| 配置 | 来源 | 说明 |
|---|---|---|
| `JWT_SECRET` | 环境变量 > appsettings `Jwt:Secret` > dev 默认（WARN） | HS256 签名密钥，生产必配 |
| `SMS_MOCK` | appsettings `Sms:Mock`（默认 true） | true = 验证码打印控制台 + 响应带 dev_code（仅本地） |

---

## 3. 已实现流程（认证 + 离线激活码）

### 3.1 认证流程（手机号 + 验证码 + 绑定微信）

```
手机号 → POST /auth/sms/send（下发验证码，15min 有效，60s 重发间隔，一次性消费）
     → POST /auth/sms/verify { phone, code } → 登录成功（首次自动注册 level 1）→ 签发 JWT 7 天
     → POST /auth/bind/wechat { code }（需 JWT）→ 绑定微信（mock：code → wechat_mock_<code>）
```

- 验证码**散列存储**（`data/sms.json`），验证成功后立即删除（一次性）
- 数据模型：`users(phone 唯一, wechat_openid 可空, level, expires_at)` + `sms(phone, code_hash, exp, last_sent)`
- v1 不设密码（验证码即凭证）；微信为**真实 OAuth 预留**（见 §4）

### 3.2 离线激活码验证（授权码）

```
管理员离线签发：codes.csv（code, level, batch, exp）→ seed 入库（启动时 data/codes.json 为空自动初始化）
用户输入授权码 → POST /codes/activate { code }（需 JWT）
  → 散列查表 → available + 未过期 + 未撤销 → 标记 used + 绑定用户 → 提升 level（取高者）+ 继承到期
```

- 激活码**单向散列存储**（`data/codes.json`，防库泄露批量盗用）；同码二次使用 → 400「已被使用」
- 演示 seed：`TEACHER-2026-0001/0002`（level 2）、`PRO-2026-0001`（level 3），到期 2027-06-30
- 撤销：运维改 `codes.json` status=revoked（保留审计，不删除）

### 3.3 与 TS server/ 的关系

当前 TS 完整版继续维护；本 .NET 版按「配置下行 ✅ → 认证 ✅ → 激活码 ✅」三阶段推进中，端点语义与 A01 对齐，重叠部分以本版为准回写 A01。

## 4. 生产化 TODO（mock 替换）

| 项 | 现状 | 生产动作 |
|---|---|---|
| 短信 | mock：控制台打印 + dev_code | 接短信服务商（阿里云/腾讯云 SMS），`SMS_MOCK=false` 后 dev_code 自动消失 |
| 微信绑定 | mock：code → `wechat_mock_<code>` | 接微信开放平台 OAuth（code 换 openid），`bind/wechat` 签名不变 |
| JWT_SECRET | dev 默认 + WARN | 部署环境变量注入强随机密钥；refresh token 滚动（可选） |
| 存储 | JSON 文件（单进程） | 多实例需换 SQLite/Postgres（Storage 接口已隔离，替换点明确） |
| 激活码签发 | seed 硬编码 3 条 | 离线生成 codes.csv → 批量导入（写导入端点或直接写 data/codes.json 散列值） |

## 5. 验证基准确认（2026-09-27）

- `dotnet build`：0 警告 0 错误
- 冒烟闭环实测：health 200 / send 200+dev_code / verify 200+JWT(level 1 注册) / activate 200+level 2 / 重号 400 / 无 JWT 401 / bind 200 / 未消费重发 429 / 错码 400 / 无效码 404 / 进程清理 ✓