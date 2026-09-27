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