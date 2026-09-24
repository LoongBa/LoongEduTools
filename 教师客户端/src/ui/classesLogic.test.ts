/**
 * classesLogic 纯函数单测（D05 §2.4.5 · P3 测试欠账回补）
 * 看板纯本地计算：进度推导 / 两周制定位 / 文案格式。
 */
import { describe, expect, it } from "vitest";
import {
  TOTAL_UNITS,
  classPosLabel,
  fmtUpdatedAt,
  parseSection,
  parseUnit,
  scheduleSlotFor,
  unitDecimal,
  unitPercent,
} from "./classesLogic";

describe("parseUnit", () => {
  it("数字串直接解析", () => {
    expect(parseUnit("3")).toBe(3);
    expect(parseUnit("6")).toBe(6);
  });

  it("容忍 U 前缀（U1-U6 语义）", () => {
    expect(parseUnit("U3")).toBe(3);
    expect(parseUnit("u5")).toBe(5);
  });

  it("越界夹取 1..6", () => {
    expect(parseUnit("9")).toBe(TOTAL_UNITS);
    expect(parseUnit("0")).toBe(1);
    expect(parseUnit("-2")).toBe(1);
  });

  it("非法回退 1", () => {
    expect(parseUnit("abc")).toBe(1);
    expect(parseUnit("")).toBe(1);
  });
});

describe("parseSection", () => {
  it("取首位整数，非法回退 1", () => {
    expect(parseSection("5")).toBe(5);
    expect(parseSection("abc")).toBe(1);
    expect(parseSection("0")).toBe(1);
  });
});

describe("unitDecimal / unitPercent", () => {
  it("U1 第1节 = 0%", () => {
    expect(unitDecimal("1", "1")).toBe(0);
    expect(unitPercent("1", "1")).toBe(0);
  });

  it("U6 第5节（超典型小节）= 100%", () => {
    expect(unitDecimal("6", "5")).toBe(1);
    expect(unitPercent("6", "5")).toBe(100);
  });

  it("U3 第3节 = (2 + 0.5) / 6 ≈ 42%", () => {
    expect(unitDecimal("3", "3")).toBeCloseTo(2.5 / 6, 6);
    expect(unitPercent("3", "3")).toBe(42);
  });

  it("进度恒在 0..100", () => {
    expect(unitPercent("0", "0")).toBeGreaterThanOrEqual(0);
    expect(unitPercent("99", "99")).toBeLessThanOrEqual(100);
  });
});

describe("classPosLabel", () => {
  it("常规：U3 第2节", () => {
    expect(classPosLabel("3", "2")).toBe("U3 第2节");
    expect(classPosLabel("U3", "2")).toBe("U3 第2节");
  });

  it("section 非数字时回退原文", () => {
    expect(classPosLabel("2", "Part A")).toBe("U2 · Part A");
  });
});

describe("scheduleSlotFor", () => {
  it("s≤3 → 第1周 Day1-3", () => {
    expect(scheduleSlotFor("1")).toBe("w1d1");
    expect(scheduleSlotFor("3")).toBe("w1d3");
    expect(scheduleSlotFor("0")).toBe("w1d1"); // 非法回退 1
  });

  it("s=4 → 周末 PBL；s=5/6 → 第2周 Day4/5", () => {
    expect(scheduleSlotFor("4")).toBe("w1pbl");
    expect(scheduleSlotFor("5")).toBe("w2d4");
    expect(scheduleSlotFor("6")).toBe("w2d5");
  });

  it("s≥7 → 周末小阅兵", () => {
    expect(scheduleSlotFor("7")).toBe("w2para");
    expect(scheduleSlotFor("12")).toBe("w2para");
  });
});

describe("fmtUpdatedAt", () => {
  it("合法时间 → MM-DD HH:mm（本地时间往返）", () => {
    const iso = new Date(2026, 8, 25, 14, 30).toISOString();
    expect(fmtUpdatedAt(iso)).toBe("09-25 14:30");
  });

  it("非法输入原样回退，空串回退 —", () => {
    expect(fmtUpdatedAt("not-a-date")).toBe("not-a-date");
    expect(fmtUpdatedAt("")).toBe("—");
  });
});
