/**
 * R18 朗读打卡单（D05 · P3）—— 纯本地 · 零网络 · 零上报
 *
 * 红线（对齐 DisciplineView 惯例）：
 * - 学生姓名仅存本机浏览器 localStorage（key: loongedu.checkin.v1），不出设备、不上云；
 * - 无个人排名/无班级对比（只显示个人读熟进度，不做榜单）；
 * - 名单由教师手工粘贴，软件不采集、不推断。
 *
 * 模型：学生 × 朗读任务（课文/单元小节，教师自编）；单元格三态循环 ○(未读)→◐(在读)→●(读熟)。
 */
import { useEffect, useMemo, useRef, useState } from "react";

const LS_KEY = "loongedu.checkin.v1";

/** 三态：0 未读 / 1 在读 / 2 读熟 */
type CellState = 0 | 1 | 2;

interface CheckinData {
  students: string[];
  tasks: string[];
  /** cells[`${taskIdx}:${studentIdx}`] = CellState */
  cells: Record<string, CellState>;
}

const EMPTY: CheckinData = { students: [], tasks: [], cells: {} };

function loadData(): CheckinData {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return EMPTY;
    const v = JSON.parse(raw) as Partial<CheckinData>;
    return {
      students: Array.isArray(v.students) ? v.students.filter((s) => typeof s === "string") : [],
      tasks: Array.isArray(v.tasks) ? v.tasks.filter((s) => typeof s === "string") : [],
      cells: v.cells && typeof v.cells === "object" ? (v.cells as Record<string, CellState>) : {},
    };
  } catch {
    return EMPTY;
  }
}

function cellKey(taskIdx: number, studentIdx: number): string {
  return `${taskIdx}:${studentIdx}`;
}

const STATE_GLYPH = ["○", "◐", "●"] as const;
const STATE_LABEL = ["未读", "在读", "读熟"] as const;

