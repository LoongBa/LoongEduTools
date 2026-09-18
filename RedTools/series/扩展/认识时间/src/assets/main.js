/* ============================================================
   认识时间 — 视图层（ES2017 经典脚本，Chrome 61 基线）
   持久化 / 首页 / 学习模式 / 阶段选择 / 打卡 / 家长面板；
   练习引擎与钟面渲染见 quiz.js（window.TimeApp 命名空间桥接）
   功能：F1 学习认识钟面 / F4 阶段选择 / F5 打卡·成绩 / F6 家长面板
   约束：无 import/export、不超 ES2017、事件全 addEventListener
   ============================================================ */
(function () {
  'use strict';

  var M = window.TimeApp = window.TimeApp || {};
  var APP = window.APP_DATA || { meta: {} };
  var headerEl = document.getElementById('app-header');
  var viewEl = M.viewEl = document.getElementById('view');
  var headerTaps = 0, headerTapTimer = null; // 家长面板：标题 5 秒内连点 5 次

  /* ---------- 持久化（redtools.time.v1，version + 迁移兜底） ---------- */
  var STORE_KEY = 'redtools.time.v1';
  M.STORE_KEY = STORE_KEY;
  function defaultStore() {
    return { version: 1, unlockedStage: 1,
      profile: { totalAnswer: 0, totalCorrect: 0, stageStars: {} },
      checkin: { dates: [], streak: 0 }, history: [] };
  }
  function loadStore() {
    var st = defaultStore();
    try {
      var data = JSON.parse(window.localStorage.getItem(STORE_KEY));
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
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (err) { /* ignore */ }
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
    var streak = 0, d = new Date();
    for (var i = dates.length - 1; i >= 0; i--) {
      if (dates[i] === todayStr()) { streak = 1; continue; }
      d.setDate(d.getDate() - 1);
      if (dates[i] === dateStr(d)) { streak += 1; } else { break; }
    }
    return streak;
  }
  M.makeEl = makeEl; M.clearNode = clearNode;
  M.todayStr = todayStr; M.dateStr = dateStr; M.calcStreak = calcStreak;

  /* ---------- 顶栏（含家长面板隐藏入口 F6） ---------- */
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
    var t = makeEl('span', 'header-title', title || (APP.meta && APP.meta.name) || '认识时间');
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

  /* ---------- 首页（学习 / 开始练习 + 进度卡） ---------- */
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
      { icon: '🕐', name: '认识钟面', desc: '学习整点 · 半点', fn: function () { viewLearn(); } },
      { icon: '🎯', name: '开始练习', desc: '读一读 · 拨一拨', fn: function () { viewStage(); } }
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

  /* ---------- F1 学习模式：认识钟面（整点/半点切换 + 讲解） ---------- */
  var LEARN_EXAMPLES = [
    { label: '整点', h: 3, m: 0, text: '分针指 12，时针指几就是几点。\n例：分针指 12、时针指 3，就是 3 点整。' },
    { label: '半点', h: 3, m: 30, text: '分针指 6，时针走过数字几就是几点半。\n例：分针指 6、时针走过 3，就是 3 点半。' }
  ];
  var learnIdx = 0;
  function viewLearn() {
    renderHeader('认识钟面', function () { viewHome(); });
    clearNode(viewEl);
    viewEl.className = 'view';
    var card = makeEl('div', 'learn-card');
    var wrap = makeEl('div', 'clock-wrap learn-clock');
    card.appendChild(wrap);
    var explain = makeEl('div', 'learn-explain');
    explain.id = 'learn-explain';
    card.appendChild(explain);
    viewEl.appendChild(card);
    var tabs = makeEl('div', 'learn-tabs');
    LEARN_EXAMPLES.forEach(function (ex, i) {
      var b = makeEl('button', 'btn' + (i === learnIdx ? ' btn-primary' : ''), ex.label);
      b.addEventListener('click', function () {
        learnIdx = i;
        renderLearn();
      });
      tabs.appendChild(b);
    });
    viewEl.appendChild(tabs);
    renderLearn();
    renderFooterNav();
  }
  function renderLearn() {
    var ex = LEARN_EXAMPLES[learnIdx];
    var wrap = viewEl.querySelector('.learn-clock');
    if (wrap) { M.renderClock(wrap, ex.h, ex.m); }
    var explain = document.getElementById('learn-explain');
    if (explain) { explain.textContent = ex.text; }
    var tabs = viewEl.querySelectorAll('.learn-tabs .btn');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].className = 'btn' + (i === learnIdx ? ' btn-primary' : '');
    }
  }

  /* ---------- F4 阶段选择（整点 → 半点 → 混合，渐进解锁） ---------- */
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

  /* ---------- F5 打卡日历 ---------- */
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

  /* ---------- F6 家长面板 ---------- */
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
    var names = ['整点', '半点', '混合'];
    for (var s = 1; s <= 3; s++) {
      starsStats.appendChild(mkStat(names[s - 1], (p.stageStars[s] || 0) + ' ★'));
    }
    starsCard.appendChild(starsStats);
    viewEl.appendChild(starsCard);

    /* F5 成绩滚动 30 条（最近 6 条展示） */
    if (store.history && store.history.length) {
      var hisCard = makeEl('div', 'result-card');
      hisCard.appendChild(makeEl('div', 'page-title', '最近成绩'));
      var his = store.history.slice(-6);
      var names2 = { 1: '整点', 2: '半点', 3: '混合' };
      for (var hi = his.length - 1; hi >= 0; hi--) {
        var h = his[hi];
        var row = makeEl('div', 'history-row',
          h.date.slice(4) + ' · ' + (names2[h.stage] || '') + ' · ' +
          h.rate + '% · ' + h.correct + '/' + h.count + ' · ' + (h.stars || 0) + '★');
        hisCard.appendChild(row);
      }
      viewEl.appendChild(hisCard);
    }

    var clearBtn = makeEl('button', 'btn', '清除所有数据');
    clearBtn.style.marginTop = '16px';
    clearBtn.style.color = '#f5222d';
    clearBtn.addEventListener('click', function () {
      if (window.confirm('确定清除所有练习数据？此操作不可恢复。')) {
        window.localStorage.removeItem(STORE_KEY);
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
