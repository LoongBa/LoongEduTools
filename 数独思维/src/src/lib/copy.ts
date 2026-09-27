// 文案与共享常量层：全站隐私规范串、导入解析消息映射。
// 引擎层（sudoku.ts）零文案，本文件统一收敛文案，供组件查表引用。

import { type Size, MIN_GIVENS, type ImportError, type ParseResult } from "./sudoku";

/** 隐私规范串：数据本地化 + 去游戏化双维度，全站唯一口径（footer / about 共用） */
export const PRIVACY_BADGE = "无账号 · 无云同步 · 无排行 · 数据只存本机";

/** 分享题编码协议前缀行标签（复制文本中引导用户区分「人读标题」与「可导入编码」） */
export const IMPORT_PROMPT_LABEL = "导入编码";

/** 剪贴板粘贴按钮提示 */
export const CLIPBOARD_TIP_NO_SD = "剪贴板里没有识别到题目编码，手动粘贴试试。";
export const CLIPBOARD_TIP_DENIED = "无法读取剪贴板，长按输入框手动粘贴即可。";

/** 备份/恢复文案（V1.2.0） */
export const BACKUP_DONE = "已生成备份文件。";
export const BACKUP_IOS_HINT = "如果浏览器没有自动保存，长按页面内容选择「存储到文件」即可。";
export const RESTORE_TITLE = "从文件恢复？";
export const RESTORE_SUB = (stats: { history: number; mistakes: number; favorites: number; achievements: number; checkinDays: number }) =>
  `文件里有 ${stats.history} 次练习、${stats.mistakes} 题待巩固、${stats.favorites} 题收藏、${stats.achievements} 枚成就徽章、${stats.checkinDays} 天打卡。`;
export const RESTORE_WARN = "恢复将覆盖当前全部进度，包括当前正在做的这道题。这一步不可撤销，确定继续吗？";
export const RESTORE_CONFIRM = "我已确认，恢复";
export const RESTORE_CANCEL = "再想想";
export const RESTORE_DONE = "已恢复，页面即将重新加载。";

/** 错题技巧分组视图文案（V1.3.0） */
export const GROUP_VIEW_TITLE = "按技巧分组";
export const GROUP_VIEW_HINT = "这类题常涉及的推理环节，点开看看哪里可以再补一补。";
export const GROUP_LESSON_BTN = "🎓 复习技巧";
export const GROUP_PRACTICE_BTN = "📝 练这一组";
export const GROUP_MIXED_BTN = "📚 去练一道";
export const GROUP_MIXED_HINT = "综合运用多种推理，适合按自己的节奏多练几道。";
export const GROUP_PRACTICE_DONE = "这组练完了，错题本里再挑一组继续。";
/** V1.4.0：进阶观察折叠组 */
export const GROUP_ADV_COLLAPSED = "进阶观察";
export const GROUP_ADV_EXPAND_LABEL = "展开";
export const GROUP_ADV_COLLAPSE_LABEL = "收起";
export const GROUP_ADV_HINT = "数对、X-Wing 等更深的推理环节，按需复习。";
/** V1.4.1：同类专项连做进度文案 */
export const GROUP_PROGRESS = (done: number, total: number) => `已完成 ${done}/${total} 题 · 还剩 ${total - done} 道`;
export const GROUP_PROGRESS_DONE = (total: number) => `已完成 ${total}/${total} 题 · 本组已完成`;
/** V1.4.2：同类专项连做练习中进度文案（正在做语境；与结算层「已完成 x/n · 还剩 m 道」区分）。idx 为 0-based 组内序号，函数内自管 +1 */
export const GROUP_IN_PROGRESS = (idx: number, total: number) => `第 ${idx + 1}/${total} 题`;

/** 导入解析错误 → 文案（静态消息） */
const IMPORT_MSG_STATIC: Record<ImportError, string> = {
  EMPTY: "没有识别到数字，请检查复制内容。",
  BAD_LEN: "", // 动态：见 importMsg（规格相关）
  BAD_CHAR: "有无法识别的字符，只允许数字、. 和空格。",
  CONFLICT: "题面有冲突：同一行/列/宫里出现了重复数字。",
  TOO_FEW: "", // 动态：见 importMsg（MIN_GIVENS 相关）
  NO_SOLUTION: "这道题无解，请检查填入的数字。",
  MULTI_SOLUTION: "这道题不止一个答案，请再补充几个数字。",
};

/** 导入解析结果 → 完整文案（含动态拼接） */
export function importMsg(r: ParseResult): string {
  if (!r.error) return "校验通过，可以直接开始。";
  if (r.error === "BAD_LEN") {
    if (r.size) return `SD${r.size} 编码需要 ${r.size * r.size} 个数字，当前是 ${r.cleanLen} 个。`;
    return `目前是 ${r.cleanLen} 个字符，需要 16（4×4）、36（6×6）或 81（9×9）个。`;
  }
  if (r.error === "TOO_FEW" && r.size) {
    return `题面线索太少：至少需要 ${MIN_GIVENS[r.size]} 个已知数才能保证唯一推理。`;
  }
  return IMPORT_MSG_STATIC[r.error];
}

/** 分享题编码协议串：SD{N}:<toSDString 结果>，二维码 / 导入编码行共用 */
export function sdProtocol(size: Size, sd: string): string {
  return `SD${size}:${sd}`;
}