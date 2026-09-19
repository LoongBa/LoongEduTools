/* ============================================================
   划消训练 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   数据：window.ELEMENTS（elements.js 注入，73 元素库，draw({fill,variant})）
         window.APP_DATA（data.js 注入，build 生成 meta，可缺失）
   玩法：每轮显示目标图案（大卡）+ 满屏卡片（K 个与目标完全一致 + 其余为
         「带一种小差异」的相似干扰项）——孩子划掉（点击×标记）**所有**目标，
         抗干扰选择训练。点错干扰项红闪 + 错误计数；全部划完进下一轮。
   差异引擎与干扰项去重：移植自 找相同（渲染签名去重，保证干扰项视觉上
   确实与目标不同、彼此不同）。
   设计约束（对齐 series/益智/设计文档.md §5）：
   - 不使用 import/export / type="module"；不超出 ES2017；var + function
   - 事件全部 addEventListener，无内联事件 / eval
   - 无 fetch/XHR/Worker；localStorage 读写 try/catch
   - 音效：Web Audio OscillatorNode 合成（无音频文件，合规）
   - 计时：performance.now() + setInterval(100ms) 按差值刷新（§4.1）
   - 成绩/打卡：localStorage key 带工具前缀 redtools.huaxiaoxunlian.v1
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
  var roundEl = null;
  var targetBoxEl = null;   // 目标大卡
  var cardEls = [];
  var overlayEl = null;

  /* ---------- 难度定义 ---------- */
  var LEVELS = [
    { key: '1', name: '简单', rounds: 5, cards: 12, targets: 4 },
    { key: '2', name: '普通', rounds: 6, cards: 16, targets: 5 },
    { key: '3', name: '困难', rounds: 8, cards: 20, targets: 6 }
  ];

  /* ---------- 状态 ---------- */
  var state = {
    level: '1',
    round: 0,           // 1..rounds
    cards: [],          // [{ svgKey, isTarget, marked }]
    targetKey: '',      // 目标渲染签名（比对用）
    markedCount: 0,     // 已划掉目标数
    targetTotal: 0,
    errors: 0,
    won: false,
    startMs: 0,
    ms: 0,
    timerId: 0
  };

  /* ---------- 持久化（redtools.huaxiaoxunlian.v1） ---------- */
  var STORE_KEY = 'redtools.huaxiaoxunlian.v1';
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
      cur.setDate(cur.getDate() - 1);
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
  function pickRand(arr) { return arr[randInt(arr.length)]; }
  function randRange(min, max) { return min + randInt(max - min + 1); }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

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

  /* ---------- 差异引擎（移植自找相同，渲染签名去重） ---------- */
  function hex2rgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function rgb2hex(r, g, b) {
    function chan(v) {
      var c = clamp(Math.round(v), 0, 255);
      var s = c.toString(16);
      return s.length === 1 ? '0' + s : s;
    }
    return '#' + chan(r) + chan(g) + chan(b);
  }
  function shadeHex(hex, amt) {
    // amt ∈ (-1,1)：负变暗正变亮
    var rgb = hex2rgb(hex);
    var k = amt >= 0 ? amt : amt * 2;
    return rgb2hex(
      rgb[0] + (amt >= 0 ? (255 - rgb[0]) * k : rgb[0] * k),
      rgb[1] + (amt >= 0 ? (255 - rgb[1]) * k : rgb[1] * k),
      rgb[2] + (amt >= 0 ? (255 - rgb[2]) * k : rgb[2] * k)
    );
  }
  function applyOp(e, op, levelKey, p) {
    var np = { fill: p.fill, variant: p.variant, s: p.s, dx: p.dx, dy: p.dy };
    if (op === 'recolor') {
      var newFill = null;
      var alts = [];
      var pal = e.palette || [];
      if (levelKey === '1') {
        // 明显：palette 对比色
        for (var i = 0; i < pal.length; i++) { if (pal[i] !== p.fill) { alts.push(pal[i]); } }
        if (alts.length) { newFill = pickRand(alts); }
      } else if (levelKey === '2') {
        // 中等：50% palette 对比色 / 50% 近似色
        if (Math.random() < 0.5) {
          for (var j = 0; j < pal.length; j++) { if (pal[j] !== p.fill) { alts.push(pal[j]); } }
          if (alts.length) { newFill = pickRand(alts); }
        }
        if (!newFill) {
          var amt2 = 0.18 + Math.random() * 0.1;
          newFill = shadeHex(p.fill, Math.random() < 0.5 ? amt2 : -amt2);
        }
      } else {
        // 细微：近似色 ±5~13%
        var amt3 = 0.05 + Math.random() * 0.08;
        newFill = shadeHex(p.fill, Math.random() < 0.5 ? amt3 : -amt3);
      }
      if (!newFill) { return null; }
      np.fill = newFill;
    } else if (op === 'scale') {
      if (levelKey === '1') { np.s = Math.random() < 0.5 ? 1.4 : 0.7; }
      else if (levelKey === '2') { np.s = Math.random() < 0.5 ? 1.25 : 0.8; }
      else {
        var k = Math.random() < 0.5 ? 1 : -1;
        np.s = Math.round((1 + k * (0.08 + Math.random() * 0.05)) * 100) / 100;
      }
    } else if (op === 'variant') {
      np.variant = (p.variant + 1) % (e.variantMax + 1);
    } else if (op === 'move') {
      var range = (levelKey === '2') ? [10, 16] : [5, 9];
      var d1 = randRange(range[0], range[1]);
      var d2 = randRange(range[0], range[1]);
      np.dx = (Math.random() < 0.5 ? -1 : 1) * d1;
      np.dy = (Math.random() < 0.5 ? -1 : 1) * d2;
    }
    return np;
  }
  function opWeights(levelKey, e) {
    var w = {};
    w.recolor = 4;
    w.scale = 3;
    if (e.variantMax > 0) { w.variant = 2; }
    if (levelKey !== '1') { w.move = 2; }
    return w;
  }
  function pickWeightedOp(w) {
    var keys = [];
    var total = 0;
    for (var k in w) {
      if (w.hasOwnProperty(k)) { keys.push(k); total += w[k]; }
    }
    var r = Math.random() * total;
    var acc = 0;
    for (var i = 0; i < keys.length; i++) {
      acc += w[keys[i]];
      if (r < acc) { return keys[i]; }
    }
    return keys[keys.length - 1];
  }
  /* 渲染签名：draw 可能忽略 fill/variant，必须用渲染结果去重（同找相同） */
  function elementCardSvg(e, p) {
    var inner = e.draw({ fill: p.fill, variant: p.variant });
    var tx = 'translate(' + p.dx + ',' + p.dy + ')';
    if (p.s !== 1) { tx += ' scale(' + p.s + ')'; }
    return '<svg class="card-svg" viewBox="-50 -50 100 100" xmlns="http://www.w3.org/2000/svg">' +
      '<g transform="' + tx + '">' + inner + '</g></svg>';
  }
  /* 生成干扰项（渲染签名去重）：与目标/彼此渲染结果均不同 */
  function buildDistractors(e, levelKey, targetP, count) {
    var used = [elementCardSvg(e, targetP)];
    var out = [];
    for (var n = 0; n < count; n++) {
      var made = null;
      for (var guard = 0; guard < 60 && !made; guard++) {
        var w = opWeights(levelKey, e);
        var op = pickWeightedOp(w);
        var p = applyOp(e, op, levelKey, targetP);
        if (!p) { continue; }
        var sig = elementCardSvg(e, p);
        if (used.indexOf(sig) !== -1) { continue; }
        used.push(sig);
        made = { p: p };
      }
      if (!made) {
        // 兜底：scale 递增直到渲染结果可用（与已用签名去重）
        for (var bk = 1; bk <= 10; bk++) {
          var fp = { fill: targetP.fill, variant: targetP.variant, s: 1.1 + bk * 0.15, dx: 0, dy: 0 };
          var fsig = elementCardSvg(e, fp);
          if (used.indexOf(fsig) === -1) {
            used.push(fsig);
            made = { p: fp };
            break;
          }
        }
        if (!made) { made = { p: { fill: targetP.fill, variant: targetP.variant, s: 3.2, dx: 0, dy: 0 } }; } // 理论不可达
      }
      out.push(made);
    }
    return out;
  }

  /* ---------- 出题 ---------- */
  function findLevel(key) {
    for (var i = 0; i < LEVELS.length; i++) {
      if (LEVELS[i].key === key) { return LEVELS[i]; }
    }
    return null;
  }
  var usedElementIds = [];
  function pickRoundElement() {
    if (usedElementIds.length >= ELEMENTS.length) { usedElementIds = []; }
    var pool = [];
    for (var i = 0; i < ELEMENTS.length; i++) {
      if (usedElementIds.indexOf(ELEMENTS[i].id) === -1) { pool.push(ELEMENTS[i]); }
    }
    if (!pool.length) { pool = ELEMENTS.slice(); }
    var e = pickRand(pool);
    usedElementIds.push(e.id);
    return e;
  }
  function newRound() {
    var lv = findLevel(state.level);
    var e = pickRoundElement();
    var targetP = { fill: e.fill, variant: 0, s: 1, dx: 0, dy: 0 };
    state.targetKey = elementCardSvg(e, targetP);
    var dists = buildDistractors(e, state.level, targetP, lv.cards - lv.targets);
    var cards = [];
    for (var t = 0; t < lv.targets; t++) {
      cards.push({ svgKey: state.targetKey, isTarget: true, marked: false });
    }
    for (var d = 0; d < dists.length; d++) {
      cards.push({ svgKey: elementCardSvg(e, dists[d].p), isTarget: false, marked: false });
    }
    state.cards = shuffle(cards);
    state.targetTotal = lv.targets;
    state.markedCount = 0;
  }

  /* ---------- 渲染：头部 / 页脚 ---------- */
  function renderHeader(title) {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '划消训练';
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
    cardEls = [];
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

    // 轮次 + 进度
    roundEl = makeEl('div', 'mark-round', '');
    viewEl.appendChild(roundEl);

    // 目标大卡
    targetBoxEl = makeEl('div', 'mark-target');
    viewEl.appendChild(targetBoxEl);

    // 状态提示
    var statusEl = makeEl('div', 'game-status', '划掉所有和它一样的！');
    statusEl.id = 'mark-status';
    viewEl.appendChild(statusEl);

    // 卡片网格（按卡片数定列：12/16/20 → 4 列 × 3/4/5 行）
    var grid = makeEl('div', 'mark-grid');
    for (var i = 0; i < state.cards.length; i++) {
      (function (idx) {
        var cell = makeEl('div', 'mark-cell');
        var inner = makeEl('div', 'mark-inner');
        inner.innerHTML = state.cards[idx].svgKey;
        cell.appendChild(inner);
        cell.addEventListener('click', function () { onCardTap(idx); });
        cardEls[idx] = cell;
        grid.appendChild(cell);
      })(i);
    }
    viewEl.appendChild(grid);

    reflectRound();
  }
  function reflectRound() {
    if (roundEl) { roundEl.textContent = '第 ' + state.round + '/' + findLevel(state.level).rounds + ' 轮 · 已划 ' + state.markedCount + '/' + state.targetTotal; }
    if (targetBoxEl) { targetBoxEl.innerHTML = '<span class="mark-target-label">要找这个</span>' + state.targetKey; }
  }
  function refreshCardClasses() {
    for (var i = 0; i < cardEls.length; i++) {
      var cell = cardEls[i];
      if (!cell) { continue; }
      if (state.cards[i].marked) {
        cell.className = 'mark-cell marked';
      } else {
        cell.className = 'mark-cell';
      }
    }
  }

  /* ---------- 交互 ---------- */
  function updateErrorsUI() {
    if (errorsEl) { errorsEl.textContent = '❌ ' + state.errors; }
  }
  function onCardTap(idx) {
    if (state.won) { return; }
    ensureAudio();
    var card = state.cards[idx];
    if (card.marked) { return; }
    if (card.isTarget) {
      // 划掉一个目标：红叉覆盖 + 计数
      card.marked = true;
      state.markedCount++;
      sndCorrect();
      refreshCardClasses();
      reflectRound();
      if (state.markedCount >= state.targetTotal) {
        state.phase = 'idle';
        setTimeout(function () { nextRoundOrWin(); }, 500);
      }
    } else {
      // 点错干扰项：红闪 + 错误
      state.errors++;
      sndWrong();
      var cell = cardEls[idx];
      if (cell) { cell.className = 'mark-cell wrong'; }
      (function (c) {
        setTimeout(function () { if (c) { c.className = 'mark-cell'; } }, 400);
      })(cell);
      updateErrorsUI();
    }
  }
  function nextRoundOrWin() {
    if (state.round >= findLevel(state.level).rounds) {
      onWin();
    } else {
      state.round++;
      newRound();
      renderGameView();
    }
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
    showOverlay('🎉 全部划掉啦！', sub, notes, btns);
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
    viewEl.appendChild(makeEl('div', 'home-hint', '看目标图案，把下面所有和它一模一样的都划掉！'));
    var list = makeEl('div', 'diff-list');
    for (var i = 0; i < LEVELS.length; i++) {
      (function (l) {
        var btn = makeEl('button', 'diff-btn');
        var head = makeEl('span', 'diff-head', '👉 ' + l.name + ' · ' + l.rounds + ' 轮 · 每轮划 ' + l.targets + ' 个');
        btn.appendChild(head);
        var best = store.best[l.key];
        var sub = best
          ? '最佳 ' + starsText(best.stars) + ' · ' + fmtBestTime(best.ms) + ' · 错 ' + best.errors
          : '暂无成绩 · 来挑战！';
        btn.appendChild(makeEl('span', 'diff-sub', sub));
        btn.setAttribute('aria-label', l.name + '难度 ' + l.rounds + '轮');
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
    stopTimer();
    state.level = levelKey;
    state.round = 1;
    state.errors = 0;
    state.won = false;
    state.startMs = 0;
    state.ms = 0;
    newRound();
    renderGameView();
    renderGameFooter();
    startTimer();
  }
  function backToDifficulty() {
    hideOverlay();
    stopTimer();
    showDifficultyView();
  }
  function restartGame() {
    hideOverlay();
    stopTimer();
    state.round = 1;
    state.errors = 0;
    state.won = false;
    state.startMs = 0;
    state.ms = 0;
    newRound();
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