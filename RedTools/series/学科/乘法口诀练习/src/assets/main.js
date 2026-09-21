/* ============================================================
   乘法口诀练习 — 视图层（ES2017 经典脚本，Chrome 61 基线）
   口诀数据 / localStorage / 全部页面视图；练习引擎见 quiz.js
   （两者通过 window.MulApp 命名空间桥接）
   功能：F1 口诀表学习 / F4 打卡·星星·成绩 / F5 易错本 /
         F7 家长面板；F2/F3/F6 出题·模式·结算在 quiz.js
   约束：无 import/export、不超 ES2017、事件全 addEventListener
   ============================================================ */
(function () {
  'use strict';

  var M = window.MulApp = window.MulApp || {};
  var APP = window.APP_DATA || { meta: {} };
  var headerEl = document.getElementById('app-header');
  var viewEl = M.viewEl = document.getElementById('view');
  var headerTaps = 0, headerTapTimer = null; // 家长面板：标题 5 秒内连点 5 次

  /* ---------- 口诀数据（小九九三角表，交换律去重） ---------- */
  var DIGITS = '一二三四五六七八九';
  /* 汉字读法：6→得六 10→一十 18→十八 45→四十五 */
  function numWord(n) {
    if (n < 10) { return '得' + DIGITS[n - 1]; }
    if (n === 10) { return '一十'; }
    if (n < 20) { return '十' + DIGITS[n - 11]; }
    var t = Math.floor(n / 10), o = n % 10;
    return DIGITS[t - 1] + '十' + (o ? DIGITS[o - 1] : '');
  }
  function factName(a, b) { return DIGITS[a - 1] + DIGITS[b - 1] + numWord(a * b); } // 3×6→三六十八
  function rowPairs(row) {
    var list = [];
    for (var b = row; b <= 9; b++) { list.push({ row: row, a: row, b: b, answer: row * b, name: factName(row, b) }); }
    return list;
  }
  M.ALL_ROWS = [];
  for (var r = 1; r <= 9; r++) { M.ALL_ROWS.push(rowPairs(r)); }
  M.unlockedPairs = function () { // 已解锁行的全部口诀对
    var list = [], rows = store.unlockedRows || [1], i, j;
    for (i = 0; i < rows.length; i++) {
      var pairs = M.ALL_ROWS[rows[i] - 1];
      for (j = 0; j < pairs.length; j++) { list.push(pairs[j]); }
    }
    return list;
  };

  /* ---------- 持久化（redtools.mul.v1，version + 迁移兜底） ---------- */
  var STORE_KEY = 'redtools.mul.v1';
  LX_SHARED.storage.configure({ toolName: 'mul' });  // V0.4 迁移：键前缀 redtools.mul.v1
  M.STORE_KEY = STORE_KEY;
  function defaultStore() {
    return { version: 1, unlockedRows: [1],
      profile: { totalAnswer: 0, totalCorrect: 0, rowStars: {},
                 best: { normal: null, timed: null, special: null } },
      checkin: { dates: [], streak: 0 }, wrongBook: [], history: [] };
  }
  function loadStore() {
    var st = defaultStore();
    try {
      var data = LX_SHARED.storage.get('v1');
      if (data && typeof data === 'object') {
        if (data.unlockedRows && data.unlockedRows.length) { st.unlockedRows = data.unlockedRows; }
        if (data.profile) {
          st.profile.totalAnswer = data.profile.totalAnswer || 0;
          st.profile.totalCorrect = data.profile.totalCorrect || 0;
          st.profile.rowStars = data.profile.rowStars || {};
          st.profile.best = { normal: data.profile.best ? data.profile.best.normal || null : null,
                              timed: data.profile.best ? data.profile.best.timed || null : null,
                              special: data.profile.best ? data.profile.best.special || null : null };
        }
        if (data.checkin && data.checkin.dates) { st.checkin = data.checkin; }
        if (data.wrongBook) { st.wrongBook = data.wrongBook; }
        if (data.history) { st.history = data.history; }
      }
    } catch (err) { /* 解析失败用默认结构 */ }
    return st;
  }
  function saveStore() {
    try { LX_SHARED.storage.set('v1', store); } catch (err) { /* ignore */ }
  }
  var store = M.store = loadStore();
  store.unlockedRows.sort(function (a, b) { return a - b; });
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
  function isRowUnlocked(row) { return store.unlockedRows.indexOf(row) !== -1; }
  function calcStreak(dates) {
    return LX_SHARED.progress.streak(dates);
}
  M.makeEl = makeEl; M.clearNode = clearNode;
  M.todayStr = todayStr; M.dateStr = dateStr; M.calcStreak = calcStreak;
  M.isRowUnlocked = isRowUnlocked;

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
    var t = makeEl('span', 'header-title', title || (APP.meta && APP.meta.name) || '乘法口诀练习');
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

  /* ---------- 首页（F3 三个入口） ---------- */
  function viewHome() {
    renderHeader();
    clearNode(viewEl);
    var prog = makeEl('div', 'home-progress');
    prog.appendChild(makeEl('span', '', '已解锁 '));
    prog.appendChild(makeEl('b', '', '' + store.unlockedRows.length));
    prog.appendChild(makeEl('span', '', ' / 9 行口诀　·　连续打卡 '));
    prog.appendChild(makeEl('b', '', '' + (store.checkin.streak || 0)));
    prog.appendChild(makeEl('span', '', ' 天'));
    viewEl.appendChild(prog);
    var list = makeEl('div', 'entry-list');
    var entries = [
      { icon: '📖', name: '学习口诀表', desc: '45 句三角表 · 按行解锁', fn: function () { viewTable(); } },
      { icon: '🎲', name: '随机抽查', desc: '已解锁口诀随机出题', fn: function () { M.promptTimerMode(); } },
      { icon: '🎯', name: '专项练习', desc: '选择口诀行强化训练', fn: function () { viewSpecial(); } }
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

  /* ---------- F1 口诀表学习（按行渐进解锁） ---------- */
  function viewTable() {
    renderHeader('口诀表', function () { viewHome(); });
    clearNode(viewEl);
    var prog = makeEl('div', 'table-progress');
    prog.appendChild(makeEl('span', '', '已解锁 '));
    prog.appendChild(makeEl('b', '', '' + store.unlockedRows.length));
    prog.appendChild(makeEl('span', '', ' / 9 行 · 点击口诀卡展开算式，完成「行末小测」（≥80%）解锁下一行'));
    viewEl.appendChild(prog);
  for (var row = 1; row <= 9; row++) { renderRow(row); }
  renderFooterNav();
}
  function renderRow(row) {
    var unlocked = isRowUnlocked(row);
    var section = makeEl('div', unlocked ? 'row-section' : 'row-section locked');
    var head = makeEl('div', 'row-head');
    var nm = makeEl('div', 'row-name', '' + row + ' 的口诀');
    nm.appendChild(makeEl('small', '', '' + row + '×' + row + ' ~ ' + row + '×9'));
    head.appendChild(nm);
    head.appendChild(makeEl('div', unlocked ? 'row-status' : 'row-status locked-tag', unlocked ? '已解锁' : '🔒'));
    section.appendChild(head);

    var grid = makeEl('div', 'card-grid');
    M.ALL_ROWS[row - 1].forEach(function (pair) {
      var box = makeEl('div');
      var card = makeEl('button', unlocked ? 'fact-card' : 'fact-card locked', unlocked ? pair.name : '？');
      if (unlocked) {
        card.addEventListener('click', function () { // 展开 / 收起算式
          var open = card.className.indexOf('open') !== -1;
          card.className = open ? 'fact-card' : 'fact-card open';
          card.textContent = open ? pair.name : pair.a + '×' + pair.b + ' = ' + pair.answer;
        });
      }
      box.appendChild(card);
      grid.appendChild(box);
    });
    section.appendChild(grid);

    if (unlocked) {
      var testBox = makeEl('div', 'row-test');
      var testBtn = makeEl('button', 'btn btn-primary', row < 9 ? '行末小测 · 解锁下一行' : '行末小测');
      testBtn.addEventListener('click', function () { M.startQuiz('check', row); });
      testBox.appendChild(testBtn);
      section.appendChild(testBox);
    } else {
      section.appendChild(makeEl('div', 'lock-hint', '完成上一行「行末小测」后解锁'));
    }
    viewEl.appendChild(section);
  }

  /* ---------- F3 入口③：专项练习（选已解锁口诀行） ---------- */
  function viewSpecial() {
    renderHeader('专项练习', function () { viewHome(); });
    clearNode(viewEl);
    viewEl.appendChild(makeEl('div', 'page-title',
      '选择口诀行（已解锁 ' + store.unlockedRows.length + ' / 9）· 每行 10 题'));
    var list = makeEl('div', 'point-list');
    for (var row = 1; row <= 9; row++) {
      (function (r) {
        var unlocked = isRowUnlocked(r);
        var item = makeEl('div', unlocked ? 'point-item' : 'point-item disabled');
        var left = makeEl('div');
        left.appendChild(makeEl('div', 'point-name', r + ' 的口诀'));
        var stars = store.profile.rowStars[r] || 0;
        left.appendChild(makeEl('div', 'point-meta',
          unlocked ? (stars ? '已获 ' + stars + ' ★ · ' + r + '×' + r + ' ~ ' + r + '×9'
                            : '未练习 · ' + r + '×' + r + ' ~ ' + r + '×9')
                    : '🔒 未解锁'));
        item.appendChild(left);
        if (unlocked) { item.addEventListener('click', function () { M.startQuiz('special', r); }); }
        list.appendChild(item);
      })(row);
    }
    viewEl.appendChild(list);
    renderFooterNav();
  }

  /* ---------- F4 打卡日历 ---------- */
  function viewCheckin() {
    renderHeader('打卡日历');
    clearNode(viewEl);
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

  /* ---------- F5 易错本（错 ≥2 次聚合 + 一键专练） ---------- */
  function viewWrongBook() {
    renderHeader('易错本');
    clearNode(viewEl);
    var wrong = store.wrongBook || [];
    if (!wrong.length) {
      viewEl.appendChild(makeEl('div', 'page-title', '暂无错题，继续加油！'));
      renderFooterNav();
      return;
    }
    var hot = wrong.filter(function (w) { return w.wrongCount >= 2; });
    hot.sort(function (a, b) { return b.wrongCount - a.wrongCount; });
    var summary = makeEl('div', 'wrong-summary');
    summary.appendChild(makeEl('span', '', '错题本共 '));
    summary.appendChild(makeEl('b', '', '' + wrong.length));
    summary.appendChild(makeEl('span', '', ' 条 · 易错口诀（错 ≥2 次） '));
    summary.appendChild(makeEl('b', '', '' + hot.length));
    summary.appendChild(makeEl('span', '', ' 条 · 连续答对 3 次自动移除'));
    viewEl.appendChild(summary);
    if (hot.length) {
      var goBtn = makeEl('button', 'btn btn-primary', '一键易错专练（≤10 题）');
      goBtn.style.marginBottom = '12px';
      goBtn.addEventListener('click', function () { M.startQuiz('wrong', 0); });
      viewEl.appendChild(goBtn);
    }
    var list = makeEl('div', 'point-list');
    (hot.length ? hot : wrong).forEach(function (w) {
      var item = makeEl('div', 'point-item');
      var left = makeEl('div');
      left.appendChild(makeEl('div', 'point-name', w.a + '×' + w.b + ' = ' + w.answer));
      left.appendChild(makeEl('div', 'point-meta', factName(w.a, w.b) + ' · 错 ' + w.wrongCount + ' 次'));
      item.appendChild(left);
      item.appendChild(makeEl('div', 'wrong-count', '错 ' + w.wrongCount));
      list.appendChild(item);
    });
    viewEl.appendChild(list);
    renderFooterNav();
  }

  /* ---------- F7 家长面板 ---------- */
  function viewParent() {
    renderHeader('家长面板', function () { viewHome(); });
    clearNode(viewEl);
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
    stats.appendChild(mkStat('当前错题', '' + (store.wrongBook || []).length));
    stats.appendChild(mkStat('已解锁行', store.unlockedRows.length + '/9'));
    card.appendChild(stats);
    viewEl.appendChild(card);

    var bestCard = makeEl('div', 'result-card');
    bestCard.appendChild(makeEl('div', 'page-title', '各模式最佳'));
    var bestStats = makeEl('div', 'result-stats');
    var labels = { normal: '随机', timed: '计时', special: '专项' };
    ['normal', 'timed', 'special'].forEach(function (key) {
      var b = p.best[key];
      bestStats.appendChild(mkStat(labels[key], b ? b.rate + '% · ' + Math.round(b.elapsedMs / 1000) + 's' : '—'));
    });
    bestCard.appendChild(bestStats);
    viewEl.appendChild(bestCard);

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
    nav.appendChild(mk('易错本', function () { viewWrongBook(); }));
    nav.appendChild(mk('首页', function () { viewHome(); }));
    foot.appendChild(nav);
  }
  function backFromQuiz() {
    if (M.state.mode === 'check') { viewTable(); }
    else if (M.state.mode === 'special') { viewSpecial(); }
    else if (M.state.mode === 'wrong') { viewWrongBook(); }
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
