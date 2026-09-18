/* ============================================================
   认识钱币 — 练习引擎（window.MoneyApp 命名空间，Chrome 61 基线）
   F2 认一认/换一换 / F3 凑一凑（模拟购物凑钱）/ F4 找一找（找零）/
   F5 阶段渐进 / F6 打卡·星星·成绩
   依赖 main.js：M.store / M.makeEl / M.clearNode / M.renderHeader /
   M.backFromQuiz / M.todayStr / M.calcStreak / M.saveStore / M.viewEl / M.COINS
   约束：不超 ES2017、事件全 addEventListener、零图片素材（钱币全 SVG）
   ============================================================ */
(function () {
  'use strict';

  var M = window.MoneyApp;
  var viewEl = M.viewEl;

  /* ---------- 面额定义（val 单位：角；1 元 = 10 角） ---------- */
  var COINS = M.COINS = [
    { val: 1,   name: '1角',  type: 'coin', bg: '#e8b04b', fg: '#7a4b00' },
    { val: 5,   name: '5角',  type: 'coin', bg: '#c9ced6', fg: '#4e5969' },
    { val: 10,  name: '1元',  type: 'bill', bg: '#eaf6ee', bar: '#2e9e5b', fg: '#2e9e5b' },
    { val: 50,  name: '5元',  type: 'bill', bg: '#f2ecfb', bar: '#7b4bb6', fg: '#7b4bb6' },
    { val: 100, name: '10元', type: 'bill', bg: '#e8f0fc', bar: '#3b7dd8', fg: '#3b7dd8' }
  ];
  function coinDef(jiao) {
    for (var i = 0; i < COINS.length; i++) { if (COINS[i].val === jiao) { return COINS[i]; } }
    return COINS[0];
  }

  /* ---------- 金额格式化：角 → "X 元 Y 角" ---------- */
  function fmtMoney(jiao) {
    if (jiao % 10 === 0) { return (jiao / 10) + ' 元'; }
    if (jiao < 10) { return jiao + ' 角'; }
    return Math.floor(jiao / 10) + ' 元 ' + (jiao % 10) + ' 角';
  }
  M.fmtMoney = fmtMoney;

  /* ============================================================
     SVG 钱币渲染（零素材）：硬币圆形 / 纸币矩形，面额主色 + 大面值文字
     ============================================================ */
  M.renderMoney = function (jiao) {
    var c = coinDef(jiao);
    var parts = [];
    if (c.type === 'coin') {
      parts.push('<svg class="money-svg coin-svg" viewBox="0 0 60 60">');
      parts.push('<circle cx="30" cy="30" r="25" fill="' + c.bg + '" stroke="#d9d9d9" stroke-width="2"/>');
      parts.push('<circle cx="30" cy="30" r="20" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.8"/>');
      parts.push('<text x="30" y="28" font-size="13" font-weight="700" fill="' + c.fg +
        '" text-anchor="middle" dominant-baseline="central">' + (c.type === 'coin' ? c.val : c.val / 10) + '</text>');
      parts.push('<text x="30" y="41" font-size="9" font-weight="600" fill="' + c.fg +
        '" text-anchor="middle" dominant-baseline="central">角</text>');
      parts.push('</svg>');
    } else {
      parts.push('<svg class="money-svg bill-svg" viewBox="0 0 80 60">');
      parts.push('<rect x="3" y="6" width="74" height="48" rx="7" fill="' + c.bg + '" stroke="#d9d9d9" stroke-width="2"/>');
      parts.push('<rect x="3" y="6" width="12" height="48" rx="7" fill="' + c.bar + '"/>');
      parts.push('<text x="24" y="32" font-size="18" font-weight="800" fill="' + c.fg +
        '" text-anchor="middle" dominant-baseline="central">' + c.val / 10 + '</text>');
      parts.push('<text x="44" y="32" font-size="11" font-weight="700" fill="' + c.fg +
        '" text-anchor="start" dominant-baseline="central">元</text>');
      parts.push('<circle cx="66" cy="18" r="4" fill="' + c.fg + '" opacity="0.5"/>');
      parts.push('<circle cx="66" cy="42" r="4" fill="' + c.fg + '" opacity="0.5"/>');
      parts.push('</svg>');
    }
    return parts.join('');
  };

  /* ---------- 阶段定义 ---------- */
  var STAGES = M.STAGES = [
    { name: '认钱币', desc: '认一认面额 · 换一换换算' },
    { name: '凑钱购物', desc: '选钱币凑够商品价格' },
    { name: '购物找零', desc: '付钱后算应找回多少' }
  ];

  /* ---------- 会话状态 ---------- */
  var state = M.state = { stage: 1, quiz: [], idx: 0, correct: 0, answered: false, over: false };
  var feedbackEl = null;

  /* ---------- 出题引擎 ---------- */
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
  }
  function pickOpts(correct, pool, count) {
    // 从 pool 中取 count-1 个干扰 + correct，去重，shuffle
    var set = {};
    set[correct] = true;
    var list = [correct];
    shuffle(pool);
    for (var i = 0; i < pool.length && list.length < count; i++) {
      if (!set[pool[i]]) { set[pool[i]] = true; list.push(pool[i]); }
    }
    while (list.length < count) {
      var extra = Math.floor(Math.random() * pool.length);
      if (!set[pool[extra]]) { set[pool[extra]] = true; list.push(pool[extra]); }
    }
    shuffle(list);
    return list;
  }

  /* 阶段 1：认一认（识别面额）+ 换一换（元角换算） */
  function genRecognize() {
    var c = COINS[Math.floor(Math.random() * COINS.length)];
    var pool = COINS.map(function (x) { return x.name; });
    return { type: 'recognize', coin: c.val, answer: c.name, opts: pickOpts(c.name, pool, 4) };
  }
  function genConvert() {
    var forms = [
      { q: '5 角可以换几个 1 角？', a: 5 },
      { q: '1 元等于多少角？', a: 10 },
      { q: '10 角等于几元？', a: 1 },
      { q: '20 角等于几元？', a: 2 },
      { q: '1 元可以换几个 5 角？', a: 2 },
      { q: '50 角等于几元？', a: 5 },
      { q: '3 元等于多少角？', a: 30 }
    ];
    var f = forms[Math.floor(Math.random() * forms.length)];
    var dist = [];
    for (var i = -10; i <= 10; i++) {
      var c = f.a + i;
      if (c >= 1 && c !== f.a) { dist.push(c); }
    }
    return { type: 'convert', q: f.q, answer: '' + f.a, opts: pickOpts('' + f.a, dist.map(String), 4) };
  }

  /* 阶段 2：凑一凑（钱堆点选凑价格） */
  var GOODS = [
    { emoji: '🍎', name: '苹果' }, { emoji: '🍌', name: '香蕉' }, { emoji: '🍞', name: '面包' },
    { emoji: '🥛', name: '牛奶' }, { emoji: '🍭', name: '棒棒糖' }, { emoji: '✏️', name: '铅笔' },
    { emoji: '📏', name: '尺子' }, { emoji: '🧸', name: '玩具' }, { emoji: '🍪', name: '饼干' }
  ];
  var PILE_TEMPLATE = [10, 10, 10, 5, 5, 1, 1, 1, 1, 1]; // 1元×3 + 5角×2 + 1角×5
  function genCompose() {
    var goods = GOODS[Math.floor(Math.random() * GOODS.length)];
    // 随机抽 2-6 枚钱币求和建议（保证可恰好凑出）
    var idxArr = [];
    for (var i = 0; i < PILE_TEMPLATE.length; i++) { idxArr.push(i); }
    shuffle(idxArr);
    var n = 2 + Math.floor(Math.random() * 5); // 2-6 枚
    var price = 0;
    for (var k = 0; k < n; k++) { price += PILE_TEMPLATE[idxArr[k]]; }
    if (price < 15) { price = 15; }
    return { type: 'compose', goods: goods, price: price };
  }

  /* 阶段 3：找一找（付钱找零） */
  function genChange() {
    var goods = GOODS[Math.floor(Math.random() * GOODS.length)];
    var price = 15 + Math.floor(Math.random() * 31); // 15-45 角
    var paid = 50; // 付 5 元
    var change = paid - price; // 5-35 角
    var dist = [];
    var attempts = [1, -1, 5, -5, 10, -10, 2, -2];
    for (var i = 0; i < attempts.length; i++) {
      var c = change + attempts[i];
      if (c >= 1 && c !== change && dist.indexOf(c) === -1) { dist.push(c); }
    }
    return { type: 'change', goods: goods, price: price, paid: paid,
             answer: fmtMoney(change), opts: pickOpts(fmtMoney(change), dist.map(fmtMoney), 4) };
  }

  function buildQuiz(stage) {
    var quiz = [], i;
    if (stage === 1) {
      for (i = 0; i < 10; i++) { quiz.push(i % 2 === 0 ? genRecognize() : genConvert()); }
    } else if (stage === 2) {
      for (i = 0; i < 10; i++) { quiz.push(genCompose()); }
    } else {
      for (i = 0; i < 10; i++) { quiz.push(genChange()); }
    }
    return quiz;
  }
  M.buildQuiz = buildQuiz;

  /* ---------- 练习渲染 ---------- */
  function startQuiz(stage) {
    if (stage > (M.store.unlockedStage || 1)) { return; }
    state.stage = stage;
    state.quiz = buildQuiz(stage);
    state.idx = 0; state.correct = 0;
    state.answered = false; state.over = false;
    M.renderHeader('第 ' + stage + ' 阶段 · ' + STAGES[stage - 1].name);
    renderQuiz();
    renderQuizFooter();
  }
  M.startQuiz = startQuiz;

  function renderQuizFooter() {
    var foot = document.getElementById('app-footer');
    M.clearNode(foot);
    var nav = M.makeEl('div', 'footer-nav');
    var quit = M.makeEl('div', 'footer-btn', '退出练习');
    quit.addEventListener('click', function () { M.backFromQuiz(); });
    nav.appendChild(quit);
    foot.appendChild(nav);
  }

  function renderQuiz() {
    M.clearNode(viewEl);
    viewEl.className = 'view';
    var q = state.quiz[state.idx];
    var titleMap = { recognize: '认一认', convert: '换一换', compose: '凑一凑', change: '找一找' };
    var top = M.makeEl('div', 'quiz-top');
    top.appendChild(M.makeEl('div', 'quiz-progress',
      '第 ' + (state.idx + 1) + ' / ' + state.quiz.length + ' 题 · ' + titleMap[q.type]));
    viewEl.appendChild(top);
    if (q.type === 'recognize') { renderRecognize(q); }
    else if (q.type === 'convert') { renderConvert(q); }
    else if (q.type === 'compose') { renderCompose(q); }
    else { renderChange(q); }
  }

  function addFeedback() {
    feedbackEl = M.makeEl('div', 'quiz-feedback', '');
    viewEl.appendChild(feedbackEl);
  }
  function answerCorrect() {
    state.correct += 1;
    M.store.profile.totalCorrect = (M.store.profile.totalCorrect || 0) + 1;
  }

  /* ---------- F2a 认一认：钱币图 → 4 选 1 面额 ---------- */
  var qCoin = null;
  function renderRecognize(q) {
    qCoin = q;
    var card = M.makeEl('div', 'quiz-card');
    card.appendChild(M.makeEl('div', 'quiz-question', '这是多少钱？'));
    var wrap = M.makeEl('div', 'money-big');
    wrap.innerHTML = M.renderMoney(q.coin);
    card.appendChild(wrap);
    viewEl.appendChild(card);
    var grid = M.makeEl('div', 'opt-grid');
    q.opts.forEach(function (o) {
      var box = M.makeEl('div');
      var btn = M.makeEl('button', 'opt-btn', o);
      btn.addEventListener('click', function () {
        if (state.answered) { return; }
        state.answered = true;
        M.store.profile.totalAnswer = (M.store.profile.totalAnswer || 0) + 1;
        if (o === q.answer) {
          answerCorrect();
          btn.className = 'opt-btn ok';
          feedbackEl.textContent = '✓ 答对了！';
          feedbackEl.className = 'quiz-feedback ok';
          M.saveStore();
          window.setTimeout(advance, 600);
        } else {
          btn.className = 'opt-btn bad';
          markOkBtn(q.answer);
          feedbackEl.textContent = '✗ 正确答案：' + q.answer;
          feedbackEl.className = 'quiz-feedback bad';
          M.saveStore();
          window.setTimeout(advance, 1400);
        }
      });
      box.appendChild(btn);
      grid.appendChild(box);
    });
    viewEl.appendChild(grid);
    addFeedback();
  }
  function markOkBtn(ans) {
    var btns = viewEl.querySelectorAll('.opt-btn');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].textContent === ans && btns[i].className.indexOf('bad') === -1) {
        btns[i].className = 'opt-btn ok';
      }
    }
  }

  /* ---------- F2b 换一换：元角换算 4 选 1 ---------- */
  var qConvert = null;
  function renderConvert(q) {
    qConvert = q;
    var card = M.makeEl('div', 'quiz-card');
    card.appendChild(M.makeEl('div', 'quiz-question', q.q));
    card.appendChild(M.makeEl('div', 'set-target-cn', '想一想 · 一共多少/能换几个'));
    viewEl.appendChild(card);
    var grid = M.makeEl('div', 'opt-grid');
    q.opts.forEach(function (o) {
      var box = M.makeEl('div');
      var btn = M.makeEl('button', 'opt-btn', o);
      btn.addEventListener('click', function () {
        if (state.answered) { return; }
        state.answered = true;
        M.store.profile.totalAnswer = (M.store.profile.totalAnswer || 0) + 1;
        if (o === q.answer) {
          answerCorrect();
          btn.className = 'opt-btn ok';
          feedbackEl.textContent = '✓ 答对了！';
          feedbackEl.className = 'quiz-feedback ok';
          M.saveStore();
          window.setTimeout(advance, 600);
        } else {
          btn.className = 'opt-btn bad';
          markOkBtn(q.answer);
          feedbackEl.textContent = '✗ 正确答案：' + q.answer;
          feedbackEl.className = 'quiz-feedback bad';
          M.saveStore();
          window.setTimeout(advance, 1400);
        }
      });
      box.appendChild(btn);
      grid.appendChild(box);
    });
    viewEl.appendChild(grid);
    addFeedback();
  }

  /* ---------- F3 凑一凑：钱堆点选凑价格 ---------- */
  var composeState = null; // { target, pile:[{id,val,used}], selected:[{id,val}], sum, tried }
  function renderCompose(q) {
    var pile = PILE_TEMPLATE.map(function (v, i) { return { id: i, val: v, used: false }; });
    composeState = { target: q.price, pile: pile, selected: [], sum: 0, tried: 0 };
    var card = M.makeEl('div', 'quiz-card');
    card.appendChild(M.makeEl('div', 'set-target-num', q.goods.emoji + ' ' + fmtMoney(q.price)));
    card.appendChild(M.makeEl('div', 'set-target-cn', '点击钱币，凑够' + q.goods.name + '的价钱'));
    viewEl.appendChild(card);

    // 钱堆
    var pileWrap = M.makeEl('div', 'pile-wrap');
    pileWrap.appendChild(M.makeEl('div', 'section-label', '钱币（点击选择）'));
    var pileGrid = M.makeEl('div', 'pile-grid');
    pileGrid.id = 'pile-grid';
    pile.forEach(function (p) {
      var box = M.makeEl('div', 'pile-cell');
      var btn = M.makeEl('button', 'pile-btn', '');
      btn.dataset.id = p.id;
      btn.innerHTML = M.renderMoney(p.val);
      btn.addEventListener('click', function () { selectCoin(p.id); });
      box.appendChild(btn);
      pileGrid.appendChild(box);
    });
    pileWrap.appendChild(pileGrid);
    viewEl.appendChild(pileWrap);

    // 已选区 + 合计
    var selWrap = M.makeEl('div', 'sel-wrap');
    selWrap.appendChild(M.makeEl('div', 'section-label', '已选（点击放回）'));
    var selGrid = M.makeEl('div', 'pile-grid');
    selGrid.id = 'sel-grid';
    selWrap.appendChild(selGrid);
    var total = M.makeEl('div', 'total-line');
    total.id = 'total-line';
    total.textContent = '已选合计：' + fmtMoney(0);
    selWrap.appendChild(total);
    viewEl.appendChild(selWrap);

    var chk = M.makeEl('button', 'btn btn-primary btn-check', '检查');
    chk.addEventListener('click', checkCompose);
    viewEl.appendChild(chk);
    addFeedback();
  }
  function selectCoin(id) {
    if (state.answered || state.over) { return; }
    var cs = composeState;
    if (cs.selected.length >= 8) { return; } // 上限防误点
    for (var i = 0; i < cs.pile.length; i++) {
      if (cs.pile[i].id === id && !cs.pile[i].used) {
        cs.pile[i].used = true;
        cs.selected.push({ id: id, val: cs.pile[i].val });
        cs.sum += cs.pile[i].val;
        break;
      }
    }
    renderComposeState();
  }
  function unselectCoin(id) {
    if (state.answered || state.over) { return; }
    var cs = composeState;
    for (var i = 0; i < cs.selected.length; i++) {
      if (cs.selected[i].id === id) {
        cs.sum -= cs.selected[i].val;
        cs.selected.splice(i, 1);
        break;
      }
    }
    for (var j = 0; j < cs.pile.length; j++) {
      if (cs.pile[j].id === id) { cs.pile[j].used = false; }
    }
    renderComposeState();
  }
  function renderComposeState() {
    var cs = composeState;
    // 钱堆再渲染（used 置灰）
    var pileGrid = document.getElementById('pile-grid');
    M.clearNode(pileGrid);
    cs.pile.forEach(function (p) {
      var box = M.makeEl('div', 'pile-cell');
      var btn = M.makeEl('button', p.used ? 'pile-btn used' : 'pile-btn', '');
      btn.dataset.id = p.id;
      btn.innerHTML = M.renderMoney(p.val);
      if (!p.used) { btn.addEventListener('click', function () { selectCoin(p.id); }); }
      box.appendChild(btn);
      pileGrid.appendChild(box);
    });
    // 已选区渲染
    var selGrid = document.getElementById('sel-grid');
    M.clearNode(selGrid);
    cs.selected.forEach(function (s) {
      var box = M.makeEl('div', 'pile-cell');
      var btn = M.makeEl('button', 'pile-btn sel', '');
      btn.dataset.id = s.id;
      btn.innerHTML = M.renderMoney(s.val);
      btn.addEventListener('click', function () { unselectCoin(s.id); });
      box.appendChild(btn);
      selGrid.appendChild(box);
    });
    // 合计
    var total = document.getElementById('total-line');
    if (total) {
      total.textContent = '已选合计：' + fmtMoney(cs.sum);
      total.className = 'total-line' + (cs.sum === cs.target ? ' ok' : '');
    }
    if (feedbackEl) { feedbackEl.textContent = ''; feedbackEl.className = 'quiz-feedback'; }
  }
  function checkCompose() {
    if (state.answered || state.over) { return; }
    var cs = composeState;
    if (cs.sum === 0) { feedbackEl.textContent = '先选一些钱币吧～'; feedbackEl.className = 'quiz-feedback hint'; return; }
    if (cs.sum === cs.target) {
      state.answered = true;
      M.store.profile.totalAnswer = (M.store.profile.totalAnswer || 0) + 1;
      answerCorrect();
      feedbackEl.textContent = '✓ 太棒了！正好' + fmtMoney(cs.target) + '！';
      feedbackEl.className = 'quiz-feedback ok';
      feedbackEl.style.color = '';
      M.saveStore();
      window.setTimeout(advance, 600);
    } else {
      cs.tried += 1;
      var diff = Math.abs(cs.sum - cs.target);
      if (cs.tried >= 3) { // 3 次后给答案（一组可凑解，学习反馈）
        state.answered = true;
        M.store.profile.totalAnswer = (M.store.profile.totalAnswer || 0) + 1;
        answerCorrect();
        renderComposeHint();
        feedbackEl.textContent = '✓ 可以这样凑：' + composeSolution(cs.target) + '（已学会）';
        feedbackEl.className = 'quiz-feedback ok';
        M.saveStore();
        window.setTimeout(advance, 1600);
      } else {
        feedbackEl.textContent = cs.sum > cs.target
          ? '多了 ' + fmtMoney(Math.abs(diff)) + '，去掉一些～（还剩 ' + (3 - cs.tried) + ' 次）'
          : '还差 ' + fmtMoney(Math.abs(diff)) + '，再选一些～（还剩 ' + (3 - cs.tried) + ' 次）';
        feedbackEl.className = 'quiz-feedback hint';
      }
    }
  }
  function renderComposeHint() {
    // 把已选全放回，展示钱堆原始状态（供对照答案）
    var cs = composeState;
    for (var i = 0; i < cs.selected.length; i++) {
      for (var j = 0; j < cs.pile.length; j++) {
        if (cs.pile[j].id === cs.selected[i].id) { cs.pile[j].used = false; }
      }
    }
    cs.selected = [];
    cs.sum = 0;
    renderComposeState();
  }
  function composeSolution(target) {
    // 贪心求一组解（从小面额补齐）
    var used = [], rest = target;
    var order = [10, 10, 10, 5, 5, 1, 1, 1, 1, 1];
    for (var i = 0; i < order.length; i++) {
      if (rest >= order[i]) { used.push(order[i]); rest -= order[i]; }
    }
    if (rest > 0) { used.push(rest); }
    var names = used.map(fmtMoney);
    // 合并同类项
    var map = {};
    used.forEach(function (v) { map[v] = (map[v] || 0) + 1; });
    var parts = [];
    Object.keys(map).forEach(function (v) {
      parts.push((map[v] > 1 ? map[v] + ' 个 ' : '') + fmtMoney(parseInt(v, 10)));
    });
    return parts.join(' + ');
  }

  /* ---------- F4 找一找：付钱找零 4 选 1 ---------- */
  var qChange = null;
  function renderChange(q) {
    qChange = q;
    var card = M.makeEl('div', 'quiz-card');
    card.appendChild(M.makeEl('div', 'set-target-num', q.goods.emoji + ' ' + fmtMoney(q.price)));
    card.appendChild(M.makeEl('div', 'set-target-cn',
      '买' + q.goods.name + '付了 ' + fmtMoney(q.paid) + '，应找回多少？'));
    viewEl.appendChild(card);
    var grid = M.makeEl('div', 'opt-grid');
    q.opts.forEach(function (o) {
      var box = M.makeEl('div');
      var btn = M.makeEl('button', 'opt-btn' + (o === q.answer ? '' : ''), o);
      btn.addEventListener('click', function () {
        if (state.answered) { return; }
        state.answered = true;
        M.store.profile.totalAnswer = (M.store.profile.totalAnswer || 0) + 1;
        if (o === q.answer) {
          answerCorrect();
          btn.className = 'opt-btn ok';
          feedbackEl.textContent = '✓ 答对了！找零 ' + q.answer;
          feedbackEl.className = 'quiz-feedback ok';
          M.saveStore();
          window.setTimeout(advance, 600);
        } else {
          btn.className = 'opt-btn bad';
          markOkBtn(q.answer);
          feedbackEl.textContent = '✗ 应找回：' + q.answer;
          feedbackEl.className = 'quiz-feedback bad';
          M.saveStore();
          window.setTimeout(advance, 1400);
        }
      });
      box.appendChild(btn);
      grid.appendChild(box);
    });
    viewEl.appendChild(grid);
    addFeedback();
  }

  function advance() {
    state.idx += 1;
    state.answered = false;
    if (state.idx >= state.quiz.length) { finishQuiz(); }
    else { renderQuiz(); }
  }

  /* ---------- 结算（F5 打卡/星星/解锁、F6 成绩滚动 30 条） ---------- */
  function finishQuiz() {
    state.over = true;
    var total = state.quiz.length;
    var rate = Math.round(state.correct / total * 100);
    var t = M.todayStr();
    var dates = M.store.checkin.dates;
    if (dates[dates.length - 1] !== t) { dates.push(t); }
    while (dates.length > 365) { dates.shift(); }
    M.store.checkin.streak = M.calcStreak(dates);

    var stars = rate >= 100 ? 3 : rate >= 80 ? 2 : rate >= 60 ? 1 : 0;
    var oldStars = M.store.profile.stageStars[state.stage] || 0;
    if (stars > oldStars) { M.store.profile.stageStars[state.stage] = stars; }

    var unlocked = false;
    if (rate >= 80 && state.stage < 3 && (M.store.unlockedStage || 1) < state.stage + 1) {
      M.store.unlockedStage = state.stage + 1;
      unlocked = true;
    }

    M.store.history.push({ date: t, stage: state.stage, rate: rate,
                           count: total, correct: state.correct, stars: stars });
    while (M.store.history.length > 30) { M.store.history.shift(); }
    M.saveStore();
    renderResult(rate, total, stars, unlocked);
  }

  function renderResult(rate, total, stars, unlocked) {
    M.renderHeader('练习结果', M.backFromQuiz);
    M.clearNode(viewEl);
    viewEl.className = 'view';
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
    stats.appendChild(mkStat('答对', state.correct + '/' + total));
    stats.appendChild(mkStat('阶段', STAGES[state.stage - 1].name));
    stats.appendChild(mkStat('打卡', (M.store.checkin.streak || 0) + '天'));
    card.appendChild(stats);
    var banner;
    if (unlocked) {
      banner = M.makeEl('div', 'result-banner ok',
        '🎉 过关！已解锁「' + STAGES[state.stage].name + '」阶段');
    } else if (rate >= 80) {
      banner = M.makeEl('div', 'result-banner ok', '✓ 过关（≥80%）');
    } else {
      banner = M.makeEl('div', 'result-banner bad',
        '再练一次 · 达到 80% 解锁下一阶段');
    }
    card.appendChild(banner);
    viewEl.appendChild(card);

    var row = M.makeEl('div', 'btn-row');
    var again = M.makeEl('button', 'btn', '再来一组');
    again.addEventListener('click', function () { startQuiz(state.stage); });
    var back = M.makeEl('button', 'btn btn-primary', '返回阶段选择');
    back.addEventListener('click', function () { M.backFromQuiz(); });
    row.appendChild(again);
    row.appendChild(back);
    viewEl.appendChild(row);
  }
})();