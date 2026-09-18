/* ============================================================
   贪吃蛇 — ui：渲染（顶栏/速度tab/信息条/棋盘绘制/结算弹层/分享弹层容器）
   依赖：core、game、guard（share 运行时引用）。
   挂载：window.SnakeApp.ui
   ============================================================ */
(function () {
  'use strict';
  var core = window.SnakeApp.core;
  var game = window.SnakeApp.game;
  var guard = window.SnakeApp.guard;
  var SIZE = core.SIZE;
  var GAP = core.GAP;

  /* ---------- DOM ---------- */
  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');
  var footerEl = document.getElementById('app-footer');
  var boardEl = null;
  var cells = [];
  var cellCls = [];
  var baseCls = [];
  var tabsEl = null;
  var tabBtns = [];
  var ledScoreEl = null;
  var ledTimeEl = null;
  var pauseBtnEl = null;
  var bestValEl = null;
  var hintEl = null;
  var overlayEl = null;

  /* ---------- 棋盘布局 ---------- */
  function cellPct() { return (100 - GAP * (SIZE + 1)) / SIZE; }
  function boardHeightPct() { return GAP * (SIZE + 1) + cellPct() * SIZE; }

  /* ---------- 顶栏 ---------- */
  function renderHeader() {
    core.clearNode(headerEl);
    var APP = window.APP_DATA || { meta: {} };
    var ver = APP.meta && APP.meta.version ? 'v' + APP.meta.version : '';
    if (ver) { headerEl.appendChild(core.makeEl('span', 'ver-badge', ver)); }
  }

  /* ---------- 速度 tab ---------- */
  function renderTabs() {
    tabBtns = [];
    core.clearNode(tabsEl);
    for (var i = 0; i < core.SPEEDS.length; i++) {
      (function (sp) {
        var btn = core.makeEl('button', 'tab-btn', sp.label);
        btn.setAttribute('aria-label', sp.label + '速度');
        btn.addEventListener('click', function () { game.newGame(sp.key); });
        tabsEl.appendChild(btn);
        tabBtns.push(btn);
      })(core.SPEEDS[i]);
    }
    renderTabsState();
  }
  function renderTabsState() {
    for (var i = 0; i < tabBtns.length; i++) {
      if (core.SPEEDS[i].key === game.state.speedKey) {
        tabBtns[i].className = 'tab-btn active';
      } else {
        tabBtns[i].className = 'tab-btn';
      }
    }
  }

  /* ---------- 棋盘 ---------- */
  function renderBoard() {
    core.clearNode(boardEl);
    cells = [];
    cellCls = [];
    baseCls = [];
    var cw = cellPct();
    boardEl.style.paddingBottom = boardHeightPct() + '%';
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var cls = ((r + c) % 2 === 1) ? 'cell cell-dark' : 'cell';
        var cell = core.makeEl('div', cls);
        cell.style.left = (GAP + c * (cw + GAP)) + '%';
        cell.style.top = (GAP + r * (cw + GAP)) + '%';
        cell.style.width = cw + '%';
        cell.style.height = cw + '%';
        boardEl.appendChild(cell);
        cells.push(cell);
        cellCls.push('');
        baseCls.push(cls);
      }
    }
  }
  function setCellCls(idx, cls, bg) {
    var cell = cells[idx];
    if (cellCls[idx] !== cls) {
      cell.className = cls;
      cellCls[idx] = cls;
    }
    var want = bg || '';
    if (cell.style.backgroundColor !== want) { cell.style.backgroundColor = want; }
  }
  function lerpColor(t) {
    var r = Math.round(142 + (29 - 142) * t);
    var g = Math.round(224 + (90 - 224) * t);
    var b = Math.round(106 + (30 - 106) * t);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function paintBoard() {
    for (var i = 0; i < cells.length; i++) { setCellCls(i, baseCls[i], ''); }
    var snake = game.state.snake;
    if (!snake.length) { return; }               // 自律锁空棋盘背景
    var fi = game.state.food.r * SIZE + game.state.food.c;
    setCellCls(fi, 'cell food');
    var head = snake[0];
    setCellCls(head.r * SIZE + head.c, 'cell snake-head dir-' + game.state.dir);
    var len = snake.length;
    for (var j = 1; j < len; j++) {
      var s = snake[j];
      setCellCls(s.r * SIZE + s.c, 'cell snake', lerpColor(j / (len - 1)));
    }
  }

  /* ---------- 信息条 / 提示 / 页脚 ---------- */
  function fmtLed(n) {
    var abs = n < 0 ? -n : n;
    var body;
    if (abs >= 100) { body = '' + abs; }
    else if (abs >= 10) { body = '0' + abs; }
    else { body = '00' + abs; }
    return (n < 0 ? '-' : '') + body;
  }
  function updateInfo() {
    if (ledScoreEl) { ledScoreEl.textContent = '' + game.state.score; }
    if (ledTimeEl) { ledTimeEl.textContent = fmtLed(game.state.time); }
    if (pauseBtnEl) { pauseBtnEl.textContent = game.state.paused ? '▶' : '⏸'; }
    var bv = core.store.best[game.state.speedKey] || 0;
    if (bestValEl) { bestValEl.textContent = bv > 0 ? bv + ' 分' : '—'; }
  }
  function updateHint() {
    if (hintEl) {
      hintEl.textContent = '方向键 / WASD / 滑动转向 · 空格暂停 · 吃满 ' + core.TARGET + ' 个获胜（当前：' +
        core.speedOf(game.state.speedKey).label + '）';
    }
  }
  function renderFooter() {
    core.clearNode(footerEl);
    var streak = core.store.checkin && core.store.checkin.streak ? core.store.checkin.streak : 0;
    var txt;
    if (core.isSelfLocked()) {
      txt = '🌟 今天已经很自律啦 · 连续自律 ' + (core.store.selfStreak || 0) + ' 天';
    } else if (streak > 0) {
      txt = '完成一局点亮今日 · 已连续打卡 ' + streak + ' 天';
    } else {
      txt = '赢一局点亮今日打卡 · 挑战本速度最佳得分';
    }
    footerEl.appendChild(core.makeEl('span', 'footer-checkin', txt));
  }

  /* ---------- 视图骨架 ---------- */
  function renderView() {
    core.clearNode(viewEl);
    var top = core.makeEl('div', 'game-top');
    var titleBox = core.makeEl('div', 'game-title');
    titleBox.appendChild(core.makeEl('h1', null, '贪吃蛇'));
    titleBox.appendChild(core.makeEl('div', 'sub', '经典怀旧 · 手眼协调'));
    top.appendChild(titleBox);
    viewEl.appendChild(top);

    tabsEl = core.makeEl('div', 'tabs');
    viewEl.appendChild(tabsEl);
    renderTabs();

    var infoBar = core.makeEl('div', 'info-bar');
    ledScoreEl = core.makeEl('div', 'led-num', '0');
    var scoreBox = core.makeEl('div', 'led');
    scoreBox.appendChild(ledScoreEl);
    pauseBtnEl = core.makeEl('button', 'pause-btn', '⏸');
    pauseBtnEl.setAttribute('aria-label', '暂停/继续');
    pauseBtnEl.addEventListener('click', function () { game.togglePause(); });
    ledTimeEl = core.makeEl('div', 'led-num', '000');
    var timeBox = core.makeEl('div', 'led');
    timeBox.appendChild(ledTimeEl);
    infoBar.appendChild(scoreBox);
    infoBar.appendChild(pauseBtnEl);
    infoBar.appendChild(timeBox);
    viewEl.appendChild(infoBar);

    var guardBar = core.makeEl('div', 'guard-bar');
    guardBar.id = 'guard-bar';
    viewEl.appendChild(guardBar);
    guard.renderGuardBar();

    var bestPanel = core.makeEl('div', 'best-panel');
    bestPanel.appendChild(core.makeEl('span', 'best-label', '本速度最佳：'));
    bestValEl = core.makeEl('span', 'best-val', '—');
    bestPanel.appendChild(bestValEl);
    viewEl.appendChild(bestPanel);

    boardEl = core.makeEl('div', 'board');
    viewEl.appendChild(boardEl);

    var dpad = core.makeEl('div', 'dpad');
    var dirLabel = function (ch) {
      return '向' + (ch === '←' ? '左' : ch === '→' ? '右' : ch === '↑' ? '上' : '下') + '移动';
    };
    var addDirBtn = function (group, ch, dir) {
      var btn = core.makeEl('button', 'dpad-btn', ch);
      btn.setAttribute('aria-label', dirLabel(ch));
      btn.addEventListener('click', function () { game.setDirection(dir); });
      group.appendChild(btn);
    };
    // 左组：↑ ←（竖排，左手拇指）  右组：→ ↓（竖排，右手拇指）
    var leftGroup = core.makeEl('div', 'dpad-group dpad-left');
    addDirBtn(leftGroup, '↑', 'up');
    addDirBtn(leftGroup, '←', 'left');
    dpad.appendChild(leftGroup);
    var rightGroup = core.makeEl('div', 'dpad-group dpad-right');
    addDirBtn(rightGroup, '→', 'right');
    addDirBtn(rightGroup, '↓', 'down');
    dpad.appendChild(rightGroup);
    viewEl.appendChild(dpad);

    var btnRow = core.makeEl('div', 'btn-row');
    var btnNew = core.makeEl('button', 'btn-main', '🔄 新游戏');
    btnNew.setAttribute('aria-label', '重新开始');
    btnNew.addEventListener('click', function () { game.newGame(game.state.speedKey); });
    btnRow.appendChild(btnNew);
    viewEl.appendChild(btnRow);

    hintEl = core.makeEl('div', 'hint', '');
    viewEl.appendChild(hintEl);
    updateHint();
  }

  /* ---------- 弹层 ---------- */
  function hideOverlay() {
    if (overlayEl && overlayEl.parentNode) {
      overlayEl.parentNode.removeChild(overlayEl);
    }
    overlayEl = null;
  }
  function showCustomOverlay(cardNode) {
    hideOverlay();
    var ov = core.makeEl('div', 'overlay');
    ov.appendChild(cardNode);
    document.body.appendChild(ov);
    overlayEl = ov;
  }
  function showOverlay(title, sub, scoreText, noteLines, btns) {
    var card = core.makeEl('div', 'overlay-card');
    card.appendChild(core.makeEl('div', 'overlay-title', title));
    if (sub) { card.appendChild(core.makeEl('div', 'overlay-sub', sub)); }
    var sum = core.makeEl('div', 'summary');
    sum.appendChild(core.makeEl('div', 'score-label', '本次得分'));
    sum.appendChild(core.makeEl('div', 'score-num', scoreText));
    for (var i = 0; i < noteLines.length; i++) {
      sum.appendChild(core.makeEl('div', noteLines[i].cls, noteLines[i].text));
    }
    card.appendChild(sum);
    var btnsBox = core.makeEl('div', 'overlay-btns');
    for (var j = 0; j < btns.length; j++) {
      (function (b) {
        var btn = core.makeEl('button', b.cls, b.text);
        btn.addEventListener('click', function () { b.act(); });
        btnsBox.appendChild(btn);
      })(btns[j]);
    }
    card.appendChild(btnsBox);
    showCustomOverlay(card);
  }

  /* ---------- 结算 ---------- */
  function openWin() {
    var isRec = game.state.newRec;
    var bv = core.store.best[game.state.speedKey] || 0;
    var notes = [];
    if (isRec) { notes.push({ cls: 'best-line new-rec', text: '🏆 新纪录！' }); }
    else { notes.push({ cls: 'best-line', text: '本速度最佳 ' + bv + ' 分' }); }
    notes.push({ cls: 'guard-line', text: '🍎 本局连吃 ' + game.state.foods + ' 个食物' });
    var streak = core.store.checkin && core.store.checkin.streak ? core.store.checkin.streak : 0;
    notes.push({ cls: 'checkin-line', text: streak > 0 ? '✅ 今日已打卡 · 连续 ' + streak + ' 天' : '✅ 今日已打卡' });
    notes = notes.concat(guard.guardSettleNotes());
    showOverlay('🎉 吃满 ' + core.TARGET + ' 个！', '手眼协调小达人就是你～',
      game.state.score + ' 分', notes, guard.guardSettleBtns());
  }
  function openLose() {
    var bv = core.store.best[game.state.speedKey] || 0;
    var notes = [{ cls: 'best-line', text: bv > 0 ? '本速度最佳 ' + bv + ' 分' : '本速度最佳 —' }];
    notes.push({ cls: 'guard-line', text: '🍎 本局连吃 ' + game.state.foods + ' 个' });
    notes = notes.concat(guard.guardSettleNotes());
    showOverlay('💥 撞上了！', '再来一局，躲得更稳～',
      game.state.score + ' 分', notes, guard.guardSettleBtns());
  }

  window.SnakeApp.ui = {
    getBoard: function () { return boardEl; },
    renderHeader: renderHeader,
    renderView: renderView,
    renderTabsState: renderTabsState,
    renderBoard: renderBoard,
    paintBoard: paintBoard,
    updateInfo: updateInfo,
    updateHint: updateHint,
    renderHint: updateHint,          // game.js restoreGame/newGame 调用 renderHint（别名兼容）
    renderFooter: renderFooter,
    showOverlay: showOverlay,
    hideOverlay: hideOverlay,
    showCustomOverlay: showCustomOverlay,
    openWin: openWin,
    openLose: openLose
  };
})();
