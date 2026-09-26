// 一键开课视图（设计源 ClassroomViews 中唯一存活导出；其余课堂工具视图：
// 抽卡/班级看板/打卡单/复盘本/计时器/纪律 均用壳端根目录真实实现，见 Shell.tsx）
import { Rocket } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── 通用占位壳 ──
function Placeholder({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: typeof Rocket;
  title: string;
  desc: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-6 py-8 max-md:px-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <Icon size={19} aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-[16px] font-bold">{title}</h2>
          <p className="text-[12px] text-muted-foreground">{desc}</p>
        </div>
      </div>
      <div className="mt-6 flex-1">{children}</div>
    </div>
  );
}

// ── 一键开课 ──
export function QuickstartView() {
  return (
    <Placeholder icon={Rocket} title="一键开课" desc="选择课件、点名册与课程表，一次点击完成课前准备。">
      <div className="space-y-3">
        {["加载今日课表", "同步班级点名册", "打开配套课件"].map((s, i) => (
          <div key={s} className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-card px-4 shadow-sm">
            <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold", i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 whitespace-nowrap text-[13px]">{s}</span>
            <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">{i === 0 ? "就绪" : "待执行"}</span>
          </div>
        ))}
        <button
          type="button"
          className="min-h-11 w-full rounded-xl bg-primary text-[14px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
          onClick={() => toast.success("演示环境：真实客户端将按课程表自动拉起课件")}
        >
          开始上课
        </button>
      </div>
    </Placeholder>
  );
}