/**
 * P3 课堂工具 · D05 §2.4.1（抽卡 B5）/ §2.4.2（R12 分组 B6）
 *  抽卡：选名单 → 全班卡片墙 → [抽一位] → 翻卡动画 → 命中高亮 + 语音播报（本地 TTS）
 *        → [再来] / [跳过]（请假/home）→ 已抽/缺席灰显，本轮不重复
 *  分组：随机分组 / 强弱搭配 / 编号分组 · [重新分] 不换名单重洗 / [确认] 本地留存
 *  红线：名单仅存本机 exe_dir/roster.json，零网络传输、零上报；
 *        学生姓名不进日志；无个人排名；抽卡结果不落盘（仅组件内存）；
 *        分组结果随 roster.json 本地留存，供纪律积分联动。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import {
  RosterStudent,
  groupBalanced,
  groupByNumber,
  groupRandom,
  parseNames,
  resolveGroupCount,
} from "./rosterLogic";

interface Props {
  /** 从纪律工具等入口直达抽卡/分组：DisciplineView 的“抽卡 P3”按钮开放时可改为
   *  <RosterView initialTab="draw" />（由 App 层用 setView("roster") 切换）。 */
  initialTab?: "draw" | "group";
}

/** 与 roster.rs RosterData 层次一一对应的前端类型（api.ts 集成后也可复用 RosterData） */
interface RosterData {
  created_at: string;
  students: RosterStudent[];
  /** 分组结果本地留存（供纪律积分联动，D05 §2.4.2/§2.4.3） */
  groups: string[][];
}

type HistoryEntry = { student: RosterStudent; status: "drawn" | "absent" };

const GROUP_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function groupName(i: number): string {
  return i < GROUP_LETTERS.length ? `${GROUP_LETTERS[i]}组` : `第${i + 1}组`;
}

function fmtTime(ts: string): string {
  if (!ts) return "";
  const n = Number(ts);
  const d =
    /^\d+$/.test(ts) && n > 0 && n < 1e12 ? new Date(n * 1000) : new Date(ts);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("zh-CN");
}

