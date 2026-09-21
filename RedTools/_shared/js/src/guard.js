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