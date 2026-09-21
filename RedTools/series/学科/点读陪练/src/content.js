/* ============================================================
   点读陪练 — content 内容源（window.CONTENT_DATA）
   ------------------------------------------------------------
   内容结构：unit 数组（每单元 = 词汇/句型 条目）
   构建时按 mode 切分：
     offline: content = CONTENT_DATA 前 free_units 条（tools.py free_units=1 → Unit1）
     online:  content = 全量
   ★ 内容本体由 点读稿管线（docs/教育工具/点读陪练/）生产；
     本文件为骨架占位（Unit1 样例 + Unit2 占位），正式内容接入点读稿数据。
   ★ 数据必须是 JSON 兼容（双引号键/值）——构建用 json.loads 解析
   ============================================================ */
window.CONTENT_DATA = [
  {
    "id": "unit1",
    "title": "Unit 1 同步练习",
    "theme": "教室与学习用品（pencil/ruler/eraser...）",
    "items": [
      { "type": "vocab", "word": "pencil", "cn": "铅笔", "sound": "u1_pencil" },
      { "type": "vocab", "word": "ruler", "cn": "尺子", "sound": "u1_ruler" },
      { "type": "vocab", "word": "eraser", "cn": "橡皮", "sound": "u1_eraser" },
      { "type": "sentence", "en": "I have a new pencil.", "cn": "我有一支新铅笔。", "sound": "u1_s1" },
      { "type": "sentence", "en": "This is my ruler.", "cn": "这是我的尺子。", "sound": "u1_s2" }
    ]
  },
  {
    "id": "unit2",
    "title": "Unit 2 My friends 同步练习",
    "theme": "朋友与外貌（tall/short/friendly...）",
    "items": [
      { "type": "vocab", "word": "tall", "cn": "高的", "sound": "u2_tall" },
      { "type": "vocab", "word": "short", "cn": "矮的", "sound": "u2_short" },
      { "type": "vocab", "word": "friendly", "cn": "友好的", "sound": "u2_friendly" },
      { "type": "sentence", "en": "He is tall and strong.", "cn": "他又高又壮。", "sound": "u2_s1" }
    ]
  }
];