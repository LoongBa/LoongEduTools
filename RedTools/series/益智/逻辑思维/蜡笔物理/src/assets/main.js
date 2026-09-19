/* ============================================================
 * 蜡笔物理 — 入口 / 状态机 / 输入 / 音效 / 成绩打卡（main）
 * 依赖加载顺序：data.js → matter.min.js → poly-decomp.min.js
 *               → levels.js → physics.js → render.js → main.js
 * ============================================================ */
(function () {
  'use strict';
  var P = window.Physics, R = window.Render;
  var W = P.WORLD_W, H = P.WORLD_H;

  /* ---------- 常量 ---------- */
  var CRAYONS = [
    { name: '红', c: '#d9503f' },
    { name: '蓝', c: '#3f6fd9' },
    { name: '绿', c: '#4f9e4a' },
    { name: '紫', c: '#7a4fd9' },
    { name: '橙', c: '#e08a2e' },
    { name: '粉', c: '#d96a9c' }
  ];
  window.CRAYONS = CRAYONS;

  var STORE_KEY = 'redtools.wuli.v1';

  /* ---------- DOM ---------- */
  var view = document.getElementById('view');
  var header = document.getElementById('app-header');
  var footer = document.getElementById('app-footer');

  /* ---------- 状态 ---------- */
  var state = {
    view: 'home',          // home | game
    level: 0,
    drawing: null,         // { points: [] }
    erasing: false,
    eraseMode: false,
    currentColor: 0,
    won: false,
    startStamp: 0,
    now: 0,
    muted: false,
    audioCtx: null,
    toastTimer: null
  };

  /* ---------- 存储：成绩 + 打卡 ---------- */
  function loadStore() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
      s.best = s.best || {};
      s.checkin = s.checkin || { dates: [] };
      s.history = s.history || [];
      return s;
    } catch (e) { return { best: {}, checkin: { dates: [] }, history: [] }; }
  }
  function saveStore(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {} }

  function dateStr(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return '' + d.getFullYear() + (m < 10 ? '0' : '') + m + (day < 10 ? '0' : '') + day;
  }
  function calcStreak(dates) {
    if (!dates || !dates.length) return 0;
    var set = {};
    for (var i = 0; i < dates.length; i++) set[dates[i]] = true;
    var d = new Date();
    if (!set[dateStr(d)]) { d.setDate(d.getDate() - 1); }
    var streak = 0;
    while (set[dateStr(d)]) { streak++; d.setDate(d.getDate() - 1); }
    return streak;
  }
  function doCheckin(store) {
    var today = dateStr(new Date());
    if (store.checkin.dates.indexOf(today) < 0) store.checkin.dates.push(today);
    store.checkin.dates.sort();
    if (store.checkin.dates.length > 365) store.checkin.dates = store.checkin.dates.slice(-365);
    return calcStreak(store.checkin.dates);
  }

  /* ---------- 音效（Web Audio 合成，用户手势后启用） ---------- */
  function ensureAudio() {
    if (!state.audioCtx) {
      try { state.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    if (state.audioCtx && state.audioCtx.state === 'suspended') state.audioCtx.resume();
  }
  function tone(freq, t0, dur, type, vol) {
    if (state.muted || !state.audioCtx) return;
    type = type || 'triangle'; vol = vol || 0.16;
    var o = state.audioCtx.createOscillator();
    var g = state.audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    var t = state.audioCtx.currentTime + t0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(state.audioCtx.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function playWin() { tone(523.25, 0, 0.18); tone(659.25, 0.12, 0.18); tone(783.99, 0.24, 0.32); }
  function playErase() { tone(220, 0, 0.06, 'sine', 0.08); }
  function playSpawn() { tone(330, 0, 0.07, 'triangle', 0.08); }

  /* ---------- 提示（toast） ---------- */
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1800);
  }

  /* ---------- 星级（通关时画面残留笔画数） ---------- */
  function starsFor(strokes) {
    if (strokes <= 2) return 3;
    if (strokes <= 4) return 2;
    return 1;
  }
  function starHtml(n) {
    var s = '';
    for (var i = 0; i < 3; i++) s += i < n ? '★' : '☆';
    return s;
  }

  /* ============================================================
   * 视图：首页（选关）
   * ============================================================ */
  function renderHome() {
    state.view = 'home';
    var store = loadStore();
    var streak = calcStreak(store.checkin.dates);
    var html = '';
    html += '<div class="home-wrap">';
    html += '  <div class="home-title">🖍 蜡笔物理</div>';
    html += '  <div class="home-sub">画一笔变成木条，帮小球滚到星星</div>';
    html += '  <div class="level-grid">';
    for (var i = 0; i < window.LEVELS.length; i++) {
      var L = window.LEVELS[i];
      var best = store.best[L.id] || 0;
      html += '    <button class="level-card" data-level="' + i + '">';
      html += '      <span class="lc-no">' + L.id + '</span>';
      html += '      <span class="lc-name">' + L.name + '</span>';
      html += '      <span class="lc-stars">' + starHtml(best) + '</span>';
      html += '    </button>';
    }
    html += '  </div>';
    html += '  <div class="home-checkin">';
    html += '    <span class="ci-streak">🔥 连续打卡 ' + streak + ' 天</span>';
    html += '    <span class="ci-tip">完成任意一关即可打卡</span>';
    html += '  </div>';
    html += '</div>';
    view.innerHTML = html;
    header.innerHTML = '';
    footer.innerHTML = '';
    bindHome();
  }

  function bindHome() {
    var cards = view.querySelectorAll('.level-card');
    for (var i = 0; i < cards.length; i++) {
      cards[i].addEventListener('click', function () {
        enterLevel(Number(this.getAttribute('data-level')));
      });
    }
  }

  /* ============================================================
   * 视图：关卡页
   * ============================================================ */
  function enterLevel(idx) {
    state.view = 'game';
    state.level = idx;
    state.won = false;
    state.drawing = null;
    state.erasing = false;

    var L = window.LEVELS[idx];
    var html = '';
    html += '<div class="game-toolbar">';
    html += '  <button class="tb-btn" id="btnBack" title="返回选关">◀</button>';
    html += '  <div class="tb-title"><span id="lvlName">' + L.name + '</span><span class="tb-time" id="timeLabel">⏱ 0.0</span></div>';
    html += '  <div class="tb-tools">';
    html += '    <button class="tb-btn tb-palette-btn" id="btnPalette" title="颜色">🖍</button>';
    html += '    <button class="tb-btn" id="btnErase" title="橡皮擦（E）">🧽</button>';
    html += '    <button class="tb-btn" id="btnUndo" title="撤销上一笔（U）">↩</button>';
    html += '    <button class="tb-btn" id="btnReset" title="重置（空格）">↻</button>';
    html += '    <button class="tb-btn" id="btnMute" title="声音">🔊</button>';
    html += '  </div>';
    html += '</div>';
    html += '<div class="game-stage" id="stage">';
    html += '  <canvas id="game"></canvas>';
    html += '  <div class="palette-pop" id="palettePop" hidden>';
    for (var c = 0; c < CRAYONS.length; c++) {
      html += '    <button class="sw" data-color="' + c + '" style="background:' + CRAYONS[c].c + '" title="蜡笔颜色：' + CRAYONS[c].name + '"></button>';
    }
    html += '  </div>';
    html += '  <div class="hint" id="hint">' + L.hint + '</div>';
    html += '  <div class="toast" id="toast"></div>';
    html += '  <div class="win-overlay hidden" id="winOverlay">';
    html += '    <div class="win-card">';
    html += '      <div class="win-stars" id="winStars"></div>';
    html += '      <h2>过关啦！</h2>';
    html += '      <p id="winInfo"></p>';
    html += '      <p class="win-checkin" id="winCheckin"></p>';
    html += '      <div class="win-btns">';
    html += '        <button class="ghost" id="btnReplay">再玩一次</button>';
    html += '        <button id="btnNext">下一关</button>';
    html += '        <button class="ghost" id="btnHome">选关</button>';
    html += '      </div>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

    view.innerHTML = html;
    header.innerHTML = '';
    footer.innerHTML = '按住手指/鼠标画一条线，松开变成木条 · 空格重置 · U 撤销 · E 橡皮 · 让小球碰到星星';

    setupGameView();
    P.buildLevel(idx);
    R.bakeStaticLayer();
    state.startStamp = performance.now();
    P.setOnWin(handleWin);
    bindGameUI();
    resizeCanvas();
  }

  /* ---------- 画布等比缩放 ---------- */
  function resizeCanvas() {
    var stage = document.getElementById('stage');
    var canvas = document.getElementById('game');
    if (!stage || !canvas) return;
    var r = stage.getBoundingClientRect();
    var scale = Math.min(r.width / W, r.height / H);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = Math.round(W * scale) + 'px';
    canvas.style.height = Math.round(H * scale) + 'px';
  }

  function toWorld(e) {
    var canvas = document.getElementById('game');
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) / rect.width * W;
    var y = (e.clientY - rect.top) / rect.height * H;
    return {
      x: Math.max(0, Math.min(W, x)),
      y: Math.max(0, Math.min(H, y))
    };
  }

  /* ---------- 输入 ---------- */
  function setupGameView() {
    var canvas = document.getElementById('game');
    R.init(canvas);

    canvas.addEventListener('pointerdown', function (e) {
      ensureAudio();
      var p = toWorld(e);
      if (e.button === 2 || state.eraseMode) {
        state.erasing = true;
        P.eraseAt(p.x, p.y, P.ERASE_R);
        if (e.pointerType === 'mouse') canvas.setPointerCapture(e.pointerId);
      } else {
        state.drawing = { points: [p] };
        if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
      }
    });

    canvas.addEventListener('pointermove', function (e) {
      var p = toWorld(e);
      if (state.drawing) {
        var last = state.drawing.points[state.drawing.points.length - 1];
        var dx = p.x - last.x, dy = p.y - last.y;
        if (dx * dx + dy * dy > 9) state.drawing.points.push(p);
      } else if (state.erasing) {
        P.eraseAt(p.x, p.y, P.ERASE_R);
      }
    });

    canvas.addEventListener('pointerup', endStroke);
    canvas.addEventListener('pointercancel', endStroke);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  function endStroke() {
    if (state.drawing) {
      var pts = state.drawing.points;
      state.drawing = null;
      if (pts.length >= 3) {
        var body = P.strokeToBody(pts, state.currentColor);
        if (body) {
          R.bakeDrawnSprite(body);
          playSpawn();
        } else {
          toast('这一笔太小啦，再画长一点试试');
        }
      }
    } else if (state.erasing) {
      state.erasing = false;
    }
  }

  /* ---------- UI 绑定 ---------- */
  function bindGameUI() {
    var btnBack = document.getElementById('btnBack');
    var btnErase = document.getElementById('btnErase');
    var btnUndo = document.getElementById('btnUndo');
    var btnReset = document.getElementById('btnReset');
    var btnMute = document.getElementById('btnMute');
    var btnPalette = document.getElementById('btnPalette');
    var palettePop = document.getElementById('palettePop');
    var btnReplay = document.getElementById('btnReplay');
    var btnNext = document.getElementById('btnNext');
    var btnHome = document.getElementById('btnHome');

    btnBack.addEventListener('click', renderHome);
    btnErase.addEventListener('click', function () {
      state.eraseMode = !state.eraseMode;
      this.classList.toggle('on', state.eraseMode);
      if (state.eraseMode) toast('橡皮擦模式：按住拖动擦除');
      else toast('返回画笔模式');
    });
    btnUndo.addEventListener('click', function () { P.undoLast(); });
    btnReset.addEventListener('click', function () { enterLevel(state.level); });
    btnMute.addEventListener('click', function () {
      state.muted = !state.muted;
      this.textContent = state.muted ? '🔇' : '🔊';
    });
    btnPalette.addEventListener('click', function () {
      var show = palettePop.hasAttribute('hidden');
      if (show) palettePop.removeAttribute('hidden');
      else palettePop.setAttribute('hidden', '');
    });
    var sws = palettePop.querySelectorAll('.sw');
    for (var i = 0; i < sws.length; i++) {
      sws[i].addEventListener('click', function () {
        state.currentColor = Number(this.getAttribute('data-color'));
        palettePop.setAttribute('hidden', '');
      });
    }
    btnReplay.addEventListener('click', function () { enterLevel(state.level); });
    btnNext.addEventListener('click', function () {
      var next = (state.level + 1) % window.LEVELS.length;
      enterLevel(next);
    });
    btnHome.addEventListener('click', renderHome);
  }

  /* ---------- 键盘 ---------- */
  function onKey(e) {
    if (state.view !== 'game') {
      // 首页：数字键直达关卡
      if (e.key >= '1' && e.key <= '9') {
        var idx = Number(e.key) - 1;
        if (idx < window.LEVELS.length) { enterLevel(idx); e.preventDefault(); }
      }
      return;
    }
    if (e.code === 'Space') { e.preventDefault(); enterLevel(state.level); }
    else if (e.key === 'u' || e.key === 'U') P.undoLast();
    else if (e.key === 'e' || e.key === 'E') {
      var be = document.getElementById('btnErase');
      state.eraseMode = !state.eraseMode;
      if (be) be.classList.toggle('on', state.eraseMode);
    }
    else if (e.key === 'Escape') renderHome();
    else if (e.key >= '1' && e.key <= '9') {
      var i2 = Number(e.key) - 1;
      if (i2 < window.LEVELS.length) enterLevel(i2);
    }
    else if (e.key === '0' && window.LEVELS.length >= 10) enterLevel(9);
  }

  /* ---------- 过关 ---------- */
  function handleWin() {
    if (state.won) return;
    state.won = true;
    playWin();
    var star = P.star;
    R.burst(star.position.x, star.position.y);

    var strokes = P.drawnBodies.length;
    var stars = starsFor(strokes);
    var ms = performance.now() - state.startStamp;
    var sec = (ms / 1000).toFixed(1);
    var store = loadStore();
    if (!store.best[window.LEVELS[state.level].id] || stars > store.best[window.LEVELS[state.level].id]) {
      store.best[window.LEVELS[state.level].id] = stars;
    }
    var streak = doCheckin(store);
    store.history.unshift({
      date: dateStr(new Date()), level: state.level + 1,
      stars: stars, strokes: strokes, ms: Math.round(ms)
    });
    if (store.history.length > 30) store.history = store.history.slice(0, 30);
    saveStore(store);

    var winStars = document.getElementById('winStars');
    var winInfo = document.getElementById('winInfo');
    var winCheckin = document.getElementById('winCheckin');
    var overlay = document.getElementById('winOverlay');
    if (winStars) winStars.textContent = starHtml(stars);
    if (winInfo) winInfo.textContent = '用时 ' + sec + ' 秒 · 画了 ' + strokes + ' 笔';
    if (winCheckin) winCheckin.textContent = '✅ 今日已打卡 · 连续 ' + streak + ' 天';
    if (overlay) overlay.classList.remove('hidden');
  }

  /* ---------- 主循环 ---------- */
  var acc = 0, lastT = 0;
  var STEP = 1000 / 120;   // 120Hz 子步进：高速小球不穿透 12px 薄板（60Hz 时 800px/s≈13px/帧 > 板厚）
  var worldWasStarted = false;

  function loop(t) {
    requestAnimationFrame(loop);
    if (!lastT) lastT = t;
    var dt = Math.min(t - lastT, 50);
    lastT = t;
    acc += dt;
    // 世界冻结直到玩家画出第一笔（球等待搭建），之后正常 120Hz 步进
    if (P.engine && P.worldStarted) {
      if (!worldWasStarted) acc = 0;   // 世界刚启动：清空冻结期累积时间，防止一帧补跑（球瞬移+碰撞能量全丢）
      worldWasStarted = true;
      while (acc >= STEP) {
        window.Matter.Engine.update(P.engine, STEP);
        acc -= STEP;
      }
    } else {
      worldWasStarted = false;
    }

    var res = P.update(performance.now());
    if (res === 'ball_fell' && state.view === 'game' && !state.won) {
      toast('小球掉下去啦，重新开始');
      enterLevel(state.level);
      return;
    }

    R.updateParticles();

    if (state.view === 'game') {
      // 计时显示
      var tl = document.getElementById('timeLabel');
      if (tl && !state.won) {
        tl.textContent = '⏱ ' + ((performance.now() - state.startStamp) / 1000).toFixed(1);
      }
      R.render(performance.now(), state.drawing, CRAYONS[state.currentColor].c);
    }
  }

  /* ---------- 启动 ---------- */
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', function () {
    if (state.view === 'game') resizeCanvas();
  });
  renderHome();
  requestAnimationFrame(loop);
})();
