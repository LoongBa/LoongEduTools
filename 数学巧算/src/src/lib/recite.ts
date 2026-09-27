// 数学巧算 · 原理复述卡纯逻辑层（对齐 guard.ts 模式：自包含纯函数，engine.mjs 可直接 import 单测）
// 原则：不评分仅记录（需求 §2.3）；零音频（§4.3）→ 复述仅文字；儿童数据最小化 → 只落 localStorage
// saveRecite 在 store.tsx 内做 lessons[lessonKey] 组装，此处只管 record 级字段变换（无副作用、无断言）

export interface ReciteInfo {
  /** 复述文本（已 trim） */
  text: string;
  /** 复述日期（YYYY-MM-DD，与 store 同格式） */
  date: string;
}

/** 可携带复述字段的记录结构（store.LessonRecord 结构兼容，其余字段原样保留） */
export interface ReciteCarrier {
  recite?: ReciteInfo;
  reciteCount?: number;
}

/** 今日日期串（YYYY-MM-DD，与 guard/store 同格式；自包含不 import，保证 engine.mjs 可加载） */
export function todayStr(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * 对一条记录应用复述保存/删除（纯函数，不改入参，返回新对象）。
 * - text.trim() 为空 → 删除（recite 置 undefined；reciteCount 保留不累加，语义=撤销，方案 v0.2 I2/O3-I4）
 * - 非空 → 覆盖 recite + reciteCount+1（recite 字段与 clone 的其余字段组成新记录）
 * @param record 当前记录（可为不完整；无记录时由 store 侧先补 { done:false, best:{}, practiced:0 }）
 * @param text   复述输入（未归一；空/纯空白 = 删除）
 * @param date   复述日期（默认今日；测试可注入）
 */
export function applyRecite(record: ReciteCarrier, text: string, date = todayStr()): ReciteCarrier {
  const trimmed = (text || "").trim();
  if (trimmed === "") {
    return { ...record, recite: undefined };
  }
  return {
    ...record,
    recite: { text: trimmed, date },
    reciteCount: (record.reciteCount || 0) + 1,
  };
}