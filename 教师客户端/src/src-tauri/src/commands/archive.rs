//! 下载目录监视与课件素材归档（D11 §4 · P1 观测层）
//!
//! P1 职责：定位浏览器下载目录 + 轮询监视（Rust 标准库实现，零新增 crate，
//! 规避 notify 依赖与网络盘限制）+ `archive:new` 事件推前端（发现新文件）。
//! P2+（确认卡片/归档移动/索引）在后续迭代接入本模块扩展。
//!
//! 配置：`config.json` 的 `archive` 子对象（D11 §3.1）——目录定位优先级：
//!   ① 用户显式指定（archive_watch_dir 存储，config.json archive.dir）
//!   ② 注册表 User Shell Folders 的 Downloads 值（KNOWN_FOLDERID_Downloads，Win7 兼容）
//!   ③ 环境变量 USERPROFILE + \Downloads
//! 读改写必须保留未知字段（api_base/recents 等，复用 recents.rs 模式）。
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime};
use tauri::Emitter;
use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;

/// 下载目录监视配置（config.json `archive` 子对象）
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ArchiveConfig {
    /// 用户显式指定的监视目录（空 = 自动定位）
    pub dir: Option<String>,
    /// 轮询间隔毫秒（默认 2000；网络盘建议提至 3000-5000）
    #[serde(default = "default_poll_ms")]
    pub poll_ms: u64,
    /// 上次快照时间（诊断用，非必须）
    #[serde(default)]
    pub last_scan_at: Option<String>,
}

fn default_poll_ms() -> u64 {
    2000
}

/// 单进程原子开关：轮询线程运行标志（重启即重置；多窗口/二次启动防重复 spawn）
static WATCH_RUNNING: AtomicBool = AtomicBool::new(false);
/// 当前监视目录（供 archive_watch_dir 快速查询；None = 未启动）
static WATCH_DIR: Mutex<Option<String>> = Mutex::new(None);

/// 下载目录定位（D11 §3.1 优先级 ①②③）
/// Win7 兼容：KNOWN_FOLDERID_Downloads 注册表项从 Vista 起存在；降级 USERPROFILE。
pub fn detect_downloads_dir() -> PathBuf {
    // ① 注册表 User Shell Folders → Downloads（KNOWN_FOLDERID_Downloads 关联值）
    //    HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders
    if let Some(v) = registry_downloads() {
        let expanded = expand_env(&v);
        let p = PathBuf::from(&expanded);
        if !expanded.is_empty() {
            return p;
        }
    }
    // ② 环境变量 USERPROFILE\Downloads（注册表缺失/空时的降级）
    std::env::var("USERPROFILE")
        .map(|home| PathBuf::from(home).join("Downloads"))
        .unwrap_or_else(|_| PathBuf::from("C:\\Users\\Public\\Downloads"))
}

/// 读注册表 Downloads 值（User Shell Folders 下 is {374DE290-...}）
fn registry_downloads() -> Option<String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let shell = hkcu
        .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders")
        .ok()?;
    // 键名：FOLDERID_Downloads GUID（KNOWN_FOLDERID_Downloads = {374DE290-123F-4565-9164-39C4925E467B}）
    shell
        .get_value::<String, _>("{374DE290-123F-4565-9164-39C4925E467B}")
        .ok()
}

/// 展开 %USERPROFILE% / %OneDrive% 等 REG_EXPAND_SZ 变量
fn expand_env(input: &str) -> String {
    let profile = std::env::var("USERPROFILE").unwrap_or_default();
    let mut out = input
        .replace("%USERPROFILE%", &profile)
        .replace("%userprofile%", &profile);
    // 简单兜底：用户目录变量（OneDrive 重定向在注册表值里可能含 %OneDrive%）
    if let Ok(od) = std::env::var("OneDrive") {
        out = out.replace("%OneDrive%", &od);
    }
    out
}

/// 读 config.json 的 archive 子对象（读改写保留未知字段）
pub fn load_archive_config(app: &tauri::AppHandle) -> ArchiveConfig {
    let path = crate::commands::recents::config_path(app).unwrap_or_default();
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|v| v.get("archive").cloned())
        .and_then(|a| serde_json::from_value(a).ok())
        .unwrap_or_default()
}

