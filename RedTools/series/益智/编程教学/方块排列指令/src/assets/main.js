/* ============================================================
   方块排列指令 — main.js（益智·编程教学，D3 转型）
   ------------------------------------------------------------
   玩法：给定目标布局（K 个四格骨牌堆成），孩子为每块编排
   指令（↻ 旋转 / ⬅➡ 移动 / ⬇ 落下）→ ▶ 执行 → 全部落完 →
   布局比对判定（最终网格 = 目标网格 = 答对）。
   - 指令：旋转（参数化 ×N）/ 左移右移（参数化 N 格）/ 落下
   - 判定：最终网格 vs 目标网格逐格比对 = 有标准答案
   - 星级：指令条数 vs 最优解（参数化语义，≤1.5× = 3★）
   - 三档：简单 2 块·6×6 / 普通 4 块·8×8 / 挑战 6 块·10×10
   - 生成：程序化（随机 type/rot/col → 模拟落下 → 必有解）
   - 数据：window.APP_DATA（data.js）
   - 存储：LX_SHARED.storage（V0.4 迁移）
   - 约束：ES2017 经典脚本、Chrome 61 兼容、无外部资源
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };
  var M = {};
  var viewEl = document.getElementById('view');
  var headerEl = document.getElementById('app-header');
  var footerEl = document.getElementById('app-footer');

  /* ---------- 持久化（V0.4 迁移：LX_SHARED.storage） ---------- */
  LX_SHARED.storage.configure({ toolName: 'fangkuai' });  // 键前缀 redtools.fangkuai.v1
  var DEFAULT_STORE = {
    version: 1,
    best: { easy: null, normal: null, hard: null },   // { stars, cmds }
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
  saveStore();

  /* ---------- 难度档 ---------- */
  var LEVELS_CFG = {
    easy:   { key: 'easy',   label: '简单', cols: 6, rows: 6, pieces: 2 },
    normal: { key: 'normal', label: '普通', cols: 8, rows: 8, pieces: 4 },
    hard:   { key: 'hard',   label: '挑战', cols: 10, rows: 10, pieces: 6 }
  };
  var LEVEL_ORDER = ['easy', 'normal', 'hard'];

  /* 7 种四格骨牌（复用俄罗斯方块 SHAPES 几何，type 0-6 = I O T S Z J L；
     每种 4 个旋转态，相对 [col,row]，原点左上、row 向下增长）
     注意：简单难度排除 O 型（type 1，旋转无变化） */
  var SHAPES = [
    [ // 0 I（青）
      [[0, 1], [1, 1], [2, 1], [3, 1]],
      [[2, 0], [2, 1], [2, 2], [2, 3]],
      [[0, 2], [1, 2], [2, 2], [3, 2]],
      [[1, 0], [1, 1], [1, 2], [1, 3]]
    ],
    [ // 1 O（黄，四态相同）
      [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]]
    ],
    [ // 2 T（紫）
      [[1, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [1, 2]],
      [[1, 0], [0, 1], [1, 1], [1, 2]]
    ],
    [ // 3 S（绿）
      [[1, 0], [2, 0], [0, 1], [1, 1]],
      [[1, 0], [1, 1], [2, 1], [2, 2]],
      [[1, 1], [2, 1], [0, 2], [1, 2]],
      [[0, 0], [0, 1], [1, 1], [1, 2]]
    ],
    [ // 4 Z（红）
      [[0, 0], [1, 0], [1, 1], [2, 1]],
      [[2, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [1, 2], [2, 2]],
      [[1, 0], [0, 1], [1, 1], [0, 2]]
    ],
    [ // 5 J（蓝）
      [[0, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [2, 2]],
      [[1, 0], [0, 1], [1, 1], [1, 2]]
    ],
    [ // 6 L（橙）
      [[2, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [1, 2], [2, 2]],
      [[0, 1], [1, 1], [2, 1], [0, 2]],
      [[0, 0], [1, 0], [1, 1], [1, 2]]
    ]
  ];
  var TYPE_COLORS = ['#3ec6ff', '#ffd94a', '#b07bf5', '#5ad46a', '#ff6b6b', '#5a8df5', '#ff9c4a'];
  var TYPE_NAMES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

  /* 指令常量（每条 = 参数化 chip） */
  var CMD_ROT = { id: 'rot', label: '↻ 旋转' };
  var CMD_LEFT = { id: 'left', label: '⬅ 左移' };
  var CMD_RIGHT = { id: 'right', label: '➡ 右移' };
  var CMD_DROP = { id: 'drop', label: '⬇ 落下' };

  /* ---------- 状态 ---------- */
  var state = {
    level: 'easy',
    pieces: [],        // 生成结果 [{type, rot, col}]（目标布局 + 最优解基准）
    placed: [],        // 已落定块 [{type, rot, col, row, cells:[idx]}]
    curIdx: 0,         // 当前块下标（0..pieces.length-1）
    cmds: [],          // 当前块指令序列 [{id, val}]
    cmdCounts: [],     // 每块实际指令条数（星级用，全部块落定后求和）
    execLock: false,   // 执行中锁定
    execDone: false,
    won: false,
    targetCells: {},   // 目标布局格子集合 {idx: true}
    gridW: 0, gridH: 0,
    startMs: 0, elapsed: 0, timerId: null,
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
  function fmtMs(ms) {
    var s = ms / 1000;
    return (s < 10 ? '0' : '') + s.toFixed(1);
  }

  /* ---------- 骨牌几何工具 ---------- */
  // 某旋转态的 bounding box + 归一化格子
  function pieceInfo(type, rot) {
    var cells = SHAPES[type][rot];
    var minC = 99, maxC = -1, minR = 99, maxR = -1;
    for (var i = 0; i < cells.length; i++) {
      if (cells[i][0] < minC) { minC = cells[i][0]; }
      if (cells[i][0] > maxC) { maxC = cells[i][0]; }
      if (cells[i][1] < minR) { minR = cells[i][1]; }
      if (cells[i][1] > maxR) { maxR = cells[i][1]; }
    }
    return {
      cells: cells,
      w: maxC - minC + 1,
      h: maxR - minR + 1,
      minC: minC, maxC: maxC, minR: minR, maxR: maxR
    };
  }
  // 该旋转态绝对格子（col 对齐 minC，row 对齐 minR）
  function absCells(type, rot, col, row) {
    var info = pieceInfo(type, rot);
    var out = [];
    for (var i = 0; i < info.cells.length; i++) {
      out.push((row + (info.cells[i][1] - info.minR)) * state.gridW + (col + (info.cells[i][0] - info.minC)));
    }
    return out;
  }
  // 落下模拟（生成器与执行器共用同一实现——单一实现防不一致）
  // placed = 已有块数组 [{cells:[idx]}...]；返回落定 row
  function dropRowFor(type, rot, col, placed) {
    var occupied = {};
    for (var p = 0; p < placed.length; p++) {
      var cs = placed[p].cells;
      for (var q = 0; q < cs.length; q++) { occupied[cs[q]] = true; }
    }
    var info = pieceInfo(type, rot);
    var row = 0;
    while (true) {
      // 触底：row + h > gridH → 停下（上一行）
      if (row + info.h > state.gridH) { return row - 1; }
      // 尝试放 row：检查是否重叠
      var cells = absCells(type, rot, col, row);
      var hit = false;
      for (var i = 0; i < cells.length; i++) {
        if (occupied[cells[i]]) { hit = true; break; }
      }
      if (hit) { return row - 1; }
      row += 1;
    }
  }

  /* ---------- 关卡生成器（程序化，必有解） ---------- */
  function genLevel(diff) {
    var cfg = LEVELS_CFG[diff];
    state.gridW = cfg.cols;
    state.gridH = cfg.rows;
    var mid = Math.floor(cfg.cols / 2);
    var pieces = [];
    var placed = [];
    var guard = 0;
    while (pieces.length < cfg.pieces && guard < 500) {
      guard += 1;
      var type = Math.floor(Math.random() * (diff === 'easy' ? 6 : 7));
      if (diff === 'easy' && type === 1) { type = 6; } // 简单难度排除 O 型 → 用 L 替代
      var rot = Math.floor(Math.random() * 4);
      var info = pieceInfo(type, rot);
      var col = Math.floor(Math.random() * (state.gridW - info.w + 1)); // 事前约束不越界
      var row = dropRowFor(type, rot, col, placed);
      if (row < 0) { continue; } // 放不下（首行即重叠，重试）
      var cells = absCells(type, rot, col, row);
      placed.push({ cells: cells });
      pieces.push({ type: type, rot: rot, col: col, row: row, cells: cells });
    }
    if (pieces.length < cfg.pieces) { return null; } // 极罕见：重试
    // 目标布局集合 + 最优解（参数化语义）
    var target = {};
    for (var i = 0; i < placed.length; i++) {
      var cs = placed[i].cells;
      for (var j = 0; j < cs.length; j++) { target[cs[j]] = true; }
    }
    var optimal = 0;
    for (var k = 0; k < pieces.length; k++) {
      var pc = pieces[k];
      optimal += (pc.rot === 0 ? 0 : 1) + (pc.col === mid ? 0 : 1) + 1;
    }
    state.pieces = pieces;
    state.targetCells = target;
    state.optimal = optimal;
    return pieces;
  }

  /* ---------- 渲染：顶栏 ---------- */
  function renderHeader() {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '方块排列指令';
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
    wrap.appendChild(makeEl('h1', 'home-title', '🧩 方块排列指令'));
    wrap.appendChild(makeEl('p', 'home-sub', '给方块编指令，排成目标图案！'));

    LEVEL_ORDER.forEach(function (k) {
      var lv = LEVELS_CFG[k];
      var card = makeEl('button', 'level-card');
      var best = store.best[k];
      var bestTxt = best ? '最佳 ' + best.stars + '★' : '未挑战';
      card.appendChild(makeEl('div', 'level-name', lv.label + ' · ' + lv.pieces + ' 块 · ' + lv.cols + '×' + lv.rows));
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

  /* ---------- 打卡 / 家长面板 ---------- */
  function doCheckin(btn) {
    var today = todayStr();
    if (store.checkin.dates.indexOf(today) >= 0) { btn.textContent = '✅ 今日已打卡'; return; }
    store.checkin.dates.push(today);
    store.checkin.dates = store.checkin.dates.slice(-366);
    store.checkin.streak = calcStreak(store.checkin.dates);
    saveStore();
    btn.textContent = '✅ 今日已打卡';
    renderHeader();
  }

  function viewParent() {
    stopTimer();
    renderHeader();
    clearNode(viewEl);
    var wrap = makeEl('div', 'parent-wrap');
    wrap.appendChild(makeEl('h2', 'parent-title', '家长面板'));
    wrap.appendChild(makeEl('p', 'parent-row', '累计打卡 ' + store.checkin.dates.length + ' 天 · 连续 ' + store.checkin.streak + ' 天'));
    LEVEL_ORDER.forEach(function (k) {
      var lv = LEVELS_CFG[k];
      var b = store.best[k];
      wrap.appendChild(makeEl('div', 'parent-row', lv.label + '：' + (b ? b.stars + '★ / ' + b.cmds + ' 条指令' : '未挑战')));
    });
    var hist = store.history.slice(-10).reverse();
    if (hist.length) {
      wrap.appendChild(makeEl('h3', 'parent-sub', '最近记录'));
      hist.forEach(function (h) {
        wrap.appendChild(makeEl('div', 'parent-row small', h.date + ' · ' + (LEVELS_CFG[h.level] ? LEVELS_CFG[h.level].label : h.level) + ' · ' + h.stars + '★'));
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

  /* ---------- 视图：练习页 ---------- */
  function startGame(level) {
    state.level = level;
    state.finished = false;
    state.execLock = false; state.execDone = false; state.won = false;
    state.cmds = [];
    state.cmdCounts = [];
    state.placed = [];
    state.curIdx = 0;
    var res = genLevel(level);
    if (!res) { genLevel(level); } // 极罕见：二次生成
    renderGame();
    state.startMs = Date.now();
    startTimer();
  }

  /* 盘面渲染：目标半透明叠加 + 已落块 + 当前块 */
  function boardHtml() {
    var W = state.gridW, H = state.gridH;
    var cs = 34; // 格尺寸
    var parts = ['<svg id="board-svg" class="board-svg" viewBox="0 0 ' + (W * cs) + ' ' + (H * cs) + '">'];
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var i = y * W + x;
        var px = x * cs, py = y * cs;
        parts.push('<rect x="' + px + '" y="' + py + '" width="' + cs + '" height="' + cs + '" fill="#f0f2f5" stroke="#e0e3e8" stroke-width="1"/>');
        // 目标半透明叠加
        if (state.targetCells[i]) {
          parts.push('<rect x="' + (px + 2) + '" y="' + (py + 2) + '" width="' + (cs - 4) + '" height="' + (cs - 4) + '" fill="#ff9c4a" opacity="0.30" rx="3"/>');
        }
      }
    }
    // 已落块（实心）
    for (var p = 0; p < state.placed.length; p++) {
      var pc = state.placed[p];
      for (var q = 0; q < pc.cells.length; q++) {
        var ci = pc.cells[q];
        var cx = (ci % W) * cs, cy = Math.floor(ci / W) * cs;
        parts.push('<rect x="' + (cx + 3) + '" y="' + (cy + 3) + '" width="' + (cs - 6) + '" height="' + (cs - 6) + '" fill="' + TYPE_COLORS[pc.type] + '" rx="3"/>');
        parts.push('<rect x="' + (cx + 6) + '" y="' + (cy + 6) + '" width="' + (cs - 12) + '" height="' + (cs - 12) + '" fill="' + TYPE_COLORS[pc.type] + '" opacity="0.35" rx="2"/>');
      }
    }
    // 差格红框（判定后）
    if (state.diffCells) {
      for (var d = 0; d < state.diffCells.length; d++) {
        var di = state.diffCells[d];
        var dx = (di % W) * cs, dy = Math.floor(di / W) * cs;
        parts.push('<rect x="' + (dx + 1) + '" y="' + (dy + 1) + '" width="' + (cs - 2) + '" height="' + (cs - 2) + '" fill="none" stroke="#e53935" stroke-width="3" rx="3"/>');
      }
    }
    parts.push('</svg>');
    return parts.join('');
  }

  function renderGame() {
    renderHeader();
    clearNode(viewEl);
    var wrap = makeEl('div', 'game-wrap');
    // 顶部
    var top = makeEl('div', 'game-top');
    var back = makeEl('button', 'game-back', '‹ 返回');
    back.addEventListener('click', function () { viewHome(); });
    top.appendChild(back);
    var lvEl = makeEl('div', 'game-prog', LEVELS_CFG[state.level].label + ' · 第 ' + (state.curIdx + 1) + ' 块 / 共 ' + state.pieces.length + ' 块');
    lvEl.id = 'game-prog';
    top.appendChild(lvEl);
    var timerEl = makeEl('div', 'game-timer', '⏱ 00.0');
    timerEl.id = 'game-timer';
    top.appendChild(timerEl);
    var hint = makeEl('div', 'game-hint', '目标：把方块排成橙色图案');
    top.appendChild(hint);
    wrap.appendChild(top);

    // 盘面
    var board = makeEl('div', 'board');
    board.id = 'board';
    board.innerHTML = boardHtml();
    wrap.appendChild(board);

    // 当前块预览
    var prev = makeEl('div', 'piece-preview');
    prev.id = 'piece-preview';
    wrap.appendChild(prev);

    // 指令区
    var cmdBar = makeEl('div', 'cmd-bar');
    cmdBar.id = 'cmd-bar';
    [CMD_ROT, CMD_LEFT, CMD_RIGHT, CMD_DROP].forEach(function (cmd) {
      var btn = makeEl('button', 'cmd-add', cmd.label);
      btn.addEventListener('click', function () { addCmd(cmd.id); });
      cmdBar.appendChild(btn);
    });
    wrap.appendChild(cmdBar);

    // 指令序列（当前块，可删除/循环参数递增）
    var seqWrap = makeEl('div', 'seq-wrap');
    seqWrap.id = 'seq-wrap';
    var seqBox = makeEl('div', 'seq-box');
    seqBox.id = 'seq-box';
    seqBox.textContent = '（空指令）';
    seqWrap.appendChild(seqBox);
    var clearBtn = makeEl('button', 'seq-clear', '↺ 清空');
    clearBtn.addEventListener('click', function () { state.cmds = []; renderSeq(); });
    seqWrap.appendChild(clearBtn);
    wrap.appendChild(seqWrap);

    // 执行控制
    var ctrl = makeEl('div', 'ctrl-row');
    var runBtn = makeEl('button', 'btn btn-primary', '▶ 执行');
    runBtn.id = 'run-btn';
    runBtn.addEventListener('click', function () { execRun(); });
    ctrl.appendChild(runBtn);
    var resetBtn = makeEl('button', 'btn', '⟲ 重置');
    resetBtn.addEventListener('click', function () {
      state.execLock = false; state.execDone = false; state.won = false;
      state.cmds = []; state.cmdCounts = [];
      state.placed = []; state.curIdx = 0;
      state.diffCells = null;
      setCmdLocked(false);
      var res = genLevel(state.level);
      if (!res) { genLevel(state.level); }
      renderGame();
    });
    ctrl.appendChild(resetBtn);
    var nextBtn = makeEl('button', 'btn', '再来一题 ›');
    nextBtn.id = 'next-btn';
    nextBtn.style.display = 'none';
    nextBtn.addEventListener('click', function () { nextLevel(); });
    ctrl.appendChild(nextBtn);
    wrap.appendChild(ctrl);

    // 反馈
    var fb = makeEl('div', 'game-feedback', '给第 1 块编指令，再点执行！');
    fb.id = 'game-feedback';
    wrap.appendChild(fb);

    viewEl.appendChild(wrap);
    renderSeq();
    renderFooter('');
  }

  function renderSeq() {
    var box = document.getElementById('seq-box');
    if (!box) { return; }
    if (!state.cmds.length) {
      box.textContent = '（空指令）';
      box.className = 'seq-box';
      return;
    }
    box.className = 'seq-box active';
    clearNode(box);
    state.cmds.forEach(function (cmd, i) {
      var lbl = cmd.id === 'rot' ? '↻' : (cmd.id === 'left' ? '⬅' : (cmd.id === 'right' ? '➡' : '⬇'));
      var valTxt = (cmd.id === 'drop') ? '' : ('×' + cmd.val);
      var chip = makeEl('span', 'cmd-chip', (i + 1) + '.' + lbl + valTxt);
      chip.addEventListener('click', function (ev) {
        ev.stopPropagation();
        cycleParam(i);
      });
      var x = makeEl('span', 'chip-x', '✕');
      x.addEventListener('click', function (ev) {
        ev.stopPropagation();
        removeCmd(i);
      });
      chip.appendChild(x);
      box.appendChild(chip);
    });
  }

  // 参数递增：rot 1→2→3→1；移动 1→2→…→max→1；drop 固定 1
  function cycleParam(i) {
    if (state.execLock) { return; }
    var cmd = state.cmds[i];
    if (!cmd) { return; }
    var max = cmd.id === 'rot' ? 3 : (state.gridW - 1);
    var next = cmd.val + 1;
    if (next > max) { next = 1; }
    cmd.val = next;
    renderSeq();
  }

  function renderBoardOnly() {
    var board = document.getElementById('board');
    if (board) { board.innerHTML = boardHtml(); }
  }

  function addCmd(id) {
    if (state.execLock) { return; }
    if (state.execDone || state.won) { return; }
    var val = (id === 'drop') ? 1 : 1;
    state.cmds.push({ id: id, val: val });
    renderSeq();
  }
  function removeCmd(i) {
    if (state.execLock) { return; }
    state.cmds.splice(i, 1);
    renderSeq();
  }

  /* ---------- 执行器（编程核心） ---------- */
  // 单块执行：按 cmds 指令序列执行（固定顺序旋转→移动→落下，动画逐步）
  function execRun() {
    if (state.execLock || state.execDone || state.won) { return; }
    if (!state.cmds.length) { return; }
    state.execLock = true;
    state.diffCells = null;
    setCmdLocked(true);
    var fb = document.getElementById('game-feedback');
    if (fb) { fb.textContent = '第 ' + (state.curIdx + 1) + ' 块执行中…'; fb.className = 'game-feedback'; }
    renderSeq();
    // 当前块的执行快照
    var pc = state.pieces[state.curIdx];
    state.cur = {
      type: pc.type,
      rot: 0,
      col: Math.floor(state.gridW / 2),
      cells: null
    };
    state.cmdProg = 0;
    execCmdStep();
  }

  function execCmdStep() {
    if (state.cmdProg >= state.cmds.length) {
      // 本块指令执行完：落下落定 → 加入 placed
      var cur = state.cur;
      var pc = state.pieces[state.curIdx];
      // 落下：从当前 col 顶部下落触底（复用 dropRowFor）
      var placedCells = [];
      for (var p = 0; p < state.placed.length; p++) {
        placedCells.push({ cells: state.placed[p].cells });
      }
      var row = dropRowFor(cur.type, cur.rot, cur.col, placedCells);
      if (row < 0) { row = 0; }
      cur.row = row;
      cur.cells = absCells(cur.type, cur.rot, cur.col, row);
      state.placed.push({ type: cur.type, rot: cur.rot, col: cur.col, row: row, cells: cur.cells });
      state.cmdCounts.push(state.cmds.length);   // 记录本块指令条数（星级）
      state.curIdx += 1;
      state.execLock = false;
      setCmdLocked(false);
      state.cmds = [];
      renderBoardOnly();
      var prog = document.getElementById('game-prog');
      if (prog) { prog.textContent = LEVELS_CFG[state.level].label + ' · 第 ' + (state.curIdx + 1) + ' 块 / 共 ' + state.pieces.length + ' 块'; }
      // 判定
      if (state.curIdx >= state.pieces.length) {
        state.execDone = true;
        checkWin();
      } else {
        renderSeq();
        var fb = document.getElementById('game-feedback');
        // V1.0 逐块即时差格检查（oracle UX 建议）：本块落定后，
        // 检查已放格是否有「不在目标布局中」的多余格（放偏了）→ 立即提示
        var excess = calcExcessCells();
        if (excess && excess.length > 0) {
          state.diffCells = excess;
          if (fb) { fb.textContent = '✗ 这一块有 ' + excess.length + ' 格放偏了（红色标记），调整再试（点 ⟲ 重置）'; fb.className = 'game-feedback miss'; }
          renderBoardOnly();
        } else {
          if (fb) { fb.textContent = '第 ' + (state.curIdx + 1) + ' 块落定！给下一块编指令'; fb.className = 'game-feedback ok'; }
        }
        renderPreview();
      }
      return;
    }
    var cmd = state.cmds[state.cmdProg];
    state.cmdProg += 1;
    var cur = state.cur;
    if (cmd.id === 'rot') {
      cur.rot = (cur.rot + cmd.val) % 4;
      renderPreview();
      setTimeout(execCmdStep, 300);
    } else if (cmd.id === 'left') {
      cur.col -= cmd.val;
      if (cur.col < 0) { cur.col = 0; flashEdge(); }
      renderBoardOnly(); renderPreview();
      setTimeout(execCmdStep, 300);
    } else if (cmd.id === 'right') {
      var info = pieceInfo(cur.type, cur.rot);
      var maxCol = state.gridW - info.w;
      cur.col += cmd.val;
      if (cur.col > maxCol) { cur.col = maxCol; flashEdge(); }
      renderBoardOnly(); renderPreview();
      setTimeout(execCmdStep, 300);
    } else if (cmd.id === 'drop') {
      // 落下动画：逐步下落（简化：直接落定）
      var placedCells = [];
      for (var p2 = 0; p2 < state.placed.length; p2++) {
        placedCells.push({ cells: state.placed[p2].cells });
      }
      var row2 = dropRowFor(cur.type, cur.rot, cur.col, placedCells);
      cur.row = row2 < 0 ? 0 : row2;
      cur.cells = absCells(cur.type, cur.rot, cur.col, cur.row);
      setTimeout(execCmdStep, 300);
    }
  }

  // 执行锁定：指令按钮/序列灰显不可点
  function setCmdLocked(locked) {
    var bars = document.querySelectorAll('.cmd-add, .seq-clear, .cmd-chip');
    for (var i = 0; i < bars.length; i++) {
      if (locked) { bars[i].setAttribute('disabled', 'disabled'); }
      else { bars[i].removeAttribute('disabled'); }
    }
  }

  // 当前块预览（指令编辑时实时显示旋转/移动后的位置）
  function renderPreview() {    var box = document.getElementById('piece-preview');
    if (!box) { return; }
    if (!state.cur || state.execDone) {
      // 未执行：显示生成器的目标块
      if (state.curIdx < state.pieces.length) {
        var pc = state.pieces[state.curIdx];
        var info = pieceInfo(pc.type, 0);
        var cs2 = 22;
        var svg = '<svg class="preview-svg" viewBox="0 0 ' + (info.w * cs2) + ' ' + (info.h * cs2) + '">';
        for (var i = 0; i < SHAPES[pc.type][0].length; i++) {
          var cx = (SHAPES[pc.type][0][i][0] - info.minC) * cs2;
          var cy = (SHAPES[pc.type][0][i][1] - info.minR) * cs2;
          svg += '<rect x="' + cx + '" y="' + cy + '" width="' + (cs2 - 3) + '" height="' + (cs2 - 3) + '" fill="' + TYPE_COLORS[pc.type] + '" rx="3"/>';
        }
        svg += '</svg>';
        box.innerHTML = '<div class="preview-label">当前块：' + TYPE_NAMES[pc.type] + ' 型</div>' + svg;
      } else {
        box.innerHTML = '';
      }
      return;
    }
    var cur = state.cur;
    var info2 = pieceInfo(cur.type, cur.rot);
    var cs3 = 22;
    var svg2 = '<svg class="preview-svg" viewBox="0 0 ' + (info2.w * cs3) + ' ' + (info2.h * cs3) + '">';
    for (var j = 0; j < SHAPES[cur.type][cur.rot].length; j++) {
      var px = (SHAPES[cur.type][cur.rot][j][0] - info2.minC) * cs3;
      var py = (SHAPES[cur.type][cur.rot][j][1] - info2.minR) * cs3;
      svg2 += '<rect x="' + px + '" y="' + py + '" width="' + (cs3 - 3) + '" height="' + (cs3 - 3) + '" fill="' + TYPE_COLORS[cur.type] + '" rx="3"/>';
    }
    svg2 += '</svg>';
    box.innerHTML = '<div class="preview-label">当前块（旋转 ×' + cur.rot + '）</div>' + svg2;
  }

  function flashEdge() {
    var board = document.getElementById('board');
    if (board) { board.classList.add('edge-flash'); setTimeout(function () { board.classList.remove('edge-flash'); }, 300); }
  }

  /* ---------- 判定 ---------- */
  // 计算「已放但不在目标布局中」的多余格（放偏了）——逐块即时反馈用
  function calcExcessCells() {
    var filled = {};
    for (var p = 0; p < state.placed.length; p++) {
      var cs = state.placed[p].cells;
      for (var q = 0; q < cs.length; q++) { filled[cs[q]] = true; }
    }
    var excess = [];
    for (var k in filled) {
      if (Object.prototype.hasOwnProperty.call(filled, k) && !state.targetCells[k]) {
        excess.push(parseInt(k, 10));
      }
    }
    return excess;
  }

  function checkWin() {
    // 最终网格 vs 目标网格逐格比对
    var W = state.gridW;
    var filled = {};
    for (var p = 0; p < state.placed.length; p++) {
      var cs = state.placed[p].cells;
      for (var q = 0; q < cs.length; q++) { filled[cs[q]] = true; }
    }
    var diff = [];
    for (var k in state.targetCells) {
      if (Object.prototype.hasOwnProperty.call(state.targetCells, k) && !filled[k]) { diff.push(parseInt(k, 10)); }
    }
    for (var k2 in filled) {
      if (Object.prototype.hasOwnProperty.call(filled, k2) && !state.targetCells[k2]) { diff.push(parseInt(k2, 10)); }
    }
    state.won = diff.length === 0;
    state.diffCells = state.won ? null : diff;
    var fb = document.getElementById('game-feedback');
    var nextBtn = document.getElementById('next-btn');
    state.execLock = false;
    if (state.won) {
      if (fb) { fb.textContent = '✓ 完成！图案排好啦！'; fb.className = 'game-feedback ok'; }
      if (nextBtn) { nextBtn.style.display = 'inline-block'; }
      finishLevel();
    } else {
      var msg = '✗ 还有 ' + diff.length + ' 格没对上，调整指令再试（点 ⟲ 重置）';
      if (fb) { fb.textContent = msg; fb.className = 'game-feedback miss'; }
    }
    renderBoardOnly();
  }

  /* ---------- 星级 / 结算 ---------- */
  function finishLevel() {
    // 全部块指令条数总和（每块 cmds.length 记录于 cmdCounts）
    var total = 0;
    for (var i = 0; i < state.cmdCounts.length; i++) { total += state.cmdCounts[i]; }
    var stars = 1;
    if (total <= state.optimal * 1.5) { stars = 3; }
    else if (total <= state.optimal * 2.5) { stars = 2; }
    var lv = state.level;
    var rec = { date: todayStr(), level: lv, stars: stars, cmds: total };
    var prev = store.best[lv];
    if (!prev || stars > prev.stars) {
      store.best[lv] = { stars: stars, cmds: total };
    }
    store.recent[lv] = stars;
    store.history.push(rec);
    store.history = store.history.slice(-100);
    saveStore();
    var fb = document.getElementById('game-feedback');
    if (fb) { fb.textContent += '（' + stars + '★，指令 ' + total + ' 条 / 最优 ' + state.optimal + '）'; }
  }

  function nextLevel() {
    state.execLock = false; state.execDone = false; state.won = false;
    state.cmds = [];
    state.cmdCounts = [];
    state.placed = [];
    state.curIdx = 0;
    state.diffCells = null;
    var res = genLevel(state.level);
    if (!res) { genLevel(state.level); }
    renderGame();
  }

  /* ---------- 计时 / 结算 ---------- */
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
  M.genLevel = genLevel;
  window.M = M;
})();
