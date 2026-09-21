/* ============================================================
   点读陪练 — adapters/offline/storage.js（离线存储适配：localStorage 默认）
   构建时注入 src/adapters/offline/ → dist/adapters/
   ============================================================ */
(function () {
  'use strict';
  // 离线模式：LX_SHARED.storage 默认实现即 localStorage 透传（storage.js），无需覆盖
  if (window.LX_SHARED && window.LX_SHARED.__loaded) {
    window.LX_SHARED.__loaded.storage = true;
  }
})();