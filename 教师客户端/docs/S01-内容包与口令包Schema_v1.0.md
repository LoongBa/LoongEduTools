# S01 内容包与口令包格式 Schema（v1.0 冻结版）

> 状态：**冻结 v1.0；v1.1（2026-09-26）增补 D09 C2 密钥链**；签名/加密机制叙述与四域密钥总表 → **D10-签名与加密方案**（枢纽）。本文档为教师客户端**双版本体系**的数据格式唯一权威：
> 内容包（数据/应用）与口令包（授权）的目录结构、manifest 字段、加密/签名规格、U 盘导入规则。
> 上游：`R01-教育工具-教师客户端需求分析与设计方案.md`（§2.3/§4）与 `D01-教育工具-教师版RUST外壳开发方案.md`（§2/§4）。
> 变更冻结：内容包/口令包格式一经冻结，**P0-P4 一律遵守**；变更需重评估，不得静默改格式。

---

## 1. 包类型总览

| 包类型 | 用途 | 是否签名 | 是否加密 | 分发 |
|---|---|---|---|---|
| **内容包（Content Pack）** | 数据/应用：教材点读、可下载工具、名单包之外的静态内容 | manifest 服务端签名 | data/ 目录 AES 加密 | 云端下载 / U 盘导入 |
| **口令包（License Pack）** | 授权：课堂口令（一学期） | 服务端签名 | 不加密（签名即防伪） | 在线签发 / U 盘导入 |
| **名单包（Roster Pack）** | 个性化数据：学生名单/分组（抽卡） | 不签名（口令解密即凭证） | AES 加密 + 课堂口令派生密钥 | 在线版配置 → 下载 |

> 三包共用「本地包」概念：落地均为 zip 压缩 + 加密/签名保护的目录结构。运行时鉴权 = 凭证有效 × 口令级别达标 × 范围匹配（需求方案 §2.3）。

---

## 2. 内容包（Content Pack）

### 2.1 目录结构

```
content-pack-<package_id>-<version>.zip          # 分发文件名（含 id + 版本便于识别）
├── manifest.json            # 顶层：服务端签名（见 §2.3）
├── package.json             # 包内清单（未加密，供 U 盘导入预检，见 §2.4）
└── data/                    # ★ 加密区（AES-256-GCM，见 §2.5）
    ├── app/                 #   应用型：可执行 HTML/JS/资源（如教材点读）
    │   ├── index.html
    │   ├── assets/          #     JS/CSS/音频/图片
    │   └── ...
    ├── data/                #   数据型：JSON/词库/内容列表
    │   └── ...
    └── packages-manifest.json  # 解密后可见：包内全部文件清单 + hash（校验完整性）
```

### 2.2 manifest.json（顶层，未加密，服务端签名）

```jsonc
{
  "schema_version": "1.0",              // 本 Schema 版本
  "package_id": "pep-reader",           // 唯一 id（语义化，如 pep-reader / 24game / u01-content）
  "package_type": "app",                // app（应用型）| data（数据型）
  "name": "PEP 英语点读（教师版）",
  "display_name": "教材点读",            // 壳内展示名
  "icon": "app/icon.png",               // data/ 内相对路径
  "package_version": "1.3.3",           // ★ 内容包自身版本（独立递增，与壳版本无关）
  "content_hash": "sha256:...",         // ★ 完整性：data/ 区整体 hash（SHA-256）
  "size_bytes": 52428800,               // 解压后体积（壳展示/预检用）
  "min_shell_version": "0.1.0",         // ★ 所需最低壳版本（旧壳不加载，提示升级壳）
  "required_license_level": 1,          // ★ 所需口令级别（1=基础包；2=敏感教材包）
  "categories": ["教材", "英语"],        // 分类标签（内容包市场演进预留）
  "description": "小学英语 PEP 教材逐句点读",
  "release_date": "2026-09-23",
  "author": "LoongBa",
  "download_url": "/api/packages/pep-reader/1.3.3",   // 分发元数据（云端）
  "checksum": "sha256:...",             // ★ zip 文件本体 hash（下载完整性校验）
  "min_free_version": null,             // 预留：免费/付费分层（null=不启用）
  "signature": {                        // ★ 服务端 ed25519 签名
    "alg": "ed25519",
    "key_id": "pkg-sign-2026",          // 公钥 id（换钥轮转）
    "nonce": "uuid",
    "signed_payload_hash": "sha256:...", // 对 manifest 关键字段规范化 JSON 的 hash
    "sig": "base64..."                  // 签名值
  }
}
```

