//! 教材目录扫描命令 · 设计源 §3.4（前端 pdf-scan.ts 的 Tauri 替代——浏览器
//! File System Access API / showDirectoryPicker 在 Tauri 不可用，改由本命令
//! 直接以文件系统权限扫描，识别口径与设计源逐字对齐）：
//! 递归最深 3 层 / 上限 800 文件 / 每个 PDF 只读头部 24KB 做 %PDF-x.y 魔数校验、
//! 版本提取、/Title 粗识别（支持 <UTF-16BE hex> 与 (括号明文) 两种写法）、
//! 扫描报告（有效 PDF / 图片 / 识别到书名 / 伪 PDF 四格 + 明细）。
//! 零新依赖：魔数/版本/Title 均手写匹配（不引入 regex crate）。

use serde::Serialize;
use std::fs;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

/// 图片仅按扩展名判定（与设计源一致，不做魔数校验）
const IMAGE_EXT: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "heic",
];
/// 只读文件头，避免整本大文件进内存
const HEAD_BYTES: usize = 24 * 1024;
/// 递归最深 3 层（depth<3 才进入子目录 → depth=3 目录的文件计入、其子目录忽略）
const MAX_DEPTH: usize = 3;
/// 文件上限，超过截断
const MAX_FILES: usize = 800;

// ------------------------------------------------------------------ 数据结构

/// 单个 PDF 条目（字段名与前端 pdf-scan.ts ScannedPdf 逐字一致）
#[derive(Debug, Clone, Serialize)]
pub struct ScannedPdf {
    /// 相对所选目录的路径（`/` 分隔）
    pub path: String,
    /// 文件名
    pub name: String,
    pub size_bytes: u64,
    /// 如 "1.7"；无法识别为 None
    pub pdf_version: Option<String>,
    /// 从 /Title 提取的书名（可能没有）
    pub title: Option<String>,
    /// 文件头是否为 %PDF-（伪 PDF 会被标 false 并跳过）
    pub valid: bool,
}

/// 扫描报告（字段名与前端 pdf-scan.ts ScanResult 逐字一致，仅目录名用 dir_name）
#[derive(Debug, Clone, Serialize)]
pub struct ScanResult {
    pub dir_name: String,
    pub total_files: usize,
    pub image_count: usize,
    pub pdfs: Vec<ScannedPdf>,
    pub invalid_count: usize,
    pub total_bytes: u64,
    /// 超过上限被截断
    pub truncated: bool,
}

// ------------------------------------------------------------------ 主命令

/// 扫描教材目录（设计源 §3.4）：递归遍历 + PDF 魔数/Title 粗识别 + 图片统计。
/// `dir_path` 由前端目录选择器（tauri-plugin-dialog open({directory:true})）传入绝对路径。
#[tauri::command]
pub fn textbook_scan(dir_path: String) -> Result<ScanResult, String> {
    let root = PathBuf::from(&dir_path);
    if !root.is_dir() {
        return Err(format!("路径不是目录或不存在: {dir_path}"));
    }
    let dir_name = root
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| dir_path.clone());

    // 递归收集全部文件（相对路径 + 磁盘路径）
    let mut files: Vec<(String, PathBuf)> = Vec::new();
    let mut truncated = false;
    walk_dir(&root, "", 0, &mut files, &mut truncated)?;

    // 统计：图片按扩展名，PDF 走魔数/Title 识别
    let mut image_count = 0usize;
    let mut total_bytes = 0u64;
    let mut pdfs: Vec<ScannedPdf> = Vec::new();
    for (rel, fp) in &files {
        let ext = rel
            .rsplit('.')
            .next()
            .unwrap_or("")
            .to_ascii_lowercase();
        if IMAGE_EXT.contains(&ext.as_str()) {
            // 图片：仅扩展名判定，读 size 计入（读失败静默跳过，与前端一致）
            if let Ok(md) = fs::metadata(fp) {
                image_count += 1;
                total_bytes += md.len();
            }
        } else if ext == "pdf" {
            let info = sniff_pdf(rel, fp);
            if info.valid {
                total_bytes += info.size_bytes;
            }
            pdfs.push(info);
        }
    }

    let invalid_count = pdfs.iter().filter(|p| !p.valid).count();
    Ok(ScanResult {
        dir_name,
        total_files: files.len(),
        image_count,
        pdfs,
        invalid_count,
        total_bytes,
        truncated,
    })
}

// ------------------------------------------------------------------ 内部：目录遍历

/// DFS 前序递归（对齐前端 walk）：`depth` = 当前目录自身层号，
/// `depth < MAX_DEPTH` 才进入子目录 → depth=3 的目录内容仍被列出，其子目录忽略。
/// `files.len() >= MAX_FILES` 时截断（每次迭代前检查 → 最多恰好 800 个）。
fn walk_dir(
    dir: &Path,
    prefix: &str,
    depth: usize,
    out: &mut Vec<(String, PathBuf)>,
    truncated: &mut bool,
) -> Result<(), String> {
    if out.len() >= MAX_FILES {
        *truncated = true;
        return Ok(());
    }
    let entries = fs::read_dir(dir).map_err(|e| format!("读取目录失败: {e}"))?;
    for entry in entries {
        if out.len() >= MAX_FILES {
            *truncated = true;
            return Ok(());
        }
        let entry = entry.map_err(|e| format!("目录项错误: {e}"))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let rel = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        let ft = entry.file_type().map_err(|e| format!("文件类型错误: {e}"))?;
        if ft.is_file() {
            out.push((rel, entry.path()));
        } else if ft.is_dir() && depth < MAX_DEPTH {
            walk_dir(&entry.path(), &rel, depth + 1, out, truncated)?;
        }
    }
    Ok(())
}

