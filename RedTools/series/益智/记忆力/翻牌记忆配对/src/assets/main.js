/* ============================================================
   翻牌记忆配对 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   数据：window.ICONS（icons.js 注入，24 个 SVG 图标）
        window.APP_DATA（data.js 注入，build 生成 meta，可缺失）
   功能：
   - 选难度（6对/8对/10对）→ N 对卡片打乱布阵、背面朝上
   - 每次翻两张：相同→绿色锁定；不同→红色闪烁约 500ms 后翻回
   - 全部配对完成 → 计时/星级/新纪录/打卡/成绩历史
   设计约束：
   - 不使用 import/export / type="module"
   - 不超出 ES2017（无 ?. ?? 对象展开等）
   - 事件全部 addEventListener，无内联事件 / eval
   - 计时用 performance.now()，interval 按差值刷新（后台回来计时仍准）
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };
  var ICONS = window.ICONS || [];

  /* ---------- DOM ---------- */
  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');

  /* ---------- 难度定义（星级阈值：3★ / 2★，其余 1★） ---------- */
  var LEVELS = {
    6: { label: '简单 · 6 对', cols: 4, rows: 3, threeMs: 25000, twoMs: 50000 },
    8: { label: '进阶 · 8 对', cols: 4, rows: 4, threeMs: 45000, twoMs: 90000 },
    10: { label: '挑战 · 10 对', cols: 5, rows: 4, threeMs: 75000, twoMs: 150000 }
  };

  /* ---------- 状态 ---------- */
  var state = {
    level: 6, cards: [], flipped: [], pairs: 0, moves: 0,
    busy: false, started: false, finished: false,
    startMs: 0, elapsed: 0, timerId: null
  };
  /* 卡片 DOM 元素（按 card.id 索引） */
  var cardEls = [];

  /* ---------- 持久化 ---------- */
  var STORE_KEY = 'redtools.memorypair.v1';
  function loadStore() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) { return JSON.parse(raw); }
    } catch (err) { /* ignore */ }
    return {
      version: 1,
      best: { '6': null, '8': null, '10': null },
      recent: { '6': 0, '8': 0, '10': 0 },
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
  /* Fisher-Yates 洗牌（返回新数组） */
  function shuffle(arr) {
    var a = arr.slice();
    for (var j = a.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = a[j]; a[j] = a[k]; a[k] = t;
    }
    return a;
  }

  /* ---------- 渲染：顶栏 ---------- */
  function renderHeader(title) {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '翻牌记忆配对';
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
    viewEl.appendChild(makeEl('div', 'home-hint', '翻开卡片，找出相同的图案，全部配对过关！'));
    var list = makeEl('div', 'home-list');
    Object.keys(LEVELS).forEach(function (k) {
      var level = Number(k);
      var l = LEVELS[k];
      var card = makeEl('div', 'diff-card');
      var btn = makeEl('button', 'diff-btn', l.label);
      btn.addEventListener('click', function () { startGame(level); });
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

  /* ---------- 出题引擎 ---------- */
  /* 随机选 level 个图标（不重复）→ 每个图标做 2 张卡 → Fisher-Yates 洗牌 */
  function buildDeck(level) {
    var pool = ICONS.map(function (ic) { return ic; });
    var chosen = shuffle(pool).slice(0, level);
    var cards = [];
    var id = 0;
    chosen.forEach(function (ic) {
      cards.push({ id: id, iconId: ic.id, matched: false }); id += 1;
      cards.push({ id: id, iconId: ic.id, matched: false }); id += 1;
    });
    return shuffle(cards);
  }
  function iconSvg(iconId) {
    for (var i = 0; i < ICONS.length; i++) {
      if (ICONS[i].id === iconId) { return ICONS[i].draw(); }
    }
    return '';
  }

  /* ---------- 视图：游戏页 ---------- */
  function startGame(level) {
    if (!ICONS.length) {
      viewEl.textContent = '图标库缺失，请检查 icons.js';
      return;
    }
    state.level = level;
    state.cards = buildDeck(level);
    state.flipped = [];
    state.pairs = 0;
    state.moves = 0;
    state.busy = false;
    state.started = false;
    state.finished = false;
    state.startMs = 0;
    state.elapsed = 0;
    stopTimer();
    renderHeader(LEVELS[level].label);
    clearNode(viewEl);
    renderGame();
    // 游戏页不走底栏导航（顶部返回 + 底部重新开始）
    clearNode(document.getElementById('app-footer'));
  }

  function renderGame() {
    var level = state.level;
    var l = LEVELS[level];
    var n = state.cards.length;
    cardEls = [];

    // 顶部状态栏：返回 | 难度 | 计时 | 已配对
    var top = makeEl('div', 'game-top');
    var back = makeEl('button', 'game-back', '‹ 返回');
    back.addEventListener('click', function () { viewHome(); });
    top.appendChild(back);
    top.appendChild(makeEl('div', 'game-name', l.label));
    var timerEl = makeEl('div', 'game-timer', '⏱ 00.0');
    timerEl.id = 'game-timer';
    top.appendChild(timerEl);
    var pairsEl = makeEl('div', 'game-pairs', '配对 0/' + level);
    pairsEl.id = 'game-pairs';
    top.appendChild(pairsEl);
    viewEl.appendChild(top);

    // 卡片网格：正方形卡片，按列数百分比铺排（3×4→25%、4×4→25%、4×5→20%）
    var grid = makeEl('div', 'memory-grid grid-' + level);
    for (var i = 0; i < n; i++) {
      (function (idx) {
        var card = state.cards[idx];
        var wrap = makeEl('div', 'card');
        var inner = makeEl('div', 'card-inner');
        var backFace = makeEl('div', 'card-face card-back');
        backFace.appendChild(makeEl('span', 'card-q', '?'));
        var frontFace = makeEl('div', 'card-face card-front');
        frontFace.innerHTML = iconSvg(card.iconId);
        inner.appendChild(backFace);
        inner.appendChild(frontFace);
        wrap.appendChild(inner);
        wrap.addEventListener('click', function () { onCardTap(idx); });
        cardEls[idx] = wrap;
        grid.appendChild(wrap);
      })(i);
    }
    viewEl.appendChild(grid);

    // 底部：步数 + 重新开始
    var status = makeEl('div', 'game-status');
    var movesEl = makeEl('div', 'game-moves', '步数 0');
    movesEl.id = 'game-moves';
    status.appendChild(movesEl);
    viewEl.appendChild(status);

    var row = makeEl('div', 'btn-row');
    var restart = makeEl('button', 'btn btn-primary', '重新开始');
    restart.addEventListener('click', function () { startGame(level); });
    row.appendChild(restart);
    viewEl.appendChild(row);
  }

  function onCardTap(idx) {
    if (state.finished || state.busy) { return; }
    var card = state.cards[idx];
    var el = cardEls[idx];
    if (!el || card.matched) { return; }
    if (state.flipped.indexOf(idx) !== -1) { return; }
    // 第一次翻牌开始计时
    if (!state.started) {
      state.started = true;
      state.startMs = performance.now();
      startTimer();
    }
    el.className += ' flipped';
    state.flipped.push(idx);
    if (state.flipped.length === 2) {
      state.moves += 1;
      updateMoves();
      compareCards();
    }
  }

  /* 比较当前翻开的两张卡 */
  function compareCards() {
    var a = state.flipped[0];
    var b = state.flipped[1];
    var ca = state.cards[a];
    var cb = state.cards[b];
    if (ca.iconId === cb.iconId) {
      // 配对成功：绿色高亮锁定，保持翻开
      ca.matched = true;
      cb.matched = true;
      cardEls[a].className += ' matched';
      cardEls[b].className += ' matched';
      state.pairs += 1;
      updatePairs();
      state.flipped = [];
      if (state.pairs >= state.level) { finishGame(); }
    } else {
      // 配对失败：红色闪烁约 500ms 后翻回
      state.busy = true;
      cardEls[a].className += ' miss';
      cardEls[b].className += ' miss';
      window.setTimeout(function () {
        cardEls[a].className = cardEls[a].className.replace(' flipped', '').replace(' miss', '');
        cardEls[b].className = cardEls[b].className.replace(' flipped', '').replace(' miss', '');
        state.flipped = [];
        state.busy = false;
      }, 500);
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
  function updatePairs() {
    var el = document.getElementById('game-pairs');
    if (el) { el.textContent = '配对 ' + state.pairs + '/' + state.level; }
  }
  function updateMoves() {
    var el = document.getElementById('game-moves');
    if (el) { el.textContent = '步数 ' + state.moves; }
  }

  /* ---------- 结算 ---------- */
  function calcStars(level, ms) {
    var l = LEVELS[level];
    if (ms <= l.threeMs) { return 3; }
    if (ms <= l.twoMs) { return 2; }
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
    var stars = calcStars(state.level, state.elapsed);

    // 最佳 / 最近 / 历史（按时间，ms 更小覆盖）
    var key = '' + state.level;
    var msRound = Math.round(state.elapsed);
    var isNewBest = false;
    var best = store.best[key];
    if (!best || msRound < best.ms) {
      store.best[key] = { ms: msRound, date: t };
      isNewBest = true;
    }
    store.recent[key] = msRound;
    store.history.unshift({ date: t, level: state.level, ms: msRound, moves: state.moves, stars: stars });
    while (store.history.length > 30) { store.history.pop(); }
    saveStore();

    // 略延迟展示结果，让最后一对配对的绿色锁定可见
    window.setTimeout(function () {
      showResult(msRound, state.moves, stars, isNewBest);
    }, 350);
  }

  /* ---------- 结果浮层 ---------- */
  function mkStat(label, val) {
    var s = makeEl('div', 'result-stat');
    s.appendChild(makeEl('b', '', val));
    s.appendChild(makeEl('span', '', label));
    return s;
  }
  function showResult(ms, moves, stars, isNewBest) {
    var overlay = makeEl('div', 'result-overlay');
    var box = makeEl('div', 'result-box');
    box.appendChild(makeEl('div', 'result-title', '完成！'));
    box.appendChild(makeEl('div', 'result-time', (ms / 1000).toFixed(1) + ' 秒'));
    var stats = makeEl('div', 'result-stats');
    stats.appendChild(mkStat('用时', (ms / 1000).toFixed(1) + 's'));
    stats.appendChild(mkStat('步数', '' + moves));
    stats.appendChild(mkStat('配对', state.level + '/' + state.level));
    box.appendChild(stats);
    box.appendChild(makeEl('div', 'result-stars', '★★★'.slice(0, stars)));
    if (isNewBest) {
      box.appendChild(makeEl('div', 'result-record', '🎉 新纪录！'));
    }
    var again = makeEl('button', 'btn btn-primary', '再来一局');
    again.addEventListener('click', function () {
      closeOverlay(overlay);
      startGame(state.level);
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
      var label = LEVELS[r.level] ? LEVELS[r.level].label : (r.level + ' 对');
      left.appendChild(makeEl('div', 'point-name', label));
      left.appendChild(makeEl('div', 'point-meta', r.date + ' · 步数 ' + r.moves));
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
