/* ============================================================
   贪吃蛇 — game：核心逻辑（棋盘/蛇/食物/碰撞/移动tick/得分/速度/胜负/存盘cur/恢复）
   依赖：core、audio（运行时引用 ui/guard，加载顺序保证）。
   挂载：window.SnakeApp.game
   Chrome 61 基线：var + function，无 let/const/class/箭头函数
   ============================================================ */
(function () {
  'use strict';
  var core = window.SnakeApp.core;
  var audio = window.SnakeApp.audio;
  var SIZE = core.SIZE;

  var DIRS = {
    left:  { dr: 0, dc: -1 },
    right: { dr: 0, dc: 1 },
    up:    { dr: -1, dc: 0 },
    down:  { dr: 1, dc: 0 }
  };

  /* ---------- 状态 ---------- */
  var state = {
    snake: [],            // 坐标数组 [{r,c}]，头在 index 0
    dir: 'right',
    nextDir: 'right',     // 转向缓冲：下一 tick 生效
    food: { r: 0, c: 0 },
    score: 0, foods: 0, time: 0,
    timerId: null, moveId: null,
    speedKey: 'medium',
    startedAt: 0, started: false,
    paused: false, guardPaused: false, guardWarned: false,
    over: false, won: false, newRec: false
  };

  function uiMod() { return window.SnakeApp.ui; }
  function guardMod() { return window.SnakeApp.guard; }
  function opposite(a, b) {
    return (a === 'left' && b === 'right') || (a === 'right' && b === 'left') ||
           (a === 'up' && b === 'down') || (a === 'down' && b === 'up');
  }

  /* ---------- 速度 ---------- */
  function speedMs() {
    var base = core.speedOf(state.speedKey).ms;
    var step = Math.floor(state.foods / core.SPEED_STEP);
    var ms = base * Math.pow(core.SPEED_RATE, step);
    return Math.max(core.MIN_MS, Math.round(ms));
  }

  /* ---------- 食物：从空位列表随机，保证不与蛇重叠 ---------- */
  function occupied(r, c) {
    for (var i = 0; i < state.snake.length; i++) {
      if (state.snake[i].r === r && state.snake[i].c === c) { return true; }
    }
    return false;
  }
  function placeFood() {
    var empty = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (!occupied(r, c)) { empty.push({ r: r, c: c }); }
      }
    }
    if (!empty.length) { return false; }   // 棋盘填满 → 无法放食物
    state.food = empty[Math.floor(Math.random() * empty.length)];
    return true;
  }

  /* ---------- 循环：setTimeout 驱动 ---------- */
  function scheduleMove() { state.moveId = setTimeout(tick, speedMs()); }
  function startMoveLoop() { if (!state.moveId) { scheduleMove(); } }
  function stopMoveLoop() { if (state.moveId) { clearTimeout(state.moveId); state.moveId = null; } }
  function startTimer() { if (state.timerId) { return; } state.timerId = setTimeout(tickTimer, 1000); }
  function stopTimer() { if (state.timerId) { clearTimeout(state.timerId); state.timerId = null; } }

  function tickTimer() {
    state.timerId = null;
    if (state.over || state.won || state.paused || state.guardPaused) { return; }
    if (state.time < 999) {
      state.time++;
      uiMod().updateInfo();
      if (state.time % 5 === 0) { core.saveStore(); }   // 每 5 秒防沉迷批量写盘
      state.timerId = setTimeout(tickTimer, 1000);
    } else {
      uiMod().updateInfo();                              // 上限 999s
    }
    guardMod().checkGuardTime();                         // 防沉迷：单局时长到点
  }

  function tick() {
    state.moveId = null;
    if (state.over || state.won || state.paused || state.guardPaused) { return; }
    state.dir = state.nextDir;                           // 应用缓冲方向
    var d = DIRS[state.dir];
    var head = state.snake[0];
    var nr = head.r + d.dr;
    var nc = head.c + d.dc;
    if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) { loseGame(); return; }  // 撞墙
    var eating = (state.food.r === nr && state.food.c === nc);
    var limit = eating ? state.snake.length : state.snake.length - 1;
    for (var i = 0; i < limit; i++) {                    // 撞自身（未吃时尾格让位）
      if (state.snake[i].r === nr && state.snake[i].c === nc) { loseGame(); return; }
    }
    state.snake.unshift({ r: nr, c: nc });
    if (eating) {
      state.foods++;
      state.score += 10;
      audio.sndEat();
      if (state.foods >= core.TARGET || !placeFood()) {  // 吃满目标或棋盘填满 → 胜利
        uiMod().paintBoard();
        uiMod().updateInfo();
        winGame();
        return;
      }
    } else {
      state.snake.pop();                                 // 尾部出队
    }
    uiMod().paintBoard();
    uiMod().updateInfo();
    saveCur();
    scheduleMove();
  }

  /* ---------- 转向（不能 180° 掉头；蛇长=1 除外；缓冲下一 tick 生效） ---------- */
  function setDirection(dir) {
    if (state.guardPaused || state.over || state.won || core.isSelfLocked()) { return; }
    var cur = state.nextDir || state.dir;
    if (opposite(dir, cur) && state.snake.length > 1) { return; }
    if (state.nextDir !== dir) {
      state.nextDir = dir;
      audio.sndTurn();
    }
  }

  /* ---------- 暂停 ---------- */
  function togglePause() {
    if (state.guardPaused || state.over || state.won || core.isSelfLocked()) { return; }
    state.paused = !state.paused;
    if (state.paused) { stopMoveLoop(); stopTimer(); }
    else { startMoveLoop(); startTimer(); }
    uiMod().updateInfo();
  }

  /* ---------- 胜负结算 ---------- */
  function updateBest() {
    var key = state.speedKey;
    var old = core.store.best[key] || 0;
    if (state.score > old) {
      core.store.best[key] = state.score;
      state.newRec = true;
    } else {
      state.newRec = false;
    }
  }
  function winGame() {
    if (state.over || state.won) { return; }
    state.won = true;
    stopTimer(); stopMoveLoop();
    audio.sndWin();
    core.store.games = (core.store.games || 0) + 1;
    core.store.wins = (core.store.wins || 0) + 1;
    updateBest();
    core.countPlayed(state);    // 胜利必计今日局数
    core.doCheckin();           // 仅胜利打卡
    core.store.cur = null;
    core.saveStore();
    uiMod().renderFooter();
    guardMod().renderGuardBar();
    setTimeout(function () { uiMod().openWin(); }, 600);
  }
  function loseGame() {
    if (state.over || state.won) { return; }
    state.over = true;
    stopTimer(); stopMoveLoop();
    audio.sndLose();
    core.store.games = (core.store.games || 0) + 1;
    core.countPlayed(state);    // <10s 试错局豁免
    updateBest();
    core.store.cur = null;
    core.saveStore();
    uiMod().renderFooter();
    guardMod().renderGuardBar();
    setTimeout(function () { uiMod().openLose(); }, 600);
  }

  /* ---------- 存盘 / 恢复 ---------- */
  function saveCur() {
    core.store.cur = {
      snake: state.snake.map(function (s) { return { r: s.r, c: s.c }; }),
      dir: state.dir,
      food: { r: state.food.r, c: state.food.c },
      score: state.score, foods: state.foods, time: state.time,
      speedKey: state.speedKey,
      startedAt: state.startedAt,
      started: state.started && !state.over && !state.won,
      over: state.over, won: state.won
    };
    core.saveStore();
  }
  function isValidCur(cur) {
    if (!cur || typeof cur !== 'object') { return false; }
    if (!Array.isArray(cur.snake) || cur.snake.length < 1 || cur.snake.length > SIZE * SIZE) { return false; }
    var seen = {};
    for (var i = 0; i < cur.snake.length; i++) {
      var s = cur.snake[i];
      if (!s || typeof s.r !== 'number' || typeof s.c !== 'number') { return false; }
      if (s.r < 0 || s.r >= SIZE || s.c < 0 || s.c >= SIZE) { return false; }
      var k = s.r + '-' + s.c;
      if (seen[k]) { return false; }   // 坐标重复
      seen[k] = 1;
    }
    if (!cur.food || typeof cur.food.r !== 'number' || typeof cur.food.c !== 'number') { return false; }
    if (cur.food.r < 0 || cur.food.r >= SIZE || cur.food.c < 0 || cur.food.c >= SIZE) { return false; }
    if (seen[cur.food.r + '-' + cur.food.c]) { return false; }   // 食物叠蛇
    if (!DIRS[cur.dir]) { return false; }
    var okKey = false;
    for (var k2 = 0; k2 < core.SPEEDS.length; k2++) {
      if (core.SPEEDS[k2].key === cur.speedKey) { okKey = true; break; }
    }
    if (!okKey) { return false; }
    if (cur.over || cur.won) { return false; }
    return true;
  }
  function restoreGame() {
    if (core.isSelfLocked()) {         // 自律锁：不恢复旧局
      core.store.cur = null;
      core.saveStore();
      newGame('medium');
      return;
    }
    var cur = core.store.cur;
    if (cur && isValidCur(cur)) {
      state.snake = [];
      for (var i = 0; i < cur.snake.length; i++) {
        state.snake.push({ r: cur.snake[i].r, c: cur.snake[i].c });
      }
      state.dir = cur.dir;
      state.nextDir = cur.dir;
      state.food = { r: cur.food.r, c: cur.food.c };
      state.score = typeof cur.score === 'number' ? cur.score : 0;
      state.foods = typeof cur.foods === 'number' ? cur.foods : 0;
      state.time = typeof cur.time === 'number' ? cur.time : 0;
      state.speedKey = cur.speedKey;
      state.startedAt = typeof cur.startedAt === 'number' ? cur.startedAt : 0;
      state.started = !!cur.started;
      state.paused = false; state.guardPaused = false; state.guardWarned = false;
      state.over = false; state.won = false; state.newRec = false;
      uiMod().renderTabsState();
      uiMod().renderBoard();
      uiMod().paintBoard();
      uiMod().updateInfo();
      uiMod().renderHint();
      if (state.started) { startTimer(); startMoveLoop(); }  // 计时按 started 续走
      return;
    }
    core.store.cur = null;
    core.saveStore();
    newGame('medium');
  }

  /* ---------- 新局 ---------- */
  function newGame(sk) {
    if (core.isSelfLocked()) {
      // 自律锁：渲染空棋盘作背景（已锁输入），弹明日见
      stopTimer(); stopMoveLoop();
      state.over = false; state.won = false; state.paused = false;
      state.guardPaused = false; state.guardWarned = false;
      state.time = 0; state.score = 0; state.foods = 0;
      state.snake = [];
      state.speedKey = core.speedOf(sk).key;
      uiMod().hideOverlay();
      uiMod().renderTabsState();
      uiMod().renderBoard();
      uiMod().paintBoard();
      uiMod().updateInfo();
      uiMod().renderHint();
      uiMod().showOverlay(
        '🌟 今天已经很自律啦', '明天见，更棒的手眼小达人', '今日已结束',
        [{ cls: 'guard-line', text: core.store.selfStreak > 0 ? '连续自律 ' + core.store.selfStreak + ' 天' : '今日自律成就 +1' }],
        [{ text: '明天见', cls: 'btn-main', act: function () {
          uiMod().hideOverlay();
          uiMod().renderFooter();
          guardMod().renderGuardBar();
        } }]
      );
      return;
    }
    core.refreshGuardDay();
    var key = core.speedOf(sk).key;
    stopTimer(); stopMoveLoop();
    state.speedKey = key;
    state.snake = [{ r: 8, c: 3 }, { r: 8, c: 2 }, { r: 8, c: 1 }];  // 初始长 3 向右
    state.dir = 'right'; state.nextDir = 'right';
    state.score = 0; state.foods = 0; state.time = 0;
    state.startedAt = Date.now(); state.started = true;
    state.paused = false; state.guardPaused = false; state.guardWarned = false;
    state.over = false; state.won = false; state.newRec = false;
    placeFood();
    core.store.cur = null;          // 新局清 cur
    core.saveStore();
    uiMod().hideOverlay();
    uiMod().renderTabsState();
    uiMod().renderBoard();
    uiMod().paintBoard();
    uiMod().updateInfo();
    uiMod().renderHint();
    guardMod().renderGuardBar();
    startTimer();
    startMoveLoop();
  }

  window.SnakeApp.game = {
    state: state,
    newGame: newGame,
    restoreGame: restoreGame,
    setDirection: setDirection,
    togglePause: togglePause,
    startMoveLoop: startMoveLoop,
    stopMoveLoop: stopMoveLoop,
    startTimer: startTimer,
    stopTimer: stopTimer,
    saveCur: saveCur,
    isValidCur: isValidCur,
    speedMs: speedMs
  };
})();
