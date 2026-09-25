/**
 * R16 教学复盘记录本（D08 §3.4 · P4）—— 纯本地 · 零网络 · 零上报
 *
 * 红线（对齐 CheckinView 惯例）：
 * - 复盘记录仅存本机浏览器 localStorage（key: loongedu.reflection.v1），不出设备、不上云；
 * - 不接任何 report/invoke/fetch（唯一副作用 = 打印按钮的 printCurrentPage，纯 window.print）；
 * - 零采集：不采集儿童数据，仅教师自记的课堂复盘。
 *
 * 模板（每课一条）：日期 / 班级 / 单元 / 亮点（哪里学生反应好）/ 卡点（哪里没讲透）/ 下次改进。
 * 打印：v0.1 仅单条详情打印（Oracle 决策 5：列表摘要打印不做）→ 列表页不放打印按钮。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { printCurrentPage } from "./printUtil";

const LS_KEY = "loongedu.reflection.v1";

/** 日期 input 值（YYYY-MM-DD，默认当天） */
function todayISO(): string {
  const d = new Date();
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** 打印页眉日期（点击打印按钮时取当天，格式：2026年9月25日） */
function todayLabel(): string {
  const d = new Date();
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

interface ReflectionEntry {
  id: string;
  /** YYYY-MM-DD（input type=date）；空串 = 未填日期（列表排最后） */
  date: string;
  /** 班级 */
  className: string;
  /** 单元 */
  unit: string;
  /** 亮点（哪里学生反应好） */
  highlight: string;
  /** 卡点（哪里没讲透） */
  block: string;
  /** 下次改进 */
  nextPlan: string;
}

function emptyDraft(): ReflectionEntry {
  return {
    id: "",
    date: todayISO(),
    className: "",
    unit: "",
    highlight: "",
    block: "",
    nextPlan: "",
  };
}

function loadData(): ReflectionEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(
      (x): x is ReflectionEntry =>
        !!x &&
        typeof x === "object" &&
        typeof (x as ReflectionEntry).id === "string" &&
        typeof (x as ReflectionEntry).date === "string" &&
        typeof (x as ReflectionEntry).className === "string" &&
        typeof (x as ReflectionEntry).unit === "string" &&
        typeof (x as ReflectionEntry).highlight === "string" &&
        typeof (x as ReflectionEntry).block === "string" &&
        typeof (x as ReflectionEntry).nextPlan === "string",
    );
  } catch {
    return [];
  }
}

