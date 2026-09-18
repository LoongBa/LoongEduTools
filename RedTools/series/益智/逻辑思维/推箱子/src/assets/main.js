/* ============================================================
   推箱子 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   设计约束（对齐 series/益智/设计文档.md §5）：
   - 不使用 import/export / type="module"
   - 不超出 ES2017（无 ?. ?? 对象展开 replaceAll 等）；var + function 风格
   - 事件全部 addEventListener，无内联事件 / eval / innerHTML
   - 无 fetch/XHR/Worker；localStorage 读写 try/catch
   - 音效：Web Audio OscillatorNode 合成（无音频文件，合规）
   - 关卡数据：window.LEVELS（levels.js，Microban I by David W. Skinner）
   - 进度/成绩：localStorage key 带工具前缀
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };

  /* ---------- DOM ---------- */
  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');
  var footerEl = document.getElementById('app-footer');
  var boardEl = null;
  var cells = [];
  var moveNumEl = null;
  var pushNumEl = null;
  var levelTitleEl = null;
  var bestNumEl = null;
  var overlayEl = null;

  /* ---------- 常量 ---------- */
  var OPEN_LEVELS = 60;               // 当前开放关卡数（数据全量 155 关，扩关只改这里）
  var STORE_KEY = 'redtools.tuixiangzi.v1';
  var SWIPE = 24;                     // 滑动判定阈值 px
  var DIR = { LEFT: 0, UP: 1, RIGHT: 2, DOWN: 3 };
  // 方向 → 行列增量（idx = y*w + x；pr = idx%w 为列 x，pc = floor(idx/w) 为行 y）
  var DR = { 0: -1, 1: 0, 2: 1, 3: 0 };    // 列增量（x）
  var DC = { 0: 0, 1: -1, 2: 0, 3: 1 };    // 行增量（y）

  /* ---------- 状态 ---------- */
  var state = {
    level: 0,           // 当前关（0 基）
    w: 0, h: 0,         // 关卡尺寸
    walls: {},          // idx → true（墙）
    goals: {},          // idx → true（目标）
    boxes: {},          // idx → true（箱子）
    player: 0,          // 玩家 idx
    moves: 0, pushes: 0,
    won: false,
    undoStack: []
  };
  var touchStart = { x: 0, y: 0 };

  /* ---------- 持久化（redtools.tuixiangzi.v1） ---------- */
  function loadStore() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) { return JSON.parse(raw); }
    } catch (err) { /* ignore */ }
    return {
      version: 1,
      unlocked: 1,                    // 已解锁最大关（1 基）
      solved: {},                     // { N: {moves, pushes, stars, date} }
      checkin: { dates: [], streak: 0 },
      cur: null                       // 断局恢复
    };
  }
  function saveStore() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (err) { /* ignore */ }
  }
  var store = loadStore();
  saveStore(); // 初始化写入

  /* ---------- 工具函数 ---------- */
  function clearNode(node) {
    while (node.firstChild) { node.removeChild(node.firstChild); }
  }
  function makeEl(tag, className, text) {
    var el = document.createElement(tag);
    if (className) { el.className = className; }
    if (text !== undefined && text !== null) { el.textContent = text; }
    return el;
  }
  function fmtDate(d) {
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return '' + d.getFullYear() +
           (m < 10 ? '0' + m : '' + m) +
           (day < 10 ? '0' + day : '' + day);
  }
  function calcStreak(dates) {
    if (!dates || !dates.length) { return 0; }
    var set = {};
    for (var i = 0; i < dates.length; i++) { set[dates[i]] = true; }
    var cur = new Date();
    cur.setHours(0, 0, 0, 0);
    if (!set[fmtDate(cur)]) {
      cur.setDate(cur.getDate() - 1); // 今天未打则从昨天起算连续
    }
    var streak = 0;
    while (set[fmtDate(cur)]) {
      streak++;
      cur.setDate(cur.getDate() - 1);
    }
    return streak;
  }

  /* ---------- 音效（Web Audio 合成） ---------- */
  var actx = null;
  function ensureAudio() {
    try {
      if (!actx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) { actx = new AC(); }
      }
      if (actx && actx.state === 'suspended') { actx.resume(); }
    } catch (err) { /* ignore */ }
    return actx;
  }
  function tone(freq, dur, type, vol, delay) {
    var ac = ensureAudio();
    if (!ac) { return; }
    try {
      var t0 = ac.currentTime + (delay || 0);
      var osc = ac.createOscillator();
      var g = ac.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(vol || 0.1, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (err) { /* ignore */ }
  }
  function sndWalk() { tone(200, 0.05, 'sine', 0.04); }
  function sndPush() { tone(140, 0.07, 'triangle', 0.09); }
  function sndGoal() { tone(523, 0.09, 'triangle', 0.1); }
  function sndBlock() { tone(90, 0.08, 'square', 0.05); }
  function sndWin() {
    tone(523, 0.12, 'sine', 0.11, 0);
    tone(659, 0.12, 'sine', 0.11, 0.12);
    tone(784, 0.12, 'sine', 0.11, 0.24);
    tone(1047, 0.24, 'sine', 0.11, 0.36);
  }

  /* ---------- 关卡数据 ---------- */
  function buildLevel(idx) {
    // XSB 行 → 位集合；返回 {w,h,walls,goals,boxes,player}
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
  function bestPushes(levelIdx) {
    var b = window.LEVELS[levelIdx] && window.LEVELS[levelIdx].b;
    return (typeof b === 'number') ? b : null;
  }
  function isWon() {
    // 所有箱子都在目标上（箱子数 == 目标数，已由关卡保证）
    for (var k in state.boxes) {
      if (Object.prototype.hasOwnProperty.call(state.boxes, k)) {
        if (!state.goals[k]) { return false; }
      }
    }
    return true;
  }

  /* ---------- 游戏逻辑 ---------- */
  function tryMove(dir) {
    if (state.won) { return; }
    ensureAudio(); // 用户手势内创建 AudioContext
    var pr = state.player % state.w;
    var pc = Math.floor(state.player / state.w);
    var nr = pr + DR[dir];
    var nc = pc + DC[dir];
    if (nr < 0 || nr >= state.w || nc < 0 || nc >= state.h) { return; }
    var nIdx = nc * state.w + nr;
    if (state.walls[nIdx]) { return; }
    if (state.boxes[nIdx]) {
      // 推箱子
      var br = nr + DR[dir];
      var bc = nc + DC[dir];
      if (br < 0 || br >= state.w || bc < 0 || bc >= state.h) { return; }
      var bIdx = bc * state.w + br;
      if (state.walls[bIdx] || state.boxes[bIdx]) { sndBlock(); return; }
      pushUndo();
      delete state.boxes[nIdx];
      state.boxes[bIdx] = true;
      state.player = nIdx;
      state.pushes++;
      state.moves++;
      if (state.goals[bIdx]) { sndGoal(); } else { sndPush(); }
    } else {
      pushUndo();
      state.player = nIdx;
      state.moves++;
      sndWalk();
    }
    paint();
    updateStatsUI();
    saveCur();
    if (isWon()) {
      onWin();
    }
  }
  function pushUndo() {
    var boxesArr = [];
    for (var k in state.boxes) {
      if (Object.prototype.hasOwnProperty.call(state.boxes, k)) { boxesArr.push(k); }
    }
    state.undoStack.push({
      player: state.player,
      boxes: boxesArr,
      moves: state.moves,
      pushes: state.pushes
    });
    if (state.undoStack.length > 500) { state.undoStack.shift(); }
  }
  function undo() {
    if (state.won || !state.undoStack.length) { return; }
    var s = state.undoStack.pop();
    state.player = s.player;
    state.boxes = {};
    for (var i = 0; i < s.boxes.length; i++) { state.boxes[s.boxes[i]] = true; }
    state.moves = s.moves;
    state.pushes = s.pushes;
    paint();
    updateStatsUI();
    saveCur();
  }
  function restartLevel() {
    var lv = buildLevel(state.level);
    state.w = lv.w; state.h = lv.h;
    state.walls = lv.walls; state.goals = lv.goals;
    state.boxes = lv.boxes;
    state.player = lv.player;
    state.moves = 0; state.pushes = 0;
    state.won = false;
    state.undoStack = [];
    renderBoard();
    paint();
    updateStatsUI();
    updateTopbar();
    hideOverlay();
    saveCur();
  }
  function loadLevel(idx, keepHistory) {
    var lv = buildLevel(idx);
    state.level = idx;
    state.w = lv.w; state.h = lv.h;
    state.walls = lv.walls; state.goals = lv.goals;
    state.boxes = lv.boxes;
    state.player = lv.player;
    state.moves = 0; state.pushes = 0;
    state.won = false;
    state.undoStack = [];
    renderBoard();
    paint();
    updateStatsUI();
    updateTopbar();
    hideOverlay();
    if (!keepHistory) { saveCur(); }
  }

  /* ---------- 通关 / 星级 ---------- */
  function calcStars(pushes, best) {
    if (best === null || best === undefined) { return 2; } // 无基准关：通关 2 星封顶
    if (pushes <= Math.ceil(best * 1.5)) { return 3; }
    if (pushes <= Math.ceil(best * 2.5)) { return 2; }
    return 1;
  }
  function starsText(n) {
    var s = '';
    for (var i = 0; i < 3; i++) { s += (i < n) ? '★' : '☆'; }
    return s;
  }
  function onWin() {
    state.won = true;
    sndWin();
    var no = state.level + 1;
    var best = bestPushes(state.level);
    var stars = calcStars(state.pushes, best);
    var prev = store.solved[no];
    if (!prev || stars > prev.stars) {
      store.solved[no] = { moves: state.moves, pushes: state.pushes, stars: stars, date: fmtDate(new Date()) };
    }
    if (no + 1 <= OPEN_LEVELS && store.unlocked < no + 1) {
      store.unlocked = no + 1;
    }
    doCheckin();
    store.cur = null; // 通关后不再恢复
    saveStore();
    renderFooter();
    renderLevelPicker(); // 刷新选关页星级/解锁（隐藏状态）
    // 结算浮层
    var notes = [];
    notes.push({ cls: 'checkin-line', text: '✅ 今日已打卡 · 连续 ' + (store.checkin.streak || 0) + ' 天' });
    var btns = [];
    if (no < OPEN_LEVELS) {
      btns.push({ text: '下一关', cls: 'btn-main', act: function () {
        hideOverlay();
        loadLevel(state.level + 1, true);
      } });
    }
    btns.push({ text: '再玩一次', cls: 'btn-ghost', act: function () { restartLevel(); } });
    btns.push({ text: '选关', cls: 'btn-ghost', act: function () { showLevelPicker(); } });
    var sub = '移动 ' + state.moves + ' · 推动 ' + state.pushes +
             (best !== null ? '（最优 ' + best + ' 推）' : '');
    showOverlay('🎉 过关啦！', sub, notes, btns);
    showStarsInOverlay(stars);
  }
  function showStarsInOverlay(stars) {
    if (!overlayEl) { return; }
    var sum = overlayEl.querySelector('.summary');
    if (!sum) { return; }
    var st = makeEl('div', 'stars-line', starsText(stars));
    sum.insertBefore(st, sum.firstChild);
  }

  /* ---------- 渲染：头部 / 页脚 ---------- */
  function renderHeader() {
    clearNode(headerEl);
    var ver = APP.meta && APP.meta.version ? 'v' + APP.meta.version : '';
    if (ver) { headerEl.appendChild(makeEl('span', 'ver-badge', ver)); }
  }
  function renderFooter() {
    clearNode(footerEl);
    var streak = store.checkin && store.checkin.streak ? store.checkin.streak : 0;
    var txt = streak > 0
      ? '完成一关点亮今日 · 已连续打卡 ' + streak + ' 天'
      : '把箱子推到圆点上即可过关 · 滑动/方向键移动';
    footerEl.appendChild(makeEl('span', 'footer-checkin', txt));
  }

  /* ---------- 渲染：顶栏 ---------- */
  function updateTopbar() {
    if (!levelTitleEl) { return; }
    levelTitleEl.textContent = '第 ' + (state.level + 1) + ' / ' + OPEN_LEVELS + ' 关';
    var best = bestPushes(state.level);
    if (bestNumEl) {
      bestNumEl.textContent = best !== null ? '最优 ' + best + ' 推' : '';
    }
  }

  /* ---------- 渲染：棋盘 ---------- */
  function renderBoard() {
    if (!boardEl) { return; }
    clearNode(boardEl);
    cells = [];
    boardEl.style.paddingBottom = (state.h / state.w * 100).toFixed(2) + '%';
    var total = state.w * state.h;
    for (var i = 0; i < total; i++) {
      var cell = makeEl('div', 'cell');
      var col = i % state.w;
      var row = Math.floor(i / state.w);
      cell.style.left = (col / state.w * 100).toFixed(3) + '%';
      cell.style.top = (row / state.h * 100).toFixed(3) + '%';
      cell.style.width = (100 / state.w).toFixed(3) + '%';
      cell.style.height = (100 / state.h).toFixed(3) + '%';
      boardEl.appendChild(cell);
      cells.push(cell);
    }
  }
  function paint() {
    for (var i = 0; i < cells.length; i++) {
      var cls = 'cell';
      if (state.walls[i]) {
        cls += ' wall';
      } else {
        var isGoal = !!state.goals[i];
        var isBox = !!state.boxes[i];
        var isPlayer = (i === state.player);
        if (isBox) {
          cls += isGoal ? ' box goal boxgoal' : ' box';
        } else if (isPlayer) {
          cls += isGoal ? ' player playergoal' : ' player';
        } else if (isGoal) {
          cls += ' goal';
        }
      }
      cells[i].className = cls;
    }
  }
  function updateStatsUI() {
    if (moveNumEl) { moveNumEl.textContent = '' + state.moves; }
    if (pushNumEl) { pushNumEl.textContent = '' + state.pushes; }
  }

  /* ---------- 渲染：游戏视图 ---------- */
  function renderGameView(levelIdx) {
    clearNode(viewEl);
    // 顶栏：选关入口 + 关卡信息 + 最优
    var topbar = makeEl('div', 'topbar');
    var btnLevels = makeEl('button', 'btn-ghost-sm', '选关');
    btnLevels.setAttribute('aria-label', '选择关卡');
    btnLevels.addEventListener('click', showLevelPicker);
    topbar.appendChild(btnLevels);
    levelTitleEl = makeEl('span', 'level-title', '');
    topbar.appendChild(levelTitleEl);
    bestNumEl = makeEl('span', 'best-num', '');
    topbar.appendChild(bestNumEl);
    viewEl.appendChild(topbar);

    // 棋盘
    boardEl = makeEl('div', 'board');
    viewEl.appendChild(boardEl);

    // 统计
    var stats = makeEl('div', 'stats');
    stats.appendChild(makeEl('span', null, '移动 '));
    moveNumEl = makeEl('span', 'stat-num', '0');
    stats.appendChild(moveNumEl);
    stats.appendChild(makeEl('span', null, ' · 推动 '));
    pushNumEl = makeEl('span', 'stat-num', '0');
    stats.appendChild(pushNumEl);
    viewEl.appendChild(stats);

    // 十字 D-pad
    var dpad = makeEl('div', 'dpad');
    var padBtns = [
      { text: '▲', dir: DIR.UP, cls: 'dpad-up', label: '向上移动' },
      { text: '◀', dir: DIR.LEFT, cls: 'dpad-left', label: '向左移动' },
      { text: '▼', dir: DIR.DOWN, cls: 'dpad-down', label: '向下移动' },
      { text: '▶', dir: DIR.RIGHT, cls: 'dpad-right', label: '向右移动' }
    ];
    for (var i = 0; i < padBtns.length; i++) {
      (function (item) {
        var btn = makeEl('button', 'dpad-btn ' + item.cls, item.text);
        btn.setAttribute('aria-label', item.label);
        btn.addEventListener('click', function () { tryMove(item.dir); });
        dpad.appendChild(btn);
      })(padBtns[i]);
    }
    viewEl.appendChild(dpad);

    // 撤销 / 重开
    var btnRow = makeEl('div', 'btn-row');
    var btnUndo = makeEl('button', 'btn-ghost', '↺ 撤销');
    btnUndo.setAttribute('aria-label', '撤销一步');
    btnUndo.addEventListener('click', undo);
    btnRow.appendChild(btnUndo);
    var btnRestart = makeEl('button', 'btn-ghost', '↻ 重开');
    btnRestart.setAttribute('aria-label', '重新开始本关');
    btnRestart.addEventListener('click', restartLevel);
    btnRow.appendChild(btnRestart);
    viewEl.appendChild(btnRow);

    viewEl.appendChild(makeEl('div', 'hint',
      '滑动屏幕或方向键移动 · 把箱子推到黄色圆点 · Z 撤销 R 重开'));

    // 当前关卡
    if (typeof levelIdx === 'number') {
      loadLevel(levelIdx, true);       // 从选关页指定进入
    } else if (store.cur && store.cur.level >= 0 && store.cur.level < OPEN_LEVELS &&
        store.cur.level !== undefined) {
      restoreCur();
    } else {
      loadLevel(0, true);
    }
  }

  /* ---------- 渲染：选关视图 ---------- */
  function showLevelPicker() {
    hideOverlay(); // 结算浮层点「选关」时先关闭浮层，避免遮挡选关页
    clearNode(viewEl);
    var topbar = makeEl('div', 'topbar');
    var btnBack = makeEl('button', 'btn-ghost-sm', '← 返回');
    btnBack.setAttribute('aria-label', '返回游戏');
    btnBack.addEventListener('click', function () { renderGameView(); });
    topbar.appendChild(btnBack);
    topbar.appendChild(makeEl('span', 'level-title', '选择关卡'));
    viewEl.appendChild(topbar);

    var grid = makeEl('div', 'pick-grid');
    for (var i = 1; i <= OPEN_LEVELS; i++) {
      (function (no) {
        var locked = no > store.unlocked;
        var btn = makeEl('button', 'pick-btn' + (locked ? ' locked' : ''),
                         locked ? '🔒' : '' + no);
        btn.setAttribute('aria-label', '第' + no + '关' + (locked ? '（未解锁）' : ''));
        if (!locked) {
          var sol = store.solved[no];
          if (sol) {
            var st = makeEl('span', 'pick-stars', starsText(sol.stars));
            btn.appendChild(st);
          }
        }
        btn.addEventListener('click', function () {
          if (locked) { return; }
          renderGameView(no - 1);   // 重建游戏视图并加载指定关
        });
        grid.appendChild(btn);
      })(i);
    }
    viewEl.appendChild(grid);
    viewEl.appendChild(makeEl('div', 'credit',
      '关卡：Microban I by David W. Skinner（免费分发，保留署名）'));
  }
  function renderLevelPicker() {
    // 通关后刷新选关页（若正在显示选关页）
    if (viewEl.querySelector('.pick-grid')) { showLevelPicker(); }
  }

  /* ---------- 结算浮层 ---------- */
  function hideOverlay() {
    if (overlayEl && overlayEl.parentNode) {
      overlayEl.parentNode.removeChild(overlayEl);
    }
    overlayEl = null;
  }
  function showOverlay(title, sub, noteLines, btns) {
    hideOverlay();
    var ov = makeEl('div', 'overlay');
    var card = makeEl('div', 'overlay-card');
    card.appendChild(makeEl('div', 'overlay-title', title));
    if (sub) { card.appendChild(makeEl('div', 'overlay-sub', sub)); }
    var sum = makeEl('div', 'summary');
    for (var i = 0; i < noteLines.length; i++) {
      sum.appendChild(makeEl('div', noteLines[i].cls, noteLines[i].text));
    }
    card.appendChild(sum);
    var btnsBox = makeEl('div', 'overlay-btns');
    for (var j = 0; j < btns.length; j++) {
      (function (b) {
        var btn = makeEl('button', b.cls, b.text);
        btn.addEventListener('click', function () { b.act(); });
        btnsBox.appendChild(btn);
      })(btns[j]);
    }
    card.appendChild(btnsBox);
    ov.appendChild(card);
    document.body.appendChild(ov);
    overlayEl = ov;
  }

  /* ---------- 打卡 ---------- */
  function doCheckin() {
    if (!store.checkin) { store.checkin = { dates: [], streak: 0 }; }
    var today = fmtDate(new Date());
    var dates = store.checkin.dates || [];
    if (dates.indexOf(today) < 0) { dates.push(today); }
    dates.sort();
    while (dates.length > 365) { dates.shift(); } // 滚动 365 天
    store.checkin.dates = dates;
    store.checkin.streak = calcStreak(dates);
  }

  /* ---------- 断局恢复 ---------- */
  function saveCur() {
    var boxesArr = [];
    for (var k in state.boxes) {
      if (Object.prototype.hasOwnProperty.call(state.boxes, k)) { boxesArr.push(k); }
    }
    store.cur = {
      level: state.level,
      player: state.player,
      boxes: boxesArr,
      moves: state.moves,
      pushes: state.pushes
    };
    saveStore();
  }
  function restoreCur() {
    var cur = store.cur;
    if (!cur || typeof cur.level !== 'number' || cur.level < 0 || cur.level >= OPEN_LEVELS) {
      loadLevel(0, true);
      return;
    }
    var lv = buildLevel(cur.level);
    state.level = cur.level;
    state.w = lv.w; state.h = lv.h;
    state.walls = lv.walls; state.goals = lv.goals;
    state.boxes = {};
    var boxes = cur.boxes || [];
    for (var i = 0; i < boxes.length; i++) { state.boxes[boxes[i]] = true; }
    state.player = (typeof cur.player === 'number') ? cur.player : lv.player;
    state.moves = cur.moves || 0;
    state.pushes = cur.pushes || 0;
    state.won = false;
    state.undoStack = [];
    renderBoard();
    paint();
    updateStatsUI();
    updateTopbar();
  }

  /* ---------- 输入 ---------- */
  function onKeyDown(e) {
    var kc = e.keyCode || e.which;
    var dir = -1;
    if (kc === 37 || kc === 65) { dir = DIR.LEFT; }
    else if (kc === 38 || kc === 87) { dir = DIR.UP; }
    else if (kc === 39 || kc === 68) { dir = DIR.RIGHT; }
    else if (kc === 40 || kc === 83) { dir = DIR.DOWN; }
    if (dir >= 0) {
      e.preventDefault();
      tryMove(dir);
      return;
    }
    if (kc === 90) { undo(); }        // Z
    else if (kc === 82) { restartLevel(); }  // R
  }
  function onTouchStart(e) {
    var t = e.touches && e.touches[0];
    if (!t) { return; }
    touchStart.x = t.clientX;
    touchStart.y = t.clientY;
  }
  function onTouchEnd(e) {
    var t = e.changedTouches && e.changedTouches[0];
    if (!t) { return; }
    var dx = t.clientX - touchStart.x;
    var dy = t.clientY - touchStart.y;
    if (Math.abs(dx) < SWIPE && Math.abs(dy) < SWIPE) { return; } // 防误触
    var dir;
    if (Math.abs(dx) > Math.abs(dy)) {
      dir = dx > 0 ? DIR.RIGHT : DIR.LEFT;
    } else {
      dir = dy > 0 ? DIR.DOWN : DIR.UP;
    }
    tryMove(dir);
  }
  function onTouchMove(e) {
    // 棋盘上阻止浏览器滚动/下拉刷新
    if (e.cancelable) { e.preventDefault(); }
  }

  /* ---------- 启动 ---------- */
  function syncAppHeight() {
    var docEl = document.documentElement;
    var vh = window.innerHeight || docEl.clientHeight;
    docEl.style.setProperty('--app-height', vh + 'px');
  }
  function bindInput() {
    window.addEventListener('keydown', onKeyDown);
    var board = document.getElementById('view');
    board.addEventListener('touchstart', onTouchStart, { passive: true });
    board.addEventListener('touchend', onTouchEnd, { passive: true });
    board.addEventListener('touchmove', onTouchMove, { passive: false });
  }
  function init() {
    renderHeader();
    renderFooter();
    renderGameView();
    bindInput();
  }

  if (window.addEventListener) {
    window.addEventListener('resize', syncAppHeight);
  }
  syncAppHeight();
  init();
})();
