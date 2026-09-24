/**
 * rosterLogic 纯函数单测（D05 §2.4.1/§2.4.2 · P3 测试欠账回补）
 * 零依赖：vitest 直接跑，无 DOM/Tauri。
 */
import { describe, expect, it } from "vitest";
import {
  groupBalanced,
  groupByNumber,
  groupRandom,
  parseNames,
  resolveGroupCount,
  shuffle,
  type Student,
} from "./rosterLogic";

function roster(n: number): Student[] {
  return Array.from({ length: n }, (_, i) => ({ name: `S${i + 1}`, tag: null }));
}

function allNames(groups: Student[][]): string[] {
  return groups.flat().map((s) => s.name);
}

describe("parseNames", () => {
  it("支持换行/英文逗号/中文逗号/顿号/分号混排", () => {
    expect(parseNames("张三\n李四,王五、赵六；钱七，孙八")).toEqual([
      "张三",
      "李四",
      "王五",
      "赵六",
      "钱七",
      "孙八",
    ]);
  });

  it("过滤空行与纯空白并 trim", () => {
    expect(parseNames("  张三  \n\n  \n李四\t")).toEqual(["张三", "李四"]);
  });

  it("空输入返回空数组", () => {
    expect(parseNames("")).toEqual([]);
    expect(parseNames(" ,，、\n")).toEqual([]);
  });
});

describe("resolveGroupCount", () => {
  it("groupCount 优先于 perGroup", () => {
    expect(resolveGroupCount(12, { groupCount: 3, perGroup: 2 })).toBe(3);
  });

  it("仅有 perGroup 时按向上取整推组数", () => {
    expect(resolveGroupCount(12, { perGroup: 4 })).toBe(3);
    expect(resolveGroupCount(10, { perGroup: 4 })).toBe(3);
  });

  it("组数夹在 [1, n]：名单不足不产生空组", () => {
    expect(resolveGroupCount(3, { groupCount: 10 })).toBe(3);
    expect(resolveGroupCount(0, {})).toBe(1);
  });

  it("无参数时按每组 1 人（组数=人数）", () => {
    expect(resolveGroupCount(5, {})).toBe(5);
  });
});

describe("shuffle", () => {
  it("返回同长度的排列且不修改入参", () => {
    const src = roster(10);
    const frozen = src.map((s) => s.name);
    const out = shuffle(src);
    expect(out).toHaveLength(10);
    expect(out.map((s) => s.name).sort()).toEqual([...frozen].sort());
    expect(src.map((s) => s.name)).toEqual(frozen);
  });

  it("空数组安全", () => {
    expect(shuffle([])).toEqual([]);
  });
});

describe("groupRandom", () => {
  it("全员恰好出现一次，组数正确", () => {
    const gs = groupRandom(roster(10), 3);
    expect(gs).toHaveLength(3);
    expect(allNames(gs).sort()).toEqual(roster(10).map((s) => s.name).sort());
    expect(new Set(allNames(gs)).size).toBe(10);
  });

  it("轮转落组使各组人数差 ≤1", () => {
    const gs = groupRandom(roster(10), 3);
    const sizes = gs.map((g) => g.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it("空名单产生 count 个空组（不炸）", () => {
    const gs = groupRandom([], 3);
    expect(gs).toHaveLength(3);
    expect(gs.every((g) => g.length === 0)).toBe(true);
  });
});

describe("groupBalanced", () => {
  it("强弱搭配：强生匀开（6 强 3 组 → 每组恰好 2 强）", () => {
    const students: Student[] = [
      ...Array.from({ length: 6 }, (_, i) => ({ name: `H${i}`, tag: "strong" as const })),
      ...Array.from({ length: 6 }, (_, i) => ({ name: `L${i}`, tag: null })),
    ];
    const gs = groupBalanced(students, 3);
    expect(gs).toHaveLength(3);
    for (const g of gs) {
      expect(g.filter((s) => s.tag === "strong")).toHaveLength(2);
    }
    expect(allNames(gs)).toHaveLength(12);
  });

  it("未标记强弱时全员不丢不重（退化为随机分布）", () => {
    const gs = groupBalanced(roster(7), 2);
    expect(new Set(allNames(gs)).size).toBe(7);
    expect(allNames(gs)).toHaveLength(7);
  });

  it("弱生也匀开：6 弱 3 组 → 每组 2 弱", () => {
    const students: Student[] = [
      ...Array.from({ length: 6 }, (_, i) => ({ name: `W${i}`, tag: "weak" as const })),
      ...Array.from({ length: 6 }, (_, i) => ({ name: `N${i}`, tag: null })),
    ];
    const gs = groupBalanced(students, 3);
    for (const g of gs) {
      expect(g.filter((s) => s.tag === "weak")).toHaveLength(2);
    }
  });
});

describe("groupByNumber", () => {
  it("保持原序轮转：1,4,7 → A 组（i % count）", () => {
    const gs = groupByNumber(roster(7), 2);
    expect(gs[0].map((s) => s.name)).toEqual(["S1", "S3", "S5", "S7"]);
    expect(gs[1].map((s) => s.name)).toEqual(["S2", "S4", "S6"]);
  });

  it("组数=1 时保持原序整组", () => {
    const gs = groupByNumber(roster(4), 1);
    expect(gs[0].map((s) => s.name)).toEqual(["S1", "S2", "S3", "S4"]);
  });
});
