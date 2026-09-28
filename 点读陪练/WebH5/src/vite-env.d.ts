/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 构建形态：offline=minitool 离线包（禁网络）；online=Web 部署（可联网、离线可运行） */
  readonly VITE_BUILD_TARGET?: "offline" | "online";
  /** 在线内容 API base（子路径部署）：/peilian；离线构建为空串 */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
