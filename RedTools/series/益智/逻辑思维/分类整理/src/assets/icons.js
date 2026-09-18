/* ============================================================
   分类整理 — 图标库（SVG 程序化生成，Chrome 61 基线经典脚本）
   ------------------------------------------------------------
   说明：
   - 定义 window.CATEGORIES：8 个类别 × 4~6 个童趣扁平 SVG 图标（糖果色）
   - 每个类别 = { id, name, color, icons: [draw, ...] }
     - id：类别标识（游戏中按类别分盒）
     - name：中文名（盒子/提示用）
     - color：类别主题色（盒子顶部描边 / 计数徽标）
     - icons[i]：draw() 返回以 (0,0) 为中心的 <svg> 字符串
       （viewBox -20 -20 40 40，物品格/盒子直接 innerHTML 渲染）
   - 每类图标数量 ≥4（困难 4 类 × 每类 3 件抽选不重复，留冗余）
   - 类别代表性图标 = 该类别 icons[0]（盒子显示用）
   - 约束：ES2017 经典脚本（var+function）、无内联事件/eval、
     无外部资源；所有图形由基础形状代码生成（童趣扁平风）
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 形状小工具（同翻牌记忆配对 icons.js） ---------- */
  /* c() 双签名兼容：
     c(r, fill[, extra])            以 (0,0) 为中心的圆（翻牌原版）
     c(cx, cy, r, fill[, extra])    指定圆心的圆（本工具图标库大量使用） */
  function c(p1, p2, p3, p4, p5) {
    if (typeof p2 === 'number') {
      return '<circle cx="' + p1 + '" cy="' + p2 + '" r="' + p3 + '" fill="' + p4 + '"' + (p5 || '') + '/>';
    }
    return '<circle r="' + p1 + '" fill="' + p2 + '"' + (p3 || '') + '/>';
  }
  function ce(cx, cy, rx, ry, f, extra) {
    return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + f + '"' + (extra || '') + '/>';
  }
  function rc(x, y, w, h, f, rx, extra) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + f + '"' +
      (rx ? ' rx="' + rx + '"' : '') + (extra || '') + '/>';
  }
  function pl(pts, f, extra) { return '<polygon points="' + pts + '" fill="' + f + '"' + (extra || '') + '/>'; }
  function pa(d, f, extra) { return '<path d="' + d + '" fill="' + f + '"' + (extra || '') + '/>'; }
  function ln(x1, y1, x2, y2, st, w, extra) {
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + st +
      '" stroke-width="' + w + '"' + (extra || '') + '/>';
  }
  /* N 角星多边形点串 */
  function starPts(rOuter, rInner, n) {
    var pts = [];
    for (var i = 0; i < n * 2; i++) {
      var r = (i % 2 === 0) ? rOuter : rInner;
      var a = (i * Math.PI) / n - Math.PI / 2;
      pts.push((r * Math.cos(a)).toFixed(2) + ',' + (r * Math.sin(a)).toFixed(2));
    }
    return pts.join(' ');
  }
  function star(rOuter, rInner, n, f, extra) {
    return pl(starPts(rOuter, rInner, n), f, extra || '');
  }
  /* SVG 包裹：以 (0,0) 为中心，40×40 视口 */
  function svgWrap(inner) {
    return '<svg viewBox="-20 -20 40 40" xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>';
  }

  /* ============================================================
     图标库：8 类 43 个童趣扁平图标（糖果色填充）
     类别间视觉区分：轮廓/构图/配色各不相同（水果 vs 蔬菜 也清晰可辨）
     ============================================================ */

  /* ---------- 1. 水果（红/黄/紫暖色系，多带叶/蒂） ---------- */
  function apple() {
    return svgWrap(
      ln(0, -12, 0, -17, '#8a4a22', 2.5) +
      ce(0, 0, 12, 11, '#ff6b6b') +
      ce(3, -6, 3, 2, 'rgba(255,255,255,0.5)') +
      pa('M1 -14 Q8 -20 10 -14 Q6 -10 1 -14 Z', '#3fae6c'));
  }
  function banana() {
    return svgWrap(
      pa('M-15 -2 Q0 16 15 4 Q0 8 -15 -2 Z', '#ffd23f') +
      c(-13, -1, 1.4, '#8a5a22') + c(13, 3, 1.4, '#8a5a22') +
      ln(-8, 5, 6, 2, 'rgba(255,255,255,0.5)', 1.5));
  }
  function grape() {
    return svgWrap(
      ln(0, -15, 0, -18, '#3fae6c', 2) +
      pa('M1 -15 Q7 -21 10 -14 Q6 -11 1 -15 Z', '#3fae6c') +
      c(-6, -9, 4, '#b46fdf') + c(0, -11, 4.5, '#c98aff') + c(6, -9, 4, '#b46fdf') +
      c(-4, -2, 4.5, '#c98aff') + c(3, -3, 4.5, '#b46fdf') + c(-8, -1, 3.5, '#c98aff') +
      c(6, 1, 4, '#c98aff') + c(-1, 4, 4, '#b46fdf') + c(-6, 5, 3, '#c98aff') +
      ce(2, -8, 2, 1.2, 'rgba(255,255,255,0.4)'));
  }
  function watermelon() {
    return svgWrap(
      pa('M-17 2 A17 17 0 0 1 17 2 L15 2 A15 15 0 0 0 -15 2 Z', '#7aa05a') +
      pa('M-15 2 A15 15 0 0 1 15 2 Z', '#ff6b6b') +
      c(-6, -4, 1.5, '#2b2b2b') + c(0, -8, 1.5, '#2b2b2b') + c(6, -4, 1.5, '#2b2b2b'));
  }
  function strawberry() {
    return svgWrap(
      pa('M0 -10 Q12 -4 10 7 Q0 17 -10 7 Q-12 -4 0 -10 Z', '#ff5b8a') +
      pa('M-5 -9 L-9 -14 L-4 -10 L0 -16 L4 -10 L9 -14 L5 -9 Z', '#3fae6c') +
      c(-4, -1, 1, '#ffe8d0') + c(3, -3, 1, '#ffe8d0') + c(0, 3, 1, '#ffe8d0') +
      c(-5, 4, 1, '#ffe8d0') + c(4, 5, 1, '#ffe8d0') + c(-2, 8, 1, '#ffe8d0') +
      ce(-4, -5, 2, 1.2, 'rgba(255,255,255,0.45)'));
  }
  function pear() {
    return svgWrap(
      ln(0, -15, 0, -19, '#8a4a22', 2) +
      pa('M0 -15 Q-9 -12 -11 -5 Q-13 3 -6 13 Q0 19 6 13 Q13 3 11 -5 Q9 -12 0 -15 Z', '#a8c64a') +
      ce(-4, -6, 2.5, 1.5, 'rgba(255,255,255,0.45)'));
  }

  /* ---------- 2. 蔬菜（绿/橙/紫系，多带叶/柄） ---------- */
  function carrot() {
    return svgWrap(
      pa('M-11 -8 L0 16 L11 -8 Q0 -12 -11 -8 Z', '#ff9c4a') +
      ln(-5, -9, -8, -16, '#3fae6c', 2.5) + ln(0, -10, 0, -17, '#2f9e5e', 2.5) + ln(5, -9, 8, -16, '#3fae6c', 2.5) +
      ln(-6, -3, 6, -3, 'rgba(255,255,255,0.5)', 1.5) + ln(-4, 3, 4, 3, 'rgba(255,255,255,0.5)', 1.5));
  }
  function broccoli() {
    return svgWrap(
      rc(-3, 3, 6, 9, '#2f9e5e', 2) +
      c(0, -5, 5, '#3fae6c') + c(-6, -1, 4.5, '#4dbf7a') + c(6, -1, 4.5, '#3fae6c') +
      c(-4, -9, 3.5, '#4dbf7a') + c(4, -9, 3.5, '#3fae6c') + c(0, -12, 3, '#4dbf7a') +
      c(-1, -15, 2, '#5cc988'));
  }
  function tomato() {
    return svgWrap(
      c(0, 0, 12, '#ff5a4a') +
      ce(3, -4, 3, 2, 'rgba(255,255,255,0.4)') +
      pl(starPts(4.5, 2, 5), '#3fae6c', ' transform="translate(0,-11)"'));
  }
  function corn() {
    return svgWrap(
      rc(-6, -8, 12, 16, '#ffd23f', 4) +
      pa('M-7 -6 L-13 -13 L-5 -9 Z', '#3fae6c') + pa('M7 -6 L13 -13 L5 -9 Z', '#3fae6c') + pa('M0 -8 L0 -16 L3 -9 Z', '#2f9e5e') +
      c(-3, -4, 1, '#f5a623') + c(0, -5, 1, '#f5a623') + c(3, -4, 1, '#f5a623') +
      c(-3, 0, 1, '#f5a623') + c(0, -1, 1, '#f5a623') + c(3, 0, 1, '#f5a623') +
      c(-3, 4, 1, '#f5a623') + c(0, 3, 1, '#f5a623') + c(3, 4, 1, '#f5a623'));
  }
  function eggplant() {
    return svgWrap(
      pa('M0 -15 Q10 -8 8 6 Q6 16 0 18 Q-6 16 -8 6 Q-10 -8 0 -15 Z', '#8a5ae0') +
      pa('M-5 -11 L5 -11 L3 -7 L0 -9 L-3 -7 Z', '#3fae6c') +
      ln(0, -13, 0, -18, '#2f9e5e', 2.5) +
      ce(-4, -4, 2, 4, 'rgba(255,255,255,0.25)'));
  }
  function pumpkin() {
    return svgWrap(
      ce(0, 0, 14, 12, '#ff9c4a') +
      ln(-10, -4, -10, 4, '#f08a35', 3) + ln(0, -10, 0, 10, '#f08a35', 3) + ln(10, -4, 10, 4, '#f08a35', 3) +
      rc(-1.5, -14, 3, 5, '#2f9e5e', 1.5) +
      pa('M4 -12 Q9 -17 11 -11 Q8 -9 4 -12 Z', '#3fae6c'));
  }

  /* ---------- 3. 动物（头/脸轮廓 + 特征器官） ---------- */
  function cat() {
    return svgWrap(
      pa('M-4 -12 L-14 -12 L-10 -4 Z', '#ff9c4a') + pa('M4 -12 L14 -12 L10 -4 Z', '#ff9c4a') +
      c(0, 2, 12, '#ff9c4a') +
      c(-4, -1, 1.8, '#2b2b2b') + c(4, -1, 1.8, '#2b2b2b') +
      pa('M-2 3 L0 6 L2 3 Z', '#ff7eb3') +
      ln(-5, 4, -7, 6, '#2b2b2b', 1.5) + ln(5, 4, 7, 6, '#2b2b2b', 1.5));
  }
  function dog() {
    return svgWrap(
      ce(-9, -2, 4, 9, '#a06a3f', ' transform="rotate(-20 -9 -2)"') +
      ce(9, -2, 4, 9, '#a06a3f', ' transform="rotate(20 9 -2)"') +
      c(0, 1, 12, '#c98a5a') +
      c(-4, -1, 2, '#2b2b2b') + c(4, -1, 2, '#2b2b2b') +
      ce(0, 4, 3.5, 2.5, '#2b2b2b') + ce(0, 3, 2, 1.6, '#ff7eb3') +
      ln(-5, 2, -8, 3, '#2b2b2b', 1.5) + ln(5, 2, 8, 3, '#2b2b2b', 1.5) +
      pa('M-2 6 L2 6 L0 9 Z', '#ff7eb3'));
  }
  function rabbit() {
    return svgWrap(
      ce(-4, -11, 3.5, 8, '#ffffff', ' stroke="#d8d0c8" stroke-width="1.5"') +
      ce(4, -11, 3.5, 8, '#ffffff', ' stroke="#d8d0c8" stroke-width="1.5"') +
      ce(-4, -11, 1.8, 5, '#ffb8cf') + ce(4, -11, 1.8, 5, '#ffb8cf') +
      c(0, 3, 10, '#ffffff', ' stroke="#d8d0c8" stroke-width="1.5"') +
      c(-3.5, 1, 1.6, '#2b2b2b') + c(3.5, 1, 1.6, '#2b2b2b') +
      ce(0, 4, 2.2, 1.6, '#ff7eb3') +
      ln(-4, 3, -1, 4, '#2b2b2b', 1.2) + ln(4, 3, 1, 4, '#2b2b2b', 1.2));
  }
  function elephant() {
    return svgWrap(
      c(0, 2, 12, '#9aa8b8') +
      pa('M-5 9 Q-8 11 -9 16 Q-7 20 -2 19 Q3 17 3 13 Q3 10 5 9 Z', '#9aa8b8') +
      pa('M-11 -1 Q-17 -2 -17 4 Q-17 10 -11 10 Q-8 10 -8 4 Q-8 1 -11 -1 Z', '#b8c4d4') +
      c(-4, 0, 1.6, '#2b2b2b') + c(4, 0, 1.6, '#2b2b2b'));
  }
  function penguin() {
    return svgWrap(
      pa('M0 -16 Q9 -13 10 -4 Q10 6 6 10 Q0 14 -6 10 Q-10 6 -10 -4 Q-9 -13 0 -16 Z', '#2b3a4a') +
      ce(0, 0, 6.5, 6.5, '#ffffff') +
      c(-4, -5, 1.7, '#ffffff') + c(4, -5, 1.7, '#ffffff') +
      pa('M-2 -1 L2 -1 L0 2 Z', '#ff9c4a') +
      pa('M-6 10 L-3 13 L0 10 L3 13 L6 10 Z', '#ff9c4a'));
  }
  function giraffe() {
    return svgWrap(
      rc(1, -20, 8, 7, '#ffd166', 3) +
      rc(0, -14, 7, 11, '#ffd166', 2) +
      c(2, -24, 1.6, '#c9863f') + c(7, -24, 1.6, '#c9863f') +
      ce(-2, -17, 5, 4, '#ffd166', ' transform="rotate(20 -2 -17)"') +
      c(4, -18, 1.4, '#2b2b2b') +
      c(2, -13, 1.8, '#c9863f') +
      c(4, -9, 1.6, '#a05a2c') + c(0, -7, 1.4, '#a05a2c') + c(4, -4, 1.4, '#a05a2c'));
  }

  /* ---------- 4. 交通（车船飞机，主体 + 轮/窗/翼） ---------- */
  function car() {
    return svgWrap(
      rc(-15, -3, 30, 10, '#5b8def', 4) +
      pa('M-10 -3 L-6 -10 L2 -10 L8 -3 Z', '#9cc5f7') +
      rc(-4, -8, 6, 5, '#d7ecff', 1.5) +
      c(-8, 7, 3.2, '#2b3a4a') + c(8, 7, 3.2, '#2b3a4a'));
  }
  function train() {
    return svgWrap(
      rc(-16, -2, 14, 12, '#ff6b6b', 2) +
      rc(-2, -2, 18, 12, '#ff6b6b', 2) +
      rc(-13, 1, 8, 5, '#ffd9d0', 1.5) + rc(1, 1, 8, 5, '#ffd9d0', 1.5) +
      c(-11, 10, 2.5, '#2b3a4a') + c(-4, 10, 2.5, '#2b3a4a') + c(5, 10, 2.5, '#2b3a4a') + c(12, 10, 2.5, '#2b3a4a') +
      pa('M-6 -2 L-6 -9 L-1 -2 Z', '#4a90d9') +
      c(-4, -13, 1.5, '#b0b8c4') + c(-1, -16, 2, '#b0b8c4'));
  }
  function plane() {
    return svgWrap(
      ce(-1, 0, 16, 5, '#5b8def') +
      pa('M-16 -5 L-16 -14 L-7 -5 Z', '#4a7ade') +
      pa('M14 -1 L22 0 L14 3 Z', '#4a7ade') +
      pa('M0 2 L6 -9 L15 2 Z', '#7aa7f0') +
      c(2, -1, 2.2, '#ffffff'));
  }
  function ship() {
    return svgWrap(
      pa('M-16 0 L16 0 L11 8 L-11 8 Z', '#ff8a5c') +
      pa('M-7 0 L-7 -7 L2 -7 L2 0 Z', '#ffffff', ' stroke="#c4dce8" stroke-width="1"') +
      rc(-3, -10, 3, 3, '#ff6b6b', 1) +
      pa('M-18 12 Q-14 10 -10 12 T-2 12 T6 12 T14 12', 'none', ' stroke="#5b8def" stroke-width="2.5"') +
      pa('M-14 16 Q-10 14 -6 16 T2 16 T10 16 T18 16', 'none', ' stroke="#8ad4ff" stroke-width="2.5"'));
  }
  function bike() {
    return svgWrap(
      c(-7, 5, 5, 'none', ' stroke="#4a5568" stroke-width="2.5"') +
      c(7, 5, 5, 'none', ' stroke="#4a5568" stroke-width="2.5"') +
      ln(-7, 5, -3, -3, '#e76f51', 2.2) + ln(-7, 5, 3, -1, '#e76f51', 2.2) +
      ln(-3, -3, 3, -1, '#e76f51', 2.2) + ln(3, -1, 7, 5, '#e76f51', 2.2) +
      ln(3, -1, 6, -4, '#e76f51', 2.2) + ln(6, -4, 7, 5, '#e76f51', 2.2) +
      rc(-4.5, -4.5, 3, 1.5, '#4a5568', 1) +
      ln(5, -4, 7, -4, '#4a5568', 2) +
      c(7, -4, 1.5, '#e76f51') +
      c(3, -1, 1.3, '#4a5568') +
      ln(1.5, 0.5, 4.5, -2.5, '#e76f51', 1.8));
  }

  /* ---------- 5. 文具（笔/书/剪/尺/橡皮） ---------- */
  function pencil() {
    return svgWrap(
      rc(-2.5, -18, 5, 24, '#ff5b8a', ' transform="rotate(45 0 0)"') +
      rc(-2.5, 6, 5, 20, '#ffd23f', ' transform="rotate(45 0 0)"') +
      pa('M-2.5 26 L2.5 26 L0 32 Z', '#ff9c4a', ' transform="rotate(45 0 0)"') +
      ln(-2.5, 28, 2.5, 28, '#2b2b2b', 2, ' transform="rotate(45 0 0)"') +
      rc(-2.5, -22, 5, 4, '#c9cdd4', ' transform="rotate(45 0 0)"'));
  }
  function book() {
    return svgWrap(
      rc(-14, -6, 28, 16, '#5b8def', 2) +
      rc(-11, -3, 22, 10, '#ffffff', 1.5) +
      ln(-1, -3, -1, 7, '#c9cdd4', 1.5) +
      ln(0, -14, 6, -14, '#ff5b8a', 3));
  }
  function scissors() {
    return svgWrap(
      ln(-6, 10, 10, -12, '#c9cdd4', 4) + ln(6, 10, -10, -12, '#c9cdd4', 4) +
      c(-8, 12, 3.5, '#ff6b6b') + c(8, 12, 3.5, '#5b8def') +
      ln(-11, 12, -5, 12, '#c9cdd4', 4) + ln(5, 12, 11, 12, '#c9cdd4', 4));
  }
  function ruler() {
    return svgWrap(
      rc(-16, -4, 32, 8, '#7ec97a', 2) + rc(-16, -4, 32, 2.5, '#9cd89a', 1) +
      ln(-12, 1, -12, 3, '#ffffff', 1.2) + ln(-6, 1, -6, 3, '#ffffff', 1.2) +
      ln(0, 1, 0, 3, '#ffffff', 1.2) + ln(6, 1, 6, 3, '#ffffff', 1.2) + ln(12, 1, 12, 3, '#ffffff', 1.2) +
      c(-15, 0, 1, '#2b2b2b') + c(15, 0, 1, '#2b2b2b'));
  }
  function eraser() {
    return svgWrap(
      rc(-13, -9, 26, 18, '#ff8fb3', 4) + rc(-13, -9, 26, 7, '#ffb9d0', 4) +
      rc(-6, -9, 12, 18, '#ffffff', 3));
  }

  /* ---------- 6. 食物（甜品/点心，多层 + 顶饰） ---------- */
  function cake() {
    return svgWrap(
      rc(-10, 2, 20, 6, '#ffb8cf', 2) + rc(-13, -4, 26, 8, '#ffd9a3', 2) + rc(-10, -10, 20, 6, '#ff8fb3', 2) +
      c(0, -14, 2.5, '#ff5b6b') + ln(0, -14, 0, -11, '#3fae6c', 1.5) +
      c(-4, -1, 0.8, '#ff8fb3') + c(4, -1, 0.8, '#ff8fb3') + c(-2, -7, 0.8, '#ff8fb3') + c(2, -7, 0.8, '#ff8fb3'));
  }
  function icecream() {
    return svgWrap(
      pa('M-9 2 L9 2 L0 16 Z', '#d9a05b') + pa('M-7 2 L7 2 L0 14 Z', '#e8b878') +
      ln(-3, 4, 0, 11, '#c9863f', 1.5) + ln(3, 4, 0, 11, '#c9863f', 1.5) +
      c(0, -4, 7, '#ff8fb3') + c(0, -4, 4.5, '#ffb8cf') + c(-2, -6, 1.5, '#ff5b8a'));
  }
  function donut() {
    return svgWrap(
      c(0, 0, 13, '#ffb47a') + c(0, 0, 10, '#ff8fb3') + c(0, 0, 4.5, '#ffb47a') +
      ln(-7, -3, -3, -6, '#ffffff', 1.5) + ln(4, -7, 7, -4, '#8ad4ff', 1.5) +
      ln(-2, 7, 3, 7, '#ffd23f', 1.5) + ln(8, 1, 8, 4, '#7ec97a', 1.5) + ln(-8, 4, -7, 7, '#ffffff', 1.5));
  }
  function cookie() {
    return svgWrap(
      c(0, 0, 13, '#d9a05b', ' stroke="#c9863f" stroke-width="1.5"') +
      c(0, 0, 10.5, '#e8b878') +
      c(-5, -3, 1.6, '#6b4226') + c(3, -5, 1.6, '#6b4226') + c(6, 3, 1.6, '#6b4226') +
      c(-2, 5, 1.6, '#6b4226') + c(-7, 1, 1.4, '#6b4226') + c(1, -1, 1.4, '#6b4226'));
  }
  function burger() {
    return svgWrap(
      ce(0, -8, 11, 4, '#f0a33c') +
      rc(-11, -4, 22, 3, '#7ec97a', 1.5) + rc(-11, -1, 22, 4, '#8a4a22', 1.5) +
      ce(0, 5, 11, 4.5, '#f0a33c') +
      c(-4, -10, 1, '#ffffff') + c(2, -11, 1, '#ffffff') + c(-1, -8, 1, '#ffffff'));
  }

  /* ---------- 7. 乐器（键盘/拨弦/打击/吹奏） ---------- */
  function piano() {
    return svgWrap(
      rc(-12, -6, 24, 16, '#8a4a2c', 2) + rc(-12, -6, 24, 3, '#a05a2c', 1) +
      rc(-10, 2, 2, 8, '#ffffff') + rc(-6, 2, 2, 8, '#ffffff') + rc(-2, 2, 2, 8, '#ffffff') +
      rc(2, 2, 2, 8, '#ffffff') + rc(6, 2, 2, 8, '#ffffff') +
      rc(-8, 2, 2, 4, '#2b2b2b') + rc(0, 2, 2, 4, '#2b2b2b') + rc(4, 2, 2, 4, '#2b2b2b'));
  }
  function guitar() {
    return svgWrap(
      rc(-2.5, -24, 5, 5, '#8a4a22', 1) +
      rc(-1.5, -20, 3, 13, '#a05a2c') +
      ce(0, 7, 10, 12, '#c46b3f') +
      c(0, 7, 3.5, '#2b2b2b') + c(0, 7, 2, '#e8e0d0') +
      ln(-2, -3, -2, 15, 'rgba(255,255,255,0.5)', 1) +
      ln(0, -3, 0, 15, 'rgba(255,255,255,0.5)', 1) +
      ln(2, -3, 2, 15, 'rgba(255,255,255,0.5)', 1));
  }
  function drum() {
    return svgWrap(
      rc(-11, -6, 22, 10, '#ff6b6b', 3) + rc(-11, -6, 22, 3, '#ff8a80', 3) + rc(-9, -6, 18, 2.5, '#ffffff', 1) +
      c(-6, 6, 1, '#ffd23f') + c(0, 7, 1, '#ffd23f') + c(6, 6, 1, '#ffd23f') +
      c(-3, 7, 1, '#ffd23f') + c(3, 7, 1, '#ffd23f') + c(-8, 4, 1, '#ffd23f') + c(8, 4, 1, '#ffd23f') +
      ln(-13, -10, -4, -8, '#d9a05b', 2) + c(-14, -10, 1.5, '#8a4a22') +
      ln(13, -10, 4, -8, '#d9a05b', 2) + c(14, -10, 1.5, '#8a4a22'));
  }
  function trumpet() {
    return svgWrap(
      pa('M-16 0 L0 -6 L0 6 Z', '#f0b429') +
      rc(-1, -3, 5, 6, '#d9a05b', 1) +
      pa('M4 -4 L4 4 L14 6 L14 -6 Z', '#f5c840') +
      pa('M14 -6 L20 -8 L20 8 L14 6 Z', '#ffd23f') +
      c(-16, 0, 1.8, '#c9863f'));
  }
  function tambourine() {
    return svgWrap(
      c(0, 0, 13, '#d9a05b') + c(0, 0, 10.5, '#f7e8d0') + c(0, 0, 2, '#d9a05b') +
      ln(-5, -5, 5, 5, '#d9a05b', 1.5) + ln(-5, 5, 5, -5, '#d9a05b', 1.5) +
      c(-11, 0, 1.8, '#f5c840') + c(11, 0, 1.8, '#f5c840') + c(0, -11, 1.8, '#f5c840') + c(0, 11, 1.8, '#f5c840') +
      c(-8, -8, 1.6, '#f5c840') + c(8, 8, 1.6, '#f5c840') + c(-8, 8, 1.6, '#f5c840') + c(8, -8, 1.6, '#f5c840'));
  }

  /* ---------- 8. 天气（日月/云雨/彩虹） ---------- */
  function sun() {
    return svgWrap(
      c(14, '#ffd23f') +
      ln(0, -20, 0, -17, '#ffd23f', 3) + ln(0, 20, 0, 17, '#ffd23f', 3) +
      ln(-20, 0, -17, 0, '#ffd23f', 3) + ln(20, 0, 17, 0, '#ffd23f', 3) +
      ln(-14, -14, -12, -12, '#ffd23f', 3) + ln(14, -14, 12, -12, '#ffd23f', 3) +
      ln(-14, 14, -12, 12, '#ffd23f', 3) + ln(14, 14, 12, 12, '#ffd23f', 3));
  }
  function moon() {
    return svgWrap(
      c(16, '#ffd23f') + c(-3, -4, 12, '#ffffff') +
      c(-8, 2, 2.5, '#f0b429') + c(-2, -8, 2, '#f0b429'));
  }
  function cloud() {
    return svgWrap(
      ce(0, 0, 13, 8, '#8ad4ff') + ce(-10, 3, 8, 5.5, '#8ad4ff') +
      ce(10, 3, 8, 5.5, '#8ad4ff') + ce(-16, 5, 5, 3.5, '#8ad4ff') + ce(16, 5, 5, 3.5, '#8ad4ff'));
  }
  function raindrop() {
    return svgWrap(
      pa('M0 -14 L-9 2 L9 2 Z', '#5b8def') + c(0, 6, 9, '#5b8def') +
      c(-3, 4, 2.5, 'rgba(255,255,255,0.5)'));
  }
  function rainbow() {
    return svgWrap(
      pa('M-19 8 A19 19 0 0 1 19 8 Z', '#ff8a5c') +
      pa('M-15 8 A15 15 0 0 1 15 8 Z', '#ffd23f') +
      pa('M-11 8 A11 11 0 0 1 11 8 Z', '#7ec97a') +
      pa('M-7 8 A7 7 0 0 1 7 8 Z', '#5b8def'));
  }

  /* ============================================================
     类别注册表
     ============================================================ */
  window.CATEGORIES = [
    { id: 'fruit', name: '水果', color: '#ff8a5c', icons: [apple, banana, grape, watermelon, strawberry, pear] },
    { id: 'veg', name: '蔬菜', color: '#4dbf7a', icons: [carrot, broccoli, tomato, corn, eggplant, pumpkin] },
    { id: 'animal', name: '动物', color: '#ff9c4a', icons: [cat, dog, rabbit, elephant, penguin, giraffe] },
    { id: 'transport', name: '交通', color: '#5b8def', icons: [car, train, plane, ship, bike] },
    { id: 'stationery', name: '文具', color: '#7aa7f0', icons: [pencil, book, scissors, ruler, eraser] },
    { id: 'food', name: '食物', color: '#ff8fb3', icons: [cake, icecream, donut, cookie, burger] },
    { id: 'instrument', name: '乐器', color: '#c46bff', icons: [piano, guitar, drum, trumpet, tambourine] },
    { id: 'weather', name: '天气', color: '#8ad4ff', icons: [sun, moon, cloud, raindrop, rainbow] }
  ];
})();
