/* ============================================================
   认识钱币 — 视图层（ES2017 经典脚本，Chrome 61 基线）
   持久化 / 首页 / 认识钱币 / 阶段选择 / 打卡 / 家长面板；
   练习引擎与钱币渲染见 quiz.js（window.MoneyApp 命名空间桥接）
   功能：F1 认识钱币 / F5 阶段选择 / F6 打卡·成绩 / F7 家长面板
   约束：无 import/export、不超 ES2017、事件全 addEventListener
   ============================================================ */
(function () {
  'use strict';

  var M = window.MoneyApp = window.MoneyApp || {};
  var APP = window.APP_DATA || { meta: {} };
  var headerEl = document.getElementById('app-header');
  var viewEl = M.viewEl = document.getElementById('view');
  var headerTaps = 0, headerTapTimer = null; // 家长面板：标题 5 秒内连点 5 次

  /* ---------- 持久化（redtools.money.v1，version + 迁移兜底） ---------- */
  var STORE_KEY = 'redtools.money.v1';
  LX_SHARED.storage.configure({ toolName: 'money' });  // V0.4 迁移：键前缀 redtools.money.v1
  M.STORE_KEY = STORE_KEY;
  function defaultStore() {
    return { version: 1, unlockedStage: 1,
      profile: { totalAnswer: 0, totalCorrect: 0, stageStars: {} },
      checkin: { dates: [], streak: 0 }, history: [] };
  }
  function loadStore() {
    var st = defaultStore();
    try {
      var data = LX_SHARED.storage.get('v1');
      if (data && typeof data === 'object') {
        if (data.unlockedStage) { st.unlockedStage = data.unlockedStage; }
        if (data.profile) {
          st.profile.totalAnswer = data.profile.totalAnswer || 0;
          st.profile.totalCorrect = data.profile.totalCorrect || 0;
          st.profile.stageStars = data.profile.stageStars || {};
        }
        if (data.checkin && data.checkin.dates) { st.checkin = data.checkin; }
        if (data.history) { st.history = data.history; }
      }
    } catch (err) { /* 解析失败用默认结构 */ }
    return st;
  }
  function saveStore() {
    try { LX_SHARED.storage.set('v1', store); } catch (err) { /* ignore */ }
  }
  var store = M.store = loadStore();
  saveStore();
  M.saveStore = saveStore;

  /* ---------- 工具 ---------- */
  function clearNode(node) { while (node.firstChild) { node.removeChild(node.firstChild); } }
  function makeEl(tag, className, text) {
    var el = document.createElement(tag);
    if (className) { el.className = className; }
    if (text !== undefined && text !== null) { el.textContent = text; }
    return el;
  }
  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function todayStr() { var d = new Date(); return '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()); }
  function dateStr(d) { return '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()); }
  function calcStreak(dates) {
    return LX_SHARED.progress.streak(dates);
}
  M.makeEl = makeEl; M.clearNode = clearNode;
  M.todayStr = todayStr; M.dateStr = dateStr; M.calcStreak = calcStreak;

  /* ---------- 顶栏（含家长面板隐藏入口 F7） ---------- */
  function renderHeader(title, backFn) {
    clearNode(headerEl);
    if (backFn) {
      var back = makeEl('button', 'header-back', '‹');
      back.addEventListener('click', backFn);
      headerEl.appendChild(back);
    }
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = ''; icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var t = makeEl('span', 'header-title', title || (APP.meta && APP.meta.name) || '认识钱币');
    brand.appendChild(t);
    var onTitleTap = function () { // 5 秒内连点 5 次 → 家长面板
      headerTaps += 1;
      if (headerTapTimer) { clearTimeout(headerTapTimer); }
      headerTapTimer = setTimeout(function () { headerTaps = 0; }, 5000);
      if (headerTaps >= 5) {
        headerTaps = 0;
        if (headerTapTimer) { clearTimeout(headerTapTimer); }
        viewParent();
      }
    };
    t.addEventListener('touchstart', onTitleTap);
    t.addEventListener('mousedown', onTitleTap);
    if (APP.meta && APP.meta.version) { brand.appendChild(makeEl('span', 'header-ver', 'v' + APP.meta.version)); }
    headerEl.appendChild(brand);
  }
  M.renderHeader = renderHeader;

  /* ---------- 首页（认识钱币 / 开始练习 + 进度卡，整体垂直居中） ---------- */
  function viewHome() {
    renderHeader();
    clearNode(viewEl);
    viewEl.className = 'view home';
    var prog = makeEl('div', 'home-progress');
    prog.appendChild(makeEl('span', '', '已解锁 '));
    prog.appendChild(makeEl('b', '', '' + (store.unlockedStage || 1)));
    prog.appendChild(makeEl('span', '', ' / 3 个阶段　·　连续打卡 '));
    prog.appendChild(makeEl('b', '', '' + (store.checkin.streak || 0)));
    prog.appendChild(makeEl('span', '', ' 天'));
    viewEl.appendChild(prog);
    var list = makeEl('div', 'entry-list');
    var entries = [
      { icon: '💰', name: '认识钱币', desc: '看面额 · 学换算', fn: function () { viewLearn(); } },
      { icon: '🛒', name: '开始练习', desc: '认一认 · 凑一凑 · 找一找', fn: function () { viewStage(); } }
    ];
    entries.forEach(function (e) {
      var item = makeEl('div', 'entry-item');
      item.appendChild(makeEl('div', 'entry-icon', e.icon));
      var txt = makeEl('div', 'entry-text');
      txt.appendChild(makeEl('div', 'entry-name', e.name));
      txt.appendChild(makeEl('div', 'entry-desc', e.desc));
      item.appendChild(txt);
      item.appendChild(makeEl('div', 'entry-arrow', '›'));
      item.addEventListener('click', e.fn);
      list.appendChild(item);
    });
    viewEl.appendChild(list);
    renderFooterNav();
  }

  /* ---------- F1 认识钱币：5 种面额展示 + 元角换算说明 ---------- */
  function viewLearn() {
    renderHeader('认识钱币', function () { viewHome(); });
    clearNode(viewEl);
    viewEl.className = 'view';
    var card = makeEl('div', 'learn-card');
    var grid = makeEl('div', 'money-grid');
    M.COINS.forEach(function (c) {
      var box = makeEl('div', 'money-cell');
      var wrap = makeEl('div', 'money-svg-wrap');
      wrap.innerHTML = M.renderMoney(c.val);
      box.appendChild(wrap);
      box.appendChild(makeEl('div', 'money-name', c.name));
      grid.appendChild(box);
    });
    card.appendChild(grid);
    var rule = makeEl('div', 'learn-explain');
    rule.id = 'learn-explain';
    rule.textContent = '元角换算：1 元 = 10 角，5 角 = 5 个 1 角。\n先认识面额，再学换算，最后模拟购物！';
    card.appendChild(rule);
    viewEl.appendChild(card);
    renderFooterNav();
  }

  /* ---------- F5 阶段选择（认钱币 → 凑钱 → 找零，渐进解锁） ---------- */
  function viewStage() {
    renderHeader('开始练习', function () { viewHome(); });
    clearNode(viewEl);
    viewEl.className = 'view';
    viewEl.appendChild(makeEl('div', 'page-title',
      '选择阶段（已解锁 ' + (store.unlockedStage || 1) + ' / 3）· 每阶段 10 题'));
    var list = makeEl('div', 'point-list');
    for (var s = 1; s <= 3; s++) {
      (function (stage) {
        var unlocked = stage <= (store.unlockedStage || 1);
        var st = M.STAGES[stage - 1];
        var item = makeEl('div', unlocked ? 'point-item' : 'point-item disabled');
        var left = makeEl('div');
        left.appendChild(makeEl('div', 'point-name', '阶段 ' + stage + ' · ' + st.name));
        var stars = store.profile.stageStars[stage] || 0;
        left.appendChild(makeEl('div', 'point-meta',
          unlocked ? (stars ? '已获 ' + stars + ' ★ · ' + st.desc : '未练习 · ' + st.desc)
                    : '🔒 完成上一阶段（≥80%）解锁'));
        item.appendChild(left);
        if (unlocked) { item.addEventListener('click', function () { M.startQuiz(stage); }); }
        list.appendChild(item);
      })(s);
    }
    viewEl.appendChild(list);
    renderFooterNav();
  }
  M.viewStage = viewStage;

  /* ---------- F6 打卡日历 ---------- */
  function viewCheckin() {
    renderHeader('打卡日历');
    clearNode(viewEl);
    viewEl.className = 'view';
    var card = makeEl('div', 'calendar');
    card.appendChild(makeEl('div', 'page-title', '本月打卡'));
    var grid = makeEl('div', 'calendar-grid');
    var now = new Date();
    var days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var t = todayStr(), dates = store.checkin.dates;
    for (var d = 1; d <= days; d++) {
      (function (day) {
        var ds = dateStr(new Date(now.getFullYear(), now.getMonth(), day));
        var el = makeEl('div', 'cal-day', '' + day);
        if (dates.indexOf(ds) !== -1) { el.className = 'cal-day done'; }
        if (ds === t) { el.className += ' today'; }
        grid.appendChild(el);
      })(d);
    }
    card.appendChild(grid);
    var streak = calcStreak(dates);
    var si = makeEl('div', 'streak-info');
    si.appendChild(makeEl('span', '', '连续打卡 '));
    si.appendChild(makeEl('b', '', '' + streak));
    si.appendChild(makeEl('span', '', ' 天' + (streak >= 7 ? ' 🎉' : '')));
    card.appendChild(si);
    viewEl.appendChild(card);
    renderFooterNav();
  }

  /* ---------- F7 家长面板 ---------- */
  function viewParent() {
    renderHeader('家长面板', function () { viewHome(); });
    clearNode(viewEl);
    viewEl.className = 'view';
    var p = store.profile;
    var mkStat = function (label, val) {
      var s = makeEl('div', 'result-stat');
      s.appendChild(makeEl('b', '', val));
      s.appendChild(makeEl('span', '', label));
      return s;
    };
    var card = makeEl('div', 'result-card');
    card.appendChild(makeEl('div', 'page-title', '总览'));
    var stats = makeEl('div', 'result-stats');
    stats.appendChild(mkStat('累计打卡', (store.checkin.dates.length) + ' 天'));
    stats.appendChild(mkStat('连续打卡', (store.checkin.streak || 0) + ' 天'));
    stats.appendChild(mkStat('累计答题', '' + (p.totalAnswer || 0)));
    stats.appendChild(mkStat('累计答对', '' + (p.totalCorrect || 0)));
    stats.appendChild(mkStat('已解锁阶段', (store.unlockedStage || 1) + '/3'));
    card.appendChild(stats);
    viewEl.appendChild(card);

    var starsCard = makeEl('div', 'result-card');
    starsCard.appendChild(makeEl('div', 'page-title', '各阶段星星'));
    var starsStats = makeEl('div', 'result-stats');
    for (var s = 1; s <= 3; s++) {
      starsStats.appendChild(mkStat(M.STAGES[s - 1].name, (p.stageStars[s] || 0) + ' ★'));
    }
    starsCard.appendChild(starsStats);
    viewEl.appendChild(starsCard);

    var clearBtn = makeEl('button', 'btn', '清除所有数据');
    clearBtn.style.marginTop = '16px';
    clearBtn.style.color = '#f5222d';
    clearBtn.addEventListener('click', function () {
      if (window.confirm('确定清除所有练习数据？此操作不可恢复。')) {
        LX_SHARED.storage.remove('v1');
        store = M.store = loadStore();
        saveStore();
        viewHome();
      }
    });
    viewEl.appendChild(clearBtn);
    renderFooterNav();
  }

  /* ---------- 底部导航 ---------- */
  function renderFooterNav() {
    var foot = document.getElementById('app-footer');
    clearNode(foot);
    var nav = makeEl('div', 'footer-nav');
    var mk = function (label, fn) {
      var b = makeEl('div', 'footer-btn', label);
      b.addEventListener('click', fn);
      return b;
    };
    nav.appendChild(mk('打卡日历', function () { viewCheckin(); }));
    nav.appendChild(mk('首页', function () { viewHome(); }));
    foot.appendChild(nav);
  }
  function backFromQuiz() {
    if (M.state && M.state.stage) { viewStage(); }
    else { viewHome(); }
  }
  M.backFromQuiz = backFromQuiz;

  /* ---------- 启动 ---------- */
  function syncAppHeight() {
    var docEl = document.documentElement;
    docEl.style.setProperty('--app-height', (window.innerHeight || docEl.clientHeight) + 'px');
  }
  if (window.addEventListener) { window.addEventListener('resize', syncAppHeight); }
  syncAppHeight();
  viewHome();
})();