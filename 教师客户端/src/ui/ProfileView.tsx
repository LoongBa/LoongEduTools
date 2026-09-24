import { useEffect, useState } from "react";
import { AuthStatus, LicenseStatus, api } from "./api";

interface Props {
  auth: AuthStatus;
  onAuthChange: (s: AuthStatus) => void;
  onGoLogin: () => void;
}

export default function ProfileView({ auth, onAuthChange, onGoLogin }: Props) {
  const [lic, setLic] = useState<LicenseStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activateOpen, setActivateOpen] = useState(false);
  const [licenseKey, setLicenseKey] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [grade, setGrade] = useState("4");
  const [subject, setSubject] = useState("english");
  const [agree, setAgree] = useState(true);

  useEffect(() => {
    api
      .licenseStatus()
      .then(setLic)
      .catch((e) => setErr(String(e)));
  }, [auth.logged_in]);

  async function renew() {
    setErr(null);
    setInfo(null);
    setBusy(true);
    try {
      const s = await api.licenseRenew();
      setLic(s);
      setInfo(`口令已签发/续期至 ${s.expires_at ?? ""}`);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    setErr(null);
    setInfo(null);
    setBusy(true);
    try {
      const r = await api.authActivate(licenseKey);
      setInfo(`激活成功 · 级别 L${r.license_level} · 机器配额 ${r.machine_quota}`);
      setActivateOpen(false);
      const s = await api.authStatus();
      onAuthChange(s);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile() {
    setErr(null);
    setInfo(null);
    setBusy(true);
    try {
      await api.authProfile(grade, subject, agree);
      setProfileOpen(false);
      setInfo("任教信息已保存");
      const s = await api.authStatus();
      onAuthChange(s);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await api.authLogout();
      const s = await api.authStatus();
      onAuthChange(s);
    } catch (e) {
      setErr(String(e));
    }
  }

  const t = auth.teacher;
  const needProfile =
    auth.logged_in && t && (!t.grade || !t.subject);

  return (
    <section>
      <h2>我的</h2>

      {err && (
        <div className="banner error" onClick={() => setErr(null)}>
          {err}（点击关闭）
        </div>
      )}
      {info && (
        <div className="banner warn" onClick={() => setInfo(null)}>
          {info}（点击关闭）
        </div>
      )}
      {auth.state === "expired" && (
        <div className="banner warn">凭证已过期，请联网重新登录。</div>
      )}
      {auth.offline_grace && (
        <div className="banner warn">
          当前处于离线宽限（7 天）内，联网后将自动尝试刷新凭证。
        </div>
      )}

      {!auth.logged_in ? (
        <div className="card">
          <p>尚未登录。</p>
          <button className="primary-btn" onClick={onGoLogin}>
            去登录
          </button>
        </div>
      ) : (
        <>
          <dl className="kv">
            <dt>教师 ID</dt>
            <dd>{t?.id ?? "-"}</dd>
            <dt>姓名</dt>
            <dd>{t?.name ?? "（未填）"}</dd>
            <dt>任教年级</dt>
            <dd>{t?.grade ?? "（未填）"}</dd>
            <dt>任教科目</dt>
            <dd>{t?.subject ?? "（未填）"}</dd>
            <dt>授权级别</dt>
            <dd>L{t?.license_level ?? 1}</dd>
            <dt>设备指纹</dt>
            <dd className="mono">{auth.device_id}</dd>
            <dt>凭证状态</dt>
            <dd>
              {auth.state === "ok"
                ? auth.offline_grace
                  ? "离线宽限中"
                  : "有效"
                : "已过期"}
            </dd>
          </dl>

          {needProfile && !profileOpen && (
            <div className="card" style={{ marginTop: 12 }}>
              <p>请补充任教信息（首登必填）。</p>
              <button className="primary-btn" onClick={() => setProfileOpen(true)}>
                补充任教信息
              </button>
            </div>
          )}

          {profileOpen && (
            <div className="card" style={{ marginTop: 12 }}>
              <label className="field">
                <span>任教年级</span>
                <select value={grade} onChange={(e) => setGrade(e.target.value)}>
                  {[1, 2, 3, 4, 5, 6].map((g) => (
                    <option key={g} value={String(g)}>
                      {g} 年级
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>任教科目</span>
                <select value={subject} onChange={(e) => setSubject(e.target.value)}>
                  <option value="english">英语</option>
                  <option value="chinese">语文</option>
                  <option value="math">数学</option>
                </select>
              </label>
              <label className="field checkbox">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                />
                <span>我同意仅供个人教学使用的条款</span>
              </label>
              <div className="btn-row">
                <button className="primary-btn" disabled={busy || !agree} onClick={saveProfile}>
                  保存
                </button>
                <button className="ghost-btn inline" onClick={() => setProfileOpen(false)}>
                  取消
                </button>
              </div>
            </div>
          )}

          {/* 激活码 */}
          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-title">激活码</div>
            {!activateOpen ? (
              <button className="ghost-btn inline" onClick={() => setActivateOpen(true)}>
                输入激活码
              </button>
            ) : (
              <>
                <label className="field">
                  <span>激活码</span>
                  <input
                    placeholder="ABC-1234-DEFG-5678"
                    value={licenseKey}
                    onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                  />
                </label>
                <div className="btn-row">
                  <button
                    className="primary-btn"
                    disabled={busy || !licenseKey.trim()}
                    onClick={activate}
                  >
                    绑定
                  </button>
                  <button className="ghost-btn inline" onClick={() => setActivateOpen(false)}>
                    取消
                  </button>
                </div>
              </>
            )}
          </div>

          {/* 口令状态 */}
          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-title">课堂口令</div>
            {!lic?.present ? (
              <p className="hint">尚未申请课堂口令。申请后一学期内可解锁对应级别内容包。</p>
            ) : (
              <dl className="kv" style={{ border: "none", padding: 0 }}>
                <dt>学期</dt>
                <dd>{lic.semester}</dd>
                <dt>到期</dt>
                <dd>
                  {lic.expires_at}
                  {lic.state === "expired" && "（已到期 · 只读旧锁新）"}
                  {lic.state === "expiring_soon" &&
                    `（${lic.days_left ?? "?"} 天后到期，建议续期）`}
                </dd>
                <dt>级别</dt>
                <dd>L{lic.license_level}</dd>
                <dt>机器绑定</dt>
                <dd>
                  {(lic.bound_machines?.length ?? 0)} / {lic.machine_quota ?? 3}
                </dd>
              </dl>
            )}
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button className="primary-btn" disabled={busy} onClick={renew}>
                {busy ? "处理中…" : lic?.present ? "续期口令" : "申请口令"}
              </button>
            </div>
          </div>

          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="ghost-btn inline" onClick={logout}>
              退出登录
            </button>
          </div>
        </>
      )}

      <p className="hint">
        零采集：本壳不上传任何学生数据；上报仅含授权/使用状态白名单字段。
      </p>
    </section>
  );
}
