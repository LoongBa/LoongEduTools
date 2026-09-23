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
  exitFullscreen: (window: string) =>
    invoke<void>("exit_fullscreen", { window }),

  testWebview2: () => invoke<string | null>("test_webview2"),
};
