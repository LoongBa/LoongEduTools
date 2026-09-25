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

/// 计时器浮层呼出/收起（D05 tool.timer 预留 · D08 §3.3#4）
///
/// 全局快捷键 Alt+T 失效时的壳内降级入口（F3）；对静态窗口 `timer-overlay`
/// 执行 show+set_focus / hide 切换。返回 `Ok(true)`=已显示 / `Ok(false)`=已收起；
/// 窗口不存在 → Err。生命周期遵守 D08 M-4：只 show/hide，**绝不 destroy**
/// （静态窗口 destroy 后无法重建，且丢浮层内 React 状态）。
#[tauri::command]
pub fn tool_timer(app: tauri::AppHandle) -> Result<bool, String> {
    let w = app
        .get_webview_window("timer-overlay")
        .ok_or_else(|| "计时器浮层窗口不存在".to_string())?;
    if w.is_visible().map_err(|e| e.to_string())? {
        w.hide().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        w.show().map_err(|e| e.to_string())?;
        let _ = w.set_focus();
        Ok(true)
    }
}