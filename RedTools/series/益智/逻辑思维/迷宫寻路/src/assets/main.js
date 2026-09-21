/* ============================================================
   迷宫寻路 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   设计约束（对齐 series/益智/设计文档.md §5）：
   - 不使用 import/export / type="module"
   - 不超出 ES2017（无 ?. ?? 对象展开 replaceAll 等）；var + function 风格
   - 事件全部 addEventListener，无内联事件 / eval / innerHTML
   - 无 fetch/XHR/Worker；localStorage 读写 try/catch
   - 音效：Web Audio OscillatorNode 合成（无音频文件，合规）
   - 迷宫：递归回溯（recursive backtracker）程序化生成完美迷宫，
     seed 注入（Date.now() % 100000）保证断局恢复可重放同一迷宫
   - 进度/成绩：localStorage key 带工具前缀 redtools.migongxunlu.v1
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
  var titleEl = null;
  var timerEl = null;
  var stepsEl = null;
  var moveNumEl = null;
  var bestNumEl = null;
  var hintBtnEl = null;
  var overlayEl = null;

  /* ---------- 常量 ---------- */
  var STORE_KEY = 'redtools.migongxunlu.v1';
  LX_SHARED.storage.configure({ toolName: 'migongxunlu' });  // V0.4 迁移：键前缀 redtools.migongxunlu.v1
  var SWIPE = 24;                 // 滑动判定阈值 px（同推箱子）
  var DIR = { LEFT: 0, UP: 1, RIGHT: 2, DOWN: 3 };
  var DR = { 0: -1, 1: 0, 2: 1, 3: 0 };  // 列增量（x）
  var DC = { 0: 0, 1: -1, 2: 0, 3: 1 };  // 行增量（y）
  var DIFFS = [
    { key: '7', name: '简单', size: 7 },
    { key: '11', name: '普通', size: 11 },
    { key: '15', name: '困难', size: 15 }
  ];

  /* ---------- 状态 ---------- */
  var state = {
    size: 7,
    seed: 0,
    pass: null,            // idx → true：通路格（墙 = 非通路）
    player: 0,             // 玩家所在 idx
    visited: [],           // 足迹：经过的格子 idx 数组
    steps: 0,              // 已走步数
    bestSteps: 0,          // BFS 最优步数（星级基准）
    hintUsed: false,       // 是否用过提示（用后星级封顶 2 星）
    hintActive: false,     // 提示路径是否显示中
    hintMap: {},           // 提示路径格 idx → true
    ms: 0,                 // 已累计用时（ms）
    startStamp: 0,         // 当前计时起点时间戳（Date.now()）
    won: false,
    playing: false         // 是否处于游戏中（难度页为 false）
  };
  var timerId = 0;
  var touchStart = { x: 0, y: 0 };

  /* ---------- 持久化（redtools.migongxunlu.v1） ---------- */
  function defaultStore() {
    return {
      version: 1,
      best: {},                     // { "7": {ms,steps,date}, "11": {...}, "15": {...} }
      recent: {},                   // 预留
      checkin: { dates: [], streak: 0 },
      history: [],                  // 滚动 30 条 {date,size,ms,steps,stars}
      cur: null                     // 断局恢复
    };
  }
  function loadStore() {
    try {
      var raw = LX_SHARED.storage.get('v1');
      if (raw) {
        var obj = raw;
        if (obj && obj.version === 1) {
          if (!obj.best) { obj.best = {}; }
          if (!obj.recent) { obj.recent = {}; }
          if (!obj.checkin) { obj.checkin = { dates: [], streak: 0 }; }
          if (!obj.history) { obj.history = []; }
          if (obj.history.length > 30) { obj.history = obj.history.slice(-30); }
          return obj;
        }
      }
    } catch (err) { /* ignore */ }
    return defaultStore();
  }
  function saveStore() {
    try {
      LX_SHARED.storage.set('v1', store);
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
    return LX_SHARED.progress.streak(dates);
}
  function fmtTime(ms) {
    // 秒 + 1 位小数，如 07.5
    var sec = Math.max(0, ms) / 1000;
    var t = Math.floor(sec);
    var d = Math.floor((sec - t) * 10);
    return (t < 10 ? '0' + t : '' + t) + '.' + d;
  }
  function fmtBestTime(ms) {
    // 分:秒，如 00:12
    var total = Math.max(0, Math.round(ms / 1000));
    var m = Math.floor(total / 60);
    var s = total % 60;
    return (m < 10 ? '0' + m : '' + m) + ':' + (s < 10 ? '0' + s : '' + s);
  }

  /* ---------- 音效（Web Audio 合成，同推箱子） ---------- */
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
  function sndBlock() { tone(90, 0.08, 'square', 0.05); }
  function sndGoal() { tone(523, 0.09, 'triangle', 0.1); }
  function sndWin() {
    tone(523, 0.12, 'sine', 0.11, 0);
    tone(659, 0.12, 'sine', 0.11, 0.12);
    tone(784, 0.12, 'sine', 0.11, 0.24);
    tone(1047, 0.24, 'sine', 0.11, 0.36);
  }

  /* ---------- 迷宫生成（递归回溯） ---------- */
  function makeRng(seed) {
    // 线性同余生成器：给定 seed 产出确定序列，保证断局恢复可重放同一迷宫
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function genMaze(size, seed) {
    // 递归回溯（recursive backtracker）：奇数尺寸方格，所有格初始为墙；
    // 从 (0,0) 房间出发，随机挑相邻两格外的未访问房间，打通中间墙，栈回溯。
    // 生成结果 = 完美迷宫：任意两房间唯一通路，(0,0) 与 (n-1,n-1) 必然连通。
    var n = size;
    var rnd = makeRng(seed);
    var pass = {};      // 已打通的通路格
    var visited = {};   // 已访问房间
    function cellIdx(x, y) { return y * n + x; }
    pass[cellIdx(0, 0)] = true;
    visited[cellIdx(0, 0)] = true;
    var stack = [[0, 0]];
    while (stack.length > 0) {
      var cur = stack[stack.length - 1];
      var cx = cur[0];
      var cy = cur[1];
      // 四方向洗牌（随机决定下一个打通方向）
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var i = dirs.length - 1; i > 0; i--) {
        var j = Math.floor(rnd() * (i + 1));
        var t = dirs[i];
        dirs[i] = dirs[j];
        dirs[j] = t;
      }
      var carved = false;
      for (var d = 0; d < dirs.length; d++) {
        var nx = cx + dirs[d][0] * 2;
        var ny = cy + dirs[d][1] * 2;
        if (nx < 0 || nx >= n || ny < 0 || ny >= n) { continue; }
        if (visited[cellIdx(nx, ny)]) { continue; }
        pass[cellIdx(cx + dirs[d][0], cy + dirs[d][1])] = true; // 打通中间墙
        pass[cellIdx(nx, ny)] = true;                            // 打通目标房间
        visited[cellIdx(nx, ny)] = true;
        stack.push([nx, ny]);
        carved = true;
        break;
      }
      if (!carved) { stack.pop(); } // 死路回溯
    }
    // 双保险：起点与终点必为通路
    pass[cellIdx(0, 0)] = true;
    pass[cellIdx(n - 1, n - 1)] = true;
    return pass;
  }

  /* ---------- BFS 最短路 ---------- */
  function bfsShortest(size, pass, startIdx, goalIdx) {
    // BFS（队列 + 头指针，不用 shift）：求起点到终点最短步数，
    // 同时记录 parent 便于还原最优路径（提示用）。
    var n = size;
    var dist = {};
    var parent = {};
    var queue = [startIdx];
    var head = 0;
    var dxs = [1, -1, 0, 0];
    var dys = [0, 0, 1, -1];
    dist[startIdx] = 0;
    parent[startIdx] = -1;
    var found = false;
    while (head < queue.length) {
      var cur = queue[head];
      head++;
      if (cur === goalIdx) { found = true; break; }
      var cx = cur % n;
      var cy = Math.floor(cur / n);
      for (var d = 0; d < 4; d++) {
        var nx = cx + dxs[d];
        var ny = cy + dys[d];
        if (nx < 0 || nx >= n || ny < 0 || ny >= n) { continue; }
        var ni = ny * n + nx;
        if (!pass[ni]) { continue; }
        if (dist[ni] !== undefined) { continue; }
        dist[ni] = dist[cur] + 1;
        parent[ni] = cur;
        queue.push(ni);
      }
    }
    if (!found) { return { dist: 0, path: [] }; }
    // 从终点回溯还原路径（不含起点，含终点）
    var path = [];
    var node = goalIdx;
    while (node !== startIdx) {
      path.unshift(node);
      node = parent[node];
    }
    return { dist: dist[goalIdx], path: path };
  }
  function computePathInfo() {
    // 计算最优步数基准；若已开提示则同时构建高亮路径集合
    var bfs = bfsShortest(state.size, state.pass, 0, state.size * state.size - 1);
    state.bestSteps = bfs.dist;
    if (state.hintActive) {
      state.hintMap = {};
      for (var k = 0; k < bfs.path.length; k++) { state.hintMap[bfs.path[k]] = true; }
    } else {
      state.hintMap = {};
    }
  }

  /* ---------- 计时 ---------- */
  function currentElapsed() {
    return state.ms + (Date.now() - state.startStamp);
  }
  function startTimer() {
    stopTimer();
    timerId = setInterval(function () {
      if (!state.won) { updateTimerUI(); }
    }, 100);
  }
  function stopTimer() {
    if (timerId) { clearInterval(timerId); timerId = 0; }
  }
  function updateTimerUI() {
    if (timerEl) { timerEl.textContent = '⏱ ' + fmtTime(currentElapsed()); }
  }

  /* ---------- 游戏逻辑 ---------- */
  function newMaze() {
    // 生成新迷宫：新 seed + 重置玩家/足迹/计时
    var seed = Date.now() % 100000;
    state.seed = seed;
    state.pass = genMaze(state.size, seed);
    state.player = 0;
    state.visited = [0];
    state.steps = 0;
    state.won = false;
    state.hintUsed = false;
    state.hintActive = false;
    state.hintMap = {};
    state.ms = 0;
    state.startStamp = Date.now();
    state.playing = true;
    computePathInfo();
    startTimer();
  }
  function tryMove(dir) {
    if (!state.playing || state.won) { return; }
    ensureAudio(); // 用户手势内创建 AudioContext
    var n = state.size;
    var px = state.player % n;
    var py = Math.floor(state.player / n);
    var nx = px + DR[dir];
    var ny = py + DC[dir];
    if (nx < 0 || nx >= n || ny < 0 || ny >= n) { sndBlock(); return; }
    var ni = ny * n + nx;
    if (!state.pass[ni]) { sndBlock(); return; } // 撞墙
    state.player = ni;
    state.steps++;
    if (state.visited.indexOf(ni) < 0) { state.visited.push(ni); } // 记录足迹
    sndWalk();
    paint();
    updateStatsUI();
    updateTimerUI();
    saveCur();
    if (ni === n * n - 1) { onWin(); }
  }
  function useHint() {
    if (!state.playing || state.won || state.hintUsed) { return; }
    ensureAudio();
    state.hintUsed = true;
    state.hintActive = true;
    computePathInfo();
    if (hintBtnEl) {
      hintBtnEl.textContent = '💡 已用提示';
      hintBtnEl.disabled = true;
    }
    paint();
    saveCur();
    sndGoal();
  }
  function restartLevel() {
    // 同难度新迷宫（再来一局 / 重新生成共用）
    hideOverlay();
    newMaze();
    if (boardEl) { renderBoard(); paint(); }
    updateStatsUI();
    updateTimerUI();
    if (hintBtnEl) {
      hintBtnEl.textContent = '💡 提示';
      hintBtnEl.disabled = false;
    }
    saveCur();
  }

  /* ---------- 通关 / 星级 ---------- */
  function betterThan(stepsA, msA, stepsB, msB) {
    // 最佳成绩判定：步数少优先，同步数比用时
    if (stepsA !== stepsB) { return stepsA < stepsB; }
    return msA < msB;
  }
  function calcStars(steps, best, hintUsed) {
    var s;
    if (steps <= Math.ceil(best * 1.5)) { s = 3; }
    else if (steps <= Math.ceil(best * 2.5)) { s = 2; }
    else { s = 1; }
    if (hintUsed && s > 2) { s = 2; } // 用提示封顶 2 星
    return s;
  }
  function starsText(n) {
    var s = '';
    for (var i = 0; i < 3; i++) { s += (i < n) ? '★' : '☆'; }
    return s;
  }
  function onWin() {
    state.won = true;
    stopTimer();
    state.ms = currentElapsed(); // 定格用时
    sndWin();
    var size = state.size;
    var steps = state.steps;
    var ms = state.ms;
    var bestSteps = state.bestSteps;
    var stars = calcStars(steps, bestSteps, state.hintUsed);
    // 出口格高亮动画（玩家所在即出口）
    var pcell = cells[state.player];
    if (pcell) { pcell.className = pcell.className + ' cell-win'; }
    // 更新最佳成绩（步数少优先，同步数比用时）
    var key = String(size);
    var best = store.best[key];
    if (!best || betterThan(steps, ms, best.steps, best.ms)) {
      store.best[key] = { ms: Math.round(ms), steps: steps, date: fmtDate(new Date()) };
    }
    // 历史记录（滚动 30 条）
    store.history.push({ date: fmtDate(new Date()), size: size, ms: Math.round(ms), steps: steps, stars: stars });
    while (store.history.length > 30) { store.history.shift(); }
    doCheckin();
    store.cur = null; // 通关后不再恢复
    saveStore();
    renderFooter();
    // 结算浮层
    var notes = [
      { cls: 'checkin-line', text: '✅ 今日已打卡 · 连续 ' + (store.checkin.streak || 0) + ' 天' }
    ];
    var btns = [
      { text: '再来一局', cls: 'btn-main', act: function () { restartLevel(); } },
      { text: '换个难度', cls: 'btn-ghost', act: function () {
        hideOverlay();
        stopTimer();
        store.cur = null;
        saveStore();
        showDifficultyView();
      } }
    ];
    var sub = '用时 ' + fmtTime(ms) + ' 秒 · 步数 ' + steps + ' · 最优 ' + bestSteps + ' 步';
    showOverlay('🎉 到达终点！', sub, notes, btns);
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
      ? '完成一局点亮今日 · 已连续打卡 ' + streak + ' 天'
      : '滑动或方向键移动 · 从左上角走到出口';
    footerEl.appendChild(makeEl('span', 'footer-checkin', txt));
  }

  /* ---------- 渲染：棋盘 ---------- */
  function renderBoard() {
    if (!boardEl) { return; }
    clearNode(boardEl);
    cells = [];
    boardEl.style.paddingBottom = '100%'; // 方形迷宫（w === h）
    var n = state.size;
    var total = n * n;
    for (var i = 0; i < total; i++) {
      var cell = makeEl('div', 'cell');
      var col = i % n;
      var row = Math.floor(i / n);
      cell.style.left = (col / n * 100).toFixed(3) + '%';
      cell.style.top = (row / n * 100).toFixed(3) + '%';
      cell.style.width = (100 / n).toFixed(3) + '%';
      cell.style.height = (100 / n).toFixed(3) + '%';
      boardEl.appendChild(cell);
      cells.push(cell);
    }
  }
  function paint() {
    // 渲染优先序：墙 > 玩家 > 起点 > 出口 > 提示路径 > 足迹
    var n = state.size;
    var total = n * n;
    var startI = 0;
    var goalI = total - 1;
    var vset = {};
    for (var v = 0; v < state.visited.length; v++) { vset[state.visited[v]] = true; }
    for (var i = 0; i < cells.length; i++) {
      var cls = 'cell';
      if (!state.pass[i]) {
        cls += ' wall';
      } else {
        var isPlayer = (i === state.player);
        var isStart = (i === startI);
        var isGoal = (i === goalI);
        if (isPlayer) {
          cls += isGoal ? ' player ongoingal' : ' player';
        } else if (isStart) {
          cls += ' start';
        } else if (isGoal) {
          cls += ' goal';
        } else if (state.hintActive && state.hintMap[i]) {
          cls += ' path';
        } else if (vset[i]) {
          cls += ' visited';
        }
      }
      cells[i].className = cls;
    }
  }
  function updateStatsUI() {
    if (moveNumEl) { moveNumEl.textContent = '' + state.steps; }
    if (stepsEl) { stepsEl.textContent = '步 ' + state.steps; }
    if (bestNumEl) { bestNumEl.textContent = '最优 ' + state.bestSteps + ' 步'; }
  }

  /* ---------- 渲染：游戏视图 ---------- */
  function getDiffName(size) {
    for (var i = 0; i < DIFFS.length; i++) {
      if (DIFFS[i].size === size) { return DIFFS[i].name; }
    }
    return '';
  }
  function renderGameView() {
    clearNode(viewEl);
    // 顶栏：← 返回 + 难度名 + ⏱ 计时 + 步数
    var topbar = makeEl('div', 'topbar');
    var btnBack = makeEl('button', 'btn-ghost-sm', '← 返回');
    btnBack.setAttribute('aria-label', '返回难度选择');
    btnBack.addEventListener('click', function () {
      stopTimer();
      store.cur = null;
      saveStore();
      showDifficultyView();
    });
    topbar.appendChild(btnBack);
    titleEl = makeEl('span', 'level-title', getDiffName(state.size));
    topbar.appendChild(titleEl);
    timerEl = makeEl('span', 'top-timer', '⏱ 00.0');
    topbar.appendChild(timerEl);
    stepsEl = makeEl('span', 'top-steps', '步 0');
    topbar.appendChild(stepsEl);
    viewEl.appendChild(topbar);

    // 棋盘
    boardEl = makeEl('div', 'board');
    viewEl.appendChild(boardEl);
    renderBoard();
    paint();

    // 统计：步数 / 最优
    var stats = makeEl('div', 'stats');
    stats.appendChild(makeEl('span', null, '步数 '));
    moveNumEl = makeEl('span', 'stat-num', '0');
    stats.appendChild(moveNumEl);
    stats.appendChild(makeEl('span', null, ' · '));
    bestNumEl = makeEl('span', 'best-num', '');
    stats.appendChild(bestNumEl);
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

    // 按钮行：💡 提示 / ↻ 重新生成
    var btnRow = makeEl('div', 'btn-row');
    hintBtnEl = makeEl('button', 'btn-ghost', state.hintUsed ? '💡 已用提示' : '💡 提示');
    hintBtnEl.setAttribute('aria-label', '显示最短路径提示');
    hintBtnEl.addEventListener('click', useHint);
    if (state.hintUsed) { hintBtnEl.disabled = true; }
    btnRow.appendChild(hintBtnEl);
    var btnNew = makeEl('button', 'btn-ghost', '↻ 重新生成');
    btnNew.setAttribute('aria-label', '重新生成迷宫');
    btnNew.addEventListener('click', restartLevel);
    btnRow.appendChild(btnNew);
    viewEl.appendChild(btnRow);

    viewEl.appendChild(makeEl('div', 'hint',
      '滑动或方向键移动 · 从左上角走到出口'));

    updateStatsUI();
    updateTimerUI();
  }

  /* ---------- 渲染：难度选择视图 ---------- */
  function showDifficultyView() {
    stopTimer();
    state.playing = false;
    clearNode(viewEl);
    var topbar = makeEl('div', 'topbar');
    topbar.appendChild(makeEl('span', 'level-title', '迷宫寻路'));
    viewEl.appendChild(topbar);

    var list = makeEl('div', 'diff-list');
    for (var i = 0; i < DIFFS.length; i++) {
      (function (d) {
        var btn = makeEl('button', 'diff-btn');
        var best = store.best[d.key];
        var head = makeEl('span', 'diff-head', '👉 ' + d.name + ' ' + d.size + '×' + d.size);
        btn.appendChild(head);
        var sub = best
          ? '最佳: ' + best.steps + '步 · ' + fmtBestTime(best.ms)
          : '暂无成绩 · 来挑战！';
        btn.appendChild(makeEl('span', 'diff-sub', sub));
        btn.setAttribute('aria-label', d.name + '迷宫 ' + d.size + '×' + d.size);
        btn.addEventListener('click', function () { startGame(d.key); });
        list.appendChild(btn);
      })(DIFFS[i]);
    }
    viewEl.appendChild(list);
  }
  function startGame(sizeKey) {
    var d = null;
    for (var i = 0; i < DIFFS.length; i++) {
      if (DIFFS[i].key === sizeKey) { d = DIFFS[i]; break; }
    }
    if (!d) { return; }
    state.size = d.size;
    newMaze();
    renderGameView();
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
    // 计时基线重置：存累计 ms + 新起点时间戳，恢复时续算
    state.ms = currentElapsed();
    state.startStamp = Date.now();
    store.cur = {
      size: state.size,
      seed: state.seed,
      player: state.player,
      visited: state.visited.slice(),
      steps: state.steps,
      ms: state.ms,
      startStamp: state.startStamp,
      hintUsed: state.hintUsed,
      hintActive: state.hintActive
    };
    saveStore();
  }
  function isValidSize(s) {
    return s === 7 || s === 11 || s === 15;
  }
  function restoreCur() {
    // 按 seed 重放生成器还原同一迷宫，恢复玩家/足迹/步数/计时
    var cur = store.cur;
    if (!cur || !isValidSize(cur.size) || typeof cur.seed !== 'number') { return false; }
    if (typeof cur.player !== 'number' || cur.player < 0 ||
        cur.player >= cur.size * cur.size) { return false; }
    state.size = cur.size;
    state.seed = cur.seed;
    state.pass = genMaze(state.size, cur.seed);
    if (!state.pass[cur.player]) { return false; } // 玩家必须站在通路上
    state.player = cur.player;
    state.visited = [];
    var vs = cur.visited || [];
    for (var i = 0; i < vs.length; i++) {
      var v = vs[i];
      if (typeof v === 'number' && v >= 0 && v < state.size * state.size) {
        state.visited.push(v);
      }
    }
    if (state.visited.indexOf(state.player) < 0) { state.visited.push(state.player); }
    state.steps = cur.steps || 0;
    state.won = false;
    state.hintUsed = !!cur.hintUsed;
    state.hintActive = !!cur.hintActive;
    state.hintMap = {};
    state.ms = cur.ms || 0;
    state.startStamp = Date.now();
    state.playing = true;
    computePathInfo();
    startTimer();
    return true;
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
    }
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
    // 游戏中阻止浏览器滚动/下拉刷新（难度页保留滚动）
    if (state.playing && e.cancelable) { e.preventDefault(); }
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
    if (store.cur && restoreCur()) {
      renderGameView(); // 恢复断局：按 seed 重放迷宫并渲染
    } else {
      store.cur = null;
      saveStore();
      showDifficultyView();
    }
    bindInput();
  }

  if (window.addEventListener) {
    window.addEventListener('resize', syncAppHeight);
  }
  syncAppHeight();
  init();
})();
