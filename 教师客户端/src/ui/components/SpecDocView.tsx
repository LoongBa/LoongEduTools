// 需求文档阅读页：左侧粘性目录（锚点跳转 + 滚动高亮）+ 右侧长文正文，支持导出 Markdown
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Info, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SPEC_META, SPEC_SECTIONS } from "@/lib/specContent";
import { downloadSpecMarkdown } from "@/lib/spec-markdown";
import type { SpecBlockOrHeading } from "@/lib/types";

/** 行内标记渲染：`code` 与 **粗**；不引入 markdown 库，保持轻量 */
function Inline({ text }: { text: string }) {
  const nodes = useMemo(() => {
    const out: React.ReactNode[] = [];
    const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let k = 0;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push(text.slice(last, m.index));
      const tok = m[0];
      if (tok.startsWith("**")) out.push(<strong key={k++} className="font-semibold text-foreground">{tok.slice(2, -2)}</strong>);
      else out.push(<code key={k++} className="rounded bg-muted px-1 py-px font-mono text-[0.92em] text-foreground/90">{tok.slice(1, -1)}</code>);
      last = m.index + tok.length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }, [text]);
  return <>{nodes}</>;
}

const NOTE_STYLE = {
  warn: { cls: "border-warn/40 bg-warn/8 text-foreground", Icon: AlertTriangle, icls: "text-warn" },
  info: { cls: "border-border bg-muted/40 text-foreground", Icon: Info, icls: "text-brand" },
  ok: { cls: "border-ok/40 bg-ok/8 text-foreground", Icon: CheckCircle2, icls: "text-ok" },
} as const;

function Block({ b }: { b: SpecBlockOrHeading }) {
  switch (b.t) {
    case "h":
      return <h3 className="mt-6 mb-2 text-[14px] font-bold tracking-wide text-foreground">{b.text}</h3>;
    case "p":
      return <p className="mb-2.5 text-[13.5px] leading-[1.85] text-foreground/90"><Inline text={b.text} /></p>;
    case "ul":
      return (
        <ul className="mb-3 space-y-1.5">
          {b.items.map((it, i) => (
            <li key={i} className="flex gap-2 text-[13.5px] leading-[1.8] text-foreground/90">
              <span className="mt-[10px] size-1 shrink-0 rounded-full bg-brand/70" aria-hidden />
              <span><Inline text={it} /></span>
            </li>
          ))}
        </ul>
      );
    case "note": {
      const s = NOTE_STYLE[b.tone];
      return (
        <div className={cn("mb-3 flex gap-2 rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed", s.cls)}>
          <s.Icon size={14} aria-hidden className={cn("mt-0.5 shrink-0", s.icls)} />
          <span><Inline text={b.text} /></span>
        </div>
      );
    }
    case "table":
      return (
        <div className="mb-3.5 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[520px] border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="bg-muted/60">
                {b.cols.map((c) => (
                  <th key={c} className="whitespace-nowrap border-b border-border px-3 py-2 font-semibold text-foreground">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i} className="odd:bg-card even:bg-muted/20">
                  {r.map((cell, j) => (
                    <td key={j} className={cn("border-b border-border/70 px-3 py-2 align-top leading-relaxed text-foreground/85", j === 0 && "font-medium text-foreground")}>
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export function SpecDocView() {
  const [active, setActive] = useState(SPEC_SECTIONS[0].id);

  // 滚动定位当前章节（监听主内容容器）
  useEffect(() => {
    const scroller = document.getElementById("spec-scroller");
    if (!scroller) return;
    const onScroll = () => {
      const top = scroller.getBoundingClientRect().top + 96;
      let cur = SPEC_SECTIONS[0].id;
      for (const s of SPEC_SECTIONS) {
        const el = document.getElementById(`sec-${s.id}`);
        if (el && el.getBoundingClientRect().top <= top) cur = s.id;
      }
      setActive((a) => (a === cur ? a : cur));
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  const goto = (id: string) => {
    document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex h-full min-h-0">
      {/* 目录：桌面粘性侧列，移动端隐藏 */}
      <nav
        aria-label="文档目录"
        className="hidden w-52 shrink-0 overflow-y-auto border-r border-border bg-card/40 px-3 py-4 lg:block print-hide"
      >
        <p className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <ScrollText size={11} aria-hidden />目录
        </p>
        <ul role="list" className="space-y-0.5">
          {SPEC_SECTIONS.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => goto(s.id)}
                aria-current={active === s.id ? "true" : undefined}
                className={cn(
                  "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] leading-snug transition-colors",
                  active === s.id
                    ? "bg-brand-soft font-medium text-brand"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <span className="mt-px w-4 shrink-0 tabular-nums opacity-60">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{s.title.replace(/^[一二三四五六七八九]、/, "")}</span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => {
            downloadSpecMarkdown();
            toast.success("已导出 Markdown 版需求文档");
          }}
          className="mt-4 flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md border border-input bg-card px-2 text-[12.5px] text-foreground transition-colors hover:bg-accent"
        >
          <Download size={12} aria-hidden />下载 .md
        </button>
      </nav>

      {/* 正文 */}
      <div id="spec-scroller" className="min-w-0 flex-1 overflow-y-auto px-6 py-5 max-md:px-4">
        <header className="mx-auto max-w-3xl border-b border-border pb-5">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-[22px] font-bold tracking-wide text-foreground">{SPEC_META.title}</h1>
              <p className="mt-1 text-[13.5px] text-muted-foreground">{SPEC_META.subtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                downloadSpecMarkdown();
                toast.success("已导出 Markdown 版需求文档");
              }}
              className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3.5 text-[13px] text-primary-foreground transition-opacity hover:opacity-90 lg:hidden"
            >
              <Download size={13} aria-hidden />下载 .md
            </button>
          </div>
          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted-foreground">
            {[
              ["版本", SPEC_META.version],
              ["日期", SPEC_META.date],
              ["编写", SPEC_META.author],
              ["交接对象", "Windows 桌面客户端开发方"],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-1">
                <dt>{k}</dt>
                <dd className="tabular-nums text-foreground/80">{v}</dd>
              </div>
            ))}
          </dl>
        </header>

        <article className="mx-auto max-w-3xl pt-2">
          {SPEC_SECTIONS.map((s) => (
            <section key={s.id} id={`sec-${s.id}`} className="scroll-mt-4 border-b border-border/60 py-5 last:border-0">
              <h2 className="mb-3 font-display text-[17px] font-bold tracking-wide text-foreground">{s.title}</h2>
              {s.blocks.map((b, i) => (
                <Block key={i} b={b} />
              ))}
            </section>
          ))}
          <p className="py-6 text-center text-[11.5px] text-muted-foreground">
            本文档由网页演示原型沉淀而成 · 字段与常量以原型源码为准
          </p>
        </article>
      </div>
    </div>
  );
}
