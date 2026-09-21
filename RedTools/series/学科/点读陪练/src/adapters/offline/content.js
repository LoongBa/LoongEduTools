/* ============================================================
   点读陪练 — adapters/offline/content.js（离线内容适配：content 已由构建切分）
   构建时注入 src/adapters/offline/ → dist/adapters/
   说明：offline 的 content 切分发生在构建期（write_static_data_js 按 free_units 截取），
   运行时此文件仅作占位确认（内容读取走 APP_DATA.content）
   ============================================================ */
(function () {
  'use strict';
  if (window.LX_SHARED && window.LX_SHARED.__loaded) {
    window.LX_SHARED.__loaded.content = true;
  }
})();