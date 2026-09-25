//! 认证命令层 · D01 §3 / A01 §2 / D05 §2.1
//! 凭证缓存：AES-256-GCM 加密文件 credential.enc（exe 同级，U 盘跟随）
//! 离线兜底：7 天窗口；api_base 空 = P0 模式（不联网，不阻断本地内容包）

use crate::commands::fingerprint::fingerprint;
use crate::commands::recents::exe_dir;
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// 与 A01 对齐的教师摘要
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Teacher {
    pub id: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub grade: Option<String>,
    #[serde(default)]
    pub subject: Option<String>,
    pub license_level: i32,
}

/// 本地加密凭证（7 天缓存 · D01 §3.1）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credential {
    pub jwt: String,
    #[serde(default)]
    pub refresh_token: Option<String>,
    /// JWT 过期 unix 秒
    pub expires_at: i64,
    /// 上次联网成功时间 unix 秒（离线宽限锚点）
    pub last_online_at: i64,
    pub teacher: Teacher,
}

#[derive(Debug, Clone, Serialize)]
pub struct AuthStatus {
    pub logged_in: bool,
    /// 从未登录 / 已过期需重登 / 有效
    pub state: String, // "anonymous" | "expired" | "ok"
    /// 离线宽限内仍可用（< 7 天）
    pub offline_grace: bool,
    pub teacher: Option<Teacher>,
    pub expires_at: Option<i64>,
    pub last_online_at: Option<i64>,
    /// api_base 为空 → P0 离线模式（不发起网络）
    pub api_configured: bool,
    pub device_id: String,
}

#[derive(Debug, Deserialize)]
struct LoginResp {
    jwt: String,
    #[serde(default)]
    expires_in: Option<i64>,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    teacher: Option<TeacherJson>,
}

#[derive(Debug, Deserialize)]
struct TeacherJson {
    id: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    grade: Option<String>,
    #[serde(default)]
    subject: Option<String>,
    license_level: i32,
}

impl From<TeacherJson> for Teacher {
    fn from(t: TeacherJson) -> Self {
        Teacher {
            id: t.id,
            name: t.name,
            grade: t.grade,
            subject: t.subject,
            license_level: t.license_level,
        }
    }
}

#[derive(Debug, Deserialize)]
struct ApiError {
    error: ApiErrorBody,
}
#[derive(Debug, Deserialize)]
struct ApiErrorBody {
    code: String,
    message: String,
}

// ------------------------------------------------------------------ 配置

/// 读 config.json 的 api_base（空 = P0 模式）
/// pub：供 store.rs（下载扩展）复用，避免重复实现读取逻辑
pub fn api_base(app: &tauri::AppHandle) -> String {
    let path = crate::commands::recents::config_path(app).unwrap_or_default();
    std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|v| v.get("api_base").and_then(|x| x.as_str()).map(String::from))
        .unwrap_or_default()
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败: {e}"))
}

