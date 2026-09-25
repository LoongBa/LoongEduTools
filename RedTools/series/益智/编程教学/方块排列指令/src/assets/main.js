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

  /* ---------- v1.2 自定义关卡库（关卡编辑器） ---------- */
  // 存储：storage.set('customLevels') → localStorage 'redtools.fangkuai.customLevels'（无 .v1. 段；勿硬编码完整键名）
  function loadCustomLevels() {
    var arr = LX_SHARED.storage.get('customLevels');
    return (arr && Array.isArray(arr)) ? arr : [];
  }
  function saveCustomLevels(arr) {
    LX_SHARED.storage.set('customLevels', arr);
  }
  function addCustomLevel(cells, gridW, gridH, refPieces, name) {
    if (customLevels.length >= 20) { return null; }   // 上限 20 关
    var item = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 5),
      name: name || ('我的图案 ' + (customLevels.length + 1)),
      cells: cells,
      gridW: gridW,
      gridH: gridH,
      refPieces: refPieces,
      createdAt: Date.now(),
      solved: false
    };
    customLevels.push(item);
    saveCustomLevels(customLevels);
    return item.id;
  }
  function removeCustomLevel(id) {
    for (var i = customLevels.length - 1; i >= 0; i--) {
      if (customLevels[i].id === id) { customLevels.splice(i, 1); }
    }
    saveCustomLevels(customLevels);
  }
  function markCustomSolved(idx) {
    if (customLevels[idx]) {
      customLevels[idx].solved = true;
      saveCustomLevels(customLevels);
    }
  }
  var customLevels = loadCustomLevels();

  /* ---------- 难度档 ---------- */
  var LEVELS_CFG = {
    easy:   { key: 'easy',   label: '简单', cols: 6, rows: 6, pieces: 2 },
    normal: { key: 'normal', label: '普通', cols: 8, rows: 8, pieces: 4 },
    hard:   { key: 'hard',   label: '挑战', cols: 10, rows: 10, pieces: 6 }
  };
  var LEVEL_ORDER = ['easy', 'normal', 'hard'];

  // v1.2：当前关卡显示名（custom 用自建关卡名，防 LEVELS_CFG[state.level] undefined）
  function levelLabel() {
    if (state.level === 'custom') {
      var cl = customLevels[state.customIdx];
      return cl ? cl.name : '自建关卡';
    }
    return LEVELS_CFG[state.level].label;
  }

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
    curIdx: 0,         // 执行中当前块下标（v1.1 全量执行 0..pieces.length-1）
    curEditIdx: 0,     // v1.1 编辑态当前块（块 tab 切换 0..pieces.length-1；startGame/reset/nextLevel 重置 0）
    blockCmds: [],     // v1.1 每块独立指令序列 [[{id,val},...], ...]（整体编排——全部编完统一执行）
    execLock: false,   // 执行中锁定
    execDone: false,
    won: false,
    targetCells: {},   // 目标布局格子集合 {idx: true}
    gridW: 0, gridH: 0,
    startMs: 0, elapsed: 0, timerId: null,
    finished: false,
    stepTimer: null,   // v1.1 N-6：执行 setTimeout 句柄（reset/nextLevel/startGame 清理防幻影执行）
    cur: null,         // v1.2：当前执行块快照（startCustom/startGame 重置 null，防 renderPreview 残留）
    customIdx: -1      // v1.2：自建关卡下标（state.level === 'custom' 时指向 customLevels）
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
  // 该旋转态绝对格子（col 对齐 minC，row 对齐 minR）——gridW 显式参数（v1.2：编辑器/生成器/校验器共用同一实现）
  function absCellsW(type, rot, col, row, gridW) {
    var info = pieceInfo(type, rot);
    var out = [];
    for (var i = 0; i < info.cells.length; i++) {
      out.push((row + (info.cells[i][1] - info.minR)) * gridW + (col + (info.cells[i][0] - info.minC)));
    }
    return out;
  }
  function absCells(type, rot, col, row) {
    return absCellsW(type, rot, col, row, state.gridW);
  }
  // 落下模拟（生成器与执行器共用同一实现——单一实现防不一致）
  // placed = 已有块数组 [{cells:[idx]}...]；返回落定 row；gridW/gridH 显式参数（v1.2：编辑器 checkSolvable 共用）
  function dropRowForW(type, rot, col, placed, gridW, gridH) {
    var occupied = {};
    for (var p = 0; p < placed.length; p++) {
      var cs = placed[p].cells;
      for (var q = 0; q < cs.length; q++) { occupied[cs[q]] = true; }
    }
    var info = pieceInfo(type, rot);
    var row = 0;
    while (true) {
      // 触底：row + h > gridH → 停下（上一行）
      if (row + info.h > gridH) { return row - 1; }
      // 尝试放 row：检查是否重叠
      var cells = absCellsW(type, rot, col, row, gridW);
      var hit = false;
      for (var i = 0; i < cells.length; i++) {
        if (occupied[cells[i]]) { hit = true; break; }
      }
      if (hit) { return row - 1; }
      row += 1;
    }
  }
  function dropRowFor(type, rot, col, placed) {
    return dropRowForW(type, rot, col, placed, state.gridW, state.gridH);
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

  /* ---------- v1.2 可拼性校验（两阶段：分割枚举 + 落定验证） ---------- */
  // 阶段 1（dfsPartition）：纯覆盖 DFS——顺序无关，最左上未覆盖格 c 必须被某块覆盖
  //   （枚举 7 型 × 4 旋转 × 块内 4 格对齐 c 的平移；occupied ⊆ targetSet 强剪枝；深度 ≤ K；不要求落定）
  // 阶段 2（verifyFall）：落定验证——顺序相关，贪心从底到顶：
  //   每步任取「紧邻下方（row+1 处）与已放格有交集 或 触底（row+1+h > gridH）」的未放块放置；
  //   无可放块且未放完 → 该分割不可拼（返回 false，阶段 1 继续找下一分割）；放完 → true
  // 节点计数（阶段 1+2 共用）上限 200000 → 超限返回 'unknown'（暂不确定，非假阴性）
  // 返回：refPieces 数组（可拼，[{type,rot,col,row},...] K 个）/ false（不可拼）/ 'unknown'（超限）
  var SOLVE_MAX_NODES = 200000;

  function checkSolvable(gridW, gridH, targetSet, K) {
    var budget = { n: 0 };
    var out = { solution: null };
    var res = dfsPartition([], {}, 0, K, targetSet, gridW, gridH, budget, out);
    if (res === 'unknown') { return 'unknown'; }
    if (res === 'done' && out.solution) { return out.solution; }
    return false;
  }

  function dfsPartition(placed, occupied, depth, K, targetSet, gridW, gridH, budget, out) {
    budget.n += 1;
    if (budget.n > SOLVE_MAX_NODES) { return 'unknown'; }
    // 最左上未覆盖格 c（行序优先）
    var c = -1;
    for (var i = 0; i < gridW * gridH; i++) {
      if (targetSet[i] && !occupied[i]) { c = i; break; }
    }
    if (c === -1) {
      if (depth === K) {
        // 全覆盖且块数正确 → 阶段 2：落定验证（返回合法放序作为 refPieces——方案 §4.1 断言：可回放）
        var v = verifyFall(placed, gridW, gridH, budget);
        if (v === 'unknown') { return 'unknown'; }
        if (v !== false) { out.solution = v; return 'done'; }
        return 'continue';   // 分割存在但落定不成立 → 阶段 1 继续找下一分割
      }
      return 'continue';   // 全覆盖但块数不足（理论不发生：每块恰 4 格）
    }
    if (depth >= K) { return 'continue'; }   // 无块可用但仍有未覆盖格
    var cCol = c % gridW;
    var cRow = Math.floor(c / gridW);
    for (var t = 0; t < SHAPES.length; t++) {
      for (var r = 0; r < 4; r++) {
        var info = pieceInfo(t, r);
        var cells = info.cells;
        for (var a = 0; a < 4; a++) {
          // 块内格 a 对齐 c：col/row 由 minC/minR 归一化反推
          var col = cCol - (cells[a][0] - info.minC);
          var row = cRow - (cells[a][1] - info.minR);
          // 越界剪枝：块必须完全落在 grid 内（否则必有格不在 targetSet → 必被剪）
          if (col < 0 || col + info.w > gridW || row < 0 || row + info.h > gridH) { continue; }
          var abs = absCellsW(t, r, col, row, gridW);
          var ok = true;
          for (var j = 0; j < abs.length; j++) {
            if (!targetSet[abs[j]] || occupied[abs[j]]) { ok = false; break; }
          }
          if (!ok) { continue; }
          for (var j2 = 0; j2 < abs.length; j2++) { occupied[abs[j2]] = true; }
          placed.push({ type: t, rot: r, col: col, row: row });
          var sub = dfsPartition(placed, occupied, depth + 1, K, targetSet, gridW, gridH, budget, out);
          if (sub === 'done' || sub === 'unknown') { return sub; }
          placed.pop();
          for (var j3 = 0; j3 < abs.length; j3++) { delete occupied[abs[j3]]; }
        }
      }
    }
    return 'continue';
  }

  function verifyFall(pieces, gridW, gridH, budget) {
    var remaining = pieces.slice();
    var occupied = {};
    var order = [];   // v1.2 追加：记录合法放序（refPieces 必须是可回放的落定顺序——方案 §4.1 断言）
    while (remaining.length > 0) {
      budget.n += 1;
      if (budget.n > SOLVE_MAX_NODES) { return 'unknown'; }
      var placedAny = false;
      for (var i = 0; i < remaining.length; i++) {
        var pc = remaining[i];
        var info = pieceInfo(pc.type, pc.rot);
        // 触底：row+1+h > gridH（r+1 处到底）或 紧邻下方（row+1 处）与已放格有交集
        var can = (pc.row + 1 + info.h > gridH);
        if (!can) {
          var below = absCellsW(pc.type, pc.rot, pc.col, pc.row + 1, gridW);
          for (var b = 0; b < below.length; b++) {
            if (occupied[below[b]]) { can = true; break; }
          }
        }
        if (!can) { continue; }
        // 自身在 row 处与已放格无重叠（分割保证，防御性再查）
        var cells = absCellsW(pc.type, pc.rot, pc.col, pc.row, gridW);
        var clash = false;
        for (var c2 = 0; c2 < cells.length; c2++) {
          if (occupied[cells[c2]]) { clash = true; break; }
        }
        if (clash) { continue; }
        for (var c3 = 0; c3 < cells.length; c3++) { occupied[cells[c3]] = true; }
        order.push(pc);   // 记录放序
        remaining.splice(i, 1);
        placedAny = true;
        break;
      }
      if (!placedAny) { return false; }   // 无可放块且未放完 → 该分割不可拼
    }
    return order;   // 返回合法放序（可回放）——重构：true → 放序数组
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

    // v1.2：自建关卡入口（关卡编辑器——创作闭环）
    var customCard = makeEl('button', 'level-card');
    customCard.appendChild(makeEl('div', 'level-name', '🛠 自建关卡 (' + customLevels.length + ')'));
    customCard.appendChild(makeEl('div', 'level-best', '画自己的图案！'));
    customCard.addEventListener('click', function () { viewCustomList(); });
    wrap.appendChild(customCard);

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
        var label = h.level === 'custom' ? ('自建关卡·' + h.customName) : (LEVELS_CFG[h.level] ? LEVELS_CFG[h.level].label : h.level);   // v1.2：custom 历史显示自建关卡名
        wrap.appendChild(makeEl('div', 'parent-row small', h.date + ' · ' + label + ' · ' + h.stars + '★'));
      });
    }
    var back = makeEl('button', 'btn', '‹ 返回');
    back.addEventListener('click', function () { viewHome(); });
    wrap.appendChild(back);
    var clearBtn = makeEl('button', 'btn btn-danger', '清除所有数据');
    clearBtn.addEventListener('click', function () {
      if (window.confirm('确定清除所有练习数据（含自建关卡）？此操作不可恢复。')) {
        LX_SHARED.storage.remove('v1');
        LX_SHARED.storage.remove('customLevels');   // v1.2：自建关卡随数据清除一并删除（走迷宫 v1.9 B5 教训）
        customLevels.length = 0;
        store = loadStore();
        saveStore();
        viewHome();
      }
    });
    wrap.appendChild(clearBtn);
    viewEl.appendChild(wrap);
    renderFooter('');
  }

  /* ---------- v1.2 自建关卡：关卡库 + 编辑器 ---------- */
  var EDIT_WH = 10;   // 编辑器固定 10×10（Oracle N2 确认）
  var editState = { idx: -1, cells: [], tool: 'paint', name: '', checkOk: false };

  function viewCustomList() {
    state.finished = false;
    stopTimer();
    renderHeader();
    clearNode(viewEl);
    var wrap = makeEl('div', 'custom-wrap');
    wrap.appendChild(makeEl('h2', 'custom-title', '🛠 自建关卡'));
    if (!customLevels.length) {
      wrap.appendChild(makeEl('p', 'custom-empty', '还没有自建关卡，点击下方「新建关卡」画一个吧！'));
    }
    customLevels.forEach(function (cl, idx) {
      var row = makeEl('div', 'custom-item');
      var info = makeEl('div', 'custom-item-main');
      info.appendChild(makeEl('div', 'custom-item-name', cl.name));
      info.appendChild(makeEl('div', 'custom-item-meta', (cl.solved ? '✅ 已解' : '🕓 未解') + ' · ' + cl.gridW + '×' + cl.gridH));
      row.appendChild(info);
      var btns = makeEl('div', 'custom-btns');
      var editBtn = makeEl('button', 'btn btn-mini', '✏ 编辑');
      editBtn.addEventListener('click', function () { viewEditor(idx); });
      btns.appendChild(editBtn);
      var playBtn = makeEl('button', 'btn btn-mini btn-primary', '▶ 挑战');
      playBtn.addEventListener('click', function () { startCustom(idx); });
      btns.appendChild(playBtn);
      var delBtn = makeEl('button', 'btn btn-mini btn-danger', '🗑 删除');
      delBtn.addEventListener('click', function () {
        if (window.confirm('删除自建关卡「' + cl.name + '」？')) {
          removeCustomLevel(cl.id);
          viewCustomList();
        }
      });
      btns.appendChild(delBtn);
      row.appendChild(btns);
      wrap.appendChild(row);
    });
    var newBtn = makeEl('button', 'btn btn-primary', '+ 新建关卡');
    newBtn.addEventListener('click', function () { viewEditor(-1); });
    wrap.appendChild(newBtn);
    if (customLevels.length >= 20) {
      wrap.appendChild(makeEl('p', 'custom-limit', '⚠ 已达上限 20 关，删除后可再新建'));
    }
    var back = makeEl('button', 'btn', '‹ 返回');
    back.addEventListener('click', function () { viewHome(); });
    wrap.appendChild(back);
    viewEl.appendChild(wrap);
    renderFooter('');
  }

  function viewEditor(editIdx) {
    state.finished = false;
    stopTimer();
    renderHeader();
    clearNode(viewEl);
    var wrap = makeEl('div', 'edit-wrap');
    // 顶栏
    var top = makeEl('div', 'game-top');
    var back = makeEl('button', 'game-back', '‹ 返回');
    back.addEventListener('click', function () { viewCustomList(); });
    top.appendChild(back);
    top.appendChild(makeEl('div', 'game-prog', '🛠 图案编辑器'));
    top.appendChild(makeEl('div', 'game-timer', '⏱ 10×10'));
    wrap.appendChild(top);
    // 编辑态初始化
    editState.idx = editIdx;
    editState.tool = 'paint';
    editState.checkOk = false;
    editState.cells = [];
    for (var i = 0; i < EDIT_WH * EDIT_WH; i++) { editState.cells.push(false); }
    if (editIdx >= 0 && customLevels[editIdx]) {
      var cl = customLevels[editIdx];
      editState.name = cl.name;
      // 载入该关图案（trim 后 cells 相对坐标 → 10×10 左上；再保存 re-trim 结果不变，图案精确保留）
      for (var c = 0; c < cl.cells.length; c++) {
        var ci = cl.cells[c];
        var cx = ci % cl.gridW;
        var cy = Math.floor(ci / cl.gridW);
        editState.cells[cy * EDIT_WH + cx] = true;
      }
    } else {
      editState.name = '';
    }
    // 名称输入
    var nameRow = makeEl('div', 'edit-name-row');
    nameRow.appendChild(makeEl('label', 'edit-name-label', '名称：'));
    var nameInput = makeEl('input', 'edit-name-input');
    nameInput.type = 'text';
    nameInput.maxLength = 12;
    nameInput.value = editState.name || ('我的图案 ' + (customLevels.length + 1));
    nameInput.addEventListener('input', function () { editState.name = nameInput.value; });
    nameRow.appendChild(nameInput);
    nameRow.appendChild(makeEl('span', 'edit-name-tip', '（≤12字）'));
    wrap.appendChild(nameRow);
    // 网格（SVG，画格 = 橙色半透明同目标叠加色）
    var board = makeEl('div', 'edit-board');
    board.id = 'edit-board';
    wrap.appendChild(board);
    // 画笔工具条
    var tools = makeEl('div', 'edit-tools');
    var paintBtn = makeEl('button', 'btn btn-mini edit-tool active', '🧱 画格');
    paintBtn.id = 'edit-tool-paint';
    paintBtn.addEventListener('click', function () { setEditTool('paint'); });
    tools.appendChild(paintBtn);
    var eraseBtn = makeEl('button', 'btn btn-mini edit-tool', '🧹 橡皮');
    eraseBtn.id = 'edit-tool-erase';
    eraseBtn.addEventListener('click', function () { setEditTool('erase'); });
    tools.appendChild(eraseBtn);
    wrap.appendChild(tools);
    // 操作按钮
    var acts = makeEl('div', 'edit-acts');
    var checkBtn = makeEl('button', 'btn btn-mini', '✓ 检查可拼');
    checkBtn.addEventListener('click', function () { doEditCheck(); });
    acts.appendChild(checkBtn);
    var saveBtn = makeEl('button', 'btn btn-mini btn-primary', '💾 保存');
    saveBtn.addEventListener('click', function () { doEditSave(); });
    acts.appendChild(saveBtn);
    var clearBtn = makeEl('button', 'btn btn-mini', '↺ 清空');
    clearBtn.addEventListener('click', function () {
      if (window.confirm('清空当前图案？')) {
        for (var i2 = 0; i2 < editState.cells.length; i2++) { editState.cells[i2] = false; }
        editState.checkOk = false;
        renderEditBoard();
      }
    });
    acts.appendChild(clearBtn);
    wrap.appendChild(acts);
    // 反馈
    var fb = makeEl('div', 'game-feedback', '在格子里画目标图案，画完检查能不能拼出来');
    fb.id = 'edit-feedback';
    wrap.appendChild(fb);
    viewEl.appendChild(wrap);
    renderEditBoard();   // v1.2 修复：元素挂载后渲染（此前 getElementById 拿不到未挂载节点）
    renderFooter('');
  }

  /* 编辑器网格渲染（boardHtmlEdit：10×10 SVG，画格橙色半透明） */
  function boardHtmlEdit() {
    var cs = 32;
    var parts = ['<svg id="edit-svg" class="edit-svg" viewBox="0 0 ' + (EDIT_WH * cs) + ' ' + (EDIT_WH * cs) + '">'];
    for (var y = 0; y < EDIT_WH; y++) {
      for (var x = 0; x < EDIT_WH; x++) {
        var idx = y * EDIT_WH + x;
        parts.push('<rect x="' + (x * cs) + '" y="' + (y * cs) + '" width="' + cs + '" height="' + cs + '" fill="#f0f2f5" stroke="#e0e3e8" stroke-width="1"/>');
        parts.push('<rect data-i="' + idx + '" x="' + (x * cs + 2) + '" y="' + (y * cs + 2) + '" width="' + (cs - 4) + '" height="' + (cs - 4) + '" fill="#ff9c4a" opacity="' + (editState.cells[idx] ? '0.30' : '0') + '" rx="3"/>');
      }
    }
    parts.push('</svg>');
    return parts.join('');
  }

  function renderEditBoard() {
    var board = document.getElementById('edit-board');
    if (!board) { return; }
    board.innerHTML = boardHtmlEdit();
    var svg = document.getElementById('edit-svg');
    if (!svg) { return; }
    // 拖动涂格：pointerdown + setPointerCapture + pointermove（Chrome 55+，61 基线内）
    svg.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* 兼容 */ }
      paintEditCell(ev, svg);
    });
    svg.addEventListener('pointermove', function (ev) {
      if (!ev.buttons) { return; }
      paintEditCell(ev, svg);
    });
    // click 兜底（辅助技术/JS 触发 .click() 只派发 click 不派发 pointerdown）
    svg.addEventListener('click', function (ev) { paintEditCell(ev, svg); });
  }

  /* 涂格（单层模型：画格 true / 橡皮 false）——仅改目标格 overlay，不整幅重绘（保持 pointer capture 连续） */
  function paintEditCell(ev, svg) {
    var rect = svg.getBoundingClientRect();
    var px = ev.clientX - rect.left;
    var py = ev.clientY - rect.top;
    if (px < 0 || py < 0 || px >= rect.width || py >= rect.height) { return; }
    var x = Math.floor(px / rect.width * EDIT_WH);
    var y = Math.floor(py / rect.height * EDIT_WH);
    if (x >= EDIT_WH) { x = EDIT_WH - 1; }
    if (y >= EDIT_WH) { y = EDIT_WH - 1; }
    var idx = y * EDIT_WH + x;
    var val = editState.tool === 'paint';
    if (editState.cells[idx] === val) { return; }   // 未变化不重绘（拖动性能）
    editState.cells[idx] = val;
    var ov = svg.querySelector('rect[data-i="' + idx + '"]');
    if (ov) { ov.setAttribute('opacity', val ? '0.30' : '0'); }
  }

  function setEditTool(tool) {
    editState.tool = tool;
    var pb = document.getElementById('edit-tool-paint');
    var eb = document.getElementById('edit-tool-erase');
    if (pb) { pb.className = 'btn btn-mini edit-tool' + (tool === 'paint' ? ' active' : ''); }
    if (eb) { eb.className = 'btn btn-mini edit-tool' + (tool === 'erase' ? ' active' : ''); }
  }

  /* 校验当前图案（trim 非空行列 → targetSet → checkSolvable） */
  function validateEdit() {
    var count = 0, minC = 99, maxC = -1, minR = 99, maxR = -1;
    for (var i = 0; i < editState.cells.length; i++) {
      if (editState.cells[i]) {
        count += 1;
        var x = i % EDIT_WH;
        var y = Math.floor(i / EDIT_WH);
        if (x < minC) { minC = x; }
        if (x > maxC) { maxC = x; }
        if (y < minR) { minR = y; }
        if (y > maxR) { maxR = y; }
      }
    }
    if (count === 0) { return { ok: false, msg: '😅 先画一些格子吧（格子数要是 4 的倍数）' }; }
    if (count % 4 !== 0) { return { ok: false, msg: '格子数要是 4 的倍数（每个方块占 4 格），现在是 ' + count + ' 格' }; }
    if (count > 24) { return { ok: false, msg: '最多 6 个方块（24 格），现在画了 ' + count + ' 格' }; }
    var gw = maxC - minC + 1;
    var gh = maxR - minR + 1;
    var targetSet = {};
    var cells = [];
    for (var j = 0; j < editState.cells.length; j++) {
      if (editState.cells[j]) {
        var xx = (j % EDIT_WH) - minC;
        var yy = Math.floor(j / EDIT_WH) - minR;
        targetSet[yy * gw + xx] = true;
        cells.push(yy * gw + xx);
      }
    }
    var K = count / 4;
    var sol = checkSolvable(gw, gh, targetSet, K);
    if (sol === 'unknown') { return { ok: false, msg: '🤔 图案有点复杂，试试缩小或改一改图案' }; }
    if (sol === false) { return { ok: false, msg: '✗ 这个图案拼不出来（方块要从上往下落，试试调整悬空的格子）' }; }
    return { ok: true, msg: '✓ 可拼！可以保存啦（' + K + ' 个方块）', refPieces: sol, gw: gw, gh: gh, cells: cells };
  }

  function doEditCheck() {
    var res = validateEdit();
    var fb = document.getElementById('edit-feedback');
    if (fb) { fb.textContent = res.msg; fb.className = res.ok ? 'game-feedback ok' : 'game-feedback miss'; }
    editState.checkOk = res.ok;
  }

  function doEditSave() {
    var fb = document.getElementById('edit-feedback');
    var res = validateEdit();   // 保存前重新校验（防检查后改图 → 存脏解）
    if (!res.ok) {
      if (fb) { fb.textContent = '先通过「✓ 检查可拼」再保存：' + res.msg; fb.className = 'game-feedback miss'; }
      return;
    }
    var name = (editState.name || '').replace(/^\s+|\s+$/g, '') || ('我的图案 ' + (customLevels.length + 1));
    if (editState.idx >= 0 && customLevels[editState.idx]) {
      // 编辑已有：原位更新（保留 id/solved）
      var cl = customLevels[editState.idx];
      cl.name = name;
      cl.cells = res.cells;
      cl.gridW = res.gw;
      cl.gridH = res.gh;
      cl.refPieces = res.refPieces;
      cl.createdAt = Date.now();
      saveCustomLevels(customLevels);
      viewCustomList();
      return;
    }
    var id = addCustomLevel(res.cells, res.gw, res.gh, res.refPieces, name);
    if (id === null) {
      if (fb) { fb.textContent = '自建关卡最多 20 个，先删除一些旧的吧'; fb.className = 'game-feedback miss'; }
      return;
    }
    viewCustomList();
  }

  /* ---------- v1.2 自建关卡：练习启动（复刻 startGame 完整启动序列） ---------- */
  function startCustom(idx) {
    state.execLock = false; state.execDone = false; state.won = false;
    state.placed = [];
    state.curIdx = 0;
    state.curEditIdx = 0;
    state.cur = null;                               // v1.2（Oracle I3）：重置执行预览，防 renderPreview 残留
    state.diffCells = null;                         // v1.2：同步 resetBtn/startGame 语义
    if (state.stepTimer) { clearTimeout(state.stepTimer); state.stepTimer = null; }   // N-6：防幻影执行
    state.level = 'custom';
    state.customIdx = idx;
    var cl = customLevels[idx];
    state.gridW = cl.gridW;
    state.gridH = cl.gridH;
    state.targetCells = {};
    for (var i = 0; i < cl.cells.length; i++) { state.targetCells[cl.cells[i]] = true; }
    state.pieces = cl.refPieces.map(function (rp) {
      return { type: rp.type, rot: rp.rot, col: rp.col, row: rp.row, cells: null };
    });   // 参考解作 pieces 骨架（块 tab/预览）；cells 由执行时计算
    state.blockCmds = state.pieces.map(function () { return []; });
    state.finished = false;
    renderGame();
    state.startMs = Date.now();
    startTimer();
  }

  /* ---------- 视图：练习页 ---------- */
  // v1.1 已编块数（有指令的块）
  function countEditedBlocks() {
    var n = 0;
    for (var i = 0; i < state.blockCmds.length; i++) {
      if (state.blockCmds[i] && state.blockCmds[i].length > 0) { n += 1; }
    }
    return n;
  }
  // v1.1 块 tab 行刷新（当前编辑块高亮 + 已编 ✓ 标记；addCmd/removeCmd/tab 切换后调用）
  function renderBlockTabs() {
    var tabs = document.getElementById('block-tabs');
    if (!tabs) { return; }
    clearNode(tabs);
    state.pieces.forEach(function (pc, ti) {
      var tab = makeEl('button', 'block-tab' + (ti === state.curEditIdx ? ' active' : ''), '第 ' + (ti + 1) + ' 块');
      tab.setAttribute('data-bidx', ti);
      tab.appendChild(makeEl('span', 'tab-piece-dot', TYPE_NAMES[pc.type]));
      if (state.blockCmds[ti] && state.blockCmds[ti].length > 0) { tab.appendChild(makeEl('span', 'tab-done', '✓')); }
      tab.addEventListener('click', function () {
        if (state.execLock) { return; }
        state.curEditIdx = ti;
        renderBlockTabs();
        renderSeq();
        renderPreview();
      });
      tabs.appendChild(tab);
    });
    // 进度「已编 X/K」随 tab 更新
    var prog = document.getElementById('game-prog');
    if (prog && !state.execLock) { prog.textContent = levelLabel() + ' · 已编 ' + countEditedBlocks() + '/' + state.pieces.length + ' 块'; }   // v1.2：custom 用自建关卡名
  }

  function startGame(level) {
    state.level = level;
    state.finished = false;
    state.execLock = false; state.execDone = false; state.won = false;
    state.placed = [];
    state.curIdx = 0;
    state.curEditIdx = 0;
    state.cur = null;                    // v1.2（Oracle N2）：重置执行预览，防 renderPreview 残留
    state.diffCells = null;              // v1.2（Oracle N2）：同步 startCustom 语义
    if (state.stepTimer) { clearTimeout(state.stepTimer); state.stepTimer = null; }
    var res = genLevel(level);
    if (!res) { genLevel(level); } // 极罕见：二次生成
    // v1.1：blockCmds 初始化（每块独立序列）+ 清理执行定时器（N-6）
    state.blockCmds = state.pieces.map(function () { return []; });
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
    var lvEl = makeEl('div', 'game-prog', levelLabel() + ' · 已编 ' + countEditedBlocks() + '/' + state.pieces.length + ' 块');
    lvEl.id = 'game-prog';
    top.appendChild(lvEl);
    var timerEl = makeEl('div', 'game-timer', '⏱ 00.0');
    timerEl.id = 'game-timer';
    top.appendChild(timerEl);
    var hint = makeEl('div', 'game-hint', '目标：把方块排成橙色图案');
    top.appendChild(hint);
    wrap.appendChild(top);

    // v1.1 块 tab 行：每块一个 tab（第N块），当前编辑块高亮；点击切换 curEditIdx
    var tabs = makeEl('div', 'block-tabs');
    tabs.id = 'block-tabs';
    state.pieces.forEach(function (pc, ti) {
      var tab = makeEl('button', 'block-tab' + (ti === state.curEditIdx ? ' active' : ''), '第 ' + (ti + 1) + ' 块');
      tab.setAttribute('data-bidx', ti);
      // 类型色块小图标
      tab.appendChild(makeEl('span', 'tab-piece-dot', TYPE_NAMES[pc.type]));
      // 已编提示（有指令的块显示 ✓）
      if (state.blockCmds[ti] && state.blockCmds[ti].length > 0) { tab.appendChild(makeEl('span', 'tab-done', '✓')); }
      tab.addEventListener('click', function () {
        if (state.execLock) { return; }   // 执行中禁用 tab（I-1）
        state.curEditIdx = ti;
        renderBlockTabs();
        renderSeq();
        renderPreview();
      });
      tabs.appendChild(tab);
    });
    wrap.appendChild(tabs);

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

    // 指令序列（v1.1：当前编辑块 curEditIdx 的指令，可删除/循环参数递增）
    var seqWrap = makeEl('div', 'seq-wrap');
    seqWrap.id = 'seq-wrap';
    var seqBox = makeEl('div', 'seq-box');
    seqBox.id = 'seq-box';
    seqBox.textContent = '（空指令）';
    seqWrap.appendChild(seqBox);
    var clearBtn = makeEl('button', 'seq-clear', '↺ 清空');
    clearBtn.addEventListener('click', function () { state.blockCmds[state.curEditIdx] = []; renderSeq(); renderBlockTabs(); });   // v1.1 Oracle N-1：清空后同步 tab ✓/进度
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
      if (state.level === 'custom') { startCustom(state.customIdx); return; }   // v1.2 custom：重载同关（重玩参考解仍有效；不再随机）
      state.execLock = false; state.execDone = false; state.won = false;
      state.placed = []; state.curIdx = 0;
      state.curEditIdx = 0;   // v1.1：编辑态重置
      if (state.stepTimer) { clearTimeout(state.stepTimer); state.stepTimer = null; }   // N-6：防幻影执行
      state.diffCells = null;
      setCmdLocked(false);
      var res = genLevel(state.level);
      if (!res) { genLevel(state.level); }
      state.blockCmds = state.pieces.map(function () { return []; });   // v1.1：blockCmds 全清 + 对应新关
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
    var fb = makeEl('div', 'game-feedback', '给每块编指令，再点执行全部！');
    fb.id = 'game-feedback';
    wrap.appendChild(fb);

    viewEl.appendChild(wrap);
    renderSeq();
    renderFooter('');
  }

  function renderSeq() {
    var box = document.getElementById('seq-box');
    if (!box) { return; }
    var cmds = state.blockCmds[state.curEditIdx] || [];   // v1.1：当前编辑块
    if (!cmds.length) {
      box.textContent = '（空指令）';
      box.className = 'seq-box';
      return;
    }
    box.className = 'seq-box active';
    clearNode(box);
    cmds.forEach(function (cmd, i) {
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
    var cmds = state.blockCmds[state.curEditIdx] || [];
    var cmd = cmds[i];
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
    if (!state.blockCmds[state.curEditIdx]) { state.blockCmds[state.curEditIdx] = []; }
    state.blockCmds[state.curEditIdx].push({ id: id, val: val });   // v1.1：当前编辑块
    renderSeq();
    renderBlockTabs();   // ✓ 标记 + 进度更新
  }
  function removeCmd(i) {
    if (state.execLock) { return; }
    state.blockCmds[state.curEditIdx].splice(i, 1);   // v1.1：当前编辑块
    renderSeq();
    renderBlockTabs();
  }

  /* ---------- 执行器（编程核心，v1.1 整体编排） ---------- */
  // v1.1：一次性执行全部 K 块（每块按 blockCmds[i] 顺序执行，统一判定）
  function execRun() {
    if (state.execLock || state.execDone || state.won) { return; }
    // I-2（Oracle）：全空守卫——非静默，提示先编指令；首块空不阻塞（endBlock 原位落定续跑）
    var total = 0;
    for (var bi = 0; bi < state.blockCmds.length; bi++) {
      if (state.blockCmds[bi]) { total += state.blockCmds[bi].length; }
    }
    if (total === 0) {
      var fb0 = document.getElementById('game-feedback');
      if (fb0) { fb0.textContent = '😅 先给至少一块编指令，再点执行！'; fb0.className = 'game-feedback miss'; }
      return;
    }
    // I-4（Oracle）：全量执行前置重置——curIdx=0 + placed=[]（防重玩残留）+ 清理执行定时器（N-6）
    state.curIdx = 0;
    state.placed = [];
    if (state.stepTimer) { clearTimeout(state.stepTimer); state.stepTimer = null; }
    state.execLock = true;
    state.diffCells = null;
    setCmdLocked(true);
    var fb = document.getElementById('game-feedback');
    if (fb) { fb.textContent = '第 1/' + state.pieces.length + ' 块执行中…'; fb.className = 'game-feedback'; }
    renderSeq();
    // 第 0 块的执行快照
    var pc = state.pieces[0];
    state.cur = {
      type: pc.type,
      rot: 0,
      col: Math.floor(state.gridW / 2),
      cells: null
    };
    state.cmdProg = 0;
    execCmdStep();
  }

  // v1.1（Oracle I-1 修订）：当前块逐条执行指令；耗尽 → endBlock 落定 → 续下一块（整体编排不中断）
  function execCmdStep() {
    var cmdsThis = state.blockCmds[state.curIdx] || [];
    if (state.cmdProg >= cmdsThis.length) { endBlock(); return; }   // 本块完成（含空块 0>=0 直接落定）
    var cmd = cmdsThis[state.cmdProg];
    state.cmdProg += 1;
    var cur = state.cur;
    if (cmd.id === 'rot') {
      cur.rot = (cur.rot + cmd.val) % 4;
      renderPreview();
      state.stepTimer = setTimeout(execCmdStep, 300);   // N-6：存句柄
    } else if (cmd.id === 'left') {
      cur.col -= cmd.val;
      if (cur.col < 0) { cur.col = 0; flashEdge(); }
      renderBoardOnly(); renderPreview();
      state.stepTimer = setTimeout(execCmdStep, 300);
    } else if (cmd.id === 'right') {
      var info = pieceInfo(cur.type, cur.rot);
      var maxCol = state.gridW - info.w;
      cur.col += cmd.val;
      if (cur.col > maxCol) { cur.col = maxCol; flashEdge(); }
      renderBoardOnly(); renderPreview();
      state.stepTimer = setTimeout(execCmdStep, 300);
    } else if (cmd.id === 'drop') {
      // 落下动画：逐步下落（简化：直接落定）
      var placedCells = [];
      for (var p2 = 0; p2 < state.placed.length; p2++) {
        placedCells.push({ cells: state.placed[p2].cells });
      }
      var row2 = dropRowFor(cur.type, cur.rot, cur.col, placedCells);
      cur.row = row2 < 0 ? 0 : row2;
      cur.cells = absCells(cur.type, cur.rot, cur.col, cur.row);
      state.stepTimer = setTimeout(execCmdStep, 300);
    }
  }

  // v1.1（Oracle I-1 修订）：块结束状态机——落定 + 续下一块（或统一判定）
  //   6 处变更（对照 v1.0）：① 删 cmdCounts.push（星级改 Σ blockCmds）② 删 execLock=false（多块续跑保持锁定）
  //   ③ 删 setCmdLocked(false)（保持 UI 锁定防切 tab）④ 删 cmds=[]（blockCmds 持久）
  //   ⑤ 新增 state.cur 重建（下一块快照）⑥ 新增 setTimeout 续跑（含空块 300ms 视觉过渡，N-2）
  function endBlock() {
    var cur = state.cur;
    var placedCells = [];
    for (var p = 0; p < state.placed.length; p++) {
      placedCells.push({ cells: state.placed[p].cells });
    }
    var row = dropRowFor(cur.type, cur.rot, cur.col, placedCells);
    if (row < 0) { row = 0; }
    cur.row = row;
    cur.cells = absCells(cur.type, cur.rot, cur.col, row);
    state.placed.push({ type: cur.type, rot: cur.rot, col: cur.col, row: row, cells: cur.cells });
    state.curIdx += 1;
    renderBoardOnly();
    var prog = document.getElementById('game-prog');
    if (prog) { prog.textContent = levelLabel() + ' · 执行中 ' + state.curIdx + '/' + state.pieces.length + ' 块'; }
    // 判定（全部块落完 → 统一 checkWin）
    if (state.curIdx >= state.pieces.length) {
      state.execDone = true;
      state.execLock = false;
      setCmdLocked(false);
      checkWin();
      return;
    }
    // 逐块差格即时提示（不中断执行——整体编排语义）
    var fb = document.getElementById('game-feedback');
    var excess = calcExcessCells();
    if (excess && excess.length > 0) {
      state.diffCells = excess;
      if (fb) { fb.textContent = '块 ' + state.curIdx + ' 落定（有 ' + excess.length + ' 格放偏，执行完再调整）'; fb.className = 'game-feedback miss'; }
      renderBoardOnly();
    } else if (fb) { fb.textContent = '第 ' + state.curIdx + ' 块落定，继续执行…'; fb.className = 'game-feedback ok'; }
    // ⑤⑥ 下一块执行快照重建 + 短延迟续跑（空块也走此路径——原位落定）
    var pcN = state.pieces[state.curIdx];
    state.cur = { type: pcN.type, rot: 0, col: Math.floor(state.gridW / 2), cells: null };
    state.cmdProg = 0;
    renderPreview();
    state.stepTimer = setTimeout(execCmdStep, 300);   // N-6：存句柄
  }

  // 执行锁定：指令按钮/序列灰显不可点（v1.1 I-3：含块 tab）
  function setCmdLocked(locked) {
    var bars = document.querySelectorAll('.cmd-add, .seq-clear, .cmd-chip, .block-tab');
    for (var i = 0; i < bars.length; i++) {
      if (locked) { bars[i].setAttribute('disabled', 'disabled'); }
      else { bars[i].removeAttribute('disabled'); }
    }
  }

  // 当前块预览（指令编辑时实时显示旋转/移动后的位置）
  function renderPreview() {    var box = document.getElementById('piece-preview');
    if (!box) { return; }
    if (!state.cur || state.execDone) {
      // 未执行：显示生成器的目标块（v1.1 I-3：编辑态用 curEditIdx——tab 切换预览换块）
      if (state.curEditIdx < state.pieces.length) {
        var pc = state.pieces[state.curEditIdx];
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
    // v1.2（Oracle）：custom 分支——2★ 兜底（无 optimal）、不写 store.best/recent（防污染）、markCustomSolved
    if (state.level === 'custom') {
      var recC = { date: todayStr(), level: 'custom', customName: levelLabel(), stars: 2, cmds: 0 };
      store.history.push(recC);
      store.history = store.history.slice(-100);
      markCustomSolved(state.customIdx);
      saveStore();
      var fbC = document.getElementById('game-feedback');
      if (fbC) { fbC.textContent += '（2★，自建关卡）'; }
      return;
    }
    // v1.1：星级 Σ blockCmds[i].length（空块 0；blockCmds 全程持久）
    var total = 0;
    for (var i = 0; i < state.blockCmds.length; i++) {
      if (state.blockCmds[i]) { total += state.blockCmds[i].length; }
    }
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
    if (state.level === 'custom') { viewCustomList(); return; }   // v1.2：custom 结算后回关卡库（OG B7 教训）
    state.execLock = false; state.execDone = false; state.won = false;
    state.placed = [];
    state.curIdx = 0;
    state.curEditIdx = 0;   // v1.1：编辑态重置
    if (state.stepTimer) { clearTimeout(state.stepTimer); state.stepTimer = null; }   // N-6：防幻影执行
    state.diffCells = null;
    var res = genLevel(state.level);
    if (!res) { genLevel(state.level); }
    state.blockCmds = state.pieces.map(function () { return []; });   // v1.1：blockCmds 重置
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
  M.renderBlockTabs = renderBlockTabs;   // v1.1：测试/调试友好导出
  M.renderSeq = renderSeq;
  M.checkSolvable = checkSolvable;       // v1.2：可拼性校验（两阶段）——冒烟/单元测试
  M.viewCustomList = viewCustomList;     // v1.2：关卡库
  M.viewEditor = viewEditor;             // v1.2：编辑器
  M.startCustom = startCustom;           // v1.2：自建关卡练习启动
  M.validateEdit = validateEdit;         // v1.2：编辑图案校验（含 trim/格子数/checkSolvable）
  window.M = M;
})();
