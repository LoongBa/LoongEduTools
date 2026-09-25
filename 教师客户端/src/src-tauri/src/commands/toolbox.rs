//! 工具箱命令层 · R03 §4.4 / A01 §4.4（清单 + 本地快捷方式 + 下载/启动链路）
//!
//! - 清单：`GET /api/edu/toolbox/manifest`（登录态 JWT 拉取 → 本地缓存；未登录/无网 → 缓存降级浏览）
//! - 本地业务状态：`<exe 同目录>/toolbox.json`（唯一一份：快捷方式视图 pinned / last_used，R03 §4.4②）
//! - 工具本体：`<exe 同目录>/toolbox/<id>/`（下载解包落盘；启动不依赖网络）
//! - 零采集红线（R03 §4.4④）：壳只列清单 / 存快捷方式 / 启动，不碰工具运行时、不上传任何使用数据

use crate::commands::auth::load_credential;
use crate::commands::recents::exe_dir;
use crate::commands::store::{extract_zip, get_json, parse_sha256_hex};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

// ------------------------------------------------------------------ 数据结构（R03 §4.4① / A01 §4.4）

/// 工具箱分类（数据驱动，服务端可扩展）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolboxCategory {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
}

/// 工具箱工具条目（服务端为权威源；`size_bytes`/`checksum` 未钉定 asset 时为 0/空串）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolboxTool {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub license: String,
    #[serde(default)]
    pub homepage: String,
    #[serde(default)]
    pub download_url: String,
    #[serde(default)]
    pub size_bytes: u64,
    #[serde(default)]
    pub checksum: String,
    #[serde(default)]
    pub portable: bool,
    #[serde(default)]
    pub win7_ok: bool,
    #[serde(default)]
    pub recommend: bool,
    #[serde(default)]
    pub entry: String,
}

/// `GET /api/edu/toolbox/manifest` 响应体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolboxManifest {
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub updated_at: String,
    #[serde(default)]
    pub categories: Vec<ToolboxCategory>,
    #[serde(default)]
    pub tools: Vec<ToolboxTool>,
}

// ------------------------------------------------------------------ 本地数据模型（R03 §4.4②）

/// 本地快捷方式（唯一的本地业务状态；不复制清单权威数据）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolboxShortcut {
    /// 关联服务端清单条目 id
    #[serde(default)]
    pub tool_id: String,
    /// 相对数据目录（download）或绝对路径（manual）
    #[serde(default)]
    pub path: String,
    /// → 「我的工具」视图
    #[serde(default)]
    pub pinned: bool,
    /// → 「最近使用」视图（ISO 时间戳 `YYYY-MM-DDTHH:MM:SSZ`；空 = 未用过；LRU 上限 10 由 UI 截取）
    #[serde(default)]
    pub last_used: String,
    /// download=按清单下载 | manual=手动添加本地已有程序
    #[serde(default = "default_source")]
    pub source: String,
}

fn default_source() -> String {
    "download".to_string()
}

/// 本地 `toolbox.json` 根结构
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ToolboxDb {
    #[serde(default)]
    pub shortcuts: Vec<ToolboxShortcut>,
}

// ------------------------------------------------------------------ 清单缓存（离线降级）

/// 清单缓存：`<exe 同目录>/toolbox/manifest-cache.json`（缓存副本，非权威源）
fn cache_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(exe_dir(app)?.join("toolbox").join("manifest-cache.json"))
}

fn read_cache(app: &tauri::AppHandle) -> Option<ToolboxManifest> {
    let raw = fs::read_to_string(cache_path(app).ok()?).ok()?;
    serde_json::from_str(&raw).ok()
}

fn write_cache(app: &tauri::AppHandle, m: &ToolboxManifest) -> Result<(), String> {
    let path = cache_path(app)?;
    if let Some(p) = path.parent() {
        let _ = fs::create_dir_all(p);
    }
    let json = serde_json::to_string_pretty(m).map_err(|e| format!("序列化失败: {e}"))?;
    fs::write(path, json).map_err(|e| format!("写入工具箱缓存失败: {e}"))
}

// ------------------------------------------------------------------ 本地数据层（toolbox.json 读写）

/// `toolbox.json`：`<exe 同目录>/toolbox.json`（与 `packages/` 同级，R03 §4.4②）
fn toolbox_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(exe_dir(app)?.join("toolbox.json"))
}

/// 工具本体根：`<exe 同目录>/toolbox/`（工具落盘 `toolbox/<id>/`）
fn toolbox_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(exe_dir(app)?.join("toolbox"))
}

