/* ============================================================
   动物配对 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   数据：window.APP_DATA（data.js 注入，build 生成 meta，可缺失）
   玩法：左列动物卡（固定顺序 N 条）→ 右列栖息地卡（洗牌 N 个）。
         点动物 → 点栖息地：该动物生活在该栖息地 → 配对成功（绿标+淡化+✓）；
         否则红闪 + 错误计数 + 取消选中。全部配对完成过关。
   卡片 = 大字 emoji + 文字标签（对标反义词配对模式，零素材，Chrome 61 兼容）。
   六大家园：海边🌊 / 森林🌲 / 农场🏡 / 海底🐠 / 花园🌷 / 冬日❄️。
   三档难度：栖息地数 ≥ 对数（保证栖息地卡不重复）：
     简单 2 对（海边+森林）/ 普通 4 对（海边+森林+农场+海底）/ 困难 5 对（6 中随机 5）。
   设计约束（对齐 series/益智/设计文档.md §5 / 反义词配对）：
   - 不使用 import/export / type="module"；不超出 ES2017；var + function
   - 事件全部 addEventListener，无内联事件 / eval
   - 无 fetch/XHR/Worker；localStorage 读写 try/catch
   - 音效：Web Audio OscillatorNode 合成（无音频文件，合规）
   - 计时：performance.now() + setInterval(100ms) 按差值刷新
   - 成绩/打卡：localStorage key 带工具前缀 redtools.dongwupeidui.v1
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };

  /* ---------- 栖息地定义 ---------- */
  var HABITATS = [
    { key: 'sea',    name: '海边', emoji: '🌊' },
    { key: 'forest', name: '森林', emoji: '🌲' },
    { key: 'farm',   name: '农场', emoji: '🏡' },
    { key: 'ocean',  name: '海底', emoji: '🐠' },
    { key: 'garden', name: '花园', emoji: '🌷' },
    { key: 'winter', name: '冬日', emoji: '❄️' }
  ];

  /* 动物归属表：动物 key -> habitat key（每栖息地 ≥ 1 动物） */
  var ANIMAL_HABITAT = {
    seagull: 'sea', fish: 'sea', crab: 'sea', starfish: 'sea',
    squirrel: 'forest', fox: 'forest', rabbit: 'forest', owl: 'forest',
    cow: 'farm', sheep: 'farm', chicken: 'farm', duck: 'farm',
    turtle: 'ocean', jellyfish: 'ocean', whale: 'ocean', octopus: 'ocean',
    butterfly: 'garden', bee: 'garden', snail: 'garden',
    penguin: 'winter', deer: 'winter'
  };
  var ANIMAL_EMOJI = {
    seagull: '🐦', fish: '🐟', crab: '🦀', starfish: '⭐',
    squirrel: '🐿️', fox: '🦊', rabbit: '🐰', owl: '🦉',
    cow: '🐮', sheep: '🐑', chicken: '🐔', duck: '🦆',
    turtle: '🐢', jellyfish: '🪼', whale: '🐳', octopus: '🐙',
    butterfly: '🦋', bee: '🐝', snail: '🐌',
    penguin: '🐧', deer: '🦌'
  };
  var ANIMAL_NAMES = {
    seagull: '海鸥', fish: '小鱼', crab: '螃蟹', starfish: '海星',
    squirrel: '松鼠', fox: '狐狸', rabbit: '兔子', owl: '猫头鹰',
    cow: '奶牛', sheep: '绵羊', chicken: '小鸡', duck: '鸭子',
    turtle: '海龟', jellyfish: '水母', whale: '鲸鱼', octopus: '章鱼',
    butterfly: '蝴蝶', bee: '蜜蜂', snail: '蜗牛',
    penguin: '企鹅', deer: '小鹿'
  };

  /* ---------- 难度定义（栖息地集合 × 对数，栖息地数 ≥ 对数保证卡不重复） ---------- */
  var LEVELS = [
    { key: '1', name: '简单', habitatKeys: ['sea', 'forest'], pairs: 2 },
    { key: '2', name: '普通', habitatKeys: ['sea', 'forest', 'farm', 'ocean'], pairs: 4 },
    { key: '3', name: '困难', habitatKeys: ['sea', 'forest', 'farm', 'ocean', 'garden', 'winter'], pairs: 5 }
  ];

  /* ---------- DOM ---------- */
  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');
  var footerEl = document.getElementById('app-footer');
  var timerEl = null;
  var errorsEl = null;
  var roundEl = null;
  var cardEls = [];
  var overlayEl = null;

  /* ---------- 状态 ---------- */
  var state = {
    level: '1',
    cards: [],          // [{pid, side:'animal'|'habitat', key, emoji, label, matched}]
    selected: -1,
    matchedCount: 0,
    totalMatches: 0,
    errors: 0,
    won: false,
    startMs: 0,
    ms: 0,
    timerId: 0
  };

  /* ---------- 持久化（redtools.dongwupeidui.v1） ---------- */
  var STORE_KEY = 'redtools.dongwupeidui.v1';
  LX_SHARED.storage.configure({ toolName: 'dongwupeidui' });  // V0.4 迁移：键前缀 redtools.dongwupeidui.v1
  function defaultStore() {
    return {
      version: 1,
      best: {},
      recent: {},
      checkin: { dates: [], streak: 0 },
      history: []
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
  function shuffle(arr) {
    var a = arr.slice();
    for (var j = a.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = a[j]; a[j] = a[k]; a[k] = t;
    }
    return a;
  }

  /* ---------- 栖息地查询 ---------- */
  function findHabitat(key) {
    for (var i = 0; i < HABITATS.length; i++) {
      if (HABITATS[i].key === key) { return HABITATS[i]; }
    }
    return null;
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

  /* ---------- 出题 ---------- */
  function findLevel(key) {
    for (var i = 0; i < LEVELS.length; i++) {
      if (LEVELS[i].key === key) { return LEVELS[i]; }
    }
    return null;
  }
  function newGame(levelKey) {
    stopTimer();
    state.level = levelKey;
    var lv = findLevel(levelKey);
    // 每个栖息地随机抽 1 只动物（栖息地数 ≥ 对数 → 栖息地卡必不重复）
    var habKeys = shuffle(lv.habitatKeys.slice()).slice(0, lv.pairs);
    var picked = [];
    for (var h = 0; h < habKeys.length; h++) {
      var cands = [];
      for (var akey in ANIMAL_HABITAT) {
        if (ANIMAL_HABITAT.hasOwnProperty(akey) && ANIMAL_HABITAT[akey] === habKeys[h] && picked.indexOf(akey) < 0) {
          cands.push(akey);
        }
      }
      if (cands.length) { picked.push(shuffle(cands)[0]); }
    }
    // 兜底（理论上不会触发）
    var all = [];
    for (var a2 in ANIMAL_HABITAT) {
      if (ANIMAL_HABITAT.hasOwnProperty(a2)) { all.push(a2); }
    }
    while (picked.length < lv.pairs) {
      var cand2 = shuffle(all)[0];
      if (picked.indexOf(cand2) < 0) { picked.push(cand2); }
    }
    var cards = [];
    for (var i = 0; i < picked.length; i++) {
      cards.push({
        pid: i, side: 'animal',
        key: picked[i],
        emoji: ANIMAL_EMOJI[picked[i]] || '🐾',
        label: ANIMAL_NAMES[picked[i]] || picked[i],
        matched: false
      });
    }
    for (var k = 0; k < picked.length; k++) {
      var hab = findHabitat(ANIMAL_HABITAT[picked[k]]);
      cards.push({
        pid: k, side: 'habitat',
        key: ANIMAL_HABITAT[picked[k]],
        emoji: hab ? hab.emoji : '🏠',
        label: hab ? hab.name : '',
        matched: false
      });
    }
    // 左列动物固定顺序，右列栖息地洗牌
    var left = [], right = [];
    for (var c = 0; c < cards.length; c++) {
      if (cards[c].side === 'animal') { left.push(cards[c]); }
      else { right.push(cards[c]); }
    }
    state.cards = left.concat(shuffle(right));
    state.selected = -1;
    state.matchedCount = 0;
    state.totalMatches = lv.pairs;
    state.errors = 0;
    state.won = false;
    state.startMs = 0;
    state.ms = 0;
  }

  /* ---------- 渲染：头部 / 页脚 ---------- */
  function renderHeader(title) {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '动物配对';
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

  /* ---------- 渲染：游戏视图 ---------- */
  function renderGameView() {
    clearNode(viewEl);
    cardEls = [];
    var lv = findLevel(state.level);

    var topbar = makeEl('div', 'topbar');
    var btnBack = makeEl('button', 'btn-ghost-sm', '← 返回');
    btnBack.setAttribute('aria-label', '返回难度选择');
    btnBack.addEventListener('click', backToDifficulty);
    topbar.appendChild(btnBack);
    topbar.appendChild(makeEl('span', 'level-title', lv ? lv.name : ''));
    timerEl = makeEl('span', 'top-timer', '⏱ 00.0');
    topbar.appendChild(timerEl);
    viewEl.appendChild(topbar);

    roundEl = makeEl('div', 'pc-round', '');
    viewEl.appendChild(roundEl);

    viewEl.appendChild(makeEl('div', 'game-status', '👀 点一只动物，再点它生活的家园'));

    var area = makeEl('div', 'pair-area');
    var leftCol = makeEl('div', 'pair-col');
    leftCol.appendChild(makeEl('div', 'col-head', '动 物'));
    var rightCol = makeEl('div', 'pair-col');
    rightCol.appendChild(makeEl('div', 'col-head', '家 园'));
    for (var i = 0; i < state.cards.length; i++) {
      (function (idx) {
        var card = state.cards[idx];
        var holder = makeEl('div', 'pair-card');
        var inner = makeEl('div', 'pair-card-inner');
        inner.appendChild(makeEl('span', 'card-emoji', card.emoji));
        inner.appendChild(makeEl('span', 'card-label', card.label));
        holder.appendChild(inner);
        holder.addEventListener('click', function () { onCardTap(idx); });
        cardEls[idx] = holder;
        if (card.side === 'animal') { leftCol.appendChild(holder); }
        else { rightCol.appendChild(holder); }
      })(i);
    }
    area.appendChild(leftCol);
    area.appendChild(rightCol);
    viewEl.appendChild(area);

    updateProgress();
  }
  function updateProgress() {
    if (roundEl) {
      roundEl.textContent = '配对 ' + state.matchedCount + '/' + state.totalMatches;
    }
  }
  function refreshCardClasses() {
    for (var i = 0; i < cardEls.length; i++) {
      var el = cardEls[i];
      if (!el) { continue; }
      var cls = 'pair-card';
      if (state.cards[i].matched) { cls += ' matched'; }
      else if (i === state.selected) { cls += ' selected'; }
      el.className = cls;
    }
  }

  /* ---------- 交互 ---------- */
  function onCardTap(idx) {
    if (state.won) { return; }
    ensureAudio();
    var card = state.cards[idx];
    if (card.matched) { return; }
    if (state.selected === -1) {
      state.selected = idx;
      sndClick();
      refreshCardClasses();
    } else if (state.selected === idx) {
      state.selected = -1;
      sndClick();
      refreshCardClasses();
    } else if (state.cards[state.selected].side === card.side) {
      state.selected = idx;
      sndClick();
      refreshCardClasses();
    } else {
      var a = state.cards[state.selected];
      var sel = state.selected;
      if (a.pid === card.pid) {
        a.matched = true;
        card.matched = true;
        state.matchedCount++;
        state.selected = -1;
        sndCorrect();
        refreshCardClasses();
        updateProgress();
        if (state.matchedCount >= state.totalMatches) {
          setTimeout(function () { onWin(); }, 500);
        }
      } else {
        state.errors++;
        sndWrong();
        state.selected = -1;
        var elA = cardEls[sel];
        var elB = cardEls[idx];
        if (elA) { elA.className = 'pair-card wrong'; }
        if (elB) { elB.className = 'pair-card wrong'; }
        (function (ea, eb) {
          setTimeout(function () {
            if (ea) { ea.className = 'pair-card'; }
            if (eb) { eb.className = 'pair-card'; }
          }, 400);
        })(elA, elB);
        updateErrorsUI();
      }
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
    showOverlay('🎉 全部送回家啦！', sub, notes, btns);
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
    viewEl.appendChild(makeEl('div', 'home-hint', '把动物送回它的家园！'));
    var list = makeEl('div', 'diff-list');
    for (var i = 0; i < LEVELS.length; i++) {
      (function (l) {
        var btn = makeEl('button', 'diff-btn');
        var head = makeEl('span', 'diff-head', '👉 ' + l.name);
        var badge = makeEl('span', 'diff-badge', l.pairs + ' 对');
        head.appendChild(badge);
        btn.appendChild(head);
        var best = store.best[l.key];
        var sub = best
          ? '最佳 ' + starsText(best.stars) + ' · ' + fmtBestTime(best.ms) + ' · 错 ' + best.errors
          : '暂无成绩 · 来挑战！';
        btn.appendChild(makeEl('span', 'diff-sub', sub));
        btn.setAttribute('aria-label', l.name + '难度 ' + l.pairs + '对');
        btn.addEventListener('click', function () { startGame(l.key); });
        list.appendChild(btn);
      })(LEVELS[i]);
    }
    viewEl.appendChild(list);
    var tips = makeEl('div', 'tip-list');
    tips.appendChild(makeEl('div', 'tip-title', '🐾 小知识'));
    tips.appendChild(makeEl('div', 'tip-line', '· 海边 / 森林 / 农场 / 海底 / 花园 / 冬日 六大家园'));
    tips.appendChild(makeEl('div', 'tip-line', '· 配对完成即打卡，可滚动回看成绩'));
    viewEl.appendChild(tips);
    renderHomeFooter();
  }
  function startGame(levelKey) {
    newGame(levelKey);
    renderGameView();
    renderGameFooter();
    startTimer();
  }
  function backToDifficulty() {
    hideOverlay();
    stopTimer();
    showDifficultyView();
  }
  function restartGame() {
    hideOverlay();
    stopTimer();
    newGame(state.level);
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

  /* ---------- 调试接口（smoke 测试用，生产无副作用） ---------- */
  if (window.DWPD_DEBUG === undefined) {
    window.DWPD_DEBUG = {
      getState: function () {
        return {
          level: state.level,
          cards: state.cards,
          selected: state.selected,
          matchedCount: state.matchedCount,
          totalMatches: state.totalMatches,
          errors: state.errors,
          won: state.won
        };
      }
    };
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