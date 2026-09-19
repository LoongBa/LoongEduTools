/* ============================================================
   看图猜成语 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   数据：window.APP_DATA（build 注入 meta）+ window.CHENGYU_DATA（共享成语词库）
   玩法：展示 emoji 拼图 + 字格占位 → 4 选 1 点选猜成语 →
         答对绿标+连击+提示音自动下一题；答错红闪+亮正确答案即时纠错。
         模式：练一练（自由刷题）/ 挑战 10 题（计时+打卡+星级+成绩+分享卡片）。
         年级段分池：1-2 / 3-4 / 5-6 年级（词库年级标签驱动）。
   设计约束（对齐 series/学科/设计文档.md §1 / 反义词配对）：
   - 不使用 import/export / type="module"；不超出 ES2017；var + function
   - 事件全部 addEventListener，无内联事件 / eval / new Function
   - 无 fetch/XHR/Worker；动态内容一律 createElement + textContent（无 innerHTML 注入）
   - 音效：Web Audio OscillatorNode 合成（无音频文件，合规）
   - 计时：performance.now() + setInterval(100ms) 按差值刷新
   - 成绩/打卡/分享：localStorage 单 key redtools.kantucy.v1
   - 分享卡片：离屏 canvas 1080×1920（不用 ctx.roundRect，Chrome 99+）
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };

  /* ---------- 共享词库 → 可玩题池（emoji 拼图非空） ---------- */
  var ITEMS = [];
  function buildItems() {
    var src = (window.CHENGYU_DATA && window.CHENGYU_DATA.课本) || [];
    ITEMS = [];
    for (var i = 0; i < src.length; i++) {
      var it = src[i];
      if (it && it.成语 && it.emoji) { ITEMS.push(it); }
    }
  }
  function inBand(it, key) {
    var g = it.年级 || [];
    if (key === 'b12') { return g.indexOf(1) >= 0 || g.indexOf(2) >= 0; }
    if (key === 'b34') { return g.indexOf(3) >= 0 || g.indexOf(4) >= 0; }
    return g.indexOf(5) >= 0 || g.indexOf(6) >= 0;
  }
  var POOLS = { b12: [], b34: [], b56: [] };
  function buildPools() {
    POOLS = { b12: [], b34: [], b56: [] };
    for (var i = 0; i < ITEMS.length; i++) {
      var it = ITEMS[i];
      if (inBand(it, 'b12')) { POOLS.b12.push(it); }
      if (inBand(it, 'b34')) { POOLS.b34.push(it); }
      if (inBand(it, 'b56')) { POOLS.b56.push(it); }
    }
  }

  var BANDS = [
    { key: 'b12', name: '1-2 年级', pool: POOLS.b12.length },
    { key: 'b34', name: '3-4 年级', pool: POOLS.b34.length },
    { key: 'b56', name: '5-6 年级', pool: POOLS.b56.length }
  ];
  function findBand(key) {
    for (var i = 0; i < BANDS.length; i++) {
      if (BANDS[i].key === key) { return BANDS[i]; }
    }
    return BANDS[0];
  }
  function poolOf(key) { return POOLS[key] || []; }

  /* ---------- DOM ---------- */
  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');
  var footerEl = document.getElementById('app-footer');
  var timerEl = null;
  var progressEl = null;
  var comboEl = null;
  var optionEls = [];
  var overlayEl = null;
  var shareEl = null;

  /* ---------- 状态 ---------- */
  var state = {
    view: 'home',
    mode: 'practice',          // 'practice' | 'challenge'
    band: 'b12',
    round: [],                 // [{ item, options:[], answerIdx }]
    qIndex: 0,
    correct: 0,
    errors: 0,
    combo: 0,
    maxCombo: 0,
    startMs: 0,
    ms: 0,
    timerId: 0,
    won: false,
    answering: false,
    result: null               // 结算统计 { correct, ms, stars, errors, maxCombo }
  };

  /* ---------- 持久化（redtools.kantucy.v1） ---------- */
  var STORE_KEY = 'redtools.kantucy.v1';
  function defaultStore() {
    return {
      version: 1,
      best: {},
      recent10: {},
      checkin: { dates: [], streak: 0 },
      history: []
    };
  }
  function loadStore() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        var obj = JSON.parse(raw);
        if (obj && obj.version === 1) {
          if (!obj.best) { obj.best = {}; }
          if (!obj.recent10) { obj.recent10 = {}; }
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
  function starsText(n) {
    var s = '';
    for (var i = 0; i < 3; i++) { s += (i < n) ? '★' : '☆'; }
    return s;
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
  function sndCorrect() { tone(523, 0.09, 'triangle', 0.1); tone(659, 0.09, 'triangle', 0.1, 0.09); }
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

  /* ---------- 出题 ---------- */
  function pickDistractors(pool, answerWord, count) {
    var picked = [];
    var cands = shuffle(pool);
    for (var i = 0; i < cands.length && picked.length < count; i++) {
      if (cands[i].成语 !== answerWord && picked.indexOf(cands[i].成语) < 0) {
        picked.push(cands[i].成语);
      }
    }
    return picked;
  }
  function buildQuestion(bandKey, avoidWord) {
    var pool = poolOf(bandKey);
    var cands = shuffle(pool);
    var answer = null;
    for (var i = 0; i < cands.length; i++) {
      if (cands[i].成语 === avoidWord) { continue; }
      answer = cands[i];
      break;
    }
    if (!answer) { answer = cands[0] || null; }
    var options = [answer.成语].concat(pickDistractors(pool, answer.成语, 3));
    options = shuffle(options);
    return {
      item: answer,
      options: options,
      answerIdx: options.indexOf(answer.成语)
    };
  }
  function pickRoundAnswers(bandKey, count) {
    var pool = poolOf(bandKey);
    var cands = shuffle(pool);
    var out = [];
    for (var i = 0; i < cands.length && out.length < count; i++) {
      out.push(cands[i]);
    }
    return out;
  }
  function newRound(bandKey, mode) {
    stopTimer();
    state.mode = mode;
    state.band = bandKey;
    state.correct = 0;
    state.errors = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.startMs = 0;
    state.ms = 0;
    state.won = false;
    state.answering = false;
    state.result = null;
    if (mode === 'challenge') {
      var answers = pickRoundAnswers(bandKey, 10);
      state.round = [];
      for (var i = 0; i < answers.length; i++) {
        state.round.push(buildQuestion(bandKey, ''));
      }
    } else {
      state.round = [buildQuestion(bandKey, '')];
    }
    state.qIndex = 0;
  }
  function currentQ() { return state.round[state.qIndex]; }

  /* ---------- 渲染：头部 / 页脚 ---------- */
  function renderHeader(title) {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '看图猜成语';
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
    var hint = (state.mode === 'challenge')
      ? '挑战 10 题 · 完成即打卡'
      : '练一练 · 看 emoji 猜成语';
    bar.appendChild(makeEl('span', 'game-hint', hint));
    footerEl.appendChild(bar);
  }

  /* ---------- 渲染：首页 ---------- */
  function showHomeView() {
    stopTimer();
    state.view = 'home';
    state.won = false;
    renderHeader();
    clearNode(viewEl);
    viewEl.appendChild(makeEl('div', 'page-title', '看图猜成语'));
    viewEl.appendChild(makeEl('div', 'home-hint', '👀 看 emoji 拼图，点选猜成语（选个年级段）'));

    var list = makeEl('div', 'band-list');
    for (var i = 0; i < BANDS.length; i++) {
      (function (b) {
        var card = makeEl('div', 'band-card');
        var head = makeEl('div', 'band-head');
        head.appendChild(makeEl('span', 'band-name', '📚 ' + b.name));
        head.appendChild(makeEl('span', 'band-pool', b.pool + ' 题'));
        card.appendChild(head);
        var best = store.best[b.key];
        var sub = best
          ? '最佳 ' + starsText(best.stars) + ' · ' + fmtBestTime(best.ms) + ' · 错' + best.errors
          : '暂无成绩 · 来挑战！';
        card.appendChild(makeEl('div', 'band-best', sub));
        var btns = makeEl('div', 'band-btns');
        var b1 = makeEl('button', 'btn-play', '练一练');
        b1.setAttribute('aria-label', b.name + ' 练一练');
        b1.addEventListener('click', function () { startGame(b.key, 'practice'); });
        var b2 = makeEl('button', 'btn-challenge', '挑战10题');
        b2.setAttribute('aria-label', b.name + ' 挑战10题');
        b2.addEventListener('click', function () { startGame(b.key, 'challenge'); });
        btns.appendChild(b1);
        btns.appendChild(b2);
        card.appendChild(btns);
        list.appendChild(card);
      })(BANDS[i]);
    }
    viewEl.appendChild(list);

    // 底部小贴士（填充页面 + 玩法引导）
    var tips = makeEl('div', 'home-tip');
    tips.appendChild(makeEl('div', 'tip-title', '💡 小贴士'));
    tips.appendChild(makeEl('div', 'tip-line', '· 答错会亮出正确答案，错题也是学习'));
    tips.appendChild(makeEl('div', 'tip-line', '· 挑战 10 题完成即打卡，可生成分享卡片'));
    tips.appendChild(makeEl('div', 'tip-line', '· 词库来自课本 975 条核心成语，按年级段出题'));
    viewEl.appendChild(tips);

    renderHomeFooter();
  }

  /* ---------- 渲染：对局页 ---------- */
  function startGame(bandKey, mode) {
    hideOverlay();
    hideShare();
    newRound(bandKey, mode);
    renderHeader();
    renderGameView();
    renderGameFooter();
    if (mode === 'challenge') { startTimer(); }
  }
  function renderGameView() {
    state.view = 'game';
    clearNode(viewEl);
    optionEls = [];

    // 顶栏
    var topbar = makeEl('div', 'topbar');
    var btnBack = makeEl('button', 'btn-ghost-sm', '← 返回');
    btnBack.setAttribute('aria-label', '返回首页');
    btnBack.addEventListener('click', backToHome);
    topbar.appendChild(btnBack);
    topbar.appendChild(makeEl('span', 'level-title', findBand(state.band).name));
    if (state.mode === 'challenge') {
      timerEl = makeEl('span', 'top-timer', '⏱ 00.0');
    } else {
      timerEl = null;
    }
    if (timerEl) { topbar.appendChild(timerEl); }
    viewEl.appendChild(topbar);

    // 进度
    progressEl = makeEl('div', 'pc-round', '');
    viewEl.appendChild(progressEl);

    renderQuestion();
  }
  function renderQuestion() {
    clearNode(viewEl);
    optionEls = [];
    var q = currentQ();
    if (!q || !q.item) { backToHome(); return; }

    // 顶栏（重新构建，保持计时器引用）
    var topbar = makeEl('div', 'topbar');
    var btnBack = makeEl('button', 'btn-ghost-sm', '← 返回');
    btnBack.setAttribute('aria-label', '返回首页');
    btnBack.addEventListener('click', backToHome);
    topbar.appendChild(btnBack);
    topbar.appendChild(makeEl('span', 'level-title', findBand(state.band).name));
    if (state.mode === 'challenge') {
      timerEl = makeEl('span', 'top-timer', '⏱ 00.0');
      topbar.appendChild(timerEl);
    } else {
      timerEl = null;
    }
    viewEl.appendChild(topbar);

    // 进度 + 连击
    var infoLine = makeEl('div', 'info-line');
    progressEl = makeEl('span', 'pc-round', state.mode === 'challenge'
      ? '第 ' + (state.qIndex + 1) + '/10 题'
      : '自由练习');
    infoLine.appendChild(progressEl);
    comboEl = makeEl('span', 'combo-line', '');
    infoLine.appendChild(comboEl);
    viewEl.appendChild(infoLine);
    updateCombo();

    // 题目区：emoji 拼图 + 字格占位 + 看答案
    var puzzle = makeEl('div', 'puzzle');
    var emojiEl = makeEl('div', 'pz-emoji', q.item.emoji);
    puzzle.appendChild(emojiEl);
    var blanks = blanksOf(q.item);
    if (blanks) { puzzle.appendChild(makeEl('div', 'pz-blanks', blanks)); }
    var hintBtn = makeEl('button', 'btn-hint', '💡 看答案');
    hintBtn.setAttribute('aria-label', '看答案');
    hintBtn.addEventListener('click', showAnswerPanel);
    puzzle.appendChild(hintBtn);
    viewEl.appendChild(puzzle);

    // 4 选项
    var optBox = makeEl('div', 'options');
    for (var i = 0; i < q.options.length; i++) {
      (function (idx) {
        var btn = makeEl('button', 'opt-btn', q.options[idx]);
        btn.setAttribute('aria-label', '选项 ' + q.options[idx]);
        btn.addEventListener('click', function () { onSelect(idx); });
        optionEls[idx] = btn;
        optBox.appendChild(btn);
      })(i);
    }
    viewEl.appendChild(optBox);
  }
  function blanksOf(item) {
    var n = item.字长 || (item.成语 ? item.成语.length : 4);
    var s = '';
    for (var i = 0; i < n; i++) {
      s += (i > 0 ? '  ' : '') + '____';
    }
    return s;
  }
  function updateCombo() {
    if (comboEl) {
      comboEl.textContent = (state.combo >= 2) ? '🔥 连击 x' + state.combo : '';
    }
  }
  function updateProgress() {
    if (progressEl) {
      progressEl.textContent = state.mode === 'challenge'
        ? '第 ' + (state.qIndex + 1) + '/10 题'
        : '自由练习';
    }
  }

  /* ---------- 交互：点选判定 ---------- */
  function onSelect(idx) {
    if (state.answering || state.won) { return; }
    ensureAudio();
    var q = currentQ();
    if (idx === q.answerIdx) {
      // 答对
      state.combo++;
      if (state.combo > state.maxCombo) { state.maxCombo = state.combo; }
      state.correct++;
      state.answering = true;
      sndCorrect();
      applyOptionClasses(idx, 'correct');
      updateCombo();
      window.setTimeout(function () {
        state.answering = false;
        nextQuestion();
      }, 700);
    } else {
      // 答错：红闪所点 + 亮正确答案
      state.errors++;
      state.combo = 0;
      state.answering = true;
      sndWrong();
      applyOptionClasses(idx, 'wrong');
      updateCombo();
      window.setTimeout(function () {
        state.answering = false;
        nextQuestion();
      }, 1200);
    }
  }
  function applyOptionClasses(wrongIdx, kind) {
    var q = currentQ();
    for (var i = 0; i < optionEls.length; i++) {
      var el = optionEls[i];
      if (!el) { continue; }
      var cls = 'opt-btn';
      if (i === q.answerIdx) { cls += ' correct'; }
      else if (kind === 'wrong' && i === wrongIdx) { cls += ' wrong'; }
      el.className = cls;
    }
  }

  /* ---------- 看答案 ---------- */
  function showAnswerPanel() {
    if (state.answering || state.won) { return; }
    var q = currentQ();
    if (!q || !q.item) { return; }
    state.answering = true;
    if (state.mode === 'challenge') { state.errors++; }
    var it = q.item;
    var grade = gradeTag(it.年级);
    var notes = [
      { cls: 'ans-pinyin', text: it.拼音 || '' },
      { cls: 'ans-desc', text: it.释义 || '' },
      { cls: 'ans-sent', text: it.例句 ? '例句：' + it.例句 : '' },
      { cls: 'ans-grade', text: grade }
    ];
    var btns = [
      { text: '知道了，下一题', cls: 'btn-main', act: function () {
          hideOverlay();
          state.answering = false;
          nextQuestion();
        } }
    ];
    showOverlay(it.成语, '💡 答案揭晓', notes, btns);
  }
  function gradeTag(grades) {
    if (!grades || !grades.length) { return ''; }
    var arr = grades.slice().sort(function (a, b) { return a - b; });
    if (arr.length === 1) { return '适合 ' + arr[0] + ' 年级'; }
    return '适合 ' + arr[0] + '-' + arr[arr.length - 1] + ' 年级';
  }

  /* ---------- 下一题 / 结算 ---------- */
  function nextQuestion() {
    if (state.mode === 'challenge') {
      state.qIndex++;
      if (state.qIndex >= state.round.length) { onWin(); return; }
      renderQuestion();
    } else {
      var avoid = currentQ().item.成语;
      state.round = [buildQuestion(state.band, avoid)];
      state.qIndex = 0;
      renderQuestion();
    }
  }
  function calcStars(errors) {
    if (errors === 0) { return 3; }
    if (errors <= 2) { return 2; }
    return 1;
  }
  function betterThan(starsA, msA, starsB, msB) {
    if (starsA !== starsB) { return starsA > starsB; }
    return msA < msB;
  }
  function onWin() {
    if (state.won) { return; }
    state.won = true;
    stopTimer();
    state.ms = performance.now() - state.startMs;
    sndWin();
    var bandKey = state.band;
    var ms = Math.round(state.ms);
    var errors = state.errors;
    var stars = calcStars(errors);
    var isNewBest = false;
    var best = store.best[bandKey];
    if (!best || betterThan(stars, ms, best.stars, best.ms)) {
      store.best[bandKey] = { stars: stars, errors: errors, ms: ms, date: fmtDate(new Date()) };
      isNewBest = true;
    }
    store.recent10[bandKey] = {
      correct: state.correct, total: 10, stars: stars, errors: errors,
      ms: ms, maxCombo: state.maxCombo, date: fmtDate(new Date())
    };
    store.history.push({
      date: fmtDate(new Date()), band: bandKey, correct: state.correct,
      total: 10, errors: errors, ms: ms, stars: stars
    });
    while (store.history.length > 30) { store.history.shift(); }
    doCheckin();
    saveStore();
    state.result = {
      correct: state.correct, ms: ms, stars: stars, errors: errors, maxCombo: state.maxCombo
    };

    var notes = [
      { cls: 'checkin-line', text: '✅ 今日已打卡 · 连续 ' + (store.checkin.streak || 0) + ' 天' },
      { cls: 'combo-note', text: '🔥 最大连击 x' + state.maxCombo }
    ];
    var btns = [
      { text: '再来一局', cls: 'btn-main', act: function () { startGame(bandKey, 'challenge'); } },
      { text: '📤 分享打卡', cls: 'btn-main', act: function () { openShare(); } },
      { text: '返回首页', cls: 'btn-ghost', act: function () { backToHome(); } }
    ];
    var sub = '答对 ' + state.correct + '/10 · 用时 ' + fmtTime(ms);
    showOverlay('🎉 挑战完成！', sub, notes, btns);
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
  function backToHome() {
    hideOverlay();
    hideShare();
    stopTimer();
    showHomeView();
  }

  /* ---------- 结算浮层 ---------- */
  function hideOverlay() {
    if (overlayEl && overlayEl.parentNode) {
      overlayEl.parentNode.removeChild(overlayEl);
    }
    overlayEl = null;
  }
  function showOverlay(title, sub, noteLines, btns, layered) {
    if (!layered) { hideOverlay(); }
    var ov = makeEl('div', layered ? 'overlay overlay-top' : 'overlay');
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
    hideShare();
    stopTimer();
    state.view = 'calendar';
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
    var btnBack = makeEl('button', 'btn-checkin', '← 返回首页');
    btnBack.setAttribute('aria-label', '返回首页');
    btnBack.addEventListener('click', showHomeView);
    footerEl.appendChild(btnBack);
  }

  /* ---------- 分享打卡 ---------- */
  function buildShareText() {
    var band = findBand(state.band);
    var streak = store.checkin && store.checkin.streak ? store.checkin.streak : 0;
    var r = state.result || { correct: 0 };
    return '今天孩子用看图猜成语完成「' + band.name + '」挑战，答对 ' + r.correct +
           '/10！连续打卡 ' + streak + ' 天 📅 猜成语越来越厉害，继续加油～';
  }
  function shareEncourage(correct) {
    if (correct >= 10) { return '太棒了！全对！'; }
    if (correct >= 8) { return '进步明显，继续加油！'; }
    if (correct >= 6) { return '不错哦，再接再厉！'; }
    return '每天猜一猜，成语记得牢！';
  }
  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  function drawShareCard(correct, elapsedSec, maxCombo) {
    var W = 1080, H = 1920;
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    if (!ctx) { return canvas; }

    /* 背景：暖橙渐变 #fff7ec → #ffd2ae */
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#fff7ec');
    bg.addColorStop(1, '#ffd2ae');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    /* 装饰圆点 */
    ctx.fillStyle = 'rgba(255, 122, 89, 0.18)';
    ctx.beginPath(); ctx.arc(150, 150, 26, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(930, 150, 26, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(150, 1770, 26, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(930, 1770, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255, 122, 89, 0.25)';
    ctx.beginPath(); ctx.arc(280, 300, 10, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(800, 260, 12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(240, 1620, 12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(830, 1580, 10, 0, Math.PI * 2); ctx.fill();

    /* 圆角白色内卡（margin 60，radius 48） */
    roundRectPath(ctx, 60, 60, 960, 1800, 48);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    /* 顶部：工具名 + 连续打卡天数（橙色胶囊） */
    ctx.fillStyle = '#1f2329';
    ctx.font = 'bold 56px sans-serif';
    ctx.fillText('看图猜成语', W / 2, 190);

    var streak = store.checkin && store.checkin.streak ? store.checkin.streak : 0;
    var streakText = '连续打卡 ' + streak + ' 天';
    ctx.font = 'bold 38px sans-serif';
    var tw = ctx.measureText(streakText).width;
    var pillW = tw + 64, pillH = 76, pillX = (W - pillW) / 2, pillY = 276;
    roundRectPath(ctx, pillX, pillY, pillW, pillH, 38);
    ctx.fillStyle = '#ff7a59';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(streakText, W / 2, pillY + pillH / 2 + 2);

    /* 中部：今日答对大字 */
    ctx.fillStyle = '#8a919f';
    ctx.font = '44px sans-serif';
    ctx.fillText('今日答对', W / 2, 620);

    ctx.fillStyle = '#ff7a59';
    ctx.font = 'bold 170px sans-serif';
    ctx.fillText(correct + '/10', W / 2, 800);

    /* 中部：答对 / 用时 / 最大连击 三列 */
    var stats = [
      { label: '答对', value: correct + '/10' },
      { label: '用时', value: elapsedSec + 's' },
      { label: '最大连击', value: '' + maxCombo }
    ];
    var cols = [W / 2 - 300, W / 2, W / 2 + 300];
    for (var i = 0; i < 3; i++) {
      ctx.fillStyle = '#1f2329';
      ctx.font = 'bold 56px sans-serif';
      ctx.fillText(stats[i].value, cols[i], 960);
      ctx.fillStyle = '#8a919f';
      ctx.font = '34px sans-serif';
      ctx.fillText(stats[i].label, cols[i], 1045);
    }

    /* 分隔线 */
    ctx.strokeStyle = '#f0e6d6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(180, 1220);
    ctx.lineTo(900, 1220);
    ctx.stroke();

    /* 底部：鼓励语（按答对数分级） */
    ctx.fillStyle = '#e8590c';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText(shareEncourage(correct), W / 2, 1400);

    /* 底部：日期 + 工具名 */
    var d = new Date();
    var dateText = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    ctx.fillStyle = '#8a919f';
    ctx.font = '36px sans-serif';
    ctx.fillText(dateText, W / 2, 1600);
    ctx.fillText('看图猜成语 · 每日一猜', W / 2, 1670);

    return canvas;
  }
  function hideShare() {
    if (shareEl && shareEl.parentNode) {
      shareEl.parentNode.removeChild(shareEl);
    }
    shareEl = null;
  }
  function openShare() {
    if (!state.result) { return; }
    var r = state.result;
    var canvas = drawShareCard(r.correct, Math.round(r.ms / 1000), r.maxCombo);
    var img = document.createElement('img');
    img.className = 'share-img';
    try { img.src = canvas.toDataURL('image/png'); } catch (err) { img.src = ''; }

    var ov = makeEl('div', 'overlay overlay-top');
    var card = makeEl('div', 'overlay-card share-card');
    card.appendChild(makeEl('div', 'overlay-title', '📤 分享打卡'));
    card.appendChild(img);
    var text = buildShareText();
    var ta = makeEl('textarea', 'share-text', text);
    ta.setAttribute('readonly', '');
    card.appendChild(ta);
    var feedback = makeEl('div', 'share-feedback', '');
    card.appendChild(feedback);
    var btnCopy = makeEl('button', 'btn-main share-copy', '一键复制文案');
    btnCopy.addEventListener('click', function () { copyShareText(text, feedback); });
    card.appendChild(btnCopy);
    var btnClose = makeEl('button', 'btn-ghost', '关闭');
    btnClose.addEventListener('click', function () { hideShare(); });
    card.appendChild(btnClose);
    ov.appendChild(card);
    document.body.appendChild(ov);
    shareEl = ov;
  }
  function copyShareText(text, feedbackEl) {
    var ok = false;
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();
    if (ta.setSelectionRange) { ta.setSelectionRange(0, text.length); }
    try {
      ok = document.execCommand('copy');
    } catch (err) {
      ok = false;
    }
    document.body.removeChild(ta);
    if (ok) {
      feedbackEl.textContent = '已复制，去小红书粘贴发布吧';
      feedbackEl.className = 'share-feedback ok';
    } else {
      feedbackEl.textContent = '复制失败，请长按选择复制';
      feedbackEl.className = 'share-feedback bad';
    }
    window.setTimeout(function () {
      feedbackEl.textContent = '';
      feedbackEl.className = 'share-feedback';
    }, 2000);
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
  buildItems();
  buildPools();
  syncAppHeight();
  showHomeView();

  /* ---------- 测试钩子（smoke 冒烟用；对外只读当前题） ---------- */
  window.KANTUCY = {
    getQ: function () {
      if (state.view !== 'game' || !state.round.length) { return null; }
      var q = currentQ();
      return { idiom: q.item.成语, options: q.options.slice(), answerIdx: q.answerIdx, qIndex: state.qIndex };
    },
    getState: function () {
      return { mode: state.mode, band: state.band, correct: state.correct, errors: state.errors, maxCombo: state.maxCombo };
    }
  };
})();
