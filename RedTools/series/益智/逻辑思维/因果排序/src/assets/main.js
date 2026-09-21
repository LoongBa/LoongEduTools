/* ============================================================
   因果排序 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   数据：window.CAUSALS（causals.js 注入，8 条序列卡片库）
         window.APP_DATA（data.js 注入，build 生成 meta，可缺失）
   玩法：打乱卡片按因果/时间顺序排好（交换排序，简单拼图交互模式）
   - 选难度（3/4/5 步）→ 随机取同步数序列 → 洗牌打乱（防已还原重洗）
   - 点选一张卡片（橙色高亮）→ 点另一张 → 交换位置（步数+1）
     → 点已选中卡片取消选中
   - 全部卡归位（cards[i].stepIdx === i）→ 绿色闪烁 → 计时/星级/
     新纪录/打卡/成绩历史
   - 提示：高亮第一张错位卡片 1.2s（不自动归位），星级封顶 2★
   星级：★★★ hints=0 且 moves<=N*2-1；★★ hints<=1 且 moves<=N*3；其余 1★
   设计约束（对齐 series/益智/设计文档.md §5）：
   - 不使用 import/export / type="module"
   - 不超出 ES2017（无 ?. ?? 对象展开 replaceAll 等）；var + function 风格
   - 事件全部 addEventListener，无内联事件 / eval
   - 无 fetch/XHR/Worker；localStorage 读写 try/catch
   - 音效：Web Audio OscillatorNode 合成（无音频文件，合规）
   - 计时：performance.now() + setInterval(100ms) 差值刷新（§4.1），
     从游戏页渲染开始计时（整局计时）
   - 成绩/打卡：localStorage key 带工具前缀 redtools.yinguopaixu.v1
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };
  var CAUSALS = window.CAUSALS || [];

  /* ---------- DOM ---------- */
  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');
  var footerEl = document.getElementById('app-footer');
  var timerEl = null;
  var hintBtnEl = null;
  var cardEls = [];   // 卡片外层 DOM（按槽位索引）

  /* ---------- 难度定义（步数 N，星级阈值按 N 派生） ---------- */
  var LEVELS = [
    { key: '3', name: '简单', stepN: 3 },
    { key: '4', name: '普通', stepN: 4 },
    { key: '5', name: '困难', stepN: 5 }
  ];
  /* 各难度可取序列（按步数硬编码） */
  var SEQ_POOL = {
    '3': ['daycycle', 'bloom'],
    '4': ['morning', 'butterfly', 'cake', 'frog'],
    '5': ['plant', 'wash']
  };

  /* ---------- 状态 ---------- */
  var state = {
    level: '3',        // 难度 key '3'|'4'|'5'
    stepN: 3,          // 本局步数
    seq: null,         // 当前序列 { id, name, steps: [drawFn,...] }
    cards: [],         // 打乱后数组：cards[i]={ stepIdx }，i 为槽位，stepIdx 为目标位
    selected: -1,      // 当前选中槽位（-1 无）
    moves: 0,          // 交换次数
    hints: 0,          // 提示次数（用提示星级封顶 2★）
    won: false,
    playing: false,    // 是否在游戏页
    startMs: 0,
    ms: 0,
    timerId: 0
  };

  /* ---------- 持久化（redtools.yinguopaixu.v1） ---------- */
  var STORE_KEY = 'redtools.yinguopaixu.v1';
  LX_SHARED.storage.configure({ toolName: 'yinguopaixu' });  // V0.4 迁移：键前缀 redtools.yinguopaixu.v1
  function defaultStore() {
    return {
      version: 1,
      best: {},                     // { "3": {ms,moves,hints,stars,date}, ... }
      recent: {},                   // 各难度最近用时 ms
      checkin: { dates: [], streak: 0 },
      history: []                   // 滚动 30 条 {date,level,ms,moves,hints,stars}
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
    // 分:秒，如 01:23
    var total = Math.max(0, Math.round(ms / 1000));
    var m = Math.floor(total / 60);
    var s = total % 60;
    return (m < 10 ? '0' + m : '' + m) + ':' + (s < 10 ? '0' + s : '' + s);
  }
  function findLevel(key) {
    var i;
    for (i = 0; i < LEVELS.length; i++) {
      if (LEVELS[i].key === key) { return LEVELS[i]; }
    }
    return LEVELS[0];
  }
  function findSeq(id) {
    var i;
    for (i = 0; i < CAUSALS.length; i++) {
      if (CAUSALS[i].id === id) { return CAUSALS[i]; }
    }
    return null;
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
  /* 数组是否恰好全部归位（cards[i].stepIdx === i） */
  function isSortedArr(arr, n) {
    for (var i = 0; i < n; i++) {
      if (arr[i].stepIdx !== i) { return false; }
    }
    return true;
  }
  /* 当前局是否已全部归位 */
  function isSolved() {
    for (var i = 0; i < state.cards.length; i++) {
      if (state.cards[i].stepIdx !== i) { return false; }
    }
    return true;
  }
  /* 第一张错位卡片槽位（-1 表示全部归位） */
  function firstMisplaced() {
    for (var i = 0; i < state.cards.length; i++) {
      if (state.cards[i].stepIdx !== i) { return i; }
    }
    return -1;
  }

  /* ---------- 音效（Web Audio 合成，同数独入门/分类整理） ---------- */
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
  function sndClick() { tone(520, 0.05, 'triangle', 0.05, 0); }
  function sndCorrect() { tone(660, 0.08, 'sine', 0.1, 0); tone(990, 0.12, 'sine', 0.1, 0.09); }
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
    if (timerEl) { timerEl.textContent = '⏱ ' + fmtTime(state.won ? state.ms : 0); }
  }

  /* ---------- 渲染：头部 / 页脚 ---------- */
  function renderHeader(title) {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '因果排序';
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
    var movesEl = makeEl('span', 'footer-moves', '步数 0');
    movesEl.id = 'game-moves';
    bar.appendChild(btnBack);
    bar.appendChild(btnRestart);
    bar.appendChild(movesEl);
    footerEl.appendChild(bar);
  }
  function updateStatus() {
    var el = document.getElementById('status-moves');
    if (el) { el.textContent = '步数 ' + state.moves + ' · 提示 ' + state.hints; }
    var fe = document.getElementById('game-moves');
    if (fe) { fe.textContent = '步数 ' + state.moves; }
  }

  /* ---------- 卡片 SVG ---------- */
  /* 槽位 p 当前所放卡片的完整 <svg>（由对应 drawFn 生成） */
  function cardSvg(p) {
    var fn = state.seq.steps[p.stepIdx];
    return fn ? fn() : '';
  }
  function updateCardSvg(slot) {
    var el = cardEls[slot];
    if (!el) { return; }
    var inner = el.querySelector('.caus-card-inner');
    if (!inner) { return; }
    inner.innerHTML = cardSvg(state.cards[slot]);
  }

  /* ---------- 渲染：游戏视图 ---------- */
  function renderGameView() {
    clearNode(viewEl);
    cardEls = [];
    var lv = findLevel(state.level);

    // 顶栏：← 返回 + 难度名（含步数/序列名）+ ⏱ 计时
    var topbar = makeEl('div', 'topbar');
    var btnBack = makeEl('button', 'btn-ghost-sm', '← 返回');
    btnBack.setAttribute('aria-label', '返回难度选择');
    btnBack.addEventListener('click', backToDifficulty);
    topbar.appendChild(btnBack);
    var title = makeEl('span', 'level-title', lv.name);
    title.appendChild(makeEl('small', '', lv.stepN + ' 步 · ' + state.seq.name));
    topbar.appendChild(title);
    timerEl = makeEl('span', 'top-timer', '⏱ 00.0');
    topbar.appendChild(timerEl);
    viewEl.appendChild(topbar);

    // 题面：序列名（把「XX」按顺序排好）
    viewEl.appendChild(makeEl('div', 'caus-title', '把「' + state.seq.name + '」按顺序排好'));

    // 卡片网格：正方形卡 width + padding-bottom %（3/5 步→33.3333%、4 步→25%）
    var grid = makeEl('div', 'caus-grid grid-' + lv.stepN);
    for (var i = 0; i < state.cards.length; i++) {
      (function (slot) {
        var wrap = makeEl('div', 'caus-card');
        var inner = makeEl('div', 'caus-card-inner');
        inner.innerHTML = cardSvg(state.cards[slot]);
        wrap.appendChild(inner);
        wrap.addEventListener('click', function () { onCardTap(slot); });
        cardEls[slot] = wrap;
        grid.appendChild(wrap);
      })(i);
    }
    viewEl.appendChild(grid);

    // 操作行：提示按钮 + 步数/提示统计
    var ops = makeEl('div', 'status-row');
    var hintBtn = makeEl('button', 'tool-btn hint-btn', '💡 提示');
    hintBtn.setAttribute('aria-label', '提示：高亮第一张错位的卡片');
    hintBtn.addEventListener('click', useHint);
    hintBtnEl = hintBtn;
    ops.appendChild(hintBtn);
    var movesEl = makeEl('div', 'status-text', '步数 0 · 提示 0');
    movesEl.id = 'status-moves';
    ops.appendChild(movesEl);
    viewEl.appendChild(ops);

    updateStatus();
  }

  /* ---------- 交互：点选 / 交换 ---------- */
  function onCardTap(slot) {
    if (state.won) { return; }
    var el = cardEls[slot];
    if (state.selected === -1) {
      // 第一张：选中（橙色高亮 + 轻微抬起）
      state.selected = slot;
      el.className = el.className + ' selected';
      sndClick();
    } else if (state.selected === slot) {
      // 同一张：取消选中
      state.selected = -1;
      el.className = el.className.replace(' selected', '');
      sndClick();
    } else {
      // 第二张：交换位置
      var a = state.selected;
      cardEls[a].className = cardEls[a].className.replace(' selected', '');
      state.selected = -1;
      swapSlots(a, slot);
    }
  }

  /* 交换槽位 a、b 上的两张卡：换数组 + 重渲染两个 svg + 弹跳动画（280ms） */
  function swapSlots(a, b) {
    var t = state.cards[a];
    state.cards[a] = state.cards[b];
    state.cards[b] = t;
    updateCardSvg(a);
    updateCardSvg(b);
    animateSwap(a);
    animateSwap(b);
    sndClick();
    state.moves += 1;
    updateStatus();
    if (isSolved()) { finishGame(); }
  }
  function animateSwap(slot) {
    var el = cardEls[slot];
    if (!el) { return; }
    el.className = el.className + ' swap-anim';
    window.setTimeout(function () {
      if (el.className && el.className.indexOf('swap-anim') >= 0) {
        el.className = el.className.replace(' swap-anim', '');
      }
    }, 280);
  }

  /* ---------- 提示 ---------- */
  /* 高亮第一张错位卡片 1.2s（温和脉冲，不自动归位），提示次数 +1（星级封顶 2★） */
  function useHint() {
    if (state.won) { return; }
    var idx = firstMisplaced();
    if (idx < 0) { return; }
    state.hints += 1;
    updateStatus();
    hintFlash(idx);
    sndCorrect();
  }
  function hintFlash(slot) {
    var el = cardEls[slot];
    if (!el) { return; }
    el.className = el.className.replace(' hinting', '') + ' hinting';
    window.setTimeout(function () {
      if (el.className) { el.className = el.className.replace(' hinting', ''); }
    }, 1200);
  }

  /* ---------- 星级 / 最佳 ---------- */
  function calcStars(hints, moves, stepN) {
    // ★★★ hints=0 且 moves<=N*2-1（3→5、4→7、5→9）
    // ★★ hints<=1 且 moves<=N*3（3→9、4→12、5→15）；其余 1★
    if (hints === 0 && moves <= stepN * 2 - 1) { return 3; }
    if (hints <= 1 && moves <= stepN * 3) { return 2; }
    return 1;
  }
  function betterThan(starsA, msA, starsB, msB) {
    // 最佳成绩判定：星级高优先，同星级比用时
    if (starsA !== starsB) { return starsA > starsB; }
    return msA < msB;
  }
  function starsText(n) {
    var s = '';
    for (var i = 0; i < 3; i++) { s += (i < n) ? '★' : '☆'; }
    return s;
  }

  /* ---------- 通关 / 结算 ---------- */
  function finishGame() {
    if (state.won) { return; }
    state.won = true;
    stopTimer();
    state.ms = performance.now() - state.startMs;
    updateTimerUI();
    if (hintBtnEl) { hintBtnEl.disabled = true; }
    // 全部卡片绿色边框闪烁（0.4s 动画），350ms 后弹结算
    for (var i = 0; i < cardEls.length; i++) {
      cardEls[i].className = cardEls[i].className + ' solved';
    }
    sndCorrect();
    sndWin();
    window.setTimeout(function () {
      showSettlement();
    }, 350);
  }
  function showSettlement() {
    var ms = Math.round(state.ms);
    var moves = state.moves;
    var hints = state.hints;
    var stars = calcStars(hints, moves, state.stepN);
    var key = state.level;

    // 打卡：完成一局即点亮今日
    doCheckin();

    // 最佳 / 最近 / 历史（星级高优先，同星级比用时，仅严格更优覆盖）
    var isNewBest = false;
    var best = store.best[key];
    if (!best || betterThan(stars, ms, best.stars, best.ms)) {
      store.best[key] = { ms: ms, moves: moves, hints: hints, stars: stars, date: fmtDate(new Date()) };
      isNewBest = true;
    }
    store.recent[key] = ms;
    store.history.push({ date: fmtDate(new Date()), level: key, ms: ms, moves: moves, hints: hints, stars: stars });
    while (store.history.length > 30) { store.history.shift(); }
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
    var sub = '用时 ' + fmtTime(ms) + ' 秒 · 步数 ' + moves + ' 次 · 提示 ' + hints + ' 次';
    showOverlay('🎉 排好啦！', sub, notes, btns);
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
    state.playing = false;
    renderHeader();
    clearNode(viewEl);
    viewEl.appendChild(makeEl('div', 'page-title', '选择难度'));
    viewEl.appendChild(makeEl('div', 'home-hint', '看图识因果：点两张卡片交换顺序，把「事情发生的先后」排对就过关！'));
    var list = makeEl('div', 'diff-list');
    for (var i = 0; i < LEVELS.length; i++) {
      (function (l) {
        var btn = makeEl('button', 'diff-btn');
        var head = makeEl('span', 'diff-head', '👉 ' + l.name + ' · 排 ' + l.stepN + ' 步');
        btn.appendChild(head);
        btn.appendChild(makeEl('span', 'diff-tag', poolNames(l)));
        var best = store.best[l.key];
        var sub = best
          ? '最佳 ' + starsText(best.stars) + ' · ' + fmtBestTime(best.ms) + ' · 步 ' + best.moves + ' · 提示 ' + best.hints
          : '暂无成绩 · 来挑战！';
        btn.appendChild(makeEl('span', 'diff-sub', sub));
        btn.setAttribute('aria-label', l.name + '难度 排' + l.stepN + '步');
        btn.addEventListener('click', function () { startGame(l.key); });
        list.appendChild(btn);
      })(LEVELS[i]);
    }
    viewEl.appendChild(list);
    renderHomeFooter();
  }
  function poolNames(l) {
    var pool = SEQ_POOL[l.key] || [];
    var names = [];
    for (var i = 0; i < pool.length; i++) {
      var s = findSeq(pool[i]);
      if (s) { names.push(s.name); }
    }
    return names.join(' / ');
  }

  /* ---------- 出题引擎 ---------- */
  /* 随机取一条步数匹配的序列（难度池未命中则全库兜底） */
  function pickSequence(lv) {
    var pool = SEQ_POOL[lv.key] || [];
    var cands = [];
    for (var i = 0; i < pool.length; i++) {
      var s = findSeq(pool[i]);
      if (s) { cands.push(s); }
    }
    if (!cands.length) {
      for (var j = 0; j < CAUSALS.length; j++) {
        if (CAUSALS[j].steps.length === lv.stepN) { cands.push(CAUSALS[j]); }
      }
    }
    return cands[Math.floor(Math.random() * cands.length)];
  }
  /* 打乱序列步骤：cards[i].stepIdx 为目标步骤；防「恰好还原」重洗（guard<=100） */
  function buildCards(seq) {
    var n = seq.steps.length;
    var arr = [];
    var i;
    for (i = 0; i < n; i++) { arr.push({ stepIdx: i }); }
    var out = shuffle(arr);
    var guard = 0;
    while (isSortedArr(out, n) && guard < 100) {
      out = shuffle(arr);
      guard += 1;
    }
    return out;
  }
  function newRound(levelKey) {
    var lv = findLevel(levelKey);
    var s = pickSequence(lv);
    state.level = lv.key;
    state.stepN = lv.stepN;
    state.seq = s;
    state.cards = buildCards(s);
    state.selected = -1;
    state.moves = 0;
    state.hints = 0;
    state.won = false;
    state.playing = true;
    state.startMs = 0;
    state.ms = 0;
  }
  function startGame(levelKey) {
    if (!CAUSALS.length) {
      viewEl.textContent = '序列库缺失，请检查 causals.js';
      return;
    }
    newRound(levelKey);
    renderGameView();
    renderGameFooter();
    startTimer(); // 计时从游戏页渲染开始（整局计时）
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
  var overlayEl = null;
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
    state.playing = false;
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