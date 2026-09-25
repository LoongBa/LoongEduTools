# A01 教师客户端服务端 API 契约（v1.0）

> 状态：**v1.0，供 P1 实施**。本文档定义教师客户端配套 Cloudflare Workers 的全部 HTTP 接口契约。
> 上游：`R01-教育工具-教师客户端需求分析与设计方案.md`（§2.3/§7/§8）、`D01-教育工具-教师版RUST外壳开发方案.md`（§3/§6）、`S01-内容包与口令包Schema_v1.0.md`（§3/§5）。
> 服务端实现细节见 `D03-V1.0-Workers服务端-开发方案.md`；本文档仅契约，实现/数据库按本文档为准。
> 约定：所有接口 **HTTPS only**；认证接口返回统一错误结构；内容包/口令包数据复用 Schema v1.0。

---

## 1. 全局约定

### 1.1 基础信息

| 项 | 值 |
|---|---|
| Base URL | `https://api.loongba.education`（生产）/ `https://edu-api.<workername>.workers.dev`（开发） |
| 统一前缀 | `/api/edu/...`（与 RedTools 在线版命名空间对齐，见在线版设计要求 §211） |
| 内容格式 | `application/json; charset=utf-8`（除内容包下载为二进制 zip） |
| 认证方式 | Bearer JWT（`Authorization: Bearer <token>`）；登录接口除外 |

### 1.2 统一错误结构

```jsonc
{ "error": { "code": "AUTH_EXPIRED", "message": "登录已过期", "detail": {} } }
```

| code | HTTP | 含义 |
|---|---|---|
| `BAD_REQUEST` | 400 | 参数缺失/格式错 |
| `UNAUTHORIZED` | 401 | 未登录/凭证无效 |
| `AUTH_EXPIRED` | 401 | 凭证过期（前端应引导重新登录） |
| `FORBIDDEN` | 403 | 已登录但无权限（口令级别不足/机器数超限） |
| `NOT_FOUND` | 404 | 资源不存在 |
| `RATE_LIMITED` | 429 | 短信/接口限频 |
| `INTERNAL` | 500 | 服务端错误 |

### 1.3 凭证与令牌

- **JWT**：登录成功签发，有效期 **7 天**（对齐需求 §2.3 凭证缓存）；
- JWT payload：`{ sub: teacher_id, lvl: license_level, exp, iat, jti }`；
- 刷新：凭证过期 → 客户端用 refresh token 换新 JWT（或直接重新登录，简单优先）；
- 签名密钥：Workers 环境变量 `JWT_SECRET`，不入库不落代码。

---

## 2. 认证接口（P1 核心）

### 2.1 微信扫码登录

| 项 | 内容 |
|---|---|
| `POST /api/edu/auth/wechat/qr` | 生成登录二维码会话 |

```jsonc
// 请求
{ "device_id": "fp_hash_xxx", "purpose": "login" }
// 响应 200
{ "qr_id": "qr_xxx", "qr_content": "weixin://dl/...", "expires_in": 120 }
```

| 项 | 内容 |
|---|---|
| `GET /api/edu/auth/wechat/status?qr_id=qr_xxx&device_id=...` | 轮询扫码结果（每 2s，≤120s） |

```jsonc
// 响应 200
{ "status": "waiting" }                 // 等待扫码
// 或
{ "status": "confirmed", "jwt": "...", "teacher": { "id": "wx_abc", "name": "...", "grade": "4", "subject": "english", "license_level": 2 } }
// 或（已注册但未绑机器）
{ "status": "need_bind", "jwt": "...", "bind_required": true }
// 或
{ "status": "expired" }
```

> 微信 OAuth 流程：客户端展示二维码 → 用户微信扫码 → 微信侧确认后回调 Workers → 确认 openid → 新用户自动注册（补任教信息）或老用户登录。

### 2.2 短信验证码登录

| 项 | 内容 |
|---|---|
| `POST /api/edu/auth/sms/send` | 发送验证码 |

```jsonc
// 请求
{ "phone": "13800138000", "scene": "login" }
// 响应 200
{ "retry_in": 60 }                       // 限频：1 分钟 1 条 / 1 小时 5 条 / 1 天 10 条
```