export default function ReflectionView() {
  const [data, setData] = useState<ReflectionEntry[]>(() => loadData());
  /** "list" 列表 / "edit" 详情（编辑表单） */
  const [mode, setMode] = useState<"list" | "edit">("list");
  /** 编辑中的条目 id；null = 新建 */
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReflectionEntry>(emptyDraft);
  const [err, setErr] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  /** 打印页眉（屏幕隐藏、打印显示；onClick 里经 ref 直接写 DOM，避免 React 异步 state 带旧值） */
  const printHeadRef = useRef<HTMLDivElement>(null);

  // 打印页眉：内容「教学复盘 · 班级 · 当天日期」；打开条目/编辑班级时同步（Ctrl+P 兜底），
  // 点「打印/导出 PDF」时 handlePrint 会经 ref 重写当天日期
  useEffect(() => {
    const el = printHeadRef.current;
    if (el) el.textContent = `教学复盘 · ${draft.className || "未填班级"} · ${todayLabel()}`;
  }, [draft.className]);

  // 防抖持久化（≤500ms，同 CheckinView 惯例）
  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(data));
        setErr(null);
      } catch (e) {
        setErr(`本地保存失败: ${e}`);
      }
    }, 400);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [data]);

  /** 列表：按日期倒序；无日期排最后（保持原相对顺序） */
  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
    });
  }, [data]);

  function openNew() {
    setDraft(emptyDraft());
    setEditId(null);
    setMode("edit");
    setErr(null);
  }

  function openEntry(id: string) {
    const e = data.find((x) => x.id === id);
    if (!e) return;
    setDraft({ ...e });
    setEditId(id);
    setMode("edit");
    setErr(null);
  }

  function backToList() {
    setMode("list");
    setErr(null);
  }

  /** 保存：新建并入数组；已有替换（位置不动，列表排序自动生效） */
  function save() {
    setData((d) => {
      if (editId) {
        return d.map((x) => (x.id === editId ? { ...draft, id: editId } : x));
      }
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      return [{ ...draft, id }, ...d];
    });
    setMode("list");
    setErr(null);
  }

  function removeEntry(id: string) {
    if (!window.confirm("删除这条复盘记录？此操作不可撤销。")) return;
    setData((d) => d.filter((x) => x.id !== id));
  }

  /** 打印/导出 PDF：先经 ref 写入「班级 + 当天日期」（同步 DOM 写，再调 printCurrentPage） */
  function handlePrint() {
    const el = printHeadRef.current;
    if (el) el.textContent = `教学复盘 · ${draft.className || "未填班级"} · ${todayLabel()}`;
    printCurrentPage();
  }

  function setField<K extends keyof ReflectionEntry>(k: K, v: ReflectionEntry[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  const draftLabel = editId ? "编辑复盘" : "新建复盘";

  return (
    <section className="reflection view-reflection">
      {/* 打印页眉：屏幕隐藏、打印显示（@media print 块内展示）；始终在根，同 CheckinView 模式 */}
      <div className="reflection-print-head" ref={printHeadRef} />
      {mode === "list" ? (
        <>
          <header className="reflection-head">
            <h2>教学复盘</h2>
            <div className="reflection-actions">
              <button className="ghost-btn inline" onClick={openNew}>
                ＋ 新建复盘
              </button>
            </div>
          </header>

          {err && <p className="banner error">{err}</p>}

          {data.length === 0 ? (
            <p className="empty">
              还没有复盘记录。每课讲完点「新建复盘」，记下今天的亮点、卡点和下次改进，下次备课随时回看。
            </p>
          ) : (
            <ul className="reflection-list">
              {sorted.map((e) => (
                <li key={e.id} className="reflection-list-item">
                  <button className="reflection-item" onClick={() => openEntry(e.id)}>
                    <span className="reflection-item-date">{e.date || "未填日期"}</span>
                    <span className="reflection-item-class">{e.className || "未填班级"}</span>
                    <span className="reflection-item-unit">{e.unit || "未填单元"}</span>
                    <span className="reflection-item-snippet">{e.highlight || "（未写亮点）"}</span>
                  </button>
                  <button
                    className="ghost-btn inline reflection-del"
                    title="删除这条复盘"
                    onClick={() => removeEntry(e.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <footer className="hint">
            复盘记录仅存本机浏览器（loongedu.reflection.v1），零网络、零上报；不采集学生数据。
          </footer>
        </>
      ) : (
        <>
          <header className="reflection-head">
            <h2>{draftLabel}</h2>
            <div className="reflection-actions">
              <button className="ghost-btn inline" onClick={handlePrint}>
                打印/导出 PDF
              </button>
              <button className="primary-btn sm" onClick={save}>
                保存
              </button>
              <button className="ghost-btn inline" onClick={backToList}>
                返回
              </button>
            </div>
          </header>

          {err && <p className="banner error">{err}</p>}

          <div className="reflection-detail">
            <div className="reflection-row">
              <label className="reflection-field">
                <span>日期</span>
                <input
                  type="date"
                  value={draft.date}
                  onChange={(e) => setField("date", e.target.value)}
                />
              </label>
              <label className="reflection-field">
                <span>班级</span>
                <input
                  type="text"
                  placeholder="如：四（1）班"
                  value={draft.className}
                  onChange={(e) => setField("className", e.target.value)}
                />
              </label>
              <label className="reflection-field">
                <span>单元</span>
                <input
                  type="text"
                  placeholder="如：Unit 3 My friends"
                  value={draft.unit}
                  onChange={(e) => setField("unit", e.target.value)}
                />
              </label>
            </div>

            <label className="reflection-field">
              <span>亮点</span>
              <textarea
                rows={4}
                placeholder="哪里学生反应好？（如：Let's do 环节全班跟读很积极）"
                value={draft.highlight}
                onChange={(e) => setField("highlight", e.target.value)}
              />
            </label>

            <label className="reflection-field">
              <span>卡点</span>
              <textarea
                rows={4}
                placeholder="哪里没讲透？（如：under / near 两个方位词学生容易混）"
                value={draft.block}
                onChange={(e) => setField("block", e.target.value)}
              />
            </label>

            <label className="reflection-field">
              <span>下次改进</span>
              <textarea
                rows={4}
                placeholder="下次怎么做？（如：改用图片配对复习方位词，先带读再练）"
                value={draft.nextPlan}
                onChange={(e) => setField("nextPlan", e.target.value)}
              />
            </label>
          </div>

          <footer className="hint">
            记录自动保存在本机；「打印/导出 PDF」走系统打印对话框，可另存为 PDF。零网络、零上报。
          </footer>
        </>
      )}
    </section>
  );
}
