import { invoke } from "@tauri-apps/api/core";

// ---- 与 src-tauri/src/commands/*.rs 命令契约一一对应 ----

export interface InstalledPackage {
  package_id: string;
  package_type: "app" | "data";
  name: string;
  display_name: string;
  package_version: string;
  icon: string | null;
  is_embedded: boolean;
  root: string;
  content_hash: string;
}

export interface ClassProgress {
  class_id: string;
  class_name: string;
  package_id: string;
  unit: string;
  section: string;
  updated_at: string;
}

// ---- 服务端地址配置（config.rs · 设置页「服务器」组）----

export interface ConfigStatus {
  /** 当前生效的服务端地址（显式 > 编译期默认；空 = P0 离线模式） */
  api_base: string;
  /** 是否为 config.json 显式配置（false = 编译期默认 / 未配置） */
  explicit: boolean;
  /** 编译期默认（打包时注入 LOONGEDU_API_BASE；未注入为空） */
  detected_default: string;
  /** 配置文件绝对路径（exe 同目录 config.json） */
  config_path: string;
}

// ---- 关闭行为（close.rs · 设置页「关闭行为」组 / CloseConfirmDialog）----

/** 点关闭按钮的行为：ask=每次询问（默认）/ quit=直接退出 / tray=最小化到托盘 */
export type CloseBehavior = "ask" | "quit" | "tray";

// ---- P1 认证 / 口令（A01 / auth.rs / license.rs）----

export interface Teacher {
  id: string;
  name: string | null;
  grade: string | null;
  subject: string | null;
  license_level: number;
}

export interface AuthStatus {
  logged_in: boolean;
  state: "anonymous" | "expired" | "ok";
  offline_grace: boolean;
  teacher: Teacher | null;
  expires_at: number | null;
  last_online_at: number | null;
  api_configured: boolean;
  device_id: string;
}

export interface LicenseStatus {
  present: boolean;
  semester: string | null;
  expires_at: string | null;
  license_level: number | null;
  state: "valid" | "expiring_soon" | "expired" | "none";
  days_left: number | null;
  machine_quota: number | null;
  bound_machines: string[] | null;
  machine_fp: string;
}

// ---- P2 下载扩展（store.rs · A01 §4）----

export interface RemotePkg {
  package_id: string;
  package_version: string;
  name: string;
  package_type: string;
  /** 内容/扩展分区标签；服务端旧清单可能缺省（R03 §3.2 方案 A） */
  categories?: string[];
  /** 展示用简介（S01 §2.2 预留字段，v0.3 启用）；旧清单可能缺省 */
  description?: string | null;
  required_license_level: number;
  min_shell_version: string;
  size_bytes: number | null;
  checksum: string | null;
  download_url: string | null;
}

export interface StoreManifest {
  updated_at: string;
  packages: RemotePkg[];
}

export interface StoreItem {
  package_id: string;
  package_version: string;
  name: string;
  package_type: string;
  /** 内容/扩展分区标签（壳端恒有值，旧清单缺省后落空数组） */
  categories: string[];
  /** 展示用简介（S01 §2.2 预留字段，v0.3 启用）；旧清单缺省 null */
  description: string | null;
  required_license_level: number;
  min_shell_version: string;
  size_bytes: number | null;
  checksum: string | null;
  download_url: string | null;
  installed: boolean;
  installed_version: string | null;
  update_available: boolean;
}

export interface StoreList {
  updated_at: string;
  packages: StoreItem[];
}

// ---- v0.3 工具箱清单（toolbox.rs · R03 §4.4 / A01 §4.4）----

export interface ToolboxCategory {
  id: string;
  name: string;
}

export interface ToolboxTool {
  id: string;
  name: string;
  category: string;
  /** 搜索词别名（v0.3 设计源对齐）；旧清单缺省空数组 */
  aliases?: string[];
  tags: string[];
  description: string;
  license: string;
  homepage: string;
  download_url: string;
  /** 未钉定 asset 时为 0（服务端清单语义） */
  size_bytes: number;
  /** 未钉定 asset 时为空串 */
  checksum: string;
  portable: boolean;
  win7_ok: boolean;
  recommend: boolean;
  entry: string;
}

export interface ToolboxManifest {
  version: string;
  updated_at: string;
  categories: ToolboxCategory[];
  tools: ToolboxTool[];
}

