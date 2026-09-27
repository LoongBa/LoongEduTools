# EduTeacher.Api · 教师客户端 D03 服务端（.NET 测试骨架）

> 状态：v0.1 测试骨架（2026-09-27 落盘）——**仅提供配置文件下发 + 健康检查**；认证（手机号+验证码+绑定微信）与离线激活码验证为**预留扩展位**（501 占位）。
> 前序：D03-V1.0-Workers服务端-开发方案.md、A01-教师客户端服务端API契约_v1.0.md（路径/字段语义对齐）、D10-签名与加密方案.md（壳配置签名包）。
> 技术栈：ASP.NET Core **Minimal API（.NET 10 LTS）**，单一 `Program.cs` + 静态 JSON 配置目录，零第三方依赖。
> 与 `../server/`（TS Workers 实现）并行演进：先以本 .NET 骨架测试形态/契约联调，稳定后逐功能对齐替换。

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

## 2. 当前实现（v0.1 测试骨架）

### 2.1 端点

| 方法 | 路径 | 说明 | 状态 |
|---|---|---|---|
| GET | `/api/edu/health` | 健康检查（对齐 A01：壳端 `server_ping` 冒烟基线） | ✅ 200 |
| GET | `/config/manifest.json` | 内容包清单（A01 §4.1 结构：`{updated_at, packages[]}`） | ✅ 200 |
| GET | `/config/toolbox.json` | 工具箱清单（A01 §4.4 结构） | ✅ 200 |
| GET | `/config/shell.config.signed.json` | 壳配置签名包（D10 静态托管：壳端验签后启用） | ✅ 200 |
| POST | `/api/edu/auth/sms/send` | 发送短信验证码 | 🔒 501 占位 |
| POST | `/api/edu/auth/sms/verify` | 验证码登录 | 🔒 501 占位 |
| POST | `/api/edu/auth/bind/wechat` | 绑定微信 | 🔒 501 占位 |
| POST | `/api/edu/codes/activate` | 离线激活码兑换 | 🔒 501 占位 |

- 配置响应统一带 `Access-Control-Allow-Origin: *` + `Cache-Control: no-cache`（跨域/CDN 友好，配置更新即时感知）
- 占位端点统一返回 `501 { error: { code: "NOT_IMPLEMENTED", ... } }`

### 2.2 运行与冒烟

```powershell
cd 教师客户端/server-dotnet
dotnet run --urls http://127.0.0.1:5088
# 另开终端：
curl http://127.0.0.1:5088/api/edu/health          # 期望 200
curl http://127.0.0.1:5088/config/manifest.json     # 期望 200
curl -X POST http://127.0.0.1:5088/api/edu/auth/sms/send  # 期望 501
```

### 2.3 目录

```
server-dotnet/
├── Program.cs                     # 全部端点逻辑（minimal API）
├── EduTeacher.Api.csproj          # net10.0，零 NuGet 依赖
├── wwwroot/config/                # 配置文件目录（改 JSON 即生效，无需重编译）
│   ├── manifest.json
│   ├── toolbox.json
│   └── shell.config.signed.json
└── README.md
```

---

## 3. 后续设计（扩展位 · 认证 + 离线激活码）

### 3.1 认证流程（手机号 + 验证码 + 绑定微信）

```
手机号 → POST /auth/sms/send（下发验证码，15min 有效，60s 重发间隔）
     → POST /auth/sms/verify { phone, code } → 登录成功（签发 JWT 7 天 / refresh 滚动）
     → POST /auth/bind/wechat { code } → 绑定微信（下次可微信授权登录，OAuth 预留）
```

- 数据模型：`users(phone 唯一, wechat_openid 可空, created_at, level)` + `sms_codes(phone, code_hash, exp, used)`
- 密码：v1 不设密码（验证码即凭证），可后续补「设置密码/找回」

### 3.2 离线激活码验证（授权码）

```
管理员离线签发：codes.csv（code, level, batch, exp）→ 导入服务端表   （离线 = 不接支付，先生产后分发）
用户输入授权码 → POST /codes/activate { code } → 校验未用/未过期 → 绑定到当前用户 → 解锁 level
```

- 安全：激活码存储**单向散列**（服务端不存明文，防库泄露批量盗用）；同码二次使用 → 400「已被使用」
- 撤销：运维标记 `revoked`（不删除，保留审计）；机器绑定可选（≤3，对齐 A01 §3 口令包语义）
- 响应：`{ ok, level, expires_at }` 下行，客户端本地凭据缓存

### 3.3 与 TS server/ 的关系

当前 TS 完整版继续维护；本 .NET 版按「配置下行先行 → 认证 → 激活码」三阶段演进，端点语义与 A01 对齐，重叠部分以本版为准回写 A01。

---

## 4. 验证基准确认（2026-09-27）

- `dotnet build`：0 警告 0 错误
- 冒烟实测：health 200 / config×3 200 / auth 501 / codes 501 / 进程清理 ✓