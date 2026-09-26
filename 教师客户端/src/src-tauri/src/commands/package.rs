use crate::state::{AppState, InstalledPackage};
use ring::signature::{UnparsedPublicKey, ED25519};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{Emitter, Manager};

/// 当前壳版本（对齐 S01 min_shell_version 语义化比较）
pub const SHELL_VERSION: &str = "0.2.6";

/// 内容包 manifest 签名公钥表（key_id → ed25519 公钥 hex · S01 §2.2 signature.key_id）
/// dev-sign-2026 = scripts/keys/dev-sign.key（gitignored；管线签名钥，D04 §3.4）。
/// 换钥轮转：追加新条目即可（旧包旧钥可验、新包新钥可验，双轨兼容）。
const SIGN_PUBKEYS: &[(&str, &str)] = &[(
    "dev-sign-2026",
    "caa4223fd49da00764decc4982dd7a102705232c9079e3bb1fcd7c16802caf7d",
)];

/// 会话临时目录前缀（解密区，D02 §3.4：系统 TEMP 下 loongedu-<id>-<session>）
const TEMP_PREFIX: &str = "loongedu-";

/// 扫描预装 + 磁盘内容包目录，构建可用索引
/// P0 简化：直接扫描 packages-embedded/ 与 packages/ 下每个子目录，读取 manifest.json
/// 目录源：exe 同目录（resource_dir）+ 当前工作目录（开发期）双源去重（store.rs 落盘的
/// packages/{id}-{ver}/ 即写入 exe 同目录 packages/，必须被本扫描覆盖）
#[tauri::command]
pub fn list_installed(state: tauri::State<'_, AppState>) -> Result<Vec<InstalledPackage>, String> {
    Ok(state.packages.lock().unwrap().clone())
}

/// 加载内容包：经 `edu-content` 自定义协议导航到包内入口
/// （D09 §2.4/§5.1 M4：加密包协议层内存解密、不落盘；每响应 no-store + Range 206）
#[tauri::command]
pub fn load(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    package_id: String,
) -> Result<String, String> {
    let packages = state.packages.lock().unwrap();
    let pkg = packages
        .iter()
        .find(|p| p.package_id == package_id)
        .ok_or_else(|| format!("内容包不存在: {package_id}"))?;

    // app 型：服务根 = data/app/（S01 v1.1 加密包由协议层用 contentkey 内存解密）
    let root = PathBuf::from(&pkg.root);
    let app_root = if pkg.package_type == "app" {
        root.join("data").join("app")
    } else {
        return Err("data 型内容包需应用打开入口，P0 暂不支持直接 load".into());
    };
    let index = app_root.join("index.html");
    if !index.exists() {
        return Err(format!(
            "内容包缺入口文件: {}（data/app/index.html 不存在）",
            index.display()
        ));
    }

    // D09 §7 步骤2 验收：明文内容包拒绝加载——任何安装来源（U 盘导入/下载/
    // 预装）的 encrypted≠true 包都在进入协议服务与内容窗口之前被拒。
    if !pack_encrypted(&root) {
        return Err(
            "明文内容包被拒绝加载（D09 §2.4：需 encrypted=true，可用新版管线重打包）".into(),
        );
    }

    // 内容窗口：M2（D09 §5.1）destroy 后按 tauri.conf 等价参数重建，label 不变
    // （visible:false/fullscreen:true/resizable:true；初始 about:blank 同 conf url）
    let content_window = match app.get_webview_window("content") {
        Some(w) => w,
        None => {
            let blank = tauri::Url::parse("about:blank")
                .map_err(|_| "about:blank URL 解析失败".to_string())?;
            tauri::webview::WebviewWindowBuilder::new(
                &app,
                "content",
                tauri::WebviewUrl::External(blank),
            )
            .visible(false)
            .fullscreen(true)
            .resizable(true)
            .build()
            .map_err(|e| format!("重建内容窗口失败: {e}"))?
        }
    };

    // 设定协议服务根（含加密态，读包根 package.json 的 encrypted 标志）+ 导航。
    // Windows 下 Tauri 2 自定义协议请求形如 http://edu-content.localhost/<path>
    // （非 Windows 形如 edu-content://localhost/<path>；本项目仅部署 Windows）。
    crate::commands::protocol::set_serve_root(app_root, pack_encrypted(&root));
    let url = format!(
        "http://{}.localhost/index.html",
        crate::commands::protocol::SCHEME
    );

    content_window
        .show()
        .map_err(|e| format!("显示内容窗口失败: {e}"))?;
    content_window
        .set_focus()
        .map_err(|e| format!("聚焦内容窗口失败: {e}"))?;
    content_window
        .eval(&format!("window.location.href = '{url}';"))
        .map_err(|e| format!("加载内容失败: {e}"))?;

    // D09 §7 步骤4：水印独立顶层窗口（防扩散主防线）——内容会话开始即挂载。
    // 失败仅记日志不阻断课堂（水印是追溯标识，非课堂功能前提）。
    if let Err(e) = crate::commands::watermark::show_watermark(&app) {
        eprintln!("[watermark] 水印显示失败（不阻断课堂）: {e}");
    }
    // 签发链台账：每次内容会话记账一次 cred-unlock（脱敏；凭证未装/seq 缺失则静默跳过）
    crate::commands::watermark::log_unlock_event(&app);

    // 触发"当前单元=根"占位上报（真实断点上报见 M3 recents 集成）
    app.emit_content_progress(&package_id, "__root", "__root_in", "");

    Ok(url)
}

