// 壳配置拉取（v0.3 决策点4 · 服务端签名配置 + 本地加密缓存）
//
// 信任链：
//   api_base（明文引导，config.example.json）→ GET {api_base}/shell/config.signed.json
//     → ed25519 验签（key_id=shell-config-2026，公钥本文件硬编码）
//     → 通过 → 采信 + AES-256-GCM 加密落盘 config.enc（离线可解密重验）
//     → 失败 → 拒绝 + 回退离线缓存（若有）
//
// 安全语义：防篡改靠 ed25519 签名（改一个字节→验签失败）；加密层防本地静态窥探 +
// 完整性（GCM tag）。签名私钥仅管理员持有（scripts/gen_shell_config.py），
// 公钥轮换 = 追加新条目（与 package.rs SIGN_PUBKEYS 同模式）。
use crate::commands::package::{canonical_json_sign_view, verify_signed_envelope};
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;

/// 壳配置签名公钥表（key_id → ed25519 公钥 hex · S01 §2.2 信封同构）
/// 生成方式：python scripts/gen_shell_config.py --config xxx.json（打印公钥 hex 后写回此处）
/// shell-config-2026 = 开发/测试钥（scripts/keys/shell-config.key，gitignored · 对齐
/// package.rs SIGN_PUBKEYS 先例：开发期预置 dev 公钥保证功能可用，生产部署时
/// 用 `gen_shell_config.py --key keys/prod.key` 生成生产钥并**追加**新条目轮换。
pub const SHELL_CONFIG_PUBKEYS: &[(&str, &str)] = &[(
    "shell-config-2026",
    "431390d54ec99142f16d21b2c8ec709e7c7b13f3890fda487e71ca76cba647d7",
)];

/// 配置缓存文件名（exe 同目录；内容 = AES-GCM 加密的签名包）
const CONFIG_ENC_NAME: &str = "config.enc";

/// 唤醒路径：{api_base}/shell/config.signed.json（静态托管即可，无需服务端端点·契约先行）
const CONFIG_ENDPOINT: &str = "/shell/config.signed.json";

// ---- 加密缓存（AES-256-GCM）：密钥 = HKDF-SHA256 固定派生，防本地静态窥探 ----

const CACHE_PASSPHRASE: &[u8] = b"loongedu-shell-config-cache-v1";
const CACHE_IV_LEN: usize = 12;

fn cache_key() -> [u8; 32] {
    // HKDF 简化：SHA256(passphrase) 单次派生（密钥仅本地缓存用，非跨机传输）
    let mut h = Sha256::new();
    h.update(CACHE_PASSPHRASE);
    h.finalize().into()
}

fn config_enc_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(crate::commands::recents::exe_dir(app)?.join(CONFIG_ENC_NAME))
}

// ---- 拉取与验签 ----

/// 拉取并验签壳配置：GET {api_base}/shell/config.signed.json → 验签 → 加密缓存。
/// 返回签名包（含 config + signature）。
#[tauri::command]
pub async fn shell_config_fetch(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let base = crate::commands::auth::api_base(&app);
    if base.is_empty() {
        return Err("未配置服务端地址（config.json api_base），无法拉取壳配置".into());
    }
    let url = format!("{}{}", base.trim_end_matches('/'), CONFIG_ENDPOINT);
    let c = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败: {e}"))?;
    let resp = c
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("网络错误: {e}"))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("服务端返回 {status}（{url}）"));
    }
    let text = resp
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {e}"))?;
    let v: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("配置包 JSON 解析失败: {e}"))?;
    verify_signed_envelope(&v, SHELL_CONFIG_PUBKEYS)?;
    let _ = canonical_json_sign_view(&v); // 触发完整解析校验（签名路径已含）

    // 加密落盘（离线可解密重验）
    let enc = encrypt_cache(&v)?;
    let path = config_enc_path(&app)?;
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&path, &enc).map_err(|e| format!("缓存写入失败: {e}"))?;
    Ok(v)
}

