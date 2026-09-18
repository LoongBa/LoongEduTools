/* ============================================================
   2048 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   设计约束：
   - 不使用 import/export / type="module"
   - 不超出 ES2017（无 ?. ?? 对象展开等）；var + function 风格
   - 事件全部 addEventListener，无内联事件 / eval / innerHTML
   - 无 fetch/XHR/Worker；localStorage 读写 try/catch
   - 音效：Web Audio OscillatorNode 合成（无音频文件，合规）
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };

  /* ---------- DOM ---------- */
  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');
  var footerEl = document.getElementById('app-footer');
  var boardEl = null;
  var cells = [];
  var scoreNumEl = null;
  var bestNumEl = null;
  var overlayEl = null;

  /* ---------- 常量 ---------- */
  var SIZE = 4;
  var STORE_KEY = 'redtools.game2048.v1';
  var GAP = 2.6;                      // 棋盘格子间距（百分比）
  var CELL = (100 - GAP * 5) / 4;     // 每格百分比宽度
  var SWIPE = 24;                     // 滑动判定阈值 px
  var TILE_CLS = {
    2: 't2', 4: 't4', 8: 't8', 16: 't16', 32: 't32', 64: 't64',
    128: 't128', 256: 't256', 512: 't512', 1024: 't1024',
    2048: 't2048', 4096: 't4096', 8192: 't8192'
  };

  /* ---------- 状态 ---------- */
  var state = {
    grid: [], score: 0,
    over: false, wonFired: false, wonLock: false,
    popIdxs: [], newRec: false
  };
  var touchStart = { x: 0, y: 0 };

  /* ---------- 持久化（redtools.game2048.v1） ---------- */
  function loadStore() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) { return JSON.parse(raw); }
    } catch (err) { /* ignore */ }
    return {
      version: 1,
      best: 0,
      games: 0,
      checkin: { dates: [], streak: 0 },
      cur: null
    };
  }
  function saveStore() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (err) { /* ignore */ }
  }
  var store = loadStore();
  saveStore(); // 初始化写入

  /* ---------- 工具函数 ---------- */
  function clearNode(node) {
    while (node.firstChild) { node.removeChild(node.firstChild); }
  }
  function makeEl(tag, className, text) {
    var el = document.createElement(tag);
    if (className) { el.className = className; }
    if (text !== undefined && text !== null) { el.textContent = text; }
    return el;
  }
  function gridSame(a, b) {
    for (var i = 0; i < SIZE * SIZE; i++) {
      if (a[i] !== b[i]) { return false; }
    }
    return true;
  }
  function fmtDate(d) {
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return '' + d.getFullYear() +
           (m < 10 ? '0' + m : '' + m) +
           (day < 10 ? '0' + day : '' + day);
  }
  function calcStreak(dates) {
    if (!dates || !dates.length) { return 0; }
    var set = {};
    for (var i = 0; i < dates.length; i++) { set[dates[i]] = true; }
    var cur = new Date();
    cur.setHours(0, 0, 0, 0);
    if (!set[fmtDate(cur)]) {
      cur.setDate(cur.getDate() - 1); // 今天未打则从昨天起算连续
    }
    var streak = 0;
    while (set[fmtDate(cur)]) {
      streak++;
      cur.setDate(cur.getDate() - 1);
    }
    return streak;
  }

  /* ---------- 音效（Web Audio 合成） ---------- */
  var actx = null;
  function ensureAudio() {
    try {
      if (!actx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) { actx = new AC(); }
      }
      if (actx && actx.state === 'suspended') { actx.resume(); }
    } catch (err) { /* ignore */ }
    return actx;
  }
  function tone(freq, dur, type, vol, delay) {
    var ac = ensureAudio();
    if (!ac) { return; }
    try {
      var t0 = ac.currentTime + (delay || 0);
      var osc = ac.createOscillator();
      var g = ac.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(vol || 0.1, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (err) { /* ignore */ }
  }
  function sndMove() { tone(180, 0.05, 'sine', 0.045); }
  function sndMerge() { tone(660, 0.09, 'triangle', 0.11); }
  function sndWin() {
    tone(523, 0.12, 'sine', 0.11, 0);
    tone(659, 0.12, 'sine', 0.11, 0.12);
    tone(784, 0.12, 'sine', 0.11, 0.24);
    tone(1047, 0.22, 'sine', 0.11, 0.36);
  }
  function sndLose() {
    tone(400, 0.12, 'sine', 0.09, 0);
    tone(320, 0.12, 'sine', 0.09, 0.12);
    tone(200, 0.22, 'sine', 0.09, 0.24);
  }

  /* ---------- 游戏逻辑 ---------- */
  function idxAt(k, q, dir) {
    // k = 行/列序号，q = 行内/列内序号；dir 0左 1上 2右 3下
    var row = (dir === 0 || dir === 2) ? k : q;
    var col = (dir === 0 || dir === 2) ? q : k;
    return row * SIZE + col;
  }
  function slideLine(line) {
    // 左移一维合并；返回新行 + 合并标记（每块每轮只合一次）
    var t = [];
    for (var i = 0; i < line.length; i++) {
      if (line[i]) { t.push(line[i]); }
    }
    var out = [];
    var merged = [];
    for (var j = 0; j < t.length; j++) {
      if (j + 1 < t.length && t[j] === t[j + 1]) {
        out.push(t[j] * 2);
        merged.push(1);
        state.score += t[j] * 2; // 得分 = 合并值
        j++;
      } else {
        out.push(t[j]);
        merged.push(0);
      }
    }
    while (out.length < line.length) {
      out.push(0);
      merged.push(0);
    }
    return { out: out, merged: merged };
  }
  function applyMove(dir) {
    var before = state.grid.slice();
    var popIdxs = [];
    var rev = (dir === 2 || dir === 3);
    for (var k = 0; k < SIZE; k++) {
      var line = [];
      for (var q = 0; q < SIZE; q++) {
        line.push(state.grid[idxAt(k, q, dir)]);
      }
      if (rev) { line.reverse(); }
      var res = slideLine(line);
      if (rev) {
        res.out.reverse();
        res.merged.reverse();
      }
      for (q = 0; q < SIZE; q++) {
        var idx = idxAt(k, q, dir);
        state.grid[idx] = res.out[q];
        if (res.merged[q]) { popIdxs.push(idx); }
      }
    }
    state.popIdxs = popIdxs;
    return !gridSame(before, state.grid);
  }
  function randomTile() {
    var empty = [];
    for (var i = 0; i < SIZE * SIZE; i++) {
      if (!state.grid[i]) { empty.push(i); }
    }
    if (!empty.length) { return -1; }
    var idx = empty[Math.floor(Math.random() * empty.length)];
    state.grid[idx] = Math.random() < 0.9 ? 2 : 4;
    return idx;
  }
  function isOver() {
    for (var i = 0; i < SIZE * SIZE; i++) {
      if (!state.grid[i]) { return false; }
    }
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var v = state.grid[r * SIZE + c];
        if (c < SIZE - 1 && v === state.grid[r * SIZE + c + 1]) { return false; }
        if (r < SIZE - 1 && v === state.grid[(r + 1) * SIZE + c]) { return false; }
      }
    }
    return true;
  }
  function isWon() {
    for (var i = 0; i < SIZE * SIZE; i++) {
      if (state.grid[i] >= 2048) { return true; }
    }
    return false;
  }
  function updateBest() {
    var old = store.best || 0;
    if (state.score > old) {
      store.best = state.score;
      state.newRec = true;
    } else {
      state.newRec = false;
    }
  }
  function handleMove(dir) {
    if (state.over || state.wonLock) { return; }
    ensureAudio(); // 用户手势内创建 AudioContext
    var lastScore = state.score;
    var changed = applyMove(dir);
    if (!changed) { return; }
    var newIdx = randomTile();
    if (state.score > lastScore) { sndMerge(); } else { sndMove(); }
    updateScoreUI();
    paintCells(state.popIdxs, [newIdx]);
    saveCur();
    if (!state.wonFired && isWon()) {
      state.wonFired = true;
      state.wonLock = true;
      sndWin();
      updateBest();
      saveStore();
      setTimeout(openWin, 550);
      return;
    }
    if (isOver()) {
      state.over = true;
      sndLose();
      setTimeout(endGame, 550);
    }
  }

  /* ---------- 渲染 ---------- */
  function renderHeader() {
    clearNode(headerEl);
    var ver = APP.meta && APP.meta.version ? 'v' + APP.meta.version : '';
    if (ver) { headerEl.appendChild(makeEl('span', 'ver-badge', ver)); }
  }
  function renderBoard() {
    clearNode(boardEl);
    cells = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var cell = makeEl('div', 'cell');
        cell.style.left = (GAP + c * (CELL + GAP)) + '%';
        cell.style.top = (GAP + r * (CELL + GAP)) + '%';
        cell.style.width = CELL + '%';
        cell.style.height = CELL + '%';
        boardEl.appendChild(cell);
        cells.push(cell);
      }
    }
  }
  function tileCls(v) { return TILE_CLS[v] || 'tbig'; }
  function sizeCls(v) {
    var len = ('' + v).length;
    return len <= 1 ? 's0' : len === 2 ? 's1' : len === 3 ? 's2' : len === 4 ? 's3' : 's4';
  }
  function paintCells(popIdxs, newIdxs) {
    var pop = {};
    var news = {};
    for (var p = 0; p < popIdxs.length; p++) { pop[popIdxs[p]] = 1; }
    for (var n = 0; n < newIdxs.length; n++) { news[newIdxs[n]] = 1; }
    for (var i = 0; i < cells.length; i++) {
      var v = state.grid[i];
      var cell = cells[i];
      if (!v) {
        cell.textContent = '';
        cell.className = 'cell';
        continue;
      }
      cell.textContent = '' + v;
      cell.className = 'cell ' + tileCls(v) + ' ' + sizeCls(v);
      if (pop[i]) { cell.className += ' pop'; }
      else if (news[i]) { cell.className += ' appear'; }
    }
  }
  function updateScoreUI() {
    if (scoreNumEl) { scoreNumEl.textContent = '' + state.score; }
    if (bestNumEl) { bestNumEl.textContent = '' + (store.best || 0); }
  }
  function popScore() {
    if (!scoreNumEl) { return; }
    scoreNumEl.className = 'num';
    void scoreNumEl.offsetWidth; // 强制重排以重启动画
    scoreNumEl.className = 'num pop';
  }
  function renderFooter() {
    clearNode(footerEl);
    var streak = store.checkin && store.checkin.streak ? store.checkin.streak : 0;
    var txt = streak > 0
      ? '完成一局点亮今日 · 已连续打卡 ' + streak + ' 天'
      : '滑动 / 方向键移动 · 合成 2048 即胜利';
    footerEl.appendChild(makeEl('span', 'footer-checkin', txt));
  }
  function renderView() {
    clearNode(viewEl);
    // 顶部：标题 + 得分面板
    var top = makeEl('div', 'game-top');
    var titleBox = makeEl('div', 'game-title');
    titleBox.appendChild(makeEl('h1', null, '2048'));
    titleBox.appendChild(makeEl('div', 'sub', '经典怀旧 · 数字合并'));
    top.appendChild(titleBox);
    var scores = makeEl('div', 'scores');
    var scoreBox = makeEl('div', 'score-box');
    scoreBox.appendChild(makeEl('div', 'label', '得分'));
    scoreNumEl = makeEl('div', 'num', '0');
    scoreBox.appendChild(scoreNumEl);
    var bestBox = makeEl('div', 'score-box');
    bestBox.appendChild(makeEl('div', 'label', '最高'));
    bestNumEl = makeEl('div', 'num', '0');
    bestBox.appendChild(bestNumEl);
    scores.appendChild(scoreBox);
    scores.appendChild(bestBox);
    top.appendChild(scores);
    viewEl.appendChild(top);
    // 棋盘
    boardEl = makeEl('div', 'board');
    viewEl.appendChild(boardEl);
    renderBoard();
    // 方向按钮（左右分组，双手持机按键：左 ↑← / 右 →↓）
    var dpad = makeEl('div', 'dpad');
    var dirLabel = function (ch) {
      return '向' + (ch === '←' ? '左' : ch === '→' ? '右' : ch === '↑' ? '上' : '下') + '移动';
    };
    var addDirBtn = function (group, ch, code) {
      var btn = makeEl('button', 'dpad-btn', ch);
      btn.setAttribute('aria-label', dirLabel(ch));
      btn.addEventListener('click', function () { handleMove(code); });
      group.appendChild(btn);
    };
    var leftGroup = makeEl('div', 'dpad-group dpad-left');
    addDirBtn(leftGroup, '↑', 1);
    addDirBtn(leftGroup, '←', 0);
    dpad.appendChild(leftGroup);
    var rightGroup = makeEl('div', 'dpad-group dpad-right');
    addDirBtn(rightGroup, '→', 2);
    addDirBtn(rightGroup, '↓', 3);
    dpad.appendChild(rightGroup);
    viewEl.appendChild(dpad);
    // 新游戏
    var btnRow = makeEl('div', 'btn-row');
    var btnNew = makeEl('button', 'btn-main', '新游戏');
    btnNew.addEventListener('click', newGame);
    btnRow.appendChild(btnNew);
    viewEl.appendChild(btnRow);
    // 提示
    viewEl.appendChild(makeEl('div', 'hint', '滑动屏幕、方向键或 WASD 移动 · 相同数字相撞合并'));
  }

  /* ---------- 结算弹层 ---------- */
  function hideOverlay() {
    if (overlayEl && overlayEl.parentNode) {
      overlayEl.parentNode.removeChild(overlayEl);
    }
    overlayEl = null;
  }
  function showOverlay(title, sub, noteLines, btns) {
    hideOverlay();
    var ov = makeEl('div', 'overlay');
    var card = makeEl('div', 'overlay-card');
    card.appendChild(makeEl('div', 'overlay-title', title));
    if (sub) { card.appendChild(makeEl('div', 'overlay-sub', sub)); }
    var sum = makeEl('div', 'summary');
    sum.appendChild(makeEl('div', 'score-label', '本次得分'));
    sum.appendChild(makeEl('div', 'score-num', '' + state.score));
    for (var i = 0; i < noteLines.length; i++) {
      sum.appendChild(makeEl('div', noteLines[i].cls, noteLines[i].text));
    }
    card.appendChild(sum);
    var btnsBox = makeEl('div', 'overlay-btns');
    for (var j = 0; j < btns.length; j++) {
      (function (b) {
        var btn = makeEl('button', b.cls, b.text);
        btn.addEventListener('click', function () { b.act(); });
        btnsBox.appendChild(btn);
      })(btns[j]);
    }
    card.appendChild(btnsBox);
    ov.appendChild(card);
    document.body.appendChild(ov);
    overlayEl = ov;
  }
  function openWin() {
    var isRec = state.newRec;
    var notes = [];
    if (isRec) { notes.push({ cls: 'best-line new-rec', text: '🏆 新纪录！' }); }
    else { notes.push({ cls: 'best-line', text: '最高分 ' + (store.best || 0) }); }
    showOverlay('🎉 达成 2048！', '数字合并大师就是你～', notes, [
      { text: '继续挑战', cls: 'btn-ghost', act: function () {
        state.wonLock = false;
        hideOverlay();
      } },
      { text: '新游戏', cls: 'btn-main', act: newGame }
    ]);
  }
  function endGame() {
    state.over = true;
    var lastScore = state.score;
    var oldBest = store.best || 0;
    if (lastScore > oldBest) {
      store.best = lastScore;
      state.newRec = true;
    } else {
      state.newRec = false;
    }
    store.games = (store.games || 0) + 1;
    store.cur = null; // 结束局不再恢复
    doCheckin();
    saveStore();
    renderFooter();
    var notes = [];
    if (state.newRec) {
      notes.push({ cls: 'best-line new-rec', text: '🏆 新纪录！' });
    } else {
      notes.push({ cls: 'best-line', text: '最高分 ' + (store.best || 0) });
    }
    notes.push({
      cls: 'checkin-line',
      text: store.checkin && store.checkin.streak > 0
        ? '✅ 今日已打卡 · 连续 ' + store.checkin.streak + ' 天'
        : '✅ 今日已打卡'
    });
    showOverlay('游戏结束', '再来一局，冲击更高分！', notes, [
      { text: '再来一局', cls: 'btn-main', act: newGame }
    ]);
  }
  function doCheckin() {
    if (!store.checkin) { store.checkin = { dates: [], streak: 0 }; }
    var today = fmtDate(new Date());
    var dates = store.checkin.dates || [];
    if (dates.indexOf(today) < 0) { dates.push(today); }
    dates.sort();
    while (dates.length > 365) { dates.shift(); } // 滚动 365 天
    store.checkin.dates = dates;
    store.checkin.streak = calcStreak(dates);
  }

  /* ---------- 新局 / 恢复 ---------- */
  function newGame() {
    state.grid = [];
    for (var i = 0; i < SIZE * SIZE; i++) { state.grid.push(0); }
    state.score = 0;
    state.over = false;
    state.wonFired = false;
    state.wonLock = false;
    state.newRec = false;
    randomTile();
    randomTile();
    hideOverlay();
    renderBoard();
    paintCells([], []);
    updateScoreUI();
    saveCur();
  }
  function saveCur() {
    store.cur = { grid: state.grid.slice(), score: state.score };
    saveStore();
  }
  function restoreGame() {
    var cur = store.cur;
    if (cur && cur.grid && cur.grid.length === SIZE * SIZE) {
      var has = false;
      for (var i = 0; i < cur.grid.length; i++) {
        if (cur.grid[i]) { has = true; break; }
      }
      if (has) {
        state.grid = cur.grid.slice();
        state.score = cur.score || 0;
        state.over = false;
        state.wonFired = false;
        state.wonLock = false;
        renderBoard();
        paintCells([], []);
        return;
      }
    }
    newGame();
  }

  /* ---------- 输入 ---------- */
  function onKeyDown(e) {
    var dir = -1;
    var kc = e.keyCode || e.which;
    if (kc === 37 || kc === 65) { dir = 0; }       // ← / A
    else if (kc === 38 || kc === 87) { dir = 1; }  // ↑ / W
    else if (kc === 39 || kc === 68) { dir = 2; }  // → / D
    else if (kc === 40 || kc === 83) { dir = 3; }  // ↓ / S
    if (dir >= 0) {
      e.preventDefault();
      handleMove(dir);
    }
  }
  function onTouchStart(e) {
    var t = e.touches && e.touches[0];
    if (!t) { return; }
    touchStart.x = t.clientX;
    touchStart.y = t.clientY;
  }
  function onTouchEnd(e) {
    var t = e.changedTouches && e.changedTouches[0];
    if (!t) { return; }
    var dx = t.clientX - touchStart.x;
    var dy = t.clientY - touchStart.y;
    if (Math.abs(dx) < SWIPE && Math.abs(dy) < SWIPE) { return; } // 防误触
    var dir;
    if (Math.abs(dx) > Math.abs(dy)) {
      dir = dx > 0 ? 2 : 0; // 右 / 左
    } else {
      dir = dy > 0 ? 3 : 1; // 下 / 上
    }
    handleMove(dir);
  }
  function onTouchMove(e) {
    // 棋盘上阻止浏览器滚动/下拉刷新
    if (e.cancelable) { e.preventDefault(); }
  }

  /* ---------- 启动 ---------- */
  function syncAppHeight() {
    var docEl = document.documentElement;
    var vh = window.innerHeight || docEl.clientHeight;
    docEl.style.setProperty('--app-height', vh + 'px');
  }
  function init() {
    renderHeader();
    renderView();
    renderFooter();
    updateScoreUI();
    restoreGame();
    window.addEventListener('keydown', onKeyDown);
    boardEl.addEventListener('touchstart', onTouchStart, { passive: true });
    boardEl.addEventListener('touchend', onTouchEnd, { passive: true });
    boardEl.addEventListener('touchmove', onTouchMove, { passive: false });
  }

  if (window.addEventListener) {
    window.addEventListener('resize', syncAppHeight);
  }
  syncAppHeight();
  init();
})();