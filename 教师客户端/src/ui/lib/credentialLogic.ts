/**
 * 凭证 UI 纯逻辑（D15 §4.6）：状态机映射 / 403 分流 / 指纹脱敏 / 场景判定。
 * 无 DOM 依赖，vitest 直接覆盖；Rust 侧语义见 credential.rs（D09 §2 / A01 §4.5）。
 */
import type { CredentialStatus } from "@/lib/types";

/** 凭证卡片态（§4.2 状态表） */
export type CredentialCardState =
  | "not_imported" // 未导入
  | "locked" // 已导入未解锁
  | "unlocked" // 已解锁
  | "other_machine" // 凭证绑定其他机器（machine_fp_ok === false）
  | "expired" // 已过期
  | "clock_rollback"; // 系统时间异常

/**
 * 403 锁定错误识别源串：与 protocol.rs L114 FORBIDDEN 文案「内容包已加密，凭证未解锁」
 * 对齐（Rust 错误经 invoke 透传为字符串）。改动 Rust 文案时须同步本常量（D15 §六.2）。
 */
export const CREDENTIAL_LOCKED_MARKER = "凭证未解锁";

/** 指纹脱敏：保留前 4 + 后 8，中间 `••`（完整指纹不渲染） */
export function maskFingerprint(fp: string): string {
  if (fp.length <= 12) return fp;
  return `${fp.slice(0, 4)}••${fp.slice(-8)}`;
}

/** 403 锁定错误识别（下载加密内容包触发） */
export function isCredentialLockedError(msg: string): boolean {
  return msg.includes(CREDENTIAL_LOCKED_MARKER);
}

/** 状态机映射（§4.2 表；优先级：未导入 > 其他机器 > 时钟回拨 > 过期 > 解锁态） */
export function credentialCardState(s: CredentialStatus): CredentialCardState {
  if (!s.present) return "not_imported";
  if (s.machine_fp_ok === false) return "other_machine";
  if (s.state === "clock_rollback") return "clock_rollback";
  if (s.state === "expired") return "expired";
  return s.key_available ? "unlocked" : "locked";
}

/** 403 兜底分流（§4.4 Oracle I-2）：未导入 → import 模式；已导入未解锁 → unlock；已解锁 → null */
export function pickCredentialMode(s: CredentialStatus): "import" | "unlock" | null {
  if (!s.present) return "import";
  return s.key_available ? null : "unlock";
}

/** 解锁按钮是否可用（other_machine 禁用；其余非 not_imported 可用） */
export function shouldShowUnlock(s: CredentialStatus): boolean {
  return s.present && s.machine_fp_ok !== false && s.state !== "clock_rollback";
}

/** 导入按钮是否可用（not_imported 或 other_machine 或 expired 可重导） */
export function shouldShowImport(s: CredentialStatus): boolean {
  return credentialCardState(s) === "not_imported" || credentialCardState(s) === "other_machine" || credentialCardState(s) === "expired";
}

/** 剩余天数文案（expires_at 语义；null 时返回空） */
export function daysLeftText(s: CredentialStatus): string {
  if (s.days_left == null) return "";
  return s.days_left > 0 ? `剩余 ${s.days_left} 天` : "今日到期";
}
