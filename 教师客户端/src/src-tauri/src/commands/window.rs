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

// ------------------------------------------------ 内容包空态三段流程（v0.2 · 应用列表）

/// 内容服务器可达性探测：GET `{api_base}/api/edu/packages/manifest`（5s 超时，不带 JWT）。
/// **任何 HTTP 响应（含 401/404）都视为可达**并返回 api_base——只探存活不取数据；
/// 网络错误/DNS 失败 → Err；api_base 未配置 → Err（P0 离线模式无服务端可连）。
#[tauri::command]
pub async fn server_ping(app: tauri::AppHandle) -> Result<String, String> {
    let base = crate::commands::auth::api_base(&app);
    if base.is_empty() {
        return Err("未配置服务端地址（config.json api_base）".into());
    }
    let url = format!("{}/api/edu/packages/manifest", base.trim_end_matches('/'));
    let c = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败: {e}"))?;
    match c.get(&url).send().await {
        Ok(_resp) => Ok(base),
        Err(e) => Err(format!("内容服务器无法连接: {e}")),
    }
}

/// 打开运行目录（exe 同级——内容包手动放入点 `packages/` 就在其中）。
/// 先尽力创建 `packages/` 子目录，再 `explorer.exe` 打开（只 spawn 不 wait，
/// explorer 退出码不可靠）。
#[tauri::command]
pub fn open_run_dir() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| format!("定位程序目录失败: {e}"))?;
    let dir = exe
        .parent()
        .ok_or_else(|| "定位程序目录失败".to_string())?
        .to_path_buf();
    let _ = std::fs::create_dir_all(dir.join("packages"));
    std::process::Command::new("explorer.exe")
        .arg(&dir)
        .spawn()
        .map_err(|e| format!("打开目录失败: {e}"))?;
    Ok(())
}

/// 打开内容服务器页面（浏览器打开 `api_base` 根；内容/扩展分区由壳内「下载扩展」页承载，R03 §3.2）。
/// 仅放行 http/https 且不含控制字符的地址；`rundll32 url.dll,FileProtocolHandler`
/// 零依赖、无 cmd 拼接注入面。
#[tauri::command]
pub fn open_server_page(url: String) -> Result<(), String> {
    let ok = (url.starts_with("http://") || url.starts_with("https://"))
        && !url.chars().any(char::is_control);
    if !ok {
        return Err("无效的服务器地址".into());
    }
    std::process::Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", &url])
        .spawn()
        .map_err(|e| format!("打开浏览器失败: {e}"))?;
    Ok(())
}