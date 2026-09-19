/* ============================================================
   细节搜索 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   数据：window.APP_DATA（data.js 注入，build 生成 meta，可缺失）
         window.SCENES（scenes.js：8 场景 480×320 + 73 元素库，零素材）
   玩法：随机场景 + 本地抽取 N 个目标物 → 藏物以【缩小副本】随机摆放
         （与场景固有元素同源 = 天然相似干扰）→ 逐次亮显当前目标 →
         缩放/平移浏览大图 → 点中目标绿勾 / 点错红闪 → 全找齐结算。
   素材：零图片素材（程序化 SVG 场景 + 元素副本缩放藏物）
   缩放：按钮式动态改 SVG viewBox（1/1.5/2.2 三档），命中由浏览器
         按 viewBox 自动换算坐标（无需屏幕坐标手算）。
   成绩/打卡：localStorage key 带工具前缀 redtools.xijiesousuo.v1
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };
  var SCENES = window.SCENES || [];

  /* ---------- 难度定义 ---------- */
  var LEVELS = [
    { key: '1', name: '简单', targets: 3, hideScale: 0.72, hintLimit: 1 },
    { key: '2', name: '普通', targets: 5, hideScale: 0.56, hintLimit: 2 },
    { key: '3', name: '困难', targets: 7, hideScale: 0.42, hintLimit: 2 }
  ];
  function findLevel(key) {
    for (var i = 0; i < LEVELS.length; i++) {
      if (LEVELS[i].key === key) { return LEVELS[i]; }
    }
    return LEVELS[0];
  }

  /* ---------- 缩放档位（元素按 viewBox 比例：480×320 基准） ---------- */
  var ZOOMS = [1, 1.5, 2.2];

  /* ---------- DOM ---------- */
  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');
  var footerEl = document.getElementById('app-footer');
  var overlayEl = null;
  var sceneSvgEl = null;
  var targetNameEl = null;
  var targetCardEl = null;
  var errorsEl = null;
  var progressEl = null;

  /* ---------- 状态 ---------- */
  var state = {
    level: '1',
    scene: null,        // 当前场景对象
    hides: [],          // [{e, x, y, s, hitR, found}] 藏物（含排序=找的顺序）
    curIdx: 0,          // 当前要找的藏物下标
    errors: 0,
    hints: 0,
    won: false,
    startMs: 0,
    ms: 0,
    timerId: 0,
    zoomIdx: 0,         // ZOOMS 下标
    viewX: 0, viewY: 0, // 当前 viewBox 左上
    viewW: 480, viewH: 320
  };

  /* ---------- 持久化（redtools.xijiesousuo.v1） ---------- */
  var STORE_KEY = 'redtools.xijiesousuo.v1';
  function defaultStore() {
    return {
      version: 1,
      best: {},         // key = 难度 → {ms, errors, stars, date}
      recent: {},
      checkin: { dates: [], streak: 0 },
      history: []
    };
  }
  function loadStore() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        var obj = JSON.parse(raw);
        if (obj && obj.version === 1) {
          if (!obj.best) { obj.best = {}; }
          if (!obj.recent) { obj.recent = {}; }
          if (!obj.checkin) { obj.checkin = { dates: [], streak: 0 }; }
          if (!obj.history) { obj.history = []; }
          if (obj.history.length > 30) { obj.history = obj.history.slice(-30); }
          return obj;
        }
      }
    } catch (err) { /* ignore */ }
    return defaultStore();
  }
  function saveStore() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (err) { /* ignore */ }
  }
  var store = loadStore();
  saveStore(); // 初始化写入

  /* ---------- 工具函数 ---------- */
  function clearNode(node) {
    while (node.firstChild) { node.removeChild(node.firstChild); }
  }
  function makeEl(tag, className, text) {
    var el = document.createElement(tag);
    if (className) { el.className = className; }
    if (text !== undefined && text !== null) { el.textContent = text; }
    return el;
  }
  function fmtDate(d) {
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : '' + m) + '-' + (day < 10 ? '0' + day : '' + day);
  }
  function fmtTime(ms) {
    var s = Math.round(ms / 1000);
    if (s < 60) { return '' + s; }
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + '分' + (r < 10 ? '0' + r : '' + r) + '秒';
  }
  function cnName(id) {
    return (window.ELEM_NAMES && window.ELEM_NAMES[id]) || '小物';
  }

  /* ---------- 音效（Web Audio 合成，无音频文件） ---------- */
  var ac = null;
  function getAudio() {
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (err) { ac = null; }
    }
    return ac;
  }
  function tone(freq, start, dur, type) {
    var ctx = getAudio();
    if (!ctx) { return; }
    try {
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      var t0 = ctx.currentTime + start;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch (err) { /* ignore */ }
  }
  function sndFind() { tone(880, 0, 0.14, 'sine'); tone(1318, 0.06, 0.16, 'sine'); }
  function sndMiss() { tone(240, 0, 0.18, 'triangle'); tone(180, 0.08, 0.22, 'triangle'); }
  function sndWin() { tone(523, 0, 0.16, 'sine'); tone(659, 0.1, 0.16, 'sine'); tone(784, 0.2, 0.3, 'sine'); }

  /* ---------- 顶栏 ---------- */
  function renderHeader(title) {
    clearNode(headerEl);
    var logo = makeEl('div', 'hd-logo', '🔍');
    logo.className = 'hd-logo';
    headerEl.appendChild(logo);
    var box = makeEl('div');
    box.appendChild(makeEl('div', 'hd-title', title || '细节搜索'));
    var meta = APP.meta || {};
    box.appendChild(makeEl('div', 'hd-sub', '观察力·检索 v' + (meta.version || '1.0')));
    headerEl.appendChild(box);
  }

  /* ---------- 计时 ---------- */
  function startTimer() {
    state.startMs = performance.now();
  }
  function stopTimer() {
    state.ms = performance.now() - state.startMs;
  }

  /* ---------- 出题：抽目标 + 藏物摆位 ---------- */
  function pickScene() {
    var idx = Math.floor(Math.random() * SCENES.length);
    return SCENES[idx];
  }
  /** 从场景元素池随机抽 n 个不同目标 */
  function pickTargets(scene, n) {
    var pool = scene.elements.slice();
    var picked = [];
    for (var i = 0; i < n; i++) {
      var j = Math.floor(Math.random() * pool.length);
      picked.push(pool[j]);
      pool.splice(j, 1);
    }
    return picked;
  }
  function dist(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  /** 藏物摆位：随机采样 + 与固有元素及已放藏物的圆心距碰撞避让 + 边距
      注意：wrapOffset 的 scale(s) 会同步压缩 circle 半径，故渲染传入
      chipR = showR / s 预补偿，保证实际命中半径 = showR（触摸友好） */
  function makeHides(scene, elems, hideScale) {
    var hides = [];
    var guard = 0;
    for (var i = 0; i < elems.length; i++) {
      var e = elems[i];
      var showR = Math.max(16, Math.round(e.hitR * hideScale * 1.45));
      var chipR = Math.ceil(showR / hideScale);
      var placed = false;
      var guardInner = 0;
      while (!placed && guardInner < 80) {
        guardInner++;
        guard++;
        if (guard > 400) { break; }
        var x = 34 + Math.random() * (scene.w - 68);
        var y = 34 + Math.random() * (scene.h - 68);
        var ok = true;
        // 与场景固有元素避让（按实际显示半径）
        for (var j = 0; j < scene.elements.length; j++) {
          var pe = scene.elements[j];
          if (dist({ x: x, y: y }, pe) < (pe.hitR + showR) * 0.85) { ok = false; break; }
        }
        if (!ok) { continue; }
        // 与已放藏物避让
        for (var k = 0; k < hides.length; k++) {
          if (dist({ x: x, y: y }, hides[k]) < (hides[k].showR + showR) * 0.85) { ok = false; break; }
        }
        if (!ok) { continue; }
        hides.push({ e: e, x: x, y: y, s: hideScale, rot: Math.floor(Math.random() * 60 - 30), hitR: chipR, showR: showR, found: false });
        placed = true;
      }
      if (!placed) {
        // 兜底：靠边随机（不避让）
        hides.push({ e: e, x: 40 + Math.random() * (scene.w - 80), y: 40 + Math.random() * (scene.h - 80), s: hideScale, rot: 0, hitR: chipR, showR: showR, found: false });
      }
    }
    return hides;
  }

  /* ---------- SVG 渲染 ---------- */
  var SVG_NS = 'http://www.w3.org/2000/svg';
  function wrapOffset(svgStr, x, y, s, rot, hitR, dataEid, cls) {
    return '<g' + (cls ? ' class="' + cls + '"' : '') +
      ' transform="translate(' + x + ' ' + y + ') scale(' + s + ') rotate(' + (rot || 0) + ')"' +
      ' data-eid="' + dataEid + '">' +
      svgStr +
      '<circle r="' + hitR + '" fill="transparent" stroke="none" pointer-events="all" data-hit="1"></circle>' +
      '</g>';
  }
  function renderSceneSvg() {
    var scene = state.scene;
    var s = '<svg xmlns="' + SVG_NS + '" id="scene-svg" viewBox="' + state.viewX + ' ' + state.viewY + ' ' + state.viewW + ' ' + state.viewH +
      '" width="100%" style="display:block;width:100%;height:auto;touch-action:manipulation;">';
    s += scene.bg;
    // 场景固有元素
    for (var i = 0; i < scene.elements.length; i++) {
      var e = scene.elements[i];
      s += wrapOffset(e.draw({ fill: e.fill, variant: 0 }), e.x, e.y, e.s, e.rot, e.hitR, 'prop-' + i, 'prop-g');
    }
    // 藏物
    for (var j = 0; j < state.hides.length; j++) {
      var h = state.hides[j];
      if (h.found) { continue; }
      s += wrapOffset(h.e.draw({ fill: h.e.fill, variant: 0 }), h.x, h.y, h.s, h.rot, h.hitR, 'hide-' + j, 'hide-g');
    }
    s += '</svg>';
    return s;
  }
  function createSceneSvg(svgStr) {
    var holder = makeEl('div', 'scene-box');
    holder.innerHTML = svgStr;
    sceneSvgEl = holder.querySelector('#scene-svg');
    bindSceneTaps(sceneSvgEl);
    return holder;
  }

  function bindSceneTaps(svgEl) {
    svgEl.addEventListener('click', function (evt) {
      if (state.won) { return; }
      var t = evt.target;
      while (t && t !== svgEl && !t.getAttribute) { t = t.parentNode; }
      while (t && t !== svgEl && t.getAttribute && !t.getAttribute('data-eid')) { t = t.parentNode; }
      if (!t || t === svgEl || !t.getAttribute) { onMiss(); return; }
      var eid = t.getAttribute('data-eid');
      if (eid && eid.indexOf('hide-') === 0) {
        var idx = parseInt(eid.slice(5), 10);
        onHideTap(idx);
      } else {
        onMiss();
      }
    });
  }

  /* ---------- 判定 ---------- */
  function onHideTap(idx) {
    if (state.won) { return; }
    if (idx === state.curIdx) {
      state.hides[idx].found = true;
      sndFind();
      state.curIdx += 1;
      if (state.curIdx >= state.hides.length) {
        onWin();
        return;
      }
      reRenderScene();
      renderTargetBar();
    } else {
      onMiss();
    }
  }
  function onMiss() {
    if (state.won) { return; }
    state.errors += 1;
    sndMiss();
    if (errorsEl) { errorsEl.textContent = '点错 ' + state.errors; }
    // 红闪：轻量提示
    var svgEl = document.getElementById('scene-svg');
    if (svgEl) {
      svgEl.setAttribute('class', 'shake');
      setTimeout(function () {
        svgEl.setAttribute('class', '');
      }, 300);
    }
  }
  function useHint() {
    if (state.won) { return; }
    var lv = findLevel(state.level);
    if (state.hints >= lv.hintLimit) { return; }
    state.hints += 1;
    sndFind();
    var h = state.hides[state.curIdx];
    if (!h) { return; }
    var svgEl = document.getElementById('scene-svg');
    if (!svgEl) { return; }
    var g = svgEl.querySelector('[data-eid="hide-' + state.curIdx + '"]');
    if (g && h.showR) {
      // 醒目高亮：深橙描边环脉冲（置于 SVG 根级，不随藏物 g scale 压缩，保证线宽恒定）
      var ring = document.createElementNS(SVG_NS, 'circle');
      ring.setAttribute('cx', h.x);
      ring.setAttribute('cy', h.y);
      ring.setAttribute('r', h.showR + 12);
      ring.setAttribute('stroke', '#ff5a00');
      ring.setAttribute('stroke-width', '8');
      ring.setAttribute('fill', 'none');
      ring.setAttribute('pointer-events', 'none');
      ring.setAttribute('class', 'hint-ring');
      svgEl.appendChild(ring);
      // 原元素同步脉冲
      g.setAttribute('class', 'hide-g hint-pulse');
      setTimeout(function () {
        if (ring && ring.parentNode) { ring.parentNode.removeChild(ring); }
        g.setAttribute('class', 'hide-g');
      }, 2500);
    }
    if (hintBtnEl) { hintBtnEl.textContent = '✋ 提示 (' + (lv.hintLimit - state.hints) + ')'; }
    var hintCountEl = document.getElementById('hint-count');
    if (hintCountEl) { hintCountEl.textContent = '提示 ' + state.hints + '/' + lv.hintLimit; }
  }

  /* ---------- 缩放 / 平移 ---------- */
  function currentZoom() { return ZOOMS[state.zoomIdx]; }
  function applyViewBox() {
    var svgEl = document.getElementById('scene-svg');
    if (!svgEl) { return; }
    svgEl.setAttribute('viewBox', state.viewX + ' ' + state.viewY + ' ' + state.viewW + ' ' + state.viewH);
    updateZoomUI();
  }
  function zoomIn() {
    if (state.zoomIdx >= ZOOMS.length - 1) { return; }
    state.zoomIdx += 1;
    var z = currentZoom();
    // 以当前 viewBox 中心缩放
    var cx = state.viewX + state.viewW / 2;
    var cy = state.viewY + state.viewH / 2;
    state.viewW = 480 / z;
    state.viewH = 320 / z;
    state.viewX = cx - state.viewW / 2;
    state.viewY = cy - state.viewH / 2;
    clampView();
    applyViewBox();
  }
  function zoomOut() {
    if (state.zoomIdx <= 0) { return; }
    state.zoomIdx -= 1;
    var z = currentZoom();
    var cx = state.viewX + state.viewW / 2;
    var cy = state.viewY + state.viewH / 2;
    state.viewW = 480 / z;
    state.viewH = 320 / z;
    state.viewX = cx - state.viewW / 2;
    state.viewY = cy - state.viewH / 2;
    clampView();
    applyViewBox();
  }
  function resetView() {
    state.zoomIdx = 0;
    state.viewX = 0; state.viewY = 0;
    state.viewW = 480; state.viewH = 320;
    applyViewBox();
  }
  function pan(dx, dy) {
    if (state.zoomIdx === 0) { return; }
    var stepX = state.viewW * 0.3;
    var stepY = state.viewH * 0.3;
    state.viewX += dx * stepX;
    state.viewY += dy * stepY;
    clampView();
    applyViewBox();
  }
  function clampView() {
    state.viewX = Math.max(0, Math.min(480 - state.viewW, state.viewX));
    state.viewY = Math.max(0, Math.min(320 - state.viewH, state.viewY));
  }
  function updateZoomUI() {
    var zoomLbl = document.getElementById('zoom-label');
    if (zoomLbl) { zoomLbl.textContent = '🔍 ' + currentZoom() + 'x'; }
    if (panRow) { panRow.style.display = state.zoomIdx === 0 ? 'none' : 'flex'; }
  }
  var panRow = null;
  var hintBtnEl = null;

  /* ---------- 目标栏 ---------- */
  function cardSvgStr(frag) {
    return '<svg xmlns="' + SVG_NS + '" viewBox="-50 -50 100 100" width="46" height="46" style="display:block;">' + frag + '</svg>';
  }
  function renderTargetBar() {
    var h = state.hides[state.curIdx];
    if (!h) { return; }
    if (targetNameEl) { targetNameEl.textContent = '找一找：' + cnName(h.e.id); }
    if (targetCardEl) {
      clearNode(targetCardEl);
      targetCardEl.innerHTML = cardSvgStr(wrapOffset(h.e.draw({ fill: h.e.fill, variant: 0 }), 0, 0, 1, 0, 1, 'tpl', 'tpl-g'));
    }
    if (progressEl) { progressEl.textContent = (state.curIdx + 1) + ' / ' + state.hides.length; }
  }

  /* ---------- 视图渲染 ---------- */
  function renderRoundView() {
    stopTimer();
    startTimer();
    state.won = false;
    state.errors = 0;
    state.hints = 0;
    state.zoomIdx = 0;
    state.viewX = 0; state.viewY = 0;
    state.viewW = 480; state.viewH = 320;
    state.scene = pickScene();
    var lv = findLevel(state.level);
    var targets = pickTargets(state.scene, lv.targets);
    state.hides = makeHides(state.scene, targets, lv.hideScale);
    state.curIdx = 0;

    renderHeader('细节搜索');
    clearNode(viewEl);

    // 进度 + 目标
    var bar = makeEl('div', 'target-bar');
    progressEl = makeEl('span', 'tb-num', '1 / ' + state.hides.length);
    targetNameEl = makeEl('span', 'tb-name', '');
    targetCardEl = makeEl('span', 'tb-card');
    bar.appendChild(targetCardEl);
    bar.appendChild(targetNameEl);
    bar.appendChild(progressEl);
    viewEl.appendChild(bar);

    // 场景
    viewEl.appendChild(createSceneSvg(renderSceneSvg()));

    // 缩放/平移工具条
    var tools = makeEl('div', 'tools');
    var zoomRow = makeEl('div', 'zoom-row');
    var bPlus = makeEl('button', 'zt-btn', '🔍 +');
    bPlus.setAttribute('aria-label', '放大');
    bPlus.addEventListener('click', zoomIn);
    var bMinus = makeEl('button', 'zt-btn', '🔍 −');
    bMinus.setAttribute('aria-label', '缩小');
    bMinus.addEventListener('click', zoomOut);
    var zoomLbl = makeEl('span', 'zoom-label', '🔍 1x');
    zoomLbl.id = 'zoom-label';
    var bReset = makeEl('button', 'zt-btn', '🔄 还原');
    bReset.setAttribute('aria-label', '还原视图');
    bReset.addEventListener('click', resetView);
    zoomRow.appendChild(bPlus);
    zoomRow.appendChild(bMinus);
    zoomRow.appendChild(zoomLbl);
    zoomRow.appendChild(bReset);
    tools.appendChild(zoomRow);

    panRow = makeEl('div', 'pan-row');
    panRow.style.display = 'none';
    var panBtns = [['⬆', 0, -1], ['⬇', 0, 1], ['⬅', -1, 0], ['➡', 1, 0]];
    for (var i = 0; i < panBtns.length; i++) {
      (function (b) {
        var btn = makeEl('button', 'zt-btn', b[0]);
        btn.setAttribute('aria-label', '平移');
        btn.addEventListener('click', function () { pan(b[1], b[2]); });
        panRow.appendChild(btn);
      })(panBtns[i]);
    }
    tools.appendChild(panRow);
    viewEl.appendChild(tools);

    // 提示 + 错误计数
    var status = makeEl('div', 'round-status');
    hintBtnEl = makeEl('button', 'hint-btn', '✋ 提示 (' + lv.hintLimit + ')');
    hintBtnEl.setAttribute('aria-label', '提示');
    hintBtnEl.addEventListener('click', useHint);
    errorsEl = makeEl('span', 'err-count', '点错 0');
    var hintCountEl = makeEl('span', 'hint-count', '提示 0/' + lv.hintLimit);
    hintCountEl.id = 'hint-count';
    status.appendChild(hintBtnEl);
    status.appendChild(errorsEl);
    status.appendChild(hintCountEl);
    viewEl.appendChild(status);

    renderTargetBar();
    renderRoundFooter();
  }
  function renderRoundFooter() {
    clearNode(footerEl);
    var btn = makeEl('button', 'btn-back', '← 结束这一局');
    btn.addEventListener('click', function () { showLandingView(); });
    footerEl.appendChild(btn);
  }

  /** 找到后重绘场景（隐藏已找藏物，保留缩放/平移视角） */
  function reRenderScene() {
    var svgEl = document.getElementById('scene-svg');
    if (!svgEl) { return; }
    var outer = svgEl.parentNode;
    // 重新生成场景 SVG（保留 viewBox 状态）
    outer.innerHTML = renderSceneSvg();
    sceneSvgEl = outer.querySelector('#scene-svg');
    bindSceneTaps(sceneSvgEl);
    applyViewBox();
  }

  /* ---------- 通关 / 星级 / 最佳 ---------- */
  function capStars(stars) {
    var lv = findLevel(state.level);
    if (state.hints > 0 && stars > 2) { stars = 2; }
    if (state.hints >= lv.hintLimit) { return 1; }
    if (state.hints > 0) { return Math.min(stars, 2); }
    return stars;
  }
  function calcStars(errors) {
    var s = 3;
    if (errors > 0) { s = errors <= 2 ? 2 : 1; }
    return s;
  }
  function betterThan(sA, msA, sB, msB) {
    if (sA !== sB) { return sA > sB; }
    return msA < msB;
  }
  function starsText(n) {
    var s = '';
    for (var i = 0; i < 3; i++) { s += (i < n) ? '★' : '☆'; }
    return s;
  }
  function onWin() {
    if (state.won) { return; }
    state.won = true;
    stopTimer();
    state.ms = performance.now() - state.startMs;
    sndWin();
    var ms = Math.round(state.ms);
    var errors = state.errors;
    var stars = capStars(calcStars(errors));
    var key = state.level;
    var isNewBest = false;
    var best = store.best[key];
    if (!best || betterThan(stars, ms, best.stars, best.ms)) {
      store.best[key] = { ms: ms, errors: errors, stars: stars, date: fmtDate(new Date()) };
      isNewBest = true;
    }
    store.recent[key] = ms;
    store.history.push({ date: fmtDate(new Date()), level: key, scene: state.scene.name, targets: state.hides.length, errors: errors, hints: state.hints, stars: stars });
    while (store.history.length > 30) { store.history.shift(); }
    doCheckin();
    saveStore();
    var notes = [
      { cls: 'checkin-line', text: '✅ 今日已打卡 · 连续 ' + (store.checkin.streak || 0) + ' 天' }
    ];
    var btns = [
      { text: '🔁 再找一局', cls: 'btn-main', act: function () { restartRound(); } },
      { text: '选难度', cls: 'btn-ghost', act: function () { showLandingView(); } },
      { text: '📅 打卡日历', cls: 'btn-ghost', act: function () { showCheckinView(); } }
    ];
    var sub = '找到 ' + state.hides.length + ' 个 · 点错 ' + errors + ' 次 · 用时 ' + fmtTime(ms) + (state.hints > 0 ? ' · 用了提示' : '');
    showOverlay(stars >= 3 ? '🎉 全部找到！' : '👏 找齐啦！', sub, notes, btns);
    showStarsInOverlay(stars);
    if (isNewBest) { showRecordBadge(); }
  }

  function showStarsInOverlay(stars) {
    if (!overlayEl) { return; }
    var sum = overlayEl.querySelector('.summary');
    if (!sum) { return; }
    var st = makeEl('div', 'stars-line', starsText(stars));
    sum.insertBefore(st, sum.firstChild);
  }
  function showRecordBadge() {
    if (!overlayEl) { return; }
    var sum = overlayEl.querySelector('.summary');
    if (!sum) { return; }
    sum.appendChild(makeEl('div', 'record-badge', '🎉 新纪录！'));
  }

  /* ---------- 浮层 ---------- */
  function hideOverlay() {
    if (overlayEl && overlayEl.parentNode) {
      overlayEl.parentNode.removeChild(overlayEl);
    }
    overlayEl = null;
  }
  function showOverlay(title, sub, noteLines, btns) {
    hideOverlay();
    var ov = makeEl('div', 'overlay');
    var card = makeEl('div', 'overlay-card');
    card.appendChild(makeEl('div', 'overlay-title', title));
    if (sub) { card.appendChild(makeEl('div', 'overlay-sub', sub)); }
    var sum = makeEl('div', 'summary');
    for (var i = 0; i < noteLines.length; i++) {
      sum.appendChild(makeEl('div', noteLines[i].cls, noteLines[i].text));
    }
    card.appendChild(sum);
    var btnsBox = makeEl('div', 'overlay-btns');
    for (var j = 0; j < btns.length; j++) {
      (function (b) {
        var btn = makeEl('button', b.cls, b.text);
        btn.addEventListener('click', function () { b.act(); });
        btnsBox.appendChild(btn);
      })(btns[j]);
    }
    card.appendChild(btnsBox);
    ov.appendChild(card);
    document.body.appendChild(ov);
    overlayEl = ov;
  }

  /* ---------- 难度选择 ---------- */
  function showLandingView() {
    stopTimer();
    hideOverlay();
    state.won = false;
    resetView();
    renderHeader('细节搜索');
    clearNode(viewEl);
    viewEl.appendChild(makeEl('div', 'page-title', '选择难度'));
    viewEl.appendChild(makeEl('div', 'home-hint', '在大图里找到藏起来的指定小物！'));
    var list = makeEl('div', 'diff-list');
    for (var i = 0; i < LEVELS.length; i++) {
      (function (lv) {
        var btn = makeEl('button', 'diff-btn');
        var headEmoji = lv.key === '1' ? '👶' : (lv.key === '2' ? '😊' : '💪');
        var head = makeEl('span', 'diff-head', headEmoji + ' ' + lv.name + ' · 找 ' + lv.targets + ' 个');
        btn.appendChild(head);
        var best = store.best[lv.key];
        var sub = best
          ? '最佳 ' + starsText(best.stars) + ' · ' + fmtTime(best.ms) + ' · 错 ' + best.errors
          : '暂无成绩 · 来挑战！';
        btn.appendChild(makeEl('span', 'diff-sub', sub));
        btn.setAttribute('aria-label', lv.name + '找' + lv.targets + '个');
        btn.addEventListener('click', function () { startGame(lv.key); });
        list.appendChild(btn);
      })(LEVELS[i]);
    }
    viewEl.appendChild(list);
    renderHomeFooter();
  }
  function renderHomeFooter() {
    clearNode(footerEl);
    var btn = makeEl('button', 'btn-back', '📅 打卡日历');
    btn.setAttribute('aria-label', '打卡日历');
    btn.addEventListener('click', showCheckinView);
    footerEl.appendChild(btn);
  }

  function startGame(levelKey) {
    state.level = levelKey;
    renderRoundView();
  }
  function restartRound() {
    hideOverlay();
    stopTimer();
    renderRoundView();
  }

  /* ---------- 打卡 ---------- */
  function doCheckin() {
    if (!store.checkin) { store.checkin = { dates: [], streak: 0 }; }
    var today = fmtDate(new Date());
    var dates = store.checkin.dates || [];
    if (dates.indexOf(today) < 0) { dates.push(today); }
    dates.sort();
    while (dates.length > 365) { dates.shift(); }
    store.checkin.dates = dates;
    store.checkin.streak = calcStreak(dates);
  }
  function calcStreak(dates) {
    if (!dates || dates.length === 0) { return 0; }
    var seen = {};
    for (var i = 0; i < dates.length; i++) { seen[dates[i]] = true; }
    var cur = new Date();
    var streak = 0;
    var d = cur;
    if (!seen[fmtDate(d)]) {
      d = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() - 1);
    }
    while (seen[fmtDate(d)]) {
      streak += 1;
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
    }
    return streak;
  }
  function showCheckinView() {
    hideOverlay();
    stopTimer();
    state.won = false;
    resetView();
    renderHeader('打卡日历');
    clearNode(viewEl);
    var card = makeEl('div', 'calendar');
    card.appendChild(makeEl('div', 'page-title', '本月打卡'));
    var grid = makeEl('div', 'calendar-grid');
    var now = new Date();
    var days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var t = fmtDate(now);
    var dates = store.checkin.dates || [];
    for (var d2 = 1; d2 <= days; d2++) {
      (function (day) {
        var ds = fmtDate(new Date(now.getFullYear(), now.getMonth(), day));
        var el = makeEl('div', 'cal-day', '' + day);
        if (dates.indexOf(ds) !== -1) { el.className = 'cal-day done'; }
        if (ds === t) { el.className += ' today'; }
        grid.appendChild(el);
      })(d2);
    }
    card.appendChild(grid);
    var streak = calcStreak(dates);
    var info = makeEl('div', 'streak-info');
    info.appendChild(document.createTextNode('连续打卡 '));
    var b = makeEl('b', '', '' + streak);
    info.appendChild(b);
    info.appendChild(document.createTextNode(' 天' + (streak >= 7 ? ' 🎉' : '')));
    card.appendChild(info);
    viewEl.appendChild(card);
    clearNode(footerEl);
    var btnBack = makeEl('button', 'btn-back', '← 返回难度');
    btnBack.setAttribute('aria-label', '返回难度选择');
    btnBack.addEventListener('click', showLandingView);
    footerEl.appendChild(btnBack);
  }

  /* ---------- 测试钩子 ---------- */
  window.XJSS = {
    getState: function () { return state; },
    forceWin: function () { onWin(); },
    zoomIn: function () { zoomIn(); },
    zoomOut: function () { zoomOut(); },
    pan: function (dx, dy) { pan(dx, dy); },
    resetView: function () { resetView(); }
  };

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
  showLandingView();
})();