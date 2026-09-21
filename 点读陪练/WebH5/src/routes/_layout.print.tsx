// 打印小单：A4 黑白线稿（句卡 / PBL 模板 / 检验记录单 / 单元地图 / 练习小单含背面答案）
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { UNIT_ROWS, shuffled, stageLabel, unitOf, type Stage } from "@/data/content";
import { useProgress } from "@/lib/store";
import { Btn, PageHead, Panel } from "@/components/ui-kit";
import { PrintIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_layout/print")({
  component: PrintPage,
});

type Template = "cards" | "pbl" | "record" | "map" | "sheet";

const TEMPLATES: { k: Template; t: string; note: string }[] = [
  { k: "cards", t: "句卡页", note: "剪下来当桌面卡" },
  { k: "pbl", t: "PBL 模板", note: "一个小任务的三步" },
  { k: "record", t: "检验记录单", note: "四项能力打勾" },
  { k: "map", t: "单元地图", note: "一周路线一览" },
  { k: "sheet", t: "练习小单", note: "题目 + 背面答案" },
];

function PrintPage() {
  const p = useProgress();
  const [tpl, setTpl] = useState<Template>("cards");
  const [unitId, setUnitId] = useState(p.state.unitId);
  const unit = unitOf(unitId);

  return (
    <div className="flex flex-col gap-4">
      <PageHead
        eyebrow="离线版 · 无屏补充"
        title="打印小单"
        desc="A4 黑白线稿，家长在家就能打印。预览所见即所得。"
        right={
          <Btn size="sm" onClick={() => window.print()}>
            <PrintIcon className="h-4 w-4" />
            打印
          </Btn>
        }
      />

      {/* 选择器（不参与打印） */}
      <div className="no-print flex flex-col gap-2.5">
        <div className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1">
          {TEMPLATES.map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => setTpl(t.k)}
              className={cn(
                "shrink-0 snap-start rounded-2xl px-3.5 py-2 text-left transition-colors duration-200",
                t.k === tpl ? "bg-foreground text-background" : "bg-secondary text-secondary-foreground",
              )}
            >
              <span className="block text-[14px] font-bold leading-tight">{t.t}</span>
              <span className={cn("block text-[11px]", t.k === tpl ? "opacity-75" : "text-muted-text")}>
                {t.note}
              </span>
            </button>
          ))}
        </div>
        <div className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1">
          {UNIT_ROWS.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setUnitId(u.id)}
              className={cn(
                "shrink-0 snap-start rounded-full px-3.5 py-1.5 text-[14px] font-semibold transition-colors duration-200",
                u.id === unitId ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
              )}
            >
              U{u.no} {u.cn}
            </button>
          ))}
        </div>
      </div>

      {/* A4 纸张预览 */}
      <Panel className="print-sheet overflow-hidden border-border/60 p-0 sm:p-6">
        <div className="mx-auto w-full max-w-[210mm] bg-white p-5 text-[#111] sm:p-8">
          {tpl === "cards" && <CardsSheet unit={unit} />}
          {tpl === "pbl" && <PblSheet unit={unit} />}
          {tpl === "record" && <RecordSheet unit={unit} />}
          {tpl === "map" && <MapSheet unit={unit} />}
          {tpl === "sheet" && <PracticeSheet unit={unit} />}
        </div>
      </Panel>

      <p className="no-print px-1 text-[13px] leading-relaxed text-muted-text">
        提示：练习小单的题目与答案分在两页，沿中线裁开即可；打印时选「黑白」或「灰度」效果最好。
      </p>
    </div>
  );
}

/* ---------------------------- 共用线稿样式 ---------------------------- */
const LINE = "border border-[#111]";
const BOX = "rounded-sm border border-[#111]";

function SheetHead({ title, sub }: { title: string; sub: string }) {
  return (
    <header className="mb-5 flex items-end justify-between gap-4 border-b-2 border-[#111] pb-2">
      <div>
        <h2 className="text-[20px] font-bold leading-tight">{title}</h2>
        <p className="mt-0.5 text-[12px] uppercase tracking-wide">{sub}</p>
      </div>
      <div className="text-right text-[11px] leading-snug">
        <p>姓名 ____________</p>
        <p>日期 ____ / ____ / ______</p>
      </div>
    </header>
  );
}