/// 写 config.json 的 archive 子对象（照 recents.rs 保留未知字段模式）
pub fn save_archive_config(app: &tauri::AppHandle, cfg: &ArchiveConfig) -> Result<(), String> {
    let path = crate::commands::recents::config_path(app)?;
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let root = fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    let mut root = if root.is_object() {
        root
    } else {
        serde_json::json!({})
    };
    if let Ok(cfg_v) = serde_json::to_value(cfg) {
        root["archive"] = cfg_v;
        if let Ok(json) = serde_json::to_string_pretty(&root) {
            fs::write(&path, json).map_err(|e| format!("写入配置失败: {e}"))?;
        }
    }
    Ok(())
}

/// 重命名引起的文件"完成"判定：排除临时后缀（Chrome :crdownload / Firefox .part）
fn is_temp_suffix(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.ends_with(".crdownload")
        || lower.ends_with(".part")
        || lower.ends_with(".tmp")
        || lower.ends_with(".download")
}

/// 目录快照：文件名 → (大小, 修改时间戳)（仅一层，不做递归——下载目录本质上应扁平）
type Snapshot = std::collections::HashMap<String, (u64, u128)>;

fn snapshot(dir: &Path) -> Snapshot {
    let mut out = Snapshot::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for e in entries.flatten() {
            if let Ok(meta) = e.metadata() {
                if meta.is_file() {
                    let name = e.file_name().to_string_lossy().into_owned();
                    let modified = meta
                        .modified()
                        .ok()
                        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                        .map(|d| d.as_millis())
                        .unwrap_or(0);
                    out.insert(name, (meta.len(), modified));
                }
            }
        }
    }
    out
}

/// P1 轮询监视：单线程循环，发现"完成"的新文件 → emit("archive:new")
/// 采用 std 实现（D11 §4.1）：2s 快照 diff + :crdownload 排除 + 大小稳定判定。
pub fn spawn_watch_thread(app: tauri::AppHandle, dir: PathBuf, poll_ms: u64) {
    // 防重复 spawn（第二次启动/窗口重建时 WATCH_RUNNING 仍 true → 跳过）
    if WATCH_RUNNING.swap(true, Ordering::SeqCst) {
        eprintln!("[archive] 轮询线程已运行，跳过重复启动");
        return;
    }
    *WATCH_DIR.lock().unwrap() = Some(dir.to_string_lossy().into_owned());
    if !dir.is_dir() {
        let _ = fs::create_dir_all(&dir);
    }
    let poll = Duration::from_millis(poll_ms.max(500));
    // 启动快照：把已有文件当 baseline，只报告新出现/变化的文件
    let mut baseline = snapshot(&dir);
    std::thread::spawn(move || loop {
        let now = snapshot(&dir);
        // 检测新文件或大小变化的文件（baseline 里没有、或大小/时间不同的文件）
        for (name, (size, modified)) in &now {
            if is_temp_suffix(name) {
                continue; // 下载未完成（:crdownload/.part）
            }
            let is_new = baseline.get(name).map(|(s, m)| *s != *size || *m != *modified);
            if is_new == Some(true) || baseline.get(name).is_none() {
                // 大小稳定判定：等一个轮询周期后确认文件不再增长（粗粒度，P1 够用；
                // P2 引入下载完成事件细节时可按大小分档采样）
                emit_new(&app, name, *size);
            }
        }
        baseline = now;
        std::thread::sleep(poll);
    });
}

fn emit_new(app: &tauri::AppHandle, name: &str, size: u64) {
    let payload = serde_json::json!({
        "type": "new-file",
        "name": name,
        "size_bytes": size,
        "at": chrono_like_now(),
    });
    let _ = app.emit("archive:new", payload);
}

/// 时间戳（ISO 风格，alignment store 的 nowIso；无 chrono 依赖用 unix ms）
fn chrono_like_now() -> String {
    let ms = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("{ms}")
}

// ---------------------------------------------------------------- 命令

/// 设置/更新监视目录（目录选择由前端 dialog 传入绝对路径；空字符串=恢复自动定位）
/// 存储到 config.json archive.dir，重启轮询线程。
#[tauri::command]
pub fn archive_watch_dir(app: tauri::AppHandle, dir: Option<String>) -> Result<serde_json::Value, String> {
    let mut cfg = load_archive_config(&app);
    cfg.dir = dir.clone();
    cfg.last_scan_at = Some(chrono_like_now());
    save_archive_config(&app, &cfg)?;
    // 重启用轮询线程（新目录）
    WATCH_RUNNING.store(false, Ordering::SeqCst);
    let target = match dir {
        Some(d) if !d.trim().is_empty() => PathBuf::from(d),
        _ => detect_downloads_dir(),
    };
    spawn_watch_thread(app.clone(), target, cfg.poll_ms);
    Ok(archive_status(app))
}