/// pub：供 report.rs（P3 上报）复用，避免复制 license.rs 的内联 post 反模式
pub async fn post_json(
    app: &tauri::AppHandle,
    path: &str,
    body: serde_json::Value,
    jwt: Option<&str>,
) -> Result<serde_json::Value, String> {
    let base = api_base(app);
    if base.is_empty() {
        return Err("未配置服务端地址（config.json api_base），当前为 P0 离线模式".into());
    }
    let url = format!("{}/api/edu/{}", base.trim_end_matches('/'), path.trim_start_matches('/'));
    let c = client()?;
    let mut req = c.post(&url).json(&body);
    if let Some(t) = jwt {
        req = req.bearer_auth(t);
    }
    let resp = req.send().await.map_err(|e| format!("网络错误: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| format!("读取响应失败: {e}"))?;
    if status.is_success() {
        serde_json::from_str(&text).map_err(|e| format!("响应解析失败: {e}"))
    } else {
        if let Ok(api) = serde_json::from_str::<ApiError>(&text) {
            Err(format!("[{}] {}", api.error.code, api.error.message))
        } else {
            Err(format!("HTTP {status}: {text}"))
        }
    }
}

// ------------------------------------------------------------------ 凭证缓存（AES-256-GCM）

fn cred_key() -> [u8; 32] {
    // 简单保护：设备指纹 + 固定盐 → SHA256（D01 §8：挡顺手操作，不防专业逆向）
    let mut h = Sha256::new();
    h.update(fingerprint().as_bytes());
    h.update(b"|edu-teacher-credential-v1");
    h.finalize().into()
}

fn cred_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(exe_dir(app)?.join("credential.enc"))
}

pub fn load_credential(app: &tauri::AppHandle) -> Option<Credential> {
    let path = cred_path(app).ok()?;
    let raw = std::fs::read(path).ok()?;
    if raw.len() < 12 {
        return None;
    }
    let (nonce, ct) = raw.split_at(12);
    let key_bytes = cred_key();
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    let pt = cipher
        .decrypt(Nonce::from_slice(nonce), ct)
        .map_err(|_| "解密失败")
        .ok()?;
    serde_json::from_slice(&pt).ok()
}

pub fn save_credential(app: &tauri::AppHandle, cred: &Credential) -> Result<(), String> {
    let path = cred_path(app)?;
    let pt = serde_json::to_vec(cred).map_err(|e| format!("序列化失败: {e}"))?;
    let key_bytes = cred_key();
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce_raw = {
        let mut n = [0u8; 12];
        use rand::RngCore;
        rand::thread_rng().fill_bytes(&mut n);
        n
    };
    let ct = cipher
        .encrypt(Nonce::from_slice(&nonce_raw), pt.as_slice())
        .map_err(|e| format!("加密失败: {e}"))?;
    let mut out = Vec::with_capacity(12 + ct.len());
    out.extend_from_slice(&nonce_raw);
    out.extend_from_slice(&ct);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(&path, out).map_err(|e| format!("写入凭证失败: {e}"))
}

pub fn clear_credential(app: &tauri::AppHandle) -> Result<(), String> {
    let path = cred_path(app)?;
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| format!("删除凭证失败: {e}"))?;
    }
    Ok(())
}

const OFFLINE_GRACE_SECS: i64 = 7 * 24 * 3600;

/// 启动/查询凭证状态（不联网）
#[tauri::command]
pub fn auth_status(app: tauri::AppHandle) -> AuthStatus {
    let device_id = fingerprint().to_string();
    let api_configured = !api_base(&app).is_empty();
    match load_credential(&app) {
        None => AuthStatus {
            logged_in: false,
            state: "anonymous".into(),
            offline_grace: false,
            teacher: None,
            expires_at: None,
            last_online_at: None,
            api_configured,
            device_id,
        },
        Some(c) => {
            let now = chrono_free_now();
            let jwt_alive = c.expires_at > now;
            let grace = now.saturating_sub(c.last_online_at) < OFFLINE_GRACE_SECS;
            let (state, ok) = if jwt_alive || grace {
                ("ok", true)
            } else {
                ("expired", false)
            };
            AuthStatus {
                logged_in: ok,
                state: state.into(),
                offline_grace: grace && !jwt_alive,
                teacher: Some(c.teacher.clone()),
                expires_at: Some(c.expires_at),
                last_online_at: Some(c.last_online_at),
                api_configured,
                device_id,
            }
        }
    }
}

/// 无 chrono 的当前 unix 秒
fn chrono_free_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

// ------------------------------------------------------------------ 登录三方式

async fn persist_login(
    app: &tauri::AppHandle,
    resp: LoginResp,
) -> Result<AuthStatus, String> {
    let now = chrono_free_now();
    let exp = resp.expires_in.unwrap_or(604800);
    let teacher = resp
        .teacher
        .map(Teacher::from)
        .unwrap_or(Teacher {
            id: "unknown".into(),
            name: None,
            grade: None,
            subject: None,
            license_level: 1,
        });
    let cred = Credential {
        jwt: resp.jwt,
        refresh_token: resp.refresh_token,
        expires_at: now + exp,
        last_online_at: now,
        teacher,
    };
    save_credential(&app, &cred)?;
    Ok(auth_status(app.clone()))
}

