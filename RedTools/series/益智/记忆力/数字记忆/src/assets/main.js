/* ============================================================
   数字记忆 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   数据：window.APP_DATA（data.js 注入，build 生成 meta，可缺失）
   玩法：递增挑战 —— 显示一串数字（位数×1 秒）→ 隐藏 → 屏幕键盘凭记忆输入
        - 答对：位数 +1 继续；答错：展示正确答案，机会 -1
        - 每局 3 次机会，机会用尽结算
   难度：三档只改起始位数（简单 3 / 进阶 4 / 挑战 5）
   成绩：最高位数（主）+ 答对题数（次）+ 整局用时；星级按最高位数评级
   设计约束：
   - 不使用 import/export / type="module"
   - 不超出 ES2017（无 ?. ?? 对象展开等）
   - 事件全部 addEventListener，无内联事件 / eval
   - 计时用 performance.now()，interval 按差值刷新（后台回来计时仍准）
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };

  /* ---------- DOM ---------- */
  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');

  /* ---------- 难度定义（起始位数，星级按达到的最高位数评级） ---------- */
  var LEVELS = {
    3: { label: '简单 · 3 位起步', start: 3 },
    4: { label: '进阶 · 4 位起步', start: 4 },
    5: { label: '挑战 · 5 位起步', start: 5 }
  };
  var LIVES = 3;       // 每局机会数
  var MAX_DIGITS = 12; // 位数上限（防无限长）

  /* 星级：达到的最高位数 >= 起始+2 → 3★；>= 起始+1 → 2★；否则 1★ */
  function starFor(level, digits) {
    var start = LEVELS[level].start;
    if (digits >= start + 2) { return 3; }
    if (digits >= start + 1) { return 2; }
    return 1;
  }

  /* ---------- 状态 ---------- */
  var state = {
    level: 3,          // 难度（起始位数 3/4/5）
    digits: 3,         // 当前题位数
    round: 0,          // 题号（第几题）
    lives: LIVES,      // 剩余机会
    correct: 0,        // 答对题数
    maxDigits: 0,      // 达到的最高位数（答对时才更新）
    phase: 'idle',     // idle / show / input / feedback
    seq: [],           // 当前题目标数字数组
    input: [],         // 已输入数字数组
    started: false,    // 是否已开始计时（第 1 题显示时置 true）
    finished: false,   // 是否已结算
    startMs: 0,        // 开始计时时间戳
    elapsed: 0,        // 结算用时 ms
    timerId: null,     // 整局计时 interval
    showTimerId: null  // 显示阶段倒计时 interval
  };

  /* ---------- 持久化 ---------- */
  var STORE_KEY = 'redtools.digitmem.v1';
  LX_SHARED.storage.configure({ toolName: 'digitmem' });  // V0.4 迁移：键前缀 redtools.digitmem.v1
  function loadStore() {
    try {
      var raw = LX_SHARED.storage.get('v1');
      if (raw) { return raw; }
    } catch (err) { /* ignore */ }
    return {
      version: 1,
      best: { '3': null, '4': null, '5': null },
      recent: { '3': 0, '4': 0, '5': 0 },
      checkin: { dates: [], streak: 0 },
      history: []
    };
  }
  function saveStore() {
    try {
      LX_SHARED.storage.set('v1', store);
    } catch (err) { /* ignore */ }
  }
  var store = loadStore();
  saveStore(); // 初始化写入

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
  /* 连续打卡天数：含今天往前推、跨天断（dates 升序去重） */
  function calcStreak(dates) {
    return LX_SHARED.progress.streak(dates);
}
  /* 生成 n 位随机数字（首位 1-9，其余 0-9） */
  function genSeq(n) {
    var a = [1 + Math.floor(Math.random() * 9)];
    for (var i = 1; i < n; i++) { a.push(Math.floor(Math.random() * 10)); }
    return a;
  }
  /* 数组逐位相等 */
  function arraysEqual(a, b) {
    if (a.length !== b.length) { return false; }
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) { return false; }
    }
    return true;
  }

  /* ---------- 渲染：顶栏 ---------- */
  function renderHeader(title) {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '数字记忆';
    brand.appendChild(makeEl('span', 'header-title', title || name));
    if (APP.meta && APP.meta.version) {
      brand.appendChild(makeEl('span', 'header-ver', 'v' + APP.meta.version));
    }
    headerEl.appendChild(brand);
  }

  /* ---------- 视图：首页选难度 ---------- */
  function viewHome() {
    // 退出游戏时清理计时（防止 feedback 阶段返回后结算浮层闪现）
    stopTimer();
    stopShowTimer();
    renderHeader();
    clearNode(viewEl);
    viewEl.appendChild(makeEl('div', 'page-title', '选择难度'));
    viewEl.appendChild(makeEl('div', 'home-hint', '看几秒数字，凭记忆输入！答对位数会越来越长'));
    var list = makeEl('div', 'home-list');
    Object.keys(LEVELS).forEach(function (k) {
      var level = Number(k);
      var l = LEVELS[k];
      var card = makeEl('div', 'diff-card');
      var btn = makeEl('button', 'diff-btn', l.label);
      btn.addEventListener('click', function () { startGame(level); });
      card.appendChild(btn);
      var best = store.best[k];
      var meta = makeEl('div', 'diff-meta',
        best && best.digits ? '最佳 ' + best.digits + ' 位' : '未挑战');
      card.appendChild(meta);
      list.appendChild(card);
    });
    viewEl.appendChild(list);
    renderFooterNav();
  }

  /* ---------- 视图：游戏页 ---------- */
  function startGame(level) {
    state.level = level;
    state.digits = LEVELS[level].start;
    state.round = 0;
    state.lives = LIVES;
    state.correct = 0;
    state.maxDigits = 0;
    state.phase = 'idle';
    state.seq = [];
    state.input = [];
    state.started = false;
    state.finished = false;
    state.startMs = 0;
    state.elapsed = 0;
    stopTimer();
    stopShowTimer();
    renderHeader(LEVELS[level].label);
    clearNode(viewEl);
    // 游戏页不走底栏导航（顶部返回 + 底部重新开始）
    clearNode(document.getElementById('app-footer'));
    nextRound();
  }

  /* ---------- 出题与阶段流转 ---------- */
  /* 进入下一题：位数递增（第 1 题为起始位数），出题、显示、隐藏、输入 */
  function nextRound() {
    if (state.finished) { return; }
    state.round += 1;
    state.digits = LEVELS[state.level].start + (state.round - 1);
    if (state.digits > MAX_DIGITS) { state.digits = MAX_DIGITS; }
    state.seq = genSeq(state.digits);
    state.input = [];
    state.phase = 'show';
    // 第 1 题显示时启动整局计时
    if (!state.started) {
      state.started = true;
      state.startMs = performance.now();
      startTimer();
    }
    renderRound();
    startShowTimer();
  }

  /* 显示阶段倒计时：显示时长 = 位数 × 1 秒 */
  function startShowTimer() {
    stopShowTimer();
    var remain = state.digits;
    updateShowCountdown(remain);
    state.showTimerId = setInterval(function () {
      remain -= 1;
      if (remain <= 0) {
        stopShowTimer();
        enterInput();
      } else {
        updateShowCountdown(remain);
      }
    }, 1000);
  }
  function stopShowTimer() {
    if (state.showTimerId) { clearInterval(state.showTimerId); state.showTimerId = null; }
  }
  function updateShowCountdown(remain) {
    var el = document.getElementById('show-count');
    if (el) { el.textContent = '⏳ ' + remain + ' 秒后消失'; }
  }

  /* 数字隐藏，进入输入阶段 */
  function enterInput() {
    if (state.finished) { return; }
    state.phase = 'input';
    state.input = [];
    renderRound();
  }

  /* ---------- 渲染：当前题（show / input / feedback） ---------- */
  function renderRound() {
    var level = state.level;
    var l = LEVELS[level];
    clearNode(viewEl);

    // 顶部状态栏：返回 | 题号 | 机会
    var top = makeEl('div', 'game-top');
    var back = makeEl('button', 'game-back', '‹ 返回');
    back.addEventListener('click', function () { viewHome(); });
    top.appendChild(back);
    top.appendChild(makeEl('div', 'game-name', '第 ' + state.round + ' 题 · ' + state.digits + ' 位'));
    var hearts = '❤❤❤'.slice(0, state.lives) + '♡♡♡'.slice(0, LIVES - state.lives);
    top.appendChild(makeEl('div', 'game-lives', hearts));
    viewEl.appendChild(top);

    // 数字格子区
    var seqArea = makeEl('div', 'seq-area');
    var grid = makeEl('div', 'seq-grid grid-' + state.digits);
    grid.id = 'seq-grid';
    var cellW = Math.round(8000 / state.digits) / 100; // 格宽 = 80/digits %
    for (var i = 0; i < state.digits; i++) {
      (function (idx) {
        var cell = makeEl('div', 'seq-cell');
        cell.id = 'seq-cell-' + idx;
        cell.style.width = cellW + '%';
        if (state.phase === 'show') {
          cell.textContent = '' + state.seq[idx];
          cell.className = 'seq-cell show';
        } else if (state.phase === 'input') {
          cell.textContent = state.input[idx] !== undefined ? '' + state.input[idx] : '';
          cell.className = 'seq-cell input';
          if (state.input[idx] !== undefined) { cell.className += ' filled'; }
        } else if (state.phase === 'feedback') {
          cell.textContent = '' + state.seq[idx];
          cell.className = 'seq-cell feedback';
          if (state.input[idx] !== state.seq[idx]) { cell.className += ' wrong'; }
        }
        grid.appendChild(cell);
      })(i);
    }
    seqArea.appendChild(grid);

    // 阶段提示区
    var hint = makeEl('div', 'seq-hint');
    hint.id = 'seq-hint';
    if (state.phase === 'show') {
      hint.appendChild(makeEl('div', 'hint-big', '👀 记住数字！'));
      var countEl = makeEl('div', 'show-count');
      countEl.id = 'show-count';
      hint.appendChild(countEl);
      updateShowCountdown(state.digits);
    } else if (state.phase === 'input') {
      hint.appendChild(makeEl('div', 'hint-big', '输入你记住的数字'));
      var tEl = makeEl('div', 'game-timer');
      tEl.id = 'game-timer';
      hint.appendChild(tEl);
      updateTimer(performance.now() - state.startMs);
    } else if (state.phase === 'feedback') {
      hint.appendChild(makeEl('div', 'hint-feedback', state.lastOk ? '✓ 答对了！' : '✗ 正确答案：' + state.seq.join('')));
      if (!state.lastOk) {
        hint.appendChild(makeEl('div', 'hint-sub', '机会 -1，剩余 ' + state.lives + ' 次' + (state.lives <= 0 ? '，本局结束' : '')));
      }
    }
    seqArea.appendChild(hint);
    viewEl.appendChild(seqArea);

    // 输入阶段：数字键盘
    if (state.phase === 'input') {
      viewEl.appendChild(renderKeyboard());
    }

    // 底部：重新开始
    var row = makeEl('div', 'btn-row');
    var restart = makeEl('button', 'btn btn-primary', '重新开始');
    restart.addEventListener('click', function () { startGame(level); });
    row.appendChild(restart);
    viewEl.appendChild(row);
  }

  /* ---------- 数字键盘 ---------- */
  function renderKeyboard() {
    var kbd = makeEl('div', 'num-kbd');
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '确定'];
    keys.forEach(function (label) {
      var b = makeEl('button', 'kbd-btn', label);
      if (label === '确定') {
        b.className = 'kbd-btn kbd-ok';
        b.id = 'kbd-ok';
        b.setAttribute('disabled', 'disabled'); // 未满位不可提交，防误触
        b.addEventListener('click', function () { onSubmit(); });
      } else if (label === '⌫') {
        b.className = 'kbd-btn kbd-del';
        b.addEventListener('click', function () { onBack(); });
      } else {
        b.addEventListener('click', function () { onKey(Number(label)); });
      }
      kbd.appendChild(b);
    });
    return kbd;
  }

  /* ---------- 键盘输入 ---------- */
  function onKey(d) {
    if (state.phase !== 'input' || state.finished) { return; }
    if (state.input.length >= state.digits) { return; }
    state.input.push(d);
    renderInputState();
  }
  function onBack() {
    if (state.phase !== 'input' || state.finished) { return; }
    if (!state.input.length) { return; }
    state.input.pop();
    renderInputState();
  }
  function onSubmit() {
    if (state.phase !== 'input' || state.finished) { return; }
    if (state.input.length < state.digits) { return; }
    submitRound();
  }
  /* 输入阶段局部更新（格子内容 + 确定按钮可用性） */
  function renderInputState() {
    for (var i = 0; i < state.digits; i++) {
      var cell = document.getElementById('seq-cell-' + i);
      if (!cell) { continue; }
      cell.textContent = state.input[i] !== undefined ? '' + state.input[i] : '';
      if (state.input[i] !== undefined) { cell.className = 'seq-cell input filled'; }
      else { cell.className = 'seq-cell input'; }
    }
    var ok = document.getElementById('kbd-ok');
    if (ok) {
      if (state.input.length >= state.digits) { ok.removeAttribute('disabled'); }
      else { ok.setAttribute('disabled', 'disabled'); }
    }
  }

  /* ---------- 判定 ---------- */
  function submitRound() {
    state.phase = 'feedback';
    var ok = arraysEqual(state.input, state.seq);
    state.lastOk = ok;
    if (ok) {
      state.correct += 1;
      state.maxDigits = state.digits; // 答对 → 记录达到的最高位数
      renderRound();
      window.setTimeout(nextRound, 900);
    } else {
      state.lives -= 1;
      renderRound();
      if (state.lives <= 0) {
        window.setTimeout(finishGame, 2000);
      } else {
        window.setTimeout(nextRound, 2000);
      }
    }
  }

  /* ---------- 计时 ---------- */
  function startTimer() {
    if (state.timerId) { clearInterval(state.timerId); }
    state.timerId = setInterval(function () {
      updateTimer(performance.now() - state.startMs);
    }, 100);
  }
  function stopTimer() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
  }
  function updateTimer(ms) {
    var el = document.getElementById('game-timer');
    if (!el) { return; }
    var txt = (ms / 1000).toFixed(1);
    if (txt.length === 3) { txt = '0' + txt; } // "7.5" → "07.5"
    el.textContent = '⏱ ' + txt;
  }

  /* ---------- 结算 ---------- */
  function finishGame() {
    if (state.finished) { return; }
    state.finished = true;
    stopTimer();
    stopShowTimer();
    state.elapsed = performance.now() - state.startMs;

    // 打卡：完成一局即点亮今日
    var t = todayStr();
    var dates = store.checkin.dates;
    if (dates.indexOf(t) === -1) { dates.push(t); }
    dates.sort();
    while (dates.length > 365) { dates.shift(); }
    store.checkin.streak = calcStreak(dates);

    // 星级
    var stars = starFor(state.level, state.maxDigits);

    // 最佳 / 最近 / 历史（最高位数大者覆盖）
    var key = '' + state.level;
    var isNewBest = false;
    var best = store.best[key];
    if (!best || state.maxDigits > best.digits) {
      store.best[key] = { digits: state.maxDigits, date: t };
      isNewBest = true;
    }
    store.recent[key] = state.maxDigits;
    store.history.unshift({
      date: t, level: state.level,
      maxDigits: state.maxDigits, correct: state.correct,
      wrong: LIVES - state.lives, ms: Math.round(state.elapsed), stars: stars
    });
    while (store.history.length > 30) { store.history.pop(); }
    saveStore();

    // 略延迟展示结果，让正确答案反馈可见
    window.setTimeout(function () {
      showResult(stars, isNewBest);
    }, 500);
  }

  /* ---------- 结果浮层 ---------- */
  function mkStat(label, val) {
    var s = makeEl('div', 'result-stat');
    s.appendChild(makeEl('b', '', val));
    s.appendChild(makeEl('span', '', label));
    return s;
  }
  function showResult(stars, isNewBest) {
    var overlay = makeEl('div', 'result-overlay');
    var box = makeEl('div', 'result-box');
    box.appendChild(makeEl('div', 'result-title', '本局结束'));
    box.appendChild(makeEl('div', 'result-time', state.maxDigits + ' 位'));
    var stats = makeEl('div', 'result-stats');
    stats.appendChild(mkStat('最高位数', state.maxDigits + ' 位'));
    stats.appendChild(mkStat('答对', state.correct + ' 题'));
    stats.appendChild(mkStat('用时', (state.elapsed / 1000).toFixed(1) + 's'));
    box.appendChild(stats);
    box.appendChild(makeEl('div', 'result-stars', '★★★'.slice(0, stars)));
    if (isNewBest) {
      box.appendChild(makeEl('div', 'result-record', '🎉 新纪录！'));
    }
    var again = makeEl('button', 'btn btn-primary', '再来一局');
    again.addEventListener('click', function () {
      closeOverlay(overlay);
      startGame(state.level);
    });
    box.appendChild(again);
    var home = makeEl('button', 'btn', '返回首页');
    home.addEventListener('click', function () {
      closeOverlay(overlay);
      viewHome();
    });
    box.appendChild(home);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }
  function closeOverlay(overlay) {
    if (overlay && overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
  }

  /* ---------- 视图：成绩历史 ---------- */
  function viewHistory() {
    renderHeader('成绩');
    clearNode(viewEl);
    var h = store.history;
    if (!h.length) {
      viewEl.appendChild(makeEl('div', 'page-title', '暂无成绩，先来一局吧！'));
      renderFooterNav();
      return;
    }
    viewEl.appendChild(makeEl('div', 'page-title', '最近 ' + h.length + ' 次成绩'));
    var list = makeEl('div', 'point-list');
    h.forEach(function (r) {
      var item = makeEl('div', 'point-item');
      var left = makeEl('div');
      var label = LEVELS[r.level] ? LEVELS[r.level].label : (r.level + ' 位起步');
      left.appendChild(makeEl('div', 'point-name', label));
      left.appendChild(makeEl('div', 'point-meta', r.date + ' · 答对 ' + r.correct + ' 题'));
      item.appendChild(left);
      var right = makeEl('div', 'point-right');
      right.appendChild(makeEl('div', 'point-time', r.maxDigits + ' 位'));
      right.appendChild(makeEl('div', 'point-stars', '★★★'.slice(0, r.stars)));
      item.appendChild(right);
      list.appendChild(item);
    });
    viewEl.appendChild(list);
    renderFooterNav();
  }

  /* ---------- 视图：打卡日历（完成一局自动打卡，本页仅展示） ---------- */
  function viewCheckin() {
    renderHeader('打卡日历');
    clearNode(viewEl);
    var card = makeEl('div', 'calendar');
    card.appendChild(makeEl('div', 'page-title', '本月打卡'));
    var grid = makeEl('div', 'calendar-grid');
    var now = new Date();
    var days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var t = todayStr();
    var dates = store.checkin.dates;
    for (var d = 1; d <= days; d++) {
      (function (day) {
        var ds = dateStr(new Date(now.getFullYear(), now.getMonth(), day));
        var el = makeEl('div', 'cal-day', '' + day);
        if (dates.indexOf(ds) !== -1) { el.className = 'cal-day done'; }
        if (ds === t) { el.className += ' today'; }
        grid.appendChild(el);
      })(d);
    }
    card.appendChild(grid);
    var streak = calcStreak(store.checkin.dates);
    var info = makeEl('div', 'streak-info');
    info.appendChild(document.createTextNode('连续打卡 '));
    var b = makeEl('b', '', '' + streak);
    info.appendChild(b);
    info.appendChild(document.createTextNode(' 天' + (streak >= 7 ? ' 🎉' : '')));
    card.appendChild(info);
    viewEl.appendChild(card);
    renderFooterNav();
  }

  /* ---------- 底部导航 ---------- */
  function renderFooterNav() {
    var foot = document.getElementById('app-footer');
    clearNode(foot);
    var nav = makeEl('div', 'footer-nav');
    var mk = function (label, fn) {
      var b = makeEl('div', 'footer-btn', label);
      b.addEventListener('click', fn);
      return b;
    };
    nav.appendChild(mk('成绩', function () { viewHistory(); }));
    nav.appendChild(mk('打卡', function () { viewCheckin(); }));
    nav.appendChild(mk('首页', function () { viewHome(); }));
    foot.appendChild(nav);
  }

  /* ---------- 实体键盘增强（0-9 / Backspace / Enter） ---------- */
  if (window.addEventListener) {
    document.addEventListener('keydown', function (e) {
      if (state.phase !== 'input' || state.finished) { return; }
      var k = e.key;
      if (k >= '0' && k <= '9') { onKey(Number(k)); }
      else if (k === 'Backspace') { onBack(); }
      else if (k === 'Enter') { onSubmit(); }
    });
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
