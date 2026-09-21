/* ============================================================
   涂色练习 — 视图层（ES2017 经典脚本，Chrome 61 基线）
   持久化 / 首页 / 选图 / 填色页 / 作品集 / 打卡 / 家长面板；
   线稿与填色引擎见 coloring.js（window.ColorApp 命名空间桥接）
   约束：无 import/export、不超 ES2017、事件全 addEventListener
   ============================================================ */
(function () {
  'use strict';

  var M = window.ColorApp = window.ColorApp || {};
  var APP = window.APP_DATA || { meta: {} };
  var headerEl = document.getElementById('app-header');
  var viewEl = M.viewEl = document.getElementById('view');
  var headerTaps = 0, headerTapTimer = null;

  /* ---------- 持久化（redtools.color.v1） ---------- */
  var STORE_KEY = 'redtools.color.v1';
  LX_SHARED.storage.configure({ toolName: 'color' });  // V0.4 迁移：键前缀 redtools.color.v1
  M.STORE_KEY = STORE_KEY;
  function defaultStore() {
    return { version: 1, works: {}, // themeId → { date, colors }
      checkin: { dates: [], streak: 0 }, history: [] };
  }
  function loadStore() {
    var st = defaultStore();
    try {
      var data = LX_SHARED.storage.get('v1');
      if (data && typeof data === 'object') {
        if (data.works) { st.works = data.works; }
        if (data.checkin && data.checkin.dates) { st.checkin = data.checkin; }
        if (data.history) { st.history = data.history; }
      }
    } catch (err) { /* 解析失败用默认结构 */ }
    return st;
  }
  function saveStore() {
    try { LX_SHARED.storage.set('v1', store); } catch (err) { /* ignore */ }
  }
  var store = M.store = loadStore();
  saveStore();
  M.saveStore = saveStore;

  /* ---------- 工具 ---------- */
  function clearNode(node) { while (node.firstChild) { node.removeChild(node.firstChild); } }
  function makeEl(tag, className, text) {
    var el = document.createElement(tag);
    if (className) { el.className = className; }
    if (text !== undefined && text !== null) { el.textContent = text; }
    return el;
  }
  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function todayStr() { var d = new Date(); return '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()); }
  function dateStr(d) { return '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()); }
  function calcStreak(dates) {
    return LX_SHARED.progress.streak(dates);
}
  M.makeEl = makeEl; M.clearNode = clearNode;
  M.todayStr = todayStr; M.dateStr = dateStr; M.calcStreak = calcStreak;

  /* ---------- 顶栏 ---------- */
  function renderHeader(title, backFn) {
    clearNode(headerEl);
    if (backFn) {
      var back = makeEl('button', 'header-back', '‹');
      back.addEventListener('click', backFn);
      headerEl.appendChild(back);
    }
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = ''; icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var t = makeEl('span', 'header-title', title || (APP.meta && APP.meta.name) || '涂色练习');
    brand.appendChild(t);
    var onTitleTap = function () {
      headerTaps += 1;
      if (headerTapTimer) { clearTimeout(headerTapTimer); }
      headerTapTimer = setTimeout(function () { headerTaps = 0; }, 5000);
      if (headerTaps >= 5) {
        headerTaps = 0;
        if (headerTapTimer) { clearTimeout(headerTapTimer); }
        viewParent();
      }
    };
    t.addEventListener('touchstart', onTitleTap);
    t.addEventListener('mousedown', onTitleTap);
    if (APP.meta && APP.meta.version) { brand.appendChild(makeEl('span', 'header-ver', 'v' + APP.meta.version)); }
    headerEl.appendChild(brand);
  }
  M.renderHeader = renderHeader;

  /* ---------- 首页 ---------- */
  function viewHome() {
    renderHeader();
    clearNode(viewEl);
    viewEl.className = 'view home';
    var done = Object.keys(store.works).length;
    var prog = makeEl('div', 'home-progress');
    prog.appendChild(makeEl('span', '', '已涂作品 '));
    prog.appendChild(makeEl('b', '', '' + done));
    prog.appendChild(makeEl('span', '', ' 幅　·　连续打卡 '));
    prog.appendChild(makeEl('b', '', '' + (store.checkin.streak || 0)));
    prog.appendChild(makeEl('span', '', ' 天'));
    viewEl.appendChild(prog);
    var list = makeEl('div', 'entry-list');
    var entries = [
      { icon: '🎨', name: '开始涂色', desc: '选一幅线稿，自由配色', fn: function () { viewGallery(); } },
      { icon: '🖼️', name: '作品集', desc: '看已涂的作品', fn: function () { viewWorks(); } }
    ];
    entries.forEach(function (e) {
      var item = makeEl('div', 'entry-item');
      item.appendChild(makeEl('div', 'entry-icon', e.icon));
      var txt = makeEl('div', 'entry-text');
      txt.appendChild(makeEl('div', 'entry-name', e.name));
      txt.appendChild(makeEl('div', 'entry-desc', e.desc));
      item.appendChild(txt);
      item.appendChild(makeEl('div', 'entry-arrow', '›'));
      item.addEventListener('click', e.fn);
      list.appendChild(item);
    });
    viewEl.appendChild(list);
    renderFooterNav();
  }

  /* ---------- 选图（6 主题网格） ---------- */
  function viewGallery() {
    renderHeader('开始涂色', function () { viewHome(); });
    clearNode(viewEl);
    viewEl.className = 'view';
    viewEl.appendChild(makeEl('div', 'page-title', '选一幅来涂色'));
    var grid = makeEl('div', 'theme-grid');
    M.THEMES.forEach(function (t) {
      var box = makeEl('div', 'theme-cell');
      var saved = store.works[t.id];
      var thumb = M.renderThumb(t, saved ? saved.colors : {});
      thumbsMakeClickable(thumb, t, saved);
      box.appendChild(thumb);
      box.appendChild(makeEl('div', 'theme-name', t.name + (saved ? ' ✨' : '')));
      grid.appendChild(box);
    });
    viewEl.appendChild(grid);
    renderFooterNav();
  }
  function thumbsMakeClickable(thumb, t, saved) {
    var wrap = thumb.firstChild;
    if (wrap) {
      wrap.addEventListener('click', function () { viewColor(t.id); });
    }
  }
  function viewWorks() {
    renderHeader('作品集', function () { viewHome(); });
    clearNode(viewEl);
    viewEl.className = 'view';
    var keys = Object.keys(store.works);
    if (!keys.length) {
      viewEl.appendChild(makeEl('div', 'page-title', '还没有作品，先去涂一幅吧！🎨'));
      renderFooterNav();
      return;
    }
    var grid = makeEl('div', 'theme-grid');
    keys.forEach(function (tid) {
      var t = M.themeMap[tid];
      if (!t) { return; }
      var box = makeEl('div', 'theme-cell');
      var thumb = M.renderThumb(t, store.works[tid].colors);
      thumbsMakeClickable(thumb, t, store.works[tid]);
      box.appendChild(thumb);
      box.appendChild(makeEl('div', 'theme-name', t.name));
      grid.appendChild(box);
    });
    viewEl.appendChild(grid);
    renderFooterNav();
  }

  /* ---------- 填色页 ---------- */
  var curColor = null;
  function viewColor(themeId) {
    var t = M.themeMap[themeId];
    if (!t) { viewGallery(); return; }
    var colors = {};
    var saved = store.works[themeId];
    if (saved && saved.colors) {
      for (var k in saved.colors) { if (saved.colors.hasOwnProperty(k)) { colors[k] = saved.colors[k]; } }
    }
    curColor = null;
    renderHeader(t.name, function () { viewGallery(); });
    clearNode(viewEl);
    viewEl.className = 'view';

    function updateProgress() {
      var doneN = M.paintCount(t, colors);
      var el = document.getElementById('color-progress');
      if (el) {
        el.textContent = '已涂 ' + doneN + ' / ' + t.parts.length + ' 块' +
          (doneN === t.parts.length ? ' · 完成啦！🎉' : '');
      }
    }

    // 进度条
    var prog = makeEl('div', 'color-progress');
    prog.id = 'color-progress';
    viewEl.appendChild(prog);

    // 线稿
    var art = M.renderArt(t, colors, { clickable: true });
    art.firstChild.addEventListener('click', function (e) {
      var target = e.target;
      while (target && target.getAttribute && target.getAttribute('data-id') === null) {
        target = target.parentNode;
      }
      if (target && target.getAttribute('data-id') && curColor) {
        var pid = target.getAttribute('data-id');
        colors[pid] = curColor;
        // 重新渲染部分：更新该 g 内所有子 shape fill
        var shapes = target.querySelectorAll('*');
        for (var i = 0; i < shapes.length; i++) {
          shapes[i].setAttribute('fill', curColor);
        }
        target.setAttribute('fill', curColor);
        updateProgress();
        saveWork(themeId, colors);
        if (M.isComplete(t, colors)) { onComplete(themeId, colors); }
      }
    });
    viewEl.appendChild(art);

    // 调色板
    var pal = makeEl('div', 'palette');
    M.PALETTE.forEach(function (c) {
      var sw = makeEl('button', 'swatch', '');
      sw.style.background = c;
      sw.dataset.color = c;
      sw.addEventListener('click', function () { curColor = c; markActive(sw); });
      pal.appendChild(sw);
    });
    // 橡皮（擦除恢复白色）
    var er = makeEl('button', 'swatch eraser', '🧽');
    er.style.background = '#ffffff';
    er.style.border = '2px dashed #c9cdd4';
    er.dataset.color = M.ERASER;
    er.addEventListener('click', function () { er.textContent = '🧽'; curColor = M.ERASER; markActive(er); });
    pal.appendChild(er);
    viewEl.appendChild(pal);

    updateProgress();
  }

  function markActive(sw) {
    var sws = document.querySelectorAll('.swatch');
    for (var i = 0; i < sws.length; i++) { sws[i].className = 'swatch'; }
    sw.className = 'swatch active';
  }
  function saveWork(themeId, colors) {
    store.works[themeId] = { date: todayStr(), colors: JSON.parse(JSON.stringify(colors)) };
    M.saveStore();
  }
  function onComplete(themeId, colors) {
    // 完成即打卡（当日仅一次）+ 记录
    var t = M.themeMap[themeId];
    var tday = todayStr();
    var dates = store.checkin.dates;
    if (dates[dates.length - 1] !== tday) {
      dates.push(tday);
      store.checkin.streak = M.calcStreak(dates);
      store.history.push({ date: tday, theme: t.name, blocks: t.parts.length });
      if (store.history.length > 30) { store.history.shift(); }
      M.saveStore();
    }
    var progEl = document.getElementById('color-progress');
    if (progEl && progEl.textContent.indexOf('完成啦') === -1) {
      progEl.textContent = '已涂 ' + t.parts.length + ' / ' + t.parts.length + ' 块 · 完成啦！🎉' +
        (dates[dates.length - 1] === tday && store.checkin.streak ? ' 打卡 ' + store.checkin.streak + ' 天' : '');
    }
  }

  /* ---------- 打卡日历 ---------- */
  function viewCheckin() {
    renderHeader('打卡日历');
    clearNode(viewEl);
    viewEl.className = 'view';
    var card = makeEl('div', 'calendar');
    card.appendChild(makeEl('div', 'page-title', '本月打卡'));
    var grid = makeEl('div', 'calendar-grid');
    var now = new Date();
    var days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var t = todayStr(), dates = store.checkin.dates;
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
    viewEl.appendChild(card);
    renderFooterNav();
  }

  /* ---------- 家长面板 ---------- */
  function viewParent() {
    renderHeader('家长面板', function () { viewHome(); });
    clearNode(viewEl);
    viewEl.className = 'view';
    var mkStat = function (label, val) {
      var s = makeEl('div', 'result-stat');
      s.appendChild(makeEl('b', '', val));
      s.appendChild(makeEl('span', '', label));
      return s;
    };
    var card = makeEl('div', 'result-card');
    card.appendChild(makeEl('div', 'page-title', '总览'));
    var stats = makeEl('div', 'result-stats');
    stats.appendChild(mkStat('累计打卡', (store.checkin.dates.length) + ' 天'));
    stats.appendChild(mkStat('连续打卡', (store.checkin.streak || 0) + ' 天'));
    stats.appendChild(mkStat('完成作品', '' + Object.keys(store.works).length));
    card.appendChild(stats);
    viewEl.appendChild(card);

    var clearBtn = makeEl('button', 'btn', '清除所有数据');
    clearBtn.style.marginTop = '16px';
    clearBtn.style.color = '#f5222d';
    clearBtn.addEventListener('click', function () {
      if (window.confirm('确定清除所有作品与数据？此操作不可恢复。')) {
        LX_SHARED.storage.remove('v1');
        store = M.store = loadStore();
        saveStore();
        viewHome();
      }
    });
    viewEl.appendChild(clearBtn);
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
    nav.appendChild(mk('打卡日历', function () { viewCheckin(); }));
    nav.appendChild(mk('首页', function () { viewHome(); }));
    foot.appendChild(nav);
  }

  /* ---------- 启动 ---------- */
  function syncAppHeight() {
    var docEl = document.documentElement;
    docEl.style.setProperty('--app-height', (window.innerHeight || docEl.clientHeight) + 'px');
  }
  if (window.addEventListener) { window.addEventListener('resize', syncAppHeight); }
  syncAppHeight();
  viewHome();
})();