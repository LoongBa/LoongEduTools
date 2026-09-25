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

  /* ---------- v1.10 自定义指令块库（抽象/函数概念） ---------- */
  // 存储：storage.set('customBlocks') → localStorage 'redtools.jiqirenzoumi.customBlocks'（无 .v1. 段）
  // value: [{ id, name(≤6字，唯一), body: [基础指令数组], createdAt }]
  var MAX_BLOCKS = 8;         // 块数量上限
  var MAX_BODY = 8;           // 块 body 指令上限（防整关塞一块 + 抽象粒度）
  function loadCustomBlocks() {
    var arr = LX_SHARED.storage.get('customBlocks');
    return (arr && Array.isArray(arr)) ? arr : [];
  }
  function saveCustomBlocks(arr) {
    LX_SHARED.storage.set('customBlocks', arr);
  }
  function getCustomBlock(id) {
    for (var i = 0; i < customBlocks.length; i++) {
      if (customBlocks[i].id === id) { return customBlocks[i]; }
    }
    return null;
  }
  // v1.11 块参数：hasParam 派生（B2 Oracle 修订）——body 含参数化 steps（steps:null）即带参数
  function blockHasParam(id) {
    return blockParamCount(id) > 0;   // v1.13：协议镜像（含槽位参数化）
  }
  // v1.14 B1（Oracle 修订）：参数扫描递归 helper——顶层 body + loop.body 递归扫描参数化 steps
  // （loop.body 内 steps:null 未计入派生 → blockHasParam=false → 共享引用 → 参数化不解析崩溃）
  // 异常 if/loop 嵌套数据防御性递归（scanParams 与 cloneBlockBody 深度对齐，防"扫到但拷不到"）
  function scanParamSteps(arr, counter) {
    for (var si = 0; si < arr.length; si++) {
      var sc = arr[si];
      if (sc.id === 'steps' && sc.steps === null) {
        counter.hasNull = true;
        var sidx = sc.paramIdx || 0;
        if (sidx > counter.maxIdx) { counter.maxIdx = sidx; }
      } else if (sc.id === 'loop' && sc.body && sc.body.length) { scanParamSteps(sc.body, counter); }
      else if (sc.id === 'if') {
        if (sc.then && sc.then.length) { scanParamSteps(sc.then, counter); }
        if (sc.else && sc.else.length) { scanParamSteps(sc.else, counter); }
      }
    }
  }
  // v1.13 混合态/多参数：参数数量派生（不存字段，v1.14 递归 loop.body——B1 Oracle 修订）
  // I3：存量 steps:null 无 paramIdx → 视为槽#0（undefined || 0）；hasNull 判定防畸形 paramIdx 空计数
  // I4：clamp 到 2——异常 paramIdx>1 防御（执行 fallback 槽#0 兜底，不崩）
  function blockParamCount(id) {
    var def = getCustomBlock(id);
    if (!def || !def.body) { return 0; }
    var counter = { maxIdx: 0, hasNull: false };
    scanParamSteps(def.body, counter);
    if (!counter.hasNull) { return 0; }
    return Math.min(counter.maxIdx + 1, 2);
  }
  // v1.14：块体含 loop 判定（顶层扫 loop——v1.16 若 loop 仅嵌在 if 分支内则返回 false（N10 已知限制）；
  //   仅文档/教学用，非执行判定）
  function blockHasLoop(id) {
    var def = getCustomBlock(id);
    if (!def || !def.body) { return false; }
    for (var i = 0; i < def.body.length; i++) {
      if (def.body[i].id === 'loop') { return true; }
    }
    return false;
  }
  // v1.14 B3（Oracle 修订）：块 body 深拷贝统一递归（顶层 body / loop.body / v1.15 if 分支同用）——
  // 逐字段复制 id/rep/steps/paramIdx + loop.body 递归；不做特殊区分（防编辑态污染块库）
  // v1.13 B1：顶层补 paramIdx 防编辑即销毁槽位；v1.14 递归 loop.body（含 loop.body 内指令 paramIdx）
  // v1.15 B3（Oracle）：paramCmd 统一入口——执行副本传 call cmd（resolveStep 参数注入），编辑器深拷贝传 null（不注入）；
  //   if.then/else 递归（条件×参数：分支内 steps:null → resolveStep）
  function cloneBlockBody(arr, paramCmd) {
    return (arr || []).map(function (c) {
      var nc = { id: c.id };
      if (c.rep !== undefined) { nc.rep = c.rep; }
      if (c.id === 'steps') {
        // v1.15：统一入口——paramCmd 有则 resolveStep（参数注入），编辑器深拷贝保持占位；steps 缺失兜底 1（防异常数据）
        nc.steps = (c.steps !== undefined) ? (paramCmd ? resolveStep(paramCmd, c) : c.steps) : 1;
      } else if (c.steps !== undefined) { nc.steps = c.steps; }
      if (c.paramIdx !== undefined) { nc.paramIdx = c.paramIdx; }
      if (c.id === 'loop') { nc.body = cloneBlockBody(c.body, paramCmd); }   // B3：递归 loop.body
      if (c.id === 'if') { nc.then = cloneBlockBody(c.then, paramCmd); nc.else = cloneBlockBody(c.else, paramCmd); }   // v1.15：if 分支递归（B3 统一入口）
      return nc;
    });
  }
  // 名称唯一校验：editingId 传 null（新建）或自身 id（编辑时排除自身）
  function blockNameTaken(name, editingId) {
    for (var i = 0; i < customBlocks.length; i++) {
      if (customBlocks[i].name === name && customBlocks[i].id !== editingId) { return true; }
    }
    return false;
  }
  function addCustomBlock(name, body) {
    if (customBlocks.length >= MAX_BLOCKS) { return null; }
    var item = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 5),
      name: name,
      body: body,
      createdAt: Date.now()
    };
    customBlocks.push(item);
    saveCustomBlocks(customBlocks);
    return item.id;
  }
  function updateCustomBlock(id, name, body) {
    var def = getCustomBlock(id);
    if (def) { def.name = name; def.body = body; saveCustomBlocks(customBlocks); }
  }
  function removeCustomBlock(id) {
    customBlocks = customBlocks.filter(function (c) { return c.id !== id; });
    saveCustomBlocks(customBlocks);
  }
  var customBlocks = loadCustomBlocks();

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
  var CMD_CALL = { id: 'call', label: '🧩块' };        // v1.10 自定义指令块引用：执行时展开为块的 body（抽象/函数）
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

  /* ---------- v1.10 自定义指令块：块库视图 ---------- */
  // 块编辑态：editBlockId(=null 新建)/editBlockName/editBlockBody（指令对象数组）
  // editBlockReturn：编辑完成后返回目标视图（'game'=从游戏 call chip 进入 → 回 renderGame；'list'=从块库进入 → 回 viewBlockList）
  var editBlockId = null;
  var editBlockName = '';
  var editBlockBody = [];
  var editBlockReturn = 'list';
  // v1.11 N-3 修复（B1）：块库来源记忆——'game'=从游戏选择面板进入（返回游戏）/ 'home'=首页卡片进入（返回首页）
  var blockListReturn = 'home';

  function viewBlockList() {
    stopTimer();
    renderHeader();
    clearNode(viewEl);
    var wrap = makeEl('div', 'custom-wrap');
    wrap.appendChild(makeEl('h2', 'custom-title', '🧩 我的块'));
    if (!customBlocks.length) {
      wrap.appendChild(makeEl('p', 'custom-empty', '还没有自定义块，把重复动作打包成一个块吧！'));
    }
    customBlocks.forEach(function (b) {
      var row = makeEl('div', 'custom-row');
      var info = makeEl('div', 'custom-info');
      info.appendChild(makeEl('div', 'custom-name', '🧩 ' + b.name));
      info.appendChild(makeEl('div', 'custom-meta', '指令 ' + b.body.length + ' 条 · ' + fmtDate(b.createdAt)));
      row.appendChild(info);
      var btns = makeEl('div', 'custom-btns');
      var editBtn = makeEl('button', 'btn btn-sm', '✏ 编辑');
      editBtn.addEventListener('click', function () { viewBlockEdit(b.id); });
      btns.appendChild(editBtn);
      var delBtn = makeEl('button', 'btn btn-sm btn-danger', '🗑');
      delBtn.addEventListener('click', function () {
        if (window.confirm('删除块「' + b.name + '」？使用它的指令会变灰。')) {
          removeCustomBlock(b.id);
          viewBlockList();
        }
      });
      btns.appendChild(delBtn);
      row.appendChild(btns);
      wrap.appendChild(row);
    });
    var newBtn = makeEl('button', 'btn btn-primary', '+ 新建块');
    newBtn.addEventListener('click', function () { viewBlockEdit(null); });
    wrap.appendChild(newBtn);
    if (customBlocks.length >= MAX_BLOCKS) {
      wrap.appendChild(makeEl('p', 'custom-limit', '⚠ 已达上限 8 个块，删除后可再新建'));
    }
    // v1.11 N-3 修复（B1）：按来源显示返回按钮——'game' → 返回游戏（renderGame + 计时衔接）
    var back;
    if (blockListReturn === 'game') {
      back = makeEl('button', 'btn', '‹ 返回游戏');
      back.addEventListener('click', function () {
        blockListReturn = 'home';
        renderGame();
        renderSeq();   // v1.11：renderGame 不重建序列 chips——补渲染
        if (!state.finished) { state.startMs = Date.now() - state.elapsed; startTimer(); }
      });
    } else {
      back = makeEl('button', 'btn', '‹ 返回首页');
      back.addEventListener('click', function () { viewHome(); });
    }
    wrap.appendChild(back);
    viewEl.appendChild(wrap);
    renderFooter('');
  }

  /* ---------- v1.10 块编辑器视图 ---------- */
  // body 指令：fwd/left/right/block/steps（含 rep/steps 参数）；不含 if/loop/call（决策 B）
  var BLOCK_BODY_CMDS = [CMD_FWD, CMD_L, CMD_R, CMD_BLOCK, CMD_STEPS, CMD_LOOP, CMD_IF];   // v1.15：+❓if（条件抽象渐进——块体含 if）
  // v1.14 I2（Oracle）：loop.body 添加行指令集 = 基础指令不含 loop/if/call（单层约束——入口隔离，防止创建嵌套）
  var BLOCK_BODY_LOOP_CMDS = [CMD_FWD, CMD_L, CMD_R, CMD_BLOCK, CMD_STEPS];
  // v1.16：if 分支（then/else）添加行指令集 = 基础 + 参数化 steps + loop（不含 if/call——分支不嵌 if，
  // 防 if 嵌套 + 防递归；分支内 loop.body 仍按 BLOCK_BODY_LOOP_CMDS 单层）——块内控制流嵌套（条件×循环）
  var BLOCK_BODY_BRANCH_CMDS = [CMD_FWD, CMD_L, CMD_R, CMD_BLOCK, CMD_STEPS, CMD_LOOP];
  // v1.11：编辑态参数开关（toggle 状态从 body 派生，B2）
  var editBlockHasParam = false;
  // v1.14：块内 loop 编辑态目标（非 null = 正在编辑该 loop 的 body；null = 块体编辑态）
  var editBlockLoopTarget = null;
  // v1.15：块内 if 编辑态目标（非 null = 正在编辑该 if 的 then/else 双栏；null = 块体编辑态）
  // B1（Oracle）：双状态互斥（保留 editBlockLoopTarget 零改动 + 新增 editBlockIfTarget）——进入一方清空另一方
  var editBlockIfTarget = null;
  // v1.16：块内 loop 编辑态来源（null=从块体顶层进入；ifCmd 对象=从 if 分支进入）
  // B1/B2（Oracle 修订）：返回/删除时据此恢复 if 编辑态（双栏），否则回块体顶层
  var editBlockLoopFrom = null;
  // v1.13 I-new-3：长按触发后 click 抑制标志（函数级作用域——跨 chip 重建存活）
  // 长按触发固定⇌参数切换后 500ms 内的 click 是长按的收尾（不落在新 chip 上），抑制防槽位/数值二次切换
  var suppressChipClickUntil = 0;

  function viewBlockEdit(id) {
    stopTimer();
    renderHeader();
    clearNode(viewEl);
    editBlockId = id || null;
    editBlockName = '';
    editBlockBody = [];
    editBlockReturn = 'list';   // 默认返回块库（viewBlockList 进入）
    editBlockLoopTarget = null;   // v1.14：进块编辑器重置 loop 编辑态
    editBlockIfTarget = null;     // v1.15：进块编辑器重置 if 编辑态（双状态互斥——v1.14 loop 零改动）
    editBlockLoopFrom = null;     // v1.16：进块编辑器重置 loop 来源（防跨操作残留，I2 Oracle）
    if (id) {
      var def = getCustomBlock(id);
      if (def) {
        editBlockName = def.name;
        // 深拷贝（map 复制指令对象——slice 仅浅拷贝数组，指令对象与块库共享引用：
        // 编辑步骤 cycleRep/cycleSteps 改 rep/steps 会污染块库原对象，即使取消保存也被改）
        // v1.13 B1：补 paramIdx；v1.14 B3（Oracle）：cloneBlockBody 统一递归（顶层 + loop.body 逐字段复制）
        editBlockBody = cloneBlockBody(def.body);
        editBlockHasParam = blockHasParam(id);   // v1.11：编辑态参数开关从 body 派生（B2）
      }
    } else { editBlockHasParam = false; }
    // I-4 修订：块编辑器为独立视图（clearNode 全屏替换），主视图控件已被销毁天然隔离，
    // 无需 setCmdLocked——若锁会误禁块编辑器自身添加按钮（.cmd-add 同选择器）
    renderBlockEdit();
  }
  // v1.10：从游戏 call chip 点击进入块编辑（I-3）——编辑完成后返回游戏视图
  function viewBlockEditFromGame(bid) {
    viewBlockEdit(bid);
    editBlockReturn = 'game';
  }

  function renderBlockEdit() {
    clearNode(viewEl);
    var wrap = makeEl('div', 'editor-wrap');
    // v1.14：块内 loop 编辑态（editBlockLoopTarget 非 null）——渲染 loop.body 编辑（复用块编辑器骨架）
    if (editBlockLoopTarget) {
      var lp = editBlockLoopTarget;
      wrap.appendChild(makeEl('h2', 'editor-title', '🔁 循环（块内）'));
      // 次数调参（对齐主序列 loop 2-9）
      var repRow = makeEl('div', 'block-edit-param');
      var repMinus = makeEl('button', 'cmd-add block-param-toggle', '− 次数');
      repMinus.addEventListener('click', function () {
        lp.rep = Math.max(2, ((lp.rep || 2) - 1));
        renderBlockEdit();
      });
      repRow.appendChild(repMinus);
      repRow.appendChild(makeEl('div', 'block-edit-param-hint', '重复 ' + (lp.rep || 2) + ' 次'));
      var repPlus = makeEl('button', 'cmd-add block-param-toggle', '+ 次数');
      repPlus.addEventListener('click', function () {
        lp.rep = Math.min(9, ((lp.rep || 2) + 1));
        renderBlockEdit();
      });
      repRow.appendChild(repPlus);
      wrap.appendChild(repRow);
      // loop.body 指令 chips（复用 renderBlockBodyChip，目标数组 = lp.body）
      var loopBox = makeEl('div', 'seq-box active');
      loopBox.id = 'block-loop-body-box';
      if (!lp.body || !lp.body.length) { loopBox.textContent = '（循环里还没有指令——先加几条）'; }
      else {
        lp.body.forEach(function (bc, bi) {
          loopBox.appendChild(renderBlockBodyChip(bc, bi, lp.body));
        });
      }
      wrap.appendChild(loopBox);
      // 添加按钮（I2：仅基础指令——loop.body 不嵌 loop/if/call，单层约束入口隔离）
      var addRow = makeEl('div', 'cmd-bar');
      BLOCK_BODY_LOOP_CMDS.forEach(function (bc) {
        var btn = makeEl('button', 'cmd-add', bc.label);
        btn.addEventListener('click', function () {
          if ((lp.body || []).length >= MAX_BODY) {
            var fbx = document.getElementById('block-edit-feedback');
            if (fbx) { fbx.textContent = '⚠ 循环里最多 ' + MAX_BODY + ' 条指令'; fbx.className = 'editor-feedback miss'; }
            return;
          }
          addBlockBodyCmd(bc.id, lp.body);
        });
        addRow.appendChild(btn);
      });
      wrap.appendChild(addRow);
      // 操作按钮（返回块体 / 删除此循环）
      var actions = makeEl('div', 'editor-actions');
      var backBtn = makeEl('button', 'btn', '‹ 返回块体');
      backBtn.addEventListener('click', function () {
        // v1.16 B1（Oracle 修订）：始终清 loopTarget（原方案漏清会使 renderBlockEdit L587 先查 loopTarget 非空→再进 loop 编辑态，核心功能失效）；
        // from 非 null → 恢复 if 编辑态（双栏重渲染，loop 编辑的对象仍在分支数组内位置保留）；from null → 原 v1.14 行为回块体
        editBlockLoopTarget = null;
        if (editBlockLoopFrom) { editBlockIfTarget = editBlockLoopFrom; editBlockLoopFrom = null; }
        renderBlockEdit();
      });
      actions.appendChild(backBtn);
      var delBtn = makeEl('button', 'btn', '✕ 删除此循环');
      delBtn.addEventListener('click', function () {
        // v1.16 B2（Oracle 修订）：完整 6 步——
        // ① 双路径定位：先扫 editBlockLoopFrom 的 then/else（by 引用 ===；注意用 from 非 editBlockIfTarget——进入 loop 编辑态已互斥清空，null.then 会 TypeError），
        //    未命中回退 editBlockBody 顶层扫描（顶层 loop 原 v1.14 路径）
        var removed = false;
        if (editBlockLoopFrom) {
          var ifCmdFrom = editBlockLoopFrom;
          for (var di = 0; di < (ifCmdFrom.then || []).length; di++) {
            if (ifCmdFrom.then[di] === lp) { ifCmdFrom.then.splice(di, 1); removed = true; break; }
          }
          if (!removed) {
            for (var di2 = 0; di2 < (ifCmdFrom.else || []).length; di2++) {
              if (ifCmdFrom.else[di2] === lp) { ifCmdFrom.else.splice(di2, 1); removed = true; break; }
            }
          }
        }
        if (!removed) {
          for (var di3 = 0; di3 < editBlockBody.length; di3++) {
            if (editBlockBody[di3] === lp) { editBlockBody.splice(di3, 1); break; }
          }
        }
        // ② 清 loop 编辑态 + ③④ 恢复 if 编辑态（from 非 null）+ 清 from + ⑤ 参数派生刷新 + ⑥ 重渲染
        editBlockLoopTarget = null;
        if (editBlockLoopFrom) { editBlockIfTarget = editBlockLoopFrom; editBlockLoopFrom = null; }
        editBlockHasParam = hasEditBodyParam();
        renderBlockEdit();
      });
      actions.appendChild(delBtn);
      wrap.appendChild(actions);
      var feedback = makeEl('div', 'editor-feedback', '');
      feedback.id = 'block-edit-feedback';
      wrap.appendChild(feedback);
      viewEl.appendChild(wrap);
      renderFooter('');
      return;
    }
    // v1.15：块内 if 编辑态（editBlockIfTarget 非 null）——渲染 then/else 双栏（B1 双状态：loop 分支零改动）
    if (editBlockIfTarget) {
      var ifCmd = editBlockIfTarget;
      wrap.appendChild(makeEl('h2', 'editor-title', '❓ if前方有墙 — 分支编辑'));
      var row = makeEl('div', 'block-edit-row');
      row.appendChild(renderBlockBranchInBlock('then', '✅ then（有墙）', ifCmd.then));
      row.appendChild(renderBlockBranchInBlock('else', '❌ else（无墙）', ifCmd.else));
      wrap.appendChild(row);
      // 操作按钮（返回块体 / 删除此 if）
      var actionsIf = makeEl('div', 'editor-actions');
      var backBtnIf = makeEl('button', 'btn', '‹ 返回块体');
      backBtnIf.addEventListener('click', function () {
        editBlockIfTarget = null;
        renderBlockEdit();
      });
      actionsIf.appendChild(backBtnIf);
      var delBtnIf = makeEl('button', 'btn', '✕ 删除此分支');
      delBtnIf.addEventListener('click', function () {
        for (var diIf = 0; diIf < editBlockBody.length; diIf++) {
          if (editBlockBody[diIf] === ifCmd) { editBlockBody.splice(diIf, 1); break; }
        }
        editBlockIfTarget = null;
        editBlockHasParam = hasEditBodyParam();
        renderBlockEdit();
      });
      actionsIf.appendChild(delBtnIf);
      wrap.appendChild(actionsIf);
      var feedbackIf = makeEl('div', 'editor-feedback', '');
      feedbackIf.id = 'block-edit-feedback';
      wrap.appendChild(feedbackIf);
      viewEl.appendChild(wrap);
      renderFooter('');
      return;
    }
    wrap.appendChild(makeEl('h2', 'editor-title', editBlockId ? '🧩 编辑块' : '🧩 新建块'));
    // 名称输入
    var nameRow = makeEl('div', 'editor-name-row');
    nameRow.appendChild(makeEl('label', 'editor-name-label', '名字：'));
    var nameInput = makeEl('input', 'editor-name-input');
    nameInput.type = 'text';
    nameInput.maxLength = 6;
    nameInput.value = editBlockName || ('我的块 ' + (customBlocks.length + 1));
    nameInput.addEventListener('input', function () { editBlockName = nameInput.value; });
    nameRow.appendChild(nameInput);
    wrap.appendChild(nameRow);
    // v1.11：参数 toggle（带参数：走 N 步）——开 → body 第一条 steps 变 steps:null（参数化）
    var paramRow = makeEl('div', 'block-edit-param');
    var paramToggle = makeEl('button', 'cmd-add block-param-toggle' + (editBlockHasParam ? ' active' : ''), '🔢 带参数：走 N 步');
    paramToggle.addEventListener('click', function () {
      var errMsg = toggleBlockHasParam();
      renderBlockEdit();
      // 提示需在重建后设置（toggle 内旧元素会被 renderBlockEdit 清掉）
      if (errMsg) {
        var fbT = document.getElementById('block-edit-feedback');
        if (fbT) { fbT.textContent = errMsg; fbT.className = 'editor-feedback miss'; }
      }
    });
    paramRow.appendChild(paramToggle);
    if (editBlockHasParam) {
      paramRow.appendChild(makeEl('div', 'block-edit-param-hint', '块里的「➡?₁步」「➡?₂步」各自独立，由调用时传入（1-9）；长按一条可固定或变参数'));
    }
    wrap.appendChild(paramRow);
    // body 指令 chips（单栏）
    var bodyBox = makeEl('div', 'seq-box active');
    bodyBox.id = 'block-body-box';
    if (!editBlockBody.length) { bodyBox.textContent = '（空——先加几条指令）'; }
    else {
      editBlockBody.forEach(function (cmd, i) {
        var bc = renderBlockBodyChip(cmd, i);
        bodyBox.appendChild(bc);
      });
    }
    wrap.appendChild(bodyBox);
    // 添加按钮（仅基础指令）
    var addRow = makeEl('div', 'cmd-bar');
    BLOCK_BODY_CMDS.forEach(function (cmd) {
      var btn = makeEl('button', 'cmd-add', cmd.label);
      btn.addEventListener('click', function () {
        if (editBlockBody.length >= MAX_BODY) {
          var fbx = document.getElementById('block-edit-feedback');
          if (fbx) { fbx.textContent = '⚠ 一个块最多 ' + MAX_BODY + ' 条指令'; fbx.className = 'editor-feedback miss'; }
          return;
        }
        addBlockBodyCmd(cmd.id);
      });
      addRow.appendChild(btn);
    });
    wrap.appendChild(addRow);
    // 操作按钮
    var actions = makeEl('div', 'editor-actions');
    var saveBtn = makeEl('button', 'btn btn-primary', '💾 保存');
    saveBtn.addEventListener('click', function () { doSaveBlock(); });
    actions.appendChild(saveBtn);
    var clearBtn = makeEl('button', 'btn', '↺ 清空');
    clearBtn.addEventListener('click', function () {
      if (window.confirm('清空这个块的所有指令？')) {
        editBlockBody = [];
        renderBlockEdit();
      }
    });
    actions.appendChild(clearBtn);
    var cancelBtn = makeEl('button', 'btn', '‹ 取消');
    cancelBtn.addEventListener('click', function () { exitBlockEdit(); });
    actions.appendChild(cancelBtn);
    wrap.appendChild(actions);
    var feedback = makeEl('div', 'editor-feedback', '');
    feedback.id = 'block-edit-feedback';
    wrap.appendChild(feedback);
    viewEl.appendChild(wrap);
    renderFooter('');
  }

  /* 块 body chip 渲染（复用 renderSeq chip 交互：fwd 等 cycleRep、steps cycleSteps、✕ 删除）
     v1.13 混合态/多参数扩展：
     - 参数化 steps 显示 ➡?₁步（槽#0）/ ➡?₂步（槽#1），下标区分独立参数
     - 单击参数化 steps = 切换槽位（?₁⇌?₂）；单击固定 steps = cycleSteps 数值（v1.12 不变）
     - 长按（≥350ms）或 shift+单击 = 固定 ⇌ 参数 双向切换（混合态创建入口，I1 弃 dblclick）
     - I-new-1：✕ 删除按钮 pointerdown 过滤（防长按误触发）
     - I-new-2：pointercancel 取消长按定时器（移动端 OS 中断）
     - I-new-3：长按触发后 click 抑制（suppressChipClickUntil 函数级标志）
     v1.14 扩展：
     - loop chip 显示 N.🔁×M（.loopb 灰底，对齐主序列 loop 视觉）；单击 → 进入块内 loop 编辑态
     - arr 参数化：目标指令数组（块体 editBlockBody / loop 编辑态 loop.body 复用）——✕ 删除作用于 arr
     v1.15 扩展：
     - if chip 显示 N.❓if（.if 紫底，对齐主序列 if 视觉）；单击 → 进入块内 if 编辑态（双栏 then/else）
     - B1（Oracle）：双状态互斥——进入 if 编辑态清空 editBlockLoopTarget */
  function renderBlockBodyChip(cmd, i, arr) {
    var targetArr = arr || editBlockBody;   // v1.14：目标数组（loop 编辑态传 loop.body / if 编辑态传 then/else）
    var isSteps = cmd.id === 'steps';
    var isLoop = cmd.id === 'loop';
    var isIf = cmd.id === 'if';
    var isParamSteps = isSteps && cmd.steps === null;   // v1.11：参数化 steps（调用时传距离）
    var slotIdx = isParamSteps ? (cmd.paramIdx || 0) : -1;   // v1.13：参数槽位（缺省 #0）
    var lbl;
    if (isParamSteps) {
      lbl = slotIdx === 1 ? '➡?₂步' : '➡?₁步';   // v1.13：槽位下标显示（?₁=?₁ / ?₂=?₂）——多参数独立视觉
    }
    else if (isLoop) { lbl = '🔁×' + (cmd.rep || 2); }   // v1.14：loop chip（对齐主序列 loop 视觉）
    else if (isIf) { lbl = '❓if'; }   // v1.15：if chip（对齐主序列 if 视觉）
    else { lbl = cmd.id === 'fwd' ? '↑' : (cmd.id === 'left' ? '↰' : (cmd.id === 'right' ? '↱' : (cmd.id === 'block' ? '🧱' : (cmd.id === 'steps' ? '➡走' + (cmd.steps || 1) + '步' : '?')))); }
    var repTxt = (!isSteps && !isLoop && !isIf && cmd.rep && cmd.rep > 1) ? ('×' + cmd.rep) : '';
    var chip = makeEl('span', 'cmd-chip' + (repTxt ? ' loop' : '') + (isLoop ? ' loopb' : '') + (isIf ? ' if' : '') + (isParamSteps ? ' param-step' : ''), (i + 1) + '.' + lbl + repTxt);
    chip.setAttribute('title', isLoop ? '单击进入循环编辑' : isIf ? '单击进入分支编辑' : isSteps ? (isParamSteps ? '单击换参数·长按变固定' : '单击调步数·长按变参数') : '单击调次数');
    // 长按切换（I1）：pointerdown 起 350ms 定时器 → 触发 fixed⇌param；pointerup/pointercancel 早取消（I-new-2）
    var lpTimer = null, lpFired = false;
    chip.addEventListener('pointerdown', function (ev) {
      if (!isSteps || state.execLock) { return; }
      if (ev.target.classList.contains('chip-x')) { return; }   // I-new-1：✕ 删除按钮不触发长按
      if (ev.shiftKey) { toggleStepsParam(cmd, i, targetArr); lpFired = true; return; }   // shift+单击兜底
      lpFired = false;
      if (lpTimer) { clearTimeout(lpTimer); }
      lpTimer = setTimeout(function () {
        lpTimer = null;
        lpFired = true;
        toggleStepsParam(cmd, i, targetArr);
      }, 350);
    });
    chip.addEventListener('pointerup', function () { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } });
    chip.addEventListener('pointercancel', function () { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } });   // I-new-2
    chip.addEventListener('click', function (ev) {
      ev.stopPropagation();
      if (state.execLock) { return; }
      if (isLoop) {
        // v1.14：loop chip 单击 → 进入块内 loop 编辑态
        // v1.16：块体层 + if 分支层均可进（N8 注释同步）；分支内 loop 编辑后返回/删除回 if 双栏（editBlockLoopFrom 来源记忆）
        if (editBlockLoopTarget) { return; }
        editBlockLoopFrom = editBlockIfTarget;   // v1.16 B1（Oracle）：必须在清空前捕获来源（顶层进入时 null；if 分支内进入时 = 该 if 对象）
        editBlockLoopTarget = cmd;
        editBlockIfTarget = null;   // v1.15 B1：双状态互斥（清空 if 编辑态）
        suppressChipClickUntil = 0;   // I1：进入 loop 编辑态重置去抖标志（防块体残留抑制 loop.body 首次交互）
        renderBlockEdit();
        return;
      }
      if (isIf) {
        // v1.15：if chip 单击 → 进入块内 if 编辑态（仅块体层可进；if 分支内不嵌 if——单层约束，loop 放开见 v1.16）
        if (editBlockIfTarget) { return; }
        editBlockIfTarget = cmd;
        editBlockLoopTarget = null;   // v1.15 B1：双状态互斥（清空 loop 编辑态）
        editBlockLoopFrom = null;     // v1.16 I2（Oracle）：进 if 编辑态强制重置来源（防御跨操作残留）
        suppressChipClickUntil = 0;   // I1：进入 if 编辑态重置去抖标志
        renderBlockEdit();
        return;
      }
      if (!isSteps) { cmd.rep = ((cmd.rep || 1) % 4) + 1; renderBlockEdit(); return; }
      if (Date.now() < suppressChipClickUntil) { return; }   // I-new-3：长按收尾 click 抑制
      if (lpFired) { lpFired = false; return; }   // 长按已处理，本 click 是长按收尾（pointerdown→up 后浏览器派发）
      if (isParamSteps) {
        // 单击参数化 steps = 切换槽位（?₁⇌?₂），v1.13（v1.11 I3 no-op → 放开为槽位交互）
        if (cmd.paramIdx === 1) { delete cmd.paramIdx; } else { cmd.paramIdx = 1; }
      } else {
        cmd.steps = ((cmd.steps || 1) % 9) + 1;   // 固定 steps：数值循环（v1.12 不变）
      }
      renderBlockEdit();
    });
    var x = makeEl('span', 'chip-x', '✕');
    x.addEventListener('click', function (ev) {
      ev.stopPropagation();
      targetArr.splice(i, 1);   // v1.14：作用于目标数组（块体 or loop.body / v1.15 or if.then/else）
      // v1.11 B2：删除参数化 steps → editBlockHasParam 从 body 重新派生（toggle 自动 off；v1.14 递归 loop.body 派生）
      editBlockHasParam = hasEditBodyParam();
      renderBlockEdit();
    });
    chip.appendChild(x);
    return chip;
  }
  /* v1.15：块内 if 分支双栏渲染（I1 Oracle——复用 .block-edit-col 布局类 + v1.16 BLOCK_BODY_BRANCH_CMDS 添加行（含 loop）
     目标数组 = if.then / if.else；chips 复用 renderBlockBodyChip 三态交互（参数化 ?₁ 可放分支内 + 分支内可嵌 loop）） */
  function renderBlockBranchInBlock(type, label, arr) {
    var col = makeEl('div', 'block-edit-col');
    col.appendChild(makeEl('div', 'block-edit-label', label));
    var chipsWrap = makeEl('div', 'block-edit-chips');
    chipsWrap.id = 'branch-chips-' + type;
    if (!arr || !arr.length) { chipsWrap.textContent = '（空——先加几条）'; }
    else {
      arr.forEach(function (bc, bi) {
        chipsWrap.appendChild(renderBlockBodyChip(bc, bi, arr));
      });
    }
    col.appendChild(chipsWrap);
    // 添加行（v1.16：BLOCK_BODY_BRANCH_CMDS = 基础 + 参数化 steps + loop——if 分支内嵌 loop（条件×循环嵌套）；
    // 不含 if/call（防 if 嵌套 + 防递归）；分支内 loop.body 仍按 BLOCK_BODY_LOOP_CMDS 单层）
    var addWrap = makeEl('div', 'block-edit-add');
    BLOCK_BODY_BRANCH_CMDS.forEach(function (bc) {
      var btn = makeEl('button', 'cmd-add-sm', '+ ' + bc.label);
      btn.addEventListener('click', function () {
        if (state.execLock) { return; }
        if ((arr || []).length >= MAX_BODY) {
          var fbx = document.getElementById('block-edit-feedback');
          if (fbx) { fbx.textContent = '⚠ 分支里最多 ' + MAX_BODY + ' 条指令'; fbx.className = 'editor-feedback miss'; }
          return;
        }
        addBlockBodyCmd(bc.id, arr);
      });
      addWrap.appendChild(btn);
    });
    col.appendChild(addWrap);
    return col;
  }
  // v1.13 固定⇌参数双向切换（I1 长按/shift+单击共用；混合态创建入口）：
  //  固定 steps → 参数化槽#0（steps:null）；参数化 steps → 恢复固定（steps:1，清槽位）
  // v1.14：arr 目标数组（块体 or loop.body）
  function toggleStepsParam(cmd, i, arr) {
    if (!cmd || cmd.id !== 'steps') { return; }
    // I-new-3：切换触发 renderBlockEdit 重建 chip 后，长按/shift 收尾的 click 派发到新 chip——
    // 函数级抑制标志（跨重建存活）500ms 内挡住，防槽位/数值二次切换
    suppressChipClickUntil = Date.now() + 500;
    if (cmd.steps === null) {
      cmd.steps = 1;
      if (cmd.paramIdx !== undefined) { delete cmd.paramIdx; }
    } else {
      cmd.steps = null;   // 槽#0
    }
    // editBlockHasParam 从整个编辑树（顶层 + loop.body）重新派生（v1.14 递归）
    editBlockHasParam = hasEditBodyParam();
    renderBlockEdit();
  }
  // v1.14：编辑态整棵树（顶层 + loop.body 递归）是否含参数化 steps——派生 toggle 状态
  // v1.16.1（I1 修复）：补 if 分支递归——对齐 scanParamSteps（顶层 + loop.body + if.then/else）
  // 消除 toggle UI 与执行派生不一致（v1.15 块内 if 起分支内可放参数化 steps）
  function hasEditBodyParam() {
    return hasParamInBody(editBlockBody);
  }
  function hasParamInBody(arr) {
    for (var pi = 0; pi < arr.length; pi++) {
      var c = arr[pi];
      if (c.id === 'steps' && c.steps === null) { return true; }
      if (c.id === 'loop' && c.body && c.body.length && hasParamInBody(c.body)) { return true; }   // v1.14 递归 loop.body
      if (c.id === 'if') {   // v1.16.1：补 if 分支递归（I1 对齐 scanParamSteps）
        if (c.then && c.then.length && hasParamInBody(c.then)) { return true; }
        if (c.else && c.else.length && hasParamInBody(c.else)) { return true; }
      }
    }
    return false;
  }

  /* v1.11：参数 toggle——开 → 全部 steps 参数化（steps:null）；关 → 参数化恢复固定。
     v1.12 N1（Oracle 审核）：v1.11 仅第一条参数化 → 放开为全部参数化（一个参数 N 贯穿块内所有 steps，
     execCall 副本已支持全部 steps:null 填同一 param，执行层零改动）。
     I1 注释（Oracle）：v1.11 存量 1-param 块在此 toggle off→on 后升级为 all-param（数据变但语义更一致，可接受）。
     v1.13 I2 修订（Oracle）：ON 幂等——仅「未参数化 steps」→ 槽#0（steps:null，paramIdx 不设），
     已参数化（含槽#1）保持不变——不破坏混合态/槽位；OFF = 全部恢复固定（v1.12 保持，含槽#1 一并清空）。
     v1.14 扩展（B1 Oracle）：递归作用于整棵树（顶层 + loop.body）——loop.body 内 steps 同样参数化/恢复固定
     （与 scanParamSteps 派生深度对齐，防「顶层有参数但 loop.body 无」的派生/操作不一致）。
     v1.16.1（I1 Oracle：toggle 递归对齐）——补 if 分支：toggle 批量操作覆盖 if.then/else 内 steps
     （与 scanParamSteps 派生深度全面对齐，消除分支内参数化 steps 时 UI/操作不一致）。
     返回错误消息（null=成功）；提示由调用方在 renderBlockEdit 重建后设置（防旧元素被清） */
  function toggleBlockHasParam() {
    if (editBlockHasParam) {
      // 关：参数化 steps（steps:null）恢复固定 steps:1（清槽位标记）——递归整棵树
      for (var i = 0; i < editBlockBody.length; i++) {
        if (editBlockBody[i].id === 'steps' && editBlockBody[i].steps === null) {
          editBlockBody[i].steps = 1;
          if (editBlockBody[i].paramIdx !== undefined) { delete editBlockBody[i].paramIdx; }
        } else if (editBlockBody[i].id === 'loop' && editBlockBody[i].body) { toggleStepsInArr(editBlockBody[i].body, false); }
        else if (editBlockBody[i].id === 'if') {   // v1.16.1：补 if 分支（I1）
          if (editBlockBody[i].then) { toggleStepsInArr(editBlockBody[i].then, false); }
          if (editBlockBody[i].else) { toggleStepsInArr(editBlockBody[i].else, false); }
        }
      }
      editBlockHasParam = false;
      return null;
    } else {
      // 开：需要整棵树有 steps（顶层 / loop.body / v1.16.1 if 分支）；I2 幂等——仅未参数化 → 槽#0（已参数化含槽#1 保持）
      var hasSteps = false;
      for (var j = 0; j < editBlockBody.length; j++) {
        if (editBlockBody[j].id === 'steps') { hasSteps = true; break; }
        if (editBlockBody[j].id === 'loop' && hasStepsInArr(editBlockBody[j].body)) { hasSteps = true; break; }
        if (editBlockBody[j].id === 'if' && ((editBlockBody[j].then && hasStepsInArr(editBlockBody[j].then)) ||
            (editBlockBody[j].else && hasStepsInArr(editBlockBody[j].else)))) { hasSteps = true; break; }   // v1.16.1（I1）
      }
      if (!hasSteps) { return '😅 先加一条 ➡N步，才能带参数'; }   // 保持 off
      for (var k = 0; k < editBlockBody.length; k++) {
        if (editBlockBody[k].id === 'steps' && editBlockBody[k].steps !== null) { editBlockBody[k].steps = null; }   // v1.13 I2：仅未参数化→槽#0
        else if (editBlockBody[k].id === 'loop' && editBlockBody[k].body) { toggleStepsInArr(editBlockBody[k].body, true); }   // v1.14 递归 loop.body
        else if (editBlockBody[k].id === 'if') {   // v1.16.1：补 if 分支（I1）
          if (editBlockBody[k].then) { toggleStepsInArr(editBlockBody[k].then, true); }
          if (editBlockBody[k].else) { toggleStepsInArr(editBlockBody[k].else, true); }
        }
      }
      editBlockHasParam = true;
      return null;
    }
  }
  // v1.14：数组内 steps 批量 参数化(true)/恢复固定(false)（loop.body 递归用；I2 幂等语义：仅改未参数化/参数化）
  // v1.16.1（I1 修复）：补 if 分支递归——toggle 批量操作覆盖分支内 steps（对齐 scanParamSteps）
  function toggleStepsInArr(arr, toParam) {
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === 'steps') {
        if (toParam && arr[i].steps !== null) { arr[i].steps = null; }
        else if (!toParam && arr[i].steps === null) { arr[i].steps = 1; if (arr[i].paramIdx !== undefined) { delete arr[i].paramIdx; } }
      } else if (arr[i].id === 'loop' && arr[i].body) { toggleStepsInArr(arr[i].body, toParam); }
      else if (arr[i].id === 'if') {   // v1.16.1：补 if 分支递归（I1）
        if (arr[i].then) { toggleStepsInArr(arr[i].then, toParam); }
        if (arr[i].else) { toggleStepsInArr(arr[i].else, toParam); }
      }
    }
  }
  // v1.16.1（I1 修复）：补 if 分支递归——toggle ON 前置检查覆盖分支内 steps（防误报「先加一条 ➡N步」）
  function hasStepsInArr(arr) {
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === 'steps') { return true; }
      if (arr[i].id === 'loop' && arr[i].body && hasStepsInArr(arr[i].body)) { return true; }
      if (arr[i].id === 'if') {   // v1.16.1：补 if 分支递归（I1）
        if (arr[i].then && hasStepsInArr(arr[i].then)) { return true; }
        if (arr[i].else && hasStepsInArr(arr[i].else)) { return true; }
      }
    }
    return false;
  }

  function addBlockBodyCmd(id, targetArr) {
    var arr = targetArr || editBlockBody;   // v1.14：loop 编辑态传 loop.body；v1.15：if 编辑态传 then/else
    if (id === 'steps') {
      // v1.11：参数态新增 steps 直接参数化（槽#0）；v1.13 显式 paramIdx:0（一致性，缺省亦同义）
      arr.push({ id: id, steps: editBlockHasParam ? null : 1, paramIdx: editBlockHasParam ? 0 : undefined });
    }
    else if (id === 'loop') { arr.push({ id: id, rep: 2, body: [] }); }   // v1.14：块内循环块（单层）
    else if (id === 'if') { arr.push({ id: id, then: [], else: [] }); }   // v1.15：块内 if（v1.16：then/else 可嵌 loop——条件×循环）
    else { arr.push({ id: id, rep: 1 }); }
    renderBlockEdit();
  }

  /* v1.10：退出块编辑器（保存/取消共用）——按来源返回游戏或块库 */
  function exitBlockEdit() {
    // I-4 修订：独立视图无需解锁（主视图控件已重建为默认可用态）；仅游戏来源需恢复计时
    if (editBlockReturn === 'game') {
      renderGame();
      renderSeq();   // v1.11 修复：renderGame 不重建序列 chips——补渲染（N-3 返回游戏暴露）
      // 计时衔接：进入编辑器已 stopTimer；按已累计 elapsed 补偿 startMs 续跑（编辑耗时不计入解题计时）
      if (!state.finished) { state.startMs = Date.now() - state.elapsed; startTimer(); }
    }
    else { viewBlockList(); }
  }

  function doSaveBlock() {
    var fb = document.getElementById('block-edit-feedback');
    var name = (editBlockName || '').trim();
    if (!name) { fb.textContent = '😅 先给块起个名字（≤6 字）'; fb.className = 'editor-feedback miss'; return; }
    if (blockNameTaken(name, editBlockId)) { fb.textContent = '😅 这个名字已有块啦，换个名字吧'; fb.className = 'editor-feedback miss'; return; }
    if (!editBlockBody.length) { fb.textContent = '😅 块里还没有指令，先加几条吧'; fb.className = 'editor-feedback miss'; return; }
    // v1.14 I2（Oracle）：保存校验——loop.body 不嵌 loop/if/call（异常数据兜底，正常编辑入口已隔离）
    // v1.16：if 分支不嵌 if/call + 分支内 loop.body 单层（hasForbiddenNested 已放开 loop——条件×循环合法）
    if (hasIllegalNested(editBlockBody)) {
      fb.textContent = '⚠ 嵌套指令不合法（循环里不能放循环/条件/块引用，分支里不能放条件/块引用），已阻止保存'; fb.className = 'editor-feedback miss'; return;
    }
    if (editBlockId) { updateCustomBlock(editBlockId, name, editBlockBody); }
    else {
      var id = addCustomBlock(name, editBlockBody);
      if (!id) { fb.textContent = '⚠ 已达上限 8 个块，删除旧块再保存'; fb.className = 'editor-feedback miss'; return; }
    }
    exitBlockEdit();
  }
  // v1.14 I2（Oracle）：递归检查 loop.body / v1.15 if 分支是否含非法嵌套（loop/if/call）——防御异常数据
  // v1.15（Oracle B4）：双重保险——块内 if 分支不嵌 if/loop/call（决策 A 单层约束）；与 hasCallInBlock（执行时）互补
  // 修复（测试暴露）：if 分支须直接查子数组指令类型（递归 hasIllegalNested 会漏检嵌套 if——它查的是子 if 内部而非分支层）
  function hasIllegalNested(arr) {
    for (var i = 0; i < arr.length; i++) {
      var c = arr[i];
      if (c.id === 'loop') {
        if (!c.body) { continue; }
        for (var j = 0; j < c.body.length; j++) {
          if (c.body[j].id === 'loop' || c.body[j].id === 'if' || c.body[j].id === 'call') { return true; }
        }
      }
      if (c.id === 'if') {
        // v1.15：if.then/else 不嵌 if/call（v1.16 放开 loop——分支内嵌循环）——直接查分支数组指令类型（hasForbiddenNested）
        if (c.then && hasForbiddenNested(c.then)) { return true; }
        if (c.else && hasForbiddenNested(c.else)) { return true; }
      }
    }
    return false;
  }
  // v1.16（Oracle B4 复核）：if 分支顶层禁 if/call（loop 放开——块内控制流嵌套：条件×循环）；
  //   分支内 loop 的 body 递归校验（仍禁 loop/if/call——loop 单层保持，双层嵌套封顶）
  function hasForbiddenNested(arr) {
    for (var i = 0; i < arr.length; i++) {
      var c = arr[i];
      if (c.id === 'if' || c.id === 'call') { return true; }
      if (c.id === 'loop') {
        if (!c.body) { continue; }
        for (var j = 0; j < c.body.length; j++) {
          if (c.body[j].id === 'loop' || c.body[j].id === 'if' || c.body[j].id === 'call') { return true; }
        }
      }
    }
    return false;
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
    blockListReturn = 'home';   // v1.11 B1：兜底重置（覆盖页头 home / 任意逃逸路径）
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

    // v1.10：我的块（自定义指令块）入口——抽象/封装教学
    var blockCard = makeEl('button', 'level-card block-card');
    blockCard.appendChild(makeEl('div', 'level-name', '🧩 我的块 (' + customBlocks.length + ')'));
    blockCard.appendChild(makeEl('div', 'level-best', '把重复动作打包！'));
    blockCard.addEventListener('click', function () { blockListReturn = 'home'; viewBlockList(); });
    wrap.appendChild(blockCard);

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
        LX_SHARED.storage.remove('customBlocks');   // v1.10：一并清除自定义块（I-5/N-6；关卡中残留 call 走灰显+执行兜底）
        customLevels = [];
        customBlocks = [];
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
    [CMD_FWD, CMD_L, CMD_R, CMD_BLOCK, CMD_STEPS, CMD_IF, CMD_LOOP, CMD_CALL].forEach(function (cmd) {
      var btn = makeEl('button', 'cmd-add' + (cmd.id === 'call' ? ' cmd-add-call' : ''), cmd.label);
      btn.addEventListener('click', function () { addCmd(cmd.id); });
      cmdBar.appendChild(btn);
    });
    wrap.appendChild(cmdBar);
    // v1.10：块选择面板（[🧩块] 点击 → 列出自定义块追加引用）
    var blockPicker = makeEl('div', 'block-picker');
    blockPicker.id = 'block-picker';
    blockPicker.style.display = 'none';
    wrap.appendChild(blockPicker);

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
      var isCall = cmd.id === 'call';
      var lbl;
      var paramSegs = null;   // v1.13：多参数 call 分段（[{slot,last}]）
      if (isCall) {
        // v1.10 自定义块引用：name 渲染查块库取最新（I-3）；块已删除 → 灰显 + 「块已删除」标记（N-3）
        // v1.11：参数块显示 (N)——有参数块 chip 显示 🧩名(N)，点击调参（cycleCallParam）
        // v1.13 I6：多参数块显示 🧩名(N₀,N₁)——N₀/N₁ 分段 span（data-slot）独立调参；单参块保持 (3) 兼容
        var defC = getCustomBlock(cmd.bid);
        var pc = defC ? blockParamCount(cmd.bid) : 0;
        var isParamCall = pc > 0;
        if (defC) {
          cmd.name = defC.name;
          if (isParamCall) {
            // 参数分段显示：显示值 = params[slot] ?? (slot===0 ? param : 3)（存量 call 升级补默认，不写数据）
            paramSegs = [];
            for (var s = 0; s < pc; s++) {
              var pv = (cmd.params && cmd.params[s] !== undefined) ? cmd.params[s] : (s === 0 ? (cmd.param || 3) : 3);
              paramSegs.push({ slot: s, last: s === pc - 1, txt: String(pv) });
            }
            lbl = '🧩' + defC.name;
          } else { lbl = '🧩' + defC.name; }
        }
        else { lbl = '🧩' + (cmd.name || '已删除') + '❌'; }
      } else {
        lbl = cmd.id === 'fwd' ? '↑' : (cmd.id === 'left' ? '↰' : (cmd.id === 'right' ? '↱' : (cmd.id === 'block' ? '🧱' : (cmd.id === 'steps' ? '➡走' + (cmd.steps || 1) + '步' : (cmd.id === 'loop' ? '🔁×' + (cmd.rep || 2) : '❓if')))));
      }
      var repTxt = (!isIf && !isSteps && !isLoop && !isCall && cmd.rep && cmd.rep > 1) ? ('×' + cmd.rep) : '';
      // 指令 chip：单击循环次数/参数递增/打开编辑区（if 分支 or 循环块 or 块引用调参）；✕ 角标删除
      var chipCls = 'cmd-chip' + (repTxt ? ' loop' : '') + (isIf ? ' if' : '') + (isLoop ? ' loopb' : '') + (isCall ? (defC ? (isParamCall ? ' call param-call' : ' call') : ' call deleted') : '');
      var chip;
      if (paramSegs) {
        // v1.13 I6：分段 chip——「i.🧩名(」+ 各参数段 span + 「)」
        chip = makeEl('span', chipCls, (i + 1) + '.' + lbl + '(');
        paramSegs.forEach(function (ps, si) {
          var seg = makeEl('span', 'call-param', ps.txt);
          seg.setAttribute('data-slot', String(ps.slot));
          seg.addEventListener('click', function (ev) {
            ev.stopPropagation();
            if (!defC || state.execLock) { return; }
            cycleCallParamSlot(i, ps.slot);   // 参数段独立调参
          });
          chip.appendChild(seg);
          if (!ps.last) { chip.appendChild(document.createTextNode(',')); }
        });
        chip.appendChild(document.createTextNode(')'));
      } else {
        chip = makeEl('span', chipCls, (i + 1) + '.' + lbl + repTxt);
      }
      chip.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (isIf || isLoop) { openEditCtx(i, cmd); }
        else if (isCall) {
          if (!defC || state.execLock) { return; }   // 孤儿/执行中不可点
          if (isParamCall) { cycleCallParamSlot(i, 0); }    // v1.13：参数块主体点击 → 调参槽#0（v1.12 盲点行为保持）
          else { viewBlockEditFromGame(cmd.bid); }   // 无参数块 → 进块编辑器（v1.10 保持）
        }
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
  // v1.6 参数递增：1→2→3→…→9→1（steps 参数化，区别于 rep 的 4 上限）
  function cycleSteps(i) {
    if (state.execLock) { return; }
    var cmd = state.cmds[i];
    if (!cmd || cmd.id !== 'steps') { return; }
    if (cmd.steps === null) { return; }   // v1.11 I3：参数化 steps 点击 no-op（距离由调用时决定）
    cmd.steps = ((cmd.steps || 1) % 9) + 1;
    renderSeq();
  }
  // v1.11：块引用参数递增——参数块 chip 点击 3→4→…→9→1→…→2→3（对齐 steps 1-9 循环）
  // v1.13 多参数：cycleCallParamSlot(i, slot)——逐槽独立调参（分段 span 点击）；主体点击 = 槽#0（v1.12 兼容）
  // 写时归一化：存量 call.param → params 数组（删 param）；补足缺失槽位默认 3
  function cycleCallParamSlot(i, slot) {
    if (state.execLock) { return; }
    var cmd = state.cmds[i];
    if (!cmd || cmd.id !== 'call') { return; }
    var pc = blockParamCount(cmd.bid);
    if (slot >= pc) { return; }   // 无效槽 no-op（块已降级 1 参但 call 段点击旧槽）
    if (!cmd.params) {
      cmd.params = [cmd.param !== undefined ? cmd.param : 3];
      delete cmd.param;   // 归一化：params 优先，param 清除（防并存脏数据）
    }
    while (cmd.params.length < pc) { cmd.params.push(3); }   // 补足槽位默认 3
    cmd.params[slot] = ((cmd.params[slot] || 3) % 9) + 1;   // 槽位独立 3→4→…→9→1
    renderSeq();
  }
  // v1.11 兼容别名：主体点击（无槽位指定）→ 槽#0（行为 = v1.12 cycleCallParam）
  function cycleCallParam(i) { cycleCallParamSlot(i, 0); }

  function renderBoardOnly() {
    var board = document.getElementById('board');
    if (board) { board.innerHTML = boardHtml(); }
  }

  function addCmd(id) {
    if (state.execLock) { return; }
    if (id === 'if') { state.cmds.push({ id: id, then: [], else: [] }); }
    else if (id === 'steps') { state.cmds.push({ id: id, steps: 1 }); }
    else if (id === 'loop') { state.cmds.push({ id: id, rep: 2, body: [] }); }
    else if (id === 'call') { toggleBlockPicker(); return; }   // v1.10：[🧩块] 展开/收起块选择面板
    else { state.cmds.push({ id: id, rep: 1 }); }
    hideBlockPicker();
    renderSeq();
  }
  /* v1.10：块选择面板（cmd-bar [🧩块] → 列出自定义块追加引用） */
  function toggleBlockPicker() {
    var p = document.getElementById('block-picker');
    if (!p) { return; }
    if (p.style.display === 'none') { renderBlockPicker(); p.style.display = 'block'; }
    else { p.style.display = 'none'; }
  }
  function hideBlockPicker() {
    var p = document.getElementById('block-picker');
    if (p) { p.style.display = 'none'; }
  }
  /* v1.14 N2（Oracle）：面板预览指令 span（视觉标记：固定灰底 .pv-steps / 参数浅紫 .pv-param /
     loop 灰框 .pv-loop + 递归摘要 / 其余 .pv-base）——每指令一个 span，低龄分辨"可调 vs 固定 vs 循环" */
  function pickerPreviewSpan(c) {
    if (c.id === 'fwd') { return makeEl('span', 'pv-base', '↑' + (c.rep && c.rep > 1 ? '×' + c.rep : '')); }
    if (c.id === 'left') { return makeEl('span', 'pv-base', '↰'); }
    if (c.id === 'right') { return makeEl('span', 'pv-base', '↱'); }
    if (c.id === 'block') { return makeEl('span', 'pv-base', '🧱'); }
    if (c.id === 'steps') {
      if (c.steps === null) { return makeEl('span', 'pv-param', c.paramIdx === 1 ? '➡?₂步' : '➡?₁步'); }   // v1.13 槽位下标 + 浅紫
      return makeEl('span', 'pv-steps', '➡' + c.steps + '步');   // v1.14：固定步灰底
    }
    if (c.id === 'loop') {
      // loop 摘要：🔁×M{body 摘要 ≤3 条 + …}——子指令保留各自视觉标记（递归 span，非 textContent 拼接——N2 低龄可辨循环内哪步可调）
      var inner = makeEl('span', 'pv-inner', '');
      var bd = c.body || [];
      var shown = bd.slice(0, 3);
      shown.forEach(function (lc, li) {
        if (li > 0) { inner.appendChild(document.createTextNode(' ')); }
        inner.appendChild(pickerPreviewSpan(lc));
      });
      if (bd.length > 3) { inner.appendChild(document.createTextNode(' …')); }
      var wrapSrc = makeEl('span', 'pv-loop', '');
      wrapSrc.appendChild(document.createTextNode('🔁×' + (c.rep || 2) + '{'));
      wrapSrc.appendChild(inner);
      wrapSrc.appendChild(document.createTextNode('}'));
      return wrapSrc;
    }
    if (c.id === 'if') {
      // v1.15（I3 Oracle）：if 摘要——.pv-if 紫底 + {then…|else…} 包裹；分支内复用 .pv-steps/.pv-param
      // v1.16：分支可含 loop（递归预览——buildBranch 内 pickerPreviewSpan 遇 loop 走 .pv-loop 摘要）
      var buildBranch = function (arr, label) {
        var b = makeEl('span', 'pv-inner', '');
        b.appendChild(document.createTextNode(label + ' '));
        var ba = arr || [];
        var bShown = ba.slice(0, 3);
        bShown.forEach(function (bc, bi) {
          if (bi > 0) { b.appendChild(document.createTextNode(' ')); }
          b.appendChild(pickerPreviewSpan(bc));
        });
        if (ba.length > 3) { b.appendChild(document.createTextNode(' …')); }
        return b;
      };
      var wrapIf = makeEl('span', 'pv-if', '');
      wrapIf.appendChild(document.createTextNode('❓if{'));
      wrapIf.appendChild(buildBranch(c.then, '✅'));
      wrapIf.appendChild(document.createTextNode(' | '));
      wrapIf.appendChild(buildBranch(c.else, '❌'));
      wrapIf.appendChild(document.createTextNode('}'));
      return wrapIf;
    }
    return makeEl('span', 'pv-base', '?');
  }
  function renderBlockPicker() {
    var p = document.getElementById('block-picker');
    if (!p) { return; }
    clearNode(p);
    if (!customBlocks.length) {
      p.appendChild(makeEl('div', 'block-picker-empty', '先到首页 🧩 我的块 建一个块吧'));
    }
    customBlocks.forEach(function (b) {
      var item = makeEl('div', 'block-picker-item');
      var hasParam = blockHasParam(b.id);   // v1.11：参数块显示 (N)
      var pc = blockParamCount(b.id);       // v1.13：参数数量（多参数显示 (3,3)）
      var lbl = makeEl('span', 'block-picker-name', '🧩 ' + b.name + (hasParam ? (pc > 1 ? ' (3,3)' : ' (3)') : ''));
      item.appendChild(lbl);
      // N-2：body 预览（指令 chips 缩略，强化"封装可见"教学；参数版 steps 显示 ? 占位）
      // v1.13：槽位下标显示（?₁/?₂）+ 固定数字共存（混合态预览）
      var prev = makeEl('span', 'block-picker-preview');
      // v1.14 N2（Oracle）：预览改 span 拼接视觉标记（固定灰底/参数浅紫/loop 灰框）——低龄一眼分辨可调 vs 固定 vs 循环
      // 每指令一个 span（appendChild + 空格），loop 预览递归 body 摘要（≤3 条 + … 截断防溢出）
      b.body.forEach(function (c, ii) {
        if (ii > 0) { prev.appendChild(document.createTextNode(' ')); }
        prev.appendChild(pickerPreviewSpan(c));
      });
      item.appendChild(prev);
      item.addEventListener('click', function () {
        if (state.execLock) { return; }
        // v1.11：参数块追加带默认参数 3；无参数块不设 param
        // v1.13 I5：多参数块（pc>1）追加 params:[3,3]（每槽默认 3）；单参/无参兼容
        if (hasParam) {
          if (pc > 1) { state.cmds.push({ id: 'call', bid: b.id, name: b.name, params: [3, 3].slice(0, pc) }); }
          else { state.cmds.push({ id: 'call', bid: b.id, name: b.name, param: 3 }); }
        }
        else { state.cmds.push({ id: 'call', bid: b.id, name: b.name }); }
        hideBlockPicker();
        renderSeq();
      });
      p.appendChild(item);
    });
    var mgr = makeEl('div', 'block-picker-mgr');
    var mgrBtn = makeEl('button', 'cmd-add', '🧩 管理块');
    mgrBtn.addEventListener('click', function () {
      blockListReturn = 'game';   // N-3 修复（B1）：记住从游戏进入
      hideBlockPicker();
      setCmdLocked(false);
      viewBlockList();
    });
    mgr.appendChild(mgrBtn);
    p.appendChild(mgr);
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
        if (bc.steps === null) { return; }   // v1.11 I3：参数化 steps no-op
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
        if (bc.steps === null) { return; }   // v1.11 I3：参数化 steps no-op
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

  /* v1.10 自定义指令块引用：同 execLoop 结构，body 来自块库（getCustomBlock(bid)） */
  /* v1.11 参数注入：参数块生成运行时副本（steps:null 填 call.param，防污染块库共享引用） */
  /* v1.14 B1/B2（Oracle 修订）：
     - needsCopy = blockHasParam（递归版——blockParamCount 已递归 loop.body）——副本必要性与 _loopLeft 无关
       （顺序队列无共享污染，Oracle 逐帧验证），纯粹因为参数化 steps 需按 call 参数解析 + loop.body 需递归拷贝
     - resolveStep 提取独立函数：顶层 body 与 loop.body 统一调用（B2 拷贝时同步解析，execLoop 保持纯粹职责）
     - loop.body 递归拷贝 + 参数注入（参数×循环：块内「走 ?₁ 步 ×N 次」）
     v1.15 B3（Oracle）：统一入口——execCall 用 cloneBlockBody(def.body, cmd)（paramCmd=cmd：顶层/loop.body/if 分支
       统一参数注入 + if.then/else 递归拷贝——条件×参数）；无参数化块共享引用（B2 逐帧确认 execIf 展开插入不改原数组） */
  function execCall(cmd) {
    var def = getCustomBlock(cmd.bid);
    if (!def || !def.body || !def.body.length) {
      // 块被删/空 → 外部（execStep call 分支）已有反馈，无 body 直接返回
      return;
    }
    // I-2 采纳（oracle 评审）+ v1.14 I4（Oracle）：防递归爆栈——递归检查 body/loop.body/if 分支含 call → 终止
    if (hasCallInBlock(def.body)) {
      state.execDone = true;
      var fbI = document.getElementById('game-feedback');
      if (fbI) { fbI.textContent = '⚠ 块「' + (def.name || '?') + '」定义异常（含嵌套引用），已停止'; fbI.className = 'game-feedback miss'; }
      state.execLock = false; stopTimer(); clearExecHighlight();
      return;
    }
    resetLoopLeft(def.body);   // B1 同款：展开前清 body 执行期状态（共享引用污染防 bug；I2：参数块副本全新为空操作，非参数块必需）
    var runBody;
    if (blockHasParam(cmd.bid)) {
      // v1.15 B3：统一入口——cloneBlockBody(paramCmd=cmd) 递归拷贝顶层/loop.body/if 分支 + resolveStep 参数注入
      runBody = cloneBlockBody(def.body, cmd);
    } else {
      runBody = def.body;   // 无参数无参数化块：直接共享引用（v1.10 行为不变；v1.14 B1 + v1.15 B2 逐帧确认无污染）
    }
    for (var i = 0; i < runBody.length; i++) {
      runBody[i]._execTop = cmd._execTop;   // I-new 同款：无条件继承父级 call 顶层下标（高亮/失败定位）
    }
    state.execQueue.splice.apply(state.execQueue,
      [state.queueIdx, 0].concat(runBody));
  }
  // v1.14 B2（Oracle）：参数解析独立函数——B2 槽位感知回退链（顶层 body 与 loop.body / v1.15 if 分支统一调用）
  // 固定 steps（steps !== null）原样返回；仅 steps:null（参数化）才解析——
  // params[slot] 优先；param 仅对槽#0 有效；槽#1 直接兜底 3（防存量 param:5 升双参后槽#1 错误继承）
  function resolveStep(cmd, step) {
    if (step.steps !== null) { return step.steps; }   // 固定 steps 原样（混合态/固定值不动）
    var slot = step.paramIdx || 0;
    return (cmd.params && cmd.params[slot] !== undefined) ? cmd.params[slot] : (slot === 0 ? (cmd.param || 3) : 3);
  }
  // v1.14 I4（Oracle）：递归检查块定义是否含 call（body 顶层 + loop.body + if 分支）——异常数据防御
  function hasCallInBlock(arr) {
    for (var i = 0; i < arr.length; i++) {
      var c = arr[i];
      if (c.id === 'call') { return true; }
      if (c.id === 'loop' && c.body && hasCallInBlock(c.body)) { return true; }
      if (c.id === 'if') {
        if (c.then && hasCallInBlock(c.then)) { return true; }
        if (c.else && hasCallInBlock(c.else)) { return true; }
      }
    }
    return false;
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
    } else if (cmd.id === 'call') {
      // v1.10 自定义块引用：查块库 → 展开 body（execCall 内含 I-2 防递归校验）
      var defCall = getCustomBlock(cmd.bid);
      if (!defCall) {
        // 块已删除：反馈 + 终止（防 null 崩溃）
        state.execDone = true;
        var fbD = document.getElementById('game-feedback');
        if (fbD) { fbD.textContent = '🧩 块「' + (cmd.name || '?') + '」已删除，先移除这条指令吧'; fbD.className = 'game-feedback miss'; }
        state.execLock = false; stopTimer(); clearExecHighlight();
        return;
      }
      execCall(cmd);
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
  // 执行锁定：指令按钮/序列灰显不可点（含 v1.5 editCtx 控件 + v1.10 块编辑/选择面板）
  function setCmdLocked(locked) {
    var bars = document.querySelectorAll('.cmd-add, .seq-clear, .cmd-chip, .cmd-add-sm, .btn-close-edit, .editor-name-input, .block-picker-item, .editor-tools .btn, .editor-actions .btn');
    for (var i = 0; i < bars.length; i++) {
      if (locked) { bars[i].setAttribute('disabled', 'disabled'); }
      else { bars[i].removeAttribute('disabled'); }
    }
  }

  /* 编写量（v1.5：if 块计 1 条 + 分支内指令数；普通指令按 rep 展开步数）——星级基准 */
  function totalSteps(cmds) {
    var n = 0;
    var seenBlockIds = {};   // v1.10：本关已计数的块 bid 集合（body 仅计一次，I-1 oracle 修订）
    cmds.forEach(function (c) {
      if (c.id === 'if') {
        n += 1;
        // v1.7 递归口径（body 内 if/loop 同口径）；v1.5 旧关 then/else 无嵌套时与 length 等价
        n += (c.then ? totalSteps(c.then) : 0) + (c.else ? totalSteps(c.else) : 0);
      } else if (c.id === 'loop') {
        n += 1 + (c.body ? totalSteps(c.body) : 0);   // 循环块计 1 + body 递归（不乘 rep）
      } else if (c.id === 'call') {
        // v1.10 自定义块引用：每次引用计 1（调用开销）+ body 仅计一次（同 loop 不乘 rep 的编写量口径）
        n += 1;
        if (!seenBlockIds[c.bid]) {
          seenBlockIds[c.bid] = true;
          var bd = getCustomBlock(c.bid);
          if (bd) { n += totalSteps(bd.body); }
        }
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
  // v1.10：重载 customBlocks（test/调试用）
  M.reloadCustomBlocks = function () {
    customBlocks = loadCustomBlocks();
    return customBlocks;
  };
  M.viewBlockList = viewBlockList;
  M.viewBlockEdit = viewBlockEdit;
  M.viewBlockEditFromGame = viewBlockEditFromGame;
  M.exitBlockEdit = exitBlockEdit;
  M.doSaveBlock = doSaveBlock;
  M.addCustomBlock = addCustomBlock;
  M.updateCustomBlock = updateCustomBlock;
  M.removeCustomBlock = removeCustomBlock;
  M.getCustomBlock = getCustomBlock;
  M.blockNameTaken = blockNameTaken;
  // v1.11：块参数
  M.blockHasParam = blockHasParam;
  M.blockParamCount = blockParamCount;   // v1.13：参数数量派生（测试/调试）
  M.cycleCallParam = cycleCallParam;
  M.cycleCallParamSlot = cycleCallParamSlot;   // v1.13：逐槽调参
  M.toggleBlockHasParam = toggleBlockHasParam;
  window.M = M;
})();
