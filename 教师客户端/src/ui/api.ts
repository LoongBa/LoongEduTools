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

// ---- P2 内容商店（store.rs · A01 §4）----

export interface RemotePkg {
  package_id: string;
  package_version: string;
  name: string;
  package_type: string;
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
  required_license_level: number;
  min_shell_version: string;
  size_bytes: number | null;
  checksum: string | null;
  installed: boolean;
  installed_version: string | null;
  update_available: boolean;
}

export interface StoreList {
  updated_at: string;
  packages: StoreItem[];
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

  testWebview2: () => invoke<string | null>("test_webview2"),

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

  // ---- P2 内容商店（store.rs · A01 §4 / S01 §2.4）----
  storeManifest: () => invoke<StoreManifest>("store_manifest"),
  storeDownload: (packageId: string, version: string) =>
    invoke<InstalledPackage>("store_download", { packageId, version }),
  storeImportUsb: (zipPath: string) =>
    invoke<InstalledPackage>("store_import_usb", { zipPath }),
  storeListAvailable: () => invoke<StoreList>("store_list_available"),

  // ---- P3 抽卡/分组（roster.rs · D05 §2.4.1/§2.4.2）----
  rosterSave: (rosterJson: string) => invoke<void>("roster_save", { rosterJson }),
  rosterLoad: () => invoke<string | null>("roster_load"),

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