/// 读取离线缓存配置：解密 → 验签。缓存无/解密失败/验签失败 → 需重新 shell_config_fetch。
#[tauri::command]
pub fn shell_config_cached(app: tauri::AppHandle) -> Result<Option<serde_json::Value>, String> {
    let path = config_enc_path(&app)?;
    let raw = match fs::read(&path) {
        Ok(r) => r,
        Err(_) => return Ok(None), // 无缓存 = 未拉取过
    };
    let v = decrypt_cache(&raw)?;
    verify_signed_envelope(&v, SHELL_CONFIG_PUBKEYS)
        .map_err(|e| format!("离线缓存验签失败（可能被篡改）: {e}"))?;
    Ok(Some(v))
}

// ---- AES-GCM 加密/解密 ----

fn encrypt_cache(v: &serde_json::Value) -> Result<Vec<u8>, String> {
    let json = serde_json::to_vec(v).map_err(|e| format!("配置序列化失败: {e}"))?;
    let cipher = Aes256Gcm::new_from_slice(&cache_key()).map_err(|e| e.to_string())?;
    let mut iv = [0u8; CACHE_IV_LEN];
    // 随机 nonce（每次写入不同密文，防重放比对）
    use rand::RngCore;
    let mut rng = rand::thread_rng();
    rng.fill_bytes(&mut iv);
    let ct = cipher
        .encrypt(Nonce::from_slice(&iv), json.as_ref())
        .map_err(|e| format!("配置加密失败: {e}"))?;
    let mut out = Vec::with_capacity(iv.len() + ct.len());
    out.extend_from_slice(&iv);
    out.extend_from_slice(&ct);
    Ok(out)
}

fn decrypt_cache(raw: &[u8]) -> Result<serde_json::Value, String> {
    if raw.len() < CACHE_IV_LEN + 16 {
        return Err("缓存文件过短（非本格式或已损坏）".into());
    }
    let (iv, ct) = raw.split_at(CACHE_IV_LEN);
    let cipher = Aes256Gcm::new_from_slice(&cache_key()).map_err(|e| e.to_string())?;
    let plain = cipher
        .decrypt(Nonce::from_slice(iv), ct)
        .map_err(|_| "缓存解密失败（密钥不匹配或数据损坏）".to_string())?;
    serde_json::from_slice(&plain).map_err(|e| format!("缓存 JSON 解析失败: {e}"))
}

