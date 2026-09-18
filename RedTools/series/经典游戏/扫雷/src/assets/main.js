/* ============================================================
   扫雷 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   设计约束：
   - 不使用 import/export / type="module"
   - 不超出 ES2017（无 ?. ?? 对象展开 replaceAll 等）；var + function 风格
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
  var cellFills = [];
  var tabsEl = null;
  var tabBtns = [];
  var ledMinesEl = null;
  var ledTimeEl = null;
  var faceEl = null;
  var bestValEl = null;
  var hintEl = null;
  var overlayEl = null;
  var guardBarEl = null;
  var guardMinEl = null;
  var guardGamesEl = null;
  var modeBarEl = null;
  var modeBtnReveal = null;
  var modeBtnFlag = null;
  var boardScrollEl = null;

  /* ---------- 常量 ---------- */
  var STORE_KEY = 'redtools.minesweeper.v1';
  var GAP = 1.5;   // 棋盘格子间距（百分比）
  var MIN_CELL = 14; // 棋盘滚动容器下格子的最小像素尺寸（高级/中级手机可横滑）
  var CURSOR_CLS = 'cursor'; // 键盘光标高亮 class
  var DIFFS = [
    { key: 'easy',   label: '初级', cols: 9,  rows: 9,  mines: 10 },
    { key: 'medium', label: '中级', cols: 16, rows: 16, mines: 40 },
    { key: 'hard',   label: '高级', cols: 30, rows: 16, mines: 99 }
  ];

  /* ---------- 状态（冒烟按此结构注入/读取） ---------- */
  var state = {
    cols: 9, rows: 9, mines: 10,
    layout: [], opened: [], flagged: [],
    revealed: false, over: false, won: false,
    time: 0, timerId: null, firstTouch: null,
    startedAt: 0,           // 首点毫秒时间戳（试错局判定）
    guardPaused: false,     // 防沉迷提醒弹窗打开中（暂停输入/计时）
    guardWarned: false,     // 本局时长提醒已弹（每局重置）
    flagMode: false,        // 触屏标旗模式：单击未翻开格=插旗（store 持久化）
    cursor: -1,             // 键盘光标索引（-1=未启用）
    bestKey: 'easy',
    boomIdx: -1, newRec: false
  };
  var adj = []; // 邻接表：adj[i] = 周围邻居索引数组

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

  /* ---------- 持久化（redtools.minesweeper.v1） ---------- */
  // guard 档位常量（对齐 docs/通用需求-防沉迷自控力.md §4）
  var GUARD_MINUTES = [5, 10, 15];          // 单局时长档位
  var GUARD_GAMES = [3, 5, 10, 0];          // 今日局数档位（0=不限）
  var TRIAL_SEC = 10;                        // 试错局豁免阈值（<10s 失败不计今日局数）
  var DELAY_LIMIT = 2;                       // 每类延迟上限
  var DELAY_MINUTES = 5;                     // 延迟：局内 +5 分钟
  var DELAY_GAMES = 2;                       // 延迟：今日局数 +2 局
  function defaultStore() {
    return {
      version: 2,
      best: { easy: 0, medium: 0, hard: 0 },
      games: 0, wins: 0,
      checkin: { dates: [], streak: 0 },
      guard: {
        minutePref: 5, gamesPref: 5,
        today: '', playedToday: 0,
        delayMinTimes: 0, delayGamesTimes: 0
      },
      selfDaily: [], selfStreak: 0,          // 自律天数（对齐通用需求 §4）
      flagMode: false,                       // 触屏默认翻开模式（标旗模式持久化）
      cur: null
    };
  }
  function defaultGuard() { return defaultStore().guard; }
  function pickBest(v) {
    return (typeof v === 'number' && v > 0) ? v : 0;
  }
  function normalizeStore(s) {
    var out = defaultStore();
    if (!s) { return out; }
    if (s.checkin && s.checkin.dates) {
      out.checkin.dates = s.checkin.dates.slice();
      if (typeof s.checkin.streak === 'number') { out.checkin.streak = s.checkin.streak; }
    }
    if (s.best && typeof s.best === 'object') {
      out.best.easy = pickBest(s.best.easy);
      out.best.medium = pickBest(s.best.medium);
      out.best.hard = pickBest(s.best.hard);
    } else if (typeof s.best === 'number') {
      out.best.easy = pickBest(s.best);
      out.best.medium = pickBest(s.best);
      out.best.hard = pickBest(s.best);
    }
    if (typeof s.games === 'number') { out.games = s.games; }
    if (typeof s.wins === 'number') { out.wins = s.wins; }
    // v1 → v2 迁移：guard/selfDaily 补齐默认
    if (s.guard && typeof s.guard === 'object') {
      var g = defaultGuard();
      if (typeof s.guard.minutePref === 'number' && GUARD_MINUTES.indexOf(s.guard.minutePref) >= 0) {
        g.minutePref = s.guard.minutePref;
      }
      if (typeof s.guard.gamesPref === 'number') { g.gamesPref = s.guard.gamesPref; }
      if (typeof s.guard.today === 'string') { g.today = s.guard.today; }
      if (typeof s.guard.playedToday === 'number') { g.playedToday = s.guard.playedToday; }
      if (typeof s.guard.delayMinTimes === 'number') { g.delayMinTimes = s.guard.delayMinTimes; }
      if (typeof s.guard.delayGamesTimes === 'number') { g.delayGamesTimes = s.guard.delayGamesTimes; }
      out.guard = g;
    }
    if (Array.isArray(s.selfDaily)) { out.selfDaily = s.selfDaily.slice(); }
    if (typeof s.selfStreak === 'number') { out.selfStreak = s.selfStreak; }
    if (typeof s.flagMode === 'boolean') { out.flagMode = s.flagMode; }
    if (s.cur && typeof s.cur === 'object') { out.cur = s.cur; }
    return out;
  }
  function loadStore() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) { return normalizeStore(JSON.parse(raw)); }
    } catch (err) { /* ignore */ }
    return defaultStore();
  }
  function saveStore() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (err) { /* ignore */ }
  }
  var store = loadStore();
  saveStore(); // 初始化归一化写入

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
  function sndReveal() { tone(300, 0.035, 'sine', 0.06); }
  function sndFlag() { tone(520, 0.045, 'triangle', 0.1); }
  function sndUnflag() { tone(380, 0.04, 'triangle', 0.1); }
  function sndWin() {
    tone(523, 0.12, 'sine', 0.11, 0);
    tone(659, 0.12, 'sine', 0.11, 0.12);
    tone(784, 0.12, 'sine', 0.11, 0.24);
    tone(1047, 0.22, 'sine', 0.11, 0.36);
  }
  function sndLose() {
    var ac = ensureAudio();
    if (!ac) { return; }
    try {
      var t0 = ac.currentTime;
      var osc = ac.createOscillator();
      var g = ac.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, t0);
      osc.frequency.exponentialRampToValueAtTime(50, t0 + 0.35);
      g.gain.setValueAtTime(0.12, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + 0.37);
    } catch (err) { /* ignore */ }
  }

  /* ---------- 布局与邻接 ---------- */
  function cellPct() { return (100 - GAP * (state.cols + 1)) / state.cols; }
  function boardHeightPct() {
    return GAP * (state.rows + 1) + cellPct() * state.rows;
  }
  function buildAdj() {
    adj = [];
    var total = state.cols * state.rows;
    for (var i = 0; i < total; i++) { adj.push([]); }
    for (var r = 0; r < state.rows; r++) {
      for (var c = 0; c < state.cols; c++) {
        var idx = r * state.cols + c;
        var list = [];
        for (var dr = -1; dr <= 1; dr++) {
          for (var dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) { continue; }
            var nr = r + dr;
            var nc = c + dc;
            if (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols) {
              list.push(nr * state.cols + nc);
            }
          }
        }
        adj[idx] = list;
      }
    }
  }
  function isMine(i) { return state.layout.indexOf(i) >= 0; }
  function isOpened(i) { return state.opened.indexOf(i) >= 0; }
  function isFlagged(i) { return state.flagged.indexOf(i) >= 0; }
  function countMines(i) {
    var n = 0;
    var list = adj[i];
    for (var k = 0; k < list.length; k++) {
      if (isMine(list[k])) { n++; }
    }
    return n;
  }
  function countFlags(i) {
    var n = 0;
    var list = adj[i];
    for (var k = 0; k < list.length; k++) {
      if (isFlagged(list[k])) { n++; }
    }
    return n;
  }

  /* ---------- 布雷：首点安全（3×3 剔除） ---------- */
  function placeMines(firstIdx) {
    var total = state.cols * state.rows;
    var excl = {};
    excl[firstIdx] = true;
    var nbrs = adj[firstIdx];
    for (var k = 0; k < nbrs.length; k++) { excl[nbrs[k]] = true; }
    var cands = [];
    for (var i = 0; i < total; i++) {
      if (!excl[i]) { cands.push(i); }
    }
    // Fisher-Yates 洗牌后取前 mines 个
    for (i = cands.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = cands[i];
      cands[i] = cands[j];
      cands[j] = tmp;
    }
    var m = state.mines < cands.length ? state.mines : cands.length;
    state.layout = cands.slice(0, m);
  }

  /* ---------- 洪水展开（显式队列 BFS） ---------- */
  function floodOpen(start) {
    if (isOpened(start) || isFlagged(start)) { return false; }
    var q = [start];
    var qi = 0;
    state.opened.push(start);
    while (qi < q.length) {
      var idx = q[qi];
      qi++;
      if (countMines(idx) > 0) { continue; } // 数字格不开采
      var nbrs = adj[idx];
      for (var k = 0; k < nbrs.length; k++) {
        var n = nbrs[k];
        if (isOpened(n) || isFlagged(n)) { continue; }
        state.opened.push(n);
        if (countMines(n) === 0) { q.push(n); }
      }
    }
    return true;
  }

  /* ---------- 计时 ---------- */
  function startTimer() {
    if (state.timerId) { return; }
    state.timerId = setTimeout(tickTimer, 1000);
  }
  function stopTimer() {
    if (state.timerId) {
      clearTimeout(state.timerId);
      state.timerId = null;
    }
  }
  function tickTimer() {
    state.timerId = null;
    if (state.over || state.won) { return; }
    if (state.time < 999) {
      state.time++;
      updateInfo();
      if (state.time % 5 === 0) { saveCur(); } // 每 5 秒批量写盘
      state.timerId = setTimeout(tickTimer, 1000);
    } else {
      updateInfo(); // 上限 999（经典）
    }
    checkGuardTime(); // 防沉迷：单局时长到点
  }

  /* ---------- 防沉迷 / 自控力（docs/通用需求-防沉迷自控力.md） ---------- */
  function fmtToday() { return fmtDate(new Date()); }
  function refreshGuardDay() {
    var today = fmtToday();
    if (store.guard.today !== today) {
      store.guard.today = today;
      store.guard.playedToday = 0;
      store.guard.delayMinTimes = 0;
      store.guard.delayGamesTimes = 0;
      saveStore();
    }
  }
  function isSelfLocked() {
    return store.selfDaily.indexOf(fmtToday()) >= 0;
  }
  function guardMinuteLimit() {
    // 本局时长上限（分钟）= 档位 + 已延迟次数×5
    return store.guard.minutePref + store.guard.delayMinTimes * DELAY_MINUTES;
  }
  function guardGamesLimit() {
    // 今日局数上限 = 档位(0=不限) + 已延迟次数×2
    var base = store.guard.gamesPref;
    if (!base) { return 0; } // 不限
    return base + store.guard.delayGamesTimes * DELAY_GAMES;
  }
  function guardReachedGames() {
    var limit = guardGamesLimit();
    return limit > 0 && store.guard.playedToday >= limit;
  }
  function countPlayed() {
    // 试错局豁免：失败且用时 <10s → 不计今日局数；胜利或用时 ≥10s → +1
    var spent = state.startedAt ? (Date.now() - state.startedAt) / 1000 : 999;
    if (state.won || spent >= TRIAL_SEC) {
      store.guard.playedToday = (store.guard.playedToday || 0) + 1;
    }
  }
  function openGuardTimer() {
    var left = DELAY_LIMIT - store.guard.delayMinTimes;
    var notes = [{
      cls: 'guard-line',
      text: '本局已玩 ' + state.time + ' 秒 · 设定 ' + store.guard.minutePref + ' 分钟'
    }];
    var btns = [];
    if (left > 0) {
      btns.push({
        text: '延迟 ' + DELAY_MINUTES + ' 分钟（剩 ' + left + ' 次）', cls: 'btn-ghost',
        act: function () {
          store.guard.delayMinTimes++;
          saveStore();
          resumeAfterGuard();
        }
      });
    }
    btns.push({
      text: '我很自律，今天足够了', cls: 'btn-main',
      act: doSelfDiscipline
    });
    state.guardPaused = true;
    showOverlay('⏰ 时间到啦', '休息一下，明天更棒', state.time + 's', notes, btns);
    updateInfo();
    renderFooter();
  }
  function checkGuardTime() {
    if (state.guardPaused || state.guardWarned || !state.revealed || state.over || state.won) { return; }
    if (state.time >= guardMinuteLimit() * 60) {
      state.guardWarned = true;
      stopTimer();
      openGuardTimer();
    }
  }
  function resumeAfterGuard() {
    state.guardPaused = false;
    state.guardWarned = false; // 延迟后允许下一次到点再次提醒（新上限生效）
    hideOverlay();
    if (!state.over && !state.won) {
      startTimer(); // 延迟后继续计时（2 次后不再提供延迟，仅剩自律）
    }
    updateInfo();
  }
  function doSelfDiscipline() {
    var today = fmtToday();
    if (store.selfDaily.indexOf(today) < 0) {
      store.selfDaily.push(today);
      store.selfDaily.sort();
      while (store.selfDaily.length > 365) { store.selfDaily.shift(); }
      store.selfStreak = calcStreak(store.selfDaily);
    }
    store.cur = null;
    stopTimer();
    state.guardPaused = false;
    state.over = true;
    saveStore();
    var notes = [{
      cls: 'guard-line',
      text: store.selfStreak > 0 ? '🌟 连续自律 ' + store.selfStreak + ' 天' : '🌟 今日自律成就 +1'
    }];
    showOverlay('👏 今天已经很自律啦', '明天见，更棒的推理小能手', '今日已结束', notes, [
      { text: '明天见', cls: 'btn-main', act: function () {
        hideOverlay();
        renderFooter();
        updateHint();
      } }
    ]);
    renderFooter();
  }

  /* ---------- 核心操作 ---------- */
  function revealCell(idx) {
    if (isSelfLocked() || state.over || state.won || state.guardPaused) { return; }
    if (isFlagged(idx) || isOpened(idx)) { return; }
    if (!state.revealed) {
      // 首次翻开：布雷时剔除首点 3×3
      state.firstTouch = idx;
      state.revealed = true;
      state.startedAt = Date.now(); // 防沉迷试错局判定基准
      placeMines(idx);
      startTimer();
    }
    if (isMine(idx)) { loseGame(idx); return; }
    ensureAudio();
    floodOpen(idx);
    sndReveal();
    paintBoard();
    updateInfo();
    saveCur();
    checkWin();
  }

  function chord(idx) {
    if (isSelfLocked() || state.over || state.won || state.guardPaused) { return; }
    if (!isOpened(idx)) { return; }
    var num = countMines(idx);
    if (num <= 0) { return; } // 点已翻开空白(0) 无操作
    if (countFlags(idx) !== num) { return; } // 旗数不等于数字 → 无操作
    ensureAudio();
    var boom = -1;
    var nbrs = adj[idx];
    for (var k = 0; k < nbrs.length; k++) {
      var n = nbrs[k];
      if (isFlagged(n) || isOpened(n)) { continue; }
      if (isMine(n)) { boom = n; break; }
    }
    if (boom >= 0) { loseGame(boom); return; } // 含雷 → 爆炸
    for (k = 0; k < nbrs.length; k++) {
      n = nbrs[k];
      if (isFlagged(n) || isOpened(n)) { continue; }
      floodOpen(n);
    }
    sndReveal();
    paintBoard();
    updateInfo();
    saveCur();
    checkWin();
  }

  function toggleFlag(idx) {
    if (isSelfLocked() || state.over || state.won || state.guardPaused) { return; } // 自律锁/结束/胜利/防沉迷暂停时禁标旗
    if (isOpened(idx)) { return; }
    ensureAudio();
    var fi = state.flagged.indexOf(idx);
    if (fi >= 0) {
      state.flagged.splice(fi, 1);
      sndUnflag();
    } else {
      state.flagged.push(idx);
      sndFlag();
    }
    paintBoard();
    updateInfo();
    saveCur();
  }

  function checkWin() {
    var total = state.cols * state.rows;
    if (state.opened.length === total - state.mines) { winGame(); }
  }

  function winGame() {
    state.won = true;
    stopTimer();
    sndWin();
    store.games = (store.games || 0) + 1;
    store.wins = (store.wins || 0) + 1;
    state.newRec = false;
    var old = store.best[state.bestKey] || 0;
    if (old === 0 || state.time < old) {
      store.best[state.bestKey] = state.time;
      state.newRec = true;
    }
    countPlayed();                       // 防沉迷：有效局计数（胜利必记）
    doCheckin();                         // 仅胜利打卡
    store.cur = null;
    saveStore();
    paintBoard();
    updateInfo();
    renderFooter();
    renderGuardBar();
    setTimeout(openWin, 600);
  }

  function loseGame(boomIdx) {
    if (state.over || state.won) { return; }
    state.over = true;
    state.boomIdx = boomIdx;
    stopTimer();
    sndLose();
    store.games = (store.games || 0) + 1; // 失败不打卡
    countPlayed();                        // 防沉迷：<10s 试错局豁免
    store.cur = null;
    saveStore();
    paintBoard();
    updateInfo();
    renderFooter();
    renderGuardBar();
    setTimeout(openLose, 600);
  }

  /* ---------- 打卡 ---------- */
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

  /* ---------- 存盘（cur 恢复依赖） ---------- */
  function saveCur() {
    store.cur = {
      cols: state.cols,
      rows: state.rows,
      mines: state.mines,
      layout: state.layout.slice(),
      opened: state.opened.slice(),
      flagged: state.flagged.slice(),
      time: state.time,
      startedAt: state.startedAt,
      started: state.revealed && !state.over && !state.won,
      revealed: state.revealed,
      over: state.over,
      won: state.won
    };
    saveStore();
  }

  /* ---------- 渲染：顶栏 / 难度 tab / 棋盘 / 信息条 ---------- */
  function renderHeader() {
    clearNode(headerEl);
    var ver = APP.meta && APP.meta.version ? 'v' + APP.meta.version : '';
    if (ver) { headerEl.appendChild(makeEl('span', 'ver-badge', ver)); }
  }

  function renderTabs() {
    tabBtns = [];
    clearNode(tabsEl);
    for (var i = 0; i < DIFFS.length; i++) {
      (function (d) {
        var btn = makeEl('button', 'tab-btn', d.label);
        btn.setAttribute('aria-label', d.label + '难度');
        btn.addEventListener('click', function () { setDifficulty(d.key); });
        tabsEl.appendChild(btn);
        tabBtns.push(btn);
      })(DIFFS[i]);
    }
    renderTabsState();
  }
  function renderTabsState() {
    for (var i = 0; i < tabBtns.length; i++) {
      if (DIFFS[i].key === state.bestKey) {
        tabBtns[i].className = 'tab-btn active';
      } else {
        tabBtns[i].className = 'tab-btn';
      }
    }
  }

  function renderBoard() {
    clearNode(boardEl);
    cells = [];
    cellFills = [];
    var total = state.cols * state.rows;
    var cw = cellPct();
    // 横向滚动适配：格子小于 MIN_CELL 时棋盘加宽（容器横向滚动），保证可点
    var minBoardW = Math.ceil((MIN_CELL * 100) / cw); // 使格子 ≥ MIN_CELL 的棋盘宽
    var avail = boardScrollEl ? boardScrollEl.clientWidth : 0;
    var boardW = Math.max(avail, minBoardW);
    boardEl.style.width = boardW + 'px';
    boardEl.style.paddingBottom = boardHeightPct() + '%';
    boardEl.style.fontSize = Math.max(9, Math.round(boardW * cw / 100 * 0.75)) + 'px';
    for (var r = 0; r < state.rows; r++) {
      for (var c = 0; c < state.cols; c++) {
        var cell = makeEl('div', 'cell');
        cell.style.left = (GAP + c * (cw + GAP)) + '%';
        cell.style.top = (GAP + r * (cw + GAP)) + '%';
        cell.style.width = cw + '%';
        cell.style.height = cw + '%';
        var fill = makeEl('div', 'cell-fill');
        cell.appendChild(fill);
        boardEl.appendChild(cell);
        cells.push(cell);
        cellFills.push(fill);
      }
    }
    buildAdj();
  }

  function paintBoard() {
    var total = state.cols * state.rows;
    for (var i = 0; i < total; i++) { paintCell(i); }
  }
  function paintOpened(fill, i) {
    var n = countMines(i);
    fill.className = 'cell-fill revealed num-' + n;
    fill.textContent = n > 0 ? ('' + n) : '';
    if (!state.over && !state.won && i === state.cursor) { fill.className += ' ' + CURSOR_CLS; }
  }
  function paintCell(i) {
    var fill = cellFills[i];
    var mine = isMine(i);
    var opened = isOpened(i);
    var flagged = isFlagged(i);
    var curCls = (!state.over && !state.won && i === state.cursor) ? ' ' + CURSOR_CLS : '';
    if (state.over) {
      if (mine) {
        if (i === state.boomIdx) {
          fill.className = 'cell-fill mine boom'; // 被点雷红底突出
          fill.textContent = '💣';
        } else if (flagged) {
          fill.className = 'cell-fill mine flagged'; // 正确旗保留
          fill.textContent = '🚩';
        } else {
          fill.className = 'cell-fill mine'; // 全部雷展示
          fill.textContent = '💣';
        }
      } else if (opened) {
        paintOpened(fill, i);
      } else if (flagged) {
        fill.className = 'cell-fill wrong'; // 错旗显示 ✗
        fill.textContent = '✗';
      } else {
        fill.className = 'cell-fill';
        fill.textContent = '';
      }
      return;
    }
    if (state.won) {
      if (mine) {
        fill.className = 'cell-fill mine flagged';
        fill.textContent = '🚩';
      } else if (opened) {
        paintOpened(fill, i);
      } else {
        fill.className = 'cell-fill';
        fill.textContent = '';
      }
      return;
    }
    if (opened) {
      paintOpened(fill, i);
    } else if (flagged) {
      fill.className = 'cell-fill flagged';
      fill.textContent = '🚩';
    } else {
      fill.className = 'cell-fill' + curCls;
      fill.textContent = '';
    }
  }

  function fmtLed(n) {
    var abs = n < 0 ? -n : n;
    var body;
    if (abs >= 100) { body = '' + abs; }
    else if (abs >= 10) { body = '0' + abs; }
    else { body = '00' + abs; }
    return (n < 0 ? '-' : '') + body;
  }
  function updateInfo() {
    if (ledMinesEl) { ledMinesEl.textContent = fmtLed(state.mines - state.flagged.length); }
    if (ledTimeEl) { ledTimeEl.textContent = fmtLed(state.time); }
    if (faceEl) {
      if (state.over) { faceEl.textContent = '😵'; }
      else if (state.won) { faceEl.textContent = '😎'; }
      else { faceEl.textContent = '🙂'; }
    }
    var bv = store.best[state.bestKey] || 0;
    if (bestValEl) { bestValEl.textContent = bv > 0 ? bv + 's' : '—'; }
  }
  function diffLabel() {
    for (var i = 0; i < DIFFS.length; i++) {
      if (DIFFS[i].key === state.bestKey) { return DIFFS[i].label; }
    }
    return '初级';
  }
  function updateHint() {
    if (hintEl) {
      var modeTxt = state.flagMode ? '标旗模式(点未翻开格插旗)' : '翻开模式(点未翻开格翻开)';
      var scrollTxt = (state.cols * (MIN_CELL)) > 358 ? ' · 左右滑动看全棋盘' : '';
      hintEl.textContent = modeTxt + ' · 长按同样可插旗' + scrollTxt +
        '（当前：' + diffLabel() + '）';
    }
  }

  function renderFooter() {
    clearNode(footerEl);
    var streak = store.checkin && store.checkin.streak ? store.checkin.streak : 0;
    var txt;
    if (isSelfLocked()) {
      txt = '🌟 今天已经很自律啦 · 连续自律 ' + (store.selfStreak || 0) + ' 天';
    } else if (streak > 0) {
      txt = '完成一局点亮今日 · 已连续打卡 ' + streak + ' 天';
    } else {
      txt = '赢一局点亮今日打卡 · 挑战本难度最佳用时';
    }
    footerEl.appendChild(makeEl('span', 'footer-checkin', txt));
  }

  /* ---------- 防沉迷设置条（docs/通用需求-防沉迷自控力.md） ---------- */
  function guardMinLabel() { return '⏱ ' + store.guard.minutePref + ' 分钟'; }
  function guardGamesLabel() {
    var g = store.guard.gamesPref;
    return '今日' + (g > 0 ? g + ' 局' : '不限');
  }
  /* ---------- 输入模式：翻开 / 标旗（触屏稳定标旗入口） ---------- */
  function setFlagMode(on) {
    state.flagMode = on;
    store.flagMode = on;
    saveStore();
    renderModeBar();
    updateHint();
  }
  function renderModeBar() {
    if (!modeBtnReveal || !modeBtnFlag) { return; }
    if (state.flagMode) {
      modeBtnReveal.className = 'mode-btn';
      modeBtnFlag.className = 'mode-btn active';
    } else {
      modeBtnReveal.className = 'mode-btn active';
      modeBtnFlag.className = 'mode-btn';
    }
  }
  function renderGuardBar() {
    clearNode(guardBarEl);
    guardMinEl = makeEl('button', 'guard-btn', guardMinLabel());
    guardMinEl.setAttribute('aria-label', '设置本局时长');
    var minPicker = makeEl('div', 'guard-picker');
    minPicker.style.display = 'none';
    var mins = [5, 10, 15];
    for (var i = 0; i < mins.length; i++) {
      (function (m) {
        var b = makeEl('button', 'guard-opt' + (store.guard.minutePref === m ? ' active' : ''),
          m + ' 分钟');
        b.addEventListener('click', function () {
          store.guard.minutePref = m;
          saveStore();
          renderGuardBar();
        });
        minPicker.appendChild(b);
      })(mins[i]);
    }
    guardMinEl.addEventListener('click', function () {
      var show = minPicker.style.display === 'none';
      gamesPicker.style.display = 'none';
      minPicker.style.display = show ? 'block' : 'none';
    });
    minPicker.appendChild(makeEl('div', 'guard-note', '单局时长上限，到点提醒'));

    guardGamesEl = makeEl('button', 'guard-btn', guardGamesLabel());
    guardGamesEl.setAttribute('aria-label', '设置今日局数上限');
    var gamesPicker = makeEl('div', 'guard-picker');
    gamesPicker.style.display = 'none';
    var games = [3, 5, 10, 0];
    for (var j = 0; j < games.length; j++) {
      (function (g) {
        var b = makeEl('button', 'guard-opt' + (store.guard.gamesPref === g ? ' active' : ''),
          g > 0 ? g + ' 局' : '不限');
        b.addEventListener('click', function () {
          store.guard.gamesPref = g;
          saveStore();
          renderGuardBar();
        });
        gamesPicker.appendChild(b);
      })(games[j]);
    }
    guardGamesEl.addEventListener('click', function () {
      var show = gamesPicker.style.display === 'none';
      minPicker.style.display = 'none';
      gamesPicker.style.display = show ? 'block' : 'none';
    });
    gamesPicker.appendChild(makeEl('div', 'guard-note', '今日有效局数上限，赢满即提醒'));

    var selfBtn = makeEl('button', 'guard-btn guard-self-btn',
      isSelfLocked() ? '🌟 已自律' : '🙌 我很自律，今天足够了');
    selfBtn.setAttribute('aria-label', '今天到此为止');
    selfBtn.addEventListener('click', function () {
      if (isSelfLocked()) {
        showOverlay('🌟 今天已经很自律啦', '明天见，更棒的推理小能手', '今日已结束',
          [{ cls: 'guard-line', text: '连续自律 ' + (store.selfStreak || 0) + ' 天' }],
          [{ text: '明天见', cls: 'btn-main', act: hideOverlay }]);
        return;
      }
      doSelfDiscipline();
    });

    guardBarEl.appendChild(guardMinEl);
    guardBarEl.appendChild(guardGamesEl);
    guardBarEl.appendChild(selfBtn);
    guardBarEl.appendChild(minPicker);
    guardBarEl.appendChild(gamesPicker);
  }

  function renderView() {
    clearNode(viewEl);
    // 顶部：标题
    var top = makeEl('div', 'game-top');
    var titleBox = makeEl('div', 'game-title');
    titleBox.appendChild(makeEl('h1', null, '扫雷'));
    titleBox.appendChild(makeEl('div', 'sub', '经典怀旧 · 逻辑推理'));
    top.appendChild(titleBox);
    viewEl.appendChild(top);
    // 难度 tab
    tabsEl = makeEl('div', 'tabs');
    viewEl.appendChild(tabsEl);
    renderTabs();
    // 信息条：剩余雷 | 表情 | 计时（黑底红字 LED）
    var infoBar = makeEl('div', 'info-bar');
    ledMinesEl = makeEl('div', 'led-num', '000');
    var minesBox = makeEl('div', 'led');
    minesBox.appendChild(ledMinesEl);
    faceEl = makeEl('button', 'face-btn', '🙂');
    faceEl.setAttribute('aria-label', '重新开始');
    faceEl.addEventListener('click', function () { newGame(state.bestKey); });
    ledTimeEl = makeEl('div', 'led-num', '000');
    var timeBox = makeEl('div', 'led');
    timeBox.appendChild(ledTimeEl);
    infoBar.appendChild(minesBox);
    infoBar.appendChild(faceEl);
    infoBar.appendChild(timeBox);
    viewEl.appendChild(infoBar);
    // 防沉迷设置条（对齐通用需求-防沉迷自控力.md）
    guardBarEl = makeEl('div', 'guard-bar');
    viewEl.appendChild(guardBarEl);
    renderGuardBar();
    // 输入模式条：翻开模式 / 标旗模式（触屏长按标旗的稳定入口）
    modeBarEl = makeEl('div', 'mode-bar');
    modeBtnReveal = makeEl('button', 'mode-btn', '👆 翻开');
    modeBtnReveal.setAttribute('aria-label', '翻开模式：单击翻开格子');
    modeBtnReveal.addEventListener('click', function () { setFlagMode(false); });
    modeBtnFlag = makeEl('button', 'mode-btn', '🚩 标旗');
    modeBtnFlag.setAttribute('aria-label', '标旗模式：单击插旗');
    modeBtnFlag.addEventListener('click', function () { setFlagMode(true); });
    modeBarEl.appendChild(modeBtnReveal);
    modeBarEl.appendChild(modeBtnFlag);
    viewEl.appendChild(modeBarEl);
    renderModeBar();
    // 本难度最佳
    var bestPanel = makeEl('div', 'best-panel');
    bestPanel.appendChild(makeEl('span', 'best-label', '本难度最佳：'));
    bestValEl = makeEl('span', 'best-val', '—');
    bestPanel.appendChild(bestValEl);
    viewEl.appendChild(bestPanel);
    // 棋盘（横向滚动容器，高级/中级手机可横滑）
    boardScrollEl = makeEl('div', 'board-scroll');
    boardEl = makeEl('div', 'board');
    boardScrollEl.appendChild(boardEl);
    viewEl.appendChild(boardScrollEl);
    // 提示条
    hintEl = makeEl('div', 'hint', '');
    viewEl.appendChild(hintEl);
    updateHint();
  }

  /* ---------- 结算弹层 ---------- */
  function hideOverlay() {
    if (overlayEl && overlayEl.parentNode) {
      overlayEl.parentNode.removeChild(overlayEl);
    }
    overlayEl = null;
  }
  function showOverlay(title, sub, scoreText, noteLines, btns) {
    hideOverlay();
    var ov = makeEl('div', 'overlay');
    var card = makeEl('div', 'overlay-card');
    card.appendChild(makeEl('div', 'overlay-title', title));
    if (sub) { card.appendChild(makeEl('div', 'overlay-sub', sub)); }
    var sum = makeEl('div', 'summary');
    sum.appendChild(makeEl('div', 'score-label', '本次用时'));
    sum.appendChild(makeEl('div', 'score-num', scoreText));
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
    var bv = store.best[state.bestKey] || 0;
    var notes = [];
    if (isRec) { notes.push({ cls: 'best-line new-rec', text: '🏆 新纪录！' }); }
    else { notes.push({ cls: 'best-line', text: '本难度最佳 ' + bv + 's' }); }
    var streak = store.checkin && store.checkin.streak ? store.checkin.streak : 0;
    notes.push({
      cls: 'checkin-line',
      text: streak > 0 ? '✅ 今日已打卡 · 连续 ' + streak + ' 天' : '✅ 今日已打卡'
    });
    notes = notes.concat(guardSettleNotes());
    showOverlay('🎉 全部排雷！', '逻辑推理大师就是你～', state.time + 's', notes, guardSettleBtns());
  }
  function openLose() {
    var bv = store.best[state.bestKey] || 0;
    var notes = [{ cls: 'best-line', text: bv > 0 ? '本难度最佳 ' + bv + 's' : '本难度最佳 —' }];
    notes = notes.concat(guardSettleNotes());
    showOverlay('💥 踩到雷了！', '再来一局，推理更稳～', state.time + 's', notes, guardSettleBtns());
  }

  /* ---------- 结算三选（再来/分享/自律；局数到点自动转延迟） ---------- */
  function guardSettleNotes() {
    var notes = [];
    var g = store.guard.gamesPref;
    if (g > 0 && store.guard.playedToday >= guardGamesLimit()) {
      notes.push({
        cls: 'guard-line',
        text: '⏳ 今日已完成 ' + store.guard.playedToday + ' / ' + guardGamesLimit() + ' 局'
      });
    }
    return notes;
  }
  function guardSettleBtns() {
    var btns = [];
    var leftG = DELAY_LIMIT - store.guard.delayGamesTimes;
    if (guardReachedGames()) {
      if (leftG > 0) {
        btns.push({
          text: '延迟 +' + DELAY_GAMES + ' 局（剩 ' + leftG + ' 次）', cls: 'btn-main',
          act: function () {
            store.guard.delayGamesTimes++;
            saveStore();
            newGame(state.bestKey);
          }
        });
      }
      // 局数已满且无延迟额度 → 不提供再来一局，仅分享/自律
    } else {
      btns.push({ text: '再来一局', cls: 'btn-main', act: function () { newGame(state.bestKey); } });
    }
    btns.push({ text: '分享打卡', cls: 'btn-ghost', act: openShare });
    btns.push({ text: '我很自律，今天足够了', cls: 'btn-self', act: doSelfDiscipline });
    return btns;
  }

  /* ---------- 分享卡片（1080×1920，canvas 绘制，对齐通用需求 §2.3/§5.3） ---------- */
  function shareText() {
    var streak = store.checkin && store.checkin.streak ? store.checkin.streak : 0;
    var best = store.best[state.bestKey] || 0;
    var selfS = store.selfStreak || 0;
    return '孩子玩扫雷【' + diffLabel() + '】只用 ' + state.time + ' 秒排完所有地雷' +
      (best > 0 ? '，本难度最佳 ' + best + ' 秒' : '') +
      '，已连续打卡 ' + streak + ' 天' +
      (selfS > 0 ? '，连续自律 ' + selfS + ' 天' : '') +
      '！逻辑推理又进步啦～#扫雷 #小学生逻辑 #自控力';
  }
  function drawShareCard() {
    var W = 1080, H = 1920;
    var cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    var ctx = cv.getContext('2d');
    // 背景：暖色纵向渐变
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#fff7e8');
    grad.addColorStop(1, '#ffe6c7');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // 顶部装饰点
    ctx.fillStyle = 'rgba(255, 210, 140, 0.5)';
    for (var i = 0; i < 24; i++) {
      var rx = Math.random() * W;
      var ry = Math.random() * H * 0.55;
      ctx.beginPath();
      ctx.arc(rx, ry, 6 + Math.random() * 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 标题
    ctx.fillStyle = '#4a5865';
    ctx.font = 'bold 88px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('扫 雷', W / 2, 300);
    ctx.fillStyle = '#8b97a5';
    ctx.font = '40px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('逻辑推理小达人', W / 2, 400);
    // 战绩卡片
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(110, 520, W - 220, 780);
    ctx.strokeStyle = '#f0d9b0';
    ctx.lineWidth = 4;
    ctx.strokeRect(110, 520, W - 220, 780);
    ctx.fillStyle = '#5b7c99';
    ctx.font = 'bold 58px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(diffLabel() + '难度 · 用时 ' + state.time + ' 秒', W / 2, 650);
    ctx.fillStyle = '#e08a2e';
    ctx.font = 'bold 120px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(state.time + 's', W / 2, 820);
    ctx.fillStyle = '#8b97a5';
    ctx.font = '44px "PingFang SC","Microsoft YaHei",sans-serif';
    var lines = [];
    lines.push('本难度最佳：' + ((store.best[state.bestKey] || 0) > 0 ? store.best[state.bestKey] + ' 秒' : '—'));
    lines.push('连续打卡：' + ((store.checkin && store.checkin.streak) || 0) + ' 天');
    lines.push('连续自律：' + (store.selfStreak || 0) + ' 天');
    for (var k = 0; k < lines.length; k++) {
      ctx.fillText(lines[k], W / 2, 980 + k * 80);
    }
    // 底部鼓励语
    ctx.fillStyle = '#4a5865';
    ctx.font = '56px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('每个数字，都在教我思考', W / 2, 1500);
    ctx.fillStyle = '#a9b4c0';
    ctx.font = '36px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('龙爸乐学 · 扫雷小工具', W / 2, 1720);
    ctx.fillText(fmtToday(), W / 2, 1790);
    return cv;
  }
  var shareOpen = false;
  function openShare() {
    if (shareOpen) { return; }
    shareOpen = true;
    hideOverlay();
    var cv = drawShareCard();
    var img = document.createElement('img');
    img.className = 'share-img';
    img.setAttribute('alt', '扫雷成绩打卡卡片');
    img.src = cv.toDataURL('image/png');
    var cardWrap = makeEl('div', 'share-card-wrap');
    cardWrap.appendChild(img);
    var hint = makeEl('div', 'share-hint', '📸 长按保存图片 · 发布笔记分享成就');
    var btnCopy = makeEl('button', 'btn-main', '复制分享文案');
    btnCopy.addEventListener('click', function () { copyShareText(); });
    var btnBack = makeEl('button', 'btn-ghost', '返回结算');
    btnBack.addEventListener('click', function () {
      shareOpen = false;
      if (state.won) { openWin(); } else { openLose(); }
    });
    var btnsBox = makeEl('div', 'share-btns');
    btnsBox.appendChild(btnCopy);
    btnsBox.appendChild(btnBack);
    var ov = makeEl('div', 'overlay');
    var card = makeEl('div', 'overlay-card share-card');
    card.appendChild(makeEl('div', 'overlay-title', '📷 分享打卡'));
    card.appendChild(cardWrap);
    card.appendChild(hint);
    card.appendChild(btnsBox);
    ov.appendChild(card);
    document.body.appendChild(ov);
    overlayEl = ov;
  }
  function copyShareText() {
    var text = shareText();
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    document.body.removeChild(ta);
    if (ok) {
      toast('✅ 文案已复制，去小红书粘贴发布吧');
    } else {
      toast('📋 文案如下，请长按选择复制：' + text);
    }
  }
  function toast(msg) {
    var t = makeEl('div', 'toast', msg);
    document.body.appendChild(t);
    setTimeout(function () {
      if (t.parentNode) { t.parentNode.removeChild(t); }
    }, 2600);
  }

  /* ---------- 新局 / 难度切换 / 恢复 ---------- */
  function diffOf(key) {
    for (var i = 0; i < DIFFS.length; i++) {
      if (DIFFS[i].key === key) { return DIFFS[i]; }
    }
    return DIFFS[0];
  }
  function diffOfSize(cols, rows) {
    for (var i = 0; i < DIFFS.length; i++) {
      if (DIFFS[i].cols === cols && DIFFS[i].rows === rows) { return DIFFS[i]; }
    }
    return null;
  }
  function newGame(key) {
    if (isSelfLocked()) {
      // 自律锁：渲染一块空棋盘作背景（已锁输入），弹明日见
      stopTimer();
      state.over = false;
      state.won = false;
      state.revealed = false;
      state.time = 0;
      state.layout = [];
      state.opened = [];
      state.flagged = [];
      state.boomIdx = -1;
      hideOverlay();
      renderBoard();
      paintBoard();
      updateInfo();
      updateHint();
      showOverlay('🌟 今天已经很自律啦', '明天见，更棒的推理小能手', '今日已结束',
        [{ cls: 'guard-line', text: store.selfStreak > 0 ? '连续自律 ' + store.selfStreak + ' 天' : '今日自律成就 +1' }],
        [{ text: '明天见', cls: 'btn-main', act: function () {
          hideOverlay();
          renderFooter();
          renderGuardBar();
        } }]);
      return;
    }
    refreshGuardDay();
    var d = diffOf(key);
    stopTimer();
    state.cols = d.cols;
    state.rows = d.rows;
    state.mines = d.mines;
    state.layout = [];
    state.opened = [];
    state.flagged = [];
    state.revealed = false;
    state.over = false;
    state.won = false;
    state.time = 0;
    state.timerId = null;
    state.firstTouch = null;
    state.startedAt = 0;
    state.guardPaused = false;
    state.guardWarned = false;
    state.boomIdx = -1;
    state.newRec = false;
    state.cursor = -1;     // 键盘光标随新局复位
    state.bestKey = d.key;
    store.cur = null; // 清当前局（存盘）
    saveStore();
    hideOverlay();
    renderTabsState();
    renderBoard();
    paintBoard();
    updateInfo();
    updateHint();
    renderGuardBar();
    renderModeBar();
  }
  function setDifficulty(key) {
    if (isSelfLocked()) {
      newGame(key); // 自律锁：newGame 内弹明日见
      return;
    }
    newGame(key); // 点击任意 tab 即开对应难度新局
  }
  function sanitizeIdxs(arr, total) {
    var out = [];
    var seen = {};
    for (var i = 0; i < arr.length; i++) {
      var v = arr[i];
      if (typeof v === 'number' && v >= 0 && v < total && !seen[v]) {
        seen[v] = 1;
        out.push(v);
      }
    }
    return out;
  }
  function isValidCur(cur) {
    return cur
      && typeof cur.cols === 'number' && cur.cols >= 2
      && typeof cur.rows === 'number' && cur.rows >= 2
      && typeof cur.mines === 'number' && cur.mines >= 0
      && Array.isArray(cur.layout)
      && cur.layout.length <= cur.cols * cur.rows   // layout = 雷索引数组（长度≤总格数）
      && Array.isArray(cur.opened)
      && Array.isArray(cur.flagged)
      && !cur.over
      && !cur.won;
  }
  function restoreGame() {
    var cur = store.cur;
    if (cur && isValidCur(cur)) {
      var total = cur.cols * cur.rows;
      var d = diffOfSize(cur.cols, cur.rows);
      state.cols = cur.cols;
      state.rows = cur.rows;
      state.mines = cur.mines;
      state.layout = sanitizeIdxs(cur.layout, total);
      state.opened = sanitizeIdxs(cur.opened, total);
      state.flagged = sanitizeIdxs(cur.flagged, total);
      state.revealed = !!cur.revealed;
      state.over = false;
      state.won = false;
      state.time = typeof cur.time === 'number' && cur.time >= 0 ? cur.time : 0;
      state.startedAt = typeof cur.startedAt === 'number' ? cur.startedAt : 0;
      state.timerId = null;
      state.firstTouch = null;
      state.guardPaused = false;
      state.guardWarned = false;
      state.boomIdx = -1;
      state.newRec = false;
      state.cursor = -1;   // 恢复局键盘光标复位
      state.bestKey = d ? d.key : 'easy';
      if (state.revealed && cur.started) { startTimer(); } // 计时按 started 续走
      renderTabsState();
      renderBoard();
      paintBoard();
      updateInfo();
      updateHint();
    } else {
      store.cur = null;
      newGame('easy');
    }
  }

  /* ---------- 输入 ---------- */
  var touchStartPos = { x: 0, y: 0, id: -1 };
  var longPressTimer = null;
  var longPressFired = false;
  var suppressClick = false;

  function cellAtPx(x, y, bw) {
    var px = x / bw * 100;
    var py = y / bw * 100; // 布局坐标均相对宽度（棋盘高按行数比例）
    var cw = cellPct();
    var c = Math.floor((px - GAP) / (cw + GAP));
    var r = Math.floor((py - GAP) / (cw + GAP));
    if (c < 0 || c >= state.cols || r < 0 || r >= state.rows) { return -1; }
    return r * state.cols + c;
  }
  function cellIndexAt(e) {
    var rect = boardEl.getBoundingClientRect();
    return cellAtPx(e.clientX - rect.left, e.clientY - rect.top, rect.width);
  }

  function onBoardClick(e) {
    if (e.button !== undefined && e.button !== 0) { return; }
    if (suppressClick) { suppressClick = false; return; } // 长按标旗后屏蔽合成点击
    var idx = cellIndexAt(e);
    if (idx < 0) { return; }
    ensureAudio();
    if (isOpened(idx)) {
      chord(idx); // 已翻开：chord
    } else if (state.flagMode) {
      toggleFlag(idx); // 标旗模式：单击未翻开格=插旗
    } else {
      revealCell(idx);
    }
  }
  function onBoardMouseDown(e) {
    if (e.button === 2) { e.preventDefault(); }
  }
  function onBoardContextMenu(e) {
    e.preventDefault();
    if (e.button === 2) {
      var idx = cellIndexAt(e);
      if (idx >= 0) { toggleFlag(idx); }
    }
  }
  function onTouchStart(e) {
    var t = e.touches && e.touches[0];
    if (!t) { return; }
    suppressClick = false;
    touchStartPos.x = t.clientX;
    touchStartPos.y = t.clientY;
    touchStartPos.id = t.identifier;
    longPressFired = false;
    clearLongPress();
    var sx = t.clientX;
    var sy = t.clientY;
    longPressTimer = setTimeout(function () {
      longPressTimer = null;
      longPressFired = true;
      var rect = boardEl.getBoundingClientRect();
      var idx = cellAtPx(sx - rect.left, sy - rect.top, rect.width);
      if (idx >= 0) { toggleFlag(idx); }
    }, 350);
  }
  function onTouchMove(e) {
    if (e.cancelable) { e.preventDefault(); }
    var t = e.touches && e.touches[0];
    if (!t || t.identifier !== touchStartPos.id) { return; }
    var dx = t.clientX - touchStartPos.x;
    var dy = t.clientY - touchStartPos.y;
    if (Math.sqrt(dx * dx + dy * dy) > 12) { clearLongPress(); } // 移动 12px 取消
  }
  function onTouchEnd(e) {
    clearLongPress();
    if (longPressFired) {
      longPressFired = false;
      suppressClick = true;
    }
  }
  function onTouchCancel(e) {
    clearLongPress();
    longPressFired = false;
  }
  function clearLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  /* ---------- 键盘光标（经典 Windows 扫雷：方向键/回车/空格/F） ---------- */
  function setCursor(i) {
    state.cursor = i;
    paintBoard();
  }
  function onKeyDown(e) {
    if (overlayEl) { return; } // 弹层打开时不响应棋盘键盘
    var kc = e.keyCode || e.which;
    var moved = false;
    // 方向键移动光标
    if (kc === 37 || kc === 38 || kc === 39 || kc === 40) {
      if (state.cursor < 0) {
        state.cursor = 0;
        moved = true;
      } else {
        var r = Math.floor(state.cursor / state.cols);
        var c = state.cursor % state.cols;
        var nr = r, nc = c;
        if (kc === 37) { nc = c > 0 ? c - 1 : c; }
        else if (kc === 39) { nc = c < state.cols - 1 ? c + 1 : c; }
        else if (kc === 38) { nr = r > 0 ? r - 1 : r; }
        else if (kc === 40) { nr = r < state.rows - 1 ? r + 1 : r; }
        if (nr !== r || nc !== c) {
          state.cursor = nr * state.cols + nc;
          moved = true;
        }
      }
      if (moved) { paintBoard(); }
      e.preventDefault();
      return;
    }
    // 回车/空格：翻开光标格（已翻开则 chord）；F/Shift+空格：标旗
    var isEnter = (kc === 13);
    var isSpace = (kc === 32);
    var isF = (kc === 70);
    if (isEnter || isSpace || isF) {
      if (state.cursor < 0 || state.over || state.won || isSelfLocked() || state.guardPaused) { return; }
      e.preventDefault();
      state.flagMode = false; // 键盘翻开优先：临时退出标旗模式
      renderModeBar();
      updateHint();
      var idx = state.cursor;
      ensureAudio();
      if (isF || (isSpace && e.shiftKey)) { toggleFlag(idx); return; }
      if (isOpened(idx)) { chord(idx); } else { revealCell(idx); }
    }
  }

  /* ---------- 启动 ---------- */
  function syncAppHeight() {
    var docEl = document.documentElement;
    var vh = window.innerHeight || docEl.clientHeight;
    docEl.style.setProperty('--app-height', vh + 'px');
  }
  function onResize() {
    syncAppHeight();
    if (boardEl && state) {
      renderBoard();  // 重算棋盘宽度（最小格子 14px）与字号
      paintBoard();
    }
  }
  function init() {
    refreshGuardDay(); // 防沉迷：跨日重置计数
    state.flagMode = !!store.flagMode; // 恢复输入模式选择
    renderHeader();
    renderView();
    restoreGame();
    renderFooter();
    window.addEventListener('keydown', onKeyDown);
    boardEl.addEventListener('click', onBoardClick);
    boardEl.addEventListener('mousedown', onBoardMouseDown);
    boardEl.addEventListener('contextmenu', onBoardContextMenu);
    boardEl.addEventListener('touchstart', onTouchStart, { passive: true });
    boardEl.addEventListener('touchend', onTouchEnd, { passive: true });
    boardEl.addEventListener('touchmove', onTouchMove, { passive: false });
    boardEl.addEventListener('touchcancel', onTouchCancel, { passive: true });
  }

  if (window.addEventListener) {
    window.addEventListener('resize', onResize);
  }
  syncAppHeight();
  init();
})();