//! D09 §2.4/§5.1 M4 内容协议处理器（步骤3 · part B）
//!
//! 自定义协议 `edu-content://localhost/<相对路径>`（Windows 实际请求形如
//! `http://edu-content.localhost/<相对路径>`，Tauri 2 注册后由 wry/WebView2
//! WebResourceRequested 拦截，tauri-2.11.6 app.rs 注册文档）。服务根 = 当前
//! 内容包 `data/app/` 目录（由 `package::load` 经 [`set_serve_root`] 设定）。
//!
//! - **不落盘**（D09 §2.4 承诺）：加密包文件（S01 §2.5 逐文件
//!   `iv|ciphertext|tag` AES-256-GCM）整文件内存解密后响应，明文文件直通；
//!   绝不写临时文件。
//! - **每响应 `Cache-Control: no-store`**（步骤2 要求；WebView2 遵守性
//!   待运行期实测，D09 §8 R4）。
//! - **Range → 206/416**（D09 §5.1 M4，单区间；多区间/非法域按 RFC 9110
//!   忽略回退 200）。GCM 无随机访问且实测最大资产 506KB → 先整文件解密
//!   （认证标签整体校验）再切片；若未来出现大文件资产再升级分块格式。
//! - **密钥**：`contentkey::content_key()`（凭证解锁后仅存内存；本模块
//!   从不持久化、从不随响应暴露）。

use crate::commands::contentkey;
use aes_gcm::aead::Aead;
use aes_gcm::aes::cipher::consts::U16;
use aes_gcm::aes::Aes256;
use aes_gcm::{KeyInit, Nonce};
use std::path::{Component, Path, PathBuf};
use std::sync::{OnceLock, RwLock};
use tauri::http::{self, Response, StatusCode};

/// S01 §2.5 打包产物加密类型：**16B IV 前置**（与 `scripts/crypto_out.py`
/// `iv = os.urandom(16)` + Python `AESGCM.encrypt` 互操作——两端均按 GCM 规范
/// 处理非 12B nonce；aes-gcm 0.10 lib.rs:193 泛型 `AesGcm<Aes, NonceSize>` 支持）。
/// 注意：便捷别名 `Aes256Gcm` 固定 12B nonce，16B IV 必须用本泛型别名。
type Aes256GcmIv16 = aes_gcm::AesGcm<Aes256, U16>;

/// 注册进 `Builder::register_uri_scheme_protocol` 的协议名
pub const SCHEME: &str = "edu-content";

/// 当前服务状态：内容包 `data/app/` 根目录 + 是否逐文件加密
#[derive(Clone)]
pub(crate) struct ServeState {
    pub root: PathBuf,
    pub encrypted: bool,
}

static SERVE: OnceLock<RwLock<Option<ServeState>>> = OnceLock::new();

fn serve_slot() -> &'static RwLock<Option<ServeState>> {
    SERVE.get_or_init(|| RwLock::new(None))
}

/// `package::load` 导航前调用：设定当前内容包服务根与加密态
pub(crate) fn set_serve_root(root: PathBuf, encrypted: bool) {
    *serve_slot().write().unwrap() = Some(ServeState { root, encrypted });
}

/// `package::unload` 调用：清除服务根（内容密钥清理由 contentkey 负责）
pub(crate) fn clear_serve_root() {
    *serve_slot().write().unwrap() = None;
}

/// 当前服务根（仅测试与 load 复用）
pub(crate) fn serve_state() -> Option<ServeState> {
    serve_slot().read().unwrap().clone()
}

/// Builder 注册入口：`register_uri_scheme_protocol(SCHEME, |_, req| handle(req))`
pub fn handle(request: http::Request<Vec<u8>>) -> Response<Vec<u8>> {
    let state = serve_state();
    let key = contentkey::content_key();
    serve(state.as_ref(), key.as_ref(), request)
}

