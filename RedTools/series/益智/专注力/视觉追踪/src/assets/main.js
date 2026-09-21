/* ============================================================
   视觉追踪 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   数据：window.ICONS（icons.js 注入，24 个 SVG 图标，复用翻牌记忆配对）
         window.APP_DATA（data.js 注入，build 生成 meta，可缺失）
   玩法：屏幕上多个「完全相同的」泡泡缓慢漂移——开局标记唯一目标 1.5s，
         标记消失后靠**视觉追踪**跟上它，几秒后泡泡停止，点出目标泡泡。
         点对进下一轮；点错红闪 + 错误计数（可重试）。全部轮次完成过关。
   设计约束（对齐 series/益智/设计文档.md §5）：
   - 不使用 import/export / type="module"；不超出 ES2017；var + function
   - 事件全部 addEventListener，无内联事件 / eval
   - 无 fetch/XHR/Worker；localStorage 读写 try/catch
   - 音效：Web Audio OscillatorNode 合成（无音频文件，合规）
   - 动画：setInterval(50ms) 步进更新泡泡位置（无 rAF 依赖，Chrome 61 兼容）
   - 计时：performance.now() + setInterval(100ms) 按差值刷新（§4.1）
   - 成绩/打卡：localStorage key 带工具前缀 redtools.shijuezhuizong.v1
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };
  var ICONS = window.ICONS || [];

  /* ---------- DOM ---------- */
  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');
  var footerEl = document.getElementById('app-footer');
  var timerEl = null;
  var errorsEl = null;
  var roundEl = null;
  var statusEl = null;
  var boardEl = null;       // 棋盘容器（相对定位）
  var bubbleEls = [];       // 泡泡 DOM
  var overlayEl = null;

  /* ---------- 难度定义 ---------- */
  var LEVELS = [
    { key: '1', name: '简单', rounds: 5, bubbles: 6, moveMs: 3000 },
    { key: '2', name: '普通', rounds: 6, bubbles: 8, moveMs: 4000 },
    { key: '3', name: '困难', rounds: 8, bubbles: 10, moveMs: 5000 }
  ];
  var MARK_MS = 1500;        // 目标标记时长
  var BUBBLE_SIZE = 72;      // 泡泡直径（px）
  var HIT_TOL = 110;         // 采集点击判定容差（实际按泡泡点击，此值用于展示）

  /* ---------- 状态 ---------- */
  var state = {
    level: '1',
    round: 0,
    bubbles: [],            // [{x, y, vx, vy, iconId}]
    targetIdx: -1,
    iconId: '',             // 本局泡泡图标（所有泡泡相同）
    phase: 'idle',          // 'mark' 标记 / 'move' 移动 / 'stop' 停止 / 'win'
    moveTimer: 0,           // 移动 step 句柄
    phaseTimer: 0,          // 阶段切换句柄
    errors: 0,
    won: false,
    startMs: 0,
    ms: 0,
    timerId: 0
  };

  /* ---------- 持久化（redtools.shijuezhuizong.v1） ---------- */
  var STORE_KEY = 'redtools.shijuezhuizong.v1';
  LX_SHARED.storage.configure({ toolName: 'shijuezhuizong' });  // V0.4 迁移：键前缀 redtools.shijuezhuizong.v1
  function defaultStore() {
    return {
      version: 1,
      best: {},                     // { "1": {ms,errors,stars,date}, ... }
      recent: {},                   // 各难度最近用时 ms
      checkin: { dates: [], streak: 0 },
      history: []                   // 滚动 30 条 {date,level,ms,errors,stars}
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
  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtDate(d) {
    return '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
  }
  function calcStreak(dates) {
    return LX_SHARED.progress.streak(dates);
}
  function fmtTime(ms) {
    var sec = Math.max(0, ms) / 1000;
    var t = Math.floor(sec);
    var d = Math.floor((sec - t) * 10);
    return (t < 10 ? '0' + t : '' + t) + '.' + d;
  }
  function fmtBestTime(ms) {
    var total = Math.max(0, Math.round(ms / 1000));
    var m = Math.floor(total / 60);
    var s = total % 60;
    return (m < 10 ? '0' + m : '' + m) + ':' + (s < 10 ? '0' + s : '' + s);
  }
  function randRange(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
  function pickRand(arr) { return arr[randInt(arr.length)]; }
  function randInt(n) { return Math.floor(Math.random() * n); }

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
  function sndClick() { tone(392, 0.06, 'sine', 0.08); }
  function sndCorrect() { tone(523, 0.09, 'triangle', 0.1); }
  function sndWrong() { tone(150, 0.12, 'square', 0.05); }
  function sndWin() {
    tone(523, 0.12, 'sine', 0.11, 0);
    tone(659, 0.12, 'sine', 0.11, 0.12);
    tone(784, 0.12, 'sine', 0.11, 0.24);
    tone(1047, 0.24, 'sine', 0.11, 0.36);
  }

  /* ---------- 计时 ---------- */
  function startTimer() {
    stopTimer();
    state.startMs = performance.now();
    state.timerId = setInterval(function () {
      if (!state.won && timerEl) {
        timerEl.textContent = '⏱ ' + fmtTime(performance.now() - state.startMs);
      }
    }, 100);
  }
  function stopTimer() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = 0; }
  }

  /* ---------- 图标 ---------- */
  function iconSvg(iconId) {
    for (var i = 0; i < ICONS.length; i++) {
      if (ICONS[i].id === iconId) { return ICONS[i].draw(); }
    }
    return '';
  }

  /* ---------- 出题 / 阶段流转 ---------- */
  function findLevel(key) {
    for (var i = 0; i < LEVELS.length; i++) {
      if (LEVELS[i].key === key) { return LEVELS[i]; }
    }
    return null;
  }
  function clearPhaseTimer() {
    if (state.phaseTimer) { clearTimeout(state.phaseTimer); state.phaseTimer = 0; }
  }
  function stopMove() {
    if (state.moveTimer) { clearInterval(state.moveTimer); state.moveTimer = 0; }
  }
  function newRound() {
    stopMove();
    clearPhaseTimer();
    var lv = findLevel(state.level);
    state.iconId = pickRand(ICONS).id;
    // 初始位置：间隔 ≥ 68px（略小于直径，避免重叠聚集；10 泡仍可容纳）
    var bw = boardEl.clientWidth || 320;
    var bh = boardEl.clientHeight || 320;
    var r = BUBBLE_SIZE / 2;
    var minGap = BUBBLE_SIZE + 6;  // ≥ 直径 + 喘息间距（初始即不重叠）
    var bubbles = [];
    for (var i = 0; i < lv.bubbles; i++) {
      var x, y, ok = false;
      for (var att = 0; att < 24 && !ok; att++) {
        x = randRange(r, bw - r);
        y = randRange(r, bh - r);
        ok = true;
        for (var j = 0; j < bubbles.length; j++) {
          var dx = bubbles[j].x - x;
          var dy = bubbles[j].y - y;
          if (dx * dx + dy * dy < minGap * minGap) { ok = false; break; }
        }
      }
      bubbles.push({
        x: x, y: y,
        vx: (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 1.4),
        vy: (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 1.4),
        iconId: state.iconId
      });
    }
    state.bubbles = bubbles;
    state.targetIdx = randInt(lv.bubbles);
    state.phase = 'mark';
    renderBoard();
    // 标记阶段：目标高亮 1.5s
    markTarget(true);
    setStatus('👀 记住这个泡泡！');
    sndClick();
    state.phaseTimer = setTimeout(function () {
      markTarget(false);
      startMove();
    }, MARK_MS);
  }
  function startMove() {
    state.phase = 'move';
    setStatus('👀 眼睛跟上它，别跟丢！');
    state.moveTimer = setInterval(function () { stepMove(); }, 50);
    var lv = findLevel(state.level);
    state.phaseTimer = setTimeout(function () {
      stopMove();
      state.phase = 'stop';
      setStatus('👆 点一下目标泡泡现在的位置');
    }, lv.moveMs);
  }
  function stepMove() {
    var lv = findLevel(state.level);
    var bw = boardEl.clientWidth || 320;
    var bh = boardEl.clientHeight || 320;
    var r = BUBBLE_SIZE / 2;
    for (var i = 0; i < state.bubbles.length; i++) {
      var b = state.bubbles[i];
      b.x = Math.round(b.x + b.vx);
      b.y = Math.round(b.y + b.vy);
      // 边界反弹
      if (b.x < r) { b.x = r; b.vx = Math.abs(b.vx); }
      if (b.x > bw - r) { b.x = bw - r; b.vx = -Math.abs(b.vx); }
      if (b.y < r) { b.y = r; b.vy = Math.abs(b.vy); }
      if (b.y > bh - r) { b.y = bh - r; b.vy = -Math.abs(b.vy); }
      var el = bubbleEls[i];
      if (el) { el.style.left = (b.x - r) + 'px'; el.style.top = (b.y - r) + 'px'; }
    }
    // 泡泡两两碰撞：推开 + 交换速度（等质量弹性近似）——避免重叠遮挡误点
    resolveCollisions(r);
    // 小概率随机微调方向，避免往返直线（增加迷惑性）
    if (Math.random() < 0.02) {
      var idx = randInt(state.bubbles.length);
      state.bubbles[idx].vx += (Math.random() - 0.5) * 1.2;
      state.bubbles[idx].vy += (Math.random() - 0.5) * 1.2;
      clampSpeed(idx);
    }
  }
  function resolveCollisions(r) {
    var minD = r * 2 - 6;   // 碰撞距离（略小于直径，视觉贴合）
    for (var i = 0; i < state.bubbles.length; i++) {
      for (var j = i + 1; j < state.bubbles.length; j++) {
        var a = state.bubbles[i], b2 = state.bubbles[j];
        var dx = b2.x - a.x, dy = b2.y - a.y;
        var dist2 = dx * dx + dy * dy;
        if (dist2 >= minD * minD) { continue; }
        var dist = Math.sqrt(dist2);
        if (dist < 0.001) { continue; }
        var nx = dx / dist, ny = dy / dist;
        var push = (minD - dist) / 2;
        a.x -= nx * push; a.y -= ny * push;
        b2.x += nx * push; b2.y += ny * push;
        // 交换速度分量（等质量弹性近似）
        var tvx = a.vx; a.vx = b2.vx; b2.vx = tvx;
        var tvy = a.vy; a.vy = b2.vy; b2.vy = tvy;
      }
    }
  }
  function clampSpeed(idx) {
    var b = state.bubbles[idx];
    var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (sp > 3.2) { b.vx = b.vx / sp * 3.2; b.vy = b.vy / sp * 3.2; }
    if (sp < 0.4) { b.vx = 0.4 * (b.vx >= 0 ? 1 : -1); b.vy = 0.4 * (b.vy >= 0 ? 1 : -1); }
  }

  /* ---------- 渲染 ---------- */
  function renderBoard() {
    clearNode(boardEl);
    bubbleEls = [];
    for (var i = 0; i < state.bubbles.length; i++) {
      (function (idx) {
        var b = state.bubbles[idx];
        var el = makeEl('div', 'vt-bubble');
        el.style.width = BUBBLE_SIZE + 'px';
        el.style.height = BUBBLE_SIZE + 'px';
        el.style.left = (b.x - BUBBLE_SIZE / 2) + 'px';
        el.style.top = (b.y - BUBBLE_SIZE / 2) + 'px';
        el.innerHTML = iconSvg(b.iconId);
        el.setAttribute('aria-label', '泡泡 ' + (idx + 1));
        el.addEventListener('click', function () { onBubbleTap(idx); });
        bubbleEls[idx] = el;
        boardEl.appendChild(el);
      })(i);
    }
  }
  function markTarget(on) {
    for (var i = 0; i < bubbleEls.length; i++) {
      var el = bubbleEls[i];
      if (!el) { continue; }
      var cls = 'vt-bubble';
      if (on && i === state.targetIdx) { cls += ' target'; }
      el.className = cls;
    }
  }
  function flashBubble(idx, ok) {
    var el = bubbleEls[idx];
    if (!el) { return; }
    el.className = 'vt-bubble ' + (ok ? 'flash-ok' : 'flash-wrong');
    var self = this;
    setTimeout(function () {
      if (el) { el.className = 'vt-bubble'; }
    }, ok ? 400 : 400);
  }

  /* ---------- 交互 ---------- */
  function onBubbleTap(idx) {
    if (state.won || state.phase !== 'stop') { return; }
    ensureAudio();
    if (idx === state.targetIdx) {
      // 点对：绿闪 + 下一轮
      flashBubble(idx, true);
      sndCorrect();
      state.phase = 'idle';
      updateProgress();
      setStatus('✅ 找到啦！');
      setTimeout(function () { nextRoundOrWin(); }, 600);
    } else {
      // 点错：红闪 + 错误（可重试）
      state.errors++;
      sndWrong();
      flashBubble(idx, false);
      updateProgress();
      setStatus('❌ 不是它，再找找');
      updateErrorsUI();
    }
  }
  function nextRoundOrWin() {
    var lv = findLevel(state.level);
    if (state.round >= lv.rounds) {
      onWin();
    } else {
      state.round++;
      updateProgress();
      newRound();
    }
  }

  /* ---------- 渲染：头部 / 页脚 / 游戏视图 ---------- */
  function renderHeader(title) {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '视觉追踪';
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
    btnRestart.addEventListener('click', function () { restartGame(); });
    errorsEl = makeEl('span', 'footer-errors', '❌ ' + state.errors);
    bar.appendChild(btnBack);
    bar.appendChild(btnRestart);
    bar.appendChild(errorsEl);
    footerEl.appendChild(bar);
  }
  function renderGameView() {
    clearNode(viewEl);
    bubbleEls = [];
    var lv = findLevel(state.level);

    // 顶栏
    var topbar = makeEl('div', 'topbar');
    var btnBack = makeEl('button', 'btn-ghost-sm', '← 返回');
    btnBack.setAttribute('aria-label', '返回难度选择');
    btnBack.addEventListener('click', backToDifficulty);
    topbar.appendChild(btnBack);
    topbar.appendChild(makeEl('span', 'level-title', lv ? lv.name : ''));
    timerEl = makeEl('span', 'top-timer', '⏱ 00.0');
    topbar.appendChild(timerEl);
    viewEl.appendChild(topbar);

    // 轮次
    roundEl = makeEl('div', 'vt-round', '');
    viewEl.appendChild(roundEl);

    // 状态行
    statusEl = makeEl('div', 'game-status', '');
    viewEl.appendChild(statusEl);

    // 棋盘（相对定位容器）
    boardEl = makeEl('div', 'vt-board');
    boardEl.setAttribute('aria-label', '泡泡棋盘');
    viewEl.appendChild(boardEl);

    updateProgress();
    newRound();
  }
  function setStatus(text) {
    if (statusEl) { statusEl.textContent = text; }
  }
  function updateProgress() {
    if (roundEl) {
      roundEl.textContent = '第 ' + state.round + '/' + findLevel(state.level).rounds + ' 轮';
    }
  }
  function updateErrorsUI() {
    if (errorsEl) { errorsEl.textContent = '❌ ' + state.errors; }
  }

  /* ---------- 通关 / 星级 / 最佳 ---------- */
  function calcStars(errors) {
    if (errors === 0) { return 3; }
    if (errors <= 2) { return 2; }
    return 1;
  }
  function betterThan(starsA, msA, starsB, msB) {
    if (starsA !== starsB) { return starsA > starsB; }
    return msA < msB;
  }
  function starsText(n) {
    var s = '';
    for (var i = 0; i < 3; i++) { s += (i < n) ? '★' : '☆'; }
    return s;
  }
  function onWin() {
    if (state.won) { return; }
    state.won = true;
    stopTimer();
    stopMove();
    clearPhaseTimer();
    state.ms = performance.now() - state.startMs;
    sndWin();
    var key = state.level;
    var ms = Math.round(state.ms);
    var errors = state.errors;
    var stars = calcStars(errors);
    var isNewBest = false;
    var best = store.best[key];
    if (!best || betterThan(stars, ms, best.stars, best.ms)) {
      store.best[key] = { ms: ms, errors: errors, stars: stars, date: fmtDate(new Date()) };
      isNewBest = true;
    }
    store.recent[key] = ms;
    store.history.push({ date: fmtDate(new Date()), level: key, ms: ms, errors: errors, stars: stars });
    while (store.history.length > 30) { store.history.shift(); }
    doCheckin();
    saveStore();
    var notes = [
      { cls: 'checkin-line', text: '✅ 今日已打卡 · 连续 ' + (store.checkin.streak || 0) + ' 天' }
    ];
    var btns = [
      { text: '再来一局', cls: 'btn-main', act: function () { restartGame(); } },
      { text: '选难度', cls: 'btn-ghost', act: function () { backToDifficulty(); } },
      { text: '📅 打卡日历', cls: 'btn-ghost', act: function () { showCheckinView(); } }
    ];
    var sub = '用时 ' + fmtTime(ms) + ' 秒 · 错误 ' + errors + ' 次';
    showOverlay('🎉 追踪成功！', sub, notes, btns);
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

  /* ---------- 视图：难度选择 ---------- */
  function showDifficultyView() {
    stopTimer();
    stopMove();
    clearPhaseTimer();
    state.won = false;
    renderHeader();
    clearNode(viewEl);
    viewEl.appendChild(makeEl('div', 'page-title', '选择难度'));
    viewEl.appendChild(makeEl('div', 'home-hint', '用眼睛跟着目标泡泡走，停下来后点出它现在的位置！'));
    var list = makeEl('div', 'diff-list');
    for (var i = 0; i < LEVELS.length; i++) {
      (function (l) {
        var btn = makeEl('button', 'diff-btn');
        var head = makeEl('span', 'diff-head', '👉 ' + l.name + ' · ' + l.bubbles + ' 个泡泡 · 跟 ' + (l.moveMs / 1000) + ' 秒');
        btn.appendChild(head);
        var best = store.best[l.key];
        var sub = best
          ? '最佳 ' + starsText(best.stars) + ' · ' + fmtBestTime(best.ms) + ' · 错 ' + best.errors
          : '暂无成绩 · 来挑战！';
        btn.appendChild(makeEl('span', 'diff-sub', sub));
        btn.setAttribute('aria-label', l.name + '难度 ' + l.bubbles + '泡泡');
        btn.addEventListener('click', function () { startGame(l.key); });
        list.appendChild(btn);
      })(LEVELS[i]);
    }
    viewEl.appendChild(list);
    renderHomeFooter();
  }
  function startGame(levelKey) {
    if (!ICONS.length) {
      viewEl.textContent = '图标库缺失，请检查 icons.js';
      return;
    }
    stopTimer();
    stopMove();
    clearPhaseTimer();
    state.level = levelKey;
    state.round = 1;
    state.errors = 0;
    state.won = false;
    state.startMs = 0;
    state.ms = 0;
    renderGameView();
    renderGameFooter();
    startTimer();
  }
  function backToDifficulty() {
    hideOverlay();
    stopTimer();
    stopMove();
    clearPhaseTimer();
    showDifficultyView();
  }
  function restartGame() {
    hideOverlay();
    stopTimer();
    stopMove();
    clearPhaseTimer();
    state.round = 1;
    state.errors = 0;
    state.won = false;
    state.startMs = 0;
    state.ms = 0;
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
    while (dates.length > 365) { dates.shift(); }
    store.checkin.dates = dates;
    store.checkin.streak = calcStreak(dates);
  }

  /* ---------- 渲染：打卡日历视图 ---------- */
  function showCheckinView() {
    hideOverlay();
    stopTimer();
    stopMove();
    clearPhaseTimer();
    state.won = false;
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
    clearNode(footerEl);
    var btnBack = makeEl('button', 'btn-checkin', '← 返回难度');
    btnBack.setAttribute('aria-label', '返回难度选择');
    btnBack.addEventListener('click', showDifficultyView);
    footerEl.appendChild(btnBack);
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