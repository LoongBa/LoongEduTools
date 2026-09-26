//! 签名凭证命令层 · D09 §2 / A01 §4.5
//!
//! 新 `credential.enc` 格式：Ed25519 签名凭证（替代旧 AES-GCM JWT 缓存；JWT 缓存改名 session.enc，
//! 见 auth.rs）。服务端签发（`credential-sign-2026` 独立密钥对），客户端**仅验签、可完全离线**。
//!
//! 验证链（A01 §4.5.4，顺序不可调换——跨设备攻击者在步骤 2 就拿不到任何可离线穷举的目标）：
//! ```text
//! 1. Ed25519 验签（key_id=credential-sign-2026 公钥，壳内硬编码）
//! 2. machine_fp 匹配当前机器（fingerprint.rs）
//! 3. expires_at 未过期（unix 秒整数比较）+ 时钟回拨检测（last_verified_at 落豁免区状态文件）
//! 4. seq 语义（防旧凭证覆盖/防回滚 M1）——双模式：
//!     导入新凭证（严格）：seq > 已装 seq（拒收旧份，A01 §4.5.3）
//!     复验已装凭证（非严格）：seq ≥ 已装 seq（文件 seq 小于记录 = 被换成旧份 → 拒）
//!    —— 任一步失败：直接拒绝，不进入 PIN 环节
//! 5. KEK = Argon2id(结构化(PIN, 口令), salt) → AES-256-GCM 解开 key_material → 内容密钥（仅内存）
//! 6. 协议处理器内存解密内容文件（part B，S01 §2.1 既有）
//! ```
//!
//! 配对记账（A01 §4.5.5）：已装 seq + last_verified_at 按 **machine_fp** 键控
//! （客户机为单教师单机，教师维度在凭证内无独立标识；quota_ref 仅展示引用。
//! 新配对默认 seq=0，首导 seq≥1 即通过）。
//!
//! 文件分工（D09 §2.1，与 exe 同目录、免疫还原卡回滚）：
//! - `credential.enc`：本文件（签名凭证新格式，明文 JSON——签名即防伪，无秘密内容）
//! - `cred_state.json`：已装 seq + last_verified_at（按 machine_fp 记账；豁免区状态文件）
//! - `session.enc`：auth.rs 原名迁移的 JWT 缓存（AES-GCM，仅改名）

use crate::commands::contentkey;
use crate::commands::fingerprint::fingerprint;
use crate::commands::package::{canonical_json_sign_view, hex_bytes};
use crate::commands::recents::exe_dir;
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use base64ct::{Base64, Encoding};
use ring::signature::{UnparsedPublicKey, ED25519};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

// ---------------------------------------------------------------- 常量

/// 签名凭证公钥表（key_id → ed25519 公钥 hex · A01 §4.5.2 signature.key_id）。
/// `credential-sign-2026` = 凭证专用独立密钥对（私钥 = 服务端 Secret `CREDENTIAL_SIGN_PRIVATE_KEY`
/// 见 `server/src/lib/credentialSign.ts`；壳内只硬编码公钥）。与 `package.rs::SIGN_PUBKEYS`
/// （内容包信任域）**分离，两个信任域，私钥不共用**（D09 §2.2）。
/// 换钥轮转：追加新条目即可（旧壳旧钥可验、新凭证新钥可验，双轨兼容）。
pub const CREDENTIAL_SIGN_PUBKEYS: &[(&str, &str)] = &[(
    "credential-sign-2026",
    "84d9824c784ee23bc5504ae4230f25268fec1122e9fff448a9f9ab3c8dd3c5fc", // dev（详见 tests 常量）；生产轮换 = 追加新条目
)];

// 凭证有效期 14 天由服务端签发（expires_at = issued_at + 14*86400，A01 §4.5.1）——
// 客户端只按 expires_at 做整数比较硬断，不自行定义窗口常量。

/// 凭证格式版本（字符串 "1"，与旧 credential.enc 的 AES-GCM JWT 结构区分 · D09 §2.1）
pub const CREDENTIAL_FORMAT_VER: &str = "1";

/// 时钟回拨容忍（秒）：教室机校时抖动内的偏移不误报（D09 §2.3 "small tolerance"）
const CLOCK_ROLLBACK_TOLERANCE_SEC: i64 = 300;

// Argon2id 参数（D09 §2.3 推荐：教室机 <8GB + WebView2 已占 400-600MB 的平衡点，单次 ~200ms）
const ARGON_M_KIB: u32 = 48 * 1024; // 48 MiB
const ARGON_T: u32 = 2;
const ARGON_P: u32 = 1;
const ARGON_OUT: usize = 32;

