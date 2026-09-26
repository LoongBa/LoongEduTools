import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { AuthStatus, StoreItem, StoreList, api } from "./api";

interface Props {
  auth: AuthStatus | null;
  onGoLogin: () => void;
  /** 安装/导入成功后回调，App 借此刷新应用列表等高阶状态 */
  onInstalled: () => void;
}

function fmtSize(b: number | null): string {
  if (b == null) return "";
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
}

export default function StoreView({ auth, onGoLogin, onInstalled }: Props) {
  const [store, setStore] = useState<StoreList | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  const loggedIn = !!auth?.logged_in;

  const load = useCallback(async () => {
    try {
      const s = await api.storeListAvailable();
      setStore(s);
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function doDownload(pkg: StoreItem) {
    setErr(null);
    setBusyId(pkg.package_id);
    try {
      await api.storeDownload(pkg.package_id, pkg.package_version);
      await load();
      onInstalled();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function doImport() {
    setErr(null);
    let picked: string | string[] | null = null;
    try {
      picked = await open({
        multiple: false,
        filters: [{ name: "内容包 zip", extensions: ["zip"] }],
      });
    } catch (e) {
      setErr(String(e));
      return;
    }
    if (typeof picked !== "string" || !picked) return; // 用户取消
    setImportBusy(true);
    try {
      await api.storeImportUsb(picked);
      await load();
      onInstalled();
    } catch (e) {
      setErr(String(e));
    } finally {
      setImportBusy(false);
    }
  }

  const busy = busyId !== null || importBusy;

  return (
    <section>
      <div className="store-toolbar">
        <h2>下载扩展</h2>
        <div className="btn-row">
          <button
            className="ghost-btn inline"
            disabled={busy}
            onClick={() => api.storeManifest().then(() => load()).catch((e) => setErr(String(e)))}
          >
            刷新
          </button>
          <button className="primary-btn sm" disabled={busy} onClick={doImport}>
            {importBusy ? "导入中…" : "从 U 盘导入…"}
          </button>
        </div>
      </div>

      {err && (
        <div className="banner error" onClick={() => setErr(null)}>
          {err}（点击关闭）
        </div>
      )}

      {!loggedIn && (
        <div className="banner warn">
          未登录，仅可只读浏览；登录后可下载 / 更新内容包。
          <button className="ghost-btn inline" style={{ marginLeft: 10 }} onClick={onGoLogin}>
            去登录
          </button>
        </div>
      )}

      {store === null ? (
        <p className="empty">加载中…（离线时可展示最近一次缓存的清单）</p>
      ) : store.packages.length === 0 ? (
        <p className="empty">
          暂无可下载内容包。已连接服务端（config.json api_base）时自动拉取清单，
          U 盘导入不受登录状态限制。
        </p>
      ) : (
        <div className="card-grid">
          {store.packages.map((pkg) => {
            const tasking = busyId === pkg.package_id;
            const label = tasking
              ? "下载中…"
              : pkg.installed
                ? pkg.update_available
                  ? "更新"
                  : "已安装"
                : "下载";
            return (
              <div key={pkg.package_id} className="card store-card">
                <div className="card-title">{pkg.name || pkg.package_id}</div>
                <div className="card-meta">
                  v{pkg.package_version} · {pkg.package_type}
                  {fmtSize(pkg.size_bytes) && ` · ${fmtSize(pkg.size_bytes)}`}
                </div>
                <div className="store-tags">
                  <span className="badge badge-level">L{pkg.required_license_level}</span>
                  {pkg.installed && (
                    <span className="badge badge-installed">已装 v{pkg.installed_version}</span>
                  )}
                  {pkg.update_available && (
                    <span className="badge badge-update">可更新</span>
                  )}
                </div>
                <div className="store-actions">
                  <button
                    className="primary-btn sm"
                    disabled={!loggedIn || busy || tasking || (pkg.installed && !pkg.update_available)}
                    title={
                      !loggedIn
                        ? "请先登录"
                        : pkg.installed && !pkg.update_available
                          ? "已是最新版本"
                          : ""
                    }
                    onClick={() => doDownload(pkg)}
                  >
                    {label}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="hint">
        U 盘导入：选择教师 U 盘中的内容包 zip（content-pack-*.zip），本地校验
        package.json / manifest.json 与版本后自动安装到 packages/（exe 同级）。
      </p>
    </section>
  );
}