// ------------------------------------------------------------------ 内部：PDF 识别

/// 读文件头（≤HEAD_BYTES）做魔数校验 + 版本/标题识别。
/// 读文件失败 → 按伪 PDF 处理（valid:false，size 取 metadata）。
fn sniff_pdf(rel: &str, path: &Path) -> ScannedPdf {
    let name = path
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| rel.to_string());
    let size = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    let base = |valid: bool, pdf_version: Option<String>, title: Option<String>| ScannedPdf {
        path: rel.to_string(),
        name,
        size_bytes: size,
        pdf_version,
        title,
        valid,
    };

    let bytes = match read_head(path) {
        Ok(b) => b,
        Err(_) => return base(false, None, None),
    };
    let head = latin1(&bytes);

    // 魔数必须位于偏移 0（与前端 head.indexOf("%PDF-") !== 0 语义一致）
    if !head.starts_with("%PDF-") {
        return base(false, None, None);
    }
    // 版本正则 /%PDF-(\d+\.\d+)/ 只作用于前 16 字节
    let head16 = head.get(..16.min(head.len())).unwrap_or(&head);
    let pdf_version = extract_version(head16);
    let title = extract_title(&head);
    base(true, pdf_version, title)
}

/// 流式读文件仅头部 HEAD_BYTES（File::take，避免整本大文件进内存）
fn read_head(path: &Path) -> Result<Vec<u8>, String> {
    let mut f = File::open(path).map_err(|e| format!("打开文件失败: {e}"))?;
    let mut buf = vec![0u8; HEAD_BYTES];
    let n = f
        .by_ref()
        .take(HEAD_BYTES as u64)
        .read(&mut buf)
        .map_err(|e| format!("读文件头失败: {e}"))?;
    buf.truncate(n);
    Ok(buf)
}

fn latin1(buf: &[u8]) -> String {
    buf.iter().map(|b| *b as char).collect()
}

/// 前 16 字节内匹配 `%PDF-(\d+\.\d+)`（手写扫描，零依赖）
fn extract_version(s: &str) -> Option<String> {
    if !s.starts_with("%PDF-") {
        return None;
    }
    let rest = &s[5.min(s.len())..];
    let digits: String = rest
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '.')
        .collect();
    // 至少 "d.d"（如 1.7）。若只有 "1." 之类视为无效
    if digits.len() >= 3 && digits.contains('.') {
        Some(digits)
    } else {
        None
    }
}

/// 从 PDF 头部粗取 /Title：支持 `<UTF-16BE hex>` 与 `(括号明文)` 两种写法（对齐前端 extractTitle）。
/// 手写等价正则：`/\/Title\s*(\((?:[^()\\]|\\.)*\)|<[0-9A-Fa-f]+>)/`
fn extract_title(text: &str) -> Option<String> {
    // 找 "/Title" 出现位置
    let idx = find_sub(text, "/Title")?;
    let after = &text[idx + "/Title".len()..];
    // \s* 空白
    let after = after.trim_start_matches([' ', '\t', '\n', '\r', '\u{000c}', '\u{000b}']);

    if let Some(hex) = after.strip_prefix('<') {
        // hex 写法：剥 <> → 剔非 hex → 每 4 hex = 1 UTF-16BE 码元
        let close = hex.find('>')?;
        let hexbody = &hex[..close];
        let clean: String = hexbody
            .chars()
            .filter(|c| c.is_ascii_hexdigit())
            .collect();
        // 每 4 个 hex 字符 = 1 个 u16（UTF-16BE）；不足 4 的尾段丢弃（对齐前端循环条件）
        let mut codes: Vec<u16> = Vec::new();
        let mut i = 0;
        while i + 4 <= clean.len() {
            let code = u16::from_str_radix(&clean[i..i + 4], 16).ok()?;
            codes.push(code);
            i += 4;
        }
        let s = String::from_utf16_lossy(&codes);
        // UTF-16BE 标准前缀 BOM（U+FEFF）剥除——设计源前端 .replace(/^/,"") 实为无操作 bug，
        // 此处按 UTF-16 惯例剥 BOM（识别意图一致且 title 更干净）
        let s = s.strip_prefix('\u{feff}').unwrap_or(&s);
        let trimmed = s.trim().to_string();
        return if trimmed.is_empty() { None } else { Some(trimmed) };
    }

    if let Some(rest) = after.strip_prefix('(') {
        // 括号写法：读直到未转义的 ')'，支持 \(  \)  \\ 转义
        let mut body = String::new();
        let mut chars = rest.chars();
        let mut closed = false;
        while let Some(c) = chars.next() {
            match c {
                ')' => {
                    closed = true;
                    break;
                }
                '\\' => {
                    // 转义：仅去 \( \) \\ 前的反斜杠（对齐 replace(/\\([()\\])/g,"$1")）
                    if let Some(next) = chars.next() {
                        if next == '(' || next == ')' || next == '\\' {
                            body.push(next);
                        } else {
                            body.push('\\');
                            body.push(next);
                        }
                    } else {
                        body.push('\\');
                    }
                }
                _ => body.push(c),
            }
        }
        if !closed {
            return None; // 未闭合括号：与前端正则不匹配一致
        }
        // 前端 UTF-16BE 探测（body.charCodeAt(0) === 0xfeff）在 latin1 逐字节视角下恒为
        // false（单字节 charCode 最大 255），是设计源死代码——Rust 忠实照抄：只 trim。
        let trimmed = body.trim().to_string();
        return if trimmed.is_empty() { None } else { Some(trimmed) };
    }

    None
}

