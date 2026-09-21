/* ============================================================
   找相同 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   数据：window.ELEMENTS（elements.js 注入，8 场景 73 元素展平池）
        window.APP_DATA（data.js 注入，build 生成 meta，可缺失）
   玩法：每轮显示 1 个目标图案 + M 个候选卡片，其中恰有 1 个与目标
         完全相同（其余为「小差异」变体干扰项）→ 点选相同者 →
         正确绿闪进下一轮 / 错误红闪留在本轮可重试 → 全部完成结算
   差异变换（复用找不同 applyDiff 思路，作用于单元素卡片）：
     - recolor  改色（难度 1 对比色 / 2 混合 / 3 相近色 shade）
     - scale    缩放（难度 1 大 / 2 中 / 3 微调）
     - variant  替换变体（draw 的 variant 参数，等价于找不同「替换变体/
                隐藏部件」类差异，仅 variantMax>0 的元素可用）
     - move     卡片内位移（难度 2 中等 / 3 小距离；难度 1 不用）
   设计约束（对齐 series/益智/设计文档.md §5）：
   - 不使用 import/export / type="module"
   - 不超出 ES2017（无 ?. ?? 对象展开 replaceAll 等）；var + function 风格
   - 事件全部 addEventListener，无内联事件 / eval
   - 无 fetch/XHR/Worker；localStorage 读写 try/catch
   - 音效：Web Audio OscillatorNode 合成（无音频文件，合规）
   - 计时：performance.now() + setInterval(100ms) 按差值刷新（§4.1），
     整局计时，游戏页渲染即开始
   - 成绩/打卡：localStorage key redtools.zhaoxiangtong.v1
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };
  var ELEMENTS = window.ELEMENTS || [];

  /* ---------- DOM ---------- */
  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');
  var footerEl = document.getElementById('app-footer');
  var timerEl = null;
  var roundEl = null;
  var targetBox = null;
  var gridEl = null;
  var errorsEl = null;
  var overlayEl = null;
  var cardEls = [];   // 候选卡 DOM（按下标索引）

  /* ---------- 难度定义 ---------- */
  var LEVELS = {
    '1': { key: '1', name: '简单', rounds: 5, m: 3 },
    '2': { key: '2', name: '普通', rounds: 6, m: 4 },
    '3': { key: '3', name: '困难', rounds: 8, m: 5 }
  };

  /* 每难度差异操作权重（recolor 改色 / scale 缩放 / variant 变体 / move 位移） */
  var LEVEL_CFG = {
    '1': { recolor: 0.5, scale: 0.3, variant: 0.2 },               // 明显差异，无位移
    '2': { recolor: 0.35, scale: 0.25, variant: 0.2, move: 0.2 },  // 中等
    '3': { recolor: 0.4, scale: 0.25, variant: 0.2, move: 0.15 }   // 细微
  };
  var DIFF_OPS = ['recolor', 'scale', 'variant', 'move'];

  /* ---------- 状态 ---------- */
  var state = {
    level: '1',
    totalRounds: 5,
    round: 0,
    element: null,       // 当前轮元素对象
    candidates: [],      // [{ params:{fill,variant,s,dx,dy}, isTarget }]
    answerIndex: 0,      // 相同卡下标（洗牌后）
    correct: 0,
    errors: 0,
    won: false,
    startMs: 0,
    ms: 0,
    timerId: 0
  };
  var usedElementIds = [];  // 本局已用元素（每轮不重复）

  /* ---------- 持久化（redtools.zhaoxiangtong.v1） ---------- */
  var STORE_KEY = 'redtools.zhaoxiangtong.v1';
  LX_SHARED.storage.configure({ toolName: 'zhaoxiangtong' });  // V0.4 迁移：键前缀 redtools.zhaoxiangtong.v1
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
  /* Fisher-Yates 洗牌（返回新数组） */
  function shuffle(arr) {
    var a = arr.slice();
    for (var j = a.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = a[j]; a[j] = a[k]; a[k] = t;
    }
    return a;
  }
  function pickRand(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function randRange(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  /* ---------- 音效（Web Audio 合成，同分类整理） ---------- */
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
  function sndClick() { tone(660, 0.05, 'triangle', 0.07); }
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
  function updateTimerUI() {
    if (timerEl) { timerEl.textContent = '⏱ ' + fmtTime(performance.now() - state.startMs); }
  }

  /* ============================================================
     差异变换引擎（干扰项生成，找相同核心）
     ============================================================ */
  /* 近似色：hex → rgb 等比缩放（amt 正变浅/负变深），用于「相似色改色」 */
  function shadeHex(hex, amt) {
    var h = (hex.charAt(0) === '#') ? hex.slice(1) : hex;
    if (h.length === 3) {
      h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    }
    function chan(v) {
      v = Math.round(v * (1 + amt));
      if (v < 0) { v = 0; }
      if (v > 255) { v = 255; }
      var s = v.toString(16);
      return s.length === 1 ? '0' + s : s;
    }
    return '#' + chan(parseInt(h.slice(0, 2), 16)) +
      chan(parseInt(h.slice(2, 4), 16)) + chan(parseInt(h.slice(4, 6), 16));
  }
  /* 每元素可用操作权重（variant 仅 variantMax>0；难度 1 无 move） */
  function opWeights(levelKey, e) {
    var l = LEVEL_CFG[levelKey];
    var w = {};
    if (l.recolor) { w.recolor = l.recolor; }
    if (l.scale) { w.scale = l.scale; }
    if (l.variant && e.variantMax > 0) { w.variant = l.variant; }
    if (l.move && levelKey !== '1') { w.move = l.move; }
    return w;
  }
  function pickWeightedOp(w) {
    var keys = [];
    var total = 0;
    for (var k in w) {
      if (w.hasOwnProperty(k)) { keys.push(k); total += w[k]; }
    }
    var r = Math.random() * total;
    var acc = 0;
    for (var i = 0; i < keys.length; i++) {
      acc += w[keys[i]];
      if (r < acc) { return keys[i]; }
    }
    return keys[keys.length - 1];
  }
  /* 对目标参数应用一个差异操作，返回新的渲染参数（或 null 表示不可用） */
  function applyOp(e, op, levelKey, p) {
    var np = { fill: p.fill, variant: p.variant, s: p.s, dx: p.dx, dy: p.dy };
    if (op === 'recolor') {
      var newFill = null;
      var alts = [];
      var pal = e.palette || [];
      if (levelKey === '1') {
        // 明显：从 palette 选一个与当前主色不同的对比色
        for (var i = 0; i < pal.length; i++) { if (pal[i] !== p.fill) { alts.push(pal[i]); } }
        if (alts.length) { newFill = pickRand(alts); }
      } else if (levelKey === '2') {
        // 中等：一半概率用 palette 对比色，一半用近似色（±18~28%）
        if (Math.random() < 0.5) {
          for (var j = 0; j < pal.length; j++) { if (pal[j] !== p.fill) { alts.push(pal[j]); } }
          if (alts.length) { newFill = pickRand(alts); }
        }
        if (!newFill) {
          var amt2 = 0.18 + Math.random() * 0.1;
          newFill = shadeHex(p.fill, Math.random() < 0.5 ? amt2 : -amt2);
        }
      } else {
        // 细微：近似色（±5~13%，相似色调）
        var amt3 = 0.05 + Math.random() * 0.08;
        newFill = shadeHex(p.fill, Math.random() < 0.5 ? amt3 : -amt3);
      }
      if (!newFill) { return null; }
      np.fill = newFill;
    } else if (op === 'scale') {
      if (levelKey === '1') { np.s = Math.random() < 0.5 ? 1.4 : 0.7; }        // 大
      else if (levelKey === '2') { np.s = Math.random() < 0.5 ? 1.25 : 0.8; }  // 中
      else {                                                                    // 微调
        var k = Math.random() < 0.5 ? 1 : -1;
        np.s = Math.round((1 + k * (0.08 + Math.random() * 0.05)) * 100) / 100;
      }
    } else if (op === 'variant') {
      np.variant = (p.variant + 1) % (e.variantMax + 1); // 0↔1 切换（找不同「替换变体/隐藏部件」同源差异）
    } else if (op === 'move') {
      var range = (levelKey === '2') ? [10, 16] : [5, 9]; // 中距离 / 小距离
      var d1 = randRange(range[0], range[1]);
      var d2 = randRange(range[0], range[1]);
      np.dx = (Math.random() < 0.5 ? -1 : 1) * d1;
      np.dy = (Math.random() < 0.5 ? -1 : 1) * d2;
    }
    return np;
  }
  /* 差异签名：元素 draw 可能忽略 fill/variant 参数（硬编码颜色），参数签名不足以区分，
     必须用「渲染后的 SVG 字符串」去重——保证干扰项视觉上确实与目标不同、彼此不同 */
  function makeSig(e, p) {
    return elementCardSvg(e, p);
  }
  /* 兜底差异：改色按幅度递增直到渲染结果可用（理论上不触发） */
  function fallbackDistractor(e, targetP, used) {
    for (var kk = 1; kk <= 8; kk++) {
      var amt = kk * 0.05;
      var p = {
        fill: shadeHex(targetP.fill, Math.random() < 0.5 ? amt : -amt),
        variant: targetP.variant, s: targetP.s, dx: targetP.dx, dy: targetP.dy
      };
      var sig = makeSig(e, p);
      if (used.indexOf(sig) === -1) { used.push(sig); return { params: p, op: 'recolor' }; }
    }
    return null;
  }
  /* 生成 M-1 个两两不同、且与目标不同的干扰项 */
  function buildDistractors(e, levelKey, count) {
    var targetP = { fill: e.fill, variant: 0, s: 1, dx: 0, dy: 0 };
    var used = [makeSig(e, targetP)];
    var out = [];
    for (var n = 0; n < count; n++) {
      var made = null;
      for (var guard = 0; guard < 60 && !made; guard++) {
        var w = opWeights(levelKey, e);
        var op = pickWeightedOp(w);
        var p = applyOp(e, op, levelKey, targetP);
        if (!p) { continue; }
        var sig = makeSig(e, p);
        if (used.indexOf(sig) !== -1) { continue; }
        used.push(sig);
        made = { params: p, op: op };
      }
      if (!made) { made = fallbackDistractor(e, targetP, used); }
      if (!made) { return null; } // 理论不可达：73 元素池各难度都远足够
      out.push(made);
    }
    return out;
  }

  /* ---------- 出题引擎 ---------- */
  /* 每轮随机抽 1 个元素，本局内不重复（池足够大：73 个） */
  function pickRoundElement() {
    if (usedElementIds.length >= ELEMENTS.length) { usedElementIds = []; }
    var pool = [];
    for (var i = 0; i < ELEMENTS.length; i++) {
      if (usedElementIds.indexOf(ELEMENTS[i].id) === -1) { pool.push(ELEMENTS[i]); }
    }
    if (!pool.length) { pool = ELEMENTS.slice(); }
    var e = pickRand(pool);
    usedElementIds.push(e.id);
    return e;
  }
  /* 元素渲染为卡片 SVG（draw 已以 (0,0) 为中心，viewBox 外扩安全） */
  function elementCardSvg(e, p) {
    var inner = e.draw({ fill: p.fill, variant: p.variant });
    var tx = 'translate(' + p.dx + ',' + p.dy + ')';
    if (p.s !== 1) { tx += ' scale(' + p.s + ')'; }
    return '<svg class="card-svg" viewBox="-50 -50 100 100" xmlns="http://www.w3.org/2000/svg">' +
      '<g transform="' + tx + '" pointer-events="none">' + inner + '</g></svg>';
  }
  /* 生成一轮：元素 → M-1 干扰项 → 洗牌布阵 */
  function newRound() {
    var lv = LEVELS[state.level];
    state.element = pickRoundElement();
    var dist = buildDistractors(state.element, state.level, lv.m - 1);
    if (!dist) { // 兜底：换元素重试一次
      state.element = pickRoundElement();
      dist = buildDistractors(state.element, state.level, lv.m - 1);
    }
    var targetP = { fill: state.element.fill, variant: 0, s: 1, dx: 0, dy: 0 };
    var candidates = [{ params: targetP, isTarget: true }];
    for (var i = 0; i < dist.length; i++) {
      candidates.push({ params: dist[i].params, isTarget: false });
    }
    candidates = shuffle(candidates);
    state.candidates = candidates;
    state.answerIndex = -1;
    for (var j = 0; j < candidates.length; j++) {
      if (candidates[j].isTarget) { state.answerIndex = j; break; }
    }
    renderRoundDom();
  }

  /* ---------- 渲染：头部 / 页脚 ---------- */
  function renderHeader(title) {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '找相同';
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

  /* ---------- 渲染：游戏视图 ---------- */
  function renderGameView() {
    clearNode(viewEl);
    var lv = LEVELS[state.level];

    // 顶栏：← 返回 + 难度名 + ⏱ 计时
    var topbar = makeEl('div', 'topbar');
    var btnBack = makeEl('button', 'btn-ghost-sm', '← 返回');
    btnBack.setAttribute('aria-label', '返回难度选择');
    btnBack.addEventListener('click', backToDifficulty);
    topbar.appendChild(btnBack);
    topbar.appendChild(makeEl('span', 'level-title', lv.name));
    timerEl = makeEl('span', 'top-timer', '⏱ 00.0');
    topbar.appendChild(timerEl);
    viewEl.appendChild(topbar);

    // 轮次指示「第 x/y 轮」
    roundEl = makeEl('div', 'round-indicator');
    viewEl.appendChild(roundEl);

    // 目标大卡
    var targetSection = makeEl('div', 'target-section');
    targetSection.appendChild(makeEl('div', 'section-label', '👀 找出和上面一模一样的那一个'));
    targetBox = makeEl('div', 'target-card pop');
    targetSection.appendChild(targetBox);
    viewEl.appendChild(targetSection);

    // 候选格（m3: 33.33%×1行；m4: 50%×2行；m5: 33.33%×2行）
    gridEl = makeEl('div', 'candidates-grid m' + lv.m);
    viewEl.appendChild(gridEl);

    newRound();
    updateErrorsUI();
    updateTimerUI();
  }
  function renderRoundDom() {
    if (roundEl) {
      roundEl.textContent = '第 ' + (state.round + 1) + '/' + state.totalRounds + ' 轮';
    }
    // 目标大卡（重插 innerHTML + 重新 pop 动画）
    if (targetBox) {
      targetBox.innerHTML = '<span class="target-tag">目标</span>' +
        elementCardSvg(state.element, { fill: state.element.fill, variant: 0, s: 1, dx: 0, dy: 0 });
      targetBox.className = 'target-card pop';
    }
    // 候选卡
    clearNode(gridEl);
    cardEls = [];
    for (var i = 0; i < state.candidates.length; i++) {
      (function (idx) {
        var p = state.candidates[idx].params;
        var cell = makeEl('div', 'cand-cell');
        var innerEl = makeEl('div', 'cand-inner');
        innerEl.innerHTML = elementCardSvg(state.element, p);
        cell.appendChild(innerEl);
        cell.addEventListener('click', function () { onCardTap(idx); });
        cardEls[idx] = cell;
        gridEl.appendChild(cell);
      })(i);
    }
  }

  /* ---------- 交互 ---------- */
  function onCardTap(idx) {
    if (state.won) { return; }
    var cell = cardEls[idx];
    if (!cell || cell.className.indexOf('locked') !== -1) { return; } // 动画中防连点
    ensureAudio();
    sndClick();
    if (idx === state.answerIndex) {
      // 正确：绿闪 300ms → 进下一轮 / 通关
      state.correct++;
      sndCorrect();
      lockAll();
      flashCard(idx, 'correct');
      if (state.correct >= state.totalRounds) {
        window.setTimeout(finishGame, 350);
      } else {
        window.setTimeout(function () {
          state.round++;
          unlockAll();
          newRound();
        }, 350);
      }
    } else {
      // 错误：红闪 400ms，留在本轮可重试
      state.errors++;
      sndWrong();
      flashCard(idx, 'wrong');
      updateErrorsUI();
    }
  }
  function lockAll() {
    for (var i = 0; i < cardEls.length; i++) {
      var c = cardEls[i];
      if (c) { c.className = c.className + ' locked'; }
    }
  }
  function unlockAll() {
    for (var i = 0; i < cardEls.length; i++) {
      var c = cardEls[i];
      if (c) { c.className = c.className.replace(' locked', ''); }
    }
  }
  function flashCard(idx, cls) {
    var cell = cardEls[idx];
    if (!cell) { return; }
    cell.className = 'cand-cell ' + cls + ' locked';
    var self = cell;
    window.setTimeout(function () {
      self.className = 'cand-cell';
    }, 400);
  }
  function updateErrorsUI() {
    if (errorsEl) { errorsEl.textContent = '❌ ' + state.errors; }
  }

  /* ---------- 通关 / 星级 / 最佳 ---------- */
  function calcStars(errors) {
    // 0 错 → 3 星；1~2 错 → 2 星；≥3 错 → 1 星
    if (errors === 0) { return 3; }
    if (errors <= 2) { return 2; }
    return 1;
  }
  function betterThan(starsA, msA, starsB, msB) {
    // 最佳成绩判定：星级高优先，同星比用时
    if (starsA !== starsB) { return starsA > starsB; }
    return msA < msB;
  }
  function starsText(n) {
    var s = '';
    for (var i = 0; i < 3; i++) { s += (i < n) ? '★' : '☆'; }
    return s;
  }
  function finishGame() {
    if (state.won) { return; }
    state.won = true;
    stopTimer();
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
    // 结算浮层
    var notes = [
      { cls: 'checkin-line', text: '✅ 今日已打卡 · 连续 ' + (store.checkin.streak || 0) + ' 天' }
    ];
    var btns = [
      { text: '再来一局', cls: 'btn-main', act: function () { restartRound(); } },
      { text: '选难度', cls: 'btn-ghost', act: function () { backToDifficulty(); } },
      { text: '打卡日历', cls: 'btn-ghost', act: function () { showCheckinView(); } }
    ];
    var sub = '用时 ' + fmtTime(ms) + ' 秒 · 错误 ' + errors + ' 次';
    showOverlay('🎉 全找对啦！', sub, notes, btns);
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
    renderHeader();
    clearNode(viewEl);
    viewEl.appendChild(makeEl('div', 'page-title', '选择难度'));
    viewEl.appendChild(makeEl('div', 'home-hint', '看上面的目标图案，找到和它一模一样的那一个，点一点！'));
    var list = makeEl('div', 'diff-list');
    var keys = ['1', '2', '3'];
    for (var i = 0; i < keys.length; i++) {
      (function (k) {
        var lv = LEVELS[k];
        var btn = makeEl('button', 'diff-btn');
        var head = makeEl('span', 'diff-head', '👉 ' + lv.name + ' · ' + lv.rounds + ' 轮 · 每轮 ' + lv.m + ' 选 1');
        btn.appendChild(head);
        var best = store.best[k];
        var sub = best
          ? '最佳 ' + starsText(best.stars) + ' · ' + fmtBestTime(best.ms) + ' · 错 ' + best.errors
          : '暂无成绩 · 来挑战！';
        btn.appendChild(makeEl('span', 'diff-sub', sub));
        btn.setAttribute('aria-label', lv.name + '难度 ' + lv.rounds + ' 轮 每轮 ' + lv.m + ' 选 1');
        btn.addEventListener('click', function () { startGame(k); });
        list.appendChild(btn);
      })(keys[i]);
    }
    viewEl.appendChild(list);
    renderHomeFooter();
  }
  function startGame(levelKey) {
    if (!ELEMENTS.length) {
      viewEl.textContent = '元素库缺失，请检查 elements.js';
      return;
    }
    var lv = LEVELS[levelKey];
    state.level = levelKey;
    state.totalRounds = lv.rounds;
    state.round = 0;
    state.correct = 0;
    state.errors = 0;
    state.won = false;
    state.element = null;
    state.ms = 0;
    usedElementIds = [];
    stopTimer();
    renderGameView();
    renderGameFooter();
    startTimer(); // 整局计时：游戏页渲染即开始（§4.1）
  }
  function backToDifficulty() {
    hideOverlay();
    stopTimer();
    showDifficultyView();
  }
  function restartRound() {
    hideOverlay();
    startGame(state.level);
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
