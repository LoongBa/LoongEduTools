import { useCallback, useEffect, useRef, useState } from "react";
import { AuthStatus, ClassProgress, InstalledPackage, StoreItem, api } from "./api";
import CheckinView from "./CheckinView";
import ClassesView from "./ClassesView";
import DisciplineView from "./DisciplineView";
import LoginView from "./LoginView";
import ProfileView from "./ProfileView";
import ReflectionView from "./ReflectionView";
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
  | "reflection"
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

/**
 * 错误归一化：纯浏览器环境（未注入 __TAURI_INTERNALS__）下任何 invoke 都会抛
 * `TypeError: Cannot read properties of undefined (reading 'invoke')` —— 对教师
 * 毫无信息量，归一成可读指引；其余错误原样透传。
 */
function friendlyErr(e: unknown): string {
  const s = String(e);
  return s.includes("reading 'invoke'") || s.includes('reading "invoke"')
    ? "当前以浏览器方式打开页面（非客户端环境），系统命令不可用：请通过「桃李助手」客户端程序启动。"
    : s;
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
  /** 当前已打开的内容包（R8 导出 PDF 显示条件：loadedPkg === 目标包，避免导错对象） */
  const [loadedPkg, setLoadedPkg] = useState<string | null>(null);
  /** 应用列表空态 · 内容服务器探测三段态（v0.2：先探服务器，再决定提示/自动打开页面） */
  const [serverProbe, setServerProbe] = useState<
    "idle" | "probing" | "reachable" | "unreachable"
  >("idle");
  const [serverBase, setServerBase] = useState<string | null>(null);
  /** 可达时自动打开内容服务器页面——每会话只开一次，避免重复拉起浏览器 */
  const serverPageAutoOpened = useRef(false);
  /** 探测重入闸（「重新检测」连点防抖） */
  const serverProbingRef = useRef(false);
  /** 右上角账号下拉菜单开合（v0.2：登录/个人信息/设置收进头像菜单，侧栏不再直挂） */
  const [avatarOpen, setAvatarOpen] = useState(false);

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
      setErr(friendlyErr(e));
    }
  }, []);

  // 应用列表空态 · 内容服务器探测（v0.2 三段流程）：
  // 本地无内容包时先探服务端可达性——可达则自动打开服务器页面一次（内容/扩展分区
  // 由壳内「下载扩展」页承载，R03 §3.2），不可达才提示手动放入 packages/ 并给
  // 「打开运行目录」快捷方式；本地有包时不探测不打扰。
  const runServerProbe = useCallback(async () => {
    if (serverProbingRef.current) return;
    serverProbingRef.current = true;
    setServerProbe("probing");
    try {
      const base = await api.serverPing();
      setServerBase(base);
      setServerProbe("reachable");
      if (!serverPageAutoOpened.current) {
        serverPageAutoOpened.current = true;
        await api.openServerPage(base).catch((e) => setErr(friendlyErr(e)));
      }
    } catch {
      setServerProbe("unreachable");
    } finally {
      serverProbingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (view === "apps" && packages.length === 0 && serverProbe === "idle") {
      void runServerProbe();
    }
  }, [view, packages.length, serverProbe, runServerProbe]);

  useEffect(() => {
    refresh();
    api
      .testWebview2()
      .then((v) => setWv2(v))
      .catch((e) =>
        console.warn("[WebView2] 状态查询失败（主窗口已渲染，不影响使用）", e),
      );
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
      setLoadedPkg(pkg.package_id);
    } catch (e) {
      setErr(friendlyErr(e));
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
            <div className="brand-name">桃李助手</div>
            <div className="brand-sub">龙爸乐学系列 v0.2.0</div>
          </div>
        </div>
        <nav>
          <button className={navClass("apps")} onClick={() => setView("apps")}>
            应用
          </button>
          <button className={navClass("store")} onClick={() => setView("store")}>
            下载扩展
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
          <button className={navClass("reflection")} onClick={() => setView("reflection")}>
            复盘本
          </button>
          <button className={navClass("timer")} onClick={() => setView("timer")}>
            计时器
          </button>
          <button className={navClass("discipline")} onClick={() => setView("discipline")}>
            纪律
          </button>
          {/* 登录/个人信息/设置已收进右上角头像菜单（v0.2 常用交互） */}
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
        {/* WebView2 提示 banner 已移除（v0.2）：主窗口能渲染即证明 WebView2 在工作，
            该 banner 只会是误报；真缺失时由 Rust preflight 原生弹窗处理（见 webview2.rs） */}
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
            {updates.length} 个内容包有新版本，前往下载扩展更新（点击前往）。
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

        {view === "reflection" && <ReflectionView />}

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
              <div className="empty">
                {/* v0.2 三段流程：先探内容服务器 → 可达自动开页面 / 不可达才提示手动放入 */}
                {serverProbe === "reachable" ? (
                  <>
                    <p>本地无内容包和扩展；内容服务器已连接。</p>
                    <p>
                      <button
                        className="ghost-btn inline"
                        disabled={!serverBase}
                        onClick={() => {
                          if (serverBase)
                            api
                              .openServerPage(serverBase)
                              .catch((e) => setErr(friendlyErr(e)));
                        }}
                      >
                        打开内容服务器页面
                      </button>{" "}
                      <button
                        className="ghost-btn inline"
                        onClick={() =>
                          api.openRunDir().catch((e) => setErr(friendlyErr(e)))
                        }
                      >
                        打开运行目录
                      </button>
                    </p>
                  </>
                ) : serverProbe === "unreachable" ? (
                  <>
                    <p>本地无内容包和扩展。</p>
                    <p>
                      内容服务器当前无法连接（未配置服务端或网络不通）。可手动将
                      内容包目录放入 <code>packages/</code>（exe 同级）或{" "}
                      <code>packages-embedded/</code>（预装）后重启。
                    </p>
                    <p>
                      <button
                        className="ghost-btn inline"
                        onClick={() =>
                          api.openRunDir().catch((e) => setErr(friendlyErr(e)))
                        }
                      >
                        打开运行目录
                      </button>{" "}
                      <button
                        className="ghost-btn inline"
                        onClick={() => setServerProbe("idle")}
                      >
                        重新检测
                      </button>
                    </p>
                  </>
                ) : (
                  <p>
                    本地无内容包和扩展。
                    {serverProbe === "probing" && " 正在连接内容服务器…"}
                  </p>
                )}
              </div>
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
                    {loadedPkg === p.package_id && (
                      <span
                        className="card-export"
                        title="将当前打开的内容包导出为 PDF（打印对话框）"
                        onClick={(e) => {
                          e.stopPropagation();
                          api.printContent().catch((e) => setErr(friendlyErr(e)));
                        }}
                      >
                        导出 PDF
                      </span>
                    )}
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
                      {loadedPkg === r.package_id && (
                        <span
                          className="recent-export"
                          title="将当前打开的内容包导出为 PDF（打印对话框）"
                          onClick={(e) => {
                            e.stopPropagation();
                            api.printContent().catch((e) => setErr(friendlyErr(e)));
                          }}
                        >
                          导出 PDF
                        </span>
                      )}
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
              <dd>0.2.0</dd>
              <dt>WebView2</dt>
              <dd>
                {wv2 === "checking"
                  ? "检测中…"
                  : wv2
                    ? `已安装 ${wv2}`
                    : "未检出（不影响运行）"}
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

      {/* 右上角账号头像（v0.2）：未登录=匿名灰头像，已登录=姓名首字彩色头像；
          下拉收 登录/个人信息 + 设置，替代原侧栏两项 */}
      <div className="user-menu">
        <button
          className={`avatar-btn${avatarOpen ? " open" : ""}`}
          title={profileLabel}
          aria-label="账号菜单"
          onClick={() => setAvatarOpen((o) => !o)}
        >
          {auth?.logged_in ? (
            <span className="avatar-initial">
              {(auth.teacher?.name || "师").slice(0, 1)}
            </span>
          ) : (
            <svg className="avatar-glyph" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.34 0-10 1.67-10 5v3h20v-3c0-3.33-6.66-5-10-5z" />
            </svg>
          )}
        </button>
        {avatarOpen && (
          <>
            {/* 点击菜单外任意处关闭 */}
            <div
              className="user-menu-backdrop"
              onClick={() => setAvatarOpen(false)}
            />
            <div className="user-menu-panel">
              <div className="user-menu-head">
                <div className="user-menu-name">
                  {auth?.logged_in
                    ? auth.teacher?.name || "已登录"
                    : "未登录"}
                </div>
                <div className="user-menu-sub">
                  {auth?.logged_in
                    ? "点击下方管理个人信息与口令"
                    : "登录后可同步口令与班级"}
                </div>
              </div>
              <button
                onClick={() => {
                  setView("profile");
                  setAvatarOpen(false);
                }}
              >
                {auth?.logged_in ? "个人信息" : "登录"}
              </button>
              <button
                onClick={() => {
                  setView("settings");
                  setAvatarOpen(false);
                }}
              >
                设置
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
