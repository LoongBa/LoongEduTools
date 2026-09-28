//! 应用版本命令（单一真源 = Cargo.toml `package_info().version`）。
//! 前端关于/设置/个人页统一调用，替代历史硬编码 `v0.3.0-demo`；
//! 与窗口标题、托盘 tooltip、托盘「关于」弹窗同一来源，升级只改 Cargo.toml 一处。

/// 返回构建版本号（如 "0.2.8"）
#[tauri::command]
pub fn get_app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}
