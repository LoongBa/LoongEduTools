// 启动中心：易教工具内置目录（壳内自研工具，随壳版本演进）
// 决策（2026-09-26）：方案 A 壳内内置常量——本目录为本产品自研固定工具集，
// 非服务端下发清单；已安装的 app 类内容包由 store/LaunchpadView 动态并入。
import type { DataOption, EduTool } from "./types";

export const EDU_TOOLS: EduTool[] = [
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
  EDU_TOOLS.filter((t) => t.dataOptions?.length).map((t) => [`edu:${t.id}`, t.dataOptions!]),
);
