/* ============================================================
   贪吃蛇 — core：命名空间 / 工具函数 / 常量 / 存储与防沉迷数据层
   依赖：无（最先加载，data.js 之后）。
   挂载：window.SnakeApp.core
   Chrome 61 基线：var + function，无 let/const/class/箭头函数/模板字符串/?./??
   ============================================================ */
(function () {
  'use strict';
  window.SnakeApp = window.SnakeApp || {};

  /* ---------- 常量 ---------- */
  var SIZE = 17;                     // 棋盘 17×17
  var GAP = 1.2;                     // 格子间距（%）
  var TARGET = 20;                   // 单局目标食物数（吃满即胜利）
  var STORE_KEY = 'redtools.snake.v1';
  var TRIAL_SEC = 10;                // 试错局豁免阈值（<10s 失败不计今日局数）
  var DELAY_LIMIT = 2;               // 每类延迟上限
  var DELAY_MINUTES = 5;             // 延迟：局内 +5 分钟
  var DELAY_GAMES = 2;               // 延迟：今日局数 +2
  var GUARD_MINUTES = [5, 10, 15];   // 单局时长档位
  var GUARD_GAMES = [3, 5, 10, 0];   // 今日局数档位（0=不限）
  var SPEEDS = [                     // 速度三档
    { key: 'slow',   label: '慢速', ms: 200 },
    { key: 'medium', label: '中速', ms: 150 },
    { key: 'fast',   label: '快速', ms: 100 }
  ];
  var MIN_MS = 60;                   // 提速下限
  var SPEED_STEP = 5;                // 每吃 5 个食物提速一档
  var SPEED_RATE = 0.94;             // 每档提速 -6%

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
  function fmtToday() { return fmtDate(new Date()); }
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

  /* ---------- 存储（redtools.snake.v1） ---------- */
  function defaultStore() {
    return {
      version: 2,
      best: { slow: 0, medium: 0, fast: 0 },
      games: 0, wins: 0,
      checkin: { dates: [], streak: 0 },
      guard: {
        minutePref: 5, gamesPref: 5,
        today: '', playedToday: 0,
        delayMinTimes: 0, delayGamesTimes: 0
      },
      selfDaily: [], selfStreak: 0,   // 自律天数（对齐通用需求 §4）
      cur: null
    };
  }
  function defaultGuard() { return defaultStore().guard; }
  function pickBest(v) { return (typeof v === 'number' && v > 0) ? v : 0; }
  function normalizeStore(s) {
    var out = defaultStore();
    if (!s) { return out; }
    if (s.checkin && s.checkin.dates) {
      out.checkin.dates = s.checkin.dates.slice();
      if (typeof s.checkin.streak === 'number') { out.checkin.streak = s.checkin.streak; }
    }
    if (s.best && typeof s.best === 'object') {
      out.best.slow = pickBest(s.best.slow);
      out.best.medium = pickBest(s.best.medium);
      out.best.fast = pickBest(s.best.fast);
    } else if (typeof s.best === 'number') { // 旧版单一 best 迁移
      out.best.slow = pickBest(s.best);
      out.best.medium = pickBest(s.best);
      out.best.fast = pickBest(s.best);
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
  var store = loadStore();
  function saveStore() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (err) { /* ignore */ }
  }
  saveStore(); // 初始化归一化写入

  /* ---------- 防沉迷数据层（docs/通用需求-防沉迷自控力.md §4） ---------- */
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
  function isSelfLocked() { return store.selfDaily.indexOf(fmtToday()) >= 0; }
  function guardMinuteLimit() {
    // 本局时长上限（分钟）= 档位 + 已延迟次数×5
    return store.guard.minutePref + store.guard.delayMinTimes * DELAY_MINUTES;
  }
  function guardGamesLimit() {
    // 今日局数上限 = 档位(0=不限) + 已延迟次数×2
    var base = store.guard.gamesPref;
    if (!base) { return 0; }
    return base + store.guard.delayGamesTimes * DELAY_GAMES;
  }
  function guardReachedGames() {
    var limit = guardGamesLimit();
    return limit > 0 && store.guard.playedToday >= limit;
  }
  function countPlayed(state) {
    // 试错局豁免：失败且 <10s 不计；胜利或用时 ≥10s → +1
    var spent = state.startedAt ? (Date.now() - state.startedAt) / 1000 : 999;
    if (state.won || spent >= TRIAL_SEC) {
      store.guard.playedToday = (store.guard.playedToday || 0) + 1;
    }
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
  function speedOf(key) {
    for (var i = 0; i < SPEEDS.length; i++) {
      if (SPEEDS[i].key === key) { return SPEEDS[i]; }
    }
    return SPEEDS[1]; // 默认中速
  }

  /* ---------- 挂载 ---------- */
  window.SnakeApp.core = {
    SIZE: SIZE, GAP: GAP, TARGET: TARGET, STORE_KEY: STORE_KEY,
    TRIAL_SEC: TRIAL_SEC, DELAY_LIMIT: DELAY_LIMIT,
    DELAY_MINUTES: DELAY_MINUTES, DELAY_GAMES: DELAY_GAMES,
    GUARD_MINUTES: GUARD_MINUTES, GUARD_GAMES: GUARD_GAMES,
    SPEEDS: SPEEDS, MIN_MS: MIN_MS, SPEED_STEP: SPEED_STEP, SPEED_RATE: SPEED_RATE,
    clearNode: clearNode, makeEl: makeEl,
    fmtDate: fmtDate, fmtToday: fmtToday, calcStreak: calcStreak,
    store: store, saveStore: saveStore, normalizeStore: normalizeStore,
    refreshGuardDay: refreshGuardDay, isSelfLocked: isSelfLocked,
    guardMinuteLimit: guardMinuteLimit, guardGamesLimit: guardGamesLimit,
    guardReachedGames: guardReachedGames, countPlayed: countPlayed,
    doCheckin: doCheckin, speedOf: speedOf
  };
})();
