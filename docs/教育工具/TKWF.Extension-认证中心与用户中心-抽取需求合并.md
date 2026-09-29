# TKWF.Extension · 认证中心与用户中心 抽取需求合并（供框架扩展模块开发组）

> 状态：v1.0（2026-09-30 定稿，输入素材：DMP-Lite AuthCenter 代码/文档 + 平台管理系统 + 教育工具系列/桃李助手需求 + Oracle 外审 1B/5I/4N）
> 定位：**DMP-Lite 是应用项目，其认证中心需「抽取」为 TKWF.Extension 通用模块**——本文件合并两业务线（生活服务电商 + 教育工具）的认证/用户中心需求，标注通用边界，供框架扩展模块开发组深入调研后抽取实现。抽取完成后，各业务系统（含教育工具系列）**仅引入模块即可低代码接入**，不再二次开发认证。
> 部署裁决（用户 2026-09-30）：DMP-Lite 与教育工具系列**独立部署两套认证中心/用户中心实例**（不同业务线），共用同一 TKWF.Extension 组件。

---

## 一、两业务线需求合并（抽取的功能全景）

### 1.1 共性需求（所有业务线共有，必入通用模块）

| 能力 | DMP-Lite（生活服务电商）现状 | 教育工具系列/桃李助手需求 | 合并结论 |
|---|---|---|---|
| **认证方式** | 密码（仅平台管理员）/ 短信验证码 / 微信扫码 / 抖音 OAuth | 手机号短信（主）/ 微信网页授权+扫码（认证后就绪便捷）/ 口令兑换 | 通用：多方式认证矩阵（配置化启用） |
| **身份主键** | `MemberUser.UId` / `PlatformAdmin.UId`（string32 内部 id） | 平台内部 id（sub=内部 id，手机号必填主键） | **通用：平台内部 id 为唯一身份引用** |
| **令牌体系** | JWT RSA-SHA256（`sub="user:{userId}"` / mid / role / authType）+ Refresh Token rotation（30d）+ Handshake Token（30s） | JWT（`sub`+auth_level+teacher_verified+exp+iat+jti，**不含业务角色**）+ 2h/7d 双档 + refresh | 通用：TokenService（RSA 密钥轮换/kid/黑名单） |
| **会话交换** | JWT → DomainUser Session（`ISessionExchangeService`，进程内 InProcessExchange） | 令牌 → DomainUser（`JwtDomainUserParser`，AuthorityFilter 零改动） | 通用：Session 交换 + 身份适配层 |
| **登录保护** | `AuthLoginAttempt` 实体 + IP 限流（10 次/分钟/IP）+ 防暴力 + 审计 | 短信 60s/小时/天/IP + 口令兑换 5 次/小时 + oauth 10 次/分钟/IP | 通用：AuthLoginAttempt + 限流策略 |
| **档案面** | `MemberUser`（昵称/头像 URL/手机号/微信绑定）+ GetProfile | 公共 Profile（手机号脱敏/微信绑定/头像 URL）+ 用户中心页面 | 通用：公共档案 API + 档案页面 |
| **第三方平台凭证** | `PlatformCredential`（AppId/AppSecret AES-GCM 加密）+ `WeChatApiClient`（token 缓存） | 微信 AppSecret 仅服务端 + 公众号/开放平台双形态 | 通用：平台凭证管理 + 微信 API 客户端 |
| **跨系统身份映射** | `GlobalUserMap`（平台 OpenId ↔ 商户 OpenId，类 UnionId） | 平台内部 id ↔ 各业务系统本地 id | 通用：全局用户映射（参数化） |

### 1.2 业务线特有需求（留应用层或参数化扩展点）

| 能力 | DMP-Lite 特有 | 教育工具系列特有 |
|---|---|---|
| 账号类型 | 平台管理员（密码 + SuperAdmin/Operator 角色）、商户管理员、会员 | 家长（手机号/微信）、教师（审核标记 teacher_verified）、孩子（无账号，家庭码） |
| 授权/兑换 | 商户授权（ExpireDate）、会员卡等级 | **口令兑换体系**（商品载体/电商上架/分销/教师审核/campaign 免费体验）+ 授权快照 /grants |
| 业务档案 | 会员卡积分/卡等级/卡面（商户库 MemberInfo） | 教师档案/家庭码/学习进度（各应用本地） |
| 业务角色 | merchant_admin / member（JWT 含 role） | **不进令牌**，本地映射（student/owner/parent 等） |
| 数据隔离 | 多商户分库（Merchant.ConnectionString 动态切库） | 家庭码维度隔离（孩子端无账号红线） |

