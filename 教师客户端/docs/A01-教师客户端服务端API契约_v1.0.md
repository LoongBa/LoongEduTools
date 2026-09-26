# A01 教师客户端服务端 API 契约（v1.1）

> 状态：**v1.0，供 P1 实施；v1.1（2026-09-26）增补 D09 签名凭证签发契约（§4.5）**。本文档定义教师客户端配套 Cloudflare Workers 的全部 HTTP 接口契约。
> 上游：`R01-教育工具-教师客户端需求分析与设计方案.md`（§2.3/§7/§8）、`D01-教育工具-教师版RUST外壳开发方案.md`（§3/§6）、`S01-内容包与口令包Schema_v1.0.md`（§3/§5）、`D09-内容包防扩散与部署方案.md`（§2.1/§2.2/§2.6/§2.7）。
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

### 4.5 签名凭证签发与续期（D09 防扩散）

> 本组接口服务 D09 签名凭证体系：`credential.enc` 由**服务端 Ed25519 独立密钥对 `credential-sign-2026`** 签发（与内容包/口令包签名密钥**分离，两个信任域**——D09 §2.2），签名内含机器指纹 + 14 天硬过期 + 单调递增 seq，防"拷贝文件夹即扩散"。
> **凭证有效期 14 天**（硬断，D09 §2.6）与 **JWT 有效期 7 天**（§1.3）是两个独立窗口：JWT 过期只影响在线功能，凭证过期才硬断开课（D09 §2.7 联动矩阵）。

#### 4.5.1 接口定义

| 项 | 内容 |
|---|---|
| `POST /api/edu/credential/sign` | 签发（首次）或续期（再次调用）签名凭证；**Bearer JWT（7 天会话，§1.3）** |

```jsonc
// 请求（Bearer JWT）
{
  "machine_fp": "a1b2c3...（32 位小写 hex；fingerprint.rs：HKLM MachineGuid + 计算机名 → SHA256 前 32 hex）",
  "key_material": "<base64>（签发机本地包裹后的不透明内容密钥字节，服务端不解析）"
}
// 响应 200 —— credential + signature（签发机据此写 U 盘 credential.enc）
{
  "credential": {
    "format_ver": "1",
    "machine_fp": "a1b2c3...",
    "issued_at": 1750000000,        // unix 秒（i64）
    "expires_at": 1751209600,       // = issued_at + 14*86400
    "seq": 5,
    "key_material": "<base64>",
    "quota_ref": "lic:ABC-1234-DEFG-5678"
  },
  "signature": {
    "alg": "ed25519",
    "key_id": "credential-sign-2026",
    "signed_payload_hash": "sha256:...",
    "sig": "<128 位小写 hex>"
  }
}
// 403 —— 该机器已报失（D09 §8 R8）
{ "error": { "code": "FORBIDDEN", "message": "该机器已报失，拒签后续凭证" } }
// 403 —— 已达机器配额上限（A01 §2.5/§3.3 联动）
{ "error": { "code": "FORBIDDEN", "message": "已达绑定上限（3 台），请先解绑或升级配额" } }
// 400 —— machine_fp / key_material 缺失或格式错
{ "error": { "code": "BAD_REQUEST", "message": "machine_fp 必填" } }
```

**错误码语义**（复用 §1.2 既有 code，无新增 code）：

| code | HTTP | 场景 |
|---|---|---|
| `BAD_REQUEST` | 400 | `machine_fp` 非 32 位小写 hex / `key_material` 缺失或超长（≤64KB） |
| `UNAUTHORIZED` | 401 | 未登录 / JWT 无效 |
| `AUTH_EXPIRED` | 401 | JWT 过期（重新登录即可；不影响已装凭证离线开课） |
| `FORBIDDEN` | 403 | **该机器已报失拒签** / 已达机器配额上限 / 教师身份未通过 |
| `RATE_LIMITED` | 429 | 超出 §6 凭证签发限频 |

**关键前提 —— key_material 由签发机本地包裹，PIN 永不到达服务端**（D09 §2.2/§2.3）：

```
签发机本地：
  KEK = Argon2id(结构化拼接 [pin_len:u16][pin_bytes][口令bytes], salt)
        （Argon2id 参数 m=48MiB, t=2, p=1, output=32B，上线前在目标机实测定稿）
  内容密钥 → AES-256-GCM(KEK) 包裹 → key_material（密文，对服务端不透明）
教师带 U 盘到办公室 → 签发机（登录态 JWT）→ POST /credential/sign
                        上传 { machine_fp, key_material }
服务端只做：校权 → 查报失黑名单 → 配额校验 → 赋 seq → 算 14 天窗口
          → Ed25519 签名 → 回包 → 签发机写 U 盘 credential.enc
```

> PIN / 口令 / 明文内容密钥**永不离开签发机、永不上传**；服务端把 `key_material` 视为**不理解的字节**（base64 载体），不解码、不校验内容、不落明文。

#### 4.5.2 凭证负载与签名规范化（关键：被签名的字节）

