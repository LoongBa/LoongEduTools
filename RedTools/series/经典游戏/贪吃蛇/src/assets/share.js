/* ============================================================
   贪吃蛇 — share：分享卡片 canvas(1080×1920) + 文案复制 + toast
   依赖：core、game（运行时引用 ui）。
   挂载：window.SnakeApp.share
   ============================================================ */
(function () {
  'use strict';
  var core = window.SnakeApp.core;
  var game = window.SnakeApp.game;

  function uiMod() { return window.SnakeApp.ui; }
  function speedLabel(key) { return core.speedOf(key).label; }

  /* ---------- 分享文案 ---------- */
  function shareText() {
    var streak = core.store.checkin && core.store.checkin.streak ? core.store.checkin.streak : 0;
    var best = core.store.best[game.state.speedKey] || 0;
    var selfS = core.store.selfStreak || 0;
    return '孩子玩贪吃蛇【' + speedLabel(game.state.speedKey) + '】得了 ' + game.state.score + ' 分，连吃 ' + game.state.foods + ' 个食物' +
      (best > 0 ? '，本速度最佳 ' + best + ' 分' : '') +
      '，已连续打卡 ' + streak + ' 天' +
      (selfS > 0 ? '，连续自律 ' + selfS + ' 天' : '') +
      '！专注力又进步啦～#贪吃蛇 #小学生专注力 #自控力';
  }

  /* ---------- 分享卡片（浅绿→米白暖色渐变） ---------- */
  function drawShareCard() {
    var W = 1080, H = 1920;
    var cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    var ctx = cv.getContext('2d');
    // 背景渐变
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#eef8e0');
    grad.addColorStop(1, '#fffbe8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // 顶部装饰点
    ctx.fillStyle = 'rgba(140, 200, 110, 0.4)';
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
    ctx.fillStyle = '#3d6b35';
    ctx.font = 'bold 88px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('贪 吃 蛇', W / 2, 300);
    ctx.fillStyle = '#7a9e6f';
    ctx.font = '40px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('手眼协调小达人', W / 2, 400);
    // 战绩卡片
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(110, 520, W - 220, 780);
    ctx.strokeStyle = '#cde3bd';
    ctx.lineWidth = 4;
    ctx.strokeRect(110, 520, W - 220, 780);
    ctx.fillStyle = '#4c7a46';
    ctx.font = 'bold 58px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('【' + speedLabel(game.state.speedKey) + '】· 本局得分', W / 2, 650);
    ctx.fillStyle = '#3d8b3f';
    ctx.font = 'bold 120px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(game.state.score + ' 分', W / 2, 820);
    ctx.fillStyle = '#8ba384';
    ctx.font = '44px "PingFang SC","Microsoft YaHei",sans-serif';
    var lines = [];
    lines.push('本局连吃：' + game.state.foods + ' 个食物');
    lines.push('本速度最佳：' + ((core.store.best[game.state.speedKey] || 0) > 0 ? core.store.best[game.state.speedKey] + ' 分' : '—'));
    lines.push('连续打卡：' + ((core.store.checkin && core.store.checkin.streak) || 0) + ' 天');
    lines.push('连续自律：' + (core.store.selfStreak || 0) + ' 天');
    for (var k = 0; k < lines.length; k++) {
      ctx.fillText(lines[k], W / 2, 990 + k * 78);
    }
    // 底部鼓励语
    ctx.fillStyle = '#3d6b35';
    ctx.font = '56px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('每吃一口，都是专注', W / 2, 1500);
    ctx.fillStyle = '#93a88d';
    ctx.font = '36px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('龙爸乐学 · 贪吃蛇小工具', W / 2, 1720);
    ctx.fillText(core.fmtToday(), W / 2, 1790);
    return cv;
  }

  /* ---------- 分享弹层 ---------- */
  var shareOpen = false;
  function openShare() {
    if (shareOpen) { return; }
    shareOpen = true;
    uiMod().hideOverlay();
    var cv = drawShareCard();
    var img = document.createElement('img');
    img.className = 'share-img';
    img.setAttribute('alt', '贪吃蛇成绩打卡卡片');
    img.src = cv.toDataURL('image/png');
    var cardWrap = core.makeEl('div', 'share-card-wrap');
    cardWrap.appendChild(img);
    var hint = core.makeEl('div', 'share-hint', '📸 长按保存图片 · 发布笔记分享成就');
    var btnCopy = core.makeEl('button', 'btn-main', '复制分享文案');
    btnCopy.addEventListener('click', copyShareText);
    var btnBack = core.makeEl('button', 'btn-ghost', '返回结算');
    btnBack.addEventListener('click', function () {
      shareOpen = false;
      if (game.state.won) { uiMod().openWin(); } else { uiMod().openLose(); }
    });
    var btnsBox = core.makeEl('div', 'share-btns');
    btnsBox.appendChild(btnCopy);
    btnsBox.appendChild(btnBack);
    var card = core.makeEl('div', 'overlay-card share-card');
    card.appendChild(core.makeEl('div', 'overlay-title', '📷 分享打卡'));
    card.appendChild(cardWrap);
    card.appendChild(hint);
    card.appendChild(btnsBox);
    uiMod().showCustomOverlay(card);
  }

  /* ---------- 文案复制（textarea + execCommand，Chrome 61 兼容） ---------- */
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
    var t = core.makeEl('div', 'toast', msg);
    document.body.appendChild(t);
    setTimeout(function () {
      if (t.parentNode) { t.parentNode.removeChild(t); }
    }, 2600);
  }

  window.SnakeApp.share = {
    openShare: openShare,
    shareText: shareText,
    copyShareText: copyShareText,
    drawShareCard: drawShareCard,
    toast: toast
  };
})();
