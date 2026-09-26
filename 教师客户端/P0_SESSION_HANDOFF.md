# 会话交接 · 教师客户端 v0.3 合入收尾 + D11 下载目录监控（2026-09-27）

## 已完成（本会话 commit，全部已推 origin/main）

### v0.3 合入收尾（上一段）
- `96b6cfe`: 修 4 缺陷（main.tsx 主题键名 taoli.theme.mode / CheckinView+ReflectionView 键前缀 loongedu.*→taoli.* / Sidebar 全屏 api.toggleFullscreen / DownloadExtView U盘导入 api.storeImportUsb）+ 删死代码（MOCK_TOOLBOX_MANIFEST+MOCK_STUDENTS）+ MOCK_USER 接线（useAccountInfo= auth_status+license_status）
- `08f9fa1`+`5df8fee`: 决策点1 易教工具目录壳内内置（MOCK_EDU_TOOLS→ui/lib/eduTools.ts）
- `dcb239c`+`ad5b057`+`842d3de`+`d0506fe`+`6fe0ceb`: 决策点4 服务端地址可配置化（recents 结构化读写防覆盖 5单测 + api_base 编译期默认 LOONGEDU_API_BASE + 下载源绝对 download_url + config.example.json + README 五·B）
- `df0bc16`+`79ece6c`+`7cc5edd`: **服务端签名壳配置**（shell_config.rs 拉取+验签+AES-GCM 加密缓存 config.enc + gen_shell_config.py + package.rs 参数化 verify_signed_envelope + D10 v1.0 文档）

### D11 下载目录监控（本段主线）
- `e3a2372`: **D11 设计文档** `教师客户端/docs/D11-下载目录监控与课件素材自动归档方案.md`（398 行：确认卡片/通知合并/三类分类/归档打包全设计 + 8 项决策记录 + P1-P5 实施顺序）
- `f937cf3`: **D11 P1 观测层** —— `教师客户端/src/src-tauri/src/commands/archive.rs` 新建：
  - 下载目录定位（注册表 User Shell Folders KNOWN_FOLDERID_Downloads {374DE290-123F-4565-9164-39C4925E467B} + %USERPROFILE%\Downloads 降级 + %ENV% 展开，Win7 兼容）
  - std 轮询线程（2s 快照 diff + :crdownload/.part/.tmp/.download 排除 + 大小稳定判定）→ `app.emit("archive:new")`
  - config.json `archive` 子对象读改写（保留未知字段，复用 recents 模式）
  - 命令：`archive_watch_dir`（设目录+重启线程）/ `archive_status`
  - setup ⑤ 启动自动定位监视（失败仅 log）
  - 5 单测（temp后缀/快照/env展开/diff检测/配置保留）
  - **版本统一 0.2.1**（Cargo.toml/tauri.conf.json/Cargo.lock/前端 package.json 0.1.0→0.2.1/SHELL_VERSION 常量 0.1.0→0.2.1，对齐 tag 教师客户端-v0.2.1）
- `2c98216`: 看板回写

