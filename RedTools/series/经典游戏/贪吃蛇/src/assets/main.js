/* ============================================================
   贪吃蛇 — main：启动 init / 输入绑定（键盘+触屏+方向按钮）/ resize
   依赖：core、audio、game、guard、share、ui（全部已加载）。
   挂载：window.SnakeApp.main
   ============================================================ */
(function () {
  'use strict';
  var core = window.SnakeApp.core;
  var game = window.SnakeApp.game;
  var ui = window.SnakeApp.ui;

  var SWIPE = 24;                        // 滑动判定阈值 px
  var touchStart = { x: 0, y: 0 };

  /* ---------- 键盘（方向键 + WASD + 空格暂停） ---------- */
  function onKeyDown(e) {
    var kc = e.keyCode || e.which;
    if (kc === 37 || kc === 65) { e.preventDefault(); game.setDirection('left'); }
    else if (kc === 38 || kc === 87) { e.preventDefault(); game.setDirection('up'); }
    else if (kc === 39 || kc === 68) { e.preventDefault(); game.setDirection('right'); }
    else if (kc === 40 || kc === 83) { e.preventDefault(); game.setDirection('down'); }
    else if (kc === 32) { e.preventDefault(); game.togglePause(); }
  }

  /* ---------- 触屏滑动（|dx|>|dy| 判水平，阈值 24px） ---------- */
  function onTouchStart(e) {
    var t = e.touches && e.touches[0];
    if (!t) { return; }
    touchStart.x = t.clientX;
    touchStart.y = t.clientY;
  }
  function onTouchEnd(e) {
    var t = e.changedTouches && e.changedTouches[0];
    if (!t) { return; }
    var dx = t.clientX - touchStart.x;
    var dy = t.clientY - touchStart.y;
    if (Math.abs(dx) < SWIPE && Math.abs(dy) < SWIPE) { return; }   // 防误触
    var dir;
    if (Math.abs(dx) > Math.abs(dy)) {
      dir = dx > 0 ? 'right' : 'left';
    } else {
      dir = dy > 0 ? 'down' : 'up';
    }
    game.setDirection(dir);
  }
  function onTouchMove(e) {
    if (e.cancelable) { e.preventDefault(); }   // 阻止滚动/下拉刷新
  }

  /* ---------- 高度适配 ---------- */
  function syncAppHeight() {
    var docEl = document.documentElement;
    var vh = window.innerHeight || docEl.clientHeight;
    docEl.style.setProperty('--app-height', vh + 'px');
  }

  /* ---------- 启动 ---------- */
  function init() {
    core.refreshGuardDay();      // 防沉迷：跨日重置计数
    ui.renderHeader();
    ui.renderView();
    game.restoreGame();          // 有效 cur 恢复，否则新局
    ui.renderFooter();
    var boardEl = ui.getBoard();
    window.addEventListener('keydown', onKeyDown);
    boardEl.addEventListener('touchstart', onTouchStart, { passive: true });
    boardEl.addEventListener('touchend', onTouchEnd, { passive: true });
    boardEl.addEventListener('touchmove', onTouchMove, { passive: false });
  }

  if (window.addEventListener) {
    window.addEventListener('resize', syncAppHeight);
  }
  syncAppHeight();
  init();

  window.SnakeApp.main = {
    init: init,
    syncAppHeight: syncAppHeight,
    onKeyDown: onKeyDown
  };
})();