**被签名对象** = `credential` 对象（7 个字段）的**规范化 JSON 文本字节**；`signature` 块位于信封外层，**不参与签名**。规范化规则与 `package.rs::canonical_json_sign_view`（S01/D04 内容包 manifest 验签同款）**逐字节对齐**——Rust 客户端与 TS 服务端必须产出完全一致的字节：

1. **剔键**：序列化前剔除顶层 `signature`、`checksum` 键（当前 credential 内本无此二键，规则保留以对齐既有实现、兼容演进）；
2. **对象**：键按 **UTF-8 字节序**升序排序（本契约键名全为 ASCII，即字典序），紧凑输出 `{"k1":v1,"k2":v2}`，键名双引号、键值间 `:`、键对间 `,`，**无任何空白**；
3. **数组**：`[v1,v2]`，元素间单 `,`（本契约无数组字段，规则随算法保留）；
4. **字符串**：双引号包裹，转义为 **serde_json 风格**：
   - `"` → `\"`，`\` → `\\`，`\b \f \n \r \t` 用快捷键；
   - 其它控制字符（< U+0020）→ `\u00xx`（**小写** hex 四位）；
   - **非 ASCII 字符原样 UTF-8 输出，不做 `\uXXXX` 转义**（与 JS `JSON.stringify` 默认行为不同——它把中文转成 `\u4e2d\u6587`；TS 实现必须逐字符转义，不能直接 `JSON.stringify` 字符串）。本契约字段全为 ASCII（hex 指纹 / base64 / 整数 / `lic:` 引用），实际不会触发，但规则必须一致；
5. **数字**：整数按十进制原样输出（无小数点、无指数）。本契约数字（`issued_at`/`expires_at`/`seq`）均为整数，远小于 JS `Number.MAX_SAFE_INTEGER`；
6. **null / bool**：`null` / `true` / `false`。

**字段排序结果**（7 字段字典序）：`expires_at` → `format_ver` → `issued_at` → `key_material` → `machine_fp` → `quota_ref` → `seq`，规范化字节固定为：

```
{"expires_at":<int>,"format_ver":"1","issued_at":<int>,"key_material":"<b64>","machine_fp":"<hex32>","quota_ref":"<lic:...>","seq":<int>}
```

**编码约定**（与 package.rs 验签侧一致）：

| 项 | 约定 |
|---|---|
| `format_ver` | 字符串 `"1"`（与旧 credential.enc 的 AES-GCM JWT 结构区分，D09 §2.1） |
| `machine_fp` | 32 位**小写 hex** 字符串 |
| `issued_at` / `expires_at` | unix 秒整数（i64），JSON 数字；`expires_at = issued_at + 14*86400` |
| `seq` | 正整数（JSON 数字，首签 = 1） |
| `key_material` | **标准 base64** 字符串（服务端不理解的字节） |
| `quota_ref` | `lic:<license_key>`（无绑定激活码时为 `lic:default`） |
| `signature.alg` | `"ed25519"` |
| `signature.key_id` | `"credential-sign-2026"`（壳端硬编码对应公钥；轮换 = 壳端新增条目双轨兼容） |
| `signature.sig` | ed25519 签名 **hex 小写**（64 字节 → 128 字符；与内容包 manifest 验签侧一致，package.rs `hex_bytes`） |
| `signature.signed_payload_hash` | `sha256:` + 规范化字节 SHA-256 **hex 小写** |

> 服务端实现：`server/src/lib/credentialSign.ts`（密钥 = Secret `CREDENTIAL_SIGN_PRIVATE_KEY`，PKCS8 PEM 或 base64 raw 32B；缺省临时自签 + warning，仅本地联调）。客户端实现参考：`package.rs::canonical_json_sign_view` + `verify_manifest_signature`（同款算法）。

#### 4.5.3 签发 / 续期 / 预签流程（D09 §2.6）

- **首次签发**：教师到办公室 → 签发机（登录态 JWT）本地 Argon2id 包裹内容密钥 → `POST /credential/sign` → 得 credential+signature → 写 U 盘 `credential.enc` → 教室机 app「从 U 盘导入凭证」。
- **续期 = 同一接口再次调用**：服务端分配新 `seq`（前值 +1）、新 `issued_at`/`expires_at`（+14 天），其余字段不变语义。教室机导入按 §4.5.4 顺序验证后**覆盖**旧凭证。
- **预签多份稀释跑办公室频率**：同一接口连调 2–3 次（每次新 seq / 新窗口），教师批量带走、按周期覆盖。⚠️ 防回滚（M1）：客户端拒绝 `seq ≤ 已装凭证 seq` 的导入——先导新份再导旧份会被拒。
- **机器绑定是前提**：凭证签名内含 `machine_fp`，为特定机器签发；教室机 app 展示 `machine_fp`（`license_status.machine_fp`），办公室据此签发。配额校验见 §4.5.5。

#### 4.5.4 客户端验证顺序（D09 §2.3，客户端实现者按此落地）

```
1. Ed25519 验签（key_id=credential-sign-2026 公钥，壳内硬编码）——公开数据，无需任何秘密
2. machine_fp 匹配当前机器（fingerprint.rs）
3. expires_at 未过期（unix 秒整数比较）+ 时钟回拨检测（last_verified_at 写豁免区）
4. seq > 已装凭证 seq（按 教师+机器 配对记账；教师更换机器时新配对从 seq 1 起）
   —— 任一步失败：直接拒绝，不进入 PIN 环节
