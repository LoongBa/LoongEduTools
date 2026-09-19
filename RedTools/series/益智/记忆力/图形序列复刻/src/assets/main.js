/* ============================================================
   图形序列复刻 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   数据：window.APP_DATA（data.js 注入，build 生成 meta，可缺失）
   玩法：每轮播放一段颜色序列（色块依次点亮）→ 孩子按顺序点色块复刻 →
         全对进下一轮（5 轮）→ 结算。点错红闪 + 错误计数 + 复刻进度清零
         并重新播放序列（播放不扣分，低龄友好）。
   设计约束（对齐 series/益智/设计文档.md §5）：
   - 不使用 import/export / type="module"
   - 不超出 ES2017（无 ?. ?? 对象展开 replaceAll 等）；var + function 风格
   - 事件全部 addEventListener，无内联事件 / eval
   - 无 fetch/XHR/Worker；localStorage 读写 try/catch
   - 音效：Web Audio OscillatorNode 合成（无音频文件，合规）
   - 计时：performance.now() + setInterval(100ms) 按差值刷新（§4.1）
   - 成绩/打卡：localStorage key 带工具前缀 redtools.tuxingxuliefuke.v1
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };

  /* ---------- DOM ---------- */
  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');
  var footerEl = document.getElementById('app-footer');
  var timerEl = null;
  var errorsEl = null;
  var roundEl = null;
  var statusEl = null;
  var colorBtns = [];   // 色块按钮 DOM（按色池下标）
  var overlayEl = null;

  /* ---------- 难度 / 色池 ---------- */
  var LEVELS = [
    { key: '1', name: '简单', len: 3, colors: 3 },
    { key: '2', name: '普通', len: 4, colors: 4 },
    { key: '3', name: '困难', len: 5, colors: 5 }
  ];
  /* 色池（下标 0..n-1；困难档用前 5 色） */
  var PALETTE = ['#ff6b6b', '#4aa8ff', '#52c41a', '#f5c840', '#b46fdf'];

  /* ---------- 状态 ---------- */
  var state = {
    level: '1',
    totalRounds: 5,   // 每局 5 轮
    round: 0,         // 当前轮（1..5）
    seq: [],          // 本轮序列（色池下标数组）
    seqPos: 0,        // 已复刻位数
    phase: 'idle',    // 'playing' 播放中 / 'repro' 复刻中 / 'win'
    playTimers: [],   // 播放 setTimeout 句柄
    errors: 0,
    won: false,
    startMs: 0,
    ms: 0,
    timerId: 0
  };

  /* ---------- 持久化（redtools.tuxingxuliefuke.v1） ---------- */
  var STORE_KEY = 'redtools.tuxingxuliefuke.v1';
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
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        var obj = JSON.parse(raw);
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
  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtDate(d) {
    return '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
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
  function randInt(n) { return Math.floor(Math.random() * n); }

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
  /* 播放序列音符（颜色→音高，辅助记忆） */
  function playNote(idx) {
    tone(392 + idx * 60, 0.1, 'sine', 0.09);
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

  /* ---------- 出题 ---------- */
  function findLevel(key) {
    for (var i = 0; i < LEVELS.length; i++) {
      if (LEVELS[i].key === key) { return LEVELS[i]; }
    }
    return null;
  }
  function genSequence(len, colorCount) {
    var s = [];
    for (var i = 0; i < len; i++) { s.push(randInt(colorCount)); }
    return s;
  }
  function clearPlayTimers() {
    for (var i = 0; i < state.playTimers.length; i++) {
      clearTimeout(state.playTimers[i]);
    }
    state.playTimers = [];
  }
  function newGame(levelKey) {
    stopTimer();
    clearPlayTimers();
    state.level = levelKey;
    state.totalRounds = 5;
    state.round = 1;
    state.seq = [];
    state.seqPos = 0;
    state.phase = 'idle';
    state.errors = 0;
    state.won = false;
    state.startMs = 0;
    state.ms = 0;
  }
  /* 开始新一轮：生成序列 → 播放 → 复刻 */
  function startRound() {
    var lv = findLevel(state.level);
    state.seq = genSequence(lv.len, lv.colors);
    state.seqPos = 0;
    state.phase = 'playing';
    renderSeqPreview();
    updateProgress();
    setStatus('👀 仔细看，记住顺序！');
    // 播放：每个色块亮 600ms，间隔 350ms
    var base = 0;
    for (var i = 0; i < state.seq.length; i++) {
      (function (idx, ci) {
        state.playTimers.push(setTimeout(function () { lightOn(ci); }, base));
        state.playTimers.push(setTimeout(function () { lightOff(ci); }, base + 600));
        playNote(ci);
        base += 950;
      })(i, state.seq[i]);
    }
    // 播放结束进入复刻
    state.playTimers.push(setTimeout(function () {
      state.phase = 'repro';
      clearLights();
      setStatus('👉 现在轮到你了：按顺序点一遍');
      enableColorBtns(true);
    }, base + 250));
  }
  function nextRound() {
    state.round++;
    state.seqPos = 0;
    enableColorBtns(false);
    if (state.round > state.totalRounds) {
      onWin();
    } else {
      startRound();
    }
  }

  /* 色块点亮控制 */
  function lightOn(ci) {
    var b = colorBtns[ci];
    if (b) { b.className = 'color-btn lit'; }
  }
  function lightOff(ci) {
    var b = colorBtns[ci];
    if (b) { b.className = 'color-btn'; }
  }
  function flashOk(ci) {
    var b = colorBtns[ci];
    if (b) {
      b.className = 'color-btn flash-ok';
      playNote(ci);
      setTimeout(function () { if (b) { b.className = 'color-btn'; } }, 300);
    }
  }
  function flashWrong(ci) {
    var b = colorBtns[ci];
    if (b) {
      b.className = 'color-btn flash-wrong';
      sndWrong();
      setTimeout(function () { if (b) { b.className = 'color-btn'; } }, 400);
    }
  }
  function clearLights() {
    for (var i = 0; i < colorBtns.length; i++) {
      var b = colorBtns[i];
      if (b) { b.className = 'color-btn'; }
    }
  }
  function enableColorBtns(on) {
    for (var i = 0; i < colorBtns.length; i++) {
      if (colorBtns[i]) { colorBtns[i].disabled = !on; }
    }
  }

  /* ---------- 复刻交互 ---------- */
  function onColorTap(ci) {
    if (state.won || state.phase !== 'repro') { return; }
    ensureAudio();
    if (ci === state.seq[state.seqPos]) {
      // 正确
      flashOk(ci);
      state.seqPos++;
      updateProgress();
      if (state.seqPos >= state.seq.length) {
        state.phase = 'idle';
        enableColorBtns(false);
        setStatus('✅ 全对，下一轮！');
        sndCorrect();
        setTimeout(function () { nextRound(); }, 600);
      }
    } else {
      // 错误：红闪 + 错误++ + 复刻进度清零 + 重新播放序列
      flashWrong(ci);
      state.errors++;
      updateErrorsUI();
      state.seqPos = 0;
      enableColorBtns(false);
      updateProgress();
      setStatus('⚠️ 点错啦，再看一遍');
      setTimeout(function () {
        state.phase = 'playing';
        clearLights();
        startRound();
      }, 600);
    }
  }

  /* ---------- 渲染辅助 ---------- */
  function setStatus(text) {
    if (statusEl) { statusEl.textContent = text; }
  }
  function updateProgress() {
    if (roundEl) { roundEl.textContent = '第 ' + state.round + '/' + state.totalRounds + ' 轮 · 已复刻 ' + state.seqPos + '/' + state.seq.length; }
  }
  function updateErrorsUI() {
    if (errorsEl) { errorsEl.textContent = '❌ ' + state.errors; }
  }
  function renderSeqPreview() {
    if (!seqPreviewEl) { return; }
    clearNode(seqPreviewEl);
    var lv = findLevel(state.level);
    for (var i = 0; i < lv.len; i++) {
      var dot = makeEl('span', 'seq-dot', '');
      dot.style.background = PALETTE[state.seq[i]];
      seqPreviewEl.appendChild(dot);
    }
  }
  var seqPreviewEl = null;

  /* ---------- 渲染：头部 / 页脚 ---------- */
  function renderHeader(title) {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '图形序列复刻';
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
    colorBtns = [];
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

    // 轮次 + 复刻进度
    roundEl = makeEl('div', 'seq-round', '');
    viewEl.appendChild(roundEl);

    // 序列预览点（本轮序列，播放开始后由 renderSeqPreview 填充）
    seqPreviewEl = makeEl('div', 'seq-preview');
    viewEl.appendChild(seqPreviewEl);

    // 状态提示行
    statusEl = makeEl('div', 'game-status', '准备中…');
    viewEl.appendChild(statusEl);

    // 色块按钮区（3~5 个大色块，flex 单行）
    var kbd = makeEl('div', 'color-kbd');
    for (var i = 0; i < lv.colors; i++) {
      (function (ci) {
        var b = makeEl('button', 'color-btn', '');
        b.style.background = PALETTE[ci];
        b.setAttribute('aria-label', '颜色按钮 ' + (ci + 1));
        b.addEventListener('click', function () { onColorTap(ci); });
        colorBtns[ci] = b;
        kbd.appendChild(b);
      })(i);
    }
    viewEl.appendChild(kbd);

    updateErrorsUI();
    startRound();
  }

  /* ---------- 渲染：难度选择视图 ---------- */
  function showDifficultyView() {
    stopTimer();
    clearPlayTimers();
    state.won = false;
    renderHeader();
    clearNode(viewEl);
    viewEl.appendChild(makeEl('div', 'page-title', '选择难度'));
    viewEl.appendChild(makeEl('div', 'home-hint', '看一遍颜色顺序，再按顺序点一遍！'));
    var list = makeEl('div', 'diff-list');
    for (var i = 0; i < LEVELS.length; i++) {
      (function (l) {
        var btn = makeEl('button', 'diff-btn');
        var head = makeEl('span', 'diff-head', '👉 ' + l.name + ' · 记 ' + l.len + ' 个颜色');
        btn.appendChild(head);
        var best = store.best[l.key];
        var sub = best
          ? '最佳 ' + starsText(best.stars) + ' · ' + fmtBestTime(best.ms) + ' · 错 ' + best.errors
          : '暂无成绩 · 来挑战！';
        btn.appendChild(makeEl('span', 'diff-sub', sub));
        btn.setAttribute('aria-label', l.name + '难度 记' + l.len + '个颜色');
        btn.addEventListener('click', function () { startGame(l.key); });
        list.appendChild(btn);
      })(LEVELS[i]);
    }
    viewEl.appendChild(list);
    renderHomeFooter();
  }
  function startGame(levelKey) {
    newGame(levelKey);
    renderGameView();
    renderGameFooter();
    startTimer();
  }
  function backToDifficulty() {
    hideOverlay();
    stopTimer();
    clearPlayTimers();
    showDifficultyView();
  }
  function restartGame() {
    hideOverlay();
    stopTimer();
    clearPlayTimers();
    newGame(state.level);
    renderGameView();
    renderGameFooter();
    startTimer();
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
    clearPlayTimers();
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
    showOverlay('🎉 全部记住啦！', sub, notes, btns);
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
    clearPlayTimers();
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