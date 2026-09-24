import { useEffect, useMemo, useState } from "react";
import { ClassProgress, api } from "./api";
import {
  classPosLabel,
  fmtUpdatedAt,
  parseSection,
  parseUnit,
  scheduleSlotFor,
  unitPercent,
  type ScheduleSlotId,
} from "./classesLogic";

/** R1 多班进度看板 · D05 §2.4.5（P3 页 /classes）
 *  每班一卡（班名 + 最近更新 + 进度条 U1-U6 + 上次位置）→ 点卡展开两周制本周安排
 *  + 手动修正 unit/section；与一键开课共库（recents），开课即自动记录。
 *  红线：看板纯本地、不做班际排名/不上传。
 */

interface Props {
  /** 一键开课共库的多班进度（App 层 recents 状态） */
  recents: ClassProgress[];
  /** 保存修正后重新拉取 recents（App 层 refresh） */
  onRefresh: () => void;
}

/** 两周制静态模板（点读陪练两周制，仅作课堂节奏参照） */
const WEEK1: { slot: ScheduleSlotId; label: string }[] = [
  { slot: "w1d1", label: "Day1 天天见" },
  { slot: "w1d2", label: "Day2 天天见" },
  { slot: "w1d3", label: "Day3 天天见" },
  { slot: "w1pbl", label: "周末 PBL" },
];
const WEEK2: { slot: ScheduleSlotId; label: string }[] = [
  { slot: "w2d4", label: "Day4 天天见" },
  { slot: "w2d5", label: "Day5 天天见" },
  { slot: "w2para", label: "周末 小阅兵" },
];

export default function ClassesView({ recents, onRefresh }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftUnit, setDraftUnit] = useState("1");
  const [draftSection, setDraftSection] = useState("1");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pkgNames, setPkgNames] = useState<Record<string, string>>({});

  // 包展示名映射（App 层只传 recents；此处自取一次，纯本地）
  useEffect(() => {
    api
      .listInstalled()
      .then((pkgs) => {
        const m: Record<string, string> = {};
        for (const p of pkgs) m[p.package_id] = p.display_name || p.name;
        setPkgNames(m);
      })
      .catch(() => setPkgNames({}));
  }, []);

  const sorted = useMemo(
    () => [...recents].sort((a, b) => a.class_name.localeCompare(b.class_name, "zh")),
    [recents],
  );

  function toggle(id: string) {
    setExpanded((cur) => (cur === id ? null : id));
    if (editingId === id) setEditingId(null);
  }

  function startEdit(c: ClassProgress) {
    setDraftUnit(String(parseUnit(c.unit)));
    setDraftSection(String(parseSection(c.section)));
    setEditingId(c.class_id);
    setErr(null);
  }

  const isDirty = (c: ClassProgress) =>
    parseUnit(draftUnit) !== parseUnit(c.unit) ||
    parseSection(draftSection) !== parseSection(c.section);

  async function save(c: ClassProgress) {
    if (!isDirty(c)) return;
    setSaving(true);
    setErr(null);
    try {
      await api.recentsSet({
        classId: c.class_id,
        className: c.class_name,
        packageId: c.package_id,
        unit: draftUnit,
        section: draftSection,
      });
      setEditingId(null);
      onRefresh();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="classes">
      <h2>班级看板</h2>

      {err && (
        <div className="banner error" onClick={() => setErr(null)}>
          {err}（点击关闭）
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="empty">
          还没有开课记录——在【一键开课】开课后，这里自动出现
        </p>
      ) : (
        <div className="card-grid classes-grid">
          {sorted.map((c) => {
            const pct = unitPercent(c.unit, c.section);
            const curUnit = parseUnit(c.unit);
            const activeSlot = scheduleSlotFor(c.section);
            const open = expanded === c.class_id;
            const editing = editingId === c.class_id;
            return (
              <div key={c.class_id} className={`card classes-card${open ? " open" : ""}`}>
                <button
                  className="classes-card-main"
                  onClick={() => toggle(c.class_id)}
                  aria-expanded={open}
                >
                  <div className="classes-card-head">
                    <span className="card-title">{c.class_name}</span>
                    <span className="classes-updated">最近 {fmtUpdatedAt(c.updated_at)}</span>
                  </div>
                  <div className="card-meta">{pkgNames[c.package_id] || c.package_id}</div>

                  <div className="classes-progress">
                    <div className="classes-progress-track">
                      <div
                        className="classes-progress-fill"
                        style={{ width: `${pct}%` }}
                        aria-hidden
                      />
                    </div>
                    <div className="classes-progress-ticks" aria-hidden>
                      {Array.from({ length: 6 }, (_, i) => (
                        <span
                          key={i}
                          className={curUnit === i + 1 ? "classes-tick active" : "classes-tick"}
                        >
                          U{i + 1}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="classes-card-foot">
                    <span className="classes-pos">上次位置：{classPosLabel(c.unit, c.section)}</span>
                    <span className="classes-pct">{pct}%</span>
                  </div>
                </button>

                {open && (
                  <div className="classes-card-detail">
                    {/* 两周制本周安排（静态模板，高亮当前 slot） */}
                    <div className="classes-schedule">
                      <div className="classes-week">
                        <div className="classes-week-name">第 1 周</div>
                        <div className="classes-week-chips">
                          {WEEK1.map((w) => (
                            <span
                              key={w.slot}
                              className={`classes-chip${w.slot === activeSlot ? " active" : ""}`}
                            >
                              {w.label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="classes-week">
                        <div className="classes-week-name">第 2 周</div>
                        <div className="classes-week-chips">
                          {WEEK2.map((w) => (
                            <span
                              key={w.slot}
                              className={`classes-chip${w.slot === activeSlot ? " active" : ""}`}
                            >
                              {w.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* 手动修正（只读展示 + 手动修） */}
                    <div className="classes-edit">
                      {editing ? (
                        <div className="classes-edit-row">
                          <label className="field inline-field">
                            <span>单元</span>
                            <select value={draftUnit} onChange={(e) => setDraftUnit(e.target.value)}>
                              {Array.from({ length: 6 }, (_, i) => (
                                <option key={i + 1} value={i + 1}>
                                  U{i + 1}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="field inline-field">
                            <span>第几节</span>
                            <select
                              value={draftSection}
                              onChange={(e) => setDraftSection(e.target.value)}
                            >
                              {Array.from({ length: 6 }, (_, i) => (
                                <option key={i + 1} value={i + 1}>
                                  {i + 1}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="btn-row">
                            <button
                              className="primary-btn sm"
                              disabled={saving || !isDirty(c)}
                              onClick={() => save(c)}
                            >
                              {saving ? "保存中…" : "保存"}
                            </button>
                            <button
                              className="ghost-btn inline"
                              disabled={saving}
                              onClick={() => setEditingId(null)}
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button className="ghost-btn inline" onClick={() => startEdit(c)}>
                          编辑: 手动修正
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="hint">
        看板纯本地：进度只存本机、不做班际排名、不上传；开课即自动记录，这里只读展示 + 手动修正。
      </p>
    </section>
  );
}