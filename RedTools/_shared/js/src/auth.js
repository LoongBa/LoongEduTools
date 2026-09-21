/* ============================================================
   LX_SHARED.auth — 认证客户端（契约预留 + 离线/在线桩）
   ------------------------------------------------------------
   契约（设计要求书 §4.6 接口预留，服务器就绪后替换内部实现，不改契约）：
     POST /api/edu/auth/activate  { phone, code, deviceId }       首次开通：绑定手机号↔口令
     POST /api/edu/auth/login     { phone, pwd }                  日常登录 → { token, scope }
     POST /api/edu/auth/reset     { phone, smsCode, newPwd }      密码找回（依赖短信）
     GET  /api/edu/auth/status    (token)                        授权状态/剩余有效期/可解锁工具
     POST /api/edu/data/sync      { familyCode, completedUnits, checkin }
     POST /api/edu/report/query   (token, familyCode, range)     家长报告
   - 原则：验证全部在服务器端；客户端只提交凭证、接收授权状态，不做本地自校验
   - 离线：status() 恒 { authorized: true, scope: 'offline', expireAt: null }
   - 在线桩：localStorage 存授权状态（模拟服务器响应）；实现 TODO 待接服务器
   - ES2017 经典脚本；Chrome 61 兼容
   ============================================================ */
(function () {
  'use strict';

  var A = {};
  var AUTH_KEY = 'lx.auth.v1';   // 在线桩本地授权状态

  /* ---------- 授权状态 ---------- */
  function loadAuth() {
    try {
      var raw = window.localStorage.getItem(AUTH_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) { /* ignore */ return null; }
  }
  function saveAuth(state) {
    try {
      window.localStorage.setItem(AUTH_KEY, JSON.stringify(state));
    } catch (err) { /* ignore */ }
  }

  /* ---------- 离线：恒授权 ---------- */
  function statusOffline() {
    return { authorized: true, scope: 'offline', expireAt: null };
  }

  /* ---------- 在线桩（TODO 待接服务器） ---------- */
  function statusOnline() {
    // TODO 接入服务器：GET /api/edu/auth/status（带 token）
    // 当前桩：读本地授权状态；无授权 → 未授权
    var auth = loadAuth();
    return auth && auth.authorized
      ? { authorized: true, scope: auth.scope || 'online', expireAt: auth.expireAt || null }
      : { authorized: false, scope: null, expireAt: null };
  }
  function loginOnline(phone, pwd) {
    // TODO 接入服务器：POST /api/edu/auth/login → { token, scope }
    // 当前桩：模拟登录成功（任意凭证），写入本地授权状态（A 批验证用）
    var state = { authorized: true, scope: 'online', expireAt: null, phone: phone };
    saveAuth(state);
    return { ok: true, token: 'stub-token', scope: state.scope };
  }
  function activateOnline(phone, code, deviceId) {
    // TODO 接入服务器：POST /api/edu/auth/activate
    // 当前桩：模拟首次开通成功
    var state = { authorized: true, scope: 'online', expireAt: null, phone: phone };
    saveAuth(state);
    return { ok: true, token: 'stub-token', scope: state.scope };
  }
  function logoutOnline() {
    try { window.localStorage.removeItem(AUTH_KEY); } catch (err) { /* ignore */ }
  }

  /* ---------- 对外 API（按 mode 路由） ---------- */
  A.status = function () {
    return (LX_SHARED.mode === 'online') ? statusOnline() : statusOffline();
  };
  A.login = function (phone, pwd) {
    if (LX_SHARED.mode !== 'online') { return { ok: true, scope: 'offline' }; }
    return loginOnline(phone, pwd);
  };
  A.activate = function (phone, code, deviceId) {
    if (LX_SHARED.mode !== 'online') { return { ok: true, scope: 'offline' }; }
    return activateOnline(phone, code, deviceId);
  };
  A.logout = function () {
    if (LX_SHARED.mode === 'online') { logoutOnline(); }
  };

  /* ---------- 注册 ---------- */
  if (window.LX_SHARED && window.LX_SHARED.register) {
    window.LX_SHARED.register('auth', A);
  } else {
    window.LX_SHARED = window.LX_SHARED || {};
    window.LX_SHARED.auth = A;
  }
})();