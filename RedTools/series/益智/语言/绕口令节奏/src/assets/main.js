/* ============================================================
   绕口令节奏 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   数据：window.APP_DATA（data.js 注入，build 生成 meta，可缺失）
   玩法：内置经典绕口令库 → 选难度选绕口令 → 逐句节奏训练：
         每句按速度档给出倒计时，孩子念完点「我念完啦」→ 命中进下一句；
         超时未点 → 过时 miss 自动推进。全部念完 → 命中率星级。
   零音频依赖：绕口令为孩子自己大声念，工具只做节奏引导与同步判定
   （无 TTS / 无音频文件 / 无麦克风 / 100% 离线合规）。
   节奏条：setInterval(100ms) 按缓冲差值刷新（§4.1）。
   成绩/打卡：localStorage key 带工具前缀 redtools.raokoulingjiezou.v1
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };

  /* ---------- 经典绕口令库（8 首，零版权素材，含断句） ---------- */
  var RAPS = [
    { title: '四是四', diff: '1', lines: [
      '四是四，十是十，',
      '十四是十四，',
      '四十是四十，',
      '莫把四字说成十，休将十字说成四。'
    ] },
    { title: '吃葡萄', diff: '1', lines: [
      '吃葡萄不吐葡萄皮，',
      '不吃葡萄倒吐葡萄皮。'
    ] },
    { title: '扁担与板凳', diff: '2', lines: [
      '扁担长，板凳宽，',
      '扁担没有板凳宽，',
      '板凳没有扁担长，',
      '扁担绑在板凳上，',
      '板凳不让扁担绑在板凳上。'
    ] },
    { title: '八百标兵', diff: '2', lines: [
      '八百标兵奔北坡，',
      '炮兵并排北边跑，',
      '炮兵怕把标兵碰，',
      '标兵怕碰炮兵炮。'
    ] },
    { title: '红鲤鱼绿鲤鱼', diff: '2', lines: [
      '红鲤鱼，绿鲤鱼，',
      '红鲤鱼不理绿鲤鱼，',
      '绿鲤鱼不理红鲤鱼。'
    ] },
    { title: '黑化肥灰化肥', diff: '3', lines: [
      '黑化肥发灰，灰化肥发黑，',
      '黑化肥发灰会挥发，',
      '灰化肥挥发会发黑，',
      '黑化肥挥发会发灰。'
    ] },
    { title: '山前四十四棵柿子树', diff: '3', lines: [
      '山前有四十四棵死涩柿子树，',
      '山后有四十四只石狮子，',
      '山前的四十四棵死涩柿子树，',
      '涩死了山后的四十四只石狮子。'
    ] },
    { title: '数枣', diff: '3', lines: [
      '出东门，过大桥，',
      '大桥底下一树枣，',
      '拿着杆子去打枣，',
      '青的多，红的少，',
      '一颗枣，两颗枣，',
      '三颗枣，四颗枣，',
      '五颗枣，六颗枣，',
      '七颗枣，八颗枣，',
      '九颗枣，十颗枣——'
    ] }
  ];
  function rapsByDiff(diffKey) {
    var out = [];
    for (var i = 0; i < RAPS.length; i++) {
      if (RAPS[i].diff === diffKey) { out.push(RAPS[i]); }
    }
    return out;
  }

  /* ---------- 难度 / 速度定义 ---------- */
  var DIFFS = [
    { key: '1', name: '简单', desc: '2 首 · 2~4 句' },
    { key: '2', name: '普通', desc: '3 首 · 3~5 句' },
    { key: '3', name: '困难', desc: '3 首 · 4~9 句' }
  ];
  var SPEEDS = [
    { key: '1', name: '慢速 🐢', sec: 8 },
    { key: '2', name: '常速 🐇', sec: 6 },
    { key: '3', name: '快速 ⚡', sec: 4 }
  ];
  function findDiff(key) {
    for (var i = 0; i < DIFFS.length; i++) {
      if (DIFFS[i].key === key) { return DIFFS[i]; }
    }
    return DIFFS[1];
  }
  function findSpeed(key) {
    for (var i = 0; i < SPEEDS.length; i++) {
      if (SPEEDS[i].key === key) { return SPEEDS[i]; }
    }
    return SPEEDS[1];
  }

  /* ---------- DOM ---------- */
  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');
  var footerEl = document.getElementById('app-footer');
  var overlayEl = null;
  var rhythmFillEl = null;
  var remainTextEl = null;
  var hitEl = null;
  var missEl = null;

  /* ---------- 状态 ---------- */
  var state = {
    diff: '1',          // 当前难度 key
    rap: 0,             // 当前绕口令在 RAPS 的下标
    speed: '2',         // 当前速度 key
    curIdx: 0,          // 当前句下标
    hits: 0,
    misses: 0,
    won: false,
    startMs: 0,
    ms: 0,
    lineTimerId: 0,     // 本句倒计时 interval
    remainMs: 0         // 本句剩余毫秒
  };

  /* ---------- 持久化（redtools.raokoulingjiezou.v1） ---------- */
  var STORE_KEY = 'redtools.raokoulingjiezou.v1';
  function defaultStore() {
    return {
      version: 1,
      best: {},         // key = diff-rapIndex → {hits, misses, ms, stars, date}
      recent: {},       // key = diff-rapIndex → ms
      checkin: { dates: [], streak: 0 },
      history: []
    };
  }
  function loadStore() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        var obj = JSON.parse(raw);
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
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : '' + m) + '-' + (day < 10 ? '0' + day : '' + day);
  }
  function fmtTime(ms) {
    var s = Math.round(ms / 1000);
    if (s < 60) { return '' + s; }
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + '分' + (r < 10 ? '0' + r : '' + r) + '秒';
  }
  function fmtBestRate(b) {
    return '命中 ' + b.hits + '/' + (b.hits + b.misses) + ' · ' + b.ms / 1000 + ' 秒';
  }

  /* ---------- 音效（Web Audio 合成，无音频文件） ---------- */
  var ac = null;
  function getAudio() {
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (err) { ac = null; }
    }
    return ac;
  }
  function tone(freq, start, dur, type) {
    var ctx = getAudio();
    if (!ctx) { return; }
    try {
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      var t0 = ctx.currentTime + start;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch (err) { /* ignore */ }
  }
  function sndHit() { tone(880, 0, 0.14, 'sine'); tone(1318, 0.06, 0.16, 'sine'); }
  function sndMiss() { tone(240, 0, 0.18, 'triangle'); tone(180, 0.08, 0.22, 'triangle'); }
  function sndWin() { tone(523, 0, 0.16, 'sine'); tone(659, 0.1, 0.16, 'sine'); tone(784, 0.2, 0.3, 'sine'); }

  /* ---------- 顶栏 ---------- */
  function renderHeader(title) {
    clearNode(headerEl);
    var logo = makeEl('div', 'hd-logo', '🗣️');
    logo.className = 'hd-logo';
    headerEl.appendChild(logo);
    var box = makeEl('div');
    box.appendChild(makeEl('div', 'hd-title', title || '绕口令节奏'));
    var meta = APP.meta || {};
    box.appendChild(makeEl('div', 'hd-sub', '语言·节奏 v' + (meta.version || '1.0')));
    headerEl.appendChild(box);
    var right = makeEl('div', 'hd-right');
    headerEl.appendChild(right);
  }

  /* ---------- 计时 ---------- */
  function startTotalTimer() {
    state.startMs = performance.now();
  }
  function stopTotalTimer() {
    state.ms = performance.now() - state.startMs;
  }

  /** 本句倒计时（100ms 刷新节奏条） */
  function startLineTimer() {
    stopLineTimer();
    var sec = findSpeed(state.speed).sec;
    state.remainMs = sec * 1000;
    if (rhythmFillEl) { rhythmFillEl.className = 'rhythm-fill'; }
    state.lineTimerId = setInterval(onLineTick, 100);
    updateRhythmUI();
  }
  function stopLineTimer() {
    if (state.lineTimerId) {
      clearInterval(state.lineTimerId);
      state.lineTimerId = 0;
    }
  }
  function onLineTick() {
    if (state.won) { return; }
    state.remainMs -= 100;
    if (state.remainMs <= 0) {
      state.remainMs = 0;
      stopLineTimer();
      onLineTimeout();
      return;
    }
    updateRhythmUI();
  }
  function updateRhythmUI() {
    var sec = findSpeed(state.speed).sec;
    var total = sec * 1000;
    var ratio = state.remainMs / total;
    if (rhythmFillEl) {
      rhythmFillEl.style.width = Math.max(0, Math.min(100, ratio * 100)) + '%';
      if (ratio <= 0.25) { rhythmFillEl.className = 'rhythm-fill urgent'; }
      else { rhythmFillEl.className = 'rhythm-fill'; }
    }
    var remainSec = Math.max(0, Math.ceil(state.remainMs / 1000));
    if (remainTextEl) { remainTextEl.textContent = '⏱ 还剩 ' + remainSec + ' 秒'; }
  }
  function onLineTimeout() {
    if (state.won) { return; }
    state.misses += 1;
    sndMiss();
    if (missEl) { missEl.textContent = '过时 ' + state.misses; }
    advanceLine();
  }
  /** 孩子点「我念完啦」→ 命中 → 下一句 */
  function onHit() {
    if (state.won) { return; }
    stopLineTimer();
    state.hits += 1;
    sndHit();
    if (hitEl) { hitEl.textContent = '👄 命中 ' + state.hits; }
    advanceLine();
  }
  function advanceLine() {
    var lines = RAPS[state.rap].lines;
    state.curIdx += 1;
    if (state.curIdx >= lines.length) {
      onWin();
      return;
    }
    renderCurrentLine();
    startLineTimer();
  }
  function switchSpeed(newKey) {
    if (state.won) { return; }
    state.speed = newKey;
    stopLineTimer();
    renderSpeedRow();
    renderCurrentLine();
    startLineTimer(); // 换档后本句计时重置为新秒数
  }

  /* ---------- 赛局渲染 ---------- */
  function renderCurrentLine() {
    var lines = RAPS[state.rap].lines;
    var curEl = document.getElementById('cur-line');
    if (curEl) { curEl.textContent = lines[state.curIdx]; }
    var fls = document.querySelectorAll('.fl-line');
    for (var i = 0; i < fls.length; i++) {
      var c = 'fl-line';
      if (i < state.curIdx) { c += ' done'; }
      else if (i === state.curIdx) { c += ' on'; }
      fls[i].className = c;
    }
    var progEl = document.getElementById('round-prog');
    if (progEl) { progEl.textContent = '第 ' + (state.curIdx + 1) + '/' + lines.length + ' 句'; }
  }
  function renderSpeedRow() {
    var box = document.getElementById('speed-row');
    if (!box) { return; }
    clearNode(box);
    for (var i = 0; i < SPEEDS.length; i++) {
      (function (sp) {
        var btn = makeEl('button', 'speed-btn' + (sp.key === state.speed ? ' on' : ''), sp.name);
        btn.addEventListener('click', function () { switchSpeed(sp.key); });
        box.appendChild(btn);
      })(SPEEDS[i]);
    }
  }
  function renderRoundView() {
    stopTotalTimer();
    startTotalTimer();
    state.won = false;
    state.curIdx = 0;
    state.hits = 0;
    state.misses = 0;
    var rap = RAPS[state.rap];
    renderHeader('绕口令节奏');
    clearNode(viewEl);

    var head = makeEl('div', 'round-head');
    head.appendChild(makeEl('div', 'round-title', '🗣️ ' + rap.title));
    var prog = makeEl('div', 'round-prog', '');
    prog.id = 'round-prog';
    head.appendChild(prog);
    viewEl.appendChild(head);

    var speedRow = makeEl('div', 'speed-row');
    speedRow.id = 'speed-row';
    viewEl.appendChild(speedRow);
    renderSpeedRow();

    var fl = makeEl('div', 'full-list');
    for (var i = 0; i < rap.lines.length; i++) {
      var l = makeEl('div', 'fl-line');
      l.appendChild(makeEl('span', 'fl-idx', '' + (i + 1)));
      l.appendChild(document.createTextNode(rap.lines[i]));
      fl.appendChild(l);
    }
    viewEl.appendChild(fl);

    var curBox = makeEl('div', 'cur-box');
    var curLine = makeEl('div', 'cur-line', rap.lines[0]);
    curLine.id = 'cur-line';
    curBox.appendChild(curLine);
    viewEl.appendChild(curBox);

    var rb = makeEl('div', 'rhythm-block');
    var lbl = makeEl('div', 'rhythm-label');
    hitEl = makeEl('span', 'rl-hit', '👄 命中 0');
    missEl = makeEl('span', 'rl-miss', '过时 0');
    lbl.appendChild(hitEl);
    lbl.appendChild(missEl);
    rb.appendChild(lbl);
    var bar = makeEl('div', 'rhythm-bar');
    rhythmFillEl = makeEl('div', 'rhythm-fill');
    bar.appendChild(rhythmFillEl);
    rb.appendChild(bar);
    remainTextEl = makeEl('div', 'remain-text', '');
    rb.appendChild(remainTextEl);
    viewEl.appendChild(rb);

    viewEl.appendChild(makeEl('div', 'muted', '大声念出这一句，念完快点点「我念完啦」！'));

    renderRoundFooter();
    renderCurrentLine();
    startLineTimer();
  }
  function renderRoundFooter() {
    clearNode(footerEl);
    var btn = makeEl('button', 'btn-hit', '👄 我念完啦！');
    btn.setAttribute('aria-label', '念完当前句');
    btn.addEventListener('click', onHit);
    footerEl.appendChild(btn);
  }

  /* ---------- 通关 / 星级 / 最佳 ---------- */
  function calcStars(hits, misses) {
    var total = hits + misses;
    if (total <= 0) { return 1; }
    var rate = hits / total;
    if (rate >= 1) { return 3; }
    if (rate >= 0.8) { return 2; }
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
    stopLineTimer();
    stopTotalTimer();
    state.ms = performance.now() - state.startMs;
    sndWin();
    var rap = RAPS[state.rap];
    var ms = Math.round(state.ms);
    var hits = state.hits;
    var misses = state.misses;
    var stars = calcStars(hits, misses);
    var key = state.diff + '-' + state.rap;
    var isNewBest = false;
    var best = store.best[key];
    if (!best || betterThan(stars, ms, best.stars, best.ms)) {
      store.best[key] = { hits: hits, misses: misses, ms: ms, stars: stars, date: fmtDate(new Date()) };
      isNewBest = true;
    }
    store.recent[key] = ms;
    store.history.push({ date: fmtDate(new Date()), diff: state.diff, rap: rap.title, hits: hits, misses: misses, stars: stars });
    while (store.history.length > 30) { store.history.shift(); }
    doCheckin();
    saveStore();
    var total = hits + misses;
    var notes = [
      { cls: 'checkin-line', text: '✅ 今日已打卡 · 连续 ' + (store.checkin.streak || 0) + ' 天' }
    ];
    var btns = [
      { text: '🔁 再念一遍', cls: 'btn-main', act: function () { restartRound(); } },
      { text: '换一首', cls: 'btn-ghost', act: function () { backToRapList(); } },
      { text: '📅 打卡日历', cls: 'btn-ghost', act: function () { showCheckinView(); } }
    ];
    var sub = '命中 ' + hits + '/' + total + ' 句 · 用时 ' + fmtTime(ms);
    showOverlay(stars >= 3 ? '🎉 一气呵成！' : '👏 念完啦！', sub, notes, btns);
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

  /* ---------- 视图切换 ---------- */
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

  function showDifficultyView() {
    stopLineTimer();
    hideOverlay();
    state.won = false;
    renderHeader('绕口令节奏');
    clearNode(viewEl);
    viewEl.appendChild(makeEl('div', 'page-title', '选择难度'));
    viewEl.appendChild(makeEl('div', 'home-hint', '大声念绕口令，跟着节奏点「我念完啦」！'));
    var list = makeEl('div', 'diff-list');
    for (var i = 0; i < DIFFS.length; i++) {
      (function (d) {
        var btn = makeEl('button', 'diff-btn');
        var heads = ['👶', '😊', '💪'];
        var head = makeEl('span', 'diff-head', heads[parseInt(d.key, 10) - 1] + ' ' + d.name + ' · ' + d.desc);
        btn.appendChild(head);
        var raps = rapsByDiff(d.key);
        btn.appendChild(makeEl('span', 'diff-sub', '共 ' + raps.length + ' 首绕口令'));
        btn.setAttribute('aria-label', d.name + '难度');
        btn.addEventListener('click', function () { showRapList(d.key); });
        list.appendChild(btn);
      })(DIFFS[i]);
    }
    viewEl.appendChild(list);
    var cc = makeEl('div', 'muted', '连续打卡 ' + (store.checkin.streak || 0) + ' 天');
    viewEl.appendChild(cc);
    clearNode(footerEl);
    var btnCheckin = makeEl('button', 'btn-back', '📅 打卡日历');
    btnCheckin.addEventListener('click', showCheckinView);
    footerEl.appendChild(btnCheckin);
  }

  function showRapList(diffKey) {
    stopLineTimer();
    hideOverlay();
    state.won = false;
    state.diff = diffKey;
    renderHeader('绕口令节奏');
    clearNode(viewEl);
    var d = findDiff(diffKey);
    viewEl.appendChild(makeEl('div', 'page-title', d.name + ' · 选一首'));
    viewEl.appendChild(makeEl('div', 'home-hint', '每句都有节奏倒计时，念完就点！'));
    var list = makeEl('div', 'rap-list');
    var raps = rapsByDiff(diffKey);
    for (var i = 0; i < raps.length; i++) {
      (function (rap, idx) {
        var btn = makeEl('button', 'rap-btn');
        var head = makeEl('span', 'rap-head', '🗣️ ' + rap.title);
        btn.appendChild(head);
        btn.appendChild(makeEl('span', 'rap-sub', rap.lines.length + ' 句 · 一口气念完它！'));
        var bkey = diffKey + '-' + idx;
        var b = store.best[bkey];
        if (b) {
          btn.appendChild(makeEl('span', 'rap-best', '最佳 ' + starsText(b.stars) + ' · 命中 ' + b.hits + '/' + (b.hits + b.misses) + ' · ' + (b.ms / 1000) + ' 秒'));
        } else {
          btn.appendChild(makeEl('span', 'rap-best', '还没念过 · 来挑战！'));
        }
        btn.setAttribute('aria-label', '开始 ' + rap.title);
        btn.addEventListener('click', function () { startRound(idx); });
        list.appendChild(btn);
      })(raps[i], RAPS.indexOf(raps[i]));
    }
    viewEl.appendChild(list);
    clearNode(footerEl);
    var btnBack = makeEl('button', 'btn-back', '← 返回难度');
    btnBack.addEventListener('click', showDifficultyView);
    footerEl.appendChild(btnBack);
  }

  function startRound(rapIndex) {
    state.rap = rapIndex;
    renderRoundView();
  }
  function restartRound() {
    hideOverlay();
    stopLineTimer();
    renderRoundView();
  }
  function backToRapList() {
    hideOverlay();
    stopLineTimer();
    showRapList(state.diff);
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
  function calcStreak(dates) {
    if (!dates || dates.length === 0) { return 0; }
    var seen = {};
    for (var i = 0; i < dates.length; i++) { seen[dates[i]] = true; }
    var cur = new Date();
    var streak = 0;
    var d = cur;
    if (!seen[fmtDate(d)]) {
      d = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() - 1);
    }
    while (seen[fmtDate(d)]) {
      streak += 1;
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
    }
    return streak;
  }

  /* ---------- 渲染：打卡日历视图 ---------- */
  function showCheckinView() {
    hideOverlay();
    stopLineTimer();
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
    for (var dA = 1; dA <= days; dA++) {
      (function (day) {
        var ds = fmtDate(new Date(now.getFullYear(), now.getMonth(), day));
        var el = makeEl('div', 'cal-day', '' + day);
        if (dates.indexOf(ds) !== -1) { el.className = 'cal-day done'; }
        if (ds === t) { el.className += ' today'; }
        grid.appendChild(el);
      })(dA);
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
    var btnBack = makeEl('button', 'btn-back', '← 返回难度');
    btnBack.setAttribute('aria-label', '返回难度选择');
    btnBack.addEventListener('click', showDifficultyView);
    footerEl.appendChild(btnBack);
  }

  /* ---------- 测试钩子（冒烟用） ---------- */
  window.RKLJZ = {
    forceTimeout: function () {
      stopLineTimer();
      onLineTimeout();
    },
    getState: function () { return state; }
  };

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