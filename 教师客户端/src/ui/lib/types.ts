// ── 视图枚举（启动中心合并 apps/toolbox 后的导航结构）──
export type View =
  | "launchpad"
  | "quickstart"
  | "download-ext"
  | "lottery"
  | "board"
  | "checkin"
  | "reflection"
  | "timer"
  | "discipline"
  | "spec-doc"
  | "profile"
  | "settings";

export interface NavChild {
  view: View;
  label: string;
}

export interface NavGroup {
  id: string;
  label: string;
  /** 顶级直排组：无组头、不可折叠，条目直接排在菜单最前 */
  topLevel?: boolean;
  children: NavChild[];
}

/** 侧栏/工具箱分组折叠态：true = 收起（组件从 @/lib/types import） */
export type CollapseMap = Record<string, boolean>;

// ── 下载中心：内容包（对齐 S01/A01 字段语义）──
export interface RemotePkg {
  id: string;
  name: string;
  version: string;
  package_type: "app" | "data";
  size_bytes: number;
  download_url: string;
  checksum: string;
  updated_at: string;
  /** S01 预留字段，非破坏性启用；含 "工具" → 下载中心工具区 */
  categories?: string[];
  description?: string;
}

// ── 原版教材：本机目录导入项（不提供云端下载，由浏览器扩展抓取后导入）──
export interface LocalTextbook {
  id: string;
  name: string;
  /** 展示用学科标签（英语/语文/数学…） */
  subject: string;
  /** 本机目录相对路径，如 textbooks/pep-eng-g3x */
  dir: string;
  /** 目录内文件数 */
  file_count: number;
  /** 目录总字节数 */
  size_bytes: number;
  /** 主要格式说明，如「PDF ×12 · 图片 ×86」 */
  formats: string;
  /** 纳入随身工具包打包 */
  packed: boolean;
  imported_at: string;
}

export interface StoreItem extends RemotePkg {
  installed: boolean;
  latest_version: string;
  /** 已装版本 < latest_version → 可更新 */
  updatable: boolean;
}

// ── 工具箱清单（启动中心·工具 Tab）──
export interface ToolCategory {
  id: string;
  name: string;
}

export interface ToolboxTool {
  id: string;
  name: string;
  category: string;
  aliases?: string[];
  tags: string[];
  description: string;
  license: string;
  homepage: string;
  download_url: string;
  size_bytes: number;
  checksum: string;
  portable: boolean;
  win7_ok: boolean;
  recommend: boolean;
  entry: string;
}

export interface ToolboxManifest {
  version: string;
  updated_at: string;
  categories: ToolCategory[];
  tools: ToolboxTool[];
}

// ── 本地快捷方式（唯一的本地业务状态）──
export interface ToolShortcut {
  tool_id: string;
  path: string;
  pinned: boolean;
  last_used: string | null;
  source: "download" | "manual";
  /** 来自随身工具包导入、当前清单没有的条目 */
  external_name?: string;
}

export interface ToolboxPackFile {
  kind: "taoli-toolbox-pack";
  exported_at: string;
  shortcuts: ToolShortcut[];
  downloaded_tools: { tool_id: string; name: string; path: string }[];
  /** 随身工具包一并带走的原版教材（本机目录导入项中 packed=true 者） */
  textbooks?: LocalTextbook[];
}

// ── 启动中心：易教工具（自研，内置目录 + 已装 app 包动态并入）──
export interface EduTool {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** 依赖的内容包 id；未安装时按钮上给出提示 */
  requiresPkgId?: string;
  /** 更新数据时由应用提供可选子包（如五年级上诗词包）；缺省直接整包下载 */
  dataOptions?: DataOption[];
}

// ── 启动中心：网址收藏 ──
export interface Bookmark {
  id: string;
  name: string;
  url: string;
}

// ── 启动中心：最近使用（跨易教/外部工具的启动 LRU）──
export interface LaunchRecentItem {
  key: string; // "edu:<id>" | "tool:<toolId>"
  name: string;
  at: string;
}

/** 需求文档正文块：段落 / 无序列表 / 表格（cols + rows）/ 注记条；inline 文本支持 `code` 与 **粗** 标记 */
export type SpecBlock =
  | { t: "p"; text: string }
  | { t: "ul"; items: string[] }
  | { t: "table"; cols: string[]; rows: string[][] }
  | { t: "note"; tone: "warn" | "info" | "ok"; text: string };

/** 章节内的小标题（渲染为 h3，Markdown 导出为 ### ） */
export interface SpecHeading {
  t: "h";
  text: string;
}

