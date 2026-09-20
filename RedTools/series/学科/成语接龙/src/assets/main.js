/* ============================================================
   成语接龙 — 正式玩法（经典脚本，ES5 风格，Chrome 61 基线）
   ------------------------------------------------------------
   数据：window.CHENGYU_DATA（课本 / 接龙扩展）+ window.CHENGYU_CHAIN
        （首字索引，课本+扩展全量）；window.APP_DATA（meta）
   玩法A（仅接龙，不含配对）：
   - 首页：开始 / 同音容忍开关 / 限时模式开关（30/20/10s）/ 打卡状态
   - 接龙：当前成语大字 + 尾字高亮 + 3 候选（1 对 2 干扰，课本优先，
     扩展层词带「扩展」角标）+ 释义教学卡 + 自动下一步
   - 答错红闪可重选（错卡锁定）；提词每局限 2 次（标记正确候选，计入扣分）
   - 死路检测（同音容忍开时含同音首字）→ 自动结算「这个字没人接得上啦」
   - 限时模式：每步倒计时 mm:ss，超时计 1 错 + 自动高亮正确项
   - 结算：接龙长度 / 总用时 / 错误 / 提示 → 星级 + 打卡 + best/recent10
   - 分享：复制文案（execCommand）+ 1080×1920 canvas 打卡卡片
   - 家长面板：标题连点 5 次（打卡日历小圆点 + recent10 + 重置数据）
   持久化：redtools.chengyu.v1（version 字段，defaultStore/loadStore/saveStore）
   约束：无 import/export、无箭头函数/模板字符串/?. /?? /对象展开/
         async-await；事件全 addEventListener；无内联事件
   ============================================================ */