type UnitLike = ReturnType<typeof unitOf>;

/* ------------------------------ ① 句卡页 ------------------------------ */
function CardsSheet({ unit }: { unit: UnitLike }) {
  return (
    <section>
      <SheetHead title={`句卡 · Unit ${unit.no} ${unit.title}`} sub="cut along the dashed lines" />
      <ul className="grid grid-cols-2 gap-3">
        {unit.cards.map((c) => (
          <li key={c.id} className={cn(BOX, "dashed flex flex-col justify-between p-3 min-h-[104px]")}>
            <p className="text-[15px] font-bold leading-snug">{c.en}</p>
            <p className="mt-2 text-[12px]">{c.cn}</p>
            <p className="mt-2 text-[10px] uppercase tracking-wide">
              {c.words.map((w) => w.text).join(" · ")}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ----------------------------- ② PBL 模板 ---------------------------- */
function PblSheet({ unit }: { unit: UnitLike }) {
  return (
    <section>
      <SheetHead title={`PBL 三步卡 · ${unit.cn}`} sub="ask · try · show" />
      <ol className="space-y-4">
        {[
          { t: "第一步：提出问题 Ask", h: "我最想知道的一件小事是", n: 2 },
          { t: "第二步：试一试 Try", h: "我用英文说出三个办法", n: 3 },
          { t: "第三步：展示给家人 Show", h: "我做完之后想说的是", n: 2 },
        ].map((s) => (
          <li key={s.t}>
            <p className="text-[14px] font-bold">{s.t}</p>
            <p className="mt-1 text-[12px]">{s.h}：</p>
            {Array.from({ length: s.n }).map((_, i) => (
              <p key={i} className="mt-4 border-b border-[#111]" />
            ))}
          </li>
        ))}
      </ol>
      <p className="mt-6 text-[11px]">今天我说到的英文词：____________________________________</p>
    </section>
  );
}

/* --------------------------- ③ 检验记录单 --------------------------- */
function RecordSheet({ unit }: { unit: UnitLike }) {
  return (
    <section>
      <SheetHead title={`检验记录单 · Unit ${unit.no}`} sub="weekly check" />
      <table className={cn("w-full border-collapse text-[12px]")}>
        <thead>
          <tr>
            {["能力", "孩子自己说", "我能做到", "基本可以", "需要帮助"].map((h) => (
              <th key={h} className={cn(LINE, "px-2 py-1.5 text-left font-bold")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {unit.skills.map((s) => (
            <tr key={s.id}>
              <td className={cn(LINE, "px-2 py-2 align-top")}>
                <p className="font-bold">{s.no}. {s.name}</p>
                <p className="mt-0.5 text-[11px]">{s.task}</p>
              </td>
              <td className={cn(LINE, "px-2 py-2")}>
                <p className="h-10 border-b border-dashed border-[#111]" />
              </td>
              {["□", "□", "□"].map((b, i) => (
                <td key={i} className={cn(LINE, "px-2 py-2 text-center text-[16px]")}>
                  {b}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-5 text-[12px]">下周想再练的一件事：______________________________________</p>
      <p className="mt-6 text-[11px]">家长签名 ____________　陪练时长 ______ 分钟</p>
    </section>
  );
}

/* ----------------------------- ④ 单元地图 ---------------------------- */
function MapSheet({ unit }: { unit: UnitLike }) {
  // 天 → 环节的真实分配：8 张句卡（warm2/new3/drill2/wrap1）分五天，每天一个主环节
  const days: { label: string; stage: Stage }[] = [
    { label: "Day1 复习+新学", stage: "warm" },
    { label: "Day2 说出来", stage: "new" },
    { label: "Day3 我来问", stage: "new" },
    { label: "Day4 说长一点", stage: "drill" },
    { label: "Day5 串起来", stage: "wrap" },
  ];
  return (
    <section>
      <SheetHead title={`单元地图 · Unit ${unit.no} ${unit.cn}`} sub="one week route" />
      <ol className="grid grid-cols-5 gap-2">
        {days.map((d) => (
          <li key={d.label} className={cn(BOX, "p-2 text-center")}>
            <p className="text-[11px] font-bold leading-tight">{d.label}</p>
            <p className="mt-1 text-[10px]">
              {stageLabel(d.stage)} · {unit.cards.filter((c) => c.stage === d.stage).length} 句
            </p>
            <p className="mt-2 h-6 border-t border-dashed border-[#111]" />
          </li>
        ))}
      </ol>
      <p className="mt-5 text-[13px] font-bold">本周要认识的词</p>
      <ul className="mt-2 grid grid-cols-4 gap-2 text-[12px]">
        {unit.words.map((w) => (
          <li key={w.word} className={cn(BOX, "px-2 py-1.5")}>
            <p className="font-bold">{w.word}</p>
            <p className="text-[10px]">{w.cn}</p>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-[12px]">周末的小阅兵：把四项能力各说一遍，让家人在记录单上打勾。</p>
    </section>
  );
}

/* ---------------------------- ⑤ 练习小单 ---------------------------- */
function PracticeSheet({ unit }: { unit: UnitLike }) {
  const items = unit.cards.slice(0, 6);
  // 连线题：右列乱序（按单元号取种子，保证同一单元每次打印结果一致）
  const pairs = unit.words.slice(0, 5);
  const answers = shuffled(pairs, unit.no);
  return (
    <>
      <section>
        <SheetHead title={`练习小单 · Unit ${unit.no}`} sub="part 1 · questions" />
        <ol className="space-y-4 text-[13px]">
          <li>
            <p className="font-bold">一、把单词和中文连起来</p>
            <div className="mt-2 grid grid-cols-2 gap-x-6">
              <ul className="space-y-2">
                {pairs.map((w) => (
                  <li key={w.word}>{w.word}</li>
                ))}
              </ul>
              <ul className="space-y-2">
                {answers.map((w) => (
                  <li key={w.word} className="text-right">
                    （　）{w.cn}
                  </li>
                ))}
              </ul>
            </div>
          </li>
          <li>
            <p className="font-bold">二、把句子补完整</p>
            <ol className="mt-2 space-y-3 list-decimal pl-5">
              {items.map((c) => {
                const target = c.words[0]?.text ?? "";
                const blanked = target ? c.en.replace(new RegExp(`\\b${target}\\b`, "i"), "__________") : c.en;
                return (
                  <li key={c.id}>
                    <p>{blanked}</p>
                    <p className="text-[11px]">{c.cn}</p>
                  </li>
                );
              })}
            </ol>
          </li>
          <li>
            <p className="font-bold">三、写出你今天的三句话</p>
            {Array.from({ length: 3 }).map((_, i) => (
              <p key={i} className="mt-5 border-b border-[#111]" />
            ))}
          </li>
        </ol>
      </section>

      <section className="print-break">
        <SheetHead title={`练习小单 · Unit ${unit.no} 答案`} sub="part 2 · answers (cut here)" />
        <p className="border-b border-dashed border-[#111] pb-1 text-[11px]">沿虚线裁开，答案留给家长</p>
        <ol className="mt-4 space-y-3 text-[12px]">
          <li>
            <p className="font-bold">一、连线答案</p>
            <p>{pairs.map((w) => `${w.word} — ${w.cn}`).join("；")}</p>
            <p className="mt-1 text-[11px]">
              右列从左到右依次是：{answers.map((w) => w.cn).join("、")}
            </p>
          </li>
          <li>
            <p className="font-bold">二、补全答案</p>
            <ol className="list-decimal pl-5">
              {items.map((c) => (
                <li key={c.id}>{c.en}</li>
              ))}
            </ol>
          </li>
          <li>
            <p className="font-bold">三、开放题</p>
            <p>只要说出完整的一句英文即可，语法小错不必纠正，先接住再示范。</p>
          </li>
        </ol>
      </section>
    </>
  );
}
