/* ============================================================
   LX_SHARED.storage — 存储适配（双模式：离线 localStorage / 在线云端桩）
   ------------------------------------------------------------
   契约（oracle 审核 v0.2 修订）：
   - **schema-agnostic 透传**：离线仅做「前缀 + JSON 透传」，不校验字段、不拒绝任何键
     （数学口算等现有工具的 profile/wrongBook/history 离线照常存取）
   - 数据最小化白名单（设计要求书 §5）只约束【在线 sync 上行路径】：
     sync 时仅提取 { completedUnits, checkin }，错题/成绩/历史不上行云端
   - STORE_KEY 兼容：默认 key='v1' → redtools.<tool>.v1（与已发布工具本地数据一致）
   - 依赖：window.LX_SHARED（mode 由 data.js 的 APP_DATA.meta.mode 驱动）
   - ES2017 经典脚本；Chrome 61 兼容
   ============================================================ */
(function () {
  'use strict';

  var S = {};

  /* ---------- 工具上下文（由 register 注入，默认从 APP_DATA.meta 取） ---------- */
  var toolName = '';

  /* ---------- 键前缀 ---------- */
  function prefix(key) {
    return 'redtools.' + (toolName || 'app') + '.' + (key || 'v1');
  }

  /* ---------- 离线实现（localStorage 透传） ---------- */
  function getLocal(key) {
    try {
      var raw = window.localStorage.getItem(prefix(key));
      return raw ? JSON.parse(raw) : null;
    } catch (err) { /* ignore */ return null; }
  }
  function setLocal(key, val) {
    try {
      window.localStorage.setItem(prefix(key), JSON.stringify(val));
    } catch (err) { /* ignore */ }
  }
  function removeLocal(key) {
    try {
      window.localStorage.removeItem(prefix(key));
    } catch (err) { /* ignore */ }
  }

  /* ---------- 在线云端桩（契约预留；服务器就绪后替换内部实现，不改契约） ----------
     契约：POST /api/edu/data/sync  { familyCode, completedUnits, checkin } -> 服务端确认
     TODO：接入服务器后，get/set 改走云端（家庭码维度）；当前桩 = localStorage 同构 */
  function getCloud(key) { return getLocal(key); }
  function setCloud(key, val) { setLocal(key, val); }
  function removeCloud(key) { removeLocal(key); }

  /* ---------- 数据最小化白名单（在线 sync 上行用；离线不动） ----------
     只上行 { completedUnits, checkin }，错题/成绩/历史不上行 */
  var SYNC_WHITELIST = ['completedUnits', 'checkin'];
  function pickSyncable(store) {
    var out = {};
    if (!store) { return out; }
    for (var i = 0; i < SYNC_WHITELIST.length; i++) {
      var k = SYNC_WHITELIST[i];
      if (store[k] !== undefined) { out[k] = store[k]; }
    }
    return out;
  }

  /* ---------- 对外 API ---------- */
  S.get = function (key) {
    return (LX_SHARED.mode === 'online') ? getCloud(key) : getLocal(key);
  };
  S.set = function (key, val) {
    if (LX_SHARED.mode === 'online') { setCloud(key, val); } else { setLocal(key, val); }
  };
  S.remove = function (key) {
    if (LX_SHARED.mode === 'online') { removeCloud(key); } else { removeLocal(key); }
  };
  // 在线 sync 上行（数据最小化）；离线模式 no-op
  S.sync = function (store) {
    if (LX_SHARED.mode !== 'online') { return; }
    /* TODO 接入服务器：POST /api/edu/data/sync { familyCode, ...pickSyncable(store) }
       当前桩：本地透传，留待服务器接口就绪后更新 */
    void pickSyncable(store);
  };
  // 供 core 初始化时设置工具名（决定键前缀）
  S.configure = function (opts) {
    if (opts && opts.toolName) { toolName = opts.toolName; }
  };

  /* ---------- 注册进命名空间 ---------- */
  if (window.LX_SHARED && window.LX_SHARED.register) {
    window.LX_SHARED.register('storage', S);
  } else {
    window.LX_SHARED = window.LX_SHARED || {};
    window.LX_SHARED.storage = S;
  }
})();