### D11 P2 确认卡片（2026-09-27，本会话完成，版本 0.2.2）
- `emit_new` payload 补 `path` 字段（dir.join(name)）——确认卡片与 P3 归档需要完整路径
- `types.ts` 新增：`ArchiveMeta`（学科/版本/年级/册次）/ `PendingArchive`（待确认队列）/ `ArchiveRule`（自动整理规则）/ `ArchiveConfidence`（三档）
- 新建 `ui/lib/archiveDetect.ts`：两级识别（整体规则 `U0[1-4]`=四上 / `U0[5-8]`=四下 → 完整 meta 高置信；维度降级学科/年级/册次/版本独立打分 → 中置信；全无 → 低置信 meta=null）+ 级联数据源（学科→版本 `VERSIONS_BY_SUBJECT` / 年级 1-6 / 册次上下）+ 规则工具（`escapeRegex`/`detectPatternFor`/`ruleMatches`）+ 文件类型标签
- 新建 `ui/lib/archiveDetect.test.ts`：**17 单测**（高/中/低置信 / 单元号册次推断 / 版本默认 / 级联数据源 / 规则转义匹配 / 类型标签）
- `store.ts` 新增：`useArchivePending`（待确认队列持久化 `taoli.archive.pending`，同 path 去重，上限 50）+ `useArchiveRules`（自动整理规则 `taoli.archive.rules`，同 pattern 去重，上限 30，`matchFor` 供 P3 静默归档判定）
- 新建 `ui/components/ArchiveConfirmCard.tsx`：检测到新下载卡片——文件名+大小+类型 / 版权红线（仅供个人教学和学习使用）/ 置信度徽章（绿=自动识别、黄=部分识别请确认、灰=请手动归类）/ 级联四字段（父未选→子禁用、父变更→子清空）/ 册次 radio / 「下次同类文件自动整理」记忆勾选（显示同类关键词）/ 忽略+确认归档
- `Shell.tsx`：`listen("archive:new")` 订阅（非 Tauri 环境 catch 降级）→ 入队 + 弹卡片；确认 → 状态 confirmed + 记忆写规则 + 通知 + toast；忽略 → 通知；关闭 → 保留待确认
- **版本 0.2.1→0.2.2**（Cargo.toml/tauri.conf.json/Cargo.lock/package.json/SHELL_VERSION 五处对齐）
- 四绿验证：cargo 83/83、tsc 0、vitest 59/59（42 原有+17 新增）、pnpm build ✓

### D11 P3 归档移动（2026-09-27，本会话完成，版本 0.2.3）
- `archive.rs` 扩展（P3 §6）：
  - `ArchiveMeta`/`ArchiveEntry` 结构 + `ARCHIVE_EXT` 常量（教材 PDF/课堂图片/音频/视频，独立于 textbook IMAGE_EXT）+ `ext_of` 白名单校验
  - `archive_confirm`：拷贝（非移动，决策 2）→ staging → `fs::rename` 原子落盘 → `archives.json` 索引写（保留未知字段，仿 recents::save_recents）；`dedup_name` 重名 `name (1).ext` 递增；目标 `<exe>/archives/<学科>/<版本>/<年级><册次>/`
  - `archive_undo`：删副本 + 回写索引（源文件在下载目录天然可恢复）
  - `archive_list`（新→旧排序）/ `archive_pack_index`（P5 索引导出：entries 元数据不含实体）
  - 无 chrono 依赖的 ISO 时间戳：`civil_from_days` Howard Hinnant 民用日历逆变换
  - **4 新增单测**：ext 白名单 / dedup 重名 / 索引保留未知字段 / 日历日期（cargo 87/87）
- `lib.rs` invoke_handler 注册 4 命令
- 前端：
  - `api.ts`：archiveConfirm/archiveUndo/archiveList/archivePackIndex + ArchiveMeta/ArchiveEntry 类型
  - `Shell.tsx`：确认动作升级——真实 `api.archiveConfirm(path, meta)`，成功→`store.confirm` 标记 `archived` + 记忆规则 + 通知；失败→toast.error 且卡片保持可重试/忽略
  - `types.ts`：`PendingArchive.status` 加 `archived`
  - `DownloadExtView.tsx`：新增「素材归档」Tab（第 5 分区）——archive_list 清单（学科·版本·年级册次·大小·时间）+ 每项撤销按钮（archive_undo + toast + 刷新）+ 版权提示 + 空态引导
- **版本 0.2.2→0.2.3**（五处对齐；注意 Cargo.lock 全量 Replace 会误伤 cfg_aliases 等依赖版本，已修复为仅 teacher-client 0.2.3）
- 四绿验证：cargo 87/87、tsc 0、vitest 59/59、pnpm build ✓

## 待办（后续会话 P4-P5）

