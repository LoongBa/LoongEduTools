/* ============================================================
   数独入门 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   数据：window.SUDOKU（solver.js 注入，数独核心算法）
        window.APP_DATA（data.js 注入，build 生成 meta，可缺失）
   玩法：点选空格 → 底部数字条点数字填数（非九宫格，低龄友好）
         - 合法（行/列/宫不冲突）：绿色确认，静默接受（答错不惩罚）
         - 不合法（冲突）：红闪 400ms + 温和提示，错误计数 +1
         工具：橡皮（清选中格）/ 撤销（恢复上一步）/ 提示（提示一次，星级封顶 2★）
         全部填满且无冲突即过关。
   星级：hints===0 && errors===0 → 3★；hints<=1 && errors<=3 → 2★；否则 1★
   难度：双参数（盘面尺寸 × 目标已知格）4×4→10、6×6→21、9×9→33
   设计约束（对齐 series/益智/设计文档.md §5）：
   - 不使用 import/export / type="module"
   - 不超出 ES2017（无 ?. ?? 对象展开 replaceAll 等）；var + function 风格
   - 事件全部 addEventListener，无内联事件 / eval
   - 无 fetch/XHR/Worker；localStorage 读写 try/catch
   - 音效：Web Audio OscillatorNode 合成（无音频文件，合规）
   - 计时：performance.now() + setInterval(100ms) 按差值刷新（§4.1），
     从游戏页渲染开始计时（数独为长时任务，按整局计时）
   - 成绩/打卡：localStorage key 带工具前缀 redtools.shudurumen.v1
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };
  var SUDOKU = window.SUDOKU || null;

  /* ---------- DOM ---------- */
  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');
  var footerEl = document.getElementById('app-footer');
  var timerEl = null;
  var errorsEl = null;
  var overlayEl = null;
  var hintBtnEl = null;
  var penBtnEl = null;
  var cellEls = [];   // 棋盘格子外层 DOM（按格下标索引）

  /* ---------- 难度定义（盘面尺寸 N × 目标已知格 givens） ---------- */
  var LEVELS = [
    { key: '4', name: '简单', N: 4, givens: 10 },
    { key: '6', name: '普通', N: 6, givens: 21 },
    { key: '9', name: '困难', N: 9, givens: 33 }
  ];

  /* ---------- 状态 ---------- */
  var state = {
    level: '4',
    N: 4,
    givens: 10,
    givensCount: 0,   // 本局实际已知格数（genPuzzle 结果可在 [givens, givens+4]）
    puzzle: [],       // 当前盘面（0 = 空格）
    given: [],        // 是否题目已知格（不可编辑）
    solution: [],
    selected: -1,     // 当前选中格下标（-1 = 无）
    hints: 0,         // 提示次数（用提示星级封顶 2★）
    errors: 0,        // 冲突次数（非法落子）
    pencils: [],      // 候选笔记（铅笔模式）：每个空格一个数组，存该格候选数字（升序）
    penMode: false,   // 是否铅笔（候选笔记）模式
    undoStack: [],    // 撤销栈 [{ i, val, pen }]（含提示/橡皮入栈；pen=true 表示本步操作作用在笔记上）
    won: false,
    playing: false,   // 是否在游戏页（实体键盘仅游戏页响应）
    startMs: 0,
    ms: 0,
    timerId: 0
  };

  /* ---------- 持久化（redtools.shudurumen.v1） ---------- */
  var STORE_KEY = 'redtools.shudurumen.v1';
  LX_SHARED.storage.configure({ toolName: 'shudurumen' });  // V0.4 迁移：键前缀 redtools.shudurumen.v1
  function defaultStore() {
    return {
      version: 1,
      best: {},                     // { "4": {ms,errors,hints,stars,date}, ... }
      recent: {},                   // 各难度最近用时 ms
      checkin: { dates: [], streak: 0 },
      history: [],                  // 滚动 30 条 {date,level,ms,errors,hints,stars}
      cur: null                     // 断局快照（v1.2）：未完成对局，{level,N,givensCount,puzzle,solution,given,pencils,undoStack,hints,errors,selected,penMode,ms,startStamp}
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
          if (!obj.cur) { obj.cur = null; }
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

  /* ---------- 断局恢复（v1.2）：state 快照 ↔ store.cur ---------- */
  function saveCur() {
    if (state.won) { return; } // 已通关：不覆盖断局快照（onWin 已 clearCur）
    // 计时基线冻结：state.ms 存累计毫秒，startStamp 记录本次落盘时间点，恢复时续算
    state.ms = performance.now() - state.startMs;
    var pens = [];
    var i;
    for (i = 0; i < state.pencils.length; i++) { pens.push(state.pencils[i].slice()); }
    var undos = [];
    for (i = 0; i < state.undoStack.length; i++) {
      undos.push({ i: state.undoStack[i].i, val: state.undoStack[i].val,
                   pen: state.undoStack[i].pen ? state.undoStack[i].pen.slice() : null });
    }
    store.cur = {
      level: state.level, N: state.N, givens: state.givens, givensCount: state.givensCount,
      puzzle: state.puzzle.slice(), solution: state.solution.slice(), given: state.given.slice(),
      pencils: pens, undoStack: undos,
      hints: state.hints, errors: state.errors, selected: state.selected,
      penMode: state.penMode, won: false,
      ms: state.ms, startStamp: Date.now()
    };
    saveStore();
  }
  function clearCur() {
    if (store.cur) { store.cur = null; saveStore(); }
  }
  function countFilled(cur) {
    var c = 0;
    var i;
    for (i = 0; i < cur.puzzle.length; i++) {
      if (cur.puzzle[i] !== 0 && !cur.given[i]) { c++; }
    }
    return c;
  }
  function isValidCur(cur) {
    if (!cur || typeof cur !== 'object') { return false; }
    var N = cur.N;
    if (N !== 4 && N !== 6 && N !== 9) { return false; }
    var size = N * N;
    if (!cur.puzzle || cur.puzzle.length !== size) { return false; }
    if (!cur.solution || cur.solution.length !== size) { return false; }
    if (!cur.given || cur.given.length !== size) { return false; }
    if (!cur.pencils || cur.pencils.length !== size) { return false; }
    if (!Array.isArray(cur.undoStack)) { return false; }
    if (typeof cur.hints !== 'number' || typeof cur.errors !== 'number') { return false; }
    if (typeof cur.ms !== 'number' || typeof cur.startStamp !== 'number') { return false; }
    return true;
  }
  function restoreCur() {
    var cur = store.cur;
    if (!isValidCur(cur)) { clearCur(); return false; }
    state.level = cur.level;
    state.N = cur.N;
    state.givens = cur.givens;
    state.givensCount = cur.givensCount;
    state.puzzle = cur.puzzle.slice();
    state.solution = cur.solution.slice();
    state.given = cur.given.slice();
    var pens = [];
    var i;
    for (i = 0; i < cur.pencils.length; i++) { pens.push(cur.pencils[i].slice()); }
    state.pencils = pens;
    var undos = [];
    for (i = 0; i < cur.undoStack.length; i++) {
      undos.push({ i: cur.undoStack[i].i, val: cur.undoStack[i].val,
                   pen: cur.undoStack[i].pen ? cur.undoStack[i].pen.slice() : null });
    }
    state.undoStack = undos;
    state.hints = cur.hints;
    state.errors = cur.errors;
    state.selected = cur.selected;
    state.penMode = cur.penMode;
    state.won = false;
    state.playing = true;
    // 计时续算：从保存点继续（startMs 重置为「当前时刻 - 已累计」）
    state.ms = cur.ms;
    state.startMs = performance.now() - cur.ms;
    return true;
  }

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
  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtDate(d) {
    return '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
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
    // 分:秒，如 01:23
    var total = Math.max(0, Math.round(ms / 1000));
    var m = Math.floor(total / 60);
    var s = total % 60;
    return (m < 10 ? '0' + m : '' + m) + ':' + (s < 10 ? '0' + s : '' + s);
  }
  function findLevel(key) {
    var i;
    for (i = 0; i < LEVELS.length; i++) {
      if (LEVELS[i].key === key) { return LEVELS[i]; }
    }
    return LEVELS[0];
  }
  /* 格子列宽/格内字体按盘面尺寸 */
  function colPct(n) {
    if (n === 4) { return '25%'; }
    if (n === 6) { return '16.6667%'; }
    return '11.1111%'; // 9
  }
  function cellFont(n) {
    if (n === 4) { return '30px'; }
    if (n === 6) { return '22px'; }
    return '16px'; // 9×9 保持可读（>=14px）
  }

  /* ---------- 音效（Web Audio 合成，同分类整理/迷宫寻路） ---------- */
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
  function sndClick() { tone(520, 0.05, 'triangle', 0.05, 0); }
  function sndCorrect() { tone(660, 0.08, 'sine', 0.1, 0); tone(990, 0.12, 'sine', 0.1, 0.09); }
  function sndWrong() { tone(165, 0.16, 'square', 0.05, 0); }
  function sndWin() {
    tone(523, 0.12, 'sine', 0.11, 0);
    tone(659, 0.12, 'sine', 0.11, 0.12);
    tone(784, 0.12, 'sine', 0.11, 0.24);
    tone(1047, 0.24, 'sine', 0.11, 0.36);
  }

  /* ---------- 计时 ---------- */
  function startTimer() {
    stopTimer();
    // 断局恢复续算：若已有累计 ms（restoreCur 设置），startMs 以累计值为基线；
    // 否则从当前时刻起算（新局）
    if (state.ms > 0) {
      state.startMs = performance.now() - state.ms;
    } else {
      state.startMs = performance.now();
    }
    state.timerId = setInterval(function () {
      if (!state.won && timerEl) {
        timerEl.textContent = '⏱ ' + fmtTime(performance.now() - state.startMs);
      }
    }, 100);
  }
  function stopTimer() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = 0; }
  }
  function updateTimerUI() {
    if (timerEl) { timerEl.textContent = '⏱ ' + fmtTime(state.won ? state.ms : 0); }
  }

  /* ---------- 渲染：头部 / 页脚 ---------- */
  function renderHeader(title) {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '数独入门';
    brand.appendChild(makeEl('span', 'header-title', title || name));
    if (APP.meta && APP.meta.version) {
      brand.appendChild(makeEl('span', 'header-ver', 'v' + APP.meta.version));
    }
    headerEl.appendChild(brand);
  }
  function renderHomeFooter() {
    clearNode(footerEl);
    var streak = store.checkin && store.checkin.streak ? store.checkin.streak : 0;
    var btn = makeEl('button', 'btn-checkin', '📅 打卡日历 · 连续 ' + streak + ' 天');
    btn.setAttribute('aria-label', '打开打卡日历');
    btn.addEventListener('click', showCheckinView);
    footerEl.appendChild(btn);
  }
  function renderGameFooter() {
    clearNode(footerEl);
    var bar = makeEl('div', 'game-footer');
    var btnBack = makeEl('button', 'btn-ghost-sm', '返回难度');
    btnBack.setAttribute('aria-label', '返回难度选择');
    btnBack.addEventListener('click', backToDifficulty);
    var btnRestart = makeEl('button', 'btn-ghost-sm', '重新开始');
    btnRestart.setAttribute('aria-label', '重新开始本局');
    btnRestart.addEventListener('click', function () { restartRound(); });
    errorsEl = makeEl('span', 'footer-errors', '❌ ' + state.errors);
    bar.appendChild(btnBack);
    bar.appendChild(btnRestart);
    bar.appendChild(errorsEl);
    footerEl.appendChild(bar);
  }
  function updateErrorsUI() {
    if (errorsEl) { errorsEl.textContent = '❌ ' + state.errors; }
  }

  /* ---------- 棋盘：正方形格子（width+padding-bottom %）+ 宫界线 ---------- */
  function sameBox(i, j, n) {
    var dims = SUDOKU.boxDims(n);
    var br = dims[0];
    var bc = dims[1];
    var ri = Math.floor(i / n), ci = i % n;
    var rj = Math.floor(j / n), cj = j % n;
    return Math.floor(ri / br) === Math.floor(rj / br) && Math.floor(ci / bc) === Math.floor(cj / bc);
  }
  /* 候选数字是否与当前行/列/宫冲突（用于铅笔笔记标红校验） */
  function penConflict(i, v) {
    var n = state.N;
    var r = Math.floor(i / n);
    var c = i % n;
    var j, rr, cc;
    for (j = 0; j < n * n; j++) {
      if (j === i) { continue; }
      rr = Math.floor(j / n);
      cc = j % n;
      if (state.puzzle[j] !== v) { continue; }   // 只看已填数字
      if (rr === r || cc === c || sameBox(i, j, n)) { return true; }
    }
    return false;
  }
  /* 铅笔模式：单元内删除候选数字（自动铅笔：落定/提示后同步清理） */
  function erasePenInUnit(i, v) {
    var n = state.N;
    if (i < 0 || i >= n * n) { return; }
    var r = Math.floor(i / n);
    var c = i % n;
    for (var k = 0; k < n * n; k++) {
      if (k === i) { continue; }
      var kr = Math.floor(k / n);
      var kc = k % n;
      var inSame = (kr === r || kc === c || sameBox(k, i, n));
      if (!inSame) { continue; }
      var pen = state.pencils[k];
      if (pen) {
        var idx = pen.indexOf(v);
        if (idx !== -1) {
          pen.splice(idx, 1);
        }
      }
    }
  }
  function innerClass(i) {
    var n = state.N;
    var r = Math.floor(i / n);
    var c = i % n;
    var cls = 'cell-inner';
    if (state.given[i]) { cls += ' given'; }
    else if (state.puzzle[i] !== 0) { cls += ' user'; }
    if (i === state.selected) {
      cls += ' selected';
    } else if (state.selected >= 0) {
      var sr = Math.floor(state.selected / n);
      var sc = state.selected % n;
      if (r === sr || c === sc || sameBox(i, state.selected, n)) { cls += ' peer'; }
      if (state.puzzle[state.selected] !== 0 && state.puzzle[i] === state.puzzle[state.selected]) {
        cls += ' same';
      }
    }
    return cls;
  }
  function cellInner(i) {
    var cell = cellEls[i];
    if (!cell) { return null; }
    return cell.querySelector('.cell-inner');
  }
  function buildNoteGrid(n) {
    // 构建候选笔记网格：每个候选数字 1..N 一个槽（最多 9 个），flex-wrap 自动排布
    var grid = document.createElement('div');
    grid.className = 'cell-note';
    for (var d = 1; d <= n; d++) {
      var slot = document.createElement('span');
      slot.className = 'note-slot';
      slot.setAttribute('data-v', '' + d);
      grid.appendChild(slot);
    }
    return grid;
  }
  function refreshInner(i) {
    var inner = cellInner(i);
    if (!inner) { return; }
    inner.className = innerClass(i);
    var val = state.puzzle[i];
    var note = state.pencils[i];
    // 先清空（保持结构：值 or 笔记网格）
    clearNode(inner);
    if (val !== 0) {
      inner.appendChild(document.createTextNode('' + val));
    } else if (note && note.length) {
      var grid = buildNoteGrid(state.N);
      var slots = grid.childNodes;
      var k;
      for (k = 0; k < slots.length; k++) {
        var d = Number(slots[k].getAttribute('data-v'));
        slots[k].textContent = '' + d;
        if (note.indexOf(d) !== -1) { slots[k].className = 'note-slot on'; }
      }
      inner.appendChild(grid);
    }
  }
  function refreshCells() {
    for (var i = 0; i < state.N * state.N; i++) { refreshInner(i); }
  }
  function flashOk(i) {
    var inner = cellInner(i);
    if (!inner) { return; }
    inner.className = inner.className + ' ok';
    window.setTimeout(function () { if (inner.className) { inner.className = inner.className.replace(' ok', ''); } }, 300);
  }
  function flashWrong(i) {
    var inner = cellInner(i);
    if (!inner) { return; }
    inner.className = inner.className + ' wrong';
    window.setTimeout(function () { if (inner.className) { inner.className = inner.className.replace(' wrong', ''); } }, 400);
  }
  function showMsg(text, warn) {
    var m = document.getElementById('sudoku-msg');
    if (!m) { return; }
    m.textContent = text || ' ';
    m.className = 'sudoku-msg' + (warn ? ' warn' : '');
  }
  function countEmpty() {
    var c = 0;
    for (var i = 0; i < state.puzzle.length; i++) {
      if (state.puzzle[i] === 0) { c++; }
    }
    return c;
  }
  function checkHintBtn() {
    if (hintBtnEl) { hintBtnEl.disabled = (countEmpty() === 0); }
  }

  /* ---------- 渲染：游戏视图 ---------- */
  function renderGameView() {
    clearNode(viewEl);
    cellEls = [];
    var lv = findLevel(state.level);

    // 顶栏：← 返回 + 难度名（含盘面信息）+ ⏱ 计时
    var topbar = makeEl('div', 'topbar');
    var btnBack = makeEl('button', 'btn-ghost-sm', '← 返回');
    btnBack.setAttribute('aria-label', '返回难度选择');
    btnBack.addEventListener('click', backToDifficulty);
    topbar.appendChild(btnBack);
    var title = makeEl('span', 'level-title', lv.name);
    title.appendChild(makeEl('small', '',
      state.N + '×' + state.N + ' · 已知 ' + state.givensCount + ' 格'));
    topbar.appendChild(title);
    timerEl = makeEl('span', 'top-timer', '⏱ 00.0');
    topbar.appendChild(timerEl);
    viewEl.appendChild(topbar);

    // 棋盘卡片：方形格 width+padding-bottom %（无 gap，宫线在 inner 边框加粗）
    var card = makeEl('div', 'board-card');
    var board = makeEl('div', 'board');
    board.id = 'sudoku-board';
    var pct = colPct(state.N);
    var dims = SUDOKU.boxDims(state.N);
    var br = dims[0];
    var bc = dims[1];
    for (var i = 0; i < state.N * state.N; i++) {
      (function (idx) {
        var r = Math.floor(idx / state.N);
        var c = idx % state.N;
        var cell = makeEl('div', 'cell');
        cell.style.width = pct;
        cell.style.paddingBottom = pct;
        if (r % br === 0 && r > 0) { cell.className = 'cell box-t'; }
        if (c % bc === 0 && c > 0) { cell.className = cell.className + ' box-l'; }
        var inner = makeEl('div', 'cell-inner');
        inner.style.fontSize = cellFont(state.N);
        cell.appendChild(inner);
        cell.addEventListener('click', function () { selectCell(idx); });
        cellEls[idx] = cell;
        board.appendChild(cell);
      })(i);
    }
    card.appendChild(board);
    viewEl.appendChild(card);

    // 提示行
    var msgEl = makeEl('div', 'sudoku-msg', '点空格 → 选数字，行/列/宫不重复就过关！');
    msgEl.id = 'sudoku-msg';
    viewEl.appendChild(msgEl);

    // 数字条（底部点按输入，非九宫格）+ 工具条
    var kbd = makeEl('div', 'num-kbd');
    var row = makeEl('div', 'num-row');
    for (var v = 1; v <= state.N; v++) {
      (function (val) {
        var b = makeEl('button', 'num-btn', '' + val);
        b.setAttribute('aria-label', '填数字 ' + val);
        b.addEventListener('click', function () { onNumTap(val); });
        row.appendChild(b);
      })(v);
    }
    kbd.appendChild(row);
    var tools = makeEl('div', 'tools');
    var btnErase = makeEl('button', 'tool-btn', '橡皮');
    btnErase.setAttribute('aria-label', '擦掉选中格子的数字或候选笔记');
    btnErase.addEventListener('click', eraseSelected);
    var btnPen = makeEl('button', 'tool-btn', '✏️ 笔记');
    btnPen.setAttribute('aria-label', '铅笔模式：在格子里记候选数字');
    btnPen.addEventListener('click', togglePenMode);
    penBtnEl = btnPen;
    syncPenBtn();
    var btnUndo = makeEl('button', 'tool-btn', '撤销');
    btnUndo.setAttribute('aria-label', '撤销上一步');
    btnUndo.addEventListener('click', undoLast);
    var btnHint = makeEl('button', 'tool-btn', '提示');
    btnHint.setAttribute('aria-label', '获得一个提示');
    btnHint.addEventListener('click', useHint);
    hintBtnEl = btnHint;
    tools.appendChild(btnErase);
    tools.appendChild(btnPen);
    tools.appendChild(btnUndo);
    tools.appendChild(btnHint);
    kbd.appendChild(tools);
    viewEl.appendChild(kbd);

    refreshCells();
    checkHintBtn();
    updateErrorsUI();
    updateTimerUI();
  }

  function syncPenBtn() {
    if (penBtnEl) { penBtnEl.className = 'tool-btn' + (state.penMode ? ' active' : ''); }
  }
  function togglePenMode() {
    if (state.won) { return; }
    state.penMode = !state.penMode;
    sndClick();
    showMsg(state.penMode
      ? '✏ 铅笔模式：点数字在格子里记候选数，再点一下取消'
      : '');
    syncPenBtn();
    saveCur();
  }

  /* ---------- 交互 ---------- */
  function selectCell(i) {
    if (state.won) { return; }
    state.selected = (state.selected === i) ? -1 : i; // 点同一格取消选中
    refreshCells();
    sndClick();
  }
  function onPenTap(v) {
    // 铅笔模式：在选中空格切换候选笔记
    if (state.won) { return; }
    if (state.selected < 0) { showMsg('先点一个空格子，再记候选数哦', true); return; }
    var i = state.selected;
    if (state.given[i]) { showMsg('这是题目给的格子，不用填', true); return; }
    if (state.puzzle[i] !== 0) { showMsg('这格已填数字，先用橡皮擦掉再记笔记', true); return; }
    var pen = state.pencils[i];
    var has = pen.indexOf(v) !== -1;
    if (has && penConflict(i, v)) {
      // 该数字在行/列/宫已存在 → 不允许保留该笔记（温和提示，标红由视觉承担）
      showMsg('行 / 列 / 宫里已经有 ' + v + ' 啦，这个候选不对', true);
      sndWrong();
      flashWrong(i);
      return;
    }
    // 切换笔记（含撤销记录：清空整格笔记再回填 = 记录全量笔记快照）
    var prevPen = pen.slice();
    if (has) {
      pen.splice(pen.indexOf(v), 1);
    } else {
      if (penConflict(i, v)) {
        showMsg('行 / 列 / 宫里已经有 ' + v + ' 啦，这个候选不对', true);
        sndWrong();
        flashWrong(i);
        return;
      }
      pen.push(v);
      pen.sort(function (a, b) { return a - b; });
    }
    state.undoStack.push({ i: i, val: 0, pen: prevPen });
    if (state.undoStack.length > 200) { state.undoStack.shift(); }
    sndClick();
    refreshCells();
    showMsg('');
    saveCur();
  }
  function onNumTap(v) {
    sndClick();
    if (state.won) { return; }
    if (state.selected < 0) { showMsg('先点一个空格子，再选数字哦', true); return; }
    var i = state.selected;
    if (state.given[i]) { showMsg('这是题目给的格子，不用填', true); return; }
    var cur = state.puzzle[i];
    if (cur === v) { showMsg(''); return; }
    if (state.penMode) { onPenTap(v); return; }
    var r = Math.floor(i / state.N);
    var c = i % state.N;
    // 记住本格原笔记（撤销时恢复）
    var prevPen = (state.pencils[i] || []).slice();
    state.puzzle[i] = 0; // 先清空自身再判定冲突（cellValid 检查含自身行）
    var legal = SUDOKU.cellValid(state.puzzle, state.N, r, c, v);
    if (legal) {
      // 合法：接受（答错不惩罚，绿色确认），撤销栈记录原值+原笔记；并做自动铅笔清理
      state.puzzle[i] = v;
      erasePenInUnit(i, v);
      state.undoStack.push({ i: i, val: cur, pen: prevPen });
      if (state.undoStack.length > 200) { state.undoStack.shift(); }
      sndCorrect();
      refreshCells();
      flashOk(i);
      showMsg('');
      checkHintBtn();
      checkWin();
      saveCur();
    } else {
      // 冲突：红闪 400ms，错误 +1，温和提示，不改变盘面
      state.puzzle[i] = cur;
      state.errors++;
      sndWrong();
      flashWrong(i);
      showMsg('行 / 列 / 宫里已经有这个数啦，换一个试试', true);
      updateErrorsUI();
      saveCur(); // 错误计数也持久化（冲突后退出不影响下次继续）
    }
  }
  function eraseSelected() {
    if (state.won) { return; }
    var i = state.selected;
    if (i < 0) { showMsg('先点一个格子，再擦数字哦', true); return; }
    if (state.given[i]) { showMsg('题目给的格子不能擦', true); return; }
    var hadPen = (state.pencils[i] || []).slice();
    var hadVal = state.puzzle[i];
    if (hadVal === 0 && hadPen.length === 0) { showMsg(''); sndClick(); return; }
    state.undoStack.push({ i: i, val: hadVal, pen: hadPen });
    if (state.undoStack.length > 200) { state.undoStack.shift(); }
    state.puzzle[i] = 0;
    state.pencils[i] = [];
    state.pencils[i].sort(function (a, b) { return a - b; });
    sndClick();
    refreshCells();
    checkHintBtn();
    showMsg('');
    saveCur();
  }
  function undoLast() {
    if (state.won) { return; }
    var m = state.undoStack.pop();
    if (!m) { showMsg('没有可以撤销的操作', true); return; }
    state.puzzle[m.i] = m.val;
    if (m.pen) { state.pencils[m.i] = m.pen.slice(); }
    sndClick();
    refreshCells();
    checkHintBtn();
    showMsg('');
    saveCur();
  }
  /* 提示：候选最少的空格 → 直接填该格正确解（保证提示正确）；
     若正确解当前被占（有格被填错），寻找其它正确解仍可放的空格；
     全部被堵则建议先擦掉填错的数。 */
  function pickHintCell() {
    var best = null;
    var bestLen = state.N * state.N + 1;
    var r, c, i, cands, sv;
    for (r = 0; r < state.N; r++) {
      for (c = 0; c < state.N; c++) {
        i = r * state.N + c;
        if (state.puzzle[i] !== 0) { continue; }
        cands = SUDOKU.getCandidates(state.puzzle, state.N, r, c);
        sv = state.solution[i];
        if (cands.indexOf(sv) === -1) { continue; } // 正确解当前不可放，跳过
        if (cands.length < bestLen) {
          bestLen = cands.length;
          best = { i: i, r: r, c: c };
          if (bestLen === 1) { return best; }
        }
      }
    }
    return best;
  }
  function useHint() {
    if (state.won) { return; }
    if (countEmpty() === 0) { showMsg('盘面已填满啦', true); return; }
    var pick = pickHintCell();
    if (!pick) {
      showMsg('有格子被填错了，先用橡皮擦掉，再试试提示', true);
      return;
    }
    var i = pick.i;
    var v = state.solution[i];
    state.undoStack.push({ i: i, val: 0, pen: (state.pencils[i] || []).slice() });
    if (state.undoStack.length > 200) { state.undoStack.shift(); }
    state.puzzle[i] = v;
    state.pencils[i] = [];
    erasePenInUnit(i, v); // 提示也触发自动铅笔清理
    state.hints++;
    sndCorrect();
    refreshCells();
    checkHintBtn();
    showMsg('提示：第 ' + (pick.r + 1) + ' 行第 ' + (pick.c + 1) + ' 列 填数字 ' + v);
    checkWin();
    saveCur();
  }

  /* ---------- 通关 / 星级 / 最佳 ---------- */
  function calcStars(hints, errors) {
    // 0 提示 0 错 → 3★；提示<=1 且 错<=3 → 2★；其余 1★
    if (hints === 0 && errors === 0) { return 3; }
    if (hints <= 1 && errors <= 3) { return 2; }
    return 1;
  }
  function betterThan(starsA, msA, starsB, msB) {
    // 最佳成绩判定：星级高优先，同星级比用时
    if (starsA !== starsB) { return starsA > starsB; }
    return msA < msB;
  }
  function starsText(n) {
    var s = '';
    for (var i = 0; i < 3; i++) { s += (i < n) ? '★' : '☆'; }
    return s;
  }
  function checkWin() {
    var n = state.N;
    for (var i = 0; i < n * n; i++) {
      if (state.puzzle[i] === 0) { return; }
    }
    // 全部填满：防御性校验无冲突（合法落子规则下必然成立）
    var r, c, idx, v, b;
    for (r = 0; r < n; r++) {
      for (c = 0; c < n; c++) {
        idx = r * n + c;
        v = state.puzzle[idx];
        b = state.puzzle.slice();
        b[idx] = 0;
        if (!SUDOKU.cellValid(b, n, r, c, v)) { return; }
      }
    }
    onWin();
  }
  function onWin() {
    if (state.won) { return; }
    state.won = true;
    stopTimer();
    state.ms = performance.now() - state.startMs;
    sndWin();
    var key = state.level;
    var ms = Math.round(state.ms);
    var errors = state.errors;
    var hints = state.hints;
    var stars = calcStars(hints, errors);
    var isNewBest = false;
    var best = store.best[key];
    if (!best || betterThan(stars, ms, best.stars, best.ms)) {
      store.best[key] = { ms: ms, errors: errors, hints: hints, stars: stars, date: fmtDate(new Date()) };
      isNewBest = true;
    }
    store.recent[key] = ms;
    store.history.push({ date: fmtDate(new Date()), level: key, ms: ms, errors: errors, hints: hints, stars: stars });
    while (store.history.length > 30) { store.history.shift(); }
    doCheckin();
    clearCur();   // 通关后断局快照作废
    saveStore();
    // 结算浮层
    var notes = [
      { cls: 'checkin-line', text: '✅ 今日已打卡 · 连续 ' + (store.checkin.streak || 0) + ' 天' }
    ];
    var btns = [
      { text: '再来一局', cls: 'btn-main', act: function () { restartRound(); } },
      { text: '选难度', cls: 'btn-ghost', act: function () { backToDifficulty(); } },
      { text: '📅 打卡日历', cls: 'btn-ghost', act: function () { showCheckinView(); } }
    ];
    var sub = '用时 ' + fmtTime(ms) + ' 秒 · 错误 ' + errors + ' 次 · 提示 ' + hints + ' 次';
    showOverlay('🎉 数独完成！', sub, notes, btns);
    showStarsInOverlay(stars);
    if (isNewBest) { showRecordBadge(); }
  }
  function showStarsInOverlay(stars) {
    if (!overlayEl) { return; }
    var sum = overlayEl.querySelector('.summary');
    if (!sum) { return; }
    var st = makeEl('div', 'stars-line', starsText(stars));
    sum.insertBefore(st, sum.firstChild);
  }
  function showRecordBadge() {
    if (!overlayEl) { return; }
    var sum = overlayEl.querySelector('.summary');
    if (!sum) { return; }
    sum.appendChild(makeEl('div', 'record-badge', '🎉 新纪录！'));
  }

  /* ---------- 渲染：难度选择视图 ---------- */
  function showDifficultyView() {
    stopTimer();
    state.won = false;
    state.playing = false;
    renderHeader();
    clearNode(viewEl);
    viewEl.appendChild(makeEl('div', 'page-title', '选择难度'));
    viewEl.appendChild(makeEl('div', 'home-hint', '点空格 → 选数字，每行每列每宫只出现一次，填满就过关！'));
    // 断局恢复入口（v1.2）：有未完成对局时显示
    if (store.cur && isValidCur(store.cur)) {
      var lv = findLevel(store.cur.level);
      var resumeBtn = makeEl('button', 'diff-btn resume-btn');
      var resHead = makeEl('span', 'diff-head', '▶ 继续上次 · ' + lv.name + ' ' + lv.N + '×' + lv.N);
      resumeBtn.appendChild(resHead);
      var resSub = makeEl('span', 'diff-sub',
        '已玩 ' + fmtTime(store.cur.ms) + ' 秒 · 已填 ' + countFilled(store.cur) + ' 格 · 错 ' + store.cur.errors + ' · 提示 ' + store.cur.hints);
      resumeBtn.appendChild(resSub);
      resumeBtn.setAttribute('aria-label', '继续上次未完成的数独对局');
      resumeBtn.addEventListener('click', resumeGame);
      viewEl.appendChild(resumeBtn);
    }
    var list = makeEl('div', 'diff-list');
    for (var i = 0; i < LEVELS.length; i++) {
      (function (l) {
        var btn = makeEl('button', 'diff-btn');
        var head = makeEl('span', 'diff-head',
          '👉 ' + l.name + ' · ' + l.N + '×' + l.N + ' · 已知 ' + l.givens + ' 格');
        btn.appendChild(head);
        var best = store.best[l.key];
        var sub = best
          ? '最佳 ' + starsText(best.stars) + ' · ' + fmtBestTime(best.ms) + ' · 错 ' + best.errors + ' · 提示 ' + best.hints
          : '暂无成绩 · 来挑战！';
        btn.appendChild(makeEl('span', 'diff-sub', sub));
        btn.setAttribute('aria-label', l.name + '难度 ' + l.N + '×' + l.N + ' 已知' + l.givens + '格');
        btn.addEventListener('click', function () { startGame(l.key); });
        list.appendChild(btn);
      })(LEVELS[i]);
    }
    viewEl.appendChild(list);
    renderHomeFooter();
  }
  function newRound(levelKey) {
    clearCur(); // 新局生成：旧断局快照作废
    var lv = findLevel(levelKey);
    var g = SUDOKU.genPuzzle(lv.N, lv.givens);
    state.level = lv.key;
    state.N = lv.N;
    state.givens = lv.givens;
    state.givensCount = g.givensCount;
    state.puzzle = g.puzzle.slice();
    state.solution = g.solution.slice();
    var given = [];
    for (var i = 0; i < g.puzzle.length; i++) { given.push(g.puzzle[i] !== 0); }
    state.given = given;
    var pencils = [];
    for (var j = 0; j < g.puzzle.length; j++) { pencils.push([]); } // 铅笔笔记：初始全空
    state.pencils = pencils;
    state.penMode = false;
    state.selected = -1;
    state.hints = 0;
    state.errors = 0;
    state.undoStack = [];
    state.won = false;
    state.playing = true;
    state.startMs = 0;
    state.ms = 0;
  }
  function startGame(levelKey) {
    if (!SUDOKU) {
      viewEl.textContent = '算法模块缺失，请检查 solver.js';
      return;
    }
    newRound(levelKey);
    renderGameView();
    renderGameFooter();
    startTimer(); // 计时从游戏页渲染开始（数独整局计时）
  }
  function resumeGame() {
    // 断局恢复：从 store.cur 还原并续玩
    if (!SUDOKU) {
      viewEl.textContent = '算法模块缺失，请检查 solver.js';
      return;
    }
    if (!restoreCur()) { showDifficultyView(); return; }
    renderGameView();
    renderGameFooter();
    startTimer();
  }
  function backToDifficulty() {
    hideOverlay();
    stopTimer();
    showDifficultyView();
  }
  function restartRound() {
    hideOverlay();
    newRound(state.level);
    renderGameView();
    renderGameFooter();
    startTimer();
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

  /* ---------- 渲染：打卡日历视图 ---------- */
  function showCheckinView() {
    hideOverlay();
    stopTimer();
    state.won = false;
    state.playing = false;
    renderHeader('打卡日历');
    clearNode(viewEl);
    var card = makeEl('div', 'calendar');
    card.appendChild(makeEl('div', 'page-title', '本月打卡'));
    var grid = makeEl('div', 'calendar-grid');
    var now = new Date();
    var days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var t = fmtDate(now);
    var dates = store.checkin.dates || [];
    for (var d = 1; d <= days; d++) {
      (function (day) {
        var ds = fmtDate(new Date(now.getFullYear(), now.getMonth(), day));
        var el = makeEl('div', 'cal-day', '' + day);
        if (dates.indexOf(ds) !== -1) { el.className = 'cal-day done'; }
        if (ds === t) { el.className += ' today'; }
        grid.appendChild(el);
      })(d);
    }
    card.appendChild(grid);
    var streak = calcStreak(dates);
    var info = makeEl('div', 'streak-info');
    info.appendChild(document.createTextNode('连续打卡 '));
    var b = makeEl('b', '', '' + streak);
    info.appendChild(b);
    info.appendChild(document.createTextNode(' 天' + (streak >= 7 ? ' 🎉' : '')));
    card.appendChild(info);
    viewEl.appendChild(card);
    // 底栏：返回难度
    clearNode(footerEl);
    var btnBack = makeEl('button', 'btn-checkin', '← 返回难度');
    btnBack.setAttribute('aria-label', '返回难度选择');
    btnBack.addEventListener('click', showDifficultyView);
    footerEl.appendChild(btnBack);
  }

  /* ---------- 实体键盘增强（1-9 / Backspace / Delete；仅游戏页） ---------- */
  if (window.addEventListener) {
    document.addEventListener('keydown', function (e) {
      if (!state.playing || state.won) { return; }
      var k = e.key;
      if (k >= '1' && k <= '9') {
        var v = Number(k);
        if (v >= 1 && v <= state.N) { onNumTap(v); }
      } else if (k === 'Backspace' || k === 'Delete') {
        if (state.selected >= 0) {
          e.preventDefault();
          eraseSelected();
        }
      }
      // Enter：无操作（保持简单）
    });
  }

  /* ---------- 启动 ---------- */
  function syncAppHeight() {
    var docEl = document.documentElement;
    var vh = window.innerHeight || docEl.clientHeight;
    docEl.style.setProperty('--app-height', vh + 'px');
  }
  if (window.addEventListener) {
    window.addEventListener('resize', syncAppHeight);
  }
  syncAppHeight();
  showDifficultyView();
})();