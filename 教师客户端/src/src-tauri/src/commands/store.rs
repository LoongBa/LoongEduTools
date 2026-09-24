//! 内容商店命令层 · P2 双通道内容分发（云端下载 + U 盘 zip 导入）
//! 契约：A01 §4（manifest/download 路径 + Bearer JWT）、S01 §2.4（U 盘导入预检）
//! 依赖复刻：auth.rs 的 load_credential/api_base（凭证解密不复制 cred_key 逻辑）；
//! packages 目录定位与 scan_packages 同源（exe_dir()/packages，见 recents::exe_dir）
//! zip 解包：零 zip 库 → 自写最小 central directory 解析 + flate2 raw deflate（flate2 已在 Cargo.lock）

use crate::commands::auth::{self, load_credential};
use crate::commands::package::{self, version_lt, SHELL_VERSION};
use crate::commands::recents::exe_dir;
use crate::state::{AppState, InstalledPackage};
use flate2::{Decompress, FlushDecompress, Status};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

// ------------------------------------------------------------------ 数据结构（A01 §4.1 / S01 §2.2）

/// 云端 manifest 单包条目（A01 §4.1 响应子集）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemotePkg {
    #[serde(default)]
    pub package_id: String,
    #[serde(default)]
    pub package_version: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub package_type: String,
    #[serde(default)]
    pub required_license_level: i32,
    #[serde(default)]
    pub min_shell_version: String,
    #[serde(default)]
    pub size_bytes: Option<u64>,
    /// "sha256:<64hex>"，下载完整性校验（A01 §4.1 / S01 §2.2 checksum）
    #[serde(default)]
    pub checksum: Option<String>,
    #[serde(default)]
    pub download_url: Option<String>,
}

/// `GET /api/edu/packages/manifest` 响应体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoreManifest {
    #[serde(default)]
    pub updated_at: String,
    #[serde(default)]
    pub packages: Vec<RemotePkg>,
}

/// 商店列表项：本地已装差集标注（installed / update_available）
#[derive(Debug, Clone, Serialize)]
pub struct StoreItem {
    pub package_id: String,
    pub package_version: String,
    pub name: String,
    pub package_type: String,
    pub required_license_level: i32,
    pub min_shell_version: String,
    pub size_bytes: Option<u64>,
    pub checksum: Option<String>,
    pub installed: bool,
    pub installed_version: Option<String>,
    pub update_available: bool,
}

/// `store_list_available` 返回体
#[derive(Debug, Clone, Serialize)]
pub struct StoreList {
    pub updated_at: String,
    pub packages: Vec<StoreItem>,
}

/// 包内 package.json（S01 §2.3，U 盘导入预检 §2.4）
#[derive(Debug, Clone, Deserialize)]
struct PackageJson {
    #[serde(default)]
    package_id: String,
    #[serde(default)]
    package_version: String,
    #[serde(default)]
    file_count: Option<u64>,
    #[serde(default)]
    encrypted: Option<bool>,
}

// ------------------------------------------------------------------ 目录 / 缓存

/// packages 根：exe 同目录（与 scan_packages 同源，见 recents::exe_dir）
fn packages_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(exe_dir(app)?.join("packages"))
}

fn manifest_cache_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(packages_dir(app)?.join("manifest-cache.json"))
}

