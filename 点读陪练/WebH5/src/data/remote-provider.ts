// 远程内容 Provider（在线形态，VITE_BUILD_TARGET==="online" 才注册；离线形态被 tree-shake）。
// 协议（发布端 publish_online.py 生成，对齐架构文档 §1.2 version/hash 设计）：
//   GET /api/manifest          → { schema, updated_at, grades: [{ grade_code, grade_label, units: [{ id, no, title?, cn?, version?, hash? }] }] }
//   GET /api/units/<id>        → { content?, song?, textbook? }（内容包 + 点唱台，素材字段为完整 URL）
// 策略：manifest 拉取成功 → 逐单元 hash 比对缓存 → 变更才拉取；全失败 → 用缓存（离线可运行）；无缓存 → null（loadCatalog 降级内联）。
import { idbGet, idbSet } from "./content-cache";
import type { CatalogSnapshot, ContentProvider } from "./content-provider";
import type { Manifest } from "./content";

export interface RemoteManifest {
  schema: string;
  updated_at: string;
  grades: {
    grade_code: string;
    grade_label: string;
    units: {
      id: string;
      no: number;
      title?: string;
      cn?: string;
      version?: string;
      hash?: string;
    }[];
  }[];
}

interface CachedUnit {
  __hash?: string;
  content?: unknown;
  song?: unknown;
  textbook?: unknown;
}

const MANIFEST_KEY = "manifest";
const unitKey = (id: string) => `unit:${id}`;

export class RemoteProvider implements ContentProvider {
  private lastStamp: string | null = null;

  constructor(private baseUrl = "") {}

  async resolve(): Promise<CatalogSnapshot | null> {
    // 1) 拉远程 manifest（失败 → 走缓存）
    let remote: RemoteManifest | null = null;
    try {
      const r = await fetch(`${this.baseUrl}/api/manifest`, { cache: "no-store" });
      if (r.ok) remote = (await r.json()) as RemoteManifest;
    } catch {
      remote = null;
    }

    const cachedManifest = await idbGet<RemoteManifest>(MANIFEST_KEY);
    const manifest = remote ?? cachedManifest;
    if (!manifest || manifest.grades.length === 0) return null;

    // 2) 逐单元：hash 未变用缓存；否则远程拉取（失败回落缓存/跳过）
    const units: CatalogSnapshot["units"] = {};
    for (const grade of manifest.grades) {
      for (const mu of grade.units) {
        const cached = await idbGet<CachedUnit>(unitKey(mu.id));
        const needFetch = !cached || !cached.content || (!!mu.hash && cached.__hash !== mu.hash);
        let unit: CachedUnit | null = cached;
        if (needFetch) {
          const fresh = await this.fetchUnit(mu.id);
          if (fresh) {
            unit = { __hash: mu.hash, ...fresh };
            await idbSet(unitKey(mu.id), unit);
          } else if (!cached?.content) {
            continue; // 远程失败且无缓存：跳过该单元（loadCatalog 忽略缺失单元）
          }
        }
        if (unit) {
          units[mu.id] = {
            content: unit.content ?? null,
            song: unit.song ?? null,
            textbook: unit.textbook ?? null,
          };
        }
      }
    }
    if (Object.keys(units).length === 0) return null; // 全缺：降级

    // 3) manifest 更新/首拉 → 写缓存；记录 dataStamp
    if (remote) {
      await idbSet(MANIFEST_KEY, remote);
      this.lastStamp = remote.updated_at ?? null;
    } else if (cachedManifest) {
      this.lastStamp = cachedManifest.updated_at ?? null;
    }

    return { manifest: manifest as unknown as Manifest, units };
  }

  private async fetchUnit(id: string): Promise<Omit<CachedUnit, "__hash"> | null> {
    try {
      const r = await fetch(`${this.baseUrl}/api/units/${id}`, { cache: "no-store" });
      if (!r.ok) return null;
      return (await r.json()) as Omit<CachedUnit, "__hash">;
    } catch {
      return null;
    }
  }

  /** 内容数据更新时间戳（最后一次成功 resolve 的 manifest updated_at；供「内容更新」比对）。 */
  dataStamp(): string | null {
    return this.lastStamp;
  }
}
