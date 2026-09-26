import type { Bookmark, DataOption, EduTool, LaunchConfigMap, LocalTextbook, ToolboxManifest } from "./types";

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

// ── 工具箱：服务端清单（模拟 GET /api/edu/toolbox/manifest，R03 §4.5 首发目录）──
export const MOCK_TOOLBOX_MANIFEST: ToolboxManifest = {
  version: "1.0",
  updated_at: "2026-09-25T00:00:00Z",
  categories: [
    { id: "capture", name: "截屏录屏" },
    { id: "annotate", name: "屏幕标注" },
    { id: "keys", name: "按键显示" },
    { id: "keyboard", name: "虚拟键盘" },
  ],
  tools: [
    {
      id: "snipeasy",
      name: "SnipEasy 截图",
      category: "capture",
      aliases: ["snip easy", "截图", "录屏"],
      tags: ["截图", "标注", "OCR", "录屏"],
      description: "截图 + 标注 + OCR + 录屏一体，备课抓图效率利器。",
      license: "MIT",
      homepage: "https://github.com/",
      download_url: "https://example.invalid/toolbox/snipeasy-win.zip",
      size_bytes: 38_000_000,
      checksum: "sha256:a1…",
      portable: true,
      win7_ok: false,
      recommend: true,
      entry: "SnipEasy.exe",
    },
    {
      id: "winshot",
      name: "WinShot",
      category: "capture",
      aliases: ["win shot", "截屏"],
      tags: ["截图", "键盘驱动", "轻量"],
      description: "约 10MB 便携单文件，键盘驱动的极简截屏与标注。",
      license: "BSD-3",
      homepage: "https://github.com/",
      download_url: "https://example.invalid/toolbox/winshot-win.zip",
      size_bytes: 10_200_000,
      checksum: "sha256:b2…",
      portable: true,
      win7_ok: false,
      recommend: false,
      entry: "WinShot.exe",
    },
    {
      id: "snipaste",
      name: "Snipaste",
      category: "capture",
      aliases: ["snip paste", "贴图"],
      tags: ["截图", "贴图", "标注"],
      description: "截图后可把片段「贴」回屏幕，讲评试卷时对照展示极方便。",
      license: "免费（闭源）",
      homepage: "https://www.snipaste.com/",
      download_url: "https://example.invalid/toolbox/snipaste-win.zip",
      size_bytes: 24_500_000,
      checksum: "sha256:c3…",
      portable: true,
      win7_ok: true,
      recommend: true,
      entry: "Snipaste.exe",
    },
    {
      id: "inkeys",
      name: "智绘教 Inkeys",
      category: "annotate",
      aliases: ["zhihuijiao", "idt", "白板", "画笔"],
      tags: ["屏幕标注", "教学白板", "触控"],
      description: "教学向屏幕标注首选：任意界面上直接书写批注，支持触控笔。",
      license: "GPL-3.0",
      homepage: "https://github.com/Alan-CRL/Inkeys",
      download_url: "https://example.invalid/toolbox/inkeys-win.zip",
      size_bytes: 56_000_000,
      checksum: "sha256:d4…",
      portable: true,
      win7_ok: true,
      recommend: true,
      entry: "Inkeys.exe",
    },
    {
      id: "markeron",
      name: "MarkerOn",
      category: "annotate",
      aliases: ["marker on", "标记"],
      tags: ["透明画布", "快捷键", "标注"],
      description: "全局快捷键唤起的透明画布，11 种画笔工具，仅约 1.5MB。",
      license: "MIT",
      homepage: "https://github.com/",
      download_url: "https://example.invalid/toolbox/markeron-win.zip",
      size_bytes: 1_500_000,
      checksum: "sha256:e5…",
      portable: true,
      win7_ok: true,
      recommend: false,
      entry: "MarkerOn.exe",
    },
    {
      id: "keyviz",
      name: "Keyviz 按键显示",
      category: "keys",
      aliases: ["key viz", "按键", "快捷键显示"],
      tags: ["按键", "快捷键", "演示"],
      description: "实时显示按键/鼠标操作，演示软件操作时学生看得清。有社区汉化版。",
      license: "MIT",
      homepage: "https://github.com/mulaRahul/keyviz",
      download_url: "https://example.invalid/toolbox/keyviz-win.zip",
      size_bytes: 4_800_000,
      checksum: "sha256:f6…",
      portable: true,
      win7_ok: true,
      recommend: true,
      entry: "keyviz.exe",
    },
    {
      id: "osk",
      name: "Windows 屏幕键盘",
      category: "keyboard",
      aliases: ["osk", "screen keyboard", "软键盘"],
      tags: ["系统内置", "零分发"],
      description: "Windows 自带 osk.exe，触屏一体机上给学生上台输入时用，零分发成本。",
      license: "系统内置",
      homepage: "ms-settings:",
      download_url: "",
      size_bytes: 0,
      checksum: "—",
      portable: true,
      win7_ok: true,
      recommend: false,
      entry: "osk.exe",
    },
  ],
};

