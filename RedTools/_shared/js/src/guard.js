/* ============================================================
   LX_SHARED.guard — 防沉迷/自控力（通用能力）V0.5 补齐
   ------------------------------------------------------------
   依据：docs/通用需求-防沉迷自控力.md（契约 §2/§4，设计已定稿）
   V0.5（2026-09-26，Oracle v0.1 审 0B/3I/多N → v0.2 定稿）：
   - schema 对齐 §4：store.guard = { minutePref, gamesPref, today,
     playedToday, delayMinTimes, delayGamesTimes }（固定字段名，无 keySelf I-3）
     + 顶层 store.selfDaily / selfStreak / selfLocked（自律，跨日以 selfDaily 为准 N-1）
   - 新增 8 API：setPrefs / startRound / addPlayed / checkDue / extend /
     enough / isLocked / streak
   - 旧 4 API（check/addMinutes/addRound/getSession）保留 + @deprecated（0 消费 N-8）
   - Oracle 关键修订落实：
     I-1 addPlayed 增 count 参数（题量/局数计数，非每次 +1）
     I-2 curStartedAt 归工具（调用方传 startedAt，guard 不持久化局状态）
     I-3 固定顶层 self 字段；N-4 setPrefs 不重置计数；N-6 enough(cfg) 统一内部 todayStr()
   - 能力定位：纯「状态判定 + 计数」库，不持 DOM/计时器——对局计时由调用方
     （各工具已有 state/计时器）传入 checkDue(elapsedMs)；guard 只做契约判定
   - ES2017 经典脚本；Chrome 61 兼容
   ============================================================ */
