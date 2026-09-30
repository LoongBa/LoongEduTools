# D15 · 凭证解锁/导入 UI + R6 运行期验证 · 开发方案

- 版本：v0.2（Oracle 外审修订版）
- 日期：2026-09-30
- 状态：方案
- 关联：D09（内容包防扩散）§9.2-5 第③项闭环、§9.2-6 R6 运行期验证；A01 §4.5（凭证 API）

---

## 一、背景与目标

D09 波次3 遗留两项闭环（§9.2-5 第③项 / §9.2-6 第②项）：

1. **解锁/导入 UI 未落地**：Rust 侧 `credential_import_from_usb` / `credential_unlock` /
   `credential_status` 三命令已实现并注册（lib.rs L217-219），但前端 `api.ts` **未接线**，
   无 PIN/口令输入对话框、无凭证状态展示。后果：教师拿到 U 盘 `credential.enc` 后无法
   自助导入与解锁；加密内容包加载时协议层 403「内容包已加密，凭证未解锁」无 UI 兜底
   （当前属预期行为，但无引导）。
2. **R6 destroy 时序运行期验证缺失**：`package.rs::unload` 的
   `hide_watermark → content.destroy() → clear_serve_root → clear_content_key` 时序
   依赖 `tauri::AppHandle` 真实窗口，单测不可构造；D09 §9.2-6 第②项标注"待实测"。

**目标**：
- 壳内提供凭证状态卡片 + 导入（U 盘文件选择）+ 解锁（PIN + 课堂口令）完整 UI 闭环；
- 解锁成功后解锁加密内容包（协议层 403 转为正常解密加载）；
- R6 清理链时序获得可回归的单测覆盖（分层验证：纯函数断言 + 真机人工项诚实标注）。

## 二、范围

**In scope**：
- 前端：`api.ts` 三命令接线；新组件 `CredentialDialog.tsx`（PIN + 课堂口令输入）；
  `ProfileView.tsx` 授权与设备区新增凭证状态卡片与操作入口。
- Rust：`package.rs::unload` 清理链抽纯函数（可测性重构，行为不变）；新增单测。
- vitest：新 `credentialLogic.test.ts`（状态机纯逻辑）+ 既有相关测试补强。
- 文档：D09 §9.2-5/§9.2-6 状态更新；README 实施状态表补 P1 凭证 UI。

**Out of scope**：
- 凭证签发/管理端（服务端工作，已转交 TKWF 扩展模块组）。
- 水印窗口 Win7 真机表现（归 Win7 测试清单）。
- MockRuntime 集成测试（作为增强项评估，见 §六.3；不阻塞交付）。
- 认证中心/用户中心/支付中心/短信接入（TKWF 模块组）。

## 三、现状核查（2026-09-30）

| 项 | 现状 | 证据 |
|---|---|---|
| Rust 命令 | `credential_import_from_usb(app, path)` / `credential_unlock(app, pin, classroom_pass)` / `credential_status(app)` 均已实现并注册 | credential.rs L389/426/473；lib.rs L217-219 |
| 内容密钥 | `contentkey::set/content_key/clear` 全局单例，unlock 后入内存、unload 清除、永不返回 | contentkey.rs 全文 |
| 协议层 | encrypted 且无密钥 → 403「内容包已加密，凭证未解锁」 | protocol.rs L111 附近 |
| 前端 api.ts | **三命令零接线**（仅 auth_*/storeImportUsb 存在） | api.ts L284-314 |
| 状态展示 | ProfileView「授权与设备」无凭证行 | ProfileView.tsx L148-158 |
| unload | 命令壳直接调用 hide→destroy→clear 链，无中间可测层 | package.rs L126-136 |
| tauri test feature | 2.11.6 有 `test = []` feature + `pub mod test`（lib.rs L1099），源码 lazy 加载 | Cargo.toml L123 |

## 四、设计

### 4.1 前端接线（api.ts）

```ts
// ---- D15 凭证（credential.rs · D09 §2 / A01 §4.5）----
credentialStatus: () => invoke<CredentialStatus>("credential_status"),
credentialImportFromUsb: (path: string) =>
  invoke<CredentialMeta>("credential_import_from_usb", { path }),
credentialUnlock: (pin: string, classroomPass: string) =>
  invoke<UnlockResult>("credential_unlock", { pin, classroomPass }),
```

对应 `types.ts` 新增三接口（字段与 Rust `serde` 输出逐字段对齐）：

