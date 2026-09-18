/* ============================================================
   贪吃蛇 — audio：Web Audio 合成音效（零文件零包体，Chrome 61 原生）
   依赖：core（仅走 window.SnakeApp 命名空间）。
   挂载：window.SnakeApp.audio
   ============================================================ */
(function () {
  'use strict';

  var actx = null;

  function ensureAudio() {
    try {
      if (!actx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) { actx = new AC(); }
      }
      if (actx && actx.state === 'suspended') { actx.resume(); }
    } catch (err) { /* ignore */ }
    return actx;
  }

  function tone(freq, dur, type, vol, delay) {
    var ac = ensureAudio();
    if (!ac) { return; }
    try {
      var t0 = ac.currentTime + (delay || 0);
      var osc = ac.createOscillator();
      var g = ac.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(vol || 0.1, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (err) { /* ignore */ }
  }

  function sndTurn() {
    tone(280, 0.03, 'sine', 0.05);            // 转向：轻短提示
  }
  function sndEat() {
    tone(560, 0.06, 'triangle', 0.1);         // 吃食物：上跳双音
    tone(840, 0.08, 'triangle', 0.08, 0.06);
  }
  function sndWin() {
    tone(523, 0.12, 'sine', 0.11, 0);         // 胜利：上行琶音
    tone(659, 0.12, 'sine', 0.11, 0.12);
    tone(784, 0.12, 'sine', 0.11, 0.24);
    tone(1047, 0.22, 'sine', 0.11, 0.36);
  }
  function sndLose() {
    tone(400, 0.12, 'sine', 0.09, 0);         // 失败：下行
    tone(320, 0.12, 'sine', 0.09, 0.12);
    tone(200, 0.22, 'sine', 0.09, 0.24);
  }

  window.SnakeApp.audio = {
    ensureAudio: ensureAudio,
    tone: tone,
    sndTurn: sndTurn,
    sndEat: sndEat,
    sndWin: sndWin,
    sndLose: sndLose
  };
})();
