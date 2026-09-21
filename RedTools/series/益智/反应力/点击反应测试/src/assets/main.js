/* ============================================================
   点击反应测试 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   数据：window.APP_DATA（data.js 注入，build 生成 meta，可缺失）
   玩法：反应时间测试 —— 红屏等待随机延迟 → 变绿立即点击
        - waiting：红屏，随机 2000~5000ms 后变绿（setTimeout，记 pendingId）
        - green：绿屏，切换瞬间 performance.now() 记 greenMs，点击记录单次毫秒
        - 犯规：waiting 阶段点击 → 红闪提示，本轮作废重新等待，不计数
        - result：显示单次毫秒 + 等级标签，1.2s 后自动进入下一轮
        - 完成 N 轮（按难度）→ 结算平均成绩 + 打卡 + 星级
   难度：三档按轮数（简单 3 / 进阶 5 / 挑战 8）
   成绩：平均反应 ms（主）+ 单次最快/最慢 + 星级；打卡 + 晒分分享卡片
   设计约束：
   - 不使用 import/export / type="module"
   - 不超出 ES2017（无 ?. ?? 对象展开 replaceAll 等）
   - 事件全部 addEventListener，无内联事件 / eval
   - 计时用 performance.now()
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };

  /* ---------- DOM ---------- */
  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');

  /* ---------- 难度定义（键 = 有效轮数） ---------- */
  var LEVELS = {
    3: { label: '简单 · 3 次', rounds: 3 },
    5: { label: '进阶 · 5 次', rounds: 5 },
    8: { label: '挑战 · 8 次', rounds: 8 }
  };

  /* 星级：平均 ms ≤280 → 3★；≤400 → 2★；否则 1★ */
  function starFor(avg) {
    if (avg <= 280) { return 3; }
    if (avg <= 400) { return 2; }
    return 1;
  }
  /* 等级标签 */
  function labelFor(avg) {
    if (avg <= 200) { return '神速'; }
    if (avg <= 280) { return '闪电'; }
    if (avg <= 350) { return '优秀'; }
    if (avg <= 450) { return '不错'; }
    return '加油';
  }
  /* 分享卡片底部鼓励语（按等级） */
  function motivationFor(label) {
    if (label === '神速' || label === '闪电') { return '闪电般的反应，太棒了！'; }
    if (label === '优秀') { return '反应又快又准，继续保持！'; }
    if (label === '不错') { return '反应很敏捷，再练更棒！'; }
    return '多练几次，反应会越来越快！';
  }

  /* ---------- 状态 ---------- */
  var state = {
    level: 3,          // 难度（有效轮数 3/5/8）
    total: 3,          // 总轮数
    round: 0,          // 已完成有效轮数
    phase: 'idle',     // idle / waiting / green / result / foul / finish
    results: [],       // 有效单次成绩 ms
    greenMs: 0,        // 变绿瞬间时间戳
    lastMs: 0,         // 最近一次有效成绩
    pendingId: null,   // waiting → green 的 setTimeout id
    resultTimerId: null, // result 阶段自动下一轮 timer
    foulTimerId: null,   // 犯规后重进 waiting timer
    foulCount: 0,      // 犯规次数
    finished: false,   // 是否已结算
    resultOverlay: null, // 结算浮层引用
    shareOverlay: null,  // 分享浮层引用
    summary: null      // 结算摘要（分享/文案用）
  };

  /* ---------- 持久化 ---------- */
  var STORE_KEY = 'redtools.reaction.v1';
  LX_SHARED.storage.configure({ toolName: 'reaction' });  // V0.4 迁移：键前缀 redtools.reaction.v1
  function loadStore() {
    try {
      var raw = LX_SHARED.storage.get('v1');
      if (raw) { return raw; }
    } catch (err) { /* ignore */ }
    return {
      version: 1,
      best: { '3': null, '5': null, '8': null },
      recent: { '3': 0, '5': 0, '8': 0 },
      checkin: { dates: [], streak: 0 },
      history: []
    };
  }
  function saveStore() {
    try {
      LX_SHARED.storage.set('v1', store);
    } catch (err) { /* ignore */ }
  }
  var store = loadStore();
  saveStore(); // 初始化写入

  /* ---------- 工具 ---------- */
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
  function fmtDate(d) {
    return '' + d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }
  /* 连续打卡天数：含今天往前推、跨天断（dates 升序去重） */
  function calcStreak(dates) {
    return LX_SHARED.progress.streak(dates);
}

  /* ---------- 计时器统一清理 ---------- */
  function clearTimers() {
    if (state.pendingId) { clearTimeout(state.pendingId); state.pendingId = null; }
    if (state.resultTimerId) { clearTimeout(state.resultTimerId); state.resultTimerId = null; }
    if (state.foulTimerId) { clearTimeout(state.foulTimerId); state.foulTimerId = null; }
  }

  /* ---------- 渲染：顶栏 ---------- */
  function renderHeader(title) {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '点击反应测试';
    brand.appendChild(makeEl('span', 'header-title', title || name));
    if (APP.meta && APP.meta.version) {
      brand.appendChild(makeEl('span', 'header-ver', 'v' + APP.meta.version));
    }
    headerEl.appendChild(brand);
  }

  /* ---------- 视图：首页选难度 ---------- */
  function viewHome() {
    // 退出游戏时清理计时（防止 waiting 变绿 / result 自动推进闪现）
    clearTimers();
    state.phase = 'idle';
    state.finished = false;
    renderHeader();
    clearNode(viewEl);
    viewEl.appendChild(makeEl('div', 'page-title', '选择难度'));
    viewEl.appendChild(makeEl('div', 'home-hint', '屏幕变绿后立即点击！测测你的反应有多快'));
    var list = makeEl('div', 'home-list');
    Object.keys(LEVELS).forEach(function (k) {
      var level = Number(k);
      var l = LEVELS[k];
      var card = makeEl('div', 'diff-card');
      var btn = makeEl('button', 'diff-btn', l.label);
      btn.addEventListener('click', function () { startGame(level); });
      card.appendChild(btn);
      var best = store.best[k];
      var meta = makeEl('div', 'diff-meta',
        best && best.avg ? '最佳 ' + best.avg + ' ms' : '未挑战');
      card.appendChild(meta);
      list.appendChild(card);
    });
    viewEl.appendChild(list);
    // 玩法说明
    viewEl.appendChild(makeEl('div', 'howto-title', '玩法说明'));
    var howto = makeEl('div', 'howto');
    howto.appendChild(makeEl('div', 'howto-line', '① 看到红屏别着急，等它变绿'));
    howto.appendChild(makeEl('div', 'howto-line', '② 屏幕一变绿就立即点击！'));
    howto.appendChild(makeEl('div', 'howto-line', '③ 没变绿就点了算犯规，本轮重来'));
    howto.appendChild(makeEl('div', 'howto-line', '④ 完成所有轮次，取平均成绩'));
    viewEl.appendChild(howto);
    renderFooterNav();
  }

  /* ---------- 视图：游戏页 ---------- */
  function startGame(level) {
    state.level = level;
    state.total = LEVELS[level].rounds;
    state.round = 0;
    state.phase = 'idle';
    state.results = [];
    state.greenMs = 0;
    state.lastMs = 0;
    state.foulCount = 0;
    state.finished = false;
    clearTimers();
    renderHeader(LEVELS[level].label);
    clearNode(viewEl);
    // 游戏页不走底栏导航（顶部返回 + 底部重新开始）
    clearNode(document.getElementById('app-footer'));
    nextRound();
  }

  /* ---------- 状态机：轮次流转 ---------- */
  /* 进入下一轮（也用于开局）：waiting → 随机延迟变绿 */
  function nextRound() {
    if (state.finished) { return; }
    state.phase = 'waiting';
    renderGame();
    scheduleGreen();
  }

  /* waiting 阶段：随机延迟 2000~5000ms 后变绿 */
  function scheduleGreen() {
    if (state.pendingId) { clearTimeout(state.pendingId); }
    var delay = 2000 + Math.floor(Math.random() * 3001); // 2000~5000
    state.pendingId = setTimeout(goGreen, delay);
  }

  /* 变绿：切瞬间记 greenMs */
  function goGreen() {
    state.pendingId = null;
    state.phase = 'green';
    state.greenMs = performance.now();
    renderGame();
  }

  /* 大点击区统一处理 */
  function onTapZone() {
    if (state.finished) { return; }
    if (state.phase === 'green') {
      // 有效成绩
      var ms = Math.round(performance.now() - state.greenMs);
      state.round += 1;
      state.results.push(ms);
      state.lastMs = ms;
      state.phase = 'result';
      renderGame();
      state.resultTimerId = setTimeout(function () {
        if (state.round >= state.total) { finishGame(); }
        else { nextRound(); }
      }, 1200);
    } else if (state.phase === 'waiting') {
      // 犯规：红闪提示，本轮作废，清掉 pendingId 重新进入 waiting（重新随机延迟，不计数）
      if (state.pendingId) { clearTimeout(state.pendingId); state.pendingId = null; }
      state.phase = 'foul';
      state.foulCount += 1;
      renderGame();
      state.foulTimerId = setTimeout(function () {
        state.phase = 'waiting';
        renderGame();
        scheduleGreen();
      }, 700);
    }
    // phase === 'result' / 'foul' 期间的点击一律忽略（防误触连点）
  }

  /* ---------- 渲染：游戏页 ---------- */
  function currentAvg() {
    if (!state.results.length) { return 0; }
    var sum = 0;
    for (var i = 0; i < state.results.length; i++) { sum += state.results[i]; }
    return Math.round(sum / state.results.length);
  }
  function renderGame() {
    var level = state.level;
    var l = LEVELS[level];
    clearNode(viewEl);

    // 顶部状态栏：返回 | 第 x/y 轮 | 当前平均
    var top = makeEl('div', 'game-top');
    var back = makeEl('button', 'game-back', '‹ 返回');
    back.addEventListener('click', function () { viewHome(); });
    top.appendChild(back);
    var curRound = state.round >= state.total ? state.round : state.round + 1;
    top.appendChild(makeEl('div', 'game-name', '第 ' + curRound + '/' + state.total + ' 轮'));
    var avg = currentAvg();
    top.appendChild(makeEl('div', 'game-avg', avg ? '平均 ' + avg + ' ms' : '平均 --'));
    viewEl.appendChild(top);

    // 大点击区（低龄易点，至少 240px 高，全宽圆角）
    var zone = makeEl('div', 'tap-zone');
    zone.id = 'tap-zone';
    if (state.phase === 'waiting') {
      zone.className = 'tap-zone waiting';
      zone.appendChild(makeEl('div', 'tap-text', '👀 等待变绿，变绿后立即点击！'));
    } else if (state.phase === 'green') {
      zone.className = 'tap-zone green';
      zone.appendChild(makeEl('div', 'tap-text', '⚡ 点！'));
    } else if (state.phase === 'result') {
      zone.className = 'tap-zone result';
      zone.appendChild(makeEl('div', 'tap-ms', state.lastMs + ' ms'));
      zone.appendChild(makeEl('div', 'tap-label', labelFor(state.lastMs)));
    } else if (state.phase === 'foul') {
      zone.className = 'tap-zone foul';
      zone.appendChild(makeEl('div', 'tap-text', '⛔ 太快了！还没变绿，重新等待'));
    } else {
      zone.className = 'tap-zone idle';
      zone.appendChild(makeEl('div', 'tap-text', '准备…'));
    }
    zone.addEventListener('click', onTapZone);
    viewEl.appendChild(zone);

    // 底部：重新开始
    var row = makeEl('div', 'btn-row');
    var restart = makeEl('button', 'btn btn-primary', '重新开始');
    restart.addEventListener('click', function () { startGame(level); });
    row.appendChild(restart);
    viewEl.appendChild(row);
  }

  /* ---------- 结算 ---------- */
  function finishGame() {
    if (state.finished) { return; }
    state.finished = true;
    state.phase = 'finish';
    clearTimers();

    var results = state.results;
    var sum = 0;
    for (var i = 0; i < results.length; i++) { sum += results[i]; }
    var avg = Math.round(sum / results.length);
    var min = results[0], max = results[0];
    for (var j = 1; j < results.length; j++) {
      if (results[j] < min) { min = results[j]; }
      if (results[j] > max) { max = results[j]; }
    }
    var stars = starFor(avg);
    var label = labelFor(avg);

    // 打卡：完成一局即点亮今日
    var t = todayStr();
    var dates = store.checkin.dates;
    if (dates.indexOf(t) === -1) { dates.push(t); }
    dates.sort();
    while (dates.length > 365) { dates.shift(); }
    store.checkin.streak = calcStreak(dates);

    // 最佳 / 最近 / 历史（平均更小覆盖）
    var key = '' + state.level;
    var isNewBest = false;
    var best = store.best[key];
    if (!best || avg < best.avg) {
      store.best[key] = { avg: avg, date: t };
      isNewBest = true;
    }
    store.recent[key] = avg;
    store.history.unshift({
      date: t, level: state.level,
      rounds: state.round, avg: avg, min: min, max: max, stars: stars
    });
    while (store.history.length > 30) { store.history.pop(); }
    saveStore();

    state.summary = {
      level: state.level,
      total: state.total,
      avg: avg, min: min, max: max,
      stars: stars, label: label,
      results: results,
      isNewBest: isNewBest
    };

    showResult();
  }

  /* ---------- 结果浮层 ---------- */
  function mkStat(label, val) {
    var s = makeEl('div', 'result-stat');
    s.appendChild(makeEl('b', '', val));
    s.appendChild(makeEl('span', '', label));
    return s;
  }
  function showResult() {
    var s = state.summary;
    if (!s) { return; }
    closeOverlay(state.resultOverlay);
    var overlay = makeEl('div', 'result-overlay');
    var box = makeEl('div', 'result-box');
    box.appendChild(makeEl('div', 'result-title', '本局结束'));
    box.appendChild(makeEl('div', 'result-time', s.avg + ' ms'));
    box.appendChild(makeEl('div', 'result-tag', '『' + s.label + '』'));
    var stats = makeEl('div', 'result-stats');
    stats.appendChild(mkStat('最快', s.min + ' ms'));
    stats.appendChild(mkStat('最慢', s.max + ' ms'));
    stats.appendChild(mkStat('连续打卡', (store.checkin.streak || 0) + ' 天'));
    box.appendChild(stats);
    box.appendChild(makeEl('div', 'result-stars', '★★★'.slice(0, s.stars)));
    if (s.isNewBest) {
      box.appendChild(makeEl('div', 'result-record', '🎉 新纪录！'));
    }
    // 单次成绩列表
    var list = makeEl('div', 'result-list');
    for (var i = 0; i < s.results.length; i++) {
      list.appendChild(makeEl('div', 'result-list-item',
        '第 ' + (i + 1) + ' 次 ' + s.results[i] + ' ms'));
    }
    box.appendChild(list);
    // 按钮
    var btnRow = makeEl('div', 'btn-row');
    var again = makeEl('button', 'btn btn-primary', '再来一局');
    again.addEventListener('click', function () {
      closeOverlay(state.resultOverlay);
      startGame(state.level);
    });
    btnRow.appendChild(again);
    var home = makeEl('button', 'btn', '返回首页');
    home.addEventListener('click', function () {
      closeOverlay(state.resultOverlay);
      viewHome();
    });
    btnRow.appendChild(home);
    box.appendChild(btnRow);
    var share = makeEl('button', 'btn btn-share', '📷 分享打卡');
    share.addEventListener('click', function () { openShare(); });
    box.appendChild(share);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    state.resultOverlay = overlay;
  }
  function closeOverlay(overlay) {
    if (overlay && overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
    if (overlay === state.resultOverlay) { state.resultOverlay = null; }
    if (overlay === state.shareOverlay) { state.shareOverlay = null; }
  }

  /* ---------- 晒分分享：文案 + 卡片（canvas 1080×1920） ---------- */
  function shareText() {
    var s = state.summary;
    if (!s) { return ''; }
    var streak = store.checkin && store.checkin.streak ? store.checkin.streak : 0;
    var l = LEVELS[s.level];
    return '孩子玩【点击反应测试】『' + l.label + '』平均反应 ' + s.avg +
      ' 毫秒，『' + s.label + '』！已连续打卡 ' + streak +
      ' 天，反应力训练走起～#反应力测试 #小学生专注力 #益智训练';
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* 分享卡片：暖橙红渐变背景 + 白底战绩卡 */
  function drawShareCard() {
    var s = state.summary;
    var W = 1080, H = 1920;
    var cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    var ctx = cv.getContext('2d');
    // 背景渐变（暖橙红）
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#fff3e6');
    grad.addColorStop(1, '#ffe3cc');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // 顶部装饰点
    ctx.fillStyle = 'rgba(255, 140, 66, 0.35)';
    for (var i = 0; i < 24; i++) {
      var rx = Math.random() * W;
      var ry = Math.random() * H * 0.55;
      ctx.beginPath();
      ctx.arc(rx, ry, 6 + Math.random() * 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 标题
    ctx.fillStyle = '#d95b1e';
    ctx.font = 'bold 84px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('点击反应测试', W / 2, 300);
    ctx.fillStyle = '#f08a4d';
    ctx.font = '42px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('反应力小达人', W / 2, 400);
    // 白底战绩卡
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    roundRectPath(ctx, 110, 520, W - 220, 820, 24);
    ctx.fill();
    ctx.strokeStyle = '#ffd6b8';
    ctx.lineWidth = 4;
    roundRectPath(ctx, 110, 520, W - 220, 820, 24);
    ctx.stroke();
    // 难度
    ctx.fillStyle = '#e07b35';
    ctx.font = 'bold 52px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('【' + LEVELS[s.level].label + '】', W / 2, 660);
    // 平均反应大字
    ctx.fillStyle = '#b0886a';
    ctx.font = '40px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('平均反应', W / 2, 760);
    ctx.fillStyle = '#ff8c42';
    ctx.font = 'bold 132px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(s.avg + ' ms', W / 2, 890);
    // 等级标签（圆角徽章）
    ctx.fillStyle = '#ff8c42';
    roundRectPath(ctx, W / 2 - 150, 1010, 300, 84, 42);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 46px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('『' + s.label + '』', W / 2, 1054);
    // 详情行
    ctx.fillStyle = '#a8765c';
    ctx.font = '40px "PingFang SC","Microsoft YaHei",sans-serif';
    var lines = [];
    lines.push('单次最快：' + s.min + ' ms · 单次最慢：' + s.max + ' ms');
    lines.push('连续打卡：' + (store.checkin && store.checkin.streak || 0) + ' 天');
    for (var k = 0; k < lines.length; k++) {
      ctx.fillText(lines[k], W / 2, 1200 + k * 76);
    }
    // 底部鼓励语
    ctx.fillStyle = '#d95b1e';
    ctx.font = '54px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(motivationFor(s.label), W / 2, 1540);
    ctx.fillStyle = '#c98d6b';
    ctx.font = '36px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('龙爸乐学 · 点击反应测试小工具', W / 2, 1730);
    ctx.fillText(fmtDate(new Date()), W / 2, 1800);
    return cv;
  }

  /* 分享弹层：canvas 转 dataURL 图片 + 复制文案 + 返回结算 */
  var shareOpen = false;
  function openShare() {
    if (shareOpen) { return; }
    if (!state.summary) { return; }
    shareOpen = true;
    var cv = drawShareCard();
    var img = document.createElement('img');
    img.className = 'share-img';
    img.setAttribute('alt', '点击反应测试成绩打卡卡片');
    img.src = cv.toDataURL('image/png');
    var cardWrap = makeEl('div', 'share-card-wrap');
    cardWrap.appendChild(img);
    var hint = makeEl('div', 'share-hint', '📸 长按保存图片 · 发布笔记分享成就');
    var btnCopy = makeEl('button', 'btn btn-primary', '复制分享文案');
    btnCopy.addEventListener('click', copyShareText);
    var btnBack = makeEl('button', 'btn', '返回结算');
    btnBack.addEventListener('click', function () {
      shareOpen = false;
      closeOverlay(state.shareOverlay);
    });
    var btnsBox = makeEl('div', 'share-btns');
    btnsBox.appendChild(btnCopy);
    btnsBox.appendChild(btnBack);
    var card = makeEl('div', 'overlay-card share-card');
    card.appendChild(makeEl('div', 'overlay-title', '📷 分享打卡'));
    card.appendChild(cardWrap);
    card.appendChild(hint);
    card.appendChild(btnsBox);
    var overlay = makeEl('div', 'result-overlay share-overlay');
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    state.shareOverlay = overlay;
  }

  /* 文案复制（textarea + execCommand，Chrome 61 兼容） */
  function copyShareText() {
    var text = shareText();
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    document.body.removeChild(ta);
    if (ok) {
      toast('✅ 文案已复制，去小红书粘贴发布吧');
    } else {
      toast('📋 文案如下，请长按选择复制：' + text);
    }
  }
  function toast(msg) {
    var t = makeEl('div', 'toast', msg);
    document.body.appendChild(t);
    setTimeout(function () {
      if (t.parentNode) { t.parentNode.removeChild(t); }
    }, 2600);
  }

  /* ---------- 视图：成绩历史 ---------- */
  function viewHistory() {
    renderHeader('成绩');
    clearNode(viewEl);
    var h = store.history;
    if (!h.length) {
      viewEl.appendChild(makeEl('div', 'page-title', '暂无成绩，先来一局吧！'));
      renderFooterNav();
      return;
    }
    viewEl.appendChild(makeEl('div', 'page-title', '最近 ' + h.length + ' 次成绩'));
    var list = makeEl('div', 'point-list');
    h.forEach(function (r) {
      var item = makeEl('div', 'point-item');
      var left = makeEl('div');
      var label = LEVELS[r.level] ? LEVELS[r.level].label : (r.level + ' 次');
      left.appendChild(makeEl('div', 'point-name', label));
      left.appendChild(makeEl('div', 'point-meta', r.date + ' · 有效 ' + r.rounds + ' 次'));
      item.appendChild(left);
      var right = makeEl('div', 'point-right');
      right.appendChild(makeEl('div', 'point-time', r.avg + ' ms'));
      right.appendChild(makeEl('div', 'point-stars', '★★★'.slice(0, r.stars)));
      item.appendChild(right);
      list.appendChild(item);
    });
    viewEl.appendChild(list);
    renderFooterNav();
  }

  /* ---------- 视图：打卡日历（完成一局自动打卡，本页仅展示） ---------- */
  function viewCheckin() {
    renderHeader('打卡日历');
    clearNode(viewEl);
    var card = makeEl('div', 'calendar');
    card.appendChild(makeEl('div', 'page-title', '本月打卡'));
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
    var streak = calcStreak(store.checkin.dates);
    var info = makeEl('div', 'streak-info');
    info.appendChild(document.createTextNode('连续打卡 '));
    var b = makeEl('b', '', '' + streak);
    info.appendChild(b);
    info.appendChild(document.createTextNode(' 天' + (streak >= 7 ? ' 🎉' : '')));
    card.appendChild(info);
    viewEl.appendChild(card);
    renderFooterNav();
  }

  /* ---------- 底部导航 ---------- */
  function renderFooterNav() {
    var foot = document.getElementById('app-footer');
    clearNode(foot);
    var nav = makeEl('div', 'footer-nav');
    var mk = function (label, fn) {
      var b = makeEl('div', 'footer-btn', label);
      b.addEventListener('click', fn);
      return b;
    };
    nav.appendChild(mk('成绩', function () { viewHistory(); }));
    nav.appendChild(mk('打卡', function () { viewCheckin(); }));
    nav.appendChild(mk('首页', function () { viewHome(); }));
    foot.appendChild(nav);
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
  viewHome();
})();
