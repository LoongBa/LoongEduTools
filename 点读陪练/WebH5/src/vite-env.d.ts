/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 构建形态：offline=minitool 离线包（禁网络）；online=Web 部署（可联网、离线可运行） */
  readonly VITE_BUILD_TARGET?: "offline" | "online";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
