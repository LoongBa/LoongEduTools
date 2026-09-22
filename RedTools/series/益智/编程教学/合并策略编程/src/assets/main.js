/* ============================================================
   合并策略编程 — main.js（益智·编程教学，D4 转型）
   ------------------------------------------------------------
   玩法：给定确定性初始盘面（无随机新块）+ 目标数字，孩子编排
   方向指令序列（⬅➡⬆⬇，可参数化 ×N）→ ▶ 执行 → 程序判定
   最终盘面是否合出 ≥ 目标数字的块。
   - 指令：左移/右移/上移/下移（2048 合并语义，每块每轮只合一次）
   - 判定：max(grid) >= target = 有标准答案（合规安全区）
   - 星级：指令条数 vs BFS 最短指令数（确定性可算，≤1.5× = 3★）
   - 三档：简单 3×3 目标 8 / 普通 4×4 目标 16 / 挑战 4×4 目标 32
   - 生成：随机盘面 + sum≥target 硬约束 + BFS 必达验证 + seed 兜底
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
  LX_SHARED.storage.configure({ toolName: 'hebing' });  // 键前缀 redtools.hebing.v1
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

  /* ---------- 难度档（oracle v0.2 修正：initBlocks + sum 硬约束） ---------- */
  var LEVELS_CFG = {
    easy:   { key: 'easy',   label: '简单', size: 3, target: 8,  maxSteps: 5, initBlocks: 4 },
    normal: { key: 'normal', label: '普通', size: 4, target: 16, maxSteps: 7, initBlocks: 6 },
    hard:   { key: 'hard',   label: '挑战', size: 4, target: 32, maxSteps: 9, initBlocks: 9 }
  };
  var LEVEL_ORDER = ['easy', 'normal', 'hard'];

  /* 指令常量 */
  var CMD_LEFT = { id: 'left', label: '⬅ 左移' };
  var CMD_RIGHT = { id: 'right', label: '➡ 右移' };
  var CMD_UP = { id: 'up', label: '⬆ 上移' };
  var CMD_DOWN = { id: 'down', label: '⬇ 下移' };

  /* 2048 数字块配色（复用经典米黄风格） */
  var TILE_CLS = {
    2: 't2', 4: 't4', 8: 't8', 16: 't16', 32: 't32', 64: 't64',
    128: 't128', 256: 't256', 512: 't512', 1024: 't1024',
    2048: 't2048', 4096: 't4096', 8192: 't8192'
  };

  /* ---------- 状态 ---------- */
  var state = {
    level: 'easy',
    grid: [],          // 当前盘面（执行快照）
    initGrid: [],      // 初始盘面（重置用）
    cmds: [],          // 指令序列 [{id, val}]
    cmdCounts: [0],    // 每题指令条数记录（星级）——本工具每题 1 轮执行，用 totalCmds 计数
    optimal: 0,        // BFS 最短指令数（星级基准）
    target: 8,
    execLock: false,
    execDone: false,
    won: false,
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
  function maxOf(grid) {
    var mx = 0;
    for (var i = 0; i < grid.length; i++) {
      if (grid[i] > mx) { mx = grid[i]; }
    }
    return mx;
  }
  function gridKey(grid) {
    // 状态 key：值 → 单字符编码（0/1/2/3/4/5/6/7/8/9/A/B = 0,2,4,8,...,2048,4096,8192）
    var MAP = { 0: '0', 2: '1', 4: '2', 8: '3', 16: '4', 32: '5', 64: '6', 128: '7', 256: '8', 512: '9', 1024: 'A', 2048: 'B', 4096: 'C', 8192: 'D' };
    var s = '';
    for (var i = 0; i < grid.length; i++) {
      s += MAP[grid[i]] !== undefined ? MAP[grid[i]] : 'X';
    }
    return s;
  }

  /* ---------- 2048 合并逻辑（纯函数，oracle v0.2 改造） ---------- */
  // 一维滑移合并（每块每轮只合一次）；纯函数：不修改入参、无 score 副作用
  function slideLine(line) {
    var t = [];
    for (var i = 0; i < line.length; i++) {
      if (line[i]) { t.push(line[i]); }
    }
    var out = [];
    var merged = [];
    for (var j = 0; j < t.length; j++) {
      if (j + 1 < t.length && t[j] === t[j + 1]) {
        out.push(t[j] * 2);
        merged.push(1);
        j++;
      } else {
        out.push(t[j]);
        merged.push(0);
      }
    }
    while (out.length < line.length) {
      out.push(0);
      merged.push(0);
    }
    return { out: out, merged: merged };
  }
  // 行/列索引（dir 0左 1上 2右 3下）
  function idxAt(size, k, q, dir) {
    var row = (dir === 0 || dir === 2) ? k : q;
    var col = (dir === 0 || dir === 2) ? q : k;
    return row * size + col;
  }
  // ★ 纯函数 applyMove：接受 grid 入参，返回 {newGrid, changed}，不修改原 grid
  function applyMovePure(grid, size, dir) {
    var newGrid = grid.slice();
    var changed = false;
    var rev = (dir === 2 || dir === 3);
    for (var k = 0; k < size; k++) {
      var line = [];
      for (var q = 0; q < size; q++) {
        line.push(grid[idxAt(size, k, q, dir)]);
      }
      if (rev) { line.reverse(); }
      var res = slideLine(line);
      if (rev) { res.out.reverse(); }
      for (q = 0; q < size; q++) {
        var idx = idxAt(size, k, q, dir);
        if (newGrid[idx] !== res.out[q]) { changed = true; }
        newGrid[idx] = res.out[q];
      }
    }
    return { newGrid: newGrid, changed: changed };
  }

  /* ---------- BFS 最短指令数（确定性状态空间，oracle v0.2：入口防御） ---------- */
  function bfsShortest(startGrid, size, target, maxDepth) {
    if (maxOf(startGrid) >= target) { return 0; }   // oracle 建议：BFS 自守
    var queue = [{ grid: startGrid, depth: 0 }];
    var visited = {};
    visited[gridKey(startGrid)] = true;
    var head = 0;
    while (head < queue.length) {
      var cur = queue[head];
      head += 1;
      for (var dir = 0; dir < 4; dir++) {
        var res = applyMovePure(cur.grid, size, dir);
        if (!res.changed) { continue; }             // 无变化剪枝（BFS 口径：不算步数）
        if (maxOf(res.newGrid) >= target) { return cur.depth + 1; }
        if (cur.depth + 1 < maxDepth) {
          var key = gridKey(res.newGrid);
          if (!visited[key]) {
            visited[key] = true;
            queue.push({ grid: res.newGrid, depth: cur.depth + 1 });
          }
        }
      }
    }
    return -1;
  }

  /* ---------- seed 兜底盘面（oracle v0.2：教学工具永不卡死） ---------- */
  function seedLevel(diff) {
    var cfg = LEVELS_CFG[diff];
    var grid = new Array(cfg.size * cfg.size).fill(0);
    if (diff === 'easy') {
      // [2,2,2,2] 排一行 → 左移×2 = 8
      grid[0] = 2; grid[1] = 2; grid[2] = 2; grid[3] = 2;
      var opt = bfsShortest(grid, 3, 8, 5);
      return { grid: grid, target: 8, optimal: (opt >= 1 ? opt : 2) };
    }
    if (diff === 'normal') {
      // 两行：[2,2,2,2] 上 + [4,4,0,0] 下 → 构造 16
      grid[0] = 2; grid[1] = 2; grid[2] = 2; grid[3] = 2;
      grid[4] = 4; grid[5] = 4;
      var opt2 = bfsShortest(grid, 4, 16, 7);
      return { grid: grid, target: 16, optimal: (opt2 >= 1 ? opt2 : 4) };
    }
    // hard：三行 8×4 + 2×2 → 构造 32
    for (var i = 0; i < 8; i++) { grid[i] = 4; }
    grid[8] = 2; grid[9] = 2;
    var opt3 = bfsShortest(grid, 4, 32, 9);
    return { grid: grid, target: 32, optimal: (opt3 >= 1 ? opt3 : 6) };
  }

  /* ---------- 关卡生成器（oracle v0.2：sum 硬约束 + BFS 必达 + seed 兜底） ---------- */
  function genLevel(diff) {
    var cfg = LEVELS_CFG[diff];
    var guard = 0;
    while (guard < 200) {
      guard += 1;
      var grid = new Array(cfg.size * cfg.size).fill(0);
      // 随机放置 initBlocks 个块（值 2/4，位置不重叠）
      var placed = 0;
      var tries = 0;
      while (placed < cfg.initBlocks && tries < 100) {
        tries += 1;
        var idx = Math.floor(Math.random() * (cfg.size * cfg.size));
        if (grid[idx] !== 0) { continue; }
        grid[idx] = Math.random() < 0.6 ? 2 : 4;
        placed += 1;
      }
      if (placed < cfg.initBlocks) { continue; }
      // ★ sum ≥ target 硬约束（oracle 致命项修复：原子量必要条件）
      var sum = 0;
      for (var i = 0; i < grid.length; i++) { sum += grid[i]; }
      if (sum < cfg.target) { continue; }
      // BFS 必达验证 + 最优解
      var opt = bfsShortest(grid, cfg.size, cfg.target, cfg.maxSteps);
      if (opt >= 1) {
        return { grid: grid, target: cfg.target, optimal: opt };
      }
    }
    return seedLevel(diff);   // 兜底（oracle 阻断项）
  }

  /* ---------- 渲染：顶栏 ---------- */
  function renderHeader() {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '合并策略编程';
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
    wrap.appendChild(makeEl('h1', 'home-title', '🔢 合并策略编程'));
    wrap.appendChild(makeEl('p', 'home-sub', '用方向指令，让数字合出目标！'));

    LEVEL_ORDER.forEach(function (k) {
      var lv = LEVELS_CFG[k];
      var card = makeEl('button', 'level-card');
      var best = store.best[k];
      var bestTxt = best ? '最佳 ' + best.stars + '★' : '未挑战';
      card.appendChild(makeEl('div', 'level-name', lv.label + ' · 目标合出 ' + lv.target + ' · ' + lv.size + '×' + lv.size));
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
    state.totalCmds = 0;
    var res = genLevel(level);
    state.initGrid = res.grid.slice();
    state.grid = res.grid.slice();
    state.target = res.target;
    state.optimal = res.optimal;
    renderGame();
    state.startMs = Date.now();
    startTimer();
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
    var lvEl = makeEl('div', 'game-prog', LEVELS_CFG[state.level].label + ' · 目标合出 ' + state.target);
    lvEl.id = 'game-prog';
    top.appendChild(lvEl);
    var timerEl = makeEl('div', 'game-timer', '⏱ 00.0');
    timerEl.id = 'game-timer';
    top.appendChild(timerEl);
    var hint = makeEl('div', 'game-hint', '规则：相同数字相撞合成双倍');
    top.appendChild(hint);
    wrap.appendChild(top);

    // 盘面
    var board = makeEl('div', 'board');
    board.id = 'board';
    wrap.appendChild(board);

    // 指令区
    var cmdBar = makeEl('div', 'cmd-bar');
    cmdBar.id = 'cmd-bar';
    [CMD_LEFT, CMD_UP, CMD_DOWN, CMD_RIGHT].forEach(function (cmd) {
      var btn = makeEl('button', 'cmd-add', cmd.label);
      btn.addEventListener('click', function () { addCmd(cmd.id); });
      cmdBar.appendChild(btn);
    });
    wrap.appendChild(cmdBar);

    // 指令序列
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
      state.cmds = []; state.totalCmds = 0;
      state.grid = state.initGrid.slice();
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
    var fb = makeEl('div', 'game-feedback', '编方向指令，把数字合到 ' + state.target + '！');
    fb.id = 'game-feedback';
    wrap.appendChild(fb);

    viewEl.appendChild(wrap);
    renderBoardOnly();
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
      var lbl = cmd.id === 'left' ? '⬅' : (cmd.id === 'right' ? '➡' : (cmd.id === 'up' ? '⬆' : '⬇'));
      var valTxt = cmd.val > 1 ? ('×' + cmd.val) : '';
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

  // 参数递增：1→2→3→4→1（循环指令启蒙，复用走迷宫 chip 语义）
  function cycleParam(i) {
    if (state.execLock) { return; }
    var cmd = state.cmds[i];
    if (!cmd) { return; }
    var next = ((cmd.val || 1) % 4) + 1;
    cmd.val = next;
    renderSeq();
  }

  function renderBoardOnly() {
    var board = document.getElementById('board');
    if (!board) { return; }
    var size = LEVELS_CFG[state.level].size;
    var parts = ['<div class="grid" style="width:' + (100 / size) + '%">'];
    for (var i = 0; i < state.grid.length; i++) {
      var v = state.grid[i];
      var cls = 'cell' + (v ? ' ' + TILE_CLS[v] : '') + (v >= 100 ? ' s' + Math.min(4, String(v).length - 1) : '');
      parts.push('<div class="' + cls + '">' + (v || '') + '</div>');
    }
    parts.push('</div>');
    board.innerHTML = parts.join('');
  }

  function addCmd(id) {
    if (state.execLock) { return; }
    if (state.execDone || state.won) { return; }
    state.cmds.push({ id: id, val: 1 });
    renderSeq();
  }
  function removeCmd(i) {
    if (state.execLock) { return; }
    state.cmds.splice(i, 1);
    renderSeq();
  }

  /* ---------- 执行器（确定性，无随机新块） ---------- */
  function execRun() {
    if (state.execLock || state.execDone || state.won) { return; }
    if (!state.cmds.length) { return; }
    state.execLock = true;
    setCmdLocked(true);
    var fb = document.getElementById('game-feedback');
    if (fb) { fb.textContent = '执行中…'; fb.className = 'game-feedback'; }
    renderSeq();
    // 展开指令（参数化 ×N → 逐条方向）
    state.execQueue = [];
    state.cmds.forEach(function (c) {
      for (var i = 0; i < c.val; i++) { state.execQueue.push(c.id); }
    });
    state.execProg = 0;
    state.totalCmds += state.execQueue.length;
    execStep();
  }

  function execStep() {
    if (state.execProg >= state.execQueue.length) {
      state.execDone = true;
      checkWin();
      return;
    }
    var dir = state.execQueue[state.execProg];
    var dirMap = { left: 0, up: 1, right: 2, down: 3 };
    state.execProg += 1;
    var res = applyMovePure(state.grid, LEVELS_CFG[state.level].size, dirMap[dir]);
    if (!res.changed) {
      // 无变化步：计 1 条指令 + 盘面闪烁 + 友好提示
      flashBoard();
      var fb = document.getElementById('game-feedback');
      if (fb) { fb.textContent = dirLabel(dir) + ' 这边没有块可以移动哦'; fb.className = 'game-feedback miss'; }
      renderSeqHighlight();
      setTimeout(execStep, 300);
      return;
    }
    state.grid = res.newGrid;
    renderBoardOnly();
    renderSeqHighlight();
    if (maxOf(state.grid) >= state.target) {
      // 提前达标也继续走完剩余指令？——提前达标即判胜（后续指令可能破坏，但目标已达成即成功）
      state.execDone = true;
      checkWin();
      return;
    }
    setTimeout(execStep, 300);
  }

  function dirLabel(id) {
    return id === 'left' ? '⬅' : (id === 'right' ? '➡' : (id === 'up' ? '⬆' : '⬇'));
  }

  function flashBoard() {
    var board = document.getElementById('board');
    if (board) { board.classList.add('edge-flash'); setTimeout(function () { board.classList.remove('edge-flash'); }, 300); }
  }

  function renderSeqHighlight() {
    // 执行高亮当前展开步对应 chip（简化：亮当前执行中的指令 chip）
    var box = document.getElementById('seq-box');
    if (!box) { return; }
    var chips = box.querySelectorAll('.cmd-chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.remove('exec');
    }
    // 低龄简化：执行中整体高亮第 1 条指令即可（展开步映射复杂化，MVP 从简）
    if (state.execLock && chips.length) {
      chips[0].classList.add('exec');
    }
  }

  /* ---------- 判定 ---------- */
  function checkWin() {
    var mx = maxOf(state.grid);
    var won = mx >= state.target;
    state.won = won;
    state.execLock = false;
    var fb = document.getElementById('game-feedback');
    var nextBtn = document.getElementById('next-btn');
    setCmdLocked(false);
    if (won) {
      if (fb) {
        if (mx > state.target) {
          fb.textContent = '✓ 完成！合出了 ' + mx + '，超过目标 ' + state.target + ' 🎉';
        } else {
          fb.textContent = '✓ 完成！合出了 ' + state.target + '！';
        }
        fb.className = 'game-feedback ok';
      }
      if (nextBtn) { nextBtn.style.display = 'inline-block'; }
      finishLevel();
    } else {
      if (fb) { fb.textContent = '✗ 最大只有 ' + mx + '，还没合出 ' + state.target + '（还差一点！调整指令再试）'; fb.className = 'game-feedback miss'; }
    }
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
    state.cmds = []; state.totalCmds = 0;
    var res = genLevel(state.level);
    state.initGrid = res.grid.slice();
    state.grid = res.grid.slice();
    state.target = res.target;
    state.optimal = res.optimal;
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

  /* 执行锁定：指令按钮/序列灰显不可点 */
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
  M.applyMovePure = applyMovePure;
  M.bfsShortest = bfsShortest;
  window.M = M;
})();