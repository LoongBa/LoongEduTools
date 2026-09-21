/* ============================================================
   影子配对 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   数据：window.ELEMENTS（elements.js 注入，73 元素库，draw({fill,variant})）
         window.APP_DATA（data.js 注入，build 生成 meta，可缺失）
   玩法：上排 M 张「实物卡」+ 下排 M 张「影子卡」（独立洗牌）——
         点实物（选中）→ 点对应影子 → 配对成功；错配红闪 + 错误计数。
         影子 = 同一元素 SVG + CSS filter brightness(0) 纯黑剪影（零元素库改）。
   设计约束（对齐 series/益智/设计文档.md §5）：
   - 不使用 import/export / type="module"
   - 不超出 ES2017（无 ?. ?? 对象展开 replaceAll 等）；var + function 风格
   - 事件全部 addEventListener，无内联事件 / eval
   - 无 fetch/XHR/Worker；localStorage 读写 try/catch
   - 音效：Web Audio OscillatorNode 合成（无音频文件，合规）
   - 计时：performance.now() + setInterval(100ms) 按差值刷新（§4.1）
   - 成绩/打卡：localStorage key 带工具前缀 redtools.yingzipedui.v1
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };
  var ELEMENTS = window.ELEMENTS || [];

  /* ---------- DOM ---------- */
  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');
  var footerEl = document.getElementById('app-footer');
  var timerEl = null;
  var errorsEl = null;
  var pairEl = null;
  var objEls = [];   // 实物卡 DOM
  var shdEls = [];   // 影子卡 DOM
  var hintEl = null;
  var overlayEl = null;

  /* ---------- 难度定义 ---------- */
  var LEVELS = [
    { key: '1', name: '简单', pairs: 3 },
    { key: '2', name: '普通', pairs: 4 },
    { key: '3', name: '困难', pairs: 5 }
  ];

  /* ---------- 状态 ---------- */
  var state = {
    level: '1',
    ids: [],          // 本局抽取的 M 个元素 id（每对 1 个）
    objects: [],      // 实物行：objects[i] = eid（独立洗牌）
    shadows: [],      // 影子行：shadows[j] = eid（独立洗牌）
    matched: [],      // 已配对 eid 列表
    selectedObj: -1,  // 当前选中实物下标（-1 = 无）
    errors: 0,
    won: false,
    startMs: 0,
    ms: 0,
    timerId: 0
  };

  /* ---------- 持久化（redtools.yingzipedui.v1） ---------- */
  var STORE_KEY = 'redtools.yingzipedui.v1';
  LX_SHARED.storage.configure({ toolName: 'yingzipedui' });  // V0.4 迁移：键前缀 redtools.yingzipedui.v1
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
    // 秒 + 1 位小数，如 07.5
    var sec = Math.max(0, ms) / 1000;
    var t = Math.floor(sec);
    var d = Math.floor((sec - t) * 10);
    return (t < 10 ? '0' + t : '' + t) + '.' + d;
  }
  function fmtBestTime(ms) {
    // 分:秒，如 00:12
    var total = Math.max(0, Math.round(ms / 1000));
    var m = Math.floor(total / 60);
    var s = total % 60;
    return (m < 10 ? '0' + m : '' + m) + ':' + (s < 10 ? '0' + s : '' + s);
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

  /* ---------- 音效（Web Audio 合成，同系列） ---------- */
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

  /* ---------- 元素渲染 ---------- */
  function findElem(eid) {
    for (var i = 0; i < ELEMENTS.length; i++) {
      if (ELEMENTS[i].id === eid) { return ELEMENTS[i]; }
    }
    return null;
  }
  function elemInner(eid) {
    var e = findElem(eid);
    if (!e) { return ''; }
    return e.draw({ fill: e.fill, variant: 0 });
  }
  /* 实物卡 SVG（原色）/ 影子卡 SVG（同一元素，class 统一 cell-svg，
     影子黑剪影由 CSS 后代选择器 .shd-cell .cell-svg 施加 brightness(0)，
     保证两卡渲染字符串完全一致——冒烟测试与此依赖此一致性做匹配） */
  function cardSvg(eid) {
    return '<svg class="cell-svg" viewBox="-50 -50 100 100" xmlns="http://www.w3.org/2000/svg">' +
      elemInner(eid) + '</svg>';
  }

  /* ---------- 出题引擎 ---------- */
  function findLevel(key) {
    for (var i = 0; i < LEVELS.length; i++) {
      if (LEVELS[i].key === key) { return LEVELS[i]; }
    }
    return null;
  }
  function newRound(levelKey) {
    stopTimer();
    state.level = levelKey;
    var lv = findLevel(levelKey);
    // 抽 M 个不同元素 id
    var pool = [];
    for (var i = 0; i < ELEMENTS.length; i++) { pool.push(ELEMENTS[i].id); }
    pool = shuffle(pool);
    state.ids = pool.slice(0, lv.pairs);
    // 双行独立洗牌
    state.objects = shuffle(state.ids.slice());
    state.shadows = shuffle(state.ids.slice());
    // 防「两行恰好同序」退化：影子行重新洗牌直到与实物行不同（guard<=100）
    var guard = 0;
    while (guard < 100 && state.shadows.join() === state.objects.join()) {
      state.shadows = shuffle(state.ids.slice());
      guard++;
    }
    state.matched = [];
    state.selectedObj = -1;
    state.errors = 0;
    state.won = false;
    state.startMs = 0;
    state.ms = 0;
  }
  function isMatched(eid) {
    return state.matched.indexOf(eid) !== -1;
  }

  /* ---------- 渲染：头部 / 页脚 ---------- */
  function renderHeader(title) {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '影子配对';
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
    btnRestart.addEventListener('click', function () { restartRound(); });
    errorsEl = makeEl('span', 'footer-errors', '❌ ' + state.errors);
    bar.appendChild(btnBack);
    bar.appendChild(btnRestart);
    bar.appendChild(errorsEl);
    footerEl.appendChild(bar);
  }

  /* ---------- 渲染：游戏视图 ---------- */
  function renderGameView() {
    clearNode(viewEl);
    objEls = [];
    shdEls = [];
    var lv = findLevel(state.level);

    // 顶栏：← 返回 + 难度名 + ⏱ 计时
    var topbar = makeEl('div', 'topbar');
    var btnBack = makeEl('button', 'btn-ghost-sm', '← 返回');
    btnBack.setAttribute('aria-label', '返回难度选择');
    btnBack.addEventListener('click', backToDifficulty);
    topbar.appendChild(btnBack);
    topbar.appendChild(makeEl('span', 'level-title', lv ? lv.name : ''));
    timerEl = makeEl('span', 'top-timer', '⏱ 00.0');
    topbar.appendChild(timerEl);
    viewEl.appendChild(topbar);

    // 已配对计数
    pairEl = makeEl('div', 'pair-indicator', '配对 0/' + state.ids.length);
    viewEl.appendChild(pairEl);

    // 引导文案
    hintEl = makeEl('div', 'hint', '👀 点一个上面的图案，再点下面和它一样的影子');
    viewEl.appendChild(hintEl);

    // 实物行（白色卡片，原色图案）
    viewEl.appendChild(makeEl('div', 'row-label', '🌸 图案'));
    var objRow = makeEl('div', 'pair-row obj-row m' + state.ids.length);
    for (var i = 0; i < state.objects.length; i++) {
      (function (idx) {
        var cell = makeEl('div', 'pair-cell obj-cell');
        var inner = makeEl('div', 'pair-inner');
        inner.innerHTML = cardSvg(state.objects[idx]);
        cell.appendChild(inner);
        cell.addEventListener('click', function () { onObjTap(idx); });
        objEls[idx] = cell;
        objRow.appendChild(cell);
      })(i);
    }
    viewEl.appendChild(objRow);

    // 影子行（浅灰卡片，黑剪影）
    viewEl.appendChild(makeEl('div', 'row-label', '🌑 影子'));
    var shdRow = makeEl('div', 'pair-row shd-row m' + state.ids.length);
    for (var j = 0; j < state.shadows.length; j++) {
      (function (idx) {
        var cell = makeEl('div', 'pair-cell shd-cell');
        var inner = makeEl('div', 'pair-inner');
        inner.innerHTML = cardSvg(state.shadows[idx]);
        cell.appendChild(inner);
        cell.addEventListener('click', function () { onShdTap(idx); });
        shdEls[idx] = cell;
        shdRow.appendChild(cell);
      })(j);
    }
    viewEl.appendChild(shdRow);

    updateMatchedUI();
    updateErrorsUI();
  }

  /* ---------- 交互 ---------- */
  function refreshObjClasses() {
    for (var i = 0; i < objEls.length; i++) {
      if (!objEls[i]) { continue; }
      var cls = 'pair-cell obj-cell';
      if (isMatched(state.objects[i])) { cls += ' matched'; }
      if (i === state.selectedObj && !isMatched(state.objects[i])) { cls += ' selected'; }
      objEls[i].className = cls;
    }
  }
  function refreshShdClasses() {
    for (var j = 0; j < shdEls.length; j++) {
      if (!shdEls[j]) { continue; }
      var cls = 'pair-cell shd-cell';
      if (isMatched(state.shadows[j])) { cls += ' matched'; }
      shdEls[j].className = cls;
    }
  }
  function onObjTap(i) {
    if (state.won) { return; }
    var eid = state.objects[i];
    if (isMatched(eid)) { return; } // 已配对不可再选
    ensureAudio();
    if (state.selectedObj === i) {
      state.selectedObj = -1; // 点同一实物取消选中
    } else {
      state.selectedObj = i; // 选中/切换
    }
    sndClick();
    refreshObjClasses();
  }
  function onShdTap(j) {
    if (state.won) { return; }
    var eid = state.shadows[j];
    if (isMatched(eid)) { return; }
    if (state.selectedObj < 0) {
      showHint('先点上面的一个图案，再点它的影子');
      return;
    }
    var oi = state.selectedObj;
    var oeid = state.objects[oi];
    if (oeid === eid) {
      // 配对成功
      state.matched.push(eid);
      state.selectedObj = -1;
      sndCorrect();
      refreshObjClasses();
      refreshShdClasses();
      updateMatchedUI();
      if (state.matched.length >= state.ids.length) {
        // 全部配齐：等最后一对的 350ms pop 动画结束后再结算
        window.setTimeout(onWin, 350);
      }
    } else {
      // 错配：红闪 + 错误 +1 + 取消选中
      state.errors++;
      sndWrong();
      state.selectedObj = -1;
      var cell = shdEls[j];
      if (cell) { cell.className = cell.className + ' wrong'; }
      (function (c) {
        window.setTimeout(function () {
          if (c) { c.className = c.className.replace(' wrong', ''); }
        }, 400);
      })(cell);
      refreshObjClasses();
      showHint('不是这个影子哦，再找找');
      updateErrorsUI();
    }
  }
  function updateMatchedUI() {
    if (pairEl) { pairEl.textContent = '配对 ' + state.matched.length + '/' + state.ids.length; }
  }
  function updateErrorsUI() {
    if (errorsEl) { errorsEl.textContent = '❌ ' + state.errors; }
  }
  function showHint(text) {
    if (!hintEl) { return; }
    hintEl.textContent = text;
    hintEl.className = 'hint hint-active';
    window.setTimeout(function () {
      hintEl.className = 'hint';
      hintEl.textContent = '👀 点一个上面的图案，再点下面和它一样的影子';
    }, 900);
  }

  /* ---------- 通关 / 星级 / 最佳 ---------- */
  function calcStars(errors) {
    if (errors === 0) { return 3; }
    if (errors <= 2) { return 2; }
    return 1;
  }
  function betterThan(starsA, msA, starsB, msB) {
    // 星级高优先，同星级比用时
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
    // 结算浮层
    var notes = [
      { cls: 'checkin-line', text: '✅ 今日已打卡 · 连续 ' + (store.checkin.streak || 0) + ' 天' }
    ];
    var btns = [
      { text: '再来一局', cls: 'btn-main', act: function () { restartRound(); } },
      { text: '选难度', cls: 'btn-ghost', act: function () { backToDifficulty(); } },
      { text: '📅 打卡日历', cls: 'btn-ghost', act: function () { showCheckinView(); } }
    ];
    var sub = '用时 ' + fmtTime(ms) + ' 秒 · 错误 ' + errors + ' 次';
    showOverlay('🎉 全配齐啦！', sub, notes, btns);
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
    state.won = false;
    renderHeader();
    clearNode(viewEl);
    viewEl.appendChild(makeEl('div', 'page-title', '选择难度'));
    viewEl.appendChild(makeEl('div', 'home-hint', '把上面的图案，和下面一样的影子配成一对！'));
    var list = makeEl('div', 'diff-list');
    for (var i = 0; i < LEVELS.length; i++) {
      (function (l) {
        var btn = makeEl('button', 'diff-btn');
        var head = makeEl('span', 'diff-head', '👉 ' + l.name + ' · ' + l.pairs + ' 对');
        btn.appendChild(head);
        var best = store.best[l.key];
        var sub = best
          ? '最佳 ' + starsText(best.stars) + ' · ' + fmtBestTime(best.ms) + ' · 错 ' + best.errors
          : '暂无成绩 · 来挑战！';
        btn.appendChild(makeEl('span', 'diff-sub', sub));
        btn.setAttribute('aria-label', l.name + '难度 ' + l.pairs + ' 对');
        btn.addEventListener('click', function () { startGame(l.key); });
        list.appendChild(btn);
      })(LEVELS[i]);
    }
    viewEl.appendChild(list);
    renderHomeFooter();
  }
  function startGame(levelKey) {
    if (!ELEMENTS.length) {
      viewEl.textContent = '元素库缺失，请检查 elements.js';
      return;
    }
    newRound(levelKey);
    renderGameView();
    renderGameFooter();
    startTimer();
  }
  function backToDifficulty() {
    hideOverlay();
    stopTimer();
    showDifficultyView();
  }
  function restartRound() {
    hideOverlay();
    newRound(state.level);
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
    while (dates.length > 365) { dates.shift(); } // 滚动 365 天
    store.checkin.dates = dates;
    store.checkin.streak = calcStreak(dates);
  }

  /* ---------- 渲染：打卡日历视图 ---------- */
  function showCheckinView() {
    hideOverlay();
    stopTimer();
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
    // 底栏：返回难度
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