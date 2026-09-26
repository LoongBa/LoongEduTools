import type { Bookmark, LaunchConfigMap, LocalTextbook } from "./types";

/** 浏览器「教材下载」扩展安装页（Edge 加载项）。后续可能更换地址，集中在此处便于维护 */
export const TEXTBOOK_EXT_INSTALL_URL =
  "https://microsoftedge.microsoft.com/addons/detail/%E6%95%99%E6%9D%90%E4%B8%8B%E8%BD%BD/lbphnljhkmklbigppbeopnbncpaedgpk?hl=zh-CN";

// ── 一键启动·内置示例钉选（首次运行种子，用户可在配置弹窗中增删）──
// 「一键开课」即在此配置出来：它出现在侧栏「一键启动」区，点击直达该功能页
export const QUICKSTART_PIN_SEED: LaunchConfigMap = {
  "view:quickstart": { menuLabel: "开课", pinnedMenu: true, pinnedAt: 1 },
};

/** 历史种子曾给 view 类条目写入 iconKind/iconText 导致侧栏出现大色块；一次性清洗，仅影响未改过图标的默认项 */
export const LAUNCH_ICON_SEED_MIGRATION_KEY = "taoli.launch.iconSeedMigrated.v1";
export const LEGACY_SEED_ICON_IDS = ["view:quickstart"] as const;

// ── 个人信息（模拟账号数据）──
export const MOCK_USER = {
  name: "王老师",
  school: "龙爸易教 · 示范合作校",
  subject: "小学英语 / 三年级 2 班",
  licenseUntil: "2027-03-14（本机授权，联网续期）",
  clientVersion: "教师客户端 v0.3.0-demo",
  deviceId: "TAOLI-WIN-7F3A2C",
} as const;


// ── 下载中心·原版教材：本机教材目录导入项基线（模拟 textbooks/ 目录扫描结果）──
// 该分类不提供云端下载：教师用浏览器「教材下载」扩展抓取后，导入到本地目录，随随身工具包一起打包。
export const MOCK_TEXTBOOK_BASELINE: LocalTextbook[] = [
  {
    id: "tbk-pep-eng-g3x",
    name: "人教版英语三年级上册（高清扫描）",
    subject: "英语",
    dir: "textbooks/pep-eng-g3x",
    file_count: 98,
    size_bytes: 156_000_000,
    formats: "PDF ×12 · 图片 ×86",
    packed: true,
    imported_at: "2026-09-15T03:20:00Z",
  },
  {
    id: "tbk-oxford-read-tree",
    name: "牛津阅读树 Level 1-3（原版）",
    subject: "英语",
    dir: "textbooks/oxford-read-tree",
    file_count: 240,
    size_bytes: 402_000_000,
    formats: "PDF ×60 · 图片 ×180",
    packed: false,
    imported_at: "2026-09-18T06:02:00Z",
  },
  {
    id: "tbk-tongbian-yw-g4x",
    name: "统编语文四年级下册（课本）",
    subject: "语文",
    dir: "textbooks/tongbian-yw-g4x",
    file_count: 76,
    size_bytes: 118_000_000,
    formats: "PDF ×8 · 图片 ×68",
    packed: true,
    imported_at: "2026-09-10T01:45:00Z",
  },
];

// ── 启动中心：网址收藏示例基线 ──
export const MOCK_BOOKMARK_BASELINE: Bookmark[] = [
  { id: "bm-smart-edu", name: "国家中小学智慧教育平台", url: "https://basic.smartedu.cn/" },
  { id: "bm-teacher-cert", name: "中国教师资格网", url: "https://www.jszg.edu.cn/" },
  { id: "bm-cnki", name: "知网 · 基础教育教学文献", url: "https://www.cnki.net/" },
];
