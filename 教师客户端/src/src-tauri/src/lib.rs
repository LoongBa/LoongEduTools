mod commands;
mod state;
mod webview2;

use crate::commands::{auth, license, package, recents, report, roster, store, window};
use crate::state::AppState;
use tauri::Manager as _;
use tauri_plugin_global_shortcut::{GlobalShortcutExt as _, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // ---- 状态注册（Builder 级：先于 config 窗口创建与 setup，杜绝
        // "state not managed" 窗口期；tauri 2.11 app.rs:2524 窗口先于 setup 创建）----
        .manage(AppState::default())
        // ---- 插件注册（D02 §3.2 Oracle 必改）----
        // 单实例：防教师双击开两实例争抢 config.json（Oracle G-2）
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        // ---- 全局快捷键（D08 §3.3#2 · B1：Tauri 2 全局热键是独立官方插件）----
        // 键位 Alt+T（D05 未指定；Oracle M-3：Alt+字母系与输入法/Office 工具冲突已在 F3
        // 标注，实施时实测，冲突改 Ctrl+Alt+T 并回写 §3.3）。handler 对任意已注册快捷键
        // 统一触发：Pressed 时 toggle 计时浮层窗口（M-4：show/hide，绝不 destroy）。
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        if let Some(w) = app.get_webview_window("timer-overlay") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    }
                })
                .build(),
        )
        // ---- 启动流程（D02 §3.4 oracle 修订）----
        .setup(|app| {
            // ① WebView2 检测（Win7 关键；缺失引导见前端 dialog）
            let wv2 = webview2::ensure_webview2();
            if let Err(msg) = &wv2 {
                eprintln!("[WebView2] {msg}");
                // P0：检测失败仅警告不阻断（开发机已装；Win7 目标机由前端读结果弹引导）
            }
            // ② 扫描内容包 → 填充已注册的 AppState（Builder 级 manage 已完成注册）
            let state = app.state::<AppState>();
            let _ = package::scan_packages(app.handle(), state.inner());
            // ③ 注册 Alt+T 全局热键（D08 §3.3#2 · F3 降级：失败仅 log 不 panic——
            // 输入法/其它应用占用时壳内「浮层」按钮已兜底）
            if let Err(e) = app.global_shortcut().register("Alt+T") {
                eprintln!(
                    "[global-shortcut] Alt+T 注册失败（可能被输入法/其它应用占用）: {e}；已降级为壳内「浮层」按钮"
                );
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            package::list_installed,
            package::load,
            package::unload,
            recents::recents_list,
            recents::recents_get,
            recents::recents_set,
            window::toggle_fullscreen,
            window::exit_fullscreen,
            window::print_content,
            window::tool_timer,
            // P1 认证/口令（A01 / D05 §4）
            auth::auth_status,
            auth::auth_sms_send,
            auth::auth_sms_verify,
            auth::auth_login_password,
            auth::auth_logout,
            auth::auth_refresh,
            auth::auth_profile,
            auth::auth_activate,
            license::license_status,
            license::license_renew,
            license::license_bind_current,
            // P2 内容商店（云端下载 + U 盘导入 · A01 §4 / S01 §2.4）
            store::store_manifest,
            store::store_download,
            store::store_import_usb,
            store::store_list_available,
            // P3 白名单上报（A01 §5.1 · 零儿童数据红线）
            report::report_progress,
            report::report_flush,
            // P3 抽卡/分组 名单持久化（D05 §2.4.1/§2.4.2 · 本地 roster.json 零上报）
            roster::roster_save,
            roster::roster_load,
            // WebView2 状态查询（前端启动时调用，决定是否弹引导）
            test_webview2,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// 供前端查询 WebView2 状态（首启弹引导用）
#[tauri::command]
fn test_webview2() -> Result<Option<String>, String> {
    webview2::ensure_webview2()
}