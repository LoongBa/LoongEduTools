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

/// 内容包窗口导出 PDF（R8 打印底座 · D08 §3.2 方案 A）
///
/// 对 `content` 窗口执行 `window.print()`（WebView2 原生打印对话框 / 另存 PDF，
/// 零新依赖）。窗口不存在或不可见 → Err（前端据此提示先打开内容包）。
#[tauri::command]
pub fn print_content(app: tauri::AppHandle) -> Result<(), String> {
    let w = app
        .get_webview_window("content")
        .ok_or_else(|| "内容包未打开，无法导出 PDF".to_string())?;
    if !w.is_visible().map_err(|e| e.to_string())? {
        return Err("内容包未打开，无法导出 PDF".to_string());
    }
    w.eval("window.print()").map_err(|e| e.to_string())
}