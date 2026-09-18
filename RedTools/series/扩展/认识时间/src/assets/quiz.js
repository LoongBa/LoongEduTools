/* ============================================================
   认识时间 — 练习引擎（window.TimeApp 命名空间，Chrome 61 基线）
   F2 读钟题「读一读」/ F3 拨钟题「拨一拨」/ F4 阶段渐进解锁 /
   F5 打卡·星星·成绩结算
   依赖 main.js：M.store / M.makeEl / M.clearNode / M.renderHeader /
   M.backFromQuiz / M.todayStr / M.calcStreak / M.saveStore / M.viewEl
   约束：不超 ES2017（无 ?. ?? 对象展开等）、事件全 addEventListener、
         零图片素材（钟面全部内联 SVG 字符串模板）
   ============================================================ */
(function () {
  'use strict';

  var M = window.TimeApp;
  var viewEl = M.viewEl; // main.js 注入

  /* ---------- 阶段定义（F4 渐进：整点 → 半点 → 混合） ---------- */
  var STAGES = [
    { name: '整点', mins: [0],   desc: '分针指 12 · 时针指几就是几点' },
    { name: '半点', mins: [30],  desc: '分针指 6 · 时针走过几就是几点半' },
    { name: '混合', mins: [0, 30], desc: '整点 + 半点一起练' }
  ];
  M.STAGES = STAGES;

  /* ---------- 会话状态（每阶段 10 题：5 读钟 + 5 拨钟交替） ---------- */
  var state = M.state = {
    stage: 1, quiz: [], idx: 0, correct: 0,
    answered: false, over: false
  };
  /* 拨钟题当前指针（set 模式专属） */
  var setCur = { h: 12, m: 0, tried: 0 };
  var feedbackEl = null;

  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtTime(h, m) { return h + ':' + p2(m); }

  /* ============================================================
     SVG 钟面渲染（F1/F2/F3 共用，viewBox 0 0 200 200）
     12 数字刻度 + 整点大刻度 + 每 5 分钟小刻度（60 个细刻度，
     整点位置粗刻度覆盖）+ 时针短粗深色 + 分针长细亮色 + 中心圆点
     ============================================================ */
  function polar(n, r) { // n∈[0,360) 顺时针角度（0=12 点方向），r 为半径
    var a = (n - 90) * Math.PI / 180;
    return [100 + r * Math.cos(a), 100 + r * Math.sin(a)];
  }
  M.renderClock = function (el, h, m, opts) {
    opts = opts || {};
    var parts = [];
    parts.push('<svg class="clock-svg" viewBox="0 0 200 200"' +
      (opts.id ? ' id="' + opts.id + '"' : '') + '>');
    parts.push('<circle cx="100" cy="100" r="92" fill="#fff" stroke="#e5e6eb" stroke-width="3"/>');
    /* 60 个 5 分钟小刻度（细） */
    var i, p1, p2;
    for (i = 0; i < 60; i++) {
      p1 = polar(i * 6, 88); p2 = polar(i * 6, 83);
      parts.push('<line x1="' + p1[0].toFixed(1) + '" y1="' + p1[1].toFixed(1) +
        '" x2="' + p2[0].toFixed(1) + '" y2="' + p2[1].toFixed(1) +
        '" stroke="#c9cdd4" stroke-width="1.5"/>');
    }
    /* 12 个整点大刻度（粗）+ 数字 1-12 */
    var nums = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];
    for (i = 0; i < 12; i++) {
      p1 = polar(i * 30, 88); p2 = polar(i * 30, 76);
      parts.push('<line x1="' + p1[0].toFixed(1) + '" y1="' + p1[1].toFixed(1) +
        '" x2="' + p2[0].toFixed(1) + '" y2="' + p2[1].toFixed(1) +
        '" stroke="#1f2329" stroke-width="4" stroke-linecap="round"/>');
      var np = polar(i * 30, 64);
      parts.push('<text x="' + np[0].toFixed(1) + '" y="' + np[1].toFixed(1) +
        '" font-size="16" font-weight="700" fill="#4e5969" text-anchor="middle" dominant-baseline="central">' +
        nums[i] + '</text>');
    }
    /* 指针：时针角 = h*30 + m/2，分针角 = m*6（12 点=0 度，顺时针） */
    var ha = ((h % 12) * 30 + m / 2) % 360;
    var ma = (m * 6) % 360;
    parts.push('<line x1="100" y1="100" x2="100" y2="50" stroke="#1f2329" stroke-width="7" ' +
      'stroke-linecap="round" transform="rotate(' + ha + ' 100 100)"/>');
    parts.push('<line x1="100" y1="100" x2="100" y2="20" stroke="#165dff" stroke-width="4" ' +
      'stroke-linecap="round" transform="rotate(' + ma + ' 100 100)"/>');
    parts.push('<circle cx="100" cy="100" r="6" fill="#1f2329"/>');
    parts.push('</svg>');
    el.innerHTML = parts.join('');
    if (opts.onClick) { // 拨钟题：点表盘任意位置
      var svg = el.firstChild;
      svg.addEventListener('click', opts.onClick);
    }
  };

  /* 拨钟题：点击表盘 → 分针吸附最近 5 分钟刻度（分针独立驱动）；
     时针 = 预置小时 + 分针联动偏移（renderClock 时针角 = h*30 + m/2 自动联动） */
  function dialClick(e) {
    if (state.answered || state.over) { return; }
    var svg = e.currentTarget;
    var rect = svg.getBoundingClientRect();
    var ox = (e.clientX - rect.left) / rect.width * 200;
    var oy = (e.clientY - rect.top) / rect.height * 200;
    var dx = ox - 100, dy = oy - 100;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 30 || dist > 92) { return; } // 中心圆内/表盘外忽略
    var deg = Math.atan2(dx, -dy) * 180 / Math.PI; // 0=12点，顺时针
    if (deg < 0) { deg += 360; }
    setCur.m = (Math.round(deg / 30) * 5) % 60; // 最近 5 分钟刻度
    renderViaState();
  }

  /* ============================================================
     出题引擎：每阶段 10 题（读钟 5 + 拨钟 5 交替）
     时间范围：h∈1..12，m∈阶段分钟集；混合阶段 m∈{0,30} 不引入 5 分钟档
     ============================================================ */
  function buildQuiz(stage) {
    var mins = STAGES[stage - 1].mins;
    var pool = [];
    var h, i;
    for (h = 1; h <= 12; h++) {
      for (i = 0; i < mins.length; i++) { pool.push({ h: h, m: mins[i] }); }
    }
    shuffle(pool);
    var quiz = [];
    var used = {};
    for (i = 0; i < 10; i++) {
      var type = (i % 2 === 0) ? 'read' : 'set'; // 交替
      var pick = null;
      for (var t = 0; t < pool.length; t++) {
        var cand = pool[t];
        var key = cand.h + ':' + cand.m;
        if (!used[key]) { pick = cand; used[key] = true; break; }
      }
      if (!pick) { pick = pool[i % pool.length]; } // 池不足兜底
      quiz.push({ type: type, h: pick.h, m: pick.m });
    }
    return quiz;
  }
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
  }

  /* 读钟题选项：正确 + 3 干扰（±1 小时 / ±5 分钟 / 整点↔半点变体，去重） */
  function buildOptions(q) {
    var h = q.h, m = q.m;
    var fmt = function (hh, mm) { return hh + ':' + p2(mm); };
    var pos = [fmt(h, m)], cands = [];
    var alt = (m === 0) ? 30 : 0;      // 整点↔半点变体
    cands.push(fmt((h % 12) + 1, m));  // +1 小时
    cands.push(fmt(((h + 10) % 12) + 1, m)); // -1 小时（12 循环）
    cands.push(fmt(h, alt));           // 整点↔半点变体
    cands.push(fmt(h, m === 0 ? 5 : 25)); // ±5 分钟变体
    cands.push(fmt((h % 12) + 1, alt)); // 组合：+1h + 变体
    cands.push(fmt(((h + 10) % 12) + 1, alt));
    var seen = {};
    for (var i = 0; i < cands.length; i++) {
      if (!seen[cands[i]]) { seen[cands[i]] = true; pos.push(cands[i]); }
    }
    while (pos.length < 4) { // 兜底防不足
      var hh = Math.floor(Math.random() * 12) + 1;
      var mm = (Math.random() < 0.5) ? 0 : 30;
      var k = fmt(hh, mm);
      if (!seen[k]) { seen[k] = true; pos.push(k); }
    }
    if (pos.length > 4) { pos = pos.slice(0, 4); } // 4 选 1：正确 + 3 干扰
    var opts = [];
    for (var k2 = 0; k2 < pos.length; k2++) {
      var s = pos[k2].split(':');
      opts.push({ h: parseInt(s[0], 10), m: parseInt(s[1], 10), v: pos[k2] });
    }
    shuffle(opts);
    return opts;
  }

  /* ============================================================
     练习页渲染与答题
     ============================================================ */
  function startQuiz(stage) {
    if (stage > (M.store.unlockedStage || 1)) { return; }
    state.stage = stage;
    state.quiz = buildQuiz(stage);
    state.idx = 0; state.correct = 0;
    state.answered = false; state.over = false;
    M.renderHeader('第 ' + stage + ' 阶段 · ' + STAGES[stage - 1].name);
    renderQuiz();
    renderQuizFooter();
  }
  M.startQuiz = startQuiz;

  function renderQuizFooter() {
    var foot = document.getElementById('app-footer');
    M.clearNode(foot);
    var nav = M.makeEl('div', 'footer-nav');
    var quit = M.makeEl('div', 'footer-btn', '退出练习');
    quit.addEventListener('click', function () { M.backFromQuiz(); });
    nav.appendChild(quit);
    foot.appendChild(nav);
  }

  function renderQuiz() {
    M.clearNode(viewEl);
    viewEl.className = 'view';
    var q = state.quiz[state.idx];
    var top = M.makeEl('div', 'quiz-top');
    top.appendChild(M.makeEl('div', 'quiz-progress',
      '第 ' + (state.idx + 1) + ' / ' + state.quiz.length + ' 题 · ' +
      (q.type === 'read' ? '读一读' : '拨一拨')));
    viewEl.appendChild(top);
    if (q.type === 'read') { renderReadQuiz(q); }
    else { renderSetQuiz(q); }
  }

  /* ---------- F2 读钟题：SVG 钟面 + 4 选项 ---------- */
  var qAnswer = null;
  function renderReadQuiz(q) {
    qAnswer = q;
    var card = M.makeEl('div', 'quiz-card');
    card.appendChild(M.makeEl('div', 'quiz-question', '钟面上是几点？'));
    var wrap = M.makeEl('div', 'clock-wrap');
    M.renderClock(wrap, q.h, q.m);
    card.appendChild(wrap);
    viewEl.appendChild(card);

    var opts = buildOptions(q);
    var grid = M.makeEl('div', 'opt-grid');
    opts.forEach(function (o) {
      var box = M.makeEl('div');
      var btn = M.makeEl('button', 'opt-btn', o.v);
      btn.addEventListener('click', function () { submitRead(o, btn); });
      box.appendChild(btn);
      grid.appendChild(box);
    });
    viewEl.appendChild(grid);
    feedbackEl = M.makeEl('div', 'quiz-feedback', '');
    viewEl.appendChild(feedbackEl);
  }

  function submitRead(o, btn) {
    if (state.answered) { return; }
    state.answered = true;
    var ok = (o.h === qAnswer.h && o.m === qAnswer.m);
    M.store.profile.totalAnswer = (M.store.profile.totalAnswer || 0) + 1;
    if (ok) {
      state.correct += 1;
      M.store.profile.totalCorrect = (M.store.profile.totalCorrect || 0) + 1;
      btn.className = 'opt-btn ok';
      feedbackEl.textContent = '✓ 答对了！';
      feedbackEl.className = 'quiz-feedback ok';
    } else {
      btn.className = 'opt-btn bad';
      markCorrectBtn();
      feedbackEl.textContent = '✗ 正确答案：' + qAnswer.h + ':' + p2(qAnswer.m);
      feedbackEl.className = 'quiz-feedback bad';
    }
    M.saveStore();
    window.setTimeout(advance, ok ? 600 : 1400);
  }
  function markCorrectBtn() {
    var btns = viewEl.querySelectorAll('.opt-btn');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].textContent === qAnswer.h + ':' + p2(qAnswer.m) &&
          btns[i].className.indexOf('bad') === -1) {
        btns[i].className = 'opt-btn ok';
      }
    }
  }

  /* ---------- F3 拨钟题：目标大字 + 可点钟面 + ±15 按钮 + 检查 ---------- */
  var setTarget = null;
  function renderSetQuiz(q) {
    setTarget = { h: q.h, m: q.m };
    setCur.h = q.h; setCur.m = 45; setCur.tried = 0; // 小时预置为目标（分步教学），分针从 45 分起拨
    var hint = M.makeEl('div', 'set-hint', '先定小时，再把分针拨到目标位置');
    var card = M.makeEl('div', 'quiz-card set-card');
    var tg = M.makeEl('div', 'set-target');
    tg.appendChild(M.makeEl('div', 'set-target-num', fmtTime(q.h, q.m)));
    tg.appendChild(M.makeEl('div', 'set-target-cn', cnTime(q.h, q.m)));
    card.appendChild(tg);
    viewEl.appendChild(card);
    viewEl.appendChild(hint);

    var wrap = M.makeEl('div', 'clock-wrap');
    M.renderClock(wrap, setCur.h, setCur.m, { onClick: dialClick });
    viewEl.appendChild(wrap);

    var cur = M.makeEl('div', 'set-current', '现在拨到：' + fmtTime(setCur.h, setCur.m));
    cur.id = 'set-current';
    viewEl.appendChild(cur);

    var ctl = M.makeEl('div', 'set-controls');
    var bm = M.makeEl('button', 'time-btn', '−15 分');
    bm.addEventListener('click', function () { stepSet(-15); });
    var bp = M.makeEl('button', 'time-btn', '+15 分');
    bp.addEventListener('click', function () { stepSet(15); });
    var chk = M.makeEl('button', 'btn btn-primary btn-check', '检查');
    chk.addEventListener('click', checkSet);
    ctl.appendChild(bm);
    ctl.appendChild(bp);
    viewEl.appendChild(ctl);
    viewEl.appendChild(chk);
    feedbackEl = M.makeEl('div', 'quiz-feedback', '');
    viewEl.appendChild(feedbackEl);
  }

  function cnTime(h, m) {
    var cn = ['十二', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一'];
    return cn[(h % 12)] + (m === 0 ? '点整' : '点半');
  }

  function renderViaState() {
    var el = document.getElementById('set-current');
    if (el) { el.textContent = '现在拨到：' + fmtTime(setCur.h, setCur.m); }
    var wrap = viewEl.querySelector('.clock-wrap');
    if (wrap) { M.renderClock(wrap, setCur.h, setCur.m, { onClick: dialClick }); }
    if (feedbackEl) { feedbackEl.textContent = ''; feedbackEl.className = 'quiz-feedback'; }
  }

  /* ±15 分钟快进/回退：分钟+15 进位 → 小时 +1（12→1），完整时间循环 */
  function stepSet(delta) {
    if (state.answered || state.over) { return; }
    var total = ((setCur.h % 12) * 60) + setCur.m + delta;
    while (total < 0) { total += 720; }
    total = total % 720;
    var hh = Math.floor(total / 60);
    setCur.h = hh === 0 ? 12 : hh;
    setCur.m = total % 60;
    renderViaState();
  }

  function checkSet() {
    if (state.answered || state.over) { return; }
    /* 分钟差 = 拨钟时间与目标时间的分钟距离（24 小时循环取近） */
    var a = ((setCur.h % 12) * 60) + setCur.m;
    var b = ((setTarget.h % 12) * 60) + setTarget.m;
    var d1 = Math.abs(a - b);
    var diff = Math.min(d1, 720 - d1);
    var ok = diff < 2.5; // 分钟差 <2.5 判对（吸附 5 分钟档 → 差 0）
    if (ok) {
      state.answered = true;
      state.correct += 1;
      M.store.profile.totalAnswer = (M.store.profile.totalAnswer || 0) + 1;
      M.store.profile.totalCorrect = (M.store.profile.totalCorrect || 0) + 1;
      feedbackEl.textContent = '✓ 太棒了！拨对了！';
      feedbackEl.className = 'quiz-feedback ok';
      M.saveStore();
      window.setTimeout(advance, 600);
    } else {
      setCur.tried += 1;
      if (setCur.tried >= 3) { // 最多重试 3 次后显示正确答案并判错
        state.answered = true;
        M.store.profile.totalAnswer = (M.store.profile.totalAnswer || 0) + 1;
        renderViaState();
        var wrap2 = viewEl.querySelector('.clock-wrap');
        if (wrap2) { M.renderClock(wrap2, setTarget.h, setTarget.m); }
        feedbackEl.textContent = '✗ 正确答案：' + fmtTime(setTarget.h, setTarget.m) +
          ' ' + cnTime(setTarget.h, setTarget.m);
        feedbackEl.className = 'quiz-feedback bad';
        M.saveStore();
        window.setTimeout(advance, 1400);
      } else { // 不判错，鼓励再试
        feedbackEl.textContent = '差 ' + diffText(diff) + '，再试试（还剩 ' +
          (3 - setCur.tried) + ' 次机会）';
        feedbackEl.className = 'quiz-feedback hint';
      }
    }
  }

  /* 分钟差 → 友好文案：≥60 分钟折成 "X 小时 Y 分钟" */
  function diffText(diff) {
    if (diff >= 60) {
      var h = Math.floor(diff / 60), mm = diff % 60;
      return h + ' 小时' + (mm ? ' ' + mm + ' 分钟' : '');
    }
    return diff + ' 分钟';
  }

  function advance() {
    state.idx += 1;
    state.answered = false;
    if (state.idx >= state.quiz.length) { finishQuiz(); }
    else { renderQuiz(); }
  }

  /* ============================================================
     结算（F4 打卡/星星/解锁、F5 成绩滚动 30 条）
     ============================================================ */
  function finishQuiz() {
    state.over = true;
    var total = state.quiz.length;
    var rate = Math.round(state.correct / total * 100);
    var t = M.todayStr();
    var dates = M.store.checkin.dates;
    if (dates[dates.length - 1] !== t) { dates.push(t); } // 完成即打卡
    while (dates.length > 365) { dates.shift(); }
    M.store.checkin.streak = M.calcStreak(dates);

    var stars = rate >= 100 ? 3 : rate >= 80 ? 2 : rate >= 60 ? 1 : 0; // 3★/2★/1★
    var oldStars = M.store.profile.stageStars[state.stage] || 0;
    if (stars > oldStars) { M.store.profile.stageStars[state.stage] = stars; }

    var unlocked = false; // 完成 ≥80% 解锁下一阶段
    if (rate >= 80 && state.stage < 3 && (M.store.unlockedStage || 1) < state.stage + 1) {
      M.store.unlockedStage = state.stage + 1;
      unlocked = true;
    }

    M.store.history.push({ date: t, stage: state.stage, rate: rate,
                           count: total, correct: state.correct, stars: stars });
    while (M.store.history.length > 30) { M.store.history.shift(); } // 滚动 30 条
    M.saveStore();
    renderResult(rate, total, stars, unlocked);
  }

  function renderResult(rate, total, stars, unlocked) {
    M.renderHeader('练习结果', M.backFromQuiz);
    M.clearNode(viewEl);
    viewEl.className = 'view';
    var mkStat = function (label, val) {
      var s = M.makeEl('div', 'result-stat');
      s.appendChild(M.makeEl('b', '', val));
      s.appendChild(M.makeEl('span', '', label));
      return s;
    };
    var card = M.makeEl('div', 'result-card');
    card.appendChild(M.makeEl('div', 'result-score', rate + '%'));
    card.appendChild(M.makeEl('div', 'result-stars', '★★★'.slice(0, stars)));
    var stats = M.makeEl('div', 'result-stats');
    stats.appendChild(mkStat('答对', state.correct + '/' + total));
    stats.appendChild(mkStat('阶段', STAGES[state.stage - 1].name));
    stats.appendChild(mkStat('打卡', (M.store.checkin.streak || 0) + '天'));
    card.appendChild(stats);
    var banner;
    if (unlocked) {
      banner = M.makeEl('div', 'result-banner ok',
        '🎉 过关！已解锁「' + STAGES[state.stage].name + '」阶段');
    } else if (rate >= 80) {
      banner = M.makeEl('div', 'result-banner ok', '✓ 过关（≥80%）');
    } else {
      banner = M.makeEl('div', 'result-banner bad',
        '再练一次 · 达到 80% 解锁下一阶段');
    }
    card.appendChild(banner);
    viewEl.appendChild(card);

    var row = M.makeEl('div', 'btn-row');
    var again = M.makeEl('button', 'btn', '再来一组');
    again.addEventListener('click', function () { startQuiz(state.stage); });
    var back = M.makeEl('button', 'btn btn-primary', '返回阶段选择');
    back.addEventListener('click', function () { M.backFromQuiz(); });
    row.appendChild(again);
    row.appendChild(back);
    viewEl.appendChild(row);
  }

  /* ---------- 导出到命名空间 ---------- */
  M.buildQuiz = buildQuiz;
})();