(function () {
  'use strict';

  var G = {};
  var DEFAULT_GUARD_KEY = 'guard';
  var MIN_SEC = 10;                        // 试错豁免阈值（<10s 失败不计今日）
  var MINUTE_MS = 60000;
  var EXTEND_MIN = 5;                      // 延迟：时长 +5 分钟
  var EXTEND_GAMES = 2;                    // 延迟：题量/局数 +2
  var DELAY_CAP = 2;                       // 每类延迟上限 2 次（契约 §2.2）
  var VALID_MINUTES = [5, 10, 15];
  /* games 档位不硬编码：经典游戏 3/5/10/0、学科题量 10/20/30/0 均为业务档，
     setPrefs 接受任意非负整数（0=不限）——钳制交由调用方 UI 档位数组（Oracle v0.2 I-1 同源修订） */

  /* ---------- 日期工具（对齐 progress.js 同构） ---------- */
  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtDate(d) {
    return '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
  }
  function todayStr() { return fmtDate(new Date()); }

  /* ---------- guard 对象读写（schema §4） ---------- */
  function ensureGuard(cfg) {
    var store = cfg && cfg.store;
    if (!store) { return null; }
    var key = (cfg && cfg.guardKey) || DEFAULT_GUARD_KEY;
    var g = store[key];
    if (!g || typeof g !== 'object') {
      g = { minutePref: 5, gamesPref: 5, today: '', playedToday: 0, delayMinTimes: 0, delayGamesTimes: 0 };
      store[key] = g;
    }
    // 缺字段兜底（旧数据 / 部分写入）
    if (typeof g.minutePref !== 'number') { g.minutePref = 5; }
    if (typeof g.gamesPref !== 'number') { g.gamesPref = 5; }
    if (typeof g.today !== 'string') { g.today = ''; }
    if (typeof g.playedToday !== 'number') { g.playedToday = 0; }
    if (typeof g.delayMinTimes !== 'number') { g.delayMinTimes = 0; }
    if (typeof g.delayGamesTimes !== 'number') { g.delayGamesTimes = 0; }
    return g;
  }
  function ensureSelf(store) {
    if (!store) { return; }
    if (!Array.isArray(store.selfDaily)) { store.selfDaily = []; }
    if (typeof store.selfStreak !== 'number') { store.selfStreak = 0; }
    if (typeof store.selfLocked !== 'boolean') { store.selfLocked = false; }
  }
  /* 跨日重置：today 变化 → 清零今日计数与延迟次数（契约 §2.1） */
  function resetIfNewDay(g, t) {
    if (!g) { return t; }
    if (g.today !== t) {
      g.today = t;
      g.playedToday = 0;
      g.delayMinTimes = 0;
      g.delayGamesTimes = 0;
    }
    return t;
  }

  /* ---------- 连续自律天数（复用打卡 calcStreak 同构） ---------- */
  function calcStreakLike(dates) {
    if (!dates || !dates.length) { return 0; }
    var set = {};
    for (var i = 0; i < dates.length; i++) { set[dates[i]] = true; }
    var cur = new Date();
    cur.setHours(0, 0, 0, 0);
    if (!set[fmtDate(cur)]) { cur.setDate(cur.getDate() - 1); }
    var streak = 0;
    while (set[fmtDate(cur)]) {
      streak++;
      cur.setDate(cur.getDate() - 1);
    }
    return streak;
  }

  /* ============================================================
     新增 API（V0.5 完整契约）
     ============================================================ */

  /* 档位设置：仅写 minutePref/gamesPref，不重置计数（Oracle N-4）
     minute: 5|10|15（钳制）；games: 任意非负整数（0=不限；不钳制——学科/游戏档位不同，调用方 UI 把关） */
  G.setPrefs = function (cfg, opts) {
    var g = ensureGuard(cfg);
    if (!g) { return null; }
    var minute = opts && opts.minute;
    if (VALID_MINUTES.indexOf(minute) !== -1) { g.minutePref = minute; }
    var games = opts && opts.games;
    if (typeof games === 'number' && games >= 0 && Math.floor(games) === games) { g.gamesPref = games; }
    return { minutePref: g.minutePref, gamesPref: g.gamesPref };
  };

  /* 开局登记：跨日重置 + 记录 today。返回 { playedToday } 供工具展示 */
  G.startRound = function (cfg) {
    var g = ensureGuard(cfg);
    if (!g) { return null; }
    var t = resetIfNewDay(g, todayStr());
    return { playedToday: g.playedToday, today: t };
  };

  /* 结算：今日计数 += count（Oracle I-1：按题量/局数计，非每次 +1）
     opts = { ok:Boolean, count:Number, nowMs:Number, startedAt:Number }
     - 试错豁免（契约 §2.1）：!ok 且用时 <10s → 不计（供游戏类；学科类恒 ok=true 休眠 N-7）
     - 跨日兜底：结算时刻 today 已变化 → 先重置再计（防开着跨日）
     返回实际计入数（0 = 豁免不计），供调用方判断 */
  G.addPlayed = function (cfg, opts) {
    var g = ensureGuard(cfg);
    if (!g) { return 0; }
    opts = opts || {};
    var t = resetIfNewDay(g, todayStr());
    var ok = opts.ok !== false;
    var nowMs = opts.nowMs || Date.now();
    var startedAt = opts.startedAt || 0;
    if (!ok && startedAt > 0 && (nowMs - startedAt) < MIN_SEC * 1000) {
      return 0;                            // 试错豁免：<10s 失败不计
    }
    var count = (typeof opts.count === 'number' && opts.count > 0) ? opts.count : 1;
    g.playedToday += count;
    return count;
  };

  /* 到点判定：opts = { elapsedMs }（本局已用时，调用方计时器）
     返回 { due:Boolean, reason:'min'|'games'|null, 
             limitMin, limitGames, playedToday, minutePref, gamesPref }
     - min：elapsedMs >= (minutePref + delayMinTimes*EXTEND_MIN) * MINUTE_MS
     - games：gamesPref>0 且 playedToday >= gamesPref + delayGamesTimes*EXTEND_GAMES */
  G.checkDue = function (cfg, opts) {
    var g = ensureGuard(cfg);
    if (!g) { return { due: false, reason: null }; }
    var elapsedMs = (opts && opts.elapsedMs) || 0;
    var minLimitMs = (g.minutePref + g.delayMinTimes * EXTEND_MIN) * MINUTE_MS;
    var minDue = elapsedMs >= minLimitMs;
    var gamesDue = false;
    var gamesLimit = 0;
    if (g.gamesPref > 0) {
      gamesLimit = g.gamesPref + g.delayGamesTimes * EXTEND_GAMES;
      gamesDue = g.playedToday >= gamesLimit;
    }
    var reason = null;
    if (minDue || gamesDue) { reason = minDue ? 'min' : 'games'; }
    return {
      due: minDue || gamesDue,
      reason: reason,
      minutePref: g.minutePref,
      gamesPref: g.gamesPref,
      playedToday: g.playedToday,
      limitMin: g.minutePref + g.delayMinTimes * EXTEND_MIN,
      limitGames: gamesLimit,
      remainingMinutes: Math.max(0, Math.ceil((minLimitMs - elapsedMs) / MINUTE_MS)),
      remainingGames: g.gamesPref > 0 ? Math.max(0, gamesLimit - g.playedToday) : null
    };
  };

  /* 延迟：type='min' → 时长 +5 分钟；type='games' → 题量/局数 +2。
     每类计数 ≤ DELAY_CAP（达上限返回 false——到点后仅剩自律出口，契约 §2.2） */
  G.extend = function (cfg, type) {
    var g = ensureGuard(cfg);
    if (!g) { return false; }
    if (type === 'min') {
      if (g.delayMinTimes >= DELAY_CAP) { return false; }
      g.delayMinTimes++;
      return g.delayMinTimes;
    }
    if (type === 'games') {
      if (g.delayGamesTimes >= DELAY_CAP) { return false; }
      g.delayGamesTimes++;
      return g.delayGamesTimes;
    }
    return false;
  };

  /* 自律：「我很自律，今天足够了」——selfDaily 记今日 + streak 重算 + 锁今日 */
  G.enough = function (cfg) {
    var store = cfg && cfg.store;
    if (!store) { return { locked: false }; }
    ensureGuard(cfg);
    ensureSelf(store);
    var t = todayStr();
    if (store.selfDaily.indexOf(t) === -1) { store.selfDaily.push(t); }
    store.selfDaily.sort();
    while (store.selfDaily.length > 365) { store.selfDaily.shift(); }
    store.selfStreak = calcStreakLike(store.selfDaily);
    store.selfLocked = true;
    // 自律即今日主动结束：guard 计数保留（跨日自动复位），today 对齐今日
    var g = ensureGuard(cfg);
    if (g) { resetIfNewDay(g, t); }
    return { locked: true, streak: store.selfStreak, today: t };
  };

  /* 今日自律锁（以 selfDaily 为准——跨日天然不复位为锁，契约 §2.3；Oracle ISSUE-2 注：
     store.selfLocked 由 enough() 写入为状态标记，isLocked 实际读取 selfDaily 含今日，
     selfLocked 字段保留兼容契约 §4 schema，不参与判定） */
  G.isLocked = function (cfg) {
    var store = cfg && cfg.store;
    if (!store) { return false; }
    ensureSelf(store);
    return store.selfDaily.indexOf(todayStr()) !== -1;
  };

  /* 自律连续天数 */
  G.streak = function (cfg) {
    var store = cfg && cfg.store;
    if (!store) { return 0; }
    ensureSelf(store);
    return calcStreakLike(store.selfDaily);
  };

  /* ============================================================
     旧 API（V0.4 session 骨架）——保留 + @deprecated（Oracle N-8）
     0 消费方；schema 与 §4 不同（{date,minutes,rounds}），仅供历史引用
     ============================================================ */
  function getSession(store, key) {
    if (!store) { return { date: todayStr(), minutes: 0, rounds: 0 }; }
    var s = store[key];
    if (!s || s.date !== todayStr()) {
      s = { date: todayStr(), minutes: 0, rounds: 0 };
      if (store) { store[key] = s; }
    }
    return s;
  }
  /* @deprecated：V0.4 会话累计（minutes/rounds）——新契约用 playedToday/题量 */
  G.check = function (cfg) {
    if (!cfg) { return { limited: false }; }
    var s = getSession(cfg.store, cfg.key);
    var limited = false;
    if (cfg.maxMinutes && s.minutes >= cfg.maxMinutes) { limited = true; }
    if (cfg.maxRounds && s.rounds >= cfg.maxRounds) { limited = true; }
    return {
      limited: limited,
      minutes: s.minutes || 0,
      rounds: s.rounds || 0,
      remainingMinutes: cfg.maxMinutes ? Math.max(0, cfg.maxMinutes - (s.minutes || 0)) : null,
      remainingRounds: cfg.maxRounds ? Math.max(0, cfg.maxRounds - (s.rounds || 0)) : null
    };
  };
  /* @deprecated */
  G.addMinutes = function (store, key, mins) {
    var s = getSession(store, key);
    s.minutes = (s.minutes || 0) + mins;
    if (store) { store[key] = s; }
  };
  /* @deprecated */
  G.addRound = function (store, key) {
    var s = getSession(store, key);
    s.rounds = (s.rounds || 0) + 1;
    if (store) { store[key] = s; }
  };
  /* @deprecated（暴露给旧调用方） */
  G.getSession = getSession;

  /* ---------- 注册 ---------- */
  if (window.LX_SHARED && window.LX_SHARED.register) {
    window.LX_SHARED.register('guard', G);
  } else {
    window.LX_SHARED = window.LX_SHARED || {};
    window.LX_SHARED.guard = G;
  }
})();