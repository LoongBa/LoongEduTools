/* ============================================================
   机器人走迷宫 — main.js（益智·编程教学，D1 原型）
   ------------------------------------------------------------
   玩法：迷宫盘面（推箱子关卡 XSB 格式），孩子用指令积木编排机器人
   的移动序列（↑ 前进 / ↰ 左转 / ↱ 右转），点「▶ 执行」后机器人
   按指令序列移动（前方有箱子则推箱）。箱子全部到目标 = 答对。
   - 指令：前进/左转/右转（编程核心：顺序编排 + 调试）
   - 判定：执行后盘面 isWon（所有箱子在目标）= 有标准答案
   - 星级：指令数 vs 关卡最少推动数（bestPushes，≤1.5× = 3★）
   - 三档：简单 1-5 关 / 普通 6-10 关 / 挑战 11-15 关（数据 155 关全量）
   - 数据：window.APP_DATA（data.js）+ window.LEVELS（levels.js）
   - 存储：LX_SHARED.storage（V0.4 迁移）
   - 约束：ES2017 经典脚本、Chrome 61 兼容、无外部资源
   - v1.5：❓ if前方有墙（条件分支，工作队列执行器 + editCtx 分支编辑）
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };
  var M = {};
  var viewEl = document.getElementById('view');
  var headerEl = document.getElementById('app-header');
  var footerEl = document.getElementById('app-footer');

  /* ---------- 持久化（V0.4 迁移：LX_SHARED.storage） ---------- */
  LX_SHARED.storage.configure({ toolName: 'jiqirenzoumi' });  // 键前缀 redtools.jiqirenzoumi.v1
  var DEFAULT_STORE = {
    version: 1,
    best: { easy: null, normal: null, hard: null },   // { stars, cmds, level }
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

  /* ---------- v1.9 自定义关卡库（关卡编辑器） ---------- */
  // 存储：storage.set('customLevels') → localStorage 'redtools.jiqirenzoumi.customLevels'（无 .v1. 段）
  function loadCustomLevels() {
    var arr = LX_SHARED.storage.get('customLevels');
    return (arr && Array.isArray(arr)) ? arr : [];
  }
  function saveCustomLevels(arr) {
    LX_SHARED.storage.set('customLevels', arr);
  }
  function addCustomLevel(g, name) {
    var arr = customLevels;
    if (arr.length >= 20) { return null; }   // 上限 20 关
    var item = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 5),
      name: name || ('我的关卡 ' + (arr.length + 1)),
      g: g,
      createdAt: Date.now(),
      solved: false
    };
    arr.push(item);
    saveCustomLevels(arr);
    return item.id;
  }
  function removeCustomLevel(id) {
    customLevels = customLevels.filter(function (c) { return c.id !== id; });
    saveCustomLevels(customLevels);
  }
  function markCustomSolved(idx) {
    if (customLevels[idx]) {
      customLevels[idx].solved = true;
      saveCustomLevels(customLevels);
    }
  }
  var customLevels = loadCustomLevels();

  /* ---------- 难度档（关卡区段） ---------- */
  var LEVELS_CFG = {
    easy:   { key: 'easy',   label: '简单', from: 0, to: 30 },    // 1-30 关（入门渐进）
    normal: { key: 'normal', label: '普通', from: 30, to: 80 },   // 31-80 关（进阶推理）
    hard:   { key: 'hard',   label: '挑战', from: 80, to: 205 }   // 81-205 关（全量挑战 + v1.8 嵌套循环 196-205）
  };
  var LEVEL_ORDER = ['easy', 'normal', 'hard'];

  /* 指令常量 */
  var CMD_FWD = { id: 'fwd', label: '↑前进' };
  var CMD_L = { id: 'left', label: '↰左转' };
  var CMD_R = { id: 'right', label: '↱右转' };
  var CMD_BLOCK = { id: 'block', label: '🧱探测' };   // v1.3 条件指令：前方有墙/边界则不走
  var CMD_IF = { id: 'if', label: '❓if墙' };       // v1.5 条件分支：有墙→then / 无墙→else
  var CMD_STEPS = { id: 'steps', label: '➡N步' };      // v1.6 参数化移动：直线移动 N 格（参数=距离）
  var CMD_LOOP = { id: 'loop', label: '🔁循环' };      // v1.7 显式循环块：一组指令重复 N 次（循环=自动化）
  var DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // 右/下/左/上

  /* ---------- 状态 ---------- */
  var state = {
    level: 'easy',
    levelIdx: 0,
    cmds: [],          // 指令序列 [{id}]（v1.5：if 块含 then/else 分支数组）
    prog: 0,           // 兼容字段（队列模型下不再驱动执行）
    // 执行时盘面快照
    w: 0, h: 0,
    walls: {}, goals: {}, boxes: {}, player: -1, face: 0,
    won: false,
    execDone: false,
    startMs: 0, elapsed: 0, timerId: null,
    finished: false,
    // V1.4 调试反馈（执行期内存字段，不入库）
    firstFail: null,   // 首个失败：{absStep, cmd, reason: 'wall'|'box'|'edge'}
    absStep: 0,        // 展开步计数（循环指令按 rep 展开的绝对步数）
    execLock: false,   // 执行中锁定（防执行期间改指令序列）
    // V1.5 工作队列执行器
    execQueue: [],     // 执行队列（cmds 浅拷贝 + 分支指令动态插入）
    queueIdx: 0,       // 队列当前位置
    curTop: -1,        // 当前执行指令对应的顶层 chip 下标（高亮用）
    MAX_QUEUE: 500     // 队列长度上限（防 if/循环无限展开）
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

  /* ---------- XSB 解析（复用推箱子） ---------- */
  /* v1.9 重构：parseLevel 接收 XSB 行数组 g（原 idx → window.LEVELS[idx].g；自定义关卡传 customLevels[idx].g） */
  function parseLevel(g) {
    var rows = g;
    var h = rows.length;
    var w = 0;
    for (var r = 0; r < h; r++) {
      if (rows[r].length > w) { w = rows[r].length; }
    }
    var walls = {}, goals = {}, boxes = {};
    var player = -1;
    for (var y = 0; y < h; y++) {
      var row = rows[y];
      for (var x = 0; x < row.length; x++) {
        var ch = row.charAt(x);
        var i = y * w + x;
        if (ch === '#') { walls[i] = true; }
        else if (ch === '.') { goals[i] = true; }
        else if (ch === '$') { boxes[i] = true; }
        else if (ch === '*') { boxes[i] = true; goals[i] = true; }
        else if (ch === '@') { player = i; }
        else if (ch === '+') { player = i; goals[i] = true; }
      }
    }
    return { w: w, h: h, walls: walls, goals: goals, boxes: boxes, player: player };
  }
  function bestPushes(idx) {
    if (state.level === 'custom') { return null; }   // v1.9：自建关卡无最优步数基准（兜底 2★）
    var b = window.LEVELS[idx] && window.LEVELS[idx].b;
    return (typeof b === 'number') ? b : null;
  }
  function isWon(boxes, goals) {
    for (var k in boxes) {
      if (Object.prototype.hasOwnProperty.call(boxes, k)) {
        if (!goals[k]) { return false; }
      }
    }
    return true;
  }

  /* ============================================================
     v1.9 关卡编辑器：可解性 BFS + 编辑器视图 + 自定义关卡库
     ============================================================ */

  /* ---------- 可解性校验（isLevelSolvable）----------
     push-state BFS：状态 = (归一化玩家区域, 排序箱子集)
     死锁剪枝：角死锁（箱在两墙夹角非目标）+ 边死锁（箱贴墙且沿墙方向无目标）
     状态上限 20 万；超限返回 'unknown'（暂不确定，提示缩小关卡） */
  var EDITOR_DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  function isLevelSolvable(g) {
    var lv = parseLevel(g);
    var w = lv.w, h = lv.h;
    var walls = lv.walls, goals = lv.goals;
    var initBoxes = lv.boxes, initPlayer = lv.player;
    var boxKeys = Object.keys(initBoxes).map(Number);
    if (boxKeys.length === 0 || initPlayer < 0) { return 'invalid'; }   // 无箱/无玩家 → 不可校验
    if (boxKeys.length > 3) { return 'invalid'; }                        // 编辑器限制 ≤3 箱
    // 单箱也走主 BFS（push-state 状态 = 玩家区域 × 箱位置 ≈ 小，完整可靠；
    // 单箱快速路径只能查直线滑到目标，漏掉「横推后再竖推」两步解 → 已移除）

    var MAX_STATES = 200000;
    var seen = {};
    var queue = [];
    var head = 0;
    // 初始状态：玩家可达区（flood fill）+ 初始箱子集
    var startRegion = reachableRegion(initPlayer, initBoxes, w, h, walls);
    var startState = regionKey(startRegion) + '|' + boxKey(initBoxes);
    seen[startState] = true;
    queue.push({ region: startRegion, boxes: cloneBoxes(initBoxes) });
    var seenCount = 1;

    while (head < queue.length) {
      if (seenCount > MAX_STATES) { return 'unknown'; }
      var cur = queue[head++];
      if (allBoxesOnGoals(cur.boxes, goals)) { return true; }
      // 对每个箱子 × 4 方向尝试推动
      var boxIdxArr = Object.keys(cur.boxes).map(Number);
      for (var bi = 0; bi < boxIdxArr.length; bi++) {
        var bidx = boxIdxArr[bi];
        var bx = bidx % w, by = Math.floor(bidx / w);
        for (var d = 0; d < 4; d++) {
          var dx = EDITOR_DIRS[d][0], dy = EDITOR_DIRS[d][1];
          // 玩家需在箱子推动反方向（箱子旁且可达）
          var standIdx = bidx - dx - dy * w;   // 玩家站在箱子推动反侧
          if (standIdx < 0 || standIdx >= w * h || walls[standIdx]) { continue; }
          if (!cur.region[standIdx]) { continue; }   // 玩家不可达该站位 → 推不了
          var toIdx = bidx + dx + dy * w;            // 箱子的落点
          if (toIdx < 0 || toIdx >= w * h || walls[toIdx] || cur.boxes[toIdx]) { continue; }
          if (isDeadlock(bidx, toIdx, w, h, walls, goals)) { continue; }   // 死锁剪枝
          // 新状态：箱子移动，玩家到箱子原位
          var nb = cloneBoxes(cur.boxes);
          delete nb[bidx]; nb[toIdx] = true;
          var newRegion = reachableRegion(bidx, nb, w, h, walls);
          var key = regionKey(newRegion) + '|' + boxKey(nb);
          if (!seen[key]) {
            seen[key] = true; seenCount++;
            queue.push({ region: newRegion, boxes: nb });
          }
        }
      }
    }
    return false;   // 队列耗尽 → 不可解
  }

  function reachableRegion(player, boxes, w, h, walls) {
    var region = {};
    var queue = [player];
    region[player] = true;
    var head = 0;
    while (head < queue.length) {
      var cur = queue[head++];
      var cx = cur % w, cy = Math.floor(cur / w);
      for (var d = 0; d < 4; d++) {
        var nx = cx + EDITOR_DIRS[d][0], ny = cy + EDITOR_DIRS[d][1];
        var nIdx = ny * w + nx;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) { continue; }
        if (walls[nIdx] || boxes[nIdx]) { continue; }
        if (!region[nIdx]) { region[nIdx] = true; queue.push(nIdx); }
      }
    }
    return region;
  }
  function regionKey(region) {
    return Object.keys(region).map(Number).sort(function (a, b) { return a - b; }).join(',');
  }
  function boxKey(boxes) {
    return Object.keys(boxes).map(Number).sort(function (a, b) { return a - b; }).join(',');
  }
  function cloneBoxes(boxes) {
    var nb = {};
    for (var k in boxes) { if (Object.prototype.hasOwnProperty.call(boxes, k)) { nb[k] = true; } }
    return nb;
  }
  function allBoxesOnGoals(boxes, goals) {
    for (var k in boxes) {
      if (Object.prototype.hasOwnProperty.call(boxes, k) && !goals[k]) { return false; }
    }
    return true;
  }
  /* 死锁剪枝：箱子落在死锁位且非目标 → 剪枝
     仅保留【角死锁】（严格安全：两相邻方向都墙 = 箱子永不可再移动，必死锁）
     边死锁检测已移除——沿墙延展逻辑在单箱滑动场景会误剪可达路径（假阴性比不剪更糟），
     边界死锁由状态上限（20 万）兜底，宁可多搜也不误判 */
  function isDeadlockCell(x, y, w, h, walls, goals) {
    var idx = y * w + x;
    if (goals[idx]) { return false; }   // 目标位不死锁
    var hasWallUp = y === 0 || walls[(y - 1) * w + x];
    var hasWallDown = y === h - 1 || walls[(y + 1) * w + x];
    var hasWallLeft = x === 0 || walls[y * w + (x - 1)];
    var hasWallRight = x === w - 1 || walls[y * w + (x + 1)];
    // 角死锁：两相邻方向都有墙（90° 夹角）
    if ((hasWallUp && hasWallLeft) || (hasWallUp && hasWallRight) ||
        (hasWallDown && hasWallLeft) || (hasWallDown && hasWallRight)) { return true; }
    return false;
  }
  function isDeadlock(bidx, toIdx, w, h, walls, goals) {
    return isDeadlockCell(toIdx % w, Math.floor(toIdx / w), w, h, walls, goals);
  }

  /* ---------- 编辑器视图（viewEditor） ---------- */
  // 编辑态：editCells[y*w+x] = { wall, goal, box, player } 四布尔层
  var editCells = [];
  var editW = 12, editH = 12;
  var editTool = 'wall';       // wall/box/goal/player/eraser
  var editDragging = false;
  var editName = '';
  var editId = null;           // 编辑已有关卡时的 id（新建为 null）

  function viewCustomList() {
    stopTimer();
    renderHeader();
    clearNode(viewEl);
    var wrap = makeEl('div', 'custom-wrap');
    wrap.appendChild(makeEl('h2', 'custom-title', '🛠 自建关卡'));
    if (!customLevels.length) {
      wrap.appendChild(makeEl('p', 'custom-empty', '还没有自建关卡，来设计一个吧！'));
    }
    customLevels.forEach(function (c, idx) {
      var row = makeEl('div', 'custom-row');
      var info = makeEl('div', 'custom-info');
      info.appendChild(makeEl('div', 'custom-name', c.name + (c.solved ? ' ✅已解' : '')));
      info.appendChild(makeEl('div', 'custom-meta', '创建 ' + fmtDate(c.createdAt) + ' · ' + c.g.length + ' 行'));
      row.appendChild(info);
      var btns = makeEl('div', 'custom-btns');
      var editBtn = makeEl('button', 'btn btn-sm', '✏ 编辑');
      editBtn.addEventListener('click', function () { openEditor(idx); });
      btns.appendChild(editBtn);
      var playBtn = makeEl('button', 'btn btn-sm btn-primary', '▶ 挑战');
      playBtn.addEventListener('click', function () { startCustom(idx); });
      btns.appendChild(playBtn);
      var delBtn = makeEl('button', 'btn btn-sm btn-danger', '🗑');
      delBtn.addEventListener('click', function () {
        if (window.confirm('删除关卡「' + c.name + '」？')) {
          removeCustomLevel(c.id);
          viewCustomList();
        }
      });
      btns.appendChild(delBtn);
      row.appendChild(btns);
      wrap.appendChild(row);
    });
    var newBtn = makeEl('button', 'btn btn-primary', '+ 新建关卡');
    newBtn.addEventListener('click', function () { openEditor(-1); });
    wrap.appendChild(newBtn);
    if (customLevels.length >= 20) {
      wrap.appendChild(makeEl('p', 'custom-limit', '⚠ 已达上限 20 关，删除后可再新建'));
    }
    var back = makeEl('button', 'btn', '‹ 返回首页');
    back.addEventListener('click', function () { viewHome(); });
    wrap.appendChild(back);
    viewEl.appendChild(wrap);
    renderFooter('');
  }

  function fmtDate(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  /* 打开编辑器：idx>=0 编辑已有；idx=-1 新建 */
  function openEditor(idx) {
    stopTimer();
    renderHeader();
    clearNode(viewEl);
    editId = (idx >= 0) ? customLevels[idx].id : null;
    editName = (idx >= 0) ? customLevels[idx].name : '';
    editCells = [];
    // 新建：12×12 空盘；编辑：载入已有 g
    if (idx >= 0) { loadGToCells(customLevels[idx].g); }
    else { loadGToCells([]); }
    renderEditor();
  }

  /* 载入 XSB 行数组 → editCells 四层 */
  function loadGToCells(g) {
    editCells = [];
    for (var y = 0; y < editH; y++) {
      for (var x = 0; x < editW; x++) {
        editCells.push({ wall: false, goal: false, box: false, player: false });
      }
    }
    if (!g || !g.length) { return; }
    for (var r = 0; r < g.length; r++) {
      var row = g[r];
      for (var c = 0; c < row.length; c++) {
        var ch = row.charAt(c);
        if (c >= editW || r >= editH) { continue; }
        var cell = editCells[r * editW + c];
        if (ch === '#') { cell.wall = true; }
        else if (ch === '$') { cell.box = true; }
        else if (ch === '.') { cell.goal = true; }
        else if (ch === '*') { cell.box = true; cell.goal = true; }
        else if (ch === '@') { cell.player = true; }
        else if (ch === '+') { cell.player = true; cell.goal = true; }
      }
    }
  }

  /* editCells → XSB 行数组（auto-trim 全空行/列） */
  function cellsToG() {
    var rows = [];
    for (var y = 0; y < editH; y++) {
      var row = '';
      for (var x = 0; x < editW; x++) {
        var c = editCells[y * editW + x];
        if (c.wall) { row += '#'; }
        else if (c.box && c.goal) { row += '*'; }
        else if (c.box) { row += '$'; }
        else if (c.goal && c.player) { row += '+'; }
        else if (c.goal) { row += '.'; }
        else if (c.player) { row += '@'; }
        else { row += ' '; }
      }
      rows.push(row);
    }
    // auto-trim：去全空行 + 去全空列
    rows = rows.filter(function (r) { return r.trim().length > 0; });
    if (!rows.length) { return []; }
    var minCol = editW, maxCol = 0;
    rows.forEach(function (r) {
      for (var i = 0; i < editW; i++) {
        if (r.charAt(i) !== ' ') {
          if (i < minCol) { minCol = i; }
          if (i > maxCol) { maxCol = i; }
        }
      }
    });
    return rows.map(function (r) { return r.slice(minCol, maxCol + 1); });
  }

  function renderEditor() {
    clearNode(viewEl);
    var wrap = makeEl('div', 'editor-wrap');
    wrap.appendChild(makeEl('h2', 'editor-title', '🛠 关卡编辑器'));
    // 名称输入
    var nameRow = makeEl('div', 'editor-name-row');
    nameRow.appendChild(makeEl('label', 'editor-name-label', '名称:'));
    var nameInput = makeEl('input', 'editor-name-input');
    nameInput.type = 'text';
    nameInput.maxLength = 12;
    nameInput.value = editName || ('我的关卡 ' + (customLevels.length + 1));
    nameInput.addEventListener('input', function () { editName = nameInput.value; });
    nameRow.appendChild(nameInput);
    wrap.appendChild(nameRow);
    // 网格
    var grid = makeEl('div', 'editor-grid');
    grid.style.gridTemplateColumns = 'repeat(' + editW + ', 1fr)';
    grid.addEventListener('pointerdown', function (ev) { ev.preventDefault(); });
    for (var i = 0; i < editW * editH; i++) {
      (function (ci) {
        var cellEl = makeEl('div', 'editor-cell');
        cellEl.dataset.idx = ci;
        refreshEditorCell(cellEl, ci);
        cellEl.addEventListener('pointerdown', function (ev) {
          ev.preventDefault();
          editDragging = true;
          paintCell(ci);
          try { cellEl.setPointerCapture(ev.pointerId); } catch (e) { /* 兼容 */ }
        });
        // click 兜底（辅助技术/JS 触发 .click() 只派发 click 不派发 pointerdown）
        cellEl.addEventListener('click', function () {
          paintCell(ci);
        });
        cellEl.addEventListener('pointermove', function (ev) {
          if (!editDragging) { return; }
          var el = document.elementFromPoint(ev.clientX, ev.clientY);
          if (el && el.dataset && el.dataset.idx !== undefined) {
            paintCell(Number(el.dataset.idx));
          }
        });
        cellEl.addEventListener('pointerup', function () { editDragging = false; });
        cellEl.addEventListener('pointercancel', function () { editDragging = false; });
        grid.appendChild(cellEl);
      })(i);
    }
    wrap.appendChild(grid);
    // 工具条
    var tools = makeEl('div', 'editor-tools');
    var toolDefs = [
      { id: 'wall', label: '🧱墙' }, { id: 'box', label: '📦箱' },
      { id: 'goal', label: '🎯目标' }, { id: 'player', label: '🤖玩家' }, { id: 'eraser', label: '🧹橡皮' }
    ];
    toolDefs.forEach(function (t) {
      var btn = makeEl('button', 'btn btn-sm' + (editTool === t.id ? ' active' : ''), t.label);
      btn.addEventListener('click', function () {
        editTool = t.id;
        // 重绘工具条高亮
        var btns = tools.querySelectorAll('.btn');
        for (var i = 0; i < btns.length; i++) {
          btns[i].classList.remove('active');
        }
        btn.classList.add('active');
      });
      tools.appendChild(btn);
    });
    wrap.appendChild(tools);
    // 操作按钮
    var actions = makeEl('div', 'editor-actions');
    var checkBtn = makeEl('button', 'btn', '✓ 检查可解');
    checkBtn.addEventListener('click', function () { doCheckSolvable(); });
    actions.appendChild(checkBtn);
    var saveBtn = makeEl('button', 'btn btn-primary', '💾 保存');
    saveBtn.addEventListener('click', function () { doSaveCustom(); });
    actions.appendChild(saveBtn);
    var clearBtn = makeEl('button', 'btn', '↺ 清空');
    clearBtn.addEventListener('click', function () {
      if (window.confirm('清空当前编辑的盘面？')) {
        loadGToCells([]);
        renderEditor();
      }
    });
    actions.appendChild(clearBtn);
    wrap.appendChild(actions);
    var feedback = makeEl('div', 'editor-feedback', '');
    feedback.id = 'editor-feedback';
    wrap.appendChild(feedback);
    var back = makeEl('button', 'btn', '‹ 返回关卡库');
    back.addEventListener('click', function () { viewCustomList(); });
    wrap.appendChild(back);
    viewEl.appendChild(wrap);
    renderFooter('');
  }

  /* 刷新单个编辑器格（按四层状态渲染） */
  function refreshEditorCell(el, ci) {
    var c = editCells[ci];
    var cls = 'editor-cell';
    if (c.wall) { cls += ' is-wall'; }
    else {
      if (c.goal) { cls += ' has-goal'; }
      if (c.box) { cls += ' has-box'; }
      if (c.player) { cls += ' has-player'; }
    }
    el.className = cls;
  }

  /* 涂格：按分层语义 */
  function paintCell(ci) {
    var c = editCells[ci];
    var el = document.querySelector('.editor-cell[data-idx="' + ci + '"]');
    if (editTool === 'wall') {
      c.wall = true; c.goal = false; c.box = false; c.player = false;
    } else if (editTool === 'box') {
      if (!c.wall) { c.box = true; }
    } else if (editTool === 'goal') {
      if (!c.wall) { c.goal = true; }
    } else if (editTool === 'player') {
      if (!c.wall) {
        c.box = false;   // 玩家不能站在箱上（游戏语义：推箱后玩家到箱原位，箱移走）；移除箱层
        // 唯一：清旧玩家
        for (var i = 0; i < editCells.length; i++) {
          if (editCells[i].player) {
            editCells[i].player = false;
            var elOld = document.querySelector('.editor-cell[data-idx="' + i + '"]');
            if (elOld) { refreshEditorCell(elOld, i); }
          }
        }
        c.player = true;
      }
    } else if (editTool === 'eraser') {
      c.wall = false; c.goal = false; c.box = false; c.player = false;
    }
    if (el) { refreshEditorCell(el, ci); }
  }

  /* 校验盘面 → 可解性 */
  function validateCustomLevels(g) {
    var lv = parseLevel(g);
    var pCount = 0, bCount = 0, gCount = 0;
    for (var k in lv.boxes) { if (Object.prototype.hasOwnProperty.call(lv.boxes, k)) { bCount++; } }
    for (var gk in lv.goals) { if (Object.prototype.hasOwnProperty.call(lv.goals, gk)) { gCount++; } }
    if (lv.player < 0) { return { ok: false, msg: '请放 1 个机器人（🤖玩家）' }; }
    if (bCount === 0) { return { ok: false, msg: '请至少放 1 个箱子（📦箱）' }; }
    if (gCount === 0) { return { ok: false, msg: '请至少放 1 个目标（🎯目标）' }; }
    if (bCount > 3) { return { ok: false, msg: '最多放 3 个箱子（可解性校验更可靠）' }; }
    return { ok: true };
  }

  function doCheckSolvable() {
    var g = cellsToG();
    var v = validateCustomLevels(g);
    var fb = document.getElementById('editor-feedback');
    if (!v.ok) { fb.textContent = '😅 ' + v.msg; fb.className = 'editor-feedback miss'; return; }
    var sol = isLevelSolvable(g);
    if (sol === true) { fb.textContent = '✅ 可解！可以保存啦'; fb.className = 'editor-feedback ok'; }
    else if (sol === false) { fb.textContent = '😅 目前无解——箱子推不到所有目标，调整一下？'; fb.className = 'editor-feedback miss'; }
    else { fb.textContent = '⏳ 关卡较复杂，暂不确定是否可解（可先试试小关卡）'; fb.className = 'editor-feedback miss'; }
  }

  function doSaveCustom() {
    var g = cellsToG();
    var v = validateCustomLevels(g);
    var fb = document.getElementById('editor-feedback');
    if (!v.ok) { fb.textContent = '😅 ' + v.msg + '（保存前需通过校验）'; fb.className = 'editor-feedback miss'; return; }
    var sol = isLevelSolvable(g);
    if (sol !== true) {
      fb.textContent = '😅 关卡不可解，不能保存——调整到可解再保存吧'; fb.className = 'editor-feedback miss';
      return;
    }
    var name = (editName || '').trim() || ('我的关卡 ' + (customLevels.length + 1));
    if (editId) {
      // 更新已有
      for (var i = 0; i < customLevels.length; i++) {
        if (customLevels[i].id === editId) {
          customLevels[i].g = g;
          customLevels[i].name = name;
          break;
        }
      }
      saveCustomLevels(customLevels);
    } else {
      var id = addCustomLevel(g, name);
      if (!id) { fb.textContent = '⚠ 已达上限 20 关，删除旧关后再保存'; fb.className = 'editor-feedback miss'; return; }
    }
    viewCustomList();
  }

  /* ---------- 自定义关卡练习（startCustom） ---------- */
  function startCustom(idx) {
    state.firstFail = null; state.absStep = 0; state.execLock = false;   // ① 复位调试状态
    if (editStack.length) { closeEditCtx(); }                             // ② 关编辑区
    state.level = 'custom'; state.levelIdx = -1; state.customIdx = idx;  // ③ 双态标记
    state.cmds = []; state.finished = false;                              // ④ 清指令
    loadLevelState(); renderGame();                                       // ⑤ 载盘+渲染
    state.startMs = Date.now(); startTimer();                             // ⑥ 计时
  }


  function renderHeader(title) {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '机器人走迷宫';
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
    wrap.appendChild(makeEl('h1', 'home-title', '🤖 机器人走迷宫'));
    wrap.appendChild(makeEl('p', 'home-sub', '用指令让机器人把箱子推到目标点！'));

    LEVEL_ORDER.forEach(function (k) {
      var lv = LEVELS_CFG[k];
      var card = makeEl('button', 'level-card');
      var best = store.best[k];
      var bestTxt = best ? '最佳 ' + best.stars + '★ · 第 ' + best.level + ' 关' : '未挑战';
      card.appendChild(makeEl('div', 'level-name', lv.label + ' · 第 ' + (lv.from + 1) + '-' + lv.to + ' 关'));
      card.appendChild(makeEl('div', 'level-best', bestTxt));
      card.addEventListener('click', function () { startGame(k); });
      wrap.appendChild(card);
    });

    var customCard = makeEl('button', 'level-card custom-card');
    customCard.appendChild(makeEl('div', 'level-name', '🛠 自建关卡 (' + customLevels.length + ')'));
    customCard.appendChild(makeEl('div', 'level-best', '设计自己的迷宫！'));
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
      wrap.appendChild(makeEl('div', 'parent-row', lv.label + '：' + (b ? b.stars + '★ / 第 ' + b.level + ' 关' : '未挑战')));
    });
    var hist = store.history.slice(-10).reverse();
    if (hist.length) {
      wrap.appendChild(makeEl('h3', 'parent-sub', '最近记录'));
      hist.forEach(function (h) {
        // v1.9：custom 历史显示自建关卡名
        var label = h.level === 'custom' ? ('自建关卡·' + (h.customName || '')) : (LEVELS_CFG[h.level] ? LEVELS_CFG[h.level].label : h.level);
        wrap.appendChild(makeEl('div', 'parent-row small', h.date + ' · ' + label + ' · ' + h.stars + '★'));
      });
    }
    var back = makeEl('button', 'btn', '‹ 返回');
    back.addEventListener('click', function () { viewHome(); });
    wrap.appendChild(back);
    var clearBtn = makeEl('button', 'btn btn-danger', '清除所有数据');
    clearBtn.addEventListener('click', function () {
      if (window.confirm('确定清除所有练习数据？此操作不可恢复。')) {
        LX_SHARED.storage.remove('v1');
        LX_SHARED.storage.remove('customLevels');   // v1.9：一并清除自建关卡（B5）
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

  /* ---------- 视图：练习页 ---------- */
  function startGame(level) {
    // V1.4：状态复位（防残留锁）
    state.firstFail = null; state.absStep = 0; state.execLock = false;
    if (editStack.length) { closeEditCtx(); }
    state.level = level;
    state.levelIdx = LEVELS_CFG[level].from;
    state.cmds = [];
    state.finished = false;
    loadLevelState();
    renderGame();
    state.startMs = Date.now();
    startTimer();
  }

  function loadLevelState() {
    // v1.9：custom 模式读自定义关卡 g 数组；内置关读 window.LEVELS[idx].g
    var g = state.level === 'custom' ? customLevels[state.customIdx].g : window.LEVELS[state.levelIdx].g;
    var lv = parseLevel(g);
    state.w = lv.w; state.h = lv.h;
    state.walls = lv.walls; state.goals = lv.goals;
    state.boxes = lv.boxes; state.player = lv.player;
    state.face = 0; // 朝右
    state.won = false;
    state.execDone = false;
  }

  /* 渲染盘面（当前 boxes/player 快照） */
  function boardHtml() {
    var parts = ['<svg id="board-svg" class="board-svg" viewBox="0 0 ' + (state.w * 32) + ' ' + (state.h * 32) + '">'];
    for (var y = 0; y < state.h; y++) {
      for (var x = 0; x < state.w; x++) {
        var i = y * state.w + x;
        var px = x * 32, py = y * 32;
        if (state.walls[i]) {
          parts.push('<rect x="' + px + '" y="' + py + '" width="32" height="32" fill="#8a8f98"/>');
        } else {
          parts.push('<rect x="' + px + '" y="' + py + '" width="32" height="32" fill="#f0f2f5"/>');
          if (state.goals[i]) {
            parts.push('<circle cx="' + (px + 16) + '" cy="' + (py + 16) + '" r="7" fill="none" stroke="#ff9c4a" stroke-width="2"/>');
          }
          if (state.boxes[i]) {
            parts.push('<rect x="' + (px + 6) + '" y="' + (py + 6) + '" width="20" height="20" rx="3" fill="#b76a1a"/>');
            parts.push('<rect x="' + (px + 10) + '" y="' + (py + 10) + '" width="12" height="12" rx="2" fill="#d98a3a"/>');
          }
        }
      }
    }
    // 机器人（玩家）
    var pp = state.player;
    if (pp >= 0) {
      var px2 = (pp % state.w) * 32, py2 = Math.floor(pp / state.w) * 32;
      parts.push('<circle cx="' + (px2 + 16) + '" cy="' + (py2 + 16) + '" r="11" fill="#3a7bd5"/>');
      parts.push('<circle cx="' + (px2 + 16) + '" cy="' + (py2 + 16) + '" r="4" fill="#ffffff"/>');
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
    // v1.9：custom 模式显示自建关卡名
    var lvEl = makeEl('div', 'game-prog', (state.level === 'custom' ? (customLevels[state.customIdx] ? customLevels[state.customIdx].name : '自建关卡') : LEVELS_CFG[state.level].label) + ' · 第 ' + (state.levelIdx + 1) + ' 关');
    lvEl.id = 'game-prog';
    top.appendChild(lvEl);
    var timerEl = makeEl('div', 'game-timer', '⏱ 00.0');
    timerEl.id = 'game-timer';
    top.appendChild(timerEl);
    var hint = makeEl('div', 'game-hint', '目标：把箱子推到橙色圈');
    top.appendChild(hint);
    wrap.appendChild(top);

    // 盘面
    var board = makeEl('div', 'board');
    board.id = 'board';
    board.innerHTML = boardHtml();
    wrap.appendChild(board);

    // 指令区
    var cmdBar = makeEl('div', 'cmd-bar');
    cmdBar.id = 'cmd-bar';
    [CMD_FWD, CMD_L, CMD_R, CMD_BLOCK, CMD_STEPS, CMD_IF, CMD_LOOP].forEach(function (cmd) {
      var btn = makeEl('button', 'cmd-add', cmd.label);
      btn.addEventListener('click', function () { addCmd(cmd.id); });
      cmdBar.appendChild(btn);
    });
    wrap.appendChild(cmdBar);

    // 指令序列（可删除）
    var seqWrap = makeEl('div', 'seq-wrap');
    seqWrap.id = 'seq-wrap';
    var seqBox = makeEl('div', 'seq-box');
    seqBox.id = 'seq-box';
    seqBox.textContent = '（空指令序列）';
    seqWrap.appendChild(seqBox);
    var clearBtn = makeEl('button', 'seq-clear', '↺ 清空');
    clearBtn.addEventListener('click', function () { state.cmds = []; if (editStack.length) { closeEditCtx(); } renderSeq(); });
    seqWrap.appendChild(clearBtn);
    wrap.appendChild(seqWrap);

    // V1.5 if 分支编辑区（点击 if 块 chip 展开；默认隐藏）
    var blockEdit = makeEl('div', 'block-edit');
    blockEdit.id = 'block-edit';
    blockEdit.style.display = 'none';
    wrap.appendChild(blockEdit);

    // 执行控制
    var ctrl = makeEl('div', 'ctrl-row');
    var runBtn = makeEl('button', 'btn btn-primary', '▶ 执行');
    runBtn.id = 'run-btn';
    runBtn.addEventListener('click', function () { execRun(); });
    ctrl.appendChild(runBtn);
    var resetBtn = makeEl('button', 'btn', '⟲ 重置');
    resetBtn.addEventListener('click', function () {
      state.firstFail = null;
      state.absStep = 0;
      state.execLock = false;
      setCmdLocked(false);
      if (editStack.length) { closeEditCtx(); }
      loadLevelState(); renderBoardOnly(); renderSeq(); clearExecHighlight();
    });
    ctrl.appendChild(resetBtn);
    var nextBtn = makeEl('button', 'btn', '下一关 ›');
    nextBtn.id = 'next-btn';
    nextBtn.style.display = 'none';
    nextBtn.addEventListener('click', function () { nextLevel(); });
    ctrl.appendChild(nextBtn);
    wrap.appendChild(ctrl);

    // 反馈
    var fb = makeEl('div', 'game-feedback', '先加指令，再点执行！');
    fb.id = 'game-feedback';
    wrap.appendChild(fb);

    viewEl.appendChild(wrap);
    renderFooter('');
  }

  function renderSeq() {
    var box = document.getElementById('seq-box');
    if (!box) { return; }
    if (!state.cmds.length) {
      box.textContent = '（空指令序列）';
      box.className = 'seq-box';
      return;
    }
    box.className = 'seq-box active';
    clearNode(box);
    state.cmds.forEach(function (cmd, i) {
      var isIf = cmd.id === 'if';
      var isSteps = cmd.id === 'steps';
      var isLoop = cmd.id === 'loop';
      var lbl = cmd.id === 'fwd' ? '↑' : (cmd.id === 'left' ? '↰' : (cmd.id === 'right' ? '↱' : (cmd.id === 'block' ? '🧱' : (cmd.id === 'steps' ? '➡走' + (cmd.steps || 1) + '步' : (cmd.id === 'loop' ? '🔁×' + (cmd.rep || 2) : '❓if')))));
      var repTxt = (!isIf && !isSteps && !isLoop && cmd.rep && cmd.rep > 1) ? ('×' + cmd.rep) : '';
      // 指令 chip：单击循环次数/参数递增/打开编辑区（if 分支 or 循环块）；✕ 角标删除
      var chip = makeEl('span', 'cmd-chip' + (repTxt ? ' loop' : '') + (isIf ? ' if' : '') + (isLoop ? ' loopb' : ''), (i + 1) + '.' + lbl + repTxt);
      chip.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (isIf || isLoop) { openEditCtx(i, cmd); }
        else if (isSteps) { cycleSteps(i); }
        else { cycleRep(i); }
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

  // 循环次数递增：1→2→3→4→1（循环指令启蒙；if/steps/loop 块跳过——loop 在编辑区调次数）
  function cycleRep(i) {
    if (state.execLock) { return; }
    var cmd = state.cmds[i];
    if (!cmd || cmd.id === 'if' || cmd.id === 'steps' || cmd.id === 'loop') { return; }
    var next = ((cmd.rep || 1) % 4) + 1;
    cmd.rep = next;
    renderSeq();
  }
  function setRepFromIdx(i, rep) {
    var cmd = state.cmds[i];
    if (cmd) { cmd.rep = rep; }
  }
  // v1.6 参数递增：1→2→3→…→9→1（steps 参数化，区别于 rep 的 4 上限）
  function cycleSteps(i) {
    if (state.execLock) { return; }
    var cmd = state.cmds[i];
    if (!cmd || cmd.id !== 'steps') { return; }
    cmd.steps = ((cmd.steps || 1) % 9) + 1;
    renderSeq();
  }

  function renderBoardOnly() {
    var board = document.getElementById('board');
    if (board) { board.innerHTML = boardHtml(); }
  }

  function addCmd(id) {
    if (state.execLock) { return; }
    if (id === 'if') { state.cmds.push({ id: id, then: [], else: [] }); }
    else if (id === 'steps') { state.cmds.push({ id: id, steps: 1 }); }
    else if (id === 'loop') { state.cmds.push({ id: id, rep: 2, body: [] }); }
    else { state.cmds.push({ id: id, rep: 1 }); }
    renderSeq();
  }
  function removeCmd(i) {
    if (state.execLock) { return; }
    var cmd = state.cmds[i];
    if (cmd && cmd.id === 'if' && !window.confirm('删除 if 分支块？')) { return; }
    if (cmd && cmd.id === 'loop' && !window.confirm('删除循环块？')) { return; }
    state.cmds.splice(i, 1);
    if (editStack.length) { closeEditCtx(); }
    renderSeq();
  }

  /* ---------- V1.5/V1.7 editCtx：if 分支 / 循环块编辑区 ---------- */
  // 编辑栈：支持嵌套 if（≤2 层）+ 循环块（单层），每层 {topIdx, cmd}
  var editStack = [];

  function openEditCtx(idx, cmd) {
    if (state.execLock) { return; }
    editStack = [{ topIdx: idx, cmd: cmd }];
    renderEditCtx();
  }
  function openNestedEditCtx(cmd) {
    if (state.execLock) { return; }
    // v1.7：ifDepth 按 if 类型计数（loop 帧不计 if 深度）——loop(0)→if(1)→if(2) 才拦
    if (ifDepth() >= 2) {
      var fb = document.getElementById('game-feedback');
      if (fb) { fb.textContent = '⚠ 分支嵌套最多 2 层'; fb.className = 'game-feedback miss'; }
      return;
    }
    editStack.push({ topIdx: -1, cmd: cmd });
    renderEditCtx();
  }
  function closeEditCtx() {
    editStack = [];
    var be = document.getElementById('block-edit');
    if (be) { be.style.display = 'none'; }
    renderSeq();
  }
  function goBackEditCtx() {
    editStack.pop();
    if (!editStack.length) { closeEditCtx(); return; }
    renderEditCtx();
  }
  // v1.7：当前编辑栈中 if 类型帧数（loop 不计）
  function ifDepth() {
    var n = 0;
    for (var i = 0; i < editStack.length; i++) {
      if (editStack[i].cmd && editStack[i].cmd.id === 'if') { n += 1; }
    }
    return n;
  }

  function renderEditCtx() {
    var be = document.getElementById('block-edit');
    if (!be || !editStack.length) { return; }
    var cur = editStack[editStack.length - 1];
    var cmd = cur.cmd;
    clearNode(be);
    var isLoop = cmd.id === 'loop';
    var title = makeEl('div', 'block-edit-title',
      isLoop ? ('🔁 循环 ×' + (cmd.rep || 2) + ' — 循环编辑') :
      ('❓ if前方有墙 — ' + (editStack.length > 1 ? '内层分支' : '分支') + '编辑'));
    be.appendChild(title);
    if (editStack.length > 1) {
      var backBtn = makeEl('button', 'cmd-add-sm', '‹ 返回上层');
      backBtn.addEventListener('click', goBackEditCtx);
      be.appendChild(backBtn);
    }
    if (isLoop) {
      // v1.7 loop 编辑区：单栏 body + 次数调参
      be.appendChild(renderLoopBody(cmd));
    } else {
      var row = makeEl('div', 'block-edit-row');
      row.appendChild(renderBranchCol('then', '✅ then（有墙）', cmd.then));
      row.appendChild(renderBranchCol('else', '❌ else（无墙）', cmd.else));
      be.appendChild(row);
    }
    var closeBtn = makeEl('button', 'btn btn-close-edit', '关闭');
    closeBtn.addEventListener('click', closeEditCtx);
    be.appendChild(closeBtn);
    be.style.display = 'block';
    renderSeq();
  }

  /* v1.7 循环块 body 编辑区（单栏） */
  function renderLoopBody(loopCmd) {
    var wrap = makeEl('div', 'block-edit-col');
    wrap.appendChild(makeEl('div', 'block-edit-label', '🔁 重复 ' + (loopCmd.rep || 2) + ' 次'));
    // 次数调参按钮
    var repRow = makeEl('div', 'block-edit-add');
    var repMinus = makeEl('button', 'cmd-add-sm', '− 次数');
    repMinus.addEventListener('click', function () {
      if (state.execLock) { return; }
      loopCmd.rep = Math.max(2, ((loopCmd.rep || 2) - 1));
      renderEditCtx();
    });
    repRow.appendChild(repMinus);
    var repPlus = makeEl('button', 'cmd-add-sm', '+ 次数');
    repPlus.addEventListener('click', function () {
      if (state.execLock) { return; }
      loopCmd.rep = Math.min(9, ((loopCmd.rep || 2) + 1));
      renderEditCtx();
    });
    repRow.appendChild(repPlus);
    wrap.appendChild(repRow);
    // body 指令 chips
    var chipsWrap = makeEl('div', 'block-edit-chips');
    chipsWrap.id = 'loop-body-chips';
    (loopCmd.body || []).forEach(function (bc, bi) {
      var isIf = bc.id === 'if';
      var isSteps = bc.id === 'steps';
      var isLoop = bc.id === 'loop';
      var lbl = bc.id === 'fwd' ? '↑' : (bc.id === 'left' ? '↰' : (bc.id === 'right' ? '↱' : (bc.id === 'block' ? '🧱' : (bc.id === 'steps' ? '➡走' + (bc.steps || 1) + '步' : (bc.id === 'loop' ? '🔁×' + (bc.rep || 2) : (bc.id === 'if' ? '❓if' : '?'))))));
      var repTxt = (!isIf && !isSteps && !isLoop && bc.rep && bc.rep > 1) ? ('×' + bc.rep) : '';
      var chip = makeEl('span', 'cmd-chip small' + (isIf ? ' if' : '') + (isLoop ? ' loopb' : ''), (bi + 1) + '.' + lbl + repTxt);
      chip.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (state.execLock) { return; }
        // v1.8：内层 loop chip 打开嵌套编辑区（同 if）
        if (isIf) { openNestedEditCtx(bc); }
        else if (isLoop) { openNestedEditCtx(bc); }
        else if (isSteps) {
          bc.steps = ((bc.steps || 1) % 9) + 1;
          renderEditCtx();
        }
        else {
          var next = ((bc.rep || 1) % 4) + 1;
          bc.rep = next;
          renderEditCtx();
        }
      });
      var x = makeEl('span', 'chip-x', '✕');
      x.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (state.execLock) { return; }
        if (isIf && !window.confirm('删除内层 if 分支块？')) { return; }
        if (isLoop && !window.confirm('删除内层循环块？')) { return; }
        loopCmd.body.splice(bi, 1);
        renderEditCtx();
      });
      chip.appendChild(x);
      chipsWrap.appendChild(chip);
    });
    wrap.appendChild(chipsWrap);
    // 添加按钮（v1.8：body 可嵌 loop，loopDepth 守卫 ≤2；if 分支内禁 loop 见 renderBranchCol）
    var addWrap = makeEl('div', 'block-edit-add');
    var addBtns = [CMD_FWD, CMD_L, CMD_R, CMD_BLOCK, CMD_STEPS, CMD_IF, CMD_LOOP];
    addBtns.forEach(function (a) {
      var btn = makeEl('button', 'cmd-add-sm', '+ ' + a.label);
      btn.addEventListener('click', function () {
        if (state.execLock) { return; }
        if (a.id === 'if') {
          if (ifDepth() >= 2) {
            var fb = document.getElementById('game-feedback');
            if (fb) { fb.textContent = '⚠ 分支嵌套最多 2 层'; fb.className = 'game-feedback miss'; }
            return;
          }
          loopCmd.body.push({ id: 'if', then: [], else: [] });
        } else if (a.id === 'steps') {
          loopCmd.body.push({ id: 'steps', steps: 1 });
        } else if (a.id === 'loop') {
          // v1.8 嵌套循环：loopDepth 守卫 ≤2（loop→loop→loop 第 3 层拦）
          if (loopDepth() >= 2) {
            var fb2 = document.getElementById('game-feedback');
            if (fb2) { fb2.textContent = '⚠ 循环嵌套最多 2 层'; fb2.className = 'game-feedback miss'; }
            return;
          }
          loopCmd.body.push({ id: 'loop', rep: 2, body: [] });
        } else {
          loopCmd.body.push({ id: a.id, rep: 1 });
        }
        renderEditCtx();
      });
      addWrap.appendChild(btn);
    });
    wrap.appendChild(addWrap);
    return wrap;
  }

  /* v1.8：编辑栈中 loop 类型帧数（嵌套循环深度，loop 帧计数；if 帧不计） */
  function loopDepth() {
    var n = 0;
    for (var i = 0; i < editStack.length; i++) {
      if (editStack[i].cmd && editStack[i].cmd.id === 'loop') { n += 1; }
    }
    return n;
  }

  function renderBranchCol(type, label, arr) {
    var col = makeEl('div', 'block-edit-col');
    col.appendChild(makeEl('div', 'block-edit-label', label));
    var chipsWrap = makeEl('div', 'block-edit-chips');
    chipsWrap.id = 'branch-chips-' + type;
    arr.forEach(function (bc, bi) {
      var isIf = bc.id === 'if';
      var isSteps = bc.id === 'steps';
      var lbl = bc.id === 'fwd' ? '↑' : (bc.id === 'left' ? '↰' : (bc.id === 'right' ? '↱' : (bc.id === 'block' ? '🧱' : (bc.id === 'steps' ? '➡走' + (bc.steps || 1) + '步' : '❓if'))));
      var repTxt = (!isIf && !isSteps && bc.rep && bc.rep > 1) ? ('×' + bc.rep) : '';
      var chip = makeEl('span', 'cmd-chip small' + (isIf ? ' if' : ''), (bi + 1) + '.' + lbl + repTxt);
      chip.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (state.execLock) { return; }
        if (isIf) { openNestedEditCtx(bc); }
        else if (isSteps) {
          bc.steps = ((bc.steps || 1) % 9) + 1;
          renderEditCtx();
        }
        else {
          var next = ((bc.rep || 1) % 4) + 1;
          bc.rep = next;
          renderEditCtx();
        }
      });
      var x = makeEl('span', 'chip-x', '✕');
      x.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (state.execLock) { return; }
        if (isIf && !window.confirm('删除内层 if 分支块？')) { return; }
        arr.splice(bi, 1);
        renderEditCtx();
      });
      chip.appendChild(x);
      chipsWrap.appendChild(chip);
    });
    col.appendChild(chipsWrap);
    var addWrap = makeEl('div', 'block-edit-add');
    var addBtns = [CMD_FWD, CMD_L, CMD_R, CMD_BLOCK, CMD_STEPS, CMD_IF];
    addBtns.forEach(function (a) {
      var btn = makeEl('button', 'cmd-add-sm', '+ ' + a.label);
      btn.addEventListener('click', function () {
        if (state.execLock) { return; }
        if (a.id === 'if') {
          if (ifDepth() >= 2) {
            var fb = document.getElementById('game-feedback');
            if (fb) { fb.textContent = '⚠ 分支嵌套最多 2 层'; fb.className = 'game-feedback miss'; }
            return;
          }
          arr.push({ id: 'if', then: [], else: [] });
        } else if (a.id === 'steps') {
          arr.push({ id: 'steps', steps: 1 });
        } else {
          arr.push({ id: a.id, rep: 1 });
        }
        renderEditCtx();
      });
      addWrap.appendChild(btn);
    });
    col.appendChild(addWrap);
    return col;
  }

  /* 失败定位：指令对象 → 顶层 chip 下标（分支指令回溯到父级 if 块） */
  function findCmdIndex(target) {
    if (!target) { return -1; }
    if (target._execTop !== undefined && target._execTop >= 0) { return target._execTop; }
    for (var i = 0; i < state.cmds.length; i++) {
      if (state.cmds[i] === target) { return i; }
      var c = state.cmds[i];
      if (c.id === 'if') {
        if (findInBranch(c.then, target) >= 0) { return i; }
        if (findInBranch(c.else, target) >= 0) { return i; }
      }
    }
    return -1;
  }
  function findInBranch(arr, target) {
    if (!arr) { return -1; }
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] === target) { return 0; }
    }
    return -1;
  }

  /* ---------- 执行器（v1.5 工作队列模型） ---------- */
  function execRun() {
    if (state.execDone || state.won || !state.cmds.length) { return; }
    // V1.4：执行锁定 + 调试追踪状态清零
    state.execLock = true;
    state.firstFail = null;
    state.absStep = 0;
    // 从初始盘面执行（重置到关卡初始）
    loadLevelState();
    // V1.5：构建工作队列（cmds 浅拷贝，指令对象共享引用）
    state.execQueue = state.cmds.slice();
    state.queueIdx = 0;
    state.curTop = -1;
    // 标记顶层指令来源（分支指令插入时继承父级 if 的顶层下标，供高亮/失败定位）
    for (var i = 0; i < state.cmds.length; i++) { state.cmds[i]._execTop = i; }
    // 递归重置循环计数（_loopLeft 残留清理，含 if 分支内指令）
    resetLoopLeft(state.cmds);
    var fb = document.getElementById('game-feedback');
    if (fb) { fb.textContent = '机器人执行中…'; fb.className = 'game-feedback'; }
    // 指令锁定灰显 + 高亮第 1 条
    setCmdLocked(true);
    renderSeq();
    renderSeqHighlight();
    execStep();
  }

  /* V1.5 if 条件分支：求值条件 → 选中分支指令插入队首 */
  function execIf(cmd) {
    var pr = state.player % state.w;
    var pc = Math.floor(state.player / state.w);
    var dx = DIRS[state.face][0], dy = DIRS[state.face][1];
    var nr = pr + dx, nc = pc + dy;
    // 条件：前方越界/墙/箱子 → 有障碍（与 v1.3 block 语义一致）
    var hasObstacle = (nr < 0 || nr >= state.w || nc < 0 || nc >= state.h ||
                       state.walls[nc * state.w + nr] || state.boxes[nc * state.w + nr]);
    var branch = hasObstacle ? (cmd.then || []) : (cmd.else || []);
    if (branch.length > 0) {
      // 分支指令插入队首（queueIdx 已指向下一条，插在此处即"接下来执行分支"）
      // 分支指令继承父级 if 的顶层下标（高亮/失败定位用）
      // F1 修复（oracle 审核）：无条件覆盖——防跨轮残留旧 _execTop（resetLoopLeft 不清 _execTop，
      // 若 execRun 后用户编辑指令改变 if 顶层索引，残留值会导致 findCmdIndex 定位错位）
      for (var i = 0; i < branch.length; i++) {
        branch[i]._execTop = cmd._execTop;
      }
      state.execQueue.splice.apply(state.execQueue,
        [state.queueIdx, 0].concat(branch));
    }
  }

  /* 递归重置执行期计数（_loopLeft + v1.6 _stepsLeft/_stepsMoved，含 if 分支/循环块 body），防二次执行残留 */
  function resetLoopLeft(cmds) {
    for (var i = 0; i < cmds.length; i++) {
      var c = cmds[i];
      c._loopLeft = undefined;
      c._stepsLeft = undefined;
      c._stepsMoved = undefined;
      if (c.id === 'if') {
        if (c.then && c.then.length) { resetLoopLeft(c.then); }
        if (c.else && c.else.length) { resetLoopLeft(c.else); }
      } else if (c.id === 'loop' && c.body) {
        resetLoopLeft(c.body);   // v1.7：递归 loop.body
      }
    }
  }

  /* v1.7 显式循环块：body 指令插入队首（轮数由 rep-on-cmd 处理，execLoop 不碰 _loopLeft） */
  function execLoop(cmd) {
    if (!cmd.body || !cmd.body.length) { return; }
    // B1 修复（oracle 审核）：轮间重置 body 执行期状态（共享引用反复入队会残留 _loopLeft/_stepsLeft，
    // 若不清除，第 2 轮起 body 内 rep>1 的 fwd 只走 1 次、steps 只走 1 格）
    resetLoopLeft(cmd.body);
    // body 指令继承父级 loop 的顶层下标（高亮/失败定位）
    // I-new 修复（oracle 复核）：无条件覆盖（与 execIf F1 一致）——防跨轮残留旧 _execTop
    for (var i = 0; i < cmd.body.length; i++) {
      cmd.body[i]._execTop = cmd._execTop;
    }
    state.execQueue.splice.apply(state.execQueue,
      [state.queueIdx, 0].concat(cmd.body));
  }

  /* v1.6 共享前进一格逻辑：fwd/steps/block 三指令共用，返回 {moved, reason} */
  function tryMoveFwd() {
    var pr = state.player % state.w, pc = Math.floor(state.player / state.w);
    var dx = DIRS[state.face][0], dy = DIRS[state.face][1];
    var nr = pr + dx, nc = pc + dy;
    if (nr < 0 || nr >= state.w || nc < 0 || nc >= state.h) { return { moved: false, reason: 'edge' }; }
    var nIdx = nc * state.w + nr;
    if (state.walls[nIdx]) { return { moved: false, reason: 'wall' }; }
    if (state.boxes[nIdx]) {
      var br = nr + dx, bc = nc + dy;
      if (br < 0 || br >= state.w || bc < 0 || bc >= state.h) { return { moved: false, reason: 'box' }; }
      var bIdx = bc * state.w + br;
      if (state.walls[bIdx] || state.boxes[bIdx]) { return { moved: false, reason: 'box' }; }
      delete state.boxes[nIdx]; state.boxes[bIdx] = true;
      state.player = nIdx;
      return { moved: true, reason: 'ok' };
    }
    state.player = nIdx;
    return { moved: true, reason: 'ok' };
  }

  function execStep() {
    if (state.queueIdx >= state.execQueue.length) {
      // 执行完：判定
      state.execDone = true;
      checkWin();
      return;
    }
    // V1.5：队列长度上限（防 if/循环无限展开）
    if (state.execQueue.length > state.MAX_QUEUE) {
      state.execDone = true;
      var fbO = document.getElementById('game-feedback');
      if (fbO) { fbO.textContent = '⚠ 指令展开超过 ' + state.MAX_QUEUE + ' 步，自动终止'; fbO.className = 'game-feedback miss'; }
      state.execLock = false;
      stopTimer();
      clearExecHighlight();
      return;
    }
    var cmd = state.execQueue[state.queueIdx];
    state.queueIdx += 1;
    // V1.4：展开步计数（每条指令每次展开执行 +1）
    state.absStep += 1;
    // 当前高亮：分支指令继承父级 if 的顶层下标
    state.curTop = (cmd._execTop !== undefined) ? cmd._execTop : -1;

    // rep-on-cmd（v1.4 模型保持）：rep>1 时重复执行，重新插入队首（steps 无 rep → 天然 no-op）
    if (cmd._loopLeft === undefined) { cmd._loopLeft = cmd.rep || 1; }
    if (cmd._loopLeft > 0) {
      cmd._loopLeft -= 1;
      if (cmd._loopLeft > 0) {
        state.execQueue.splice(state.queueIdx, 0, cmd);
      }
    }

    if (cmd.id === 'left') {
      state.face = (state.face + 3) % 4;
    } else if (cmd.id === 'right') {
      state.face = (state.face + 1) % 4;
    } else if (cmd.id === 'if') {
      // V1.5 条件分支：求值 → 选中分支指令插入队首（if 块自身不移动）
      execIf(cmd);
    } else if (cmd.id === 'loop') {
      // v1.7 显式循环块：轮数已由 rep-on-cmd 处理（loop.rep），此处只插入 body
      execLoop(cmd);
    } else if (cmd.id === 'steps') {
      // v1.6 参数化移动：逐格动画（工作队列复用，撞墙即停不记失败，除非第一步）
      if (cmd._stepsLeft === undefined) { cmd._stepsLeft = cmd.steps || 1; cmd._stepsMoved = 0; }
      var sr = tryMoveFwd();
      if (sr.moved) { cmd._stepsLeft--; cmd._stepsMoved++; }
      // 仅"移动成功且未走完"才重插入队首 → 逐格动画；撞墙不重插入（无死循环）
      if (sr.moved && cmd._stepsLeft > 0) {
        state.execQueue.splice(state.queueIdx, 0, cmd);
      }
      // 失败语义：第一步即撞墙 → 记失败；中途撞墙（_stepsMoved>0）→ 正常停止
      if (!sr.moved && cmd._stepsMoved === 0 && !state.firstFail) {
        state.firstFail = { absStep: state.absStep, cmd: cmd, reason: sr.reason };
      }
    } else {
      // fwd 用 tryMoveFwd（可推箱）；block 是"前方探测"——只在前方空地才前进（不推箱，前方有箱视为障碍）
      if (cmd.id === 'block') {
        var pr2 = state.player % state.w, pc2 = Math.floor(state.player / state.w);
        var dx2 = DIRS[state.face][0], dy2 = DIRS[state.face][1];
        var nr2 = pr2 + dx2, nc2 = pc2 + dy2;
        // v1.3 条件指令「前方探测」：若前方越界/墙/箱子（障碍）→ 条件成立不前进；否则前进（不推箱）
        if (nr2 >= 0 && nr2 < state.w && nc2 >= 0 && nc2 < state.h && !state.walls[nc2 * state.w + nr2] && !state.boxes[nc2 * state.w + nr2]) {
          state.player = nc2 * state.w + nr2;
        }
        // block 不记 firstFail（前方有障碍是条件成立，非错误）
      } else {
        var r = tryMoveFwd();
        // v1.4 失败定位：fwd 试图移动但未动 → 记首个失败
        if (!r.moved && !state.firstFail && cmd.id === 'fwd') {
          state.firstFail = { absStep: state.absStep, cmd: cmd, reason: r.reason };
        }
      }
    }
    renderBoardOnly();
    renderSeqHighlight();
    setTimeout(function () { execStep(); }, 260);
  }

  function checkWin() {
    state.won = isWon(state.boxes, state.goals);
    var fb = document.getElementById('game-feedback');
    var nextBtn = document.getElementById('next-btn');
    // V1.4：执行结束解锁 + 清除高亮（err 定位保留供查看）
    state.execLock = false;
    clearExecHighlight();
    if (state.won) {
      if (fb) { fb.textContent = '✓ 完成！箱子都到目标点了！'; fb.className = 'game-feedback ok'; }
      if (nextBtn) { nextBtn.style.display = 'inline-block'; }
      finishLevel();
    } else {
      // V1.4 差箱统计 + 失败定位（调试器断点语义）
      var left = 0;
      for (var k in state.boxes) {
        if (Object.prototype.hasOwnProperty.call(state.boxes, k) && !state.goals[k]) { left += 1; }
      }
      var msg;
      if (state.firstFail) {
        var reasonTxt = state.firstFail.reason === 'wall' ? '前面是墙' : (state.firstFail.reason === 'edge' ? '要走出迷宫啦' : '前面的箱子推不动');
        // V1.5：指令对象引用 → 顶层 chip 下标（分支内失败回溯到父级 if 块）
        var errIdx = findCmdIndex(state.firstFail.cmd);
        if (errIdx < 0) { errIdx = 0; }
        msg = '✗ 第 ' + (errIdx + 1) + ' 条指令 ⬆ 卡住了：' + reasonTxt + '（还差 ' + left + ' 个箱子）';
        markErrCmd(errIdx);
      } else {
        msg = '✗ 还差 ' + left + ' 个箱子到目标点，调整指令再试（点 ⟲ 重置）';
      }
      if (fb) { fb.textContent = msg; fb.className = 'game-feedback miss'; }
    }
  }

  /* ---------- V1.4 调试反馈：执行高亮 / 失败定位 / 锁定 ---------- */
  // 执行中高亮：只改 classList 不重建 seq-box（事件不丢）
  function renderSeqHighlight() {
    var box = document.getElementById('seq-box');
    if (!box) { return; }
    var chips = box.querySelectorAll('.cmd-chip');
    for (var i = 0; i < chips.length; i++) {
      if (state.execLock && i === state.curTop) { chips[i].classList.add('exec'); }
      else { chips[i].classList.remove('exec'); }
    }
  }
  function clearExecHighlight() {
    var box = document.getElementById('seq-box');
    if (!box) { return; }
    var chips = box.querySelectorAll('.cmd-chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.remove('exec');
    }
  }
  // 失败定位：目标指令 chip 红框 + 前置 ❗
  function markErrCmd(prog) {
    var box = document.getElementById('seq-box');
    if (!box) { return; }
    var chips = box.querySelectorAll('.cmd-chip');
    for (var i = 0; i < chips.length; i++) {
      if (i === prog) {
        chips[i].classList.add('err');
        if (chips[i].textContent.charAt(0) !== '❗') {
          chips[i].textContent = '❗' + chips[i].textContent;
        }
      } else { chips[i].classList.remove('err'); }
    }
  }
  // 执行锁定：指令按钮/序列灰显不可点（含 v1.5 editCtx 控件）
  function setCmdLocked(locked) {
    var bars = document.querySelectorAll('.cmd-add, .seq-clear, .cmd-chip, .cmd-add-sm, .btn-close-edit');
    for (var i = 0; i < bars.length; i++) {
      if (locked) { bars[i].setAttribute('disabled', 'disabled'); }
      else { bars[i].removeAttribute('disabled'); }
    }
  }

  /* 编写量（v1.5：if 块计 1 条 + 分支内指令数；普通指令按 rep 展开步数）——星级基准 */
  function totalSteps(cmds) {
    var n = 0;
    cmds.forEach(function (c) {
      if (c.id === 'if') {
        n += 1;
        // v1.7 递归口径（body 内 if/loop 同口径）；v1.5 旧关 then/else 无嵌套时与 length 等价
        n += (c.then ? totalSteps(c.then) : 0) + (c.else ? totalSteps(c.else) : 0);
      } else if (c.id === 'loop') {
        n += 1 + (c.body ? totalSteps(c.body) : 0);   // 循环块计 1 + body 递归（不乘 rep）
      } else {
        n += (c.rep || 1);
      }
    });
    return n;
  }

  function finishLevel() {
    // 星级：实际执行步数（循环展开）vs 最少推动数
    var steps = totalSteps(state.cmds);
    var stars = 1;
    if (state.level === 'custom') {
      // v1.9 custom 分支：不写 store.best/recent（避免污染 DEFAULT_STORE）；b=null 兜底 2★；标记 solved
      stars = 2;
      markCustomSolved(state.customIdx);
      var recC = { date: todayStr(), level: 'custom', stars: stars, cmds: steps, levelIdx: -1, customName: customLevels[state.customIdx] ? customLevels[state.customIdx].name : '' };
      store.history.push(recC);
      store.history = store.history.slice(-100);
      saveStore();
      var fbC = document.getElementById('game-feedback');
      if (fbC) { fbC.textContent += '（' + stars + '★，指令 ' + steps + ' 步）'; }
      return;
    }
    var best = bestPushes(state.levelIdx);
    if (best !== null) {
      if (steps <= best * 1.5) { stars = 3; }
      else if (steps <= best * 2.5) { stars = 2; }
    } else {
      stars = 2;
    }
    var lv = state.level;
    var rec = { date: todayStr(), level: lv, stars: stars, cmds: steps, levelIdx: state.levelIdx };
    var prev = store.best[lv];
    if (!prev || stars > prev.stars || (stars === prev.stars && state.levelIdx > prev.levelIdx)) {
      store.best[lv] = { stars: stars, cmds: steps, level: state.levelIdx + 1 };
    }
    store.recent[lv] = stars;
    store.history.push(rec);
    store.history = store.history.slice(-100);
    saveStore();
    var fb = document.getElementById('game-feedback');
    if (fb) { fb.textContent += '（' + stars + '★，指令 ' + steps + ' 步）'; }
  }

  function nextLevel() {
    // V1.4：状态复位（防残留锁）
    state.firstFail = null; state.absStep = 0; state.execLock = false;
    if (editStack.length) { closeEditCtx(); }
    if (state.level === 'custom') {   // v1.9：自建关卡无下一关 → 直接结算
      state.finished = true;
      stopTimer();
      renderResult();
      return;
    }
    var maxIdx = LEVELS_CFG[state.level].to - 1;
    if (state.levelIdx < maxIdx) {
      state.levelIdx += 1;
      state.cmds = [];
      loadLevelState();
      renderGame();
    } else {
      // 本难度全部完成
      state.finished = true;
      stopTimer();
      renderResult();
    }
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

  function renderResult() {
    renderHeader();
    clearNode(viewEl);
    var wrap = makeEl('div', 'result-wrap');
    wrap.appendChild(makeEl('h2', 'result-title', '🎉 完成练习！'));
    // v1.9：custom 模式显示自建关卡名
    var subLabel = state.level === 'custom' ? (customLevels[state.customIdx] ? customLevels[state.customIdx].name : '自建关卡') : LEVELS_CFG[state.level].label;
    wrap.appendChild(makeEl('div', 'result-sub', subLabel + ' 全部关卡完成'));
    var best = store.best[state.level];
    if (best) {
      wrap.appendChild(makeEl('div', 'result-best', '最佳 ' + best.stars + '★ · 第 ' + best.level + ' 关'));
    }
    var today = todayStr();
    var checkinBtn = makeEl('button', 'btn btn-checkin', store.checkin.dates.indexOf(today) >= 0 ? '✅ 今日已打卡' : '📅 今日打卡');
    checkinBtn.addEventListener('click', function () { doCheckin(checkinBtn); });
    wrap.appendChild(checkinBtn);
    var again = makeEl('button', 'btn btn-primary', '再练一次');
    again.addEventListener('click', function () { if (state.level === 'custom') { startCustom(state.customIdx); } else { startGame(state.level); } });
    wrap.appendChild(again);
    var home = makeEl('button', 'btn', state.level === 'custom' ? '返回关卡库' : '返回首页');
    home.addEventListener('click', function () { if (state.level === 'custom') { viewCustomList(); } else { viewHome(); } });
    wrap.appendChild(home);
    viewEl.appendChild(wrap);
    renderFooter('');
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
  M.renderGame = renderGame;
  M.loadLevelState = loadLevelState;
  M.nextLevel = nextLevel;
  M.viewCustomList = viewCustomList;
  M.openEditor = openEditor;
  M.startCustom = startCustom;
  M.isLevelSolvable = isLevelSolvable;
  M.paintCell = paintCell;
  M.doCheckSolvable = doCheckSolvable;
  M.doSaveCustom = doSaveCustom;
  M.cellsToG = cellsToG;
  M.customLevels = customLevels;
  // v1.9：重载 customLevels（storage → 内存变量；供测试/调试/外部变更后刷新）
  M.reloadCustomLevels = function () {
    customLevels = loadCustomLevels();
    return customLevels;
  };
  window.M = M;
})();
