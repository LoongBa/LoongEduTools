/* ============================================================
   位置记忆 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   数据：window.ICONS（icons.js 注入，24 个 SVG 图标，复用翻牌记忆配对）
         window.APP_DATA（data.js 注入，build 生成 meta，可缺失）
   玩法：展示阶段（网格内 M 个图案可见 + 倒计时）→ 全部隐藏 →
         逐轮提示目标图案（大卡显示「找出这个图案」）→ 点对应格子 →
         对（翻回 + 绿闪）错（红闪 + 计数，可继续点）→ 全部找到过关。
   设计约束（对齐 series/益智/设计文档.md §5）：
   - 不使用 import/export / type="module"；不超出 ES2017；var + function
   - 事件全部 addEventListener，无内联事件 / eval
   - 无 fetch/XHR/Worker；localStorage 读写 try/catch
   - 音效：Web Audio OscillatorNode 合成（无音频文件，合规）
   - 计时：performance.now() + setInterval(100ms) 按差值刷新（§4.1）
   - 成绩/打卡：localStorage key 带工具前缀 redtools.weizhijiyi.v1
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };
  var ICONS = window.ICONS || [];

  /* ---------- DOM ---------- */
  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');
  var footerEl = document.getElementById('app-footer');
  var timerEl = null;
  var errorsEl = null;
  var hitEl = null;       // 倒计时 / 状态
  var hintEl = null;      // 目标提示大卡
  var hintIconEl = null;
  var gridEl = null;
  var cellEls = [];
  var overlayEl = null;

  /* ---------- 难度定义 ---------- */
  var LEVELS = [
    { key: '1', name: '简单', gridN: 3, patterns: 4, showSec: 5 },
    { key: '2', name: '普通', gridN: 4, patterns: 6, showSec: 5 },
    { key: '3', name: '困难', gridN: 4, patterns: 8, showSec: 4 }
  ];

  /* ---------- 状态 ---------- */
  var state = {
    level: '1',
    gridN: 3,
    cells: [],          // 格数组：{ iconId 或 null（空格）, found }
    targets: [],        // 待找图案 iconId 列表
    curTarget: null,    // 当前目标
    phase: 'show',      // 'show' 展示 / 'find' 查找 / 'win'
    showLeft: 0,        // 展示剩余秒
    showTimerId: 0,     // 展示倒计时句柄
    found: 0,
    errors: 0,
    won: false,
    startMs: 0,
    ms: 0,
    timerId: 0
  };

  /* ---------- 持久化（redtools.weizhijiyi.v1） ---------- */
  var STORE_KEY = 'redtools.weizhijiyi.v1';
  LX_SHARED.storage.configure({ toolName: 'weizhijiyi' });  // V0.4 迁移：键前缀 redtools.weizhijiyi.v1
  function defaultStore() {
    return {
      version: 1,
      best: {},                     // { "1": {ms,errors,stars,date}, ... }
      recent: {},                   // 各难度最近用时 ms
      checkin: { dates: [], streak: 0 },
      history: []                   // 滚动 30 条 {date,level,ms,errors,stars}
    };
  }
  function loadStore() {
    try {
      var raw = LX_SHARED.storage.get('v1');
      if (raw) {
        var obj = raw;
        if (obj && obj.version === 1) {
          if (!obj.best) { obj.best = {}; }
          if (!obj.recent) { obj.recent = {}; }
          if (!obj.checkin) { obj.checkin = { dates: [], streak: 0 }; }
          if (!obj.history) { obj.history = []; }
          if (obj.history.length > 30) { obj.history = obj.history.slice(-30); }
          return obj;
        }
      }
    } catch (err) { /* ignore */ }
    return defaultStore();
  }
  function saveStore() {
    try {
      LX_SHARED.storage.set('v1', store);
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
  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtDate(d) {
    return '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
  }
  function calcStreak(dates) {
    return LX_SHARED.progress.streak(dates);
}
  function fmtTime(ms) {
    var sec = Math.max(0, ms) / 1000;
    var t = Math.floor(sec);
    var d = Math.floor((sec - t) * 10);
    return (t < 10 ? '0' + t : '' + t) + '.' + d;
  }
  function fmtBestTime(ms) {
    var total = Math.max(0, Math.round(ms / 1000));
    var m = Math.floor(total / 60);
    var s = total % 60;
    return (m < 10 ? '0' + m : '' + m) + ':' + (s < 10 ? '0' + s : '' + s);
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var j = a.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = a[j]; a[j] = a[k]; a[k] = t;
    }
    return a;
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
  function sndClick() { tone(392, 0.06, 'sine', 0.08); }
  function sndCorrect() { tone(523, 0.09, 'triangle', 0.1); }
  function sndWrong() { tone(150, 0.12, 'square', 0.05); }
  function sndWin() {
    tone(523, 0.12, 'sine', 0.11, 0);
    tone(659, 0.12, 'sine', 0.11, 0.12);
    tone(784, 0.12, 'sine', 0.11, 0.24);
    tone(1047, 0.24, 'sine', 0.11, 0.36);
  }

  /* ---------- 计时 ---------- */
  function startTimer() {
    stopTimer();
    state.startMs = performance.now();
    state.timerId = setInterval(function () {
      if (!state.won && timerEl) {
        timerEl.textContent = '⏱ ' + fmtTime(performance.now() - state.startMs);
      }
    }, 100);
  }
  function stopTimer() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = 0; }
  }

  /* ---------- 图标 ---------- */
  function findIcon(iconId) {
    for (var i = 0; i < ICONS.length; i++) {
      if (ICONS[i].id === iconId) { return ICONS[i]; }
    }
    return null;
  }
  function iconSvg(iconId) {
    var ic = findIcon(iconId);
    return ic ? ic.draw() : '';
  }

  /* ---------- 出题 ---------- */
  function findLevel(key) {
    for (var i = 0; i < LEVELS.length; i++) {
      if (LEVELS[i].key === key) { return LEVELS[i]; }
    }
    return null;
  }
  function newGame(levelKey) {
    stopTimer();
    clearShowTimer();
    state.level = levelKey;
    var lv = findLevel(levelKey);
    state.gridN = lv.gridN;
    // 抽 pattern 个不同图标
    var pool = ICONS.slice();
    for (var i = 0; i < pool.length; i++) { pool[i] = ICONS[i]; }
    var icons = shuffle(pool).slice(0, lv.patterns);
    var targetIds = [];
    for (var t = 0; t < icons.length; t++) { targetIds.push(icons[t].id); }
    // 网格放置：随机选 pattern 个格子放图标（其余空格）
    var totalCells = lv.gridN * lv.gridN;
    var idxs = [];
    for (var c = 0; c < totalCells; c++) { idxs.push(c); }
    idxs = shuffle(idxs).slice(0, lv.patterns);
    var cells = [];
    for (var cc = 0; cc < totalCells; cc++) { cells.push({ iconId: null, found: false }); }
    for (var p = 0; p < idxs.length; p++) {
      cells[idxs[p]] = { iconId: targetIds[p], found: false };
    }
    state.cells = cells;
    state.targets = shuffle(targetIds.slice());
    state.found = 0;
    state.errors = 0;
    state.won = false;
    state.startMs = 0;
    state.ms = 0;
    state.phase = 'show';
    state.curTarget = null;
    state.showLeft = lv.showSec;
  }
  function clearShowTimer() {
    if (state.showTimerId) { clearInterval(state.showTimerId); state.showTimerId = 0; }
  }

  /* ---------- 渲染：头部 / 页脚 ---------- */
  function renderHeader(title) {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '位置记忆';
    brand.appendChild(makeEl('span', 'header-title', title || name));
    if (APP.meta && APP.meta.version) {
      brand.appendChild(makeEl('span', 'header-ver', 'v' + APP.meta.version));
    }
    headerEl.appendChild(brand);
  }
  function renderHomeFooter() {
    clearNode(footerEl);
    var streak = store.checkin && store.checkin.streak ? store.checkin.streak : 0;
    var btn = makeEl('button', 'btn-checkin', '📅 打卡日历 · 连续 ' + streak + ' 天');
    btn.setAttribute('aria-label', '打开打卡日历');
    btn.addEventListener('click', showCheckinView);
    footerEl.appendChild(btn);
  }
  function renderGameFooter() {
    clearNode(footerEl);
    var bar = makeEl('div', 'game-footer');
    var btnBack = makeEl('button', 'btn-ghost-sm', '返回难度');
    btnBack.setAttribute('aria-label', '返回难度选择');
    btnBack.addEventListener('click', backToDifficulty);
    var btnRestart = makeEl('button', 'btn-ghost-sm', '重新开始');
    btnRestart.setAttribute('aria-label', '重新开始本局');
    btnRestart.addEventListener('click', function () { restartGame(); });
    errorsEl = makeEl('span', 'footer-errors', '❌ ' + state.errors);
    bar.appendChild(btnBack);
    bar.appendChild(btnRestart);
    bar.appendChild(errorsEl);
    footerEl.appendChild(bar);
  }

  /* ---------- 渲染：游戏视图 ---------- */
  function renderGameView() {
    clearNode(viewEl);
    cellEls = [];
    var lv = findLevel(state.level);

    // 顶栏
    var topbar = makeEl('div', 'topbar');
    var btnBack = makeEl('button', 'btn-ghost-sm', '← 返回');
    btnBack.setAttribute('aria-label', '返回难度选择');
    btnBack.addEventListener('click', backToDifficulty);
    topbar.appendChild(btnBack);
    topbar.appendChild(makeEl('span', 'level-title', lv ? lv.name : ''));
    timerEl = makeEl('span', 'top-timer', '⏱ 00.0');
    topbar.appendChild(timerEl);
    viewEl.appendChild(topbar);

    // 状态行（倒计时 / 进度）
    hitEl = makeEl('div', 'hit-status', '');
    viewEl.appendChild(hitEl);

    // 目标提示大卡（查找阶段显示）
    hintEl = makeEl('div', 'hit-hint');
    hintIconEl = makeEl('div', 'hit-hint-icon');
    hintEl.appendChild(hintIconEl);
    hintEl.appendChild(makeEl('div', 'hit-hint-text', '找出这个图案！'));
    hintEl.style.display = 'none';
    viewEl.appendChild(hintEl);

    // 网格
    gridEl = makeEl('div', 'hit-grid g' + state.gridN);
    for (var i = 0; i < state.cells.length; i++) {
      (function (idx) {
        var cell = makeEl('div', 'hit-cell');
        var inner = makeEl('div', 'hit-cell-inner');
        cell.appendChild(inner);
        cell.addEventListener('click', function () { onCellTap(idx); });
        cellEls[idx] = cell;
        gridEl.appendChild(cell);
      })(i);
    }
    viewEl.appendChild(gridEl);

    startShowPhase();
  }
  /* 展示阶段：图案可见 + 倒计时 → 隐藏 → 查找 */
  function startShowPhase() {
    state.phase = 'show';
    var lv = findLevel(state.level);
    renderCells(true);
    hitEl.textContent = '👀 记住图案的位置！还有 ' + state.showLeft + ' 秒';
    state.showTimerId = setInterval(function () {
      state.showLeft--;
      if (state.showLeft <= 0) {
        clearShowTimer();
        hideAll();
      } else {
        hitEl.textContent = '👀 记住图案的位置！还有 ' + state.showLeft + ' 秒';
      }
    }, 1000);
  }
  function hideAll() {
    state.phase = 'find';
    renderCells(false); // 全部隐藏（背面）
    nextTarget();
  }
  function nextTarget() {
    if (!state.targets.length) { onWin(); return; }
    state.curTarget = state.targets[0];
    hintIconEl.innerHTML = iconSvg(state.curTarget);
    hintEl.style.display = 'block';
    hitEl.textContent = '🔍 找到 ' + state.found + '/' + (state.targets.length + state.found) + ' 个图案';
  }
  /* 渲染格子：show=true 显示内容；false 隐藏（空格和未找到格显示背面，找到格显示内容） */
  function renderCells(show) {
    for (var i = 0; i < cellEls.length; i++) {
      var cell = cellEls[i];
      if (!cell) { continue; }
      var inner = cell.querySelector('.hit-cell-inner');
      var data = state.cells[i];
      inner.className = 'hit-cell-inner';
      if (data.found) {
        inner.className = 'hit-cell-inner found';
        inner.innerHTML = iconSvg(data.iconId);
      } else if (show) {
        inner.innerHTML = data.iconId ? iconSvg(data.iconId) : '';
      } else {
        inner.className = 'hit-cell-inner hidden';
        inner.innerHTML = '';
      }
    }
  }

  /* ---------- 查找交互 ---------- */
  function onCellTap(idx) {
    if (state.won || state.phase !== 'find') { return; }
    ensureAudio();
    var cell = cellEls[idx];
    var data = state.cells[idx];
    if (data.found) { return; } // 已找到忽略
    if (!data.iconId) { sndClick(); return; } // 空格轻响应
    var inner = cell.querySelector('.hit-cell-inner');
    if (data.iconId === state.curTarget) {
      // 正确：翻回 + 绿闪 + 标记
      data.found = true;
      state.found++;
      sndCorrect();
      inner.className = 'hit-cell-inner found pop';
      inner.innerHTML = iconSvg(data.iconId);
      state.targets.shift();
      updateHitStatus();
      setTimeout(function () {
        if (inner) { inner.className = 'hit-cell-inner found'; }
      }, 350);
      if (!state.targets.length) {
        state.phase = 'idle';
        setTimeout(function () { onWin(); }, 500);
      } else {
        setTimeout(function () { targetHintNext(); }, 450);
      }
    } else {
      // 错误：红闪 + 计数（不翻回）
      state.errors++;
      sndWrong();
      inner.className = 'hit-cell-inner hidden wrong';
      setTimeout(function () {
        if (inner) { inner.className = 'hit-cell-inner hidden'; }
      }, 400);
      updateErrorsUI();
      updateHitStatus();
    }
  }
  function targetHintNext() {
    renderCells(false); // 确保隐藏态一致
    nextTarget();
  }
  function updateHitStatus() {
    if (!hitEl) { return; }
    var total = state.found + state.targets.length;
    hitEl.textContent = '🔍 找到 ' + state.found + '/' + total + ' 个图案';
  }
  function updateErrorsUI() {
    if (errorsEl) { errorsEl.textContent = '❌ ' + state.errors; }
  }

  /* ---------- 通关 / 星级 / 最佳 ---------- */
  function calcStars(errors) {
    if (errors === 0) { return 3; }
    if (errors <= 2) { return 2; }
    return 1;
  }
  function betterThan(starsA, msA, starsB, msB) {
    if (starsA !== starsB) { return starsA > starsB; }
    return msA < msB;
  }
  function starsText(n) {
    var s = '';
    for (var i = 0; i < 3; i++) { s += (i < n) ? '★' : '☆'; }
    return s;
  }
  function onWin() {
    if (state.won) { return; }
    state.won = true;
    stopTimer();
    clearShowTimer();
    state.ms = performance.now() - state.startMs;
    sndWin();
    var key = state.level;
    var ms = Math.round(state.ms);
    var errors = state.errors;
    var stars = calcStars(errors);
    var isNewBest = false;
    var best = store.best[key];
    if (!best || betterThan(stars, ms, best.stars, best.ms)) {
      store.best[key] = { ms: ms, errors: errors, stars: stars, date: fmtDate(new Date()) };
      isNewBest = true;
    }
    store.recent[key] = ms;
    store.history.push({ date: fmtDate(new Date()), level: key, ms: ms, errors: errors, stars: stars });
    while (store.history.length > 30) { store.history.shift(); }
    doCheckin();
    saveStore();
    var notes = [
      { cls: 'checkin-line', text: '✅ 今日已打卡 · 连续 ' + (store.checkin.streak || 0) + ' 天' }
    ];
    var btns = [
      { text: '再来一局', cls: 'btn-main', act: function () { restartGame(); } },
      { text: '选难度', cls: 'btn-ghost', act: function () { backToDifficulty(); } },
      { text: '📅 打卡日历', cls: 'btn-ghost', act: function () { showCheckinView(); } }
    ];
    var sub = '用时 ' + fmtTime(ms) + ' 秒 · 错误 ' + errors + ' 次';
    showOverlay('🎉 全部找到啦！', sub, notes, btns);
    showStarsInOverlay(stars);
    if (isNewBest) { showRecordBadge(); }
  }
  function showStarsInOverlay(stars) {
    if (!overlayEl) { return; }
    var sum = overlayEl.querySelector('.summary');
    if (!sum) { return; }
    var st = makeEl('div', 'stars-line', starsText(stars));
    sum.insertBefore(st, sum.firstChild);
  }
  function showRecordBadge() {
    if (!overlayEl) { return; }
    var sum = overlayEl.querySelector('.summary');
    if (!sum) { return; }
    sum.appendChild(makeEl('div', 'record-badge', '🎉 新纪录！'));
  }

  /* ---------- 渲染：难度选择视图 ---------- */
  function showDifficultyView() {
    stopTimer();
    clearShowTimer();
    state.won = false;
    renderHeader();
    clearNode(viewEl);
    viewEl.appendChild(makeEl('div', 'page-title', '选择难度'));
    viewEl.appendChild(makeEl('div', 'home-hint', '先记住图案的位置，藏起来后找出它们！'));
    var list = makeEl('div', 'diff-list');
    for (var i = 0; i < LEVELS.length; i++) {
      (function (l) {
        var btn = makeEl('button', 'diff-btn');
        var head = makeEl('span', 'diff-head', '👉 ' + l.name + ' · ' + l.gridN + '×' + l.gridN + ' 盘 · ' + l.patterns + ' 个图案');
        btn.appendChild(head);
        var best = store.best[l.key];
        var sub = best
          ? '最佳 ' + starsText(best.stars) + ' · ' + fmtBestTime(best.ms) + ' · 错 ' + best.errors
          : '暂无成绩 · 来挑战！';
        btn.appendChild(makeEl('span', 'diff-sub', sub));
        btn.setAttribute('aria-label', l.name + '难度 ' + l.gridN + '格盘');
        btn.addEventListener('click', function () { startGame(l.key); });
        list.appendChild(btn);
      })(LEVELS[i]);
    }
    viewEl.appendChild(list);
    renderHomeFooter();
  }
  function startGame(levelKey) {
    if (!ICONS.length) {
      viewEl.textContent = '图标库缺失，请检查 icons.js';
      return;
    }
    newGame(levelKey);
    renderGameView();
    renderGameFooter();
    startTimer();
  }
  function backToDifficulty() {
    hideOverlay();
    stopTimer();
    clearShowTimer();
    showDifficultyView();
  }
  function restartGame() {
    hideOverlay();
    stopTimer();
    clearShowTimer();
    newGame(state.level);
    renderGameView();
    renderGameFooter();
    startTimer();
  }

  /* ---------- 结算浮层 ---------- */
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

  /* ---------- 打卡 ---------- */
  function doCheckin() {
    if (!store.checkin) { store.checkin = { dates: [], streak: 0 }; }
    var today = fmtDate(new Date());
    var dates = store.checkin.dates || [];
    if (dates.indexOf(today) < 0) { dates.push(today); }
    dates.sort();
    while (dates.length > 365) { dates.shift(); }
    store.checkin.dates = dates;
    store.checkin.streak = calcStreak(dates);
  }

  /* ---------- 渲染：打卡日历视图 ---------- */
  function showCheckinView() {
    hideOverlay();
    stopTimer();
    clearShowTimer();
    state.won = false;
    renderHeader('打卡日历');
    clearNode(viewEl);
    var card = makeEl('div', 'calendar');
    card.appendChild(makeEl('div', 'page-title', '本月打卡'));
    var grid = makeEl('div', 'calendar-grid');
    var now = new Date();
    var days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var t = fmtDate(now);
    var dates = store.checkin.dates || [];
    for (var d = 1; d <= days; d++) {
      (function (day) {
        var ds = fmtDate(new Date(now.getFullYear(), now.getMonth(), day));
        var el = makeEl('div', 'cal-day', '' + day);
        if (dates.indexOf(ds) !== -1) { el.className = 'cal-day done'; }
        if (ds === t) { el.className += ' today'; }
        grid.appendChild(el);
      })(d);
    }
    card.appendChild(grid);
    var streak = calcStreak(dates);
    var info = makeEl('div', 'streak-info');
    info.appendChild(document.createTextNode('连续打卡 '));
    var b = makeEl('b', '', '' + streak);
    info.appendChild(b);
    info.appendChild(document.createTextNode(' 天' + (streak >= 7 ? ' 🎉' : '')));
    card.appendChild(info);
    viewEl.appendChild(card);
    clearNode(footerEl);
    var btnBack = makeEl('button', 'btn-checkin', '← 返回难度');
    btnBack.setAttribute('aria-label', '返回难度选择');
    btnBack.addEventListener('click', showDifficultyView);
    footerEl.appendChild(btnBack);
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
  showDifficultyView();
})();