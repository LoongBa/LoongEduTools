// 在线形态内容缓存：IndexedDB（零依赖手写极简 KV 封装，符合项目「浏览器原生 API 优先」）。
// 离线形态不 import 此模块（VITE_BUILD_TARGET 折叠 tree-shake）。存储内容 JSON（manifest + 单元包），
// 素材（音频/图片）走 URL 直引不落库。
const DB_NAME = "dianedu-content";
const STORE = "kv";
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb open failed"));
  });
  return dbPromise;
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb op failed"));
  });
}

/** 读取缓存；无值/异常返回 null。 */
export async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const v = await withStore("readonly", (s) => s.get(key));
    return (v as T | undefined) ?? null;
  } catch {
    return null;
  }
}

/** 写入缓存；失败静默（不阻塞内容加载）。 */
export async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.put(value, key));
  } catch {
    /* ignore */
  }
}

/** 批量写入。 */
export async function idbBulkSet(entries: Record<string, unknown>): Promise<void> {
  const db = await openDb();
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      const s = tx.objectStore(STORE);
      for (const [k, v] of Object.entries(entries)) s.put(v, k);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** 全量读取（返回 Record<key, value>）。 */
export async function idbGetAll<T>(): Promise<Record<string, T>> {
  try {
    const db = await openDb();
    return await new Promise<Record<string, T>>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => {
        const out: Record<string, T> = {};
        // keys 与 values 并行取
        const kreq = tx.objectStore(STORE).getAllKeys();
        kreq.onsuccess = () => {
          const keys = kreq.result as string[];
          const vals = req.result as T[];
          keys.forEach((k, i) => {
            out[k] = vals[i];
          });
          resolve(out);
        };
        kreq.onerror = () => reject(kreq.error);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return {};
  }
}

/** 清空缓存（与「清空本机进度」联动）。 */
export async function idbClear(): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.clear());
  } catch {
    /* ignore */
  }
}
