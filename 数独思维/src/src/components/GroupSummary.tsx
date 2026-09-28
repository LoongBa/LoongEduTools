// 组内成果小结（V1.7.0 B5）：同类专项连做做完一组后，展示共练几题 / 全对几道 / 总用时 + 每题星级明细。
// 数据由 index.tsx groupSession.results 在组内推进时累积，本组件纯展示（复用 Overlay 壳 + 表格）。

import { cn } from "@/lib/utils";
import { Overlay, Btn, formatMs } from "./Overlay";
import { GROUP_SUMMARY_TITLE, GROUP_SUMMARY_STAT, GROUP_SUMMARY_ROW, GROUP_SUMMARY_BACK, GROUP_SUMMARY_AGAIN, GROUP_SUMMARY_HOME } from "@/lib/copy";
import type { GroupItemResult } from "./Practice";

interface Props {
  session: {
    gid: string;
    list: { size: number; level: string }[];
    idx: number;
    results: GroupItemResult[];
  };
  onBack: () => void;
  onAgain: () => void;
  onHome: () => void;
}

export function GroupSummaryOverlay({ session, onBack, onAgain, onHome }: Props) {
  const done = session.results.length;
  const perfect = session.results.filter((r) => r.stars === 3).length;
  const totalMs = session.results.reduce((s, r) => s + r.ms, 0);

  return (
    <Overlay
      open
      title={GROUP_SUMMARY_TITLE}
      sub={`${session.list.length} 道同类题巩固完成，看看这一组的表现。`}
      footer={
        <>
          <Btn variant="secondary" size="lg" className="w-full" onClick={onBack}>
            {GROUP_SUMMARY_BACK}
          </Btn>
          <Btn variant="primary" size="lg" className="w-full" onClick={onAgain}>
            {GROUP_SUMMARY_AGAIN}
          </Btn>
          <Btn variant="ghost" size="lg" className="w-full" onClick={onHome}>
            {GROUP_SUMMARY_HOME}
          </Btn>
        </>
      }
    >
      {/* 统计条 */}
      <div className="rounded-xl bg-secondary/50 px-3 py-2.5 text-center">
        <p className="text-[13.5px] font-bold leading-tight">{GROUP_SUMMARY_STAT(done, perfect, formatMs(totalMs))}</p>
      </div>

      {/* 每题明细 */}
      <div className="mt-3 space-y-1.5">
        {session.results.map((r, i) => (
          <div key={i} className="flex items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2">
            <span className="w-14 shrink-0 text-[12px] font-semibold text-muted-foreground">{GROUP_SUMMARY_ROW(i)}</span>
            <span className="text-[14px] leading-none" aria-label={`${r.stars} 星`}>
              {[0, 1, 2].map((s) => (
                <span key={s} className={cn(s < r.stars ? "text-star" : "text-muted-foreground/30")}>
                  {s < r.stars ? "★" : "☆"}
                </span>
              ))}
            </span>
            <span className="tnum ml-auto text-[12px] font-bold text-foreground">{formatMs(r.ms)}</span>
            <span className="tnum w-12 shrink-0 text-right text-[11px] text-muted-foreground">
              {r.errors > 0 ? `失误 ${r.errors}` : "0 失误"}
            </span>
          </div>
        ))}
      </div>
    </Overlay>
  );
}
