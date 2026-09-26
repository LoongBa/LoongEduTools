// 需求文档正文·结构化真源（网页渲染与 Markdown 导出共用同一份数据，避免两处漂移）
import type { SpecSection } from "./types";

export const SPEC_META = {
  title: "桃李助手 · 教师客户端 v0.3",
  subtitle: "需求分析与功能设计方案（开发交接版）",
  version: "v0.3-spec.1",
  date: "2026-09-25",
  author: "龙爸易教 · 产品原型组",
};

export const SPEC_SECTIONS: SpecSection[] = [
  {
    id: "overview",
    title: "一、产品定位与边界",
    blocks: [
      { t: "h", text: "1.1 基本信息" },
      {
        t: "table",
        cols: ["项", "内容"],
        rows: [
          ["产品名称", "桃李助手 · 教师端（龙爸易教）"],
          ["目标形态", "Windows 桌面客户端（教室一体机 + 教师办公机双场景）"],
          ["当前交付物", "纯前端网页演示原型（本仓库），用于验证信息架构与交互规格"],
          ["文档用途", "交给桌面客户端开发方作为需求与功能设计基线"],
        ],
      },
      { t: "h", text: "1.2 核心定位" },
      {
        t: "ul",
        items: [
          "**教学工具统一入口**：把自研易教工具、第三方便携工具、原版教材、网址资源收在一处，一键直达。",
          "**离线优先容器**：断网时靠已装内容与缓存清单继续可用，不阻塞上课。",
          "**随身可迁移**：配置与教材可通过「随身工具包」导出，换机/换教室后导入即恢复。",
        ],
      },
      { t: "h", text: "1.3 原型的模拟层与真实层的分界" },
      {
        t: "p",
        text: "原型不含任何后端。所有『服务端下发清单』由 `src/lib/mockData.ts` 内置模拟；所有『本机状态』落在 localStorage（键前缀 `taoli.`）。真实客户端需要替换的正是这两层：清单改为服务端接口，本机状态改为本机文件级持久化（建议 `%APPDATA%/taoli/*.json`）。",
      },
      { t: "h", text: "1.4 硬约束红线" },
      {
        t: "note",
        tone: "warn",
        text: "全界面文案禁用「商店」二字（R03 §0.1）。任何新增文案需先自检该约束。",
      },
      {
        t: "ul",
        items: [
          "外部工具一律**便携版优先**，manifest 带 `portable` / `win7_ok` 标记；启动走系统 shell，**不注入、不监控**第三方进程。",
          "原版教材**不在客户端内直接下载**，只接受浏览器扩展抓取到本地后的目录扫描导入。",
          "清除本机数据必须二次确认；注销动作不得触碰用户本机教材原始文件。",
        ],
      },
    ],
  },
  {
    id: "ia",
    title: "二、信息架构",
    blocks: [
      { t: "h", text: "2.1 侧栏导航结构" },
      {
        t: "p",
        text: "品牌区 → 「一键启动」钉选区（≤6 项，用户配置，置于最顶）→ 总览（顶级直排组，无组头不可折叠）→ 课堂工具（可折叠组）→ 底栏（收拢 | 火箭 | 全屏 | 主题 | 设置）。",
      },
      {
        t: "table",
        cols: ["分组", "性质", "条目"],
        rows: [
          ["一键启动（钉选区）", "用户配置，非固定", "来自 pinnedMenu 的任意条目（view/edu/tool/bm 均可）"],
          ["总览 top", "topLevel 直排、不可折叠", "启动中心 / 下载中心 / 需求文档"],
          ["课堂工具 classroom", "可折叠", "抽卡分组 / 班级看板 / 打卡单 / 复盘本 / 计时器 / 纪律"],
          ["不入侧栏", "头像菜单或底栏进入", "个人信息 profile / 设置 settings"],
        ],
      },
      {
        t: "note",
        tone: "info",
        text: "「一键开课 quickstart」不是固定菜单入口，而是首次运行种子出来的钉选项（QUICKSTART_PIN_SEED），可在配置弹窗中取消。组名可改名、条目可隐藏（taoli.nav.groups）。",
      },
      { t: "h", text: "2.2 视图清单与实现成熟度" },
      {
        t: "p",
        text: "交接重点：请严格区分下表『完整实现』与『占位骨架』，后者在原型中仅示意布局，业务规则尚未定义，不应被当作已定稿规格实现。",
      },
      {
        t: "table",
        cols: ["视图", "组件位置", "成熟度"],
        rows: [
          ["启动中心 launchpad", "components/LaunchpadView.tsx", "✅ 完整交互"],
          ["下载中心 download-ext", "components/DownloadExtView.tsx", "✅ 完整交互"],
          ["一键开课 quickstart", "components/ClassroomViews.tsx（QuickstartView）", "✅ 可用"],
          ["抽卡分组 lottery", "RosterView.tsx（壳端真实实现）", "✅ 可用"],
          ["班级看板 board", "ClassesView.tsx（壳端真实实现）", "✅ 可用"],
          ["打卡单 checkin", "CheckinView.tsx（壳端真实实现）", "✅ 可用"],
          ["复盘本 reflection", "ReflectionView.tsx（壳端真实实现）", "✅ 可用"],
          ["计时器 timer", "TimerView.tsx（壳端真实实现）", "✅ 可用"],
          ["纪律 discipline", "DisciplineView.tsx（壳端真实实现）", "✅ 可用"],
          ["个人信息 / 设置", "components/ProfileView / SettingsView", "✅ 完整"],
          ["需求文档 spec-doc", "components/SpecDocView.tsx", "✅ 本文档页"],
        ],
      },
    ],
  },
  {
    id: "features",
    title: "三、功能模块规格",
    blocks: [
      { t: "h", text: "3.1 启动中心（两个 Tab）" },
      {
        t: "p",
        text: "Tab「快捷启动」含三个分区；Tab「工具」即工具箱面板（见 3.3）。默认首页。",
      },
      { t: "p", text: "**分区一 · 易教工具**：内置目录（英语点读 / 生字卡片 / 听写助手 / 诗词轮播）+ 已安装 app 类内容包动态并入。" },
      {
        t: "ul",
        items: [
          "卡片显示名称、描述、图标（未配置时为矢量图标）。",
          "下载徽章三态（badgeOf(pkgId, installed)）：`need`=需下载（警告色）/ `update`=有更新（品牌色）/ `null`=已装最新无徽章；任务进行中显转圈。",
          "点击徽章 → 下载确认弹窗；带 dataOptions 的工具（英语点读、诗词轮播）弹**多选子包**，勾选后逐个发起任务。",
          "点击卡片本体：已就绪则启动（真实客户端直接打开程序）。",
        ],
      },
      { t: "p", text: "**分区二 · 外部工具**：已下载（shortcuts 中 path 非空者）+ 推荐未下载（manifest recommend=true，虚线边框 + 需下载徽章，下载后落入已下载区并生成快捷方式）。" },
      { t: "p", text: "**分区三 · 网址收藏**：pill 列表，CRUD + 删除二次确认，URL 自动补 https://，favicon 色块按域名散列取色。" },
      {
        t: "ul",
        items: [
          "最近使用：跨易教/外部工具的启动 LRU，上限 10 条，倒序 pill 展示。",
          "快捷方式汇总区：pinnedQuick 条目，不限数量，失效 id 自动过滤。",
          "搜索：匹配名称与描述，命中前显示空态引导。",
          "每卡片右上角火箭按钮（hover/focus 可见，已钉选常亮）→ 打开一键启动配置弹窗。",
        ],
      },
      { t: "h", text: "3.2 下载中心（四个分区）" },
      {
        t: "p",
        text: "Section = tasks | content | tool | textbook。",
      },
      {
        t: "table",
        cols: ["分区", "内容", "关键规则"],
        rows: [
          ["任务 tasks", "下载中 / 等待中 / 已下载历史", "并发满 3 时新任务进等待态；历史相对时间显示、可清空"],
          ["内容 content", "数据包 + 离线应用", "学科 chips（英语/语文/数学/科学/综合）+ tag chips 叠加筛选"],
          ["工具 tool", "categories 含「工具」标记的包", "按类型 chips 筛选"],
          ["原版教材 textbook", "本机目录扫描导入项", "不提供云端下载，见 3.4"],
        ],
      },
      {
        t: "p",
        text: "**待办总览四块**（仅 content/tool 区渲染）：需下载 / 缺数据 / 数据有更新 / 有更新，每块支持一键批量循环发起下载。",
      },
      {
        t: "p",
        text: "**断网降级状态机**：loading → ready | error；切分区不重置 phase；探针为「不可达」时进入即走缓存清单只读模式并提供重试按钮。",
      },
      { t: "h", text: "3.3 工具箱与随身工具包" },
      {
        t: "ul",
        items: [
          "manifest 结构：version / updated_at / categories[] / tools[]；工具字段含 aliases、tags、license、homepage、download_url、size_bytes、checksum、portable、win7_ok、recommend、entry。",
          "下载任务 id 用 `tb:<toolId>` 前缀与内容包（裸 pkgId）区分，共用同一套进度引擎。",
          "导出：`toolbox-pack.json`（kind 字段校验），含 shortcuts + downloaded_tools + textbooks（仅 packed=true 者）。",
          "导入：工具按 tool_id 合并对齐（清单没有的标 external_name），教材按 id 合并覆盖。",
        ],
      },
      { t: "h", text: "3.4 原版教材（真实目录扫描）" },
      {
        t: "p",
        text: "工作流三步：**扩展抓取 → 扫描目录 → 随包打包**。",
      },
      {
        t: "ul",
        items: [
          "「为浏览器安装『教材下载』扩展」按钮跳 Edge 加载项页（URL 集中在 mockData，可能更换）。",
          "扫描引擎：File System Access API 递归遍历（最深 3 层、上限 800 文件），每个 PDF **只读头部 24KB** 做 %PDF-x.y 魔数校验、版本提取、/Title 粗识别（支持明文与 UTF-16BE hex 两种写法）。",
          "扫描报告：有效 PDF / 图片 / 识别到书名 / 伪 PDF 四格统计 + 最多 30 条明细（标题、PDF 版本、大小）+ 截断提示。",
          "教材条目：名称取首个识别书名否则目录名；学科按目录名+标题关键词归类（英语/语文/数学/科学/综合）；移除仅删索引，**不删本机文件**。",
        ],
      },
      {
        t: "note",
        tone: "info",
        text: "真实桌面客户端不必依赖浏览器 API，可直接以文件系统权限实现同等扫描；但识别口径（魔数校验、/Title 提取、伪 PDF 跳过、深度与数量上限）应保持一致，以便与扩展抓取产物对接。",
      },
      { t: "h", text: "3.5 顶栏与通知" },
      {
        t: "ul",
        items: [
          "服务器探针：可达/不可达手动切换（演示断网降级），呼吸点动画。",
          "下载速览 DownloadBell：活动任务数角标（>9 显 9+，下载中图标脉冲）；面板分下载中 / 等待中 / 已下载（最近 20 条）；底部「前往下载中心」通过一次性信号让下载中心直达任务分区。",
          "通知铃铛 NotifyBell：未读红点 >9 显 9+，打开即全部置已读，支持单条删除与清空。事件源＝下载完成(success) / 钉选达上限拦截(warn) / 钉选项失效(warn)。",
          "头像菜单：个人信息 / 设置 / 退出登录 / 注销并清除本机数据。",
        ],
      },
      { t: "h", text: "3.6 一键启动配置体系（双通道钉选）" },
      {
        t: "table",
        cols: ["通道", "落点", "上限", "排序"],
        rows: [
          ["pinnedMenu", "侧栏「一键启动」菜单项", "6（满时拦截并写 warn 通知）", "按 pinnedAt"],
          ["pinnedQuick", "启动中心「快捷方式」区", "不限", "按 pinnedAt"],
          ["wheel（预留）", "浮动轮盘", "本期零 UI", "—"],
        ],
      },
      {
        t: "ul",
        items: [
          "菜单名 ≤4 字，超出截断；itemId 规范 `view:<View>` | `edu:<id>` | `tool:<toolId>` | `bm:<id>`。",
          "图标可配文字（1~2 字符，缺省取名称首字）或图片 URL（须 http(s):// 开头）。",
          "**图标渲染契约**：只有用户显式配置过图标（iconKind 存在）时，侧栏才替换为色块；否则一律保持与其它导航项一致的矢量图标。rail 收拢态保留全量图标 + tooltip。",
          "提交兜底：校验菜单名 / 图片 URL / 钉选上限，失败写错误态并推送 warn 通知。",
        ],
      },
    ],
  },
  {
    id: "data",
    title: "四、数据契约",
    blocks: [
      { t: "h", text: "4.1 服务端下发对象（原型中为 mock，真实需接口化）" },
      {
        t: "table",
        cols: ["类型", "关键字段", "说明"],
        rows: [
          [
            "RemotePkg",
            "id / name / version / package_type(app|data) / size_bytes / download_url / checksum / updated_at / categories? / description?",
            "内容包条目；categories 含「工具」→ 下载中心工具区",
          ],
          [
            "ToolboxManifest",
            "version / updated_at / categories[] / tools[]",
            "工具箱整份清单，建议带 ETag 便于缓存协商",
          ],
          [
            "ToolboxTool",
            "id / name / category / aliases? / tags / description / license / homepage / download_url / size_bytes / checksum / portable / win7_ok / recommend / entry",
            "单个第三方工具条目",
          ],
          [
            "EduTool",
            "id / name / icon / desc / requiresPkgId? / dataOptions?",
            "自研易教工具目录；requiresPkgId 决定徽章三态",
          ],
          ["DataOption", "pkgId / label", "更新数据时的可选子包（如五年级上诗词包）"],
        ],
      },
      { t: "h", text: "4.2 本机产生对象" },
      {
        t: "table",
        cols: ["类型", "关键字段", "说明"],
        rows: [
          ["ToolShortcut", "tool_id / path / pinned / last_used / source(download|manual) / external_name?", "本地快捷方式，唯一本机业务状态"],
          ["LocalTextbook", "id / name / subject / dir / file_count / size_bytes / formats / packed / imported_at", "原版教材目录导入项"],
          ["ToolboxPackFile", "kind / exported_at / shortcuts / downloaded_tools / textbooks?", "随身工具包导出文件结构"],
          ["Bookmark", "id / name / url", "网址收藏"],
          ["LaunchConfig", "menuLabel / iconKind / iconText / iconImage / bgColor / fgColor / pinnedMenu / pinnedQuick / sidebarGroup / pinnedAt / wheel", "一键启动配置（含旧字段 showInSidebar 兼容）"],
          ["Notification", "id / kind(success|info|warn) / title / body? / at / read", "通知中心条目"],
          ["ActiveDownload", "id / name / kind(pkg|tool) / queued?", "正在下载或等待中的任务元信息"],
          ["DownloadHistoryItem", "id / name / kind / at", "已下载历史条目"],
          ["LaunchRecentItem", "key / name / at", "最近使用 LRU 条目"],
        ],
      },
      { t: "h", text: "4.3 建议接口清单（对接点）" },
      {
        t: "ul",
        items: [
          "内容包清单 GET（返回 RemotePkg[]，带版本号与 ETag）。",
          "工具箱 manifest GET（返回 ToolboxManifest，支持协商缓存）。",
          "下载与校验：download_url + checksum（客户端下载后必须校验，失败视为伪文件）。",
          "账号与授权：登录态、授权方式、到期日、客户端版本与清单通道。",
          "浏览器扩展落地约定：扩展写入目录的命名与结构需与扫描口径对齐。",
        ],
      },
    ],
  },
  {
    id: "storage",
    title: "五、本地存储规格",
    blocks: [
      {
        t: "p",
        text: "原型全部落在 localStorage（键前缀 `taoli.`）。真实客户端建议映射为本机配置目录下的 JSON 文件，**键名语义与容量策略可直接沿用**。",
      },
      { t: "h", text: "5.1 键位全表" },
      {
        t: "table",
        cols: ["键名", "数据结构", "上限", "读写 hook"],
        rows: [
          ["taoli.nav.collapse", "Record<groupId, boolean>（true=收起）", "—", "useNavCollapse"],
          ["taoli.nav.railCollapsed", "boolean", "—", "useNavRail"],
          ["taoli.toolbox.collapse", "Record<categoryId, boolean>", "—", "useToolCollapse"],
          ["taoli.theme.mode", "light | dark | system（默认 system）", "—", "theme.tsx"],
          ["taoli.theme.skin", "clay | pine | indigo | rose | ink", "—", "theme.tsx"],
          ["taoli.auth.loggedIn", "boolean", "—", "useLoggedIn"],
          ["taoli.server.probeOnline", "boolean（探针可达态）", "—", "useProbeOnline"],
          ["taoli.packages.installed", "Record<pkgId, version>", "—", "useInstalledPackages"],
          ["taoli.toolbox.shortcuts", "ToolShortcut[]", "LRU 裁剪至 max(10, pinned 数)", "useShortcuts"],
          ["taoli.launch.bookmarks", "Bookmark[]", "—", "useBookmarks"],
          ["taoli.launch.recent", "LaunchRecentItem[]", "10（LAUNCH_LRU_MAX）", "useLaunchRecent"],
          ["taoli.launch.config", "LaunchConfigMap", "侧栏钉选 6（SIDEBAR_MENU_MAX）", "useLaunchConfig"],
          ["taoli.nav.groups", "NavGroupConfig", "—", "useNavGroups"],
          ["taoli.notify.items", "Notification[]", "50（NOTIFY_MAX，FIFO）", "useNotifications"],
          ["taoli.textbooks.local", "LocalTextbook[]", "—", "useLocalTextbooks"],
          ["taoli.downloads.history", "DownloadHistoryItem[]", "60（HISTORY_MAX，FIFO）", "useDownloadTasks"],
          ["taoli.toolbox.manifestCache", "ToolboxManifest（断网降级用）", "—", "ToolboxPanel"],
          ["taoli.launch.iconSeedMigrated.v1", "迁移标记", "—", "useLaunchConfig"],
        ],
      },
      { t: "h", text: "5.2 关键常量" },
      {
        t: "ul",
        items: [
          "DOWNLOAD_CONCURRENCY = 3（同时下载的并发上限，超出排队）",
          "HISTORY_MAX = 60 / NOTIFY_MAX = 50 / LAUNCH_LRU_MAX = 10 / SIDEBAR_MENU_MAX = 6",
          "扫描：MAX_DEPTH = 3、MAX_FILES = 800、HEAD_BYTES = 24KB",
        ],
      },
      { t: "h", text: "5.3 既有迁移（必须保留）" },
      {
        t: "ul",
        items: [
          "主题旧键 `taoli.theme` → `taoli.theme.mode`。",
          "`taoli.launch.iconSeedMigrated.v1`：一次性清洗历史种子遗留在 view 条目上的 iconKind/iconText，使其回退为矢量图标。",
        ],
      },
    ],
  },
  {
    id: "visual",
    title: "六、视觉风格",
    blocks: [
      { t: "h", text: "6.1 风格参考来源" },
      {
        t: "p",
        text: "用户未提供外部参考图；调性取自现有原型——面向教师的**暖调工作台**气质，接近 Linear / Arc 那种「信息密度可控、留白克制、色彩只用于状态与强调」的专业工具感，而非营销页。整体偏「纸质教具 + 松青墨色」的教育行业质感，避免科技蓝紫渐变。",
      },
      { t: "h", text: "6.2 整体视觉取向" },
      {
        t: "ul",
        items: [
          "**版式结构**：经典桌面三段式（左窄侧栏 + 顶栏 + 主内容区）；主区采用响应式卡片网格（1/2/3/4 列随宽度递进）；层级靠「组头小标题 + 卡片 + 行内元信息」三级递降；侧栏可收拢为 56px 图标条，收拢态靠 tooltip 承载名称。",
          "**配色倾向**：中性底色（背景/卡片/弹出层三层微差）+ 单一品牌主色 + 语义状态色（成功/警告/危险）+ 侧栏专用一组语义色；严禁组件内写死色值，全部走设计令牌。**最终生效配色由评审时从多套方案中选定**，本文档只定取向。",
          "**字体气质**：中文为主；标题用有骨力的衬线/半衬线显示字体（体现教具书本感），正文与数字用清晰无衬线，路径/尺寸类信息用等宽对齐；字号阶梯紧凑（11/12/13/14/15/17px），换取工作台密度。",
          "**留白与信息密度**：偏「克制的密」——卡片内边距适中、行间用细分隔线，长文本一律截断 + 悬浮全文；空态用图形 + 一句引导语，不留大片空白。",
          "**动效取向**：只用短促的功能性动效（折叠 0.15~0.18s、进度条纹、探针呼吸、hover 微抬升 + 阴影），且必须尊重系统「减弱动效」偏好；禁止花哨入场动画堆砌。",
        ],
      },
      { t: "h", text: "6.3 皮肤与主题" },
      {
        t: "p",
        text: "mode（light / dark / system，默认 system 跟随系统）× skin（clay 暖橙陶土 / pine 松青 / indigo 靛蓝 / rose 玫瑰胭脂 / ink 墨玉）共 15 种组合。皮肤通过根元素 data-skin 属性 + 深色 class 覆盖语义变量，每套皮肤定义浅底与深底两套数值。",
      },
      { t: "h", text: "6.4 受本次视觉梳理影响的页面/区块" },
      {
        t: "ul",
        items: [
          "全局设计令牌与皮肤体系（5 套皮肤 × 浅/深两档）",
          "侧栏（品牌区 / 钉选区 / 分组 / rail 收拢态 / 底栏）",
          "顶栏（探针 / 下载速览面板 / 通知面板 / 头像菜单）",
          "启动中心（三类卡片、徽章三态、快捷方式 pill、搜索框）",
          "下载中心（分区 Tab、待办总览四块、任务进度行、chips 筛选行）",
          "原版教材（工作流说明条、扫描报告卡、教材卡）",
          "配置弹窗（图标预览块、双开关、计数与置灰态）",
          "个人信息页 / 设置页（分组卡、开关行、皮肤选择器）",
          "课堂工具占位页（空态骨架的统一样式）",
        ],
      },
      {
        t: "note",
        tone: "ok",
        text: "必须沿用的既有视觉约定：深浅双主题靠根元素 class 切换并在首屏内联脚本防闪烁；侧栏/顶栏保留 .sidebar / .banner 类名并配打印隐藏；颜色一律令牌化（图标按 id 散列取色是唯一受控例外）。",
      },
    ],
  },
  {
    id: "interaction",
    title: "七、交互与可访问性规范",
    blocks: [
      {
        t: "ul",
        items: [
          "弹层统一行为：mousedown 外点关闭、Esc 关闭、面板设最大高度 + 内部滚动。",
          "所有图标按钮必须有 aria-label；角标类装饰元素标 aria-hidden；选中/当前态用 aria-pressed / aria-current 表达。",
          "移动端：汉堡抽屉侧栏，全页面适配 H5 断点；普通点击统一用标准 click 语义，不叠加 touch 事件。",
          "键盘可达：hover-only 操作（如卡片火箭按钮）必须在 focus 时同样可见。",
          "打印：隐藏侧栏与顶栏，仅输出主内容。",
          "反馈分层：即时操作用 toast；需要留存的事件进通知中心；破坏性操作前置二次确认。",
        ],
      },
    ],
  },
  {
    id: "acceptance",
    title: "八、验收标准",
    blocks: [
      {
        t: "ul",
        items: [
          "侧栏「需求文档」可进入本页，左侧目录锚点跳转到 9 个章节，滚动时当前章节高亮。",
          "第 3 章每个功能模块都能查到：入口位置、可交互元素清单、业务规则、异常/边界处理。",
          "第 4 章数据表覆盖全部服务端与本机对象契约，并标明来源侧。",
          "第 5 章键表覆盖 18 个持久化键，含容量上限与两条迁移规则。",
          "第 6 章视觉章节包含：风格参考来源、版式/配色/字体/密度/动效五项取向、受影响区块清单，且不含任何 HTML/CSS 代码片段。",
          "第 2 章明确区分「完整实现的视图」与「占位骨架视图」。",
          "全文检索不出现「商店」二字。",
          "提供 Markdown 纯文本版下载入口，内容与网页版一致。",
          "原有原型功能（启动中心 / 下载中心 / 教材扫描 / 顶栏下载面板等）无回归。",
        ],
      },
    ],
  },
  {
    id: "scope",
    title: "九、本期不做范围",
    blocks: [
      {
        t: "ul",
        items: [
          "真实后端接口、账号体系、授权校验的实现（本文档只给对接点与字段建议）。",
          "浮动轮盘的 UI 与手势呼出（仅保留 wheel 字段与规划描述）。",
          "班级看板 / 打卡单 / 复盘本 / 纪律 / 一键开课的业务规则定义（原型即占位，如实标注为待定）。",
          "浏览器扩展本体的实现与协议细节（仅约定落地目录与导入格式）。",
          "多语言、多人协作、云端同步、自动更新策略。",
          "自动化测试用例编写。",
        ],
      },
      {
        t: "note",
        tone: "warn",
        text: "以上为刻意划出的边界，防止范围蔓延。若后续要启用其中任一项，需回到本文档增补对应章节并重新走查验收标准。",
      },
    ],
  },
];