/// 卸载内容包（D09 §5.1 M2：hide → destroy，真正释放 WebView2 renderer 与页面
/// 内存——hide 仅保留实例不省内存；下次 load 按 conf 等价参数重建窗口）。
/// 同步清除协议服务根与内容密钥（§2.4：密钥仅存内存、随卸载消失）。
/// ⚠️ destroy 时序（Tauri #9199/#9353 已修）需运行期实测验证——M2 注。
#[tauri::command]
pub fn unload(app: tauri::AppHandle) -> Result<(), String> {
    // D09 §7 步骤4：水印随内容会话销毁（destroy，杜绝陈旧身份残留）
    crate::commands::watermark::hide_watermark(&app);
    if let Some(w) = app.get_webview_window("content") {
        w.destroy()
            .map_err(|e| format!("销毁内容窗口失败: {e}"))?;
    }
    crate::commands::protocol::clear_serve_root();
    crate::commands::contentkey::clear_content_key();
    Ok(())
}

// ---------------------------------------------------------------- 内部工具

/// 读包根 `package.json` 的 `encrypted` 标志（S01 §2.3 预检文件，不加密）：
/// true = S01 v1.1 加密包，协议层用 contentkey 内存解密（D09 §2.4 C2）。
/// false/缺文件按明文处理——`load` 在服务前已拒收明文包（D09 §7 步骤2），
/// 此函数在 load 路径上仅作协议层加密态取值。
fn pack_encrypted(root: &Path) -> bool {
    fs::read_to_string(root.join("package.json"))
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|v| v.get("encrypted").and_then(|b| b.as_bool()))
        .unwrap_or(false)
}

/// 启动/刷新时扫描内容包目录并填充 AppState.packages
/// 需要 AppHandle 以用 exe_dir() 定位 exe 同目录（store.rs 下载/导入均落盘到该 packages/）
pub fn scan_packages(app: &tauri::AppHandle, state: &AppState) -> Result<usize, String> {
    let mut list: Vec<InstalledPackage> = Vec::new();

    // 内容包根：exe 同目录（resource_dir）+ 当前工作目录（开发期）双源去重
    let mut bases: Vec<PathBuf> = Vec::new();
    if let Ok(ed) = crate::commands::recents::exe_dir(app) {
        bases.push(ed);
    }
    let cd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    if !bases.iter().any(|b| b == &cd) {
        bases.push(cd);
    }
    for base in &bases {
        for sub in ["packages-embedded", "packages"] {
            let dir = base.join(sub);
            if !dir.is_dir() {
                continue;
            }
            for entry in fs::read_dir(&dir).map_err(|e| format!("读取 {sub} 失败: {e}"))? {
                let entry = entry.map_err(|e| format!("目录项错误: {e}"))?;
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                if let Ok(pkg) = read_manifest(&path) {
                    list.push(pkg);
                }
            }
        }
    }
    *state.packages.lock().unwrap() = list.clone();
    Ok(list.len())
}

