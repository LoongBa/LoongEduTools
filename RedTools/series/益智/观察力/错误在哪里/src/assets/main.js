/* ============================================================
   错误在哪里 — main.js（益智·观察力，A1）
   ------------------------------------------------------------
   玩法：显示一幅场景图，图中故意嵌入 1 个「不合逻辑」的元素
   （如海边出现兔子、森林出现章鱼），孩子点选异常元素即答对。
   - 三档难度 = 轮数：简单 5 关 / 普通 6 关 / 困难 8 关
   - 判定：点错位元素 = 正确（绿闪 + ✓ + 下一关）；点正常元素 = 错点计数（红闪）
   - 结算：星级（0 错 3★ / ≤2 错 2★ / 其余 1★）+ 计时 + 打卡 + best/recent
   - 数据：window.APP_DATA（data.js）+ window.SCENES / WRONG_OPTIONS（scenes.js）
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
  LX_SHARED.storage.configure({ toolName: 'cuowu' });  // 键前缀 redtools.cuowu.v1
  var DEFAULT_STORE = {
    version: 1,
    best: { easy: null, normal: null, hard: null },   // { stars, errors, ms }
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
    easy:   { key: 'easy',   label: '简单', rounds: 5 },
    normal: { key: 'normal', label: '普通', rounds: 6 },
    hard:   { key: 'hard',   label: '困难', rounds: 8 }
  };
  var LEVEL_ORDER = ['easy', 'normal', 'hard'];

  /* ---------- 状态 ---------- */
  var state = {
    level: 'easy',
    rounds: 5,
    roundIdx: 0,
    scene: null,
    wrong: null,        // 本关错位元素 { scene, elem, x, y, hint, label }
    errors: 0,
    started: false,
    finished: false,
    startMs: 0,
    elapsed: 0,
    timerId: null
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
  function pickRand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function fmtMs(ms) {
    var s = ms / 1000;
    return (s < 10 ? '0' : '') + s.toFixed(1);
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
    var name = APP.meta && APP.meta.name ? APP.meta.name : '错误在哪里';
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
    wrap.appendChild(makeEl('h1', 'home-title', '👀 错误在哪里'));
    wrap.appendChild(makeEl('p', 'home-sub', '找出场景里不对劲的地方，点一点它！'));

    LEVEL_ORDER.forEach(function (k) {
      var lv = LEVELS[k];
      var card = makeEl('button', 'level-card');
      var best = store.best[k];
      var bestTxt = best ? '最佳 ' + best.stars + '★ · ' + best.errors + ' 错' : '未挑战';
      card.appendChild(makeEl('div', 'level-name', lv.label + ' · ' + lv.rounds + ' 关'));
      card.appendChild(makeEl('div', 'level-best', bestTxt));
      card.addEventListener('click', function () { startGame(k); });
      wrap.appendChild(card);
    });

    // 打卡
    var checkinBtn = makeEl('button', 'btn btn-checkin', store.checkin.dates.indexOf(todayStr()) >= 0 ? '✅ 今日已打卡' : '📅 今日打卡');
    checkinBtn.addEventListener('click', function () { doCheckin(checkinBtn); });
    wrap.appendChild(checkinBtn);

    // 家长面板（隐藏入口，F7）
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

  /* ---------- 视图：家长面板 ---------- */
  function viewParent() {
    stopTimer();
    renderHeader();
    clearNode(viewEl);
    var wrap = makeEl('div', 'parent-wrap');
    wrap.appendChild(makeEl('h2', 'parent-title', '家长面板'));
    var totalDays = store.checkin.dates.length;
    wrap.appendChild(makeEl('p', 'parent-row', '累计打卡 ' + totalDays + ' 天 · 连续 ' + store.checkin.streak + ' 天'));
    LEVEL_ORDER.forEach(function (k) {
      var lv = LEVELS[k];
      var b = store.best[k];
      var row = makeEl('div', 'parent-row', lv.label + '：' + (b ? b.stars + '★ / ' + b.errors + ' 错 / ' + fmtMs(b.ms) : '未挑战'));
      wrap.appendChild(row);
    });
    // 历史记录（近 10 条）
    var hist = store.history.slice(-10).reverse();
    if (hist.length) {
      wrap.appendChild(makeEl('h3', 'parent-sub', '最近记录'));
      hist.forEach(function (h) {
        wrap.appendChild(makeEl('div', 'parent-row small', h.date + ' · ' + (LEVELS[h.level] ? LEVELS[h.level].label : h.level) + ' · ' + h.stars + '★ · ' + h.errors + ' 错'));
      });
    }
    var back = makeEl('button', 'btn', '‹ 返回');
    back.addEventListener('click', function () { viewHome(); });
    wrap.appendChild(back);
    // 清除数据
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

  /* ---------- 出题：生成一关 ---------- */
  function buildRound() {
    var scene = pickRand(SCENES);
    var opts = WRONG_OPTIONS[scene.id] || [];
    if (!opts.length) {
      // 兜底：无错位表时用另一场景首个元素
      var other = SCENES.filter(function (s) { return s.id !== scene.id; })[0];
      var oe = other.elements[0];
      return { scene: scene, wrong: { scene: other.id, elem: oe.id, x: 180, y: 200, hint: '这里不对劲哦' } };
    }
    var w = pickRand(opts);
    // 兼容错位表结构（x/y 可选，缺省随机落点）
    var wx = w.x !== undefined ? w.x : 60 + Math.random() * (scene.w - 120);
    var wy = w.y !== undefined ? w.y : 60 + Math.random() * (scene.h - 120);
    return { scene: scene, wrong: { scene: w.srcScene, elem: w.elemId, hint: w.hint || '这里不对劲哦', x: wx, y: wy } };
  }

  /* ---------- 渲染：一关场景 ---------- */
  function renderSceneSvg() {
    var scene = state.scene;
    var wrong = state.wrong;
    var parts = ['<svg id="scene-svg" class="scene-svg" viewBox="0 0 ' + scene.w + ' ' + scene.h +
      '" xmlns="http://www.w3.org/2000/svg">'];
    parts.push(scene.bg);
    // 正常元素
    scene.elements.forEach(function (e) {
      parts.push(elementSvg(e, e.x, e.y, e.s || 1, e.rot || 0, e.fill, 0));
    });
    // 错位元素（从源场景借元素渲染）
    var srcScene = SCENE_BY_NAME[wrong.scene];
    var srcElem = null;
    if (srcScene) {
      srcScene.elements.forEach(function (e) { if (e.id === wrong.elem) { srcElem = e; } });
    }
    if (!srcElem) {
      // 兜底：用本场景第一个元素改色
      srcElem = scene.elements[0];
    }
    parts.push(elementSvg(srcElem, wrong.x, wrong.y, (srcElem.s || 1) * 0.9, srcElem.rot || 0, srcElem.fill, 0, 'wrong'));
    parts.push('</svg>');
    return parts.join('');
  }

  function elementSvg(e, x, y, s, rot, fill, variant, cls) {
    var inner = e.draw({ fill: fill, variant: variant });
    var tx = 'translate(' + x + ',' + y + ')';
    if (s !== 1) { tx += ' scale(' + s + ')'; }
    if (rot) { tx += ' rotate(' + rot + ')'; }
    var hitCls = cls ? ' hit-circle ' + cls : ' hit-circle';
    return '<g data-eid="' + e.id + '" data-wrong="' + (cls ? '1' : '0') + '">' +
      '<g transform="' + tx + '" pointer-events="none">' + inner + '</g>' +
      '<circle cx="' + x + '" cy="' + y + '" r="' + (e.hitR || 26) + '"' +
      ' fill="rgba(0,0,0,0)" pointer-events="all" class="' + hitCls + '"/>' +
      '</g>';
  }

  /* ---------- 视图：练习页 ---------- */
  function startGame(level) {
    state.level = level;
    state.rounds = LEVELS[level].rounds;
    state.roundIdx = 0;
    state.errors = 0;
    state.finished = false;
    state.startMs = Date.now();
    state.timerId = null;
    state.started = false;
    // 生成第一关
    var r = buildRound();
    state.scene = r.scene;
    state.wrong = r.wrong;
    renderRound();
    startTimer();
  }

  function renderRound() {
    renderHeader();
    clearNode(viewEl);
    var wrap = makeEl('div', 'game-wrap');
    // 顶部：返回 | 进度 | 计时 | 错点
    var top = makeEl('div', 'game-top');
    var back = makeEl('button', 'game-back', '‹ 返回');
    back.addEventListener('click', function () { viewHome(); });
    top.appendChild(back);
    var prog = makeEl('div', 'game-prog', '第 ' + (state.roundIdx + 1) + ' / ' + state.rounds + ' 关');
    prog.id = 'game-prog';
    top.appendChild(prog);
    var timerEl = makeEl('div', 'game-timer', '⏱ 00.0');
    timerEl.id = 'game-timer';
    top.appendChild(timerEl);
    var errEl = makeEl('div', 'game-errors', '错点 0');
    errEl.id = 'game-errors';
    top.appendChild(errEl);
    wrap.appendChild(top);

    // 场景名 + 提示（小字，可选展开）
    var sceneName = makeEl('div', 'scene-name', state.scene.name + ' · 找找哪里不对劲');
    wrap.appendChild(sceneName);

    // 场景容器
    var svgWrap = makeEl('div', 'scene-wrap');
    svgWrap.innerHTML = renderSceneSvg();
    wrap.appendChild(svgWrap);

    // 反馈条
    var fb = makeEl('div', 'round-feedback', '');
    fb.id = 'round-feedback';
    wrap.appendChild(fb);

    viewEl.appendChild(wrap);
    renderFooter('');

    bindSceneTaps();
  }

  function bindSceneTaps() {
    var circles = viewEl.querySelectorAll('.hit-circle');
    for (var i = 0; i < circles.length; i++) {
      circles[i].addEventListener('click', onTap);
    }
  }

  function onTap(ev) {
    var g = ev.target.parentNode;
    var isWrong = g.getAttribute('data-wrong') === '1';
    var fb = document.getElementById('round-feedback');
    if (isWrong) {
      // 答对：绿闪 + ✓ + 下一关
      g.classList.add('tap-ok');
      if (fb) { fb.textContent = '✓ 答对啦！'; fb.className = 'round-feedback ok'; }
      setTimeout(function () { nextRound(); }, 650);
    } else {
      // 答错：错点计数 + 红闪
      state.errors += 1;
      var errEl = document.getElementById('game-errors');
      if (errEl) { errEl.textContent = '错点 ' + state.errors; }
      g.classList.add('tap-miss');
      if (fb) { fb.textContent = '✗ 再看看…'; fb.className = 'round-feedback miss'; }
    }
  }

  function nextRound() {
    state.roundIdx += 1;
    if (state.roundIdx >= state.rounds) {
      finishGame();
      return;
    }
    var r = buildRound();
    state.scene = r.scene;
    state.wrong = r.wrong;
    renderRound();
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
    // 星级：0 错 3★ / ≤2 错 2★ / 其余 1★
    var stars = state.errors === 0 ? 3 : (state.errors <= 2 ? 2 : 1);
    var lv = state.level;
    var rec = { date: todayStr(), level: lv, stars: stars, errors: state.errors, ms: state.elapsed };
    // 更新 best
    var prev = store.best[lv];
    if (!prev || stars > prev.stars || (stars === prev.stars && state.errors < prev.errors)) {
      store.best[lv] = { stars: stars, errors: state.errors, ms: state.elapsed };
    }
    // 更新 recent（每难度最近一次星级）
    store.recent[lv] = stars;
    // history FIFO 100
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
    wrap.appendChild(makeEl('div', 'result-row', '错点 ' + rec.errors + ' 次'));
    wrap.appendChild(makeEl('div', 'result-row', '用时 ' + fmtMs(rec.ms)));
    var best = store.best[rec.level];
    if (best) {
      wrap.appendChild(makeEl('div', 'result-best', '最佳 ' + best.stars + '★ · ' + best.errors + ' 错'));
    }
    // 打卡
    var today = todayStr();
    var checkinBtn = makeEl('button', 'btn btn-checkin', store.checkin.dates.indexOf(today) >= 0 ? '✅ 今日已打卡' : '📅 今日打卡');
    checkinBtn.addEventListener('click', function () { doCheckin(checkinBtn); });
    wrap.appendChild(checkinBtn);
    // 再练
    var again = makeEl('button', 'btn btn-primary', '再练一次');
    again.addEventListener('click', function () { startGame(rec.level); });
    wrap.appendChild(again);
    var home = makeEl('button', 'btn', '返回首页');
    home.addEventListener('click', function () { viewHome(); });
    wrap.appendChild(home);
    viewEl.appendChild(wrap);
    renderFooter('');
  }

  /* ---------- 键盘（F7 家长面板 / 返回） ---------- */
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'F7') { ev.preventDefault(); viewParent(); }
  });

  /* ---------- 启动 ---------- */
  renderHeader();
  viewHome();

  /* 导出（供调试/测试） */
  M.viewHome = viewHome;
  M.startGame = startGame;
  M.buildRound = buildRound;
  M.state = state;
  window.M = M;
})();
