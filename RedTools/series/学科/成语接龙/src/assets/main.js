/*
 * 看图猜成语 / 成语接龙 · 骨架占位
 * 功能：验证共享词库数据注入（CHENGYU_DATA / CHENGYU_CHAIN / APP_DATA）
 * 正式玩法开发时整体重写本文件。
 * Chrome 61 基线：经典脚本、ES5 语法、无内联事件。
 */
(function () {
  'use strict';

  function el(id) { return document.getElementById(id); }

  var meta = (window.APP_DATA && window.APP_DATA.meta) || {};
  var keben = window.CHENGYU_DATA ? window.CHENGYU_DATA.课本.length : 0;
  var ext = window.CHENGYU_DATA ? window.CHENGYU_DATA.接龙扩展.length : 0;
  var chain = window.CHENGYU_CHAIN ? Object.keys(window.CHENGYU_CHAIN).length : 0;

  el('app-header').textContent = (meta.name || '成语小工具') + ' v' + (meta.version || '?') + '（骨架待开发）';
  el('view').innerHTML =
    '<div class="box">' +
    '<p>课本成语 <b>' + keben + '</b> 条</p>' +
    '<p>接龙扩展 <b>' + ext + '</b> 条</p>' +
    '<p>接龙索引 <b>' + chain + '</b> 个首字</p>' +
    '<p class="ok">数据注入 OK</p>' +
    '</div>';
  el('app-footer').textContent = 'RedTools · 学科系列';
  document.title = meta.name || '成语小工具';
})();