/// 读取 pad 内 manifest.json（B1：严格验签——S01 §2.2 签名缺失 / 未知 key_id / 验签失败即 Err）
/// pub：store.rs 下载/导入解包后复用其校验与解析
pub fn read_manifest(dir: &Path) -> Result<InstalledPackage, String> {
    let manifest_path = dir.join("manifest.json");
    if !manifest_path.exists() {
        return Err(format!("{} 无 manifest.json（跳过）", dir.display()));
    }
    let raw = fs::read_to_string(&manifest_path).map_err(|e| e.to_string())?;
    let v: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("manifest 解析失败: {e}"))?;

    // B1 壳端验签（S01 §2.2 · D04 §3.1）：签名缺失/未知 key_id/验签失败 → 拒绝加载
    verify_manifest_signature(&v).map_err(|e| format!("manifest 签名校验失败: {e}"))?;

    let package_id = v
        .get("package_id")
        .and_then(|x| x.as_str())
        .unwrap_or_default()
        .to_string();
    let min_shell = v.get("min_shell_version").and_then(|x| x.as_str()).unwrap_or("0.0.0");

    // min_shell_version 校验（语义化 ≥ SHELL_VERSION 才入索引）
    if version_lt(SHELL_VERSION, min_shell) {
        return Err(format!(
            "{package_id} 需壳 {min_shell}，当前 {SHELL_VERSION}（跳过）"
        ));
    }

    Ok(InstalledPackage {
        package_id,
        package_type: v
            .get("package_type")
            .and_then(|x| x.as_str())
            .unwrap_or("data")
            .to_string(),
        name: v.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string(),
        display_name: v
            .get("display_name")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        package_version: v
            .get("package_version")
            .and_then(|x| x.as_str())
            .unwrap_or("0.0.0")
            .to_string(),
        icon: v.get("icon").and_then(|x| x.as_str()).map(|s| s.to_string()),
        is_embedded: dir
            .parent()
            .map(|p| p.ends_with("packages-embedded"))
            .unwrap_or(false),
        root: dir.to_string_lossy().into_owned(),
        content_hash: v
            .get("content_hash")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
    })
}

/// 语义化版本比较：a < b 为 true
/// pub：store.rs 复用（manifest min_shell_version / 更新标记判断）
pub fn version_lt(a: &str, b: &str) -> bool {
    let pa: Vec<u64> = a
        .split('.')
        .map(|x| x.parse().unwrap_or(0))
        .collect();
    let pb: Vec<u64> = b
        .split('.')
        .map(|x| x.parse().unwrap_or(0))
        .collect();
    for i in 0..3 {
        let va = pa.get(i).copied().unwrap_or(0);
        let vb = pb.get(i).copied().unwrap_or(0);
        if va != vb {
            return va < vb;
        }
    }
    false
}