1. **P4 通知扩展**（D11 §7）：types.ts Notification 加 `channel: "plugin"|"content"|"textbook"|"archive"`（勿扩展 kind 严重度——TopBar KIND_ICON 字面量索引会编译失败）+ `meta`/`action` 字段 + `push` 加 groupKey 合并（count++ + 时间窗 15min/24h）+ DownloadExtView TasksSection 按 channel 分组 + TopBar 通知渲染分组
2. **P5 打包**（D11 §8）：ToolboxPanel exportPack 加 media_archive 索引段（`archive_pack_index` 已就绪，直接嵌入）+ 「仅供个人教学和学习使用」文案全覆盖
3. **前置修复**（P4 前必做）：`LaunchpadView.tsx:97` startDownload prop 缺 info 参数 → 工具下载被标 "pkg" 的存量脏数据；`taoli.settings.notifyLaunch` 死开关补读取闭环
4. **静默归档**（D11 §5.4 规则命中）：`useArchiveRules.matchFor` 已就绪，接入轮询/事件处理——命中规则的文件跳过确认卡片直接 archive_confirm + 通知

## 关键决策（D11 §12 决策记录摘要）

- 轮询监视（std 线程）而非 notify crate：项目硬约束「零新增 crate」（Cargo.toml 两次声明 + MSRV 1.77.2）+ 网络盘兼容
- 归档=拷贝非移动：下载目录是用户浏览器资产，保留原件可撤销
- Notification 加独立 channel 而非扩展 kind：职责分离防 TopBar 编译断裂
- 不做 toast 操作按钮：Tauri 通知插件 Actions API 是 Mobile Only，确认交互收敛应用内
- MVP 只打包索引不打包实体：Rust 无 zip 写入能力（新增依赖需再过 MSRV/Win7 验证）

## 并行会话状态（重要！不触碰）

- **D10 已改名扩编**（`bb797c1`）：→《D10 签名与加密方案》v2.0 统一方案（我的壳配置内容为 Part A，内容包/凭证/密钥管理并入 §8-§10）+ 新增 **D12 扩展内容模块指南**
- 并行会话活跃文件：`教师客户端/docs/D10-签名与加密方案.md`、`D12-扩展内容模块-原理与创建更新使用指南.md`（均 untracked/并行提交）
- 我的 D11 文档与并行会话 D11? 无撞车（`D11-下载目录监控与课件素材自动归档方案.md` 唯一，23393 字节）
- 教师客户端 src-tauri 其他命令（contentkey/credential/protocol/watermark）属并行会话 D09 工作，已提交 `92b6048`，勿动

## 关键路径

- 新功能: `教师客户端/src/src-tauri/src/commands/archive.rs`（P1 已落）
- 设计: `教师客户端/docs/D11-下载目录监控与课件素材自动归档方案.md`
- 通知: `教师客户端/src/ui/lib/store.ts`（useNotifications/useDownloadTasks）+ `types.ts` + `components/TopBar.tsx` + `DownloadExtView.tsx`
- 打包: `教师客户端/src/ui/components/ToolboxPanel.tsx`（exportPack/importPack 前端 JSON）
- 配置读写模式（必须照抄）: `教师客户端/src/src-tauri/src/commands/recents.rs`（save_recents 保留未知字段）
- 签名信封参考: `教师客户端/src/src-tauri/src/commands/package.rs`（verify_signed_envelope）+ `shell_config.rs`
- 看板: `docs/开发进度看板.md` 活跃项 10

## 验证命令

```powershell
cd 教师客户端/src/src-tauri && cargo test   # 83/83（P1 后）
cd 教师客户端/src && pnpm exec tsc --noEmit  # 0
cd 教师客户端/src && pnpm test               # 42/42
cd 教师客户端/src && pnpm build              # EXIT=0
```

## 版本

v0.2.3 已统一（Cargo/tauri.conf/package.json/SHELL_VERSION 五处对齐；0.2.2 版为 D11 P2 交付）；tag 教师客户端-v0.2.3 需用户另行同意。下一功能交付（P4）时子版本升 0.2.4。