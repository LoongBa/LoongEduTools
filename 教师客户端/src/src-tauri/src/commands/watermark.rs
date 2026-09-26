//! D09 §7 步骤4：水印独立顶层窗口（防扩散主防线）
//!
//! - **独立半透明顶层窗口**（always-on-top + transparent + 不可点击），壳创建、
//!   内容包 JS 不可触及（不注册任何 tauri command，前端无 handle）。
//! - **非 DOM 注入**：标识由独立 WebView 窗口承载，内容页 DOM 无法移除、
//!   DevTools 无法在内容包内定位删除。
//! - **内容** = 教师 ID 摘要（sha256 前 12 hex）+ machine_fp 前 8 位
//!   —— 可追溯、零学生数据（R01 零采集红线）；无缓存教师 ID 时回退仅 fp8 + stderr 记日志。
//! - **生命周期**：`package::load` → `show_watermark`；`package::unload` → `hide_watermark`
//!   （destroy 彻底释放 renderer + 随内容会话生灭，杜绝陈旧身份残留）。
//! - 截屏（含 Win+Shift+S 系统截屏）画面含水印即达标（独立顶层窗口必入帧）。

use crate::commands::auth;
use crate::commands::credential;
use crate::commands::fingerprint::fingerprint;
use crate::commands::report;
use sha2::{Digest, Sha256};
use tauri::Manager;

/// 水印窗口 label（前端不可控：不注册任何命令，内容 JS 无 handle）。
/// 与内容窗口（"content"）、主壳窗口（"main"）互不冲突。
const WATERMARK_LABEL: &str = "watermark";

// ---------------------------------------------------------------- 窗口生命周期

/// 显示水印：按需创建透明顶层全屏窗口并注入右下角标识。
/// 失败返回 Err（调用方 package::load 记日志、不阻断课堂）。
pub fn show_watermark(app: &tauri::AppHandle) -> Result<(), String> {
    // 防御：重复调用先销毁旧窗口（Tauri 不允许同 label 建第二个窗口）
    if let Some(w) = app.get_webview_window(WATERMARK_LABEL) {
        let _ = w.destroy();
    }

    let text = build_watermark_text(app);
    let script = watermark_init_script(&text);
    let blank = tauri::Url::parse("about:blank")
        .map_err(|e| format!("about:blank URL 解析失败: {e}"))?;

    let win = tauri::webview::WebviewWindowBuilder::new(
        app,
        WATERMARK_LABEL,
        tauri::WebviewUrl::External(blank),
    )
    .fullscreen(true) // 覆盖整屏（含视频/白板区域），任何截屏工具抓屏必含水印
    .always_on_top(true) // 顶层，始终在内容窗口之上
    .transparent(true) // 半透明（tauri 2.11.6 webview_window.rs:1081，非 mac 无 feature 门槛）
    .decorations(false) // 无边框
    .skip_taskbar(true) // 不进任务栏
    .resizable(false) // 不可调整
    .visible(false) // 先隐藏创建，初始化脚本就绪后再 show，避免白闪
    .initialization_script(script) // about:blank 文档创建即注入右下角标识
    .build()
    .map_err(|e| format!("创建水印窗口失败: {e}"))?;

    // 不可点击：鼠标事件穿透到底层内容窗口（tauri WebviewWindow::set_ignore_cursor_events，
    // webview_window.rs:2133 → tao 透传，内容窗口交互不受遮挡）
    let _ = win.set_ignore_cursor_events(true);
    win.show().map_err(|e| format!("显示水印窗口失败: {e}"))?;
    Ok(())
}

/// 隐藏/销毁水印（随内容会话 unload 调用）。destroy 而非 hide：
/// 水印必须与内容会话同生共死，杜绝陈旧教师身份残留到下一会话/下一教师。
pub fn hide_watermark(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window(WATERMARK_LABEL) {
        let _ = w.destroy();
    }
}

// ---------------------------------------------------------------- 身份（脱敏，R01 红线）

/// machine_fp 前 8 位（可追溯标识；fingerprint.rs 32 hex 截断）
pub fn fp8() -> String {
    fp8_of(fingerprint())
}

/// 纯函数：任意机器指纹取前 8 字符（不足 8 原样，防越界）
pub fn fp8_of(fp: &str) -> String {
    fp.chars().take(8).collect()
}

/// 纯函数：teacher id → 摘要（sha256 前 12 hex）；空/"unknown" → None（可单测）。
/// "unknown" 是 auth.rs persist_login 的无登录兜底值，不构成可追溯身份。
pub fn teacher_id_digest(id: &str) -> Option<String> {
    let id = id.trim();
    if id.is_empty() || id == "unknown" {
        return None;
    }
    let mut h = Sha256::new();
    h.update(id.as_bytes());
    let hex: String = h.finalize().iter().map(|b| format!("{b:02x}")).collect();
    Some(hex.chars().take(12).collect())
}

/// 从 auth 缓存（session.enc 教师表）取教师摘要；无缓存 → None
pub fn teacher_digest12(app: &tauri::AppHandle) -> Option<String> {
    let id = auth::load_credential(app)
        .map(|c| c.teacher.id)
        .unwrap_or_default();
    teacher_id_digest(&id)
}

/// 台账 teacher8：教师摘要前 8 位；无教师 → "-"
pub fn teacher8(app: &tauri::AppHandle) -> String {
    match teacher_digest12(app) {
        Some(d) => d.chars().take(8).collect(),
        None => "-".to_string(),
    }
}

/// 纯函数：组装水印文案（可单测）——有教师 `t12 · fp8 · date`，无教师回退 `fp8 · date`
fn watermark_text(teacher12: Option<&str>, fp8: &str, date: &str) -> String {
    match teacher12 {
        Some(t) => format!("{t} · {fp8} · {date}"),
        None => format!("{fp8} · {date}"),
    }
}

