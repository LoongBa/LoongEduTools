import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";

/** R13 课堂纪律工具 · D05 §2.4.3
 *  小组 +1/−1 大按钮 · 积分条 · 小组排行（非个人）· 本地瞬时（关机即清）
 *  红线：无学生姓名、无个人排名、不持久化、不上报
 *  联动（D05 §2.4.2/§2.4.3）：分组结果来自【抽卡分组】本地 roster.json（只导组结构，不导姓名）
 *  跨工具（D05 §2.4.3）：[抽卡] 直接呼出抽卡/分组视图
 */

interface Group {
  id: number;
  name: string;
  score: number;
}

function defaultGroups(n: number): Group[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `小组${i + 1}`,
    score: 0,
  }));
}

export default function DisciplineView({
  onOpenRoster,
}: {
  onOpenRoster?: () => void;
}) {
  const [groups, setGroups] = useState<Group[]>(() => defaultGroups(4));
  const [confirmReset, setConfirmReset] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const importedRef = useRef(false);

  /** 从名单分组导入组结构（幂等：保留同下标组名/分数，仅更新组数与成员结构） */
  async function importGroups(explicit: boolean) {
    try {
      const raw = await api.rosterLoad();
      if (!raw) {
        if (explicit) setImportMsg("还没有名单——先到【抽卡分组】录入名单并分组");
        return;
      }
      const data = JSON.parse(raw) as { groups?: string[][] };
      const gs = (Array.isArray(data.groups) ? data.groups : []).filter(
        (g) => Array.isArray(g) && g.length > 0,
      );
      if (gs.length === 0) {
        if (explicit) setImportMsg("名单里还没有分组——先到【抽卡分组】确认分组");
        return;
      }
      if (gs.length < 2 || gs.length > 8) {
        if (explicit) {
          setImportMsg(`分组数 ${gs.length} 超出纪律面板范围（2-8 组），未导入`);
        }
        return;
      }
      setGroups((prev) =>
        gs.map((_, i) => ({
          id: i + 1,
          name: prev[i]?.name ?? `小组${i + 1}`,
          score: prev[i]?.score ?? 0,
        })),
      );
      setImportMsg(
        explicit || gs.length !== 4
          ? `已从名单分组导入 ${gs.length} 组（分数保留）`
          : null,
      );
    } catch (e) {
      if (explicit) setImportMsg(`导入失败: ${e}`);
    }
  }

  // 挂载时静默同步一次（教师先分组后进纪律视图的常见动线）
  useEffect(() => {
    if (importedRef.current) return;
    importedRef.current = true;
    void importGroups(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = useMemo(
    () => groups.reduce((s, g) => s + g.score, 0),
    [groups],
  );
  const ranked = useMemo(
    () => [...groups].sort((a, b) => b.score - a.score || a.id - b.id),
    [groups],
  );

  function bump(id: number, delta: number) {
    setGroups((gs) =>
      gs.map((g) =>
        g.id === id ? { ...g, score: Math.max(0, g.score + delta) } : g,
      ),
    );
  }

  function setCount(n: number) {
    const clamped = Math.min(8, Math.max(2, n));
    setGroups((gs) => {
      if (clamped === gs.length) return gs;
      if (clamped < gs.length) return gs.slice(0, clamped);
      return [
        ...gs,
        ...defaultGroups(clamped)
          .filter((g) => !gs.some((x) => x.id === g.id))
          .map((g) => ({ ...g, score: 0 })),
      ];
    });
  }

  function rename(id: number, name: string) {
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, name } : g)));
  }

  function resetAll() {
    setGroups((gs) => gs.map((g) => ({ ...g, score: 0 })));
    setConfirmReset(false);
  }

  return (
    <section className="discipline">
      <div className="disc-head">
        <h2>纪律积分</h2>
        <div className="disc-actions">
          <label className="field inline-field">
            <span>组数</span>
            <input
              type="number"
              min={2}
              max={8}
              value={groups.length}
              onChange={(e) => setCount(Number(e.target.value) || 4)}
            />
          </label>
          <button
            className="ghost-btn inline"
            onClick={() => void importGroups(true)}
            title="从【抽卡分组】的最新分组结果同步组结构"
          >
            导入分组
          </button>
          {onOpenRoster && (
            <button
              className="ghost-btn inline"
              onClick={onOpenRoster}
              title="打开抽卡/分组工具（D05 §2.4.3 跨工具呼出）"
            >
              抽卡
            </button>
          )}
          {!confirmReset ? (
            <button className="ghost-btn inline danger" onClick={() => setConfirmReset(true)}>
              清零
            </button>
          ) : (
            <span className="confirm-row">
              <button className="primary-btn sm" onClick={resetAll}>
                确认清零
              </button>
              <button className="ghost-btn inline" onClick={() => setConfirmReset(false)}>
                取消
              </button>
            </span>
          )}
        </div>
      </div>

      {/* 顶部积分条 */}
      <div className="score-bars" aria-hidden>
        {groups.map((g) => {
          const pct = total > 0 ? Math.max(4, (g.score / total) * 100) : 100 / groups.length;
          return (
            <div key={g.id} className="score-bar-track">
              <div className="score-bar-fill" style={{ width: `${pct}%` }} />
              <span className="score-bar-label">
                {g.name} {g.score}
              </span>
            </div>
          );
        })}
      </div>

      {/* 小组面板 */}
      <div className="disc-grid">
        {groups.map((g) => (
          <div key={g.id} className="disc-group card">
            {editing === g.id ? (
              <input
                className="rename-input"
                value={g.name}
                maxLength={8}
                autoFocus
                onChange={(e) => rename(g.id, e.target.value)}
                onBlur={() => setEditing(null)}
                onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
              />
            ) : (
              <button
                className="disc-group-name"
                title="点击改名"
                onClick={() => setEditing(g.id)}
              >
                {g.name}
              </button>
            )}
            <div className="disc-score">{g.score}</div>
            <div className="disc-btns">
              <button
                className="score-btn plus"
                aria-label={`${g.name} 加一分`}
                onClick={() => bump(g.id, 1)}
              >
                +1
              </button>
              <button
                className="score-btn minus"
                aria-label={`${g.name} 减一分`}
                onClick={() => bump(g.id, -1)}
              >
                −1
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 小组排行（非个人） */}
      <div className="card rank-card">
        <div className="card-title">小组排行</div>
        <ol className="rank-list">
          {ranked.map((g, i) => (
            <li key={g.id}>
              <span className="rank-no">{i + 1}</span>
              <span className="rank-name">{g.name}</span>
              <span className="rank-score">{g.score}</span>
            </li>
          ))}
        </ol>
      </div>

      {importMsg && <p className="hint">{importMsg}</p>}

      <p className="hint">
        本地瞬时积分：关机即清、零上报；仅小组对比，不做个人排名。
      </p>
    </section>
  );
}
