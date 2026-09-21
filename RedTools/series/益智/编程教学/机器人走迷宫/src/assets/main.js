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

  /* ---------- 难度档（关卡区段） ---------- */
  var LEVELS_CFG = {
    easy:   { key: 'easy',   label: '简单', from: 0, to: 30 },    // 1-30 关（入门渐进）
    normal: { key: 'normal', label: '普通', from: 30, to: 80 },   // 31-80 关（进阶推理）
    hard:   { key: 'hard',   label: '挑战', from: 80, to: 155 }   // 81-155 关（全量挑战）
  };
  var LEVEL_ORDER = ['easy', 'normal', 'hard'];

  /* 指令常量 */
  var CMD_FWD = { id: 'fwd', label: '↑ 前进' };
  var CMD_L = { id: 'left', label: '↰ 左转' };
  var CMD_R = { id: 'right', label: '↱ 右转' };
  var CMD_BLOCK = { id: 'block', label: '🧱 前方探测' };   // v1.3 条件指令：前方有墙/边界则不走
  var DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // 右/下/左/上

  /* ---------- 状态 ---------- */
  var state = {
    level: 'easy',
    levelIdx: 0,
    cmds: [],          // 指令序列 [{id}]
    prog: 0,           // 执行进度（当前指令下标）
    // 执行时盘面快照
    w: 0, h: 0,
    walls: {}, goals: {}, boxes: {}, player: -1, face: 0,
    won: false,
    execDone: false,
    startMs: 0, elapsed: 0, timerId: null,
    finished: false,
    // V1.4 调试反馈（执行期内存字段，不入库）
    firstFail: null,   // 首个失败：{absStep, prog, cmdId, reason: 'wall'|'box'|'edge'}
    absStep: 0,        // 展开步计数（循环指令按 rep 展开的绝对步数）
    execLock: false    // 执行中锁定（防执行期间改指令序列）
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
  function parseLevel(idx) {
    var rows = window.LEVELS[idx].g;
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

  /* ---------- 渲染：顶栏 ---------- */
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
    // V1.4：状态复位（防残留锁）
    state.firstFail = null; state.absStep = 0; state.execLock = false;
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
    var lv = parseLevel(state.levelIdx);
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
    var lvEl = makeEl('div', 'game-prog', LEVELS_CFG[state.level].label + ' · 第 ' + (state.levelIdx + 1) + ' 关');
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
    [CMD_FWD, CMD_L, CMD_R, CMD_BLOCK].forEach(function (cmd) {
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
      state.firstFail = null;
      state.absStep = 0;
      state.execLock = false;
      setCmdLocked(false);
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
      var lbl = cmd.id === 'fwd' ? '↑' : (cmd.id === 'left' ? '↰' : (cmd.id === 'right' ? '↱' : '🧱'));
      var repTxt = (cmd.rep && cmd.rep > 1) ? ('×' + cmd.rep) : '';
      // 指令 chip：单击循环次数（1→2→3→4→1），✕ 角标删除
      var chip = makeEl('span', 'cmd-chip' + (repTxt ? ' loop' : ''), (i + 1) + '.' + lbl + repTxt);
      chip.addEventListener('click', function (ev) {
        ev.stopPropagation();
        cycleRep(i);
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

  // 循环次数递增：1→2→3→4→1（循环指令启蒙）
  function cycleRep(i) {
    if (state.execLock) { return; }
    var cmd = state.cmds[i];
    if (!cmd) { return; }
    var next = ((cmd.rep || 1) % 4) + 1;
    cmd.rep = next;
    renderSeq();
  }
  function setRepFromIdx(i, rep) {
    var cmd = state.cmds[i];
    if (cmd) { cmd.rep = rep; }
  }

  function renderBoardOnly() {
    var board = document.getElementById('board');
    if (board) { board.innerHTML = boardHtml(); }
  }

  function addCmd(id) {
    if (state.execLock) { return; }
    state.cmds.push({ id: id, rep: 1 });
    renderSeq();
  }
  function removeCmd(i) {
    if (state.execLock) { return; }
    state.cmds.splice(i, 1);
    renderSeq();
  }

  /* ---------- 执行器（编程核心） ---------- */
  function execRun() {
    if (state.execDone || state.won || !state.cmds.length) { return; }
    // V1.4：执行锁定 + 调试追踪状态清零
    state.execLock = true;
    state.firstFail = null;
    state.absStep = 0;
    // 从初始盘面执行（重置到关卡初始）
    loadLevelState();
    state.prog = 0;
    // 重置循环计数（_loopLeft 残留清理→undefined 使 execStep 重新初始化）
    state.cmds.forEach(function (c) { c._loopLeft = undefined; });
    var fb = document.getElementById('game-feedback');
    if (fb) { fb.textContent = '机器人执行中…'; fb.className = 'game-feedback'; }
    // 指令锁定灰显 + 高亮第 1 条
    setCmdLocked(true);
    renderSeq();
    renderSeqHighlight();
    execStep();
  }

  function execStep() {
    if (state.prog >= state.cmds.length) {
      // 执行完：判定
      state.execDone = true;
      checkWin();
      return;
    }
    var cmd = state.cmds[state.prog];
    // 循环：rep>1 时重复执行当前指令 rep 次（复用 prog 计数）
    // 修复：_loopLeft 用 undefined 判未初始化（0 = 执行完，不能重置）
    if (cmd._loopLeft === undefined) { cmd._loopLeft = cmd.rep || 1; }
    if (cmd._loopLeft <= 0) {
      cmd._loopLeft = 0;
      state.prog += 1;
      renderSeqHighlight();
      setTimeout(function () { execStep(); }, 60);
      return;
    }
    cmd._loopLeft -= 1;
    // V1.4：展开步计数（每条指令每次展开执行 +1）
    state.absStep += 1;
    if (cmd.id === 'left') {
      state.face = (state.face + 3) % 4;
    } else if (cmd.id === 'right') {
      state.face = (state.face + 1) % 4;
    } else {
      // 前进方向目标格
      var pr = state.player % state.w;
      var pc = Math.floor(state.player / state.w);
      var dx = DIRS[state.face][0], dy = DIRS[state.face][1];
      var nr = pr + dx, nc = pc + dy;
      var moved = false;
      if (cmd.id === 'block') {
        // v1.3 条件指令「前方探测」：若前方越界/墙/箱子（障碍）→ 条件成立不前进；否则前进
        // V1.4 决议：block 永不报错（前方有障碍是条件成立，非错误）
        if (nr >= 0 && nr < state.w && nc >= 0 && nc < state.h && !state.walls[nc * state.w + nr] && !state.boxes[nc * state.w + nr]) {
          state.player = nc * state.w + nr;
        }
      } else if (nr >= 0 && nr < state.w && nc >= 0 && nc < state.h) {
        var nIdx = nc * state.w + nr;
        if (!state.walls[nIdx]) {
          if (state.boxes[nIdx]) {
            var br = nr + dx, bc = nc + dy;
            if (br >= 0 && br < state.w && bc >= 0 && bc < state.h) {
              var bIdx = bc * state.w + br;
              if (!state.walls[bIdx] && !state.boxes[bIdx]) {
                delete state.boxes[nIdx];
                state.boxes[bIdx] = true;
                state.player = nIdx;
                moved = true;
              }
            }
          } else {
            state.player = nIdx;
            moved = true;
          }
        }
      }
      // V1.4 失败定位：fwd 试图移动但未动 → 记首个失败（调试器断点语义）
      if (!moved && !state.firstFail && cmd.id === 'fwd') {
        var reason = 'box'; // 箱后墙/箱推不动
        if (nr < 0 || nr >= state.w || nc < 0 || nc >= state.h) { reason = 'edge'; }
        else if (state.walls[nc * state.w + nr]) { reason = 'wall'; }
        else if (!state.boxes[nc * state.w + nr]) { reason = 'wall'; } // 非箱非墙但没动（箱挡住推到目标外推不动实际由 box 分支兜底）
        state.firstFail = { absStep: state.absStep, prog: state.prog, cmdId: cmd.id, reason: reason };
      }
    }
    renderBoardOnly();
    // 步进节奏（循环指令同节奏，动画可见）
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
        msg = '✗ 第 ' + (state.firstFail.prog + 1) + ' 条指令 ⬆ 卡住了：' + reasonTxt + '（还差 ' + left + ' 个箱子）';
        markErrCmd(state.firstFail.prog);
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
      if (state.execLock && i === state.prog) { chips[i].classList.add('exec'); }
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
  // 执行锁定：指令按钮/序列灰显不可点
  function setCmdLocked(locked) {
    var bars = document.querySelectorAll('.cmd-add, .seq-clear, .cmd-chip');
    for (var i = 0; i < bars.length; i++) {
      if (locked) { bars[i].setAttribute('disabled', 'disabled'); }
      else { bars[i].removeAttribute('disabled'); }
    }
  }

  /* 实际执行步数（循环指令展开后）——星级基准 */
  function totalSteps(cmds) {
    var n = 0;
    cmds.forEach(function (c) { n += (c.rep || 1); });
    return n;
  }

  function finishLevel() {
    // 星级：实际执行步数（循环展开）vs 最少推动数
    var steps = totalSteps(state.cmds);
    var best = bestPushes(state.levelIdx);
    var stars = 1;
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
    wrap.appendChild(makeEl('div', 'result-sub', LEVELS_CFG[state.level].label + ' 全部关卡完成'));
    var best = store.best[state.level];
    if (best) {
      wrap.appendChild(makeEl('div', 'result-best', '最佳 ' + best.stars + '★ · 第 ' + best.level + ' 关'));
    }
    var today = todayStr();
    var checkinBtn = makeEl('button', 'btn btn-checkin', store.checkin.dates.indexOf(today) >= 0 ? '✅ 今日已打卡' : '📅 今日打卡');
    checkinBtn.addEventListener('click', function () { doCheckin(checkinBtn); });
    wrap.appendChild(checkinBtn);
    var again = makeEl('button', 'btn btn-primary', '再练一次');
    again.addEventListener('click', function () { startGame(state.level); });
    wrap.appendChild(again);
    var home = makeEl('button', 'btn', '返回首页');
    home.addEventListener('click', function () { viewHome(); });
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
  window.M = M;
})();
