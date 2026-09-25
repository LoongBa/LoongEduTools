//! WebView2 运行时检测与启动期安装兜底（D02 §3.6 方案 A · 2026-09-25 v0.2 修订）
//!
//! - 注册表（权威键，微软官方检测路径）：`EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`
//!   的 `pv` 值——HKLM WOW64 / HKLM / HKCU 三处**全读取、取最高版本**（多命中首个返回会漏
//!   per-user 安装；`0.0.0.0` 按微软文档视为未装）。
//!   ⚠️ 历史教训：v0.1 误写 GUID `{...8BEE-13A647FE2BA7}`（全机器 MISS），叠加目录回退在
//!   "仅注册表有键"的机器上失守 → Win11 误报（2026-09-25 本机实测确认，已修正）。
//! - 目录回退（注册表键缺失的机器兜底）：evergreen per-machine / per-user / MSIX 包目录。
//! - 启动期 preflight（Builder/窗口创建**之前**调用）：未装 → 找同目录 bootstrapper 静默
//!   安装并轮询注册表 → 都失败才由调用方原生弹窗提示（此时 UI 起不来，前端无从提示）。

use std::time::{Duration, Instant};

/// WebView2 Runtime 客户端 GUID（微软官方 distribution 文档检测键）
const WEBVIEW2_CLIENT_ID: &str = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
/// 最小值：Chromium major ≥108（Win7 停更版下限；D02 §6.3 minimumWebview2Version）
const MIN_MAJOR: u64 = 108;
/// Evergreen Bootstrapper 安装文件名（随包放 exe 同级；D06 §6.3）
const BOOTSTRAPPER_NAME: &str = "MicrosoftEdgeWebview2Setup.exe";

/// 启动期 preflight 结果
pub enum PreflightOutcome {
    /// 已安装且达标（或安装轮询成功）——正常启动
    Ready,
    /// 未安装，且本程序同目录/工作目录未找到安装文件——需用户手动处理
    InstallerMissing,
    /// 找到安装文件但静默安装轮询超时/启动失败——需用户手动处理
    InstallFailed,
}

