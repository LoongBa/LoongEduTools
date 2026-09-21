/* ============================================================
   点读陪练 — adapters/offline/auth.js（离线认证适配：恒授权）
   构建时注入 src/adapters/offline/ → dist/adapters/
   ============================================================ */
(function () {
  'use strict';
  // 离线模式：LX_SHARED.auth 默认实现即恒授权（auth.js 桩），无需覆盖
  // 此处保留适配层文件（结构对齐），仅确认默认实现可用
  if (window.LX_SHARED && window.LX_SHARED.__loaded) {
    window.LX_SHARED.__loaded.auth = true;
  }
})();