> **抽取原则（Oracle I2 采纳）**：通用内核**参考重写**进 TKWF.Extension（解耦 DMP-Lite 商户模型），**不复用其代码**；业务线特有留应用层或作为 Ext 参数化扩展点。DMP-Lite 会员卡 AuthCenter **保留原址运行**，未来按需迁移，不强制。

---

## 二、通用 vs 特有边界（代码事实清单）

### 2.1 通用内核（可抽取，代码现状 `DMP-Lite.Platform.Domain`）

| 组件 | 现状路径 | 抽取为 |
|---|---|---|
| `AuthLoginAttempt` 实体 + DataService + DTO + Conditions + .biz.cs | `Entities/AuthCenter/` + `DataServices/` | Ext 通用实体（登录尝试/限流/审计） |
| `AuthRefreshToken` 实体 + 全套 | `Entities/AuthCenter/AuthRefreshToken.cs` | Ext 通用实体（Refresh rotation） |
| `ITokenService` / `TokenService`（Platform.Domain 版，async + ISystemActorService） | `Services/AuthCenter/` | Ext TokenService（RSA 签发/验证/撤销/kid 轮换/黑名单） |
| `IAuthLoginAttemptService` / `AuthLoginAttemptService` | `Services/AuthCenter/` | Ext 限流/审计服务 |
| `ISessionExchangeService`（接口） | `Services/AuthCenter/` | Ext JWT→DomainUser 交换（补齐实现） |
| `PlatformSettings` 实体 + 全套 | `Entities/PlatformSettings.cs` | Ext KV 配置服务 |
| `PlatformDomainRegistration` / `PlatformDomainInitializer` / `DmpPlatformUserInfo` / `DMPPlatformUserHelper` | `Platform.Domain/` | Ext 装配骨架（DomainHost 四阶段 + SystemActor + 登录钩子） |
| `PlatformDb` / `PlatformDomainJsonSerializerContext` | `Platform.Field/` + `Domain/` | Ext 数据库包装 + JSON 上下文 |
| xCodeGen 配置 | `.TKWF/xCodeGen/platform.xCodeGen.json` | Ext 代码生成路由 |

### 2.2 半通用（参数化/可配置，进 Ext 但带扩展点）

| 组件 | 现状路径 | 参数化点 |
|---|---|---|
| `GlobalUserMap`（平台 OpenId ↔ 业务本地 id） | `Entities/GlobalUserMap.cs` | 泛化为 `PlatformAccountMap`（platform_id ↔ business_app_id + business_local_id + platform 维度 + UnionId）——**教育线需注意 DMP V4.0 语义收窄（只承载管理员映射），抽取时统一两套机制（映射表 vs 外键）为一种** |
| `PlatformAdmin`（管理员账号 + 角色） | `Entities/PlatformAdmin.cs` | 泛化 Admin 账号（业务线可选启用） |
| `PlatformCredential`（第三方平台凭证） | `DMP-Lite.AuthCenter/Entities/` | 泛化平台凭证（微信/抖音/支付宝，AES-GCM 加密） |
| `WeChatApiClient` | `DMP-Lite.AuthCenter/Services/` | 泛化微信 API 客户端（token 缓存/并发锁） |
| `AuthCenterOptions` | `DMP-Lite.AuthCenter/Configuration/` | 配置节（签名密钥路径/过期时长/内部共享密钥） |

### 2.3 应用特有（留 DMP-Lite / 业务线本地，不进 Ext）

| 组件 | 现状路径 | 归属 |
|---|---|---|
| `Merchant` / `MerchantRegistry`（商户注册/授权/连接串） | `Entities/Merchant*.cs` | DMP-Lite 应用层（生活服务电商多商户） |
| `MerchantDataService` / `MerchantRegistryDataService` | `DataServices/` | DMP-Lite 应用层 |
| `AuthCenterModule` / `AuthEndpoints` / `UserEndpoints` / `MerchantEndpoints`（TODO 骨架） | `DMP-Lite.AuthCenter/Endpoints/` | DMP-Lite 应用层装配（端点按业务线重写） |
| 独立版 `ITokenService`（同步版）/ `JwtTokenService` | `DMP-Lite.AuthCenter/Services/` | **废弃**（统一用 Ext Platform.Domain 版，Oracle I2 参考重写） |
| 教育线特有：口令兑换（code/redemption/grant/batch）+ 教师审核流 + campaign/分销 + 家庭码 | — | 教育线装配 Ext 时的**业务扩展**（Ext 提供授权面骨架，兑换业务可参数化或应用层） |

---

## 三、令牌契约（冻结，供 Ext 实现与各业务系统消费）

### 3.1 JWT 最小化（用户裁定 + Oracle N1 确认）

