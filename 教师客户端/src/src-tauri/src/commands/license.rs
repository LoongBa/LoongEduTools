//! 课堂口令命令层 · D01 §3.2 / A01 §3 / S01 §3
//! 本地口令包 license.json（服务端 ed25519 签名；P1 先存结构 + 到期日校验）

use crate::commands::auth::load_credential;
use crate::commands::fingerprint::fingerprint;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseScope {
    pub machine_quota: i32,
    pub bound_machines: Vec<String>,
    pub license_level: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseBody {
    pub schema_version: String,
    pub license_type: String,
    pub teacher_id: String,
    pub semester: String,
    pub issued_at: String,
    pub expires_at: String,
    pub scope: LicenseScope,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignatureBlock {
    pub alg: String,
    pub key_id: String,
    pub signed_payload_hash: String,
    pub sig: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicensePack {
    pub license: LicenseBody,
    pub signature: SignatureBlock,
}

#[derive(Debug, Clone, Serialize)]
pub struct LicenseStatus {
    pub present: bool,
    pub semester: Option<String>,
    pub expires_at: Option<String>,
    pub license_level: Option<i32>,
    /// "valid" | "expiring_soon" | "expired" | "none"
    pub state: String,
    pub days_left: Option<i64>,
    pub machine_quota: Option<i32>,
    pub bound_machines: Option<Vec<String>>,
    pub machine_fp: String,
}

use crate::commands::recents::exe_dir;
use std::path::PathBuf;

fn license_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(exe_dir(app)?.join("license.json"))
}

fn load_pack(app: &tauri::AppHandle) -> Option<LicensePack> {
    let path = license_path(app).ok()?;
    let raw = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn save_pack(app: &tauri::AppHandle, pack: &LicensePack) -> Result<(), String> {
    let path = license_path(app)?;
    if let Some(p) = path.parent() {
        let _ = std::fs::create_dir_all(p);
    }
    let json = serde_json::to_string_pretty(pack).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| format!("写入口令包失败: {e}"))
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// 解析 ISO8601 到 unix 秒（支持 ...Z 与带偏移的粗解析：取 date 前段近似）
fn parse_iso_secs(s: &str) -> Option<i64> {
    // 简化：只支持 YYYY-MM-DDTHH:MM:SSZ
    let s = s.trim_end_matches('Z');
    let (date, time) = s.split_once('T').unwrap_or((s, "00:00:00"));
    let mut dp = date.split('-');
    let y: i64 = dp.next()?.parse().ok()?;
    let m: i64 = dp.next()?.parse().ok()?;
    let d: i64 = dp.next()?.parse().ok()?;
    let mut tp = time.split(':');
    let hh: i64 = tp.next().unwrap_or("0").parse().unwrap_or(0);
    let mm: i64 = tp.next().unwrap_or("0").parse().unwrap_or(0);
    let ss: i64 = tp.next().unwrap_or("0").parse().unwrap_or(0);
    // 顺序近似（忽略闰年精细差，口令到期判断容差足够）
    let days = y * 365 + m * 30 + d;
    Some(days * 86400 + hh * 3600 + mm * 60 + ss - 946684800 /* 2000-01-01 锚点粗调 */)
}

/// 口令状态（本地，不联网）
#[tauri::command]
pub fn license_status(app: tauri::AppHandle) -> LicenseStatus {
    let machine_fp = fingerprint().to_string();
    match load_pack(&app) {
        None => LicenseStatus {
            present: false,
            semester: None,
            expires_at: None,
            license_level: None,
            state: "none".into(),
            days_left: None,
            machine_quota: None,
            bound_machines: None,
            machine_fp,
        },
        Some(pack) => {
            let expires = pack.license.expires_at.clone();
            let exp_secs = parse_iso_secs(&expires).unwrap_or(0);
            let now = now_secs();
            // 粗解析不可靠时退回字符串比较日期
            let expired = exp_secs > 0 && exp_secs < now;
            let days = if exp_secs > 0 {
                Some(((exp_secs - now) / 86400).max(0))
            } else {
                None
            };
            let state = if expired {
                "expired"
            } else if days.map(|d| d <= 15).unwrap_or(false) {
                "expiring_soon"
            } else {
                "valid"
            };
            LicenseStatus {
                present: true,
                semester: Some(pack.license.semester.clone()),
                expires_at: Some(expires),
                license_level: Some(pack.license.scope.license_level),
                state: state.into(),
                days_left: days,
                machine_quota: Some(pack.license.scope.machine_quota),
                bound_machines: Some(pack.license.scope.bound_machines.clone()),
                machine_fp,
            }
        }
    }
}

async fn post_authorized(
    app: &tauri::AppHandle,
    path: &str,
    body: serde_json::Value,
) -> Result<serde_json::Value, String> {
    // 复用 auth 的 post 逻辑：内联最小实现避免 pub 过多
    let base = {
        let p = crate::commands::recents::config_path(app).unwrap_or_default();
        std::fs::read_to_string(p)
            .ok()
            .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
            .and_then(|v| v.get("api_base").and_then(|x| x.as_str()).map(String::from))
            .unwrap_or_default()
    };
    if base.is_empty() {
        return Err("未配置服务端地址（P0 离线模式）".into());
    }
    let cred = load_credential(app).ok_or("未登录")?;
    let url = format!("{}/api/edu/{}", base.trim_end_matches('/'), path);
    let c = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = c
        .post(&url)
        .bearer_auth(&cred.jwt)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("网络错误: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if status.is_success() {
        serde_json::from_str(&text).map_err(|e| e.to_string())
    } else if let Ok(api) = serde_json::from_str::<serde_json::Value>(&text) {
        let msg = api
            .pointer("/error/message")
            .and_then(|m| m.as_str())
            .unwrap_or("请求失败");
        let code = api
            .pointer("/error/code")
            .and_then(|m| m.as_str())
            .unwrap_or("ERROR");
        Err(format!("[{code}] {msg}"))
    } else {
        Err(format!("HTTP {status}: {text}"))
    }
}

/// 申请/续期口令（在线）
#[tauri::command]
pub async fn license_renew(
    app: tauri::AppHandle,
    semester: Option<String>,
) -> Result<LicenseStatus, String> {
    let body = serde_json::json!({
        "semester": semester,
        "machine_fp": fingerprint(),
    });
    let v = post_authorized(&app, "license/renew", body).await?;
    let pack: LicensePack = serde_json::from_value(
        v.get("license_pack")
            .cloned()
            .ok_or("响应缺 license_pack")?,
    )
    .map_err(|e| format!("口令包解析失败: {e}"))?;
    save_pack(&app, &pack)?;
    // 首次绑定当前机器
    let _ = post_authorized(
        &app,
        "license/bind",
        serde_json::json!({
            "semester": pack.license.semester,
            "machine_fp": fingerprint(),
        }),
    )
    .await;
    Ok(license_status(app))
}

/// 追加绑定当前机器
#[tauri::command]
pub async fn license_bind_current(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let sem = license_status(app.clone()).semester.unwrap_or_default();
    let body = serde_json::json!({
        "semester": sem,
        "machine_fp": fingerprint(),
    });
    let v = post_authorized(&app, "license/bind", body).await?;
    if let Some(pack) = v.get("license_pack") {
        if let Ok(p) = serde_json::from_value::<LicensePack>(pack.clone()) {
            let _ = save_pack(&app, &p);
        }
    }
    Ok(v)
}


