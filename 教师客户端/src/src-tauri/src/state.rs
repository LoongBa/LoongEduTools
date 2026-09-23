use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;

/// 单个已安装内容包描述（壳 UI 应用列表渲染用）
#[derive(Debug, Clone, Serialize)]
pub struct InstalledPackage {
    pub package_id: String,
    pub package_type: String, // "app" | "data"
    pub name: String,
    pub display_name: String,
    pub package_version: String,
    pub icon: Option<String>, // data/ 内相对路径
    pub is_embedded: bool,    // true=预装 packages-embedded/；false=磁盘 packages/
    pub root: String,         // 包根目录绝对路径
    pub content_hash: String,
}

/// 每班最近进度（R6 一键开课）
#[derive(Debug, Clone, Serialize, serde::Deserialize, Default)]
pub struct ClassProgress {
    pub class_id: String,
    pub class_name: String,
    pub package_id: String,
    pub unit: String,
    pub section: String,
    pub updated_at: String,
}

/// 应用全局状态
#[derive(Default)]
pub struct AppState {
    /// 已发现内容包索引（启动时扫描填充）
    pub packages: Mutex<Vec<InstalledPackage>>,
    /// 班级最近进度（key = class_id），持久化到 exe 同目录 config.json
    pub recents: Mutex<HashMap<String, ClassProgress>>,
    /// 内容窗口当前加载的临时解密目录（用于 unload 清理）
    pub loaded_temp_dir: Mutex<Option<String>>,
}