```json
{
  "iss": "<auth-instance-id>",
  "sub": "user:<平台内部id>",
  "userId": "u_xxxx（string32 内部 id）",
  "authType": "sms | wechat | password | redeem",
  "auth_level": 1,
  "teacher_verified": false,
  "exp": 1722243600,
  "iat": 1722240000,
  "jti": "unique-token-id",
  "kid": "rsa-key-2026-07"
}
```

- **不含业务角色**：令牌只回答「你是谁」，不回答「你能干什么」。
- **teacher_verified 是身份声明**（类比 OIDC `email_verified`），**不参与 AuthorityFilter 的 IsInRole**——业务系统在本地 `MapRoles(sub, claims)` 映射教师角色（Oracle I4）。
- 业务角色（student/owner/parent/teacher 等）由各业务系统**按 sub 本地映射**（DMP GlobalUserMap 同构）。

### 3.2 回调承载（票据 URL + 接口换取，用户裁定 + Oracle B1 修订）

- URL 只带**一次性票据**（ticket，TTL 5min 单次消费）+ `redirect_uri`，**绝不带敏感信息**（复制扩散无风险）。
- **换令牌路径按子应用形态**：
  - 有服务端：内网/trust 域接口（`/oauth/exchange`）——桃李助手 server-dotnet / 平台服务端。
  - **纯前端静态站（教育小程序 CF Pages）**：公网 `/oauth/exchange` + **PKCE code_verifier** + 票据绑 `app_id` + `redirect_uri` 白名单（Oracle B1，等价 OAuth2 Auth Code + PKCE for SPA）。
- 状态/重放防护：`TICKET_EXPIRED` / `TICKET_CONSUMED` / `TICKET_STATE_MISMATCH`（Oracle N4 完备）。

### 3.3 令牌生命周期

| 类型 | 有效期 | 用途 | 备注 |
|---|---|---|---|
| Access Token | 2h（在线场景） | 调用 API / 换 DomainUser Session | 短会话 |
| Long-lived Token | 7d（壳端/低敏） | 桃李助手壳 / 长效 | 凭 refresh 续 |
| Refresh Token | 30d rotation | 换新 Access | TokenHash 落库，新旧不可复用（DMP 实践） |
| 一次性票据 | 5min 单次 | URL 回调承载 | 换令牌用 |

---

## 四、TKWF.Extension 模块划分建议（抽取产出）

```
TKWF.Extension（通用组件，多业务线复用）
├── Identity（身份适配层——业务系统装配，AuthorityFilter 零改动）
│   ├── JwtDomainUserParser.ParseAndVerify(token)   // 验签+令牌→DomainUser（内部强制验签）
│   ├── ITokenVerifier.Verify(token)                // 共享公钥本地验签 / 远程 introspection
│   └── IAuthorizationMapper<TUserInfo>.MapRoles(sub, claims)  // 本地业务角色（业务系统实现）
├── Authentication（认证面——Token Issuer）
│   ├── TokenService（RSA 签发/验证/撤销/kid 轮换/黑名单）
│   ├── 认证矩阵（密码/短信/微信扫码+网页授权/抖音 OAuth——配置化启用）
│   ├── AuthLoginAttempt（限流/审计）+ AuthRefreshToken（rotation）
│   └── 第三方平台凭证 + WeChatApiClient（token 缓存）
├── Profile（档案面——公共 Profile API + 用户中心页面）
│   ├── 公共档案（手机号脱敏/微信绑定/昵称/头像 URL/认证声明）
│   └── 用户中心页面（兑换历史/我的应用——业务线扩展点）
└── PlatformMap（跨系统身份映射，参数化）
    └── PlatformAccountMap（平台内部 id ↔ 业务本地 id + 平台维度 + UnionId）
```

- **装配**：各业务线**独立装配部署实例**（DMP-Lite 生活服务电商一套、教育工具系列一套，用户裁定）——同一 Ext，不同实例，各自数据。
- **低代码接入**：业务系统引入 Ext → 配置认证矩阵/密钥/档案字段 → 实现 `IAuthorizationMapper`（本地角色映射）→ 完成；教育工具系列 auth.js 替换为票据换令牌即可（不二次开发认证逻辑）。

---

## 五、教育工具系列装配需求（低代码接入规格）

### 5.1 认证面装配

| 项 | 配置/扩展 |
|---|---|
| 认证矩阵 | 手机号短信（必须）+ 微信网页授权/扫码（认证就绪后启用）+ **口令兑换（Ext 授权面扩展：code/grant 模型）** |
| 身份主键 | 平台内部 id（Ext 生成）；手机号必填唯一（用户裁定） |
| 教师身份 | teacher_verified（Ext 审核流钩子：公众号表单→审核→口令→标记）——业务角色本地映射 |
| 孩子 | **无账号**（家庭码，不进 Ext 账号表；家庭码签发/查询端点由 Ext 提供骨架或应用层） |

