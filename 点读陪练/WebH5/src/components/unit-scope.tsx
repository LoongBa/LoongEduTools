// 单元作用域：默认只读显示「当前单元 + 年级册次」；switchable 时出切换按钮组。
// 被 首页(首次引导/后续) / 词卡 / 打印 / 我的 共用；"我的"是唯一保留切换的入口。
import { UNIT_ROWS, gradeLabelFor, unitOf } from "@/data/content";
import { useProgress } from "@/lib/store";
import { GradeBadge } from "@/components/icons";
import { Panel } from "./ui-kit";
import { cn } from "@/lib/utils";

export function UnitScope({
  switchable = false,
  title,
  note,
  className,
  onPick,
}: {
  /** true=出单元切换按钮组（首页首次引导 / 我的页） */
  switchable?: boolean;
  /** 左侧标题文字；默认 switchable ? "切换单元" : "当前单元" */
  title?: string;
  /** 标题下的小字说明 */
  note?: string;
  /** 透传给容器卡片（如首页引导的暖色左边条） */
  className?: string;
  /** 切换按钮点击后的额外副作用（首页用它结束首次引导态） */
  onPick?: () => void;
}) {
  const p = useProgress();
  const unit = unitOf(p.state.unitId);
  const head = title ?? (switchable ? "切换单元" : "当前单元");

  return (
    <Panel className={cn("px-4 py-3.5", className)}>
      {/* 标题行：左标题 右册次标签 */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <p className="text-[15px] font-bold leading-snug">{head}</p>
        <GradeBadge label={gradeLabelFor()} />
      </div>
      {note && <p className="mt-1 text-[14px] leading-relaxed text-muted-text">{note}</p>}

      {switchable ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {UNIT_ROWS.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => {
                p.setUnit(u.id);
                onPick?.();
              }}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[14px] font-semibold transition-colors duration-200",
                u.id === p.state.unitId
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent",
              )}
            >
              U{u.no} {u.cn}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-2.5 flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-[14px] font-bold text-primary-foreground">
            U{unit.no}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[16px] font-bold leading-tight">{unit.title || unit.cn}</span>
            {unit.title && (
              <span className="mt-0.5 block truncate text-[13px] leading-snug text-muted-text">{unit.cn}</span>
            )}
          </span>
        </div>
      )}
    </Panel>
  );
}