/* ============================================================
   情绪识别 — main.js（扩展系列，A4）
   ------------------------------------------------------------
   玩法：看表情 emoji → 4 选 1 选对应情绪（开心/难过/生气/害怕/惊讶/平静）。
   有标准答案（表情→情绪映射），培养情商认知。
   - 题库：程序化内嵌（6 情绪 × 表情变体，emoji 零素材）
   - 难度：入门 6 题 / 进阶 8 题 / 挑战 10 题
   - 结算：星级（答对率）+ 计时 + 打卡 + best/recent + 家长面板
   - 数据：window.APP_DATA（data.js）
   - 存储：LX_SHARED.storage（V0.4 迁移：configure 注入 + get/set('v1')）
   - 约束：ES2017 经典脚本（var+function）、Chrome 61 兼容、无外部资源
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };
  var M = {};
  var viewEl = document.getElementById('view');
  var headerEl = document.getElementById('app-header');
  var footerEl = document.getElementById('app-footer');

  /* ---------- 持久化（V0.4 迁移：LX_SHARED.storage） ---------- */
  LX_SHARED.storage.configure({ toolName: 'qingxushibie' });  // 键前缀 redtools.qingxushibie.v1
  var DEFAULT_STORE = {
    version: 1,
    best: { easy: null, normal: null, hard: null },   // { stars, wrong, ms }
    recent: { easy: 0, normal: 0, hard: 0 },
    checkin: { dates: [], streak: 0 },
    history: []
  };
  function loadStore() {
    var s = LX_SHARED.storage.get('v1');
    return s || DEFAULT_STORE;
  }
  function saveStore() {
    LX_SHARED.storage.set('v1', store);
  }
  var store = loadStore();
  saveStore(); // 初始化写入

  /* ---------- 难度档 ---------- */
  var LEVELS = {
    easy:   { key: 'easy',   label: '入门', rounds: 6 },
    normal: { key: 'normal', label: '进阶', rounds: 8 },
    hard:   { key: 'hard',   label: '挑战', rounds: 10 }
  };
  var LEVEL_ORDER = ['easy', 'normal', 'hard'];

  /* ---------- 情绪题库（表情 → 情绪，emoji 零素材） ---------- */
  var EMO = [
    { emo: '😀', ans: '开心', opts: ['开心', '难过', '生气', '害怕'] },
    { emo: '😊', ans: '开心', opts: ['开心', '平静', '惊讶', '难过'] },
    { emo: '😄', ans: '开心', opts: ['开心', '生气', '害怕', '惊讶'] },
    { emo: '😂', ans: '开心', opts: ['开心', '难过', '生气', '平静'] },
    { emo: '🥳', ans: '开心', opts: ['开心', '害怕', '生气', '难过'] },
    { emo: '😍', ans: '开心', opts: ['开心', '难过', '惊讶', '生气'] },
    { emo: '😢', ans: '难过', opts: ['难过', '开心', '生气', '平静'] },
    { emo: '😭', ans: '难过', opts: ['难过', '开心', '惊讶', '害怕'] },
    { emo: '😔', ans: '难过', opts: ['难过', '开心', '生气', '惊讶'] },
    { emo: '😞', ans: '难过', opts: ['难过', '平静', '开心', '害怕'] },
    { emo: '😣', ans: '难过', opts: ['难过', '开心', '生气', '惊讶'] },
    { emo: '😫', ans: '难过', opts: ['难过', '开心', '害怕', '平静'] },
    { emo: '😠', ans: '生气', opts: ['生气', '开心', '难过', '惊讶'] },
    { emo: '😡', ans: '生气', opts: ['生气', '难过', '开心', '害怕'] },
    { emo: '🤬', ans: '生气', opts: ['生气', '平静', '开心', '难过'] },
    { emo: '😤', ans: '生气', opts: ['生气', '开心', '惊讶', '难过'] },
    { emo: '👿', ans: '生气', opts: ['生气', '开心', '害怕', '难过'] },
    { emo: '😾', ans: '生气', opts: ['生气', '难过', '开心', '惊讶'] },
    { emo: '😨', ans: '害怕', opts: ['害怕', '开心', '生气', '平静'] },
    { emo: '😱', ans: '害怕', opts: ['害怕', '生气', '难过', '开心'] },
    { emo: '😰', ans: '害怕', opts: ['害怕', '开心', '难过', '惊讶'] },
    { emo: '😳', ans: '害怕', opts: ['害怕', '开心', '生气', '难过'] },
    { emo: '😬', ans: '害怕', opts: ['害怕', '平静', '开心', '生气'] },
    { emo: '😖', ans: '害怕', opts: ['害怕', '开心', '难过', '惊讶'] },
    { emo: '😲', ans: '惊讶', opts: ['惊讶', '开心', '难过', '平静'] },
    { emo: '😮', ans: '惊讶', opts: ['惊讶', '生气', '开心', '害怕'] },
    { emo: '🤩', ans: '惊讶', opts: ['惊讶', '难过', '开心', '生气'] },
    { emo: '😯', ans: '惊讶', opts: ['惊讶', '开心', '难过', '害怕'] },
    { emo: '😧', ans: '惊讶', opts: ['惊讶', '难过', '生气', '开心'] },
    { emo: '😦', ans: '惊讶', opts: ['惊讶', '平静', '开心', '难过'] },
    { emo: '😌', ans: '平静', opts: ['平静', '开心', '难过', '生气'] },
    { emo: '🙂', ans: '平静', opts: ['平静', '惊讶', '害怕', '难过'] },
    { emo: '😐', ans: '平静', opts: ['平静', '开心', '生气', '惊讶'] },
    { emo: '😴', ans: '平静', opts: ['平静', '害怕', '难过', '开心'] },
    { emo: '😪', ans: '平静', opts: ['平静', '生气', '惊讶', '难过'] },
    { emo: '🤔', ans: '平静', opts: ['平静', '开心', '难过', '害怕'] }
  ];

  /* ---------- 状态 ---------- */
  var state = {
    level: 'easy',
    rounds: 6,
    quiz: [],       // 乱序后取前 rounds 题（每题答案下标固定）
    idx: 0,
    wrong: 0,
    startMs: 0,
    elapsed: 0,
    timerId: null,
    finished: false,
    answered: false
  };

  /* ---------- 小工具 ---------- */
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
  function calcStreak(dates) {
    return LX_SHARED.progress.streak(dates);
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function fmtMs(ms) {
    var s = ms / 1000;
    return (s < 10 ? '0' : '') + s.toFixed(1);
  }

  /* ---------- 渲染：顶栏 ---------- */
  function renderHeader(title) {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '情绪识别';
    var nameEl = makeEl('span', 'header-name', name);
    nameEl.id = 'header-name';
    brand.appendChild(nameEl);
    headerEl.appendChild(brand);
    var streakEl = makeEl('div', 'header-streak', store.checkin.streak > 0 ? '🔥 连练 ' + store.checkin.streak + ' 天' : '');
    streakEl.id = 'header-streak';
    headerEl.appendChild(streakEl);
  }

  function renderFooter(html) {
    clearNode(footerEl);
    if (html) { footerEl.innerHTML = html; }
  }

  /* ---------- 视图：首页 ---------- */
  function viewHome() {
    state.finished = false;
    stopTimer();
    renderHeader();
    clearNode(viewEl);
    var wrap = makeEl('div', 'home-wrap');
    wrap.appendChild(makeEl('h1', 'home-title', '🎭 情绪识别'));
    wrap.appendChild(makeEl('p', 'home-sub', '看看小表情在表达什么情绪？'));

    LEVEL_ORDER.forEach(function (k) {
      var lv = LEVELS[k];
      var card = makeEl('button', 'level-card');
      var best = store.best[k];
      var bestTxt = best ? '最佳 ' + best.stars + '★ · ' + best.wrong + ' 错' : '未挑战';
      card.appendChild(makeEl('div', 'level-name', lv.label + ' · ' + lv.rounds + ' 题'));
      card.appendChild(makeEl('div', 'level-best', bestTxt));
      card.addEventListener('click', function () { startGame(k); });
      wrap.appendChild(card);
    });

    var checkinBtn = makeEl('button', 'btn btn-checkin', store.checkin.dates.indexOf(todayStr()) >= 0 ? '✅ 今日已打卡' : '📅 今日打卡');
    checkinBtn.addEventListener('click', function () { doCheckin(checkinBtn); });
    wrap.appendChild(checkinBtn);

    var hidden = makeEl('button', 'hidden-entry', '');
    hidden.addEventListener('click', function () { viewParent(); });
    wrap.appendChild(hidden);

    viewEl.appendChild(wrap);
    renderFooter('');
  }

  /* ---------- 打卡 ---------- */
  function doCheckin(btn) {
    var today = todayStr();
    if (store.checkin.dates.indexOf(today) >= 0) {
      btn.textContent = '✅ 今日已打卡';
      return;
    }
    store.checkin.dates.push(today);
    store.checkin.dates = store.checkin.dates.slice(-366);
    store.checkin.streak = calcStreak(store.checkin.dates);
    saveStore();
    btn.textContent = '✅ 今日已打卡';
    renderHeader();
  }

  /* ---------- 家长面板 ---------- */
  function viewParent() {
    stopTimer();
    renderHeader();
    clearNode(viewEl);
    var wrap = makeEl('div', 'parent-wrap');
    wrap.appendChild(makeEl('h2', 'parent-title', '家长面板'));
    wrap.appendChild(makeEl('p', 'parent-row', '累计打卡 ' + store.checkin.dates.length + ' 天 · 连续 ' + store.checkin.streak + ' 天'));
    LEVEL_ORDER.forEach(function (k) {
      var lv = LEVELS[k];
      var b = store.best[k];
      wrap.appendChild(makeEl('div', 'parent-row', lv.label + '：' + (b ? b.stars + '★ / ' + b.wrong + ' 错 / ' + fmtMs(b.ms) : '未挑战')));
    });
    var hist = store.history.slice(-10).reverse();
    if (hist.length) {
      wrap.appendChild(makeEl('h3', 'parent-sub', '最近记录'));
      hist.forEach(function (h) {
        wrap.appendChild(makeEl('div', 'parent-row small', h.date + ' · ' + (LEVELS[h.level] ? LEVELS[h.level].label : h.level) + ' · ' + h.stars + '★ · ' + h.wrong + ' 错'));
      });
    }
    var back = makeEl('button', 'btn', '‹ 返回');
    back.addEventListener('click', function () { viewHome(); });
    wrap.appendChild(back);
    var clearBtn = makeEl('button', 'btn btn-danger', '清除所有数据');
    clearBtn.addEventListener('click', function () {
      if (window.confirm('确定清除所有练习数据？此操作不可恢复。')) {
        LX_SHARED.storage.remove('v1');
        store = loadStore();
        saveStore();
        viewHome();
      }
    });
    wrap.appendChild(clearBtn);
    viewEl.appendChild(wrap);
    renderFooter('');
  }

  /* ---------- 出题 ---------- */
  function startGame(level) {
    state.level = level;
    state.rounds = LEVELS[level].rounds;
    // 打乱题库取前 rounds 题，每题答案选项打乱
    state.quiz = shuffle(EMO).slice(0, state.rounds).map(function (q) {
      var opts = shuffle(q.opts);
      var ans = opts.indexOf(q.ans);
      return { emo: q.emo, ans: ans, opts: opts };
    });
    state.idx = 0;
    state.wrong = 0;
    state.startMs = Date.now();
    state.elapsed = 0;
    state.finished = false;
    state.answered = false;
    state.timerId = null;
    renderQuestion();
    startTimer();
  }

  function renderQuestion() {
    renderHeader();
    clearNode(viewEl);
    var q = state.quiz[state.idx];
    var wrap = makeEl('div', 'quiz-wrap');
    var top = makeEl('div', 'game-top');
    var back = makeEl('button', 'game-back', '‹ 返回');
    back.addEventListener('click', function () { viewHome(); });
    top.appendChild(back);
    var prog = makeEl('div', 'game-prog', '第 ' + (state.idx + 1) + ' / ' + state.rounds + ' 题');
    top.appendChild(prog);
    var timerEl = makeEl('div', 'game-timer', '⏱ 00.0');
    timerEl.id = 'game-timer';
    top.appendChild(timerEl);
    wrap.appendChild(top);

    // 表情大字展示
    var emoBox = makeEl('div', 'emo-box', q.emo);
    emoBox.id = 'emo-box';
    wrap.appendChild(emoBox);
    wrap.appendChild(makeEl('div', 'emo-question', '这是什么情绪？'));

    // 选项
    var optBox = makeEl('div', 'options');
    optBox.id = 'options';
    q.opts.forEach(function (txt, i) {
      var btn = makeEl('button', 'option', '');
      btn.appendChild(makeEl('span', 'option-txt', txt));
      btn.setAttribute('data-opt', i);
      btn.addEventListener('click', function () { onAnswer(i, btn); });
      optBox.appendChild(btn);
    });
    wrap.appendChild(optBox);

    var fb = makeEl('div', 'answer-feedback', '');
    fb.id = 'answer-feedback';
    wrap.appendChild(fb);

    viewEl.appendChild(wrap);
    renderFooter('');
  }

  function onAnswer(i, btn) {
    if (state.answered) { return; }
    state.answered = true;
    var q = state.quiz[state.idx];
    var opts = document.getElementById('options').children;
    var fb = document.getElementById('answer-feedback');
    for (var k = 0; k < opts.length; k++) {
      if (k === q.ans) { opts[k].classList.add('correct'); }
      else { opts[k].classList.add('dim'); }
    }
    if (i === q.ans) {
      fb.className = 'answer-feedback ok';
      fb.textContent = '✓ 答对啦！这是「' + q.opts[q.ans] + '」';
    } else {
      state.wrong += 1;
      fb.className = 'answer-feedback miss';
      fb.textContent = '✗ 正确答案：「' + q.opts[q.ans] + '」';
    }
    setTimeout(function () { nextQuestion(); }, 1800);
  }

  function nextQuestion() {
    state.idx += 1;
    state.answered = false;
    if (state.idx >= state.rounds) {
      finishGame();
      return;
    }
    renderQuestion();
  }

  /* ---------- 计时 ---------- */
  function startTimer() {
    state.timerId = setInterval(function () {
      state.elapsed = Date.now() - state.startMs;
      var el = document.getElementById('game-timer');
      if (el) { el.textContent = '⏱ ' + fmtMs(state.elapsed); }
    }, 100);
  }
  function stopTimer() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
  }

  /* ---------- 结算 ---------- */
  function finishGame() {
    stopTimer();
    state.elapsed = Date.now() - state.startMs;
    state.finished = true;
    var correct = state.rounds - state.wrong;
    var stars = correct >= state.rounds - 1 ? 3 : (correct >= state.rounds - 3 ? 2 : 1);
    var lv = state.level;
    var rec = { date: todayStr(), level: lv, stars: stars, wrong: state.wrong, ms: state.elapsed };
    var prev = store.best[lv];
    if (!prev || stars > prev.stars || (stars === prev.stars && state.wrong < prev.wrong)) {
      store.best[lv] = { stars: stars, wrong: state.wrong, ms: state.elapsed };
    }
    store.recent[lv] = stars;
    store.history.push(rec);
    store.history = store.history.slice(-100);
    saveStore();
    renderResult(stars, rec);
  }

  function renderResult(stars, rec) {
    renderHeader();
    clearNode(viewEl);
    var wrap = makeEl('div', 'result-wrap');
    var starTxt = stars === 3 ? '★★★' : (stars === 2 ? '★★☆' : '★☆☆');
    wrap.appendChild(makeEl('h2', 'result-title', starTxt));
    wrap.appendChild(makeEl('div', 'result-sub', '完成练习！'));
    wrap.appendChild(makeEl('div', 'result-row', '答对 ' + (state.rounds - rec.wrong) + ' / ' + state.rounds + ' 题'));
    wrap.appendChild(makeEl('div', 'result-row', '用时 ' + fmtMs(rec.ms)));
    var best = store.best[rec.level];
    if (best) {
      wrap.appendChild(makeEl('div', 'result-best', '最佳 ' + best.stars + '★ · ' + best.wrong + ' 错'));
    }
    var today = todayStr();
    var checkinBtn = makeEl('button', 'btn btn-checkin', store.checkin.dates.indexOf(today) >= 0 ? '✅ 今日已打卡' : '📅 今日打卡');
    checkinBtn.addEventListener('click', function () { doCheckin(checkinBtn); });
    wrap.appendChild(checkinBtn);
    var again = makeEl('button', 'btn btn-primary', '再练一次');
    again.addEventListener('click', function () { startGame(rec.level); });
    wrap.appendChild(again);
    var home = makeEl('button', 'btn', '返回首页');
    home.addEventListener('click', function () { viewHome(); });
    wrap.appendChild(home);
    viewEl.appendChild(wrap);
    renderFooter('');
  }

  /* ---------- 键盘（F7 家长面板） ---------- */
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'F7') { ev.preventDefault(); viewParent(); }
  });

  /* ---------- 启动 ---------- */
  renderHeader();
  viewHome();

  /* 导出（供调试/测试） */
  M.viewHome = viewHome;
  M.startGame = startGame;
  M.state = state;
  window.M = M;
})();