/// 验签通用信封（S01 §2.2 · D04 §3.1）：剔除 signature 后规范化 JSON（对齐
/// scripts/gen_manifest.py：sort_keys + separators=(",",":") + ensure_ascii=False），
/// 用 key_id 对应公钥验 ed25519；另校 signed_payload_hash = sha256(canon)。
/// 签名缺失 / key_id 不在表 / 验签失败 / hash 不符 → Err。
/// 公钥表参数化：内容包 manifest（SIGN_PUBKEYS）与壳配置（shell_config::SHELL_CONFIG_PUBKEYS）共用。
pub fn verify_signed_envelope(
    v: &serde_json::Value,
    pubkeys: &[(&str, &str)],
) -> Result<(), String> {
    let sig_obj = v.get("signature").ok_or("缺少 signature 块（S01 §2.2）")?;
    let alg = sig_obj
        .get("alg")
        .and_then(|x| x.as_str())
        .ok_or("signature.alg 缺失")?;
    if alg != "ed25519" {
        return Err(format!("不支持的签名算法: {alg}"));
    }
    let key_id = sig_obj
        .get("key_id")
        .and_then(|x| x.as_str())
        .ok_or("signature.key_id 缺失")?;
    let pub_hex = pubkeys
        .iter()
        .find(|(k, _)| *k == key_id)
        .map(|(_, h)| *h)
        .ok_or_else(|| format!("未知签名公钥 key_id: {key_id}"))?;
    let sig_hex = sig_obj
        .get("sig")
        .and_then(|x| x.as_str())
        .ok_or("signature.sig 缺失")?;
    let payload_hash = sig_obj
        .get("signed_payload_hash")
        .and_then(|x| x.as_str())
        .ok_or("signature.signed_payload_hash 缺失")?;

    let canon = canonical_json_sign_view(v);
    let canon_bytes = canon.as_bytes();

    // signed_payload_hash 复核（sha256:hex，与 gen_manifest.py 同式）
    let expect_hash = format!("sha256:{}", hex_lower(&Sha256::digest(canon_bytes)));
    if payload_hash != expect_hash {
        return Err("signed_payload_hash 与规范化 JSON 不符".into());
    }

    // ed25519 验签（ring，零新增依赖——已在 Cargo.lock 经 rustls 传递）
    let pub_bytes = hex_bytes(pub_hex)?;
    let sig_bytes = hex_bytes(sig_hex)?;
    let key = UnparsedPublicKey::new(&ED25519, &pub_bytes);
    key.verify(canon_bytes, &sig_bytes)
        .map_err(|_| "ed25519 验签失败（内容被篡改或非本管线签发）".to_string())
}

/// 兼容入口：内容包 manifest 验签
pub fn verify_manifest_signature(v: &serde_json::Value) -> Result<(), String> {
    verify_signed_envelope(v, SIGN_PUBKEYS)
}

/// 规范化 JSON：剔除 signature/checksum 后递归排序键、紧凑分隔符、非 ASCII 原样 UTF-8
/// （对齐 scripts/gen_manifest.py line 63：ensure_ascii=False, sort_keys=True, separators=(",",":")）
pub fn canonical_json_sign_view(v: &serde_json::Value) -> String {
    fn esc(s: &str) -> String {
        // serde_json 字符串转义与 Python ensure_ascii=False 对齐：
        // \b \f \n \r \t 快捷键 + 其它控制符 \u00xx（小写）+ 非 ASCII 原样 UTF-8
        serde_json::to_string(s).unwrap_or_default()
    }
    fn write(v: &serde_json::Value, out: &mut String) {
        match v {
            serde_json::Value::Null => out.push_str("null"),
            serde_json::Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
            serde_json::Value::Number(n) => out.push_str(&n.to_string()),
            serde_json::Value::String(s) => out.push_str(&esc(s)),
            serde_json::Value::Array(a) => {
                out.push('[');
                for (i, x) in a.iter().enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    write(x, out);
                }
                out.push(']');
            }
            serde_json::Value::Object(m) => {
                let mut pairs: Vec<(&str, &serde_json::Value)> =
                    m.iter().map(|(k, val)| (k.as_str(), val)).collect();
                pairs.sort_by(|a, b| a.0.cmp(b.0));
                out.push('{');
                for (i, (k, x)) in pairs.iter().enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    out.push_str(&esc(k));
                    out.push(':');
                    write(x, out);
                }
                out.push('}');
            }
        }
    }
    // 剔除 signature / checksum 构造 sign_view（对齐 gen_manifest.py）
    let mut sign_view = serde_json::Map::new();
    if let serde_json::Value::Object(m) = v {
        for (k, val) in m {
            if k == "signature" || k == "checksum" {
                continue;
            }
            sign_view.insert(k.clone(), val.clone());
        }
    }
    let view = serde_json::Value::Object(sign_view);
    let mut out = String::new();
    write(&view, &mut out);
    out
}

