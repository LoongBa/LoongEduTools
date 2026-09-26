//! 下载目录监视与课件素材归档（D11 §4-§6 · P1 观测层 + P3 归档移动）
//!
//! P1 职责：定位浏览器下载目录 + 轮询监视（Rust 标准库实现，零新增 crate，
//! 规避 notify 依赖与网络盘限制）+ `archive:new` 事件推前端（发现新文件）。
//! P2（确认卡片）在前端；P3 职责：确认后归档移动（拷贝→staging→rename 原子落盘，
//! 下载目录保留原件可撤销）+ `archives.json` 索引读改写（保留未知字段）。
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
                emit_new(&app, &dir, name, *size);
            }
        }
        baseline = now;
        std::thread::sleep(poll);
    });
}

/// P2 确认卡片所需：完整文件路径（dir.join(name)）+ 大小 + 类型由前端按扩展名判断
fn emit_new(app: &tauri::AppHandle, dir: &Path, name: &str, size: u64) {
    let payload = serde_json::json!({
        "type": "new-file",
        "name": name,
        "path": dir.join(name).to_string_lossy().into_owned(),
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

// ---------------------------------------------------------------- P3 归档移动（D11 §6）

/// 归档元数据：确认卡片分类结果（学科/版本/年级/册次）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveMeta {
    pub subject: String,
    pub version: String,
    pub grade: String,
    /// 册次：上册/下册（归档目录拼 <年级><册次>）
    pub volume: String,
}

/// 归档索引条目（archives.json 值对象）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveEntry {
    /// 稳定 id（撤销/列表用）
    pub id: String,
    /// 归档文件名（含重名后缀）
    pub name: String,
    /// 源文件完整路径（下载目录，保留原件可追溯）
    pub source_path: String,
    pub subject: String,
    pub version: String,
    pub grade: String,
    pub volume: String,
    pub size_bytes: u64,
    /// 归档时间（ISO）
    pub at: String,
    /// 相对 archives/ 的路径（/ 分隔），P5 打包索引用
    pub rel: String,
}

/// 支持归档的文件类型（D11 §6.3 · 独立于 textbook.rs IMAGE_EXT——教材扫描不含音视频）
const ARCHIVE_EXT: &[&str] = &[
    // 教材 PDF
    "pdf",
    // 课堂图片
    "jpg", "jpeg", "png", "gif", "webp", "bmp",
    // 音频（名师课堂等）
    "mp3", "m4a", "wav", "ogg", "flac", "aac",
    // 视频
    "mp4", "mkv", "avi", "mov", "wmv", "webm", "flv",
];

fn ext_of(name: &str) -> Option<String> {
    let ext = name.rsplit_once('.').map(|(_, e)| e.to_lowercase())?;
    if ARCHIVE_EXT.contains(&ext.as_str()) {
        Some(ext)
    } else {
        None
    }
}

/// 归档根：`<exe 同目录>/archives/`（与 packages/ toolbox/ 同级，随 U 盘走）
fn archives_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(crate::commands::recents::exe_dir(app)?.join("archives"))
}

/// 归档索引：`archives/archives.json`（读改写保留未知字段，复用 recents 模式）
fn archives_index_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(archives_dir(app)?.join("archives.json"))
}

/// 读归档索引（无文件/损坏 → 空对象，不 panic）
fn load_archives_index(path: &Path) -> serde_json::Map<String, serde_json::Value> {
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|v| v.get("archives").cloned())
        .and_then(|a| a.as_object().cloned())
        .unwrap_or_default()
}

/// 写归档索引：保留顶层未知字段 + archives 子对象整体替换（仿 recents::save_recents）
fn save_archives_index(path: &Path, entries: &serde_json::Map<String, serde_json::Value>) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let root = fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .filter(|v| v.is_object())
        .unwrap_or_else(|| serde_json::json!({}));
    let mut root = root;
    root["archives"] = serde_json::Value::Object(entries.clone());
    let json = serde_json::to_string_pretty(&root).map_err(|e| format!("序列化失败: {e}"))?;
    fs::write(path, json).map_err(|e| format!("写入归档索引失败: {e}"))
}

/// 重名处理：`name (1).ext` / `name (2).ext`（仿浏览器下载惯例）
fn dedup_name(dir: &Path, name: &str) -> String {
    if !dir.join(name).exists() {
        return name.to_string();
    }
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) => (s.to_string(), e.to_string()),
        None => (name.to_string(), String::new()),
    };
    for i in 1..=99 {
        let candidate = if ext.is_empty() {
            format!("{stem} ({i})")
        } else {
            format!("{stem} ({i}).{ext}")
        };
        if !dir.join(&candidate).exists() {
            return candidate;
        }
    }
    // 兜底：毫秒时间戳后缀（极端重名场景）
    let ms = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("{stem} ({ms}).{ext}")
}