// ── 启动中心：易教工具内置目录（自研工具；已安装的 app 类内容包会动态并入）──
export const MOCK_EDU_TOOLS: EduTool[] = [
  {
    id: "edu-eng-read",
    name: "英语点读",
    icon: "Languages",
    desc: "课本逐句点读、跟读评分。配套点读数据在「下载中心 · 内容」获取。",
    requiresPkgId: "pkg-pep-eng-g3",
    // 更新数据时由应用提供年级子包选择，而非直接下整包
    dataOptions: [
      { pkgId: "pkg-pep-eng-g4s", label: "四年级上英语点读" },
      { pkgId: "pkg-pep-eng-g5s", label: "五年级上英语点读" },
    ],
  },
  {
    id: "edu-char-cards",
    name: "生字卡片",
    icon: "Type",
    desc: "按课文生字自动生成认读卡片，支持大字投影与打印。",
  },
  {
    id: "edu-dictation",
    name: "听写助手",
    icon: "AudioLines",
    desc: "词库自动播报听写，间隔可调，学生平板端同步作答。",
    requiresPkgId: "pkg-word-junior",
  },
  {
    id: "edu-poem-roll",
    name: "诗词轮播",
    icon: "ScrollText",
    desc: "课前诵读轮播，注音与名家音频随诵读包更新。",
    requiresPkgId: "pkg-poem-tang",
    // 更新数据时可选年级子包
    dataOptions: [
      { pkgId: "pkg-poem-g4s", label: "四年级上诗词包" },
      { pkgId: "pkg-poem-g5s", label: "五年级上诗词包" },
    ],
  },
];

/** itemId → 可选数据子包（选包弹窗用；未列出的条目直接整包下载） */
export const DATA_OPTIONS_BY_TOOL: Record<string, DataOption[]> = Object.fromEntries(
  MOCK_EDU_TOOLS.filter((t) => t.dataOptions?.length).map((t) => [`edu:${t.id}`, t.dataOptions!]),
);

// ── 启动中心：网址收藏示例基线 ──
export const MOCK_BOOKMARK_BASELINE: Bookmark[] = [
  { id: "bm-smart-edu", name: "国家中小学智慧教育平台", url: "https://basic.smartedu.cn/" },
  { id: "bm-teacher-cert", name: "中国教师资格网", url: "https://www.jszg.edu.cn/" },
  { id: "bm-cnki", name: "知网 · 基础教育教学文献", url: "https://www.cnki.net/" },
];

// ── 抽卡分组示例名单 ──
export const MOCK_STUDENTS = [
  "陈嘉懿", "刘思远", "王雨桐", "李知恒", "赵梦琪", "孙立诚", "周欣妍", "吴景行",
  "郑清越", "冯乐怡", "蒋书白", "韩明轩", "杨若楠", "朱见微", "许安然", "何嘉树",
];
