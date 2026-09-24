//! 机器指纹（设备绑定用 · D01 §6 / A01 device_id）
//! P1 简化：HKLM MachineGuid + 计算机名 → SHA256 前 32 hex（稳定、免额外依赖）

use sha2::{Digest, Sha256};
use std::sync::OnceLock;

#[cfg(windows)]
fn machine_guid() -> String {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;
    RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"SOFTWARE\Microsoft\Cryptography")
        .and_then(|k| k.get_value::< String, _ >("MachineGuid"))
        .unwrap_or_else(|_| "unknown-guid".into())
}

#[cfg(not(windows))]
fn machine_guid() -> String {
    "non-windows".into()
}

fn computer_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "unknown-host".into())
}

/// 进程内缓存（指纹计算一次即可）
pub fn fingerprint() -> &'static str {
    static FP: OnceLock<String> = OnceLock::new();
    FP.get_or_init(|| {
        let raw = format!("{}|{}|edu-teacher-fp-v1", machine_guid(), computer_name());
        let mut hasher = Sha256::new();
        hasher.update(raw.as_bytes());
        let hex: String = hasher
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        hex[..32].to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fingerprint_is_stable_32hex() {
        let a = fingerprint();
        let b = fingerprint();
        assert_eq!(a, b);
        assert_eq!(a.len(), 32);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
    }
}