### 5.2 档案面装配

| 项 | 配置/扩展 |
|---|---|
| 公共档案 | 手机号（脱敏）/ 微信绑定 / 昵称 / 头像 URL（string，非二进制——DMP 实践） |
| 业务档案 | 各应用本地（教师档案/家庭码/进度/设置——不适合集中、需特化，Oracle/用户裁定） |
| 用户中心 | 公共层全量（兑换历史/我的应用/个人信息）→ 跳转 auth.loongba.cn/user |

### 5.3 令牌消费

- 教育小程序（纯前端）：票据 URL + PKCE 换令牌（Oracle B1 方案 A）。
- 桃李助手（server-dotnet）：内网换令牌 + 共享公钥验签；**离线激活码并存**（A01/S01/D09 不动）。

---

## 六、抽取关键约束与风险

| # | 约束/风险 | 说明 |
|---|---|---|
| 1 | **GlobalUserMap 语义两套并行** | DMP V4.0：管理员走映射表、会员走外键（MemberUser.UId ↔ MemberInfo.MemberUId）——**抽取需统一为一种通用机制**（建议：映射表统一承载「平台内部 id ↔ 业务本地 id」） |
| 2 | **sub 权威来源多态** | AuthCenter 签发 `userId`，底层按角色分叉（PlatformAdmin.UId / MerchantUserInfo.UId / MemberUser.UId）——Ext 需保留「账号类型多态」 |
| 3 | **AuthCenter 与平台管理同服务耦合** | DMP-Lite 中认证中心是 Platform.Web 的 SubDomain（共用 Platform DB）——**抽取必须显式拆分**「认证中心」与「平台管理」，Ext 只承载认证/档案 |
| 4 | **两个 ITokenService** | Platform.Domain 版（async/SystemActor）= 抽取基准；AuthCenter 独立版（sync）= 废弃（Oracle I2 参考重写） |
| 5 | AuthorityFilter 零改动 | 已核实源码只消费 DomainUser——**Ext 不得侵入 AuthorityFilter**，身份适配层产出 DomainUser 即可（Oracle N3） |
| 6 | 静态站换令牌 | PKCE 是硬性要求（Oracle B1）——教育小程序 44 款无服务端 |
| 7 | 认证中心故障降级 | 业务系统本地验签兜底（共享公钥）+ 授权快照短时缓存（Oracle I3） |
| 8 | 管理端数据隔离 | 多业务线共用 Ext 实例时按 app_id 权限隔离（Oracle I3）；本方案两业务线独立部署实例则天然隔离 |

---

## 七、交付物与后续

| # | 交付物 | 状态 |
|---|---|---|
| 1 | 本抽取需求文档（v1.0） | ✅ 本次产出 |
| 2 | 认证中心方案 v0.6（`docs/教育工具/认证中心与用户中心-统一认证体系独立立项方案.md`） | ✅ Oracle 1B/5I/4N 全采纳（静态站 PKCE/命名/参考重写/故障降级/teacher_verified 边界/ParseAndVerify） |
| 3 | DMP-Lite AuthCenter 通用性分析（代码事实清单） | ✅ 本轮探索产出（通用/半通用/特有三分类） |
| 4 | 框架扩展模块开发组深调研 → 抽取实现 | ⏳ 待框架组（以本文件为输入） |
| 5 | 教育工具系列装配（低代码） | ⏳ Ext 就绪后（auth.js 替换 + 认证矩阵配置 + IAuthorizationMapper 实现） |

---

## 八、决策记录

- **2026-09-30（v1.0 定稿）**：
  - 认证中心定位 = TKWF.Extension 通用化（吸收 DMP-Lite AuthCenter 经验）；DMP-Lite 与教育工具系列**独立部署两套实例**（不同业务线，用户裁定）。
  - 抽取原则：通用内核参考重写（解耦 DMP 商户模型）、半通用参数化、应用特有留业务线（Oracle I2）。
  - 令牌契约冻结：sub=平台内部 id、不含业务角色、teacher_verified 身份声明不参与 IsInRole（Oracle I4）；回调票据 URL + PKCE（Oracle B1）。
  - 身份适配层：ParseAndVerify 合并接口 + AuthorityFilter 零改动（Oracle N3/I5）；命名统一 TKWF.Extension.Identity（Oracle I1）。
  - 抽取关键决策点移交框架组：GlobalUserMap 双机制统一、sub 多态、认证中心与平台管理拆分。