import type { Bookmark, DataOption, EduTool, LaunchConfigMap, LocalTextbook, RemotePkg, ToolboxManifest } from "./types";

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

// ── 下载中心：内容包清单（模拟 GET /api/edu/packages/manifest）──
// 规则：categories 含 "工具" → 工具区（按类型分类，如截屏工具/PDF工具）；
//       缺省/不含 → 内容区（按学科分类）。向后兼容存量包。
export const MOCK_PACKAGES: RemotePkg[] = [
  {
    id: "pkg-pep-eng-g3",
    name: "人教版英语三年级上册 · 点读包",
    version: "1.4.2",
    package_type: "data",
    size_bytes: 86_400_000,
    download_url: "https://example.invalid/pkg/pep-eng-g3.zip",
    checksum: "sha256:9f2a…c41d",
    updated_at: "2026-09-10T02:00:00Z",
    categories: ["教材", "英语"],
    description: "配套课本逐句点读、跟读评分音频数据，解压后由「应用」页调用。",
  },
  {
    id: "pkg-pep-chin-g4",
    name: "统编语文四年级下册 · 点读包",
    version: "2.0.1",
    package_type: "data",
    size_bytes: 122_000_000,
    download_url: "https://example.invalid/pkg/pep-chin-g4.zip",
    checksum: "sha256:1b7e…88ac",
    updated_at: "2026-08-28T02:00:00Z",
    categories: ["教材", "语文"],
    description: "课文朗读、生字词卡片与背诵检查音频数据。",
  },
  {
    id: "pkg-word-junior",
    name: "初中英语核心词库 1600",
    version: "3.1.0",
    package_type: "data",
    size_bytes: 5_600_000,
    download_url: "https://example.invalid/pkg/word-junior.zip",
    checksum: "sha256:44d0…9f2b",
    updated_at: "2026-09-01T02:00:00Z",
    categories: ["词库", "英语"],
    description: "中考核心词汇数据，供默写与抽卡类应用使用。",
  },
  {
    id: "pkg-math-mental",
    name: "口算题生成器（离线应用）",
    version: "1.0.6",
    package_type: "app",
    size_bytes: 3_200_000,
    download_url: "https://example.invalid/pkg/math-mental.zip",
    checksum: "sha256:77aa…0e13",
    updated_at: "2026-07-19T02:00:00Z",
    // 无 categories —— 验证存量包全部落「内容」区的向后兼容规则
    description: "按年级自动出题的离线口算小应用，打印即得练习卷。",
  },
  {
    id: "pkg-poem-tang",
    name: "唐诗三百首 · 诵读包",
    version: "1.2.0",
    package_type: "data",
    size_bytes: 41_000_000,
    download_url: "https://example.invalid/pkg/poem-tang.zip",
    checksum: "sha256:e0c5…2d7f",
    updated_at: "2026-06-30T02:00:00Z",
    categories: ["拓展阅读", "语文"],
    description: "名家诵读音频与注音文本，支持课堂轮播播放。",
  },
  {
    id: "pkg-sci-photo",
    name: "小学科学实验素材图库",
    version: "1.0.2",
    package_type: "data",
    size_bytes: 68_000_000,
    download_url: "https://example.invalid/pkg/sci-photo.zip",
    checksum: "sha256:2c9e…77b1",
    updated_at: "2026-09-05T02:00:00Z",
    categories: ["素材", "科学"],
    description: "三到六年级实验步骤实拍图与安全提示卡片，可插入课件。",
  },
  {
    id: "pkg-math-geo",
    name: "图形与几何动态演示包",
    version: "2.2.0",
    package_type: "app",
    size_bytes: 18_400_000,
    download_url: "https://example.invalid/pkg/math-geo.zip",
    checksum: "sha256:a03f…5d19",
    updated_at: "2026-08-15T02:00:00Z",
    categories: ["演示", "数学"],
    description: "平面图形变换、立体展开图动态演示，触屏一体机可直接操作。",
  },
  {
    id: "pkg-ext-officewps",
    name: "课件批注增强包",
    version: "0.9.3",
    package_type: "app",
    size_bytes: 14_800_000,
    download_url: "https://example.invalid/pkg/ext-office.zip",
    checksum: "sha256:3fa9…b602",
    updated_at: "2026-09-18T02:00:00Z",
    categories: ["工具", "屏幕标注"],
    description: "为 PPT 放映提供画笔、聚光灯与遮罩工具（工具类增强包）。",
  },
  {
    id: "pkg-ext-audio-clean",
    name: "录音降噪插件",
    version: "1.1.0",
    package_type: "app",
    size_bytes: 9_400_000,
    download_url: "https://example.invalid/pkg/ext-audio.zip",
    checksum: "sha256:c81d…5e77",
    updated_at: "2026-09-12T02:00:00Z",
    categories: ["工具", "音频处理"],
    description: "打卡录音一键降噪，提升弱网教室下的语音质量。",
  },
  {
    id: "pkg-ext-font-pack",
    name: "规范笔顺楷体字库",
    version: "1.0.0",
    package_type: "data",
    size_bytes: 27_300_000,
    download_url: "https://example.invalid/pkg/ext-font.zip",
    checksum: "sha256:62bb…a9f0",
    updated_at: "2026-08-05T02:00:00Z",
    categories: ["工具", "字体排版"],
    description: "规范笔顺楷体字库，供生字卡与板书模板渲染。",
  },
  {
    id: "pkg-ext-capture",
    name: "课堂截图工具（轻量版）",
    version: "1.3.1",
    package_type: "app",
    size_bytes: 6_800_000,
    download_url: "https://example.invalid/pkg/ext-capture.zip",
    checksum: "sha256:9de4…3ab8",
    updated_at: "2026-09-20T02:00:00Z",
    categories: ["工具", "截屏工具"],
    description: "框选截图 + 即时标注，抓取的错题图可直接贴进备课本。",
  },
  {
    id: "pkg-ext-pdf",
    name: "试卷 PDF 工具箱",
    version: "2.0.4",
    package_type: "app",
    size_bytes: 22_600_000,
    download_url: "https://example.invalid/pkg/ext-pdf.zip",
    checksum: "sha256:f17c…02d5",
    updated_at: "2026-09-22T02:00:00Z",
    categories: ["工具", "PDF工具"],
    description: "扫描件裁边、多卷合并、加水印与导出打印双拼，处理电子试卷常用。",
  },
  // ── 年级数据子包（易教工具「更新数据」时可选下载）──
  {
    id: "pkg-poem-g4s",
    name: "四年级上诗词包",
    version: "1.0.0",
    package_type: "data",
    size_bytes: 12_800_000,
    download_url: "https://example.invalid/pkg/poem-g4s.zip",
    checksum: "sha256:d5b1…77e2",
    updated_at: "2026-09-12T02:00:00Z",
    categories: ["拓展阅读", "语文"],
    description: "四年级上册课文诗词注音与诵读音频，供「诗词轮播」选用。",
  },
  {
    id: "pkg-poem-g5s",
    name: "五年级上诗词包",
    version: "1.0.0",
    package_type: "data",
    size_bytes: 13_500_000,
    download_url: "https://example.invalid/pkg/poem-g5s.zip",
    checksum: "sha256:e2c7…91a4",
    updated_at: "2026-09-12T02:00:00Z",
    categories: ["拓展阅读", "语文"],
    description: "五年级上册课文诗词注音与诵读音频，供「诗词轮播」选用。",
  },
  {
    id: "pkg-pep-eng-g4s",
    name: "四年级上英语点读",
    version: "1.1.0",
    package_type: "data",
    size_bytes: 88_900_000,
    download_url: "https://example.invalid/pkg/pep-eng-g4s.zip",
    checksum: "sha256:f3a8…20bc",
    updated_at: "2026-09-16T02:00:00Z",
    categories: ["教材", "英语"],
    description: "人教版四年级上册逐句点读与跟读评分数据，供「英语点读」选用。",
  },
  {
    id: "pkg-pep-eng-g5s",
    name: "五年级上英语点读",
    version: "1.0.2",
    package_type: "data",
    size_bytes: 91_200_000,
    download_url: "https://example.invalid/pkg/pep-eng-g5s.zip",
    checksum: "sha256:a9d2…5f13",
    updated_at: "2026-09-16T02:00:00Z",
    categories: ["教材", "英语"],
    description: "人教版五年级上册逐句点读与跟读评分数据，供「英语点读」选用。",
  },
];

/** 已安装版本基线（模拟本机 packages/ 目录状态）；低于 version 即可更新 */
export const MOCK_INSTALLED_BASELINE: Record<string, string> = {
  "pkg-pep-eng-g3": "1.4.1", // → 可更新
  "pkg-word-junior": "3.1.0", // → 已安装
  "pkg-math-mental": "1.0.6", // → 已安装
};

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

/** 工具箱本地快捷方式初始基线（模拟既有 toolbox.json） */
export const MOCK_SHORTCUT_BASELINE = [
  {
    tool_id: "keyviz",
    path: "toolbox/keyviz/keyviz.exe",
    pinned: true,
    last_used: null as string | null,
    source: "download" as const,
  },
];

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
