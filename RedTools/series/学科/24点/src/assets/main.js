/* ============================================================
   24点 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   数据：window.APP_DATA（data.js 注入，build 生成 meta）
   依赖：window.Game24（solver.js）/ window.Game24Parser（parser.js）
   功能：
   - 首页：难度三选（入门/进阶/挑战）+ 模式二选（自由练习/每日挑战 10 题）
   - 对局：2×2 牌面 + 表达式构造器（点牌/运算符/括号/撤销/清空/实时预览/提交）
   - 判定：parser.evaluate + validateNumberTokens + |value-24|<1e-6
   - 提示：显示最简解；挑战局用提示则本局 best 不更新但照常打卡
   - 结算：挑战 10 题全对完成 → 打卡 + 星级 + best + recent10
   - 成绩页（recent10）/ 打卡页（月历圆点 + 连续天数）
   - v1.2 防沉迷：首页「训练限时」5/10/15 档 + 会话内累计（Game24Session）+ 到点提醒层
     （延迟 5 分钟 / 我很自律，今天足够了）+ 结算页「我很自律，今天足够了」动作
   持久化（设计文档 §5.3，localStorage try/catch + 内存降级）：
     math24_checkin  {version, dates:["YYYYMMDD"], streak, longestStreak}
     math24_records  {best:{easy,normal,hard}, recent10:[] 倒序 FIFO ≤10}
     math24_prefs    {diff, mode, limitMin}
   设计约束：
   - 不使用 import/export / type="module"；不超出 ES2017（无 ?. ?? 对象展开等）
   - 事件全部 addEventListener，无内联事件 / eval
   - 计时用 performance.now()，interval 按差值刷新
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };

  /* ---------- DOM ---------- */
  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');
  var footerEl = document.getElementById('app-footer');

  /* ---------- 难度定义（星级阈值：3★ / 2★，其余 1★；设计文档 §2.4） ---------- */
  var DIFFS = {
    easy:   { label: '入门', threeMs: 150000, twoMs: 240000 },
    normal: { label: '进阶', threeMs: 240000, twoMs: 360000 },
    hard:   { label: '挑战', threeMs: 360000, twoMs: 540000 }
  };
  var DIFF_ORDER = ['easy', 'normal', 'hard'];
  var SUITS = ['♠', '♥', '♦', '♣'];
  var CHALLENGE_TOTAL = 10;

  /* ---------- 状态 ---------- */
  var state = {
    diff: 'easy',
    mode: 'free',                  /* free | challenge */
    finished: false,
    tokens: [],                    /* 构造中的表达式 token 数组 */
    remaining: {},                 /* 牌面剩余计数 */
    game: null,                    /* 当前题：{cards, solutions, hint, key} */
    free: { startMs: 0, timerId: null, elapsed: 0, solved: false, hintUsed: false, pausedMs: 0 },
    challenge: { index: 0, total: CHALLENGE_TOTAL, usedHint: false, startMs: 0, timerId: null, pausedMs: 0 },
    limitOpen: false               /* v1.2 防沉迷：提醒层开启中 */
  };
  var roundUsedKeys = [];          /* 单局内题面去重 */
  /* v1.2 防沉迷：会话轮询 interval / 提醒层 DOM / 结算浮层开启标记 */
  var sessionPollId = null;
  var limitOverlayEl = null;
  var resultOpen = false;

  /* ---------- 持久化（localStorage + 内存降级） ---------- */
  var CHECKIN_KEY = 'math24_checkin';
  var RECORDS_KEY = 'math24_records';
  var PREF_KEY = 'math24_prefs';
  var memStore = {};

  var storage = {
    get: function (key) {
      try {
        var raw = window.localStorage.getItem(key);
        if (raw !== null) { return JSON.parse(raw); }
      } catch (err) { /* 降级内存 */ }
      try {
        if (memStore[key] !== undefined) { return JSON.parse(memStore[key]); }
      } catch (err2) { /* ignore */ }
      return null;
    },
    set: function (key, val) {
      try {
        window.localStorage.setItem(key, JSON.stringify(val));
        return;
      } catch (err) { /* 降级内存 */ }
      memStore[key] = JSON.stringify(val);
    }
  };

  function normalizeCheckin(raw) {
    var base = { version: 1, dates: [], streak: 0, longestStreak: 0 };
    if (raw && typeof raw === 'object') {
      base.dates = Array.isArray(raw.dates) ? raw.dates.slice() : [];
      base.streak = typeof raw.streak === 'number' ? raw.streak : 0;
      base.longestStreak = typeof raw.longestStreak === 'number' ? raw.longestStreak : 0;
    }
    return base;
  }
  function normalizeRecords(raw) {
    var base = { version: 1, best: { easy: null, normal: null, hard: null }, recent10: [] };
    if (raw && typeof raw === 'object') {
      var b = raw.best || {};
      base.best = {
        easy: b.easy || null,
        normal: b.normal || null,
        hard: b.hard || null
      };
      base.recent10 = Array.isArray(raw.recent10) ? raw.recent10.slice(0, 10) : [];
    }
    return base;
  }
  function normalizePrefs(raw) {
    /* v1.2：新增 limitMin（默认 10；与既有 {diff,mode} 对象向后兼容） */
    var base = { diff: 'easy', mode: 'free', limitMin: 10 };
    if (raw && typeof raw === 'object') {
      if (raw.diff === 'easy' || raw.diff === 'normal' || raw.diff === 'hard') { base.diff = raw.diff; }
      if (raw.mode === 'free' || raw.mode === 'challenge') { base.mode = raw.mode; }
      if (raw.limitMin === 5 || raw.limitMin === 10 || raw.limitMin === 15) { base.limitMin = raw.limitMin; }
    }
    return base;
  }

  var checkin = normalizeCheckin(storage.get(CHECKIN_KEY));
  var records = normalizeRecords(storage.get(RECORDS_KEY));
  var prefs = normalizePrefs(storage.get(PREF_KEY));
  storage.set(CHECKIN_KEY, checkin);   /* 初始化写入 */
  storage.set(RECORDS_KEY, records);
  storage.set(PREF_KEY, prefs);

  function saveCheckin() { storage.set(CHECKIN_KEY, checkin); }
  function saveRecords() { storage.set(RECORDS_KEY, records); }
  function savePrefs() { storage.set(PREF_KEY, prefs); }

  /* ---------- 工具 ---------- */
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
  function todayStr() {
    var d = new Date();
    return '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
  }
  function dateStr(d) {
    return '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
  }
  function fmtMMSS(ms) {
    var secs = Math.max(0, Math.floor(ms / 1000));
    return p2(Math.floor(secs / 60)) + ':' + p2(secs % 60);
  }
  /* 连续打卡天数：含今天往前推、跨天断（dates 升序去重） */
  function calcStreak(dates) {
    return LX_SHARED.progress.streak(dates);
}
  function fmtValue(v) {
    if (Math.abs(v - Math.round(v)) < 1e-9) { return '' + Math.round(v); }
    var s = v.toFixed(4);
    s = s.replace(/0+$/, '');
    s = s.replace(/\.$/, '');
    return s;
  }
  function tokenToStr(t) {
    if (t.type === 'num') { return '' + t.value; }
    if (t.type === 'lp') { return '('; }
    if (t.type === 'rp') { return ')'; }
    return t.value;
  }

  /* ---------- toast ---------- */
  var toastEl = null;
  var toastTimer = null;
  function toast(msg, isError) {
    if (toastEl && toastEl.parentNode) { toastEl.parentNode.removeChild(toastEl); }
    toastEl = makeEl('div', 'toast' + (isError ? ' toast-error' : ''), msg);
    document.body.appendChild(toastEl);
    if (toastTimer) { clearTimeout(toastTimer); }
    toastTimer = setTimeout(function () {
      if (toastEl && toastEl.parentNode) { toastEl.parentNode.removeChild(toastEl); }
      toastEl = null;
    }, 1800);
  }

  /* ---------- 渲染：顶栏 ---------- */
  function renderHeader(title) {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '24点';
    brand.appendChild(makeEl('span', 'header-title', title || name));
    if (APP.meta && APP.meta.version) {
      brand.appendChild(makeEl('span', 'header-ver', 'v' + APP.meta.version));
    }
    headerEl.appendChild(brand);
  }

  /* ---------- 视图：首页 ---------- */
  function renderModeRow(container) {
    clearNode(container);
    var mk = function (m, label) {
      var b = makeEl('button', 'mode-btn' + (prefs.mode === m ? ' active' : ''), label);
      b.addEventListener('click', function () {
        if (prefs.mode === m) { return; }
        prefs.mode = m;
        savePrefs();
        renderModeRow(container);
        updateModeHint();
      });
      return b;
    };
    container.appendChild(mk('free', '自由练习'));
    container.appendChild(mk('challenge', '每日挑战 10 题'));
  }
  function updateModeHint() {
    var el = document.getElementById('mode-hint');
    if (!el) { return; }
    el.textContent = prefs.mode === 'challenge'
      ? '连闯 10 题，全部解出即完成并打卡'
      : '单题计时练习，可随时换题';
  }

  /* ---------- v1.2 防沉迷：首页「训练限时」设置行 ---------- */
  function renderLimitRow(container) {
    clearNode(container);
    [5, 10, 15].forEach(function (m) {
      var b = makeEl('button', 'limit-btn' + (prefs.limitMin === m ? ' active' : ''), m + ' 分钟');
      b.addEventListener('click', function () {
        if (prefs.limitMin === m) { return; }
        prefs.limitMin = m;
        savePrefs();
        Game24Session.setLimitMin(m);
        renderLimitRow(container);
        updateLimitHint();
      });
      container.appendChild(b);
    });
  }
  function updateLimitHint() {
    var el = document.getElementById('limit-hint');
    if (!el) { return; }
    el.textContent = '本会话已练 ' + fmtMMSS(Game24Session.getState().usedMs) + '，到点会提醒休息';
  }

  function viewHome() {
    renderHeader();
    clearNode(viewEl);
    viewEl.appendChild(makeEl('div', 'page-title', '选择难度'));
    viewEl.appendChild(makeEl('div', 'home-hint', '4 张牌，用 + − × ÷ 和括号算出 24'));

    var list = makeEl('div', 'home-list');
    DIFF_ORDER.forEach(function (k) {
      var d = DIFFS[k];
      var card = makeEl('div', 'diff-card');
      var btn = makeEl('button', 'diff-btn', d.label);
      btn.addEventListener('click', function () { startGame(k); });
      card.appendChild(btn);
      var best = records.best[k];
      var meta = makeEl('div', 'diff-meta',
        best && best.timeMs != null ? '最佳 ' + fmtMMSS(best.timeMs) : '未挑战');
      card.appendChild(meta);
      list.appendChild(card);
    });
    viewEl.appendChild(list);

    viewEl.appendChild(makeEl('div', 'mode-title', '练习模式'));
    var modeRow = makeEl('div', 'mode-row');
    modeRow.id = 'mode-row';
    renderModeRow(modeRow);
    viewEl.appendChild(modeRow);
    var modeHint = makeEl('div', 'home-hint', '');
    modeHint.id = 'mode-hint';
    viewEl.appendChild(modeHint);
    updateModeHint();

    /* v1.2 防沉迷：首页「训练限时」设置行（5/10/15 档单选） */
    viewEl.appendChild(makeEl('div', 'mode-title', '训练限时'));
    var limitRow = makeEl('div', 'limit-row');
    limitRow.id = 'limit-row';
    renderLimitRow(limitRow);
    viewEl.appendChild(limitRow);
    var limitHint = makeEl('div', 'limit-hint', '');
    limitHint.id = 'limit-hint';
    viewEl.appendChild(limitHint);
    updateLimitHint();

    renderFooterNav();
  }

  /* ---------- 对局 ---------- */
  function startGame(diff) {
    prefs.diff = diff;
    savePrefs();
    state.diff = diff;
    state.mode = prefs.mode;
    state.finished = false;
    state.tokens = [];
    state.remaining = {};
    state.game = null;
    roundUsedKeys = [];
    stopTimers();
    /* v1.2 防沉迷：开局读取档位并进入会话；对局计时器启动后自动开始累计（见 startFreeTimer/startChallengeTimer） */
    Game24Session.setLimitMin(prefs.limitMin);
    stopSessionTimer();
    state.free = { startMs: 0, timerId: null, elapsed: 0, solved: false, hintUsed: false, pausedMs: 0 };
    state.challenge = { index: 0, total: CHALLENGE_TOTAL, usedHint: false, startMs: 0, timerId: null, pausedMs: 0 };

    renderHeader();
    clearNode(viewEl);
    clearNode(footerEl);
    renderGame();
    nextQuestion();
  }

  function nextQuestion() {
    state.tokens = [];
    state.free.solved = false;
    var g = Game24.generate(state.diff, roundUsedKeys);
    if (!g) { toast('出题失败，请重试', true); return; }
    state.game = g;
    if (roundUsedKeys.indexOf(g.key) === -1) { roundUsedKeys.push(g.key); }
    state.remaining = {};
    var i, c;
    for (i = 0; i < g.cards.length; i++) {
      c = g.cards[i];
      state.remaining[c] = (state.remaining[c] || 0) + 1;
    }
    renderCards();
    updateExprDisplay();
    updateProgress();
    if (state.mode === 'challenge') {
      if (state.challenge.index === 0 && !state.challenge.startMs) {
        state.challenge.startMs = performance.now();
        startChallengeTimer();
      }
    } else {
      startFreeTimer();
    }
  }

  function renderGame() {
    /* 顶部：返回 | 难度+模式(+进度) | 计时 | 提示 */
    var top = makeEl('div', 'game-top');
    var back = makeEl('button', 'game-back', '‹ 返回');
    back.addEventListener('click', onBack);
    top.appendChild(back);

    var info = makeEl('div', 'game-info');
    var diffMode = DIFFS[state.diff].label + ' · ' +
      (state.mode === 'challenge' ? '每日挑战' : '自由练习');
    info.appendChild(makeEl('div', 'game-diffmode', diffMode));
    if (state.mode === 'challenge') {
      var prog = makeEl('div', 'game-progress', '第 1/' + CHALLENGE_TOTAL + ' 题');
      prog.id = 'game-progress';
      info.appendChild(prog);
    }
    top.appendChild(info);

    var timerEl = makeEl('div', 'game-timer', '⏱ 00:00');
    timerEl.id = 'game-timer';
    top.appendChild(timerEl);

    var hintBtn = makeEl('button', 'game-hint', '提示');
    hintBtn.addEventListener('click', onHint);
    top.appendChild(hintBtn);
    viewEl.appendChild(top);

    /* 牌面区：2×2 */
    var grid = makeEl('div', 'cards-grid');
    grid.id = 'cards-grid';
    viewEl.appendChild(grid);

    /* 表达式显示 + 实时预览 */
    var display = makeEl('div', 'expr-display');
    var exprText = makeEl('div', 'expr-text', '点按牌面与运算符构造算式');
    exprText.id = 'expr-text';
    display.appendChild(exprText);
    var preview = makeEl('div', 'expr-preview', '');
    preview.id = 'expr-preview';
    display.appendChild(preview);
    viewEl.appendChild(display);

    /* 运算符 */
    var opRow = makeEl('div', 'op-row');
    ['+', '-', '×', '÷'].forEach(function (op) {
      var b = makeEl('button', 'op-btn', op);
      b.addEventListener('click', function () { onOpTap(op); });
      opRow.appendChild(b);
    });
    viewEl.appendChild(opRow);

    /* 括号 + 撤销 + 清空 */
    var utilRow = makeEl('div', 'util-row');
    var mkUtil = function (label, fn) {
      var b = makeEl('button', 'util-btn', label);
      b.addEventListener('click', fn);
      utilRow.appendChild(b);
    };
    mkUtil('(', function () { onParenTap('('); });
    mkUtil(')', function () { onParenTap(')'); });
    mkUtil('撤销', onBackspace);
    mkUtil('清空', onClear);
    viewEl.appendChild(utilRow);

    /* 提交（自由练习附 换一题） */
    var submitRow = makeEl('div', 'submit-row');
    var submit = makeEl('button', 'btn btn-primary', '提交');
    submit.addEventListener('click', onSubmit);
    submitRow.appendChild(submit);
    if (state.mode === 'free') {
      var change = makeEl('button', 'btn', '换一题');
      change.addEventListener('click', onChangeQuestion);
      submitRow.appendChild(change);
    }
    viewEl.appendChild(submitRow);
  }

  function renderCards() {
    var grid = document.getElementById('cards-grid');
    if (!grid || !state.game) { return; }
    clearNode(grid);
    var cards = state.game.cards;
    var i;
    for (i = 0; i < cards.length; i++) {
      (function (idx, val) {
        var cell = makeEl('div', 'card-cell');
        var btn = makeEl('button', 'card-face', '');
        btn.appendChild(makeEl('span', 'card-suit', SUITS[idx % SUITS.length]));
        btn.appendChild(makeEl('span', 'card-num', '' + val));
        btn.addEventListener('click', function () { onCardTap(val); });
        cell.appendChild(btn);
        grid.appendChild(cell);
      })(i, cards[i]);
    }
    updateCardStates();
  }

  function updateCardStates() {
    var cards = state.game ? state.game.cards : null;
    if (!cards) { return; }
    var faces = document.querySelectorAll('.card-face');
    var i;
    for (i = 0; i < faces.length; i++) {
      var val = cards[i];
      var left = state.remaining[val] || 0;
      faces[i].disabled = left <= 0;
    }
  }

  function updateExprDisplay() {
    var textEl = document.getElementById('expr-text');
    var previewEl = document.getElementById('expr-preview');
    if (!textEl || !previewEl) { return; }
    var i, text = '';
    for (i = 0; i < state.tokens.length; i++) {
      text += tokenToStr(state.tokens[i]);
    }
    if (!text) {
      textEl.textContent = '点按牌面与运算符构造算式';
      textEl.className = 'expr-text placeholder';
    } else {
      textEl.textContent = text;
      textEl.className = 'expr-text';
    }
    if (!state.tokens.length) {
      previewEl.textContent = '';
      previewEl.className = 'expr-preview';
      return;
    }
    var res = Game24Parser.evaluate(state.tokens);
    if (!res.ok) {
      if (res.error === '除零') {
        previewEl.textContent = '= 除零';
        previewEl.className = 'expr-preview bad';
      } else {
        previewEl.textContent = '= ?';
        previewEl.className = 'expr-preview dim';
      }
      return;
    }
    previewEl.textContent = '= ' + fmtValue(res.value);
    previewEl.className = 'expr-preview' +
      (Game24Parser.isTwentyFour(res.value) ? ' hit' : '');
  }

  function updateProgress() {
    var el = document.getElementById('game-progress');
    if (!el) { return; }
    el.textContent = '第 ' + (state.challenge.index + 1) + '/' + state.challenge.total + ' 题';
  }

  /* ---------- 表达式构造 ---------- */
  function onCardTap(val) {
    if (state.finished || state.free.solved) { return; }
    var left = state.remaining[val] || 0;
    if (left <= 0) { return; }
    state.remaining[val] = left - 1;
    state.tokens.push({ type: 'num', value: val });
    updateCardStates();
    updateExprDisplay();
  }
  function onOpTap(op) {
    if (state.finished || state.free.solved) { return; }
    state.tokens.push({ type: 'op', value: op });
    updateExprDisplay();
  }
  function onParenTap(p) {
    if (state.finished || state.free.solved) { return; }
    state.tokens.push(p === '(' ? { type: 'lp', value: '(' } : { type: 'rp', value: ')' });
    updateExprDisplay();
  }
  function onBackspace() {
    if (state.finished || state.free.solved || !state.tokens.length) { return; }
    var t = state.tokens.pop();
    if (t.type === 'num') {
      state.remaining[t.value] = (state.remaining[t.value] || 0) + 1;
    }
    updateCardStates();
    updateExprDisplay();
  }
  function onClear() {
    if (state.finished || state.free.solved) { return; }
    state.tokens = [];
    state.remaining = {};
    var cards = state.game ? state.game.cards : null;
    if (cards) {
      var i;
      for (i = 0; i < cards.length; i++) {
        state.remaining[cards[i]] = (state.remaining[cards[i]] || 0) + 1;
      }
    }
    updateCardStates();
    updateExprDisplay();
  }

  /* ---------- 提交判定 ---------- */
  function onSubmit() {
    if (state.finished || !state.game) { return; }
    if (state.free.solved) { return; }
    if (!state.tokens.length) { toast('请先构造算式', true); return; }
    var res = Game24Parser.evaluate(state.tokens);
    if (!res.ok) {
      if (res.error === '除零') { toast('除数不能为 0', true); }
      else { toast('算式不完整，请检查', true); }
      return;
    }
    if (!Game24Parser.validateNumberTokens(state.tokens, state.game.cards)) {
      toast('4 张牌必须且恰好使用一次', true);
      return;
    }
    if (!Game24Parser.isTwentyFour(res.value)) {
      toast('结果不是 24，再试试', true);
      return;
    }
    onSolveSuccess();
  }

  function onSolveSuccess() {
    flashCardsOk();
    if (state.mode === 'challenge') {
      window.setTimeout(function () {
        state.challenge.index += 1;
        if (state.challenge.index >= state.challenge.total) {
          finishGame();
        } else {
          nextQuestion();
        }
      }, 420);
    } else {
      stopFreeTimer();
      state.free.elapsed = performance.now() - state.free.startMs;
      window.setTimeout(function () {
        showFreeResult(state.free.elapsed);
      }, 420);
    }
  }

  /* 正确反馈：牌面区绿色闪烁 + ✓ */
  function flashCardsOk() {
    var grid = document.getElementById('cards-grid');
    if (!grid) { return; }
    grid.className = 'cards-grid cards-hit';
    window.setTimeout(function () {
      grid.className = 'cards-grid';
    }, 450);
  }

  /* ---------- 提示 ---------- */
  function onHint() {
    if (state.finished || !state.game) { return; }
    if (state.free.solved) { return; }
    if (state.mode === 'challenge') { state.challenge.usedHint = true; }
    else { state.free.hintUsed = true; }
    showHintOverlay(state.game.hint);
  }
  function showHintOverlay(hint) {
    var overlay = makeEl('div', 'result-overlay');
    var box = makeEl('div', 'result-box hint-box');
    box.appendChild(makeEl('div', 'result-title', '提示'));
    box.appendChild(makeEl('div', 'hint-expr', hint));
    box.appendChild(makeEl('div', 'hint-eq', '= 24'));
    var okBtn = makeEl('button', 'btn btn-primary', '知道了');
    okBtn.addEventListener('click', function () {
      closeOverlay(overlay);
    });
    box.appendChild(okBtn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  /* ---------- 计时 ---------- */
  function startFreeTimer() {
    stopFreeTimer();
    state.free.startMs = performance.now();
    state.free.timerId = setInterval(function () {
      updateTimerDisplay(performance.now() - state.free.startMs);
    }, 100);
    startSessionTimer();   /* v1.2 防沉迷：对局计时器启动 → 会话开始累计 */
  }
  function stopFreeTimer() {
    if (state.free.timerId) { clearInterval(state.free.timerId); state.free.timerId = null; }
    stopSessionTimer();    /* v1.2 防沉迷：对局计时器停止 → 会话暂停累计 */
  }
  function startChallengeTimer() {
    if (state.challenge.timerId) { clearInterval(state.challenge.timerId); }
    state.challenge.timerId = setInterval(function () {
      updateTimerDisplay(performance.now() - state.challenge.startMs);
    }, 100);
    startSessionTimer();   /* v1.2 防沉迷：挑战局开始 → 会话开始累计 */
  }
  function stopChallengeTimer() {
    if (state.challenge.timerId) { clearInterval(state.challenge.timerId); state.challenge.timerId = null; }
    stopSessionTimer();    /* v1.2 防沉迷：对局计时器停止 → 会话暂停累计 */
  }
  function stopTimers() { stopFreeTimer(); stopChallengeTimer(); }
  function updateTimerDisplay(ms) {
    var el = document.getElementById('game-timer');
    if (!el) { return; }
    el.textContent = '⏱ ' + fmtMMSS(ms);
  }

  /* ============================================================
     v1.2 防沉迷：会话轮询 + 到点提醒浮层
     - 会话累计：Game24Session（session.js 纯逻辑）；main 每 500ms tick 一次
     - 弹层规则：tick 返回 due（超时）且当前无提醒层/结算浮层 → consumeDue() 消费边沿 → 弹层
     - 弹层期间暂停对局计时（视觉冻结）与会话累计；「延迟」恢复，「足够」回首页+清零
     ============================================================ */
  function sessionPoll() {
    var st = Game24Session.tick(performance.now());
    if (st.due && !state.limitOpen && !resultOpen) {
      Game24Session.consumeDue();   /* 武装：本死线只弹一次，直到 extend()/enough() */
      showLimitOverlay();
    }
  }
  function startSessionTimer() {
    if (sessionPollId) { return; }  /* 已运行，防重复 interval（无泄漏） */
    Game24Session.setActive(true);
    sessionPollId = setInterval(sessionPoll, 500);
  }
  function stopSessionTimer() {
    if (sessionPollId) { clearInterval(sessionPollId); sessionPollId = null; }
    Game24Session.setActive(false);
  }

  /* 暂停对局计时（记录暂停点）+ 会话暂停累计 */
  function pauseGameTimers() {
    if (state.challenge.timerId) {
      state.challenge.pausedMs = performance.now() - state.challenge.startMs;
      clearInterval(state.challenge.timerId);
      state.challenge.timerId = null;
    }
    if (state.free.timerId) {
      state.free.pausedMs = performance.now() - state.free.startMs;
      clearInterval(state.free.timerId);
      state.free.timerId = null;
    }
    stopSessionTimer();
  }
  /* 从暂停点恢复对局计时（视觉计时与会话累计无缝续上） */
  function resumeGameTimers() {
    if (state.mode === 'challenge') {
      stopChallengeTimer();
      var ch = state.challenge.pausedMs || 0;
      state.challenge.pausedMs = 0;
      if (ch > 0) { state.challenge.startMs = performance.now() - ch; }
      startChallengeTimer();
      updateTimerDisplay(ch);
    } else {
      stopFreeTimer();
      var fr = state.free.pausedMs || 0;
      state.free.pausedMs = 0;
      startFreeTimer();
      if (fr > 0) {
        state.free.startMs = performance.now() - fr;
        updateTimerDisplay(fr);
      }
    }
  }

  function closeLimitOverlay() {
    if (limitOverlayEl && limitOverlayEl.parentNode) {
      limitOverlayEl.parentNode.removeChild(limitOverlayEl);
    }
    limitOverlayEl = null;
    state.limitOpen = false;
  }

  function showLimitOverlay() {
    if (state.limitOpen) { return; }
    state.limitOpen = true;
    pauseGameTimers();   /* 弹层期间对局计时与会话累计暂停 */

    var usedMin = Math.max(1, Math.round(Game24Session.getState().usedMs / 60000));
    var overlay = makeEl('div', 'limit-overlay');
    var box = makeEl('div', 'limit-box');
    box.appendChild(makeEl('div', 'limit-title', '训练时间到'));
    box.appendChild(makeEl('div', 'limit-desc', '已练习 ' + usedMin + ' 分钟，休息一下吧～'));

    var btns = makeEl('div', 'limit-btns');
    var extendBtn = makeEl('button', 'btn btn-primary', '延迟 5 分钟');
    extendBtn.addEventListener('click', function () {
      Game24Session.extend();
      closeLimitOverlay();
      resumeGameTimers();   /* 恢复被暂停的对局，从原处继续 */
    });
    btns.appendChild(extendBtn);
    var enoughBtn = makeEl('button', 'btn', '我很自律，今天足够了');
    enoughBtn.addEventListener('click', function () {
      Game24Session.enough();
      closeLimitOverlay();
      stopTimers();         /* 结束当前对局（会话累计随之暂停） */
      roundUsedKeys = [];
      viewHome();
    });
    btns.appendChild(enoughBtn);
    box.appendChild(btns);

    overlay.appendChild(box);
    limitOverlayEl = overlay;
    document.body.appendChild(overlay);
  }

  /* ---------- 结算（每日挑战 10 题完成） ---------- */
  function calcStars(diff, ms) {
    var d = DIFFS[diff];
    if (ms <= d.threeMs) { return 3; }
    if (ms <= d.twoMs) { return 2; }
    return 1;
  }

  function finishGame() {
    if (state.finished) { return; }
    state.finished = true;
    stopTimers();
    /* v1.2：若提醒层暂停过挑战计时，用暂停点作为有效用时（弹层冻结期间不计入成绩） */
    var elapsedMs = state.challenge.pausedMs
      ? state.challenge.pausedMs
      : performance.now() - state.challenge.startMs;
    state.challenge.pausedMs = 0;
    var t = todayStr();

    /* 打卡：完成一局每日挑战即点亮今日 */
    var dates = checkin.dates;
    if (dates.indexOf(t) === -1) { dates.push(t); }
    dates.sort();
    while (dates.length > 730) { dates.shift(); }
    checkin.streak = calcStreak(dates);
    if (checkin.streak > checkin.longestStreak) { checkin.longestStreak = checkin.streak; }
    saveCheckin();

    /* 星级 */
    var stars = calcStars(state.diff, elapsedMs);

    /* best：仅当本局未用提示才更新（设计文档 §4.3） */
    var isNewBest = false;
    if (!state.challenge.usedHint) {
      var best = records.best[state.diff];
      if (!best || elapsedMs < best.timeMs) {
        records.best[state.diff] = { diff: state.diff, timeMs: Math.round(elapsedMs), date: t };
        isNewBest = true;
      }
    }

    /* recent10 倒序 FIFO ≤10 */
    records.recent10.unshift({
      diff: state.diff,
      timeMs: Math.round(elapsedMs),
      correct: state.challenge.total,
      total: state.challenge.total,
      usedHint: state.challenge.usedHint,
      date: t
    });
    while (records.recent10.length > 10) { records.recent10.pop(); }
    saveRecords();

    showChallengeResult(elapsedMs, stars, isNewBest);
  }

  /* ---------- 结果浮层 ---------- */
  function mkStat(label, val) {
    var s = makeEl('div', 'result-stat');
    s.appendChild(makeEl('b', '', val));
    s.appendChild(makeEl('span', '', label));
    return s;
  }
  function closeOverlay(overlay) {
    if (overlay && overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
  }

  function showChallengeResult(ms, stars, isNewBest) {
    closeLimitOverlay();   /* v1.2：对局若恰在提醒层开启时结束，先收起提醒层 */
    var overlay = makeEl('div', 'result-overlay');
    var box = makeEl('div', 'result-box');
    box.appendChild(makeEl('div', 'result-title', '每日挑战完成！'));
    box.appendChild(makeEl('div', 'result-time', fmtMMSS(ms)));
    var stats = makeEl('div', 'result-stats');
    stats.appendChild(mkStat('对题', state.challenge.total + '/' + state.challenge.total));
    stats.appendChild(mkStat('用时', fmtMMSS(ms)));
    stats.appendChild(mkStat('星级', '★'.slice(0, 0) + ('★★★'.slice(0, stars))));
    box.appendChild(stats);
    box.appendChild(makeEl('div', 'result-stars', '★★★'.slice(0, stars)));
    if (isNewBest) {
      box.appendChild(makeEl('div', 'result-record', '🎉 新纪录！'));
    } else if (state.challenge.usedHint) {
      box.appendChild(makeEl('div', 'result-note', '本局用过提示，未计入最佳'));
    }
    var best = records.best[state.diff];
    var streak = calcStreak(checkin.dates);
    box.appendChild(makeEl('div', 'result-line',
      '本难度最佳 ' + (best ? fmtMMSS(best.timeMs) : '—') +
      ' · 连续打卡 ' + streak + ' 天'));

    var again = makeEl('button', 'btn btn-primary', '再来一局');
    again.addEventListener('click', function () {
      closeOverlay(overlay);
      resultOpen = false;
      startGame(state.diff);
    });
    box.appendChild(again);
    var home = makeEl('button', 'btn', '返回首页');
    home.addEventListener('click', function () {
      closeOverlay(overlay);
      resultOpen = false;
      viewHome();
    });
    box.appendChild(home);
    /* v1.1 分享打卡：挑战结果浮层专属按钮（自由练习不出现） */
    var share = makeEl('button', 'btn', '分享打卡');
    share.addEventListener('click', function () {
      openShareOverlay(ms, stars, state.challenge.total);
    });
    box.appendChild(share);
    /* v1.2 防沉迷：结算页「我很自律，今天足够了」（行为同提醒层足够：回首页 + 清零） */
    var enough = makeEl('button', 'btn', '我很自律，今天足够了');
    enough.addEventListener('click', function () {
      closeOverlay(overlay);
      resultOpen = false;
      Game24Session.enough();
      stopSessionTimer();
      viewHome();
    });
    box.appendChild(enough);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    resultOpen = true;
  }

  function showFreeResult(ms) {
    closeLimitOverlay();   /* v1.2：同挑战结算，先收起可能存在的提醒层 */
    var overlay = makeEl('div', 'result-overlay');
    var box = makeEl('div', 'result-box');
    box.appendChild(makeEl('div', 'result-title', '回答正确！'));
    box.appendChild(makeEl('div', 'result-time', fmtMMSS(ms)));
    box.appendChild(makeEl('div', 'result-ok', '✓'));
    var next = makeEl('button', 'btn btn-primary', '下一题');
    next.addEventListener('click', function () {
      closeOverlay(overlay);
      resultOpen = false;
      nextQuestion();
    });
    box.appendChild(next);
    var home = makeEl('button', 'btn', '返回首页');
    home.addEventListener('click', function () {
      closeOverlay(overlay);
      resultOpen = false;
      viewHome();
    });
    box.appendChild(home);
    /* v1.2 防沉迷：自由练习结算也提供「我很自律，今天足够了」（回首页 + 清零） */
    var enough = makeEl('button', 'btn', '我很自律，今天足够了');
    enough.addEventListener('click', function () {
      closeOverlay(overlay);
      resultOpen = false;
      Game24Session.enough();
      stopSessionTimer();
      viewHome();
    });
    box.appendChild(enough);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    resultOpen = true;
  }

  /* ============================================================
     v1.1 分享打卡：结果页「分享打卡」→ 全屏弹层
     - 离屏 canvas 1080×1920 绘制打卡卡片 → toDataURL 放入 <img>
     - 复制文案：隐藏 textarea + document.execCommand('copy')
       （Chrome 61 基线无 navigator.clipboard；保底展示全文手动选择复制）
     - 仅 canvas 2D 标准 API，不用 ctx.roundRect（Chrome 99+）
     ============================================================ */
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

  /* 鼓舞语：按时长相对本难度星级阈值分级（≤3★ 阈值 / ≤2★ 阈值 / 其他） */
  function shareEncourage(ms, diff) {
    var d = DIFFS[diff];
    var t3 = d ? d.threeMs : 360000;
    var t2 = d ? d.twoMs : 540000;
    if (ms <= t3) { return '太棒了！全对！'; }
    if (ms <= t2) { return '不错哦，再接再厉！'; }
    return '每天练一练，越来越快！';
  }

  /* 分享文案纯函数：总用时 + 星级 + 连续打卡天数 */
  function buildShareText(ms, stars) {
    var streak = checkin.streak || 0;
    return '今天孩子用24点完成每日挑战，10题用时 ' + fmtMMSS(ms) +
           '，拿下 ' + stars + ' 星！连续打卡 ' + streak +
           ' 天 📅 四则运算越来越熟练，继续加油～';
  }

  /* 绘制 1080×1920 打卡卡片，返回 canvas（离屏，不挂 DOM） */
  function drawShareCard(ms, total, stars, streak) {
    var W = 1080, H = 1920;
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    if (!ctx) { return canvas; }

    /* 背景：暖色渐变 #fff7e6 → #ffd591 */
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#fff7e6');
    bg.addColorStop(1, '#ffd591');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    /* 装饰圆点 */
    ctx.fillStyle = 'rgba(255, 140, 0, 0.18)';
    ctx.beginPath(); ctx.arc(150, 150, 26, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(930, 150, 26, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(150, 1770, 26, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(930, 1770, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255, 140, 0, 0.25)';
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
    ctx.fillText('24点', W / 2, 190);

    var streakText = '连续打卡 ' + streak + ' 天';
    ctx.font = 'bold 38px sans-serif';
    var tw = ctx.measureText(streakText).width;
    var pillW = tw + 64, pillH = 76, pillX = (W - pillW) / 2, pillY = 276;
    roundRectPath(ctx, pillX, pillY, pillW, pillH, 38);
    ctx.fillStyle = '#ff8c00';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(streakText, W / 2, pillY + pillH / 2 + 2);

    /* 中部：挑战总用时大字 + 星级 ★★★（大字下方） */
    ctx.fillStyle = '#8a919f';
    ctx.font = '44px sans-serif';
    ctx.fillText('挑战总用时', W / 2, 620);

    ctx.fillStyle = '#ff8c00';
    ctx.font = 'bold 150px sans-serif';
    ctx.fillText(fmtMMSS(ms), W / 2, 800);

    ctx.font = 'bold 72px sans-serif';
    ctx.fillText('★★★'.slice(0, stars), W / 2, 930);

    /* 中部：用时 / 对题 / 星级 三列 */
    var stats = [
      { label: '用时', value: fmtMMSS(ms) },
      { label: '对题', value: total + '/' + total },
      { label: '星级', value: '★★★'.slice(0, stars) }
    ];
    var cols = [W / 2 - 300, W / 2, W / 2 + 300];
    for (var i = 0; i < 3; i++) {
      ctx.fillStyle = '#1f2329';
      ctx.font = 'bold 56px sans-serif';
      ctx.fillText(stats[i].value, cols[i], 1040);
      ctx.fillStyle = '#8a919f';
      ctx.font = '34px sans-serif';
      ctx.fillText(stats[i].label, cols[i], 1125);
    }

    /* 分隔线 */
    ctx.strokeStyle = '#f0e6d6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(180, 1280);
    ctx.lineTo(900, 1280);
    ctx.stroke();

    /* 底部：鼓励语（按时长分级） */
    ctx.fillStyle = '#e8590c';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText(shareEncourage(ms, state.diff), W / 2, 1440);

    /* 底部：日期 + 工具名 */
    var d = new Date();
    var dateText = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    ctx.fillStyle = '#8a919f';
    ctx.font = '36px sans-serif';
    ctx.fillText(dateText, W / 2, 1620);
    ctx.fillText('24点 · 每日挑战', W / 2, 1690);

    return canvas;
  }

  /* 复制文案：必须在用户手势内（点击回调）执行 execCommand('copy') */
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
    /* setSelectionRange 提升 iOS 兼容（Chrome 61 亦支持） */
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
      /* 保底：文案全文已展示在 .share-text，提示手动长按选择复制 */
      feedbackEl.textContent = '复制失败，请长按选择复制';
      feedbackEl.className = 'share-feedback bad';
    }
    /* 2 秒后清空反馈 */
    window.setTimeout(function () {
      feedbackEl.textContent = '';
      feedbackEl.className = 'share-feedback';
    }, 2000);
  }

  function closeShareOverlay(overlay) {
    if (overlay && overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
  }

  function openShareOverlay(ms, stars, total) {
    stopSessionTimer();   /* v1.2 防沉迷：分享浮层不累计（对局已结束，防御性暂停） */
    var overlay = makeEl('div', 'share-overlay');
    var box = makeEl('div', 'share-box');
    box.appendChild(makeEl('div', 'page-title', '分享打卡'));

    /* 打卡卡片：离屏 canvas → dataURL → <img> */
    var img = makeEl('img', 'share-card-img');
    img.alt = '打卡卡片';
    var canvas = drawShareCard(ms, total, stars, calcStreak(checkin.dates));
    img.src = canvas.toDataURL('image/png');
    box.appendChild(img);

    box.appendChild(makeEl('div', 'share-hint', '长按图片保存，分享到小红书 / 朋友圈'));

    /* 分享文案（只读文本区，保底路径可手动选择复制） */
    var text = buildShareText(ms, stars);
    var textEl = makeEl('textarea', 'share-text');
    textEl.readOnly = true;
    textEl.value = text;
    textEl.addEventListener('focus', function () { textEl.select(); });
    box.appendChild(textEl);

    /* 复制反馈 */
    var feedbackEl = makeEl('div', 'share-feedback', '');
    box.appendChild(feedbackEl);

    /* 按钮：复制文案 + 关闭 */
    var btns = makeEl('div', 'share-btns');
    var copyBtn = makeEl('button', 'btn btn-primary', '复制文案');
    copyBtn.addEventListener('click', function () { copyShareText(text, feedbackEl); });
    var closeBtn = makeEl('button', 'btn', '关闭');
    closeBtn.addEventListener('click', function () { closeShareOverlay(overlay); });
    btns.appendChild(copyBtn);
    btns.appendChild(closeBtn);
    box.appendChild(btns);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  /* ---------- 视图：成绩（recent10） ---------- */
  function viewHistory() {
    renderHeader('成绩');
    clearNode(viewEl);
    var list = records.recent10;
    if (!list.length) {
      viewEl.appendChild(makeEl('div', 'page-title', '暂无成绩，先来一局吧！'));
      renderFooterNav();
      return;
    }
    viewEl.appendChild(makeEl('div', 'page-title', '最近 ' + list.length + ' 次成绩'));

    /* v1.1 进步曲线：TOP，成绩列表之前 */
    viewEl.appendChild(buildProgressCard(list));

    /* 各难度最佳速览 */
    var bestRow = makeEl('div', 'best-row');
    DIFF_ORDER.forEach(function (k) {
      var item = makeEl('div', 'best-item');
      var b = records.best[k];
      item.appendChild(makeEl('span', '', DIFFS[k].label));
      item.appendChild(makeEl('b', '', b ? fmtMMSS(b.timeMs) : '—'));
      bestRow.appendChild(item);
    });
    viewEl.appendChild(bestRow);

    var ul = makeEl('div', 'point-list');
    list.forEach(function (r) {
      var item = makeEl('div', 'point-item');
      var left = makeEl('div');
      var label = DIFFS[r.diff] ? DIFFS[r.diff].label : r.diff;
      left.appendChild(makeEl('div', 'point-name', label + ' · 每日挑战'));
      left.appendChild(makeEl('div', 'point-meta', r.date + ' · ' +
        (r.usedHint ? '用过提示' : '独立完成')));
      item.appendChild(left);
      var right = makeEl('div', 'point-right');
      right.appendChild(makeEl('div', 'point-time', fmtMMSS(r.timeMs)));
      if (r.usedHint) {
        right.appendChild(makeEl('div', 'point-hint-mark', '提示'));
      }
      item.appendChild(right);
      ul.appendChild(item);
    });
    viewEl.appendChild(ul);
    renderFooterNav();
  }

  /* ============================================================
     v1.1 进步曲线：最近 ≤10 次挑战总时长的 SVG 折线图
     - X 轴：次数 1..N；Y 轴：用时秒数，越小越好（反转：小值在上）
     - Y 刻度从数据 min/max 圆整派生；数据点圆点 + 秒数标注
     - Chrome 61 兼容：仅用基础 SVG 元素（polyline/circle/text/line）
     ============================================================ */
  function buildProgressCard(list) {
    var card = makeEl('div', 'progress-card');
    card.appendChild(makeEl('div', 'page-title', '进步曲线'));
    if (list.length < 2) {
      card.appendChild(makeEl('div', 'progress-hint', '完成 2 次挑战后展示进步曲线'));
      return card;
    }
    /* recent10 倒序（最新在前）→ 反转成 旧→新 再绘图 */
    card.appendChild(makeProgressChart(list.slice(0, 10).reverse()));
    return card;
  }

  function makeProgressChart(records) {
    var SVG_NS = 'http://www.w3.org/2000/svg';
    var W = 320, H = 180;
    var PL = 36, PR = 14, PT = 18, PB = 26; /* 边距：左(Y标签)/右/上/下(X标签) */
    var PW = W - PL - PR, PH = H - PT - PB;
    var n = records.length;

    function svgEl(tag, attrs) {
      var el = document.createElementNS(SVG_NS, tag);
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) { el.setAttribute(k, attrs[k]); }
      }
      return el;
    }
    function px(i) { return n === 1 ? PL + PW / 2 : PL + PW * i / (n - 1); }

    /* 用时转秒（四舍五入）；越小越好 → py 反转 */
    var secs = [], minS = Infinity, maxS = -Infinity;
    var q;
    for (q = 0; q < n; q++) {
      var s = Math.round(records[q].timeMs / 1000);
      secs.push(s);
      if (s < minS) { minS = s; }
      if (s > maxS) { maxS = s; }
    }
    var pad = Math.max(3, Math.ceil((maxS - minS) * 0.15));
    var minY = Math.max(0, minS - pad);
    var maxY = maxS + pad;
    if (maxY - minY < 6) { maxY = minY + 6; }
    function py(s) { return PT + PH * (1 - (s - minY) / (maxY - minY)); }

    var svg = svgEl('svg', {
      class: 'line-chart',
      viewBox: '0 0 ' + W + ' ' + H,
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img',
      'aria-label': '进步曲线'
    });

    /* 网格线 + Y 轴标签：min/max 派生 4 条整数刻度（单位 s） */
    var TICKS = 4;
    var t;
    for (t = 0; t < TICKS; t++) {
      var tv = Math.round(minY + (maxY - minY) * t / (TICKS - 1));
      var gy = py(tv);
      svg.appendChild(svgEl('line', {
        x1: PL, y1: gy, x2: W - PR, y2: gy,
        stroke: '#e5e6eb', 'stroke-width': 1
      }));
      var yl = svgEl('text', {
        x: PL - 6, y: gy + 3, 'text-anchor': 'end',
        'font-size': 10, fill: '#8a919f'
      });
      yl.textContent = tv + 's';
      svg.appendChild(yl);
    }

    /* X 轴标签：次数 1..n */
    var xi;
    for (xi = 0; xi < n; xi++) {
      var xl = svgEl('text', {
        x: px(xi), y: H - PB + 14, 'text-anchor': 'middle',
        'font-size': 10, fill: '#8a919f'
      });
      xl.textContent = '' + (xi + 1);
      svg.appendChild(xl);
    }

    /* 折线 */
    var pts = [];
    var p;
    for (p = 0; p < n; p++) {
      pts.push(px(p) + ',' + py(secs[p]));
    }
    svg.appendChild(svgEl('polyline', {
      points: pts.join(' '),
      fill: 'none', stroke: '#2f6feb', 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round'
    }));

    /* 数据点圆点 + 秒数标注 */
    var q2;
    for (q2 = 0; q2 < n; q2++) {
      var cx = px(q2), cy = py(secs[q2]);
      svg.appendChild(svgEl('circle', { cx: cx, cy: cy, r: 3.5, fill: '#2f6feb' }));
      var lb = svgEl('text', {
        x: cx, y: cy - 7, 'text-anchor': 'middle',
        'font-size': 10, fill: '#1f2329', 'font-weight': 600
      });
      lb.textContent = secs[q2] + 's';
      svg.appendChild(lb);
    }

    return svg;
  }

  /* ---------- 视图：打卡日历 ---------- */
  function viewCheckin() {
    renderHeader('打卡日历');
    clearNode(viewEl);
    var card = makeEl('div', 'calendar');
    card.appendChild(makeEl('div', 'page-title', '本月打卡'));
    var grid = makeEl('div', 'calendar-grid');
    var now = new Date();
    var days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var t = todayStr();
    var dates = checkin.dates;
    var d;
    for (d = 1; d <= days; d++) {
      (function (day) {
        var ds = dateStr(new Date(now.getFullYear(), now.getMonth(), day));
        var el = makeEl('div', 'cal-day', '' + day);
        if (dates.indexOf(ds) !== -1) { el.className = 'cal-day done'; }
        if (ds === t) { el.className += ' today'; }
        grid.appendChild(el);
      })(d);
    }
    card.appendChild(grid);
    var streak = calcStreak(checkin.dates);
    var info = makeEl('div', 'streak-info');
    info.appendChild(document.createTextNode('连续打卡 '));
    var b = makeEl('b', '', '' + streak);
    info.appendChild(b);
    info.appendChild(document.createTextNode(' 天' + (streak >= 7 ? ' 🎉' : '')));
    card.appendChild(info);
    var info2 = makeEl('div', 'streak-info');
    info2.appendChild(document.createTextNode('最长连续 '));
    var lb = makeEl('b', '', '' + checkin.longestStreak);
    info2.appendChild(lb);
    info2.appendChild(document.createTextNode(' 天'));
    card.appendChild(info2);
    viewEl.appendChild(card);
    renderFooterNav();
  }

  /* ---------- 底部导航 ---------- */
  function renderFooterNav() {
    clearNode(footerEl);
    var nav = makeEl('div', 'footer-nav');
    var mk = function (label, fn) {
      var b = makeEl('div', 'footer-btn', label);
      b.addEventListener('click', fn);
      return b;
    };
    nav.appendChild(mk('成绩', function () { viewHistory(); }));
    nav.appendChild(mk('打卡', function () { viewCheckin(); }));
    nav.appendChild(mk('首页', function () { viewHome(); }));
    footerEl.appendChild(nav);
  }

  /* ---------- 返回 / 换题 ---------- */
  function onBack() {
    stopTimers();
    roundUsedKeys = [];
    viewHome();
  }
  function onChangeQuestion() {
    if (state.finished || state.mode !== 'free') { return; }
    nextQuestion();
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
  viewHome();
})();
