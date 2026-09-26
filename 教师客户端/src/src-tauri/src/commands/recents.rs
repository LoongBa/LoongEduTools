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

/// 读取全部班级进度
/// config.json 为结构化对象：`{ "recents": {...}, "api_base": "..." }`（未知字段保留）。
/// 兼容旧格式（纯进度 map）：`{ class_id: ClassProgress }`。
fn load_recents(path: &Path) -> HashMap<String, ClassProgress> {
    let Ok(raw) = fs::read_to_string(path) else {
        return HashMap::new();
    };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return HashMap::new();
    };
    // 新格式：进度在 recents 子对象（api_base 等其他字段共存于顶层）
    if let Some(obj) = v.get("recents") {
        if let Ok(all) = serde_json::from_value::<HashMap<String, ClassProgress>>(obj.clone()) {
            return all;
        }
    }
    // 旧格式兼容：顶层直接就是进度 map
    serde_json::from_value::<HashMap<String, ClassProgress>>(v).unwrap_or_default()
}

fn save_recents(path: &Path, data: &HashMap<String, ClassProgress>) {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    // 读现有配置 → 保留未知字段（api_base 等），仅更新 recents 子对象，避免整文件覆盖
    let root = fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok());
    let mut root = match root {
        // 新格式/含 api_base：对象原样保留
        Some(v) if v.is_object() && (v.get("recents").is_some() || v.get("api_base").is_some()) => v,
        // 旧格式：顶层整体是进度 map → 迁移进 recents 子对象
        Some(v) => serde_json::json!({ "recents": v }),
        // 无文件：全新对象
        None => serde_json::json!({}),
    };
    if let Ok(all) = serde_json::to_value(data) {
        root["recents"] = all;
        if let Ok(json) = serde_json::to_string_pretty(&root) {
            let _ = fs::write(path, json);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(id: &str) -> ClassProgress {
        ClassProgress {
            class_id: id.into(),
            class_name: format!("三年级{id}班"),
            package_id: "pkg-a".into(),
            unit: "u1".into(),
            section: "s1".into(),
            updated_at: "1700000000".into(),
        }
    }

    fn tmp_path(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join("loongedu-recents-tests");
        let _ = fs::create_dir_all(&dir);
        dir.join(name)
    }

    #[test]
    fn save_preserves_unknown_fields() {
        let p = tmp_path("preserve.json");
        // 预置含 api_base 的 config.json（真实场景：老师或运维手工写入服务器地址）
        fs::write(&p, r#"{"api_base":"https://edu.example.com"}"#).unwrap();

        let mut data = HashMap::new();
        data.insert("c1".into(), sample("c1"));
        save_recents(&p, &data);

        let raw = fs::read_to_string(&p).unwrap();
        let v: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(v["api_base"], "https://edu.example.com", "api_base 不能被覆盖");
        assert!(v["recents"].is_object(), "进度应写入 recents 子对象");
        assert_eq!(v["recents"]["c1"]["class_id"], "c1");
        fs::remove_file(&p).ok();
    }

    #[test]
    fn load_reads_recents_subobject() {
        let p = tmp_path("read-new.json");
        fs::write(
            &p,
            r#"{"api_base":"https://edu.example.com","recents":{"c1":{"class_id":"c1","class_name":"三1班","package_id":"p","unit":"u","section":"s","updated_at":"1"}}}"#,
        )
        .unwrap();
        let all = load_recents(&p);
        assert_eq!(all.len(), 1);
        assert_eq!(all["c1"].class_name, "三1班");
        fs::remove_file(&p).ok();
    }

    #[test]
    fn old_flat_format_still_loads() {
        let p = tmp_path("old-flat.json");
        // 旧格式：顶层直接是进度 map（无 api_base）
        fs::write(
            &p,
            r#"{"c1":{"class_id":"c1","class_name":"三1班","package_id":"p","unit":"u","section":"s","updated_at":"1"}}"#,
        )
        .unwrap();
        let all = load_recents(&p);
        assert_eq!(all.len(), 1);
        assert_eq!(all["c1"].class_id, "c1");
        fs::remove_file(&p).ok();
    }

    #[test]
    fn old_flat_format_migrates_on_save() {
        let p = tmp_path("old-migrate.json");
        fs::write(
            &p,
            r#"{"c1":{"class_id":"c1","class_name":"三1班","package_id":"p","unit":"u","section":"s","updated_at":"1"}}"#,
        )
        .unwrap();
        let mut data = load_recents(&p);
        data.insert("c2".into(), sample("c2"));
        save_recents(&p, &data);

        let raw = fs::read_to_string(&p).unwrap();
        let v: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert!(v.get("recents").is_some(), "旧格式应迁移进 recents 子对象");
        assert_eq!(v["recents"]["c2"]["class_id"], "c2");
        fs::remove_file(&p).ok();
    }

    #[test]
    fn corrupted_file_returns_empty() {
        let p = tmp_path("corrupt.json");
        fs::write(&p, "{ not json !!!").unwrap();
        let all = load_recents(&p);
        assert!(all.is_empty(), "损坏文件应兜底为空 map，不 panic");
        fs::remove_file(&p).ok();
    }
}