/** 本地快捷方式（R03 §4.4② 唯一本地业务状态） */
export interface ToolboxShortcut {
  tool_id: string;
  /** 相对数据目录（download）或绝对路径（manual） */
  path: string;
  /** → 我的工具视图 */
  pinned: boolean;
  /** → 最近使用视图（ISO 时间戳，空 = 未用过） */
  last_used: string;
  /** "download"（按清单下载）| "manual"（手动添加） */
  source: "download" | "manual";
  /** 随身工具包导入但当前清单已无该工具时的展示名（v0.3 设计源对齐） */
  external_name?: string | null;
}

export interface ToolboxDb {
  shortcuts: ToolboxShortcut[];
}

// ---- v0.3 教材目录扫描结果（textbook.rs · 设计源 §3.4 口径）----

export interface ScannedPdf {
  /** 相对所选目录的路径（/ 分隔） */
  path: string;
  name: string;
  size_bytes: number;
  pdf_version: string | null;
  title: string | null;
  valid: boolean;
}

export interface TextbookScanResult {
  dir_name: string;
  total_files: number;
  image_count: number;
  pdfs: ScannedPdf[];
  invalid_count: number;
  total_bytes: number;
  truncated: boolean;
}

// ---- D11 素材归档（archive.rs · P3 归档移动）----

export interface ArchiveMeta {
  subject: string;
  version: string;
  grade: string;
  volume: string;
}

export interface ArchiveEntry {
  id: string;
  name: string;
  source_path: string;
  subject: string;
  version: string;
  grade: string;
  volume: string;
  size_bytes: number;
  at: string;
  /** 相对 archives/ 的路径（/ 分隔），打包索引用 */
  rel: string;
}

// ---- P3 抽卡/分组（roster.rs · D05 §2.4.1/§2.4.2）----

export interface RosterStudent {
  name: string;
  /** "strong" | "weak" | null（不强求必填） */
  tag: "strong" | "weak" | null;
}

export interface RosterData {
  /** 创建时间，仅展示用（ISO 或秒级时间戳字符串） */
  created_at: string;
  students: RosterStudent[];
  /** 分组结果本地留存（供纪律积分联动，D05 §2.4.2/§2.4.3） */
  groups: string[][];
}

