/* ============================================================
   找不同 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   数据：window.SCENES（scenes.js 注入，8 个场景 SVG 程序化生成）
        window.APP_DATA（data.js 注入，build 生成 meta，可缺失）
   功能：
   - 选难度（简单3处/进阶5处/挑战8处）→ 随机出题（场景+差异）→ 双图对比找不同
   - 点击差异处打勾锁定；点错红叉计数；找齐即过关 → 计时/星级/打卡/成绩
   - 差异变换 5 种：改色 / 变位 / 缩放旋转 / 隐藏 / 替换变体（见 buildDiff）
   设计约束：
   - 不使用 import/export / type="module"
   - 不超出 ES2017（无 ?. ?? 对象展开等）
   - 事件全部 addEventListener，无内联事件 / eval
   - 计时用 performance.now()，interval 按差值刷新（后台回来计时仍准）
   - 全部图形由 SVG 代码生成，无图片/无网络
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
    3: { label: '简单 · 3 处', threeMs: 20000, twoMs: 40000 },
    5: { label: '进阶 · 5 处', threeMs: 40000, twoMs: 75000 },
    8: { label: '挑战 · 8 处', threeMs: 75000, twoMs: 120000 }
  };

  /* ---------- 差异变换池（5 种原子操作） ---------- */
  var DIFF_OPS = ['recolor', 'move', 'scale', 'hide', 'variant'];

  /* ---------- 状态 ---------- */
  var state = {
    level: 3, scene: null, elems: [], diffs: [], diffMap: {},
    found: 0, errors: 0,
    started: false, finished: false, startMs: 0, elapsed: 0, timerId: null
  };

  /* ---------- 持久化 ---------- */
  var STORE_KEY = 'redtools.finddiff.v1';
  function loadStore() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) { return JSON.parse(raw); }
    } catch (err) { /* ignore */ }
    return {
      version: 1,
      best: { '3': null, '5': null, '8': null },
      recent: { '3': 0, '5': 0, '8': 0 },
      checkin: { dates: [], streak: 0 },
      history: []
    };
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
    var streak = 0;
    var d = new Date();
    for (var i = dates.length - 1; i >= 0; i--) {
      if (dates[i] === todayStr()) { streak = 1; continue; }
      d.setDate(d.getDate() - 1);
      var want = dateStr(d);
      if (dates[i] === want) { streak += 1; }
      else { break; }
    }
    return streak;
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
  function pickRand(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function randRange(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }
  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  /* ---------- 渲染：顶栏 ---------- */
  function renderHeader(title) {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '找不同';
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
    viewEl.appendChild(makeEl('div', 'home-hint', '找出两幅图中的不同之处，点一点！'));
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
  /* 随机选场景 + 随机选 N 个不同元素 + 每元素随机应用一种差异变换 */
  function buildDiff(scene, n) {
    var elems = scene.elements;
    var idxs = shuffle(elems.map(function (_, i) { return i; })).slice(0, n);
    var diffs = [];
    var diffMap = {};
    var hides = 0;
    idxs.forEach(function (idx) {
      var e = elems[idx];
      var op = pickRand(DIFF_OPS);
      // 隐藏变换最多 2 处，避免题目太简单/太难
      if (op === 'hide' && hides >= 2) { op = 'recolor'; }
      if (op === 'hide') { hides += 1; }
      diffs.push({ id: e.id, type: op });
      diffMap[e.id] = { type: op, found: false };
    });
    return { diffs: diffs, diffMap: diffMap };
  }

  /* 对右图元素应用差异变换，返回该元素的右图渲染参数 */
  function applyDiff(e, d, scene) {
    var p = {
      x: e.x, y: e.y, s: e.s || 1, rot: e.rot || 0,
      fill: e.fill, variant: 0, hidden: false
    };
    if (!d) { return p; }
    var op = d.type;
    if (op === 'recolor') {
      // 从 palette 中选一个与当前主色不同的颜色
      var alts = (e.palette || []).filter(function (c) { return c !== e.fill; });
      if (alts.length) { p.fill = pickRand(alts); }
    } else if (op === 'move') {
      // 偏移 40~75px（保持场景边界）
      var dx = randRange(-1, 1) * randRange(40, 70);
      var dy = randRange(-1, 1) * randRange(40, 70);
      if (dx === 0 && dy === 0) { dx = 55; }
      p.x = clamp(e.x + dx, 30, scene.w - 30);
      p.y = clamp(e.y + dy, 30, scene.h - 30);
    } else if (op === 'scale') {
      // 缩放或旋转（放大 1.35~1.7 / 缩小 0.55~0.75 / 旋转 ±15~40°）
      var k = randRange(0, 2);
      if (k === 0) { p.s = (1.35 + Math.random() * 0.35).toFixed(2); }
      else if (k === 1) { p.s = (0.55 + Math.random() * 0.2).toFixed(2); }
      else { p.rot = randRange(1, 2) * randRange(15, 40) * (Math.random() < 0.5 ? -1 : 1); }
    } else if (op === 'hide') {
      p.hidden = true; // 右图不渲染该元素（孩子要点左图对应位置）
    } else if (op === 'variant') {
      p.variant = 1;
    }
    return p;
  }

  /* ---------- SVG 渲染 ---------- */
  function elementSvg(e, p) {
    var inner = e.draw({ fill: p.fill, variant: p.variant });
    var tx = 'translate(' + p.x + ',' + p.y + ')';
    if (p.s !== 1) { tx += ' scale(' + p.s + ')'; }
    if (p.rot) { tx += ' rotate(' + p.rot + ')'; }
    return '<g data-eid="' + e.id + '">' +
      '<g transform="' + tx + '" pointer-events="none">' + inner + '</g>' +
      '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + e.hitR + '"' +
      ' fill="rgba(0,0,0,0)" pointer-events="all" class="hit-circle"/>' +
      '</g>';
  }

  function renderSceneSvg(side) {
    var scene = state.scene;
    var isRight = side === 'right';
    var parts = ['<svg id="scene-' + side + '" class="scene-svg" viewBox="0 0 ' +
      scene.w + ' ' + scene.h + '" xmlns="http://www.w3.org/2000/svg">'];
    parts.push(scene.bg);
    state.elems.forEach(function (e) {
      var p = isRight ? state.rightP[e.id] : state.leftP[e.id];
      if (!p || p.hidden) { return; }
      parts.push(elementSvg(e, p));
    });
    parts.push('</svg>');
    return parts.join('');
  }

  /* ---------- 视图：游戏页 ---------- */
  function startGame(level) {
    if (!SCENES.length) {
      viewEl.textContent = '场景库缺失，请检查 scenes.js';
      return;
    }
    state.level = level;
    state.scene = pickRand(SCENES);
    state.elems = state.scene.elements;
    var bd = buildDiff(state.scene, level);
    state.diffs = bd.diffs;
    state.diffMap = bd.diffMap;
    // 左右图渲染参数：左图全部原样；右图按差异变换
    state.leftP = {};
    state.rightP = {};
    state.elems.forEach(function (e) {
      state.leftP[e.id] = { x: e.x, y: e.y, s: e.s || 1, rot: e.rot || 0, fill: e.fill, variant: 0 };
      state.rightP[e.id] = applyDiff(e, state.diffMap[e.id], state.scene);
    });
    state.found = 0;
    state.errors = 0;
    state.started = false;
    state.finished = false;
    state.startMs = 0;
    state.elapsed = 0;
    stopTimer();

    renderHeader();
    clearNode(viewEl);
    var title = LEVELS[level].label + ' · ' + state.scene.name;
    // 顶部状态栏：返回 | 难度·场景 | 计时
    var top = makeEl('div', 'game-top');
    var back = makeEl('button', 'game-back', '‹ 返回');
    back.addEventListener('click', function () { viewHome(); });
    top.appendChild(back);
    var nameEl = makeEl('div', 'game-name', title);
    nameEl.id = 'game-name';
    top.appendChild(nameEl);
    var timerEl = makeEl('div', 'game-timer', '⏱ 00.0');
    timerEl.id = 'game-timer';
    top.appendChild(timerEl);
    viewEl.appendChild(top);

    // 进度条
    var bar = makeEl('div', 'fd-progress');
    bar.appendChild(makeEl('i', 'fd-progress-fill'));
    bar.id = 'fd-progress';
    viewEl.appendChild(bar);

    // 双图：手机竖屏上下堆叠、宽屏左右并排（CSS 控制）
    var pair = makeEl('div', 'scene-pair');
    pair.id = 'scene-pair';
    // 左图（原图）
    var leftWrap = makeEl('div', 'scene-wrap');
    leftWrap.appendChild(makeEl('div', 'scene-label', '原图'));
    var leftBox = makeEl('div', 'scene-box');
    leftBox.innerHTML = renderSceneSvg('left');
    leftWrap.appendChild(leftBox);
    // 右图（找不同）
    var rightWrap = makeEl('div', 'scene-wrap');
    rightWrap.appendChild(makeEl('div', 'scene-label', '找不同'));
    var rightBox = makeEl('div', 'scene-box');
    rightBox.innerHTML = renderSceneSvg('right');
    rightWrap.appendChild(rightBox);

    pair.appendChild(leftWrap);
    pair.appendChild(rightWrap);
    viewEl.appendChild(pair);

    // 底部：错误 + 已找到 + 重新开始
    var status = makeEl('div', 'game-status');
    var foundEl = makeEl('div', 'game-found', '已找到 0/' + level);
    foundEl.id = 'game-found';
    status.appendChild(foundEl);
    var errEl = makeEl('div', 'game-errors', '点错 0');
    errEl.id = 'game-errors';
    status.appendChild(errEl);
    viewEl.appendChild(status);

    var row = makeEl('div', 'btn-row');
    var restart = makeEl('button', 'btn btn-primary', '重新开始');
    restart.addEventListener('click', function () { startGame(level); });
    row.appendChild(restart);
    viewEl.appendChild(row);

    // 绑定点击（事件委托）
    bindSceneTaps();
    clearNode(document.getElementById('app-footer'));
  }

  function bindSceneTaps() {
    ['left', 'right'].forEach(function (side) {
      var svg = document.getElementById('scene-' + side);
      if (!svg) { return; }
      svg.addEventListener('click', function (evt) {
        if (state.finished) { return; }
        var target = evt.target;
        // 向上找 data-eid 的 g
        while (target && target !== svg) {
          if (target.getAttribute && target.getAttribute('data-eid')) {
            onElementTap(target.getAttribute('data-eid'), side);
            return;
          }
          target = target.parentNode;
        }
      });
    });
  }

  /* 点击元素：命中判断「eid∈差异且(该差异为隐藏 或 点在右图)」→ 正确打勾，否则红叉 */
  function onElementTap(eid, side) {
    var d = state.diffMap[eid];
    if (!d) { missAt(eid, side); return; }      // 非差异元素：点错
    if (d.found) { return; }                     // 已标记：忽略
    if (side === 'left' && d.type !== 'hide') { missAt(eid, side); return; } // 左图只认隐藏类
    // 命中
    d.found = true;
    state.found += 1;
    if (!state.started) {
      state.started = true;
      state.startMs = performance.now();
      startTimer();
    }
    markFound(eid, side);
    updateFound();
    if (state.found >= state.level) {
      finishGame();
    }
  }

  /* ---------- 标记：对勾（正确） / 红叉（错误） ---------- */
  var SVG_NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      el.setAttribute(k, attrs[k]);
    });
    return el;
  }
  function getElemParams(eid, side) {
    return side === 'right' ? state.rightP[eid] : state.leftP[eid];
  }
  function markFound(eid, side) {
    var svg = document.getElementById('scene-' + side);
    var p = getElemParams(eid, side);
    var e = findElem(eid);
    if (!svg || !p || !e) { return; }
    var g = svgEl('g', { 'class': 'fd-found', 'pointer-events': 'none' });
    g.appendChild(svgEl('circle', { cx: p.x, cy: p.y, r: e.hitR, fill: 'rgba(18,183,106,0.85)' }));
    var s = e.hitR * 0.55;
    g.appendChild(svgEl('polyline', {
      points: (p.x - s) + ',' + p.y + ' ' + (p.x - s * 0.3) + ',' + (p.y + s * 0.6) + ' ' + (p.x + s) + ',' + (p.y - s),
      fill: 'none', stroke: '#ffffff', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    }));
    svg.appendChild(g);
  }
  function missAt(eid, side) {
    state.errors += 1;
    updateErrors();
    var svg = document.getElementById('scene-' + side);
    var p = getElemParams(eid, side);
    var e = findElem(eid);
    if (!svg || !p || !e) { return; }
    var g = svgEl('g', { 'class': 'fd-miss', 'pointer-events': 'none' });
    g.appendChild(svgEl('circle', { cx: p.x, cy: p.y, r: e.hitR, fill: 'rgba(240,68,56,0.85)' }));
    var s = e.hitR * 0.5;
    g.appendChild(svgEl('line', { x1: p.x - s, y1: p.y - s, x2: p.x + s, y2: p.y + s, stroke: '#ffffff', 'stroke-width': 4, 'stroke-linecap': 'round' }));
    g.appendChild(svgEl('line', { x1: p.x - s, y1: p.y + s, x2: p.x + s, y2: p.y - s, stroke: '#ffffff', 'stroke-width': 4, 'stroke-linecap': 'round' }));
    svg.appendChild(g);
    // 400ms 后移除
    window.setTimeout(function () {
      if (g.parentNode) { g.parentNode.removeChild(g); }
    }, 400);
  }
  function findElem(eid) {
    for (var i = 0; i < state.elems.length; i++) {
      if (state.elems[i].id === eid) { return state.elems[i]; }
    }
    return null;
  }

  /* ---------- 计时 ---------- */
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
  function updateFound() {
    var el = document.getElementById('game-found');
    if (el) { el.textContent = '已找到 ' + state.found + '/' + state.level; }
    var bar = document.getElementById('fd-progress');
    if (bar) {
      bar.style.width = (state.found / state.level * 100) + '%';
    }
  }
  function updateErrors() {
    var el = document.getElementById('game-errors');
    if (el) { el.textContent = '点错 ' + state.errors; }
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

    // 最佳 / 最近 / 历史
    var key = '' + state.level;
    var msRound = Math.round(state.elapsed);
    var isNewBest = false;
    var best = store.best[key];
    if (!best || msRound < best.ms) {
      store.best[key] = { ms: msRound, date: t };
      isNewBest = true;
    }
    store.recent[key] = msRound;
    store.history.unshift({ date: t, level: state.level, scene: state.scene.name, ms: msRound, errors: state.errors, stars: stars });
    while (store.history.length > 30) { store.history.pop(); }
    saveStore();

    // 略延迟展示结果，让最后一次点击的绿色高亮可见
    window.setTimeout(function () {
      showResult(msRound, state.errors, stars, isNewBest);
    }, 350);
  }

  /* ---------- 结果浮层 ---------- */
  function mkStat(label, val) {
    var s = makeEl('div', 'result-stat');
    s.appendChild(makeEl('b', '', val));
    s.appendChild(makeEl('span', '', label));
    return s;
  }
  function showResult(ms, errors, stars, isNewBest) {
    var overlay = makeEl('div', 'result-overlay');
    var box = makeEl('div', 'result-box');
    box.appendChild(makeEl('div', 'result-title', '完成！'));
    box.appendChild(makeEl('div', 'result-time', (ms / 1000).toFixed(1) + ' 秒'));
    var stats = makeEl('div', 'result-stats');
    stats.appendChild(mkStat('用时', (ms / 1000).toFixed(1) + 's'));
    stats.appendChild(mkStat('找对', state.level + '/' + state.level));
    stats.appendChild(mkStat('点错', '' + errors));
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
      var label = LEVELS[r.level] ? LEVELS[r.level].label : (r.level + ' 处');
      left.appendChild(makeEl('div', 'point-name', label + ' · ' + r.scene));
      left.appendChild(makeEl('div', 'point-meta', r.date + ' · 点错 ' + r.errors + ' 次'));
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
