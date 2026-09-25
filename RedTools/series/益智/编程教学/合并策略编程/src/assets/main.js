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
  var customLevels = loadCustomLevels();

  /* ---------- 自定义关卡库（customLevels 数据层，v1.1） ---------- */
  function loadCustomLevels() {
    var arr = LX_SHARED.storage.get('customLevels');
    return (arr && arr.length) ? arr : [];
  }
  function saveCustomLevels(arr) {
    LX_SHARED.storage.set('customLevels', arr);
  }
  function addCustomLevel(cells, target, optimal, name) {
    if (customLevels.length >= 20) { window.alert('自建关卡最多 20 个'); return null; }
    var id = Date.now() + '-' + Math.random().toString(36).slice(2, 5);
    customLevels.push({
      id: id, name: name, cells: cells, size: 4, target: target,
      optimal: optimal, createdAt: Date.now(), solved: false
    });
    saveCustomLevels(customLevels);
    return id;
  }
  function removeCustomLevel(id) {
    customLevels = customLevels.filter(function (c) { return c.id !== id; });
    saveCustomLevels(customLevels);
  }
  function markCustomSolved(idx) {
    customLevels[idx].solved = true;
    saveCustomLevels(customLevels);
  }

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
    size: 4,           // 盘面边长（startGame/startCustom 统一设置；编辑器固定 4×4）
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
    finished: false,
    // —— 编辑器状态（v1.1 关卡编辑器）——
    customIdx: -1,       // 当前 custom 关卡索引
    editCells: [],       // 编辑网格（16 格，值 0|2|4，M.state.editCells 供测试）
    editTool: -1,        // -1 循环点格（空→2→4→空）｜ 2/4 直接写入 ｜ 0 橡皮
    editTarget: 8,
    editIdx: -1,         // 编辑中的 customLevels 索引（-1 = 新建）
    editName: '',
    editChecked: false,
    editPainting: false
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
  function bfsShortest(startGrid, size, target, maxDepth, nodeCap) {
    if (maxOf(startGrid) >= target) { return 0; }   // oracle 建议：BFS 自守
    var queue = [{ grid: startGrid, depth: 0 }];
    var visited = {};
    visited[gridKey(startGrid)] = true;
    var head = 0;
    while (head < queue.length) {
      if (nodeCap && queue.length > nodeCap) { return -2; }   // 超限兜底（custom 校验用；-2 = 暂不确定三态）
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

    // 🛠 自建关卡入口（v1.1：创作闭环，摆数字块出题）
    var customCard = makeEl('button', 'level-card custom-card');
    customCard.appendChild(makeEl('div', 'level-name', '🛠 自建关卡 (' + customLevels.length + ')'));
    customCard.appendChild(makeEl('div', 'level-best', '摆数字块，出题！'));
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
        var lvTxt = h.level === 'custom' ? ('自建关卡·' + h.customName) : (LEVELS_CFG[h.level] ? LEVELS_CFG[h.level].label : h.level);
        wrap.appendChild(makeEl('div', 'parent-row small', h.date + ' · ' + lvTxt + ' · ' + h.stars + '★'));
      });
    }
    var back = makeEl('button', 'btn', '‹ 返回');
    back.addEventListener('click', function () { viewHome(); });
    wrap.appendChild(back);
    var clearBtn = makeEl('button', 'btn btn-danger', '清除所有数据');
    clearBtn.addEventListener('click', function () {
      if (window.confirm('确定清除所有练习数据？此操作不可恢复。')) {
        LX_SHARED.storage.remove('v1');
        LX_SHARED.storage.remove('customLevels');   // v1.1：自建关卡随清除一并删除
        customLevels = [];
        store = loadStore();
        saveStore();
        viewHome();
      }
    });
    wrap.appendChild(clearBtn);
    viewEl.appendChild(wrap);
    renderFooter('');
  }

  /* ---------- 视图：自建关卡库 + 编辑器（v1.1） ---------- */
  function viewCustomList() {
    stopTimer();
    state.finished = false;
    renderHeader();
    clearNode(viewEl);
    var wrap = makeEl('div', 'parent-wrap');
    wrap.appendChild(makeEl('h2', 'parent-title', '🛠 自建关卡'));
    if (!customLevels.length) {
      wrap.appendChild(makeEl('p', 'parent-row', '还没有自建关卡，点底部按钮新建一个！'));
    }
    customLevels.forEach(function (cl, i) {
      var item = makeEl('div', 'cl-item');
      var head = makeEl('div', 'cl-head');
      head.appendChild(makeEl('span', 'cl-name', cl.name));
      head.appendChild(makeEl('span', 'cl-badge ' + (cl.solved ? 'solved' : 'unsolved'), cl.solved ? '已解' : '未解'));
      item.appendChild(head);
      item.appendChild(makeEl('div', 'cl-info', '目标合出 ' + cl.target + ' · 最优 ' + cl.optimal + ' 步'));
      var row = makeEl('div', 'cl-actions');
      var editBtn = makeEl('button', 'btn btn-sm', '✏ 编辑');
      editBtn.addEventListener('click', function () { viewEditor(i); });
      row.appendChild(editBtn);
      var playBtn = makeEl('button', 'btn btn-sm btn-primary', '▶ 挑战');
      playBtn.addEventListener('click', function () { startCustom(i); });
      row.appendChild(playBtn);
      var delBtn = makeEl('button', 'btn btn-sm btn-danger', '🗑 删除');
      delBtn.addEventListener('click', function () {
        if (window.confirm('删除关卡「' + cl.name + '」？')) {
          removeCustomLevel(cl.id);
          viewCustomList();
        }
      });
      row.appendChild(delBtn);
      item.appendChild(row);
      wrap.appendChild(item);
    });
    var newBtn = makeEl('button', 'btn btn-primary', '+ 新建关卡');
    newBtn.addEventListener('click', function () { viewEditor(-1); });
    wrap.appendChild(newBtn);
    var back = makeEl('button', 'btn', '‹ 返回');
    back.addEventListener('click', function () { viewHome(); });
    wrap.appendChild(back);
    viewEl.appendChild(wrap);
    renderFooter('');
  }

  function viewEditor(idx) {
    stopTimer();
    state.finished = false;
    state.editIdx = (idx === undefined ? -1 : idx);
    state.editCells = new Array(16).fill(0);
    state.editTarget = 8;
    state.editTool = -1;          // 默认循环点格：空→2→4→空
    state.editChecked = false;
    state.editName = '';
    if (state.editIdx >= 0 && customLevels[state.editIdx]) {
      var cl = customLevels[state.editIdx];
      for (var c = 0; c < cl.cells.length; c++) { state.editCells[cl.cells[c].idx] = cl.cells[c].val; }
      state.editTarget = cl.target;
      state.editName = cl.name;
    }
    renderHeader();
    clearNode(viewEl);
    var wrap = makeEl('div', 'game-wrap');

    var top = makeEl('div', 'game-top');
    var back = makeEl('button', 'game-back', '‹ 返回');
    back.addEventListener('click', function () { viewCustomList(); });
    top.appendChild(back);
    top.appendChild(makeEl('div', 'game-prog', '🛠 盘面编辑器 · 4×4'));
    top.appendChild(makeEl('div', 'game-timer', ''));
    wrap.appendChild(top);

    var nameRow = makeEl('div', 'edit-row');
    nameRow.appendChild(makeEl('span', 'edit-label', '名称'));
    var nameInput = makeEl('input', 'edit-input');
    nameInput.type = 'text';
    nameInput.maxLength = 12;
    nameInput.placeholder = '我的关卡 ' + (customLevels.length + 1);
    nameInput.value = state.editName;
    nameInput.addEventListener('input', function () {
      state.editName = nameInput.value;   // 改名不影响可解性——不重置 editChecked（目标/盘面变化才需重检）
    });
    nameRow.appendChild(nameInput);
    wrap.appendChild(nameRow);

    var targetRow = makeEl('div', 'edit-row');
    targetRow.id = 'edit-targets';
    targetRow.appendChild(makeEl('span', 'edit-label', '目标'));
    [8, 16, 32].forEach(function (tv) {
      var tb = makeEl('button', 'btn btn-sm' + (state.editTarget === tv ? ' btn-primary' : ''), '' + tv);
      tb.setAttribute('data-target', '' + tv);
      tb.addEventListener('click', function () {
        state.editTarget = tv;
        state.editChecked = false;
        renderEditorTargets();
        var fb = document.getElementById('edit-feedback');
        if (fb) { fb.textContent = ''; }
      });
      targetRow.appendChild(tb);
    });
    wrap.appendChild(targetRow);

    var board = makeEl('div', 'board edit-board');
    board.id = 'edit-board';
    wrap.appendChild(board);

    var toolBar = makeEl('div', 'tool-bar');
    toolBar.id = 'edit-tools';
    var tools = [{ v: 2, label: '🔢 2' }, { v: 4, label: '🔢 4' }, { v: 0, label: '🧹 橡皮' }];
    tools.forEach(function (tv) {
      var tb = makeEl('button', 'btn btn-sm' + (state.editTool === tv.v ? ' btn-primary' : ''), tv.label);
      tb.setAttribute('data-tool', '' + tv.v);
      tb.addEventListener('click', function () {
        state.editTool = tv.v;
        renderEditorTools();
      });
      toolBar.appendChild(tb);
    });
    wrap.appendChild(toolBar);

    var ctrl = makeEl('div', 'ctrl-row');
    var checkBtn = makeEl('button', 'btn btn-primary', '✓ 检查可解');
    checkBtn.addEventListener('click', function () { doCheckEdit(); });
    ctrl.appendChild(checkBtn);
    var saveBtn = makeEl('button', 'btn', '💾 保存');
    saveBtn.addEventListener('click', function () { doSaveEdit(); });
    ctrl.appendChild(saveBtn);
    var clearBtn = makeEl('button', 'btn', '↺ 清空');
    clearBtn.addEventListener('click', function () {
      state.editCells = new Array(16).fill(0);
      state.editChecked = false;
      var fb = document.getElementById('edit-feedback');
      if (fb) { fb.textContent = ''; fb.className = 'edit-feedback'; }
      renderBoardEdit();
    });
    ctrl.appendChild(clearBtn);
    wrap.appendChild(ctrl);

    var fb = makeEl('div', 'edit-feedback', '点格子摆数字块（点一下：空→2→4→空）');
    fb.id = 'edit-feedback';
    wrap.appendChild(fb);

    viewEl.appendChild(wrap);
    renderBoardEdit();
    renderFooter('');
  }

  /* 编辑网格渲染（4×4，复用 TILE_CLS 配色：2=米黄、4=深色） */
  function renderBoardEdit() {
    var board = document.getElementById('edit-board');
    if (!board) { return; }
    var parts = ['<div class="grid" style="width:' + (100 / 4) + '%">'];
    for (var i = 0; i < 16; i++) {
      var v = state.editCells[i];
      var cls = 'cell' + (v ? ' ' + TILE_CLS[v] : '');
      parts.push('<div class="' + cls + '" data-idx="' + i + '">' + (v || '') + '</div>');
    }
    parts.push('</div>');
    board.innerHTML = parts.join('');
    var cells = board.querySelectorAll('.cell');
    for (var j = 0; j < cells.length; j++) {
      (function (cell) {
        var idx = parseInt(cell.getAttribute('data-idx'), 10);
        cell.addEventListener('pointerdown', function (ev) {
          ev.preventDefault();
          state.editPainting = true;
          paintEditCell(idx);
          if (cell.setPointerCapture) { cell.setPointerCapture(ev.pointerId); }
        });
        cell.addEventListener('pointermove', function (ev) {
          if (!state.editPainting) { return; }
          var el = document.elementFromPoint(ev.clientX, ev.clientY);
          if (el && el.getAttribute && el.getAttribute('data-idx') !== null) {
            paintEditCell(parseInt(el.getAttribute('data-idx'), 10));
          }
        });
        cell.addEventListener('pointerup', function () { state.editPainting = false; });
        cell.addEventListener('pointercancel', function () { state.editPainting = false; });
      })(cells[j]);
    }
  }

  /* 涂格：循环 0→2→4→0（编辑工具 -1）或直接写入工具值（2/4/0 橡皮） */
  function paintEditCell(idx) {
    var v;
    if (state.editTool === -1) {
      v = state.editCells[idx] === 0 ? 2 : (state.editCells[idx] === 2 ? 4 : 0);
    } else {
      v = state.editTool;
    }
    if (state.editCells[idx] !== v) {
      state.editCells[idx] = v;
      state.editChecked = false;
      var fb = document.getElementById('edit-feedback');
      if (fb) { fb.textContent = ''; }
      var cell = document.querySelector('#edit-board .cell[data-idx="' + idx + '"]');
      if (cell) {
        cell.className = 'cell' + (v ? ' ' + TILE_CLS[v] : '');
        cell.textContent = v || '';
      }
    }
  }

  function renderEditorTargets() {
    var row = document.getElementById('edit-targets');
    if (!row) { return; }
    var bs = row.querySelectorAll('.btn');
    for (var i = 0; i < bs.length; i++) {
      if (parseInt(bs[i].getAttribute('data-target'), 10) === state.editTarget) { bs[i].classList.add('btn-primary'); }
      else { bs[i].classList.remove('btn-primary'); }
    }
  }

  function renderEditorTools() {
    var bar = document.getElementById('edit-tools');
    if (!bar) { return; }
    var bs = bar.querySelectorAll('.btn');
    for (var j = 0; j < bs.length; j++) {
      if (parseInt(bs[j].getAttribute('data-tool'), 10) === state.editTool) { bs[j].classList.add('btn-primary'); }
      else { bs[j].classList.remove('btn-primary'); }
    }
  }

  /* 编辑器模型 → 存储模型（N-3 转换）：editCells[y*4+x] 非零格 → cells [{idx, val}] */
  function cellsFromEdit() {
    var cells = [];
    for (var i = 0; i < state.editCells.length; i++) {
      if (state.editCells[i]) { cells.push({ idx: i, val: state.editCells[i] }); }
    }
    return cells;
  }

  /* 可解性校验（M.checkCustom）：cells = [{idx, val}]，块数/值域/sum 硬约束 + bfsShortest 三态 */
  function checkCustom(cells, target) {
    if (!cells || !cells.length) { return { ok: false, msg: '先摆数字块', optimal: -1 }; }
    if (cells.length > 9) { return { ok: false, msg: '最多 9 个数字块', optimal: -1 }; }
    var sum = 0;
    for (var i = 0; i < cells.length; i++) {
      if (cells[i].val !== 2 && cells[i].val !== 4) { return { ok: false, msg: '数字块只能是 2 或 4', optimal: -1 }; }
      sum += cells[i].val;
    }
    if (sum < target) { return { ok: false, msg: '数字加起来不够目标', optimal: -1 }; }
    var grid = new Array(16).fill(0);
    for (var j = 0; j < cells.length; j++) { grid[cells[j].idx] = cells[j].val; }
    var opt = bfsShortest(grid, 4, target, 18, 200000);
    if (opt >= 1) { return { ok: true, msg: '✓ 可解！最优 ' + opt + ' 步', optimal: opt }; }
    if (opt === -2) { return { ok: false, msg: '暂不确定，试试减少块数或改小目标', optimal: -2 }; }
    return { ok: false, msg: '18 步内未找到解，试试少放几块或改小目标', optimal: -1 };
  }

  function doCheckEdit() {
    var res = checkCustom(cellsFromEdit(), state.editTarget);
    state.editChecked = res.ok;
    var fb = document.getElementById('edit-feedback');
    if (fb) {
      fb.textContent = res.msg;
      fb.className = 'edit-feedback ' + (res.ok ? 'ok' : 'miss');
    }
    return res;
  }

  function doSaveEdit() {
    var fb = document.getElementById('edit-feedback');
    if (!state.editChecked) {
      if (fb) { fb.textContent = '先点「✓ 检查可解」，通过后才能保存'; fb.className = 'edit-feedback miss'; }
      return;
    }
    var cells = cellsFromEdit();
    var res = checkCustom(cells, state.editTarget);
    if (!res.ok) {
      state.editChecked = false;
      if (fb) { fb.textContent = res.msg; fb.className = 'edit-feedback miss'; }
      return;
    }
    var name = '';
    if (state.editName) { name = state.editName.replace(/^\s+|\s+$/g, ''); }
    if (!name) { name = '我的关卡 ' + (customLevels.length + 1); }
    if (state.editIdx >= 0 && customLevels[state.editIdx]) {
      var cl = customLevels[state.editIdx];
      cl.name = name; cl.cells = cells; cl.target = state.editTarget; cl.optimal = res.optimal;
      cl.solved = false;
      saveCustomLevels(customLevels);
    } else {
      var id = addCustomLevel(cells, state.editTarget, res.optimal, name);
      if (!id) { return; }
    }
    window.alert('✓ 可解！保存成功');
    viewCustomList();
  }

  /* ---------- 视图：练习页 ---------- */
  function startGame(level) {
    state.level = level;
    state.size = LEVELS_CFG[level].size;
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

  /* ---------- 自定义关卡练习（v1.1，复刻 startGame 完整启动序列） ---------- */
  function startCustom(idx) {
    stopTimer();                              // 防重复 interval（⟲ 重置重载同关路径会二次进入）
    state.finished = false;
    state.execLock = false; state.execDone = false; state.won = false;
    state.cmds = []; state.totalCmds = 0;
    state.level = 'custom'; state.customIdx = idx;
    state.size = 4;                           // 编辑器固定 4×4
    var cl = customLevels[idx];
    var grid = new Array(16).fill(0);
    for (var i = 0; i < cl.cells.length; i++) { grid[cl.cells[i].idx] = cl.cells[i].val; }
    state.initGrid = grid; state.grid = grid.slice();
    state.target = cl.target; state.optimal = cl.optimal;
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
    var lvEl = makeEl('div', 'game-prog', (state.level === 'custom' ? customLevels[state.customIdx].name : LEVELS_CFG[state.level].label) + ' · 目标合出 ' + state.target);
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
      if (state.level === 'custom') { startCustom(state.customIdx); return; }  // custom：重载同关（不再随机）
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
    var size = state.size;   // N2 统一口径：startGame/startCustom 均设 state.size
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
    var res = applyMovePure(state.grid, state.size, dirMap[dir]);
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
    var fb = document.getElementById('game-feedback');
    if (state.level === 'custom') {
      // custom 分支：不写 store.best/recent（防污染三档统计）；星级按保存时 BFS 最优真实计算
      markCustomSolved(state.customIdx);
      store.history.push({ date: todayStr(), level: 'custom', customName: customLevels[state.customIdx].name, stars: stars, cmds: total });
      store.history = store.history.slice(-100);
      saveStore();
      if (fb) { fb.textContent += '（' + stars + '★，指令 ' + total + ' 条 / 最优 ' + state.optimal + '）'; }
      return;
    }
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
    if (fb) { fb.textContent += '（' + stars + '★，指令 ' + total + ' 条 / 最优 ' + state.optimal + '）'; }
  }

  function nextLevel() {
    if (state.level === 'custom') { viewCustomList(); return; }   // 结算后回关卡库
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
  M.startCustom = startCustom;
  M.viewCustomList = viewCustomList;
  M.viewEditor = viewEditor;
  M.checkCustom = checkCustom;
  M.loadCustomLevels = loadCustomLevels;
  M.saveCustomLevels = saveCustomLevels;
  M.addCustomLevel = addCustomLevel;
  M.removeCustomLevel = removeCustomLevel;
  M.markCustomSolved = markCustomSolved;
  M.state = state;
  M.genLevel = genLevel;
  M.applyMovePure = applyMovePure;
  M.bfsShortest = bfsShortest;
  window.M = M;
})();