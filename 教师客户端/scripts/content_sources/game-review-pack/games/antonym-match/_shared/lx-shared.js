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
    auth: false, storage: false, progress: false, guard: false, uikit: false,
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
/* ============================================================
   LX_SHARED.progress — 打卡/连胜/历史（个人纵向激励）
   ------------------------------------------------------------
   来源：从 40+ 工具同构逻辑抽取（数学口算/24点/乘法口诀/舒尔特/数独/成语等，
   calcStreak(dates) 签名全库一致，已实测核验）
   契约：
   - checkin(store)      完成即点亮今日（当日去重 + 连续天数）
   - streak(dates)       calcStreak 同构（升序 YYYYMMDD 列表 → 连续天数）
   - best(store,key,stars,ms) 更高星级或同星级更快则更新
   - history(store,item) push + ≤30 FIFO
   - store 结构沿用：{ version:1, checkin:{dates:[],streak:0}, ...工具特有 }
   - ES2017 经典脚本；Chrome 61 兼容
   ============================================================ */
(function () {
  'use strict';

  var P = {};

  /* ---------- 日期工具 ---------- */
  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtDate(d) {
    return '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
  }

  /* ---------- 连续天数（calcStreak 全库同构） ---------- */
  function calcStreak(dates) {
    if (!dates || !dates.length) { return 0; }
    var set = {};
    for (var i = 0; i < dates.length; i++) { set[dates[i]] = true; }
    var cur = new Date();
    cur.setHours(0, 0, 0, 0);
    if (!set[fmtDate(cur)]) {
      cur.setDate(cur.getDate() - 1);
    }
    var streak = 0;
    while (set[fmtDate(cur)]) {
      streak++;
      cur.setDate(cur.getDate() - 1);
    }
    return streak;
  }

  /* ---------- 打卡 ---------- */
  function doCheckin(store) {
    if (!store) { return; }
    if (!store.checkin) { store.checkin = { dates: [], streak: 0 }; }
    var today = fmtDate(new Date());
    var dates = store.checkin.dates || [];
    if (dates.indexOf(today) < 0) { dates.push(today); }
    dates.sort();
    while (dates.length > 365) { dates.shift(); }
    store.checkin.dates = dates;
    store.checkin.streak = calcStreak(dates);
  }

  /* ---------- 最佳成绩（星级优先，同星级比用时） ---------- */
  function betterThan(starsA, msA, starsB, msB) {
    if (starsA !== starsB) { return starsA > starsB; }
    return msA < msB;
  }
  function updateBest(store, key, stars, ms, errors) {
    if (!store) { return false; }
    if (!store.best) { store.best = {}; }
    var best = store.best[key];
    var cur = { ms: ms, errors: errors || 0, stars: stars, date: fmtDate(new Date()) };
    if (!best || betterThan(stars, ms, best.stars, best.ms)) {
      store.best[key] = cur;
      return true; // 新纪录
    }
    return false;
  }

  /* ---------- 历史（≤30 FIFO） ---------- */
  function pushHistory(store, item) {
    if (!store) { return; }
    if (!store.history) { store.history = []; }
    store.history.push(item);
    while (store.history.length > 30) { store.history.shift(); }
  }

  /* ---------- 对外 API ---------- */
  P.checkin = doCheckin;
  P.streak = calcStreak;
  P.best = updateBest;
  P.history = pushHistory;

  /* ---------- 注册 ---------- */
  if (window.LX_SHARED && window.LX_SHARED.register) {
    window.LX_SHARED.register('progress', P);
  } else {
    window.LX_SHARED = window.LX_SHARED || {};
    window.LX_SHARED.progress = P;
  }
})();
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
/* ============================================================
   LX_SHARED.guard — 防沉迷/自控力（通用能力）
   ------------------------------------------------------------
   依据：docs/通用需求-防沉迷自控力.md（24点/扫雷/贪吃蛇 已实现逻辑抽取）
   能力：
   - check(cfg)   -> { limited: bool, minutes: 累计分钟, remaining: 剩余分钟 }
   - remind(cfg)  -> 到点提醒（延迟×2 / 我很自律）——弹层由调用方决定
   - 会话累计：session = { date, minutes, rounds }，localStorage 持久化
   - cfg = { store, key, maxMinutes, maxRounds }（工具传入自身 store）
   设计约束（指导原则 §4.2 激励而非竞争）：
   - 只有「和自己比」的时长/局数限制，无任何跨用户排行
   - 数据最小化：只存 { date, minutes, rounds }
   - ES2017 经典脚本；Chrome 61 兼容
   ============================================================ */
