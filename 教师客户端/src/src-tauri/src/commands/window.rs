use tauri::Manager;

/// 全屏切换（content 窗口 / main 窗口，D02 §3.6）
#[tauri::command]
pub fn toggle_fullscreen(app: tauri::AppHandle, window: String) -> Result<bool, String> {
    let w = app
        .get_webview_window(&window)
        .ok_or_else(|| format!("窗口不存在: {window}"))?;
    let is_fs = w.is_fullscreen().map_err(|e| e.to_string())?;
    w.set_fullscreen(!is_fs).map_err(|e| e.to_string())?;
    Ok(!is_fs)
}

/// 退出全屏
#[tauri::command]
pub fn exit_fullscreen(app: tauri::AppHandle, window: String) -> Result<(), String> {
    let w = app
        .get_webview_window(&window)
        .ok_or_else(|| format!("窗口不存在: {window}"))?;
    w.set_fullscreen(false).map_err(|e| e.to_string())
}