/* ============================================================
   单词闪卡 — 卡片引擎（window.FlashApp 命名空间，Chrome 61 基线）
   F2 翻转卡片（CSS 3D）/ F3 两级记忆曲线 / F4 学习轮次 / F5 结算
   依赖 main.js：M.BOOKS / M.store / M.curBook / M.wordKey /
   M.wordInfo / M.makeEl / M.clearNode / M.renderHeader /
   M.saveStore / M.todayStr / M.calcStreak / M.viewEl
   约束：不超 ES2017、事件全 addEventListener、零图片素材
   ============================================================ */
(function () {
  'use strict';

  var M = window.FlashApp;
  var viewEl = M.viewEl;

  /* ---------- 会话状态 ---------- */
  var QUOTA = 10;        // 初始卡数
  var MAX_ROUNDS = 16;   // 防死循环上限（重出后队列最大长度）
  var KNOWN_STREAK = 2;  // 连续认识 2 次 = 已掌握

  var session = M.session = {
    bookIdx: 0, unitIdx: 0,
    queue: [],      // [{word, cn, key, streak}] 重出的词被 push 到队尾
    idx: 0,
    flipped: false, answered: false,
    correct: 0, answeredTotal: 0,
    startMs: 0, done: false
  };

  function backFromQuiz() { M.viewUnits(); }
  M.backFromQuiz = backFromQuiz;

  /* ---------- 开始学习（main.js viewUnits → M.startUnit(ui)） ---------- */
  M.startUnit = function (unitIdx) {
    var book = M.BOOKS[M.curBook];
    var unit = book.units[unitIdx];
    session.bookIdx = M.curBook;
    session.unitIdx = unitIdx;
    session.queue = [];
    session.idx = 0;
    session.flipped = false; session.answered = false;
    session.correct = 0; session.answeredTotal = 0;
    session.startMs = performance.now();
    session.done = false;

    // 初始抽 ≤10 个非已掌握词
    var pool = [];
    unit.words.forEach(function (w) {
      if (!M.wordInfo(book, unitIdx, w.word).known) { pool.push(w); }
    });
    shuffle(pool);
    var n = Math.min(QUOTA, pool.length);
    for (var i = 0; i < n; i++) {
      session.queue.push({
        word: pool[i].word, cn: pool[i].cn,
        key: M.wordKey(book, unitIdx, pool[i].word),
        streak: M.wordInfo(book, unitIdx, pool[i].word).streak
      });
    }
    M.renderHeader('Unit ' + unit.unit, backFromQuiz);
    renderQuizFooter();
    renderCard();
  };

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
  }

  function renderQuizFooter() {
    var foot = document.getElementById('app-footer');
    M.clearNode(foot);
    var nav = M.makeEl('div', 'footer-nav');
    var quit = M.makeEl('div', 'footer-btn', '退出学习');
    quit.addEventListener('click', function () { backFromQuiz(); });
    nav.appendChild(quit);
    foot.appendChild(nav);
  }

  /* ---------- 卡片渲染（CSS 3D 翻转） ---------- */
  function renderCard() {
    M.clearNode(viewEl);
    viewEl.className = 'view';
    session.flipped = false; session.answered = false;
    if (session.idx >= session.queue.length || session.idx >= MAX_ROUNDS) { finishSession(); return; }

    var q = session.queue[session.idx];
    var top = M.makeEl('div', 'quiz-top');
    top.appendChild(M.makeEl('div', 'quiz-progress', '第 ' + (session.idx + 1) + ' / ' + session.queue.length + ' 卡'));
    top.appendChild(M.makeEl('div', 'quiz-progress', '已认识 ' + session.correct));
    viewEl.appendChild(top);

    // 翻转卡（front 英文 / back 中文）
    var card = M.makeEl('div', 'flip-scene');
    var inner = M.makeEl('div', 'flip-inner');
    inner.id = 'flip-inner';
    var front = M.makeEl('div', 'flip-face flip-front');
    front.appendChild(M.makeEl('div', 'card-word', q.word));
    front.appendChild(M.makeEl('div', 'card-tip', '点击翻面'));
    var back = M.makeEl('div', 'flip-face flip-back');
    back.appendChild(M.makeEl('div', 'card-cn', q.cn || '—'));
    back.appendChild(M.makeEl('div', 'card-tip', '看着英文，你认识它吗？'));
    inner.appendChild(front);
    inner.appendChild(back);
    card.appendChild(inner);
    card.className = 'flip-scene';
    card.addEventListener('click', function () { flip(); });
    viewEl.appendChild(card);

    // 认识 / 不认识（翻面后才可用，先隐藏）
    var row = M.makeEl('div', 'judge-row');
    row.id = 'judge-row';
    row.style.visibility = 'hidden';
    var bKnown = M.makeEl('button', 'btn btn-primary judge-known', '✓ 认识');
    bKnown.addEventListener('click', function () { judge(true); });
    var bUn = M.makeEl('button', 'btn judge-unknown', '✗ 不认识');
    bUn.addEventListener('click', function () { judge(false); });
    row.appendChild(bKnown);
    row.appendChild(bUn);
    viewEl.appendChild(row);

    var fb = M.makeEl('div', 'quiz-feedback', '');
    fb.id = 'card-feedback';
    viewEl.appendChild(fb);
  }

  function flip() {
    if (session.answered || session.done) { return; }
    var inner = document.getElementById('flip-inner');
    if (!inner) { return; }
    var flipped = inner.className.indexOf('flipped') !== -1;
    if (!flipped) {
      inner.className = 'flip-inner flipped';
      session.flipped = true;
      document.getElementById('judge-row').style.visibility = 'visible';
    }
  }

  /* ---------- 记忆曲线：认识/不认识 ---------- */
  function judge(known) {
    if (session.answered || session.done) { return; }
    session.answered = true;
    var q = session.queue[session.idx];
    var st = M.store.wordState[q.key] || { streak: 0, known: false };
    session.answeredTotal += 1;
    var fb = document.getElementById('card-feedback');
    if (known) {
      session.correct += 1;
      st.streak = (st.streak || 0) + 1;
      if (st.streak >= KNOWN_STREAK) { st.known = true; }
      M.store.wordState[q.key] = st; // 无条件写回（首次认识 streak=1 也需持久化）
      fb.textContent = st.known ? '✓ 已掌握！' : '✓ 认识一次（再认 1 次就掌握）';
      fb.className = 'quiz-feedback ok';
    } else {
      st.streak = 0;
      M.store.wordState[q.key] = st;
      fb.textContent = '✗ 再看一遍吧，稍后重出 ~';
      fb.className = 'quiz-feedback bad';
      // 重出：push 到队尾
      session.queue.push({ word: q.word, cn: q.cn, key: q.key, streak: 0 });
    }
    M.saveStore();
    var delay = known ? (st.known ? 500 : 500) : 900;
    window.setTimeout(next, delay);
  }

  function next() {
    session.idx += 1;
    session.flipped = false;
    renderCard();
  }

  /* ---------- 结算（打卡 + 成绩） ---------- */
  function finishSession() {
    session.done = true;
    var total = session.answeredTotal;
    var rate = total ? Math.round(session.correct / total * 100) : 0;
    var elapsed = Math.round((performance.now() - session.startMs) / 1000);
    // 打卡
    var t = M.todayStr();
    var dates = M.store.checkin.dates;
    if (dates[dates.length - 1] !== t) { dates.push(t); }
    while (dates.length > 365) { dates.shift(); }
    M.store.checkin.streak = M.calcStreak(dates);
    M.saveStore();

    var stars = rate >= 90 ? 3 : rate >= 60 ? 2 : rate >= 30 ? 1 : 0;
    var mkStat = function (label, val) {
      var s = M.makeEl('div', 'result-stat');
      s.appendChild(M.makeEl('b', '', val));
      s.appendChild(M.makeEl('span', '', label));
      return s;
    };
    var card = M.makeEl('div', 'result-card');
    card.appendChild(M.makeEl('div', 'result-score', rate + '%'));
    card.appendChild(M.makeEl('div', 'result-stars', '★★★'.slice(0, stars)));
    var stats = M.makeEl('div', 'result-stats');
    stats.appendChild(mkStat('认识', session.correct + '/' + total));
    stats.appendChild(mkStat('用时', elapsed + 's'));
    stats.appendChild(mkStat('打卡', (M.store.checkin.streak || 0) + '天'));
    card.appendChild(stats);
    viewEl.appendChild(card);

    var row = M.makeEl('div', 'btn-row');
    var again = M.makeEl('button', 'btn', '再来一轮');
    again.addEventListener('click', function () { M.startUnit(session.unitIdx); });
    var back = M.makeEl('button', 'btn btn-primary', '返回单元');
    back.addEventListener('click', function () { backFromQuiz(); });
    row.appendChild(again);
    row.appendChild(back);
    viewEl.appendChild(row);

    var foot = document.getElementById('app-footer');
    M.clearNode(foot);
    var nav = M.makeEl('div', 'footer-nav');
    var quit = M.makeEl('div', 'footer-btn', '退出学习');
    quit.addEventListener('click', function () { backFromQuiz(); });
    nav.appendChild(quit);
    foot.appendChild(nav);
  }
})();