```ts
export interface CredentialStatus {
  present: boolean;
  machine_fp: string;
  format_ver: string | null;
  machine_fp_ok: boolean | null;
  state: "none" | "valid" | "expiring_soon" | "expired" | "clock_rollback";
  issued_at: number | null;
  expires_at: number | null;
  seq: number | null;
  quota_ref: string | null;
  days_left: number | null;
  last_verified_at: number | null;
  key_available: boolean;
}
export interface CredentialMeta {
  installed: boolean; format_ver: string; machine_fp_ok: boolean; machine_fp: string;
  issued_at: number; expires_at: number; seq: number; quota_ref: string;
}
export interface UnlockResult { ok: boolean; expires_at: number; seq: number; key_available: boolean; }
```

### 4.2 凭证状态卡片（ProfileView「授权与设备」区）

新增一行「内容凭证」+ 状态徽章 + 操作按钮，状态机：

| 状态 | 判定 | 展示 | 操作 |
|---|---|---|---|
| 未导入 | `!present` | 「未导入」灰 | 「从 U 盘导入」 |
| 已导入未解锁 | `present && !key_available && machine_fp_ok !== false` | 「已导入 · 未解锁」琥珀 | 「解锁」（primary）+「重新导入」 |
| 已解锁 | `present && key_available && state ∈ {valid, expiring_soon}` | 「已解锁」绿 + 剩余天数 | 「解锁」重开（PIN 变更后） |
| 绑定其他机器 | `present && machine_fp_ok === false` | 「凭证绑定其他机器」红 | 仅提示「请到办公室按本机指纹重新签发」+「重新导入」（禁用解锁） |
| 已过期 | `state === "expired"` | 「已过期」红 | 「重新导入」 |
| 时钟回拨 | `state === "clock_rollback"` | 「系统时间异常」红 | 仅提示（修复系统时间后自动恢复） |

- 徽章复用现有 `BadgeCheck`/`ShieldCheck` 视觉语言（ProfileView 既有）。
- 所有状态均显示：`quota_ref`（授权引用）、`machine_fp` 后 8 位（脱敏展示，完整值不
  渲染；原 InfoRow 已有 `acct.deviceId` 类似展示）。
- 状态刷新：进入 Profile 视图时拉一次 `credential_status`；导入/解锁成功后即时刷新。

### 4.3 CredentialDialog（mode: unlock / import）

新组件 `ui/components/CredentialDialog.tsx`，模式参考 `LaunchConfigDialog`（fixed overlay +
aria-modal + 取消/主按钮）。**支持双模式复用**（Oracle N-3 采纳）：

- `mode="unlock"`（默认）：字段 `PIN（≥6 位，password 输入，不显示明文）` +
  `课堂口令（password）`；主按钮「解锁」→ `api.credentialUnlock(pin, classroomPass)`；
- `mode="import"`：无输入字段，主按钮「选择 U 盘凭证文件」→ 文件选择（复用
  DownloadExtView 的 `open()` 模式）→ `api.credentialImportFromUsb(path)`；
- 错误展示：Rust 返回 Err（String）→ 红色文本区（如「PIN 至少 6 位」「未导入凭证…
  请先从 U 盘导入」「凭证已过期」「凭证绑定机器指纹与当前机器不符」）；
- 成功 → toast.success + 关闭 + 父级刷新状态；
- loading 态：unlock 模式 Argon2id ~200ms + 口令校验，按钮禁用防连点；
- **PIN 遗忘提示**（Oracle N-2 采纳）：解锁错误含「PIN/口令错误」或解锁多次失败时，
  文案补充「PIN 遗忘或凭证失效需到办公室用 U 盘重新签发新凭证（seq 递增后重新导入）」——
  同份文件重导会被 strict seq 拒绝。

### 4.4 导入流程 + 403 兜底

- **导入入口**：Profile 状态卡「从 U 盘导入」→ CredentialDialog `mode="import"` 文件选择
  （复用 DownloadExtView 的 `pickFile` 模式，Tauri dialog 插件已依赖）→
  `api.credentialImportFromUsb(path)` → 成功 toast + 刷新状态；失败红色提示。
- **403 兜底（先查状态再分流，Oracle I-2 采纳）**：`DownloadExtView` 下载/加载加密包时
  若收到「内容包已加密，凭证未解锁」错误（protocol.rs L114 文案，`凭证未解锁` 子串识别）：
  1. 先调 `api.credentialStatus()`：
     - `!present` → 弹 CredentialDialog `mode="import"`（引导导入，import 成功后自动切
       unlock 模式继续解锁）；
     - `present && !key_available` → 弹 CredentialDialog `mode="unlock"`；
     - 已解锁 → 纯 toast 提示（理论上不触发 403）。
  2. 实现：DownloadExtView 现有错误处理分支里识别错误串 → 拉起对应模式对话框。
     错误串定义集中在 `credentialLogic.ts` 常量（标注来源 protocol.rs L114），改动同步。

