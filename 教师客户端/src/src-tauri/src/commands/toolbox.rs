//! 工具箱清单命令层 · R03 §4.4 / A01 §4.4（`GET /api/edu/toolbox/manifest`）
//!
//! 纯数据流：登录态走网络拉取服务端清单（成功写本地缓存）；未登录/无网 → 缓存降级
//! （R03 §4.3/§4.6：清单不可达时用本地缓存继续浏览，并可由前端提示可重试）。
//! 工具本体下载 / 本地快捷方式（`toolbox.json`）属后续任务（A1-A3），本模块只负责清单。

use crate::commands::auth::load_credential;
use crate::commands::recents::exe_dir;
use crate::commands::store::get_json;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

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

// ------------------------------------------------------------------ 缓存（离线降级）

/// 清单缓存：`<exe 同目录>/toolbox/manifest-cache.json`（与工具本体目录 `toolbox/<id>/` 同级）
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

// ------------------------------------------------------------------ 命令：toolbox_manifest

/// `GET /api/edu/toolbox/manifest` 工具箱清单（A01 §4.4；Bearer JWT 与 packages/manifest 一致）。
/// 未登录 → 有缓存用缓存、无缓存报错；有登录但网络失败 → 同样缓存降级（R03 §4.3）。
#[tauri::command]
pub async fn toolbox_manifest(app: tauri::AppHandle) -> Result<ToolboxManifest, String> {
    let jwt = load_credential(&app).map(|c| c.jwt);
    let cache = read_cache(&app);
    match jwt {
        None => cache.ok_or_else(|| "未登录，请先登录后浏览工具箱".into()),
        Some(jwt) => match get_json(&app, "toolbox/manifest", Some(&jwt)).await {
            Ok(v) => {
                let m: ToolboxManifest =
                    serde_json::from_value(v).map_err(|e| format!("工具箱清单解析失败: {e}"))?;
                let _ = write_cache(&app, &m);
                Ok(m)
            }
            Err(e) => cache.ok_or(e),
        },
    }
}
