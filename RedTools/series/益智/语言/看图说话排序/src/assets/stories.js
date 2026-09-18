/* ============================================================
   看图说话排序 — 叙事序列卡片库（SVG 程序化生成，Chrome 61 基线经典脚本）
   ------------------------------------------------------------
   说明：
   - 定义 window.STORIES：8 条「看图讲故事」叙事序列（共 32 张卡片）
     小宇的早晨 3 / 去野餐 3 / 放风筝 4 / 下雨啦 4 /
     煮面条 4 / 种番茄 4 / 逛动物园 5 / 露营之夜 5
   - 每条序列 = { id, name, steps: [drawFn, ...] }
     - steps 数组顺序即正确故事情节顺序（steps[0] 最先发生）
     - 每个 drawFn 返回一张完整卡片 <svg>（viewBox="-65 -65 130 130"，
       内容以 (0,0) 为中心，童趣扁平风糖果色）
   - 难度取序列（硬编码）：3 步 → morning/picnic；4 步 →
     kite/rain/noodle/tomato；5 步 → zoo/camp
   - 约束：ES2017 经典脚本（var+function）、无内联事件/eval、
     无外部资源；卡片之间用明显「情节递进」视觉差区分
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 形状小工具（同因果排序/简单拼图 scenes.js 局部风格） ---------- */
  function c(r, f, extra) { return '<circle r="' + r + '" fill="' + f + '"' + (extra || '') + '/>'; }
  function cc(cx, cy, r, f) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + f + '"/>'; }
  function ce(cx, cy, rx, ry, f, extra) {
    return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + f + '"' + (extra || '') + '/>';
  }
  function rc(x, y, w, h, f, rx, extra) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + f + '"' +
      (rx ? ' rx="' + rx + '"' : '') + (extra || '') + '/>';
  }
  function pl(pts, f, extra) { return '<polygon points="' + pts + '" fill="' + f + '"' + (extra || '') + '/>'; }
  function pa(d, f, extra) { return '<path d="' + d + '" fill="' + f + '"' + (extra || '') + '/>'; }
  function ps(d, st, w, extra) { return '<path d="' + d + '" stroke="' + st + '" stroke-width="' + w +
    '" fill="none"' + (extra || '') + '/>'; }
  function ln(x1, y1, x2, y2, st, w, extra) {
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + st +
      '" stroke-width="' + w + '"' + (extra || '') + '/>';
  }
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

  /* ---------- 卡片包装（viewBox 居中 130×130） ---------- */
  function w(inner) {
    return '<svg class="caus-card-svg" viewBox="-65 -65 130 130" xmlns="http://www.w3.org/2000/svg">' +
      inner + '</svg>';
  }

  /* ---------- 共享场景配件 ---------- */
  function sky(f) { return rc(-65, -65, 130, 130, f); }
  function ground(f, y) { return pa('M-65 ' + y + ' L65 ' + y + ' L65 65 L-65 65 Z', f); }
  function greenHill(f) { return pa('M-65 12 Q-32 -2 0 12 Q32 26 65 12 L65 65 L-65 65 Z', f); }
  function cloud(x, y, f) {
    return ce(x, y, 14, 8, f) + ce(x - 9, y + 3, 8, 5.5, f) + ce(x + 9, y + 3, 8, 5.5, f) +
      ce(x - 14, y + 4, 5, 4, f) + ce(x + 14, y + 4, 5, 4, f);
  }
  function sunRays(x, y) {
    return ln(x, y - 18, x, y - 12, '#ffd23f', 4) + ln(x, y + 12, x, y + 18, '#ffd23f', 4) +
      ln(x - 18, y, x - 12, y, '#ffd23f', 4) + ln(x + 12, y, x + 18, y, '#ffd23f', 4);
  }
  function sunm(x, y, f) { return cc(x, y, 10, f || '#ffd23f') + sunRays(x, y); }
  function moonArc(x, y) {
    return pa('M' + (x - 9) + ' ' + y + ' A10 10 0 1 0 ' + (x + 9) + ' ' + y + ' A8 8 0 1 1 ' + (x - 9) + ' ' + y + ' Z', '#ffe9a8');
  }
  /* 小朋友（小圆头 + 身体 + 发型） */
  function kid(x, y, shirt, hair) {
    return cc(x, y - 8, 8, '#ffce9e') +
      pa('M' + (x - 8) + ' ' + (y - 4) + ' A8 8 0 0 1 ' + (x + 8) + ' ' + (y - 4) + ' Z', hair || '#5a3a2a') +
      cc(x - 3, y - 9, 1.6, '#2b2b2b') + cc(x + 3, y - 9, 1.6, '#2b2b2b') +
      pa('M' + (x - 2.5) + ' ' + (y - 5) + ' L' + x + ' ' + (y - 2) + ' L' + (x + 2.5) + ' ' + (y - 5) + ' Z', '#ff8a7a') +
      cc(x, y + 7, 9, shirt);
  }
  function treem(x, y, trunk, crown) {
    return rc(x - 3, y, 6, 14, trunk) +
      cc(x, y - 6, 10, crown) + cc(x - 8, y - 3, 7, crown) + cc(x + 8, y - 3, 7, crown);
  }
  function bird(x, y, f) {
    return ps('M' + (x - 7) + ' ' + (y + 2) + ' Q' + x + ' ' + (y - 7) + ' ' + (x + 7) + ' ' + (y + 2), f, 3);
  }
  function bowl(x, y, f) {
    return pa('M' + (x - 11) + ' ' + y + ' A11 11 0 0 0 ' + (x + 11) + ' ' + y + ' Z', f);
  }

  /* ============================================================
     序列 1：小宇的早晨（3 步）—— 起床 → 早餐 → 上学
     ============================================================ */
  var morning = {
    id: 'morning',
    name: '小宇的早晨',
    steps: [
      function () {  // 1 太阳升起，被窝里起床
        return w(
          sky('#ffe9f0') +
          sunm(26, -32) +
          pa('M-65 20 Q-32 8 0 20 Q32 32 65 20 L65 65 L-65 65 Z', '#b8dfb0') +
          pa('M-28 44 Q0 18 28 44 Z', '#8ecae6') +
          pa('M-28 44 Q0 60 28 44 Z', '#6fb6d8') +
          cc(-7, 26, 8, '#ffce9e') +
          pa('M-15 27 A8 8 0 0 1 1 27 Z', '#5a3a2a') +
          cc(-10, 25, 1.6, '#2b2b2b') + cc(-4, 25, 1.6, '#2b2b2b')
        );
      },
      function () {  // 2 餐桌吃早餐
        return w(
          sky('#dff4ff') +
          ground('#d7e8c9', 18) +
          rc(-34, 16, 68, 9, '#c8a26e') +
          rc(-30, 25, 5, 10, '#a9824f') + rc(25, 25, 5, 10, '#a9824f') +
          bowl(-13, 10, '#ffffff') + cc(-5, 2, 4, '#ffe177') +
          rc(7, 0, 11, 9, '#f1927e', 3) + cc(25, 7, 5, '#c0392b')
        );
      },
      function () {  // 3 背书包上学去
        return w(
          sky('#e9f9df') +
          greenHill('#a8d8a0') +
          rc(-40, -18, 80, 32, '#f7c948') +
          pa('M-40 -18 Q0 -50 40 -18 Z', '#f7c948') +
          rc(-9, -4, 18, 18, '#b98a2e') +
          pa('M3 0 L3 -8 L7 -4 Z', '#e74c3c') +
          kid(18, 10, '#5b8def') +
          rc(10, 16, 10, 12, '#c97b3d', 2) +
          ln(16, 16, 16, 8, '#c97b3d', 3) +
          bird(-24, -28, '#6aa5d9')
        );
      }
    ]
  };

  /* ============================================================
     序列 2：去野餐（3 步）—— 准备篮子 → 铺毯子 → 一起分享
     ============================================================ */
  var picnic = {
    id: 'picnic',
    name: '去野餐',
    steps: [
      function () {  // 1 准备野餐篮
        return w(
          sky('#e6f7ff') +
          ground('#ddebcf', 18) +
          pa('M-30 36 Q-30 -4 0 -4 Q30 -4 30 36 Z', '#d9a05b') +
          ps('M-26 4 Q0 -12 26 4', '#8a6420', 3) +
          pl('-20,22 -8,10 6,20 -2,28', '#f5c518') +
          cc(12, 8, 4, '#e74c3c') + cc(10, 20, 5, '#27ae60') + cc(-6, 30, 3, '#ffd23f')
        );
      },
      function () {  // 2 草地上铺开毯子
        return w(
          sky('#e6f7ff') +
          greenHill('#a8d8a0') +
          pa('M-28 42 L28 42 L16 62 L-16 62 Z', '#e76f51') +
          ln(-12, 52, 12, 52, '#fff3e0', 2) + ln(0, 42, -6, 62, '#fff3e0', 2) +
          cloud(-24, -26, '#ffffff') + sunm(26, -30)
        );
      },
      function () {  // 3 围坐分享
        return w(
          sky('#e6f7ff') +
          greenHill('#a8d8a0') +
          pa('M-32 46 L32 46 L20 64 L-20 64 Z', '#e76f51') +
          kid(-20, 28, '#f1927e') + kid(0, 30, '#5b8def') + kid(20, 28, '#f7c948') +
          cc(0, 16, 4, '#e74c3c') + cc(8, 20, 3, '#27ae60') + cc(-8, 20, 3, '#ffd23f') +
          sunm(24, -30)
        );
      }
    ]
  };

  /* ============================================================
     序列 3：放风筝（4 步）—— 做风筝 → 到草地 → 奔跑起飞 → 飞上天
     ============================================================ */
  var kite = {
    id: 'kite',
    name: '放风筝',
    steps: [
      function () {  // 1 桌上做风筝
        return w(
          sky('#f0f4ff') +
          rc(-40, 18, 80, 12, '#c8a26e') +
          rc(-36, 30, 6, 12, '#a9824f') + rc(30, 30, 6, 12, '#a9824f') +
          pl('-12,4 -2,-16 14,-6 4,8', '#ff8a5c') +
          ps('M-8 -8 L-8 6', '#f5c518', 3) +
          cc(24, 12, 3, '#ffd23f') + cc(-26, -26, 3, '#4aa8ff')
        );
      },
      function () {  // 2 举着风筝到草地
        return w(
          sky('#f0f8ff') +
          greenHill('#a8d8a0') +
          kid(-6, 26, '#5b8def') +
          pl('-2,-30 10,-46 26,-34 14,-18', '#ff8a5c') +
          ln(4, -26, -2, -18, '#5b8def', 2) +
          cloud(26, -26, '#ffffff') + sunm(-26, -30)
        );
      },
      function () {  // 3 奔跑起飞
        return w(
          sky('#f0f8ff') +
          greenHill('#a8d8a0') +
          pl('-26,-34 -16,-48 -2,-38 -12,-24', '#ff8a5c') +
          ps('M-10 -34 Q0 -18 10 -12', '#f5c518', 2) +
          kid(12, 24, '#5b8def') +
          ln(-2, 18, -14, 10, '#9db4c8', 2) + ln(12, 28, 0, 22, '#9db4c8', 2) +
          ln(24, 26, 14, 32, '#9db4c8', 2) +
          sunm(-26, -30)
        );
      },
      function () {  // 4 风筝飞上天空
        return w(
          sky('#dfefff') +
          greenHill('#a8d8a0') +
          pl('-8,-44 6,-62 22,-50 12,-34', '#ff8a5c') +
          ps('M0 -44 Q4 -34 8 -26 Q12 -10 14 0', '#f5c518', 2) +
          ps('M-4 -40 Q-2 -46 -8 -48', '#27ae60', 2) +
          kid(-20, 26, '#5b8def') +
          cloud(24, -22, '#ffffff') +
          bird(-30, -40, '#6aa5d9')
        );
      }
    ]
  };

  /* ============================================================
     序列 4：下雨啦（4 步）—— 乌云 → 落雨 → 撑伞 → 彩虹
     ============================================================ */
  var rainSeq = {
    id: 'rain',
    name: '下雨啦',
    steps: [
      function () {  // 1 乌云飘来
        return w(
          sky('#cfd8e4') +
          ground('#9db4a0', 40) +
          cloud(0, -18, '#7a8ea3') + cloud(-26, -30, '#8a9db0') + cloud(26, -30, '#8a9db0') +
          treem(-28, 30, '#8a6420', '#5b8f6b') + treem(24, 32, '#8a6420', '#5b8f6b')
        );
      },
      function () {  // 2 落下雨点
        return w(
          sky('#b9c4d0') +
          ground('#9db4a0', 40) +
          cloud(0, -18, '#6a7d90') +
          ln(-20, -6, -16, 2, '#6aa5d9', 3) + ln(-6, -4, -2, 4, '#6aa5d9', 3) +
          ln(8, -6, 12, 2, '#6aa5d9', 3) + ln(20, -6, 24, 2, '#6aa5d9', 3) +
          cc(-24, 42, 3, '#5b8f6b') + cc(22, 44, 3, '#5b8f6b')
        );
      },
      function () {  // 3 撑起雨伞
        return w(
          sky('#aeb9c8') +
          ground('#9db4a0', 42) +
          ln(-2, -12, -2, 28, '#5a3a2a', 3) +
          pa('M-28 -12 A28 16 0 0 1 24 -12 Z', '#e74c3c') +
          ln(24, -12, 26, -12, '#e74c3c', 4) +
          kid(6, 32, '#5b8def') +
          cc(-14, 2, 2, '#6aa5d9') + cc(-4, 6, 2, '#6aa5d9') + cc(6, 2, 2, '#6aa5d9')
        );
      },
      function () {  // 4 雨后彩虹
        return w(
          sky('#c9ecff') +
          greenHill('#a8d8a0') +
          ps('M-28 10 A44 44 0 0 1 28 10', '#e74c3c', 7) +
          ps('M-20 10 A36 36 0 0 1 20 10', '#f7c948', 7) +
          ps('M-12 10 A28 28 0 0 1 12 10', '#27ae60', 7) +
          pa('M-2 8 A8 8 0 0 1 8 10 Z', '#ffe177') +
          pa('M-2 8 A8 8 0 0 1 -8 18 Z', '#ffe177') +
          cloud(-30, -26, '#ffffff') + sunm(30, -30) +
          cc(-20, 44, 3, '#5b8f6b') + cc(20, 44, 3, '#5b8f6b')
        );
      }
    ]
  };

  /* ============================================================
     序列 5：煮面条（4 步）—— 水开 → 下锅 → 加菜 → 开吃
     ============================================================ */
  var noodle = {
    id: 'noodle',
    name: '煮面条',
    steps: [
      function () {  // 1 水烧开冒泡
        return w(
          sky('#fdf3e0') +
          rc(-34, 34, 68, 10, '#c8a26e') +
          pa('M-24 -2 A24 24 0 0 0 24 -2 Z', '#9aa9b8') +
          cc(0, 8, 14, '#cfe3f0') +
          cc(-8, -2, 2, '#8ec9ee') + cc(0, -6, 2.4, '#8ec9ee') + cc(8, -2, 2, '#8ec9ee') +
          cc(14, 20, 12, '#ffffff')
        );
      },
      function () {  // 2 面条下锅
        return w(
          sky('#fdf3e0') +
          rc(-34, 34, 68, 10, '#c8a26e') +
          pa('M-24 -2 A24 24 0 0 0 24 -2 Z', '#9aa9b8') +
          ps('M-14 0 Q-2 4 8 -2 Q14 -6 20 0', '#f5c518', 3) +
          ps('M-18 -6 Q-4 0 10 -8', '#f5c518', 3) +
          cc(0, 8, 14, '#cfe3f0')
        );
      },
      function () {  // 3 加入蔬菜
        return w(
          sky('#fdf3e0') +
          rc(-34, 34, 68, 10, '#c8a26e') +
          pa('M-24 -2 A24 24 0 0 0 24 -2 Z', '#9aa9b8') +
          pa('M-14 -6 Q-6 -14 2 -10 Q-2 -2 -10 -4 Z', '#27ae60') +
          pa('M2 -8 Q10 -16 18 -10 Q14 -2 6 -4 Z', '#3ebf73') +
          ps('M-12 0 Q0 4 12 -2', '#f5c518', 3)
        );
      },
      function () {  // 4 端碗开吃
        return w(
          sky('#fdf3e0') +
          rc(-34, 34, 68, 10, '#c8a26e') +
          bowl(-6, 16, '#ffffff') +
          ps('M-14 8 Q-6 14 4 10 Q12 7 16 10', '#f5c518', 3) +
          cc(-2, 12, 2, '#27ae60') +
          ln(12, 2, 22, 12, '#8a6420', 3) + ln(14, -2, 24, 8, '#8a6420', 3) +
          kid(-24, 20, '#f1927e')
        );
      }
    ]
  };

  /* ============================================================
     序列 6：种番茄（4 步）—— 挖土播种 → 发芽 → 浇水 → 红番茄
     ============================================================ */
  var tomato = {
    id: 'tomato',
    name: '种番茄',
    steps: [
      function () {  // 1 挖土播种
        return w(
          sky('#f2f9ee') +
          ground('#c9a06b', 30) +
          pa('M-14 30 Q0 14 16 30 Z', '#8a6420') +
          ln(-20, 22, -8, 34, '#5a3a2a', 3) + rc(-21, 17, 4, 8, '#9aa9b8') +
          cc(-2, 26, 1.5, '#5b8f6b') + cc(3, 28, 1.5, '#5b8f6b') + cc(8, 26, 1.5, '#5b8f6b')
        );
      },
      function () {  // 2 发芽出土
        return w(
          sky('#f2f9ee') +
          ground('#c9a06b', 30) +
          pa('M-14 30 Q0 14 16 30 Z', '#8a6420') +
          ln(0, 28, 0, 12, '#3ebf73', 3) +
          pa('M0 16 Q-8 12 -4 10 Q0 12 0 16 Z', '#4ecb83') +
          pa('M0 16 Q8 12 4 10 Q0 12 0 16 Z', '#4ecb83') +
          cc(-26, -28, 3, '#ffd23f')
        );
      },
      function () {  // 3 浇水长大
        return w(
          sky('#f2f9ee') +
          ground('#c9a06b', 30) +
          pa('M-18 30 Q0 10 20 30 Q4 16 -14 30 Z', '#8a6420') +
          ln(2, 26, 2, 6, '#3ebf73', 4) +
          pa('M2 10 L-6 4 L2 6 L10 4 L4 12 Z', '#4ecb83') +
          pa('M2 22 L-8 18 L2 20 L10 16 L4 24 Z', '#4ecb83') +
          pa('M18 -4 L18 -12 L30 -4 Z', '#8ec9ee') + ln(22, -10, 30, 4, '#8ec9ee', 3) +
          cc(26, -10, 1.4, '#6aa5d9') + cc(24, -4, 1.4, '#6aa5d9')
        );
      },
      function () {  // 4 结出红番茄
        return w(
          sky('#f2f9ee') +
          ground('#c9a06b', 30) +
          pa('M-20 30 Q0 8 22 30 Q4 14 -16 30 Z', '#5b8f4b') +
          ln(-4, 26, -4, -6, '#3a6b34', 4) +
          cc(-4, -14, 2, '#3ebf73') + cc(-13, -18, 2, '#3ebf73') + cc(5, -18, 2, '#3ebf73') +
          cc(-4, 0, 6, '#e74c3c') + cc(-14, -4, 5, '#e74c3c') + cc(6, -4, 5, '#e74c3c') +
          cc(-10, 6, 5, '#e74c3c') + cc(2, 8, 5, '#e74c3c')
        );
      }
    ]
  };

  /* ============================================================
     序列 7：逛动物园（5 步）—— 买票 → 看大象 → 喂小羊 → 看猴子 → 回家
     ============================================================ */
  var zoo = {
    id: 'zoo',
    name: '逛动物园',
    steps: [
      function () {  // 1 买门票进园
        return w(
          sky('#e8f6ff') +
          ground('#b8dfb0', 34) +
          rc(-40, -8, 80, 42, '#f7c948') +
          pa('M-40 -8 Q0 -34 40 -8 Z', '#f7c948') +
          rc(-14, 2, 28, 32, '#8a6420') +
          cc(0, 14, 3, '#ffe177') +
          rc(-24, 16, 12, 6, '#ffffff') +
          kid(22, 22, '#5b8def') +
          sunm(-28, -30)
        );
      },
      function () {  // 2 看大象
        return w(
          sky('#e8f6ff') +
          ground('#b8dfb0', 34) +
          rc(-4, -22, 16, 34, '#a9b4c4') +
          cc(-18, -26, 9, '#a9b4c4') + cc(-22, -28, 4, '#c9d2de') +
          ps('M-12 -20 Q0 -8 -4 2', '#a9b4c4', 4) +
          rc(-12, 12, 4, 16, '#a9b4c4') + rc(4, 12, 4, 16, '#a9b4c4') +
          kid(26, 22, '#5b8def')
        );
      },
      function () {  // 3 喂小羊
        return w(
          sky('#e8f6ff') +
          ground('#b8dfb0', 34) +
          ce(30, 10, 10, 8, '#f3f6fa') +
          cc(16, 0, 6, '#f3f6fa') + cc(13, -4, 2, '#f3f6fa') + cc(20, -4, 2, '#f3f6fa') +
          rc(22, 14, 3, 14, '#d9dde4') + rc(34, 14, 3, 14, '#d9dde4') +
          cc(22, 14, 1.4, '#2b2b2b') + cc(28, 14, 1.4, '#2b2b2b') +
          kid(-22, 20, '#f7c948') +
          rc(-12, 12, 10, 4, '#3ebf73')
        );
      },
      function () {  // 4 看猴子（放大猴身/长尾/攀枝，提升辨识度）
        return w(
          sky('#e8f6ff') +
          ground('#b8dfb0', 34) +
          treem(-28, 12, '#8a6420', '#5b8f6b') +
          ce(-8, -4, 8, 10, '#b98a4e') +            // 猴身
          cc(-16, -17, 6, '#b98a4e') +              // 猴头
          cc(-18, -19, 1.6, '#2b2b2b') + cc(-14, -19, 1.6, '#2b2b2b') +
          ce(-13, -14, 2.5, 3, '#d99a5b') +         // 猴耳
          ps('M-10 -2 Q8 2 2 16', '#b98a4e', 3) +   // 长尾
          ln(-14, -8, -6, -14, '#b98a4e', 3) +       // 攀枝手臂
          ln(-2, -8, 6, -14, '#b98a4e', 3) +
          kid(22, 22, '#5b8def') +
          ln(16, 12, 24, 8, '#5b8def', 2)           // 手抬起指猴
        );
      },
      function () {  // 5 开心回家（气球放大更可辨）
        return w(
          sky('#e8f6ff') +
          greenHill('#a8d8a0') +
          kid(-4, 24, '#f1927e') +
          cc(6, -12, 3.5, '#e74c3c') + cc(0, -4, 3.5, '#ffd23f') + cc(-6, 4, 3.5, '#4aa8ff') +
          ln(6, -8, 0, 16, '#e74c3c', 1.5) + ln(0, 0, -4, 16, '#ffd23f', 1.5) + ln(-6, 8, -5, 16, '#4aa8ff', 1.5) +
          bird(-26, -28, '#6aa5d9') + sunm(28, -30)
        );
      }
    ]
  };

  /* ============================================================
     序列 8：露营之夜（5 步）—— 搭帐篷 → 点篝火 → 烤棉花糖 → 数星星 → 入睡
     ============================================================ */
  var camp = {
    id: 'camp',
    name: '露营之夜',
    steps: [
      function () {  // 1 搭帐篷
        return w(
          sky('#ffe3b3') +
          greenHill('#a8d8a0') +
          pa('M0 -26 L-26 22 L26 22 Z', '#e76f51') +
          pa('M0 -26 L-10 22 L10 22 Z', '#e0b35c') +
          ln(0, -26, 0, -36, '#a9824f', 3) +
          pa('M0 -38 L4 -32 L-4 -32 Z', '#e74c3c') +
          cc(-18, 14, 2.5, '#c9d2de') + cc(-14, 8, 2, '#c9d2de')
        );
      },
      function () {  // 2 点起篝火
        return w(
          sky('#ffd9a0') +
          greenHill('#9db47a') +
          rc(-7, 6, 14, 4, '#5a3a2a') + rc(-12, 6, 4, 12, '#5a3a2a') + rc(8, 6, 4, 12, '#5a3a2a') +
          pa('M0 -2 Q-8 2 -9 8 Q-4 6 0 10 Q4 6 9 8 Q8 2 0 -2 Z', '#ff8a3d') +
          pa('M0 -10 Q-5 -6 -6 -2 Q-2 -4 0 0 Q2 -4 6 -2 Q5 -6 0 -10 Z', '#ffd23f') +
          cc(-24, -24, 2, '#c9d2de')
        );
      },
      function () {  // 3 烤棉花糖
        return w(
          sky('#26334d') +
          greenHill('#76845f') +
          pa('M0 10 Q-8 14 -9 22 Q-4 16 0 20 Q4 16 9 22 Q8 14 0 10 Z', '#ff8a3d') +
          cc(0, 6, 2, '#ffd23f') +
          ln(-16, 26, -8, 4, '#8a6420', 3) +
          cc(-8, 0, 5, '#ffffff') +
          cc(-24, -24, 2, '#c9d2de') + cc(-18, -30, 1.4, '#c9d2de') + cc(-30, -30, 1.4, '#c9d2de') +
          star(10, 4, 5, '#ffd23f')
        );
      },
      function () {  // 4 数星星
        return w(
          sky('#1b2740') +
          greenHill('#76845f') +
          star(12, 5, 5, '#ffd23f') + star(7, 3, 5, '#ffe98a') +
          cc(-24, -20, 2, '#ffe98a') + cc(-30, -34, 1.4, '#ffe98a') + cc(-16, -36, 1.4, '#ffe98a') +
          cc(26, -30, 1.8, '#ffe98a') + cc(32, -18, 1.4, '#ffe98a') +
          moonArc(8, -34) +
          kid(-10, 16, '#5b8def')
        );
      },
      function () {  // 5 甜甜入睡
        return w(
          sky('#141d33') +
          greenHill('#6b7956') +
          pa('M0 -32 L-30 22 L30 22 Z', '#7a4ea3') +
          pa('M0 -32 L-12 22 L12 22 Z', '#5d3a80') +
          pa('M-26 16 Q0 4 26 16 Q0 32 -26 16 Z', '#3e5f8a') +
          cc(-8, 8, 6, '#ffce9e') +
          pa('M-14 10 A6 6 0 0 1 -2 10 Z', '#5a3a2a') +
          cc(-10, 7, 1.2, '#2b2b2b') + cc(-6, 7, 1.2, '#2b2b2b') +
          moonArc(22, -34) +
          cc(-20, -22, 1.6, '#ffe98a') + cc(26, -16, 1.6, '#ffe98a') + cc(8, -24, 1.2, '#ffe98a')
        );
      }
    ]
  };

  /* ============================================================
     导出（挂 window.STORIES）
     ============================================================ */
  window.STORIES = [morning, picnic, kite, rainSeq, noodle, tomato, zoo, camp];
})();