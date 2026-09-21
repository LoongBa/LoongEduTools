/* ============================================================
   点读陪练 — adapters/online/storage.js（在线存储适配：云端桩）
   构建时注入 src/adapters/online/ → dist/adapters/
   契约（设计要求书 §4.6，服务器就绪后替换）：
     POST /api/edu/data/sync { familyCode, completedUnits, checkin }
   ============================================================ */
(function () {
  'use strict';
  // 在线模式：LX_SHARED.storage 默认实现即云端桩（storage.js 按 mode 路由），无需覆盖
  if (window.LX_SHARED && window.LX_SHARED.__loaded) {
    window.LX_SHARED.__loaded.storage = true;
  }
})();