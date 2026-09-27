import pkg from "../../package.json";

/** 唯一权威版本号（package.json version，构建期内联；发布时同步改 package.json 与 AGENTS.md） */
export const APP_VERSION = pkg.version;
