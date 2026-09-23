use crate::state::{AppState, InstalledPackage};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{Emitter, Manager};

/// 当前壳版本（对齐 S01 min_shell_version 语义化比较）
pub const SHELL_VERSION: &str = "0.1.0";

/// 会话临时目录前缀（解密区，D02 §3.4：系统 TEMP 下 loongedu-<id>-<session>）
const TEMP_PREFIX: &str = "loongedu-";

/// 扫描预装 + 磁盘内容包目录，构建可用索引
/// P0 简化：直接扫描 packages-embedded/ 与 packages/ 下每个子目录，读取 manifest.json
#[tauri::command]
pub fn list_installed(state: tauri::State<'_, AppState>) -> Result<Vec<InstalledPackage>, String> {
    Ok(state.packages.lock().unwrap().clone())
}

/// 加载内容包：P0 简化 = 直接返回包内 app/index.html 路径（无加密，见 D02 P0 简化说明）
/// 真实加载走 P1：解密 data/ → 临时区 → 返回加载 URL
#[tauri::command]
pub fn load(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    package_id: String,
) -> Result<String, String> {
    let packages = state.packages.lock().unwrap();
    let pkg = packages
        .iter()
        .find(|p| p.package_id == package_id)
        .ok_or_else(|| format!("内容包不存在: {package_id}"))?;

    // app 型：定位 data/app/index.html（P0 未加密，直接路径）
    let root = PathBuf::from(&pkg.root);
    let index = if pkg.package_type == "app" {
        root.join("data").join("app").join("index.html")
    } else {
        return Err("data 型内容包需应用打开入口，P0 暂不支持直接 load".into());
    };
    if !index.exists() {
        return Err(format!(
            "内容包缺入口文件: {}（data/app/index.html 不存在）",
            index.display()
        ));
    }

    // 启动内容窗口（label="content"）并加载文件
    let content_window = app
        .get_webview_window("content")
        .ok_or("内容窗口不存在")?;

    // 将本地 html 加载进 content 窗口：用 file:// URL（Tauri 2.x 需 convertFileSrc）
    let url = tauri::Url::from_file_path(&index)
        .map_err(|_| "无法解析入口路径 URL".to_string())?
        .to_string();

    content_window
        .show()
        .map_err(|e| format!("显示内容窗口失败: {e}"))?;
    content_window
        .set_focus()
        .map_err(|e| format!("聚焦内容窗口失败: {e}"))?;
    content_window
        .eval(&format!("window.location.href = '{url}';"))
        .map_err(|e| format!("加载内容失败: {e}"))?;

    // 触发"当前单元=根"占位上报（真实断点上报见 M3 recents 集成）
    app.emit_content_progress(&package_id, "__root", "__root_in", "");

    Ok(url)
}

/// 卸载内容包：关闭 content 窗口（P0 无解密临时区；P1 补临时目录清理）
#[tauri::command]
pub fn unload(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("content") {
        // 先导航回空白页，隐藏窗口（保留窗口实例避免重建开销）
        let _ = w.eval("window.location.href = 'about:blank';");
        let _ = w.hide();
    }
    Ok(())
}

// ---------------------------------------------------------------- 内部工具

/// 启动时扫描内容包目录并填充 AppState.packages
pub fn scan_packages(state: &AppState) -> Result<usize, String> {
    let mut list: Vec<InstalledPackage> = Vec::new();

    // 内容包根：默认 exe 同目录（resource_dir），开发期回退当前目录
    let app_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    for sub in ["packages-embedded", "packages"] {
        let dir = app_dir.join(sub);
        if !dir.is_dir() {
            continue;
        }
        for entry in fs::read_dir(&dir).map_err(|e| format!("读取 {sub} 失败: {e}"))? {
            let entry = entry.map_err(|e| format!("目录项错误: {e}"))?;
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            if let Ok(pkg) = read_manifest(&path) {
                list.push(pkg);
            }
        }
    }
    *state.packages.lock().unwrap() = list.clone();
    Ok(list.len())
}

/// 读取 pad 内 manifest.json（P0 简化：不验签，见 D02；P1 换真实签名校验）
fn read_manifest(dir: &Path) -> Result<InstalledPackage, String> {
    let manifest_path = dir.join("manifest.json");
    if !manifest_path.exists() {
        return Err(format!("{} 无 manifest.json（跳过）", dir.display()));
    }
    let raw = fs::read_to_string(&manifest_path).map_err(|e| e.to_string())?;
    let v: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("manifest 解析失败: {e}"))?;

    let package_id = v
        .get("package_id")
        .and_then(|x| x.as_str())
        .unwrap_or_default()
        .to_string();
    let min_shell = v.get("min_shell_version").and_then(|x| x.as_str()).unwrap_or("0.0.0");

    // min_shell_version 校验（语义化 ≥ SHELL_VERSION 才入索引）
    if version_lt(SHELL_VERSION, min_shell) {
        return Err(format!(
            "{package_id} 需壳 {min_shell}，当前 {SHELL_VERSION}（跳过）"
        ));
    }

    Ok(InstalledPackage {
        package_id,
        package_type: v
            .get("package_type")
            .and_then(|x| x.as_str())
            .unwrap_or("data")
            .to_string(),
        name: v.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string(),
        display_name: v
            .get("display_name")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        package_version: v
            .get("package_version")
            .and_then(|x| x.as_str())
            .unwrap_or("0.0.0")
            .to_string(),
        icon: v.get("icon").and_then(|x| x.as_str()).map(|s| s.to_string()),
        is_embedded: dir
            .parent()
            .map(|p| p.ends_with("packages-embedded"))
            .unwrap_or(false),
        root: dir.to_string_lossy().into_owned(),
        content_hash: v
            .get("content_hash")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
    })
}

/// 语义化版本比较：a < b 为 true
fn version_lt(a: &str, b: &str) -> bool {
    let pa: Vec<u64> = a
        .split('.')
        .map(|x| x.parse().unwrap_or(0))
        .collect();
    let pb: Vec<u64> = b
        .split('.')
        .map(|x| x.parse().unwrap_or(0))
        .collect();
    for i in 0..3 {
        let va = pa.get(i).copied().unwrap_or(0);
        let vb = pb.get(i).copied().unwrap_or(0);
        if va != vb {
            return va < vb;
        }
    }
    false
}

/// 供 lib.rs 使用：事件上报（占位，M3 深化）
trait ContentProgress {
    fn emit_content_progress(
        &self,
        package_id: &str,
        unit: &str,
        section: &str,
        detail: &str,
    );
}

impl ContentProgress for tauri::AppHandle {
    fn emit_content_progress(
        &self,
        package_id: &str,
        unit: &str,
        section: &str,
        detail: &str,
    ) {
        let _ = self.emit(
            "content:progress",
            serde_json::json!({
                "package_id": package_id,
                "unit": unit,
                "section": section,
                "detail": detail,
                "ts": chrono_like_now(),
            }),
        );
    }
}

/// 时间戳（无 chrono 依赖，用 SystemTime 秒数）
fn chrono_like_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}