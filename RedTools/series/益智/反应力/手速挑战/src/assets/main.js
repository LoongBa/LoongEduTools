/* ============================================================
   手速挑战 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   数据：window.APP_DATA（data.js 注入，build 生成 meta，可缺失）
   玩法：限时点击速度测试 —— 准备倒计时 3-2-1 → 疯狂点击大区域
        - idle：首页选难度（按时长秒 5/10/15）
        - ready：中央大点击区「👆 准备…」+ 3-2-1 逐秒倒计时，
                  此时点击区点击无效（提示还没开始），归零自动 startRunning
        - running：实时剩余秒数（⏱ 07.2）+ 总点击数大字 + 实时 CPS；
                   每次点击 count+1 + 数字弹跳动画 + 点击区轻变色反馈
        - finish：停止计数 → 结算浮层（CPS 星级 + 打卡 + 晒分分享卡片）
   难度：三档按时长秒（简单 5 / 进阶 10 / 挑战 15）
   成绩：总点击数 count（主）+ CPS = count / 时长秒（1 位小数）+ 星级
   计时：performance.now() 记 startMs，setInterval(100ms) 按差值刷新剩余时间，
         归零触发 finishGame；另设 setTimeout(duration) 兜底结束（双保险）
   设计约束：
   - 不使用 import/export / type="module"
   - 不超出 ES2017（无 ?. ?? 对象展开 replaceAll 等）
   - 事件全部 addEventListener，无内联事件 / eval
   - 计时用 performance.now()，interval 按差值刷新（后台回来计时仍准）
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };

  /* ---------- DOM ---------- */
  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');

  /* ---------- 难度定义（键 = 时长秒） ---------- */
  var LEVELS = {
    5: { label: '简单 · 5 秒', duration: 5 },
    10: { label: '进阶 · 10 秒', duration: 10 },
    15: { label: '挑战 · 15 秒', duration: 15 }
  };
  var READY_SECONDS = 3; // 准备倒计时秒数

  /* CPS 星级：≥6 → 3★；≥3 → 2★；否则 1★ */
  function starFor(cps) {
    if (cps >= 6) { return 3; }
    if (cps >= 3) { return 2; }
    return 1;
  }
  /* 等级标签 */
  function labelFor(cps) {
    if (cps >= 8) { return '手速达人'; }
    if (cps >= 6) { return '超快手'; }
    if (cps >= 4) { return '快枪手'; }
    if (cps >= 2) { return '小手速'; }
    return '练习中';
  }
  /* 分享卡片底部鼓励语（按等级） */
  function motivationFor(label) {
    if (label === '手速达人') { return '手速惊人，无人能敌！'; }
    if (label === '超快手') { return '超快小手速，太厉害！'; }
    if (label === '快枪手') { return '又快又稳，继续加油！'; }
    if (label === '小手速') { return '反应很敏捷，再练更快！'; }
    return '多练几次，手速会越来越快！';
  }

  /* ---------- 状态 ---------- */
  var state = {
    level: 5,            // 难度（时长秒 5/10/15）
    duration: 5,         // 本局时长秒
    phase: 'idle',       // idle / ready / running / finish
    count: 0,            // 总点击数
    startMs: 0,          // running 启动时间戳
    finished: false,     // 是否已结算
    countdownId: null,   // 准备倒计时 interval
    timerId: null,       // running 计时 interval
    endTimerId: null,    // 双保险 setTimeout（兜底结束）
    bounceTimerId: null, // 计数弹跳类移除 timer
    flashTimerId: null,  // 点击区变色类移除 timer
    resultOverlay: null, // 结算浮层引用
    shareOverlay: null,  // 分享浮层引用
    summary: null        // 结算摘要（分享/文案用）
  };

  /* ---------- 持久化 ---------- */
  var STORE_KEY = 'redtools.tapchallenge.v1';
  LX_SHARED.storage.configure({ toolName: 'tapchallenge' });  // V0.4 迁移：键前缀 redtools.tapchallenge.v1
  function loadStore() {
    try {
      var raw = LX_SHARED.storage.get('v1');
      if (raw) { return raw; }
    } catch (err) { /* ignore */ }
    return {
      version: 1,
      best: { '5': null, '10': null, '15': null },
      recent: { '5': 0, '10': 0, '15': 0 },
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
  /* 剩余秒数格式化：5 → 05.0、7.2 → 07.2（补零到 4 字符） */
  function fmtNum(v) {
    var s = v.toFixed(1);
    if (s.length === 3) { s = '0' + s; }
    return s;
  }
  /* 连续打卡天数：含今天往前推、跨天断（dates 升序去重） */
  function calcStreak(dates) {
    return LX_SHARED.progress.streak(dates);
}

  /* ---------- 计时器统一清理 ---------- */
  function clearAllTimers() {
    if (state.countdownId) { clearInterval(state.countdownId); state.countdownId = null; }
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
    if (state.endTimerId) { clearTimeout(state.endTimerId); state.endTimerId = null; }
    if (state.bounceTimerId) { clearTimeout(state.bounceTimerId); state.bounceTimerId = null; }
    if (state.flashTimerId) { clearTimeout(state.flashTimerId); state.flashTimerId = null; }
  }

  /* ---------- 渲染：顶栏 ---------- */
  function renderHeader(title) {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '手速挑战';
    brand.appendChild(makeEl('span', 'header-title', title || name));
    if (APP.meta && APP.meta.version) {
      brand.appendChild(makeEl('span', 'header-ver', 'v' + APP.meta.version));
    }
    headerEl.appendChild(brand);
  }

  /* ---------- 视图：首页选难度 ---------- */
  function viewHome() {
    // 退出游戏时清理计时（防止倒计时/计时器后台继续推进）
    clearAllTimers();
    state.phase = 'idle';
    state.finished = false;
    renderHeader();
    clearNode(viewEl);
    viewEl.appendChild(makeEl('div', 'page-title', '选择难度'));
    viewEl.appendChild(makeEl('div', 'home-hint', '疯狂点击大区域，测测你的限时手速！'));
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
        best && best.cps ? '最佳 每秒 ' + best.cps + ' 次' : '未挑战');
      card.appendChild(meta);
      list.appendChild(card);
    });
    viewEl.appendChild(list);
    // 玩法说明
    viewEl.appendChild(makeEl('div', 'howto-title', '玩法说明'));
    var howto = makeEl('div', 'howto');
    howto.appendChild(makeEl('div', 'howto-line', '① 点击开始后疯狂点击大区域'));
    howto.appendChild(makeEl('div', 'howto-line', '② 倒计时结束前尽量多点'));
    howto.appendChild(makeEl('div', 'howto-line', '③ 数字会告诉你点了多少次'));
    howto.appendChild(makeEl('div', 'howto-line', '④ 时间到取每秒点击数评星级'));
    viewEl.appendChild(howto);
    renderFooterNav();
  }

  /* ---------- 视图：游戏页 ---------- */
  function startGame(level) {
    clearAllTimers();
    state.level = level;
    state.duration = LEVELS[level].duration;
    state.count = 0;
    state.phase = 'ready';
    state.finished = false;
    renderHeader(LEVELS[level].label);
    clearNode(viewEl);
    // 游戏页不走底栏导航（顶部返回 + 底部重新开始）
    clearNode(document.getElementById('app-footer'));
    startCountdown();
  }

  /* ---------- 准备倒计时：ready 3-2-1，点击无效 ---------- */
  var countdownVal = READY_SECONDS;
  function startCountdown() {
    countdownVal = READY_SECONDS;
    state.phase = 'ready';
    renderReady();
    state.countdownId = setInterval(function () {
      countdownVal -= 1;
      if (countdownVal <= 0) {
        clearInterval(state.countdownId);
        state.countdownId = null;
        startRunning();
      } else {
        var el = document.getElementById('countdown-num');
        if (el) { el.textContent = '' + countdownVal; }
      }
    }, 1000);
  }

  /* ---------- 渲染：ready 阶段 ---------- */
  function renderReady() {
    clearNode(viewEl);
    // 顶部状态栏：返回 | 难度 | 已点 N 次
    var top = makeEl('div', 'game-top');
    var back = makeEl('button', 'game-back', '‹ 返回');
    back.addEventListener('click', function () { viewHome(); });
    top.appendChild(back);
    top.appendChild(makeEl('div', 'game-name', LEVELS[state.level].label));
    top.appendChild(makeEl('div', 'game-count', '已点 0 次'));
    viewEl.appendChild(top);

    // 大点击区（准备态：浅橙，低龄易点，至少 260px 高）
    var zone = makeEl('div', 'tap-zone ready');
    zone.id = 'tap-zone';
    zone.appendChild(makeEl('div', 'tap-text', '👆 准备…'));
    var num = makeEl('div', 'countdown-num', '' + countdownVal);
    num.id = 'countdown-num';
    zone.appendChild(num);
    zone.appendChild(makeEl('div', 'tap-tip', '倒计时结束立即开始点击！'));
    zone.addEventListener('click', onTapZone);
    viewEl.appendChild(zone);

    // 底部：重新开始
    var row = makeEl('div', 'btn-row');
    var restart = makeEl('button', 'btn btn-primary', '重新开始');
    restart.addEventListener('click', function () { startGame(state.level); });
    row.appendChild(restart);
    viewEl.appendChild(row);
  }

  /* ---------- 进入 running：计时区分割点 ---------- */
  function startRunning() {
    if (state.finished) { return; }
    state.phase = 'running';
    state.startMs = performance.now();
    renderRunning();
    // 每 100ms 按差值刷新剩余时间 + 实时 CPS
    state.timerId = setInterval(tickRunning, 100);
    // 双保险：到时长兜底结束（防 interval 被后台压制）
    state.endTimerId = setTimeout(finishGame, state.duration * 1000 + 50);
  }

  function tickRunning() {
    var elapsed = (performance.now() - state.startMs) / 1000;
    var remain = state.duration - elapsed;
    if (remain <= 0) {
      finishGame();
      return;
    }
    updateRunning(remain, state.count / Math.max(0.001, elapsed));
  }

  /* 局部刷新：剩余秒数 + 实时 CPS（不重建 DOM，性能优先） */
  function updateRunning(remain, cps) {
    var timeEl = document.getElementById('tap-time');
    if (timeEl) { timeEl.textContent = '⏱ ' + fmtNum(remain); }
    var cpsEl = document.getElementById('tap-cps');
    if (cpsEl) { cpsEl.textContent = '每秒 ' + cps.toFixed(1) + ' 次'; }
  }

  /* ---------- 渲染：running 阶段 ---------- */
  function renderRunning() {
    clearNode(viewEl);
    // 顶部状态栏：返回 | 难度 | 已点 N 次
    var top = makeEl('div', 'game-top');
    var back = makeEl('button', 'game-back', '‹ 返回');
    back.addEventListener('click', function () { viewHome(); });
    top.appendChild(back);
    top.appendChild(makeEl('div', 'game-name', LEVELS[state.level].label));
    var cntEl = makeEl('div', 'game-count', '已点 ' + state.count + ' 次');
    cntEl.id = 'game-count';
    top.appendChild(cntEl);
    viewEl.appendChild(top);

    // 大点击区（运行态：橙底，总点击数大字 ≥72px）
    var zone = makeEl('div', 'tap-zone running');
    zone.id = 'tap-zone';
    var timeEl = makeEl('div', 'tap-time', '⏱ ' + fmtNum(state.duration));
    timeEl.id = 'tap-time';
    zone.appendChild(timeEl);
    var countEl = makeEl('div', 'tap-count', '' + state.count);
    countEl.id = 'tap-count';
    zone.appendChild(countEl);
    var cpsEl = makeEl('div', 'tap-cps', '每秒 0.0 次');
    cpsEl.id = 'tap-cps';
    zone.appendChild(cpsEl);
    zone.appendChild(makeEl('div', 'tap-tip', '疯狂点点点！'));
    zone.addEventListener('click', onTapZone);
    viewEl.appendChild(zone);

    // 底部：重新开始
    var row = makeEl('div', 'btn-row');
    var restart = makeEl('button', 'btn btn-primary', '重新开始');
    restart.addEventListener('click', function () { startGame(state.level); });
    row.appendChild(restart);
    viewEl.appendChild(row);
  }

  /* ---------- 大点击区统一处理 ---------- */
  function onTapZone() {
    if (state.finished) { return; }
    if (state.phase === 'running') {
      // 有效点击：count+1 + 数字弹跳 + 顶栏计数 + 点击区轻变色
      state.count += 1;
      var countEl = document.getElementById('tap-count');
      if (countEl) {
        countEl.textContent = '' + state.count;
        triggerBounce(countEl, 'tap-count');
      }
      var gameCount = document.getElementById('game-count');
      if (gameCount) { gameCount.textContent = '已点 ' + state.count + ' 次'; }
      var zone = document.getElementById('tap-zone');
      if (zone) { triggerFlash(zone); }
    } else if (state.phase === 'ready') {
      // 倒计时期间点击无效，轻提示
      toast('⏳ 还没开始，等倒计时结束！');
    }
    // idle / finish 阶段的点击一律忽略
  }

  /* 数字弹跳：单次 scale 脉冲 ≤400ms（150ms），连点可重新触发 */
  function triggerBounce(el, baseClass) {
    if (state.bounceTimerId) { clearTimeout(state.bounceTimerId); state.bounceTimerId = null; }
    el.className = baseClass;
    void el.offsetWidth; // 强制重排，确保每次点击重新触发动画
    el.className = baseClass + ' bounce';
    state.bounceTimerId = setTimeout(function () {
      el.className = baseClass;
    }, 150);
  }

  /* 点击区轻变色反馈：橙底 → 浅橙脉冲 150ms */
  function triggerFlash(zone) {
    if (state.flashTimerId) { clearTimeout(state.flashTimerId); state.flashTimerId = null; }
    zone.className = 'tap-zone running';
    void zone.offsetWidth;
    zone.className = 'tap-zone running flash';
    state.flashTimerId = setTimeout(function () {
      zone.className = 'tap-zone running';
    }, 150);
  }

  /* ---------- 结算 ---------- */
  function finishGame() {
    if (state.finished) { return; }
    state.finished = true;
    state.phase = 'finish';
    clearAllTimers();

    var duration = state.duration;
    var count = state.count;
    var cps = count / duration;
    var stars = starFor(cps);
    var label = labelFor(cps);

    // 打卡：完成一局即点亮今日
    var t = todayStr();
    var dates = store.checkin.dates;
    if (dates.indexOf(t) === -1) { dates.push(t); }
    dates.sort();
    while (dates.length > 365) { dates.shift(); }
    store.checkin.streak = calcStreak(dates);

    // 最佳 / 最近 / 历史（CPS 更大覆盖，同时记 count 与 date）
    var key = '' + state.level;
    var isNewBest = false;
    var best = store.best[key];
    if (!best || cps > best.cps) {
      store.best[key] = { cps: cps, count: count, date: t };
      isNewBest = true;
    }
    store.recent[key] = count;
    store.history.unshift({
      date: t, level: state.level, duration: duration,
      count: count, cps: cps, stars: stars
    });
    while (store.history.length > 30) { store.history.pop(); }
    saveStore();

    state.summary = {
      level: state.level, duration: duration,
      count: count, cps: cps,
      stars: stars, label: label,
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
    box.appendChild(makeEl('div', 'result-title', '时间到！'));
    box.appendChild(makeEl('div', 'result-time', s.count + ' 次'));
    box.appendChild(makeEl('div', 'result-tag', '『' + s.label + '』 · 每秒 ' + s.cps + ' 次'));
    var stats = makeEl('div', 'result-stats');
    stats.appendChild(mkStat('总点击数', s.count + ' 次'));
    stats.appendChild(mkStat('时长', s.duration + ' 秒'));
    stats.appendChild(mkStat('连续打卡', (store.checkin.streak || 0) + ' 天'));
    box.appendChild(stats);
    box.appendChild(makeEl('div', 'result-stars', '★★★'.slice(0, s.stars)));
    if (s.isNewBest) {
      box.appendChild(makeEl('div', 'result-record', '🎉 新纪录！'));
    }
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
    return '孩子玩【手速挑战】『' + l.label + '』' + s.duration +
      ' 秒点了 ' + s.count + ' 次，每秒 ' + s.cps + ' 次，『' + s.label +
      '』！已连续打卡 ' + streak +
      ' 天，手速训练走起～#手速挑战 #小学生专注力 #益智训练';
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

  /* 分享卡片：暖橙渐变背景 + 白底战绩卡 */
  function drawShareCard() {
    var s = state.summary;
    var W = 1080, H = 1920;
    var cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    var ctx = cv.getContext('2d');
    // 背景渐变（暖橙 #fff3e6 → #ffe3cc）
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
    ctx.fillText('手速挑战', W / 2, 300);
    ctx.fillStyle = '#f08a4d';
    ctx.font = '42px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('手速小达人', W / 2, 400);
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
    // 总点击数大字
    ctx.fillStyle = '#b0886a';
    ctx.font = '40px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('总点击数', W / 2, 760);
    ctx.fillStyle = '#ff8c42';
    ctx.font = 'bold 128px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(s.count + ' 次', W / 2, 890);
    // 每秒 CPS
    ctx.fillStyle = '#b0886a';
    ctx.font = '40px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('每秒 CPS', W / 2, 990);
    ctx.fillStyle = '#ff8c42';
    ctx.font = 'bold 76px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(s.cps + ' 次/秒', W / 2, 1070);
    // 等级标签（圆角徽章）
    ctx.fillStyle = '#ff8c42';
    roundRectPath(ctx, W / 2 - 170, 1150, 340, 84, 42);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 46px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('『' + s.label + '』', W / 2, 1194);
    // 详情行
    ctx.fillStyle = '#a8765c';
    ctx.font = '40px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('时长 ' + s.duration + ' 秒 · 连续打卡 ' +
      (store.checkin && store.checkin.streak || 0) + ' 天', W / 2, 1300);
    // 底部鼓励语
    ctx.fillStyle = '#d95b1e';
    ctx.font = '54px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(motivationFor(s.label), W / 2, 1540);
    ctx.fillStyle = '#c98d6b';
    ctx.font = '36px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('龙爸乐学 · 手速挑战小工具', W / 2, 1730);
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
    img.setAttribute('alt', '手速挑战成绩打卡卡片');
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

  /* 轻提示（自动顶掉旧条，防连点刷屏） */
  var toastEl = null;
  function toast(msg) {
    if (toastEl && toastEl.parentNode) { toastEl.parentNode.removeChild(toastEl); }
    toastEl = makeEl('div', 'toast', msg);
    document.body.appendChild(toastEl);
    setTimeout(function () {
      if (toastEl && toastEl.parentNode) { toastEl.parentNode.removeChild(toastEl); }
      toastEl = null;
    }, 2200);
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
      var label = LEVELS[r.level] ? LEVELS[r.level].label : (r.level + ' 秒');
      left.appendChild(makeEl('div', 'point-name', label));
      left.appendChild(makeEl('div', 'point-meta', r.date + ' · 时长 ' + r.duration + ' 秒'));
      item.appendChild(left);
      var right = makeEl('div', 'point-right');
      right.appendChild(makeEl('div', 'point-time', r.count + ' 次 · ' + r.cps + '/s'));
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