| 项 | 内容 |
|---|---|
| `POST /api/edu/auth/sms/verify` | 验证码换凭证 |

```jsonc
// 请求
{ "phone": "13800138000", "code": "123456", "device_id": "fp_hash_xxx" }
// 响应 200 —— 同 wechat/status confirmed 结构（jwt + teacher）
```

### 2.3 密码登录

| 项 | 内容 |
|---|---|
| `POST /api/edu/auth/password` | 手机号+密码登录 |

```jsonc
// 请求
{ "phone": "13800138000", "password": "***", "device_id": "fp_hash_xxx" }
// 响应 200 —— 同 wechat/status confirmed 结构
```

| 项 | 内容 |
|---|---|
| `POST /api/edu/auth/password/reset` | 找回密码（短信验证码 → 重置） |

```jsonc
// 请求
{ "phone": "...", "code": "...", "new_password": "***" }
// 响应 200
{ "ok": true }
```

### 2.4 注册补充（首登必填任教信息）

| 项 | 内容 |
|---|---|
| `POST /api/edu/auth/profile` | 补齐任教年级/科目 + 同意条款 |

```jsonc
// 请求（Bearer JWT）
{ "grade": "4", "subject": "english", "agree_terms": true }
// 响应 200
{ "teacher": { "id": "wx_abc", "grade": "4", "subject": "english", "license_level": 1 } }
```

### 2.5 激活码绑定

| 项 | 内容 |
|---|---|
| `POST /api/edu/auth/activate` | 激活码 ⇄ 微信身份 绑定（防转卖） |

```jsonc
// 请求
{ "license_key": "ABC-1234-DEFG-5678", "device_id": "fp_hash_xxx" }
// 响应 200
{ "ok": true, "license_level": 2, "machine_quota": 3, "bound_machines": 1 }
// 403 —— 激活码已被其他微信绑定
{ "error": { "code": "FORBIDDEN", "message": "该激活码已绑定其他账号" } }
```

### 2.6 凭证刷新

| 项 | 内容 |
|---|---|
| `POST /api/edu/auth/refresh` | JWT 过期刷新（凭证缓存延 7 天） |

```jsonc
// 请求（Bearer 过期 JWT + refresh token）
{ "refresh_token": "..." }
// 响应 200
{ "jwt": "...", "expires_in": 604800 }
```

---

## 3. 课堂口令接口

### 3.1 申请/续期口令

| 项 | 内容 |
|---|---|
| `POST /api/edu/license/renew` | 签发（首次）或续期课堂口令 |

```jsonc
// 请求（Bearer JWT）
{ "semester": "2026S", "machine_fp": "fp_hash_xxx" }
// 响应 200 —— 返回口令包（可直接落本地；同时可下载 license zip）
{ "license_pack": { "license": {...Schema §3.2...}, "signature": {...} }, "download_url": "/api/edu/license/pack?tid=wx_abc&sem=2026S" }
// 403 —— 教师身份认证未通过（未绑激活码/任教信息缺失）
```

### 3.2 下载口令包

| 项 | 内容 |
|---|---|
| `GET /api/edu/license/pack?tid=<teacher_id>&sem=<semester>` | 下载口令包 zip（Bearer JWT） |

```
响应 200 —— application/octet-stream（license-pack-<tid>-<sem>.zip，Schema §3）
```

### 3.3 机器绑定追加

| 项 | 内容 |
|---|---|
| `POST /api/edu/license/bind` | 追加绑定机器（≤ machine_quota） |

```jsonc
// 请求（Bearer JWT）
{ "semester": "2026S", "machine_fp": "fp_hash_xxx" }
// 响应 200
{ "bound_machines": 2, "quota": 3 }
// 403 —— 超 quota
{ "error": { "code": "FORBIDDEN", "message": "已达绑定上限（3 台）" } }
```

---

## 4. 内容包接口

### 4.1 内容包清单（manifest）

| 项 | 内容 |
|---|---|
| `GET /api/edu/packages/manifest` | 可用内容包清单（简单配置起步，动态化演进） |

