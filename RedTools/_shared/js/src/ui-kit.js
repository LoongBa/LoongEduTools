/* ============================================================
   LX_SHARED.uikit — 通用 UI 组件（统一风格，无排行榜 UI）
   ------------------------------------------------------------
   依据：指导原则 §4.1 练习形态（打勾/进度条/徽章）；无社交/排行
   组件：
   - btn(text, cls)          按钮（btn-main/btn-ghost/btn-ghost-sm）
   - badge(text)             徽章
   - overlay({title,sub,stars,btns,notes})  结算浮层（星级/打卡/按钮）
   - toast(msg)              轻提示
   - progressBar(ratio)      进度条（返回元素）
   - starsText(n)            ★★★ 文本（n=0..3）
   依赖：无（纯 DOM 工具，Chrome 61）
   说明：feedback（即时正反馈 UI）仍内联于各工具 main.js，B 批再抽
   ============================================================ */
(function () {
  'use strict';

  var U = {};

  /* ---------- 基础工具 ---------- */
  function makeEl(tag, className, text) {
    var el = document.createElement(tag);
    if (className) { el.className = className; }
    if (text !== undefined && text !== null) { el.textContent = text; }
    return el;
  }

  /* ---------- 星级文本 ---------- */
  function starsText(n) {
    var s = '';
    for (var i = 0; i < 3; i++) { s += (i < n) ? '★' : '☆'; }
    return s;
  }

  /* ---------- 按钮 ---------- */
  function btn(text, cls, onClick) {
    var b = makeEl('button', cls || 'btn-ghost', text);
    if (onClick) { b.addEventListener('click', onClick); }
    return b;
  }

  /* ---------- 徽章 ---------- */
  function badge(text) {
    return makeEl('span', 'lx-badge', text);
  }

  /* ---------- 进度条 ---------- */
  function progressBar(ratio, label) {
    var wrap = makeEl('div', 'lx-progress');
    var fill = makeEl('div', 'lx-progress-fill');
    fill.style.width = Math.max(0, Math.min(100, (ratio || 0) * 100)) + '%';
    wrap.appendChild(fill);
    if (label) {
      wrap.appendChild(makeEl('span', 'lx-progress-label', label));
    }
    return wrap;
  }

  /* ---------- 轻提示 ---------- */
  function toast(msg, ms) {
    var t = makeEl('div', 'lx-toast', msg);
    document.body.appendChild(t);
    setTimeout(function () {
      if (t.parentNode) { t.parentNode.removeChild(t); }
    }, ms || 1500);
  }

  /* ---------- 结算浮层 ---------- */
  function overlay(opts) {
    if (!opts) { return null; }
    var ov = makeEl('div', 'lx-overlay');
    var card = makeEl('div', 'lx-overlay-card');
    card.appendChild(makeEl('div', 'lx-overlay-title', opts.title || ''));
    if (opts.sub) { card.appendChild(makeEl('div', 'lx-overlay-sub', opts.sub)); }
    var sum = makeEl('div', 'lx-overlay-summary');
    if (opts.stars) {
      sum.appendChild(makeEl('div', 'lx-stars', starsText(opts.stars)));
    }
    if (opts.notes) {
      for (var i = 0; i < opts.notes.length; i++) {
        sum.appendChild(makeEl('div', opts.notes[i].cls || 'lx-note', opts.notes[i].text));
      }
    }
    card.appendChild(sum);
    if (opts.btns) {
      var box = makeEl('div', 'lx-overlay-btns');
      for (var j = 0; j < opts.btns.length; j++) {
        box.appendChild(btn(opts.btns[j].text, opts.btns[j].cls, opts.btns[j].act));
      }
      card.appendChild(box);
    }
    ov.appendChild(card);
    document.body.appendChild(ov);
    // 返回 { el, close }
    return {
      el: ov,
      close: function () {
        if (ov.parentNode) { ov.parentNode.removeChild(ov); }
      }
    };
  }

  /* ---------- 对外 API ---------- */
  U.btn = btn;
  U.badge = badge;
  U.overlay = overlay;
  U.toast = toast;
  U.progressBar = progressBar;
  U.starsText = starsText;
  U.makeEl = makeEl;

  /* ---------- 注册 ---------- */
  if (window.LX_SHARED && window.LX_SHARED.register) {
    window.LX_SHARED.register('uikit', U);
  } else {
    window.LX_SHARED = window.LX_SHARED || {};
    window.LX_SHARED.uikit = U;
  }
})();