/// 轮换检查：当前配置的 key_id 是否在公钥表内（供前端展示/提示换钥）
#[tauri::command]
pub fn shell_config_key_status(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cached = shell_config_cached(app)?;
    let key_id = cached
        .as_ref()
        .and_then(|v| v.get("signature"))
        .and_then(|s| s.get("key_id"))
        .and_then(|k| k.as_str())
        .unwrap_or_default();
    Ok(serde_json::json!({
        "current_key_id": key_id,
        "accepted_key_ids": SHELL_CONFIG_PUBKEYS.iter().map(|(k, _)| *k).collect::<Vec<_>>(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use ring::signature::{Ed25519KeyPair, KeyPair as _};
    use serde_json::json;

    fn test_key() -> (String, Ed25519KeyPair) {
        // 生成一次性测试密钥对（与部署无关）：返回 (pub_hex, keypair)
        let doc = ring::signature::Ed25519KeyPair::generate_pkcs8(&ring::rand::SystemRandom::new())
            .expect("生成测试密钥失败");
        let keypair = Ed25519KeyPair::from_pkcs8(doc.as_ref()).expect("解析测试密钥失败");
        let pub_hex = keypair.public_key().as_ref().iter().map(|b| format!("{:02x}", b)).collect();
        (pub_hex, keypair)
    }

    fn sign_with(keypair: &Ed25519KeyPair, cfg: &mut serde_json::Value, key_id: &str) {
        let canon = crate::commands::package::canonical_json_sign_view(cfg);
        let sig = keypair.sign(canon.as_bytes());
        cfg["signature"] = json!({
            "alg": "ed25519",
            "key_id": key_id,
            "nonce": "testnonce123456",
            "signed_payload_hash": format!("sha256:{}", hex_of(&Sha256::digest(canon.as_bytes()))),
            "sig": sig.as_ref().iter().map(|b| format!("{:02x}", b)).collect::<String>(),
        });
    }

    fn hex_of(d: &[u8]) -> String {
        d.iter().map(|b| format!("{:02x}", b)).collect()
    }

    #[test]
    fn encrypted_cache_roundtrip() {
        let v = json!({"api_base": "https://edu.example.com", "extra": {"a": 1}});
        let enc = encrypt_cache(&v).unwrap();
        // 密文 ≠ 明文（确实加密了）
        assert_ne!(&enc, serde_json::to_vec(&v).unwrap().as_slice());
        let dec = decrypt_cache(&enc).unwrap();
        assert_eq!(dec, v, "加密→解密应还原");
    }

    #[test]
    fn tampered_cache_fails_decrypt() {
        let v = json!({"api_base": "https://edu.example.com"});
        let mut enc = encrypt_cache(&v).unwrap();
        // 篡改密文末尾一个字节 → GCM tag 校验失败
        let last = enc.last_mut().unwrap();
        *last ^= 0x01;
        assert!(decrypt_cache(&enc).is_err(), "篡改后的缓存必须解密失败");
    }

    #[test]
    fn valid_signature_passes() {
        let (pub_hex, keypair) = test_key();
        let pubkeys: &[(&str, &str)] = &[("test-key-2026", pub_hex.as_str())];
        let mut cfg = json!({"api_base": "https://edu.example.com", "schema_version": "1.0"});
        sign_with(&keypair, &mut cfg, "test-key-2026");
        verify_signed_envelope(&cfg, pubkeys).expect("合法签名应通过");
    }

    #[test]
    fn tampered_payload_fails() {
        let (pub_hex, keypair) = test_key();
        let pubkeys: &[(&str, &str)] = &[("test-key-2026", pub_hex.as_str())];
        let mut cfg = json!({"api_base": "https://edu.example.com"});
        sign_with(&keypair, &mut cfg, "test-key-2026");
        // 篡改配置内容（签名不变）
        cfg["api_base"] = json!("https://evil.example.com");
        assert!(verify_signed_envelope(&cfg, pubkeys).is_err(), "篡改后必须验签失败");
    }

    #[test]
    fn unknown_key_id_fails() {
        let (_, keypair) = test_key();
        let mut cfg = json!({"api_base": "https://edu.example.com"});
        sign_with(&keypair, &mut cfg, "other-key");
        let pubkeys: &[(&str, &str)] = &[("test-key-2026", "00")]; // 表中无 other-key
        assert!(verify_signed_envelope(&cfg, pubkeys).is_err(), "未知 key_id 必须拒绝");
    }

    /// 互操作验证：gen_shell_config.py 生成的签名包必须能被壳端验签通过。
    /// fixture = 由 `python scripts/gen_shell_config.py --config <cfg> --out ...` 生成
    /// （dev 测试密钥 keys/shell-config.key，与 SHELL_CONFIG_PUBKEYS 预置公钥一致）。
    /// 若重新生成 fixture（轮换钥），需同步替换常量与 fixture 签名。
    #[test]
    fn python_generated_package_verifies() {
        const FIXTURE: &str = r#"{
          "api_base": "https://edu-api.test.example",
          "schema_version": "1.0",
          "signature": {
            "alg": "ed25519",
            "key_id": "shell-config-2026",
            "nonce": "985ad4c4c2abbf08",
            "signed_payload_hash": "sha256:1200f57bb7e2da8f096d0e7af98f0e106110108de763d931622341bcaef5c120",
            "sig": "6bad10e98b51b7171dee97f43f166aa21f13ad54ecd01d5e331e8a1b1543f717a8ee0a4dacfe0dd1123c1d32129880b032b8ed90f9f114850ebcd9a8d66f0d0b"
          }
        }"#;
        let v: serde_json::Value = serde_json::from_str(FIXTURE).unwrap();
        // 直接用运行时常量（生产同表），确保测试覆盖真实验签路径
        verify_signed_envelope(&v, SHELL_CONFIG_PUBKEYS)
            .expect("gen_shell_config.py 签名包应被壳端接受");
    }
}