/// 核心逻辑（显式注入状态与密钥，便于无全局态单元测试）
pub(crate) fn serve(
    state: Option<&ServeState>,
    content_key: Option<&[u8; 32]>,
    request: http::Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let state = match state {
        Some(s) => s,
        None => return error_response(StatusCode::FORBIDDEN, "无活动内容包"),
    };

    // uri().path() 不含 query；根路径兜底 index.html
    let raw_path = request.uri().path();
    let raw_path = if raw_path.is_empty() || raw_path == "/" {
        "index.html"
    } else {
        raw_path
    };

    let rel = match percent_decode(raw_path) {
        Ok(p) => p,
        Err(()) => return error_response(StatusCode::BAD_REQUEST, "路径编码非法"),
    };
    let rel = rel.trim_start_matches('/');

    let resolved = match resolve_under(&state.root, rel) {
        Some(p) => p,
        None => return error_response(StatusCode::NOT_FOUND, "路径非法"),
    };

    let mut body = match std::fs::read(&resolved) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return error_response(StatusCode::NOT_FOUND, "资源不存在")
        }
        Err(_) => return error_response(StatusCode::INTERNAL_SERVER_ERROR, "读取失败"),
    };

    if state.encrypted {
        let key = match content_key {
            Some(k) => k,
            None => {
                return error_response(StatusCode::FORBIDDEN, "内容包已加密，凭证未解锁")
            }
        };
        body = match decrypt_file(&body, key) {
            Ok(pt) => pt,
            Err(msg) => {
                eprintln!("[edu-content] 解密失败 {}: {msg}", resolved.display());
                return error_response(StatusCode::INTERNAL_SERVER_ERROR, "解密失败");
            }
        }
    }

    let content_type = content_type_for(&resolved);
    let total = body.len();

    // Range（单区间；非法/多区间按 RFC 9110 忽略 → 200 全量）
    let range_header = request
        .headers()
        .get("range")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    match range_header.as_deref().map(|h| eval_range(h, total)) {
        Some(RangeOutcome::Unsatisfiable) => Response::builder()
            .status(StatusCode::RANGE_NOT_SATISFIABLE)
            .header("Content-Range", format!("bytes */{total}"))
            .header("Content-Length", "0")
            .header("Cache-Control", "no-store")
            .header("Accept-Ranges", "bytes")
            .body(Vec::new())
            .unwrap_or_else(|_| Response::new(Vec::new())),
        Some(RangeOutcome::Slice(start, end_incl)) => {
            let slice = body[start..=end_incl].to_vec();
            let len = slice.len();
            Response::builder()
                .status(StatusCode::PARTIAL_CONTENT)
                .header("Content-Type", content_type)
                .header("Content-Range", format!("bytes {start}-{end_incl}/{total}"))
                .header("Content-Length", len.to_string())
                .header("Cache-Control", "no-store")
                .header("Accept-Ranges", "bytes")
                .body(slice)
                .unwrap_or_else(|_| error_response(StatusCode::INTERNAL_SERVER_ERROR, "响应构造失败"))
        }
        _ => {
            let len = total;
            Response::builder()
                .status(StatusCode::OK)
                .header("Content-Type", content_type)
                .header("Content-Length", len.to_string())
                .header("Cache-Control", "no-store")
                .header("Accept-Ranges", "bytes")
                .body(body)
                .unwrap_or_else(|_| error_response(StatusCode::INTERNAL_SERVER_ERROR, "响应构造失败"))
        }
    }
}

