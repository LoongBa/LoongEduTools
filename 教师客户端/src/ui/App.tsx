import { useCallback, useEffect, useState } from "react";
import { AuthStatus, ClassProgress, InstalledPackage, StoreItem, api } from "./api";
import CheckinView from "./CheckinView";
import ClassesView from "./ClassesView";
import DisciplineView from "./DisciplineView";
import LoginView from "./LoginView";
import ProfileView from "./ProfileView";
import RosterView from "./RosterView";
import StoreView from "./StoreView";
import TimerView from "./TimerView";
import { useContentProgressReporting } from "./reportHook";
import { checkPackageUpdates } from "./updateCheck";
import "./App.css";

type View =
  | "apps"
  | "store"
  | "quickstart"
  | "roster"
  | "classes"
  | "checkin"
  | "timer"
  | "discipline"
  | "profile"
  | "login"
  | "settings";

type ThemeMode = "light" | "dark" | "system";

function currentTheme(): ThemeMode {
  const v = document.documentElement.dataset.theme;
  return v === "light" || v === "dark" ? v : "system";
}

function App() {
  const [view, setView] = useState<View>("apps");
  const [packages, setPackages] = useState<InstalledPackage[]>([]);
  const [recents, setRecents] = useState<ClassProgress[]>([]);
  const [wv2, setWv2] = useState<string | null | "checking">("checking");
  const [err, setErr] = useState<string | null>(null);
  const [loadingPkg, setLoadingPkg] = useState<string | null>(null);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [updates, setUpdates] = useState<StoreItem[]>([]);
  const [theme, setTheme] = useState<ThemeMode>(currentTheme);

  // 主题切换：写 dataset 即时生效 + localStorage 持久化（首页渲染前由 main.tsx 引导读取）
  function applyTheme(t: ThemeMode) {
    setTheme(t);
    document.documentElement.dataset.theme = t;
    localStorage.setItem("theme", t);
  }

  // P3 白名单上报：content:progress 监听 + 启动冲刷（壳内零 AI · A01 §5.1）
  useContentProgressReporting();

  const refresh = useCallback(async () => {
    try {
      const [pkgs, rec] = await Promise.all([
        api.listInstalled(),
        api.recentsList(),
      ]);
      setPackages(pkgs);
      setRecents(rec);
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
    api
      .testWebview2()
      .then((v) => setWv2(v))
      .catch(() => setWv2(null));
    api
      .authStatus()
      .then(setAuth)
      .catch(() => setAuth(null));
  }, [refresh]);

  // 启动在线时静默刷新凭证（D01 §3.1；失败不阻断）
  useEffect(() => {
    if (auth?.state === "ok" && auth.api_configured && !auth.offline_grace) {
      api.authRefresh().catch(() => {});
    }
  }, [auth?.state, auth?.api_configured, auth?.offline_grace]);

  // 启动在线时检查内容包更新（D05 §3 状态可视；每会话一次，静默失败）
  useEffect(() => {
    if (auth?.state === "ok" && auth.api_configured && !auth.offline_grace) {
      checkPackageUpdates()
        .then((list) => {
          if (list.length > 0) setUpdates(list);
        })
        .catch(() => {});
    }
  }, [auth?.state, auth?.api_configured, auth?.offline_grace]);

  async function openPackage(pkg: InstalledPackage) {
    setLoadingPkg(pkg.package_id);
    try {
      await api.load(pkg.package_id);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoadingPkg(null);
    }
  }

  async function quickStart(p: ClassProgress) {
    const pkg = packages.find((x) => x.package_id === p.package_id);
    if (!pkg) {
      setErr(`最近内容包已不存在: ${p.package_id}`);
      return;
    }
    await openPackage(pkg);
  }

  function navClass(v: View): string {
    return view === v ? "nav-item active" : "nav-item";
  }

  const profileLabel = auth?.logged_in
    ? auth.teacher?.name || "我的"
    : "登录";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">龙</span>
          <div>
            <div className="brand-name">龙爸乐学</div>
            <div className="brand-sub">教师助手 v0.1.0</div>
          </div>
        </div>
        <nav>
          <button className={navClass("apps")} onClick={() => setView("apps")}>
            应用
          </button>
          <button className={navClass("store")} onClick={() => setView("store")}>
            内容商店
          </button>
          <button className={navClass("quickstart")} onClick={() => setView("quickstart")}>
            一键开课
          </button>
          <button className={navClass("roster")} onClick={() => setView("roster")}>
            抽卡分组
          </button>
          <button className={navClass("classes")} onClick={() => setView("classes")}>
            班级看板
          </button>
          <button className={navClass("checkin")} onClick={() => setView("checkin")}>
            打卡单
          </button>
          <button className={navClass("timer")} onClick={() => setView("timer")}>
            计时器
          </button>
          <button className={navClass("discipline")} onClick={() => setView("discipline")}>
            纪律
          </button>
          <button className={navClass("profile")} onClick={() => setView("profile")}>
            {profileLabel}
          </button>
          <button className={navClass("settings")} onClick={() => setView("settings")}>
            设置
          </button>
        </nav>
        <div className="sidebar-foot">
          <button
            className="ghost-btn"
            onClick={() => api.toggleFullscreen("main").catch(() => {})}
          >
            全屏 (F11)
          </button>
        </div>
      </aside>

      <main className="content">
        {wv2 === null && (
          <div className="banner warn">
            WebView2 运行时未安装或版本过旧（需 ≥108）。
            请运行同目录 <code>MicrosoftEdgeWebview2Setup.exe</code> 完成安装后重启本程序。
          </div>
        )}
        {err && (
          <div className="banner error" onClick={() => setErr(null)}>
            {err}（点击关闭）
          </div>
        )}
        {auth?.state === "expired" && view !== "profile" && view !== "login" && (
          <div className="banner warn" onClick={() => setView("login")}>
            登录凭证已过期，请联网重新登录（点击前往）。
          </div>
        )}
        {auth?.offline_grace && view !== "profile" && (
          <div className="banner warn">
            处于离线宽限中（7 天内有效），联网后将自动刷新凭证。
          </div>
        )}
        {updates.length > 0 && view !== "store" && (
          <div className="banner warn" onClick={() => setView("store")}>
            {updates.length} 个内容包有新版本，前往内容商店更新（点击前往）。
            <button
              className="ghost-btn inline"
              onClick={(e) => {
                e.stopPropagation();
                setUpdates([]);
              }}
            >
              知道了
            </button>
          </div>
        )}

        {view === "login" && (
          <LoginView
            onLoggedIn={(s) => {
              setAuth(s);
              setView("profile");
            }}
            onSkip={() => setView("apps")}
          />
        )}

        {view === "profile" && (
          <ProfileView
            auth={
              auth ?? {
                logged_in: false,
                state: "anonymous",
                offline_grace: false,
                teacher: null,
                expires_at: null,
                last_online_at: null,
                api_configured: false,
                device_id: "",
              }
            }
            onAuthChange={setAuth}
            onGoLogin={() => setView("login")}
          />
        )}

        {view === "discipline" && (
          <DisciplineView onOpenRoster={() => setView("roster")} />
        )}

        {view === "roster" && <RosterView initialTab="draw" />}

        {view === "classes" && (
          <ClassesView recents={recents} onRefresh={refresh} />
        )}

        {view === "checkin" && <CheckinView />}

        {view === "timer" && <TimerView />}

        {view === "store" && (
          <StoreView
            auth={auth}
            onGoLogin={() => setView("login")}
            onInstalled={() => refresh()}
          />
        )}

        {view === "apps" && (
          <section>
            <h2>应用列表</h2>
            {packages.length === 0 ? (
              <p className="empty">
                未发现内容包。把内容包目录放入 <code>packages/</code>（exe 同级）
                或 <code>packages-embedded/</code>（预装）后重启。
              </p>
            ) : (
              <div className="card-grid">
                {packages.map((p) => (
                  <button
                    key={p.package_id}
                    className="card"
                    disabled={loadingPkg === p.package_id}
                    onClick={() => openPackage(p)}
                  >
                    <div className="card-title">{p.display_name || p.name}</div>
                    <div className="card-meta">
                      v{p.package_version} · {p.package_type}
                      {p.is_embedded ? " · 预装" : ""}
                    </div>
                    <div className="card-id">{p.package_id}</div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {view === "quickstart" && (
          <section>
            <h2>一键开课</h2>
            {recents.length === 0 ? (
              <p className="empty">
                暂无最近进度。打开任一内容包后，这里会记住每个班的断点。
              </p>
            ) : (
              <ul className="recent-list">
                {recents.map((r) => (
                  <li key={r.class_id}>
                    <button className="recent-item" onClick={() => quickStart(r)}>
                      <span className="recent-class">{r.class_name}</span>
                      <span className="recent-pkg">{r.package_id}</span>
                      <span className="recent-pos">
                        {r.unit} / {r.section}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {view === "settings" && (
          <section>
            <h2>设置</h2>
            <dl className="kv">
              <dt>客户端版本</dt>
              <dd>0.1.0</dd>
              <dt>WebView2</dt>
              <dd>
                {wv2 === "checking"
                  ? "检测中…"
                  : wv2
                    ? `已安装 ${wv2}`
                    : "缺失/过旧"}
              </dd>
              <dt>内容包目录</dt>
              <dd>packages/ · packages-embedded/（exe 同级）</dd>
              <dt>本地配置</dt>
              <dd>config.json（exe 同级，U 盘跟随）</dd>
              <dt>服务端</dt>
              <dd>
                {auth?.api_configured
                  ? "已配置（config.json api_base）"
                  : "P0 离线模式（未配置 api_base）"}
              </dd>
              <dt>设备指纹</dt>
              <dd className="mono">{auth?.device_id || "-"}</dd>
              <dt>主题</dt>
              <dd>
                <div className="tab-row">
                  {(
                    [
                      { v: "light", label: "浅色" },
                      { v: "dark", label: "深色" },
                      { v: "system", label: "跟随系统" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.v}
                      className={`tab${theme === opt.v ? " active" : ""}`}
                      onClick={() => applyTheme(opt.v)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </dd>
            </dl>
            <p className="hint">
              零采集：本客户端不上传任何学生数据；进度仅存本地 config.json。
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
