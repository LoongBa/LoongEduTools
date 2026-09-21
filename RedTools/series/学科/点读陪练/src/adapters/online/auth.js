/* ============================================================
   点读陪练 — adapters/online/auth.js（在线认证适配：桩验证）
   构建时注入 src/adapters/online/ → dist/adapters/
   契约（设计要求书 §4.6，服务器就绪后替换）：
     POST /api/edu/auth/activate | login | status（见 _shared/js/src/auth.js 契约注释）
   ============================================================ */
(function () {
  'use strict';
  // 在线模式：LX_SHARED.auth 默认实现即在线桩（auth.js 按 mode 路由），无需覆盖
  if (window.LX_SHARED && window.LX_SHARED.__loaded) {
    window.LX_SHARED.__loaded.auth = true;
  }
})();