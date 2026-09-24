//! P3 白名单上报（A01 §5.1 / D01 §5.3 · 零儿童数据红线）
//!
//! - `report_progress`：壳内 `content:progress` 事件 → 本地 usage 聚合（离线队列，不联网）
//! - `report_flush`：组 A01 白名单体批量 POST report/ingest（Bearer JWT）
//!
//! 红线：只上报 client_version / installed_packages / license / usage / crash_log
//! 白名单字段；禁学生名单、学习行为、练习成绩（服务端还会再过滤一层）。
//! 失败静默不阻断课堂：401/未登录丢弃或保留队列，网络失败留待下次冲刷。

use crate::commands::auth::{load_credential, post_json};
use crate::commands::license::license_status;
use crate::commands::package::SHELL_VERSION;
use crate::commands::recents::exe_dir;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// 单条用量聚合（按 package_id + 自然日）
#[derive(Debug, Clone, Serialize, Deserialize)]
struct UsageEntry {
    package_id: String,
    runs: u32,
    seconds: u64,
    day: String, // YYYY-MM-DD（UTC，≤10 字符对齐服务端白名单）
}

/// 离线队列（exe 同目录 report-queue.json，绿色目录形态跟随 U 盘）
#[derive(Debug, Default, Serialize, Deserialize)]
struct ReportQueue {
    /// 用量聚合，上限 200 条（超限丢最旧，对齐服务端 usage.slice(0, 200)）
    #[serde(default)]
    usage: Vec<UsageEntry>,
    /// 每包最近 progress 时间戳（估算 seconds 增量用）
    #[serde(default)]
    last_ts: HashMap<String, u64>,
}

/// progress 事件载荷（package.rs emit_content_progress 的 json 结构）
#[derive(Debug, Deserialize)]
pub(crate) struct ProgressPayload {
    package_id: String,
    #[serde(default)]
    ts: Option<u64>,
}

const QUEUE_MAX_ENTRIES: usize = 200;
/// 单次 progress 间隔计入 seconds 的上限（防异常时间戳灌水）
const MAX_SECONDS_DELTA: u64 = 1800;

fn queue_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(exe_dir(app)?.join("report-queue.json"))
}

fn load_queue(app: &tauri::AppHandle) -> ReportQueue {
    queue_path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn save_queue(app: &tauri::AppHandle, q: &ReportQueue) -> Result<(), String> {
    let path = queue_path(app)?;
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let json = serde_json::to_string_pretty(q).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("写入上报队列失败: {e}"))
}