/// 检测 WebView2 是否已安装且版本达标
/// 返回 (installed: bool, version: Option<String>)
pub fn check_webview2() -> (bool, Option<String>) {
    #[cfg(windows)]
    {
        // 注册表与目录全部命中合并取最高版本（不再"注册表优先、首个即返"——
        // 首个命中可能是过期低版本，per-user 键也可能排在后位被漏掉）
        let mut candidates = winreg_versions();
        candidates.extend(dir_versions());
        match best_version(&candidates) {
            Some(ver) => {
                let ok = version_tuple(&ver)
                    .map(|(major, _, _, _)| major >= MIN_MAJOR)
                    .unwrap_or(false);
                (ok, Some(ver))
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

/// 解析四段版本号为元组（缺段补 0）；解析失败返回 None
fn version_tuple(v: &str) -> Option<(u64, u64, u64, u64)> {
    let mut parts = [0u64; 4];
    let segs: Vec<&str> = v.trim().split('.').collect();
    if segs.is_empty() || segs.len() > 4 {
        return None;
    }
    for (i, s) in segs.iter().enumerate() {
        parts[i] = s.parse::<u64>().ok()?;
    }
    Some((parts[0], parts[1], parts[2], parts[3]))
}

/// 从候选版本串中选合法最高版本（过滤空串/非法/全零 0.0.0.0——per-user 安装场景
/// HKLM 侧 by-design 写 0.0.0.0，不能据此判"未装"）
fn best_version(candidates: &[String]) -> Option<String> {
    let mut best: Option<((u64, u64, u64, u64), String)> = None;
    for c in candidates {
        let Some(tuple) = version_tuple(c) else { continue };
        if tuple == (0, 0, 0, 0) {
            continue;
        }
        if best.as_ref().map(|(t, _)| tuple > *t).unwrap_or(true) {
            best = Some((tuple, c.clone()));
        }
    }
    best.map(|(_, v)| v)
}

/// 读取注册表全部候选 `pv` 值（仅 Windows；Cargo.toml target-gated 依赖）
#[cfg(windows)]
fn winreg_versions() -> Vec<String> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

    let candidates = registry_subkeys();

    let mut out = Vec::new();
    for (root, sub) in [
        (&hklm, candidates[0].as_str()),
        (&hklm, candidates[1].as_str()),
        (&hkcu, candidates[2].as_str()),
        (&hkcu, candidates[3].as_str()),
    ] {
        if let Ok(key) = root.open_subkey(sub) {
            if let Ok(pv) = key.get_value::<String, _>("pv") {
                if !pv.is_empty() {
                    out.push(pv);
                }
            }
        }
    }
    out
}

/// 纯函数：4 条注册表候选子键（HKLM WOW6432Node / HKLM 原生 / HKCU WOW6432Node / HKCU 原生）
fn registry_subkeys() -> [String; 4] {
    [
        format!(r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{WEBVIEW2_CLIENT_ID}"),
        format!(r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{WEBVIEW2_CLIENT_ID}"),
        format!(r"Software\WOW6432Node\Microsoft\EdgeUpdate\Clients\{WEBVIEW2_CLIENT_ID}"),
        format!(r"Software\Microsoft\EdgeUpdate\Clients\{WEBVIEW2_CLIENT_ID}"),
    ]
}

/// 目录回退：扫描全部安装基址下的版本目录名（仅 Windows）。
/// 覆盖 evergreen per-machine / per-user / MSIX 包三种布局；ACL 拒绝的基址静默跳过。
#[cfg(windows)]
fn dir_versions() -> Vec<String> {
    let mut bases: Vec<std::path::PathBuf> = Vec::new();

    // per-machine evergreen：Program Files(x86) 与 Program Files 双基址
    for var in ["ProgramFiles(x86)", "ProgramFiles"] {
        if let Ok(pf) = std::env::var(var) {
            bases.push(
                std::path::PathBuf::from(pf)
                    .join("Microsoft")
                    .join("EdgeWebView")
                    .join("Application"),
            );
        }
    }

    if let Ok(local_app) = std::env::var("LOCALAPPDATA") {
        let local = std::path::PathBuf::from(local_app);
        // per-user evergreen
        bases.push(local.join("Microsoft").join("EdgeWebView").join("Application"));
        // MSIX/Store 部署：LOCALAPPDATA\Packages\MicrosoftEdgeWebView_*\AppX\...
        if let Ok(rd) = std::fs::read_dir(local.join("Packages")) {
            for entry in rd.flatten() {
                if entry.file_name().to_string_lossy().starts_with("MicrosoftEdgeWebView") {
                    bases.push(msix_app_base(&entry.path()));
                }
            }
        }
    }
    // MSIX/Store 部署：Program Files\WindowsApps（固定基址，独立于 LOCALAPPDATA；
    // 权限不足时 read_dir 失败即跳过）
    if let Ok(rd) = std::fs::read_dir("C:\\Program Files\\WindowsApps") {
        for entry in rd.flatten() {
            if entry.file_name().to_string_lossy().starts_with("MicrosoftEdgeWebView") {
                bases.push(msix_app_base(&entry.path()));
            }
        }
    }

    let mut out = Vec::new();
    for base in bases {
        let Ok(rd) = std::fs::read_dir(&base) else {
            continue;
        };
        for entry in rd.flatten() {
            if !entry.path().is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            // 目录名 = 版本号；非法名由 best_version 统一过滤
            out.push(name);
        }
    }
    out
}

/// MSIX 包目录 → `...\AppX\Microsoft\EdgeWebView\Application`
#[cfg(windows)]
fn msix_app_base(pkg_dir: &std::path::Path) -> std::path::PathBuf {
    pkg_dir
        .join("AppX")
        .join("Microsoft")
        .join("EdgeWebView")
        .join("Application")
}

/// 启动期 preflight：检测 → 同目录 bootstrapper 静默安装 → 轮询注册表（≤60s）。
/// **必须在 Builder/窗口创建之前调用**：运行时真缺失时主窗口起不来，前端无从提示。
pub fn preflight_webview2() -> PreflightOutcome {
    #[cfg(not(windows))]
    {
        PreflightOutcome::Ready
    }

    #[cfg(windows)]
    {
        if check_webview2().0 {
            return PreflightOutcome::Ready;
        }

        let Some(setup_exe) = find_bootstrapper() else {
            return PreflightOutcome::InstallerMissing;
        };
        eprintln!("[WebView2] 未检测到运行时，尝试静默安装: {}", setup_exe.display());

        // 官方参数（顺序敏感历史坑：/silent 必须在前）
        if std::process::Command::new(&setup_exe)
            .args(["/silent", "/install"])
            .spawn()
            .is_err()
        {
            return PreflightOutcome::InstallFailed;
        }

        // bootstrapper 常立即返回、安装在后台（官方 issue #1349）——以注册表轮询为准，
        // ExitCode 不作判定（微软未文档化，#2473 官方建议装后再查注册表）。
        let deadline = Instant::now() + Duration::from_secs(60);
        let mut ticks: u32 = 0;
        while Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(500));
            if check_webview2().0 {
                eprintln!("[WebView2] 安装完成，继续启动");
                return PreflightOutcome::Ready;
            }
            ticks += 1;
            if ticks % 10 == 0 {
                eprintln!("[WebView2] 等待安装完成… {}s", ticks / 2);
            }
        }
        if check_webview2().0 {
            PreflightOutcome::Ready
        } else {
            PreflightOutcome::InstallFailed
        }
    }
}

/// 查找随包 bootstrapper：exe 同级 → exe 同级\tools\ → 当前工作目录
#[cfg(windows)]
fn find_bootstrapper() -> Option<std::path::PathBuf> {
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.extend(bootstrapper_candidates(dir));
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join(BOOTSTRAPPER_NAME));
    }
    candidates.into_iter().find(|p| p.is_file())
}

/// 纯函数：bootstrapper 候选路径列表（exe 同级 → exe 同级\tools\）
fn bootstrapper_candidates(exe_dir: &std::path::Path) -> Vec<std::path::PathBuf> {
    vec![
        exe_dir.join(BOOTSTRAPPER_NAME),
        exe_dir.join("tools").join(BOOTSTRAPPER_NAME),
    ]
}

/// 原生错误弹窗（MessageBoxW，零依赖）——WebView2 缺失时 UI 起不来，
/// tauri dialog 插件依赖窗口/事件循环不可用，必须走裸 Win32。
#[cfg(windows)]
pub fn native_error_dialog(title: &str, text: &str) {
    use std::os::windows::ffi::OsStrExt;

    fn wide(s: &str) -> Vec<u16> {
        std::ffi::OsStr::new(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(
            hwnd: *mut core::ffi::c_void,
            lptext: *const u16,
            lpcaption: *const u16,
            utype: u32,
        ) -> i32;
    }

    // MB_OK = 0x0 | MB_ICONERROR = 0x10
    let w_text = wide(text);
    let w_title = wide(title);
    unsafe {
        MessageBoxW(
            core::ptr::null_mut(),
            w_text.as_ptr(),
            w_title.as_ptr(),
            0x0000_0010,
        );
    }
}

/// 检测入口：返回错误消息时由调用方决定如何提示（现仅 eprintln；用户提示统一走原生弹窗）
pub fn ensure_webview2() -> Result<Option<String>, String> {
    let (ok, ver) = check_webview2();
    if ok {
        Ok(ver) // Some(ver) = 已装且达标
    } else {
        Err("WebView2 运行时未安装或版本过旧（需 ≥108）".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_tuple_parses_and_pads() {
        assert_eq!(
            version_tuple("153.0.4234.48"),
            Some((153, 0, 4234, 48))
        );
        assert_eq!(version_tuple("109"), Some((109, 0, 0, 0)));
        assert_eq!(version_tuple("108.0.1462.46"), Some((108, 0, 1462, 46)));
        assert_eq!(version_tuple("abc"), None);
        assert_eq!(version_tuple(""), None);
        assert_eq!(version_tuple("1.2.3.4.5"), None);
        assert_eq!(version_tuple(" 1.2.3.4 "), Some((1, 2, 3, 4)));
    }

    #[test]
    fn best_version_rejects_zero_and_invalid() {
        // 0.0.0.0 = per-user 安装下 HKLM 的 by-design 值，必须视为未装
        let cands: Vec<String> = vec!["0.0.0.0".into(), "".into(), "x".into()];
        assert_eq!(best_version(&cands), None);
        let cands: Vec<String> = vec!["0.0.0.0".into(), "153.0.4234.48".into()];
        assert_eq!(best_version(&cands).as_deref(), Some("153.0.4234.48"));
    }

    #[test]
    fn best_version_picks_highest_across_hits() {
        // 三个注册表命中 + 目录命中混合：取最高，不取首个
        let cands: Vec<String> = vec![
            "108.0.1462.46".into(),
            "153.0.4234.48".into(),
            "109.0.1518.122".into(),
        ];
        assert_eq!(best_version(&cands).as_deref(), Some("153.0.4234.48"));
        // major 相同按后续段比
        let cands: Vec<String> = vec!["109.0.1518.1".into(), "109.0.1518.122".into()];
        assert_eq!(best_version(&cands).as_deref(), Some("109.0.1518.122"));
    }

    #[test]
    fn min_major_gate() {
        assert!(version_tuple("108.0.1462.46").unwrap().0 >= MIN_MAJOR);
        assert!(version_tuple("153.0.4234.48").unwrap().0 >= MIN_MAJOR);
        assert!(version_tuple("107.0.6200.0").unwrap().0 < MIN_MAJOR);
    }

    #[test]
    fn registry_subkeys_cover_four_paths() {
        let subs = registry_subkeys();
        assert_eq!(subs.len(), 4);
        let guid = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
        let wow_suffix = format!(r"WOW6432Node\Microsoft\EdgeUpdate\Clients\{guid}");
        let plain_suffix = format!(r"Microsoft\EdgeUpdate\Clients\{guid}");
        // HKLM WOW6432Node → HKLM 原生 → HKCU WOW6432Node → HKCU 原生（大小写不敏感）
        assert!(subs[0].to_ascii_lowercase().ends_with(&wow_suffix.to_ascii_lowercase()));
        assert!(subs[1].to_ascii_lowercase().ends_with(&plain_suffix.to_ascii_lowercase()));
        assert!(subs[2].to_ascii_lowercase().ends_with(&wow_suffix.to_ascii_lowercase()));
        assert!(subs[3].to_ascii_lowercase().ends_with(&plain_suffix.to_ascii_lowercase()));
    }

    #[test]
    fn bootstrapper_candidates_ordered_exe_then_tools() {
        let dir = std::path::Path::new(r"C:\app");
        let cands = bootstrapper_candidates(dir);
        assert_eq!(
            cands,
            vec![
                std::path::PathBuf::from(r"C:\app\MicrosoftEdgeWebview2Setup.exe"),
                std::path::PathBuf::from(r"C:\app\tools\MicrosoftEdgeWebview2Setup.exe"),
            ]
        );
        // 查找决策：第一个存在的路径被选中（exe 同级优先于 tools）
        let tmp = std::env::temp_dir().join("wv2_boot_test");
        let _ = std::fs::create_dir_all(tmp.join("tools"));
        std::fs::write(tmp.join(BOOTSTRAPPER_NAME), b"x").unwrap();
        let picked = bootstrapper_candidates(&tmp)
            .into_iter()
            .find(|p| p.is_file());
        assert_eq!(picked, Some(tmp.join(BOOTSTRAPPER_NAME)));
        let _ = std::fs::remove_dir_all(tmp);
    }
}