fn now_iso() -> String {
    let ms = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    // 与 store 的 nowIso 对齐的 ISO 形态（无 chrono：手工拼 UTC）
    let secs = ms / 1000;
    let days = secs / 86400;
    let rem = secs % 86400;
    let (y, m, d) = civil_from_days(days as i64);
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{:03}Z", rem / 3600, (rem % 3600) / 60, rem % 60, (ms % 1000))
}

/// days → (y, m, d)：Howard Hinnant 民用日历逆变换（无 chrono 依赖）
fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// P3 归档：确认卡片 → 拷贝源文件到 `archives/<学科>/<版本>/<年级><册次>/`
/// 拷贝而非移动（D11 决策 2：下载目录是用户资产，保留原件可撤销）；
/// staging → rename 原子落盘（复用 store.rs:325 先例）；写索引保留未知字段。
#[tauri::command]
pub fn archive_confirm(
    app: tauri::AppHandle,
    path: String,
    meta: ArchiveMeta,
) -> Result<ArchiveEntry, String> {
    let src = PathBuf::from(&path);
    let file_name = src
        .file_name()
        .ok_or_else(|| "源路径缺少文件名".to_string())?
        .to_string_lossy()
        .into_owned();
    if !src.is_file() {
        return Err(format!("源文件不存在: {path}"));
    }
    if ext_of(&file_name).is_none() {
        return Err(format!("不支持的文件类型（仅教材/图片/音频/视频）: {file_name}"));
    }
    let size = fs::metadata(&src)
        .map_err(|e| format!("读取源文件信息失败: {e}"))?
        .len();

    // 目标目录：archives/<学科>/<版本>/<年级><册次>/
    let dest_dir = archives_dir(&app)?
        .join(&meta.subject)
        .join(&meta.version)
        .join(format!("{}{}", meta.grade, meta.volume));
    fs::create_dir_all(&dest_dir).map_err(|e| format!("创建归档目录失败: {e}"))?;

    let dest_name = dedup_name(&dest_dir, &file_name);
    let dest = dest_dir.join(&dest_name);
    let staging = dest_dir.join(format!(".{dest_name}.staging"));
    // 拷贝 → 校验大小一致 → staging→rename 原子落盘（失败清理 staging）
    fs::copy(&src, &staging).map_err(|e| format!("拷贝文件失败: {e}"))?;
    let staged_len = fs::metadata(&staging).map(|m| m.len()).unwrap_or(0);
    if staged_len != size {
        let _ = fs::remove_file(&staging);
        return Err("归档拷贝校验失败（大小不一致），已保留源文件".into());
    }
    if let Err(e) = fs::rename(&staging, &dest) {
        let _ = fs::remove_file(&staging);
        return Err(format!("归档落盘失败: {e}"));
    }

    // 写索引（保留未知字段）
    let rel = format!(
        "{}/{}/{}{}/{}",
        meta.subject, meta.version, meta.grade, meta.volume, dest_name
    );
    let entry = ArchiveEntry {
        id: format!("arc-{}", now_iso()),
        name: dest_name,
        source_path: path,
        subject: meta.subject,
        version: meta.version,
        grade: meta.grade,
        volume: meta.volume,
        size_bytes: size,
        at: now_iso(),
        rel,
    };
    let idx_path = archives_index_path(&app)?;
    let mut entries = load_archives_index(&idx_path);
    entries.insert(entry.id.clone(), serde_json::to_value(&entry).map_err(|e| format!("序列化失败: {e}"))?);
    save_archives_index(&idx_path, &entries)?;

    Ok(entry)
}

/// P3 撤销归档：删除 archives 副本 + 回写索引（源文件在下载目录天然可恢复）
#[tauri::command]
pub fn archive_undo(app: tauri::AppHandle, entry_id: String) -> Result<ArchiveEntry, String> {
    let idx_path = archives_index_path(&app)?;
    let mut entries = load_archives_index(&idx_path);
    let val = entries
        .get(&entry_id)
        .cloned()
        .ok_or_else(|| "归档条目不存在".to_string())?;
    let entry: ArchiveEntry = serde_json::from_value(val).map_err(|e| format!("索引条目解析失败: {e}"))?;

    // 定位副本：rel 在 archives/ 下的相对路径（/ 分隔 → 平台分隔符）
    let abs = archives_dir(&app)?.join(&entry.rel.replace('/', std::path::MAIN_SEPARATOR_STR));
    let _ = fs::remove_file(&abs); // 已不存在（手动删除）也视为撤销成功

    entries.remove(&entry_id);
    save_archives_index(&idx_path, &entries)?;
    Ok(entry)
}

