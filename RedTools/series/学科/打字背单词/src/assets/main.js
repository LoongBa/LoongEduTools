/* ============================================================
   打字背单词 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   数据：window.APP_DATA（data.js 注入，build 生成 meta + books）
   依赖：window.DaziKeyboard（keyboard.js 屏幕虚拟键盘组件）
   功能：
   - 首页：册选择（11 册：年级+册次+词数统计）→ 单元列表（Unit N + 词数）→ 进入练习
   - 练习：单元内随机抽 ≤10 词，看中文释义打字拼写英文
   - 输入：屏幕虚拟键盘（移动端点按）+ 实体键盘（document keydown）双通道
   - 判定：大小写不敏感（统一 toLowerCase）；空格/连字符/撇号按词条原样输入
   - 反馈：答对 → 绿色 + "✓ 答对了" + 600ms 下一题；答错 → 红色 + 正确答案 +
     1400ms 下一题；已显示正确答案后禁止再输入（错误词入错题本，连续答对 3 次移除）
   - 结算：对题/总题 + 用时 + 正确率；完成一轮即打卡 + 成绩记录
   - 成绩页：连续打卡天数 + 本月打卡月历 + recent10（册/单元/对题/日期）+ 错题本词数
   持久化（localStorage try/catch + 内存降级，模式对齐 24点）：
     dazi_checkin    {version, dates:["YYYYMMDD"], streak, longestStreak}
     dazi_records    {version, recent10:[{grade,term,unit,correct,total,date}] 倒序 FIFO ≤10}
     dazi_wrongbook  {version, words:[{word,cn,grade,term,unit,wrongCount,correctStreak,lastTime}] ≤200}
   设计约束：
   - 不使用 import/export / type="module"；不超出 ES2017（无 ?. ?? 对象展开 replaceAll）
   - 事件全部 addEventListener，无内联事件 / eval
   - 无 fetch/XHR/Worker/定位/剪贴板/window.open；无外部 http(s):// 引用
   - 计时用 performance.now()，interval 按差值刷新
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {}, books: [] };
  var KB = window.DaziKeyboard;

  /* ---------- DOM ---------- */
  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');
  var footerEl = document.getElementById('app-footer');

  /* ---------- 常量 ---------- */
  var QUIZ_SIZE = 10;            /* 一轮默认题数 */
  var WRONGBOOK_MAX = 200;       /* 错题本上限 FIFO */
  var KEY_CHARS = /^[a-zA-Z' -]+$/;   /* 词条合法字符：字母/空格/撇号/连字符 */

  /* ---------- 状态 ---------- */
  var state = {
    view: 'home',        /* 当前视图（footer 高亮 + 实体键盘门控） */
    bookIdx: -1,         /* 当前册下标 */
    unit: null,          /* 当前单元 {unit, words} */
    quiz: [],            /* 本轮题目 [{word, cn}] */
    idx: 0,
    total: 0,
    answer: '',
    answered: false,
    answerOk: false,
    correctCount: 0,
    wrongCount: 0,
    startMs: 0,
    timerId: null,       /* 计时 interval */
    nextTimer: null      /* 下一题 setTimeout */
  };
  var keyboardApi = null;        /* 当前虚拟键盘句柄（setDisabled） */

  /* ---------- 持久化（localStorage + 内存降级） ---------- */
  var CHECKIN_KEY = 'dazi_checkin';
  var RECORDS_KEY = 'dazi_records';
  var WRONGBOOK_KEY = 'dazi_wrongbook';
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
    var base = { version: 1, recent10: [] };
    if (raw && typeof raw === 'object') {
      base.recent10 = Array.isArray(raw.recent10) ? raw.recent10.slice(0, 10) : [];
    }
    return base;
  }
  function normalizeWrongbook(raw) {
    var base = { version: 1, words: [] };
    if (raw && typeof raw === 'object') {
      base.words = Array.isArray(raw.words) ? raw.words.slice(0, WRONGBOOK_MAX) : [];
    }
    return base;
  }

  var checkin = normalizeCheckin(storage.get(CHECKIN_KEY));
  var records = normalizeRecords(storage.get(RECORDS_KEY));
  var wrongbook = normalizeWrongbook(storage.get(WRONGBOOK_KEY));
  storage.set(CHECKIN_KEY, checkin);   /* 初始化写入 */
  storage.set(RECORDS_KEY, records);
  storage.set(WRONGBOOK_KEY, wrongbook);

  function saveCheckin() { storage.set(CHECKIN_KEY, checkin); }
  function saveRecords() { storage.set(RECORDS_KEY, records); }
  function saveWrongbook() { storage.set(WRONGBOOK_KEY, wrongbook); }

  /* ---------- 数据归一化（防御 APP.books 空值/畸形） ---------- */
  var BOOKS = [];
  (function initBooks() {
    var raw = Array.isArray(APP.books) ? APP.books : [];
    var i, j, k;
    for (i = 0; i < raw.length; i++) {
      var b = raw[i];
      if (!b || !Array.isArray(b.units)) { continue; }
      var units = [];
      var totalWords = 0;
      for (j = 0; j < b.units.length; j++) {
        var u = b.units[j];
        if (!u || !Array.isArray(u.words)) { continue; }
        var words = [];
        for (k = 0; k < u.words.length; k++) {
          var w = u.words[k];
          if (w && w.word) { words.push({ word: w.word, cn: w.cn || '' }); }
        }
        if (!words.length) { continue; }
        units.push({ unit: u.unit, words: words });
        totalWords += words.length;
      }
      if (!units.length) { continue; }
      BOOKS.push({
        grade: b.grade || '',
        term: b.term || '',
        book: b.book || '',
        units: units,
        totalWords: totalWords
      });
    }
  })();

  function bookLabel(b) { return (b.grade || '') + ' ' + (b.term || ''); }

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
    var streak = 0;
    var d = new Date();
    var i;
    for (i = dates.length - 1; i >= 0; i--) {
      if (dates[i] === todayStr()) { streak = 1; continue; }
      d.setDate(d.getDate() - 1);
      var want = dateStr(d);
      if (dates[i] === want) { streak += 1; }
      else { break; }
    }
    return streak;
  }
  /* Fisher-Yates 洗牌 */
  function shuffle(arr) {
    var i, j, t;
    for (i = arr.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
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
    var name = APP.meta && APP.meta.name ? APP.meta.name : '打字背单词';
    brand.appendChild(makeEl('span', 'header-title', title || name));
    if (APP.meta && APP.meta.version) {
      brand.appendChild(makeEl('span', 'header-ver', 'v' + APP.meta.version));
    }
    headerEl.appendChild(brand);
  }

  /* ---------- 底部导航（练习 / 成绩，高亮当前） ---------- */
  function renderFooterNav(active) {
    clearNode(footerEl);
    var nav = makeEl('div', 'footer-nav');
    var mk = function (label, key, fn) {
      var b = makeEl('div', 'footer-btn' + (active === key ? ' active' : ''), label);
      b.addEventListener('click', fn);
      return b;
    };
    nav.appendChild(mk('练习', 'practice', viewHome));
    nav.appendChild(mk('成绩', 'stats', viewStats));
    footerEl.appendChild(nav);
  }

  /* ---------- 视图：首页（册选择） ---------- */
  function viewHome() {
    state.view = 'practice';
    stopQuiz();
    renderHeader();
    clearNode(viewEl);
    clearNode(footerEl);
    if (!BOOKS.length) {
      viewEl.appendChild(makeEl('div', 'page-title', '词汇数据缺失，请重新构建'));
      viewEl.appendChild(makeEl('div', 'home-hint', '运行构建脚本生成 data.js 后重试'));
      renderFooterNav('practice');
      return;
    }
    viewEl.appendChild(makeEl('div', 'page-title', '选择册次'));
    viewEl.appendChild(makeEl('div', 'home-hint', '看中文释义，打字拼出英文单词'));
    var list = makeEl('div', 'book-list');
    var i;
    for (i = 0; i < BOOKS.length; i++) {
      (function (idx, b) {
        var card = makeEl('div', 'book-card');
        var btn = makeEl('button', 'book-btn', bookLabel(b));
        btn.addEventListener('click', function () { viewUnits(idx); });
        card.appendChild(btn);
        card.appendChild(makeEl('div', 'book-meta',
          '全册 ' + b.totalWords + ' 词 · ' + b.units.length + ' 个单元'));
        list.appendChild(card);
      })(i, BOOKS[i]);
    }
    viewEl.appendChild(list);
    renderFooterNav('practice');
  }

  /* ---------- 视图：单元列表 ---------- */
  function viewUnits(bookIdx) {
    state.view = 'practice';
    stopQuiz();
    state.bookIdx = bookIdx;
    var b = BOOKS[bookIdx];
    if (!b) { viewHome(); return; }
    renderHeader(bookLabel(b));
    clearNode(viewEl);
    clearNode(footerEl);

    var top = makeEl('div', 'quiz-top');
    var back = makeEl('button', 'quiz-back', '‹ 返回');
    back.addEventListener('click', viewHome);
    top.appendChild(back);
    var info = makeEl('div', 'quiz-info');
    info.appendChild(makeEl('div', 'quiz-progress', bookLabel(b)));
    info.appendChild(makeEl('div', 'quiz-score', '全册 ' + b.totalWords + ' 词'));
    top.appendChild(info);
    viewEl.appendChild(top);

    var list = makeEl('div', 'unit-list');
    var j;
    for (j = 0; j < b.units.length; j++) {
      (function (u) {
        var card = makeEl('div', 'unit-card');
        var btn = makeEl('button', 'unit-btn', 'Unit ' + u.unit);
        btn.addEventListener('click', function () { startQuiz(bookIdx, u); });
        card.appendChild(btn);
        card.appendChild(makeEl('div', 'unit-meta', u.words.length + ' 词'));
        list.appendChild(card);
      })(b.units[j]);
    }
    viewEl.appendChild(list);
    renderFooterNav('practice');
  }

  /* ---------- 练习 ---------- */
  function sampleWords(words) {
    var pool = [];
    var i;
    for (i = 0; i < words.length; i++) {
      var w = words[i];
      if (w.word && KEY_CHARS.test(w.word)) { pool.push(w); }
    }
    shuffle(pool);
    return pool.slice(0, QUIZ_SIZE);
  }

  function startQuiz(bookIdx, unit) {
    state.view = 'quiz';
    stopQuiz();
    state.bookIdx = bookIdx;
    state.unit = unit;
    state.quiz = sampleWords(unit.words);
    if (!state.quiz.length) {
      toast('该单元没有可练习的单词', true);
      viewUnits(bookIdx);
      return;
    }
    state.idx = 0;
    state.total = state.quiz.length;
    state.correctCount = 0;
    state.wrongCount = 0;
    state.answer = '';
    state.answered = false;
    state.answerOk = false;
    state.startMs = performance.now();
    renderHeader(bookLabel(BOOKS[bookIdx]) + ' · Unit ' + unit.unit);
    clearNode(viewEl);
    clearNode(footerEl);
    renderQuiz();
    startTimer();
  }

  function currentQuestion() {
    return state.quiz[state.idx];
  }

  function renderQuiz() {
    clearNode(viewEl);
    var q = currentQuestion();
    if (!q) { return; }

    /* 顶部：返回 | 进度+对错计数 | 计时 */
    var top = makeEl('div', 'quiz-top');
    var back = makeEl('button', 'quiz-back', '‹ 返回');
    back.addEventListener('click', onBackFromQuiz);
    top.appendChild(back);
    var info = makeEl('div', 'quiz-info');
    var prog = makeEl('div', 'quiz-progress', '第 ' + (state.idx + 1) + '/' + state.total + ' 题');
    prog.id = 'quiz-progress';
    info.appendChild(prog);
    var score = makeEl('div', 'quiz-score', '对 ' + state.correctCount + ' · 错 ' + state.wrongCount);
    score.id = 'quiz-score';
    info.appendChild(score);
    top.appendChild(info);
    var timerEl = makeEl('div', 'quiz-timer', '⏱ 00:00');
    timerEl.id = 'quiz-timer';
    top.appendChild(timerEl);
    viewEl.appendChild(top);

    /* 题目卡：中文释义（大字） */
    var card = makeEl('div', 'question-card');
    card.appendChild(makeEl('div', 'question-cn', q.cn || q.word));
    card.appendChild(makeEl('div', 'question-hint',
      '拼写英文单词 · ' + q.word.length + ' 个字符'));
    viewEl.appendChild(card);

    /* 作答区：字母槽（每字符一格） */
    var area = makeEl('div', 'answer-area');
    area.id = 'answer-area';
    viewEl.appendChild(area);
    renderAnswer();

    /* 反馈行 */
    var feedback = makeEl('div', 'quiz-feedback', '');
    feedback.id = 'quiz-feedback';
    viewEl.appendChild(feedback);

    /* 屏幕虚拟键盘 */
    var kbWrap = makeEl('div', 'kb-wrap');
    kbWrap.id = 'kb-wrap';
    viewEl.appendChild(kbWrap);
    if (KB && KB.render) {
      keyboardApi = KB.render(kbWrap, {
        onChar: function (ch) { onCharInput(ch); },
        onBackspace: function () { onBackspaceInput(); },
        onSubmit: function () { onSubmitAnswer(); }
      });
    }
  }

  function renderAnswer() {
    var area = document.getElementById('answer-area');
    if (!area) { return; }
    var q = currentQuestion();
    if (!q) { return; }
    clearNode(area);
    var target = q.word;
    var slots = makeEl('div', 'answer-slots');
    var i;
    for (i = 0; i < target.length; i++) {
      (function (pos) {
        var ch = target.charAt(pos);
        var isSpace = ch === ' ';
        var slot = makeEl('div', isSpace ? 'answer-slot slot-space' : 'answer-slot');
        var typed = state.answer.charAt(pos);
        /* 答错后展示正确拼写；否则展示已输入字符 */
        var show = state.answered && !state.answerOk ? ch : typed;
        if (show !== '') {
          slot.textContent = isSpace ? '·' : show;
          slot.className += ' filled';
        }
        if (state.answered) {
          var ok = typed !== '' && typed.toLowerCase() === ch.toLowerCase();
          slot.className += ok ? ' char-ok' : ' char-bad';
        }
        slots.appendChild(slot);
      })(i);
    }
    if (state.answered) {
      area.className = 'answer-area ' + (state.answerOk ? 'answer-ok' : 'answer-bad');
    } else {
      area.className = 'answer-area';
    }
    area.appendChild(slots);
  }

  /* ---------- 输入（虚拟键盘 + 实体键盘共用） ---------- */
  function onCharInput(ch) {
    if (state.view !== 'quiz' || state.answered) { return; }
    var target = currentQuestion().word;
    if (state.answer.length >= target.length) { onSubmitAnswer(); return; }
    state.answer += ch;
    renderAnswer();
    /* 答案长度达标 → 自动提交 */
    if (state.answer.length === target.length) { onSubmitAnswer(); }
  }

  function onBackspaceInput() {
    if (state.view !== 'quiz' || state.answered) { return; }
    if (!state.answer) { return; }
    state.answer = state.answer.slice(0, -1);
    renderAnswer();
  }

  function onSubmitAnswer() {
    if (state.view !== 'quiz' || state.answered) { return; }
    if (!state.answer) { return; }
    var q = currentQuestion();
    var correct = state.answer.toLowerCase() === q.word.toLowerCase();
    state.answered = true;
    state.answerOk = correct;

    if (correct) { state.correctCount += 1; }
    else { state.wrongCount += 1; }
    updateWrongBook(q, correct);
    renderAnswer();

    var feedbackEl = document.getElementById('quiz-feedback');
    if (correct) {
      feedbackEl.textContent = '✓ 答对了';
      feedbackEl.className = 'quiz-feedback ok';
    } else {
      feedbackEl.textContent = '正确答案：' + q.word;
      feedbackEl.className = 'quiz-feedback bad';
    }
    updateScoreDisplay();
    if (keyboardApi) { keyboardApi.setDisabled(true); }   /* 已显示答案，禁止再输入 */

    state.nextTimer = window.setTimeout(function () {
      state.nextTimer = null;
      state.idx += 1;
      if (state.idx >= state.total) {
        finishQuiz();
      } else {
        state.answer = '';
        state.answered = false;
        state.answerOk = false;
        renderQuiz();
      }
    }, correct ? 600 : 1400);
  }

  function updateScoreDisplay() {
    var el = document.getElementById('quiz-score');
    if (el) { el.textContent = '对 ' + state.correctCount + ' · 错 ' + state.wrongCount; }
  }

  /* ---------- 错题本（错误词入错题本逻辑，连续答对 3 次移除） ---------- */
  function updateWrongBook(q, correct) {
    var words = wrongbook.words;
    var found = -1;
    var i;
    for (i = 0; i < words.length; i++) {
      if (words[i].word === q.word && words[i].cn === q.cn) { found = i; break; }
    }
    if (correct) {
      if (found >= 0) {
        words[found].correctStreak += 1;
        words[found].lastTime = todayStr();
        if (words[found].correctStreak >= 3) { words.splice(found, 1); }
      }
    } else {
      if (found >= 0) {
        words[found].wrongCount += 1;
        words[found].correctStreak = 0;
        words[found].lastTime = todayStr();
      } else {
        words.push({
          word: q.word,
          cn: q.cn,
          grade: BOOKS[state.bookIdx].grade,
          term: BOOKS[state.bookIdx].term,
          unit: state.unit.unit,
          wrongCount: 1,
          correctStreak: 0,
          lastTime: todayStr()
        });
      }
      while (words.length > WRONGBOOK_MAX) { words.shift(); }
    }
    saveWrongbook();
  }

  /* ---------- 计时 ---------- */
  function startTimer() {
    stopTimer();
    state.timerId = setInterval(function () {
      var el = document.getElementById('quiz-timer');
      if (el) { el.textContent = '⏱ ' + fmtMMSS(performance.now() - state.startMs); }
    }, 100);
  }
  function stopTimer() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
  }
  function stopQuiz() {
    stopTimer();
    if (state.nextTimer) { clearTimeout(state.nextTimer); state.nextTimer = null; }
    if (keyboardApi) { keyboardApi.setDisabled(true); keyboardApi = null; }
  }

  /* ---------- 结算（完成一轮 → 打卡 + 成绩记录） ---------- */
  function finishQuiz() {
    stopTimer();
    if (state.nextTimer) { clearTimeout(state.nextTimer); state.nextTimer = null; }
    var elapsedMs = performance.now() - state.startMs;
    var t = todayStr();

    /* 打卡：完成一轮即点亮今日（模式对齐 24点） */
    var dates = checkin.dates;
    if (dates.indexOf(t) === -1) { dates.push(t); }
    dates.sort();
    while (dates.length > 730) { dates.shift(); }
    checkin.streak = calcStreak(dates);
    if (checkin.streak > checkin.longestStreak) { checkin.longestStreak = checkin.streak; }
    saveCheckin();

    /* 成绩记录：recent10 倒序 FIFO ≤10 */
    records.recent10.unshift({
      grade: BOOKS[state.bookIdx].grade,
      term: BOOKS[state.bookIdx].term,
      unit: state.unit.unit,
      correct: state.correctCount,
      total: state.total,
      date: t
    });
    while (records.recent10.length > 10) { records.recent10.pop(); }
    saveRecords();

    viewResult(elapsedMs);
  }

  /* ---------- 视图：结算 ---------- */
  function mkStat(label, val) {
    var s = makeEl('div', 'result-stat');
    s.appendChild(makeEl('b', '', val));
    s.appendChild(makeEl('span', '', label));
    return s;
  }

  function viewResult(elapsedMs) {
    state.view = 'practice';
    renderHeader('本轮完成');
    clearNode(viewEl);
    clearNode(footerEl);

    var b = BOOKS[state.bookIdx];
    var card = makeEl('div', 'result-card');
    card.appendChild(makeEl('div', 'result-title',
      (b ? bookLabel(b) : '') + ' · Unit ' + state.unit.unit));
    card.appendChild(makeEl('div', 'result-score', state.correctCount + ' / ' + state.total));
    var rate = state.total ? Math.round(state.correctCount / state.total * 100) : 0;
    var stats = makeEl('div', 'result-stats');
    stats.appendChild(mkStat('用时', fmtMMSS(elapsedMs)));
    stats.appendChild(mkStat('正确率', rate + '%'));
    stats.appendChild(mkStat('连续打卡', calcStreak(checkin.dates) + ' 天'));
    card.appendChild(stats);
    viewEl.appendChild(card);

    var btnRow = makeEl('div', 'btn-row');
    var again = makeEl('button', 'btn btn-primary', '再练一轮');
    again.addEventListener('click', function () { startQuiz(state.bookIdx, state.unit); });
    btnRow.appendChild(again);
    var units = makeEl('button', 'btn', '换个单元');
    units.addEventListener('click', function () { viewUnits(state.bookIdx); });
    btnRow.appendChild(units);
    viewEl.appendChild(btnRow);

    renderFooterNav('practice');
  }

  /* ---------- 视图：成绩（连续打卡 + 月历 + recent10 + 错词数） ---------- */
  function viewStats() {
    state.view = 'stats';
    stopQuiz();
    renderHeader('成绩');
    clearNode(viewEl);
    clearNode(footerEl);

    /* 打卡卡片：连续天数 + 本月月历 */
    var card = makeEl('div', 'calendar');
    card.appendChild(makeEl('div', 'page-title', '打卡'));
    var streak = calcStreak(checkin.dates);
    var line = makeEl('div', 'streak-line');
    line.appendChild(document.createTextNode('连续打卡 '));
    line.appendChild(makeEl('b', '', '' + streak));
    line.appendChild(document.createTextNode(' 天 · 最长 '));
    line.appendChild(makeEl('b', '', '' + checkin.longestStreak));
    line.appendChild(document.createTextNode(' 天'));
    card.appendChild(line);

    var grid = makeEl('div', 'calendar-grid');
    var now = new Date();
    var days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var t = todayStr();
    var d;
    for (d = 1; d <= days; d++) {
      (function (day) {
        var ds = dateStr(new Date(now.getFullYear(), now.getMonth(), day));
        var el = makeEl('div', 'cal-day', '' + day);
        if (checkin.dates.indexOf(ds) !== -1) { el.className = 'cal-day done'; }
        if (ds === t) { el.className += ' today'; }
        grid.appendChild(el);
      })(d);
    }
    card.appendChild(grid);
    card.appendChild(makeEl('div', 'streak-info', '完成一轮练习即点亮今日'));
    card.appendChild(makeEl('div', 'streak-info', '错题本已收录 ' + wrongbook.words.length + ' 词'));
    viewEl.appendChild(card);

    /* 成绩列表 recent10 */
    viewEl.appendChild(makeEl('div', 'mode-title', '最近成绩'));
    var list = records.recent10;
    if (!list.length) {
      viewEl.appendChild(makeEl('div', 'home-hint', '暂无成绩，先来一轮吧'));
    } else {
      var ul = makeEl('div', 'point-list');
      var i;
      for (i = 0; i < list.length; i++) {
        (function (r) {
          var item = makeEl('div', 'point-item');
          var left = makeEl('div');
          left.appendChild(makeEl('div', 'point-name',
            (r.grade || '') + ' ' + (r.term || '') + ' · Unit ' + r.unit));
          left.appendChild(makeEl('div', 'point-meta', r.date));
          item.appendChild(left);
          var right = makeEl('div', 'point-right');
          right.appendChild(makeEl('div', 'point-time', r.correct + '/' + r.total));
          item.appendChild(right);
          ul.appendChild(item);
        })(list[i]);
      }
      viewEl.appendChild(ul);
    }

    renderFooterNav('stats');
  }

  /* ---------- 返回 ---------- */
  function onBackFromQuiz() {
    stopQuiz();
    viewUnits(state.bookIdx);
  }

  /* ---------- 实体键盘（优先于虚拟键盘；仅练习视图响应） ---------- */
  function onDocumentKeyDown(e) {
    if (state.view !== 'quiz' || state.answered) { return; }
    if (e.metaKey || e.ctrlKey || e.altKey) { return; }
    if (e.isComposing) { return; }
    if (e.key === 'Enter') { e.preventDefault(); onSubmitAnswer(); return; }
    if (e.key === 'Backspace') { e.preventDefault(); onBackspaceInput(); return; }
    var k = e.key;
    if (k && k.length === 1) {
      var low = k.toLowerCase();
      if (/^[a-z]$/.test(low) || low === ' ' || low === "'" || low === '-') {
        e.preventDefault();
        onCharInput(low);
      }
    }
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
  document.addEventListener('keydown', onDocumentKeyDown);
  syncAppHeight();
  viewHome();
})();