/// 短信发送验证码
#[tauri::command]
pub async fn auth_sms_send(app: tauri::AppHandle, phone: String) -> Result<serde_json::Value, String> {
    post_json(&app, "auth/sms/send", serde_json::json!({ "phone": phone, "scene": "login" }), None).await
}

/// 短信验证码登录
#[tauri::command]
pub async fn auth_sms_verify(
    app: tauri::AppHandle,
    phone: String,
    code: String,
) -> Result<AuthStatus, String> {
    let body = serde_json::json!({
        "phone": phone,
        "code": code,
        "device_id": fingerprint(),
    });
    let v = post_json(&app, "auth/sms/verify", body, None).await?;
    let parsed: LoginResp = serde_json::from_value(v).map_err(|e| format!("响应结构异常: {e}"))?;
    persist_login(&app, parsed).await
}

/// 密码登录
#[tauri::command]
pub async fn auth_login_password(
    app: tauri::AppHandle,
    phone: String,
    password: String,
) -> Result<AuthStatus, String> {
    let body = serde_json::json!({
        "phone": phone,
        "password": password,
        "device_id": fingerprint(),
    });
    let v = post_json(&app, "auth/password", body, None).await?;
    let parsed: LoginResp = serde_json::from_value(v).map_err(|e| format!("响应结构异常: {e}"))?;
    persist_login(&app, parsed).await
}

/// 退出登录（清本地凭证）
#[tauri::command]
pub fn auth_logout(app: tauri::AppHandle) -> Result<(), String> {
    clear_credential(&app)
}

/// 在线刷新凭证（静默失败不阻断 · D01 §3.1）
#[tauri::command]
pub async fn auth_refresh(app: tauri::AppHandle) -> Result<AuthStatus, String> {
    let cred = load_credential(&app).ok_or("未登录")?;
    let Some(rt) = cred.refresh_token.clone() else {
        return Err("无刷新令牌".into());
    };
    match post_json(&app, "auth/refresh", serde_json::json!({ "refresh_token": rt }), None).await
    {
        Ok(v) => {
            let parsed: LoginResp =
                serde_json::from_value(v).map_err(|e| format!("响应结构异常: {e}"))?;
            persist_login(&app, parsed).await
        }
        Err(e) => {
            // 保持旧凭证；仅当仍在离线宽限内则仍可用
            eprintln!("[auth_refresh] {e}");
            Err(e)
        }
    }
}

/// 补任教信息（首登）
#[tauri::command]
pub async fn auth_profile(
    app: tauri::AppHandle,
    grade: String,
    subject: String,
    agree_terms: bool,
) -> Result<serde_json::Value, String> {
    let cred = load_credential(&app).ok_or("未登录")?;
    let body = serde_json::json!({ "grade": grade, "subject": subject, "agree_terms": agree_terms });
    let v = post_json(&app, "auth/profile", body, Some(&cred.jwt)).await?;
    // 本地同步 level
    if let Some(t) = v.get("teacher") {
        if let Ok(mut c) = serde_json::from_value::<Credential>(serde_json::to_value(&cred).unwrap_or_default()) {
            if let Some(lvl) = t.get("license_level").and_then(|x| x.as_i64()) {
                c.teacher.license_level = lvl as i32;
                let _ = save_credential(&app, &c);
            }
        }
    }
    Ok(v)
}

/// 激活码绑定
#[tauri::command]
pub async fn auth_activate(
    app: tauri::AppHandle,
    license_key: String,
) -> Result<serde_json::Value, String> {
    let cred = load_credential(&app).ok_or("未登录")?;
    let body = serde_json::json!({
        "license_key": license_key.trim(),
        "device_id": fingerprint(),
    });
    let v = post_json(&app, "auth/activate", body, Some(&cred.jwt)).await?;
    if let Some(lvl) = v.get("license_level").and_then(|x| x.as_i64()) {
        let mut c = cred.clone();
        c.teacher.license_level = lvl as i32;
        let _ = save_credential(&app, &c);
    }
    Ok(v)
}
