//! 服务端地址配置（设置页「服务器」组 · 前 R01 §5-B config.json api_base）
//!
//! 职责：读取/写入 config.json 的 `api_base` 字段（读改写保留未知字段，
//! 复用 recents::save_recents / archive::save_archive_config 同款模式）。
//! 生效语义：`auth::api_base()` 每次请求实时读 config.json —— 写入后立即生效，无需重启。
//! 解析优先级：config.json 显式 api_base > 编译期默认（LOONGEDU_API_BASE 打包注入）> 空（P0 离线）。
//! 空串保存 = 清除显式配置，回退编译期默认。
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// 服务端地址状态（config_get 返回 / config_set_api_base 写后回显）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigStatus {
    /// 当前生效的服务端地址（显式 > 编译期默认；空 = P0 离线模式）
    pub api_base: String,
    /// 是否为 config.json 显式配置（false = 编译期默认 / 未配置）
    pub explicit: bool,
    /// 编译期默认（打包时注入 LOONGEDU_API_BASE；未注入为空）
    pub detected_default: String,
    /// 配置文件绝对路径（exe 同目录 config.json）
    pub config_path: String,
}

/// 计算当前服务端地址状态（纯读取；显式值优先于编译期默认）
fn config_status(app: &tauri::AppHandle) -> ConfigStatus {
    let compile_default = option_env!("LOONGEDU_API_BASE").unwrap_or("").to_string();
    let path = crate::commands::recents::config_path(app).unwrap_or_default();
    let explicit = explicit_api_base(&path);
    ConfigStatus {
        api_base: explicit
            .clone()
            .or_else(|| (!compile_default.is_empty()).then(|| compile_default.clone()))
            .unwrap_or_default(),
        explicit: explicit.is_some(),
        detected_default: compile_default,
        config_path: path.to_string_lossy().into_owned(),
    }
}

/// 读 config.json 显式配置的 api_base（非空才认为显式配置）
fn explicit_api_base(path: &Path) -> Option<String> {
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|v| v.get("api_base").and_then(|x| x.as_str()).map(String::from))
        .filter(|s| !s.is_empty())
}

/// 写 config.json 的 api_base（读改写保留未知字段；空串 = 删除字段回退编译期默认）。
/// 纯函数（path 级），供单测与命令共用。
fn write_api_base(path: &Path, api_base: &str) -> Result<(), String> {
    let trimmed = api_base.trim();
    if !trimmed.is_empty()
        && !(trimmed.starts_with("http://") || trimmed.starts_with("https://"))
    {
        return Err("服务器地址需以 http:// 或 https:// 开头".into());
    }
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    // 读现有配置 → 顶层对象原样保留（api_base/recents/archive 等未知字段共存）
    let root = fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .filter(|v| v.is_object())
        .unwrap_or_else(|| serde_json::json!({}));
    let mut root = root;
    if trimmed.is_empty() {
        // 清除显式配置
        if let Some(obj) = root.as_object_mut() {
            obj.remove("api_base");
        }
    } else {
        root["api_base"] = serde_json::Value::String(trimmed.to_string());
    }
    let json = serde_json::to_string_pretty(&root).map_err(|e| format!("序列化失败: {e}"))?;
    fs::write(path, json).map_err(|e| format!("写入配置文件失败: {e}"))
}

/// 查询服务端地址状态（当前生效值 + 来源 + 配置文件路径）
#[tauri::command]
pub fn config_get(app: tauri::AppHandle) -> Result<ConfigStatus, String> {
    Ok(config_status(&app))
}

/// 设置服务端地址：写 config.json api_base（保留未知字段）；空串 = 回退编译期默认。
/// 生效语义：auth::api_base() 每次请求实时读，保存后无需重启。
#[tauri::command]
pub fn config_set_api_base(app: tauri::AppHandle, api_base: String) -> Result<ConfigStatus, String> {
    let path = crate::commands::recents::config_path(&app)?;
    write_api_base(&path, &api_base)?;
    Ok(config_status(&app))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    /// 每测试独立临时目录（防并行测试共享目录竞态：结尾 remove_dir_all 误删他测试文件）
    fn tmp_path(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("loongedu-config-{name}"));
        let _ = fs::create_dir_all(&dir);
        dir.join("config.json")
    }

    fn cleanup(name: &str) {
        let _ = fs::remove_dir_all(std::env::temp_dir().join(format!("loongedu-config-{name}")));
    }

    #[test]
    fn write_preserves_unknown_fields() {
        let p = tmp_path("preserve");
        // 模拟真实 config.json：api_base + recents + archive 共存
        fs::write(
            &p,
            r#"{"api_base":"https://old.example.com","recents":{"c1":{"class_id":"c1"}},"archive":{"dir":"D:\\Downloads","poll_ms":2000}}"#,
        )
        .unwrap();
        write_api_base(&p, "https://new.example.com").unwrap();
        let raw = fs::read_to_string(&p).unwrap();
        let v: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(v["api_base"], "https://new.example.com");
        assert!(v["recents"].is_object(), "recents 必须保留");
        assert_eq!(v["archive"]["dir"], "D:\\Downloads", "archive 必须保留");
        cleanup("preserve");
    }

    #[test]
    fn write_empty_clears_explicit() {
        let p = tmp_path("clear");
        fs::write(&p, r#"{"api_base":"https://old.example.com","recents":{}}"#).unwrap();
        write_api_base(&p, "").unwrap();
        let raw = fs::read_to_string(&p).unwrap();
        let v: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert!(v.get("api_base").is_none(), "空串应删除 api_base 字段");
        assert!(v.get("recents").is_some(), "未知字段仍保留");
        cleanup("clear");
    }

    #[test]
    fn write_rejects_bad_scheme_and_trims() {
        let p = tmp_path("scheme");
        assert!(write_api_base(&p, "ftp://x").is_err(), "非 http(s) 应拒绝");
        assert!(write_api_base(&p, "localhost:8787").is_err(), "缺 scheme 应拒绝");
        write_api_base(&p, "  https://api.example.com/  ").unwrap();
        let v: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&p).unwrap()).unwrap();
        assert_eq!(v["api_base"], "https://api.example.com/", "应去除首尾空白");
        cleanup("scheme");
    }

    #[test]
    fn write_creates_file_when_missing() {
        let p = tmp_path("fresh");
        let _ = fs::remove_file(&p);
        write_api_base(&p, "https://edu.example.com").unwrap();
        let v: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&p).unwrap()).unwrap();
        assert_eq!(v["api_base"], "https://edu.example.com");
        // explicit 判定读回一致
        assert_eq!(explicit_api_base(&p).as_deref(), Some("https://edu.example.com"));
        cleanup("fresh");
    }
}