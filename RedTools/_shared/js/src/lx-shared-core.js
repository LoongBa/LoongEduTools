/* ============================================================
   LX_SHARED — 公共模块命名空间与注册器（教育工具双模式骨架 v0.1）
   ------------------------------------------------------------
   构建合并产物：本文件（core）+ storage/progress/auth/guard/ui-kit 各模块
   运行时注入顺序（oracle 审核 v0.2 修订）：
     data.js（APP_DATA.meta.mode）→ lx-shared.js → adapters/*.js → core/main.js
   - data.js 先于本文件：本文件 IIFE 顶层读 APP_DATA.meta.mode 设 LX_SHARED.mode
   - core 访问 LX_SHARED.* 必须属性查找（禁止捕获引用——adapters 在 core 前可 register 覆盖）
   - ES2017 经典脚本；Chrome 61 兼容
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };
  var DEFAULT_MODE = (APP.meta && APP.meta.mode === 'online') ? 'online' : 'offline';

  /* ---------- 命名空间 ---------- */
  var LX = {
    version: '0.1',
    mode: DEFAULT_MODE,
    auth: null,
    storage: null,
    progress: null,
    guard: null,
    uikit: null,
    share: null,        /* V0.7：share 模块槽位（register hasOwnProperty 依赖预置） */
    ui: null,           /* V0.8：ui 模块槽位（register hasOwnProperty 依赖预置） */
    /* 模块注册器：适配层可覆盖默认实现（如在线 storage 换云端桩） */
    register: function (name, impl) {
      if (LX.hasOwnProperty(name)) {
        LX[name] = impl;
      }
      return LX;
    }
  };

  /* 已加载模块计数（供构建后自检） */
  LX.__loaded = {
    auth: false, storage: false, progress: false, guard: false, uikit: false, share: false, ui: false,
    count: function () {
      var n = 0;
      for (var k in LX.__loaded) {
        if (k !== 'count' && LX.__loaded[k]) { n++; }
      }
      return n;
    }
  };

  window.LX_SHARED = LX;
})();