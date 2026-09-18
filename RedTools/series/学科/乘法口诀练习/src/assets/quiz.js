/* ============================================================
   乘法口诀练习 — 练习引擎（window.MulApp 命名空间，Chrome 61 基线）
   F2 随机抽查 / F3 模式选择 / F5 错题更新 / F6 历史最佳 / 计时挑战
   依赖 main.js：M.store / M.ALL_ROWS / M.unlockedPairs / M.makeEl /
   M.clearNode / M.renderHeader / M.backFromQuiz / M.todayStr /
   M.dateStr / M.calcStreak / M.saveStore
   约束：不超 ES2017（无 ?. ?? 对象展开等）、事件全 addEventListener、
         计时 performance.now() + visibilitychange 后台暂停
   ============================================================ */
(function () {
  'use strict';

  var M = window.MulApp;
  var viewEl = M.viewEl; // main.js 注入

  /* ---------- 模式定义 ---------- */
  var MODES = {
    normal:  { name: '随机抽查', count: 10, bestKey: 'normal' },
    timed:   { name: '计时挑战', count: 20, bestKey: 'timed' },
    special: { name: '专项练习', count: 10, bestKey: 'special' },
    check:   { name: '行末小测', count: 5,  bestKey: null },
    wrong:   { name: '易错专练', count: 10, bestKey: 'special' }
  };

  /* ---------- 会话状态 ---------- */
  var state = M.state = {
    mode: 'normal', row: 0, timerSec: 0,
    quiz: [], idx: 0, correct: 0,
    answer: '', answered: false, startMs: 0,
    timerTotal: 0, timerRemain: 0, timerStart: 0, timerPaused: 0, timerId: null
  };

  function modeTitle(mode, row) {
    if (mode === 'check') { return '行末小测 · ' + row + ' 的口诀'; }
    if (mode === 'special') { return '专项练习 · ' + row + ' 的口诀'; }
    if (mode === 'wrong') { return '易错专练'; }
    if (mode === 'timed') { return '计时挑战'; }
    return '随机抽查';
  }

  /* ---------- 出题引擎（F2/F3/F5） ---------- */
  function buildQuiz(mode, row) {
    var count = MODES[mode].count, pool;
    if (mode === 'normal' || mode === 'timed') { pool = M.unlockedPairs(); }
    else if (mode === 'wrong') { pool = wrongPairs(); count = Math.min(10, pool.length); }
    else { pool = M.ALL_ROWS[row - 1]; } // 专项 / 行末小测
    if (!pool.length) { return []; }
    var quiz = [], seen = {};
    for (var i = 0; i < count; i++) {
      var q = null;
      for (var attempt = 0; attempt < 8; attempt++) { // 同次防重复（≤8 次重试）
        var cand = pool[Math.floor(Math.random() * pool.length)];
        if (!seen[cand.a * 10 + cand.b]) { q = cand; break; }
      }
      if (!q) { q = pool[Math.floor(Math.random() * pool.length)]; } // 池过小允许重复
      if (!q) { break; }
      quiz.push({ row: q.row, a: q.a, b: q.b, answer: q.answer });
      seen[q.a * 10 + q.b] = true;
    }
    return quiz;
  }

  function wrongPairs() { // 易错聚合：错 ≥2 次，按 wrongCount 降序
    var hot = (M.store.wrongBook || []).filter(function (w) { return w.wrongCount >= 2; });
    hot.sort(function (a, b) { return b.wrongCount - a.wrongCount; });
    var list = [];
    for (var i = 0; i < hot.length; i++) {
      list.push({ row: hot[i].row, a: hot[i].a, b: hot[i].b, answer: hot[i].answer });
    }
    return list;
  }

  /* ---------- 练习页 ---------- */
  function startQuiz(mode, row, timerSec) {
    var sec = timerSec || 0;
    state.mode = mode; state.row = row; state.timerSec = sec;
    state.idx = 0; state.correct = 0;
    state.answer = ''; state.answered = false;
    state.startMs = performance.now();
    state.quiz = buildQuiz(mode, row);
    if (!state.quiz.length) { return; }
    stopTimer();
    if (sec) { startTimer(sec); }
    M.renderHeader(modeTitle(mode, row));
    renderQuiz();
    renderQuizFooter();
  }

  function renderQuizFooter() {
    var foot = document.getElementById('app-footer');
    M.clearNode(foot);
    var nav = M.makeEl('div', 'footer-nav');
    var quit = M.makeEl('div', 'footer-btn', '退出练习');
    quit.addEventListener('click', function () { stopTimer(); M.backFromQuiz(); });
    nav.appendChild(quit);
    foot.appendChild(nav);
  }

  var feedbackEl = null; // 当前题反馈节点（renderQuiz 重建）
  function renderQuiz() {
    M.clearNode(viewEl);
    var q = state.quiz[state.idx];
    var top = M.makeEl('div', 'quiz-top');
    top.appendChild(M.makeEl('div', 'quiz-progress', '第 ' + (state.idx + 1) + ' / ' + state.quiz.length + ' 题'));
    if (state.timerTotal > 0) {
      var timerEl = M.makeEl('div', 'quiz-timer', '⏱ --:--');
      timerEl.id = 'quiz-timer';
      top.appendChild(timerEl);
    }
    viewEl.appendChild(top);
    var card = M.makeEl('div', 'quiz-card');
    card.appendChild(M.makeEl('div', 'quiz-expression', q.a + ' × ' + q.b + ' = ?'));
    viewEl.appendChild(card);
    if (state.timerTotal > 0) { updateTimerDisplay(); }
    var area = M.makeEl('div', 'quiz-answer-area');
    var answerEl = M.makeEl('div', 'quiz-answer', '');
    area.appendChild(answerEl);
    viewEl.appendChild(area);
    feedbackEl = M.makeEl('div', 'quiz-feedback', '');
    viewEl.appendChild(feedbackEl);
    var pad = M.makeEl('div', 'keypad');
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '⌫', '✓'];
    keys.forEach(function (k) {
      var box = M.makeEl('div');
      var btn = M.makeEl('button', 'key-btn', k);
      btn.addEventListener('click', function () { keyPress(k, answerEl); });
      box.appendChild(btn);
      pad.appendChild(box);
    });
    viewEl.appendChild(pad);
  }

  function keyPress(key, answerEl) {
    if (state.answered) { return; }
    if (key === '⌫') {
      state.answer = state.answer.slice(0, -1);
    } else if (key === '✓') {
      submitAnswer();
      return;
    } else {
      if (state.answer.length >= 2) { return; }            // 答案 ≤81，最多 2 位
      if (key === '0' && !state.answer.length) { return; }  // 禁止前导 0
      state.answer += key;
    }
    answerEl.textContent = state.answer;
  }

  /* F2 即时反馈：答对绿✓ 600ms / 答错红✗+正确答案 1400ms 进下一题 */
  function submitAnswer() {
    if (!state.answer) { return; }
    var q = state.quiz[state.idx];
    var correct = String(q.answer) === state.answer;
    state.answered = true;
    M.store.profile.totalAnswer = (M.store.profile.totalAnswer || 0) + 1;
    if (correct) {
      state.correct += 1;
      M.store.profile.totalCorrect = (M.store.profile.totalCorrect || 0) + 1;
      feedbackEl.textContent = '✓ 答对了！';
      feedbackEl.className = 'quiz-feedback ok';
      updateWrongBook(q, true);
    } else {
      feedbackEl.textContent = '✗ 正确答案：' + q.answer;
      feedbackEl.className = 'quiz-feedback bad';
      updateWrongBook(q, false);
    }
    M.saveStore();
    window.setTimeout(function () {
      state.idx += 1;
      state.answer = ''; state.answered = false;
      if (state.idx >= state.quiz.length) { finishQuiz(); } else { renderQuiz(); }
    }, correct ? 600 : 1400);
  }

  /* F5 错题本：{row,a,b,answer,wrongCount,correctStreak,lastTime} 上限 500 FIFO */
  function updateWrongBook(q, correct) {
    var wrong = M.store.wrongBook, found = -1;
    for (var i = 0; i < wrong.length; i++) {
      if (wrong[i].a === q.a && wrong[i].b === q.b) { found = i; break; }
    }
    if (correct) {
      if (found >= 0) {
        wrong[found].correctStreak += 1;
        wrong[found].lastTime = M.todayStr();
        if (wrong[found].correctStreak >= 3) { wrong.splice(found, 1); } // 连续答对 3 次移除
      }
    } else {
      if (found >= 0) {
        wrong[found].wrongCount += 1;
        wrong[found].correctStreak = 0;
        wrong[found].lastTime = M.todayStr();
      } else {
        wrong.push({ row: q.a, a: q.a, b: q.b, answer: q.answer,
                     wrongCount: 1, correctStreak: 0, lastTime: M.todayStr() });
      }
      while (wrong.length > 500) { wrong.shift(); }
    }
  }

  /* ---------- 结算（F4 打卡/星星/成绩、F6 最佳、F1 解锁） ---------- */
  function finishQuiz() {
    stopTimer();
    var elapsed = Math.round((performance.now() - state.startMs) / 1000);
    var total = state.quiz.length;
    var rate = total ? Math.round(state.correct / total * 100) : 0;

    var t = M.todayStr();                     // 打卡：完成一次练习即点亮今日
    var dates = M.store.checkin.dates;
    if (dates[dates.length - 1] !== t) { dates.push(t); }
    while (dates.length > 365) { dates.shift(); }
    M.store.checkin.streak = M.calcStreak(dates);

    var stars = rate >= 100 ? 3 : rate >= 80 ? 2 : rate >= 60 ? 1 : 0; // 3★/2★/1★
    if ((state.mode === 'special' || state.mode === 'check') && state.row > 0) {
      if (stars > (M.store.profile.rowStars[state.row] || 0)) { M.store.profile.rowStars[state.row] = stars; }
    }

    var unlocked = false;                     // 行末小测过关（≥80%）→ 解锁下一行
    if (state.mode === 'check' && rate >= 80 && state.row < 9 &&
        M.store.unlockedRows.indexOf(state.row + 1) === -1) {
      M.store.unlockedRows.push(state.row + 1);
      M.store.unlockedRows.sort(function (a, b) { return a - b; });
      unlocked = true;
    }

    var bestKey = MODES[state.mode].bestKey; // F6 历史最佳 {rate,count,elapsedMs}
    var newBest = false;
    if (bestKey) {
      var best = M.store.profile.best[bestKey];
      var elapsedMs = elapsed * 1000;
      if (!best || rate > best.rate || (rate === best.rate && elapsedMs < best.elapsedMs)) {
        M.store.profile.best[bestKey] = { rate: rate, count: total, elapsedMs: elapsedMs };
        newBest = true;
      }
    }

    M.store.history.push({ date: t, mode: state.mode, row: state.row, rate: rate,
                           count: total, correct: state.correct, elapsedMs: elapsed * 1000 });
    while (M.store.history.length > 30) { M.store.history.shift(); } // 成绩滚动 30 条
    M.saveStore();

    renderResult(rate, total, elapsed, stars, unlocked, newBest, bestKey);
  }

  /* ---------- 结果页 ---------- */
  function renderResult(rate, total, elapsed, stars, unlocked, newBest, bestKey) {
    M.renderHeader(modeTitle(state.mode, state.row), M.backFromQuiz);
    M.clearNode(viewEl);
    var mkStat = function (label, val) {
      var s = M.makeEl('div', 'result-stat');
      s.appendChild(M.makeEl('b', '', val));
      s.appendChild(M.makeEl('span', '', label));
      return s;
    };
    var card = M.makeEl('div', 'result-card');
    card.appendChild(M.makeEl('div', 'result-score', rate + '%'));
    card.appendChild(M.makeEl('div', 'result-stars', stars ? '★★★'.slice(0, stars) : ''));
    var stats = M.makeEl('div', 'result-stats');
    stats.appendChild(mkStat('答对', state.correct + '/' + total));
    stats.appendChild(mkStat('用时', elapsed + 's'));
    stats.appendChild(mkStat('打卡', (M.store.checkin.streak || 0) + '天'));
    card.appendChild(stats);

    if (state.mode === 'check') {
      var banner;
      if (rate >= 80) {
        banner = M.makeEl('div', 'result-banner ok',
          state.row < 9 ? (unlocked ? '🎉 通关！已解锁第 ' + (state.row + 1) + ' 行' : '✓ 通过（≥80%）')
                        : '🎉 已全部解锁 9 行口诀！');
      } else {
        banner = M.makeEl('div', 'result-banner bad',
          '未通过（需 ≥80%）· 答对 ' + state.correct + '/' + total + ' · 再练一次');
      }
      card.appendChild(banner);
    }
    if (bestKey) {
      var best = M.store.profile.best[bestKey];
      card.appendChild(M.makeEl('div', newBest ? 'best-line new' : 'best-line',
        newBest ? '🎉 新纪录！正确率 ' + best.rate + '%'
                : '历史最佳：正确率 ' + best.rate + '% · ' + Math.round(best.elapsedMs / 1000) + 's'));
    }
    viewEl.appendChild(card);

    var row = M.makeEl('div', 'btn-row');
    var again = M.makeEl('button', 'btn', '再来一组');
    again.addEventListener('click', function () { startQuiz(state.mode, state.row, state.timerSec); });
    var back = M.makeEl('button', 'btn btn-primary', backLabel());
    back.addEventListener('click', function () { M.backFromQuiz(); });
    row.appendChild(again);
    row.appendChild(back);
    viewEl.appendChild(row);
  }

  function backLabel() {
    if (state.mode === 'check') { return '返回口诀表'; }
    if (state.mode === 'special') { return '返回专项选择'; }
    if (state.mode === 'wrong') { return '返回易错本'; }
    return '返回首页';
  }

  /* ---------- F3 模式选择弹窗（随机抽查） ---------- */
  function promptTimerMode() {
    var overlay = M.makeEl('div', 'timer-overlay');
    var box = M.makeEl('div', 'timer-box');
    box.appendChild(M.makeEl('div', 'page-title', '随机抽查 · 选择模式'));
    var modes = [
      { label: '普通练习（10 题）', sec: 0 },
      { label: '⏱ 30 秒挑战', sec: 30 },
      { label: '⏱ 60 秒挑战', sec: 60 },
      { label: '⏱ 120 秒挑战', sec: 120 }
    ];
    modes.forEach(function (m) {
      var btn = M.makeEl('button', 'btn', m.label);
      btn.style.marginTop = '8px';
      btn.addEventListener('click', function () {
        closeOverlay(overlay);
        startQuiz(m.sec ? 'timed' : 'normal', 0, m.sec);
      });
      box.appendChild(btn);
    });
    var cancel = M.makeEl('button', 'btn', '取消');
    cancel.style.marginTop = '8px';
    cancel.addEventListener('click', function () { closeOverlay(overlay); });
    box.appendChild(cancel);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function closeOverlay(overlay) {
    if (overlay && overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
  }

  /* ---------- 计时挑战（F3）：performance.now + visibilitychange 后台暂停 ---------- */
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
      if (state.timerRemain <= 0) { // 时间到自动交卷
        clearInterval(state.timerId);
        state.timerId = null;
        finishQuiz();
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
    var m = Math.floor(sec / 60), s = sec % 60;
    el.textContent = '⏱ ' + m + ':' + (s < 10 ? '0' : '') + s;
    el.className = sec <= 10 ? 'quiz-timer danger' : 'quiz-timer'; // ≤10s 变红
  }
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

  /* ---------- 导出到命名空间 ---------- */
  M.startQuiz = startQuiz;
  M.promptTimerMode = promptTimerMode;
  M.stopTimer = stopTimer;
})();