### 4.5 R6 清理链可测性重构（Rust，行为不变）

`package.rs::unload` 命令壳抽清理链后段为纯函数（无 AppHandle 依赖，Oracle I-3 修订版）：

```rust
/// 清理链后段：清协议服务根 + 清内容密钥（D09 §5.1 M2；恒无条件执行）。
/// 返回已执行步骤序列（单测断言时序与容错）。hide/destroy 依赖 AppHandle，
/// 留在命令壳内，归真机人工项验证。
pub fn run_unload_cleanup(win_destroyed: bool) -> Vec<UnloadStep> {
    let mut steps = Vec::new();
    if win_destroyed { steps.push(UnloadStep::WindowDestroyed); }
    crate::commands::protocol::clear_serve_root();
    steps.push(UnloadStep::ClearServeRoot);
    crate::commands::contentkey::clear_content_key();
    steps.push(UnloadStep::ClearContentKey);
    steps
}

/// 卸载步骤序（UI/日志可读；测试断言用）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UnloadStep { WindowDestroyed, ClearServeRoot, ClearContentKey }
```

命令壳变体（修正签名一致性）：

```rust
#[tauri::command]
pub fn unload(app: tauri::AppHandle) -> Result<(), String> {
    crate::commands::watermark::hide_watermark(&app);      // ① 水印隐藏（真机项）
    let destroyed = if let Some(w) = app.get_webview_window("content") {
        w.destroy().map_err(|e| format!("销毁内容窗口失败: {e}"))?; true
    } else { false };                                       // ② 窗口销毁（容错）
    run_unload_cleanup(destroyed);                          // ③④ 清根+清钥
    Ok(())
}
```

单测覆盖（package.rs tests 新增）：
- 全链顺序：`[WindowDestroyed, ClearServeRoot, ClearContentKey]`（win_destroyed=true）；
- 无窗口容错：`win_destroyed=false` → `[ClearServeRoot, ClearContentKey]`（清理不阻断）；
- 幂等：二次调用仍返回同序（全局清零无残留语义）。

> 注：`hide_watermark` 与 `destroy` 需 AppHandle，保持命令壳内；真实 WebView2
> renderer 内存释放仍归真机人工项（D09 §9.2-6 第②项如实标注，方案不夸大 MockRuntime
> 或纯函数替代真机验证）。

### 4.6 vitest 补强

新增 `ui/lib/credentialLogic.test.ts`（纯逻辑，无 DOM 依赖）：

- 状态机映射：`credentialStatus → 卡片态（not_imported / locked / unlocked / other_machine /
  expired / clock_rollback）` + 对应操作集；
- **403 分流判定（Oracle I-2 采纳）**：`pickCredentialMode(status)` →
  `!present → "import"` / `present && !key_available → "unlock"` / 已解锁 → null；
- 脱敏函数：`maskFingerprint(fp)`（保留前 4 + 后 8，中间 `••`）；
- 403 错误识别：`isCredentialLockedError(msg)`（含「凭证未解锁」→ true）；
- 场景函数：`shouldShowUnlock(status)` / `shouldShowImport(status)` 判定
  （`machine_fp_ok === false` → 解锁禁用）。

组件渲染测试不新增（项目 vitest 现状为纯逻辑层，无 @testing-library；保持一致性）。

## 五、文件清单

| 文件 | 变更 |
|---|---|
| `ui/api.ts` | +3 命令接线 |
| `ui/lib/types.ts` | +3 接口（CredentialStatus/CredentialMeta/UnlockResult） |
| `ui/components/CredentialDialog.tsx` | **新增**（PIN+口令输入对话框） |
| `ui/components/ProfileView.tsx` | +凭证状态卡片（授权与设备区） |
| `ui/components/DownloadExtView.tsx` | 403 错误分支拉起 CredentialDialog |
| `ui/lib/credentialLogic.ts` | **新增**（状态机/脱敏/识别纯函数） |
| `ui/lib/credentialLogic.test.ts` | **新增**（vitest） |
| `src-tauri/src/commands/package.rs` | unload 清理链抽纯函数 + 单测（行为不变） |
| `docs/D09-内容包防扩散与部署方案.md` | §9.2-5/§9.2-6 状态更新 |
| `README.md` | P1 实施状态补凭证 UI |
| `docs/开发进度看板.md` | 教师版行状态更新 |