export default function RosterView({ initialTab }: Props) {
  const [tab, setTab] = useState<"draw" | "group">(initialTab ?? "draw");

  // ---- 名单（本地持久化）----
  const [roster, setRoster] = useState<RosterData | null>(null);
  const [rosterErr, setRosterErr] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // ---- 名单编辑器 ----
  const [editorOpen, setEditorOpen] = useState(false);
  const [namesText, setNamesText] = useState("");
  const [editStudents, setEditStudents] = useState<RosterStudent[]>([]);
  const [confirmClearRoster, setConfirmClearRoster] = useState(false);

  // ---- 抽卡 ----
  const [drawn, setDrawn] = useState<Set<number>>(new Set());
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [current, setCurrent] = useState<RosterStudent | null>(null);
  const [currentIdx, setCurrentIdx] = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [confirmResetRound, setConfirmResetRound] = useState(false);

  // ---- 分组 ----
  const [gMode, setGMode] = useState<"random" | "balance" | "number">("random");
  const [gBy, setGBy] = useState<"count" | "size">("count");
  const [gCount, setGCount] = useState(4);
  const [gSize, setGSize] = useState(5);
  const [groups, setGroups] = useState<RosterStudent[][] | null>(null);
  const [fixed, setFixed] = useState(false);

  const animRef = useRef<number | null>(null);

  const total = roster?.students.length ?? 0;

  // ---- 载入 ----
  const loadRoster = useCallback(async () => {
    try {
      const raw = await api.rosterLoad();
      if (raw == null) {
        setRoster(null);
        return;
      }
      const data = JSON.parse(raw) as RosterData;
      setRoster({
        created_at: String(data.created_at ?? ""),
        students: Array.isArray(data.students) ? data.students : [],
        groups: Array.isArray(data.groups) ? data.groups : [],
      });
    } catch (e) {
      setRosterErr(String(e));
    }
  }, []);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  // 名单内容变化时重置抽卡轮次与分组结果（避免下标错位）
  const studentsKey = useMemo(
    () => (roster?.students ?? []).map((s) => s.name).join("\u0000"),
    [roster],
  );
  const [lastKey, setLastKey] = useState(studentsKey);
  useEffect(() => {
    if (studentsKey === lastKey) return;
    setLastKey(studentsKey);
    setDrawn(new Set());
    setSkipped(new Set());
    setHistory([]);
    setCurrent(null);
    setCurrentIdx(null);
    setGroups(null);
    setFixed(false);
  }, [studentsKey, lastKey]);

  // 卸载时清掉翻卡动画定时器
  useEffect(
    () => () => {
      if (animRef.current != null) window.clearInterval(animRef.current);
    },
    [],
  );

  // 外部入口直达抽卡/分组
  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  // ---- 语音播报（Web Speech API · 本地 TTS，WebView2 内置，无依赖）----
  function speak(name: string) {
    if (!("speechSynthesis" in window) || !voiceOn) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(name);
      u.lang = "zh-CN";
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
    } catch {
      /* TTS 不可用时静默降级 */
    }
  }

  // ---- 抽卡 ----
  const available = useMemo(() => {
    const list: { i: number; s: RosterStudent }[] = [];
    (roster?.students ?? []).forEach((s, i) => {
      if (!drawn.has(i) && !skipped.has(i)) list.push({ i, s });
    });
    return list;
  }, [roster, drawn, skipped]);

  const finishDraw = useCallback(
    (idx: number, s: RosterStudent) => {
      setCurrent(s);
      setCurrentIdx(idx);
      setDrawn((d) => new Set(d).add(idx));
      setHistory((h) => [...h, { student: s, status: "drawn" }]);
      setAnimating(false);
      speak(s.name);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [voiceOn],
  );

  function doDraw() {
    if (available.length === 0 || animating) return;
    const pool = available;
    const target = pool[Math.floor(Math.random() * pool.length)];
    setAnimating(true);
    let flips = 0;
    const MAX = 7;
    animRef.current = window.setInterval(() => {
      flips += 1;
      // 翻卡中：只闪姓名不落定
      setCurrent(pool[Math.floor(Math.random() * pool.length)].s);
      setCurrentIdx(null);
      setConfirmResetRound(false);
      if (flips >= MAX) {
        if (animRef.current != null) window.clearInterval(animRef.current);
        animRef.current = null;
        finishDraw(target.i, target.s);
      }
    }, 130);
  }

  function skipCurrent() {
    if (currentIdx == null || current == null) return;
    // 请假/home：移出“已抽”，计入“缺席”，本轮不再抽到（剩余池排除）
    setDrawn((d) => {
      const n = new Set(d);
      n.delete(currentIdx);
      return n;
    });
    setSkipped((s) => new Set(s).add(currentIdx));
    setHistory((h) =>
      h.map((e, i) => (i === h.length - 1 ? { ...e, status: "absent" } : e)),
    );
    setCurrent(null);
    setCurrentIdx(null);
  }

  function resetRound() {
    if (animRef.current != null) window.clearInterval(animRef.current);
    animRef.current = null;
    setDrawn(new Set());
    setSkipped(new Set());
    setHistory([]);
    setCurrent(null);
    setCurrentIdx(null);
    setAnimating(false);
    setConfirmResetRound(false);
  }

  // ---- 名单持久化 ----
  async function persist(data: RosterData) {
    try {
      await api.rosterSave(JSON.stringify(data));
      setRoster(data);
      setSaveMsg("已保存到本机 roster.json");
    } catch (e) {
      setRosterErr(String(e));
    }
  }

  function openEditor() {
    setEditStudents(
      roster?.students.length ? roster.students.map((s) => ({ ...s })) : [],
    );
    setNamesText((roster?.students ?? []).map((s) => s.name).join("\n"));
    setEditorOpen(true);
  }

  function fillNames() {
    setEditStudents(parseNames(namesText).map((name) => ({ name, tag: null })));
  }

  function setTag(i: number, tag: RosterStudent["tag"]) {
    setEditStudents((ls) => ls.map((s, j) => (j === i ? { ...s, tag } : s)));
  }

  function removeStudent(i: number) {
    setEditStudents((ls) => ls.filter((_, j) => j !== i));
  }

  async function saveEdit() {
    const students = editStudents
      .map((s) => ({ name: s.name.trim(), tag: s.tag }))
      .filter((s) => s.name.length > 0);
    await persist({
      created_at: roster?.created_at || new Date().toISOString(),
      students,
      groups: roster?.groups ?? [],
    });
    setEditorOpen(false);
    setConfirmClearRoster(false);
  }

  async function clearRoster() {
    await persist({
      created_at: roster?.created_at || new Date().toISOString(),
      students: [],
      groups: [],
    });
    setNamesText("");
    setEditStudents([]);
    setEditorOpen(false);
    setConfirmClearRoster(false);
  }

  // ---- 分组 ----
  const strongCount = useMemo(
    () => (roster?.students ?? []).filter((s) => s.tag === "strong").length,
    [roster],
  );
  const weakCount = useMemo(
    () => (roster?.students ?? []).filter((s) => s.tag === "weak").length,
    [roster],
  );

  function setGroupCount(v: number) {
    setGCount(Math.max(1, Math.min(30, Number.isFinite(v) ? v : 1)));
  }
  function setGroupSize(v: number) {
    setGSize(Math.max(1, Math.min(60, Number.isFinite(v) ? v : 1)));
  }

  const computeGroups = useCallback((): RosterStudent[][] | null => {
    const students = roster?.students ?? [];
    if (students.length === 0) return null;
    const opts =
      gBy === "count" ? { groupCount: gCount } : { perGroup: gSize };
    const count = resolveGroupCount(students.length, opts);
    if (gMode === "balance") return groupBalanced(students, count);
    if (gMode === "number") return groupByNumber(students, count);
    return groupRandom(students, count);
  }, [roster, gMode, gBy, gCount, gSize]);

  // 进入分组页 / 名单或分组设置变化 → 自动重新计算（[重新分] 则是同设置下再洗）
  useEffect(() => {
    if (tab !== "group" || total === 0) return;
    setGroups(computeGroups());
    setFixed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, total, computeGroups]);

  function resplit() {
    const g = computeGroups();
    if (g) {
      setGroups(g);
      setFixed(false);
    }
  }

  async function confirmGroups() {
    if (!groups || !roster) return;
    const g = groups.map((gr) => gr.map((s) => s.name));
    await persist({ ...roster, groups: g });
    setFixed(true);
  }

  const canDraw = total > 0 && available.length > 0 && !animating;

  return (
    <section className="rost">
      <div className="rost-head">
        <h2>抽卡 · 分组</h2>
        <div className="rost-tabs">
          <button
            className={tab === "draw" ? "rost-tab active" : "rost-tab"}
            onClick={() => setTab("draw")}
          >
            抽卡
          </button>
          <button
            className={tab === "group" ? "rost-tab active" : "rost-tab"}
            onClick={() => setTab("group")}
          >
            分组
          </button>
        </div>
      </div>

      {rosterErr && (
        <div className="banner error" onClick={() => setRosterErr(null)}>
          {rosterErr}（点击关闭）
        </div>
      )}
      {saveMsg && (
        <div className="rost-ok" onClick={() => setSaveMsg(null)}>
          {saveMsg}（点击关闭）
        </div>
      )}
      {total === 0 && (
        <div className="banner warn">
          还没有名单。点击「编辑名单」粘贴全班姓名（每行一个，或逗号分隔），
          保存后即可抽卡 / 分组。名单仅存本机。
        </div>
      )}

      {/* 顶部工具条 */}
      <div className="rost-toolbar">
        <span className="rost-count">
          {total > 0 ? `名单 ${total} 人` : "未加载名单"}
          {roster?.created_at ? ` · 建于 ${fmtTime(roster.created_at)}` : ""}
        </span>
        <div className="btn-row">
          <button className="ghost-btn inline" onClick={openEditor}>
            编辑名单
          </button>
          {!confirmClearRoster ? (
            <button
              className="ghost-btn inline danger"
              onClick={() => setConfirmClearRoster(true)}
            >
              重置名单
            </button>
          ) : (
            <span className="confirm-row">
              <button className="primary-btn sm" onClick={clearRoster}>
                确认清空
              </button>
              <button
                className="ghost-btn inline"
                onClick={() => setConfirmClearRoster(false)}
              >
                取消
              </button>
            </span>
          )}
        </div>
      </div>

      {/* 名单编辑器 */}
      {editorOpen && (
        <div className="card rost-editpanel">
          <div className="card-title">名单编辑</div>
          <label className="field">
            <span>
              粘贴姓名（每行一个，或逗号 / 中文逗号 / 顿号分隔），点击「填入名单」；
              随后可给个别学生点 强/弱 按钮做标记（分组“强弱搭配”用，可不标）。
            </span>
            <textarea
              className="rost-textarea"
              rows={6}
              value={namesText}
              onChange={(e) => setNamesText(e.target.value)}
              placeholder={"张三\n李四\n王五"}
            />
          </label>
          <div className="btn-row">
            <button className="ghost-btn inline" onClick={fillNames}>
              填入名单
            </button>
            <span className="hint" style={{ margin: 0 }}>
              填入将替换当前编辑列表（强弱标记清空）
            </span>
          </div>

          {editStudents.length > 0 && (
            <ol className="rost-editlist">
              {editStudents.map((s, i) => (
                <li key={i}>
                  <span className="rost-editname">
                    {s.name || "（空）"}
                    {s.tag && (
                      <span
                        className={`rost-minibadge ${s.tag}`}
                      >
                        {s.tag === "strong" ? "强" : "弱"}
                      </span>
                    )}
                  </span>
                  <span className="rost-tagrow">
                    {(["strong", "weak"] as const).map((t) => (
                      <button
                        key={t}
                        className={`rost-tag-btn ${s.tag === t ? "on " + t : ""}`}
                        onClick={() => setTag(i, s.tag === t ? null : t)}
                      >
                        {t === "strong" ? "强" : "弱"}
                      </button>
                    ))}
                  </span>
                  <button
                    className="rost-del"
                    aria-label={`删除 ${s.name}`}
                    onClick={() => removeStudent(i)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>
          )}

          <div className="btn-row">
            <button className="primary-btn sm" onClick={saveEdit}>
              保存名单（存本机）
            </button>
            <button
              className="ghost-btn inline"
              onClick={() => setEditorOpen(false)}
            >
              收起
            </button>
          </div>
        </div>
      )}

      {/* ================= 抽卡 ================= */}
      {tab === "draw" && (
        <div className="rost-tabbody">
          {total > 0 && (
            <div className="rost-cardwall">
              {(roster?.students ?? []).map((s, i) => {
                const isDrawn = drawn.has(i);
                const isSkipped = skipped.has(i);
                const isHit = currentIdx === i;
                const cls = ["rost-card", isDrawn && "drawn", isSkipped && "absent", isHit && "hit"]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <div key={i} className={cls}>
                    <span className="rost-card-name">{s.name}</span>
                    {s.tag && (
                      <span className={`rost-badge ${s.tag}`}>
                        {s.tag === "strong" ? "强" : "弱"}
                      </span>
                    )}
                    {isDrawn && <span className="rost-card-mark">已抽</span>}
                    {isSkipped && <span className="rost-card-mark">缺席</span>}
                  </div>
                );
              })}
            </div>
          )}

          <div className="card rost-stage">
            <div className="rost-current" key={history.length}>
              {current ? current.name : animating ? "…" : "点击「抽一位」开始"}
            </div>
            <div className="rost-stage-meta">
              {total > 0 && (
                <span className="rost-count">
                  剩余 {available.length} / {total}（已抽 {drawn.size} · 请假{" "}
                  {skipped.size}）
                </span>
              )}
              <label className="rost-voice">
                <input
                  type="checkbox"
                  checked={voiceOn}
                  onChange={(e) => setVoiceOn(e.target.checked)}
                />
                语音播报
              </label>
            </div>
            <button
              className="rost-draw-btn"
              disabled={!canDraw}
              onClick={doDraw}
            >
              {animating
                ? "抽取中…"
                : total === 0
                  ? "请先填名单"
                  : available.length === 0
                    ? "本轮已抽完"
                    : "抽一位"}
            </button>
            {current && currentIdx != null && (
              <div className="rost-draw-sub">
                <button
                  className="rost-big-btn"
                  disabled={available.length === 0 || animating}
                  onClick={doDraw}
                >
                  再来
                </button>
                <button className="rost-big-btn" onClick={skipCurrent}>
                  跳过（请假）
                </button>
              </div>
            )}
            {history.length > 0 && (
              <div className="rost-history">
                <span className="rost-history-title">
                  本轮已抽 {history.length} 人：
                </span>
                {history.map((h, i) => (
                  <span
                    key={i}
                    className={`rost-hitem ${h.status === "absent" ? "absent" : ""}`}
                  >
                    {h.student.name}
                    {h.status === "absent" ? "（请假）" : ""}
                  </span>
                ))}
              </div>
            )}
            {confirmResetRound ? (
              <span className="confirm-row">
                <button className="primary-btn sm" onClick={resetRound}>
                  确认重置本轮
                </button>
                <button
                  className="ghost-btn inline"
                  onClick={() => setConfirmResetRound(false)}
                >
                  取消
                </button>
              </span>
            ) : (
              <button
                className="ghost-btn"
                style={{ width: "auto", maxWidth: 240, margin: "0 auto" }}
                disabled={(history.length === 0 && current == null) || total === 0}
                onClick={() => setConfirmResetRound(true)}
              >
                本轮重置（重新点名）
              </button>
            )}
          </div>
        </div>
      )}

      {/* ================= 分组 ================= */}
      {tab === "group" && (
        <div className="rost-tabbody">
          <div className="card rost-ctrl">
            <div className="rost-seg" role="radiogroup" aria-label="分组模式">
              <button
                className={gMode === "random" ? "active" : ""}
                onClick={() => setGMode("random")}
              >
                随机分组
              </button>
              <button
                className={gMode === "balance" ? "active" : ""}
                onClick={() => setGMode("balance")}
              >
                强弱搭配
              </button>
              <button
                className={gMode === "number" ? "active" : ""}
                onClick={() => setGMode("number")}
              >
                编号分组
              </button>
            </div>

            <div className="rost-ctrl-row">
              <div className="rost-seg" role="radiogroup" aria-label="分组方式">
                <button
                  className={gBy === "count" ? "active" : ""}
                  onClick={() => setGBy("count")}
                >
                  按组数
                </button>
                <button
                  className={gBy === "size" ? "active" : ""}
                  onClick={() => setGBy("size")}
                >
                  按每组人数
                </button>
              </div>
              {gBy === "count" ? (
                <label className="field inline-field">
                  <span>组数</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={gCount}
                    onChange={(e) => setGroupCount(Number(e.target.value))}
                  />
                </label>
              ) : (
                <label className="field inline-field">
                  <span>每组人数</span>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={gSize}
                    onChange={(e) => setGroupSize(Number(e.target.value))}
                  />
                </label>
              )}
            </div>

            {gMode === "balance" && (
              <p className="hint" style={{ margin: 0 }}>
                {strongCount + weakCount === 0
                  ? "名单还未标记强弱：先「编辑名单」给个别学生点 强/弱，否则本模式按随机分组。"
                  : `当前名单：强 ${strongCount} 人 · 弱 ${weakCount} 人 · 按“每组约 1-2 强”搭配。`}
              </p>
            )}
            {gMode === "number" && (
              <p className="hint" style={{ margin: 0 }}>
                按名单顺序轮转：第 1、{gCount === 1 ? 1 : 1 + gCount}、…
                进 A 组（同 1,4,7 → A 组 座次规律）。
              </p>
            )}

            <div className="btn-row rost-ctrl-actions">
              <button
                className="rost-primary"
                disabled={total === 0}
                onClick={resplit}
              >
                重新分
              </button>
              <button
                className="rost-primary-alt"
                disabled={!groups}
                onClick={confirmGroups}
              >
                {fixed ? "已确认" : "确认"}
              </button>
            </div>
          </div>

          {total === 0 ? (
            <p className="empty">
              名单为空，先在上方「编辑名单」保存全班姓名后再分组。
            </p>
          ) : groups && groups.length > 0 ? (
            <div className="rost-groups">
              {groups.map((gr, gi) => (
                <div key={gi} className="rost-group">
                  <div className="rost-group-head">
                    {groupName(gi)}
                    <span className="rost-group-n">{gr.length}人</span>
                  </div>
                  <div className="rost-group-members">
                    {gr.map((s, si) => (
                      <span key={si} className="rost-member">
                        {s.name}
                        {s.tag && (
                          <em className={`rost-minibadge ${s.tag}`}>
                            {s.tag === "strong" ? "强" : "弱"}
                          </em>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {fixed && (
            <p className="hint">
              分组结果已确认并保存到本机 roster.json（供纪律积分联动，零上报）。
            </p>
          )}
        </div>
      )}

      {/* 红线提示（与 DisciplineView 同形）：本地名单，零上报 */}
      <p className="hint">
        名单仅存本机 exe_dir/roster.json：零网络传输、零上报；抽卡结果不落盘、
        分组结果仅本地留存（供纪律积分联动）。学生姓名不写入日志，语音为本地系统 TTS。
      </p>
    </section>
  );
}