**关键规则**：
- `package_version` 与 `content_hash` 是双版本体系的核心——更新内容包 = 升 `package_version` + 换 `content_hash`；
- `min_shell_version` 用语义化版本比较（x.y.z 三级），旧壳加载新包时版本不足 → 拒绝并提示；
- `signature.sig` 覆盖**规范化 manifest 全文**（剔除 signature 自身后按字段序序列化），防字段篡改；
- 服务端签发 → 私钥保管在 Workers 环境变量，不入库。

### 2.3 package.json（包内未加密预检清单）

```jsonc
{
  "package_id": "pep-reader",
  "package_version": "1.3.3",
  "file_count": 128,
  "total_size": 52428800,
  "encrypted": true,                    // data/ 是否加密
  "enc_alg": "AES-256-GCM",
  "file_index": [                       // 每文件：相对路径 + hash（解密后校验）
    { "path": "app/index.html", "sha256": "..." },
    { "path": "app/assets/main.js", "sha256": "..." }
    // ...（全部文件）
  ]
}
```

### 2.4 U 盘导入预检（壳启动扫描时读 package.json）

```
U 盘检测（启动时扫描根目录 packages/*.zip 或指定目录）
  → 读 zip 内 package.json（未加密，可预检）
  → 校验 package_id/version 与本地差异 → 校验签名（manifest）
  → 签名通过 → 文件复制到本地 packages/ 暂存 → 运行时解密入库
  → 失败（签名错/hash 不符/版本低于 min_shell_version）→ 提示并跳过，不破坏本地
```

### 2.5 data/ 加密规格

- 算法：**AES-256-GCM**（认证加密，防篡改 + 防披露）；
- 加密对象：data/ 区**整体**（zip 压缩后对 data/ 目录加密）或逐文件加密（推荐逐文件：支持运行时按需解密加载，避免整包解密开销）；
- 逐文件加密（**口径不变**）：每个文件 16 字节随机 IV 前置，密文 = `iv | ciphertext | tag`（GCM 认证标签并入，无 AAD）；字节格式 = `scripts/crypto_out.py::encrypt_bytes`（`iv(16) | ct | tag`，tag 并入 ct 尾部）；
- 内容密钥（v1.1 起，仅内容包）：**K = 单一全局内容主密钥**（32 随机字节）。打包/办公室侧文件 = `教师客户端/scripts/keys/content-master.key`（64 位小写 hex + 换行；经 `scripts/.gitignore` 的 `keys/*.key` 忽略、不入 git；**永不进入任何内容包 zip**）。`pack_content.py` 经 `--content-key-file` 读取（默认即上述路径，缺省自动生成）；
- 运行时密钥链（v1.1 起，仅内容包）：K 仅随签名凭证 `credential.enc` 的 `key_material` 字段分发——`key_material` = 以 KEK 对 K 的 AES-256-GCM 包裹，KEK = Argon2id(结构化拼接 `[pin_len:u16][pin][pass]`, salt)，参数 m=48MiB / t=2 / p=1 / out=32B；`credential_unlock` 时解包；**K 仅存内存、不落盘**。交叉引用：D09 §2.2 / §2.3 / §2.4、A01 §4.5.1；
- 完整性口径（不变）：package.json `file_index` 的 sha256 = **明文 hash**（解密后比对）；manifest `content_hash`（打包侧 data_hash）= **密文整体** SHA-256（按存储序）；package.json `encrypted: true`，`enc_alg` 加密时固定字符串 = `"AES-256-GCM"`（见 `scripts/gen_package_json.py`）；
- 解密时机：运行时鉴权通过后（凭证有效 × 口令级别达标），按 Rust 命令 `package.load` 按需解密加载，**不落盘明文**（解密到内存/临时区，退出清理）；
- **v1.0「口令 → HKDF → 内容密钥」对内容包弃用**（D09 §2.4 C2）：**不做双轨兼容解密器**；HKDF（口令派生）仅保留给名单包（§4.3）。