/// 离线兜底：最近一次成功拉到的 manifest 落到本地 packages/（未登录/无网时返回缓存）
fn read_manifest_cache(app: &tauri::AppHandle) -> Option<StoreManifest> {
    let path = manifest_cache_path(app).ok()?;
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn write_manifest_cache(app: &tauri::AppHandle, m: &StoreManifest) -> Result<(), String> {
    let path = manifest_cache_path(app)?;
    if let Some(p) = path.parent() {
        let _ = fs::create_dir_all(p);
    }
    let json = serde_json::to_string_pretty(m).map_err(|e| format!("序列化失败: {e}"))?;
    fs::write(path, json).map_err(|e| format!("写入 manifest 缓存失败: {e}"))
}

/// 本地已装索引（package_id → InstalledPackage）
fn installed_map(state: &AppState) -> HashMap<String, InstalledPackage> {
    state
        .packages
        .lock()
        .unwrap()
        .iter()
        .cloned()
        .map(|p| (p.package_id.clone(), p))
        .collect()
}

// ------------------------------------------------------------------ 网络（GET，复用 auth 的 api_base/凭证）

/// GET `{api_base}/api/edu/{path}`（Bearer JWT），错误结构同 A01 §1.2
async fn get_json(
    app: &tauri::AppHandle,
    path: &str,
    jwt: Option<&str>,
) -> Result<serde_json::Value, String> {
    let base = auth::api_base(app);
    if base.is_empty() {
        return Err("未配置服务端地址（config.json api_base），当前为 P0 离线模式".into());
    }
    let url = format!(
        "{}/api/edu/{}",
        base.trim_end_matches('/'),
        path.trim_start_matches('/')
    );
    let c = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败: {e}"))?;
    let mut req = c.get(&url);
    if let Some(t) = jwt {
        req = req.bearer_auth(t);
    }
    let resp = req.send().await.map_err(|e| format!("网络错误: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| format!("读取响应失败: {e}"))?;
    if status.is_success() {
        serde_json::from_str(&text).map_err(|e| format!("响应解析失败: {e}"))
    } else if let Ok(api) = serde_json::from_str::<serde_json::Value>(&text) {
        let code = api
            .pointer("/error/code")
            .and_then(|x| x.as_str())
            .unwrap_or("ERROR");
        let msg = api
            .pointer("/error/message")
            .and_then(|x| x.as_str())
            .unwrap_or("请求失败");
        Err(format!("[{code}] {msg}"))
    } else {
        Err(format!("HTTP {status}: {text}"))
    }
}

/// 拉 manifest：登录态走网络（成功写缓存）；未登录/无网 → 返回缓存或明确错误
async fn manifest_inner(app: &tauri::AppHandle) -> Result<StoreManifest, String> {
    let jwt = load_credential(app).map(|c| c.jwt);
    let cache = read_manifest_cache(app);
    match jwt {
        None => match cache {
            Some(c) => Ok(c),
            None => Err("未登录，请先登录后浏览内容商店".into()),
        },
        Some(jwt) => match get_json(app, "packages/manifest", Some(&jwt)).await {
            Ok(v) => {
                let m: StoreManifest =
                    serde_json::from_value(v).map_err(|e| format!("manifest 解析失败: {e}"))?;
                let _ = write_manifest_cache(app, &m);
                Ok(m)
            }
            Err(e) => match cache {
                Some(c) => Ok(c),
                None => Err(e),
            },
        },
    }
}

// ------------------------------------------------------------------ 命令①：store_manifest

/// `GET /api/edu/packages/manifest` 可用内容包清单（A01 §4.1）
#[tauri::command]
pub async fn store_manifest(app: tauri::AppHandle) -> Result<StoreManifest, String> {
    manifest_inner(&app).await
}

// ------------------------------------------------------------------ 命令②：store_download

/// 流式下载 `{api_base}/api/edu/packages/{id}/{ver}` → 校验 checksum → 解包落盘到
/// packages/{id}-{ver}/（与 scan_packages 结构一致：根含 manifest.json/package.json/data/）
/// → 刷新索引 → 返回 InstalledPackage
#[tauri::command]
pub async fn store_download(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    package_id: String,
    version: String,
) -> Result<InstalledPackage, String> {
    let cred = load_credential(&app).ok_or("未登录，请先登录后下载内容包")?;
    let base = auth::api_base(&app);
    if base.is_empty() {
        return Err("未配置服务端地址（config.json api_base），当前为 P0 离线模式".into());
    }

    // 防降级：本地已装比请求版本新 → 拒绝
    let local = installed_map(&state);
    if let Some(lp) = local.get(&package_id) {
        if version_lt(&lp.package_version, &version) || lp.package_version == version {
            // 允许升级 / 同版本重装
        } else {
            return Err(format!(
                "本地已安装更新版本 v{}（{package_id}），无需降级",
                lp.package_version
            ));
        }
    }

    // manifest 条目中的 checksum（若有则校验；不在清单内也放行——以服务端为权威）
    let checksum: Option<String> = manifest_inner(&app)
        .await
        .ok()
        .and_then(|m| {
            m.packages
                .iter()
                .find(|p| p.package_id == package_id && p.package_version == version)
                .and_then(|p| p.checksum.clone())
        });

    let url = format!(
        "{}/api/edu/packages/{}/{}",
        base.trim_end_matches('/'),
        package_id,
        version
    );
    let tmp = temp_zip_path(&package_id, &version);
    let got_hex = download_stream(&url, &cred.jwt, &tmp).await?;

    if let Some(cs) = &checksum {
        let Some(expect) = parse_sha256_hex(cs) else {
            let _ = fs::remove_file(&tmp);
            return Err(format!("manifest checksum 格式无效: {cs}"));
        };
        if !got_hex.eq_ignore_ascii_case(&expect) {
            let _ = fs::remove_file(&tmp);
            return Err("下载文件校验失败（SHA-256 不匹配），请重试".into());
        }
    }

    // 解包到暂存目录 → 校验内层 manifest.json 且 package_id 匹配 → 移入正式目录（失败不破坏本地）
    let base = packages_dir(&app)?;
    fs::create_dir_all(&base).map_err(|e| format!("创建 packages 目录失败: {e}"))?;
    let staging = base.join(format!(".{package_id}-{version}.staging"));
    let final_dir = base.join(format!("{package_id}-{version}"));
    let _ = fs::remove_dir_all(&staging);
    fs::create_dir_all(&staging).map_err(|e| format!("创建暂存目录失败: {e}"))?;
    let buf = fs::read(&tmp).map_err(|e| format!("读取下载文件失败: {e}"))?;
    let _ = fs::remove_file(&tmp);

    if let Err(e) = extract_zip(&buf, &staging) {
        let _ = fs::remove_dir_all(&staging);
        return Err(e);
    }
    let staged = (|| {
        let pkg = package::read_manifest(&staging)?;
        if pkg.package_id != package_id {
            return Err(format!(
                "包内 manifest package_id 不匹配: {} ≠ {}",
                pkg.package_id, package_id
            ));
        }
        Ok(pkg)
    })();
    if let Err(e) = staged {
        let _ = fs::remove_dir_all(&staging);
        return Err(e);
    }

    if final_dir.exists() {
        let _ = fs::remove_dir_all(&final_dir);
    }
    fs::rename(&staging, &final_dir).map_err(|e| {
        let _ = fs::remove_dir_all(&staging);
        format!("落盘失败: {e}")
    })?;
    let pkg = package::read_manifest(&final_dir).map_err(|e| {
        let _ = fs::remove_dir_all(&final_dir);
        e
    })?;
    let _ = package::scan_packages(&app, &state);
    Ok(pkg)
}

/// 流式下载到临时文件，返回文件内容 SHA-256 hex（reqwest chunk()，无需 stream feature）
async fn download_stream(
    url: &str,
    jwt: &str,
    tmp: &Path,
) -> Result<String, String> {
    let c = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败: {e}"))?;
    let mut resp = c
        .get(url)
        .bearer_auth(jwt)
        .send()
        .await
        .map_err(|e| format!("网络错误: {e}"))?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        if let Ok(api) = serde_json::from_str::<serde_json::Value>(&text) {
            let code = api
                .pointer("/error/code")
                .and_then(|x| x.as_str())
                .unwrap_or("ERROR");
            let msg = api
                .pointer("/error/message")
                .and_then(|x| x.as_str())
                .unwrap_or("下载失败");
            return Err(format!("[{code}] {msg}"));
        }
        return Err(format!("HTTP {status}: {text}"));
    }
    let mut writer = fs::File::create(tmp).map_err(|e| format!("创建临时文件失败: {e}"))?;
    let mut hasher = Sha256::new();
    loop {
        match resp.chunk().await.map_err(|e| format!("下载中断: {e}"))? {
            Some(chunk) => {
                hasher.update(&chunk);
                writer
                    .write_all(&chunk)
                    .map_err(|e| format!("写入临时文件失败: {e}"))?;
            }
            None => break,
        }
    }
    writer.flush().ok();
    Ok(hex_lower(&hasher.finalize()))
}

fn temp_zip_path(id: &str, ver: &str) -> PathBuf {
    std::env::temp_dir().join(format!("loongedu-{id}-{ver}-{}.zip", std::process::id()))
}

/// "sha256:<hex>" → 小写 hex（格式不对返回 None）
fn parse_sha256_hex(cs: &str) -> Option<String> {
    let hex = cs.strip_prefix("sha256:")?.trim().to_ascii_lowercase();
    if hex.len() != 64 || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    Some(hex)
}

fn hex_lower(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

// ------------------------------------------------------------------ 命令③：store_import_usb

/// U 盘导入：读 zip 内 package.json 预检（S01 §2.4：file_count/encrypted）→ 读 manifest.json
/// 校验 min_shell_version ≤ SHELL_VERSION → 解包 packages/{id}-{ver}/ → 刷新索引。
/// 结构不符/签名块不完整/版本守卫不过 → Err 且不在 packages 落盘破坏本地。
#[tauri::command]
pub async fn store_import_usb(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    zip_path: String,
) -> Result<InstalledPackage, String> {
    let p = PathBuf::from(&zip_path);
    if !p.exists() {
        return Err(format!("zip 文件不存在: {zip_path}"));
    }
    let buf = fs::read(&p).map_err(|e| format!("读取 zip 失败: {e}"))?;

    // 预检① package.json（S01 §2.3 / §2.4 首步）
    let pj_raw = zip_entry_bytes(&buf, "package.json")
        .map_err(|e| format!("导入预检失败：包内缺少或无法读取 package.json（{e}）"))?;
    let pj: PackageJson = serde_json::from_slice(&pj_raw)
        .map_err(|e| format!("package.json 解析失败: {e}"))?;
    if pj.package_id.is_empty() || pj.package_version.is_empty() {
        return Err("package.json 缺 package_id / package_version（S01 §2.3）".into());
    }
    if pj.file_count.is_none() || pj.encrypted.is_none() {
        return Err("package.json 缺 file_count / encrypted 字段（S01 §2.3 预检）".into());
    }

    // 预检② manifest.json + min_shell_version（S01 §2.2）
    let mj_raw = zip_entry_bytes(&buf, "manifest.json")
        .map_err(|e| format!("导入预检失败：包内缺少 manifest.json（{e}）"))?;
    let mj: serde_json::Value = serde_json::from_slice(&mj_raw)
        .map_err(|e| format!("manifest.json 解析失败: {e}"))?;
    let m_id = mj.get("package_id").and_then(|v| v.as_str()).unwrap_or("");
    let m_ver = mj.get("package_version").and_then(|v| v.as_str()).unwrap_or("");
    let min_shell = mj
        .get("min_shell_version")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if m_id != pj.package_id {
        return Err(format!(
            "manifest.package_id 与 package.json 不一致: {m_id} ≠ {}",
            pj.package_id
        ));
    }
    if !m_ver.is_empty() && m_ver != pj.package_version {
        return Err(format!(
            "manifest.package_version 与 package.json 不一致: {m_ver} ≠ {}",
            pj.package_version
        ));
    }
    if !min_shell.is_empty() && version_lt(SHELL_VERSION, min_shell) {
        return Err(format!(
            "包要求壳 {min_shell}，当前壳 {SHELL_VERSION}，请先升级客户端"
        ));
    }
    // 签名块结构预检（P0 简化不验 ed25519，见 package.rs P0 说明；块存在则字段必须齐）
    if let Some(sig) = mj.get("signature") {
        let ok = sig.get("alg").and_then(|v| v.as_str()).is_some()
            && sig.get("sig").and_then(|v| v.as_str()).is_some()
            && sig
                .get("signed_payload_hash")
                .and_then(|v| v.as_str())
                .is_some();
        if !ok {
            return Err("manifest 签名块结构不符（S01 §2.2 signature）".into());
        }
    }

    // 版本守卫：不降级、不覆盖同版本（失败不落盘不破坏本地）
    let local = installed_map(&state);
    if let Some(lp) = local.get(&pj.package_id) {
        if lp.package_version == pj.package_version {
            return Err(format!("本地已安装同版本 v{}，跳过导入", pj.package_version));
        }
        if version_lt(&pj.package_version, &lp.package_version) {
            return Err(format!(
                "本地已安装更新版本 v{}，跳过导入",
                lp.package_version
            ));
        }
    }

    // 解包到暂存 → 校验 → 移入正式目录
    let base = packages_dir(&app)?;
    fs::create_dir_all(&base).map_err(|e| format!("创建 packages 目录失败: {e}"))?;
    let staging = base.join(format!(".{}-{}.staging", pj.package_id, pj.package_version));
    let final_dir = base.join(format!("{}-{}", pj.package_id, pj.package_version));
    let _ = fs::remove_dir_all(&staging);
    fs::create_dir_all(&staging).map_err(|e| format!("创建暂存目录失败: {e}"))?;
    if let Err(e) = extract_zip(&buf, &staging) {
        let _ = fs::remove_dir_all(&staging);
        return Err(e);
    }
    let staged = match package::read_manifest(&staging) {
        Ok(p) => p,
        Err(e) => {
            let _ = fs::remove_dir_all(&staging);
            return Err(e);
        }
    };
    if staged.package_id != pj.package_id {
        let _ = fs::remove_dir_all(&staging);
        return Err(format!(
            "解包后 manifest.package_id 不匹配: {} ≠ {}",
            staged.package_id, pj.package_id
        ));
    }
    if final_dir.exists() {
        let _ = fs::remove_dir_all(&final_dir);
    }
    fs::rename(&staging, &final_dir).map_err(|e| {
        let _ = fs::remove_dir_all(&staging);
        format!("落盘失败: {e}")
    })?;
    let pkg = package::read_manifest(&final_dir).map_err(|e| {
        let _ = fs::remove_dir_all(&final_dir);
        e
    })?;
    let _ = package::scan_packages(&app, &state);
    Ok(pkg)
}

// ------------------------------------------------------------------ 命令④：store_list_available

/// 本地已装集合 vs manifest 差集（标注 installed / update_available）
#[tauri::command]
pub async fn store_list_available(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<StoreList, String> {
    let m = manifest_inner(&app).await?;
    let local = installed_map(&state);
    let packages: Vec<StoreItem> = m
        .packages
        .into_iter()
        .map(|rp| {
            let installed_version = local.get(&rp.package_id).map(|p| p.package_version.clone());
            let installed = installed_version.is_some();
            let update_available = installed_version
                .as_ref()
                .map(|iv| version_lt(iv, &rp.package_version))
                .unwrap_or(false);
            StoreItem {
                package_id: rp.package_id,
                package_version: rp.package_version,
                name: rp.name,
                package_type: rp.package_type,
                required_license_level: rp.required_license_level,
                min_shell_version: rp.min_shell_version,
                size_bytes: rp.size_bytes,
                checksum: rp.checksum,
                installed,
                installed_version,
                update_available,
            }
        })
        .collect();
    Ok(StoreList {
        updated_at: m.updated_at,
        packages,
    })
}

// ------------------------------------------------------------------ 最小 zip 读取（零 zip 库）

/// 中央目录条目
struct ZipEntryInfo {
    name: String,
    method: u16,
    csize: usize,
    usize_un: usize,
    local_off: usize,
    encrypted: bool,
}

fn le16(b: &[u8]) -> u16 {
    u16::from_le_bytes([b[0], b[1]])
}

fn le32(b: &[u8]) -> u32 {
    u32::from_le_bytes([b[0], b[1], b[2], b[3]])
}

/// 定位 End Of Central Directory（EOCD，签名 PK\x05\x06）
fn eocd_offset(buf: &[u8]) -> Result<usize, String> {
    let n = buf.len();
    if n < 22 {
        return Err("zip 文件过小".into());
    }
    let max_scan = (n - 22).min(65535);
    for i in 0..=max_scan {
        let pos = n - 22 - i;
        if buf[pos..pos + 4] == [0x50, 0x4b, 0x05, 0x06] {
            return Ok(pos);
        }
    }
    Err("未找到 zip 结束目录（EOCD）".into())
}

/// 解析中央目录条目列表
fn parse_cd(buf: &[u8]) -> Result<Vec<ZipEntryInfo>, String> {
    let eocd = eocd_offset(buf)?;
    if eocd + 22 > buf.len() {
        return Err("EOCD 越界".into());
    }
    let cd_off = le32(&buf[eocd + 16..]) as usize;
    let cd_size = le32(&buf[eocd + 20..]) as usize;
    if cd_off.checked_add(cd_size).map(|x| x > buf.len()).unwrap_or(true) {
        return Err("zip 中央目录越界".into());
    }
    let mut out = Vec::new();
    let mut pos = cd_off;
    let end = cd_off + cd_size;
    while pos + 46 <= end {
        if buf[pos..pos + 4] != [0x50, 0x4b, 0x01, 0x02] {
            break;
        }
        let flag = le16(&buf[pos + 8..]);
        let method = le16(&buf[pos + 10..]);
        let csize = le32(&buf[pos + 20..]) as usize;
        let usize_un = le32(&buf[pos + 24..]) as usize;
        let nlen = le16(&buf[pos + 28..]) as usize;
        let elen = le16(&buf[pos + 30..]) as usize;
        let clen = le16(&buf[pos + 32..]) as usize;
        let local_off = le32(&buf[pos + 42..]) as usize;
        if pos + 46 + nlen + elen + clen > end {
            break;
        }
        let name = String::from_utf8_lossy(&buf[pos + 46..pos + 46 + nlen]).into_owned();
        out.push(ZipEntryInfo {
            name,
            method,
            csize,
            usize_un,
            local_off,
            encrypted: flag & 0x1 != 0,
        });
        pos += 46 + nlen + elen + clen;
    }
    if out.is_empty() {
        return Err("zip 中央目录为空".into());
    }
    Ok(out)
}

/// 按名读取单个 zip 条目内容
fn zip_entry_bytes(buf: &[u8], want: &str) -> Result<Vec<u8>, String> {
    let entries = parse_cd(buf)?;
    let e = entries
        .iter()
        .find(|x| x.name == want)
        .ok_or_else(|| format!("zip 内缺少 {want}"))?;
    entry_data(buf, e)
}

/// 读本地头并解压单条目
fn entry_data(buf: &[u8], e: &ZipEntryInfo) -> Result<Vec<u8>, String> {
    if e.encrypted {
        return Err(format!("zip 条目已加密（zip 级加密暂不支持）: {}", e.name));
    }
    if e.local_off + 30 > buf.len() {
        return Err(format!("zip 条目本地头越界: {}", e.name));
    }
    if buf[e.local_off..e.local_off + 4] != [0x50, 0x4b, 0x03, 0x04] {
        return Err(format!("zip 条目本地头签名缺失: {}", e.name));
    }
    let l_nlen = le16(&buf[e.local_off + 26..]) as usize;
    let l_elen = le16(&buf[e.local_off + 28..]) as usize;
    let data_off = e.local_off + 30 + l_nlen + l_elen;
    if data_off + e.csize > buf.len() {
        return Err(format!("zip 条目数据区越界: {}", e.name));
    }
    let raw = &buf[data_off..data_off + e.csize];
    match e.method {
        0 => Ok(raw.to_vec()),
        8 => inflate_raw(raw, e.usize_un),
        m => Err(format!("不支持的压缩方法: {m}（条目 {}）", e.name)),
    }
}

/// 解压全部条目到目标目录（跳过目录项；路径越界拒绝）
fn extract_zip(buf: &[u8], dest: &Path) -> Result<(), String> {
    let entries = parse_cd(buf)?;
    fs::create_dir_all(dest).map_err(|e| format!("创建目录失败: {e}"))?;
    for e in &entries {
        if e.name.ends_with('/') || e.name.is_empty() {
            continue;
        }
        let rel = safe_rel_path(&e.name)?;
        let data = entry_data(buf, e)?;
        let out_path = dest.join(&rel);
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent).map_err(|err| format!("创建目录失败: {err}"))?;
        }
        fs::write(&out_path, &data).map_err(|err| format!("写入文件失败: {err}"))?;
    }
    Ok(())
}

/// 条目相对路径安全性：拒绝绝对路径/盘符/`..` 越界
fn safe_rel_path(name: &str) -> Result<String, String> {
    let norm = name.replace('\\', "/");
    if norm.starts_with('/') || norm.contains(':') {
        return Err(format!("zip 条目含绝对路径/盘符: {name}"));
    }
    for seg in norm.split('/') {
        if seg == ".." {
            return Err(format!("zip 条目含 `..` 越界: {name}"));
        }
    }
    Ok(norm)
}

/// raw DEFLATE 解压（zip 标准无 zlib 头；flate2 Decompress::new(false)）
fn inflate_raw(data: &[u8], hint: usize) -> Result<Vec<u8>, String> {
    const MAX_OUT: usize = 2 * 1024 * 1024 * 1024; // 单条目解压上限 2GiB（防 zip 炸弹）
    let mut d = Decompress::new(false);
    let mut out: Vec<u8> = Vec::with_capacity(hint.min(MAX_OUT).max(1024));
    let mut in_pos = 0;
    loop {
        let before = d.total_in() as usize;
        let r = d
            .decompress(&data[in_pos..], &mut out, FlushDecompress::Finish)
            .map_err(|e| format!("deflate 解压失败: {e}"))?;
        in_pos += d.total_in() as usize - before;
        if out.len() > MAX_OUT {
            return Err("解压体积超限".into());
        }
        match r {
            Status::StreamEnd => return Ok(out),
            Status::Ok => {
                if in_pos >= data.len() {
                    return Err("zip 数据不完整（deflate 流未结束）".into());
                }
                out.reserve(64 * 1024);
            }
            Status::BufError => out.reserve(64 * 1024),
        }
    }
}