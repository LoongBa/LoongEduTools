/* ============================================================
   分类整理 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   数据：window.CATEGORIES（icons.js 注入，8 类图标库）
        window.APP_DATA（data.js 注入，build 生成 meta，可缺失）
   玩法：点选底部物品 → 点顶部类别盒 → 正确入盒 / 错误红闪；
        错 3 次后当前物品的正确盒子脉冲提示（防卡关，低龄友好）
   设计约束（对齐 series/益智/设计文档.md §5）：
   - 不使用 import/export / type="module"
   - 不超出 ES2017（无 ?. ?? 对象展开 replaceAll 等）；var + function 风格
   - 事件全部 addEventListener，无内联事件 / eval
   - 无 fetch/XHR/Worker；localStorage 读写 try/catch
   - 音效：Web Audio OscillatorNode 合成（无音频文件，合规）
   - 计时：performance.now() + setInterval(100ms) 按差值刷新（§4.1）
   - 成绩/打卡：localStorage key 带工具前缀 redtools.fenleizhengli.v1
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };
  var CATS = window.CATEGORIES || [];

  /* ---------- DOM ---------- */
  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');
  var footerEl = document.getElementById('app-footer');
  var timerEl = null;
  var errorsEl = null;
  var overlayEl = null;
  var boxEls = [];   // 类别盒 DOM（按下标索引）
  var itemEls = [];  // 物品格 DOM（按 state.items 下标索引）

  /* ---------- 难度定义 ---------- */
  var LEVELS = [
    { key: '2', name: '简单', cats: 2, total: 6 },
    { key: '3', name: '普通', cats: 3, total: 9 },
    { key: '4', name: '困难', cats: 4, total: 12 }
  ];

  /* ---------- 状态 ---------- */
  var state = {
    level: '2',
    cats: [],        // 本局类别对象数组（引用 CATEGORIES 中的对象）
    items: [],       // 本局物品 [{ ci: 类别下标, ii: 图标下标, placed: 是否已归位 }]
    selected: -1,    // 当前选中物品下标（-1 = 无）
    correct: 0,
    errors: 0,
    total: 0,
    won: false,
    started: false,  // 是否已开始计时（首次点选物品时开始，低龄友好）
    startMs: 0,
    ms: 0,
    timerId: 0
  };

  /* ---------- 持久化（redtools.fenleizhengli.v1） ---------- */
  var STORE_KEY = 'redtools.fenleizhengli.v1';
  function defaultStore() {
    return {
      version: 1,
      best: {},                     // { "2": {ms,errors,stars,date}, ... }
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

  /* ---------- 音效（Web Audio 合成，同迷宫寻路） ---------- */
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
  function updateTimerUI() {
    if (timerEl) { timerEl.textContent = '⏱ ' + fmtTime(state.started ? performance.now() - state.startMs : 0); }
  }

  /* ---------- 出题引擎 ---------- */
  function findLevel(key) {
    for (var i = 0; i < LEVELS.length; i++) {
      if (LEVELS[i].key === key) { return LEVELS[i]; }
    }
    return null;
  }
  function pickCats(levelKey) {
    // 从 8 类池随机抽 M 类（Fisher-Yates 洗牌取前 M）
    var n = parseInt(levelKey, 10);
    var pool = shuffle(CATS);
    return pool.slice(0, n);
  }
  function newRound(levelKey) {
    // 每局：随机 M 类 → 每类随机 3 个不同图标 → 全部洗牌
    stopTimer();
    state.level = levelKey;
    state.cats = pickCats(levelKey);
    var items = [];
    for (var ci = 0; ci < state.cats.length; ci++) {
      var idxs = [];
      for (var m = 0; m < state.cats[ci].icons.length; m++) { idxs.push(m); }
      idxs = shuffle(idxs); // 每类至少 4 个图标，取前 3 保证本局内不重复
      for (var k = 0; k < 3; k++) { items.push({ ci: ci, ii: idxs[k], placed: false }); }
    }
    items = shuffle(items);
    state.items = items;
    state.total = items.length;
    state.selected = -1;
    state.correct = 0;
    state.errors = 0;
    state.won = false;
    state.started = false;
    state.startMs = 0;
    state.ms = 0;
  }
  function itemSvg(it) {
    var cat = state.cats[it.ci];
    if (!cat || !cat.icons[it.ii]) { return ''; }
    return cat.icons[it.ii]();
  }

  /* ---------- 渲染：头部 / 页脚 ---------- */
  function renderHeader(title) {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '分类整理';
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
    boxEls = [];
    itemEls = [];
    var level = findLevel(state.level);

    // 顶栏：← 返回 + 难度名 + ⏱ 计时
    var topbar = makeEl('div', 'topbar');
    var btnBack = makeEl('button', 'btn-ghost-sm', '← 返回');
    btnBack.setAttribute('aria-label', '返回难度选择');
    btnBack.addEventListener('click', backToDifficulty);
    topbar.appendChild(btnBack);
    topbar.appendChild(makeEl('span', 'level-title', level ? level.name : ''));
    timerEl = makeEl('span', 'top-timer', '⏱ 00.0');
    topbar.appendChild(timerEl);
    viewEl.appendChild(topbar);

    // 顶部：类别盒子行（flex，间距用 margin，无 gap）
    var catsRow = makeEl('div', 'cats-row');
    for (var ci = 0; ci < state.cats.length; ci++) {
      (function (c) {
        var box = makeEl('div', 'cat-box');
        box.style.borderTopColor = state.cats[c].color;
        var chip = makeEl('div', 'cat-chip');
        chip.innerHTML = state.cats[c].icons[0](); // 类别代表性图标 = 该类首个图标
        var name = makeEl('span', 'cat-name', state.cats[c].name);
        var count = makeEl('span', 'cat-count', '0/3');
        box.appendChild(chip);
        box.appendChild(name);
        box.appendChild(count);
        box.addEventListener('click', function () { onBoxTap(c); });
        boxEls[c] = box;
        catsRow.appendChild(box);
      })(ci);
    }
    viewEl.appendChild(catsRow);

    // 底部：物品格（正方形 3 列：width + padding-bottom 33.33%）
    var grid = makeEl('div', 'items-grid');
    for (var i = 0; i < state.items.length; i++) {
      (function (idx) {
        var cell = makeEl('div', 'item-cell');
        var inner = makeEl('div', 'item-inner');
        inner.innerHTML = itemSvg(state.items[idx]);
        cell.appendChild(inner);
        cell.addEventListener('click', function () { onItemTap(idx); });
        itemEls[idx] = cell;
        grid.appendChild(cell);
      })(i);
    }
    viewEl.appendChild(grid);

    // 空白区点按取消选中（点格子内由 cell 拦截）
    grid.addEventListener('click', function (e) {
      if (e.target === grid) { setSelected(-1); }
    });

    var hint = makeEl('div', 'hint', '👆 点选一个物品，再放进正确的盒子');
    hint.id = 'game-hint';
    viewEl.appendChild(hint);

    updateBoxCounts();
    updateErrorsUI();
    updateTimerUI();
  }

  /* ---------- 交互 ---------- */
  function onItemTap(idx) {
    if (state.won) { return; }
    var it = state.items[idx];
    if (!it || it.placed) { return; }
    ensureAudio(); // 用户手势内创建 AudioContext
    if (!state.started) {
      state.started = true;
      startTimer();
    }
    if (state.selected === idx) {
      setSelected(-1); // 点同一物品 → 取消选中
    } else {
      setSelected(idx); // 点另一物品 → 切换选中
    }
  }
  function setSelected(idx) {
    state.selected = idx;
    for (var i = 0; i < itemEls.length; i++) {
      var cell = itemEls[i];
      if (!cell) { continue; }
      var cls = 'item-cell';
      if (state.items[i].placed) { cls += ' placed'; }
      if (i === idx) { cls += ' selected'; }
      cell.className = cls;
    }
    updateAntiStuck();
  }
  function onBoxTap(ci) {
    if (state.won) { return; }
    var it = (state.selected >= 0) ? state.items[state.selected] : null;
    if (!it) {
      showItemHint(); // 未选物品：轻提示，不启动计时
      return;
    }
    var box = boxEls[ci];
    if (it.ci === ci) {
      // 正确：物品淡出入盒 + 盒子绿色确认
      it.placed = true;
      state.correct++;
      sndCorrect();
      var sel = state.selected;
      setSelected(-1); // 先清选中/高亮（含防卡高亮重置）
      var cell = itemEls[sel];
      if (cell) { cell.className = cell.className + ' placing'; } // 淡出动画 ≤300ms
      if (box) { box.className = box.className + ' correct'; }
      window.setTimeout(function () {
        if (box) { box.className = box.className.replace(' correct', ''); }
        updateBoxCounts();
      }, 300);
      window.setTimeout(function () {
        if (cell) { cell.style.display = 'none'; }
      }, 320);
      if (state.correct >= state.total) { onWin(); }
    } else {
      // 错误：盒子红闪 400ms，物品取消选中留在原地
      state.errors++;
      sndWrong();
      if (box) { box.className = box.className + ' wrong'; }
      (function (b) {
        window.setTimeout(function () {
          if (b) { b.className = b.className.replace(' wrong', ''); }
        }, 400);
      })(box);
      setSelected(-1);
      updateErrorsUI();
    }
  }
  /* 防卡关：错 ≥3 次后，当前选中物品的正确盒子脉冲提示（直到下次正确归位） */
  function updateAntiStuck() {
    for (var i = 0; i < boxEls.length; i++) {
      var box = boxEls[i];
      if (box) { box.className = box.className.replace(' antistuck', ''); }
    }
    if (state.errors >= 3 && state.selected >= 0) {
      var it = state.items[state.selected];
      var b = boxEls[it.ci];
      if (b) { b.className = b.className + ' antistuck'; }
    }
  }
  /* 空盒子点按提示（未选物品时） */
  function showItemHint() {
    var h = document.getElementById('game-hint');
    if (!h) { return; }
    h.textContent = '👆 先选一个物品，再放进盒子';
    h.className = 'hint hint-active';
    window.setTimeout(function () {
      h.className = 'hint';
      h.textContent = '👆 点选一个物品，再放进正确的盒子';
    }, 900);
  }
  /* 每个盒子显示已归位数量 n/3 */
  function updateBoxCounts() {
    var perCat = {};
    for (var i = 0; i < state.items.length; i++) {
      if (state.items[i].placed) {
        var c = state.items[i].ci;
        perCat[c] = (perCat[c] || 0) + 1;
      }
    }
    for (var j = 0; j < boxEls.length; j++) {
      var box = boxEls[j];
      if (!box) { continue; }
      var cnt = perCat[j] || 0;
      var countEl = box.querySelector('.cat-count');
      if (countEl) { countEl.textContent = cnt + '/3'; }
    }
  }
  function updateErrorsUI() {
    if (errorsEl) { errorsEl.textContent = '❌ ' + state.errors; }
  }

  /* ---------- 通关 / 星级 / 最佳 ---------- */
  function calcStars(errors) {
    // 0 错 → 3 星；1~2 错 → 2 星；≥3 错 → 1 星
    if (errors === 0) { return 3; }
    if (errors <= 2) { return 2; }
    return 1;
  }
  function betterThan(errorsA, msA, errorsB, msB) {
    // 最佳成绩判定：错得少优先，同错比用时
    if (errorsA !== errorsB) { return errorsA < errorsB; }
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
    if (!best || betterThan(errors, ms, best.errors, best.ms)) {
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
    showOverlay('🎉 分类完成！', sub, notes, btns);
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
    viewEl.appendChild(makeEl('div', 'home-hint', '把物品放进正确的盒子里，全部放对就过关！'));
    var list = makeEl('div', 'diff-list');
    for (var i = 0; i < LEVELS.length; i++) {
      (function (l) {
        var btn = makeEl('button', 'diff-btn');
        var head = makeEl('span', 'diff-head', '👉 ' + l.name + ' · ' + l.cats + ' 类 ' + l.total + ' 件');
        btn.appendChild(head);
        var best = store.best[l.key];
        var sub = best
          ? '最佳 ' + starsText(best.stars) + ' · ' + fmtBestTime(best.ms) + ' · 错 ' + best.errors
          : '暂无成绩 · 来挑战！';
        btn.appendChild(makeEl('span', 'diff-sub', sub));
        btn.setAttribute('aria-label', l.name + '难度 ' + l.cats + ' 类 ' + l.total + ' 件');
        btn.addEventListener('click', function () { startGame(l.key); });
        list.appendChild(btn);
      })(LEVELS[i]);
    }
    viewEl.appendChild(list);
    renderHomeFooter();
  }
  function startGame(levelKey) {
    if (!CATS.length) {
      viewEl.textContent = '图标库缺失，请检查 icons.js';
      return;
    }
    newRound(levelKey);
    renderGameView();
    renderGameFooter();
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