5. KEK = Argon2id(结构化(PIN, 口令), salt) → 解开 key_material → 内容密钥
6. 协议处理器内存解密内容文件（AES-256-GCM，S01 §2.1 既有）
```

> 顺序意义：跨设备攻击者（步骤 2 失败）连可离线穷举的目标都拿不到——PIN 环节只在合法机器上到达。

#### 4.5.5 seq / 报失拒签 / quota_ref 联动

- **seq 语义**：服务端按 **（教师, machine_fp）配对**维护单调递增计数（KV `cred:seq:<teacher_id>:<machine_fp>`）；首签 = 1，续期 = 前值 + 1。客户端拒绝 `seq ≤ 已装凭证 seq` 的导入（防旧凭证覆盖新凭证 / 防回滚，M1）。**教师更换机器时按新配对重新从 seq 1 计**——客户端"已装 seq"记录亦按配对记账。
- **报失拒签（D09 §8 R8 软吊销）**：运营在 KV 写入 `cred:blk:<machine_fp>` = `"1"` 即完成报失；此后该机所有 `POST /credential/sign` 返回 403 `FORBIDDEN`「该机器已报失，拒签后续凭证」。已流出凭证等其自然过期（≤14 天），水印 + 台账追溯兜底（离线无 CRL，接受残余）。**无管理端点**——黑名单为运维 KV 手工操作（生产 `wrangler kv key put` / 本地 kv_store 表），不在本契约新增管理 API。
- **quota_ref 联动（A01 §2.5/§3.3 机器配额）**：`quota_ref` 由**服务端**生成，引用该教师当前绑定激活码 `licenses.license_key`（其 `machine_quota` 即 A01 机器配额，缺省 3）；无绑定激活码时为 `lic:default`。**客户端不得自报 quota_ref**（服务端权威），凭证内 quota_ref 仅作可追溯引用。签发时服务端做配额校验：`machine_fp` 已绑定 → 放行；未绑定但绑定数 < 配额 → 放行（教室机首次签发场景）；未绑定且绑定数已达配额 → 403 `FORBIDDEN`「已达绑定上限」。

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
| 凭证签发 | 20 次/天/教师（预签多份留余量；防刷凭证） |

安全要求：
- JWT secret / 激活码签发私钥 / 内容包签名私钥 / **签名凭证私钥（`CREDENTIAL_SIGN_PRIVATE_KEY`）** / API Key —— 全部存 Workers 环境变量（Secret），不入库不入代码仓；
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
| POST | `/api/edu/credential/sign` | 签发/续期签名凭证（D09 防扩散） | ✅ |
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

- **2026-09-26 v0.3 补录（R03 关联决策）**：
  - **命名**：契约与文案禁「商店」，「内容商店」→「下载扩展」（消费向词汇一律不用）；
  - **categories 实装**（§4.1）：上传可选 CSV→数组、缺省空数组向后兼容；内容/扩展分区依据（方案 A），分区渲染在**壳内** StoreView 而非服务端页面；
  - **新增 `GET /toolbox/manifest`**（§4.4）：工具箱清单端点，姿态与 packages/manifest 一致（Bearer JWT，无 JWT 401）；R2 静态 JSON 可覆盖，缺省内置种子；工具清单权威源在服务端，本地只存快捷方式。

- **2026-09-26 v1.1 增补（D09 凭证签发扩展）**：
  - 新增 `POST /api/edu/credential/sign`（§4.5）：签名凭证签发/续期；Ed25519 **独立密钥对 `credential-sign-2026`**（与内容包/口令包签名密钥分离，两个信任域）；新 Secret `CREDENTIAL_SIGN_PRIVATE_KEY`；
  - 凭证 **14 天硬过期**（与 JWT 7 天独立窗口，D09 §2.7）；seq 按（教师, 机器 fp）配对单调递增，客户端拒 `seq ≤` 已装；
  - **报失 = KV 黑名单 `cred:blk:<machine_fp>`**（运维手工操作，不建管理 API；D09 §8 R8 软吊销）；
  - **key_material 由签发机本地 Argon2id 包裹后上传**，PIN/口令/明文内容密钥永不到达服务端；服务端视其为不透明字节；
  - **规范化字节与 `package.rs::canonical_json_sign_view` 逐字节对齐**（§4.5.2）；`sig` 用 **hex 小写**（与内容包 manifest 验签侧一致）；
  - `quota_ref` 由服务端生成（引用绑定激活码 `licenses.license_key`），配额校验联动 A01 §2.5/§3.3。