// 技巧教学关：步骤指示器 + 技巧名头图 + 分步引导（真实教学盘）+ 完成庆祝。
// 交互迁移自老版本 renderSkillView/skillNumTap：点步骤中的目标格 → 点数字，
// 命中 steps[i].cell && steps[i].num 才推进下一步；错点温和提示 shake，不计失误。

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ART_CELEBRATE } from "@/lib/art";
import { Board } from "./Board";
import { Overlay, Btn } from "./Overlay";
import { Card } from "./ui/kit";
import { LESSON_DATA, type Technique } from "@/lib/content";
import type { Grid, Size } from "@/lib/sudoku";
import { useStore } from "@/lib/store";

interface Props {
  skill: Technique;
  onExit: () => void;
  onComplete: (key: string) => void;
}

export function SkillLesson({ skill, onExit, onComplete }: Props) {
  const { playSound } = useStore();
  const lesson = LESSON_DATA[skill.key];
  const size: Size = lesson.size;
  const steps = lesson.steps;
  const stepCount = steps.length;
  const initial = useMemo(() => lesson.board.slice(), [lesson]);

  const [step, setStep] = useState(0);
  const [board, setBoard] = useState<Grid>(() => lesson.board.slice());
  const [picked, setPicked] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [shake, setShake] = useState(false);
  const [warn, setWarn] = useState<string | null>(null);

  const st = steps[Math.min(step, stepCount - 1)];
  const isLast = step === stepCount - 1;
  const given = useMemo(() => initial.map((v) => v > 0), [initial]);

  // 温和提示：shake + 临时替换引导文案（不计失误）
  function gentleHint(msg: string) {
    setShake(true);
    setWarn(msg);
    window.setTimeout(() => setShake(false), 400);
    window.setTimeout(() => setWarn(null), 1400);
  }

  function tapCell(i: number) {
    if (done) return;
    if (i === st.cell) {
      setPicked((p) => (p === i ? null : i));
      playSound("tap");
      return;
    }
    gentleHint("看高亮的地方，先点讲解里说的那个空格哦");
  }

  function fill(v: number) {
    if (done) return;
    if (picked !== st.cell) {
      gentleHint("先点讲解里说的那个空格，再选数字哦");
      return;
    }
    if (v === st.num) {
      const nb = board.slice();
      nb[st.cell] = v;
      setBoard(nb);
      setPicked(null);
      playSound("ok");
      if (isLast) {
        window.setTimeout(() => {
          setDone(true);
          playSound("badge");
        }, 320);
      } else {
        window.setTimeout(() => setStep((s) => s + 1), 320);
      }
    } else {
      gentleHint("看高亮的地方：已经有哪几个数？缺的就是答案哦");
    }
  }

  const adv = skill.tier === "adv";
  const band = adv ? "text-badge-adv" : "text-badge-base";
  const bandBg = adv ? "bg-badge-adv" : "bg-badge-base";
  const padReady = picked === st.cell;

  return (
    <div className="pb-4">
      {/* 顶栏 */}
      <div className="flex items-center gap-2 py-1.5">
        <Btn variant="ghost" size="icon" onClick={onExit} aria-label="返回" className="h-10 w-10 rounded-full text-[15px]">
          ←
        </Btn>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15.5px] font-bold leading-tight">{skill.name}</div>
          <div className="mt-0.5 truncate text-[10.5px] text-muted-foreground">教学关 · 不计入练习进度</div>
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", adv ? "bg-badge-adv/15" : "bg-badge-base/15", band)}>
          {adv ? "进阶" : "基础"}
        </span>
      </div>

      {/* 技巧名头图区 */}
      <Card tone="flat" pad="none" className="relative mb-3 overflow-hidden animate-card-in">
        <div className={cn("absolute inset-x-0 top-0 h-1", bandBg)} />
        <div className="flex items-center gap-3 p-3.5">
          <div className={cn("grid h-14 w-14 shrink-0 place-items-center text-[30px]", adv ? "rotate-45 rounded-xl bg-badge-adv/12" : "rounded-full bg-badge-base/12")}>
            <span className={adv ? "-rotate-45" : ""}>{skill.emoji}</span>
          </div>
          <div className="min-w-0">
            <p className="text-[17px] font-extrabold leading-tight">{skill.name}</p>
            <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{skill.brief}</p>
            <p className="mt-1 text-[10.5px] text-muted-foreground/80">建议适龄 {skill.grade} · {size}×{size} 教学盘</p>
          </div>
        </div>
      </Card>

      {/* 步骤指示器：贯穿式进度轨 + 剩余步数 */}
      <div className="mb-1 px-1">
        <div className="step-track gap-1.5">
          <span
            className="step-track-fill"
            style={{ width: `calc((100% - 24px) * ${stepCount > 1 ? Math.min(step, stepCount - 1) / (stepCount - 1) : 0})` }}
            aria-hidden
          />
          {steps.map((_, i) => (
            <span
              key={i}
              className={cn(
                "relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[10.5px] font-bold transition-colors duration-200",
                i < step
                  ? cn(bandBg, "border-transparent text-white")
                  : i === step
                    ? "border-2 border-primary bg-card text-primary"
                    : "border-border bg-card text-muted-foreground/60",
              )}
              aria-hidden
            >
              {i < step ? "✓" : i + 1}
            </span>
          ))}
        </div>
        <p className="mt-1.5 flex items-center justify-between px-0.5">
          <span className="tnum text-[11px] font-semibold text-muted-foreground">
            第 {Math.min(step + 1, stepCount)} 步 / 共 {stepCount} 步
          </span>
          <span className={cn("text-[11px] font-semibold", done ? "text-success" : "text-muted-foreground")}>
            {done ? "全部完成" : `还有 ${Math.max(0, stepCount - step - 1)} 步`}
          </span>
        </p>
      </div>

      {/* 引导文案 */}
      <div
        className={cn(
          "mb-3 rounded-2xl border-l-4 bg-secondary/70 px-3.5 py-3 text-[13px] leading-relaxed transition-all",
          shake ? "animate-flash-wrong border-warning" : cn(isLast ? "border-success" : "border-primary"),
        )}
        role="status"
        aria-live="polite"
      >
        {done ? "🎉 你已经掌握这一步了，可以试着在自由练习里用上它。" : warn ?? st.text}
      </div>

      {/* 教学盘（真实盘面） */}
      <Board
        size={size}
        board={board}
        given={given}
        selected={picked}
        notes={{}}
        peerGuide={st.hl}
        target={done ? null : st.cell}
        okCell={done ? steps[stepCount - 1].cell : null}
        onPick={tapCell}
      />

      {/* 数字条（选中目标格后开放） */}
      <div className={cn("mt-3 transition-opacity", !padReady && "pointer-events-none opacity-45")}>
        <div className="mb-1.5 px-1 text-[10.5px] font-medium text-muted-foreground">
          {padReady ? "现在点一个数字，填进你选中的格子" : "先按讲解点选蓝色提示格，再点要填的数字"}
        </div>
        <div className="flex justify-center">
          {Array.from({ length: size }, (_, k) => k + 1).map((v) => (
            <button
              key={v}
              type="button"
              disabled={!padReady}
              onClick={() => fill(v)}
              aria-label={`填入 ${v}`}
              className={cn(
                "press mx-[3px] h-[52px] min-w-[44px] flex-1 max-w-[64px] rounded-xl border border-border bg-secondary text-[19px] font-bold tnum text-primary",
                !padReady && "opacity-50",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 px-1 text-[11px] leading-relaxed text-muted-foreground">
        教学关里的错填不会记入失误，也不会影响任何成绩 —— 尽管试。
      </p>

      <Overlay
        open={done}
        title={adv ? `${skill.emoji} 进阶徽章点亮！` : `🎉 学会啦！`}
        sub={`${skill.name} · ${skill.brief}`}
        footer={
          <>
            <Btn variant="primary" size="lg" className="full w-full" onClick={() => onComplete(skill.key)}>
              收下徽章，继续
            </Btn>
            <Btn variant="ghost" onClick={onExit} className="w-full">
              回首页
            </Btn>
          </>
        }
      >
        <div className="flex flex-col items-center gap-3 py-2">
          <img src={ART_CELEBRATE} alt="" aria-hidden className="animate-star-pop h-[92px] w-[92px] object-contain" />
          <div className={cn("grid h-16 w-16 place-items-center text-[30px] shadow-lift", adv ? "rotate-45 rounded-2xl bg-badge-adv/12" : "rounded-full bg-badge-base/12")}>
            <span className={adv ? "-rotate-45" : ""}>{skill.emoji}</span>
          </div>
          <p className={cn("text-[13px] font-bold", band)}>{skill.name}</p>
          <p className="max-w-[260px] text-center text-[11.5px] leading-relaxed text-muted-foreground">
            记住这条推理路径：下次遇到相似的形状，先想它。
          </p>
        </div>
      </Overlay>
    </div>
  );
}