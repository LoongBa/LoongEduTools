/* ============================================================
   旋转拼图 — main.js（益智·空间感知，A2）
   ------------------------------------------------------------
   玩法：正方形场景切成 N×N 碎片，碎片位置正确但方向被旋转
   （0°/90°/180°/270°），点选碎片使其旋转到正确方向（每次点转 90°）。
   全部碎片归正 = 完成。有标准答案（每碎片唯一正确方向）。
   - 三档难度：2×2（4 块）/ 3×3（9 块）/ 4×4（16 块）
   - 判定：碎片角度归 0（或 360 倍数）= 正确；参考缩略图辅助
   - 结算：步数（旋转次数）+ 用时 → 星级；打卡 + best/recent + 家长面板
   - 数据：window.APP_DATA（data.js）+ window.SCENES（scenes.js）
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
  LX_SHARED.storage.configure({ toolName: 'xuanzhuanpintu' });  // 键前缀 redtools.xuanzhuanpintu.v1
  var DEFAULT_STORE = {
    version: 1,
    best: { easy: null, normal: null, hard: null },   // { stars, moves, ms }
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
    easy:   { key: 'easy',   label: '简单', n: 2, rotN: 1 },   // 2×2，只转 1 块方向错乱
    normal: { key: 'normal', label: '普通', n: 3, rotN: 2 },   // 3×3，2 块方向错乱
    hard:   { key: 'hard',   label: '困难', n: 4, rotN: 4 }    // 4×4，4 块方向错乱
  };
  var LEVEL_ORDER = ['easy', 'normal', 'hard'];
  var ROT_STEP = 90;

  /* ---------- 状态 ---------- */
  var state = {
    level: 'easy',
    scene: null,
    sceneHtml: '',
    pieces: [],        // { id, row, col, rot }  rot ∈ {0,90,180,270}
    wrongN: 0,         // 错乱碎片数（初始）
    moves: 0,          // 旋转步数
    startMs: 0,
    elapsed: 0,
    timerId: null,
    finished: false
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
    var name = APP.meta && APP.meta.name ? APP.meta.name : '旋转拼图';
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
    wrap.appendChild(makeEl('h1', 'home-title', '🧩 旋转拼图'));
    wrap.appendChild(makeEl('p', 'home-sub', '碎片方向被转乱了，点一点把它转回正确方向！'));

    LEVEL_ORDER.forEach(function (k) {
      var lv = LEVELS[k];
      var card = makeEl('button', 'level-card');
      var best = store.best[k];
      var bestTxt = best ? '最佳 ' + best.stars + '★ · ' + best.moves + ' 步' : '未挑战';
      card.appendChild(makeEl('div', 'level-name', lv.label + ' · ' + lv.n + '×' + lv.n));
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
      wrap.appendChild(makeEl('div', 'parent-row', lv.label + '（' + lv.n + '×' + lv.n + '）：' + (b ? b.stars + '★ / ' + b.moves + ' 步 / ' + fmtMs(b.ms) : '未挑战')));
    });
    var hist = store.history.slice(-10).reverse();
    if (hist.length) {
      wrap.appendChild(makeEl('h3', 'parent-sub', '最近记录'));
      hist.forEach(function (h) {
        wrap.appendChild(makeEl('div', 'parent-row small', h.date + ' · ' + (LEVELS[h.level] ? LEVELS[h.level].label : h.level) + ' · ' + h.stars + '★ · ' + h.moves + ' 步'));
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

  /* ---------- 场景 ---------- */
  function elementSvg(e) {
    var inner = e.draw({ fill: e.fill, variant: 0 });
    var tx = 'translate(' + e.x + ',' + e.y + ')';
    if (e.s && e.s !== 1) { tx += ' scale(' + e.s + ')'; }
    return '<g transform="' + tx + '">' + inner + '</g>';
  }
  function sceneContent(scene) {
    var parts = [scene.bg];
    scene.elements.forEach(function (e) { parts.push(elementSvg(e)); });
    return parts.join('');
  }

  /* ---------- 出题 ---------- */
  function buildPieces(n, rotN) {
    var pieces = [];
    var id = 0;
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        pieces.push({ id: id, row: r, col: c, rot: 0 });
        id += 1;
      }
    }
    // 随机选 rotN 块转乱方向（0°/90°/180°/270°，排除 0）
    var idxs = shuffle(pieces.map(function (_, i) { return i; })).slice(0, Math.min(rotN, pieces.length));
    idxs.forEach(function (i) {
      pieces[i].rot = pickRand([90, 180, 270]);
    });
    return pieces;
  }

  /* 碎片 SVG：viewBox 取正确位置区域，内层 g 按 rot 旋转显示 */
  function pieceSvg(p) {
    var n = LEVELS[state.level].n;
    var size = state.scene.w / n;
    var x = (p.col * size).toFixed(2);
    var y = (p.row * size).toFixed(2);
    var wh = size.toFixed(2);
    // 旋转中心 = 碎片中心（视口坐标）
    var cx = (p.col * size + size / 2).toFixed(2);
    var cy = (p.row * size + size / 2).toFixed(2);
    var inner = state.sceneHtml;
    if (p.rot) {
      inner = '<g transform="rotate(' + p.rot + ' ' + cx + ' ' + cy + ')">' + state.sceneHtml + '</g>';
    }
    return '<svg class="piece-svg" viewBox="' + x + ' ' + y + ' ' + wh + ' ' + wh +
      '" xmlns="http://www.w3.org/2000/svg" data-id="' + p.id + '" data-rot="' + p.rot + '">' + inner + '</svg>';
  }

  /* 参考缩略图（完整场景） */
  function refSvg() {
    return '<svg class="ref-svg" viewBox="0 0 ' + state.scene.w + ' ' + state.scene.h +
      '" xmlns="http://www.w3.org/2000/svg">' + state.sceneHtml + '</svg>';
  }

  /* ---------- 视图：练习页 ---------- */
  function startGame(level) {
    if (!SCENES.length) {
      viewEl.textContent = '场景库缺失，请检查 scenes.js';
      return;
    }
    state.level = level;
    state.scene = pickRand(SCENES);
    state.sceneHtml = sceneContent(state.scene);
    var lv = LEVELS[level];
    state.pieces = buildPieces(lv.n, lv.rotN);
    state.wrongN = lv.rotN;
    state.moves = 0;
    state.startMs = Date.now();
    state.elapsed = 0;
    state.finished = false;
    state.timerId = null;
    renderGame();
    startTimer();
  }

  function renderGame() {
    renderHeader();
    clearNode(viewEl);
    var wrap = makeEl('div', 'game-wrap');
    // 顶部：返回 | 难度 | 计时 | 步数
    var top = makeEl('div', 'game-top');
    var back = makeEl('button', 'game-back', '‹ 返回');
    back.addEventListener('click', function () { viewHome(); });
    top.appendChild(back);
    var lvEl = makeEl('div', 'game-prog', LEVELS[state.level].label + ' · ' + LEVELS[state.level].n + '×' + LEVELS[state.level].n);
    top.appendChild(lvEl);
    var timerEl = makeEl('div', 'game-timer', '⏱ 00.0');
    timerEl.id = 'game-timer';
    top.appendChild(timerEl);
    var moveEl = makeEl('div', 'game-moves', '步数 0');
    moveEl.id = 'game-moves';
    top.appendChild(moveEl);
    wrap.appendChild(top);

    // 参考图（点击展开）
    var refBtn = makeEl('button', 'ref-btn', '🖼 看原图');
    refBtn.addEventListener('click', function () { toggleRef(); });
    wrap.appendChild(refBtn);
    var refBox = makeEl('div', 'ref-box', '');
    refBox.id = 'ref-box';
    refBox.style.display = 'none';
    refBox.innerHTML = refSvg();
    wrap.appendChild(refBox);

    // 拼图区
    var board = makeEl('div', 'board');
    board.id = 'board';
    var n = LEVELS[state.level].n;
    var pw = (100 / n).toFixed(4) + '%';
    var piecesHtml = '';
    state.pieces.forEach(function (p) { piecesHtml += pieceSvg(p); });
    board.innerHTML = piecesHtml;
    // 碎片宽度按难度：2×2→50% / 3×3→33.33% / 4×4→25%
    var svgs = board.querySelectorAll('.piece-svg');
    for (var i = 0; i < svgs.length; i++) {
      svgs[i].style.width = pw;
    }
    wrap.appendChild(board);

    var fb = makeEl('div', 'game-feedback', '点碎片转方向，全部转正就完成！');
    fb.id = 'game-feedback';
    wrap.appendChild(fb);

    viewEl.appendChild(wrap);
    renderFooter('');
    bindBoard();
  }

  function bindBoard() {
    var svgs = viewEl.querySelectorAll('#board .piece-svg');
    for (var i = 0; i < svgs.length; i++) {
      svgs[i].addEventListener('click', onPieceTap);
    }
  }

  function onPieceTap(ev) {
    var svg = ev.currentTarget;
    var id = parseInt(svg.getAttribute('data-id'), 10);
    var p = state.pieces[id];
    if (!p || state.finished) { return; }
    // 旋转 +90°
    p.rot = (p.rot + ROT_STEP) % 360;
    state.moves += 1;
    var moveEl = document.getElementById('game-moves');
    if (moveEl) { moveEl.textContent = '步数 ' + state.moves; }
    // 重渲染该碎片
    var box = document.getElementById('board');
    var n = LEVELS[state.level].n;
    var pw = (100 / n).toFixed(4) + '%';
    var piecesHtml = '';
    state.pieces.forEach(function (pp) { piecesHtml += pieceSvg(pp); });
    box.innerHTML = piecesHtml;
    var svgs = box.querySelectorAll('.piece-svg');
    for (var i = 0; i < svgs.length; i++) {
      svgs[i].style.width = pw;
    }
    bindBoard();
    // 音效反馈（无音频：视觉脉冲类）
    // 判定
    if (isSolved()) {
      finishGame();
    }
  }

  function isSolved() {
    for (var i = 0; i < state.pieces.length; i++) {
      if (state.pieces[i].rot % 360 !== 0) { return false; }
    }
    return true;
  }

  function toggleRef() {
    var box = document.getElementById('ref-box');
    if (box) { box.style.display = box.style.display === 'none' ? 'block' : 'none'; }
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
    // 星级：按步数效率（≤ 错乱块数×2 = 3★；≤ 错乱块数×4 = 2★；其余 1★）
    var ideal = state.wrongN * 1; // 每块最少 1 次
    var stars = state.moves <= ideal ? 3 : (state.moves <= ideal * 2 ? 2 : 1);
    var lv = state.level;
    var rec = { date: todayStr(), level: lv, stars: stars, moves: state.moves, ms: state.elapsed };
    var prev = store.best[lv];
    if (!prev || stars > prev.stars || (stars === prev.stars && state.moves < prev.moves)) {
      store.best[lv] = { stars: stars, moves: state.moves, ms: state.elapsed };
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
    wrap.appendChild(makeEl('div', 'result-row', '旋转 ' + rec.moves + ' 次'));
    wrap.appendChild(makeEl('div', 'result-row', '用时 ' + fmtMs(rec.ms)));
    var best = store.best[rec.level];
    if (best) {
      wrap.appendChild(makeEl('div', 'result-best', '最佳 ' + best.stars + '★ · ' + best.moves + ' 步'));
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
