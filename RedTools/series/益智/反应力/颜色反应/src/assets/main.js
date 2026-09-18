/* ============================================================
   颜色反应 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   数据：window.APP_DATA（data.js 注入，build 生成 meta，可缺失）
   玩法：Stroop 字色干扰 —— 显示颜色词（红/蓝/绿/黄），文字颜色可能
        与词义一致或不一致，玩家点 4 色按钮选出「字的颜色」（非字义）
         - 简单：字色=词义（无干扰），每局 10 题
         - 进阶：字色≠词义（经典干扰），每局 10 题
         - 挑战：混合（约 1/2 一致）+ 60 秒限时，计答对题数
   难度：三档（同/异/混+限时）
   成绩：答对题数 + 正确率；星级按正确率/限时题数；打卡 + 晒分分享
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

  /* ---------- 常量 ---------- */
  var COLORS = { 红: '#e74c3c', 蓝: '#3498db', 绿: '#2ecc71', 黄: '#f1c40f' };
  var COLOR_KEYS = ['红', '蓝', '绿', '黄'];
  /* 难度：键 1/2/3；mode：same 同色=同义 / diff 异色 / mix 混合；limit>0 为限时秒 */
  var LEVELS = {
    1: { label: '简单 · 10 题', mode: 'same', total: 10, limit: 0 },
    2: { label: '进阶 · 10 题', mode: 'diff', total: 10, limit: 0 },
    3: { label: '挑战 · 60 秒', mode: 'mix', total: 0, limit: 60 }
  };
  var FEEDBACK_OK_MS = 350;   // 答对绿闪后进下一题延迟
  var FEEDBACK_NO_MS = 900;   // 答错展示正确答案后进下一题延迟（学习反馈）

  /* ---------- 状态 ---------- */
  var state = {
    level: 1,          // 难度 1/2/3
    total: 10,         // 本局总题数（挑战=0 表示限时）
    limit: 0,          // 限时秒（0=非限时）
    phase: 'idle',     // idle / playing / feedback / finish
    index: 0,          // 已答第几题
    score: 0,          // 答对题数
    word: '',          // 当前词义（红/蓝/绿/黄）
    color: '',         // 当前字色（正确答案）
    startMs: 0,        // 限时开始时间戳
    timeLeft: 0,       // 限时剩余秒（显示用）
    finished: false,   // 是否已结算
    timerId: null,     // 限时计时 interval
    endTimerId: null,  // 限时兜底 setTimeout
    feedTimerId: null, // 反馈进下一题 timer
    resultOverlay: null, // 结算浮层引用
    shareOverlay: null,  // 分享浮层引用
    summary: null      // 结算摘要（分享/文案用）
  };

  /* ---------- 持久化 ---------- */
  var STORE_KEY = 'redtools.colorreact.v1';
  function loadStore() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) { return JSON.parse(raw); }
    } catch (err) { /* ignore */ }
    return {
      version: 1,
      best: { '1': null, '2': null, '3': null },
      recent: { '1': 0, '2': 0, '3': 0 },
      checkin: { dates: [], streak: 0 },
      history: []
    };
  }
  function saveStore() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
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
  function fmtDate(d) {
    return '' + d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }
  /* 连续打卡天数：含今天往前推、跨天断（dates 升序去重） */
  function calcStreak(dates) {
    var streak = 0;
    var d = new Date();
    for (var i = dates.length - 1; i >= 0; i--) {
      if (dates[i] === todayStr()) { streak = 1; continue; }
      d.setDate(d.getDate() - 1);
      var want = dateStr(d);
      if (dates[i] === want) { streak += 1; }
      else { break; }
    }
    return streak;
  }
  /* 星级：简单/进阶按正确率（全对 3★、≥8 题 2★）；挑战按限时题数 */
  function starFor(level, score, total) {
    if (state.limit > 0) {
      if (score >= 20) { return 3; }
      if (score >= 12) { return 2; }
      return 1;
    }
    if (score >= total) { return 3; }
    if (score >= 8) { return 2; }
    return 1;
  }
  /* 等级标签：简单/进阶按正确率；挑战按题数 */
  function labelFor(level, score, total) {
    if (state.limit > 0) {
      if (score >= 25) { return '色彩大师'; }
      if (score >= 18) { return '火眼金睛'; }
      if (score >= 12) { return '慧眼识色'; }
      if (score >= 8) { return '慢慢来'; }
      return '多练习';
    }
    var rate = total > 0 ? score / total : 0;
    if (rate >= 1) { return '色彩大师'; }
    if (rate >= 0.8) { return '火眼金睛'; }
    if (rate >= 0.6) { return '慧眼识色'; }
    if (rate >= 0.4) { return '慢慢来'; }
    return '多练习';
  }
  /* 鼓励语（按等级标签） */
  function motivationFor(label) {
    if (label === '色彩大师') { return '色感惊人，反应超快！'; }
    if (label === '火眼金睛') { return '又快又准，太厉害！'; }
    if (label === '慧眼识色') { return '看得仔细，继续加油！'; }
    if (label === '慢慢来') { return '别急，稳住再点！'; }
    return '多练几次，反应会更快！';
  }

  /* ---------- 出题 ---------- */
  /* 随机一个颜色词 + 按难度决定字色 */
  function genQuestion() {
    var w = COLOR_KEYS[Math.floor(Math.random() * 4)];
    var c;
    if (state.level === 1) {
      c = w;                       // 字色=词义
    } else if (state.level === 2) {
      c = randomOther(w);          // 字色≠词义
    } else {
      c = Math.random() < 0.5 ? w : randomOther(w); // 混合：约一半一致
    }
    // 简单去重：与上一题完全相同时重抽（最多 5 次）
    var guard = 0;
    while (guard < 5 && state.word === w && state.color === c) {
      w = COLOR_KEYS[Math.floor(Math.random() * 4)];
      if (state.level === 1) { c = w; }
      else if (state.level === 2) { c = randomOther(w); }
      else { c = Math.random() < 0.5 ? w : randomOther(w); }
      guard += 1;
    }
    return { word: w, color: c };
  }
  function randomOther(w) {
    var others = [];
    for (var i = 0; i < COLOR_KEYS.length; i++) {
      if (COLOR_KEYS[i] !== w) { others.push(COLOR_KEYS[i]); }
    }
    return others[Math.floor(Math.random() * others.length)];
  }

  /* ---------- 渲染：顶栏 ---------- */
  function renderHeader(title) {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '颜色反应';
    brand.appendChild(makeEl('span', 'header-title', title || name));
    if (APP.meta && APP.meta.version) {
      brand.appendChild(makeEl('span', 'header-ver', 'v' + APP.meta.version));
    }
    headerEl.appendChild(brand);
  }

  /* ---------- 视图：首页选难度 ---------- */
  function viewHome() {
    stopTimers();
    renderHeader();
    clearNode(viewEl);
    viewEl.appendChild(makeEl('div', 'page-title', '选择难度'));
    viewEl.appendChild(makeEl('div', 'home-hint', '看字的颜色，不是字的意思！测测你的辨色反应'));
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
        best && best.score !== undefined ? '最佳 ' + best.score + ' 题' : '未挑战');
      card.appendChild(meta);
      list.appendChild(card);
    });
    viewEl.appendChild(list);
    // 玩法说明
    viewEl.appendChild(makeEl('div', 'howto-title', '玩法说明'));
    var howto = makeEl('div', 'howto');
    var lines = [
      '① 看字的颜色，不是字的意思',
      '② 比如「红」字是蓝色，要选蓝',
      '③ 答对越多越好',
      '④ 挑战档 60 秒限时'
    ];
    lines.forEach(function (t) { howto.appendChild(makeEl('div', 'howto-line', t)); });
    viewEl.appendChild(howto);
    renderFooterNav();
  }

  /* ---------- 视图：游戏页 ---------- */
  function startGame(level) {
    var l = LEVELS[level];
    state.level = level;
    state.total = l.total;
    state.limit = l.limit;
    state.index = 0;
    state.score = 0;
    state.phase = 'playing';
    state.finished = false;
    state.word = '';
    state.color = '';
    state.timeLeft = l.limit;
    stopTimers();
    var q = genQuestion();
    state.word = q.word;
    state.color = q.color;
    renderHeader(l.label);
    clearNode(viewEl);
    clearNode(document.getElementById('app-footer'));
    renderGame();
    if (l.limit > 0) { startTimer(); }
  }

  /* 限时计时：performance.now() 差值 + 兜底 setTimeout（双保险） */
  function startTimer() {
    state.startMs = performance.now();
    state.timerId = setInterval(function () {
      var elapsed = (performance.now() - state.startMs) / 1000;
      var remain = Math.max(0, state.limit - elapsed);
      updateTimer(remain);
      if (remain <= 0) { finishGame(); }
    }, 100);
    state.endTimerId = setTimeout(finishGame, state.limit * 1000 + 50);
  }
  function stopTimers() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
    if (state.endTimerId) { clearTimeout(state.endTimerId); state.endTimerId = null; }
    if (state.feedTimerId) { clearTimeout(state.feedTimerId); state.feedTimerId = null; }
  }
  function updateTimer(remain) {
    state.timeLeft = Math.ceil(remain);
    var el = document.getElementById('game-timer');
    if (el) {
      var txt = '⏱ ' + state.timeLeft + ' 秒';
      if (txt.length === 4) { txt = '⏱ 0' + state.timeLeft + ' 秒'; }
      el.textContent = txt;
    }
  }

  /* 渲染：游戏页（进度/颜色词/反馈区/4 色按钮） */
  function renderGame() {
    clearNode(viewEl);
    // 顶部状态栏：返回 | 题号或已对数 | 倒计时或答对数
    var top = makeEl('div', 'game-top');
    var back = makeEl('button', 'game-back', '‹ 返回');
    back.addEventListener('click', function () { viewHome(); });
    top.appendChild(back);
    var progText = state.limit > 0 ? ('已对 ' + state.score + ' 题') : ('第 ' + (state.index + 1) + '/' + state.total + ' 题');
    top.appendChild(makeEl('div', 'game-name', progText));
    var timerEl = makeEl('div', 'game-timer', '');
    timerEl.id = 'game-timer';
    top.appendChild(timerEl);
    if (state.limit > 0) { updateTimer(state.limit); }
    else { timerEl.textContent = '答对 ' + state.score + ' 题'; }
    viewEl.appendChild(top);

    // 颜色词大卡片
    var wordCard = makeEl('div', 'word-card');
    wordCard.id = 'word-card';
    var wordEl = makeEl('div', 'word-text', state.word);
    wordEl.id = 'word-text';
    wordEl.style.color = COLORS[state.color];
    wordCard.appendChild(wordEl);
    viewEl.appendChild(wordCard);

    // 反馈提示区
    var fb = makeEl('div', 'fb-area');
    fb.id = 'fb-area';
    viewEl.appendChild(fb);

    // 4 色按钮（2×2）
    var grid = makeEl('div', 'color-grid');
    COLOR_KEYS.forEach(function (k) {
      var b = makeEl('button', 'color-btn', k);
      b.id = 'btn-' + k;
      b.style.background = COLORS[k];
      if (k === '黄') { b.className = 'color-btn yellow'; }
      b.addEventListener('click', function () { onPick(k); });
      grid.appendChild(b);
    });
    viewEl.appendChild(grid);

    // 底部：重新开始
    var row = makeEl('div', 'btn-row');
    var restart = makeEl('button', 'btn btn-primary', '重新开始');
    restart.addEventListener('click', function () { startGame(level()); });
    row.appendChild(restart);
    viewEl.appendChild(row);
  }
  function level() { return state.level; }

  /* ---------- 点击判定 ---------- */
  function onPick(key) {
    if (state.phase !== 'playing' || state.finished) { return; }
    state.phase = 'feedback';
    var ok = key === state.color;
    var fb = document.getElementById('fb-area');
    if (ok) {
      state.score += 1;
      flashBtn(key, true);
      if (fb) {
        fb.textContent = '✓ 答对了！';
        fb.className = 'fb-area fb-ok';
      }
      state.feedTimerId = setTimeout(nextQuestion, FEEDBACK_OK_MS);
    } else {
      flashBtn(key, false);
      if (fb) {
        fb.textContent = '✗ 答案是「' + state.color + '」色';
        fb.className = 'fb-area fb-no';
      }
      state.feedTimerId = setTimeout(nextQuestion, FEEDBACK_NO_MS);
    }
    // 更新顶部计数（挑战档写 game-name，倒计时由 interval 独占 game-timer）
    if (state.limit === 0) {
      var nameEl = document.querySelector('.game-name');
      if (nameEl) { nameEl.textContent = '第 ' + (state.index + 1) + '/' + state.total + ' 题'; }
      var timerEl = document.getElementById('game-timer');
      if (timerEl) { timerEl.textContent = '答对 ' + state.score + ' 题'; }
    } else {
      var nameEl2 = document.querySelector('.game-name');
      if (nameEl2) { nameEl2.textContent = '已对 ' + state.score + ' 题'; }
    }
  }
  /* 按钮闪烁：绿闪/红闪 ≤400ms（光敏安全） */
  function flashBtn(key, ok) {
    var btn = document.getElementById('btn-' + key);
    if (!btn) { return; }
    var orig = btn.style.background;
    btn.style.background = ok ? '#2ecc71' : '#e74c3c';
    setTimeout(function () {
      if (btn && btn.style) { btn.style.background = orig; }
    }, 300);
  }

  /* ---------- 下一题 / 结算 ---------- */
  function nextQuestion() {
    state.feedTimerId = null;
    if (state.finished) { return; }
    if (state.limit === 0 && state.index + 1 >= state.total) {
      finishGame();
      return;
    }
    state.index += 1;
    var q = genQuestion();
    state.word = q.word;
    state.color = q.color;
    state.phase = 'playing';
    // 更新颜色词 + 反馈区复位
    var wordEl = document.getElementById('word-text');
    if (wordEl) {
      wordEl.textContent = state.word;
      wordEl.style.color = COLORS[state.color];
    }
    var fb = document.getElementById('fb-area');
    if (fb) { fb.textContent = ''; fb.className = 'fb-area'; }
    var topName = document.querySelector('.game-name');
    if (topName && state.limit === 0) { topName.textContent = '第 ' + (state.index + 1) + '/' + state.total + ' 题'; }
  }

  /* ---------- 结算 ---------- */
  function finishGame() {
    if (state.finished) { return; }
    state.finished = true;
    state.phase = 'finish';
    stopTimers();

    // 打卡：完成一局即点亮今日
    var t = todayStr();
    var dates = store.checkin.dates;
    if (dates.indexOf(t) === -1) { dates.push(t); }
    dates.sort();
    while (dates.length > 365) { dates.shift(); }
    store.checkin.streak = calcStreak(dates);

    // 星级 / 标签
    var score = state.score;
    var total = state.total;
    var stars = starFor(state.level, score, total);
    var label = labelFor(state.level, score, total);

    // 最佳 / 最近 / 历史（score 更大覆盖；挑战=题数，简单/进阶=答对题数）
    var key = '' + state.level;
    var isNewBest = false;
    var best = store.best[key];
    if (!best || score > best.score) {
      store.best[key] = { score: score, date: t };
      isNewBest = true;
    }
    store.recent[key] = score;
    store.history.unshift({
      date: t, level: state.level,
      score: score, total: (state.limit > 0 ? state.score : state.total), stars: stars
    });
    while (store.history.length > 30) { store.history.pop(); }
    saveStore();

    state.summary = {
      level: state.level, limit: state.limit, total: state.total,
      score: score, stars: stars, label: label, isNewBest: isNewBest
    };
    showResult();
  }

  /* ---------- 结果浮层 ---------- */
  function mkStat(label, val) {
    var s = makeEl('div', 'result-stat');
    s.appendChild(makeEl('b', '', val));
    s.appendChild(makeEl('span', '', label));
    return s;
  }
  function showResult() {
    var s = state.summary;
    closeOverlay(state.resultOverlay);
    var overlay = makeEl('div', 'result-overlay');
    var box = makeEl('div', 'result-box');
    box.appendChild(makeEl('div', 'result-title', '本局结束'));
    var scoreText = s.limit > 0 ? (s.score + ' 题') : ('答对 ' + s.score + '/' + s.total + ' 题');
    box.appendChild(makeEl('div', 'result-time', scoreText));
    var tag = makeEl('div', 'result-tag', '『' + s.label + '』');
    box.appendChild(tag);
    var stats = makeEl('div', 'result-stats');
    if (s.limit > 0) {
      stats.appendChild(mkStat('限时', '60 秒'));
      stats.appendChild(mkStat('答对', s.score + ' 题'));
    } else {
      var rate = s.total > 0 ? Math.round(s.score / s.total * 100) : 0;
      stats.appendChild(mkStat('正确率', rate + '%'));
      stats.appendChild(mkStat('答对', s.score + ' 题'));
    }
    stats.appendChild(mkStat('连续打卡', (store.checkin.streak || 0) + ' 天'));
    box.appendChild(stats);
    box.appendChild(makeEl('div', 'result-stars', '★★★'.slice(0, s.stars)));
    if (s.isNewBest) {
      box.appendChild(makeEl('div', 'result-record', '🎉 新纪录！'));
    }
    var btnRow = makeEl('div', 'btn-row');
    var again = makeEl('button', 'btn btn-primary', '再来一局');
    again.addEventListener('click', function () {
      closeOverlay(state.resultOverlay);
      startGame(state.level);
    });
    btnRow.appendChild(again);
    var home = makeEl('button', 'btn', '返回首页');
    home.addEventListener('click', function () {
      closeOverlay(state.resultOverlay);
      viewHome();
    });
    btnRow.appendChild(home);
    box.appendChild(btnRow);
    var share = makeEl('button', 'btn btn-share', '📷 分享打卡');
    share.addEventListener('click', function () { openShare(); });
    box.appendChild(share);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    state.resultOverlay = overlay;
  }
  function closeOverlay(overlay) {
    if (overlay && overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
    if (overlay === state.resultOverlay) { state.resultOverlay = null; }
    if (overlay === state.shareOverlay) { state.shareOverlay = null; }
  }

  /* ---------- 分享（晒分传播） ---------- */
  function shareText() {
    var s = state.summary;
    if (!s) { return ''; }
    var streak = store.checkin && store.checkin.streak ? store.checkin.streak : 0;
    var mode = s.limit > 0 ? '60秒限时' : '10题局制';
    return '孩子玩【颜色反应】『' + LEVELS[s.level].label + '』' + mode +
      '答对了 ' + s.score + ' 题，『' + s.label + '』！已连续打卡 ' + streak +
      ' 天，辨色反应训练走起～#颜色反应 #专注力训练 #小学生益智';
  }
  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function drawShareCard() {
    var s = state.summary;
    var W = 1080, H = 1920;
    var cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    var ctx = cv.getContext('2d');
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#fff3e6');
    grad.addColorStop(1, '#ffe3cc');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255, 140, 66, 0.35)';
    for (var i = 0; i < 24; i++) {
      var rx = Math.random() * W;
      var ry = Math.random() * H * 0.55;
      ctx.beginPath();
      ctx.arc(rx, ry, 6 + Math.random() * 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#d95b1e';
    ctx.font = 'bold 84px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('颜色反应', W / 2, 300);
    ctx.fillStyle = '#f08a4d';
    ctx.font = '42px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('辨色小达人', W / 2, 400);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    roundRectPath(ctx, 110, 520, W - 220, 820, 24);
    ctx.fill();
    ctx.strokeStyle = '#ffd6b8';
    ctx.lineWidth = 4;
    roundRectPath(ctx, 110, 520, W - 220, 820, 24);
    ctx.stroke();
    ctx.fillStyle = '#e07b35';
    ctx.font = 'bold 52px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('【' + LEVELS[s.level].label + '】', W / 2, 660);
    ctx.fillStyle = '#b0886a';
    ctx.font = '40px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(s.limit > 0 ? '限时答对题数' : '答对题数', W / 2, 770);
    var scoreText = s.limit > 0 ? (s.score + ' 题') : (s.score + '/' + s.total + ' 题');
    ctx.fillStyle = '#ff8c42';
    ctx.font = 'bold 128px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(scoreText, W / 2, 900);
    ctx.fillStyle = '#ff8c42';
    roundRectPath(ctx, W / 2 - 170, 1040, 340, 84, 42);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 46px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('『' + s.label + '』', W / 2, 1084);
    ctx.fillStyle = '#a8765c';
    ctx.font = '40px "PingFang SC","Microsoft YaHei",sans-serif';
    var rate = s.total > 0 ? '正确率 ' + Math.round(s.score / s.total * 100) + '%' : '限时 60 秒';
    ctx.fillText(rate + ' · 连续打卡 ' + (store.checkin && store.checkin.streak || 0) + ' 天', W / 2, 1220);
    ctx.fillStyle = '#d95b1e';
    ctx.font = '54px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(motivationFor(s.label), W / 2, 1540);
    ctx.fillStyle = '#c98d6b';
    ctx.font = '36px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('龙爸乐学 · 专注儿童益智', W / 2, 1730);
    ctx.fillText(fmtDate(new Date()), W / 2, 1800);
    return cv;
  }
  var shareOpen = false;
  function openShare() {
    if (shareOpen) { return; }
    shareOpen = true;
    var cv = drawShareCard();
    var img = document.createElement('img');
    img.className = 'share-img';
    img.setAttribute('alt', '颜色反应成绩打卡卡片');
    img.src = cv.toDataURL('image/png');
    var cardWrap = makeEl('div', 'share-card-wrap');
    cardWrap.appendChild(img);
    var hint = makeEl('div', 'share-hint', '📸 长按保存图片 · 发布笔记分享成就');
    var btnCopy = makeEl('button', 'btn btn-primary', '复制分享文案');
    btnCopy.addEventListener('click', copyShareText);
    var btnBack = makeEl('button', 'btn', '返回结算');
    btnBack.addEventListener('click', function () {
      shareOpen = false;
      closeOverlay(state.shareOverlay);
      showResult();
    });
    var btns = makeEl('div', 'share-btns');
    btns.appendChild(btnCopy);
    btns.appendChild(btnBack);
    var card = makeEl('div', 'overlay-card share-card');
    card.appendChild(makeEl('div', 'overlay-title', '📷 分享打卡'));
    card.appendChild(cardWrap);
    card.appendChild(hint);
    card.appendChild(btns);
    var overlay = makeEl('div', 'result-overlay share-overlay');
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    state.shareOverlay = overlay;
  }
  function copyShareText() {
    var text = shareText();
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    document.body.removeChild(ta);
    if (ok) {
      toast('✅ 文案已复制，去小红书粘贴发布吧');
    } else {
      toast('📋 文案如下，请长按选择复制：' + text);
    }
  }
  var toastEl = null;
  function toast(msg) {
    if (toastEl && toastEl.parentNode) { toastEl.parentNode.removeChild(toastEl); }
    toastEl = makeEl('div', 'toast', msg);
    document.body.appendChild(toastEl);
    setTimeout(function () {
      if (toastEl && toastEl.parentNode) { toastEl.parentNode.removeChild(toastEl); }
      toastEl = null;
    }, 2600);
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
      var label = LEVELS[r.level] ? LEVELS[r.level].label : ('难度 ' + r.level);
      left.appendChild(makeEl('div', 'point-name', label));
      left.appendChild(makeEl('div', 'point-meta', r.date + ' · 答对 ' + r.score + ' 题'));
      item.appendChild(left);
      var right = makeEl('div', 'point-right');
      right.appendChild(makeEl('div', 'point-time', r.score + ' 题'));
      right.appendChild(makeEl('div', 'point-stars', '★★★'.slice(0, r.stars)));
      item.appendChild(right);
      list.appendChild(item);
    });
    viewEl.appendChild(list);
    renderFooterNav();
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
