/* ============================================================
   数学口算 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   数据：window.APP_DATA（data.js 注入，build 生成 meta）
   出题：window.KOU_GENERATORS（generators.js 注入）
   功能：
   - 选年级 → 选知识点 → 练习（button 数字键盘 / 即时反馈 / 连击）
   - 每日打卡（localStorage）+ 错题本（上限 500 FIFO）
   - 今日表现摘要
   设计约束：
   - 不使用 import/export / type="module"
   - 不超出 ES2017（无 ?. ?? 对象展开等）
   - 事件全部 addEventListener，无内联事件 / eval
   - 计时用 performance.now()，visibilitychange 后台暂停
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };
  var GEN = window.KOU_GENERATORS;

  /* ---------- DOM ---------- */
  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');

  /* 家长面板隐藏入口：标题 5 秒内连点 5 次 */
  var headerTaps = 0, headerTapTimer = null;

  /* ---------- 知识点定义（id → 名称 + 展示） ---------- */
  var POINTS = {
    /* 一年级 */
    'g1_10addsub': { name: '10以内加减法', grade: 1 },
    'g1_20add':    { name: '20以内进位加法', grade: 1 },
    'g1_20sub':    { name: '20以内退位减法', grade: 1 },
    'g1_100':      { name: '整十数加减', grade: 1 },
    /* 二年级 */
    'g2_mult':     { name: '表内乘法', grade: 2 },
    'g2_div':      { name: '表内除法', grade: 2 },
    'g2_100':      { name: '100以内加减法', grade: 2 },
    'g2_mixed':    { name: '混合运算', grade: 2 },
    /* 三年级 */
    'g3_wan':      { name: '万以内加减法', grade: 3 },
    'g3_mult1':    { name: '整十整百乘一位数', grade: 3 },
    'g3_mult2':    { name: '两位数乘两位数', grade: 3 },
    'g3_div1':     { name: '一位数除法', grade: 3 },
    'g3_frac':     { name: '同分母分数加减', grade: 3 },
    /* 四年级 */
    'g4_big':      { name: '大数改写', grade: 4 },
    'g4_simple':   { name: '运算定律简算', grade: 4 },
    'g4_div2':     { name: '整十数除法', grade: 4 },
    'g4_dec':      { name: '小数加减法', grade: 4 },
    /* 五年级 */
    'g5_decmul':   { name: '小数乘法', grade: 5 },
    'g5_decdiv':   { name: '小数除法', grade: 5 },
    'g5_frac1':    { name: '约分与互化', grade: 5 },
    'g5_frac2':    { name: '异分母分数加减', grade: 5 },
    /* 六年级 */
    'g6_fracmul':  { name: '分数乘法', grade: 6 },
    'g6_fracdiv':  { name: '分数除法', grade: 6 },
    'g6_pct':      { name: '百分数互化', grade: 6 },
    'g6_ratio':    { name: '化简比求比值', grade: 6 }
  };

  /* ---------- 状态 ---------- */
  var state = {
    grade: 0, point: null,
    quiz: [], idx: 0, correct: 0, combo: 0, maxCombo: 0,
    answer: '', answered: false, startMs: 0,
    /* 计时挑战 */
    timerTotal: 0, timerRemain: 0, timerStart: 0, timerPaused: 0, timerId: null
  };

  /* ---------- 持久化 ---------- */
  var STORE_KEY = 'redtools.math.v1';
  function loadStore() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) { return JSON.parse(raw); }
    } catch (err) { /* ignore */ }
    return { version: 1, profile: { totalCorrect: 0, maxCombo: 0, tier: '青铜', badges: [], best: { rate: 0, combo: 0, elapsedMs: Infinity } },
             checkin: { dates: [], streak: 0 }, wrongBook: [], history: [] };
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
  function todayStr() {
    var d = new Date();
    function p2(n) { return n < 10 ? '0' + n : '' + n; }
    return '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
  }
  function esc(s) { return s; } // textContent 天然安全

  /* ---------- 渲染：顶栏 ---------- */
  function renderHeader(title) {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '数学口算';
    var t = makeEl('span', 'header-title', title || name);
    brand.appendChild(t);
    /* 家长面板隐藏入口：5 秒内连续点按标题 5 次触发 viewParent() */
    var onTitleTap = function () {
      headerTaps += 1;
      if (headerTapTimer) { clearTimeout(headerTapTimer); }
      headerTapTimer = setTimeout(function () { headerTaps = 0; }, 5000);
      if (headerTaps >= 5) {
        headerTaps = 0;
        if (headerTapTimer) { clearTimeout(headerTapTimer); }
        viewParent();
      }
    };
    t.addEventListener('touchstart', onTitleTap);
    t.addEventListener('mousedown', onTitleTap);
    if (APP.meta && APP.meta.version) {
      brand.appendChild(makeEl('span', 'header-ver', 'v' + APP.meta.version));
    }
    headerEl.appendChild(brand);
  }

  /* ---------- 视图：选年级 ---------- */
  function viewGrade() {
    renderHeader();
    clearNode(viewEl);
    var title = makeEl('div', 'page-title', '选择年级');
    viewEl.appendChild(title);
    var grid = makeEl('div', 'grade-grid');
    for (var g = 1; g <= 6; g++) {
      (function (grade) {
        var box = makeEl('div');
        var btn = makeEl('button', 'grade-btn', '一年级'.replace('一', ['一', '二', '三', '四', '五', '六'][grade - 1]));
        btn.addEventListener('click', function () { viewPoint(grade); });
        box.appendChild(btn);
        grid.appendChild(box);
      })(g);
    }
    viewEl.appendChild(grid);
    // 底部导航（打卡/错题/成就，阶段 3+）
    renderFooterNav();
  }

  /* ---------- 视图：选知识点 ---------- */
  function viewPoint(grade) {
    state.grade = grade;
    renderHeader('数学口算 · ' + ['一', '二', '三', '四', '五', '六'][grade - 1] + '年级');
    clearNode(viewEl);
    var title = makeEl('div', 'page-title', '选择知识点');
    viewEl.appendChild(title);
    var list = makeEl('div', 'point-list');
    Object.keys(POINTS).forEach(function (id) {
      var p = POINTS[id];
      if (p.grade !== grade) { return; }
      var item = makeEl('div', 'point-item');
      var left = makeEl('div');
      left.appendChild(makeEl('div', 'point-name', p.name));
      var stars = store.profile.stars && store.profile.stars[id];
      var meta = makeEl('div', 'point-meta', stars ? '已获 ' + stars + ' ★' : '未练习');
      left.appendChild(meta);
      item.appendChild(left);
      item.addEventListener('click', function () { promptTimerMode(id); });
      list.appendChild(item);
    });
    viewEl.appendChild(list);
    renderFooterNav();
  }

  /* ---------- 视图：练习 ---------- */
  function startQuiz(pointId, timerSec) {
    if (!GEN || !GEN.gen) { return; }
    var p = POINTS[pointId];
    state.point = pointId;
    state.idx = 0; state.correct = 0; state.combo = 0; state.maxCombo = 0;
    state.answer = ''; state.answered = false; state.startMs = performance.now();
    state.quiz = [];
    var count = timerSec ? 20 : 10;
    for (var i = 0; i < count; i++) {
      var q = GEN.gen(pointId);
      if (q) { state.quiz.push(q); }
    }
    if (!state.quiz.length) { return; }
    stopTimer();
    if (timerSec) { startTimer(timerSec); }
    renderHeader(p.name);
    renderQuiz();
    renderQuizFooter();
  }

  function renderQuiz() {
    clearNode(viewEl);
    var q = state.quiz[state.idx];

    var top = makeEl('div', 'quiz-top');
    top.appendChild(makeEl('div', 'quiz-progress',
      '第 ' + (state.idx + 1) + ' / ' + state.quiz.length + ' 题'));
    if (state.timerTotal > 0) {
      var timerEl = makeEl('div', 'quiz-timer', '⏱ --:--');
      timerEl.id = 'quiz-timer'; // 与 updateTimerDisplay 的 getElementById('quiz-timer') 对齐
      top.appendChild(timerEl);
    }
    top.appendChild(makeEl('div', 'quiz-combo', state.combo >= 2 ? '🔥' + state.combo : ''));

    var card = makeEl('div', 'quiz-card');
    card.appendChild(makeEl('div', 'quiz-expression', q.text));
    viewEl.appendChild(top);
    viewEl.appendChild(card);
    if (state.timerTotal > 0) { updateTimerDisplay(); }

    // 作答区
    var area = makeEl('div', 'quiz-answer-area');
    var answerEl = makeEl('div', 'quiz-answer', '');
    area.appendChild(answerEl);
    viewEl.appendChild(area);

    // 反馈
    var feedbackEl = makeEl('div', 'quiz-feedback', '');
    viewEl.appendChild(feedbackEl);

    // 数字键盘（含 / 供分数、. 供小数）
    var pad = makeEl('div', 'keypad');
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫', '✓'];
    keys.forEach(function (k) {
      var box = makeEl('div');
      var btn = makeEl('button', 'key-btn', k);
      btn.addEventListener('click', function () { keyPress(k, answerEl, feedbackEl); });
      box.appendChild(btn);
      pad.appendChild(box);
    });
    viewEl.appendChild(pad);
  }

  function keyPress(key, answerEl, feedbackEl) {
    if (state.answered) { return; }
    if (key === '⌫') {
      state.answer = state.answer.slice(0, -1);
    } else if (key === '✓') {
      submitAnswer(feedbackEl);
      return;
    } else {
      if (state.answer.length >= 10) { return; }
      // 分数/小数输入限制：/ 和 . 各只允许一次且不在首尾
      if (key === '/' || key === '.') {
        if (state.answer.indexOf(key) !== -1 || !state.answer.length ||
            state.answer[state.answer.length - 1] === '/') { return; }
      }
      state.answer += key;
    }
    answerEl.textContent = state.answer;
  }

  function submitAnswer(feedbackEl) {
    if (!state.answer) { return; }
    var q = state.quiz[state.idx];
    var correct = checkAnswer(q, state.answer);
    state.answered = true;

    if (correct) {
      state.correct += 1;
      state.combo += 1;
      if (state.combo > state.maxCombo) { state.maxCombo = state.combo; }
      feedbackEl.textContent = '✓ 答对了！';
      feedbackEl.className = 'quiz-feedback ok';
      // 错题本：连续答对计数（若曾在错题本）
      updateWrongBook(q, true);
    } else {
      state.combo = 0;
      feedbackEl.textContent = '✗ 正确答案：' + q.answer;
      feedbackEl.className = 'quiz-feedback bad';
      updateWrongBook(q, false);
    }
    // 下一题
    window.setTimeout(function () {
      state.idx += 1;
      state.answer = '';
      state.answered = false;
      if (state.idx >= state.quiz.length) {
        finishQuiz();
      } else {
        renderQuiz();
      }
    }, correct ? 600 : 1400);
  }

  function checkAnswer(q, input) {
    var a = String(q.answer);
    var norm = input.replace(/\s+/g, '');
    if (norm === a) { return true; }
    // 分数/小数/整数互相等价比较（如 "3/2" == "1.5"，"1/1" == "1"）
    var toNum = function (s) {
      var m = s.match(/^(-?\d+)\/(-?\d+)$/);
      if (m) { return Number(m[1]) / Number(m[2]); }
      return Number(s);
    };
    var n1 = toNum(norm);
    var n2 = toNum(a);
    if (isFinite(n1) && isFinite(n2)) {
      return Math.abs(n1 - n2) < 1e-6;
    }
    return false;
  }

  function updateWrongBook(q, correct) {
    var wrong = store.wrongBook;
    var found = -1;
    for (var i = 0; i < wrong.length; i++) {
      if (wrong[i].text === q.text && wrong[i].type === q.type) { found = i; break; }
    }
    if (correct) {
      if (found >= 0) {
        wrong[found].correctStreak += 1;
        wrong[found].lastTime = todayStr();
        if (wrong[found].correctStreak >= 3) { wrong.splice(found, 1); } // 连续答对 3 次移除
      }
    } else {
      if (found >= 0) {
        wrong[found].wrongCount += 1;
        wrong[found].correctStreak = 0;
      } else {
        wrong.push({ type: q.type, text: q.text, answer: q.answer,
                     wrongCount: 1, correctStreak: 0, lastTime: todayStr() });
      }
      // 上限 500 FIFO
      while (wrong.length > 500) { wrong.shift(); }
    }
    saveStore();
  }

  function finishQuiz() {
    stopTimer();
    var elapsed = Math.round((performance.now() - state.startMs) / 1000);
    var total = state.quiz.length;
    var rate = Math.round(state.correct / total * 100);

    // 打卡：完成即点亮今日
    var t = todayStr();
    var dates = store.checkin.dates;
    if (dates[dates.length - 1] !== t) { dates.push(t); }
    while (dates.length > 365) { dates.shift(); }
    // 连续天数
    var streak = calcStreak(dates);
    store.checkin.streak = streak;

    // 星星：全对 3 星，≥80% 2 星，≥60% 1 星
    var stars = 0;
    if (rate >= 100) { stars = 3; } else if (rate >= 80) { stars = 2; } else if (rate >= 60) { stars = 1; }
    if (!store.profile.stars) { store.profile.stars = {}; }
    if (stars > (store.profile.stars[state.point] || 0)) {
      store.profile.stars[state.point] = stars;
    }

    // 成就：更新累计答对 + 段位 + 勋章
    updateBadges(rate, state.maxCombo);

    // 历史最佳
    if (!store.profile.best) { store.profile.best = { rate: 0, combo: 0, elapsedMs: Infinity }; }
    if (rate > store.profile.best.rate) { store.profile.best.rate = rate; }
    if (state.maxCombo > (store.profile.best.combo || 0)) { store.profile.best.combo = state.maxCombo; }
    if (elapsed * 1000 < (store.profile.best.elapsedMs || Infinity)) { store.profile.best.elapsedMs = elapsed * 1000; }

    // 历史记录（滚动 30 天）
    store.history.push({ date: t, point: state.point, rate: rate, count: total, correct: state.correct, elapsedMs: elapsed * 1000 });
    while (store.history.length > 30) { store.history.shift(); }
    saveStore();

    // 渲染结果
    renderHeader(POINTS[state.point] ? POINTS[state.point].name : '练习完成');
    clearNode(viewEl);
    var card = makeEl('div', 'result-card');
    card.appendChild(makeEl('div', 'result-score', rate + '%'));
    var stats = makeEl('div', 'result-stats');
    var mkStat = function (label, val) {
      var s = makeEl('div', 'result-stat');
      s.appendChild(makeEl('b', '', val));
      s.appendChild(makeEl('span', '', label));
      return s;
    };
    stats.appendChild(mkStat('答对', state.correct + '/' + total));
    stats.appendChild(mkStat('用时', elapsed + 's'));
    stats.appendChild(mkStat('连击', state.maxCombo));
    card.appendChild(stats);
    if (stars) {
      card.appendChild(makeEl('div', 'point-stars', '★★★'.slice(0, stars)));
    }
    viewEl.appendChild(card);

    var row = makeEl('div', 'btn-row');
    var again = makeEl('button', 'btn', '再来一组');
    again.addEventListener('click', function () { startQuiz(state.point); });
    var back = makeEl('button', 'btn btn-primary', '返回知识点');
    back.addEventListener('click', function () { viewPoint(state.grade); });
    row.appendChild(again);
    row.appendChild(back);
    viewEl.appendChild(row);
  }

  function calcStreak(dates) {
    // dates 升序、去重后的 YYYYMMDD 列表
    var streak = 0;
    var d = new Date();
    for (var i = dates.length - 1; i >= 0; i--) {
      if (dates[i] === todayStr()) {
        streak = 1;
        continue;
      }
      // 从昨天往前数
      d.setDate(d.getDate() - 1);
      var want = dateStr(d);
      if (dates[i] === want) { streak += 1; }
      else { break; }
    }
    return streak;
  }

  function dateStr(d) {
    function p2(n) { return n < 10 ? '0' + n : '' + n; }
    return '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
  }

  /* ---------- 计时挑战 ---------- */
  function startTimer(totalSec) {
    state.timerTotal = totalSec * 1000;
    state.timerRemain = state.timerTotal;
    state.timerStart = performance.now();
    state.timerPaused = 0;
    startTimerTick();
  }

  function startTimerTick() {
    if (state.timerId) { clearInterval(state.timerId); }
    state.timerId = setInterval(function () {
      if (document.hidden) { return; }
      var elapsed = performance.now() - state.timerStart + state.timerPaused;
      state.timerRemain = Math.max(0, state.timerTotal - elapsed);
      updateTimerDisplay();
      if (state.timerRemain <= 0) {
        clearInterval(state.timerId);
        state.timerId = null;
        finishQuiz(); // 时间到，自动交卷
      }
    }, 100);
  }

  function stopTimer() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
    state.timerTotal = 0;
  }

  function updateTimerDisplay() {
    var el = document.getElementById('quiz-timer');
    if (!el) { return; }
    var sec = Math.ceil(state.timerRemain / 1000);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    el.textContent = '⏱ ' + m + ':' + (s < 10 ? '0' : '') + s;
    el.className = sec <= 10 ? 'quiz-timer danger' : 'quiz-timer';
  }

  /* visibilitychange 后台暂停 */
  document.addEventListener('visibilitychange', function () {
    if (state.timerTotal <= 0) { return; }
    if (document.hidden) {
      state.timerPaused += performance.now() - state.timerStart;
      if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
    } else {
      state.timerStart = performance.now();
      startTimerTick();
    }
  });

  function promptTimerMode(pointId) {
    /* 弹窗选择计时模式：普通练习 / 30秒 / 60秒 / 120秒 */
    var overlay = makeEl('div', 'timer-overlay');
    var box = makeEl('div', 'timer-box');
    box.appendChild(makeEl('div', 'page-title', '选择模式'));
    var modes = [
      { label: '普通练习（10 题）', sec: 0 },
      { label: '⏱ 30 秒挑战', sec: 30 },
      { label: '⏱ 60 秒挑战', sec: 60 },
      { label: '⏱ 120 秒挑战', sec: 120 }
    ];
    modes.forEach(function (m) {
      var btn = makeEl('button', 'btn', m.label);
      btn.style.marginTop = '8px';
      btn.addEventListener('click', function () {
        overlay.parentNode.removeChild(overlay);
        startQuiz(pointId, m.sec);
      });
      box.appendChild(btn);
    });
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  /* ---------- 段位 / 勋章 ---------- */
  var TIERS = [
    { name: '青铜', min: 0 },
    { name: '白银', min: 50 },
    { name: '黄金', min: 200 },
    { name: '钻石', min: 500 },
    { name: '星耀', min: 1000 },
    { name: '王者', min: 2000 }
  ];

  var BADGES = [
    { id: 'first',    name: '初学者',   desc: '完成第一次练习', check: function (p) { return p.totalCorrect > 0; } },
    { id: 'hundred',  name: '百题斩',   desc: '累计答对 100 题', check: function (p) { return p.totalCorrect >= 100; } },
    { id: 'thousand', name: '千题王',   desc: '累计答对 1000 题', check: function (p) { return p.totalCorrect >= 1000; } },
    { id: 'perfect',  name: '全对达人', desc: '单次练习 100% 正确', check: function (p) { return p._thisRate === 100; } },
    { id: 'combo10',  name: '连击大师', desc: '单次连击 ≥10', check: function (p) { return p._thisCombo >= 10; } },
    { id: 'streak7',  name: '打卡 7 天', desc: '连续打卡 7 天', check: function (p) { return (p._streak || 0) >= 7; } },
    { id: 'streak30', name: '打卡 30 天', desc: '连续打卡 30 天', check: function (p) { return (p._streak || 0) >= 30; } }
  ];

  function calcTier(totalCorrect) {
    var tier = '青铜';
    for (var i = 0; i < TIERS.length; i++) {
      if (totalCorrect >= TIERS[i].min) { tier = TIERS[i].name; }
    }
    return tier;
  }

  function updateBadges(rate, combo) {
    var p = store.profile;
    p.totalCorrect = (p.totalCorrect || 0) + state.correct;
    if (state.maxCombo > (p.maxCombo || 0)) { p.maxCombo = state.maxCombo; }
    p.tier = calcTier(p.totalCorrect);
    p._thisRate = rate;
    p._thisCombo = combo;
    p._streak = store.checkin.streak || 0;
    if (!p.badges) { p.badges = []; }
    BADGES.forEach(function (b) {
      if (p.badges.indexOf(b.id) === -1 && b.check(p)) { p.badges.push(b.id); }
    });
    delete p._thisRate; delete p._thisCombo; delete p._streak;
  }

  /* ---------- 成就页面 ---------- */
  function viewAchievement() {
    renderHeader('成就');
    clearNode(viewEl);
    var p = store.profile;

    /* 段位 */
    var tierCard = makeEl('div', 'result-card');
    tierCard.appendChild(makeEl('div', 'page-title', '当前段位'));
    tierCard.appendChild(makeEl('div', 'result-score', p.tier || '青铜'));
    tierCard.appendChild(makeEl('div', 'point-meta',
      '累计答对 ' + (p.totalCorrect || 0) + ' 题'));
    /* 下一段位进度 */
    var nextTier = null;
    for (var i = 0; i < TIERS.length; i++) {
      if (TIERS[i].name === (p.tier || '青铜') && i < TIERS.length - 1) {
        nextTier = TIERS[i + 1]; break;
      }
    }
    if (nextTier) {
      var need = nextTier.min - (p.totalCorrect || 0);
      tierCard.appendChild(makeEl('div', 'point-meta', '距 ' + nextTier.name + ' 还需 ' + need + ' 题'));
    }
    viewEl.appendChild(tierCard);

    /* 勋章 */
    var badgeCard = makeEl('div', 'result-card');
    badgeCard.appendChild(makeEl('div', 'page-title', '勋章墙'));
    var badgeGrid = makeEl('div', 'badge-grid');
    var userBadges = p.badges || [];
    BADGES.forEach(function (b) {
      var item = makeEl('div', 'badge-item');
      var icon = makeEl('div', 'badge-icon', userBadges.indexOf(b.id) !== -1 ? '🏅' : '🔒');
      item.appendChild(icon);
      item.appendChild(makeEl('div', 'badge-name', b.name));
      item.appendChild(makeEl('div', 'badge-desc', b.desc));
      badgeGrid.appendChild(item);
    });
    badgeCard.appendChild(badgeGrid);
    viewEl.appendChild(badgeCard);

    /* 历史最佳 */
    var best = p.best || {};
    if (best.rate > 0) {
      var bestCard = makeEl('div', 'result-card');
      bestCard.appendChild(makeEl('div', 'page-title', '历史最佳'));
      var bestStats = makeEl('div', 'result-stats');
      var mkStat = function (label, val) {
        var s = makeEl('div', 'result-stat');
        s.appendChild(makeEl('b', '', val));
        s.appendChild(makeEl('span', '', label));
        return s;
      };
      bestStats.appendChild(mkStat('正确率', (best.rate || 0) + '%'));
      bestStats.appendChild(mkStat('最大连击', '' + (best.combo || 0)));
      if (best.elapsedMs && best.elapsedMs < Infinity) {
        bestStats.appendChild(mkStat('最快用时', Math.round(best.elapsedMs / 1000) + 's'));
      }
      bestCard.appendChild(bestStats);
      viewEl.appendChild(bestCard);
    }

    renderFooterNav();
  }

  /* ---------- 家长面板 ---------- */
  function viewParent() {
    renderHeader('家长面板');
    clearNode(viewEl);
    var p = store.profile;
    var card = makeEl('div', 'result-card');
    card.appendChild(makeEl('div', 'page-title', '今日数据'));
    var stats = makeEl('div', 'result-stats');
    var mkStat = function (label, val) {
      var s = makeEl('div', 'result-stat');
      s.appendChild(makeEl('b', '', val));
      s.appendChild(makeEl('span', '', label));
      return s;
    };
    /* 今日练习统计 */
    var today = todayStr();
    var todayRecords = (store.history || []).filter(function (h) { return h.date === today; });
    var todayCount = todayRecords.length;
    var todayCorrect = 0, todayTotal = 0;
    todayRecords.forEach(function (h) { todayCorrect += h.correct; todayTotal += h.count; });
    var todayRate = todayTotal > 0 ? Math.round(todayCorrect / todayTotal * 100) : 0;

    stats.appendChild(mkStat('今日练习', todayCount + ' 次'));
    stats.appendChild(mkStat('今日正确率', todayRate + '%'));
    stats.appendChild(mkStat('当前错题', (store.wrongBook || []).length + ' 道'));
    stats.appendChild(mkStat('连续打卡', (store.checkin.streak || 0) + ' 天'));
    stats.appendChild(mkStat('当前段位', p.tier || '青铜'));
    card.appendChild(stats);
    viewEl.appendChild(card);

    /* 清除数据 */
    var clearBtn = makeEl('button', 'btn', '清除所有数据');
    clearBtn.style.marginTop = '16px';
    clearBtn.style.color = '#f5222d';
    clearBtn.addEventListener('click', function () {
      if (window.confirm('确定清除所有练习数据？此操作不可恢复。')) {
        window.localStorage.removeItem(STORE_KEY);
        store = loadStore();
        saveStore();
        viewGrade();
      }
    });
    viewEl.appendChild(clearBtn);
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
    nav.appendChild(mk('打卡日历', function () { viewCheckin(); }));
    nav.appendChild(mk('错题本', function () { viewWrong(); }));
    nav.appendChild(mk('成就', function () { viewAchievement(); }));
    nav.appendChild(mk('首页', function () { viewGrade(); }));
    foot.appendChild(nav);
  }

  function renderQuizFooter() {
    var foot = document.getElementById('app-footer');
    clearNode(foot);
    var nav = makeEl('div', 'footer-nav');
    var quit = makeEl('div', 'footer-btn', '退出练习');
    quit.addEventListener('click', function () { viewPoint(state.grade); });
    nav.appendChild(quit);
    foot.appendChild(nav);
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
    card.appendChild(makeEl('div', 'streak-info',
      '连续打卡 <b>' + streak + '</b> 天' + (streak >= 7 ? ' 🎉' : '')));
    viewEl.appendChild(card);
    renderFooterNav();
  }

  /* ---------- 视图：错题本 ---------- */
  function viewWrong() {
    renderHeader('错题本');
    clearNode(viewEl);
    var wrong = store.wrongBook;
    if (!wrong.length) {
      viewEl.appendChild(makeEl('div', 'page-title', '暂无错题，继续加油！'));
      renderFooterNav();
      return;
    }
    var title = makeEl('div', 'page-title', '共 ' + wrong.length + ' 道错题（连续答对 3 次自动移除）');
    viewEl.appendChild(title);
    var list = makeEl('div', 'point-list');
    wrong.forEach(function (w) {
      var item = makeEl('div', 'point-item');
      var left = makeEl('div');
      left.appendChild(makeEl('div', 'point-name', w.text));
      left.appendChild(makeEl('div', 'point-meta', '答案 ' + w.answer + ' · 错 ' + w.wrongCount + ' 次'));
      item.appendChild(left);
      list.appendChild(item);
    });
    viewEl.appendChild(list);
    renderFooterNav();
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
  viewGrade();
})();