/// 读取当前机器 + 教师身份组装水印文案（无教师时 stderr 记一笔回退）
fn build_watermark_text(app: &tauri::AppHandle) -> String {
    let f = fp8();
    let day = report::day_from_ts(report::now_secs());
    let t = teacher_digest12(app);
    if t.is_none() {
        eprintln!("[watermark] 无缓存教师 ID，水印回退仅 fp8: {f}（零学生数据）");
    }
    watermark_text(t.as_deref(), &f, &day)
}

// ---------------------------------------------------------------- 内容脚本

/// about:blank 初始化脚本：写入骨架文档 + 右下角半透明标识。
/// 用 textContent 赋值（绕过 HTML 转义），样式全部走 cssText（无 JS 花括号冲突）。
fn watermark_init_script(text: &str) -> String {
    let js_text = serde_json::to_string(text).unwrap_or_else(|_| "\"\"".to_string());
    format!(
        "document.open();\
         document.write('<html><head><meta charset=\"utf-8\"></head><body></body></html>');\
         document.close();\
         var wm=document.createElement('div');\
         wm.id='wm';\
         wm.style.cssText='position:fixed;right:18px;bottom:12px;z-index:2147483647;\
         background:rgba(20,20,20,0.55);color:rgba(255,255,255,0.85);\
         font-family:Consolas,Menlo,monospace;font-size:15px;letter-spacing:0.5px;\
         padding:6px 12px;border-radius:4px;transform:rotate(-2deg);opacity:0.6;\
         pointer-events:none;user-select:none;-webkit-user-select:none;white-space:pre';\
         wm.textContent={js_text};\
         document.body.appendChild(wm);"
    )
}

// ---------------------------------------------------------------- 签发台账记账（本地）

/// 解锁事件记账：`package::load` 每会话调一次（有已装凭证 seq 才记 "cred-unlock"）。
/// 凭证未装（seq 无）→ 静默跳过（无签发链可记）。
pub fn log_unlock_event(app: &tauri::AppHandle) {
    let st = credential::credential_status(app.clone());
    let Some(seq) = st.seq else { return };
    let key_id = credential::CREDENTIAL_SIGN_PUBKEYS[0].0;
    let _ = report::append_cred_event(
        app,
        "cred-unlock",
        key_id,
        seq,
        &fp8(),
        &teacher8(app),
    );
}

/// 导入事件记账：`credential.rs::credential_import_from_usb` 成功分支 additive 调用
/// （一次导入一条 "cred-import"）。machine_fp 取凭证体绑定指纹（验签后 = 本机 fp）。
pub fn log_import_event(app: &tauri::AppHandle, machine_fp: &str, seq: i64, key_id: &str) {
    let _ = report::append_cred_event(
        app,
        "cred-import",
        key_id,
        seq,
        &fp8_of(machine_fp),
        &teacher8(app),
    );
}

// ---------------------------------------------------------------- 测试

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fp8_of_truncates_to_8() {
        assert_eq!(fp8_of("0123456789abcdef"), "01234567");
        assert_eq!(fp8_of("abcd"), "abcd"); // 不足 8 原样
        assert_eq!(fp8_of(""), "");
        assert_eq!(fp8_of("ABCDEF01"), "ABCDEF01");
    }

    #[test]
    fn fp8_is_first_8_of_real_fingerprint() {
        let f = fingerprint();
        assert_eq!(fp8(), f.chars().take(8).collect::<String>());
        assert_eq!(fp8().len(), 8);
    }

    #[test]
    fn teacher_id_digest_none_for_empty_or_unknown() {
        assert_eq!(teacher_id_digest(""), None);
        assert_eq!(teacher_id_digest("   "), None);
        assert_eq!(teacher_id_digest("unknown"), None);
        assert_eq!(teacher_id_digest(" unknown "), None);
    }

    #[test]
    fn teacher_id_digest_is_12_hex_deterministic() {
        // ChatGPT 已知答案验证：空串已否，此处验证长度/字符集/稳定性
        let a = teacher_id_digest("wx-openid-0001").unwrap();
        let b = teacher_id_digest("wx-openid-0001").unwrap();
        assert_eq!(a, b);
        assert_eq!(a.len(), 12);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
        // 不同 id 摘要不同
        assert_ne!(teacher_id_digest("wx-openid-0001"), teacher_id_digest("wx-openid-0002"));
    }

    #[test]
    fn watermark_text_with_teacher() {
        assert_eq!(
            watermark_text(Some("a1b2c3d4e5f6"), "01234567", "2026-09-26"),
            "a1b2c3d4e5f6 · 01234567 · 2026-09-26"
        );
    }

    #[test]
    fn watermark_text_fallback_without_teacher() {
        assert_eq!(
            watermark_text(None, "01234567", "2026-09-26"),
            "01234567 · 2026-09-26"
        );
    }

    #[test]
    fn init_script_contains_text_and_transparency() {
        let s = watermark_init_script("abc123 · 2026-09-26");
        assert!(s.contains("abc123 · 2026-09-26"));
        assert!(s.contains("background:rgba(20,20,20,0.55)"));
        assert!(s.contains("opacity:0.6"));
        assert!(s.contains("pointer-events:none"));
        assert!(s.contains("position:fixed;right:18px;bottom:12px"));
        assert!(s.contains("transform:rotate(-2deg)"));
    }

    #[test]
    fn init_script_escapes_js_special_chars() {
        // 文本经 serde_json 转义，含引号/反斜杠也安全（实际内容仅 hex/·/空格/数字）
        let s = watermark_init_script("a\"b\\c");
        assert!(s.contains("a\\\"b\\\\c"));
    }
}