```jsonc
// 响应 200
{
  "updated_at": "2026-09-23T00:00:00Z",
  "packages": [
    {
      "package_id": "pep-reader", "package_version": "1.3.3",
      "name": "教材点读", "package_type": "app",
      "categories": ["扩展"],
      "required_license_level": 2, "min_shell_version": "0.1.0",
      "size_bytes": 52428800, "checksum": "sha256:...",
      "download_url": "/api/edu/packages/pep-reader/1.3.3"
    }
    // ...（R2 代课包 / R14 游戏包 / 各册内容包 后续加入）
  ]
}
```

> MVP 静态 JSON + R2 手工维护（简单配置）；内容包市场（搜索/分类/统计）为 P4 演进。
> `categories` 字段**已实装**（R03 §3.2 方案 A：内容/扩展分区依据）：上传可选字段（CSV→数组），缺省空数组，向后兼容；`description` 仍为预留字段（见 Schema §2.2）。

### 4.2 下载内容包

| 项 | 内容 |
|---|---|
| `GET /api/edu/packages/<package_id>/<version>` | 下载内容包 zip（Bearer JWT + 口令级别达标） |

```
响应 200 —— application/octet-stream（content-pack-<id>-<ver>.zip）
响应 403 —— required_license_level 未达标 / 口令过期（锁新）
   { "error": { "code": "FORBIDDEN", "message": "口令已到期，请续期后下载" } }
```

### 4.3 上传内容包（服务端 App 侧，非教师）

| 项 | 内容 |
|---|---|
| `POST /api/edu/packages` | 服务端发布新内容包（内部管理接口，API 密钥保护） |

```jsonc
// 请求（X-Api-Key: <pkg-admin-key>，multipart/form-data）
// field: package_id, version, license_level, min_shell_version, categories(可选, CSV→数组), file(content-pack.zip)
// 响应 201
{ "package_id": "...", "version": "...", "checksum": "sha256:..." }
```

### 4.4 工具箱清单（toolbox manifest）

| 项 | 内容 |
|---|---|
| `GET /api/edu/toolbox/manifest` | 工具箱工具清单（Bearer JWT；R03 §4.4 服务端清单，静态 JSON + R2 手工维护，增删改只改服务端清单） |

```jsonc
// 响应 200
{
  "version": "1.0",
  "updated_at": "2026-09-25T00:00:00Z",
  "categories": [
    { "id": "capture", "name": "截屏录屏" },
    { "id": "annotate", "name": "屏幕标注" },
    { "id": "keys", "name": "按键显示" },
    { "id": "keyboard", "name": "虚拟键盘" }
  ],
  "tools": [{
    "id": "keyviz",
    "name": "Keyviz 按键显示",
    "category": "keys",
    "tags": ["按键", "快捷键", "演示"],
    "description": "实时显示按键/鼠标操作，教学演示用",
    "license": "MIT",
    "homepage": "https://github.com/mulaRahul/keyviz",
    "download_url": "https://github.com/mulaRahul/keyviz/releases",
    "size_bytes": 1234567,        // 未知/未钉 asset 时为 0
    "checksum": "sha256:...",     // 未知/未钉 asset 时为 ""
    "portable": true,
    "win7_ok": false,
    "recommend": true,
    "entry": "keyviz.exe"         // 落盘后的相对启动文件
  }]
}
```

- `recommend`：每类 ≥1 个推荐标记（"推荐"角标/筛选依据）；`win7_ok` 按工具自身平台要求标注（R03 §4.5 平台提醒，不强制工具本身 Win7）。
- MVP `download_url` 指向官方 GitHub releases **页面**（或官网下载页），不钉深链 asset（避免 404）；`size_bytes`/`checksum` 在钉定 asset 后回填。
- 首发目录（R03 §4.5 / 附录 A，7 工具 4 类）：截屏录屏 = SnipEasy（MIT，推荐）/ WinShot（BSD-3）/ Snipaste（免费闭源）；屏幕标注 = 智绘教 Inkeys（GPL-3.0，Win7 RTM+，推荐）/ MarkerOn（MIT）；按键显示 = Keyviz（开源，推荐）；虚拟键盘 = osk.exe（系统内置，零分发，推荐）。

