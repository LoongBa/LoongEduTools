/**
 * P3 启动内容包更新检查（D05 §3 状态可视：内容包更新常驻角标）
 *
 * 每会话一次：复用 store_list_available（自带 installed/update_available 对比），
 * 返回可更新包列表；调用方负责渲染非侵入 banner。静默失败，条件对齐
 * App.tsx 启动刷新（api_configured && !offline_grace），离线不弹。
 */
import { StoreItem, api } from "./api";

let checkedThisSession = false;

/** 本会话首次调用执行真实检查；再次调用直接返回空（防重复弹）。 */
export async function checkPackageUpdates(): Promise<StoreItem[]> {
  if (checkedThisSession) return [];
  checkedThisSession = true;
  try {
    const auth = await api.authStatus();
    if (!auth.api_configured || auth.offline_grace || auth.state === "anonymous") {
      return [];
    }
    const list = await api.storeListAvailable();
    return list.packages.filter((p) => p.installed && p.update_available);
  } catch {
    return []; // 静默：无网/未配服务端 都不打扰
  }
}

/** 测试/手动重查用 */
export function resetUpdateCheck(): void {
  checkedThisSession = false;
}
