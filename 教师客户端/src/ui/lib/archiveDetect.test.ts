/**
 * archiveDetect 纯函数单测（D11 §5.2/§5.3/§5.4）
 * 覆盖：高/中/低置信度识别、单元号册次推断、版本默认、级联数据源、规则 pattern/匹配。
 */
import { describe, expect, it } from "vitest";
import {
  ARCHIVE_GRADES,
  ARCHIVE_SUBJECTS,
  ARCHIVE_VOLUMES,
  detectArchiveMeta,
  detectPatternFor,
  escapeRegex,
  fileKindLabel,
  ruleMatches,
  VERSIONS_BY_SUBJECT,
} from "./archiveDetect";

describe("detectArchiveMeta · 高置信（学科+年级+册次齐全）", () => {
  it("四年级英语上册：U01_Greetings.mp4 → 英语/人教版/四年级/上册", () => {
    const { meta, confidence } = detectArchiveMeta("U01_Greetings.mp4");
    expect(confidence).toBe("high");
    expect(meta).toEqual({
      subject: "英语",
      version: "人教版",
      grade: "四年级",
      volume: "上册",
    });
  });

  it("四年级英语下册：U05_Animals.mp3 → 下册（单元号 U05 ≥5）", () => {
    const { meta, confidence } = detectArchiveMeta("U05_Animals.mp3");
    expect(confidence).toBe("high");
    expect(meta?.volume).toBe("下册");
  });

  it("五年级语文上册（部编版显式版本）", () => {
    const { meta, confidence } = detectArchiveMeta("五年级语文上册_部编版.pdf");
    expect(confidence).toBe("high");
    expect(meta).toEqual({
      subject: "语文",
      version: "部编版",
      grade: "五年级",
      volume: "上册",
    });
  });
});

describe("detectArchiveMeta · 中置信（部分命中）", () => {
  it("只含学科+年级，无册次 → medium，册次回退上册", () => {
    const { meta, confidence } = detectArchiveMeta("四年级英语课件.pdf");
    expect(confidence).toBe("medium");
    expect(meta?.subject).toBe("英语");
    expect(meta?.grade).toBe("四年级");
    expect(meta?.volume).toBe("上册");
  });

  it("只含年级 → medium，学科留空待用户选", () => {
    const { meta, confidence } = detectArchiveMeta("Grade3_material.png");
    expect(confidence).toBe("medium");
    expect(meta?.grade).toBe("三年级");
    expect(meta?.subject).toBe("");
  });
});

describe("detectArchiveMeta · 低置信（未命中）", () => {
  it("无任何关键词 → meta null", () => {
    const { meta, confidence } = detectArchiveMeta("IMG_20260920_1420.jpg");
    expect(confidence).toBe("low");
    expect(meta).toBeNull();
  });

  it("空白名 → low", () => {
    const { meta, confidence } = detectArchiveMeta(".DS_Store");
    expect(confidence).toBe("low");
    expect(meta).toBeNull();
  });
});

describe("detectArchiveMeta · 版本默认（识别学科时）", () => {
  it("英语无显式版本 → 人教版默认", () => {
    const { meta } = detectArchiveMeta("英语四年级上册U03.pdf");
    expect(meta?.version).toBe("人教版");
  });

  it("音乐无显式版本 → 人音版默认", () => {
    const { meta } = detectArchiveMeta("音乐三年级下册_Lesson1.mp3");
    expect(meta?.version).toBe("人音版");
  });
});

describe("级联数据源", () => {
  it("学科全集含主科", () => {
    expect(ARCHIVE_SUBJECTS).toContain("英语");
    expect(ARCHIVE_SUBJECTS).toContain("语文");
    expect(ARCHIVE_SUBJECTS).toContain("数学");
  });

  it("英语学科版本候选含人教版/外研版", () => {
    expect(VERSIONS_BY_SUBJECT["英语"]).toContain("人教版");
    expect(VERSIONS_BY_SUBJECT["英语"]).toContain("外研版");
  });

  it("年级 1-6 / 册次上下", () => {
    expect(ARCHIVE_GRADES).toHaveLength(6);
    expect(ARCHIVE_VOLUMES).toEqual(["上册", "下册"]);
  });
});

describe("规则工具（§5.4 记忆偏好）", () => {
  it("detectPatternFor：去扩展名主干，特殊字符转义", () => {
    expect(detectPatternFor("U01_Greetings.mp4")).toBe("U01_Greetings");
    expect(detectPatternFor("a(b)[c].pdf")).toBe("a\\(b\\)\\[c\\]");
  });

  it("escapeRegex 转义正则元字符", () => {
    expect(escapeRegex("a+b?c")).toBe("a\\+b\\?c");
    expect(escapeRegex("plain.txt")).toBe("plain\\.txt");
  });

  it("ruleMatches：主干包含即命中（i 忽略大小写）", () => {
    expect(ruleMatches({ pattern: "U01_Greetings" }, "U01_Greetings.mp4")).toBe(true);
    expect(ruleMatches({ pattern: "u01_greetings" }, "U01_Greetings.mp4")).toBe(true);
    expect(ruleMatches({ pattern: "U02_Words" }, "U01_Greetings.mp4")).toBe(false);
  });

  it("ruleMatches：非法 pattern 静默 false", () => {
    expect(ruleMatches({ pattern: "([unclosed" }, "anything")).toBe(false);
  });
});

describe("fileKindLabel（§6.3 类型标签）", () => {
  it("按扩展名归类", () => {
    expect(fileKindLabel("a.pdf")).toBe("教材 PDF");
    expect(fileKindLabel("b.mp3")).toBe("音频");
    expect(fileKindLabel("c.mp4")).toBe("视频");
    expect(fileKindLabel("d.png")).toBe("课堂图片");
    expect(fileKindLabel("e.docx")).toBe("其它文件");
  });
});
