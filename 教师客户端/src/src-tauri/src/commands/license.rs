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

/// 解析 ISO8601 → unix 秒（**精确**，D09 §7 步骤3 H4：取整秒比较，无近似误差）。
/// 支持 `YYYY-MM-DD` / `YYYY-MM-DDTHH:MM:SS`，可选 `Z` 或 `±HH:MM`/`±HHMM` 偏移。
/// 复用 report.rs day_from_ts（Howard Hinnant civil）的逆向算法 `days_from_civil`。
fn parse_iso_secs(s: &str) -> Option<i64> {
    let s = s.trim();
    let (body, offset_secs) = strip_offset(s);
    let (date, time) = body.split_once('T').unwrap_or((body, "00:00:00"));
    let mut dp = date.split('-');
    let y: i64 = dp.next()?.parse().ok()?;
    let m: i64 = dp.next()?.parse().ok()?;
    let d: i64 = dp.next()?.parse().ok()?;
    let max_d: i64 = match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
            if leap { 29 } else { 28 }
        }
        _ => return None, // 月份 1-12 之外
    };
    if d < 1 || d > max_d {
        return None;
    }
    let mut tp = time.split(':');
    let hh: i64 = tp.next().unwrap_or("0").parse().unwrap_or(0);
    let mm: i64 = tp.next().unwrap_or("0").parse().unwrap_or(0);
    let ss: i64 = tp.next().unwrap_or("0").parse().unwrap_or(0);
    if !(0..=23).contains(&hh) || !(0..=59).contains(&mm) || !(0..=60).contains(&ss) {
        return None;
    }
    Some(days_from_civil(y, m, d) * 86400 + hh * 3600 + mm * 60 + ss - offset_secs)
}

/// 剥离时区后缀：`Z` → 0；`+08:00` / `+0800` → 正偏移；负数同理。无后缀 → 0（契约用 UTC）。
fn strip_offset(s: &str) -> (&str, i64) {
    if let Some(b) = s.strip_suffix('Z') {
        return (b, 0);
    }
    if let Some(pos) = s.rfind(|c: char| c == '+' || c == '-') {
        let tail = &s[pos + 1..];
        let off = match tail.len() {
            5 => {
                let parts = tail
                    .split_once(':')
                    .and_then(|(h, m)| Some((h.parse::<i64>().ok()?, m.parse::<i64>().ok()?)));
                match parts {
                    Some((h, m)) => h * 3600 + m * 60,
                    None => return (s, 0),
                }
            }
            4 => match (tail[..2].parse::<i64>().ok(), tail[2..].parse::<i64>().ok()) {
                (Some(h), Some(m)) => h * 3600 + m * 60,
                _ => return (s, 0),
            },
            _ => return (s, 0),
        };
        let sign = if s.as_bytes()[pos] == b'-' { -1 } else { 1 };
        return (&s[..pos], sign * off);
    }
    (s, 0)
}

/// Howard Hinnant civil 逆向：YYYY-MM-DD → 1970-01-01 起的天数（与 report.rs day_from_ts 互逆）
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400; // [0, 399]
    let mp = if m > 2 { m - 3 } else { m + 9 }; // [0, 11]
    let doy = (153 * mp + 2) / 5 + d - 1; // [0, 365]
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy; // [0, 146096]
    era * 146097 + doe - 719468
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

#[cfg(test)]
mod tests {
    use super::*;

    /// H4：精确解析要与日换秒全等（无近似误差；与 report.rs day_from_ts 互逆）
    #[test]
    fn parse_iso_secs_exact_epoch() {
        assert_eq!(parse_iso_secs("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(parse_iso_secs("1970-01-01T00:00:00"), Some(0));
        assert_eq!(parse_iso_secs("2000-01-01T00:00:00Z"), Some(946_684_800));
        // 日期仅（无时间，默认 00:00:00）
        assert_eq!(parse_iso_secs("1970-01-02"), Some(86400));
        // 闰年精确：2020-02-29 存在；2020-03-01 = 2020-02-29 + 86400
        let feb29 = parse_iso_secs("2020-02-29T00:00:00Z").unwrap();
        let mar01 = parse_iso_secs("2020-03-01T00:00:00Z").unwrap();
        assert_eq!(mar01 - feb29, 86400);
        // 非闰年 2 月只能到 28：2019-03-01 − 2019-02-28 = 86400
        let f28 = parse_iso_secs("2019-02-28T00:00:00Z").unwrap();
        let m01 = parse_iso_secs("2019-03-01T00:00:00Z").unwrap();
        assert_eq!(m01 - f28, 86400);
        // 与 report.rs day_from_ts 双向互逆：date 字符串 ↔ 精确天数
        let ts = parse_iso_secs("2026-09-26T00:00:00Z").unwrap();
        assert_eq!(ts % 86400, 0);
        // 偏移处理：+08:00 减 8h；-05:00 加 5h
        assert_eq!(
            parse_iso_secs("2000-01-01T08:00:00+08:00"),
            Some(946_684_800)
        );
        assert_eq!(
            parse_iso_secs("1999-12-31T19:00:00-05:00"),
            Some(946_684_800)
        );
        assert_eq!(parse_iso_secs("2000-01-01T01:00:00+0800"), Some(946_659_600));
        // 非法输入 → None
        assert_eq!(parse_iso_secs("2026-13-01"), None);
        assert_eq!(parse_iso_secs("2026-00-10"), None);
        assert_eq!(parse_iso_secs("2026-02-30"), None);
        assert_eq!(parse_iso_secs("garbage"), None);
    }
}