> 范围说明：**v1.1 变更仅限内容包；名单包维持 v1.0。**

---

## 3. 口令包（License Pack）

### 3.1 目录结构

```
license-pack-<teacher_id>-<semester>.zip
├── license.json            # 口令包本体（服务端签名）
└── (无 data/，签名即全部防伪)
```

### 3.2 license.json

```jsonc
{
  "schema_version": "1.0",
  "license_type": "classroom",          // classroom（课堂口令）/ eval（试用）
  "teacher_id": "wx_abc123",            // 微信 openid 哈希（关联教师身份）
  "semester": "2026S",                  // 学期标识（如 2026 秋 = 2026A 或 2026S，定一年两期规则）
  "issued_at": "2026-09-01T00:00:00Z",
  "expires_at": "2027-01-31T23:59:59Z", // ★ 一学期到期日
  "scope": {                            // 授权范围
    "machine_quota": 3,                 // 绑定机器数上限
    "bound_machines": ["fp1","fp2"],    // 已绑定机器指纹（哈希，可追加到 ≤quota）
    "license_level": 2                  // 授权口令级别（决定可解锁内容包的 required_license_level）
  },
  "signature": {                        // 同 §2.2 signature 结构（ed25519）
    "alg": "ed25519",
    "key_id": "license-sign-2026",
    "signed_payload_hash": "sha256:...",
    "sig": "base64..."
  }
}
```

### 3.3 规则

- 口令包**不加密**（内容本身无素材价值，签名防伪造即可）；
- 到期判断：本地比对 `expires_at`（简单保护定位，接受改时钟绕过；服务端续期时校准时间）；
- **续期**：在线版一键续期 → 服务端重签发新 `expires_at` → 新口令包覆盖旧包 → 本地内容不动；
- 机器绑定：`scope.bound_machines` 存指纹哈希，绑定需联网（首启激活时），离线期间只校验数量不新增绑定；
- 到期行为（默认 B）：`expires_at` 后，已下载内容只读可用、不能下载/导入新内容包、不能配置新名单。

---

## 4. 名单包（Roster Pack）——抽卡/分组的个性化数据

### 4.1 目录结构

```
roster-pack-<teacher_id>-<roster_id>.zip
├── roster.json             # 名单包（AES 加密 + 课堂口令派生密钥）
└── (无 manifest 签名——口令解密成功即凭证)
```

### 4.2 roster.json（解密后）

```jsonc
{
  "schema_version": "1.0",
  "roster_id": "class-301",
  "teacher_id": "wx_abc123",
  "created_at": "2026-09-23T10:00:00Z",
  "expires_at": null,                   // 随课堂口令生命周期（口令过期则名单失效）
  "students": [                         // ★ 本地解密后可见；云端不留
    { "id": "s01", "label": "李小明", "group": 1 },
    { "id": "s02", "label": "王小红", "group": 2 }
  ],
  "groups": { "1": "第一组", "2": "第二组" },   // 分组名（R12 分组用）
  "stats": null                          // 预留：本地聚合统计（不上报）
}
```

### 4.3 规则