export default function CheckinView() {
  const [data, setData] = useState<CheckinData>(() => loadData());
  const [studentText, setStudentText] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);

  // 防抖持久化（≤500ms）
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

  /** 每任务完成度：● 计 1、◐ 计 0.5 */
  const taskProgress = useMemo(() => {
    return data.tasks.map((_, ti) => {
      if (data.students.length === 0) return 0;
      let sum = 0;
      for (let si = 0; si < data.students.length; si++) {
        const s = data.cells[cellKey(ti, si)] ?? 0;
        sum += s === 2 ? 1 : s === 1 ? 0.5 : 0;
      }
      return sum / data.students.length;
    });
  }, [data]);

  /** 每学生读熟数（用于个人进度展示，非排名） */
  const studentDone = useMemo(() => {
    return data.students.map((_, si) => {
      let done = 0;
      for (let ti = 0; ti < data.tasks.length; ti++) {
        if ((data.cells[cellKey(ti, si)] ?? 0) === 2) done++;
      }
      return done;
    });
  }, [data]);

  function cycleCell(ti: number, si: number) {
    setData((d) => {
      const key = cellKey(ti, si);
      const cur = d.cells[key] ?? 0;
      const next = ((cur + 1) % 3) as CellState;
      const cells = { ...d.cells };
      if (next === 0) delete cells[key];
      else cells[key] = next;
      return { ...d, cells };
    });
  }

  function markAllForTask(ti: number, value: CellState | "clear") {
    setData((d) => {
      const cells = { ...d.cells };
      d.students.forEach((_, si) => {
        const key = cellKey(ti, si);
        if (value === "clear") delete cells[key];
        else cells[key] = value;
      });
      return { ...d, cells };
    });
  }

  function applyStudents() {
    const names = studentText
      .split(/[\n,，、;；]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) {
      setErr("名单为空：每行一个姓名（或逗号分隔）");
      return;
    }
    if (names.length > 60) {
      setErr(`名单过长（${names.length} 人），上限 60`);
      return;
    }
    setData((d) => ({ ...d, students: names }));
    setStudentText(names.join("\n"));
    setErr(null);
    setEditOpen(false);
  }

  function addTask() {
    const name = window.prompt("朗读任务名称（如：U3 Part A Let's talk 课文）");
    if (!name || !name.trim()) return;
    setData((d) => ({ ...d, tasks: [...d.tasks, name.trim()] }));
  }

  function removeTask(ti: number) {
    if (!window.confirm(`删除任务「${data.tasks[ti]}」及其打卡记录？`)) return;
    setData((d) => {
      const tasks = d.tasks.filter((_, i) => i !== ti);
      // 重排 key（任务下标前移）
      const cells: Record<string, CellState> = {};
      for (let n = 0; n < tasks.length; n++) {
        const oldTi = n < ti ? n : n + 1;
        d.students.forEach((_, si) => {
          const v = d.cells[cellKey(oldTi, si)];
          if (v) cells[cellKey(n, si)] = v;
        });
      }
      return { ...d, tasks, cells };
    });
  }

  const hasStudents = data.students.length > 0;

  return (
    <section className="checkin">
      <header className="checkin-head">
        <h2>朗读打卡单</h2>
        <div className="checkin-actions">
          <button className="ghost-btn inline" onClick={() => setEditOpen((v) => !v)}>
            {editOpen ? "收起名单" : hasStudents ? "编辑名单" : "录入名单"}
          </button>
          <button className="ghost-btn inline" onClick={addTask} disabled={editOpen}>
            + 任务
          </button>
        </div>
      </header>

      {editOpen && (
        <div className="checkin-editor">
          <p className="hint">每行一个学生姓名（或逗号分隔）；仅存本机，不上报。</p>
          <textarea
            className="checkin-textarea"
            rows={6}
            placeholder={"张三\n李四\n王五"}
            value={studentText}
            onChange={(e) => setStudentText(e.target.value)}
          />
          <div className="btn-row">
            <button className="primary-btn sm" onClick={applyStudents}>
              保存名单
            </button>
            <button
              className="ghost-btn danger"
              onClick={() => {
                if (!window.confirm("清空全部打卡数据（名单/任务/记录）？此操作不可撤销。")) return;
                setData(EMPTY);
                setStudentText("");
                try {
                  localStorage.removeItem(LS_KEY);
                } catch {
                  /* ignore */
                }
              }}
            >
              清空全部
            </button>
          </div>
        </div>
      )}

      {err && <p className="banner error">{err}</p>}

      {!hasStudents && !editOpen && (
        <p className="empty">先点「录入名单」粘贴全班姓名，再用「+ 任务」添加朗读篇目。</p>
      )}

      {hasStudents && data.tasks.length === 0 && (
        <p className="empty">还没有朗读任务——点右上「+ 任务」添加课文/小节。</p>
      )}

      {hasStudents && data.tasks.length > 0 && (
        <div className="checkin-scroll">
          <table className="checkin-table">
            <thead>
              <tr>
                <th className="checkin-th-task">朗读任务</th>
                <th className="checkin-th-prog">完成度</th>
                {data.students.map((s, si) => (
                  <th key={si} className="checkin-th-stu" title={`${s}：已读熟 ${studentDone[si]}/${data.tasks.length}`}>
                    <span className="checkin-stu-name">{s}</span>
                    <span className="checkin-stu-done">
                      {studentDone[si]}/{data.tasks.length}
                    </span>
                  </th>
                ))}
                <th className="checkin-th-ops">批量</th>
              </tr>
            </thead>
            <tbody>
              {data.tasks.map((task, ti) => {
                const pct = Math.round(taskProgress[ti] * 100);
                return (
                  <tr key={ti}>
                    <td className="checkin-task">
                      <span className="checkin-task-name">{task}</span>
                      <button
                        className="ghost-btn inline checkin-del"
                        title="删除任务"
                        onClick={() => removeTask(ti)}
                      >
                        ×
                      </button>
                    </td>
                    <td className="checkin-prog">
                      <div className="checkin-prog-track">
                        <div className="checkin-prog-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="checkin-prog-num">{pct}%</span>
                    </td>
                    {data.students.map((_, si) => {
                      const st = data.cells[cellKey(ti, si)] ?? 0;
                      return (
                        <td key={si} className="checkin-cell">
                          <button
                            className={`checkin-mark st${st}`}
                            title={`${data.students[si]} · ${task}：${STATE_LABEL[st]}（点击切换）`}
                            onClick={() => cycleCell(ti, si)}
                          >
                            {STATE_GLYPH[st]}
                          </button>
                        </td>
                      );
                    })}
                    <td className="checkin-ops">
                      <button
                        className="ghost-btn inline"
                        title="全班标记读熟"
                        onClick={() => markAllForTask(ti, 2)}
                      >
                        ●
                      </button>
                      <button
                        className="ghost-btn inline"
                        title="清空本行"
                        onClick={() => markAllForTask(ti, "clear")}
                      >
                        ○
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <footer className="hint">
        ○ 未读 → ◐ 在读 → ● 读熟（点击循环切换）。打卡记录仅存本机浏览器，零网络、零上报；不生成个人排名。
      </footer>
    </section>
  );
}