(function () {
  'use strict';

  /* ---------- DOM ---------- */
  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');
  var footerEl = document.getElementById('app-footer');
  var headerTaps = 0;
  var headerTapTimer = null;
  var feedbackTimer = null;

  /* ---------- 数据（构建期注入，勿在源码造数据） ---------- */
  var APP = window.APP_DATA || { meta: {} };
  var DATA = window.CHENGYU_DATA || { 课本: [], 接龙扩展: [] };
  var CHAIN = window.CHENGYU_CHAIN || {};
  var KEBEN = DATA.课本 || [];
  var EXT = DATA.接龙扩展 || [];
  var ALL = KEBEN.concat(EXT);
  var entryMap = {};      /* 成语 -> entry（课本优先） */
  var kebenSet = {};      /* 成语 -> true（课本层标记） */
  var byFirstPy = {};     /* 无调首字拼音 -> [entry...]（全量，按词读多音字） */

  /* ---------- 持久化 ---------- */
  var STORE_KEY = 'redtools.chengyu.v1';

  function defaultStore() {
    return {
      version: 1,
      checkin: { dates: [], streak: 0 },
      bestLen: 0,          /* 最佳接龙长度（条） */
      recent10: [],        /* 按时间倒序，FIFO ≤10：{len, sec, stars, date} */
      prefs: { homophone: false, timed: false, limitSec: 30 }
    };
  }
  function loadStore() {
    var st = defaultStore();
    try {
      var data = JSON.parse(window.localStorage.getItem(STORE_KEY));
      if (data && typeof data === 'object') {
        if (data.checkin && Array.isArray(data.checkin.dates)) {
          st.checkin = { dates: data.checkin.dates.slice(), streak: data.checkin.streak || 0 };
        }
        if (typeof data.bestLen === 'number') { st.bestLen = data.bestLen; }
        if (Array.isArray(data.recent10)) { st.recent10 = data.recent10.slice(0, 10); }
        if (data.prefs && typeof data.prefs === 'object') {
          var p = data.prefs;
          if (typeof p.homophone === 'boolean') { st.prefs.homophone = p.homophone; }
          if (typeof p.timed === 'boolean') { st.prefs.timed = p.timed; }
          if (p.limitSec === 10 || p.limitSec === 20 || p.limitSec === 30) { st.prefs.limitSec = p.limitSec; }
        }
      }
    } catch (err) { /* 解析失败用默认结构 */ }
    return st;
  }
  function saveStore() {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (err) { /* ignore */ }
  }
  var store = loadStore();
  saveStore();

  /* ---------- 拼音工具（同音判定：声调归一化） ---------- */
  var TONE_MAP = {
    'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a',
    'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
    'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i',
    'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
    'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u',
    'ǖ': 'v', 'ǘ': 'v', 'ǚ': 'v', 'ǜ': 'v', 'ü': 'v'
  };
  function toneLess(py) {
    var out = '';
    for (var i = 0; i < py.length; i++) {
      var ch = py.charAt(i);
      var m = TONE_MAP[ch];
      out += m ? m : ch;
    }
    return out;
  }
  function firstSyllable(e) { return e.拼音.split(' ')[0]; }
  function lastSyllable(e) {
    var a = e.拼音.split(' ');
    return a[a.length - 1];
  }

  /* ---------- 数据索引 ---------- */
  (function buildIndex() {
    var i, e, py;
    for (i = 0; i < KEBEN.length; i++) {
      e = KEBEN[i];
      entryMap[e.成语] = e;
      kebenSet[e.成语] = true;
      py = toneLess(firstSyllable(e));
      if (!byFirstPy[py]) { byFirstPy[py] = []; }
      byFirstPy[py].push(e);
    }
    for (i = 0; i < EXT.length; i++) {
      e = EXT[i];
      if (!entryMap[e.成语]) { entryMap[e.成语] = e; }
      py = toneLess(firstSyllable(e));
      if (!byFirstPy[py]) { byFirstPy[py] = []; }
      byFirstPy[py].push(e);
    }
  })();

  /* ---------- 通用工具 ---------- */
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
  function todayStr() {
    var d = new Date();
    return '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
  }
  function dateStr(d) {
    return '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
  }
  function readableToday() {
    var d = new Date();
    return '' + d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }
  function calcStreak(dates) {
    var streak = 0;
    var d = new Date();
    for (var i = dates.length - 1; i >= 0; i--) {
      if (dates[i] === todayStr()) { streak = 1; continue; }
      d.setDate(d.getDate() - 1);
      if (dates[i] === dateStr(d)) { streak += 1; } else { break; }
    }
    return streak;
  }
  function fmtMMSS(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return p2(m) + ':' + p2(s);
  }
  function randInt(n) { return Math.floor(Math.random() * n); }
  function starStr(s) {
    var n = s >= 3 ? 3 : (s === 2 ? 2 : (s === 1 ? 1 : 0));
    return '★★★'.slice(0, n) + '☆☆☆'.slice(0, 3 - n);
  }
  function toast(msg) {
    var t = makeEl('div', 'toast', msg);
    document.body.appendChild(t);
    window.setTimeout(function () {
      if (t.parentNode) { t.parentNode.removeChild(t); }
    }, 1800);
  }
  function isCheckedinToday() {
    return store.checkin.dates.indexOf(todayStr()) !== -1;
  }

  /* ---------- 对局状态 ---------- */
  var g = null;
  var totalTimerId = null;
  var stepTimerId = null;
  var stepRemain = 0;

  function elapsedSec() {
    return Math.floor((Date.now() - g.startMs) / 1000);
  }

  /* ---------- 计时 ---------- */
  function startTotalTimer() {
    stopTotalTimer();
    totalTimerId = window.setInterval(updateTotalTime, 1000);
    updateTotalTime();
  }
  function stopTotalTimer() {
    if (totalTimerId) { window.clearInterval(totalTimerId); totalTimerId = null; }
  }
  function updateTotalTime() {
    if (!g || g.finished) { return; }
    var el = document.querySelector('.chain-total');
    if (el) { el.textContent = '⏱ ' + fmtMMSS(elapsedSec()); }
  }
  function startStepTimer() {
    stopStepTimer();
    if (!g.timed) { return; }
    stepRemain = g.limitSec;
    renderCd();
    stepTimerId = window.setInterval(stepTick, 1000);
  }
  function stopStepTimer() {
    if (stepTimerId) { window.clearInterval(stepTimerId); stepTimerId = null; }
  }
  function stepTick() {
    stepRemain -= 1;
    if (stepRemain <= 0) {
      stepRemain = 0;
      stopStepTimer();
      onStepTimeout();
    }
    renderCd();
  }
  function renderCd() {
    var el = document.getElementById('step-cd');
    if (!el) { return; }
    if (!g.timed) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.textContent = '⏳ 本步剩余 ' + fmtMMSS(stepRemain);
    el.className = stepRemain <= 5 ? 'step-cd warn' : 'step-cd';
  }
  function onStepTimeout() {
    if (!g || g.finished || g.stepDone) { return; }
    g.errors += 1;
    var card = findCandCard(g.correctIdx);
    if (card) { card.className += ' timeout-mark'; }
    showFeedback('⏰ 超时啦！红框就是正确答案，快接上', 'bad');
    var err = document.getElementById('chain-err');
    if (err) { err.textContent = '错误 ' + g.errors + ' 次'; }
  }

  /* ---------- 候选池 / 出题 ---------- */
  /* 当前尾字可接（未用）成语池；homophone=true 时按无调拼音匹配同音首字 */
  function buildPool(tailChar, tailPy, used, homophone) {
    used = used || {};
    var pool = [];
    var i;
    if (homophone) {
      var list = byFirstPy[tailPy] || [];
      for (i = 0; i < list.length; i++) {
        if (!used[list[i].成语]) { pool.push(list[i]); }
      }
    } else {
      var words = CHAIN[tailChar] || [];
      for (i = 0; i < words.length; i++) {
        if (used[words[i]]) { continue; }
        if (entryMap[words[i]]) { pool.push(entryMap[words[i]]); }
      }
    }
    return pool;
  }
  function canConnect(e, homophone) {
    var pool = buildPool(e.尾字, toneLess(lastSyllable(e)), {}, homophone);
    return pool.length > 0;
  }
  /* 正确候选：课本层优先；同层内优先「还能接下去」的（换题精神，减少死路）；
     仅扩展层则用扩展层（同样优先可续）。死路判定兜底保留。 */
  function pickCorrect(pool) {
    var contKb = [];
    var kbPool = [];
    var contExt = [];
    for (var i = 0; i < pool.length; i++) {
      var e = pool[i];
      var cont = canConnect(e, g.homophone);
      if (kebenSet[e.成语]) {
        kbPool.push(e);
        if (cont) { contKb.push(e); }
      } else if (cont) {
        contExt.push(e);
      }
    }
    var src = contKb.length ? contKb : (kbPool.length ? kbPool : (contExt.length ? contExt : pool));
    return src[randInt(src.length)];
  }
  /* 干扰项：全量抽 2 条；首字 ≠ 正确首字；同音容忍开时首字拼音也避开 */
  function pickDistractors(correct) {
    var correctFirst = correct.首字;
    var correctPy = toneLess(firstSyllable(correct));
    var out = [];
    var tries = 0;
    var maxTries = 400;
    while (out.length < 2 && tries < maxTries) {
      tries += 1;
      var e = ALL[randInt(ALL.length)];
      var w = e.成语;
      if (g.used[w]) { continue; }
      if (w === correct.成语) { continue; }
      if (e.首字 === correctFirst) { continue; }
      if (g.homophone && toneLess(firstSyllable(e)) === correctPy) { continue; }
      var dup = false;
      for (var i = 0; i < out.length; i++) {
        if (out[i].成语 === w) { dup = true; break; }
      }
      if (dup) { continue; }
      out.push(e);
    }
    return out.length === 2 ? out : null;
  }
  function shuffle3(a, b, c) {
    var arr = [a, b, c];
    for (var i = arr.length - 1; i > 0; i--) {
      var j = randInt(i + 1);
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  /* 起步：课本层 4 字成语（优先可选可接的） */
  function pickFirst() {
    var k4 = [];
    for (var i = 0; i < KEBEN.length; i++) {
      if (KEBEN[i].字长 === 4) { k4.push(KEBEN[i]); }
    }
    if (!k4.length) { return null; }
    var tries = 0;
    var e;
    var homophone = !!(store.prefs.homophone);
    while (tries < 50) {
      e = k4[randInt(k4.length)];
      if (canConnect(e, homophone)) { return e; }
      tries += 1;
    }
    return k4[randInt(k4.length)];
  }
  /* 新一步：出题 + 死路检测 */
  function beginStep() {
    var tailChar = g.current.尾字;
    var tailPy = toneLess(lastSyllable(g.current));
    var pool = buildPool(tailChar, tailPy, g.used, g.homophone);
    if (!pool.length) { g.deadChar = tailChar; finishGame(); return; }
    var correct = pickCorrect(pool);
    var dist = pickDistractors(correct);
    if (!dist) { g.deadChar = tailChar; finishGame(); return; }
    var arr = shuffle3(correct, dist[0], dist[1]);
    g.candidates = arr;
    g.correctIdx = -1;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] === correct) { g.correctIdx = i; }
    }
    g.stepDone = false;
    renderChain();
    startStepTimer();
  }

  /* ---------- 对局生命周期 ---------- */
  function startGame() {
    var first = pickFirst();
    if (!first) {
      toast('词库加载失败，请重新打开');
      return;
    }
    g = {
      current: first,
      used: {},
      count: 0,
      errors: 0,
      hints: 0,
      startMs: Date.now(),
      finished: false,
      candidates: [],
      correctIdx: -1,
      stepDone: false,
      deadChar: '',
      homophone: !!(store.prefs.homophone),
      timed: !!(store.prefs.timed),
      limitSec: store.prefs.limitSec
    };
    g.used[first.成语] = true;
    startTotalTimer();
    beginStep();
  }

  function calcStars(len, errors, hints) {
    if (len >= 6 && (errors + hints) <= 1) { return 3; }
    if (len >= 4) { return 2; }
    if (len >= 2) { return 1; }
    return 0;
  }
  function doCheckin() {
    var today = todayStr();
    if (store.checkin.dates.indexOf(today) === -1) {
      store.checkin.dates.push(today);
      store.checkin.streak = calcStreak(store.checkin.dates);
    }
  }
  function finishGame() {
    if (!g || g.finished) { return; }
    g.finished = true;
    stopTotalTimer();
    stopStepTimer();
    var len = g.count;
    var sec = Math.max(1, Math.floor((Date.now() - g.startMs) / 1000));
    var stars = calcStars(len, g.errors, g.hints);
    var isNewBest = len > (store.bestLen || 0);
    doCheckin();
    if (isNewBest) { store.bestLen = len; }
    store.recent10.unshift({ len: len, sec: sec, stars: stars, date: readableToday(), errors: g.errors, hints: g.hints });
    if (store.recent10.length > 10) { store.recent10.length = 10; }
    saveStore();
    renderResult(len, sec, stars, isNewBest);
  }

  /* ---------- 交互：点选 / 提示 / 退出 ---------- */
  function onPick(idx) {
    if (!g || g.finished || g.stepDone) { return; }
    var card = findCandCard(idx);
    if (card && card.className.indexOf('wrong') !== -1) { return; }
    if (idx === g.correctIdx) {
      onCorrect(idx, card);
    } else {
      onWrong(idx, card);
    }
  }
  function onCorrect(idx, card) {
    stopStepTimer();
    g.stepDone = true;
    g.count += 1;
    if (card) { card.className += ' correct'; }
    /* 其余候选置灰禁用，防误点 */
    var cards = document.querySelectorAll('.cand-card');
    for (var i = 0; i < cards.length; i++) {
      if (i !== idx) { cards[i].className += ' dim'; }
    }
    var e = g.candidates[idx];
    g.current = e;
    g.used[e.成语] = true;
    showFeedback('✅ 接上啦！', 'ok');
    /* 绿闪片刻（教学节奏）→ 释义卡 → 自动下一步 */
    window.setTimeout(function () {
      if (g.finished) { return; }
      showMeaningPhase(e);
    }, 700);
    window.setTimeout(function () {
      if (g.finished) { return; }
      beginStep();
    }, 2900);
  }
  function onWrong(idx, card) {
    g.errors += 1;
    if (card) { card.className += ' wrong'; }
    showFeedback('❌ 不对哦，再想想', 'bad');
    var err = document.getElementById('chain-err');
    if (err) { err.textContent = '错误 ' + g.errors + ' 次'; }
  }
  function onHintClick() {
    if (!g || g.finished || g.stepDone) { return; }
    if (g.hints >= 2) { return; }
    g.hints += 1;
    var card = findCandCard(g.correctIdx);
    if (card) { card.className += ' hint-mark'; }
    var btn = document.getElementById('hint-btn');
    if (btn) {
      if (g.hints >= 2) { btn.disabled = true; }
      btn.textContent = '💡 提示（剩 ' + (2 - g.hints) + ' 次）';
    }
    showFeedback('💡 橙色边框就是正确答案', 'hint');
  }
  function onExitClick() {
    if (window.confirm('确定退出本局吗？本局成绩不会记录。')) {
      stopTotalTimer();
      stopStepTimer();
      g.finished = true;
      viewHome();
    }
  }
  function showFeedback(text, cls) {
    var el = document.getElementById('chain-feedback');
    if (!el) { return; }
    el.textContent = text;
    el.className = 'feedback ' + (cls || '');
    if (feedbackTimer) { window.clearTimeout(feedbackTimer); }
    feedbackTimer = window.setTimeout(function () {
      if (el) { el.className = 'feedback'; el.textContent = ''; }
    }, 2600);
  }
  function findCandCard(idx) {
    var cards = document.querySelectorAll('.cand-card');
    for (var i = 0; i < cards.length; i++) {
      if (parseInt(cards[i].getAttribute('data-idx'), 10) === idx) { return cards[i]; }
    }
    return null;
  }
  function renderTailHighlight(container, word) {
    for (var i = 0; i < word.length; i++) {
      var ch = word.charAt(i);
      if (i === word.length - 1) {
        container.appendChild(makeEl('span', 'cur-tail', ch));
      } else {
        container.appendChild(makeEl('span', 'cur-ch', ch));
      }
    }
  }

  /* ---------- 顶栏（家长面板：标题 5 秒内连点 5 次） ---------- */
  function renderHeader(title, backFn, tapParent) {
    clearNode(headerEl);
    if (backFn) {
      var back = makeEl('button', 'header-back', '‹');
      back.addEventListener('click', backFn);
      headerEl.appendChild(back);
    }
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var t = makeEl('span', 'header-title', title || (APP.meta && APP.meta.name) || '成语接龙');
    if (tapParent !== false) {
      var onTitleTap = function () {
        headerTaps += 1;
        if (headerTapTimer) { window.clearTimeout(headerTapTimer); }
        headerTapTimer = window.setTimeout(function () { headerTaps = 0; }, 5000);
        if (headerTaps >= 5) {
          headerTaps = 0;
          if (headerTapTimer) { window.clearTimeout(headerTapTimer); }
          viewParent();
        }
      };
      t.addEventListener('touchstart', onTitleTap);
      t.addEventListener('mousedown', onTitleTap);
    }
    brand.appendChild(t);
    if (APP.meta && APP.meta.version) {
      brand.appendChild(makeEl('span', 'header-ver', 'v' + APP.meta.version));
    }
    headerEl.appendChild(brand);
  }

  /* ---------- 首页 ---------- */
  function viewHome() {
    renderHeader();
    clearNode(viewEl);
    clearNode(footerEl);
    viewEl.className = 'view home';

    var hero = makeEl('div', 'card home-hero');
    hero.appendChild(makeEl('div', 'hero-title', '🐉 成语接龙'));
    hero.appendChild(makeEl('div', 'hero-sub', '连出成语，越接越棒！'));
    var startBtn = makeEl('button', 'btn btn-primary btn-big', '开始接龙');
    startBtn.addEventListener('click', startGame);
    hero.appendChild(startBtn);
    viewEl.appendChild(hero);

    var status = makeEl('div', 'card home-status');
    var mkStatus = function (val, label) {
      var item = makeEl('div', 'status-item');
      item.appendChild(makeEl('b', '', val));
      item.appendChild(makeEl('span', '', label));
      return item;
    };
    status.appendChild(mkStatus(isCheckedinToday() ? '✅ 已打卡' : '⭕ 未打卡', '今日'));
    status.appendChild(mkStatus((store.checkin.streak || 0) + ' 天', '连续打卡'));
    status.appendChild(mkStatus((store.bestLen || 0) + ' 条', '最佳接龙'));
    viewEl.appendChild(status);

    var set = makeEl('div', 'card home-settings');
    set.appendChild(makeEl('div', 'page-title', '练习设置'));
    set.appendChild(buildSwitchRow('同音容忍', '可接同音字开头的成语，如 石 shí → 时 shí', 'homophone'));
    var segBox = makeEl('div', 'seg-wrap');
    segBox.appendChild(makeEl('div', 'seg-title', '每步限时'));
    segBox.appendChild(makeSegRow());
    if (!store.prefs.timed) { segBox.style.display = 'none'; }
    set.appendChild(buildSwitchRow('限时模式', '每步倒计时，超时自动标记正确答案', 'timed', function (on) {
      segBox.style.display = on ? '' : 'none';
    }));
    set.appendChild(segBox);
    viewEl.appendChild(set);
    renderFooterNav();
  }

  function buildSwitchRow(label, desc, key, onChange) {
    var row = makeEl('div', 'setting-row');
    var left = makeEl('div', 'setting-left');
    left.appendChild(makeEl('div', 'setting-label', label));
    left.appendChild(makeEl('div', 'setting-desc', desc));
    row.appendChild(left);
    var sw = makeEl('button', 'switch' + (store.prefs[key] ? ' on' : ''));
    sw.setAttribute('type', 'button');
    sw.appendChild(makeEl('span', 'switch-knob', ''));
    sw.addEventListener('click', function () {
      store.prefs[key] = !store.prefs[key];
      saveStore();
      sw.className = 'switch' + (store.prefs[key] ? ' on' : '');
      if (onChange) { onChange(store.prefs[key]); }
    });
    row.appendChild(sw);
    return row;
  }

  function makeSegRow() {
    var row = makeEl('div', 'seg-row');
    var vals = [30, 20, 10];
    for (var i = 0; i < vals.length; i++) {
      (function (s) {
        var b = makeEl('button', 'seg-btn', s + ' 秒');
        if (store.prefs.limitSec === s) { b.className = 'seg-btn on'; }
        b.addEventListener('click', function () {
          store.prefs.limitSec = s;
          saveStore();
          var kids = row.children;
          for (var k = 0; k < kids.length; k++) { kids[k].className = 'seg-btn'; }
          b.className = 'seg-btn on';
        });
        row.appendChild(b);
      })(vals[i]);
    }
    return row;
  }

  /* ---------- 接龙页 ---------- */
  function renderChain() {
    renderHeader('', null, false);
    clearNode(viewEl);
    clearNode(footerEl);
    viewEl.className = 'view chain';

    var top = makeEl('div', 'chain-top');
    top.appendChild(makeEl('span', 'chain-steps', '第 ' + (g.count + 1) + ' 步 · 已接 ' + g.count + ' 条'));
    top.appendChild(makeEl('span', 'chain-total', '⏱ ' + fmtMMSS(elapsedSec())));
    var exitBtn = makeEl('button', 'chain-exit', '退出');
    exitBtn.addEventListener('click', onExitClick);
    top.appendChild(exitBtn);
    viewEl.appendChild(top);

    var card = makeEl('div', 'cur-card');
    card.appendChild(makeEl('div', 'cur-label', '当前成语'));
    var wordEl = makeEl('div', 'cur-word');
    renderTailHighlight(wordEl, g.current.成语);
    card.appendChild(wordEl);
    var guideText = '请接以『' + g.current.尾字 + '』开头的成语';
    if (g.homophone) { guideText += '（同音字也算）'; }
    card.appendChild(makeEl('div', 'cur-guide', guideText));
    viewEl.appendChild(card);

    var cdEl = makeEl('div', 'step-cd');
    cdEl.id = 'step-cd';
    viewEl.appendChild(cdEl);

    var fbEl = makeEl('div', 'feedback');
    fbEl.id = 'chain-feedback';
    viewEl.appendChild(fbEl);

    var box = makeEl('div', 'cand-box');
    box.id = 'cand-box';
    viewEl.appendChild(box);
    renderCandidates();

    var hintRow = makeEl('div', 'chain-hint-row');
    var hintBtn = makeEl('button', 'hint-btn', '💡 提示（剩 ' + (2 - g.hints) + ' 次）');
    hintBtn.id = 'hint-btn';
    if (g.hints >= 2) { hintBtn.disabled = true; }
    hintBtn.addEventListener('click', onHintClick);
    hintRow.appendChild(hintBtn);
    var errText = makeEl('span', 'chain-err', '');
    errText.id = 'chain-err';
    hintRow.appendChild(errText);
    viewEl.appendChild(hintRow);

    renderCd();
  }

  function renderCandidates() {
    var box = document.getElementById('cand-box');
    if (!box) { return; }
    clearNode(box);
    for (var i = 0; i < g.candidates.length; i++) {
      (function (idx) {
        var e = g.candidates[idx];
        var btn = makeEl('div', 'cand-card');
        btn.setAttribute('data-idx', idx);
        btn.appendChild(makeEl('div', 'cand-word', e.成语));
        btn.appendChild(makeEl('div', 'cand-py', e.拼音));
        if (!kebenSet[e.成语]) { btn.appendChild(makeEl('span', 'cand-badge', '扩展')); }
        btn.addEventListener('click', function () { onPick(idx); });
        box.appendChild(btn);
      })(i);
    }
  }

  /* 答对后的释义教学卡（候选区替换，2.2s 后自动下一步） */
  function showMeaningPhase(e) {
    var wordEl = document.querySelector('.cur-word');
    if (wordEl) {
      clearNode(wordEl);
      renderTailHighlight(wordEl, e.成语);
    }
    var guide = document.querySelector('.cur-guide');
    if (guide) { guide.textContent = '真棒！看看它的意思吧～'; }
    var st = document.querySelector('.chain-steps');
    if (st) { st.textContent = '第 ' + (g.count + 1) + ' 步 · 已接 ' + g.count + ' 条'; }

    var box = document.getElementById('cand-box');
    if (!box) { return; }
    clearNode(box);
    var mc = makeEl('div', 'meaning-card');
    var wl = makeEl('div', 'meaning-word', e.成语);
    if (e.emoji) { wl.appendChild(makeEl('span', 'meaning-emoji', ' ' + e.emoji)); }
    mc.appendChild(wl);
    mc.appendChild(makeEl('div', 'meaning-py', e.拼音));
    mc.appendChild(makeEl('div', 'meaning-desc', e.释义));
    if (e.出处) { mc.appendChild(makeEl('div', 'meaning-src', '出处：' + e.出处)); }
    if (e.例句) { mc.appendChild(makeEl('div', 'meaning-ex', '例句：' + e.例句)); }
    box.appendChild(mc);

    var hr = document.querySelector('.chain-hint-row');
    if (hr) { hr.style.display = 'none'; }
    var cd = document.getElementById('step-cd');
    if (cd) { cd.style.display = 'none'; }
  }

  /* ---------- 结算页 ---------- */
  function renderResult(len, sec, stars, isNewBest) {
    renderHeader('', null, false);
    clearNode(viewEl);
    clearNode(footerEl);
    viewEl.className = 'view';

    var card = makeEl('div', 'card result-card');
    card.appendChild(makeEl('div', 'page-title', '接龙结束'));
    card.appendChild(makeEl('div', 'result-stars', starStr(stars)));
    card.appendChild(makeEl('div', 'result-len', '接了 ' + len + ' 条'));
    if (g.deadChar) {
      card.appendChild(makeEl('div', 'result-msg', '「' + g.deadChar + '」这个字没人接得上啦'));
    }
    if (isNewBest && len > 0) {
      card.appendChild(makeEl('div', 'newbest', '🎉 新纪录！最长接龙 ' + len + ' 条'));
    }
    var stats = makeEl('div', 'result-stats');
    var mkStat = function (label, val) {
      var s = makeEl('div', 'result-stat');
      s.appendChild(makeEl('b', '', val));
      s.appendChild(makeEl('span', '', label));
      return s;
    };
    stats.appendChild(mkStat('总用时', fmtMMSS(sec)));
    stats.appendChild(mkStat('错误', g.errors + ' 次'));
    stats.appendChild(mkStat('提示', g.hints + ' 次'));
    card.appendChild(stats);
    card.appendChild(makeEl('div', 'streak-info', '今日已打卡 ✅ · 连续 ' + (store.checkin.streak || 0) + ' 天'));
    viewEl.appendChild(card);

    if (stars === 0) {
      var enc = makeEl('div', 'card result-enc', '刚起步也超棒！多试几次，一定能接出长龙～');
      viewEl.appendChild(enc);
    }

    var btns = makeEl('div', 'btn-row');
    var again = makeEl('button', 'btn btn-primary', '再来一次');
    again.addEventListener('click', function () { startGame(); });
    var home = makeEl('button', 'btn', '回首页');
    home.addEventListener('click', function () { viewHome(); });
    var share = makeEl('button', 'btn', '分享打卡');
    share.addEventListener('click', function () { openShareOverlay(len, sec, stars); });
    btns.appendChild(again);
    btns.appendChild(home);
    btns.appendChild(share);
    viewEl.appendChild(btns);
  }

  /* ---------- 打卡日历 ---------- */
  function buildCalendar() {
    var card = makeEl('div', 'calendar');
    card.appendChild(makeEl('div', 'page-title', '打卡日历'));
    var grid = makeEl('div', 'calendar-grid');
    var now = new Date();
    var days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var t = todayStr();
    var dates = store.checkin.dates;
    for (var d = 1; d <= days; d++) {
      (function (day) {
        var ds = dateStr(new Date(now.getFullYear(), now.getMonth(), day));
        var el = makeEl('div', 'cal-day', '' + day);
        if (dates.indexOf(ds) !== -1) { el.className = 'cal-day done'; }
        if (ds === t) { el.className += ' today'; }
        grid.appendChild(el);
      })(d);
    }
    card.appendChild(grid);
    var streak = calcStreak(dates);
    var si = makeEl('div', 'streak-info');
    si.appendChild(makeEl('span', '', '连续打卡 '));
    si.appendChild(makeEl('b', '', '' + streak));
    si.appendChild(makeEl('span', '', ' 天' + (streak >= 7 ? ' 🎉' : '')));
    card.appendChild(si);
    return card;
  }

  function viewCheckin() {
    renderHeader('打卡日历', function () { viewHome(); });
    clearNode(viewEl);
    viewEl.className = 'view';
    viewEl.appendChild(buildCalendar());
    renderFooterNav();
  }

  /* ---------- 家长面板（标题连点 5 次进入） ---------- */
  function viewParent() {
    renderHeader('家长面板', function () { viewHome(); });
    clearNode(viewEl);
    viewEl.className = 'view';
    viewEl.appendChild(buildCalendar());

    var rc = makeEl('div', 'card recent-card');
    rc.appendChild(makeEl('div', 'page-title', '最近成绩'));
    var list = makeEl('div', 'recent-list');
    if (!store.recent10.length) {
      list.appendChild(makeEl('div', 'recent-empty', '还没有成绩记录，快去接龙吧！'));
    } else {
      for (var i = 0; i < store.recent10.length; i++) {
        var r = store.recent10[i];
        var item = makeEl('div', 'recent-item');
        var left = makeEl('div');
        left.appendChild(makeEl('div', 'recent-len', r.len + ' 条'));
        var metaParts = [r.date, '用时 ' + fmtMMSS(r.sec)];
        if (r.errors !== undefined) { metaParts.push('错 ' + r.errors); }
        if (r.hints !== undefined && r.hints > 0) { metaParts.push('提示 ' + r.hints); }
        left.appendChild(makeEl('div', 'recent-meta', metaParts.join(' · ')));
        item.appendChild(left);
        item.appendChild(makeEl('div', 'recent-stars', starStr(r.stars)));
        list.appendChild(item);
      }
    }
    rc.appendChild(list);
    viewEl.appendChild(rc);

    var resetBtn = makeEl('button', 'btn btn-danger', '重置所有数据');
    resetBtn.addEventListener('click', function () {
      if (window.confirm('确定清除所有打卡与成绩数据？此操作不可恢复。')) {
        try { window.localStorage.removeItem(STORE_KEY); } catch (err) { /* ignore */ }
        store = loadStore();
        saveStore();
        viewHome();
      }
    });
    viewEl.appendChild(resetBtn);
    renderFooterNav();
  }

  /* ---------- 底栏 ---------- */
  function renderFooterNav() {
    clearNode(footerEl);
    var nav = makeEl('div', 'footer-nav');
    var mk = function (label, fn) {
      var b = makeEl('div', 'footer-btn', label);
      b.addEventListener('click', fn);
      return b;
    };
    nav.appendChild(mk('打卡日历', function () { viewCheckin(); }));
    nav.appendChild(mk('首页', function () { viewHome(); }));
    footerEl.appendChild(nav);
  }

  /* ---------- 分享（复制文案 + 1080×1920 卡片） ---------- */
  function shareEncourage(stars) {
    if (stars >= 3) { return '太棒了！成语小达人！'; }
    if (stars === 2) { return '不错哦，再接再厉！'; }
    if (stars === 1) { return '每天练一练，越来越棒！'; }
    return '刚起步也超棒，继续加油！';
  }
  function buildShareText(len, sec, stars) {
    var streak = store.checkin.streak || 0;
    return '成语接龙挑战！孩子一口气接了 ' + len + ' 条成语，用时 ' + fmtMMSS(sec) +
           '，拿下 ' + stars + ' 星！连续打卡 ' + streak +
           ' 天 📅 成语积累越来越棒，继续加油～#成语接龙 #成语 #小学生';
  }
  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  function drawShareCard(len, sec, stars, streak) {
    var W = 1080, H = 1920;
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    if (!ctx) { return canvas; }

    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#fff3e2');
    bg.addColorStop(1, '#ffd9b0');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(255, 122, 69, 0.18)';
    ctx.beginPath(); ctx.arc(150, 150, 26, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(930, 150, 26, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(150, 1770, 26, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(930, 1770, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255, 122, 69, 0.25)';
    ctx.beginPath(); ctx.arc(280, 300, 10, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(800, 260, 12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(240, 1620, 12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(830, 1580, 10, 0, Math.PI * 2); ctx.fill();

    roundRectPath(ctx, 60, 60, 960, 1800, 48);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#4a3728';
    ctx.font = 'bold 56px sans-serif';
    ctx.fillText('成语接龙', W / 2, 190);

    var streakText = '连续打卡 ' + streak + ' 天';
    ctx.font = 'bold 38px sans-serif';
    var tw = ctx.measureText(streakText).width;
    var pillW = tw + 64, pillH = 76, pillX = (W - pillW) / 2, pillY = 276;
    roundRectPath(ctx, pillX, pillY, pillW, pillH, 38);
    ctx.fillStyle = '#ff7a45';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(streakText, W / 2, pillY + pillH / 2 + 2);

    ctx.fillStyle = '#9b8a78';
    ctx.font = '44px sans-serif';
    ctx.fillText('本次接龙', W / 2, 620);

    ctx.fillStyle = '#ff7a45';
    ctx.font = 'bold 150px sans-serif';
    ctx.fillText(len + ' 条', W / 2, 800);

    ctx.font = 'bold 72px sans-serif';
    ctx.fillText(starStr(stars), W / 2, 930);

    var stats = [
      { label: '用时', value: fmtMMSS(sec) },
      { label: '接龙', value: len + ' 条' },
      { label: '星级', value: starStr(stars) }
    ];
    var cols = [W / 2 - 300, W / 2, W / 2 + 300];
    for (var i = 0; i < 3; i++) {
      ctx.fillStyle = '#4a3728';
      ctx.font = 'bold 56px sans-serif';
      ctx.fillText(stats[i].value, cols[i], 1040);
      ctx.fillStyle = '#9b8a78';
      ctx.font = '34px sans-serif';
      ctx.fillText(stats[i].label, cols[i], 1125);
    }

    ctx.strokeStyle = '#f5e6d6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(180, 1280);
    ctx.lineTo(900, 1280);
    ctx.stroke();

    ctx.fillStyle = '#e8590c';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText(shareEncourage(stars), W / 2, 1440);

    var d = new Date();
    var dateText = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    ctx.fillStyle = '#9b8a78';
    ctx.font = '36px sans-serif';
    ctx.fillText(dateText, W / 2, 1620);
    ctx.fillText('成语接龙 · 每日挑战', W / 2, 1690);
    return canvas;
  }
  function copyShareText(text, feedbackEl) {
    var ok = false;
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();
    if (ta.setSelectionRange) { ta.setSelectionRange(0, text.length); }
    try {
      ok = document.execCommand('copy');
    } catch (err) {
      ok = false;
    }
    document.body.removeChild(ta);
    if (ok) {
      feedbackEl.textContent = '已复制，去小红书粘贴发布吧';
      feedbackEl.className = 'share-feedback ok';
    } else {
      feedbackEl.textContent = '复制失败，请长按下方文字手动复制';
      feedbackEl.className = 'share-feedback bad';
    }
    window.setTimeout(function () {
      feedbackEl.textContent = '';
      feedbackEl.className = 'share-feedback';
    }, 2000);
  }
  function closeShareOverlay(overlay) {
    if (overlay && overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
  }
  function openShareOverlay(len, sec, stars) {
    var overlay = makeEl('div', 'share-overlay');
    var box = makeEl('div', 'share-box');
    box.appendChild(makeEl('div', 'page-title', '分享打卡'));

    var img = makeEl('img', 'share-card-img');
    img.alt = '打卡卡片';
    var canvas = drawShareCard(len, sec, stars, calcStreak(store.checkin.dates));
    var dataUrl = canvas.toDataURL('image/png');
    img.src = dataUrl;
    box.appendChild(img);

    box.appendChild(makeEl('div', 'share-hint', '长按图片保存到相册，分享到小红书 / 朋友圈'));

    var text = buildShareText(len, sec, stars);
    var textEl = makeEl('textarea', 'share-text');
    textEl.readOnly = true;
    textEl.value = text;
    textEl.addEventListener('focus', function () { textEl.select(); });
    box.appendChild(textEl);

    var feedbackEl = makeEl('div', 'share-feedback', '');
    box.appendChild(feedbackEl);

    var btns = makeEl('div', 'share-btns');
    var copyBtn = makeEl('button', 'btn btn-primary', '复制文案');
    copyBtn.addEventListener('click', function () { copyShareText(text, feedbackEl); });
    var saveA = document.createElement('a');
    saveA.href = dataUrl;
    saveA.download = '成语接龙打卡_' + todayStr() + '.png';
    saveA.className = 'btn btn-ghost';
    saveA.textContent = '保存图片';
    var closeBtn = makeEl('button', 'btn btn-ghost', '关闭');
    closeBtn.addEventListener('click', function () { closeShareOverlay(overlay); });
    btns.appendChild(copyBtn);
    btns.appendChild(saveA);
    btns.appendChild(closeBtn);
    box.appendChild(btns);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  /* ---------- 测试钩子（只读，冒烟测试定位正确答案用；同看图猜成语 getQ） ---------- */
  window.CY_DEBUG = {
    getState: function () {
      if (!g) { return null; }
      var cands = [];
      for (var i = 0; i < g.candidates.length; i++) { cands.push(g.candidates[i].成语); }
      return {
        current: g.current ? g.current.成语 : '',
        tailChar: g.current ? g.current.尾字 : '',
        candidates: cands,
        correctIdx: g.correctIdx,
        count: g.count,
        errors: g.errors,
        hints: g.hints,
        stepDone: g.stepDone,
        finished: g.finished,
        deadChar: g.deadChar,
        homophone: g.homophone,
        timed: g.timed,
        limitSec: g.limitSec
      };
    },
    toneLess: toneLess
  };

  /* ---------- 启动 ---------- */
  function syncAppHeight() {
    var docEl = document.documentElement;
    docEl.style.setProperty('--app-height', (window.innerHeight || docEl.clientHeight) + 'px');
  }
  if (window.addEventListener) { window.addEventListener('resize', syncAppHeight); }
  syncAppHeight();
  document.title = (APP.meta && APP.meta.name) || '成语接龙';
  viewHome();
})();
