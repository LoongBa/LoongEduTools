/* ============================================================
   七巧板 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   数据：window.TAN（tangram.js）
     shapes:   { pa, bigA, bigB, smA, smB, sq, med } 每块 { pts(质心为原点), color }
     puzzles:  [{ name, level(0简单/1进阶/2挑战), scale, outline(剪影多段), targets }]
     targets:  { key: {x, y, rot} }（已缩放到 320 区；渲染块 = translate(x,y) rotate(rot) scale(scale)）
   功能：
   - 首页三档分组选图案（outline 缩略 + 完成标记 + 最佳成绩）
   - 拖拽拼块 + 点选旋转 45° + 磁吸归位（位置+角度容差）
   - 难度提示：简单=分块占位 / 进阶=整体剪影 / 挑战=缩略参考
   - 提示（封顶 2 次）/ 重置 / 计时 / 星级 / 打卡 / 成绩历史
   设计约束：
   - 无 import/export、无 ?. ??、事件全 addEventListener、无 eval/内联
   - 计时用 Date.now() + interval 差值刷新（后台回来仍准）
   - 块命中测试：逆 transform（scale→rotate→translate）后射线法
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };
  var TAN = window.TAN;
  if (!TAN) { return; }
  var SHAPES = TAN.shapes;
  var PUZZLES = TAN.puzzles;
  var ORDER = ['bigA', 'bigB', 'med', 'sq', 'pa', 'smA', 'smB'];  // 块 key 顺序
  var LEVEL_LABEL = ['简单', '进阶', '挑战'];
  var LEVEL_HINT = ['分块占位', '整体剪影', '缩略参考'];
  var GAME = 320;               // 游戏区 viewBox
  var SNAP = 24;                // 磁吸位置容差（px，320 区）
  var ANGLE_TOL = 22.5;         // 磁吸角度容差（°）
  var MAX_HINT = 2;             // 提示封顶
  var LS_KEY = 'redtools.tangram.v1';

  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');
  var footerEl = document.getElementById('app-footer');

  var state = {
    view: 'home',              // home | game | result
    pz: null,                  // 当前图案
    pieces: [],                // [{i, key, x, y, rot, placed}]
    placed: 0,
    hints: 0,
    selected: -1,
    hintTgt: -1,
    startTs: 0,
    elapsed: 0,
    timerId: null,
    dragging: false,
    dragIdx: -1,
    dragDX: 0,
    dragDY: 0
  };

  /* ---------- 持久化 ---------- */
  function loadRec() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) { return JSON.parse(raw); }
    } catch (err) { /* ignore */ }
    return { best: {}, done: {}, total: 0, checkin: { dates: [], streak: 0 }, history: [] };
  }
  function saveRec(rec) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(rec)); } catch (err) { /* ignore */ }
  }
  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function todayStr() {
    var d = new Date();
    return '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
  }
  function dateStr(d) {
    return '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
  }
  function calcStreak(dates) {
    var streak = 0;
    var d = new Date();
    for (var i = dates.length - 1; i >= 0; i--) {
      if (dates[i] === todayStr()) { streak = 1; continue; }
      d.setDate(d.getDate() - 1);
      if (dates[i] === dateStr(d)) { streak += 1; }
      else { break; }
    }
    return streak;
  }

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
  function fmtTime(sec) {
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  /* 块参考点相对坐标 → 屏幕坐标（pz.scale） */
  function ptsStr(key, pz) {
    var pts = SHAPES[key].pts;
    var s = pz.scale;
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      out.push((pts[i][0] * s).toFixed(1) + ',' + (pts[i][1] * s).toFixed(1));
    }
    return out.join(' ');
  }

  /* ---------- 视图：首页 ---------- */
  /* 彩色缩略图：7 块彩色拼图（用 targets + shapes 渲染，比纯剪影直观） */
  function pzThumbSvg(pz) {
    var parts = [];
    for (var i = 0; i < ORDER.length; i++) {
      var key = ORDER[i];
      var t = pz.targets[key];
      var sh = SHAPES[key];
      var p = [];
      for (var j = 0; j < sh.pts.length; j++) {
        p.push(sh.pts[j][0].toFixed(1) + ',' + sh.pts[j][1].toFixed(1));
      }
      parts.push('<g transform="translate(' + t.x.toFixed(1) + ',' + t.y.toFixed(1) +
        ') rotate(' + t.rot + ') scale(' + pz.scale.toFixed(4) + ')">' +
        '<polygon points="' + p.join(' ') + '" fill="' + sh.color +
        '" stroke="#ffffff" stroke-width="2" vector-effect="non-scaling-stroke"/></g>');
    }
    return '<svg viewBox="0 0 ' + GAME + ' ' + GAME + '" class="thumb-svg">' + parts.join('') + '</svg>';
  }

  function showHome() {
    state.view = 'home';
    clearNode(viewEl);
    var rec = loadRec();
    viewEl.appendChild(makeEl('div', 'page-title', '七巧板'));
    viewEl.appendChild(makeEl('div', 'home-hint', '7 块拼板 · 拼出指定图案'));
    for (var lv = 0; lv < 3; lv++) {
      var sec = makeEl('div', 'level-section');
      sec.appendChild(makeEl('div', 'level-head', LEVEL_LABEL[lv] + ' · ' + LEVEL_HINT[lv]));
      var grid = makeEl('div', 'puzzle-grid');
      for (var i = 0; i < PUZZLES.length; i++) {
        if (PUZZLES[i].level !== lv) { continue; }
        (function (pi) {
          var pz = PUZZLES[pi];
          var card = makeEl('div', 'puzzle-card');
          if (rec.done && rec.done[pz.name]) { card.className += ' done'; }
          var box = makeEl('div', 'thumb-box');
          box.innerHTML = pzThumbSvg(pz);
          card.appendChild(box);
          card.appendChild(makeEl('div', 'pc-name', pz.name));
          var best = rec.best && rec.best[pz.name];
          var meta = makeEl('div', 'pc-meta', best ? '最佳 ' + fmtTime(best.time) : '未挑战');
          card.appendChild(meta);
          card.addEventListener('click', function () { startGame(pi); });
          grid.appendChild(card);
        })(i);
      }
      sec.appendChild(grid);
      viewEl.appendChild(sec);
    }
    renderFooterNav();
  }

  /* ---------- 视图：游戏 ---------- */
  function startGame(pi) {
    state.view = 'game';
    state.pz = PUZZLES[pi];
    state.placed = 0;
    state.hints = 0;
    state.selected = -1;
    state.hintTgt = -1;
    state.startTs = Date.now();
    state.elapsed = 0;
    state.pieces = buildPieces();
    renderHeader(state.pz.name + ' · ' + LEVEL_LABEL[state.pz.level], true);
    clearNode(viewEl);
    renderGame();
    renderFooterHint();
    startTimer();
  }

  /* 初始散落：按块尺寸排布（大三角分两端、小件错位中间，减少最大重叠） */
  function buildPieces() {
    var pos = {
      bigA: [55, 255], bigB: [265, 255],   // 大三角两端
      med:  [125, 243], sq: [195, 243],    // 上排中间
      pa:   [85, 302], smA: [160, 302], smB: [235, 302]  // 下排
    };
    var out = [];
    for (var i = 0; i < ORDER.length; i++) {
      var key = ORDER[i];
      var sp = pos[key];
      out.push({ i: i, key: key, x: sp[0], y: sp[1],
                 rot: (i * 45) % 360, placed: false });
    }
    return out;
  }

  function renderHeader(title, withBack) {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    brand.appendChild(makeEl('span', 'header-title', title));
    if (APP.meta && APP.meta.version) {
      brand.appendChild(makeEl('span', 'header-ver', 'v' + APP.meta.version));
    }
    headerEl.appendChild(brand);
    if (withBack) {
      var back = makeEl('button', 'game-back', '‹ 返回');
      back.addEventListener('click', function () { showHome(); });
      headerEl.appendChild(back);
    }
  }

  function renderGame() {
    var pz = state.pz;
    var top = makeEl('div', 'game-top');
    top.appendChild(makeEl('div', 'game-name', pz.name));
    var timerEl = makeEl('div', 'game-timer', '⏱ 0:00');
    timerEl.id = 'game-timer';
    top.appendChild(timerEl);
    var placedEl = makeEl('div', 'game-placed', '已拼 0/7');
    placedEl.id = 'game-placed';
    top.appendChild(placedEl);
    viewEl.appendChild(top);

    // 挑战档：顶部缩略参考图
    if (pz.level === 2) {
      var ref = makeEl('div', 'ref-row');
      var tbox = makeEl('div', 'ref-thumb');
      tbox.innerHTML = pzThumbSvg(pz);
      ref.appendChild(tbox);
      viewEl.appendChild(ref);
    }

    // SVG 游戏区
    var svgWrap = makeEl('div', 'board-wrap');
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + GAME + ' ' + GAME);
    svg.id = 'board';
    var layerHint = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    layerHint.id = 'layer-hint';
    var layerPieces = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    layerPieces.id = 'layer-pieces';
    svg.appendChild(layerHint);
    svg.appendChild(layerPieces);
    svgWrap.appendChild(svg);
    viewEl.appendChild(svgWrap);

    // 工具栏
    var bar = makeEl('div', 'toolbar');
    var mkBtn = function (id, text, fn) {
      var b = makeEl('button', 'tool-btn', text);
      b.id = id;
      b.addEventListener('click', fn);
      bar.appendChild(b);
      return b;
    };
    mkBtn('btn-rotate', '↻ 旋转', onRotate);
    mkBtn('btn-hint', '💡 提示', onHint);
    mkBtn('btn-reset', '重置', onReset);
    viewEl.appendChild(bar);

    // 交互
    svg.addEventListener('pointerdown', onPointerDown);
    svg.addEventListener('pointermove', onPointerMove);
    svg.addEventListener('pointerup', onPointerUp);
    svg.addEventListener('pointercancel', onPointerUp);

    render();
  }

  function renderFooterHint() {
    clearNode(footerEl);
    footerEl.appendChild(makeEl('div', 'foot-hint', '拖拽拼块 · 点选后 ↻ 旋转 45°'));
  }

  /* ---------- 渲染 ---------- */
  function render() {
    if (state.view !== 'game') { return; }
    var svg = document.getElementById('board');
    if (!svg) { return; }
    var hintLayer = document.getElementById('layer-hint');
    var pieceLayer = document.getElementById('layer-pieces');
    var pz = state.pz;

    // 目标提示层
    var h = '';
    if (pz.level === 0) {
      // 分块占位：7 块目标虚线描边
      for (var i = 0; i < ORDER.length; i++) {
        var key = ORDER[i];
        var t = pz.targets[key];
        h += '<g transform="translate(' + t.x.toFixed(1) + ',' + t.y.toFixed(1) +
          ') rotate(' + t.rot + ') scale(' + pz.scale.toFixed(4) + ')">' +
          '<polygon points="' + ptsStr(key, { scale: 1 }) +
          '" fill="rgba(21,101,192,0.08)" stroke="#90caf9" stroke-width="1.6" stroke-dasharray="6,4" vector-effect="non-scaling-stroke"/></g>';
      }
    } else if (pz.level === 1) {
      // 整体剪影（加深：半透明填充 + 深蓝描边，保证可辨）
      for (var k = 0; k < pz.outline.length; k++) {
        var op = pz.outline[k];
        var p = [];
        for (var j = 0; j < op.length; j++) {
          p.push(op[j][0].toFixed(1) + ',' + op[j][1].toFixed(1));
        }
        h += '<polygon points="' + p.join(' ') + '" fill="rgba(21,101,192,0.25)" stroke="#5b9bd5" stroke-width="2"/>';
      }
    }
    // 提示高亮（下一块目标位闪烁）
    if (state.hintTgt >= 0) {
      var tk = ORDER[state.hintTgt];
      var tt = pz.targets[tk];
      h += '<g transform="translate(' + tt.x.toFixed(1) + ',' + tt.y.toFixed(1) +
        ') rotate(' + tt.rot + ') scale(' + pz.scale.toFixed(4) + ')">' +
        '<polygon points="' + ptsStr(tk, { scale: 1 }) +
        '" fill="rgba(255,193,7,0.5)" stroke="#f9a825" stroke-width="3" class="hint-pulse" vector-effect="non-scaling-stroke"/></g>';
    }
    hintLayer.innerHTML = h;

    // 块层
    var piecesHtml = '';
    for (var m = 0; m < state.pieces.length; m++) {
      piecesHtml += pieceSvg(state.pieces[m]);
    }
    pieceLayer.innerHTML = piecesHtml;

    // 更新计数
    var placedEl = document.getElementById('game-placed');
    if (placedEl) { placedEl.textContent = '已拼 ' + state.placed + '/7'; }
  }

  function pieceSvg(p) {
    var sh = SHAPES[p.key];
    var fill = sh.color;
    var stroke = '#ffffff';
    var sw = 3;
    var cls = 'piece' + (p.placed ? ' placed' : '');
    if (!p.placed) { fill = sh.color; }
    if (state.selected === p.i && !p.placed) {
      cls += ' selected';
      stroke = '#1976d2';
      sw = 3.5;
    }
    return '<g class="' + cls + '" data-i="' + p.i + '" transform="translate(' +
      p.x.toFixed(1) + ',' + p.y.toFixed(1) + ') rotate(' + p.rot + ') scale(' +
      state.pz.scale.toFixed(4) + ')">' +
      '<polygon points="' + ptsStr(p.key, { scale: 1 }) + '" fill="' + fill +
      '" stroke="' + stroke + '" stroke-width="' + sw +
      '" vector-effect="non-scaling-stroke"/></g>';
  }

  /* ---------- 交互 ---------- */
  function toLogical(e) {
    var svg = document.getElementById('board');
    var rect = svg.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * GAME / rect.width,
             y: (e.clientY - rect.top) * GAME / rect.height };
  }

  function pointInPiece(lx, ly, p) {
    var sh = SHAPES[p.key];
    var s = state.pz.scale;
    var dx = (lx - p.x) / s;
    var dy = (ly - p.y) / s;
    var r = -p.rot * Math.PI / 180;
    var cos = Math.cos(r), sin = Math.sin(r);
    var lx2 = dx * cos - dy * sin;
    var ly2 = dx * sin + dy * cos;
    return pointInPoly(lx2, ly2, sh.pts);
  }

  function pointInPoly(x, y, pts) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1];
      var xj = pts[j][0], yj = pts[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  function hitTest(lx, ly) {
    for (var i = state.pieces.length - 1; i >= 0; i--) {
      var p = state.pieces[i];
      if (!p.placed && pointInPiece(lx, ly, p)) { return i; }
    }
    return -1;
  }

  function onPointerDown(e) {
    if (state.view !== 'game') { return; }
    e.preventDefault();
    var pos = toLogical(e);
    var idx = hitTest(pos.x, pos.y);
    if (idx >= 0) {
      state.dragging = true;
      state.dragIdx = idx;
      state.dragDX = state.pieces[idx].x - pos.x;
      state.dragDY = state.pieces[idx].y - pos.y;
      state.selected = idx;
      // 提到最上层
      var arr = state.pieces;
      var picked = arr.splice(idx, 1)[0];
      arr.push(picked);
      state.dragIdx = arr.length - 1;
      render();
    } else {
      state.dragging = false;
      state.selected = -1;
      render();
    }
  }

  function onPointerMove(e) {
    if (!state.dragging || state.dragIdx < 0) { return; }
    e.preventDefault();
    var pos = toLogical(e);
    var p = state.pieces[state.dragIdx];
    p.x = pos.x + state.dragDX;
    p.y = pos.y + state.dragDY;
    render();
  }

  function onPointerUp(e) {
    if (!state.dragging) { return; }
    e.preventDefault();
    state.dragging = false;
    var idx = state.dragIdx;
    if (idx >= 0) {
      trySnap(state.pieces[idx]);
      state.dragIdx = -1;
    }
    render();
  }

  /* 旋转选中块 45° → 磁吸检查 */
  function onRotate() {
    if (state.view !== 'game') { return; }
    if (state.selected < 0) { flashMsg('先点选一块拼板'); return; }
    var p = state.pieces[state.selected];
    p.rot = (p.rot + 45) % 360;
    trySnap(p);
    render();
  }

  /* 磁吸：位置距离 < SNAP 且角度差（45° 模）< ANGLE_TOL → 吸附归位 */
  function trySnap(p) {
    var t = state.pz.targets[p.key];
    var dx = p.x - t.x;
    var dy = p.y - t.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var dAng = Math.abs(((p.rot - t.rot) % 360 + 360) % 360);
    if (dAng > 180) { dAng = 360 - dAng; }
    dAng = dAng % 45;
    if (dAng > 22.5) { dAng = 45 - dAng; }
    if (dist < SNAP && dAng < ANGLE_TOL) {
      if (!p.placed) {
        p.placed = true;
        state.placed += 1;
      }
      p.x = t.x;
      p.y = t.y;
      p.rot = t.rot;
    } else {
      if (p.placed) {
        p.placed = false;
        state.placed -= 1;
      }
    }
    if (state.placed === 7) { finishGame(); }
  }

  /* 提示：高亮第一块未归位块的目标位（封顶 2 次） */
  function onHint() {
    if (state.view !== 'game') { return; }
    if (state.hints >= MAX_HINT) { flashMsg('提示次数已用完'); return; }
    var target = -1;
    for (var i = 0; i < state.pieces.length; i++) {
      if (!state.pieces[i].placed) { target = i; break; }
    }
    if (target < 0) { return; }
    state.hints += 1;
    state.hintTgt = target;
    render();
    var btn = document.getElementById('btn-hint');
    if (btn) { btn.textContent = '💡 提示 (' + state.hints + '/' + MAX_HINT + ')'; }
    window.setTimeout(function () {
      state.hintTgt = -1;
      render();
    }, 1500);
  }

  function onReset() {
    if (state.view !== 'game') { return; }
    state.pieces = buildPieces();
    state.placed = 0;
    state.hints = 0;
    state.selected = -1;
    state.hintTgt = -1;
    state.startTs = Date.now();
    var btn = document.getElementById('btn-hint');
    if (btn) { btn.textContent = '💡 提示'; }
    render();
  }

  function flashMsg(msg) {
    var el = document.createElement('div');
    el.className = 'flash-msg';
    el.textContent = msg;
    document.body.appendChild(el);
    window.setTimeout(function () {
      if (el.parentNode) { el.parentNode.removeChild(el); }
    }, 1200);
  }

  /* ---------- 计时 ---------- */
  function startTimer() {
    if (state.timerId) { clearInterval(state.timerId); }
    state.timerId = setInterval(function () {
      if (state.view !== 'game') { return; }
      var el = document.getElementById('game-timer');
      if (!el) { return; }
      el.textContent = '⏱ ' + fmtTime((Date.now() - state.startTs) / 1000);
    }, 250);
  }
  function stopTimer() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
  }

  /* ---------- 结算 ---------- */
  function finishGame() {
    if (state.view !== 'game') { return; }
    stopTimer();
    state.elapsed = (Date.now() - state.startTs) / 1000;

    // 打卡
    var rec = loadRec();
    var t = todayStr();
    var dates = rec.checkin.dates;
    if (dates.indexOf(t) === -1) { dates.push(t); }
    dates.sort();
    while (dates.length > 365) { dates.shift(); }
    rec.checkin.streak = calcStreak(dates);

    // 星级：0 提示 3★ / 提示 ≤2 次 2★ / 1★
    var stars = state.hints === 0 ? 3 : (state.hints <= MAX_HINT ? 2 : 1);

    // 最佳 / 完成标记 / 历史
    var name = state.pz.name;
    var best = rec.best[name];
    var isNewBest = false;
    if (!best || state.elapsed < best.time) {
      rec.best[name] = { time: Math.round(state.elapsed), stars: stars, hints: state.hints };
      isNewBest = true;
    }
    rec.done[name] = true;
    rec.total = (rec.total || 0) + 1;
    rec.history.unshift({ date: t, name: name, level: state.pz.level,
                          time: Math.round(state.elapsed), stars: stars, hints: state.hints });
    while (rec.history.length > 30) { rec.history.pop(); }
    saveRec(rec);

    state.view = 'result';
    renderResult(stars, isNewBest);
  }

  function renderResult(stars, isNewBest) {
    var rec = loadRec();
    var name = state.pz.name;
    var best = rec.best[name];
    clearNode(viewEl);
    var box = makeEl('div', 'result-box');
    box.appendChild(makeEl('div', 'result-title', '拼好啦！'));
    var starsEl = makeEl('div', 'result-stars', '');
    for (var i = 1; i <= 3; i++) {
      starsEl.appendChild(makeEl('span', i <= stars ? '' : 'off', '★'));
    }
    box.appendChild(starsEl);
    box.appendChild(makeEl('div', 'result-time', fmtTime(state.elapsed)));
    var stats = makeEl('div', 'result-stats');
    stats.appendChild(mkStat('提示', state.hints + ' 次'));
    stats.appendChild(mkStat('星级', stars + '★'));
    stats.appendChild(mkStat('完成', rec.total + ' 次'));
    box.appendChild(stats);
    if (best) {
      box.appendChild(makeEl('div', 'result-best', '本图案最佳 ' + fmtTime(best.time) + '（' + best.stars + '★）'));
    }
    if (isNewBest) {
      box.appendChild(makeEl('div', 'result-record', '🎉 新纪录！'));
    }
    box.appendChild(makeEl('div', 'result-streak', '连续打卡 ' + rec.checkin.streak + ' 天' + (rec.checkin.streak >= 7 ? ' 🎉' : '')));
    var again = makeEl('button', 'btn btn-primary', '再来一局');
    again.addEventListener('click', function () { startGame(puzzleIndexByName(name)); });
    box.appendChild(again);
    var next = makeEl('button', 'btn', '下一个图案');
    next.addEventListener('click', function () { startGame((puzzleIndexByName(name) + 1) % PUZZLES.length); });
    box.appendChild(next);
    var home = makeEl('button', 'btn', '返回首页');
    home.addEventListener('click', function () { showHome(); });
    box.appendChild(home);
    viewEl.appendChild(box);
    clearNode(footerEl);
  }

  function mkStat(label, val) {
    var s = makeEl('div', 'result-stat');
    s.appendChild(makeEl('b', '', val));
    s.appendChild(makeEl('span', '', label));
    return s;
  }
  function puzzleIndexByName(name) {
    for (var i = 0; i < PUZZLES.length; i++) {
      if (PUZZLES[i].name === name) { return i; }
    }
    return 0;
  }

  /* ---------- 成绩历史 ---------- */
  function viewHistory() {
    state.view = 'history';
    renderHeader('成绩', false);
    clearNode(viewEl);
    var rec = loadRec();
    var h = rec.history;
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
      left.appendChild(makeEl('div', 'point-name', r.name));
      left.appendChild(makeEl('div', 'point-meta', r.date + ' · ' + LEVEL_LABEL[r.level] + ' · 提示 ' + r.hints));
      item.appendChild(left);
      var right = makeEl('div', 'point-right');
      right.appendChild(makeEl('div', 'point-time', fmtTime(r.time)));
      right.appendChild(makeEl('div', 'point-stars', '★★★'.slice(0, r.stars)));
      item.appendChild(right);
      list.appendChild(item);
    });
    viewEl.appendChild(list);
    renderFooterNav();
  }

  /* ---------- 打卡日历 ---------- */
  function viewCheckin() {
    state.view = 'checkin';
    renderHeader('打卡日历', false);
    clearNode(viewEl);
    var rec = loadRec();
    var card = makeEl('div', 'calendar');
    card.appendChild(makeEl('div', 'page-title', '本月打卡'));
    var grid = makeEl('div', 'calendar-grid');
    var now = new Date();
    var days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var t = todayStr();
    var dates = rec.checkin.dates;
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
    var streak = calcStreak(rec.checkin.dates);
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
    clearNode(footerEl);
    var nav = makeEl('div', 'footer-nav');
    var mk = function (label, fn) {
      var b = makeEl('div', 'footer-btn', label);
      b.addEventListener('click', fn);
      return b;
    };
    nav.appendChild(mk('成绩', function () { viewHistory(); }));
    nav.appendChild(mk('打卡', function () { viewCheckin(); }));
    nav.appendChild(mk('首页', function () { showHome(); }));
    footerEl.appendChild(nav);
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
  showHome();

  /* 测试钩子（冒烟用） */
  window.__tan = {
    state: state,
    PUZZLES: PUZZLES,
    SHAPES: SHAPES,
    ORDER: ORDER,
    startGame: startGame,
    trySnap: trySnap,
    buildPieces: buildPieces,
    showHome: showHome,
    viewHistory: viewHistory,
    viewCheckin: viewCheckin,
    render: render,
    finishGame: finishGame,
    loadRec: loadRec
  };
})();
