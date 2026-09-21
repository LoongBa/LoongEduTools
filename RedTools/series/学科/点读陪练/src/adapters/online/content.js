/* ============================================================
   点读陪练 — adapters/online/content.js（在线内容适配：全量已内嵌）
   构建时注入 src/adapters/online/ → dist/adapters/
   说明：在线 content 由构建全量打包（write_static_data_js 不截取），
   运行时此文件仅作占位确认
   ============================================================ */
(function () {
  'use strict';
  if (window.LX_SHARED && window.LX_SHARED.__loaded) {
    window.LX_SHARED.__loaded.content = true;
  }
})();