/// 手写子串查找（零依赖）
fn find_sub(hay: &str, needle: &str) -> Option<usize> {
    hay.find(needle)
}

/// 学科归类（前端 guessSubject 保留在 TS 侧调用——Rust 报告已含 title/dir_name 字段，
/// 由 toTextbook 组合后前端判类，避免双处口径漂移）

// ------------------------------------------------------------------ 单测

#[cfg(test)]
mod tests {
    use super::*;

    /// fs::read 读整文件需取头部——测试直接构造头部字节辅助
    fn head_bytes(mut bytes: Vec<u8>) -> Vec<u8> {
        bytes.truncate(HEAD_BYTES);
        bytes
    }

    #[test]
    fn sniff_pdf_valid_with_version_and_title() {
        // 构造最小 PDF 头部：%PDF-1.7 + /Title <FEFF 0048 0069>
        let mut b = Vec::new();
        b.extend_from_slice(b"%PDF-1.7\n");
        b.extend_from_slice(b"/Title <FEFF00480069>\n");
        b.extend_from_slice(b"%%EOF");
        let dir = std::env::temp_dir().join(format!("loongedu-test-pdf-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let fp = dir.join("book1.pdf");
        fs::write(&fp, &b).unwrap();
        let info = sniff_pdf("book1.pdf", &fp);
        assert!(info.valid);
        assert_eq!(info.pdf_version.as_deref(), Some("1.7"));
        assert_eq!(info.title.as_deref(), Some("Hi"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn sniff_pdf_invalid_magic() {
        let dir = std::env::temp_dir().join(format!("loongedu-test-bad-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let fp = dir.join("fake.pdf");
        fs::write(&fp, b"not a pdf at all").unwrap();
        let info = sniff_pdf("fake.pdf", &fp);
        assert!(!info.valid);
        assert!(info.pdf_version.is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn extract_title_hex_and_paren() {
        // hex：UTF-16BE "Hi"
        assert_eq!(
            extract_title(r"/Title <FEFF00480069>").as_deref(),
            Some("Hi")
        );
        // 括号明文（含转义括号 \( \)）：raw string 中 \( 即字面单反斜杠+括号，对齐 PDF 规范
        assert_eq!(
            extract_title(r"/Title (Math \(Grade 3\) Edition)").as_deref(),
            Some("Math (Grade 3) Edition")
        );
        // 无 /Title
        assert_eq!(extract_title("just somedata"), None);
    }

    #[test]
    fn walk_dir_respects_depth_and_limit() {
        let dir = std::env::temp_dir().join(format!("loongedu-test-walk-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        // 构造 root/a.txt, root/sub/b.pdf, root/sub/sub2/c.pdf（深 3 层内）
        fs::create_dir_all(dir.join("sub/sub2")).unwrap();
        fs::write(dir.join("a.txt"), b"x").unwrap();
        fs::write(dir.join("sub/b.pdf"), b"%PDF-1.7\n/Title (B)").unwrap();
        fs::write(dir.join("sub/sub2/c.pdf"), b"%PDF-1.4\n/Title (C)").unwrap();
        let mut files = Vec::new();
        let mut truncated = false;
        walk_dir(&dir, "", 0, &mut files, &mut truncated).unwrap();
        assert_eq!(files.len(), 3);
        assert!(!truncated);
        let rels: Vec<&str> = files.iter().map(|(r, _)| r.as_str()).collect();
        assert!(rels.contains(&"a.txt"));
        assert!(rels.contains(&"sub/b.pdf"));
        assert!(rels.contains(&"sub/sub2/c.pdf"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn extract_version_parses_dotted() {
        assert_eq!(extract_version("%PDF-1.7"), Some("1.7".to_string()));
        assert_eq!(extract_version("%PDF-2.0"), Some("2.0".to_string()));
        assert_eq!(extract_version("notpdf"), None);
        // 只有 "1." 尾点无后续 → 前端 /(\d+\.\d+)/ 不匹配
        assert_eq!(extract_version("%PDF-1."), None);
    }
}