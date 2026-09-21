# QA 报告

| 检查项 | 结果 | 说明 |
|---|---|---|
| Schema 合法 | PASS | 顶层字段齐 |
| 词库判定 | WARN | 13 处超前/生僻词，需人审：[('Can they help? Yes, they can. They can cook dinner.', 'dinner', 'advanced'), ("What's your aunt's job? She's a writer.", 'writer', 'advanced'), ('My grandpa can teach Chinese.', 'teach', 'advanced')]... |
| 教材比对 | SKIP | 原文层已标 source:textbook，补全/扩展不照搬教材，人工抽查 |
| 绑定检查 | PASS | 音频文件齐全，图片全存在且全有 prompt |
| 数量检查 | PASS | 4 条能力 |
| 音频覆盖 | PASS | 同绑定检查 |
| 打印渲染 | SKIP | 打印版 HTML 模板人工抽检 |