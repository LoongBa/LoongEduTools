//! Win7 WebView2 运行时检测（D02 §3.6 Oracle 阻塞项方案 A）
//! 注册表检测：EdgeUpdate Clients\{F3017226-FE2A-4295-8BEE-13A647FE2BA7} 的 pv 值

/// WebView2 Runtime 注册表路径（{F3017226-FE2A-4295-8BEE-13A647FE2BA7} = WebView2 客户端 GUID）
const WEBVIEW2_SUBKEY: &str =
    r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BEE-13A647FE2BA7}";
/// 备选：非 WOW64 路径（32 位系统 / 个别布局）
const WEBVIEW2_SUBKEY_ALT: &str =
    r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BEE-13A647FE2BA7}";

/// 最小值：Chromium ~108（Win7 停更版下限；D02 §6.3 minimumWebview2Version）
const MIN_MAJOR: u64 = 108;

/// 检测 WebView2 是否已安装且版本达标
/// 返回 (installed: bool, version: Option<String>)
pub fn check_webview2() -> (bool, Option<String>) {
    #[cfg(windows)]
    {
        match winreg_read_pv() {
            Some(ver) => {
                let major = ver
                    .split('.')
                    .next()
                    .and_then(|s| s.parse::<u64>().ok())
                    .unwrap_or(0);
                (major >= MIN_MAJOR, Some(ver))
            }
            None => (false, None),
        }
    }

    #[cfg(not(windows))]
    {
        // 非 Windows 目标（一般不会发生）：视为已装，避免阻断开发
        (true, Some("dev".into()))
    }
}

/// winreg 读取 WebView2 版本 pv 值（仅 Windows；Cargo.toml target-gated 依赖）
#[cfg(windows)]
fn winreg_read_pv() -> Option<String> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

    // 依次尝试 HKLM WOW64 → HKLM → HKCU WOW64 → HKCU
    let candidates: [(&RegKey, &str); 4] = [
        (&hklm, WEBVIEW2_SUBKEY),
        (&hklm, WEBVIEW2_SUBKEY_ALT),
        (&hkcu, WEBVIEW2_SUBKEY),
        (&hkcu, WEBVIEW2_SUBKEY_ALT),
    ];

    for (root, sub) in candidates {
        if let Ok(key) = root.open_subkey(sub) {
            if let Ok(pv) = key.get_value::<String, _>("pv") {
                if !pv.is_empty() {
                    return Some(pv);
                }
            }
        }
    }
    None
}

/// 启动期检测入口：返回错误消息时前端弹 dialog 引导装 WebView2
pub fn ensure_webview2() -> Result<Option<String>, String> {
    let (ok, ver) = check_webview2();
    if ok {
        Ok(ver) // Some(ver) = 已装且达标
    } else {
        Err("WebView2 运行时未安装或版本过旧（需 ≥108）。请运行同目录 MicrosoftEdgeWebview2Setup.exe 后重试。".to_string())
    }
}