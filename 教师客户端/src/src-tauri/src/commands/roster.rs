use std::fs;
use std::path::PathBuf;

/// 名单文件：exe 同目录 roster.json（D05 §2.4.1 / §2.4.2）
/// P3 简化：单名单集整份读写；列表/多名单等演进另行扩展
/// 红线：名单仅存本机，零网络传输、零上报
pub fn roster_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = crate::commands::recents::exe_dir(app)?;
    Ok(dir.join("roster.json"))
}

/// 单个学生：姓名 + 可选 强/弱 标记（"strong" | "weak" | null）
/// 字段命名与前端 rosterLogic.ts 的 RosterStudent 一一对应（两处需同步）
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RosterStudent {
    pub name: String,
    #[serde(default)]
    pub tag: Option<String>,
}

/// 名单集：创建时间 + 学生列表 + 分组结果（本地留存，供纪律积分联动，D05 §2.4.3）
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
pub struct RosterData {
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub students: Vec<RosterStudent>,
    /// 分组结果（每项为一组的学生姓名）：本地留存，供课堂点名/纪律积分联动
    #[serde(default)]
    pub groups: Vec<Vec<String>>,
}

/// 保存名单包（整份覆盖写）。写入前校验必须是合法 RosterData，防止脏数据落地
#[tauri::command]
pub fn roster_save(app: tauri::AppHandle, roster_json: String) -> Result<(), String> {
    let data: RosterData = serde_json::from_str(&roster_json)
        .map_err(|e| format!("名单数据格式错误: {e}"))?;
    let pretty = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("序列化名单失败: {e}"))?;
    let path = roster_path(&app)?;
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&path, pretty).map_err(|e| format!("写 roster.json 失败: {e}"))
}

/// 读取名单包；文件不存在返回 None（前端显示空态），其余读错返回 Err
#[tauri::command]
pub fn roster_load(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = roster_path(&app)?;
    match fs::read_to_string(&path) {
        Ok(raw) => Ok(Some(raw)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("读 roster.json 失败: {e}")),
    }
}