/// key_material 包裹布局（本实现定义，D09 §2.3/§2.4 未细化 —— 签发机与教室机共同约定）：
/// `[salt:16B][gcm_nonce:12B][内容密钥:32B + GCM tag:16B]` = 76 字节 → base64。
/// salt 非秘密（防彩虹表），随 key_material 走；nonce 每次包裹随机。
const SALT_LEN: usize = 16;
const GCM_NONCE_LEN: usize = 12;
const CONTENT_KEY_LEN: usize = 32;
const GCM_TAG_LEN: usize = 16;

// ---------------------------------------------------------------- 数据结构（A01 §4.5.1）

/// 凭证体（被签名对象，7 字段；`signature` 在信封外层不参与签名）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialBody {
    pub format_ver: String,
    pub machine_fp: String,
    pub issued_at: i64,
    pub expires_at: i64,
    pub seq: i64,
    /// 签发机本地 Argon2id 包裹后的不透明内容密钥（base64；服务端不理解的字节）
    pub key_material: String,
    pub quota_ref: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialSignature {
    pub alg: String,
    pub key_id: String,
    pub signed_payload_hash: String,
    /// ed25519 签名 hex 小写（64 字节 → 128 字符）
    pub sig: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialPack {
    pub credential: CredentialBody,
    pub signature: CredentialSignature,
}

/// 导入/解锁成功的元数据（不含任何密钥材料）
#[derive(Debug, Clone, Serialize)]
pub struct CredentialMeta {
    pub installed: bool,
    pub format_ver: String,
    pub machine_fp_ok: bool,
    pub machine_fp: String,
    pub issued_at: i64,
    pub expires_at: i64,
    pub seq: i64,
    pub quota_ref: String,
}

/// unlock 结果（内容密钥仅入 contentkey 内存，绝不返回）
#[derive(Debug, Clone, Serialize)]
pub struct UnlockResult {
    pub ok: bool,
    pub expires_at: i64,
    pub seq: i64,
    pub key_available: bool,
}

/// 凭证状态（UI 用；不触发 Argon2id）
#[derive(Debug, Clone, Serialize)]
pub struct CredentialStatus {
    pub present: bool,
    pub machine_fp: String,
    pub format_ver: Option<String>,
    pub machine_fp_ok: Option<bool>,
    /// "none" | "valid" | "expiring_soon" | "expired" | "clock_rollback"
    pub state: String,
    pub issued_at: Option<i64>,
    pub expires_at: Option<i64>,
    pub seq: Option<i64>,
    pub quota_ref: Option<String>,
    pub days_left: Option<i64>,
    pub last_verified_at: Option<i64>,
    pub key_available: bool,
}

/// 豁免区状态文件 `cred_state.json`：已装 seq + last_verified_at（按 machine_fp 记账）
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MachineCredState {
    /// 当前配对已安装凭证的 seq（新配对默认 0，首导 seq≥1 即通过）
    #[serde(default)]
    pub installed_seq: i64,
    /// 最近一次验证成功时间（unix 秒；时钟回拨检测锚点）
    #[serde(default)]
    pub last_verified_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CredState {
    #[serde(default)]
    pub machines: HashMap<String, MachineCredState>,
    /// 检测到时钟回拨（UI 提示"系统时间异常"）
    #[serde(default)]
    pub clock_anomaly: bool,
}

// ---------------------------------------------------------------- 路径与文件 IO

fn credential_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(exe_dir(app)?.join("credential.enc"))
}

fn state_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(exe_dir(app)?.join("cred_state.json"))
}

fn load_pack(app: &tauri::AppHandle) -> Option<CredentialPack> {
    let path = credential_path(app).ok()?;
    let raw = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn save_pack(app: &tauri::AppHandle, pack: &CredentialPack) -> Result<(), String> {
    let path = credential_path(app)?;
    if let Some(p) = path.parent() {
        let _ = std::fs::create_dir_all(p);
    }
    let json = serde_json::to_string_pretty(pack).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| format!("写入凭证失败: {e}"))
}