/// epoch 秒 → YYYY-MM-DD（UTC；Howard Hinnant civil 算法，无 chrono 依赖）
fn day_from_ts(ts: u64) -> String {
    let days = (ts / 86400) as i64;
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    format!("{y:04}-{m:02}-{d:02}")
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// 纯聚合逻辑（不落盘、不联网）：记录一次 progress 到队列
/// - seconds：距上次同包 progress 的间隔，封顶 MAX_SECONDS_DELTA 防灌水
/// - runs：同包同日 +1；新条目入队并裁剪到 QUEUE_MAX_ENTRIES（丢最旧）
fn apply_progress(q: &mut ReportQueue, package_id: &str, ts: u64) {
    let day = day_from_ts(ts);
    if let Some(prev) = q.last_ts.get(package_id) {
        let delta = ts.saturating_sub(*prev);
        if delta <= MAX_SECONDS_DELTA {
            if let Some(e) = q
                .usage
                .iter_mut()
                .find(|e| e.package_id == package_id && e.day == day)
            {
                e.seconds += delta;
            }
        }
    }
    q.last_ts.insert(package_id.to_string(), ts);

    match q.usage.iter_mut().find(|e| e.package_id == package_id && e.day == day) {
        Some(e) => e.runs += 1,
        None => {
            q.usage.push(UsageEntry {
                package_id: package_id.to_string(),
                runs: 1,
                seconds: 0,
                day,
            });
            while q.usage.len() > QUEUE_MAX_ENTRIES {
                q.usage.remove(0);
            }
        }
    }
}

/// 记录一次内容包使用（本地聚合，同步快返，不联网）
#[tauri::command]
pub fn report_progress(
    app: tauri::AppHandle,
    payload: ProgressPayload,
) -> Result<(), String> {
    if payload.package_id.is_empty() {
        return Err("payload.package_id 为空".into());
    }
    let ts = payload.ts.unwrap_or_else(now_secs);
    let mut q = load_queue(&app);
    apply_progress(&mut q, &payload.package_id, ts);
    save_queue(&app, &q)
}

/// 冲刷离线队列 → POST /api/edu/report/ingest（App 启动 + progress 事件后调用）
/// 永远返回 Ok（静默失败不阻断课堂）；仅输入非法才 Err。
#[tauri::command]
pub async fn report_flush(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let q = load_queue(&app);
    if q.usage.is_empty() {
        return Ok(());
    }
    // 未登录：静默跳过，保留队列待登录后冲刷
    let Some(cred) = load_credential(&app) else {
        return Ok(());
    };

    let installed: Vec<serde_json::Value> = state
        .packages
        .lock()
        .unwrap()
        .iter()
        .map(|p| {
            serde_json::json!({
                "package_id": p.package_id,
                "version": p.package_version,
            })
        })
        .collect();
    // 口令状态 → A01 白名单 license 字段 { semester, status, expires_at }
    let ls = license_status(app.clone());
    let lic = serde_json::json!({
        "semester": ls.semester.clone().unwrap_or_default(),
        "status": ls.state,
        "expires_at": ls.expires_at.clone().unwrap_or_default(),
    });

    let body = serde_json::json!({
        "client_version": SHELL_VERSION,
        "installed_packages": installed,
        "license": lic,
        "usage": q.usage,
        "crash_log": null,
    });

    match post_json(&app, "report/ingest", body, Some(&cred.jwt)).await {
        Ok(_) => {
            // 送达：清 usage 保留 last_ts（下次继续估秒）
            let mut q = q;
            q.usage.clear();
            save_queue(&app, &q)?;
            Ok(())
        }
        Err(e) => {
            // 401：凭证失效，丢弃队列（避免无限堆积）；其余留待下次
            if e.contains("401") {
                let mut q = q;
                q.usage.clear();
                let _ = save_queue(&app, &q);
            }
            eprintln!("[report] 上报失败（静默，不阻断）: {e}");
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn day_from_ts_epoch_and_known_dates() {
        assert_eq!(day_from_ts(0), "1970-01-01");
        assert_eq!(day_from_ts(86400), "1970-01-02");
        // 经典时间戳校验
        assert_eq!(day_from_ts(1234567890), "2009-02-13");
        assert_eq!(day_from_ts(1500000000), "2017-07-14");
    }

    #[test]
    fn day_from_ts_leap_day() {
        // 2020-02-29（闰日）与次日 2020-03-01
        assert_eq!(day_from_ts(1582934400), "2020-02-29");
        assert_eq!(day_from_ts(1583020800), "2020-03-01");
    }

    #[test]
    fn first_progress_creates_entry() {
        let mut q = ReportQueue::default();
        apply_progress(&mut q, "u01", 1_000_000);
        assert_eq!(q.usage.len(), 1);
        assert_eq!(q.usage[0].runs, 1);
        assert_eq!(q.usage[0].seconds, 0);
        assert_eq!(q.usage[0].day, day_from_ts(1_000_000));
        assert_eq!(q.last_ts.get("u01"), Some(&1_000_000));
    }

    #[test]
    fn same_day_accumulates_runs_and_seconds() {
        let mut q = ReportQueue::default();
        apply_progress(&mut q, "u01", 1_000_000);
        apply_progress(&mut q, "u01", 1_000_120);
        apply_progress(&mut q, "u01", 1_000_420);
        assert_eq!(q.usage.len(), 1);
        assert_eq!(q.usage[0].runs, 3);
        assert_eq!(q.usage[0].seconds, 120 + 300);
    }

    #[test]
    fn seconds_delta_capped_at_max() {
        let mut q = ReportQueue::default();
        apply_progress(&mut q, "u01", 1_000_000);
        // 间隔 10000 > 1800：seconds 不加，runs 仍 +1
        apply_progress(&mut q, "u01", 1_010_000);
        assert_eq!(q.usage[0].runs, 2);
        assert_eq!(q.usage[0].seconds, 0);
        // 间隔恰等于 1800：计入
        apply_progress(&mut q, "u01", 1_011_800);
        assert_eq!(q.usage[0].runs, 3);
        assert_eq!(q.usage[0].seconds, MAX_SECONDS_DELTA);
    }

    #[test]
    fn different_day_makes_new_entry() {
        let mut q = ReportQueue::default();
        apply_progress(&mut q, "u01", 1_000_000);
        apply_progress(&mut q, "u01", 1_000_000 + 86400);
        assert_eq!(q.usage.len(), 2);
        assert_ne!(q.usage[0].day, q.usage[1].day);
        // 跨日无同日条目，seconds 不累加到旧条目
        assert_eq!(q.usage[1].seconds, 0);
    }

    #[test]
    fn queue_capped_at_200_dropping_oldest() {
        let mut q = ReportQueue::default();
        for i in 0..(QUEUE_MAX_ENTRIES + 5) {
            apply_progress(&mut q, &format!("pkg{i}"), 1_000_000);
        }
        assert_eq!(q.usage.len(), QUEUE_MAX_ENTRIES);
        // 最旧的 5 条已丢弃，保留的是后 200 条
        assert_eq!(q.usage[0].package_id, "pkg5");
        assert_eq!(q.usage[QUEUE_MAX_ENTRIES - 1].package_id, "pkg204");
    }
}
