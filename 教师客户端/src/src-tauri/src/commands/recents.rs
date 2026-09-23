use crate::state::{AppState, ClassProgress};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// 配置文件：exe 同目录 config.json（D02 Oracle 评审 G-1：禁用 localStorage，跟随 U 盘）
/// P0 简化：直接读写 JSON 文件；P1 切换 tauri-plugin-store 统一
pub fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = exe_dir(app)?;
    Ok(dir.join("config.json"))
}

pub fn exe_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // resource_dir()：Windows 下当前 exe 所在目录（绿色目录形态）
    app.path()
        .resource_dir()
        .map_err(|e| format!("获取资源目录失败: {e}"))
}

/// 读取全部班级进度
#[tauri::command]
pub fn recents_list(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ClassProgress>, String> {
    let path = config_path(&app)?;
    let all = load_recents(&path);
    *state.recents.lock().unwrap() = all.clone();
    let mut list: Vec<ClassProgress> = all.into_values().collect();
    list.sort_by(|a, b| a.class_name.cmp(&b.class_name));
    Ok(list)
}

/// 读取单班进度
#[tauri::command]
pub fn recents_get(
    app: tauri::AppHandle,
    class_id: String,
) -> Result<Option<ClassProgress>, String> {
    let path = config_path(&app)?;
    let all = load_recents(&path);
    Ok(all.get(&class_id).cloned())
}

/// 写入/更新单班进度（断点上报：内容切单元即调用，见 D02 §3.5）
#[tauri::command]
pub fn recents_set(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    class_id: String,
    class_name: String,
    package_id: String,
    unit: String,
    section: String,
) -> Result<(), String> {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
        .to_string();

    let mut all = load_recents(&config_path(&app)?);
    all.insert(
        class_id.clone(),
        ClassProgress {
            class_id,
            class_name,
            package_id,
            unit,
            section,
            updated_at: ts,
        },
    );
    save_recents(&config_path(&app)?, &all);
    *state.recents.lock().unwrap() = all;
    Ok(())
}

// ---------------------------------------------------------------- 持久化工具

fn load_recents(path: &Path) -> HashMap<String, ClassProgress> {
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn save_recents(path: &Path, data: &HashMap<String, ClassProgress>) {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(data) {
        let _ = fs::write(path, json);
    }
}