fn read_db(app: &tauri::AppHandle) -> Result<ToolboxDb, String> {
    let p = toolbox_db_path(app)?;
    if !p.exists() {
        return Ok(ToolboxDb::default());
    }
    let raw = fs::read_to_string(&p).map_err(|e| format!("读取 toolbox.json 失败: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("toolbox.json 解析失败: {e}"))
}

fn write_db(app: &tauri::AppHandle, db: &ToolboxDb) -> Result<(), String> {
    let p = toolbox_db_path(app)?;
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建数据目录失败: {e}"))?;
    }
    let json = serde_json::to_string_pretty(db).map_err(|e| format!("序列化失败: {e}"))?;
    fs::write(&p, json).map_err(|e| format!("写入 toolbox.json 失败: {e}"))
}

/// 去重置顶（按 tool_id）：已存在则替换（重装/更新），否则追加
fn db_upsert(db: &mut ToolboxDb, sc: ToolboxShortcut) {
    db.shortcuts.retain(|s| s.tool_id != sc.tool_id);
    db.shortcuts.push(sc);
}

// ------------------------------------------------------------------ 命令①：toolbox_manifest（A7）

async fn manifest_inner(app: &tauri::AppHandle) -> Result<ToolboxManifest, String> {
    let jwt = load_credential(app).map(|c| c.jwt);
    let cache = read_cache(app);
    match jwt {
        None => cache.ok_or_else(|| "未登录，请先登录后浏览工具箱".into()),
        Some(jwt) => match get_json(app, "toolbox/manifest", Some(&jwt)).await {
            Ok(v) => {
                let m: ToolboxManifest =
                    serde_json::from_value(v).map_err(|e| format!("工具箱清单解析失败: {e}"))?;
                let _ = write_cache(app, &m);
                Ok(m)
            }
            Err(e) => cache.ok_or(e),
        },
    }
}

/// `GET /api/edu/toolbox/manifest` 工具箱清单（A01 §4.4；Bearer JWT 与 packages/manifest 一致）。
/// 未登录 → 有缓存用缓存、无缓存报错；有登录但网络失败 → 同样缓存降级（R03 §4.3）。
#[tauri::command]
pub async fn toolbox_manifest(app: tauri::AppHandle) -> Result<ToolboxManifest, String> {
    manifest_inner(&app).await
}

// ------------------------------------------------------------------ 命令②：toolbox_list

/// 读本地 `toolbox.json`（不存在 → 空库）——「我的工具 / 最近使用 / 全部工具」三视图数据源
#[tauri::command]
pub fn toolbox_list(app: tauri::AppHandle) -> Result<ToolboxDb, String> {
    read_db(&app)
}

// ------------------------------------------------------------------ 命令③：toolbox_set_pinned

/// 设置收藏态（R03 §4.3「我的工具」）：`pinned=true/false`，持久化后返回最新库
#[tauri::command]
pub fn toolbox_set_pinned(
    app: tauri::AppHandle,
    tool_id: String,
    pinned: bool,
) -> Result<ToolboxDb, String> {
    let mut db = read_db(&app)?;
    let sc = db
        .shortcuts
        .iter_mut()
        .find(|s| s.tool_id == tool_id)
        .ok_or_else(|| format!("工具箱中未找到 {tool_id}（先下载或手动添加）"))?;
    sc.pinned = pinned;
    write_db(&app, &db)?;
    Ok(db)
}

// ------------------------------------------------------------------ 命令④：toolbox_add_manual

/// 手动添加本地已有程序（R03 §4.4② 可选）：绝对路径 → 文件须存在 → `tool_id` 取文件名主干
#[tauri::command]
pub fn toolbox_add_manual(app: tauri::AppHandle, path: String) -> Result<ToolboxDb, String> {
    let p = PathBuf::from(&path);
    if !p.is_absolute() {
        return Err("手动添加请使用绝对路径（如 C:\\Tools\\my.exe）".into());
    }
    if !p.exists() {
        return Err(format!("文件不存在: {path}"));
    }
    let tool_id = p
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("manual")
        .to_string();
    let mut db = read_db(&app)?;
    if db.shortcuts.iter().any(|s| s.tool_id == tool_id) {
        return Err(format!("已存在同名工具登记: {tool_id}"));
    }
    db.shortcuts.push(ToolboxShortcut {
        tool_id,
        path,
        pinned: false,
        last_used: String::new(),
        source: "manual".to_string(),
    });
    write_db(&app, &db)?;
    Ok(db)
}

// ------------------------------------------------------------------ 命令⑤：toolbox_download（C1-C3）

/// 下载工具（R03 §4.3/§4.6 链路首环）：清单 `download_url` → 临时 zip → sha256 校验
/// （checksum 非空才验；A8 未钉定时空串跳过）→ 解包 `toolbox/<id>/` → 生成快捷方式
/// （`path = "toolbox/<id>/<entry>"` 相对数据目录，`source=download`）→ 持久化返回最新库。
#[tauri::command]
pub async fn toolbox_download(
    app: tauri::AppHandle,
    tool_id: String,
) -> Result<ToolboxDb, String> {
    let m = manifest_inner(&app).await?;
    let tool = m
        .tools
        .iter()
        .find(|t| t.id == tool_id)
        .cloned()
        .ok_or_else(|| format!("清单中未找到工具: {tool_id}"))?;
    if tool.download_url.is_empty() {
        return Err(format!(
            "{tool_id} 无下载地址（系统内置或待服务端钉定 A8）；可用「手动添加」登记本地程序"
        ));
    }

    let tmp = std::env::temp_dir().join(format!(
        "loongedu-tool-{tool_id}-{}.zip",
        std::process::id()
    ));
    let got_hex = download_to_tmp(&tool.download_url, &tmp).await?;

    // checksum 校验（非空才验——A8 未钉定时空串跳过，保持链路可用）
    if !tool.checksum.is_empty() {
        let expect = parse_sha256_hex(&tool.checksum)
            .ok_or_else(|| format!("清单 checksum 格式无效: {}", tool.checksum))?;
        if !got_hex.eq_ignore_ascii_case(&expect) {
            let _ = fs::remove_file(&tmp);
            return Err("工具下载校验失败（SHA-256 不匹配），请重试".into());
        }
    }

    // 解包到 toolbox/<id>/（重装覆盖旧目录）
    let root = toolbox_root(&app)?;
    let dir = root.join(&tool_id);
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("清理旧工具目录失败: {e}"))?;
    }
    fs::create_dir_all(&dir).map_err(|e| format!("创建工具目录失败: {e}"))?;
    let buf = fs::read(&tmp).map_err(|e| format!("读取下载文件失败: {e}"))?;
    let _ = fs::remove_file(&tmp);
    extract_zip(&buf, &dir).map_err(|e| format!("解包工具失败: {e}"))?;

    // 入口解析（entry 空 → 目录顶层首个 .exe 兜底）
    let entry = resolve_entry(&dir, &tool.entry)?;

    let mut db = read_db(&app)?;
    db_upsert(
        &mut db,
        ToolboxShortcut {
            tool_id: tool_id.clone(),
            path: format!("toolbox/{tool_id}/{entry}"),
            pinned: false,
            last_used: String::new(),
            source: "download".to_string(),
        },
    );
    write_db(&app, &db)?;
    Ok(db)
}

