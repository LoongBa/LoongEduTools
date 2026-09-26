/* ============================================================
   LX_SHARED.progress — 打卡/连胜/历史（个人纵向激励）
   ------------------------------------------------------------
   来源：从 40+ 工具同构逻辑抽取（数学口算/24点/乘法口诀/舒尔特/数独/成语等，
   calcStreak(dates) 签名全库一致，已实测核验）
   契约：
   - checkin(store)      完成即点亮今日（当日去重 + 连续天数）
   - streak(dates)       calcStreak 同构（升序 YYYYMMDD 列表 → 连续天数）
   - best(store,key,stars,ms) 更高星级或同星级更快则更新
   - history(store,item) push + ≤30 FIFO
   - store 结构沿用：{ version:1, checkin:{dates:[],streak:0}, ...工具特有 }
   - ES2017 经典脚本；Chrome 61 兼容
   ============================================================ */
(function () {
  'use strict';

  var P = {};

  /* ---------- 日期工具 ---------- */
  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtDate(d) {
    return '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
  }

  /* ---------- 连续天数（calcStreak 全库同构） ---------- */
  function calcStreak(dates) {
    if (!dates || !dates.length) { return 0; }
    var set = {};
    for (var i = 0; i < dates.length; i++) { set[dates[i]] = true; }
    var cur = new Date();
    cur.setHours(0, 0, 0, 0);
    if (!set[fmtDate(cur)]) {
      cur.setDate(cur.getDate() - 1);
    }
    var streak = 0;
    while (set[fmtDate(cur)]) {
      streak++;
      cur.setDate(cur.getDate() - 1);
    }
    return streak;
  }

  /* ---------- 打卡 ---------- */
  function doCheckin(store) {
    if (!store) { return; }
    if (!store.checkin) { store.checkin = { dates: [], streak: 0 }; }
    var today = fmtDate(new Date());
    var dates = store.checkin.dates || [];
    if (dates.indexOf(today) < 0) { dates.push(today); }
    dates.sort();
    while (dates.length > 365) { dates.shift(); }
    store.checkin.dates = dates;
    store.checkin.streak = calcStreak(dates);
    /* V0.8：补写 longestStreak 静态峰值（与动态 streak 正交无冲突），供 ui.selfStreakCard 经 P.longest 读取 */
    store.checkin.longestStreak = Math.max(store.checkin.longestStreak || 0, calcStreak(dates));
  }

  /* ---------- 最佳成绩（星级优先，同星级比用时） ---------- */
  function betterThan(starsA, msA, starsB, msB) {
    if (starsA !== starsB) { return starsA > starsB; }
    return msA < msB;
  }
  function updateBest(store, key, stars, ms, errors) {
    if (!store) { return false; }
    if (!store.best) { store.best = {}; }
    var best = store.best[key];
    var cur = { ms: ms, errors: errors || 0, stars: stars, date: fmtDate(new Date()) };
    if (!best || betterThan(stars, ms, best.stars, best.ms)) {
      store.best[key] = cur;
      return true; // 新纪录
    }
    return false;
  }

  /* ---------- 历史（≤30 FIFO） ---------- */
  function pushHistory(store, item) {
    if (!store) { return; }
    if (!store.history) { store.history = []; }
    store.history.push(item);
    while (store.history.length > 30) { store.history.shift(); }
  }

  /* ---------- 最长连续打卡（静态峰值；V0.8 暴露，工具勿直读字段名） ---------- */
  function longest(store) {
    if (!store || !store.checkin) { return 0; }
    return store.checkin.longestStreak || 0;
  }

  /* ---------- 对外 API ---------- */
  P.checkin = doCheckin;
  P.streak = calcStreak;
  P.best = updateBest;
  P.history = pushHistory;
  P.longest = longest;

  /* ---------- 注册 ---------- */
  if (window.LX_SHARED && window.LX_SHARED.register) {
    window.LX_SHARED.register('progress', P);
  } else {
    window.LX_SHARED = window.LX_SHARED || {};
    window.LX_SHARED.progress = P;
  }
})();