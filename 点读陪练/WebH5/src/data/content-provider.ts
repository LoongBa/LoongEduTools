// 内容提供方抽象：离线=构建期内联（InlineProvider）；在线=远程增量（RemoteProvider，P1 落地）。
// loadCatalog() 只消费 ContentProvider.resolve() 的快照，对数据来源零感知——
// UI 组件只认 UNITS/UNIT_ROWS/MANIFEST/TOTAL_WORDS（content.ts 活绑定），无需改动。
import { EMBEDDED_CATALOG } from "./catalog.generated";
import type { Manifest } from "./content";

/** 内容快照：manifest + 每单元原始 JSON（content/song/textbook），与 catalog.generated.ts 同构。 */
export interface CatalogSnapshot {
  manifest: Manifest | null;
  units: Record<string, { content: unknown; song: unknown; textbook: unknown }>;
}

export interface ContentProvider {
  /** 返回本次内容快照；失败/离线返回 null（由 loadCatalog 级联降级到内联/示例）。永不抛错。 */
  resolve(): Promise<CatalogSnapshot | null>;
  /** 内容数据更新时间戳（供「有新内容」比对；null = 不可知） */
  dataStamp?(): string | null;
}

/** 内置 Provider：构建期内联常量（离线形态默认；在线形态作兜底降级）。 */
export class InlineProvider implements ContentProvider {
  resolve(): Promise<CatalogSnapshot | null> {
    return Promise.resolve(EMBEDDED_CATALOG as unknown as CatalogSnapshot | null);
  }
  dataStamp(): string | null {
    return null;
  }
}

let registered: ContentProvider | null = null;
/** 注册远程 Provider（在线形态启动时调用；离线形态不调用）。 */
export function registerContentProvider(p: ContentProvider): void {
  registered = p;
}
/** 当前生效 Provider：已注册 ?? 内联兜底。 */
export function resolveProvider(): ContentProvider {
  return registered ?? new InlineProvider();
}
/** 内容数据更新时间戳：远程 Provider 的 manifest updated_at（在线形态）；离线/未拉取为 null。 */
export function currentDataStamp(): string | null {
  return registered?.dataStamp?.() ?? null;
}
