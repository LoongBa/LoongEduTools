import type { NavGroup, View } from "./types";

// 分组方案：导航只保留固定功能页；「一键启动」钉选区（quickItems）在 Sidebar 内先于本数组渲染、置于最前，
// 它专用于展示教师配置的快捷钉选项（pinnedMenu ≤6，如「英语点读」「一键开课」）。
// 「一键开课」是内置的可配置快捷项（见 mockData QUICKSTART_PIN_SEED），不是固定菜单入口。
// 组名与条目可见性可被 taoli.nav.groups 配置覆盖（见 store.useNavGroups）
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "top",
    label: "总览",
    topLevel: true,
    children: [
      { view: "launchpad", label: "启动中心" },
      { view: "download-ext", label: "下载中心" },
      { view: "spec-doc", label: "需求文档" },
    ],
  },
  {
    id: "classroom",
    label: "课堂工具",
    children: [
      { view: "lottery", label: "抽卡分组" },
      { view: "board", label: "班级看板" },
      { view: "checkin", label: "打卡单" },
      { view: "reflection", label: "复盘本" },
      { view: "timer", label: "计时器" },
      { view: "discipline", label: "纪律" },
    ],
  },
];

export const VIEW_TITLES: Record<View, string> = {
  launchpad: "启动中心",
  quickstart: "一键开课",
  "download-ext": "下载中心",
  lottery: "抽卡分组",
  board: "班级看板",
  checkin: "打卡单",
  reflection: "复盘本",
  timer: "计时器",
  discipline: "纪律",
  "spec-doc": "需求文档",
  profile: "个人信息",
  settings: "设置",
};

/** 该视图所在组是否为顶级直排组（无组头、不可折叠） */
export function isTopLevelView(view: View): boolean {
  const g = NAV_GROUPS.find((x) => x.children.some((c) => c.view === view));
  return Boolean(g?.topLevel);
}

export function groupOfView(view: View): string | null {
  for (const g of NAV_GROUPS) {
    if (g.children.some((c) => c.view === view)) return g.id;
  }
  return null;
}
