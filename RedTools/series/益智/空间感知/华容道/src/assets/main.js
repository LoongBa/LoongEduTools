/* 华容道 v1.0 — 经典滑块拼图（儿童向，三国卡通角色）
 * 盘面 4×5，出口底部中央；曹操 2×2 抵达 (3,1) 即胜。
 * 交互：点选棋子 → 方向箭头移动（每步一格）；也支持手指滑动。
 * 复用益智通用闭环：计时 + 步数 + 星级（BFS 基准）+ 打卡 + 各关最佳。
 * Chrome 61 兼容：经典脚本 ES2017，无 fetch/eval/module，事件 addEventListener。
 */
(function () {
  'use strict';

  /* ---------- 数据 ---------- */
  var LEVELS = (window.HRD && window.HRD.levels) || [];
  var CHARACTERS = window.CHARACTERS || {};

  var CHAR_META = {
    cao:        { name: '曹操', key: 'caoCao' },
    guan:       { name: '关羽', key: 'guanYu' },
    zhang:      { name: '张飞', key: 'zhangFei' },
    zhaoyun:    { name: '赵云', key: 'zhaoYun' },
    machao:     { name: '马超', key: 'maChao' },
    huangzhong: { name: '黄忠', key: 'huangZhong' },
    soldier:    { name: '兵',   key: 'soldier' }
  };
  var CHAR_KEYS = { c: 'cao', g: 'guan', z: 'zhang', y: 'zhaoyun', m: 'machao', h: 'huangzhong', b: 'soldier' };
  var PIECE_W = { cao: 2, guan: 2, zhang: 1, zhaoyun: 1, machao: 1, huangzhong: 1, soldier: 1 };
  var PIECE_H = { cao: 2, guan: 1, zhang: 2, zhaoyun: 2, machao: 2, huangzhong: 2, soldier: 1 };

  var ROWS = 5, COLS = 4, EXIT_R = 3, EXIT_C = 1;
  var STORE_KEY = 'redtools.hrd.v1';
  LX_SHARED.storage.configure({ toolName: 'hrd' });  // V0.4 迁移：键前缀 redtools.hrd.v1
  var META = (window.APP_DATA && window.APP_DATA.meta) || { name: '华容道', version: '1.0' };

  /* ---------- 状态 ---------- */
  var S = {
    view: 'home',        // home | game | result
    levelIdx: 0,
    pieces: {},          // { id: {r, c} }  尺寸查 PIECE_W/H
    selected: null,      // 选中棋子 id
    moves: 0,
    t0: 0,
    timerId: 0,
    elapsed: 0,
    won: false
  };

  /* ---------- 本地存储 ---------- */
  function loadStore() {
    try {
      var raw = LX_SHARED.storage.get('v1');
      if (raw) return raw;
    } catch (e) { /* ignore */ }
    return { best: {}, checkin: { dates: [], streak: 0 }, history: [] };
  }
  var store = loadStore();
  function saveStore() {
    try { LX_SHARED.storage.set('v1', store); } catch (e) { /* ignore */ }
  }
  function today() {
    var d = new Date();
    return '' + d.getFullYear() + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + (d.getDate() < 10 ? '0' : '') + d.getDate();
  }
  function calcStreak() {
    return LX_SHARED.progress.streak(store.checkin.dates);
}
  function doCheckin() {
    var t = today();
    var dates = store.checkin.dates;
    if (dates.indexOf(t) < 0) {
      dates.push(t);
      dates.sort();
      if (dates.length > 365) dates.splice(0, dates.length - 365);
    }
    store.checkin.streak = calcStreak();
    saveStore();
  }

  /* ---------- 板面模型 ---------- */
  function parseBoard(board) {
    var pieces = {};
    var claimed = {};
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var ch = board[r].charAt(c);
        if (ch === '.' || claimed[r + ',' + c]) continue;
        var id = CHAR_KEYS[ch];
        var w = PIECE_W[id], h = PIECE_H[id];
        var n = 1;
        if (id === 'soldier') {
          // 小兵编号（保持确定性：按扫描顺序）
          n = Object.keys(pieces).filter(function (k) { return k.indexOf('soldier') === 0; }).length + 1;
          id = 'soldier' + n;
        }
        for (var dr = 0; dr < h; dr++) {
          for (var dc = 0; dc < w; dc++) {
            claimed[(r + dr) + ',' + (c + dc)] = true;
          }
        }
        pieces[id] = { r: r, c: c, type: (id.indexOf('soldier') === 0 ? 'soldier' : id) };
      }
    }
    return pieces;
  }

  function occupancy() {
    var occ = {};
    Object.keys(S.pieces).forEach(function (id) {
      var p = S.pieces[id];
      var w = PIECE_W[p.type], h = PIECE_H[p.type];
      for (var dr = 0; dr < h; dr++) {
        for (var dc = 0; dc < w; dc++) {
          occ[(p.r + dr) + ',' + (p.c + dc)] = id;
        }
      }
    });
    return occ;
  }

  function canMove(id, dr, dc) {
    var p = S.pieces[id];
    if (!p) return false;
    var w = PIECE_W[p.type], h = PIECE_H[p.type];
    var nr = p.r + dr, nc = p.c + dc;
    if (nr < 0 || nc < 0 || nr + h > ROWS || nc + w > COLS) return false;
    var occ = occupancy();
    for (var rr = 0; rr < h; rr++) {
      for (var cc = 0; cc < w; cc++) {
        var cell = (nr + rr) + ',' + (nc + cc);
        if (occ[cell] && occ[cell] !== id) return false;
      }
    }
    return true;
  }

  function movableDirs(id) {
    var dirs = [];
    if (canMove(id, -1, 0)) dirs.push('up');
    if (canMove(id, 1, 0)) dirs.push('down');
    if (canMove(id, 0, -1)) dirs.push('left');
    if (canMove(id, 0, 1)) dirs.push('right');
    return dirs;
  }

  function movePiece(id, dr, dc) {
    if (!canMove(id, dr, dc)) return false;
    S.pieces[id].r += dr;
    S.pieces[id].c += dc;
    S.moves++;
    return true;
  }

  function isWin() {
    var cao = S.pieces.cao;
    return cao && cao.r === EXIT_R && cao.c === EXIT_C;
  }

  function startLevel(idx) {
    var lv = LEVELS[idx];
    S.levelIdx = idx;
    S.pieces = parseBoard(lv.board);
    S.selected = null;
    S.moves = 0;
    S.won = false;
    S.elapsed = 0;
    S.t0 = performance.now();
    clearInterval(S.timerId);
    S.timerId = setInterval(tick, 100);
    S.view = 'game';
    render();
  }

  function tick() {
    if (S.view !== 'game') return;
    S.elapsed = Math.round((performance.now() - S.t0) / 100) / 10;
    var el = document.getElementById('hrd-timer');
    if (el) el.textContent = fmtTime(S.elapsed);
  }

  function fmtTime(ms) {
    var sec = Math.floor(ms);
    var tenth = Math.floor((ms - sec) * 10);
    return sec + '.' + tenth;
  }

  function finishLevel() {
    S.won = true;
    clearInterval(S.timerId);
    S.elapsed = Math.round((performance.now() - S.t0) / 100) / 10;
    var lv = LEVELS[S.levelIdx];
    var stars = 1;
    if (lv.min !== null && lv.min !== undefined) {
      if (S.moves <= lv.star3) stars = 3;
      else if (S.moves <= lv.star2) stars = 2;
    } else {
      stars = 2; // 无基准：通关 2 星封顶
    }
    // 记录最佳
    var best = store.best[lv.id];
    if (!best || S.moves < best.moves) {
      store.best[lv.id] = { moves: S.moves, ms: S.elapsed, stars: stars, date: today() };
    } else if (best.stars < stars) {
      store.best[lv.id] = { moves: S.moves, ms: S.elapsed, stars: stars, date: today() };
    }
    store.history.push({ date: today(), level: lv.id, moves: S.moves, stars: stars });
    if (store.history.length > 30) store.history.splice(0, store.history.length - 30);
    saveStore();
    S.view = 'result';
    render();
  }

  /* ---------- 渲染 ---------- */
  var viewEl = null;
  function $(id) { return document.getElementById(id); }

  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html !== undefined) d.innerHTML = html;
    return d;
  }

  function render() {
    viewEl = $('view');
    viewEl.innerHTML = '';
    if (S.view === 'home') renderHome();
    else if (S.view === 'game') renderGame();
    else renderResult();
  }

  function renderHome() {
    var wrap = el('div', 'home-wrap');
    var title = el('div', 'home-title', '🏰 华容道');
    var sub = el('div', 'home-sub', '救出曹操 · 经典滑块练习');
    wrap.appendChild(title); wrap.appendChild(sub);
    var list = el('div', 'level-list');
    var streak = store.checkin.streak || 0;
    LEVELS.forEach(function (lv, i) {
      var best = store.best[lv.id];
      var unlocked = i === 0 || !!store.best[LEVELS[i - 1].id];
      var card = el('div', 'level-card' + (unlocked ? '' : ' locked') + (best ? ' done' : ''));
      var starsTxt = best ? starStr(best.stars) : (unlocked ? '☆☆☆' : '🔒');
      var info = unlocked
        ? (best ? ('最佳 ' + best.moves + ' 步 · ' + best.ms + 's') : ('目标：救出曹操 · 最少 ' + lv.min + ' 步'))
        : '先通关上一关';
      card.innerHTML =
        '<div class="lv-num">' + (i + 1) + '</div>' +
        '<div class="lv-name">' + lv.name + '</div>' +
        '<div class="lv-stars">' + starsTxt + '</div>' +
        '<div class="lv-info">' + info + '</div>';
      if (unlocked) {
        card.addEventListener('click', function () { startLevel(i); });
      }
      list.appendChild(card);
    });
    wrap.appendChild(list);
    // 打卡区
    var foot = el('div', 'home-foot');
    foot.innerHTML = '🔥 连续打卡 ' + streak + ' 天';
    wrap.appendChild(foot);
    viewEl.appendChild(wrap);
  }

  function starStr(n) {
    var s = '';
    for (var i = 0; i < n; i++) s += '⭐';
    for (var j = n; j < 3; j++) s += '☆';
    return s;
  }

  function renderGame() {
    var lv = LEVELS[S.levelIdx];
    var wrap = el('div', 'game-wrap');
    // 顶栏
    var bar = el('div', 'game-bar');
    bar.innerHTML = '<button class="g-btn" id="hrd-back">‹ 选关</button>' +
      '<div class="g-title">' + lv.name + '</div>' +
      '<div class="g-stats"><span id="hrd-timer">0.0</span>s · <span id="hrd-moves">0</span>步</div>';
    wrap.appendChild(bar);
    // 盘面
    var boardEl = el('div', 'board');
    var occ = occupancy();
    // 出口标记（底部中央 2×2）
    var exitEl = el('div', 'exit-mark');
    exitEl.style.left = (EXIT_C * 25) + '%';
    exitEl.style.top = (EXIT_R * 20) + '%';
    exitEl.style.width = '50%';
    exitEl.style.height = '40%';
    exitEl.innerHTML = '<span>出口</span>';
    boardEl.appendChild(exitEl);
    // 棋子
    Object.keys(S.pieces).forEach(function (id) {
      var p = S.pieces[id];
      var w = PIECE_W[p.type], h = PIECE_H[p.type];
      var meta = CHAR_META[p.type];
      var tile = el('div', 'tile tile-' + p.type + (S.selected === id ? ' sel' : ''));
      tile.style.left = (p.c * 25) + '%';
      tile.style.top = (p.r * 20) + '%';
      tile.style.width = (w * 25) + '%';
      tile.style.height = (h * 20) + '%';
      tile.dataset.id = id;
      // 头像：优先 AI 绘制 WebP（透明底），加载失败自动降级 SVG（无内联事件，符合 CSP）
      var img = el('img', 'tile-img');
      img.src = './assets/faces/' + meta.key + '.webp';
      img.alt = meta.name;
      img.addEventListener('error', function () {
        var svg = (CHARACTERS[meta.key]) ? CHARACTERS[meta.key]() : '';
        this.style.display = 'none';
        var holder = el('div', 'tile-svg-fallback');
        holder.innerHTML = svg;
        this.parentNode.appendChild(holder);
      });
      var avatar = img.outerHTML;
      tile.innerHTML = '<div class="tile-inner"><div class="tile-avatar">' + avatar + '</div>' +
        '<div class="tile-name">' + meta.name + '</div></div>';
      boardEl.appendChild(tile);
    });
    // 方向箭头（选中棋子）
    if (S.selected && S.pieces[S.selected]) {
      var selP = S.pieces[S.selected];
      var sw = PIECE_W[selP.type], sh = PIECE_H[selP.type];
      var dirs = movableDirs(S.selected);
      dirs.forEach(function (d) {
        var arr = el('div', 'dir-btn dir-' + d, d === 'up' ? '▲' : d === 'down' ? '▼' : d === 'left' ? '◀' : '▶');
        arr.addEventListener('click', function (ev) {
          ev.stopPropagation();
          handleDir(d);
        });
        // 箭头覆盖在棋子边缘
        var map = {
          up: { top: ((selP.r) * 20 - 7) + '%', left: ((selP.c + sw / 2) * 25 - 6) + '%' },
          down: { top: ((selP.r + sh) * 20 - 1) + '%', left: ((selP.c + sw / 2) * 25 - 6) + '%' },
          left: { top: ((selP.r + sh / 2) * 20 - 7) + '%', left: ((selP.c) * 25 - 8) + '%' },
          right: { top: ((selP.r + sh / 2) * 20 - 7) + '%', left: ((selP.c + sw) * 25 + 1) + '%' }
        };
        arr.style.top = map[d].top;
        arr.style.left = map[d].left;
        boardEl.appendChild(arr);
      });
    }
    wrap.appendChild(boardEl);
    // 底部提示
    var hint = el('div', 'game-hint', S.selected ? '点 ▲▼◀▶ 移动' + CHAR_META[S.pieces[S.selected].type].name : '点选一个棋子，再点箭头移动；滑动棋子也可以哦');
    wrap.appendChild(hint);
    viewEl.appendChild(wrap);
    $('hrd-back').addEventListener('click', function () { S.view = 'home'; clearInterval(S.timerId); render(); });
    // 棋子点选 + 滑动
    bindTiles(boardEl);
  }

  function handleDir(d) {
    if (!S.selected) return;
    var mv = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
    if (movePiece(S.selected, mv[d][0], mv[d][1])) {
      $('hrd-moves').textContent = S.moves;
      if (isWin()) { finishLevel(); return; }
      render();
    }
  }

  function bindTiles(boardEl) {
    // 点击选择
    boardEl.addEventListener('click', function (ev) {
      var t = ev.target.closest ? ev.target.closest('.tile') : null;
      if (t) {
        var id = t.dataset.id;
        if (S.selected === id) {
          S.selected = null;
        } else if (movableDirs(id).length > 0) {
          S.selected = id;
        } else {
          // 无法移动：抖动反馈
          t.classList.add('shake');
          setTimeout(function () { t.classList.remove('shake'); }, 350);
          return;
        }
        render();
      } else {
        // 点盘面空白取消选择
        var d = ev.target.closest ? ev.target.closest('.dir-btn') : null;
        if (!d) { S.selected = null; render(); }
      }
    });
    // 滑动手势
    var startX = 0, startY = 0, swiping = false, swipeId = null;
    boardEl.addEventListener('touchstart', function (ev) {
      var t = ev.target.closest ? ev.target.closest('.tile') : null;
      if (!t) return;
      var touch = ev.touches[0];
      startX = touch.clientX; startY = touch.clientY;
      swiping = true; swipeId = t.dataset.id;
    }, { passive: true });
    boardEl.addEventListener('touchend', function (ev) {
      if (!swiping || !swipeId) { swiping = false; return; }
      var touch = ev.changedTouches[0];
      var dx = touch.clientX - startX, dy = touch.clientY - startY;
      if (Math.abs(dx) > 24 || Math.abs(dy) > 24) {
        if (Math.abs(dx) > Math.abs(dy)) {
          if (movePiece(swipeId, 0, dx > 0 ? 1 : -1)) {
            S.selected = null;
            $('hrd-moves').textContent = S.moves;
            if (isWin()) { finishLevel(); return; }
            render();
          }
        } else {
          if (movePiece(swipeId, dy > 0 ? 1 : -1, 0)) {
            S.selected = null;
            $('hrd-moves').textContent = S.moves;
            if (isWin()) { finishLevel(); return; }
            render();
          }
        }
      }
      swiping = false; swipeId = null;
    }, { passive: true });
  }

  function renderResult() {
    var lv = LEVELS[S.levelIdx];
    var best = store.best[lv.id];
    var wrap = el('div', 'result-wrap');
    var stars = best ? best.stars : 1;
    wrap.innerHTML =
      '<div class="res-badge">🎉</div>' +
      '<div class="res-title">曹操脱困！</div>' +
      '<div class="res-level">' + lv.name + '</div>' +
      '<div class="res-stars">' + starStr(stars) + '</div>' +
      '<div class="res-stats">用时 <b>' + S.elapsed + 's</b> · 步数 <b>' + S.moves + ' 步</b></div>' +
      (lv.min !== null ? '<div class="res-ref">参考最少 ' + lv.min + ' 步</div>' : '') +
      '<div class="res-best">本关最佳 ' + best.moves + ' 步</div>' +
      '<div class="res-btns">' +
      '  <button class="r-btn" id="hrd-retry">再玩一次</button>' +
      '  <button class="r-btn primary" id="hrd-next">下一关</button>' +
      '</div>';
    doCheckin();
    viewEl.appendChild(wrap);
    $('hrd-retry').addEventListener('click', function () { startLevel(S.levelIdx); });
    $('hrd-next').addEventListener('click', function () {
      var nxt = S.levelIdx + 1;
      if (nxt < LEVELS.length) startLevel(nxt);
      else { S.view = 'home'; render(); }
    });
    if (S.levelIdx + 1 >= LEVELS.length) {
      $('hrd-next').textContent = '回选关';
    }
  }

  /* ---------- 头部 ---------- */
  function renderHeader() {
    $('app-header').innerHTML =
      '<div class="app-title">' + META.name + '</div>' +
      '<div class="app-ver">v' + META.version + '</div>';
  }

  /* ---------- 测试钩子 ---------- */
  window.__hrd = {
    get state() { return S; },
    get levels() { return LEVELS; },
    startLevel: startLevel,
    parseBoard: parseBoard,
    canMove: canMove,
    movableDirs: movableDirs,
    movePiece: movePiece,
    isWin: isWin,
    occupancy: occupancy,
    store: store,
    doCheckin: doCheckin,
    render: render,
    finishLevel: finishLevel
  };

  /* ---------- 启动 ---------- */
  function init() {
    if (!LEVELS.length) {
      $('view').innerHTML = '<div class="err">关卡数据加载失败</div>';
      return;
    }
    renderHeader();
    render();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