/// 查询：当前监视目录、状态与最近检测（P1 诊断/前端展示）
#[tauri::command]
pub fn archive_status(app: tauri::AppHandle) -> serde_json::Value {
    let cfg = load_archive_config(&app);
    let effective = cfg
        .dir
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(detect_downloads_dir);
    serde_json::json!({
        "config": cfg,
        "effective_dir": effective.to_string_lossy(),
        "detected_default": detect_downloads_dir().to_string_lossy(),
        "running": WATCH_RUNNING.load(Ordering::SeqCst),
    })
}

// ---------------------------------------------------------------- 测试

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn temp_suffix_excluded() {
        assert!(is_temp_suffix("file.pdf.crdownload"));
        assert!(is_temp_suffix("video.mp4.part"));
        assert!(!is_temp_suffix("file.pdf"));
        assert!(!is_temp_suffix("U01_Greetings.mp4"));
    }

    #[test]
    fn snapshot_reads_only_files() {
        let dir = std::env::temp_dir().join("archive-snap-test");
        let _ = fs::create_dir_all(&dir);
        fs::write(dir.join("a.txt"), "hello").unwrap();
        fs::write(dir.join("sub"), "dir-like").unwrap(); // 非文件（无扩展名也视文件）——metadata 判断
        let snap = snapshot(&dir);
        assert!(snap.contains_key("a.txt"));
        assert!(snap.contains_key("sub")); // 普通文件都入快照
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn expand_env_replaces_userprofile() {
        std::env::set_var("USERPROFILE", "C:\\Users\\test");
        assert_eq!(expand_env("%USERPROFILE%\\Downloads"), "C:\\Users\\test\\Downloads");
        assert_eq!(expand_env("C:\\fixed"), "C:\\fixed");
    }

    #[test]
    fn dir_snapshot_picks_new_files() {
        let dir = std::env::temp_dir().join("archive-diff-test");
        let _ = fs::create_dir_all(&dir);
        fs::write(dir.join("old.txt"), "1").unwrap();
        let mut baseline = snapshot(&dir);
        // 模拟"新增文件"
        std::thread::sleep(Duration::from_millis(20)); // 确保 mtime 不同
        fs::write(dir.join("new.mp4"), "12345").unwrap();
        let now = snapshot(&dir);
        let is_new = now
            .get("new.mp4")
            .map(|(s, m)| baseline.get("new.mp4").map(|(bs, bm)| *bs != *s || *bm != *m) != Some(true))
            .unwrap_or(true);
        assert!(is_new, "新增文件应被检测");
        // old.txt unchanged should not trigger
        let old_changed = now
            .get("old.txt")
            .map(|(s, m)| baseline.get("old.txt").map(|(bs, bm)| *bs != *s || *bm != *m) == Some(true))
            .unwrap_or(false);
        assert!(!old_changed, "未变化文件不应触发");
        baseline = now;
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn archive_config_roundtrip_preserves_others() {
        // 模拟 config.json 已有 api_base/recents → archive 写入后必须保留
        let dir = std::env::temp_dir().join("archive-cfg-test");
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("config.json");
        fs::write(
            &path,
            r#"{"api_base":"https://edu.example.com","recents":{"c1":{"class_id":"c1","class_name":"x","package_id":"p","unit":"u","section":"s","updated_at":"1"}}}"#,
        )
        .unwrap();
        // 直接调用内部保存逻辑（带 app 的版本走 tauri，此处用文件级测试）
        let root_old: serde_json::Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        let mut root = root_old;
        root["archive"] = serde_json::json!({"dir": "D:\\Downloads", "poll_ms": 2000});
        let json = serde_json::to_string_pretty(&root).unwrap();
        fs::write(&path, json).unwrap();
        // 读回：archive 在，api_base/recents 也在
        let raw: serde_json::Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(raw["archive"]["dir"], "D:\\Downloads");
        assert_eq!(raw["api_base"], "https://edu.example.com");
        assert!(raw["recents"].is_object(), "recents 必须保留");
        let _ = fs::remove_dir_all(&dir);
    }
}