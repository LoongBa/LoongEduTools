// D15 §4.6：凭证 UI 纯逻辑测试（状态机 / 403 分流 / 脱敏 / 场景判定）
import { describe, expect, it } from "vitest";
import {
  CREDENTIAL_LOCKED_MARKER,
  credentialCardState,
  daysLeftText,
  isCredentialLockedError,
  maskFingerprint,
  pickCredentialMode,
  shouldShowImport,
  shouldShowUnlock,
} from "./credentialLogic";
import type { CredentialStatus } from "./types";

function status(over: Partial<CredentialStatus>): CredentialStatus {
  return {
    present: false,
    machine_fp: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
    format_ver: null,
    machine_fp_ok: null,
    state: "none",
    issued_at: null,
    expires_at: null,
    seq: null,
    quota_ref: null,
    days_left: null,
    last_verified_at: null,
    key_available: false,
    ...over,
  };
}

describe("credentialCardState 状态机映射", () => {
  it("未导入 → not_imported", () => {
    expect(credentialCardState(status({ present: false }))).toBe("not_imported");
  });

  it("已导入未解锁 → locked", () => {
    expect(
      credentialCardState(status({ present: true, machine_fp_ok: true, state: "valid", key_available: false })),
    ).toBe("locked");
  });

  it("已解锁 → unlocked", () => {
    expect(
      credentialCardState(status({ present: true, machine_fp_ok: true, state: "valid", key_available: true })),
    ).toBe("unlocked");
  });

  it("即将到期仍解锁 → unlocked", () => {
    expect(
      credentialCardState(status({ present: true, machine_fp_ok: true, state: "expiring_soon", key_available: true })),
    ).toBe("unlocked");
  });

  it("machine_fp_ok=false 优先 → other_machine（即使 state=valid）", () => {
    expect(
      credentialCardState(status({ present: true, machine_fp_ok: false, state: "valid", key_available: false })),
    ).toBe("other_machine");
  });

  it("时钟回拨 → clock_rollback", () => {
    expect(
      credentialCardState(status({ present: true, machine_fp_ok: true, state: "clock_rollback" })),
    ).toBe("clock_rollback");
  });

  it("已过期 → expired（即使 key_available=true）", () => {
    expect(
      credentialCardState(status({ present: true, machine_fp_ok: true, state: "expired", key_available: true })),
    ).toBe("expired");
  });
});

describe("pickCredentialMode 403 分流", () => {
  it("未导入 → import", () => {
    expect(pickCredentialMode(status({ present: false }))).toBe("import");
  });

  it("已导入未解锁 → unlock", () => {
    expect(pickCredentialMode(status({ present: true, key_available: false }))).toBe("unlock");
  });

  it("已解锁 → null（不弹对话框）", () => {
    expect(pickCredentialMode(status({ present: true, key_available: true }))).toBeNull();
  });
});

describe("shouldShowUnlock / shouldShowImport", () => {
  it("other_machine 禁用解锁", () => {
    expect(shouldShowUnlock(status({ present: true, machine_fp_ok: false }))).toBe(false);
  });

  it("clock_rollback 禁用解锁", () => {
    expect(shouldShowUnlock(status({ present: true, machine_fp_ok: true, state: "clock_rollback" }))).toBe(false);
  });

  it("正常已导入未解锁可解锁", () => {
    expect(shouldShowUnlock(status({ present: true, machine_fp_ok: true, state: "valid" }))).toBe(true);
  });

  it("未导入显示导入按钮", () => {
    expect(shouldShowImport(status({ present: false }))).toBe(true);
  });

  it("other_machine 可重新导入", () => {
    expect(shouldShowImport(status({ present: true, machine_fp_ok: false }))).toBe(true);
  });

  it("已过期可重新导入", () => {
    expect(shouldShowImport(status({ present: true, machine_fp_ok: true, state: "expired" }))).toBe(true);
  });

  it("已解锁不显示导入按钮", () => {
    expect(shouldShowImport(status({ present: true, machine_fp_ok: true, state: "valid", key_available: true }))).toBe(false);
  });
});

describe("maskFingerprint 指纹脱敏", () => {
  it("长指纹保留前 4 + 后 8", () => {
    expect(maskFingerprint("a1b2c3d4e5f60718293a4b5c6d7e8f90")).toBe("a1b2••6d7e8f90");
  });

  it("短指纹原样返回", () => {
    expect(maskFingerprint("abc")).toBe("abc");
  });
});

describe("isCredentialLockedError / CREDENTIAL_LOCKED_MARKER", () => {
  it("命中「凭证未解锁」", () => {
    expect(isCredentialLockedError("内容包已加密，凭证未解锁")).toBe(true);
  });

  it("其他错误不误判", () => {
    expect(isCredentialLockedError("签名校验失败")).toBe(false);
  });

  it("标记源串与 protocol.rs L114 文案一致", () => {
    expect(CREDENTIAL_LOCKED_MARKER).toBe("凭证未解锁");
  });
});

describe("daysLeftText", () => {
  it("有剩余天数", () => {
    expect(daysLeftText(status({ days_left: 7 }))).toBe("剩余 7 天");
  });

  it("今日到期", () => {
    expect(daysLeftText(status({ days_left: 0 }))).toBe("今日到期");
  });

  it("null 返回空", () => {
    expect(daysLeftText(status({ days_left: null }))).toBe("");
  });
});
