//! 内容密钥进程内存存储（D09 §2.4：解开后仅内存、不落盘）
//!
//! part B（协议处理器内存解密）消费本模块：AES-256-GCM 解密内容文件前先取
//! `content_key()`，取不到即拒绝加载（凭证未解锁）。密钥永不写盘、永不随命令返回。

use std::sync::{Mutex, OnceLock};

/// 全局单例：内容密钥（32B）或未解锁（None）
static CONTENT_KEY: OnceLock<Mutex<Option<[u8; 32]>>> = OnceLock::new();

fn store() -> &'static Mutex<Option<[u8; 32]>> {
    CONTENT_KEY.get_or_init(|| Mutex::new(None))
}

/// 凭证解锁成功后写入（Argon2id 解开 key_material 的结果；仅内存）
pub fn set_content_key(key: [u8; 32]) {
    *store().lock().unwrap() = Some(key);
}

/// 读取当前内容密钥（None = 未解锁 / 会话已清除）
pub fn content_key() -> Option<[u8; 32]> {
    store().lock().unwrap().clone()
}

/// 卸载内容包/退出清理时调用：从内存清除内容密钥（D09 §2.4；part B teardown 入口）
pub fn clear_content_key() {
    *store().lock().unwrap() = None;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_get_roundtrip() {
        assert_eq!(content_key(), None);
        set_content_key([7u8; 32]);
        assert_eq!(content_key(), Some([7u8; 32]));
        *store().lock().unwrap() = None;
        assert_eq!(content_key(), None);
    }
}