(function () {
  'use strict';

  var G = {};

  /* ---------- 会话读写 ---------- */
  function today() {
    var d = new Date();
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }
  function getSession(store, key) {
    if (!store) { return { date: today(), minutes: 0, rounds: 0 }; }
    var s = store[key];
    if (!s || s.date !== today()) {
      s = { date: today(), minutes: 0, rounds: 0 };
      if (store) { store[key] = s; }
    }
    return s;
  }
  function addMinutes(store, key, mins) {
    var s = getSession(store, key);
    s.minutes = (s.minutes || 0) + mins;
    if (store) { store[key] = s; }
  }
  function addRound(store, key) {
    var s = getSession(store, key);
    s.rounds = (s.rounds || 0) + 1;
    if (store) { store[key] = s; }
  }

  /* ---------- 检查是否超限 ---------- */
  function check(cfg) {
    if (!cfg) { return { limited: false }; }
    var s = getSession(cfg.store, cfg.key);
    var minutes = s.minutes || 0;
    var rounds = s.rounds || 0;
    var limited = false;
    if (cfg.maxMinutes && minutes >= cfg.maxMinutes) { limited = true; }
    if (cfg.maxRounds && rounds >= cfg.maxRounds) { limited = true; }
    return {
      limited: limited,
      minutes: minutes,
      rounds: rounds,
      remainingMinutes: cfg.maxMinutes ? Math.max(0, cfg.maxMinutes - minutes) : null,
      remainingRounds: cfg.maxRounds ? Math.max(0, cfg.maxRounds - rounds) : null
    };
  }

  /* ---------- 对外 API ---------- */
  G.check = check;
  G.addMinutes = addMinutes;
  G.addRound = addRound;
  G.getSession = getSession;

  /* ---------- 注册 ---------- */
  if (window.LX_SHARED && window.LX_SHARED.register) {
    window.LX_SHARED.register('guard', G);
  } else {
    window.LX_SHARED = window.LX_SHARED || {};
    window.LX_SHARED.guard = G;
  }
})();
/* ============================================================
   LX_SHARED.uikit — 通用 UI 组件（统一风格，无排行榜 UI）
   ------------------------------------------------------------
   依据：指导原则 §4.1 练习形态（打勾/进度条/徽章）；无社交/排行
   组件：
   - btn(text, cls)          按钮（btn-main/btn-ghost/btn-ghost-sm）
   - badge(text)             徽章
   - overlay({title,sub,stars,btns,notes})  结算浮层（星级/打卡/按钮）
   - toast(msg)              轻提示
   - progressBar(ratio)      进度条（返回元素）
   - starsText(n)            ★★★ 文本（n=0..3）
   依赖：无（纯 DOM 工具，Chrome 61）
   说明：feedback（即时正反馈 UI）仍内联于各工具 main.js，B 批再抽
   ============================================================ */
(function () {
  'use strict';

  var U = {};

  /* ---------- 基础工具 ---------- */
  function makeEl(tag, className, text) {
    var el = document.createElement(tag);
    if (className) { el.className = className; }
    if (text !== undefined && text !== null) { el.textContent = text; }
    return el;
  }

  /* ---------- 星级文本 ---------- */
  function starsText(n) {
    var s = '';
    for (var i = 0; i < 3; i++) { s += (i < n) ? '★' : '☆'; }
    return s;
  }

  /* ---------- 按钮 ---------- */
  function btn(text, cls, onClick) {
    var b = makeEl('button', cls || 'btn-ghost', text);
    if (onClick) { b.addEventListener('click', onClick); }
    return b;
  }

  /* ---------- 徽章 ---------- */
  function badge(text) {
    return makeEl('span', 'lx-badge', text);
  }

  /* ---------- 进度条 ---------- */
  function progressBar(ratio, label) {
    var wrap = makeEl('div', 'lx-progress');
    var fill = makeEl('div', 'lx-progress-fill');
    fill.style.width = Math.max(0, Math.min(100, (ratio || 0) * 100)) + '%';
    wrap.appendChild(fill);
    if (label) {
      wrap.appendChild(makeEl('span', 'lx-progress-label', label));
    }
    return wrap;
  }

  /* ---------- 轻提示 ---------- */
  function toast(msg, ms) {
    var t = makeEl('div', 'lx-toast', msg);
    document.body.appendChild(t);
    setTimeout(function () {
      if (t.parentNode) { t.parentNode.removeChild(t); }
    }, ms || 1500);
  }

  /* ---------- 结算浮层 ---------- */
  function overlay(opts) {
    if (!opts) { return null; }
    var ov = makeEl('div', 'lx-overlay');
    var card = makeEl('div', 'lx-overlay-card');
    card.appendChild(makeEl('div', 'lx-overlay-title', opts.title || ''));
    if (opts.sub) { card.appendChild(makeEl('div', 'lx-overlay-sub', opts.sub)); }
    var sum = makeEl('div', 'lx-overlay-summary');
    if (opts.stars) {
      sum.appendChild(makeEl('div', 'lx-stars', starsText(opts.stars)));
    }
    if (opts.notes) {
      for (var i = 0; i < opts.notes.length; i++) {
        sum.appendChild(makeEl('div', opts.notes[i].cls || 'lx-note', opts.notes[i].text));
      }
    }
    card.appendChild(sum);
    if (opts.btns) {
      var box = makeEl('div', 'lx-overlay-btns');
      for (var j = 0; j < opts.btns.length; j++) {
        box.appendChild(btn(opts.btns[j].text, opts.btns[j].cls, opts.btns[j].act));
      }
      card.appendChild(box);
    }
    ov.appendChild(card);
    document.body.appendChild(ov);
    // 返回 { el, close }
    return {
      el: ov,
      close: function () {
        if (ov.parentNode) { ov.parentNode.removeChild(ov); }
      }
    };
  }

  /* ---------- 对外 API ---------- */
  U.btn = btn;
  U.badge = badge;
  U.overlay = overlay;
  U.toast = toast;
  U.progressBar = progressBar;
  U.starsText = starsText;
  U.makeEl = makeEl;

  /* ---------- 注册 ---------- */
  if (window.LX_SHARED && window.LX_SHARED.register) {
    window.LX_SHARED.register('uikit', U);
  } else {
    window.LX_SHARED = window.LX_SHARED || {};
    window.LX_SHARED.uikit = U;
  }
})();