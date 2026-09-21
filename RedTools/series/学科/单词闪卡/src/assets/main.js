/* ============================================================
   单词闪卡 — 视图层（ES2017 经典脚本，Chrome 61 基线）
   持久化 / 首页 / 选册选单元 / 我的词卡 / 打卡 / 家长面板；
   卡片引擎与记忆曲线见 flashcards.js（window.FlashApp 命名空间桥接）
   数据：window.APP_DATA.books（PEP 11 册词汇，打字背单词同管线）
   约束：无 import/export、不超 ES2017、事件全 addEventListener
   ============================================================ */
(function () {
  'use strict';

  var M = window.FlashApp = window.FlashApp || {};
  var APP = window.APP_DATA || { meta: {}, books: [] };
  var BOOKS = M.BOOKS = APP.books || [];
  var headerEl = document.getElementById('app-header');
  var viewEl = M.viewEl = document.getElementById('view');
  var headerTaps = 0, headerTapTimer = null; // 家长面板：标题 5 秒内连点 5 次

  /* ---------- 持久化（redtools.flash.v1，version + 迁移兜底） ---------- */
  var STORE_KEY = 'redtools.flash.v1';
  LX_SHARED.storage.configure({ toolName: 'flash' });  // V0.4 迁移：键前缀 redtools.flash.v1
  M.STORE_KEY = STORE_KEY;
  function defaultStore() {
    return { version: 1,
      wordState: {},    // "grade|term|unitIndex|word" → { streak, known }
      checkin: { dates: [], streak: 0 } };
  }
  function loadStore() {
    var st = defaultStore();
    try {
      var data = LX_SHARED.storage.get('v1');
      if (data && typeof data === 'object') {
        if (data.wordState) { st.wordState = data.wordState; }
        if (data.checkin && data.checkin.dates) { st.checkin = data.checkin; }
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

  /* ---------- 词状态工具 ---------- */
  function wordKey(book, unitIdx, word) { return book.grade + '|' + book.term + '|' + unitIdx + '|' + word; }
  M.wordKey = wordKey;
  function wordInfo(book, unitIdx, word) {
    var k = wordKey(book, unitIdx, word);
    return store.wordState[k] || { streak: 0, known: false };
  }
  M.wordInfo = wordInfo;
  function allCount(book) {
    var n = 0;
    for (var i = 0; i < book.units.length; i++) { n += book.units[i].words.length; }
    return n;
  }
  function knownCount(book) {
    var n = 0;
    for (var i = 0; i < book.units.length; i++) {
      var ws = book.units[i].words;
      for (var j = 0; j < ws.length; j++) {
        if (wordInfo(book, i, ws[j].word).known) { n += 1; }
      }
    }
    return n;
  }
  M.allCount = allCount; M.knownCount = knownCount;

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

  /* ---------- 顶栏（含家长面板隐藏入口） ---------- */
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
    var t = makeEl('span', 'header-title', title || (APP.meta && APP.meta.name) || '单词闪卡');
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

  /* ---------- 首页（开始学习 / 我的词卡 + 进度卡） ---------- */
  function viewHome() {
    renderHeader();
    clearNode(viewEl);
    viewEl.className = 'view home';
    var totalKnown = 0, totalWords = 0;
    BOOKS.forEach(function (b) { totalKnown += knownCount(b); totalWords += allCount(b); });
    var prog = makeEl('div', 'home-progress');
    prog.appendChild(makeEl('span', '', '已掌握 '));
    prog.appendChild(makeEl('b', '', '' + totalKnown));
    prog.appendChild(makeEl('span', '', ' / ' + totalWords + ' 词　·　连续打卡 '));
    prog.appendChild(makeEl('b', '', '' + (store.checkin.streak || 0)));
    prog.appendChild(makeEl('span', '', ' 天'));
    viewEl.appendChild(prog);
    var list = makeEl('div', 'entry-list');
    var entries = [
      { icon: '🃏', name: '开始学习', desc: '选册选单元 · 翻卡认词', fn: function () { viewBooks(); } },
      { icon: '📊', name: '我的词卡', desc: '掌握进度 · 待复习', fn: function () { viewStats(); } }
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

  /* ---------- 选册（11 册） ---------- */
  function viewBooks() {
    renderHeader('开始学习', function () { viewHome(); });
    clearNode(viewEl);
    viewEl.className = 'view';
    viewEl.appendChild(makeEl('div', 'page-title', '选择册次'));
    var list = makeEl('div', 'point-list');
    BOOKS.forEach(function (b, idx) {
      var item = makeEl('div', 'point-item');
      var left = makeEl('div');
      left.appendChild(makeEl('div', 'point-name', b.grade + ' ' + b.term));
      left.appendChild(makeEl('div', 'point-meta', allCount(b) + ' 词 · 已掌握 ' + knownCount(b)));
      item.appendChild(left);
      item.appendChild(makeEl('div', 'entry-arrow', '›'));
      item.addEventListener('click', function () { M.curBook = idx; viewUnits(); });
      list.appendChild(item);
    });
    viewEl.appendChild(list);
    renderFooterNav();
  }

  /* ---------- 选单元 ---------- */
  function viewUnits() {
    var book = BOOKS[M.curBook];
    if (!book) { viewBooks(); return; }
    renderHeader(book.grade + book.term, function () { viewBooks(); });
    clearNode(viewEl);
    viewEl.className = 'view';
    viewEl.appendChild(makeEl('div', 'page-title', '选择单元'));
    var list = makeEl('div', 'point-list');
    book.units.forEach(function (u, ui) {
      var kc = 0;
      u.words.forEach(function (w) { if (wordInfo(book, ui, w.word).known) { kc += 1; } });
      var item = makeEl('div', 'point-item');
      var left = makeEl('div');
      left.appendChild(makeEl('div', 'point-name', 'Unit ' + u.unit));
      left.appendChild(makeEl('div', 'point-meta', u.words.length + ' 词 · 已掌握 ' + kc + '/' + u.words.length));
      item.appendChild(left);
      item.appendChild(makeEl('div', 'entry-arrow', '›'));
      item.addEventListener('click', function () { M.startUnit(ui); });
      list.appendChild(item);
    });
    viewEl.appendChild(list);
    renderFooterNav();
  }
  M.viewUnits = viewUnits;

  /* ---------- 我的词卡（统计） ---------- */
  function viewStats() {
    renderHeader('我的词卡', function () { viewHome(); });
    clearNode(viewEl);
    viewEl.className = 'view';
    var tKnown = 0, tTotal = 0, tReviewing = 0;
    BOOKS.forEach(function (b) {
      tTotal += allCount(b);
      for (var i = 0; i < b.units.length; i++) {
        var ws = b.units[i].words;
        for (var j = 0; j < ws.length; j++) {
          var info = wordInfo(b, i, ws[j].word);
          if (info.known) { tKnown += 1; } else if (info.streak >= 1) { tReviewing += 1; }
        }
      }
    });
    var card = makeEl('div', 'result-card');
    card.appendChild(makeEl('div', 'page-title', '掌握进度'));
    var stats = makeEl('div', 'result-stats');
    var mkStat = function (label, val) {
      var s = makeEl('div', 'result-stat');
      s.appendChild(makeEl('b', '', val));
      s.appendChild(makeEl('span', '', label));
      return s;
    };
    stats.appendChild(mkStat('总词数', '' + tTotal));
    stats.appendChild(mkStat('已掌握', '' + tKnown));
    stats.appendChild(mkStat('学习中', '' + (tTotal - tKnown)));
    card.appendChild(stats);
    viewEl.appendChild(card);
    var hint = makeEl('div', 'learn-explain');
    hint.textContent = '认识 2 次 = 已掌握 ✅\n' +
      '连续认识 2 次的词不再重复出卡；熟悉的词下周复习时已掌握。\n' +
      '已掌握越多的册次，会显示在选册页。';
    viewEl.appendChild(hint);
    renderFooterNav();
  }

  /* ---------- 打卡日历 ---------- */
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

  /* ---------- 家长面板 ---------- */
  function viewParent() {
    renderHeader('家长面板', function () { viewHome(); });
    clearNode(viewEl);
    viewEl.className = 'view';
    var tKnown = 0, tWords = 0;
    BOOKS.forEach(function (b) {
      tWords += allCount(b);
      tKnown += knownCount(b);
    });
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
    stats.appendChild(mkStat('已掌握', tKnown + '/' + tWords));
    card.appendChild(stats);
    viewEl.appendChild(card);

    var clearBtn = makeEl('button', 'btn', '清除所有数据');
    clearBtn.style.marginTop = '16px';
    clearBtn.style.color = '#f5222d';
    clearBtn.addEventListener('click', function () {
      if (window.confirm('确定清除所有学习数据？此操作不可恢复。')) {
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

  /* ---------- 启动 ---------- */
  function syncAppHeight() {
    var docEl = document.documentElement;
    docEl.style.setProperty('--app-height', (window.innerHeight || docEl.clientHeight) + 'px');
  }
  if (window.addEventListener) { window.addEventListener('resize', syncAppHeight); }
  syncAppHeight();
  viewHome();
})();