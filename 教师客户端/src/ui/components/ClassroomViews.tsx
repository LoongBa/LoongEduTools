// 其余视图：应用 / 一键开课 / 班级看板 / 打卡单 / 复盘本 / 纪律（占位）+ 计时器、抽卡分组（可用）
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Dices,
  LayoutDashboard,
  NotebookPen,
  Pause,
  Play,
  RefreshCw,
  Rocket,
  ShieldAlert,
  SkipForward,
  Timer as TimerIcon,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MOCK_STUDENTS } from "@/lib/mockData";

// ── 通用占位壳 ──
function Placeholder({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: typeof BookOpen;
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

function EmptyCards({ n, label }: { n: number; label: string }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="rounded-xl border border-dashed border-border bg-card/50 p-4">
          <div className="h-3 w-2/3 rounded bg-muted" />
          <div className="mt-2 h-2.5 w-1/2 rounded bg-muted/70" />
          <p className="mt-3 text-[11px] text-muted-foreground">{label}</p>
        </div>
      ))}
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

// ── 班级看板 / 打卡单 / 复盘本 / 纪律：占位 ──
export function BoardView() {
  return (
    <Placeholder icon={LayoutDashboard} title="班级看板" desc="出勤、积分与课堂表现总览。">
      <EmptyCards n={3} label="看板卡片占位 —— 本期聚焦导航/下载扩展/工具箱三项需求" />
    </Placeholder>
  );
}
export function CheckinView() {
  return (
    <Placeholder icon={Play} title="打卡单" desc="布置与查看课后打卡任务（支持打印）。">
      <EmptyCards n={3} label="打卡单列表占位" />
    </Placeholder>
  );
}
export function ReflectionView() {
  return (
    <Placeholder icon={NotebookPen} title="复盘本" desc="每节课后的教学复盘记录（支持打印）。">
      <EmptyCards n={2} label="复盘条目占位" />
    </Placeholder>
  );
}
export function DisciplineView() {
  return (
    <Placeholder icon={ShieldAlert} title="纪律" desc="课堂纪律积分与提醒工具。">
      <EmptyCards n={2} label="纪律面板占位" />
    </Placeholder>
  );
}

// ── 计时器：可用倒计时 ──
const PRESETS = [60, 180, 300, 600];

export function TimerView() {
  const [total, setTotal] = useState(300);
  const [left, setLeft] = useState(300);
  const [running, setRunning] = useState(false);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          setRunning(false);
          toast.success("时间到！");
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => {
      window.clearInterval(id);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [running]);

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const pct = total > 0 ? (left / total) * 100 : 0;

  return (
    <Placeholder icon={TimerIcon} title="计时器" desc="课堂活动倒计时，投屏时学生也能看到剩余时间。">
      <div className="mx-auto flex max-w-sm flex-col items-center rounded-2xl border border-border bg-card p-8 shadow-sm">
        <p className="font-display text-[64px] font-bold tabular-nums leading-none tracking-tight">
          {mm}
          <span className="text-muted-foreground">:</span>
          {ss}
        </p>
        <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className={cn(
                "min-h-9 rounded-full border px-3 text-[12px] tabular-nums transition-colors",
                total === p ? "border-primary bg-primary/10 font-medium text-primary" : "border-input bg-card text-muted-foreground hover:bg-accent",
              )}
              onClick={() => {
                setTotal(p);
                setLeft(p);
                setRunning(false);
              }}
            >
              {p >= 60 ? `${p / 60} 分钟` : `${p} 秒`}
            </button>
          ))}
        </div>
        <div className="mt-6 flex w-full gap-2">
          <button
            type="button"
            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary text-[14px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
            onClick={() => setRunning((r) => !r)}
          >
            {running ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden />}
            {running ? "暂停" : left === 0 ? "重新开始" : "开始"}
          </button>
          <button
            type="button"
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-input bg-card px-4 text-[14px] transition-colors hover:bg-accent"
            onClick={() => {
              setRunning(false);
              setLeft(total);
            }}
          >
            <RefreshCw size={14} aria-hidden />重置
          </button>
        </div>
      </div>
    </Placeholder>
  );
}

// ── 抽卡分组：可用 ──
export function LotteryView() {
  const [picked, setPicked] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[][]>([]);

  const drawOne = () => {
    const rest = MOCK_STUDENTS.filter((s) => !picked.includes(s));
    if (rest.length === 0) {
      toast.info("本轮已全部抽完，点击「重新洗牌」再来");
      return;
    }
    const name = rest[Math.floor(Math.random() * rest.length)];
    setPicked((p) => [...p, name]);
    toast(`🎴 ${name}`);
  };

  const shuffleGroups = () => {
    const pool = [...MOCK_STUDENTS].sort(() => Math.random() - 0.5);
    const g: string[][] = [[], [], [], []];
    pool.forEach((s, i) => g[i % 4].push(s));
    setGroups(g);
    setPicked([]);
  };

  return (
    <Placeholder icon={Dices} title="抽卡分组" desc="随机点名学生或一键分组，活跃课堂气氛。">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-5 text-[14px] font-medium text-primary-foreground transition-all hover:opacity-90 active:scale-[0.98]"
          onClick={drawOne}
        >
          <Dices size={15} aria-hidden />抽一位同学
        </button>
        <button
          type="button"
          className="flex min-h-11 items-center gap-1.5 rounded-xl border border-input bg-card px-5 text-[14px] transition-colors hover:bg-accent"
          onClick={shuffleGroups}
        >
          <Users size={15} aria-hidden />随机分成 4 组
        </button>
        <button
          type="button"
          className="flex min-h-11 items-center gap-1.5 rounded-xl border border-input bg-card px-5 text-[14px] text-muted-foreground transition-colors hover:bg-accent"
          onClick={() => {
            setPicked([]);
            setGroups([]);
          }}
        >
          <SkipForward size={15} aria-hidden />清空
        </button>
      </div>

      {picked.length > 0 && (
        <section className="mt-6">
          <h3 className="mb-2 text-[13px] font-semibold text-muted-foreground">已抽中（{picked.length}/{MOCK_STUDENTS.length}）</h3>
          <div className="flex flex-wrap gap-2">
            {picked.map((n, i) => (
              <span
                key={n}
                className={cn(
                  "reveal min-h-9 rounded-lg border px-3 py-1.5 text-[13px]",
                  i === picked.length - 1
                    ? "border-primary bg-primary/10 font-semibold text-primary"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                {n}
              </span>
            ))}
          </div>
        </section>
      )}

      {groups.length > 0 && (
        <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map((g, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
              <h4 className="mb-2 text-[13px] font-bold text-brand">第 {i + 1} 组</h4>
              <ul className="space-y-1 text-[13px] text-muted-foreground">
                {g.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </Placeholder>
  );
}
