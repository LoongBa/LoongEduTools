/* ============================================================
   简单拼图 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   数据：window.SCENES（scenes.js 注入，8 个正方形场景 SVG）
         window.APP_DATA（data.js 注入，build 生成 meta，可缺失）
   功能：
   - 选难度（2×2 / 3×3 / 4×4）→ 随机场景 → 切 N×N 碎片 → 洗牌打乱
   - 点选一块碎片（紫色高亮）→ 点另一块 → 交换位置（步数+1）
     → 点已选中块取消选中
   - 全部碎片归位 → 绿色闪烁 → 计时/星级/新纪录/打卡/成绩历史
   设计约束：
   - 不使用 import/export / type="module"
   - 不超出 ES2017（无 ?. ?? 对象展开等）
   - 事件全部 addEventListener，无内联事件 / eval
   - 计时用 performance.now()，interval 按差值刷新（后台回来计时仍准）
   - 碎片用 <svg viewBox> 裁剪完整场景局部：视图始终显示完整场景，
     某块显示哪个区域由其「目标行列」决定，归位即恢复完整画面
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };
  var SCENES = window.SCENES || [];

  /* ---------- DOM ---------- */
  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');

  /* ---------- 难度定义（星级阈值：3★ / 2★，其余 1★） ---------- */
  var LEVELS = {
    2: { label: '简单 · 2×2', n: 2, threeMs: 25000, twoMs: 60000 },
    3: { label: '进阶 · 3×3', n: 3, threeMs: 90000, twoMs: 180000 },
    4: { label: '挑战 · 4×4', n: 4, threeMs: 240000, twoMs: 480000 }
  };

  /* ---------- 状态 ---------- */
  var state = {
    level: 2, scene: null, sceneHtml: '', pieces: [],
    selected: -1, moves: 0,
    started: false, finished: false,
    startMs: 0, elapsed: 0, timerId: null,
    refTimer: null
  };
  /* 碎片 DOM 元素与内层 svg（按 slot 索引） */
  var pieceEls = [];
  var pieceSvgEls = [];

  /* ---------- 持久化 ---------- */
  var STORE_KEY = 'redtools.jiandanpintu.v1';
  LX_SHARED.storage.configure({ toolName: 'jiandanpintu' });  // V0.4 迁移：键前缀 redtools.jiandanpintu.v1
  function loadStore() {
    try {
      var raw = LX_SHARED.storage.get('v1');
      if (raw) { return raw; }
    } catch (err) { /* ignore */ }
    return {
      version: 1,
      best: { '2': null, '3': null, '4': null },
      recent: { '2': 0, '3': 0, '4': 0 },
      checkin: { dates: [], streak: 0 },
      history: []
    };
  }
  function saveStore() {
    try {
      LX_SHARED.storage.set('v1', store);
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
  /* 连续打卡天数：含今天往前推、跨天断（dates 升序去重） */
  function calcStreak(dates) {
    return LX_SHARED.progress.streak(dates);
}
  /* Fisher-Yates 洗牌（返回新数组） */
  function shuffle(arr) {
    var a = arr.slice();
    for (var j = a.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = a[j]; a[j] = a[k]; a[k] = t;
    }
    return a;
  }
  /* 随机取一个场景 */
  function pickRand(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /* ---------- 渲染：顶栏 ---------- */
  function renderHeader(title) {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '简单拼图';
    brand.appendChild(makeEl('span', 'header-title', title || name));
    if (APP.meta && APP.meta.version) {
      brand.appendChild(makeEl('span', 'header-ver', 'v' + APP.meta.version));
    }
    headerEl.appendChild(brand);
  }

  /* ---------- 视图：首页选难度 ---------- */
  function viewHome() {
    renderHeader();
    clearNode(viewEl);
    viewEl.appendChild(makeEl('div', 'page-title', '选择难度'));
    viewEl.appendChild(makeEl('div', 'home-hint', '点选两块拼图交换位置，拼出完整图片！'));
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
        best && best.ms ? '最佳 ' + (best.ms / 1000).toFixed(1) + ' 秒' : '未挑战');
      card.appendChild(meta);
      list.appendChild(card);
    });
    viewEl.appendChild(list);
    renderFooterNav();
  }

  /* ---------- 出题引擎 ---------- */
  /* 生成 N×N 碎片：每块 { id, row, col } 为目标行列（场景中的位置），
     数组索引为当前槽位；洗牌后重算当前位置 curRow/curCol */
  function buildPieces(n) {
    var pieces = [];
    var id = 0;
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        pieces.push({ id: id, row: r, col: c, curRow: r, curCol: c });
        id += 1;
      }
    }
    var arr = shuffle(pieces);
    // 防止洗牌后恰好已还原
    var guard = 0;
    while (isSolvedArr(arr, n) && guard < 100) {
      arr = shuffle(pieces);
      guard += 1;
    }
    for (var i = 0; i < arr.length; i++) {
      arr[i].curRow = Math.floor(i / n);
      arr[i].curCol = i % n;
    }
    return arr;
  }
  /* 判断数组是否全部归位（按目标行列 vs 数组索引） */
  function isSolvedArr(arr, n) {
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].row !== Math.floor(i / n) || arr[i].col !== i % n) { return false; }
    }
    return true;
  }
  /* 当前局是否全部归位 */
  function isSolved() {
    for (var i = 0; i < state.pieces.length; i++) {
      var p = state.pieces[i];
      if (p.curRow !== p.row || p.curCol !== p.col) { return false; }
    }
    return true;
  }

  /* ---------- 场景 SVG ---------- */
  /* 单个元素：以 (0,0) 为中心的内层 SVG 套 <g transform> 定位 */
  function elementSvg(e) {
    var inner = e.draw({ fill: e.fill, variant: 0 });
    var tx = 'translate(' + e.x + ',' + e.y + ')';
    if (e.s && e.s !== 1) { tx += ' scale(' + e.s + ')'; }
    return '<g transform="' + tx + '">' + inner + '</g>';
  }
  /* 完整场景内容（bg + 所有元素），不带 <svg> 包裹，供各碎片复用 */
  function sceneContent(scene) {
    var parts = [scene.bg];
    scene.elements.forEach(function (e) { parts.push(elementSvg(e)); });
    return parts.join('');
  }
  /* 完整场景（参照图用） */
  function fullSceneSvg(scene) {
    return '<svg class="ref-svg" viewBox="0 0 ' + scene.w + ' ' + scene.h +
      '" xmlns="http://www.w3.org/2000/svg">' + state.sceneHtml + '</svg>';
  }
  /* 碎片：viewBox 取该块「目标位置」区域，裁剪完整场景显示局部 */
  function pieceSvg(p) {
    var n = LEVELS[state.level].n;
    var size = state.scene.w / n;
    var x = (p.col * size).toFixed(2);
    var y = (p.row * size).toFixed(2);
    var wh = size.toFixed(2);
    return '<svg class="piece-svg" viewBox="' + x + ' ' + y + ' ' + wh + ' ' + wh +
      '" xmlns="http://www.w3.org/2000/svg">' + state.sceneHtml + '</svg>';
  }

  /* ---------- 视图：游戏页 ---------- */
  function startGame(level) {
    if (!SCENES.length) {
      viewEl.textContent = '场景库缺失，请检查 scenes.js';
      return;
    }
    state.level = level;
    state.scene = pickRand(SCENES);
    state.sceneHtml = sceneContent(state.scene);
    state.pieces = buildPieces(LEVELS[level].n);
    state.selected = -1;
    state.moves = 0;
    state.started = false;
    state.finished = false;
    state.startMs = 0;
    state.elapsed = 0;
    stopTimer();
    closeRefOverlay();
    renderHeader(LEVELS[level].label);
    clearNode(viewEl);
    renderGame();
    // 游戏页不走底栏导航（顶部返回 + 底部重新开始）
    clearNode(document.getElementById('app-footer'));
  }

  function renderGame() {
    var level = state.level;
    var l = LEVELS[level];
    var n = l.n;
    var total = n * n;
    pieceEls = [];
    pieceSvgEls = [];

    // 顶部状态栏：返回 | 难度 | 计时 | 已归位
    var top = makeEl('div', 'game-top');
    var back = makeEl('button', 'game-back', '‹ 返回');
    back.addEventListener('click', function () { viewHome(); });
    top.appendChild(back);
    top.appendChild(makeEl('div', 'game-name', l.label));
    var timerEl = makeEl('div', 'game-timer', '⏱ 00.0');
    timerEl.id = 'game-timer';
    top.appendChild(timerEl);
    var solvedEl = makeEl('div', 'game-solved', '归位 0/' + total);
    solvedEl.id = 'game-solved';
    top.appendChild(solvedEl);
    viewEl.appendChild(top);

    // 参照图区：完整图缩略（90px）；4×4 默认隐藏缩略 + 「看原图」按钮
    viewEl.appendChild(renderRef());

    // 拼图网格：正方形碎片按列数百分比铺排（2×2→50%、3×3→33.33%、4×4→25%）
    var grid = makeEl('div', 'puzzle-grid grid-' + n);
    for (var i = 0; i < total; i++) {
      (function (slot) {
        var p = state.pieces[slot];
        var wrap = makeEl('div', 'piece');
        var inner = makeEl('div', 'piece-inner');
        inner.innerHTML = pieceSvg(p);
        wrap.appendChild(inner);
        wrap.addEventListener('click', function () { onPieceTap(slot); });
        pieceEls[slot] = wrap;
        pieceSvgEls[slot] = inner.firstChild;
        grid.appendChild(wrap);
      })(i);
    }
    viewEl.appendChild(grid);

    // 底部：步数 + 重新开始
    var status = makeEl('div', 'game-status');
    var movesEl = makeEl('div', 'game-moves', '步数 0');
    movesEl.id = 'game-moves';
    status.appendChild(movesEl);
    viewEl.appendChild(status);

    var row = makeEl('div', 'btn-row');
    var restart = makeEl('button', 'btn btn-primary', '重新开始');
    restart.addEventListener('click', function () { startGame(level); });
    row.appendChild(restart);
    viewEl.appendChild(row);

    updateSolved();
  }

  /* 参照图：90px 缩略图；4×4 隐藏缩略、提供「看原图」按钮（3 秒大图浮层） */
  function renderRef() {
    var n = LEVELS[state.level].n;
    var wrap = makeEl('div', 'ref-row');
    var thumb = makeEl('div', 'ref-thumb' + (n === 4 ? ' hide' : ''));
    thumb.innerHTML = fullSceneSvg(state.scene);
    wrap.appendChild(thumb);
    if (n === 4) {
      var btn = makeEl('button', 'btn btn-ref', '看原图');
      btn.addEventListener('click', showRefOverlay);
      wrap.appendChild(btn);
    }
    return wrap;
  }
  function showRefOverlay() {
    closeRefOverlay();
    var overlay = makeEl('div', 'ref-overlay');
    overlay.id = 'ref-overlay';
    var box = makeEl('div', 'ref-box');
    box.innerHTML = fullSceneSvg(state.scene);
    overlay.appendChild(box);
    overlay.appendChild(makeEl('div', 'ref-hint', '原图（3 秒后自动关闭）'));
    overlay.addEventListener('click', function () { closeRefOverlay(); });
    document.body.appendChild(overlay);
    state.refTimer = window.setTimeout(closeRefOverlay, 3000);
  }
  function closeRefOverlay() {
    if (state.refTimer) { clearTimeout(state.refTimer); state.refTimer = null; }
    var el = document.getElementById('ref-overlay');
    if (el && el.parentNode) { el.parentNode.removeChild(el); }
  }

  /* ---------- 交互：点选 / 交换 ---------- */
  function onPieceTap(slot) {
    if (state.finished) { return; }
    // 第一次点选开始计时
    if (!state.started) {
      state.started = true;
      state.startMs = performance.now();
      startTimer();
    }
    var el = pieceEls[slot];
    if (state.selected === -1) {
      // 第一块：选中（紫色高亮）
      state.selected = slot;
      el.className += ' selected';
    } else if (state.selected === slot) {
      // 同一块：取消选中
      state.selected = -1;
      el.className = el.className.replace(' selected', '');
    } else {
      // 第二块：交换位置
      var a = state.selected;
      pieceEls[a].className = pieceEls[a].className.replace(' selected', '');
      state.selected = -1;
      swapSlots(a, slot);
      state.moves += 1;
      updateMoves();
      updateSolved();
      if (isSolved()) { finishGame(); }
    }
  }

  /* 交换槽位 a、b 上的两块碎片：换数组 + 更新 curRow/curCol + 更新 svg viewBox */
  function swapSlots(a, b) {
    var n = LEVELS[state.level].n;
    var t = state.pieces[a];
    state.pieces[a] = state.pieces[b];
    state.pieces[b] = t;
    state.pieces[a].curRow = Math.floor(a / n);
    state.pieces[a].curCol = a % n;
    state.pieces[b].curRow = Math.floor(b / n);
    state.pieces[b].curCol = b % n;
    updatePieceSvg(a);
    updatePieceSvg(b);
  }
  function updatePieceSvg(slot) {
    var svg = pieceSvgEls[slot];
    if (!svg) { return; }
    var p = state.pieces[slot];
    var n = LEVELS[state.level].n;
    var size = state.scene.w / n;
    svg.setAttribute('viewBox',
      (p.col * size).toFixed(2) + ' ' + (p.row * size).toFixed(2) + ' ' +
      size.toFixed(2) + ' ' + size.toFixed(2));
  }

  /* ---------- 计时 / 状态更新 ---------- */
  function startTimer() {
    if (state.timerId) { clearInterval(state.timerId); }
    state.timerId = setInterval(function () {
      updateTimer(performance.now() - state.startMs);
    }, 100);
  }
  function stopTimer() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
  }
  function updateTimer(ms) {
    var el = document.getElementById('game-timer');
    if (!el) { return; }
    var txt = (ms / 1000).toFixed(1);
    if (txt.length === 3) { txt = '0' + txt; } // "7.5" → "07.5"
    el.textContent = '⏱ ' + txt;
  }
  function updateMoves() {
    var el = document.getElementById('game-moves');
    if (el) { el.textContent = '步数 ' + state.moves; }
  }
  function updateSolved() {
    var el = document.getElementById('game-solved');
    if (!el) { return; }
    var count = 0;
    for (var i = 0; i < state.pieces.length; i++) {
      var p = state.pieces[i];
      if (p.curRow === p.row && p.curCol === p.col) { count += 1; }
    }
    el.textContent = '归位 ' + count + '/' + state.pieces.length;
  }

  /* ---------- 结算 ---------- */
  function calcStars(level, ms) {
    var l = LEVELS[level];
    if (ms <= l.threeMs) { return 3; }
    if (ms <= l.twoMs) { return 2; }
    return 1;
  }

  function finishGame() {
    if (state.finished) { return; }
    state.finished = true;
    stopTimer();
    state.elapsed = performance.now() - state.startMs;

    // 打卡：完成一局即点亮今日
    var t = todayStr();
    var dates = store.checkin.dates;
    if (dates.indexOf(t) === -1) { dates.push(t); }
    dates.sort();
    while (dates.length > 365) { dates.shift(); }
    store.checkin.streak = calcStreak(dates);

    // 星级
    var stars = calcStars(state.level, state.elapsed);

    // 最佳 / 最近 / 历史（按时间，ms 更小覆盖）
    var key = '' + state.level;
    var msRound = Math.round(state.elapsed);
    var isNewBest = false;
    var best = store.best[key];
    if (!best || msRound < best.ms) {
      store.best[key] = { ms: msRound, date: t };
      isNewBest = true;
    }
    store.recent[key] = msRound;
    store.history.unshift({ date: t, level: state.level, ms: msRound, moves: state.moves, stars: stars });
    while (store.history.length > 30) { store.history.pop(); }
    saveStore();

    // 全部碎片绿色边框闪烁（400ms 动画），350ms 后展示结算浮层
    for (var i = 0; i < pieceEls.length; i++) {
      pieceEls[i].className += ' solved';
    }
    window.setTimeout(function () {
      showResult(msRound, state.moves, stars, isNewBest);
    }, 350);
  }

  /* ---------- 结果浮层 ---------- */
  function mkStat(label, val) {
    var s = makeEl('div', 'result-stat');
    s.appendChild(makeEl('b', '', val));
    s.appendChild(makeEl('span', '', label));
    return s;
  }
  function showResult(ms, moves, stars, isNewBest) {
    var total = state.pieces.length;
    var overlay = makeEl('div', 'result-overlay');
    var box = makeEl('div', 'result-box');
    box.appendChild(makeEl('div', 'result-title', '完成！'));
    box.appendChild(makeEl('div', 'result-time', (ms / 1000).toFixed(1) + ' 秒'));
    var stats = makeEl('div', 'result-stats');
    stats.appendChild(mkStat('用时', (ms / 1000).toFixed(1) + 's'));
    stats.appendChild(mkStat('步数', '' + moves));
    stats.appendChild(mkStat('归位', total + '/' + total));
    box.appendChild(stats);
    box.appendChild(makeEl('div', 'result-stars', '★★★'.slice(0, stars)));
    if (isNewBest) {
      box.appendChild(makeEl('div', 'result-record', '🎉 新纪录！'));
    }
    var again = makeEl('button', 'btn btn-primary', '再来一局');
    again.addEventListener('click', function () {
      closeOverlay(overlay);
      startGame(state.level);
    });
    box.appendChild(again);
    var home = makeEl('button', 'btn', '返回首页');
    home.addEventListener('click', function () {
      closeOverlay(overlay);
      viewHome();
    });
    box.appendChild(home);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }
  function closeOverlay(overlay) {
    if (overlay && overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
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
      var label = LEVELS[r.level] ? LEVELS[r.level].label : (r.level + ' × ' + r.level);
      left.appendChild(makeEl('div', 'point-name', label));
      left.appendChild(makeEl('div', 'point-meta', r.date + ' · 步数 ' + r.moves));
      item.appendChild(left);
      var right = makeEl('div', 'point-right');
      right.appendChild(makeEl('div', 'point-time', (r.ms / 1000).toFixed(1) + ' 秒'));
      right.appendChild(makeEl('div', 'point-stars', '★★★'.slice(0, r.stars)));
      item.appendChild(right);
      list.appendChild(item);
    });
    viewEl.appendChild(list);
    renderFooterNav();
  }

  /* ---------- 视图：打卡日历（完成一局自动打卡，本页仅展示） ---------- */
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