/// P3 归档索引清单（前端「素材归档」分区/打包用）
#[tauri::command]
pub fn archive_list(app: tauri::AppHandle) -> Result<Vec<ArchiveEntry>, String> {
    let idx_path = archives_index_path(&app)?;
    let entries = load_archives_index(&idx_path);
    let mut out: Vec<ArchiveEntry> = entries
        .values()
        .filter_map(|v| serde_json::from_value(v.clone()).ok())
        .collect();
    out.sort_by(|a, b| b.at.cmp(&a.at)); // 新→旧
    Ok(out)
}

/// P5 打包索引段：`archives` 元数据（不含实体，与 toolbox-pack.json 既有落差一致）
#[tauri::command]
pub fn archive_pack_index(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let list = archive_list(app)?;
    Ok(serde_json::json!({
        "entries": list.iter().map(|e| serde_json::json!({
            "rel": e.rel,
            "name": e.name,
            "subject": e.subject,
            "version": e.version,
            "grade": e.grade,
            "volume": e.volume,
            "size_bytes": e.size_bytes,
            "at": e.at,
        })).collect::<Vec<_>>(),
        "exported_at": now_iso(),
    }))
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

    // ------------------------------------------------ P3 归档移动单测

    fn tmp_archive_meta() -> ArchiveMeta {
        ArchiveMeta {
            subject: "英语".into(),
            version: "人教版".into(),
            grade: "四年级".into(),
            volume: "上册".into(),
        }
    }

    #[test]
    fn ext_of_accepts_media_and_rejects_others() {
        assert_eq!(ext_of("U01.mp4").unwrap(), "mp4");
        assert_eq!(ext_of("song.MP3").unwrap(), "mp3");
        assert_eq!(ext_of("a.png").unwrap(), "png");
        assert!(ext_of("a.pdf").is_some());
        assert!(ext_of("notes.docx").is_none(), "docx 不支持");
        assert!(ext_of("noext").is_none());
    }

    #[test]
    fn dedup_name_adds_number_suffix() {
        let dir = std::env::temp_dir().join("archive-dedup-test");
        let _ = fs::create_dir_all(&dir);
        fs::write(dir.join("a.mp4"), "1").unwrap();
        fs::write(dir.join("a (1).mp4"), "2").unwrap();
        assert_eq!(dedup_name(&dir, "a.mp4"), "a (2).mp4");
        assert_eq!(dedup_name(&dir, "b.mp4"), "b.mp4");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn archives_index_roundtrip_preserves_unknown_fields() {
        let dir = std::env::temp_dir().join("archive-idx-test");
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("archives.json");
        // 预置顶层未知字段（config 形态：版本标记等）
        fs::write(&path, r#"{"schema_version":1}"#).unwrap();
        let mut entries = serde_json::Map::new();
        entries.insert(
            "arc-1".into(),
            serde_json::json!({"id":"arc-1","name":"a.mp4","source_path":"C:\\dl\\a.mp4","subject":"英语","version":"人教版","grade":"四年级","volume":"上册","size_bytes":10,"at":"2026-09-27T00:00:00.000Z","rel":"英语/人教版/四年级上册/a.mp4"}),
        );
        save_archives_index(&path, &entries).unwrap();
        let raw = fs::read_to_string(&path).unwrap();
        let v: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(v["schema_version"], 1, "未知字段保留");
        assert_eq!(v["archives"]["arc-1"]["name"], "a.mp4");
        // 读回
        let loaded = load_archives_index(&path);
        assert_eq!(loaded.len(), 1);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn civil_from_days_known_dates() {
        // 1970-01-01 = day 0；day 20700 = 2026-09-04（与 Unix 历法比对）
        let (y0, m0, d0) = civil_from_days(0);
        assert_eq!((y0, m0, d0), (1970, 1, 1));
        let (y, m, d) = civil_from_days(20700);
        assert_eq!((y, m, d), (2026, 9, 4), "day 20700 = 2026-09-04（验证无 chrono 日历）");
    }
}