- 密钥派生同 §2.5（HKDF：IKM=课堂口令密钥, salt=roster_id+teacher_id, info="roster-pack-v1"）；
- **云端不留**：在线版生成后仅传输，服务端不落库（或下载后即删）；
- 口令过期 → 名单包不可解密（与课堂口令生命周期绑定）。

---

## 5. 版本协同规则（壳 ↔ 内容包）

| 规则 | 说明 |
|---|---|
| 独立版本 | 壳 X.Y.Z（tauri-plugin-updater）；内容包 package_version（manifest）——互不强制同步 |
| 壳更新 | 不迁移/不重建内容包（内容包存本地 packages/，壳更新只换 exe） |
| 内容包加载 | `min_shell_version` ≤ 当前壳 → 加载；> 当前壳 → 拒绝并提示升级壳 |
| 口令级别 | 口令包 `license_level` ≥ 内容包 `required_license_level` → 可解密；否则拒绝 |
| 内容包升级 | 高版本覆盖低版本（同 package_id）；版本相同 hash 不同 → 视为损坏，重新下载/导入 |

---

## 6. 安全边界（对齐"简单保护"定位）

| 项 | 边界 |
|---|---|
| 内容包加密 | AES-256-GCM + 口令派生密钥——挡 99% 随手拷贝；不做强 DRM（密钥最终在客户端，专业逆向可破） |
| 签名 | ed25519 防伪造/篡改；私钥在服务端环境变量 |
| 时间篡改 | 口令到期本地校验，可被改时钟绕过——接受；续期时服务端校准 |
| 机器绑定 | 首启激活联网绑定；离线只校验数量 |
| 口令包/名单包 | 传输全程 HTTPS；名单云端不留 |

---

## 7. 冻结记录

- **2026-09-23 冻结 v1.0**：字段/加密/签名/导入规则按上文锁定；P0-P4 一律遵守。
- P0 预装内容包（教材点读）即按本 Schema 打包（manifest + 加密 data/ + 预检 package.json）。
- 变更流程：格式变更须重评审（Oracle）+ 升 schema_version + 记录迁移（P1 前不变更，若发现缺陷走评审）。

---

## ADR（v1.1 变更记录）

> v1.1（2026-09-26）由 D09 §2.4 C2 决策驱动：内容包密钥链从「口令 → HKDF → 内容密钥」改为「Argon2id(PIN‖口令) → KEK → 解 key_material → 内容密钥」。本附录记录四项 ADR 及其与上游文档的对齐；**办公室签发工具、凭证解锁 UI 均为后置实现**（本期不产出，不在本 Schema 承诺范围）。

**ADR-1 · C2 密钥链（D09 §2.4）**

- S01 升 v1.1 并补本 ADR；已交付的英语点读 zip 按新格式**全量重打包 + 重 QA**（范围见 ADR-3）；**不做双轨兼容解密器**——v1.0「口令 → HKDF」派生对内容包弃用（见 §2.5）。

**ADR-2 · 内容主密钥保管**

- K（32B 全局内容主密钥）明文文件**仅在办公室打包侧**（`教师客户端/scripts/keys/content-master.key`，gitignored，永不进内容包 zip）；运行时**只见到 `key_material`**（密文包裹态），`credential_unlock` 解包后 K 仅存内存。

**ADR-3 · 重打包范围（2026-09-26 用户裁定）**

- D09 §2.4「11 个英语点读 zip 全量重打包」表述**收窄**为实际被消费的 4 个产物：预装 `pep-reader-u01`（教材点读）+ `pep-vocab-cards`（词卡），四上 unit1 / unit2 的可下载孪生包；其余未消费的不在本期重打包范围。

**ADR-4 · 「包裹态密钥文件与内容包同目录」后置（D09 §2.4）**

- 该条**延期**至未来办公室签发工具；本期运行时**只消费 `credential.enc` 的 `key_material`**（`credential.rs` 已实现），本阶段不产出同目录包裹态密钥文件。