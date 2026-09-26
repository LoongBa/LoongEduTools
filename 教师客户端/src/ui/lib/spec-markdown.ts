// 把需求文档的结构化真源序列化为 Markdown，供纯文本分发（与网页渲染共用同一份数据）
import { SPEC_META, SPEC_SECTIONS } from "./specContent";
import type { SpecBlockOrHeading } from "./types";

function blockToMd(b: SpecBlockOrHeading): string {
  switch (b.t) {
    case "h":
      return `### ${b.text}`;
    case "p":
      return b.text;
    case "ul":
      return b.items.map((i) => `- ${i}`).join("\n");
    case "note": {
      const tag = b.tone === "warn" ? "⚠️" : b.tone === "ok" ? "✅" : "ℹ️";
      return `> ${tag} ${b.text}`;
    }
    case "table": {
      const head = `| ${b.cols.join(" | ")} |`;
      const sep = `| ${b.cols.map(() => "---").join(" | ")} |`;
      const rows = b.rows.map((r) => `| ${r.map((c) => c.replace(/\|/g, "\\|")).join(" | ")} |`);
      return [head, sep, ...rows].join("\n");
    }
  }
}

export function specToMarkdown(): string {
  const parts: string[] = [
    `# ${SPEC_META.title}`,
    "",
    `**${SPEC_META.subtitle}**`,
    "",
    `- 版本：${SPEC_META.version}`,
    `- 日期：${SPEC_META.date}`,
    `- 编写：${SPEC_META.author}`,
    "",
    "---",
  ];
  for (const s of SPEC_SECTIONS) {
    parts.push("", `## ${s.title}`, "");
    for (const b of s.blocks) parts.push(blockToMd(b), "");
  }
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/** 触发浏览器下载 .md 文件 */
export function downloadSpecMarkdown(): void {
  const blob = new Blob([specToMarkdown()], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "桃李助手-教师客户端-v0.3-需求分析与功能设计方案.md";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