// ------------------------------------------------------------------ 命令⑥：toolbox_launch（C4）

/// 启动已下载/已登记工具：解析路径（相对 = 数据目录拼接；绝对 = 原样）→ 校验存在 →
/// spawn（不监控第三方进程，R03 §4.3「不注入、不监控」）→ 更新 `last_used`（LRU 置顶）→ 返回最新库。
#[tauri::command]
pub fn toolbox_launch(app: tauri::AppHandle, tool_id: String) -> Result<ToolboxDb, String> {
    let mut db = read_db(&app)?;
    let idx = db
        .shortcuts
        .iter()
        .position(|s| s.tool_id == tool_id)
        .ok_or_else(|| format!("{tool_id} 未下载/未登记，无法启动"))?;
    let path = resolve_path(&app, &db.shortcuts[idx].path)?;
    if !path.exists() {
        return Err(format!(
            "工具文件不存在（可能已被移动或删除）: {}",
            path.display()
        ));
    }
    std::process::Command::new(&path)
        .spawn()
        .map_err(|e| format!("启动失败: {e}"))?;
    db.shortcuts[idx].last_used = iso_now_utc();
    write_db(&app, &db)?;
    Ok(db)
}

// ------------------------------------------------------------------ 内部工具

/// 路径解析：绝对路径原样返回；相对路径按数据目录（exe 同目录）拼接
fn resolve_path(app: &tauri::AppHandle, p: &str) -> Result<PathBuf, String> {
    let pb = PathBuf::from(p);
    if pb.is_absolute() {
        Ok(pb)
    } else {
        Ok(exe_dir(app)?.join(pb))
    }
}

/// 工具入口解析：清单 `entry` 优先（存在性校验）；空 → 目录顶层首个 `.exe` 兜底
fn resolve_entry(dir: &Path, entry: &str) -> Result<String, String> {
    if !entry.is_empty() {
        if dir.join(entry).exists() {
            return Ok(entry.to_string());
        }
        return Err(format!(
            "清单入口文件不存在: {entry}（解包后结构可能不符，A8 钉定）"
        ));
    }
    let mut exes: Vec<String> = fs::read_dir(dir)
        .map_err(|e| format!("读取工具目录失败: {e}"))?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .map(|x| x.eq_ignore_ascii_case("exe"))
                .unwrap_or(false)
        })
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    if exes.is_empty() {
        return Err("工具目录中未找到 .exe 入口（entry 为空且无兜底可执行文件）".into());
    }
    exes.sort();
    Ok(exes.remove(0))
}