/// 错误响应（纯文本短消息，不回显路径/密钥）
fn error_response(status: StatusCode, msg: &str) -> Response<Vec<u8>> {
    let body = msg.as_bytes().to_vec();
    let len = body.len();
    Response::builder()
        .status(status)
        .header("Content-Type", "text/plain; charset=utf-8")
        .header("Content-Length", len.to_string())
        .header("Cache-Control", "no-store")
        .body(body)
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

// ---------------------------------------------------------------- Range

enum RangeOutcome {
    /// 单区间（含 clamp 后的绝对闭区间）
    Slice(usize, usize),
    /// 416：起始越界 / 后缀长 0 / 空文件
    Unsatisfiable,
    /// 非法或不支持（含多区间）→ 忽略，回退 200
    Ignore,
}

fn eval_range(header: &str, total: usize) -> RangeOutcome {
    let Some(spec) = header.trim().strip_prefix("bytes=") else {
        return RangeOutcome::Ignore;
    };
    // 多区间：按 RFC 9110 允许忽略整个 Range
    if spec.contains(',') {
        return RangeOutcome::Ignore;
    }
    let Some((start_s, end_s)) = spec.split_once('-') else {
        return RangeOutcome::Ignore;
    };
    let start_s = start_s.trim();
    let end_s = end_s.trim();

    if start_s.is_empty() {
        // 后缀式 bytes=-n：最后 n 字节
        let Ok(suffix_len) = end_s.parse::<usize>() else {
            return RangeOutcome::Ignore;
        };
        if suffix_len == 0 || total == 0 {
            return RangeOutcome::Unsatisfiable;
        }
        if suffix_len >= total {
            return RangeOutcome::Slice(0, total - 1);
        }
        return RangeOutcome::Slice(total - suffix_len, total - 1);
    }

    let Ok(start) = start_s.parse::<usize>() else {
        return RangeOutcome::Ignore;
    };
    if end_s.is_empty() {
        // bytes=a-：到文件尾
        if start >= total {
            return RangeOutcome::Unsatisfiable;
        }
        return RangeOutcome::Slice(start, total - 1);
    }
    let Ok(end) = end_s.parse::<usize>() else {
        return RangeOutcome::Ignore;
    };
    if end < start {
        // 非法 byte-range-spec → 忽略
        return RangeOutcome::Ignore;
    }
    if start >= total {
        return RangeOutcome::Unsatisfiable;
    }
    let end = end.min(total - 1);
    RangeOutcome::Slice(start, end)
}

// ---------------------------------------------------------------- 路径与解码

/// 百分号解码（UTF-8；非法 % 序列 → Err）。中文文件名直通。
fn percent_decode(s: &str) -> Result<String, ()> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            if i + 2 >= bytes.len() {
                return Err(());
            }
            let hi = (bytes[i + 1] as char).to_digit(16);
            let lo = (bytes[i + 2] as char).to_digit(16);
            match (hi, lo) {
                (Some(h), Some(l)) => {
                    out.push((h * 16 + l) as u8);
                    i += 3;
                }
                _ => return Err(()),
            }
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|_| ())
}

/// 相对路径解析到 root 之下；拒绝 `..`/绝对盘符等逃逸（D09 防目录穿越）
fn resolve_under(root: &Path, rel: &str) -> Option<PathBuf> {
    if rel.is_empty() {
        return None;
    }
    let mut out = root.to_path_buf();
    for comp in Path::new(&rel.replace('\\', "/")).components() {
        match comp {
            Component::Normal(c) => out.push(c),
            Component::CurDir => {}
            _ => return None, // ParentDir / RootDir / Prefix
        }
    }
    Some(out)
}

// ---------------------------------------------------------------- 加密与类型

/// S01 §2.5 逐文件 AES-256-GCM：`iv(16) | ciphertext | tag(16)`，无 AAD
fn decrypt_file(raw: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, &'static str> {
    if raw.len() < 16 + 16 {
        return Err("密文过短");
    }
    let cipher = Aes256GcmIv16::new_from_slice(key).map_err(|_| "密钥长度无效")?;
    cipher
        .decrypt(Nonce::<U16>::from_slice(&raw[..16]), &raw[16..])
        .map_err(|_| "GCM 认证失败（密钥不匹配或文件被篡改）")
}