export const api = {
  listInstalled: () => invoke<InstalledPackage[]>("list_installed"),
  load: (packageId: string) => invoke<string>("load", { packageId }),
  unload: () => invoke<void>("unload"),

  recentsList: () => invoke<ClassProgress[]>("recents_list"),
  recentsGet: (classId: string) =>
    invoke<ClassProgress | null>("recents_get", { classId }),
  recentsSet: (p: {
    classId: string;
    className: string;
    packageId: string;
    unit: string;
    section: string;
  }) => invoke<void>("recents_set", p),

  toggleFullscreen: (window: string) =>
    invoke<boolean>("toggle_fullscreen", { window }),
  exitFullscreen: (window: string) => invoke<void>("exit_fullscreen", { window }),

  // ---- D08 M3 计时器浮层呼出/收起（tool_timer · 全局快捷键 Alt+T 的壳内降级入口）----
  toolTimer: () => invoke<boolean>("tool_timer"),

  // ---- v0.2 内容包空态三段流程（先探服务器可达 → 分支提示/打开页面/打开运行目录）----
  serverPing: () => invoke<string>("server_ping"),
  openRunDir: () => invoke<void>("open_run_dir"),
  openServerPage: (url: string) => invoke<void>("open_server_page", { url }),

  // ---- 设置页 · 服务端地址（config.json api_base 读改写，保留未知字段；写入即生效）----
  configGet: () => invoke<ConfigStatus>("config_get"),
  configSetApiBase: (apiBase: string) =>
    invoke<ConfigStatus>("config_set_api_base", { apiBase }),

  // ---- 关闭行为（ask/quit/tray · 需求3/4；appQuit=exit(0) 保证 hidden 窗口不残留进程）----
  closeBehaviorGet: () => invoke<CloseBehavior>("close_behavior_get"),
  closeBehaviorSet: (behavior: CloseBehavior) =>
    invoke<void>("close_behavior_set", { behavior }),
  appQuit: () => invoke<void>("app_quit"),
  minToTray: () => invoke<void>("min_to_tray"),

  testWebview2: () => invoke<string | null>("test_webview2"),

  // ---- 应用版本（单一真源 = Cargo.toml；替代前端硬编码 v0.3.0-demo）----
  appVersion: () => invoke<string>("get_app_version"),

  // ---- P1 auth ----
  authStatus: () => invoke<AuthStatus>("auth_status"),
  authSmsSend: (phone: string) =>
    invoke<{ retry_in: number }>("auth_sms_send", { phone }),
  authSmsVerify: (phone: string, code: string) =>
    invoke<AuthStatus>("auth_sms_verify", { phone, code }),
  authLoginPassword: (phone: string, password: string) =>
    invoke<AuthStatus>("auth_login_password", { phone, password }),
  authLogout: () => invoke<void>("auth_logout"),
  authRefresh: () => invoke<AuthStatus>("auth_refresh"),
  authProfile: (grade: string, subject: string, agreeTerms: boolean) =>
    invoke<unknown>("auth_profile", { grade, subject, agreeTerms }),
  authActivate: (licenseKey: string) =>
    invoke<{ ok: boolean; license_level: number; machine_quota: number }>(
      "auth_activate",
      { licenseKey },
    ),

  // ---- P1 license ----
  licenseStatus: () => invoke<LicenseStatus>("license_status"),
  licenseRenew: (semester?: string) =>
    invoke<LicenseStatus>("license_renew", { semester: semester ?? null }),
  licenseBindCurrent: () => invoke<unknown>("license_bind_current"),

  // ---- P2 下载扩展（store.rs · A01 §4 / S01 §2.4）----
  storeManifest: () => invoke<StoreManifest>("store_manifest"),
  storeDownload: (packageId: string, version: string) =>
    invoke<InstalledPackage>("store_download", { packageId, version }),
  storeImportUsb: (zipPath: string) =>
    invoke<InstalledPackage>("store_import_usb", { zipPath }),
  storeListAvailable: () => invoke<StoreList>("store_list_available"),

  // ---- v0.3 工具箱（toolbox.rs · R03 §4.4）----
  toolboxManifest: () => invoke<ToolboxManifest>("toolbox_manifest"),
  toolboxList: () => invoke<ToolboxDb>("toolbox_list"),
  toolboxSetPinned: (toolId: string, pinned: boolean) =>
    invoke<ToolboxDb>("toolbox_set_pinned", { toolId, pinned }),
  toolboxAddManual: (path: string) =>
    invoke<ToolboxDb>("toolbox_add_manual", { path }),
  toolboxDownload: (toolId: string) =>
    invoke<ToolboxDb>("toolbox_download", { toolId }),
  toolboxLaunch: (toolId: string) =>
    invoke<ToolboxDb>("toolbox_launch", { toolId }),

  // ---- P3 抽卡/分组（roster.rs · D05 §2.4.1/§2.4.2）----
  rosterSave: (rosterJson: string) => invoke<void>("roster_save", { rosterJson }),
  rosterLoad: () => invoke<string | null>("roster_load"),

  // ---- v0.3 教材目录扫描（textbook.rs · 设计源 §3.4，字段对齐 pdf-scan.ts）----
  textbookScan: (dirPath: string) =>
    invoke<TextbookScanResult>("textbook_scan", { dirPath }),
  /** 教材单文件导入：识别单个 PDF（魔数/版本/Title）→ 1 文件 = 1 本教材 */
  textbookSniff: (filePath: string) =>
    invoke<ScannedPdf>("textbook_sniff", { filePath }),

  // ---- D11 素材归档（archive.rs · P3 归档移动 / P5 打包索引导出）----
  archiveWatchDir: (dir: string | null) =>
    invoke<unknown>("archive_watch_dir", { dir }),
  /** 设置监控格式白名单（小写扩展名列表；空 = 不监控任何格式） */
  archiveWatchExtensions: (extensions: string[]) =>
    invoke<unknown>("archive_watch_extensions", { extensions }),
  archiveStatus: () => invoke<{
    config: { dir: string | null; poll_ms: number; extensions: string[] };
    effective_dir: string;
    detected_default: string;
    running: boolean;
  }>("archive_status"),
  archiveConfirm: (path: string, meta: ArchiveMeta) =>
    invoke<ArchiveEntry>("archive_confirm", { path, meta }),
  archiveUndo: (entryId: string) =>
    invoke<ArchiveEntry>("archive_undo", { entryId }),
  archiveList: () => invoke<ArchiveEntry[]>("archive_list"),
  archivePackIndex: () => invoke<{ entries: ArchiveEntry[]; exported_at: string }>(
    "archive_pack_index",
  ),

  // ---- P3 白名单上报（report.rs · A01 §5.1 · 零儿童数据）----
  reportProgress: (payload: {
    package_id: string;
    unit: string;
    section: string;
    detail: string;
    ts: number;
  }) => invoke<void>("report_progress", { payload }),
  reportFlush: () => invoke<void>("report_flush"),
};