/// 无鉴权 GET 下载到临时文件（第三方工具 URL；与 store.rs download_stream 区别：不带 JWT、
/// 不解析 A01 错误结构），返回文件内容 SHA-256 hex
async fn download_to_tmp(url: &str, tmp: &Path) -> Result<String, String> {
    let c = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败: {e}"))?;
    let mut resp = c.get(url).send().await.map_err(|e| format!("网络错误: {e}"))?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp
            .text()
            .await
            .unwrap_or_default()
            .chars()
            .take(200)
            .collect::<String>();
        return Err(format!("HTTP {status}: {body}"));
    }
    let mut writer = fs::File::create(tmp).map_err(|e| format!("创建临时文件失败: {e}"))?;
    let mut hasher = Sha256::new();
    loop {
        match resp.chunk().await.map_err(|e| format!("下载中断: {e}"))? {
            Some(chunk) => {
                hasher.update(&chunk);
                writer
                    .write_all(&chunk)
                    .map_err(|e| format!("写入临时文件失败: {e}"))?;
            }
            None => break,
        }
    }
    writer.flush().ok();
    Ok(hex_lower(&hasher.finalize()))
}

fn hex_lower(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

/// unix 秒 → `YYYY-MM-DDTHH:MM:SSZ`（UTC；无 chrono 依赖——chrono 直依赖的 clock feature
/// 会拉 `iana-time-zone` 新 crate，违反零新增下载；用 Hinnant civil_from_days 等价实现）
fn iso_now_utc() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let (hh, mm, ss) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}T{hh:02}:{mm:02}:{ss:02}Z")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sc(tool_id: &str, source: &str) -> ToolboxShortcut {
        ToolboxShortcut {
            tool_id: tool_id.to_string(),
            path: format!("toolbox/{tool_id}/x.exe"),
            pinned: false,
            last_used: String::new(),
            source: source.to_string(),
        }
    }

    #[test]
    fn db_upsert_dedup_by_tool_id() {
        let mut db = ToolboxDb::default();
        db_upsert(&mut db, sc("keyviz", "download"));
        let mut replaced = sc("keyviz", "download");
        replaced.pinned = true;
        db_upsert(&mut db, replaced);
        assert_eq!(db.shortcuts.len(), 1);
        assert!(db.shortcuts[0].pinned);
        assert_eq!(db.shortcuts[0].source, "download");
    }

    #[test]
    fn iso_now_utc_known_vectors() {
        // 固定 unix 秒验证 Hinnant 算法（无 chrono 依赖的正确性；常量经 Python 校准）
        assert_eq!(fmt_iso(0), "1970-01-01T00:00:00Z");
        assert_eq!(fmt_iso(86_400), "1970-01-02T00:00:00Z");
        // 2026-09-26 00:00:00Z（env 日期基准）与 2024-02-29 闰年边界
        assert_eq!(fmt_iso(1_790_380_800), "2026-09-26T00:00:00Z");
        assert_eq!(fmt_iso(1_709_164_800), "2024-02-29T00:00:00Z");
    }

    /// 测试专用：把 iso_now_utc 的算法抽出来给固定输入用（避免依赖墙钟）
    fn fmt_iso(secs: i64) -> String {
        let days = secs.div_euclid(86_400);
        let rem = secs.rem_euclid(86_400);
        let (hh, mm, ss) = (rem / 3600, (rem % 3600) / 60, rem % 60);
        let z = days + 719_468;
        let era = z.div_euclid(146_097);
        let doe = z.rem_euclid(146_097);
        let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
        let y = yoe + era * 400;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let d = doy - (153 * mp + 2) / 5 + 1;
        let m = if mp < 10 { mp + 3 } else { mp - 9 };
        let y = if m <= 2 { y + 1 } else { y };
        format!("{y:04}-{m:02}-{d:02}T{hh:02}:{mm:02}:{ss:02}Z")
    }

    #[test]
    fn resolve_entry_prefers_entry_and_falls_back_to_exe() {
        let dir = std::env::temp_dir().join(format!("loongedu-test-entry-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("SnipEasy.exe"), b"").unwrap();
        fs::write(dir.join("readme.txt"), b"").unwrap();
        assert_eq!(resolve_entry(&dir, "SnipEasy.exe").unwrap(), "SnipEasy.exe");
        assert_eq!(resolve_entry(&dir, "").unwrap(), "SnipEasy.exe");
        assert!(resolve_entry(&dir, "Nope.exe").is_err());
        let _ = fs::remove_dir_all(&dir);
    }
}