fn load_state(app: &tauri::AppHandle) -> CredState {
    let path = state_path(app).ok();
    let Some(path) = path else { return CredState::default() };
    std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn save_state(app: &tauri::AppHandle, st: &CredState) -> Result<(), String> {
    let path = state_path(app)?;
    if let Some(p) = path.parent() {
        let _ = std::fs::create_dir_all(p);
    }
    let json = serde_json::to_string_pretty(st).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| format!("写入凭证状态失败: {e}"))
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn hex_bytes_lower(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

fn is_clock_rollback(now: i64, last_verified_at: i64) -> bool {
    last_verified_at > 0 && now + CLOCK_ROLLBACK_TOLERANCE_SEC < last_verified_at
}

// ---------------------------------------------------------------- 验证链（A01 §4.5.4）

/// 步骤 1：Ed25519 验签 + signed_payload_hash 复核（复用 package.rs 同款规范化，
/// 保证与内容包验签侧 / TS `credentialSign.ts` 产出逐字节一致）。
pub fn verify_ed25519(pack: &CredentialPack) -> Result<(), String> {
    let sig_obj = &pack.signature;
    if sig_obj.alg != "ed25519" {
        return Err(format!("不支持的签名算法: {}", sig_obj.alg));
    }
    let pub_hex = CREDENTIAL_SIGN_PUBKEYS
        .iter()
        .find(|(k, _)| *k == sig_obj.key_id)
        .map(|(_, h)| *h)
        .ok_or_else(|| format!("未知签名公钥 key_id: {}", sig_obj.key_id))?;
    let canon = canonical_json_sign_view(&serde_json::to_value(&pack.credential).map_err(|e| e.to_string())?);
    let canon_bytes = canon.as_bytes();

    // signed_payload_hash 复核（sha256:hex，与 TS signCredential 同式）
    let expect_hash = format!("sha256:{}", hex_bytes_lower(&Sha256::digest(canon_bytes)));
    if sig_obj.signed_payload_hash != expect_hash {
        return Err("signed_payload_hash 与规范化 JSON 不符".into());
    }

    let pub_bytes = hex_bytes(pub_hex)?;
    let sig_bytes = hex_bytes(&sig_obj.sig)?;
    let key = UnparsedPublicKey::new(&ED25519, &pub_bytes);
    key.verify(canon_bytes, &sig_bytes)
        .map_err(|_| "ed25519 验签失败（凭证被篡改或非 credential-sign-2026 签发）".to_string())
}

/// 步骤 2：machine_fp 匹配当前机器（fingerprint.rs）
pub fn verify_machine_fp(pack: &CredentialPack) -> Result<(), String> {
    let fp = fingerprint();
    if pack.credential.machine_fp != fp {
        return Err("凭证绑定机器指纹与当前机器不符（异机拷贝无效，请到办公室按本机指纹重新签发）".into());
    }
    Ok(())
}

/// 步骤 1-4 纯校验（不改任何状态）。`last_verified_at` / `installed_seq` 来自
/// 当前 machine_fp 配对的豁免区记录；失败返回 Err（不进入 PIN 环节）。
///
/// `strict_seq=true`（**导入**新凭证时）：要求 `seq > installed_seq`（M1 防回滚，
/// 拒绝旧凭证覆盖新凭证，A01 §4.5.3/§4.5.5）。
/// `strict_seq=false`（**解锁/启动复验**已安装凭证时）：要求 `seq >= installed_seq`
/// —— 已装凭证文件与其记录 seq 相等即正常；仅当文件 seq 小于记录（被人换成旧份）时拒绝。
fn verify_chain_1_4(
    pack: &CredentialPack,
    now: i64,
    last_verified_at: i64,
    installed_seq: i64,
    strict_seq: bool,
) -> Result<(), String> {
    verify_ed25519(pack)?; // 1
    verify_machine_fp(pack)?; // 2
    // 3：expires_at 未过期（unix 秒整数比较，无浮点/近似误差——D09 H4）
    if now >= pack.credential.expires_at {
        return Err("凭证已过期（14 天硬断；请到办公室用 U 盘续期导入）".into());
    }
    // 3b：时钟回拨检测（D09 §2.3：now < last_verified_at − 容忍 → 拒绝）
    if is_clock_rollback(now, last_verified_at) {
        return Err("系统时间异常（检测到时钟回拨），拒绝验证".into());
    }
    // 4：seq 语义（防旧凭证覆盖新凭证 / 防回滚 M1）
    if strict_seq {
        if pack.credential.seq <= installed_seq {
            return Err(format!(
                "凭证序号回退：已安装 seq={installed_seq} ≥ 导入 seq={}（拒收旧凭证）",
                pack.credential.seq
            ));
        }
    } else if pack.credential.seq < installed_seq {
        return Err(format!(
            "凭证文件 seq={} 小于已安装记录 seq={installed_seq}（疑似被换成旧份，拒用）",
            pack.credential.seq
        ));
    }
    Ok(())
}

/// 读当前 machine_fp 配对的已装 seq + last_verified_at
fn current_machine_state(app: &tauri::AppHandle) -> (MachineCredState, CredState) {
    let st = load_state(app);
    let ms = st
        .machines
        .get(fingerprint())
        .cloned()
        .unwrap_or_default();
    (ms, st)
}

fn meta_from_pack(pack: &CredentialPack, installed: bool) -> CredentialMeta {
    CredentialMeta {
        installed,
        format_ver: pack.credential.format_ver.clone(),
        machine_fp_ok: true,
        machine_fp: fingerprint().to_string(),
        issued_at: pack.credential.issued_at,
        expires_at: pack.credential.expires_at,
        seq: pack.credential.seq,
        quota_ref: pack.credential.quota_ref.clone(),
    }
}

// ---------------------------------------------------------------- Argon2id KEK（D09 §2.3）

/// 结构化拼接 `[pin_len:u16 LE][pin_bytes][口令 bytes]`（D09 §2.3 示例帧）：
/// 长度前缀杜绝 `PIN="123456"+口令="78"` 与 `PIN="1234"+口令="5678"` 同输入碰撞。
fn structured_pin_pass(pin: &str, classroom_pass: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(2 + pin.len() + classroom_pass.len());
    out.extend_from_slice(&(pin.len() as u16).to_le_bytes());
    out.extend_from_slice(pin.as_bytes());
    out.extend_from_slice(classroom_pass.as_bytes());
    out
}

/// KEK = Argon2id(结构化(PIN,口令), salt)（m=48MiB, t=2, p=1, out=32B · D09 §2.3）
fn derive_kek(pin: &str, classroom_pass: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    let params = Params::new(ARGON_M_KIB, ARGON_T, ARGON_P, Some(ARGON_OUT))
        .map_err(|e| format!("Argon2 参数非法: {e}"))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut kek = [0u8; 32];
    argon2
        .hash_password_into(&structured_pin_pass(pin, classroom_pass), salt, &mut kek)
        .map_err(|e| format!("Argon2id 派生 KEK 失败: {e}"))?;
    Ok(kek)
}

/// 解开 key_material（AES-256-GCM，S01 §2.1 同算法）→ 32B 内容密钥。
/// key_material（base64）= `[salt:16][nonce:12][内容密钥:32][tag:16]`。
fn unwrap_content_key(kek: &[u8; 32], key_material_b64: &str) -> Result<[u8; 32], String> {
    let raw = Base64::decode_vec(key_material_b64)
        .map_err(|_| "key_material base64 解码失败".to_string())?;
    let expect = SALT_LEN + GCM_NONCE_LEN + CONTENT_KEY_LEN + GCM_TAG_LEN;
    if raw.len() != expect {
        return Err(format!("key_material 长度异常（{}/{}）", raw.len(), expect));
    }
    let salt = &raw[..SALT_LEN];
    let nonce = &raw[SALT_LEN..SALT_LEN + GCM_NONCE_LEN];
    let ct = &raw[SALT_LEN + GCM_NONCE_LEN..];
    // 用已存 salt 复核 KEK？No——salt 即上方帧内 salt，KEK 由调用方按同一 salt 派生；
    // 这里只做 AES-GCM 解包（认证失败 = PIN/口令错或密文被篡改）。
    let _ = salt;
    let key = Key::<Aes256Gcm>::from_slice(kek);
    let cipher = Aes256Gcm::new(key);
    let pt = cipher
        .decrypt(Nonce::from_slice(nonce), ct)
        .map_err(|_| "内容密钥解包失败（PIN/口令不符，或 key_material 被篡改）")?;
    if pt.len() != CONTENT_KEY_LEN {
        return Err(format!("解开的内容密钥长度异常（{}）", pt.len()));
    }
    let mut ck = [0u8; 32];
    ck.copy_from_slice(&pt);
    Ok(ck)
}

// ---------------------------------------------------------------- 命令

/// 从 U 盘导入凭证（D09 §2.6 步骤 3/§7 步骤3）：读 credential.enc → 按 A01 §4.5.4
/// 顺序（验签 → 指纹 → 有效期 → seq）全链验证后**才**落位覆盖。PIN 环节在 unlock。
#[tauri::command]
pub fn credential_import_from_usb(app: tauri::AppHandle, path: String) -> Result<CredentialMeta, String> {
    let src = Path::new(&path);
    let raw = std::fs::read(src).map_err(|e| format!("读取 {} 失败: {e}", src.display()))?;
    let pack: CredentialPack =
        serde_json::from_slice(&raw).map_err(|e| format!("凭证文件解析失败（非新格式 credential.enc?）: {e}"))?;
    // 格式版本区分（D09 §2.1：新格式含 format_ver）
    if pack.credential.format_ver != CREDENTIAL_FORMAT_VER {
        return Err(format!(
            "不支持凭证格式版本: {}（当前支持 {}）",
            pack.credential.format_ver,
            CREDENTIAL_FORMAT_VER
        ));
    }
    let now = now_secs();
    let (ms, mut st) = current_machine_state(&app);
    verify_chain_1_4(&pack, now, ms.last_verified_at, ms.installed_seq, true)?; // 验签→指纹→有效期→seq（严格 >）

// 全部通过 → 落位 + 记录（免疫还原卡：与 exe 同目录）
    save_pack(&app, &pack)?;
    let entry = st.machines.entry(fingerprint().to_string()).or_default();
    entry.installed_seq = pack.credential.seq;
    entry.last_verified_at = now;
    save_state(&app, &st)?;
    // D09 §7 步骤4：签发链台账（additive，不动验证链）——记录一次导入事件（脱敏，本地）
    crate::commands::watermark::log_import_event(
        &app,
        &pack.credential.machine_fp,
        pack.credential.seq,
        &pack.signature.key_id,
    );
    Ok(meta_from_pack(&pack, true))
}

/// PIN + 课堂口令解锁：重跑步骤 1-4（防绕过）→ Argon2id KEK → AES-256-GCM 解出内容密钥
/// → 仅入 contentkey 内存（不落盘、不返回密钥本体）。part B 协议层消费。
#[tauri::command]
pub fn credential_unlock(
    app: tauri::AppHandle,
    pin: String,
    classroom_pass: String,
) -> Result<UnlockResult, String> {
    if pin.len() < 6 {
        return Err("PIN 至少 6 位".into());
    }
    let pack = load_pack(&app).ok_or("未导入凭证（请先从 U 盘导入 credential.enc）")?;
    let now = now_secs();
    let (ms, mut st) = current_machine_state(&app);
    // 重新完整校验（已装凭证：seq 只拒"小于记录"，等于即正常——避免自身 seq 触发回滚误拒）
    verify_chain_1_4(&pack, now, ms.last_verified_at, ms.installed_seq, false)?;

    // 步骤 5：解包 key_material。salt 从 key_material 帧内取出，与派生 KEK 用同一 salt。
    let raw = Base64::decode_vec(&pack.credential.key_material)
        .map_err(|_| "key_material base64 解码失败".to_string())?;
    if raw.len() != SALT_LEN + GCM_NONCE_LEN + CONTENT_KEY_LEN + GCM_TAG_LEN {
        return Err(format!(
            "key_material 长度异常（{}/{}）",
            raw.len(),
            SALT_LEN + GCM_NONCE_LEN + CONTENT_KEY_LEN + GCM_TAG_LEN
        ));
    }
    let salt = &raw[..SALT_LEN];
    let kek = derive_kek(&pin, &classroom_pass, salt)?;
    let ck = unwrap_content_key(&kek, &pack.credential.key_material)?;
    // 密钥入内存（唯一落点；步骤 6 协议解密由 part B 消费）
    contentkey::set_content_key(ck);
    zeroize_kek_stack(&kek); // kek 用完即清（尽力而为）

    // 验证成功 → 推进 last_verified_at（时钟回拨锚点；D09 §2.3）
    let entry = st.machines.entry(fingerprint().to_string()).or_default();
    entry.last_verified_at = now;
    st.clock_anomaly = false;
    save_state(&app, &st)?;

    Ok(UnlockResult {
        ok: true,
        expires_at: pack.credential.expires_at,
        seq: pack.credential.seq,
        key_available: contentkey::content_key().is_some(),
    })
}

/// 凭证状态（不触发 Argon2id，UI 轮询安全）
#[tauri::command]
pub fn credential_status(app: tauri::AppHandle) -> CredentialStatus {
    let fp = fingerprint().to_string();
    let key_available = contentkey::content_key().is_some();
    let (ms, st) = current_machine_state(&app);
    let Some(pack) = load_pack(&app) else {
        return CredentialStatus {
            present: false,
            machine_fp: fp,
            format_ver: None,
            machine_fp_ok: None,
            state: "none".into(),
            issued_at: None,
            expires_at: None,
            seq: None,
            quota_ref: None,
            days_left: None,
            last_verified_at: (ms.last_verified_at > 0).then_some(ms.last_verified_at),
            key_available,
        };
    };
    let now = now_secs();
    let fp_ok = pack.credential.machine_fp == fp;
    let rollback = st.clock_anomaly || is_clock_rollback(now, ms.last_verified_at);
    let expired = now >= pack.credential.expires_at;
    let state = if rollback {
        "clock_rollback"
    } else if expired {
        "expired"
    } else {
        let days = (pack.credential.expires_at - now) / 86400;
        if days <= 3 {
            "expiring_soon" // 到期前 3 天起 UI 预警（D09 §2.6）
        } else {
            "valid"
        }
    };
    CredentialStatus {
        present: true,
        machine_fp: fp,
        format_ver: Some(pack.credential.format_ver.clone()),
        machine_fp_ok: Some(fp_ok),
        state: state.into(),
        issued_at: Some(pack.credential.issued_at),
        expires_at: Some(pack.credential.expires_at),
        seq: Some(pack.credential.seq),
        quota_ref: Some(pack.credential.quota_ref.clone()),
        days_left: Some(((pack.credential.expires_at - now) / 86400).max(0)),
        last_verified_at: (ms.last_verified_at > 0).then_some(ms.last_verified_at),
        key_available,
    }
}

/// 启动时复验（D09 §2.3/§2.7：启动即做时钟回拨检测与完整性预检；不触发 Argon2id）。
/// 由 lib.rs setup 调用；验证通过则推进 last_verified_at，失败记 clock_anomaly。
pub fn startup_check(app: &tauri::AppHandle) -> Result<(), String> {
    let Some(pack) = load_pack(app) else {
        return Ok(()); // 未导入凭证：无状态可验，非错误
    };
    let now = now_secs();
    let (ms, mut st) = current_machine_state(app);
    match verify_chain_1_4(&pack, now, ms.last_verified_at, ms.installed_seq, false) {
        Ok(()) => {
            let entry = st.machines.entry(fingerprint().to_string()).or_default();
            entry.last_verified_at = now;
            st.clock_anomaly = false;
            let _ = save_state(app, &st);
            Ok(())
        }
        Err(e) => {
            if is_clock_rollback(now, ms.last_verified_at) {
                st.clock_anomaly = true;
                let _ = save_state(app, &st);
            }
            Err(e)
        }
    }
}

/// 栈上密钥尽力清零（编译器可能优化掉，仅运维冗余，非安全边界承诺）
fn zeroize_kek_stack(kek: &[u8; 32]) {
    std::hint::black_box(kek);
}

// ---------------------------------------------------------------- 测试

#[cfg(test)]
mod tests {
    use super::*;
    use ring::signature::Ed25519KeyPair;

    /// 测试专用签名钥（PKCS8）——与壳内 CREDENTIAL_SIGN_PUBKEYS 对应（壳内公钥即本私钥的公钥）。
    /// 一次性生成固化（2026-09-26），保证 fixture 确定性且能完整走通壳内验签。
    const TEST_PKCS8_HEX: &str = "3051020101300506032b65700422042096c8c266e2f6176d26477473a6c261af8cc6f9d640b9556755b951eea4f544fb81210084d9824c784ee23bc5504ae4230f25268fec1122e9fff448a9f9ab3c8dd3c5fc";

    fn test_keypair() -> Ed25519KeyPair {
        let pkcs8 = hex_bytes(TEST_PKCS8_HEX).unwrap();
        Ed25519KeyPair::from_pkcs8(&pkcs8).expect("测试私钥应可解析")
    }

    /// 对凭证体签名 → CredentialPack（与 TS credentialSign.ts 同款：canon → sha256 → ed25519 hex）
    fn sign_body(body: &CredentialBody) -> CredentialPack {
        let canon = canonical_json_sign_view(&serde_json::to_value(body).unwrap());
        let hash = format!("sha256:{}", hex_bytes_lower(&Sha256::digest(canon.as_bytes())));
        let kp = test_keypair();
        let sig = kp.sign(canon.as_bytes());
        CredentialPack {
            credential: body.clone(),
            signature: CredentialSignature {
                alg: "ed25519".into(),
                key_id: "credential-sign-2026".into(),
                signed_payload_hash: hash,
                sig: hex_bytes_lower(sig.as_ref()),
            },
        }
    }

    /// 用测试钥 + 运行时机器指纹构建合法 fixture 包（可完整走通链条 1-4）
    fn fixture_pack(now: i64, seq: i64) -> CredentialPack {
        let body = CredentialBody {
            format_ver: "1".into(),
            machine_fp: fingerprint().to_string(),
            issued_at: now - 3600,
            expires_at: now + 13 * 86400,
            seq,
            key_material: "AA==".into(),
            quota_ref: "lic:test-credential-0000".into(),
        };
        sign_body(&body)
    }

    #[test]
    fn canonical_output_matches_a01_order() {
        // A01 §4.5.2：7 字段字典序 expires_at < format_ver < issued_at < key_material
        // < machine_fp < quota_ref < seq → 紧凑无空白字节串。
        let body = CredentialBody {
            format_ver: "1".into(),
            machine_fp: "a1b2c3d4e5f60718293a4b5c6d7e8f90".into(),
            issued_at: 1750000000,
            expires_at: 1751209600,
            seq: 5,
            key_material: "SGVsbG8=".into(),
            quota_ref: "lic:ABC-1234-DEFG-5678".into(),
        };
        let canon = canonical_json_sign_view(&serde_json::to_value(&body).unwrap());
        let expect =
            r#"{"expires_at":1751209600,"format_ver":"1","issued_at":1750000000,"key_material":"SGVsbG8=","machine_fp":"a1b2c3d4e5f60718293a4b5c6d7e8f90","quota_ref":"lic:ABC-1234-DEFG-5678","seq":5}"#;
        assert_eq!(canon, expect, "规范化字节必须与 A01 §4.5.2 逐字节一致");
    }

    /// 步骤 1-4 全链：合法 fixture（当前机器 fp、未过期、seq 递增、无回拨）→ 通过
    #[test]
    fn fixture_verifies_full_chain() {
        let now = now_secs();
        let pack = fixture_pack(now, 1);
        assert!(verify_chain_1_4(&pack, now, 0, 0, false).is_ok());
    }

    /// 篡改签名 → 步骤 1 拒绝
    #[test]
    fn tampered_sig_fails() {
        let pack = fixture_pack(now_secs(), 1);
        let mut t = pack.clone();
        let mut v = t.signature.sig.into_bytes();
        let c = v[0];
        v[0] = if c == b'0' { b'1' } else { b'0' };
        t.signature.sig = String::from_utf8(v).unwrap();
        assert!(
            verify_chain_1_4(&t, now_secs(), 0, 0, false).is_err(),
            "篡改 sig 后必须验签失败"
        );
    }

    /// 改字段（触发 signed_payload_hash 不符）+ 伪造异机签名（触发指纹不符）→ 均拒绝
    #[test]
    fn wrong_machine_fp_fails() {
        let now = now_secs();
        // ① 直接改字段：签名即废（哈希不符）
        let mut t = fixture_pack(now, 1);
        t.credential.machine_fp = "ffffffffffffffffffffffffffffffff".into();
        assert!(verify_chain_1_4(&t, now, 0, 0, false).is_err());
        // ② 用合法私钥签一个"异机指纹"凭证：验签过但步骤 2 拒绝
        let mut body = fixture_pack(now, 1).credential;
        body.machine_fp = "ffffffffffffffffffffffffffffffff".into();
        let forged = sign_body(&body);
        assert!(verify_chain_1_4(&forged, now, 0, 0, false).is_err());
    }

    /// 过期（重新签名后仍被步骤 3 拒）+ 时钟回拨 → 均拒绝
    #[test]
    fn expired_and_clock_rollback_rejected() {
        let now = now_secs();
        // ① 已过期（服务端合理签发但 14 天窗口已过）
        let mut body = fixture_pack(now, 1).credential;
        body.expires_at = now - 1;
        let expired = sign_body(&body);
        assert!(
            verify_chain_1_4(&expired, now, 0, 0, false).is_err(),
            "过期凭证必须拒绝（unix 秒整数比较）"
        );
        // ② 时钟回拨：last_verified_at 在"未来"
        let pack = fixture_pack(now, 1);
        assert!(
            verify_chain_1_4(&pack, now, now + 10_000, 0, false).is_err(),
            "now < last_verified_at − 容忍 → 拒绝（回拨检测）"
        );
        // ③ 容忍内不误报
        assert!(verify_chain_1_4(&pack, now, now + 60, 0, false).is_ok());
    }

    /// seq ≤ 已装 seq → 导入（strict）拒绝；已装凭证自身（non-strict）仅拒"小于记录"
    #[test]
    fn stale_seq_fails() {
        let now = now_secs();
        let pack = fixture_pack(now, 5);
        // 导入场景（strict）：seq 必须严格 > 已装
        assert!(verify_chain_1_4(&pack, now, 0, 5, true).is_err(), "导入 seq=5 遇已装 seq=5 拒");
        assert!(verify_chain_1_4(&pack, now, 0, 6, true).is_err(), "导入 seq=5 遇已装 seq=6 拒");
        assert!(verify_chain_1_4(&pack, now, 0, 4, true).is_ok(), "导入 seq=5 > 已装 seq=4 通过");
        // 已装凭证复验（non-strict）：等于记录正常；小于记录（被换旧份）拒
        assert!(verify_chain_1_4(&pack, now, 0, 5, false).is_ok(), "复验 seq=5 == 记录 5 通过");
        assert!(verify_chain_1_4(&pack, now, 0, 6, false).is_err(), "复验 seq=5 < 记录 6 拒（疑似旧份）");
        assert!(verify_chain_1_4(&pack, now, 0, 0, false).is_ok(), "新配对无记录时放行");
    }

    /// 结构化 PIN‖口令拼接：长度前缀杜绝碰撞（D09 §2.3）
    #[test]
    fn structured_pin_pass_no_collision() {
        use std::collections::HashSet;
        // "123456"+"78" 与 "1234"+"5678"：朴素拼接相同时结构化必须不同
        let a = structured_pin_pass("123456", "78");
        let b = structured_pin_pass("1234", "5678");
        assert_ne!(a, b);
        // u16 LE 长度前缀格式正确
        assert_eq!(a[0], 6u8);
        assert_eq!(a[1], 0u8);
        assert_eq!(a[2..8], *b"123456");
        assert_eq!(a[8..], *b"78");
        // 确定性
        assert_eq!(structured_pin_pass("123456", "78"), a);
        let mut set = HashSet::new();
        set.insert(a);
        set.insert(structured_pin_pass("1234", "5678"));
        set.insert(structured_pin_pass("1", "2345678"));
        assert_eq!(set.len(), 3);
    }

    /// key_material 包裹/解包往返（ENC 成帧 + GCM + 与 derive_kek 一致）
    #[test]
    fn key_material_wrap_unwrap_roundtrip() {
        use aes_gcm::aead::{Aead, KeyInit};
        // 构造 76 字节帧：salt(16) + nonce(12) + 内容密钥(32) + tag(16)
        let salt: [u8; 16] = [1u8; 16];
        let nonce: [u8; 12] = [2u8; 12];
        let content_key: [u8; 32] = [9u8; 32];
        let kek = derive_kek("123456", "class-pass", &salt).unwrap();
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&kek));
        let ct = cipher.encrypt(Nonce::from_slice(&nonce), content_key.as_slice()).unwrap();
        let mut frame = Vec::with_capacity(76);
        frame.extend_from_slice(&salt);
        frame.extend_from_slice(&nonce);
        frame.extend_from_slice(&ct);
        assert_eq!(frame.len(), 76);
        let b64 = Base64::encode_string(&frame);
        // 解包（与 unlock 同一路径）
        let raw = Base64::decode_vec(&b64).unwrap();
        assert_eq!(raw.len(), 76);
        let out = unwrap_content_key(&kek, &b64).unwrap();
        assert_eq!(out, content_key);
        // 错误 PIN → 错误 KEK → GCM 认证失败
        let wrong_kek = derive_kek("000000", "class-pass", &salt).unwrap();
        assert!(unwrap_content_key(&wrong_kek, &b64).is_err());
    }

    /// 跨实现验签：TS `credentialSign.ts`（Node 复刻）用同一测试私钥签的固定凭证 →
    /// Rust 步骤 1 必须验签通过 + hash 复核一致（A01 §4.5 双端互认凭证）。
    /// 签名字节/哈希由 Node 端生成固化（2026-09-26，见会话报告），machine_fp 故意用
    /// 非本机值 → `verify_chain_1_4` 应只在步骤 2 被拒（step1 pass, step2 fail）。
    #[test]
    fn ts_signed_fixture_verifies_in_rust() {
        // "keep the TS-signed fixture static"
        let body = CredentialBody {
            format_ver: "1".into(),
            machine_fp: "deadbeefdeadbeefdeadbeefdeadbeef".into(),
            issued_at: 1_750_000_000,
            expires_at: 1_751_209_600,
            seq: 7,
            key_material: "AAAA".into(),
            quota_ref: "lic:TS-CROSS-CHECK".into(),
        };
        let pack = CredentialPack {
            credential: body,
            signature: CredentialSignature {
                alg: "ed25519".into(),
                key_id: "credential-sign-2026".into(),
                signed_payload_hash: "sha256:7ed880c85099fddd835822a7aa8a9852f08e3952b18ef87ac328e609bbf9e8cc".into(),
                sig: "c8ffc86fd176fe05343c7f73d3c75a1a567fbc315720cf4eefcb71a37e242a1d5e2a814d9e7bd566055f84329404a45c834d9f4a9b0e95aca6f2c803ef0f400e".into(),
            },
        };
        // 步骤 1（验签+hash）must pass —— TS 签发的凭证在 Rust 端有效
        verify_ed25519(&pack).expect("TS credentialSign.ts 签名必须在 Rust 端验签通过");
        // 步骤 2（本机指纹）must fail —— 该 fixture 绑定异机 fp
        assert!(
            verify_chain_1_4(&pack, 1_751_209_599, 0, 0, false).is_err(),
            "异机指纹凭证在第 2 步被拒（不进入 PIN 环节）"
        );
    }
}