/// hex 字符串 → 字节（小写/大写均可）
pub fn hex_bytes(s: &str) -> Result<Vec<u8>, String> {
    if s.len() % 2 != 0 {
        return Err("hex 长度必须为偶数".into());
    }
    let mut out = Vec::with_capacity(s.len() / 2);
    for i in (0..s.len()).step_by(2) {
        let b = u8::from_str_radix(&s[i..i + 2], 16).map_err(|_| "hex 解析失败".to_string())?;
        out.push(b);
    }
    Ok(out)
}

fn hex_lower(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

/// 供 lib.rs 使用：事件上报（占位，M3 深化）
trait ContentProgress {    fn emit_content_progress(
        &self,
        package_id: &str,
        unit: &str,
        section: &str,
        detail: &str,
    );
}

impl ContentProgress for tauri::AppHandle {
    fn emit_content_progress(
        &self,
        package_id: &str,
        unit: &str,
        section: &str,
        detail: &str,
    ) {
        let _ = self.emit(
            "content:progress",
            serde_json::json!({
                "package_id": package_id,
                "unit": unit,
                "section": section,
                "detail": detail,
                "ts": chrono_like_now(),
            }),
        );
    }
}

/// 时间戳（无 chrono 依赖，用 SystemTime 秒数）
fn chrono_like_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 用真实管线签名钥（scripts/keys/dev-sign.key）签出的 fixture（gen_manifest.py，
    /// 2026-09-26 生成）——锁定 canonical/hash/ring 与 Python 侧字节级一致
    const SIGNED_FIXTURE: &str = r#"{"schema_version":"1.0","package_id":"test-fixture","package_type":"app","name":"测试包","display_name":"Fixture 测试","icon":null,"package_version":"1.0.0","content_hash":"sha256:abababababababababababababababababababababababababababababababab","size_bytes":1024,"min_shell_version":"0.1.0","required_license_level":1,"categories":["教材","英语"],"description":"单元测试 fixture","release_date":"2026-09-26","author":"LoongBa","download_url":"/x","checksum":"","min_free_version":null,"signature":{"alg":"ed25519","key_id":"dev-sign-2026","nonce":"62c3f6561174dca2","signed_payload_hash":"sha256:fb594facba20b84ea89669f540b1c9f7a51da4b8a0432b7ba0df097b43b6daec","sig":"046377b10a98808dafcb701596facefc6d5967967fd752b8e55e9a3d33a92f223b151f933e15842833fb96046c38a6b6439c40313d9a8770ed924bdc87969e03"}}"#;

    fn fixture_value() -> serde_json::Value {
        serde_json::from_str(SIGNED_FIXTURE).expect("fixture 合法 JSON")
    }

    #[test]
    fn canonical_json_matches_python() {
        let v = serde_json::json!({
            "z": 1,
            "a": {"y": [true, null, "中文"], "b": "x\u{1}y\n\t"},
            "m": "测试"
        });
        assert_eq!(
            canonical_json_sign_view(&v),
            r#"{"a":{"b":"x\u0001y\n\t","y":[true,null,"中文"]},"m":"测试","z":1}"#
        );
    }

    #[test]
    fn signed_fixture_verifies_ok() {
        let v = fixture_value();
        verify_manifest_signature(&v).expect("管线签名 fixture 应验签通过");
    }

    #[test]
    fn tampered_manifest_fails_verify() {
        let mut v = fixture_value();
        v["display_name"] = serde_json::json!("被篡改");
        assert!(verify_manifest_signature(&v).is_err(), "篡改后必须验签失败");
    }

    #[test]
    fn unknown_key_id_fails() {
        let mut v = fixture_value();
        v["signature"]["key_id"] = serde_json::json!("pkg-sign-9999");
        assert!(verify_manifest_signature(&v).is_err());
    }

    #[test]
    fn hex_roundtrip() {
        assert_eq!(hex_bytes("0aBc0d").unwrap(), vec![0x0a, 0xbc, 0x0d]);
        assert!(hex_bytes("abc").is_err());
        assert!(hex_bytes("zz").is_err());
    }
}