export type SpecBlockOrHeading = SpecBlock | SpecHeading;

export interface SpecSection {
  id: string;
  title: string;
  blocks: SpecBlockOrHeading[];
}

// ── 下载进度（内存 + 持久化标记）──
export interface DownloadTask {
  id: string;
  progress: number; // 0-100
  done: boolean;
}

// ── 一键启动配置：任意条目可配置为侧栏菜单项/按钮 ──
// itemId 形如 "view:<View>" | "edu:<id>" | "tool:<toolId>" | "bm:<id>"
export interface LaunchConfig {
  /** 菜单项名，≤4 字 */
  menuLabel?: string;
  iconKind?: "text" | "image";
  /** 文字图标：1~2 字符；缺省取名称首字 */
  iconText?: string;
  /** 图片图标：URL */
  iconImage?: string;
  /** CSS 颜色（oklch/hex）；缺省按 id 散列取色 */
  bgColor?: string;
  fgColor?: string;
  /** 是否加入侧栏（含 rail 图标条）；旧字段，读取时映射为 pinnedMenu */
  showInSidebar?: boolean;
  /** 钉选到侧栏「一键启动」菜单项（≤6 条，少而精） */
  pinnedMenu?: boolean;
  /** 加入启动中心「快捷方式」区（多而全，日常批量直达） */
  pinnedQuick?: boolean;
  /** 钉入的导航分组 id；缺省 "content"（一键启动组）。预留字段，当前仅单组生效 */
  sidebarGroup?: string;
  /** 设为快捷启动的时间戳（组内排序依据） */
  pinnedAt?: number;
  /** 预留：未来浮动轮盘（边缘收缩胶囊/手势呼出）是否收录该项，本期不实现 UI */
  wheel?: boolean;
}

export type LaunchConfigMap = Record<string, LaunchConfig>;

// ── 分组配置（「一键启动」/「课堂工具」组名可改、条目可隐藏）──
export interface GroupOverride {
  label?: string;
  hiddenViews?: View[];
}
export type NavGroupConfig = Record<string, GroupOverride>;

// ── 应用更新数据时的可选子包（如五年级上诗词包）──
export interface DataOption {
  pkgId: string;
  label: string;
}

// ── 通知中心：本地事件流（下载完成/钉选上限/条目失效等）──
export interface Notification {
  id: string;
  kind: "success" | "info" | "warn";
  title: string;
  body?: string;
  /** ISO 时间戳 */
  at: string;
  read: boolean;
}

// ── D11 素材归档：确认卡片 / 待确认队列 / 自动整理规则 ──

/** 归档元数据：确认卡片的分类结果（学科/版本/年级/册次） */
export interface ArchiveMeta {
  subject: string;
  version: string;
  grade: string;
  volume: "上册" | "下册";
}

/** 识别置信度：高=文件名含明确词；中=只匹配局部；低=未命中 */
export type ArchiveConfidence = "high" | "medium" | "low";

/** 待确认下载文件（archive:new 事件入队；持久化 taoli.archive.pending） */
export interface PendingArchive {
  /** 与事件 name 对齐的去重键：downloads/<文件名> */
  id: string;
  /** 文件名（不含路径） */
  name: string;
  /** 完整源路径（P3 归档移动用） */
  path: string;
  size_bytes: number;
  at: string;
  /** 自动识别预填（可编辑，未命中为 null） */
  meta: ArchiveMeta | null;
  confidence: ArchiveConfidence;
  /** pending=待确认 / confirmed=已确认归档 / ignored=已忽略 */
  status: "pending" | "confirmed" | "ignored";
}

/** 自动整理规则（「下次同类自动整理」记忆；持久化 taoli.archive.rules） */
export interface ArchiveRule {
  id: string;
  /** 触发文件名关键词（正则源串；命中即静默归档） */
  pattern: string;
  subject: string;
  version: string;
  grade: string;
  volume: "上册" | "下册";
  created_at: string;
}

// ── 顶栏「下载」面板 / 下载中心任务分区：任务展示所需元信息 ──
export type DownloadKind = "pkg" | "tool";
/** 正在下载 / 等待中的任务条目 */
export interface ActiveDownload {
  id: string;
  name: string;
  kind: DownloadKind;
  /** 排队中（尚未开始跑进度） */
  queued?: boolean;
}
/** 已下载历史条目（持久化，上限 60） */
export interface DownloadHistoryItem {
  id: string;
  name: string;
  kind: DownloadKind;
  at: string;
}
