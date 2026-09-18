/* ============================================================
   舒尔特方格 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   数据：window.APP_DATA（data.js 注入，build 生成 meta）
   功能：
   - 选难度（3×3 / 4×4 / 5×5）→ 按顺序点数字 → 计时/评级/新纪录
   - 完成一局自动打卡（localStorage）+ 成绩历史 + 各难度最佳
   设计约束：
   - 不使用 import/export / type="module"
   - 不超出 ES2017（无 ?. ?? 对象展开等）
   - 事件全部 addEventListener，无内联事件 / eval
   - 计时用 performance.now()，interval 按差值刷新（后台回来计时仍准）
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };

  /* ---------- DOM ---------- */
  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');

  /* ---------- 难度定义（星级阈值：3★ / 2★，其余 1★） ---------- */
  var SIZES = {
    3: { label: '3×3 入门', threeMs: 15000, twoMs: 30000 },
    4: { label: '4×4 进阶', threeMs: 35000, twoMs: 60000 },
    5: { label: '5×5 挑战', threeMs: 60000, twoMs: 100000 }
  };

  /* ---------- 状态 ---------- */
  var state = {
    size: 0, nums: [], next: 1, errors: 0,
    started: false, finished: false, startMs: 0, elapsed: 0, timerId: null
  };

  /* ---------- 持久化 ---------- */
  var STORE_KEY = 'redtools.shulte.v1';
  function loadStore() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) { return JSON.parse(raw); }
    } catch (err) { /* ignore */ }
    return {
      version: 1,
      best: { '3': null, '4': null, '5': null },
      recent: { '3': 0, '4': 0, '5': 0 },
      checkin: { dates: [], streak: 0 },
      history: []
    };
  }
  function saveStore() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (err) { /* ignore */ }
  }
  var store = loadStore();
  saveStore(); // 初始化写入

  /* ---------- 工具 ---------- */
  function clearNode(node) {
    while (node.firstChild) { node.removeChild(node.firstChild); }
  }
  function makeEl(tag, className, text) {
    var el = document.createElement(tag);
    if (className) { el.className = className; }
    if (text !== undefined && text !== null) { el.textContent = text; }
    return el;
  }
  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function todayStr() {
    var d = new Date();
    return '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
  }
  function dateStr(d) {
    return '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
  }
  /* 连续打卡天数：含今天往前推、跨天断（dates 升序去重） */
  function calcStreak(dates) {
    var streak = 0;
    var d = new Date();
    for (var i = dates.length - 1; i >= 0; i--) {
      if (dates[i] === todayStr()) { streak = 1; continue; }
      d.setDate(d.getDate() - 1);
      var want = dateStr(d);
      if (dates[i] === want) { streak += 1; }
      else { break; }
    }
    return streak;
  }

  /* ---------- 渲染：顶栏 ---------- */
  function renderHeader(title) {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '舒尔特方格';
    brand.appendChild(makeEl('span', 'header-title', title || name));
    if (APP.meta && APP.meta.version) {
      brand.appendChild(makeEl('span', 'header-ver', 'v' + APP.meta.version));
    }
    headerEl.appendChild(brand);
  }

  /* ---------- 视图：首页选难度 ---------- */
  function viewHome() {
    renderHeader();
    clearNode(viewEl);
    viewEl.appendChild(makeEl('div', 'page-title', '选择难度'));
    viewEl.appendChild(makeEl('div', 'home-hint', '按顺序点击 1 → N²，越快越好'));
    var list = makeEl('div', 'home-list');
    Object.keys(SIZES).forEach(function (k) {
      var size = Number(k);
      var s = SIZES[k];
      var card = makeEl('div', 'diff-card');
      var btn = makeEl('button', 'diff-btn', s.label);
      btn.addEventListener('click', function () { startGame(size); });
      card.appendChild(btn);
      var best = store.best[k];
      var meta = makeEl('div', 'diff-meta',
        best && best.ms ? '最佳 ' + (best.ms / 1000).toFixed(1) + ' 秒' : '未挑战');
      card.appendChild(meta);
      list.appendChild(card);
    });
    viewEl.appendChild(list);
    renderFooterNav();
  }

  /* ---------- 视图：游戏页 ---------- */
  function startGame(size) {
    state.size = size;
    state.next = 1;
    state.errors = 0;
    state.started = false;
    state.finished = false;
    state.startMs = 0;
    state.elapsed = 0;
    stopTimer();
    state.nums = shuffleNums(size * size);
    renderHeader(SIZES[size].label);
    clearNode(viewEl);
    renderGame();
    // 游戏页不走底栏导航（顶部返回 + 底部重新开始）
    clearNode(document.getElementById('app-footer'));
  }

  /* Fisher-Yates 洗牌 */
  function shuffleNums(n) {
    var arr = [];
    for (var i = 1; i <= n; i++) { arr.push(i); }
    for (var j = n - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = arr[j]; arr[j] = arr[k]; arr[k] = t;
    }
    return arr;
  }

  function renderGame() {
    var size = state.size;
    var n = size * size;

    // 顶部状态栏：返回 | 难度 | 计时 | 错误 | 下一个
    var top = makeEl('div', 'game-top');
    var back = makeEl('button', 'game-back', '‹ 返回');
    back.addEventListener('click', function () { viewHome(); });
    top.appendChild(back);
    top.appendChild(makeEl('div', 'game-name', SIZES[size].label));
    var timerEl = makeEl('div', 'game-timer', '⏱ 00.0');
    timerEl.id = 'game-timer';
    top.appendChild(timerEl);
    var errEl = makeEl('div', 'game-errors', '错误 0');
    errEl.id = 'game-errors';
    top.appendChild(errEl);
    var nextEl = makeEl('div', 'game-next', '下一个：1');
    nextEl.id = 'game-next';
    top.appendChild(nextEl);
    viewEl.appendChild(top);

    // 网格：正方形、按钮式格子
    var grid = makeEl('div', 'shulte-grid grid-' + size);
    for (var i = 0; i < n; i++) {
      (function (idx) {
        var num = state.nums[idx];
        var cell = makeEl('div', 'grid-cell');
        cell.style.left = (idx % size * 100 / size) + '%';
        cell.style.top = (Math.floor(idx / size) * 100 / size) + '%';
        var btn = makeEl('button', 'cell-btn', '' + num);
        btn.addEventListener('click', function () { onCellTap(btn, num); });
        cell.appendChild(btn);
        grid.appendChild(cell);
      })(i);
    }
    viewEl.appendChild(grid);

    // 底部：重新开始
    var row = makeEl('div', 'btn-row');
    var restart = makeEl('button', 'btn btn-primary', '重新开始');
    restart.addEventListener('click', function () { startGame(size); });
    row.appendChild(restart);
    viewEl.appendChild(row);
  }

  function onCellTap(btn, num) {
    if (state.finished) { return; }
    if (num === state.next) {
      // 正确：绿色高亮约 300ms，点中 1 开始计时
      btn.className = 'cell-btn hit';
      if (!state.started) {
        state.started = true;
        state.startMs = performance.now();
        startTimer();
      }
      var done = state.next >= state.size * state.size;
      state.next += 1;
      if (done) {
        finishGame();
      } else {
        updateNext();
      }
      window.setTimeout(function () {
        if (btn.className.indexOf('hit') !== -1) { btn.className = 'cell-btn'; }
      }, 300);
    } else {
      // 错误：红色闪烁约 400ms，不结束不重置
      btn.className = 'cell-btn miss';
      state.errors += 1;
      updateErrors();
      window.setTimeout(function () {
        if (btn.className.indexOf('miss') !== -1) { btn.className = 'cell-btn'; }
      }, 400);
    }
  }

  /* ---------- 计时 ---------- */
  function startTimer() {
    if (state.timerId) { clearInterval(state.timerId); }
    state.timerId = setInterval(function () {
      updateTimer(performance.now() - state.startMs);
    }, 100);
  }
  function stopTimer() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
  }
  function updateTimer(ms) {
    var el = document.getElementById('game-timer');
    if (!el) { return; }
    var txt = (ms / 1000).toFixed(1);
    if (txt.length === 3) { txt = '0' + txt; } // "7.5" → "07.5"
    el.textContent = '⏱ ' + txt;
  }
  function updateNext() {
    var el = document.getElementById('game-next');
    if (el) { el.textContent = '下一个：' + state.next; }
  }
  function updateErrors() {
    var el = document.getElementById('game-errors');
    if (el) { el.textContent = '错误 ' + state.errors; }
  }

  /* ---------- 结算 ---------- */
  function calcStars(size, ms) {
    var s = SIZES[size];
    if (ms <= s.threeMs) { return 3; }
    if (ms <= s.twoMs) { return 2; }
    return 1;
  }

  function finishGame() {
    if (state.finished) { return; }
    state.finished = true;
    stopTimer();
    state.elapsed = performance.now() - state.startMs;

    // 打卡：完成一局即点亮今日
    var t = todayStr();
    var dates = store.checkin.dates;
    if (dates.indexOf(t) === -1) { dates.push(t); }
    dates.sort();
    while (dates.length > 365) { dates.shift(); }
    store.checkin.streak = calcStreak(dates);

    // 星级
    var stars = calcStars(state.size, state.elapsed);

    // 最佳 / 最近 / 历史
    var key = '' + state.size;
    var msRound = Math.round(state.elapsed);
    var isNewBest = false;
    var best = store.best[key];
    if (!best || msRound < best.ms) {
      store.best[key] = { ms: msRound, date: t };
      isNewBest = true;
    }
    store.recent[key] = msRound;
    store.history.unshift({ date: t, size: state.size, ms: msRound, errors: state.errors, stars: stars });
    while (store.history.length > 30) { store.history.pop(); }
    saveStore();

    // 略延迟展示结果，让最后一次点击的绿色高亮可见
    window.setTimeout(function () {
      showResult(msRound, state.errors, stars, isNewBest);
    }, 350);
  }

  /* ---------- 结果浮层 ---------- */
  function mkStat(label, val) {
    var s = makeEl('div', 'result-stat');
    s.appendChild(makeEl('b', '', val));
    s.appendChild(makeEl('span', '', label));
    return s;
  }
  function showResult(ms, errors, stars, isNewBest) {
    var overlay = makeEl('div', 'result-overlay');
    var box = makeEl('div', 'result-box');
    box.appendChild(makeEl('div', 'result-title', '完成！'));
    box.appendChild(makeEl('div', 'result-time', (ms / 1000).toFixed(1) + ' 秒'));
    var stats = makeEl('div', 'result-stats');
    stats.appendChild(mkStat('用时', (ms / 1000).toFixed(1) + 's'));
    stats.appendChild(mkStat('错误', '' + errors));
    box.appendChild(stats);
    box.appendChild(makeEl('div', 'result-stars', '★★★'.slice(0, stars)));
    if (isNewBest) {
      box.appendChild(makeEl('div', 'result-record', '🎉 新纪录！'));
    }
    var again = makeEl('button', 'btn btn-primary', '再来一局');
    again.addEventListener('click', function () {
      closeOverlay(overlay);
      startGame(state.size);
    });
    box.appendChild(again);
    var home = makeEl('button', 'btn', '返回首页');
    home.addEventListener('click', function () {
      closeOverlay(overlay);
      viewHome();
    });
    box.appendChild(home);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }
  function closeOverlay(overlay) {
    if (overlay && overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
  }

  /* ---------- 视图：成绩历史 ---------- */
  function viewHistory() {
    renderHeader('成绩');
    clearNode(viewEl);
    var h = store.history;
    if (!h.length) {
      viewEl.appendChild(makeEl('div', 'page-title', '暂无成绩，先来一局吧！'));
      renderFooterNav();
      return;
    }
    viewEl.appendChild(makeEl('div', 'page-title', '最近 ' + h.length + ' 次成绩'));
    var list = makeEl('div', 'point-list');
    h.forEach(function (r) {
      var item = makeEl('div', 'point-item');
      var left = makeEl('div');
      var label = SIZES[r.size] ? SIZES[r.size].label : (r.size + '×' + r.size);
      left.appendChild(makeEl('div', 'point-name', label));
      left.appendChild(makeEl('div', 'point-meta', r.date + ' · 错误 ' + r.errors + ' 次'));
      item.appendChild(left);
      var right = makeEl('div', 'point-right');
      right.appendChild(makeEl('div', 'point-time', (r.ms / 1000).toFixed(1) + ' 秒'));
      right.appendChild(makeEl('div', 'point-stars', '★★★'.slice(0, r.stars)));
      item.appendChild(right);
      list.appendChild(item);
    });
    viewEl.appendChild(list);
    renderFooterNav();
  }

  /* ---------- 视图：打卡日历（完成一局自动打卡，本页仅展示） ---------- */
  function viewCheckin() {
    renderHeader('打卡日历');
    clearNode(viewEl);
    var card = makeEl('div', 'calendar');
    card.appendChild(makeEl('div', 'page-title', '本月打卡'));
    var grid = makeEl('div', 'calendar-grid');
    var now = new Date();
    var days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var t = todayStr();
    var dates = store.checkin.dates;
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
    var streak = calcStreak(store.checkin.dates);
    var info = makeEl('div', 'streak-info');
    info.appendChild(document.createTextNode('连续打卡 '));
    var b = makeEl('b', '', '' + streak);
    info.appendChild(b);
    info.appendChild(document.createTextNode(' 天' + (streak >= 7 ? ' 🎉' : '')));
    card.appendChild(info);
    viewEl.appendChild(card);
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
    nav.appendChild(mk('成绩', function () { viewHistory(); }));
    nav.appendChild(mk('打卡', function () { viewCheckin(); }));
    nav.appendChild(mk('首页', function () { viewHome(); }));
    foot.appendChild(nav);
  }

  /* ---------- 启动 ---------- */
  function syncAppHeight() {
    var docEl = document.documentElement;
    var vh = window.innerHeight || docEl.clientHeight;
    docEl.style.setProperty('--app-height', vh + 'px');
  }
  if (window.addEventListener) {
    window.addEventListener('resize', syncAppHeight);
  }
  syncAppHeight();
  viewHome();
})();
