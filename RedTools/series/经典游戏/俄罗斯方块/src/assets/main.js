/* ============================================================
   俄罗斯方块 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   设计约束：
   - 不使用 import/export / type="module"
   - 不超出 ES2017（无 ?. ?? 对象展开等）；var + function 风格
   - 事件全部 addEventListener，无内联事件 / eval / innerHTML
   - 无 fetch/XHR/Worker；localStorage 读写 try/catch
   - 音效：Web Audio OscillatorNode 合成（无音频文件，合规）
   玩法：经典 10×20 下落消除，7-bag 随机、投影 ghost、消行计分、
         等级加速、暂停/新游戏、断局恢复、完成一局打卡（P0 激励闭环）
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
  var nextBoardEl = null;
  var nextCells = [];
  var scoreNumEl = null;
  var bestNumEl = null;
  var levelNumEl = null;
  var linesNumEl = null;
  var pauseBtnEl = null;
  var overlayEl = null;

  /* ---------- 常量 ---------- */
  var COLS = 10;
  var ROWS = 20;
  var GRID_SIZE = COLS * ROWS;            // 200
  var STORE_KEY = 'redtools.tetris.v1';
  var GAP = 1.0;                          // 棋盘格子间距（百分比）
  var CELL_W = (100 - (COLS + 1) * GAP) / COLS;   // 8.9
  var CELL_H = (100 - (ROWS + 1) * GAP) / ROWS;   // 3.95
  var SWIPE = 24;                         // 滑动判定阈值 px
  var BASE_SPEED = 700;                   // level1 下落毫秒/格
  var MIN_SPEED = 70;                     // 最快档位
  var KICKS = [0, -1, 1, -2, 2];          // 旋转踢墙偏移（简化版）
  var LINE_SCORES = [0, 100, 300, 500, 800];  // 消行得分（1/2/3/4 行）×等级
  var NEXT_COLS = 5;                      // 下一块预览网格
  var NEXT_ROWS = 3;
  var NCELL = 17;                         // 预览格尺寸（px）
  var NGAP = 1;

  // 7 种方块：type 0-6 = I O T S Z J L；每种 4 个旋转态（相对 [col,row]，minY=0）
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

  /* ---------- 状态 ---------- */
  var state = {
    grid: [], piece: null, nextType: 0, bag: [],
    score: 0, lines: 0, level: 1,
    over: false, paused: false, clearing: false, newRec: false,
    lastTime: 0
  };
  var clearingRows = [];
  var clearTimer = null;
  var touchStart = { x: 0, y: 0 };

  /* ---------- 持久化（redtools.tetris.v1） ---------- */
  function loadStore() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) { return JSON.parse(raw); }
    } catch (err) { /* ignore */ }
    return {
      version: 1,
      best: 0,
      games: 0,
      checkin: { dates: [], streak: 0 },
      cur: null
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
  function sndMove() { tone(170, 0.04, 'sine', 0.04); }
  function sndRotate() { tone(300, 0.05, 'sine', 0.05); }
  function sndSoft() { tone(130, 0.03, 'sine', 0.025); }
  function sndHard() { tone(150, 0.09, 'triangle', 0.08); }
  function sndLock() { tone(210, 0.06, 'triangle', 0.06); }
  function sndClear(n) {
    var base = 523;
    for (var i = 0; i < n; i++) {
      tone(base + i * 120, 0.1, 'sine', 0.1, i * 0.09);
    }
  }
  function sndLevelUp() {
    tone(880, 0.1, 'sine', 0.1, 0);
    tone(1175, 0.14, 'sine', 0.1, 0.1);
  }
  function sndLose() {
    tone(400, 0.12, 'sine', 0.09, 0);
    tone(300, 0.12, 'sine', 0.09, 0.12);
    tone(190, 0.22, 'sine', 0.09, 0.24);
  }

  /* ---------- 7-bag 随机 ---------- */
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }
  function nextBag() { state.bag = shuffle([0, 1, 2, 3, 4, 5, 6]); }
  function popType() {
    if (!state.bag.length) { nextBag(); }
    return state.bag.pop();
  }

  /* ---------- 碰撞 ---------- */
  function collides(p, dx, dy, rot) {
    var pts = SHAPES[p.type][rot];
    for (var i = 0; i < pts.length; i++) {
      var x = p.x + dx + pts[i][0];
      var y = p.y + dy + pts[i][1];
      if (x < 0 || x >= COLS || y >= ROWS) { return true; }
      if (y >= 0 && state.grid[y * COLS + x]) { return true; }
    }
    return false;
  }
  function ghostDist() {
    var d = 0;
    while (!collides(state.piece, 0, d + 1, state.piece.rot)) { d++; }
    return d;
  }

  /* ---------- 移动 / 旋转 ---------- */
  function canAct() {
    return !!(state.piece && !state.over && !state.paused && !state.clearing);
  }
  function movePiece(dx, dy) {
    if (!canAct()) { return false; }
    if (collides(state.piece, dx, dy, state.piece.rot)) { return false; }
    state.piece.x += dx;
    state.piece.y += dy;
    draw();
    return true;
  }
  function rotatePiece() {
    if (!canAct()) { return false; }
    var nr = (state.piece.rot + 1) % 4;
    for (var i = 0; i < KICKS.length; i++) {
      var k = KICKS[i];
      if (!collides(state.piece, k, 0, nr)) {
        state.piece.rot = nr;
        state.piece.x += k;
        draw();
        return true;
      }
    }
    return false;
  }
  function softStep() {
    if (movePiece(0, 1)) {
      state.score += 1;      // 软降每格 +1 分
      sndSoft();
      updateScoreUI();
      return true;
    }
    return false;
  }
  function hardDrop() {
    if (!canAct()) { return false; }
    var dy = ghostDist();
    state.piece.y += dy;
    state.score += dy * 2;   // 硬降每格 +2 分
    sndHard();
    updateScoreUI();
    draw();
    lockPiece();
    return true;
  }

  /* ---------- 锁定 / 消行 ---------- */
  function lockPiece() {
    var p = state.piece;
    if (!p) { return; }
    var pts = SHAPES[p.type][p.rot];
    var topOut = false;
    for (var i = 0; i < pts.length; i++) {
      var x = p.x + pts[i][0];
      var y = p.y + pts[i][1];
      if (y < 0) { topOut = true; continue; }
      state.grid[y * COLS + x] = p.type + 1;
    }
    state.piece = null;
    if (topOut) {
      state.over = true;
      sndLose();
      draw();
      setTimeout(endGame, 600);
      return;
    }
    sndLock();
    clearLines();
  }
  function findFullRows() {
    var rows = [];
    for (var r = 0; r < ROWS; r++) {
      var full = true;
      for (var c = 0; c < COLS; c++) {
        if (!state.grid[r * COLS + c]) { full = false; break; }
      }
      if (full) { rows.push(r); }
    }
    return rows;
  }
  function clearLines() {
    var rows = findFullRows();
    if (!rows.length) { spawnNext(); return; }
    state.clearing = true;
    clearingRows = rows;
    sndClear(rows.length);
    draw();                    // 满行闪烁动画
    clearTimer = setTimeout(afterClear, 340);
  }
  function afterClear() {
    clearTimer = null;
    var set = {};
    for (var i = 0; i < clearingRows.length; i++) { set[clearingRows[i]] = 1; }
    var kept = [];
    for (var r = 0; r < ROWS; r++) {
      if (set[r]) { continue; }
      for (var c = 0; c < COLS; c++) { kept.push(state.grid[r * COLS + c]); }
    }
    var add = clearingRows.length * COLS;   // 顶部补空行
    for (var k = 0; k < add; k++) { kept.unshift(0); }
    state.grid = kept;

    var n = clearingRows.length;
    state.lines += n;
    state.score += LINE_SCORES[n] * state.level;
    var newLevel = Math.floor(state.lines / 10) + 1;
    if (newLevel > state.level) {
      state.level = newLevel;
      sndLevelUp();
    }
    state.clearing = false;
    clearingRows = [];
    updateScoreUI();
    updateInfoUI();
    draw();
    spawnNext();
    saveCur();
  }

  /* ---------- 生成下一块 ---------- */
  function spawnNext() {
    var t = popType();
    state.piece = { type: t, rot: 0, x: 3, y: 0 };
    state.nextType = popType();
    state.lastTime = window.performance.now();
    drawNext();
    draw();
    if (collides(state.piece, 0, 0, 0)) {   // 出生即被顶 → 游戏结束
      state.over = true;
      sndLose();
      setTimeout(endGame, 600);
    }
  }

  /* ---------- 渲染 ---------- */
  function renderHeader() {
    clearNode(headerEl);
    var ver = APP.meta && APP.meta.version ? 'v' + APP.meta.version : '';
    if (ver) { headerEl.appendChild(makeEl('span', 'ver-badge', ver)); }
  }
  function buildBoardCells() {
    cells = [];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var cell = makeEl('div', 'cell');
        cell.style.left = (GAP + c * (CELL_W + GAP)) + '%';
        cell.style.top = (GAP + r * (CELL_H + GAP)) + '%';
        cell.style.width = CELL_W + '%';
        cell.style.height = CELL_H + '%';
        boardEl.appendChild(cell);
        cells.push(cell);
      }
    }
  }
  function buildNextCells() {
    nextCells = [];
    for (var r = 0; r < NEXT_ROWS; r++) {
      for (var c = 0; c < NEXT_COLS; c++) {
        var cell = makeEl('div', 'next-cell');
        cell.style.left = (c * (NCELL + NGAP)) + 'px';
        cell.style.top = (r * (NCELL + NGAP)) + 'px';
        cell.style.width = NCELL + 'px';
        cell.style.height = NCELL + 'px';
        nextBoardEl.appendChild(cell);
        nextCells.push(cell);
      }
    }
  }
  function draw() {
    var gd = state.piece ? ghostDist() : -1;
    var clearingSet = {};
    for (var i = 0; i < clearingRows.length; i++) { clearingSet[clearingRows[i]] = 1; }
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var idx = r * COLS + c;
        var cell = cells[idx];
        var v = state.grid[idx];
        var cls = 'cell';
        if (v) {
          cls += ' c' + (v - 1);
          if (clearingSet[r]) { cls += ' clearing'; }
        } else if (state.piece && gd >= 0) {
          var pts = SHAPES[state.piece.type][state.piece.rot];
          var onPiece = false;
          for (var j = 0; j < pts.length; j++) {
            if (state.piece.x + pts[j][0] === c && state.piece.y + pts[j][1] === r) {
              onPiece = true;
              break;
            }
          }
          if (onPiece) {
            cls += ' c' + state.piece.type + ' active';
          } else {
            for (var k = 0; k < pts.length; k++) {
              if (state.piece.x + pts[k][0] === c && state.piece.y + gd + pts[k][1] === r) {
                cls += ' c' + state.piece.type + ' ghost';
                break;
              }
            }
          }
        }
        cell.className = cls;
      }
    }
  }
  function drawNext() {
    var t = (state.nextType === undefined || state.nextType === null) ? 0 : state.nextType;
    var pts = SHAPES[t][0];
    var minX = 99, maxX = -1, minY = 99, maxY = -1;
    for (var i = 0; i < pts.length; i++) {
      if (pts[i][0] < minX) { minX = pts[i][0]; }
      if (pts[i][0] > maxX) { maxX = pts[i][0]; }
      if (pts[i][1] < minY) { minY = pts[i][1]; }
      if (pts[i][1] > maxY) { maxY = pts[i][1]; }
    }
    var offX = Math.round((NEXT_COLS - (maxX - minX + 1)) / 2) - minX;
    var offY = Math.round((NEXT_ROWS - (maxY - minY + 1)) / 2) - minY;
    for (var a = 0; a < nextCells.length; a++) { nextCells[a].className = 'next-cell'; }
    for (var b = 0; b < pts.length; b++) {
      var x = pts[b][0] + offX;
      var y = pts[b][1] + offY;
      if (x < 0 || x >= NEXT_COLS || y < 0 || y >= NEXT_ROWS) { continue; }
      nextCells[y * NEXT_COLS + x].className = 'next-cell c' + t;
    }
  }
  function updateScoreUI() {
    if (scoreNumEl) { scoreNumEl.textContent = '' + state.score; }
    if (bestNumEl) { bestNumEl.textContent = '' + (store.best || 0); }
  }
  function updateInfoUI() {
    if (levelNumEl) { levelNumEl.textContent = '' + state.level; }
    if (linesNumEl) { linesNumEl.textContent = '' + state.lines; }
  }
  function updatePauseBtn() {
    if (pauseBtnEl) { pauseBtnEl.textContent = state.paused ? '继续' : '暂停'; }
  }
  function popScore() {
    if (!scoreNumEl) { return; }
    scoreNumEl.className = 'num';
    void scoreNumEl.offsetWidth; // 强制重排以重启动画
    scoreNumEl.className = 'num pop';
  }
  function renderFooter() {
    clearNode(footerEl);
    var streak = store.checkin && store.checkin.streak ? store.checkin.streak : 0;
    var txt = streak > 0
      ? '完成一局点亮今日 · 已连续打卡 ' + streak + ' 天'
      : '滑动 / 方向键操作 · 填满整行即可消除';
    footerEl.appendChild(makeEl('span', 'footer-checkin', txt));
  }
  function renderView() {
    clearNode(viewEl);
    // 顶部：标题 + 得分面板
    var top = makeEl('div', 'game-top');
    var titleBox = makeEl('div', 'game-title');
    titleBox.appendChild(makeEl('h1', null, '俄罗斯方块'));
    titleBox.appendChild(makeEl('div', 'sub', '经典怀旧 · 下落消除'));
    top.appendChild(titleBox);
    var scores = makeEl('div', 'scores');
    var scoreBox = makeEl('div', 'score-box');
    scoreBox.appendChild(makeEl('div', 'label', '得分'));
    scoreNumEl = makeEl('div', 'num', '0');
    scoreBox.appendChild(scoreNumEl);
    var bestBox = makeEl('div', 'score-box');
    bestBox.appendChild(makeEl('div', 'label', '最高'));
    bestNumEl = makeEl('div', 'num', '0');
    bestBox.appendChild(bestNumEl);
    scores.appendChild(scoreBox);
    scores.appendChild(bestBox);
    top.appendChild(scores);
    viewEl.appendChild(top);

    // 玩区：棋盘 + 侧栏
    var playArea = makeEl('div', 'play-area');
    var boardCol = makeEl('div', 'board-col');
    boardEl = makeEl('div', 'board');
    buildBoardCells();
    boardCol.appendChild(boardEl);
    playArea.appendChild(boardCol);

    var sideCol = makeEl('div', 'side-col');
    var nextPanel = makeEl('div', 'next-panel');
    nextPanel.appendChild(makeEl('div', 'panel-label', '下一个'));
    nextBoardEl = makeEl('div', 'next-board');
    buildNextCells();
    nextPanel.appendChild(nextBoardEl);
    sideCol.appendChild(nextPanel);

    var stats = makeEl('div', 'stats');
    var row1 = makeEl('div', 'stat-row');
    row1.appendChild(makeEl('span', null, '等级'));
    levelNumEl = makeEl('b', null, '1');
    row1.appendChild(levelNumEl);
    stats.appendChild(row1);
    var row2 = makeEl('div', 'stat-row');
    row2.appendChild(makeEl('span', null, '行数'));
    linesNumEl = makeEl('b', null, '0');
    row2.appendChild(linesNumEl);
    stats.appendChild(row2);
    sideCol.appendChild(stats);

    var sideBtns = makeEl('div', 'side-btns');
    pauseBtnEl = makeEl('button', 'side-btn', '暂停');
    pauseBtnEl.setAttribute('aria-label', '暂停或继续');
    pauseBtnEl.addEventListener('click', function () { togglePause(); });
    sideBtns.appendChild(pauseBtnEl);
    var btnNew = makeEl('button', 'side-btn alt', '新游戏');
    btnNew.setAttribute('aria-label', '重新开始一局');
    btnNew.addEventListener('click', function () { newGame(); });
    sideBtns.appendChild(btnNew);
    sideCol.appendChild(sideBtns);
    playArea.appendChild(sideCol);
    viewEl.appendChild(playArea);

    // 控制按钮行
    var ctrlRow = makeEl('div', 'controls-row');
    function addCtrl(text, label, cls, fn) {
      var b = makeEl('button', 'ctrl-btn' + (cls ? ' ' + cls : ''), text);
      b.setAttribute('aria-label', label);
      b.addEventListener('click', fn);
      ctrlRow.appendChild(b);
    }
    addCtrl('←', '左移', null, moveLeft);
    addCtrl('↻', '旋转', 'wide', onRotate);
    addCtrl('→', '右移', null, moveRight);
    addCtrl('▼', '下移一格', 'wide', softStep);
    addCtrl('⤓', '快速落地', 'accent', hardDrop);
    viewEl.appendChild(ctrlRow);

    viewEl.appendChild(makeEl('div', 'hint',
      '滑动 左右移 · 上滑旋转 · 下滑落地 · 空格硬降 · P 暂停'));
  }

  /* ---------- 结算 / 暂停弹层 ---------- */
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
    sum.appendChild(makeEl('div', 'score-label', '本次得分'));
    sum.appendChild(makeEl('div', 'score-num', '' + state.score));
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
  function endGame() {
    var lastScore = state.score;
    var oldBest = store.best || 0;
    if (lastScore > oldBest) {
      store.best = lastScore;
      state.newRec = true;
    } else {
      state.newRec = false;
    }
    store.games = (store.games || 0) + 1;
    store.cur = null; // 结束局不再恢复
    doCheckin();
    saveStore();
    renderFooter();
    var notes = [];
    if (state.newRec) {
      notes.push({ cls: 'best-line new-rec', text: '🏆 新纪录！' });
    } else {
      notes.push({ cls: 'best-line', text: '最高分 ' + (store.best || 0) });
    }
    notes.push({ cls: 'line-clear', text: '消除 ' + state.lines + ' 行 · Lv.' + state.level });
    notes.push({
      cls: 'checkin-line',
      text: store.checkin && store.checkin.streak > 0
        ? '✅ 今日已打卡 · 连续 ' + store.checkin.streak + ' 天'
        : '✅ 今日已打卡'
    });
    showOverlay('游戏结束', '方块堆到顶了，再来一局！', notes, [
      { text: '再来一局', cls: 'btn-main', act: newGame }
    ]);
  }
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
  function togglePause() {
    if (state.over || state.clearing) { return; }
    state.paused = !state.paused;
    updatePauseBtn();
    if (state.paused) {
      showOverlay('已暂停', '休息一下，随时继续', [], [
        { text: '继续', cls: 'btn-main', act: function () { togglePause(); } },
        { text: '新游戏', cls: 'btn-ghost', act: newGame }
      ]);
    } else {
      hideOverlay();
      state.lastTime = window.performance.now(); // 暂停期间不计时
    }
  }

  /* ---------- 新局 / 恢复 ---------- */
  function newGame() {
    if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
    hideOverlay();
    state.grid = [];
    for (var i = 0; i < GRID_SIZE; i++) { state.grid.push(0); }
    state.score = 0;
    state.lines = 0;
    state.level = 1;
    state.over = false;
    state.paused = false;
    state.clearing = false;
    state.newRec = false;
    clearingRows = [];
    state.bag = [];
    state.nextType = popType();
    state.piece = null;
    spawnNext();
    updateScoreUI();
    updateInfoUI();
    updatePauseBtn();
    saveCur();
  }
  function saveCur() {
    if (state.over) {
      store.cur = null;
      saveStore();
      return;
    }
    store.cur = {
      grid: state.grid.slice(),
      piece: state.piece ? {
        type: state.piece.type, rot: state.piece.rot,
        x: state.piece.x, y: state.piece.y
      } : null,
      nextType: state.nextType,
      score: state.score, lines: state.lines, level: state.level
    };
    saveStore();
  }
  function restoreGame() {
    var cur = store.cur;
    if (cur && cur.grid && cur.grid.length === GRID_SIZE) {
      var has = false;
      for (var i = 0; i < GRID_SIZE; i++) {
        if (cur.grid[i]) { has = true; break; }
      }
      if (has) {
        state.grid = cur.grid.slice();
        state.score = cur.score || 0;
        state.lines = cur.lines || 0;
        state.level = Math.max(1, cur.level || 1);
        state.nextType = (cur.nextType !== undefined && cur.nextType !== null)
          ? cur.nextType : 0;
        state.piece = {
          type: (cur.piece && cur.piece.type !== undefined) ? cur.piece.type : 0,
          rot: (cur.piece && cur.piece.rot) || 0,
          x: (cur.piece && cur.piece.x !== undefined) ? cur.piece.x : 3,
          y: (cur.piece && cur.piece.y !== undefined) ? cur.piece.y : 0
        };
        state.bag = [];
        if (collides(state.piece, 0, 0, state.piece.rot)) {
          newGame();   // 恢复数据异常（含已死局）→ 重开
          return;
        }
        state.lastTime = window.performance.now();
        drawNext();
        draw();
        updateScoreUI();
        updateInfoUI();
        return;
      }
    }
    newGame();
  }

  /* ---------- 输入 ---------- */
  function moveLeft() { ensureAudio(); if (movePiece(-1, 0)) { sndMove(); } }
  function moveRight() { ensureAudio(); if (movePiece(1, 0)) { sndMove(); } }
  function onRotate() { ensureAudio(); if (rotatePiece()) { sndRotate(); } }
  function onKeyDown(e) {
    var kc = e.keyCode || e.which;
    if (kc === 37 || kc === 65) { e.preventDefault(); moveLeft(); }       // ← / A
    else if (kc === 39 || kc === 68) { e.preventDefault(); moveRight(); } // → / D
    else if (kc === 40 || kc === 83) { e.preventDefault(); softStep(); }  // ↓ / S（按住自动重复）
    else if (kc === 38 || kc === 87 || kc === 88) { e.preventDefault(); onRotate(); } // ↑ / W / X
    else if (kc === 32) { e.preventDefault(); hardDrop(); }               // 空格硬降
    else if (kc === 80) { e.preventDefault(); togglePause(); }            // P 暂停
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
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) { moveRight(); } else { moveLeft(); }
    } else {
      if (dy > 0) { hardDrop(); } else { onRotate(); }
    }
  }
  function onTouchMove(e) {
    // 棋盘上阻止浏览器滚动/下拉刷新
    if (e.cancelable) { e.preventDefault(); }
  }

  /* ---------- 主循环（rAF 按等级速度推进下落） ---------- */
  function baseSpeed(level) {
    var s = BASE_SPEED * Math.pow(0.78, level - 1);
    if (s < MIN_SPEED) { s = MIN_SPEED; }
    return Math.round(s);
  }
  function tick(now) {
    if (!state.over && !state.paused && !state.clearing && state.piece) {
      var speed = baseSpeed(state.level);
      if (!state.lastTime) { state.lastTime = now; }
      if (now - state.lastTime >= speed) {
        state.lastTime = now;
        if (!movePiece(0, 1)) { lockPiece(); }
      }
    }
    window.requestAnimationFrame(tick);
  }

  /* ---------- 启动 ---------- */
  function syncAppHeight() {
    var docEl = document.documentElement;
    var vh = window.innerHeight || docEl.clientHeight;
    docEl.style.setProperty('--app-height', vh + 'px');
  }
  function init() {
    renderHeader();
    renderView();
    renderFooter();
    updateScoreUI();
    updateInfoUI();
    restoreGame();
    window.addEventListener('keydown', onKeyDown);
    boardEl.addEventListener('touchstart', onTouchStart, { passive: true });
    boardEl.addEventListener('touchend', onTouchEnd, { passive: true });
    boardEl.addEventListener('touchmove', onTouchMove, { passive: false });
    window.requestAnimationFrame(tick);
  }

  if (window.addEventListener) {
    window.addEventListener('resize', syncAppHeight);
  }
  syncAppHeight();
  init();
})();