## 六、风险与决策

1. **前端无法真机验证解锁后加载**：本机无真实 `credential.enc`（需服务端签发）。
   缓解：Rust 侧命令已 8+ 单测覆盖（credential.rs tests）；UI 逻辑以纯函数 vitest 覆盖；
   交付后教师用 U 盘凭证实测闭环（人工项记录）。
2. **错误串匹配脆弱性**（§4.4 403 识别）：Rust 错误中文明文作为 UI 判定依据，若日后改
   文案会断。缓解：错误串定义集中在 `credentialLogic.ts` 常量，标注来源（protocol.rs
   L111 附近 FORBIDDEN 文案），改动时同步。
3. **tauri test feature（MockRuntime）**：存在（2.11.6 `test=[]`），但源码 lazy 加载、
   API 未实证。作为**增强项**：若启用后 `mock_builder` 可构造 AppHandle 且 `unload`
   命令壳可测，则补集成测试；若 API 不符预期，**降级**为纯函数测试 + 真机人工项，
   不阻塞本次交付（v0.1 即按降级路径交付，增强项 v0.2 评估）。
4. **`features=["test"]` 污染 release 的实情（Oracle I-4 修正）**：Cargo 对同一 crate
   在 `[dependencies]` 与 `[dev-dependencies]` 中**无条件 unify features**——即使
   `[dev-dependencies]` 声明 tauri 带 `test`，release 构建也会合并启用该 feature。
   但因 `test` feature 仅暴露 `pub mod test`（mock 模块，`cfg(feature="test")` gate），
   不改运行时行为，多编译一个未引用模块的体积影响可忽略。**结论不阻塞**；若仍担忧，
   直接主依赖加 `features=["tray-icon","test"]` 更直白（等价结果）。

## 七、验证计划

| 层级 | 验证 | 标准 |
|---|---|---|
| Rust | cargo check | 0 warning / 0 error |
| Rust | cargo test | 全绿（新增 unload 清理链测试 + 既有 113+ 不回归） |
| TS | tsc --noEmit | 0 error（strict + noUnusedLocals 全开） |
| TS | vitest run | 全绿（新增 credentialLogic.test + 既有 64+ 不回归） |
| 集成 | tauri build --no-bundle | 成功 |
| 冒烟 | 启动 exe | 进程存活、标题 v0.2.8、Profile 页凭证卡片渲染正常 |

## 八、实施步骤

1. 前端：types.ts 三接口 → credentialLogic.ts + test → api.ts 接线 → CredentialDialog →
   ProfileView 卡片 → DownloadExtView 403 兜底
2. Rust：package.rs unload 清理链重构 + 单测
3. 文档：D09 §9.2-5/§9.2-6、README、看板
4. 验证：§七 全量
5. 审核报告 + commit/push（粒度 = D15 一个逻辑变更单元）

## 九、审核记录

| 版本 | 审核 | 意见 | 采纳 |
|---|---|---|---|
| v0.1 | Sisyphus 自审 | 无阻断；疑点：R6 纯函数参数设计、403 识别点、状态轮询策略 | 全部采纳 |
| v0.1→v0.2 | Oracle 外审（2026-09-30） | **CONDITIONAL-GO**：0B / 4I / 3N | 全部采纳 |
| — | — | I-1 machine_fp_ok 路径（§4.2 状态表新增「绑定其他机器」行 + 解锁禁用） | ✅ |
| — | — | I-2 403 兜底按状态分流（§4.4 先查 credential_status → import/unlock 模式；§4.6 pickCredentialMode） | ✅ |
| — | — | I-3 run_unload_cleanup 签名一致性（§4.5 去 clear_root/clear_key 参数，UnloadStep 仅记录后段两步；调用已对齐） | ✅ |
| — | — | I-4 dev-dependencies feature 合并表述修正（§六.4：Cargo 无条件 unify，release 也启用 test feature，但行为无影响） | ✅ |
| — | — | N-1 credential_status 非 Result（前端不依赖 catch，§4.2 刷新策略注明） | ✅ |
| — | — | N-2 PIN 遗忘提示（§4.3 解锁失败补充「到办公室重新签发新凭证」） | ✅ |
| — | — | N-3 CredentialDialog mode 双模式（§4.3 unlock/import 复用，403 兜底减少跳转摩擦） | ✅ |

> 否决记录：无（全部意见采纳；与自审判断无冲突）。
> 实施后审核：Sisyphus 代码审核 + 审核报告（另行填写）。
