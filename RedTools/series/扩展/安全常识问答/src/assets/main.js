/* ============================================================
   安全常识问答 — main.js（扩展系列，A3）
   ------------------------------------------------------------
   玩法：情景选择题——每轮 1 题（防溺水/交通/用电/防拐/饮食/消防等），
   4 选 1 点选正确答案，即时反馈 + 安全知识解释。10 题一轮。
   - 题库：程序化内嵌（6 情景 × 6 题 = 36 题，emoji 图标零素材）
   - 判定：有标准答案（单选唯一正确）
   - 结算：答对数 → 星级（≥9 对 3★ / ≥7 对 2★ / 其余 1★）+ 计时 + 打卡 + best
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
  LX_SHARED.storage.configure({ toolName: 'anquanchangshi' });  // 键前缀 redtools.anquanchangshi.v1
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

  /* ---------- 难度档（轮数 = 题量） ---------- */
  var LEVELS = {
    easy:   { key: 'easy',   label: '入门', rounds: 6 },
    normal: { key: 'normal', label: '进阶', rounds: 8 },
    hard:   { key: 'hard',   label: '挑战', rounds: 10 }
  };
  var LEVEL_ORDER = ['easy', 'normal', 'hard'];

  /* ---------- 安全常识题库（6 情景 × 6 题 = 36 题） ----------
     每题：{ q: 题干, opts: [4 选项], ans: 正确下标, exp: 知识解释, icon: emoji } */
  var QUIZ = [
    /* ---- 交通安全 ---- */
    { q: '过马路时，应该怎么做？', opts: ['直接跑过去', '看红绿灯，绿灯走斑马线', '跟小伙伴打闹着走', '闭眼冲过去'], ans: 1, exp: '过马路要看红绿灯，绿灯亮了走斑马线，还要左右看看。', icon: '🚦' },
    { q: '坐车时，儿童应该坐在哪里？', opts: ['副驾驶座', '大人腿上', '后排安全座椅', '后备箱'], ans: 2, exp: '儿童坐车要坐后排安全座椅，系好安全带。', icon: '🚗' },
    { q: '红灯亮了，应该怎么做？', opts: ['继续往前走', '停下等待绿灯', '快点跑过去', '跟着别人走'], ans: 1, exp: '红灯停、绿灯行、黄灯等一等。', icon: '🔴' },
    { q: '在马路上玩耍对吗？', opts: ['对，很好玩', '不对，很危险', '偶尔可以', '有人看着就行'], ans: 1, exp: '马路是车辆通行的地方，不能在马路上玩耍。', icon: '🚸' },
    { q: '骑自行车或滑板时，应该？', opts: ['不戴任何护具', '戴头盔', '单手骑', '在车流中穿行'], ans: 1, exp: '骑车要戴好头盔，在安全的场地或专用道骑行。', icon: '🚴' },
    { q: '看到车来了，应该？', opts: ['和车比谁快', '站在马路中间', '靠边停下等车过去', '伸手拦车'], ans: 2, exp: '看到车来要靠边停下，等车过去再走。', icon: '🚙' },
    /* ---- 防溺水 ---- */
    { q: '小朋友可以去河边、池塘玩水吗？', opts: ['可以，很好玩', '不可以，要大人陪同', '偷偷去就行', '只要会游泳就行'], ans: 1, exp: '小朋友不能独自去河边池塘，玩水要有大人陪同。', icon: '🌊' },
    { q: '看到有人落水，应该怎么做？', opts: ['跳下去救', '大声呼救找大人', '假装没看见', '用手去拉'], ans: 1, exp: '自己不会游泳不能下水救人，要大声呼救找大人帮忙。', icon: '🆘' },
    { q: '游泳时腿抽筋了，应该？', opts: ['慌乱挣扎', '保持冷静，呼救或放松', '拼命蹬水', '憋气不管'], ans: 1, exp: '抽筋时保持冷静，大声呼救，尽量放松身体。', icon: '🏊' },
    { q: '没有大人陪同，可以自己去海边吗？', opts: ['可以', '不可以', '只要带泳圈就行', '太阳大就可以去'], ans: 1, exp: '去海边游泳一定要有大人陪同，不能独自下水。', icon: '🏖️' },
    { q: '坐船时要怎么做？', opts: ['站起来走动', '穿上救生衣坐好', '把身子探出船外', '在船上跑跳'], ans: 1, exp: '坐船要穿好救生衣，坐好不乱动。', icon: '⛵' },
    { q: '掉进水里了，应该？', opts: ['张嘴大喊', '尽量仰浮、踢腿向岸边或呼救', '闭眼下沉', '抓旁边的任何东西'], ans: 1, exp: '落水要尽量放松仰浮，保存体力呼救。', icon: '🫧' },
    /* ---- 用电安全 ---- */
    { q: '湿手可以摸插座吗？', opts: ['可以', '不可以，会触电', '擦擦手就行', '只要小心就行'], ans: 1, exp: '湿手摸电器插座容易触电，一定要把手擦干。', icon: '⚡' },
    { q: '看到裸露的电线，应该？', opts: ['用手摸一摸', '告诉大人，不要碰', '用脚踢', '拿棍子碰'], ans: 1, exp: '裸露电线很危险，不要碰，马上告诉大人。', icon: '🔌' },
    { q: '可以把东西插进插座孔里吗？', opts: ['可以，很好玩', '不可以，很危险', '用铅笔试试', '用小刀试试'], ans: 1, exp: '不能用东西去戳插座孔，会触电。', icon: '⚠️' },
    { q: '雷雨天在户外，应该？', opts: ['在大树下躲雨', '躲进屋里或车里', '站在空旷处', '在水里玩'], ans: 1, exp: '雷雨天要躲进屋里，不能在大树下或空旷处。', icon: '⛈️' },
    { q: '电器着火了，应该？', opts: ['用水泼', '先断电，再呼救', '用手去拔', '用嘴吹'], ans: 1, exp: '电器着火要先断电，再呼救找大人，不能用水泼。', icon: '🔥' },
    { q: '插拔插头时应该？', opts: ['拉电线拔', '捏住插头拔', '用牙咬', '用力甩'], ans: 1, exp: '拔插头要捏住插头部分，不能拉电线。', icon: '🔋' },
    /* ---- 防拐骗 ---- */
    { q: '陌生人给你好吃的，要你跟他走，应该？', opts: ['跟着走', '拒绝并离开，告诉大人', '吃一点再说', '拿回家吃'], ans: 1, exp: '陌生人给东西不能要，更不能跟他走，要远离并告诉大人。', icon: '🍭' },
    { q: '陌生人说是爸爸妈妈的朋友，要接你回家，应该？', opts: ['相信他', '不跟走，打电话确认', '跟着走', '让他抱'], ans: 1, exp: '不能跟陌生人走，要先打电话和爸爸妈妈确认。', icon: '📞' },
    { q: '一个人在家，有人敲门，应该？', opts: ['直接开门', '不开门，问清是谁', '告诉他家里没人', '搬凳子看猫眼'], ans: 1, exp: '一个人在家有人敲门不要开门，先问是谁，不认识就不开。', icon: '🚪' },
    { q: '走丢了应该怎么办？', opts: ['到处乱跑', '找警察或商场工作人员', '跟陌生人走', '站在原地大哭'], ans: 1, exp: '走丢要找警察或穿制服的工作人员帮忙。', icon: '👮' },
    { q: '陌生人问你家的住址和电话，应该？', opts: ['告诉他', '不告诉陌生人', '写在纸上给他', '打电话给他'], ans: 1, exp: '家庭住址和电话不能告诉陌生人。', icon: '🏠' },
    { q: '陌生人要带你去偏僻的地方，应该？', opts: ['跟着走', '大声说不，跑开找大人', '慢慢跟他走', '看他要干嘛'], ans: 1, exp: '陌生人要带你去偏僻地方要大声拒绝，跑开找大人。', icon: '🏃' },
    /* ---- 饮食安全 ---- */
    { q: '可以吃路边捡来的野果子吗？', opts: ['可以，甜的', '不可以，可能有毒', '尝尝一点', '洗干净就能吃'], ans: 1, exp: '野果子可能有毒，不能随便吃。', icon: '🍎' },
    { q: '吃食物前应该先做什么？', opts: ['直接吃', '洗手', '拍一拍', '吹一吹'], ans: 1, exp: '吃东西前要洗手，把手洗干净。', icon: '🧼' },
    { q: '过期的东西还能吃吗？', opts: ['可以', '不能吃', '闻着没味就能吃', '放冰箱就能吃'], ans: 1, exp: '过期的食物不能吃，会吃坏肚子。', icon: '📅' },
    { q: '吃饭时应该？', opts: ['边跑边吃', '坐好慢慢吃', '边玩边吃', '大口塞着吃'], ans: 1, exp: '吃饭要坐好慢慢吃，边跑边吃容易呛到。', icon: '🍽️' },
    { q: '不认识的东西可以放进嘴里吗？', opts: ['可以试试', '不可以', '小颗的可以', '味道香就可以'], ans: 1, exp: '不认识的东西不能放进嘴里，可能有害。', icon: '❓' },
    { q: '热水壶/热汤要小心，因为？', opts: ['会烫伤', '会变凉', '很好喝', '会发光'], ans: 0, exp: '热水和热汤会烫伤皮肤，要小心不要碰倒。', icon: '☕' },
    /* ---- 消防安全 ---- */
    { q: '着火了，应该拨打什么电话？', opts: ['110', '119', '120', '122'], ans: 1, exp: '火警电话是 119。', icon: '🚒' },
    { q: '遇到火灾，应该？', opts: ['躲进衣柜', '用湿毛巾捂住口鼻，弯腰逃生', '坐电梯下楼', '站着看热闹'], ans: 1, exp: '火灾要用湿毛巾捂口鼻，弯腰走安全通道，不能坐电梯。', icon: '🏃‍♀️' },
    { q: '可以玩打火机或火柴吗？', opts: ['可以', '不可以，会引发火灾', '在空地上可以', '大人不在时可以'], ans: 1, exp: '打火机和火柴不能玩，容易引发火灾。', icon: '🕯️' },
    { q: '着火了身上的衣服也烧着了，应该？', opts: ['跑着喊', '就地打滚压灭火', '用手拍', '跳进水池'], ans: 1, exp: '衣服着火要就地打滚，压灭火焰。', icon: '🔄' },
    { q: '闻到家中有煤气味，应该？', opts: ['开灯看看', '先开窗通风，不开火', '点个打火机看看', '继续做饭'], ans: 1, exp: '闻到煤气味要马上开窗通风，不能开灯或开火。', icon: '💨' },
    { q: '楼道里着火了，应该？', opts: ['冲下楼', '关门堵缝，从窗户呼救', '开门看看', '乘电梯'], ans: 1, exp: '楼道着火不能冲下楼，要关门堵缝等待救援。', icon: '🧯' }
  ];

  /* ---------- 状态 ---------- */
  var state = {
    level: 'easy',
    rounds: 6,
    quiz: [],       // 本题库乱序后取前 rounds 题
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
    var name = APP.meta && APP.meta.name ? APP.meta.name : '安全常识问答';
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
    wrap.appendChild(makeEl('h1', 'home-title', '🛡️ 安全常识问答'));
    wrap.appendChild(makeEl('p', 'home-sub', '情景选择题，学会保护自己！'));

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
    state.quiz = shuffle(QUIZ).slice(0, state.rounds);
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
    // 顶部：返回 | 进度 | 计时
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

    // 题干
    var qEl = makeEl('div', 'question', (q.icon ? q.icon + ' ' : '') + q.q);
    wrap.appendChild(qEl);

    // 选项
    var optBox = makeEl('div', 'options');
    optBox.id = 'options';
    q.opts.forEach(function (txt, i) {
      var btn = makeEl('button', 'option', '');
      var idxEl = makeEl('span', 'option-idx', String.fromCharCode(65 + i)); // A B C D
      btn.appendChild(idxEl);
      btn.appendChild(makeEl('span', 'option-txt', txt));
      btn.setAttribute('data-opt', i);
      btn.addEventListener('click', function () { onAnswer(i, btn); });
      optBox.appendChild(btn);
    });
    wrap.appendChild(optBox);

    // 反馈区
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
    // 高亮所有选项状态
    for (var k = 0; k < opts.length; k++) {
      if (k === q.ans) { opts[k].classList.add('correct'); }
      else { opts[k].classList.add('dim'); }
    }
    if (i === q.ans) {
      fb.className = 'answer-feedback ok';
      fb.textContent = '✓ 答对啦！' + q.exp;
    } else {
      state.wrong += 1;
      fb.className = 'answer-feedback miss';
      fb.textContent = '✗ 正确答案：' + q.opts[q.ans] + '。' + q.exp;
    }
    // 下一题（2s 后）
    setTimeout(function () { nextQuestion(); }, 2200);
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
    renderResult(stars, rec, correct);
  }

  function renderResult(stars, rec, correct) {
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
