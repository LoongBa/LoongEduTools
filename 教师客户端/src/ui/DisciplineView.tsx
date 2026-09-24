import { useMemo, useState } from "react";

/** R13 课堂纪律工具 · D05 §2.4.3
 *  小组 +1/−1 大按钮 · 积分条 · 小组排行（非个人）· 本地瞬时（关机即清）
 *  红线：无学生姓名、无个人排名、不持久化、不上报
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

export default function DisciplineView() {
  const [groups, setGroups] = useState<Group[]>(() => defaultGroups(4));
  const [confirmReset, setConfirmReset] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);

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
            disabled
            title="抽卡 P3 开放"
          >
            抽卡 P3
          </button>
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

      <p className="hint">
        本地瞬时积分：关机即清、零上报；仅小组对比，不做个人排名。
      </p>
    </section>
  );
}
