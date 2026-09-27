//! 窗口关闭行为（设置页「关闭行为」组 · 2026-09-27 实测反馈需求3/4 + Bug2 修复）
//!
//! 三种行为（持久化到 app_config_dir/shell_close.json，读写保留未知字段）：
//! - `ask`（默认）：点关闭 → 前端弹「关闭桃李助手？」（退出/最小化到托盘/取消 + 记住复选）
//! - `quit`：点关闭 → `app.exit(0)` 直接退出
//! - `tray`：点关闭 → 隐藏主窗到系统托盘（托盘图标出现，点击图标恢复窗口）
//!
//! **Bug2 修复核心**：配置里 content/timer-overlay 两个 hidden 窗口常驻，Tauri 仅在
//! 「全部窗口销毁」时才退出 —— 只关 main 会让进程残留（用户再双击被 single-instance
//! 回调静默吞掉 = 「再运行无效」）。因此前端 onCloseRequested 恒 preventDefault，
//! 所有「真退出」统一走 `app_quit`（`app.exit(0)`，无视窗口计数立即结束进程）。
use serde_json::Value;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;

/// 合法关闭行为值
const VALID: [&str; 3] = ["ask", "quit", "tray"];

/// setup 期创建的托盘句柄（TrayIcon 不可按 id 兜底查询，句柄入 state 最稳）。
/// 初始隐藏；`min_to_tray` 显示，托盘左键点击恢复窗口后隐藏。
pub struct TrayState(pub tauri::tray::TrayIcon);

/// shell_close.json 路径（app_config_dir，如 %APPDATA%\<bundle-id>\ —— 用户级 UI 设置，
/// 不进 exe 旁 config.json：那是 U 盘部署的服务器配置，职责分离）
fn cfg_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("shell_close.json"))
}

/// 读当前关闭行为（文件缺失/损坏/非法值 → `ask`，绝不 panic）
#[tauri::command]
pub fn close_behavior_get(app: tauri::AppHandle) -> String {
    let path = match cfg_path(&app) {
        Ok(p) => p,
        Err(_) => return "ask".into(),
    };
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .and_then(|v| v.get("close_behavior").and_then(Value::as_str).map(String::from))
        .filter(|b| VALID.contains(&b.as_str()))
        .unwrap_or_else(|| "ask".into())
}

/// 保存关闭行为（校验枚举；读改写保留同文件未知字段，防未来加键被清）
#[tauri::command]
pub fn close_behavior_set(app: tauri::AppHandle, behavior: String) -> Result<(), String> {
    if !VALID.contains(&behavior.as_str()) {
        return Err(format!("非法关闭行为: {behavior}"));
    }
    let path = cfg_path(&app)?;
    // 读旧值保留未知字段；读不到按空对象起步
    let mut v = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .filter(Value::is_object)
        .unwrap_or_else(|| Value::Object(Default::default()));
    v["close_behavior"] = Value::String(behavior);
    let text = serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| e.to_string())
}

/// 真退出：`app.exit(0)` 立即结束进程 —— **不走 window.close()**（hidden 窗口会让
/// Tauri 认为「还有窗口」而不退出，即 Bug2；exit 无视窗口计数）。
#[tauri::command]
pub fn app_quit(app: tauri::AppHandle) {
    app.exit(0);
}

/// 最小化到托盘：隐藏 main（webview 存活，恢复时状态不丢）+ 显示托盘图标。
/// content/timer-overlay 本就 hidden，无需处理。
#[tauri::command]
pub fn min_to_tray(app: tauri::AppHandle) -> Result<(), String> {
    let w = app
        .get_webview_window("main")
        .ok_or_else(|| "main 窗口不存在".to_string())?;
    w.hide().map_err(|e| e.to_string())?;
    let tray = app.state::<TrayState>();
    tray.0.set_visible(true).map_err(|e| e.to_string())?;
    Ok(())
}

/// setup 期创建托盘（默认隐藏）。左键点击 → 恢复 main 并聚焦 + 隐藏托盘。
/// 图标用应用默认图标（tauri.conf 打包图标集），无菜单（托盘仅作恢复入口，D09 无菜单需求）。
pub fn init_tray(app: &tauri::AppHandle) -> Result<(), String> {
    let icon = app
        .default_window_icon()
        .ok_or_else(|| "缺少应用默认图标".to_string())?;
    let tray = TrayIconBuilder::new()
        .icon(icon.clone())
        .tooltip("桃李助手 · 龙爸易教")
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
                let _ = tray.set_visible(false);
            }
        })
        .build(app)
        .map_err(|e| e.to_string())?;
    // 初始隐藏：托盘只在「最小化到托盘」期间出现，避免常驻多一个图标
    tray.set_visible(false).map_err(|e| e.to_string())?;
    app.manage(TrayState(tray));
    Ok(())
}