---

## 5. 数据上报接口

### 5.1 白名单上报

| 项 | 内容 |
|---|---|
| `POST /api/edu/report/ingest` | 批量上报授权/使用状态（Bearer JWT，静默失败不阻断） |

```jsonc
// 请求（字段白名单，对齐需求 §2.4 / RUST §5.3）
{
  "client_version": "0.1.0",
  "installed_packages": [ { "package_id": "pep-reader", "version": "1.3.3" } ],
  "license": { "semester": "2026S", "status": "valid", "expires_at": "2027-01-31" },
  "usage": [ { "package_id": "pep-reader", "runs": 12, "seconds": 3600, "day": "2026-09-23" } ],
  "crash_log": null                      // 可选匿名崩溃日志（限 64KB）
}
// 响应 200
{ "ok": true }
```

> **禁止字段**：学生名单、学习行为、练习成绩、任何儿童可定位数据——服务端校验并丢弃非白名单字段（实现层强制）。

---

## 6. 限频与安全

| 接口 | 限频 |
|---|---|
| 短信发送 | 1 条/分钟/手机号；5 条/小时；10 条/天 |
| 微信扫码 | 每设备 1 会话/2 分钟；轮询 ≤120s |
| 认证失败 | 同一 IP/手机号 5 次/小时 → 429 |
| 内容包下载 | 登录态 100 次/小时（防批量拖包） |
| 口令续期 | 3 次/天（防刷口令） |

安全要求：
- JWT secret / 激活码签发私钥 / 内容包签名私钥 / API Key —— 全部存 Workers 环境变量（Secret），不入库不入代码仓；
- 短信/微信回调域名白名单校验；
- 上报 ingest 做字段白名单强制过滤 + 体积上限校验（≤64KB/请求）。

---

## 7. 接口清单速查

| 方法 | 路径 | 用途 | 需要 JWT |
|---|---|---|---|
| POST | `/api/edu/auth/wechat/qr` | 生成微信二维码会话 | 否 |
| GET | `/api/edu/auth/wechat/status` | 轮询扫码结果 | 否 |
| POST | `/api/edu/auth/sms/send` | 发短信验证码 | 否 |
| POST | `/api/edu/auth/sms/verify` | 短信登录 | 否 |
| POST | `/api/edu/auth/password` | 密码登录 | 否 |
| POST | `/api/edu/auth/password/reset` | 找回密码 | 否 |
| POST | `/api/edu/auth/profile` | 补任教信息 | ✅ |
| POST | `/api/edu/auth/activate` | 激活码绑定 | ✅ |
| POST | `/api/edu/auth/refresh` | 刷新凭证 | ✅ |
| POST | `/api/edu/license/renew` | 申请/续期口令 | ✅ |
| GET | `/api/edu/license/pack` | 下载口令包 | ✅ |
| POST | `/api/edu/license/bind` | 追加绑定机器 | ✅ |
| GET | `/api/edu/packages/manifest` | 内容包清单 | ✅ |
| GET | `/api/edu/packages/<id>/<ver>` | 下载内容包 | ✅ |
| POST | `/api/edu/packages` | 服务端发新包（管理） | API Key |
| GET | `/api/edu/toolbox/manifest` | 工具箱工具清单 | ✅ |
| POST | `/api/edu/report/ingest` | 白名单上报 | ✅ |

---

## 8. 决策记录

- **2026-09-23 v1.0 定稿**：
  - 认证三方式（微信扫码/短信/密码）+ 7 天 JWT + refresh；统一错误结构；
  - 课堂口令 = 服务端签名口令包（特权签发、机器绑定 ≤3、续期免费）；
  - 内容包清单 MVP = 静态 manifest + R2（简单配置），P4 演进市场；
  - 上报白名单强制过滤 + 禁儿童数据字段；限频策略按表；
  - 待 `D03-V1.0-Workers服务端-开发方案.md`（⑤）细化实现后进入 P1。