fn content_type_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("html") | Some("htm") => "text/html; charset=utf-8",
        Some("js") | Some("mjs") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json") | Some("map") => "application/json; charset=utf-8",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("webp") => "image/webp",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("ico") => "image/x-icon",
        Some("woff2") => "font/woff2",
        Some("woff") => "font/woff",
        Some("ttf") => "font/ttf",
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        Some("ogg") => "audio/ogg",
        Some("m4a") | Some("mp4") => "audio/mp4",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aes_gcm::aead::Aead;
    use aes_gcm::{KeyInit, Nonce};

    fn get(path: &str) -> http::Request<Vec<u8>> {
        http::Request::builder()
            .method("GET")
            .uri(path)
            .body(Vec::new())
            .unwrap()
    }

    fn get_range(path: &str, range: &str) -> http::Request<Vec<u8>> {
        http::Request::builder()
            .method("GET")
            .uri(path)
            .header("Range", range)
            .body(Vec::new())
            .unwrap()
    }

    fn header<'a>(resp: &'a Response<Vec<u8>>, name: &str) -> Option<String> {
        resp.headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string())
    }

    /// 独立临时目录（进程 pid + 纳秒，测试结束 best-effort 清理）
    fn temp_root(tag: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let d = std::env::temp_dir().join(format!(
            "edu-proto-test-{}-{}-{}",
            std::process::id(),
            tag,
            nanos
        ));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn encrypt_for_test(plain: &[u8], key: &[u8; 32]) -> Vec<u8> {
        let cipher = Aes256GcmIv16::new_from_slice(key).unwrap();
        let iv = [9u8; 16];
        let mut ct = cipher.encrypt(Nonce::<U16>::from_slice(&iv), plain).unwrap();
        let mut out = iv.to_vec();
        out.append(&mut ct);
        out
    }

    #[test]
    fn plaintext_200_no_store_and_type() {
        let root = temp_root("pt");
        std::fs::write(root.join("index.html"), b"<!doctype html><p>hi").unwrap();
        let state = ServeState {
            root: root.clone(),
            encrypted: false,
        };
        let resp = serve(Some(&state), None, get("/index.html"));
        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(header(&resp, "cache-control").as_deref(), Some("no-store"));
        assert_eq!(header(&resp, "accept-ranges").as_deref(), Some("bytes"));
        assert_eq!(
            header(&resp, "content-type").as_deref(),
            Some("text/html; charset=utf-8")
        );
        assert_eq!(resp.body(), b"<!doctype html><p>hi");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn root_path_serves_index_html() {
        let root = temp_root("root");
        std::fs::write(root.join("index.html"), b"root-page").unwrap();
        let state = ServeState {
            root: root.clone(),
            encrypted: false,
        };
        let resp = serve(Some(&state), None, get("/"));
        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(resp.body(), b"root-page");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn chinese_filename_percent_decoded() {
        let root = temp_root("cjk");
        std::fs::write(root.join("四年级下册.html"), b"cjk-ok").unwrap();
        let state = ServeState {
            root: root.clone(),
            encrypted: false,
        };
        // 四 U+56DB=E5 9B 9B 年=E5 B9 B4 级=E7 BA A7 下=E4 B8 8B 册=E5 86 8C
        let resp = serve(
            Some(&state),
            None,
            get("/%E5%9B%9B%E5%B9%B4%E7%BA%A7%E4%B8%8B%E5%86%8C.html"),
        );
        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(resp.body(), b"cjk-ok");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn traversal_rejected() {
        let root = temp_root("trav");
        let state = ServeState {
            root: root.clone(),
            encrypted: false,
        };
        for evil in ["/../secret.txt", "/%2e%2e/secret.txt", "/a/../../x"] {
            let resp = serve(Some(&state), None, get(evil));
            assert_eq!(
                resp.status(),
                StatusCode::NOT_FOUND,
                "path={evil} 应被拒绝"
            );
        }
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn missing_file_404() {
        let root = temp_root("nf");
        let state = ServeState {
            root: root.clone(),
            encrypted: false,
        };
        let resp = serve(Some(&state), None, get("/nope.js"));
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn no_active_pack_403() {
        let resp = serve(None, None, get("/index.html"));
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
    }

    #[test]
    fn encrypted_roundtrip_200() {
        let key = [7u8; 32];
        let root = temp_root("enc");
        let plain = b"secret-asset-bytes";
        std::fs::write(root.join("app.js"), encrypt_for_test(plain, &key)).unwrap();
        let state = ServeState {
            root: root.clone(),
            encrypted: true,
        };
        let resp = serve(Some(&state), Some(&key), get("/app.js"));
        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(resp.body(), plain);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn encrypted_without_key_403() {
        let key = [7u8; 32];
        let root = temp_root("enc403");
        std::fs::write(root.join("app.js"), encrypt_for_test(b"x", &key)).unwrap();
        let state = ServeState {
            root: root.clone(),
            encrypted: true,
        };
        let resp = serve(Some(&state), None, get("/app.js"));
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn encrypted_tampered_500() {
        let key = [7u8; 32];
        let root = temp_root("encbad");
        let mut raw = encrypt_for_test(b"payload", &key);
        let last = raw.len() - 1;
        raw[last] ^= 0xFF; // 破坏 tag/密文
        std::fs::write(root.join("app.js"), raw).unwrap();
        let state = ServeState {
            root: root.clone(),
            encrypted: true,
        };
        let resp = serve(Some(&state), Some(&key), get("/app.js"));
        assert_eq!(resp.status(), StatusCode::INTERNAL_SERVER_ERROR);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn range_partial_206() {
        let root = temp_root("r206");
        std::fs::write(root.join("d.bin"), b"0123456789").unwrap();
        let state = ServeState {
            root: root.clone(),
            encrypted: false,
        };
        let resp = serve(Some(&state), None, get_range("/d.bin", "bytes=2-5"));
        assert_eq!(resp.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(resp.body(), b"2345");
        assert_eq!(
            header(&resp, "content-range").as_deref(),
            Some("bytes 2-5/10")
        );
        assert_eq!(header(&resp, "content-length").as_deref(), Some("4"));
        assert_eq!(header(&resp, "cache-control").as_deref(), Some("no-store"));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn range_open_end_and_clamp() {
        let root = temp_root("rclamp");
        std::fs::write(root.join("d.bin"), b"0123456789").unwrap();
        let state = ServeState {
            root: root.clone(),
            encrypted: false,
        };
        // bytes=7- 到尾
        let resp = serve(Some(&state), None, get_range("/d.bin", "bytes=7-"));
        assert_eq!(resp.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(resp.body(), b"789");
        // bytes=8-999 clamp 到尾
        let resp = serve(Some(&state), None, get_range("/d.bin", "bytes=8-999"));
        assert_eq!(resp.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(resp.body(), b"89");
        assert_eq!(
            header(&resp, "content-range").as_deref(),
            Some("bytes 8-9/10")
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn range_suffix() {
        let root = temp_root("rsuf");
        std::fs::write(root.join("d.bin"), b"0123456789").unwrap();
        let state = ServeState {
            root: root.clone(),
            encrypted: false,
        };
        let resp = serve(Some(&state), None, get_range("/d.bin", "bytes=-3"));
        assert_eq!(resp.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(resp.body(), b"789");
        // 后缀超长 → 全量
        let resp = serve(Some(&state), None, get_range("/d.bin", "bytes=-100"));
        assert_eq!(resp.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(resp.body(), b"0123456789");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn range_unsatisfiable_416() {
        let root = temp_root("r416");
        std::fs::write(root.join("d.bin"), b"0123456789").unwrap();
        let state = ServeState {
            root: root.clone(),
            encrypted: false,
        };
        let resp = serve(Some(&state), None, get_range("/d.bin", "bytes=10-"));
        assert_eq!(resp.status(), StatusCode::RANGE_NOT_SATISFIABLE);
        assert_eq!(
            header(&resp, "content-range").as_deref(),
            Some("bytes */10")
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn range_multi_and_invalid_ignored() {
        let root = temp_root("rinv");
        std::fs::write(root.join("d.bin"), b"0123456789").unwrap();
        let state = ServeState {
            root: root.clone(),
            encrypted: false,
        };
        // 多区间 → 忽略回 200
        let resp = serve(
            Some(&state),
            None,
            get_range("/d.bin", "bytes=0-1,3-4"),
        );
        assert_eq!(resp.status(), StatusCode::OK);
        // 非 bytes 单位 → 忽略回 200
        let resp = serve(Some(&state), None, get_range("/d.bin", "items=0-1"));
        assert_eq!(resp.status(), StatusCode::OK);
        // start > end 非法 spec → 忽略回 200
        let resp = serve(Some(&state), None, get_range("/d.bin", "bytes=5-2"));
        assert_eq!(resp.status(), StatusCode::OK);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn range_on_encrypted_serves_plaintext_slice() {
        let key = [3u8; 32];
        let root = temp_root("renc");
        let plain = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        std::fs::write(root.join("a.bin"), encrypt_for_test(plain, &key)).unwrap();
        let state = ServeState {
            root: root.clone(),
            encrypted: true,
        };
        let resp = serve(Some(&state), Some(&key), get_range("/a.bin", "bytes=0-3"));
        assert_eq!(resp.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(resp.body(), b"ABCD");
        assert_eq!(
            header(&resp, "content-range").as_deref(),
            Some("bytes 0-3/26")
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn percent_decode_edge_cases() {
        assert_eq!(percent_decode("a%20b").unwrap(), "a b");
        assert_eq!(percent_decode("直接中文").unwrap(), "直接中文");
        assert!(percent_decode("%zz").is_err());
        assert!(percent_decode("%a").is_err());
        // 非法 UTF-8 序列 → Err
        assert!(percent_decode("%FF%FE").is_err());
    }

    #[test]
    fn serve_state_set_and_clear() {
        set_serve_root(PathBuf::from("/tmp/x"), true);
        let st = serve_state().unwrap();
        assert!(st.encrypted);
        assert_eq!(st.root, PathBuf::from("/tmp/x"));
        clear_serve_root();
        assert!(serve_state().is_none());
    }

    /// S01 v1.1 母密钥链互操作：python `pack_content.py` + `keys/content-master.key`
    /// 加密的真实预装包 → Rust `decrypt_file` 解密 → 全量 sha256 比对 file_index。
    /// 键或包缺失时跳过（不阻塞纯 Rust 环境）。
    #[test]
    fn interop_decrypt_real_embedded_with_master_key() {
        use sha2::{Digest, Sha256};

        let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
        let key_path = manifest_dir
            .join("..")
            .join("..")
            .join("scripts")
            .join("keys")
            .join("content-master.key");
        if !key_path.is_file() {
            eprintln!("[SKIP] interop: 母密钥不存在 {:?}", key_path);
            return;
        }
        let key_hex = std::fs::read_to_string(&key_path).unwrap();
        let key_hex = key_hex.trim();
        assert_eq!(key_hex.len(), 64, "content-master.key 应为 64 位小写 hex");
        let mut key = [0u8; 32];
        for (i, pair) in key_hex.as_bytes().chunks(2).enumerate() {
            let pair = std::str::from_utf8(pair).unwrap();
            key[i] = u8::from_str_radix(pair, 16).expect("content-master.key hex 非法");
        }

        let mut checked = 0usize;
        for pkg in ["pep-reader-u01", "pep-vocab-cards"] {
            let pkg_dir = manifest_dir.join("packages-embedded").join(pkg);
            if !pkg_dir.is_dir() {
                eprintln!("[SKIP] interop: 包不存在 {:?}", pkg_dir);
                continue;
            }
            let pkg_json: serde_json::Value = serde_json::from_str(
                &std::fs::read_to_string(pkg_dir.join("package.json")).unwrap(),
            )
            .unwrap();
            assert_eq!(pkg_json["encrypted"], true, "{pkg} 应为加密包");
            let file_index = pkg_json["file_index"].as_array().unwrap();
            assert!(!file_index.is_empty());
            for entry in file_index {
                let rel = entry["path"].as_str().unwrap();
                let want = entry["sha256"].as_str().unwrap();
                let raw = std::fs::read(pkg_dir.join("data").join(rel)).unwrap();
                let plain = decrypt_file(&raw, &key)
                    .unwrap_or_else(|e| panic!("{pkg}/{rel} 解密失败: {e}"));
                let digest = Sha256::digest(&plain);
                let mut got = String::with_capacity(64);
                for b in digest.iter() {
                    got.push_str(&format!("{b:02x}"));
                }
                // file_index sha256 = 裸 hex（gen_package_json.py 口径，无 "sha256:" 前缀）
                assert_eq!(got, want, "{pkg}/{rel} sha256 不匹配");
                checked += 1;
            }
            eprintln!(
                "[OK] interop {pkg}: {} 文件母密钥解密 sha256 全通过",
                file_index.len()
            );
        }
        // 两包均缺失才算无效执行（至少扫过一个真实包）
        assert!(checked > 0, "未扫到任何 embedded 包（应至少存在 pep-reader-u01）");
    }
}
