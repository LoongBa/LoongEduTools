/* ============================================================
   循环指令 — main.js（益智·编程教学，D5 转型）
   ------------------------------------------------------------
   玩法：网格走廊盘面（起点 S + 终点 G⭐），孩子用指令让机器人
   从 S 走到 G。指令含显式循环块「🔁 重复 N 次 { 组指令 }」——
   v1.0 MVP 单层循环；v1.1 放开嵌套（循环块内可再嵌循环块 ≤2 层，
   🔁×M { 🔁×N {指令} } = 二维自动化）。
   - 指令：前进/左转/右转 + 循环块（单元）——循环 = 自动化
   - 判定：执行后机器人位置 = 目标格 = 有标准答案（走廊无捷径）
   - 星级：编写量（循环块1条 + 内部指令计1不乘N）vs 最优
     （v1.1 重定义为嵌套解写量常量 4；单层循环解 normal/hard 跌 2★）
   - 三档：简单（6×6, pattern2×3）/ 普通（8×8, pattern5×3）/
     挑战（10×10, pattern7×3）——展开写必 ≥1.5× optimal（封顶2★）
   - 生成：走廓生成（轨迹格空地 + 相邻非轨迹格墙）+ 自交检查 +
     simulate 纯函数（生成器与执行器共用）
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
  LX_SHARED.storage.configure({ toolName: 'xunhuan' });  // 键前缀 redtools.xunhuan.v1
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
    easy:   { key: 'easy',   label: '简单', size: 6, patternLen: 3, rep: 3 },   // [F,F,R] → 螺旋走廊
    normal: { key: 'normal', label: '普通', size: 8, patternLen: 6, rep: 3 },   // [F×5,R]（嵌套解 fwd 数 5 = patternLen−1，v1.1）
    hard:   { key: 'hard',   label: '挑战', size: 10, patternLen: 8, rep: 3 }   // [F×7,R]（嵌套解 fwd 数 7，v1.1）
  };
  var LEVEL_ORDER = ['easy', 'normal', 'hard'];

  /* 指令常量 */
  var CMD_FWD = { id: 'fwd', label: '⬆ 前进' };
  var CMD_LEFT = { id: 'left', label: '↰ 左转' };
  var CMD_RIGHT = { id: 'right', label: '↱ 右转' };
  var CMD_LOOP = { id: 'loop', label: '🔁 循环' };

  /* 方向（右/下/左/上，复用走迷宫 DIRS） */
  var DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

  /* ---------- 状态 ---------- */
  var state = {
    level: 'easy',
    gridW: 6, gridH: 6,
    walls: {},        // 墙体集合 {idx: true}（走廊）
    trace: [],        // 轨迹格 [x,y]（可行走空地）
    start: { x: 1, y: 1 }, startFace: 0,
    goal: null,       // {x, y}
    cmds: [],         // 指令树 [{type, rep?, body?}]
    optimal: 0,
    execLock: false,
    execDone: false,
    won: false,
    curPos: null, curFace: 0,   // 执行时机器人状态
    firstFail: null,  // {iterK, bodyIdx}（循环块级定位）
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
  function idxOf(x, y, w) { return y * w + x; }

  /* ---------- simulate 纯函数（oracle 3d：生成器与执行器共用） ---------- */
  function simulate(steps, size, start, startFace) {
    var pos = { x: start.x, y: start.y };
    var face = startFace;
    var trace = [{ x: pos.x, y: pos.y }];
    var posKey = (pos.x + ',' + pos.y);
    var seen = {};
    seen[posKey] = true;
    var selfIntersect = false;
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      if (s === 'left') {
        face = (face + 3) % 4;
      } else if (s === 'right') {
        face = (face + 1) % 4;
      } else { // fwd
        var nx = pos.x + DIRS[face][0];
        var ny = pos.y + DIRS[face][1];
        if (nx < 0 || nx >= size || ny < 0 || ny >= size) {
          return { invalid: true, selfIntersect: false, trace: trace, end: pos, face: face };
        }
        pos = { x: nx, y: ny };
        trace.push(pos);
        var key = nx + ',' + ny;
        if (seen[key]) { selfIntersect = true; }
        seen[key] = true;
      }
    }
    return { invalid: false, selfIntersect: selfIntersect, trace: trace, end: pos, face: face };
  }

  /* ---------- 生成器（走廊 + 自交 + 兜底，oracle v0.2） ---------- */
  // ★ 骨架 pattern：fwd 段 + 转向（同向螺旋生长，实验验证无近路）
  function genPattern(len) {
    var pat = [];
    for (var i = 0; i < len - 1; i++) { pat.push('fwd'); }
    pat.push('right');   // 统一右转向：螺旋走廊（向右/下生长，起点 (1,1) 安全）
    return pat;
  }

  // ★ 无近路校验：任意非连续步轨迹格不得 4 邻接（近路 = 捷径，破坏最优）
  function noNear(trace, size) {
    var set = {};
    for (var i = 0; i < trace.length; i++) {
      set[idxOf(trace[i].x, trace[i].y, size)] = i;
    }
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var a = 0; a < trace.length; a++) {
      for (var d = 0; d < 4; d++) {
        var nx = trace[a].x + dirs[d][0], ny = trace[a].y + dirs[d][1];
        if (nx < 0 || nx >= size || ny < 0 || ny >= size) { continue; }
        var nk = idxOf(nx, ny, size);
        if (set[nk] !== undefined && Math.abs(set[nk] - a) !== 1) {
          return false;  // 非连续步相邻 → 近路
        }
      }
    }
    return true;
  }

  function buildCorridor(trace, size) {
    // 走廊：轨迹格 = 空地；轨迹格相邻的非轨迹格 = 墙
    var walls = {};
    var traceSet = {};
    for (var i = 0; i < trace.length; i++) {
      traceSet[idxOf(trace[i].x, trace[i].y, size)] = true;
    }
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        if (traceSet[idxOf(x, y, size)]) { continue; }
        // 相邻（4 邻）有轨迹格 → 墙
        if (hasTraceNeighbor(x, y, traceSet, size)) {
          walls[idxOf(x, y, size)] = true;
        }
      }
    }
    return walls;
  }
  function hasTraceNeighbor(x, y, traceSet, size) {
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < dirs.length; i++) {
      var nx = x + dirs[i][0], ny = y + dirs[i][1];
      if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
        if (traceSet[idxOf(nx, ny, size)]) { return true; }
      }
    }
    return false;
  }

  function genLevel(diff) {
    var cfg = LEVELS_CFG[diff];
    var guard = 0;
    while (guard < 200) {
      guard += 1;
      var pattern = genPattern(cfg.patternLen);
      // 展开 × rep
      var steps = [];
      for (var r = 0; r < cfg.rep; r++) {
        for (var p = 0; p < pattern.length; p++) { steps.push(pattern[p]); }
      }
      // simulate：S 固定 (1,1) 朝右（oracle 3b）
      var sim = simulate(steps, cfg.size, { x: 1, y: 1 }, 0);
      if (sim.invalid || sim.selfIntersect) { continue; }
      // 终点必须 ≠ 起点且轨迹覆盖 ≥ 4 格（路径有意义）
      if (sim.end.x === 1 && sim.end.y === 1) { continue; }
      // ★ 无近路校验（骨架 pattern 应天然通过，兜底重试）
      if (!noNear(sim.trace, cfg.size)) { continue; }
      var walls = buildCorridor(sim.trace, cfg.size);
      // ★ 最优性验证：走廊中从 S 到 G 的唯一路径 = 轨迹（独立 BFS）
      var uniq = verifyUniquePath(sim.trace, walls, cfg.size, { x: 1, y: 1 }, sim.end);
      if (!uniq) { continue; }
      return {
        walls: walls,
        trace: sim.trace,
        start: { x: 1, y: 1 }, startFace: 0,
        goal: sim.end,
        path: steps,
        pattern: pattern,
        rep: cfg.rep,
        optimal: 4    // ★ v1.1：optimal 重定义为嵌套解写量常量 4（§2.0/§2.4 权威口径；非 patternLen+1）
      };
    }
    // 兜底：直线走廊（最简单必有解）
    var straight = [];
    var size = cfg.size;
    for (var i = 0; i < size - 3; i++) { straight.push('fwd'); }
    var sim2 = simulate(straight, size, { x: 1, y: 1 }, 0);
    if (sim2.invalid) {
      var line2 = ['fwd', 'fwd'];
      sim2 = simulate(line2, size, { x: 1, y: 1 }, 0);
      return {
        walls: buildCorridor(sim2.trace, size),
        trace: sim2.trace,
        start: { x: 1, y: 1 }, startFace: 0,
        goal: sim2.end,
        path: line2,
        pattern: ['fwd'],
        rep: 2,
        optimal: 2
      };
    }
    return {
      walls: buildCorridor(sim2.trace, size),
      trace: sim2.trace,
      start: { x: 1, y: 1 }, startFace: 0,
      goal: sim2.end,
      path: straight,
      pattern: ['fwd'],
      rep: straight.length,
      optimal: 2
    };
  }

  // ★ 独立验证：轨迹格子图中从 S 到 G 的「最短路径长度 == 轨迹长度」（即唯一路径，无捷径）
  function verifyUniquePath(trace, walls, size, start, goal) {
    var traceSet = {};
    for (var i = 0; i < trace.length; i++) { traceSet[idxOf(trace[i].x, trace[i].y, size)] = true; }
    // BFS 在轨迹格子上
    var queue = [{ x: start.x, y: start.y, d: 0 }];
    var visited = {};
    visited[idxOf(start.x, start.y, size)] = true;
    var head = 0;
    while (head < queue.length) {
      var cur = queue[head]; head += 1;
      if (cur.x === goal.x && cur.y === goal.y) { return cur.d === trace.length - 1; }
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var d = 0; d < 4; d++) {
        var nx = cur.x + dirs[d][0], ny = cur.y + dirs[d][1];
        var k = idxOf(nx, ny, size);
        if (nx >= 0 && nx < size && ny >= 0 && ny < size && traceSet[k] && !visited[k]) {
          visited[k] = true;
          queue.push({ x: nx, y: ny, d: cur.d + 1 });
        }
      }
    }
    return false; // 不可达（不应发生）
  }

  /* ---------- 渲染：顶栏 ---------- */
  function renderHeader() {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '循环指令';
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
    wrap.appendChild(makeEl('h1', 'home-title', '🔁 循环指令'));
    wrap.appendChild(makeEl('p', 'home-sub', '用循环让机器人走重复的路线！'));

    LEVEL_ORDER.forEach(function (k) {
      var lv = LEVELS_CFG[k];
      var card = makeEl('button', 'level-card');
      var best = store.best[k];
      var bestTxt = best ? '最佳 ' + best.stars + '★' : '未挑战';
      card.appendChild(makeEl('div', 'level-name', lv.label + ' · ' + lv.size + '×' + lv.size));
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
    state.firstFail = null;
    state.totalCmds = 0;   // 编写量（循环块1 + 内部指令1，不乘 N）
    var lv = genLevel(level);
    state.gridW = state.gridH = LEVELS_CFG[level].size;
    state.walls = lv.walls;
    state.trace = lv.trace;
    state.start = lv.start; state.startFace = lv.startFace;
    state.goal = lv.goal;
    state.optimal = lv.optimal;
    state.curPos = { x: lv.start.x, y: lv.start.y };
    state.curFace = lv.startFace;
    renderGame();
    state.startMs = Date.now();
    startTimer();
  }

  /* 盘面渲染：走廊 + 轨迹格 + 机器人 + 目标 */
  function boardHtml() {
    var W = state.gridW, H = state.gridH;
    var cs = 34;
    var parts = ['<svg id="board-svg" class="board-svg" viewBox="0 0 ' + (W * cs) + ' ' + (H * cs) + '">'];
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var i = y * W + x;
        var px = x * cs, py = y * cs;
        var isTrace = false;
        for (var t = 0; t < state.trace.length; t++) {
          if (state.trace[t].x === x && state.trace[t].y === y) { isTrace = true; break; }
        }
        if (state.walls[i]) {
          parts.push('<rect x="' + px + '" y="' + py + '" width="' + cs + '" height="' + cs + '" fill="#8a8f98"/>');
        } else if (isTrace) {
          parts.push('<rect x="' + px + '" y="' + py + '" width="' + cs + '" height="' + cs + '" fill="#f0f2f5" stroke="#e0e3e8" stroke-width="1"/>');
        } else {
          parts.push('<rect x="' + px + '" y="' + py + '" width="' + cs + '" height="' + cs + '" fill="#fafafc" stroke="#f0f0f2" stroke-width="1"/>');
        }
      }
    }
    // 轨迹格标（走过路径浅标）
    for (var k = 0; k < state.trace.length; k++) {
      var tp = state.trace[k];
      var tpx = tp.x * cs, tpy = tp.y * cs;
      parts.push('<circle cx="' + (tpx + cs / 2) + '" cy="' + (tpy + cs / 2) + '" r="4" fill="#d5dbe0"/>');
    }
    // 目标 ⭐
    if (state.goal) {
      var gpx = state.goal.x * cs + cs / 2, gpy = state.goal.y * cs + cs / 2;
      parts.push('<text x="' + gpx + '" y="' + (gpy + 6) + '" font-size="18" text-anchor="middle">⭐</text>');
    }
    // 机器人
    if (state.curPos) {
      var rpx = state.curPos.x * cs + cs / 2, rpy = state.curPos.y * cs + cs / 2;
      parts.push('<circle cx="' + rpx + '" cy="' + rpy + '" r="11" fill="#3a7bd5"/>');
      parts.push('<circle cx="' + rpx + '" cy="' + rpy + '" r="4" fill="#ffffff"/>');
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
    var lvEl = makeEl('div', 'game-prog', LEVELS_CFG[state.level].label + ' · 让机器人到 ⭐');
    lvEl.id = 'game-prog';
    top.appendChild(lvEl);
    var timerEl = makeEl('div', 'game-timer', '⏱ 00.0');
    timerEl.id = 'game-timer';
    top.appendChild(timerEl);
    var hint = makeEl('div', 'game-hint', '核心：找规律，用循环块一次搞定');
    top.appendChild(hint);
    wrap.appendChild(top);

    // 盘面
    var board = makeEl('div', 'board');
    board.id = 'board';
    board.innerHTML = boardHtml();
    wrap.appendChild(board);

    // 概念卡（循环 vs 走迷宫 ×N + v1.1 嵌套循环）
    var concept = makeEl('div', 'concept-note', '💡 循环块 = 让一「组」动作重复做；走迷宫的 ×N 是让一个动作重复做；嵌套循环 = 循环套循环：外层每轮完整执行一遍内层');
    wrap.appendChild(concept);

    // 指令区
    var cmdBar = makeEl('div', 'cmd-bar');
    cmdBar.id = 'cmd-bar';
    [CMD_FWD, CMD_LEFT, CMD_RIGHT, CMD_LOOP].forEach(function (cmd) {
      var btn = makeEl('button', 'cmd-add', cmd.label);
      btn.addEventListener('click', function () { addTopCmd(cmd.id); });
      cmdBar.appendChild(btn);
    });
    wrap.appendChild(cmdBar);

    // 指令序列区（分层渲染）
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

    // 块内编辑区（循环块打开时显示）
    var blockEdit = makeEl('div', 'block-edit');
    blockEdit.id = 'block-edit';
    wrap.appendChild(blockEdit);

    // 执行控制
    var ctrl = makeEl('div', 'ctrl-row');
    var runBtn = makeEl('button', 'btn btn-primary', '▶ 执行');
    runBtn.id = 'run-btn';
    runBtn.addEventListener('click', function () { execRun(); });
    ctrl.appendChild(runBtn);
    var resetBtn = makeEl('button', 'btn', '⟲ 重置');
    resetBtn.addEventListener('click', function () {
      state.execLock = false; state.execDone = false; state.won = false;
      state.cmds = []; state.totalCmds = 0; state.firstFail = null;
      state.curPos = { x: state.start.x, y: state.start.y };
      state.curFace = state.startFace;
      setCmdLocked(false);
      renderBoardOnly(); renderSeq();
      var fb = document.getElementById('game-feedback');
      if (fb) { fb.textContent = '盘面已重置，重新编指令！'; fb.className = 'game-feedback'; }
    });
    ctrl.appendChild(resetBtn);
    var nextBtn = makeEl('button', 'btn', '下一题 ›');
    nextBtn.id = 'next-btn';
    nextBtn.style.display = 'none';
    nextBtn.addEventListener('click', function () { nextLevel(); });
    ctrl.appendChild(nextBtn);
    wrap.appendChild(ctrl);

    // 反馈
    var fb = makeEl('div', 'game-feedback', '编指令让机器人走到 ⭐！');
    fb.id = 'game-feedback';
    wrap.appendChild(fb);

    viewEl.appendChild(wrap);
    renderSeq();
    renderFooter('');
  }

  /* ---------- 指令树交互（分层：顶层 + 循环块内） ---------- */
  var editCtx = { loopIdx: -1, innerIdx: -1 };   // -1 = 顶层/未展开；innerIdx >= 0 = 正在编辑 cmds[loopIdx].body[innerIdx] 内层循环块

  function addTopCmd(id) {
    if (state.execLock) { return; }
    if (state.execDone || state.won) { return; }
    if (id === 'loop') {
      state.cmds.push({ type: 'loop', rep: 2, body: [] });
      editCtx.loopIdx = -1;   // 不自动展开，点击块才编辑
    } else {
      state.cmds.push({ type: id });
    }
    renderSeq();
  }

  function addBodyCmd(id) {
    if (state.execLock) { return; }
    if (editCtx.loopIdx < 0) { return; }
    var outer = state.cmds[editCtx.loopIdx];
    if (!outer || outer.type !== 'loop') { return; }
    var loop;
    if (editCtx.innerIdx >= 0) {                 // 内层编辑态 → 目标 = 内层 loop
      loop = outer.body[editCtx.innerIdx];
      if (!loop || loop.type !== 'loop') { return; }
    } else {                                     // 外层编辑态 → 目标 = 外层 loop
      loop = outer;
    }
    if (id === 'loop') {
      if (loopDepth() >= 2) {                    // 嵌套 ≤2 层守卫
        var fb = document.getElementById('game-feedback');
        if (fb) { fb.textContent = '⚠ 循环嵌套最多 2 层'; fb.className = 'game-feedback miss'; }
        return;
      }
      loop.body.push({ type: 'loop', rep: 2, body: [] });   // N1：默认 rep=2（hard 需点 5 次到 7，UX 可接受）
    } else {
      loop.body.push({ type: id });
    }
    renderSeq();
  }

  /* v1.1：当前嵌套深度 = 正在编辑外层循环(loopIdx>=0 ? 1 : 0) + 已展开内层循环(innerIdx>=0 ? 1 : 0) */
  function loopDepth() {
    return (editCtx.loopIdx >= 0 ? 1 : 0) + (editCtx.innerIdx >= 0 ? 1 : 0);
  }

  function removeTopCmd(i) {
    if (state.execLock) { return; }
    state.cmds.splice(i, 1);
    if (editCtx.loopIdx > i) { editCtx.loopIdx -= 1; }
    else if (editCtx.loopIdx === i) { editCtx.loopIdx = -1; }
    renderSeq();
  }

  function removeBodyCmd(i) {
    if (state.execLock) { return; }
    if (editCtx.loopIdx < 0) { return; }
    var outer = state.cmds[editCtx.loopIdx];
    if (!outer || outer.type !== 'loop') { return; }
    if (editCtx.innerIdx >= 0) {
      // 内层编辑态：splice 内层 loop 的 body
      var inner = outer.body[editCtx.innerIdx];
      if (!inner) { return; }
      inner.body.splice(i, 1);
    } else {
      // 外层编辑态：splice 外层 loop 的 body；删到内层 loop → innerIdx 校正回退
      outer.body.splice(i, 1);
      if (editCtx.innerIdx === i) { editCtx.innerIdx = -1; }
      else if (editCtx.innerIdx > i) { editCtx.innerIdx -= 1; }
    }
    renderSeq();
  }

  // 循环块 N 递增 2→3→…→9→2（上限 9，顶层与内层共用，v1.1 放开）
  function cycleLoopRep() {
    if (state.execLock) { return; }
    var loop;
    if (editCtx.innerIdx >= 0) {            // 内层编辑态 → 操作内层 loop
      if (editCtx.loopIdx < 0) { return; }
      var outer = state.cmds[editCtx.loopIdx];
      if (!outer || outer.type !== 'loop') { return; }
      loop = outer.body[editCtx.innerIdx];
    } else if (editCtx.loopIdx >= 0) {      // 外层编辑态 → 操作外层 loop（v1.0 行为）
      loop = state.cmds[editCtx.loopIdx];
    } else { return; }
    if (!loop || loop.type !== 'loop') { return; }
    loop.rep = ((loop.rep || 2) - 1) % 8 + 2;  // 2→3→4→5→6→7→8→9→2
    renderSeq();
  }

  // 指令序列渲染（分层）
  function renderSeq() {
    var box = document.getElementById('seq-box');
    if (!box) { return; }
    if (!state.cmds.length && editCtx.loopIdx < 0) {
      box.textContent = '（空指令）';
      box.className = 'seq-box';
      renderBlockEdit();
      return;
    }
    box.className = 'seq-box active';
    clearNode(box);
    for (var i = 0; i < state.cmds.length; i++) {
      var cmd = state.cmds[i];
      var chip = makeEl('span', 'cmd-chip' + (cmd.type === 'loop' ? ' loop-chip' : ''),
        (i + 1) + '.' + cmdLabel(cmd));
      if (cmd.type === 'loop') {
        // 点击循环块 → 打开块编辑
        chip.addEventListener('click', function (ev) {
          ev.stopPropagation();
          var idx = parseInt(this.getAttribute('data-idx'), 10);
          openBlockEdit(idx);
        });
      }
      chip.setAttribute('data-idx', String(i));
      var x = makeEl('span', 'chip-x', '✕');
      x.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var idx = parseInt(this.parentNode.getAttribute('data-idx'), 10);
        removeTopCmd(idx);
      });
      chip.appendChild(x);
      box.appendChild(chip);
    }
    renderBlockEdit();
  }

  function cmdLabel(cmd) {
    if (cmd.type === 'loop') { return '🔁×' + (cmd.rep || 2) + ' {' + cmd.body.length + '}'; }
    return cmd.type === 'fwd' ? '⬆' : (cmd.type === 'left' ? '↰' : (cmd.type === 'right' ? '↱' : '?'));
  }

  // 循环块内编辑区（v1.1 两层：外层循环 body + 内层循环 body）
  function renderBlockEdit() {
    var box = document.getElementById('block-edit');
    if (!box) { return; }
    clearNode(box);
    if (editCtx.loopIdx < 0) { return; }                        // 顶层：无编辑区
    var outer = state.cmds[editCtx.loopIdx];
    if (!outer || outer.type !== 'loop') { editCtx.loopIdx = -1; return; }
    var isInner = editCtx.innerIdx >= 0;
    var loop = isInner ? outer.body[editCtx.innerIdx] : outer;
    if (!loop || loop.type !== 'loop') { editCtx.innerIdx = -1; loop = outer; isInner = false; }
    box.className = 'block-edit open' + (isInner ? ' block-edit-inner' : '');
    // 面包屑
    var crumb = makeEl('div', 'block-crumb', (isInner ? '🔁 内层循环' : '🔁 第 ' + (editCtx.loopIdx + 1) + ' 条循环块') + ' · 重复 ' + loop.rep + ' 次');
    box.appendChild(crumb);
    // 重复次数按钮（内外层分支）
    var repBtn = makeEl('button', 'btn btn-small', '重复次数 ' + loop.rep + ' 次');
    repBtn.addEventListener('click', function () { cycleLoopRep(); renderBlockEdit(); });
    box.appendChild(repBtn);
    // body chips（loop 类型渲染 🔁×N 绿色 .loopb）
    var bodyRow = makeEl('div', 'block-body');
    bodyRow.id = 'block-body';
    if (!loop.body.length) {
      bodyRow.textContent = '（块内空：加动作）';
    }
    for (var b = 0; b < loop.body.length; b++) {
      var bc = loop.body[b];
      var isLoop = bc.type === 'loop';
      var lbl = bc.type === 'fwd' ? '⬆' : (bc.type === 'left' ? '↰' : (bc.type === 'right' ? '↱'
        : (bc.type === 'loop' ? '🔁×' + (bc.rep || 2) : '?')));
      var bchip = makeEl('span', 'cmd-chip body-chip' + (isLoop ? ' loopb' : ''), (b + 1) + '.' + lbl);
      if (isLoop) {
        // 点击内层 loop → 打开内层编辑区
        (function (bidx) {
          bchip.addEventListener('click', function (ev) {
            ev.stopPropagation();
            if (state.execLock) { return; }
            editCtx.innerIdx = bidx;
            renderSeq();
          });
        })(b);
      }
      var bx = makeEl('span', 'chip-x', '✕');
      (function (bidx) {
        bx.addEventListener('click', function (ev) {
          ev.stopPropagation();
          removeBodyCmd(bidx);
        });
      })(b);
      bchip.appendChild(bx);
      bodyRow.appendChild(bchip);
    }
    box.appendChild(bodyRow);
    // 块内加动作按钮（内层编辑区不含 🔁）
    var addRow = makeEl('div', 'block-add-row');
    var addBtns = [CMD_FWD, CMD_LEFT, CMD_RIGHT];
    if (!isInner) { addBtns.push(CMD_LOOP); }   // 外层编辑区可加 🔁（loopDepth 守卫兜底）
    addBtns.forEach(function (cmd) {
      var b = makeEl('button', 'cmd-add small', cmd.label);
      b.addEventListener('click', function () { addBodyCmd(cmd.id); });
      addRow.appendChild(b);
    });
    box.appendChild(addRow);
    // 完成（内层 → 回外层；外层 → 回顶层）
    var doneBtn = makeEl('button', 'btn btn-primary btn-small', isInner ? '✓ 返回外层' : '✓ 完成');
    doneBtn.addEventListener('click', function () {
      if (isInner) { editCtx.innerIdx = -1; }
      else { editCtx.loopIdx = -1; }
      renderSeq();
    });
    box.appendChild(doneBtn);
  }

  function openBlockEdit(idx) {
    var cmd = state.cmds[idx];
    if (!cmd || cmd.type !== 'loop') { return; }
    editCtx.loopIdx = idx;
    editCtx.innerIdx = -1;   // v1.1：打开新外层编辑时重置内层下标
    renderSeq();
  }

  /* ---------- 执行器（simulate 共用） ---------- */
  // v1.1：递归扁平化指令树为动作序列（loop → 展开 rep 次 body；叶 → 指令），嵌套天然支持
  function flattenCmds(list, out) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.type === 'loop') {
        for (var r = 0; r < (c.rep || 2); r++) { flattenCmds(c.body, out); }
      } else { out.push(c.type); }
    }
    return out;
  }

  // v1.1：编写量递归（循环块 1 条 + body 内指令计 1，不乘 rep）
  function countCmds(list) {
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.type === 'loop') { n += 1 + countCmds(c.body); }
      else { n += 1; }
    }
    return n;
  }

  function execRun() {
    if (state.execLock || state.execDone || state.won) { return; }
    // 展开指令树为动作序列（v1.1 递归 flatten，支持嵌套循环）
    var steps = flattenCmds(state.cmds, []);
    if (!steps.length) { return; }
    state.execLock = true;
    state.firstFail = null;
    setCmdLocked(true);
    state.curPos = { x: state.start.x, y: state.start.y };
    state.curFace = state.startFace;
    // 编写量：循环块1 + 内部指令计1（不乘N；v1.1 递归统计嵌套层）
    state.totalCmds = countCmds(state.cmds);
    var fb = document.getElementById('game-feedback');
    if (fb) { fb.textContent = '机器人执行中…'; fb.className = 'game-feedback'; }
    renderSeq();
    // 执行（动画逐步，复用 simulate 语义——直接操作 pos/face）
    state.execSteps = steps;
    state.execProg = 0;
    execStep();
  }

  function execStep() {
    if (state.execProg >= state.execSteps.length) {
      state.execDone = true;
      checkWin();
      return;
    }
    var s = state.execSteps[state.execProg];
    state.execProg += 1;
    if (s === 'left') {
      state.curFace = (state.curFace + 3) % 4;
    } else if (s === 'right') {
      state.curFace = (state.curFace + 1) % 4;
    } else { // fwd
      var nx = state.curPos.x + DIRS[state.curFace][0];
      var ny = state.curPos.y + DIRS[state.curFace][1];
      var nKey = idxOf(nx, ny, state.gridW);
      if (nx < 0 || nx >= state.gridW || ny < 0 || ny >= state.gridH || state.walls[nKey]) {
        // 撞墙失败定位（循环块级）
        state.firstFail = { step: state.execProg };
        state.execDone = true;
        checkWin();
        return;
      }
      state.curPos = { x: nx, y: ny };
    }
    renderBoardOnly();
    // ✓ 完成判定提前检查（走到 ⭐ 即成功——继续执行剩余无意义，但为教学只判位置）
    setTimeout(execStep, 260);
  }

  /* ---------- 判定 ---------- */
  function checkWin() {
    var won = state.curPos && state.curPos.x === state.goal.x && state.curPos.y === state.goal.y;
    state.won = won;
    state.execLock = false;
    var fb = document.getElementById('game-feedback');
    var nextBtn = document.getElementById('next-btn');
    setCmdLocked(false);
    if (won) {
      if (fb) { fb.textContent = '✓ 完成！机器人到目标啦（3★ 候选）'; fb.className = 'game-feedback ok'; }
      if (nextBtn) { nextBtn.style.display = 'inline-block'; }
      finishLevel();
    } else if (state.firstFail) {
      // 撞墙定位：递归反查（v1.1 嵌套感知）
      var loc = locateFailStep(state.firstFail.step - 1, state.cmds, '');
      if (fb) { fb.textContent = '⛔ ' + loc + '让机器人撞墙啦（还差 ' + distRemain() + ' 格）'; fb.className = 'game-feedback miss'; }
      markErrChip();
    } else {
      var d = Math.abs(state.goal.x - state.curPos.x) + Math.abs(state.goal.y - state.curPos.y);
      if (fb) { fb.textContent = '✗ 机器人走到了 (' + state.curPos.x + ',' + state.curPos.y + ')，目标 (' + state.goal.x + ',' + state.goal.y + ')（还差 ' + d + ' 格）'; fb.className = 'game-feedback miss'; }
    }
    renderBoardOnly();
  }

  // 定位失败步骤所属的顶层指令/循环块（v1.1 递归：嵌套「第 a 次外层循环里的第 b 次内层循环里的第 c 条指令」）
  // flattenCount(list) = body 完全展开步数（递归：loop → rep × flattenCount(body)；叶 → 1）
  function flattenCount(list) {
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.type === 'loop') { n += (c.rep || 2) * flattenCount(c.body); }
      else { n += 1; }
    }
    return n;
  }

  // v1.1：dirName helper（v1.0 硬编码「⬆ 前进」bug 一并修复——撞墙定位能区分左右转）
  function dirName(t) {
    return t === 'fwd' ? '⬆ 前进' : (t === 'left' ? '↰ 左转' : (t === 'right' ? '↱ 右转' : '指令'));
  }

  // 递归定位：返回「第 a 次外层循环里的第 b 次内层循环里的第 c 条指令」路径描述
  //（prefix 无尾空格——「次循环里的」直接拼接，保持与 v1.0「第 K 次循环里的第 M 条指令」格式一致）
  function locateFailStep(stepIdx, list, prefix) {
    var offset = 0;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.type === 'loop') {
        var total = (c.rep || 2) * flattenCount(c.body);
        if (stepIdx >= offset && stepIdx < offset + total) {
          var rel = stepIdx - offset;
          var iter = Math.floor(rel / flattenCount(c.body)) + 1;
          return locateFailStep(rel % flattenCount(c.body), c.body, prefix + '第 ' + iter + ' 次循环里的');
        }
        offset += total;
      } else {
        if (stepIdx === offset) { return prefix + '第 ' + (i + 1) + ' 条指令（' + dirName(c.type) + '）'; }
        offset += 1;
      }
    }
    return prefix + '某条指令';
  }

  function distRemain() {
    return Math.abs(state.goal.x - state.curPos.x) + Math.abs(state.goal.y - state.curPos.y);
  }

  function markErrChip() {
    // err class 标记：简单标最后一个执行的循环块/指令（MVP 简化：全部取消 err，在反馈文字定位）
    var box = document.getElementById('seq-box');
    if (!box) { return; }
    var chips = box.querySelectorAll('.cmd-chip');
    for (var i = 0; i < chips.length; i++) { chips[i].classList.remove('err'); }
  }

  function renderBoardOnly() {
    var board = document.getElementById('board');
    if (board) { board.innerHTML = boardHtml(); }
  }

  /* ---------- 星级 / 结算 ---------- */
  function finishLevel() {
    var total = state.totalCmds;
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
    state.cmds = []; state.totalCmds = 0; state.firstFail = null;
    editCtx.loopIdx = -1; editCtx.innerIdx = -1;   // v1.1：下一题重置两层编辑上下文
    var lv = genLevel(state.level);
    state.gridW = state.gridH = LEVELS_CFG[state.level].size;
    state.walls = lv.walls;
    state.trace = lv.trace;
    state.start = lv.start; state.startFace = lv.startFace;
    state.goal = lv.goal;
    state.optimal = lv.optimal;
    state.curPos = { x: lv.start.x, y: lv.start.y };
    state.curFace = lv.startFace;
    renderGame();
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

  /* 执行锁定 */
  function setCmdLocked(locked) {
    var bars = document.querySelectorAll('.cmd-add, .seq-clear, .cmd-chip');
    for (var i = 0; i < bars.length; i++) {
      if (locked) { bars[i].setAttribute('disabled', 'disabled'); }
      else { bars[i].removeAttribute('disabled'); }
    }
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
  M.simulate = simulate;
  M.flattenCmds = flattenCmds;
  M.flattenCount = flattenCount;
  M.countCmds = countCmds;
  M.locateFailStep = locateFailStep;
  M.dirName = dirName;
  M.loopDepth = loopDepth;
  window.M = M;
})();