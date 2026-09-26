mod commands;
mod state;
mod webview2;

use crate::commands::{
    auth, credential, license, package, protocol, recents, report, roster, shell_config, store,
    textbook, toolbox, window,
};
use crate::state::AppState;
use tauri::Manager as _;
use tauri_plugin_global_shortcut::{GlobalShortcutExt as _, ShortcutState};

/// 壳加固注入脚本（D09 §7 步骤2）：右键菜单 + 危险快捷键阻断。
/// 随 `Builder::on_page_load` 注入到每个页面（含内容包 H5），且壳侧 main.tsx 启动即装同款监听。
/// 注意：`concat!` 拼接为单行 JS（注入 eval 执行）。
const HARDEN_JS: &str = concat!(
    "window.addEventListener('contextmenu', e => e.preventDefault());",
    "window.addEventListener('keydown', e => {",
    "  const k = e.key.toUpperCase();",
    "  const shiftIJC = e.ctrlKey && e.shiftKey && ['I','J','C'].includes(k);",
    "  const ctrlUPC = e.ctrlKey && !e.shiftKey && ['U','P','S'].includes(k);",
    "  if (e.key === 'F12' || shiftIJC || ctrlUPC) e.preventDefault();",
    "});",
);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // ① WebView2 启动期 preflight —— 必须在 Builder/窗口创建之前：
    //    运行时真缺失时主窗口起不来（wry 创建环境失败），前端 banner 永远不可达，
    //    检测/静默安装/原生弹窗必须在原生层完成；都失败才提示并退出（v0.2 流程修订）。
    #[cfg(windows)]
    match webview2::preflight_webview2() {
        webview2::PreflightOutcome::Ready => {}
        webview2::PreflightOutcome::InstallerMissing => {
            webview2::native_error_dialog(
                "需要安装 WebView2 运行时",
                "未检测到本机已安装 WebView2 运行时，也未在本程序同目录找到 \
                 MicrosoftEdgeWebview2Setup.exe。\n\n\
                 请到微软官方页面下载 WebView2 Runtime 安装程序并完成安装，\
                 然后重新打开本程序：\n\
                 https://developer.microsoft.com/microsoft-edge/webview2/\n\n\
                 （Windows 11 及已安装机器通常无需此步，直接重新打开本程序即可。）",
            );
            std::process::exit(0);
        }
        webview2::PreflightOutcome::InstallFailed => {
            webview2::native_error_dialog(
                "WebView2 自动安装未成功",
                "本程序已尝试自动安装 WebView2 运行时，但未能完成。\n\n\
                 请手动运行本程序同目录的 MicrosoftEdgeWebview2Setup.exe 完成安装，\
                 或到微软官方页面下载安装程序：\n\
                 https://developer.microsoft.com/microsoft-edge/webview2/\n\n\
                 安装完成后请重新打开本程序。",
            );
            std::process::exit(0);
        }
    }
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
        // ---- 壳加固（D09 §7 步骤2：WebView2 禁右键/危险快捷键）----
        // JS 级阻断：每个页面（含 content 窗口经 package::load 加载的内容包 H5）加载完成后
        // 注入 contextmenu/keydown preventDefault。覆盖：右键菜单、F12、Ctrl+Shift+I/J/C、
        // Ctrl+U、Ctrl+P、Ctrl+S。DevTools 未启用 tauri `devtools` feature → release 默认关闭
        // （tauri.conf.json 亦无 devtools/devtoolsFrontendFolder 显式开启，见 D09 步骤2 报告）。
        .on_page_load(|webview, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                let _ = webview.eval(HARDEN_JS);
            }
        })
        // ---- 内容协议（D09 §2.4/§5.1 M4：edu-content 内存解密、不落盘）----
        // Windows 实际请求形如 http://edu-content.localhost/<path>（wry/
        // WebResourceRequested 拦截）；响应恒带 Cache-Control: no-store + Range
        // 206/416 支持（每响应头遵守性待运行期实测，D09 §8 R4）。
        .register_uri_scheme_protocol(protocol::SCHEME, |_ctx, request| {
            protocol::handle(request)
        })
        // ---- 启动流程（D02 §3.4 oracle 修订）----
        .setup(|app| {
            // ① WebView2 兜底复检（preflight 已在窗口创建前保证 Ready；此处仅留日志，
            //    缺失引导统一走 preflight 原生弹窗，前端 banner 已移除——见 v0.2 修订）
            let wv2 = webview2::ensure_webview2();
            if let Err(msg) = &wv2 {
                eprintln!("[WebView2] {msg}");
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
            // ④ D09 §2.3/§7 步骤3：启动即复验签名凭证（验签→指纹→有效期→时钟回拨），
            //    不触发 Argon2id（PIN 在 credential_unlock 时输入）。失败仅 log 不阻断启动——
            //    状态经 credential_status 暴露给 UI（clock_rollback / expired / expiring_soon）。
            if let Err(e) = credential::startup_check(app.handle()) {
                eprintln!("[credential] 启动复验未通过: {e}（凭证过期/时间异常可在 UI 查看并走 U 盘续期）");
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
            window::tool_timer,
            window::server_ping,
            window::open_run_dir,
            window::open_server_page,
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
            // D09 §7 步骤3 · 签名凭证（A01 §4.5）：U 盘导入 / PIN+口令解锁 / 状态
            credential::credential_import_from_usb,
            credential::credential_unlock,
            credential::credential_status,
            // P2 下载扩展（云端下载 + U 盘导入 · A01 §4 / S01 §2.4）
            store::store_manifest,
            store::store_download,
            store::store_import_usb,
            store::store_list_available,
            // v0.3 工具箱（R03 §4.4 / A01 §4.4 · 清单 + 本地快捷方式 + 下载/启动）
            toolbox::toolbox_manifest,
            toolbox::toolbox_list,
            toolbox::toolbox_set_pinned,
            toolbox::toolbox_add_manual,
            toolbox::toolbox_download,
            toolbox::toolbox_launch,
            // P3 白名单上报（A01 §5.1 · 零儿童数据红线）
            report::report_progress,
            report::report_flush,
            // v0.3 教材目录扫描（设计源 §3.4 · 替换前端 showDirectoryPicker 的 Tauri fs 版）
            textbook::textbook_scan,
            // P3 抽卡/分组 名单持久化（D05 §2.4.1/§2.4.2 · 本地 roster.json 零上报）
            roster::roster_save,
            roster::roster_load,
            // v0.3 决策点4 · 服务端签名壳配置（静态托管 + 验签 + 加密缓存）
            shell_config::shell_config_fetch,
            shell_config::shell_config_cached,
            shell_config::shell_config_key_status,
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