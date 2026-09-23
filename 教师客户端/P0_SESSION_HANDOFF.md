# P0 会话交接 · 2026-09-24

## 已完成（本会话 commit）

- **Commit**: `feat(教师客户端): P0 壳骨架 + 内容包预装 + 验证计划`（51 files, +7679 lines）
- **Tauri 2 壳**: 双窗口/单实例/WebView2 检测/5 命令层（package/window/recents）编译通过
- **打包脚本**: pack_content.py（AES-256-GCM + ed25519 签名，明文/加密双模式）
- **预装包**:
  - pep-reader-u01（141 files，明文，data/app/index.html 验证）
  - pep-vocab-cards（976词 + 63音频分片，9.91MB，flashcards.js 钩子注入）
- **词卡音频**: TTS 843/844（en-GB-SoniaNeural）→ base64 分片（63 JS 文件，9.75MB）
- **验证文档**: D06-V0.1-P0验证计划.md（本机12项✅ / 待环境11项⏳）
- **看板**: docs/开发进度看板.md 教师版 P0 状态更新

## 待办（需用户/后续会话）

1. **Push**: 已 commit 未 push（AGENTS.md 规则：push/tag 需用户另行同意）
2. **Win7 真机验证**: D06 §2 全部 11 项待环境（Win7 SP1 x64 + U盘 + 断网）
3. **MSI 打包**: WiX 下载超时失败（P0 不依赖，绿色目录形态仅需 exe）
4. **P1 占位字段**: TEMP_PREFIX / loaded_temp_dir dead_code 警告（P1 实装时使用）

## 关键路径

- 工程: `教师客户端/src/`（Tauri + React）
- 打包: `教师客户端/scripts/pack_content.py`
- 预装: `教师客户端/src/src-tauri/packages-embedded/`（gitignore，可再生）
- 验证: `教师客户端/docs/D06-V0.1-P0验证计划.md`
- 看板: `docs/开发进度看板.md`

## 验证命令

```powershell
cd 教师客户端/src/src-tauri && cargo check  # EXIT=0
cd 教师客户端/src && pnpm build              # EXIT=0
```
