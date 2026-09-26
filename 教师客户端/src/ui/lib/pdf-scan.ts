// 原版教材·本机目录真实扫描：File System Access API 遍历目录 + PDF 头部魔数校验与 /Title 简单识别
// 说明：仅读取每个 PDF 的前若干字节（不解密、不解析对象流），用于「是不是真 PDF / 版本号 / 书名」级别的粗识别。

export interface ScannedPdf {
  /** 相对所选目录的路径 */
  path: string;
  /** 文件名 */
  name: string;
  size_bytes: number;
  /** 如 "1.7"；无法识别为 null */
  pdf_version: string | null;
  /** 从 /Title 提取的书名（可能没有） */
  title: string | null;
  /** 文件头是否为 %PDF-（伪 PDF 会被标 false 并跳过） */
  valid: boolean;
}

export interface ScanResult {
  dirName: string;
  total_files: number;
  image_count: number;
  pdfs: ScannedPdf[];
  invalid_count: number;
  total_bytes: number;
  /** 超过上限被截断 */
  truncated: boolean;
}

const IMAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "heic"];
/** 只读文件头，避免整本大文件进内存 */
const HEAD_BYTES = 24 * 1024;
const MAX_DEPTH = 3;
const MAX_FILES = 800;

/** 逐字节转 latin1，保证字符偏移 == 字节偏移 */
function latin1(buf: Uint8Array): string {
  let s = "";
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return s;
}

/** 从 PDF 头部字节里粗取 /Title：支持 (字符串) 与 <UTF-16BE hex> 两种写法 */
function extractTitle(text: string): string | null {
  const m = /\/Title\s*(\((?:[^()\\]|\\.)*\)|<[0-9A-Fa-f]+>)/.exec(text);
  if (!m) return null;
  const raw = m[1];
  try {
    if (raw.startsWith("<")) {
      const hex = raw.slice(1, -1).replace(/[^0-9A-Fa-f]/g, "");
      const codes: number[] = [];
      for (let i = 0; i + 3 < hex.length + 1 && i + 4 <= hex.length; i += 4) {
        codes.push(parseInt(hex.slice(i, i + 4), 16));
      }
      const s = String.fromCharCode(...codes).replace(/^/, "").trim();
      return s || null;
    }
    const body = raw.slice(1, -1).replace(/\\([()\\])/g, "$1");
    // PDF 文档信息里的中文常见为 UTF-16BE（FEFF 开头）
    if (/^FEFF/i.test(latin1(new Uint8Array(body.charCodeAt(0))) + "") === false && body.charCodeAt(0) === 0xfeff) {
      return body.slice(1).trim() || null;
    }
    return body.trim() || null;
  } catch {
    return null;
  }
}

type FileEntry = { rel: string; handle: FileSystemFileHandle };

async function walk(dir: FileSystemDirectoryHandle, prefix: string, depth: number, out: FileEntry[]): Promise<boolean> {
  if (out.length >= MAX_FILES) return false;
  // values() 未收录于当前 lib.dom 类型定义，运行时由 File System Access API 提供
  const iter = (dir as unknown as { values(): AsyncIterable<FileSystemHandle> }).values();
  for await (const entry of iter) {
    if (out.length >= MAX_FILES) return false;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === "file") {
      out.push({ rel, handle: entry as FileSystemFileHandle });
    } else if (depth < MAX_DEPTH) {
      const stop = await walk(entry as FileSystemDirectoryHandle, rel, depth + 1, out);
      if (stop) return true;
    }
  }
  return false;
}

/** 读文件头做魔数校验 + 版本/标题识别 */
async function sniffPdf(rel: string, handle: FileSystemFileHandle): Promise<ScannedPdf> {
  const file = await handle.getFile();
  const base = { path: rel, name: file.name, size_bytes: file.size };
  try {
    const slice = await file.slice(0, HEAD_BYTES).arrayBuffer();
    const bytes = new Uint8Array(slice);
    const head = latin1(bytes);
    if (head.indexOf("%PDF-") !== 0) return { ...base, pdf_version: null, title: null, valid: false };
    const vm = /%PDF-(\d+\.\d+)/.exec(head.slice(0, 16));
    return { ...base, pdf_version: vm ? vm[1] : null, title: extractTitle(head), valid: true };
  } catch {
    return { ...base, pdf_version: null, title: null, valid: false };
  }
}

/**
 * 选择目录并真实扫描。
 * 返回 ok:false 时 canceled=true 表示用户取消（调用方应静默处理）。
 */
export async function scanTextbookDirectory(
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: true; result: ScanResult } | { ok: false; canceled?: boolean; reason?: string }> {
  const w = window as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> };
  if (typeof w.showDirectoryPicker !== "function") {
    return {
      ok: false,
      reason: "当前浏览器不支持本地目录访问，请使用 Chrome 或 Edge（桌面版）。",
    };
  }
  let root: FileSystemDirectoryHandle;
  try {
    root = await w.showDirectoryPicker();
  } catch {
    return { ok: false, canceled: true };
  }

  const files: FileEntry[] = [];
  let truncated = false;
  try {
    truncated = await walk(root, "", 0, files);
  } catch {
    return { ok: false, reason: "读取目录失败：可能缺少读取权限，请在弹窗中重新授权。" };
  }

  let image_count = 0;
  let total_bytes = 0;
  const pdfs: ScannedPdf[] = [];
  let done = 0;
  for (const f of files) {
    const ext = f.rel.split(".").pop()?.toLowerCase() ?? "";
    const isPdf = ext === "pdf";
    const isImg = IMAGE_EXT.includes(ext);
    if (!isPdf && !isImg) {
      done++;
      continue;
    }
    if (isImg) {
      try {
        const file = await f.handle.getFile();
        image_count++;
        total_bytes += file.size;
      } catch {
        /* 单个文件不可读则跳过 */
      }
    } else {
      const info = await sniffPdf(f.rel, f.handle);
      if (info.valid) total_bytes += info.size_bytes;
      pdfs.push(info);
    }
    done++;
    onProgress?.(done, files.length);
  }

  const invalid_count = pdfs.filter((p) => !p.valid).length;
  return {
    ok: true,
    result: {
      dirName: root.name,
      total_files: files.length,
      image_count,
      pdfs,
      invalid_count,
      total_bytes,
      truncated,
    },
  };
}

/** 依据目录名与识别出的标题猜学科标签 */
export function guessSubject(dirName: string, titles: string[]): string {
  const hay = `${dirName} ${titles.join(" ")}`.toLowerCase();
  if (/(eng|english|pep-eng|oxford|phonics|raz|英语|绘本)/.test(hay)) return "英语";
  if (/(yuwen|chinese|语文|统编|古诗|诗词|识字)/.test(hay)) return "语文";
  if (/(math|数学|口算|计算)/.test(hay)) return "数学";
  if (/(sci|science|科学|实验)/.test(hay)) return "科学";
  return "综合";
}
