//! 主窗口位置持久化（2026-09-29 实测反馈 2：启动记住上次位置，不再每次居中）。
//! 零新依赖：读写 `app_config_dir/window_state.json`（x/y 物理坐标），与 close.rs
//! 的 shell_close.json 同目录同风格。setup 恢复位置，on_window_event 移动时防抖保存。
//! 注意：只保存/恢复 main 窗口位置（content/timer-overlay 均 hidden，无需处理）。

use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WindowPos {
    x: i32,
    y: i32,
}

fn state_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("window_state.json"))
}

/// setup 期调用：有存档且坐标合法 → 恢复上次位置；无存档/损坏 → **显式居中**
/// （2026-09-29 实测反馈：Tauri 窗口默认不居中，需显式 `center()`；原实现无存档
/// 时静默跳过导致首次启动落系统默认位而非屏幕中央）。越界坐标 → 兜底居中。
pub fn restore_position(app: &tauri::AppHandle) {
    let Some(w) = app.get_webview_window("main") else {
        return;
    };
    let path = match state_path(app) {
        Ok(p) => p,
        Err(_) => {
            let _ = w.center();
            return;
        }
    };
    let raw = match std::fs::read_to_string(path) {
        Ok(r) => r,
        Err(_) => {
            let _ = w.center();
            return;
        }
    };
    let pos: WindowPos = match serde_json::from_str(&raw) {
        Ok(p) => p,
        Err(_) => {
            let _ = w.center();
            return;
        }
    };
    // 坐标越界（不在任何显示器工作区内）→ 兜底居中
    if pos.x.abs() > 100_000 || pos.y.abs() > 100_000 {
        let _ = w.center();
        return;
    }
    let _ = w.set_position(tauri::PhysicalPosition::new(pos.x, pos.y));
}

/// 窗口移动后保存当前位置（on_window_event Moved 时调用，写入同目录 JSON）
pub fn save_position(app: &tauri::AppHandle) {
    let Some(w) = app.get_webview_window("main") else {
        return;
    };
    // outer_position：含标题栏/边框的物理坐标（用户感知的窗口位置）
    let Ok(pos) = w.outer_position() else {
        return;
    };
    let data = WindowPos { x: pos.x, y: pos.y };
    let text = match serde_json::to_string_pretty(&data) {
        Ok(t) => t,
        Err(_) => return,
    };
    let path = match state_path(app) {
        Ok(p) => p,
        Err(_) => return,
    };
    let _ = std::fs::write(path, text);
}
