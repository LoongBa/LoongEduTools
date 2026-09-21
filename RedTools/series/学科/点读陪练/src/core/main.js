/* ============================================================
   点读陪练 — core/main.js（主流程，双模式共用）
   ------------------------------------------------------------
   职责：消费 APP_DATA.content + LX_SHARED 公共模块，实现练习闭环
   - 单元选择（content 列表）→ 词汇/句型卡 4 选 1 → 即时反馈 → 完成打卡
   - 存储：LX_SHARED.storage（offline=localStorage / online=云端桩）
   - 打卡：LX_SHARED.progress
   - 认证：LX_SHARED.auth（offline 恒授权；online 查桩）
   访问约束（oracle 审核）：LX_SHARED.* 一律属性查找，禁止捕获引用
   ES2017 经典脚本；Chrome 61 兼容
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {}, content: [] };
  var LXS = window.LX_SHARED;           // 命名空间引用（模块内部属性每次实时取）
  var GEN = (window.LX_CORE && window.LX_CORE.generators) || {};

  var STORE_KEY = 'v1';
  var store = null;

  /* ---------- DOM ---------- */
  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');
  var footerEl = document.getElementById('app-footer');
  var overlay = null;

  /* ---------- 状态 ---------- */
  var state = { unitId: null, items: [], idx: 0, correct: 0, total: 0, errors: 0 };

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

  /* ---------- 存储（走 LX_SHARED.storage，schema-agnostic 透传） ---------- */
  function loadStore() {
    var s = LXS.storage.get(STORE_KEY);
    if (s) { return s; }
    return { version: 1, checkin: { dates: [], streak: 0 }, history: [] };
  }
  function saveStore() {
    LXS.storage.set(STORE_KEY, store);
    LXS.storage.sync(store);  // 在线模式：数据最小化上行
  }

  /* ---------- 认证门控 ---------- */
  function authGate(next) {
    var st = LXS.auth.status();
    if (st && st.authorized) { next(); return; }
    // 未授权（在线桩场景）：弹解锁引导
    var ov = LXS.uikit.overlay({
      title: '完整版需要授权',
      sub: '本单元为完整版内容，请输入产品授权口令解锁',
      btns: [
        { text: '输入口令', cls: 'btn-main', act: function () {
            if (ov) { ov.close(); }
            LXS.auth.activate('', prompt('请输入产品授权口令', '') || '');
            authGate(next);
          } },
        { text: '返回', cls: 'btn-ghost', act: function () { if (ov) { ov.close(); } showUnitList(); } }
      ]
    });
  }

  /* ---------- 渲染：头部 ---------- */
  function renderHeader(title) {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    brand.appendChild(makeEl('span', 'header-title', title || (APP.meta.name || '英语点读陪练')));
    if (APP.meta.version) {
      brand.appendChild(makeEl('span', 'header-ver', 'v' + APP.meta.version + ' · ' + APP.meta.mode));
    }
    headerEl.appendChild(brand);
  }

  /* ---------- 渲染：单元列表 ---------- */
  function showUnitList() {
    renderHeader();
    clearNode(viewEl);
    var content = APP.content || [];
    viewEl.appendChild(makeEl('div', 'page-title', '选择单元'));
    viewEl.appendChild(makeEl('div', 'home-hint', '共 ' + content.length + ' 个单元' +
      (APP.meta.mode === 'offline' ? '（离线免费试学前 ' + (APP.meta.free_units || 0) + ' 单元，完整版在在线版）' : '')));
    var list = makeEl('div', 'diff-list');
    for (var i = 0; i < content.length; i++) {
      (function (u) {
        var btn = makeEl('button', 'diff-btn');
        var head = makeEl('span', 'diff-head', u.title);
        var sub = makeEl('span', 'diff-sub', u.theme + ' · ' + (u.items || []).length + ' 条目');
        btn.appendChild(head);
        btn.appendChild(sub);
        btn.addEventListener('click', function () { startUnit(u.id); });
        list.appendChild(btn);
      })(content[i]);
    }
    viewEl.appendChild(list);
    // 页脚：离线版引导在线入口 / 在线版按授权状态显示
    clearNode(footerEl);
    if (APP.meta.mode === 'offline') {
      footerEl.appendChild(makeEl('div', 'online-guide', '🔗 完整版 · 在线练习（全单元解锁）'));
    } else {
      var authSt = LXS.auth.status();
      if (authSt && authSt.authorized) {
        footerEl.appendChild(makeEl('div', 'online-guide', '✓ 完整版已解锁'));
      } else {
        footerEl.appendChild(makeEl('div', 'online-guide', '🔒 未授权 · 输入口令解锁完整版'));
      }
    }
  }

  /* ---------- 开始单元（认证门控 + 出题） ---------- */
  function startUnit(unitId) {
    authGate(function () {
      var unit = null;
      for (var i = 0; i < (APP.content || []).length; i++) {
        if (APP.content[i].id === unitId) { unit = APP.content[i]; break; }
      }
      if (!unit) { return; }
      state.unitId = unitId;
      state.items = unit.items || [];
      state.idx = 0;
      state.correct = 0;
      state.errors = 0;
      state.total = state.items.length;
      renderQuiz();
    });
  }

  /* ---------- 渲染：答题卡 ---------- */
  function renderQuiz() {
    renderHeader(state.unitId);
    clearNode(viewEl);
    if (state.idx >= state.total) { finishQuiz(); return; }
    var q = GEN.genQuestion(state.items, null);
    if (!q) { finishQuiz(); return; }

    var topbar = makeEl('div', 'topbar');
    topbar.appendChild(makeEl('span', 'level-title', '第 ' + (state.idx + 1) + '/' + state.total + ' 题'));
    topbar.appendChild(makeEl('span', 'top-timer', '✅ ' + state.correct));
    viewEl.appendChild(topbar);

    viewEl.appendChild(makeEl('div', 'pc-round', (q.type === 'vocab' ? '📖 ' : '💬 ') + q.q));
    viewEl.appendChild(makeEl('div', 'game-status', '选出正确的中文意思'));

    var list = makeEl('div', 'diff-list');
    for (var i = 0; i < q.options.length; i++) {
      (function (opt) {
        var btn = makeEl('button', 'diff-btn');
        btn.appendChild(makeEl('span', 'diff-head', opt));
        btn.addEventListener('click', function () {
          if (opt === q.correct) {
            state.correct++;
            btn.className = 'diff-btn correct';
            LXS.uikit.toast('✓ 答对了');
            setTimeout(function () {
              state.idx++;
              renderQuiz();
            }, 600);
          } else {
            state.errors++;
            btn.className = 'diff-btn wrong';
            LXS.uikit.toast('再想想 ~');
          }
        });
        list.appendChild(btn);
      })(q.options[i]);
    }
    viewEl.appendChild(list);
  }

  /* ---------- 结算 ---------- */
  function finishQuiz() {
    renderHeader(state.unitId);
    clearNode(viewEl);
    var rate = state.total ? Math.round(state.correct / state.total * 100) : 0;
    // 打卡（LX_SHARED.progress）
    LXS.progress.checkin(store);
    store.history.push({ date: new Date().toISOString().slice(0, 10), unit: state.unitId, rate: rate, errors: state.errors });
    while (store.history.length > 30) { store.history.shift(); }
    saveStore();

    var stars = rate >= 100 ? 3 : (rate >= 80 ? 2 : 1);
    overlay = LXS.uikit.overlay({
      title: '🎉 完成！',
      sub: '正确率 ' + rate + '% · 错误 ' + state.errors + ' 次',
      stars: stars,
      notes: [{ cls: 'checkin-line', text: '✅ 今日已打卡 · 连续 ' + (store.checkin.streak || 0) + ' 天' }],
      btns: [
        { text: '再来一局', cls: 'btn-main', act: function () {
            if (overlay) { overlay.close(); }
            state.idx = 0; state.correct = 0; state.errors = 0;
            renderQuiz();
          } },
        { text: '选单元', cls: 'btn-ghost', act: function () { if (overlay) { overlay.close(); } showUnitList(); } }
      ]
    });
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

  // 存储初始化（工具名 → STORE_KEY 前缀 redtools.点读陪练.v1）
  if (LXS.storage.configure) { LXS.storage.configure({ toolName: APP.meta.tool || '点读陪练' }); }
  store = loadStore();
  saveStore();
  showUnitList();
})();