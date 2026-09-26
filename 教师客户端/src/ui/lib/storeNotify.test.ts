/**
 * 通知合并纯函数单测（D11 §7.3 / §11）：groupKey 同键合并 count++ / items 明细 /
 * 时间窗过期拆分 / 标题「N 个」前缀 / 异键独立条目 / NOTIFY_MAX 上限。
 */
import { describe, expect, it } from "vitest";
import { ARCHIVE_GROUP_WINDOW_MS, pushNotifyReducer } from "./store";
import type { Notification } from "./types";

const BASE = {
  kind: "success" as const,
  title: "已归档：英语·人教版·四年级上册",
  body: "U01_Greetings.mp4",
};

function seed(atMs: number): Notification[] {
  return [
    {
      id: "nt-1",
      kind: "success",
      channel: "archive",
      title: "已归档：英语·人教版·四年级上册",
      body: "U01_Greetings.mp4",
      meta: { groupKey: "archived:英语:人教版:四年级上册", count: 1, items: ["U01_Greetings.mp4"] },
      at: new Date(atMs).toISOString(),
      read: false,
    },
  ];
}

describe("pushNotifyReducer · groupKey 合并", () => {
  it("同 key 未过期 → count++ / items 追加 / 标题加 N 前缀", () => {
    const t0 = Date.now();
    const list = seed(t0 - 1000);
    const next = pushNotifyReducer(
      list,
      { ...BASE, body: "U02_Words.mp3" },
      t0,
      { groupKey: "archived:英语:人教版:四年级上册" },
    );
    expect(next).toHaveLength(1); // 合并不新增条目
    const merged = next[0];
    expect(merged.meta?.count).toBe(2);
    expect(merged.meta?.items).toEqual(["U01_Greetings.mp4", "U02_Words.mp3"]);
    expect(merged.title).toBe("2 个已归档：英语·人教版·四年级上册");
  });

  it("超过时间窗 → 新建条目（不合并历史）", () => {
    const t0 = Date.now();
    const list = seed(t0 - ARCHIVE_GROUP_WINDOW_MS - 1000);
    const next = pushNotifyReducer(
      list,
      { ...BASE, body: "U02_Words.mp3" },
      t0,
      { groupKey: "archived:英语:人教版:四年级上册" },
    );
    expect(next).toHaveLength(2); // 过期 → 新条目
    expect(next[0].meta?.count).toBe(1);
    expect(next[1].meta?.count).toBe(1);
  });

  it("异 groupKey → 独立条目", () => {
    const t0 = Date.now();
    const list = seed(t0 - 1000);
    const next = pushNotifyReducer(
      list,
      { ...BASE, body: "song.mp3", title: "已归档：音乐·人音版·三年级上册" },
      t0,
      { groupKey: "archived:音乐:人音版:三年级上册" },
    );
    expect(next).toHaveLength(2);
    expect(next[0].meta?.count).toBe(1);
  });

  it("无 groupKey → 普通追加", () => {
    const t0 = Date.now();
    const list = seed(t0 - 1000);
    const next = pushNotifyReducer(list, { kind: "info", title: "钉选已失效" }, t0);
    expect(next).toHaveLength(2);
    expect(next[0].meta).toBeUndefined();
  });
});

describe("pushNotifyReducer · 上限", () => {
  it("超过 NOTIFY_MAX 裁剪旧条目（不 panic）", () => {
    const t0 = Date.now();
    let list: Notification[] = [];
    for (let i = 0; i < 60; i++) {
      list = pushNotifyReducer(list, { kind: "info", title: `t${i}` }, t0 + i);
    }
    expect(list.length).toBeLessThanOrEqual(50);
    expect(list[0].title).toBe("t59");
  });
});
