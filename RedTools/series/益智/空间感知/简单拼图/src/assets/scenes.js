/* ============================================================
   简单拼图 — 场景元素库（SVG 程序化生成，Chrome 61 基线经典脚本）
   ------------------------------------------------------------
   说明：
   - 定义 window.SCENES：8 个正方形场景（400×400）
     海边/森林/太空/花园/农场/海底/冬日/城堡
   - 每个场景 = { id, name, w, h, bg, elements }
     - w/h：SVG 视口（400×400，正方形）
     - bg：背景 SVG 字符串（全视口坐标，含渐变 defs）
     - elements：6~9 个元素，铺满画面、互不重叠
   - 每个元素 = { id, x, y, s, draw }
     - x/y：元素中心（视口坐标）；s：缩放
     - draw(opt)：返回以 (0,0) 为中心的内层 SVG 字符串，
       由渲染层套 <g transform> 定位（x/y/s）
   - 约束：ES2017 经典脚本（var+function）、无内联事件/eval、
     无外部资源；所有图形由基础形状代码生成（童趣扁平风糖果色）
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 形状小工具 ---------- */
  function c(r, f, extra) { return '<circle r="' + r + '" fill="' + f + '"' + (extra || '') + '/>'; }
  /* 带偏移的圆（cx/cy 定位，用于非原点的小圆） */
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
  /* 云朵 */
  function cloudDraw(opt) {
    var f = opt.fill;
    return ce(0, 0, 26, 14, f) + ce(-14, 4, 14, 9, f) + ce(14, 4, 14, 9, f) + ce(-24, 6, 9, 6, f) + ce(24, 6, 9, 6, f);
  }

  /* ============================================================
     场景 1：海边
     ============================================================ */
  var ocean = {
    id: 'ocean',
    name: '海边',
    w: 400, h: 400,
    bg: '<defs>' +
      '<linearGradient id="ptSky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#6db9ff"/><stop offset="1" stop-color="#cfeaff"/></linearGradient>' +
      '<linearGradient id="ptSea" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#3aa7e8"/><stop offset="1" stop-color="#1c6fb8"/></linearGradient>' +
      '</defs>' +
      '<rect x="0" y="0" width="400" height="210" fill="url(#ptSky)"/>' +
      '<rect x="0" y="210" width="400" height="190" fill="url(#ptSea)"/>' +
      '<path d="M335 188 L343 188 L339 174 Z" fill="rgba(255,255,255,0.7)"/>' +
      '<line x1="339" y1="188" x2="339" y2="176" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>' +
      '<path d="M60 260 q8 -5 16 0 q8 5 16 0" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>' +
      '<path d="M220 280 q8 -5 16 0 q8 5 16 0" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="2"/>' +
      '<path d="M150 315 q8 -5 16 0 q8 5 16 0" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>' +
      '<ellipse cx="100" cy="235" rx="36" ry="6" fill="rgba(255,255,255,0.35)"/>' +
      '<ellipse cx="280" cy="265" rx="48" ry="7" fill="rgba(255,255,255,0.3)"/>' +
      '<ellipse cx="180" cy="300" rx="28" ry="5" fill="rgba(255,255,255,0.25)"/>' +
      '<circle cx="330" cy="40" r="1.5" fill="rgba(255,255,255,0.7)"/>' +
      '<circle cx="220" cy="130" r="1.5" fill="rgba(255,255,255,0.55)"/>' +
      '<circle cx="40" cy="170" r="1.5" fill="rgba(255,255,255,0.5)"/>' +
      '<circle cx="290" cy="170" r="1.5" fill="rgba(255,255,255,0.5)"/>' +
      '<path d="M0 330 Q80 322 160 330 T360 328 T400 330 L400 400 L0 400 Z" fill="#f7e2ae"/>',
    elements: [
      { id: 'sun', x: 55, y: 50, s: 1,
        draw: function (opt) {
          return c(20, opt.fill) +
            ln(0, -28, 0, -22, opt.fill, 4) + ln(0, 28, 0, 22, opt.fill, 4) +
            ln(-28, 0, -22, 0, opt.fill, 4) + ln(28, 0, 22, 0, opt.fill, 4) +
            ln(-20, -20, -15, -15, opt.fill, 4) + ln(20, -20, 15, -15, opt.fill, 4) +
            ln(-20, 20, -15, 15, opt.fill, 4) + ln(20, 20, 15, 15, opt.fill, 4);
        }
      },
      { id: 'cloud', x: 175, y: 55, s: 1,
        draw: function (opt) { return cloudDraw(opt); }
      },
      { id: 'seagull', x: 95, y: 120, s: 1,
        draw: function (opt) {
          return pa('M-22 0 Q-14 -14 0 -8 Q14 -14 22 0 Q12 -2 0 0 Q-12 -2 -22 0 Z', opt.fill) +
            ln(0, 0, 0, 8, '#ff9c4a', 3);
        }
      },
      { id: 'palm', x: 60, y: 245, s: 1,
        draw: function (opt) {
          return pa('M-4 24 Q0 6 3 -8 Q-2 6 -4 24 Z', '#a05a2c') +
            pa('M0 -6 Q-30 -12 -32 6 Q-26 8 -17 1 Q-18 10 -13 15 Q-6 7 0 -6 Z', opt.fill) +
            pa('M0 -6 Q30 -12 32 6 Q26 8 17 1 Q18 10 13 15 Q6 7 0 -6 Z', opt.fill) +
            cc(-14, 19, 3.5, '#ffd23f');
        }
      },
      { id: 'boat', x: 230, y: 245, s: 1,
        draw: function (opt) {
          return '<g transform="rotate(8)">' +
            pa('M-28 10 L-18 -16 L0 -16 L18 10 Z', '#ffffff') +
            pa('M-18 -16 L-5 10 L0 10 L0 -16 Z', opt.fill) +
            pa('M-32 10 L-12 16 L24 16 L34 10 Z', '#8a4a22') +
            ln(-7, 2, -2, 2, '#ffffff', 2) + '</g>';
        }
      },
      { id: 'fish', x: 320, y: 205, s: 1,
        draw: function (opt) {
          return '<g transform="scale(-1,1)">' +
            pa('M18 0 L-2 -14 L-2 14 Z', opt.fill) +
            ce(0, 0, 16, 10, opt.fill) +
            ln(-4, -9, -4, 9, 'rgba(255,255,255,0.65)', 3) +
            cc(8, -3, 2, '#2b2b2b') + '</g>';
        }
      },
      { id: 'crab', x: 140, y: 348, s: 1,
        draw: function (opt) {
          return ce(0, 2, 16, 11, opt.fill) +
            cc(-24, -4, 6, opt.fill) + cc(24, -4, 6, opt.fill) +
            ln(-14, 8, -22, 14, opt.fill, 3) + ln(-8, 10, -14, 17, opt.fill, 3) +
            ln(14, 8, 22, 14, opt.fill, 3) + ln(8, 10, 14, 17, opt.fill, 3) +
            ln(-8, -8, -8, -16, opt.fill, 3) + ln(8, -8, 8, -16, opt.fill, 3) +
            cc(-8, -18, 3, '#2b2b2b') + cc(8, -18, 3, '#2b2b2b') +
            pa('M-4 4 L0 -2 L4 4 Z', '#2b2b2b');
        }
      },
      { id: 'shell', x: 285, y: 355, s: 1,
        draw: function (opt) {
          return pa('M-20 0 A20 20 0 0 1 20 0 Z', opt.fill) +
            ln(-12, -10, -4, -20, 'rgba(255,255,255,0.6)', 2) +
            ln(-4, -8, 0, -16, 'rgba(255,255,255,0.6)', 2) +
            ln(4, -8, 4, -16, 'rgba(255,255,255,0.6)', 2) +
            ln(12, -10, 10, -19, 'rgba(255,255,255,0.6)', 2);
        }
      },
      { id: 'starfish', x: 370, y: 300, s: 1,
        draw: function (opt) {
          return star(20, 8, 5, opt.fill) +
            cc(0, -12, 2.5, '#ffffff') + cc(11, 6, 2.5, '#ffffff') + cc(-11, 6, 2.5, '#ffffff');
        }
      }
    ]
  };

  /* ============================================================
     场景 2：森林
     ============================================================ */
  var forest = {
    id: 'forest',
    name: '森林',
    w: 400, h: 400,
    bg: '<defs>' +
      '<linearGradient id="ftSky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#8ad4ff"/><stop offset="1" stop-color="#d8f5d8"/></linearGradient>' +
      '</defs>' +
      '<rect x="0" y="0" width="400" height="400" fill="url(#ftSky)"/>' +
      '<ellipse cx="120" cy="60" rx="34" ry="20" fill="rgba(255,255,255,0.7)"/>' +
      '<ellipse cx="320" cy="85" rx="38" ry="15" fill="rgba(255,255,255,0.6)"/>' +
      '<path d="M0 250 Q100 235 200 250 T400 246 L400 400 L0 400 Z" fill="#6fc46f"/>' +
      '<path d="M0 285 Q160 272 320 285 T400 280 L400 400 L0 400 Z" fill="#4da64d"/>' +
      '<path d="M0 325 Q120 315 240 325 T400 322 L400 400 L0 400 Z" fill="#3f9e4f"/>',
    elements: [
      { id: 'tree', x: 65, y: 175, s: 1,
        draw: function (opt) {
          return rc(-4, 8, 8, 22, '#a05a2c') +
            pa('M0 -30 L-26 12 L26 12 Z', opt.fill) +
            pa('M0 -46 L-19 2 L19 2 Z', '#2f9e5e') +
            cc(-8, -8, 3.5, '#ff5b5b') + cc(7, 0, 3, '#ff5b5b');
        }
      },
      { id: 'flower', x: 165, y: 255, s: 1,
        draw: function (opt) {
          var s = ln(0, -2, 0, 16, '#3fae6c', 3) + ce(-5, 12, 4, 2.5, '#3fae6c');
          for (var i = 0; i < 6; i++) {
            var a = (i * 2 * Math.PI) / 6;
            s += ce(Math.cos(a) * 8, Math.sin(a) * 8 - 8, 6, 5, opt.fill);
          }
          return s + ce(0, -8, 4.5, 4.5, '#ffd23f');
        }
      },
      { id: 'mushroom', x: 240, y: 290, s: 1,
        draw: function (opt) {
          return rc(-6, 6, 12, 14, '#ffe8d0') +
            pa('M-18 -6 A18 18 0 0 1 18 -6 Z', opt.fill) +
            cc(-7, -14, 3, '#ffffff') + cc(6, -10, 2.5, '#ffffff') + cc(-1, -2, 2.5, '#ffffff');
        }
      },
      { id: 'butterfly', x: 290, y: 95, s: 1,
        draw: function (opt) {
          return ce(-9, -4, 11, 15, opt.fill, ' transform="rotate(-20 -9 -4)"') +
            ce(9, -4, 11, 15, opt.fill, ' transform="rotate(20 9 -4)"') +
            ce(0, 0, 2.5, 14, '#5a3a2a') +
            cc(-9, -4, 2.5, '#ffffff') + cc(9, -4, 2.5, '#ffffff');
        }
      },
      { id: 'bird', x: 115, y: 85, s: 1,
        draw: function (opt) {
          return ce(0, 0, 12, 9, opt.fill) +
            pa('M8 -4 L18 -1 L8 3 Z', '#ff9c4a') +
            pa('M-4 -7 L-2 -13 L0 -7 Z', '#ffd23f') +
            cc(6, -2, 2, '#2b2b2b');
        }
      },
      { id: 'squirrel', x: 370, y: 225, s: 1,
        draw: function (opt) {
          return pa('M0 -2 Q-26 -8 -24 -24 Q-22 -34 -12 -30 Q-14 -20 -4 -14 Z', opt.fill) +
            ce(0, 6, 10, 8, opt.fill) +
            cc(10, -2, 7, opt.fill) +
            pa('M-2 -6 L0 -12 L2 -6 Z', '#8a4a22') +
            cc(13, -4, 2, '#2b2b2b') +
            cc(-10, 10, 3, '#8a4a22');
        }
      },
      { id: 'rabbit', x: 315, y: 260, s: 1,
        draw: function (opt) {
          return ce(-6, -14, 5, 12, opt.fill, ' transform="rotate(-10 -6 -14)"') +
            ce(6, -14, 5, 12, opt.fill, ' transform="rotate(10 6 -14)"') +
            ce(-6, -14, 2.5, 7, '#ffc4d9', ' transform="rotate(-10 -6 -14)"') +
            ce(6, -14, 2.5, 7, '#ffc4d9', ' transform="rotate(10 6 -14)"') +
            c(0, 0, 11, opt.fill) +
            cc(-4, -3, 2, '#2b2b2b') + cc(4, -3, 2, '#2b2b2b') +
            pa('M-2 3 L0 6 L2 3 Z', '#ff9c8a') +
            ln(-10, 2, -16, -2, '#ff9c8a', 2) + ln(10, 2, 16, -2, '#ff9c8a', 2);
        }
      },
      { id: 'fox', x: 75, y: 285, s: 1,
        draw: function (opt) {
          return pa('M-8 -10 L-18 10 L-2 4 Z', opt.fill) +
            pa('M8 -10 L18 10 L2 4 Z', opt.fill) +
            pa('M-4 -12 L0 -22 L4 -12 Z', '#ffffff') +
            pa('M-6 -8 L-14 2 L-4 0 Z', '#2b2b2b') +
            pa('M6 -8 L14 2 L4 0 Z', '#2b2b2b') +
            pa('M-4 0 L0 12 L4 0 Z', opt.fill) +
            c(0, 4, 5, '#ffffff') + cc(0, 6, 2, '#2b2b2b') +
            cc(-6, -6, 1.8, '#2b2b2b') + cc(6, -6, 1.8, '#2b2b2b');
        }
      },
      { id: 'owl', x: 200, y: 110, s: 1,
        draw: function (opt) {
          return pa('M-6 -12 L0 -24 L6 -12 Z', opt.fill) +
            pa('M0 -8 L-22 14 L22 14 Z', opt.fill) +
            ce(-8, 0, 8, 8, '#ffffff') + ce(8, 0, 8, 8, '#ffffff') +
            cc(-8, 0, 4, '#2b2b2b') + cc(8, 0, 4, '#2b2b2b') +
            pa('M-3 10 L3 10 L0 16 Z', '#ff9c4a') +
            pa('M-16 8 L-22 14 L-18 10 Z', '#ffd23f') + pa('M16 8 L22 14 L18 10 Z', '#ffd23f');
        }
      }
    ]
  };

  /* ============================================================
     场景 3：太空
     ============================================================ */
  var space = {
    id: 'space',
    name: '太空',
    w: 400, h: 400,
    bg: '<defs>' +
      '<linearGradient id="spSky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#1a1a4a"/><stop offset="1" stop-color="#3a3a7a"/></linearGradient>' +
      '</defs>' +
      '<rect x="0" y="0" width="400" height="400" fill="url(#spSky)"/>' +
      '<circle cx="55" cy="40" r="1.5" fill="#ffffff"/>' +
      '<circle cx="140" cy="80" r="2" fill="#ffffff"/>' +
      '<circle cx="220" cy="30" r="1.5" fill="#ffffff"/>' +
      '<circle cx="300" cy="60" r="2" fill="#ffffff"/>' +
      '<circle cx="380" cy="90" r="1.5" fill="#ffffff"/>' +
      '<circle cx="430" cy="200" r="2" fill="#ffffff"/>' +
      '<circle cx="45" cy="240" r="2" fill="#ffffff"/>' +
      '<circle cx="160" cy="320" r="1.5" fill="#ffffff"/>' +
      '<circle cx="370" cy="330" r="1.5" fill="#ffffff"/>' +
      '<ellipse cx="200" cy="352" rx="170" ry="36" fill="rgba(120,120,180,0.35)"/>',
    elements: [
      { id: 'star-sun', x: 65, y: 85, s: 1,
        draw: function (opt) {
          return c(18, opt.fill) + ln(0, -26, 0, -20, opt.fill, 4) + ln(0, 26, 0, 20, opt.fill, 4) +
            ln(-26, 0, -20, 0, opt.fill, 4) + ln(26, 0, 20, 0, opt.fill, 4) +
            ln(-18, -18, -14, -14, opt.fill, 4) + ln(18, -18, 14, -14, opt.fill, 4) +
            ln(-18, 18, -14, 14, opt.fill, 4) + ln(18, 18, 14, 14, opt.fill, 4) +
            c(26, 'rgba(255,210,63,0.3)');
        }
      },
      { id: 'planet', x: 205, y: 95, s: 1,
        draw: function (opt) {
          return c(20, opt.fill) +
            cc(-8, -6, 4, '#c4e8ff') + cc(6, 8, 3, '#c4e8ff') + cc(-2, 6, 2, '#c4e8ff') +
            '<ellipse cx="0" cy="0" rx="30" ry="9" fill="none" stroke="#c4e8ff" stroke-width="3" transform="rotate(-15)"/>';
        }
      },
      { id: 'rocket', x: 135, y: 240, s: 1,
        draw: function (opt) {
          return pa('M0 -34 L-10 -20 L10 -20 Z', opt.fill) +
            rc(-10, -20, 20, 24, opt.fill) +
            pa('M-10 4 L-16 12 L-10 8 Z', '#4a90c4') + pa('M10 4 L16 12 L10 8 Z', '#4a90c4') +
            cc(0, -12, 5, '#c4e8ff') +
            pa('M-5 4 L0 12 L5 4 Z', '#ff9c4a') +
            pa('M-9 10 L0 24 L9 10 Z', '#ffd23f');
        }
      },
      { id: 'astronaut', x: 320, y: 245, s: 1,
        draw: function (opt) {
          return ce(0, 4, 14, 16, '#e8e8e8') +
            c(0, -14, 9, opt.fill) +
            cc(2, -15, 6, '#7ec9ff') +
            rc(-2, -2, 4, 8, '#4a90c4') +
            rc(-14, 2, 5, 10, '#e8e8e8') + rc(9, 2, 5, 10, '#e8e8e8') +
            ln(16, -4, 24, -12, '#e8e8e8', 5);
        }
      },
      { id: 'satellite', x: 385, y: 110, s: 1,
        draw: function (opt) {
          return rc(-4, -6, 8, 12, '#e8e8e8') +
            rc(-22, -2, 12, 6, '#4a90c4') + rc(10, -2, 12, 6, '#4a90c4') +
            cc(0, -12, 6, '#ffd23f') +
            ln(0, -8, 0, -12, '#8a8a8a', 2) +
            ln(-10, 4, 10, 4, '#8a8a8a', 2);
        }
      },
      { id: 'moon', x: 275, y: 195, s: 1,
        draw: function (opt) {
          return c(18, opt.fill) +
            cc(-6, -6, 3.5, '#e8d8b0') + cc(7, 4, 3, '#e8d8b0') + cc(-2, 8, 2, '#e8d8b0');
        }
      },
      { id: 'ufo', x: 355, y: 75, s: 1,
        draw: function (opt) {
          return pa('M-12 -6 A12 12 0 0 1 12 -6 Z', '#c4e8ff') +
            ce(0, -2, 20, 8, opt.fill) +
            cc(-10, -2, 2, '#ff5b8a') + cc(0, -1, 2, '#7ec94f') + cc(10, -2, 2, '#ffd23f') +
            pa('M-8 2 L-20 12 L20 12 L8 2 Z', 'rgba(255,240,150,0.5)');
        }
      },
      { id: 'comet', x: 65, y: 300, s: 1,
        draw: function (opt) {
          return c(7, opt.fill) +
            pa('M-6 6 L-28 22 L-6 12 Z', 'rgba(255,210,63,0.5)') +
            cc(3, -3, 2, '#ffffff');
        }
      },
      { id: 'star2', x: 175, y: 305, s: 1,
        draw: function (opt) {
          return star(16, 5, 4, opt.fill);
        }
      }
    ]
  };

  /* ============================================================
     场景 4：花园
     ============================================================ */
  var garden = {
    id: 'garden',
    name: '花园',
    w: 400, h: 400,
    bg: '<defs>' +
      '<linearGradient id="gdSky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#8ad4ff"/><stop offset="1" stop-color="#fff0e8"/></linearGradient>' +
      '</defs>' +
      '<rect x="0" y="0" width="400" height="400" fill="url(#gdSky)"/>' +
      '<ellipse cx="120" cy="55" rx="34" ry="18" fill="rgba(255,255,255,0.7)"/>' +
      '<ellipse cx="350" cy="40" rx="28" ry="14" fill="rgba(255,255,255,0.6)"/>' +
      '<path d="M0 250 Q120 238 240 250 T400 246 L400 400 L0 400 Z" fill="#7ec97a"/>' +
      '<path d="M0 285 Q160 273 320 285 T400 280 L400 400 L0 400 Z" fill="#6fb85a"/>' +
      '<path d="M0 325 Q100 316 200 325 T400 322 L400 400 L0 400 Z" fill="#5aa84e"/>',
    elements: [
      { id: 'sun3', x: 55, y: 55, s: 1,
        draw: function (opt) {
          return c(18, opt.fill) + ln(0, -26, 0, -21, opt.fill, 4) + ln(0, 26, 0, 21, opt.fill, 4) +
            ln(-26, 0, -21, 0, opt.fill, 4) + ln(26, 0, 21, 0, opt.fill, 4);
        }
      },
      { id: 'bee', x: 155, y: 95, s: 1,
        draw: function (opt) {
          return ce(-8, 2, 5, 7, 'rgba(255,255,255,0.8)', ' transform="rotate(-30 -8 2)"') +
            ce(8, 2, 5, 7, 'rgba(255,255,255,0.8)', ' transform="rotate(30 8 2)"') +
            ce(0, 0, 10, 7, opt.fill) +
            ln(-4, -5, -4, 5, '#2b2b2b', 2.5) + ln(3, -6, 3, 6, '#2b2b2b', 2.5) +
            cc(10, 0, 1.8, '#2b2b2b') +
            pa('M-10 0 L-16 -2 L-14 2 Z', '#2b2b2b');
        }
      },
      { id: 'butterfly2', x: 270, y: 95, s: 1,
        draw: function (opt) {
          return ce(-10, -2, 12, 16, opt.fill, ' transform="rotate(-15 -10 -2)"') +
            ce(10, -2, 12, 16, opt.fill, ' transform="rotate(15 10 -2)"') +
            ce(0, 2, 2.5, 13, '#5a3a2a') +
            cc(-10, -2, 2.5, '#ffffff') + cc(10, -2, 2.5, '#ffffff');
        }
      },
      { id: 'flower2', x: 75, y: 185, s: 1,
        draw: function (opt) {
          var s = ln(0, -2, 0, 16, '#3fae6c', 3) + ce(-5, 12, 4, 2.5, '#3fae6c');
          for (var i = 0; i < 6; i++) {
            var a = (i * 2 * Math.PI) / 6;
            s += ce(Math.cos(a) * 8, Math.sin(a) * 8 - 8, 6, 5, opt.fill);
          }
          return s + ce(0, -8, 4.5, 4.5, '#ffd23f');
        }
      },
      { id: 'tree2', x: 305, y: 190, s: 1,
        draw: function (opt) {
          return rc(-4, 8, 8, 18, '#a05a2c') +
            c(0, -10, 20, opt.fill) +
            cc(0, -14, 5, '#ffffff') + cc(-10, -4, 4, '#ffffff');
        }
      },
      { id: 'watering', x: 385, y: 245, s: 1,
        draw: function (opt) {
          return rc(-10, -2, 22, 14, opt.fill, 4) +
            rc(10, -8, 14, 8, '#7a9ab8', 3) +
            pa('M-10 4 L-16 14 L-8 14 Z', '#7a9ab8') +
            pa('M6 -4 Q16 -10 20 -4 Q16 -2 10 -2 Z', '#5a7a9a') +
            cc(-17, 17, 1.5, '#8ad4ff') + cc(-13, 21, 1.5, '#8ad4ff') + cc(-21, 21, 1.5, '#8ad4ff');
        }
      },
      { id: 'snail', x: 340, y: 290, s: 1,
        draw: function (opt) {
          return pa('M-14 6 Q-6 -2 4 4 Q10 8 6 10 Q0 12 -10 8 Z', '#e8d8a0') +
            pa('M-2 0 A12 12 0 0 1 -2 -24 A12 12 0 0 1 -2 0 Z', opt.fill) +
            pa('M-2 -6 A6 6 0 0 1 -2 -18 A6 6 0 0 1 -2 -6 Z', '#ffd9c4') +
            cc(-8, -12, 2, '#2b2b2b');
        }
      },
      { id: 'fence2', x: 185, y: 305, s: 1,
        draw: function (opt) {
          return ln(-28, 0, -28, -18, '#a08050', 4) + ln(0, 0, 0, -18, '#a08050', 4) +
            ln(28, 0, 28, -18, '#a08050', 4) +
            ln(-32, -4, 32, -4, opt.fill, 3) + ln(-32, 3, 32, 3, opt.fill, 3);
        }
      }
    ]
  };

  /* ============================================================
     场景 5：农场
     ============================================================ */
  var farm = {
    id: 'farm',
    name: '农场',
    w: 400, h: 400,
    bg: '<defs>' +
      '<linearGradient id="fmSky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#8ad4ff"/><stop offset="1" stop-color="#fff0d0"/></linearGradient>' +
      '</defs>' +
      '<rect x="0" y="0" width="400" height="400" fill="url(#fmSky)"/>' +
      '<rect x="0" y="210" width="400" height="190" fill="#8fc96a"/>' +
      '<path d="M0 260 L400 248 L400 400 L0 400 Z" fill="#6fb85a"/>' +
      '<path d="M0 315 Q120 303 240 315 T400 312 L400 400 L0 400 Z" fill="#e8d0a0"/>',
    elements: [
      { id: 'barn', x: 75, y: 185, s: 1,
        draw: function (opt) {
          return pa('M-34 2 L0 -26 L34 2 Z', '#a83a2f') +
            rc(-28, 2, 56, 30, opt.fill) +
            rc(-16, 10, 12, 22, '#8a4a22') +
            cc(-10, 21, 1.5, '#ffd23f') +
            rc(10, 6, 10, 8, '#ffe8d0');
        }
      },
      { id: 'apple', x: 205, y: 145, s: 1,
        draw: function (opt) {
          return rc(-3, 8, 6, 16, '#8a4a22') +
            pa('M0 -28 L-24 10 L24 10 Z', '#3fae6c') +
            pa('M0 -36 L-16 2 L16 2 Z', '#2f9e5e') +
            cc(-8, -10, 3.5, opt.fill) + cc(8, -4, 3, opt.fill) + cc(-4, 2, 3, opt.fill);
        }
      },
      { id: 'windmill', x: 355, y: 115, s: 1,
        draw: function (opt) {
          return pa('M-10 16 L10 16 L6 -14 L-6 -14 Z', '#e8e0d0') +
            pa('M-6 -14 L6 -14 L0 -22 Z', '#d94a3f') +
            cc(0, -16, 2.5, '#8a4a22') +
            rc(-1.5, -26, 3, 12, '#8a6a4a') + rc(-1.5, 8, 3, 12, '#8a6a4a') +
            rc(-26, -1.5, 12, 3, '#8a6a4a') + rc(10, -1.5, 12, 3, '#8a6a4a');
        }
      },
      { id: 'cow', x: 190, y: 255, s: 1,
        draw: function (opt) {
          return ce(0, 2, 22, 12, opt.fill) +
            ce(22, -4, 9, 7, opt.fill) +
            cc(27, -5, 2, '#2b2b2b') +
            pa('M18 -10 L20 -16 L24 -10 Z', '#2b2b2b') +
            pa('M26 -10 L28 -16 L32 -10 Z', '#2b2b2b') +
            ln(-14, 12, -14, 22, '#a05a2c', 4) + ln(-4, 13, -4, 22, '#a05a2c', 4) +
            ln(8, 12, 8, 22, '#a05a2c', 4) + ln(16, 11, 16, 22, '#a05a2c', 4) +
            ce(-8, -3, 6, 4, '#2b2b2b') + ce(2, 2, 5, 3.5, '#2b2b2b');
        }
      },
      { id: 'sheep', x: 295, y: 255, s: 1,
        draw: function (opt) {
          return ce(-8, -3, 12, 9, opt.fill) + ce(4, -7, 11, 8, opt.fill) +
            ce(12, 3, 10, 8, opt.fill) + ce(-2, 6, 12, 8, opt.fill) +
            ce(20, -4, 6, 5, '#4a3a2a') + cc(23, -5, 1.5, '#2b2b2b') +
            ln(-14, 10, -16, 18, '#4a3a2a', 3) + ln(6, 11, 6, 19, '#4a3a2a', 3) +
            pa('M-10 -6 L-16 -10 L-10 -12 Z', '#2b2b2b');
        }
      },
      { id: 'chicken', x: 120, y: 305, s: 1,
        draw: function (opt) {
          return c(0, 0, 9, opt.fill) +
            cc(9, -7, 6, opt.fill) +
            pa('M5 -12 L8 -18 L11 -12 Z', '#ff5b5b') +
            pa('M14 -8 L20 -6 L14 -4 Z', '#ff9c4a') +
            cc(12, -8, 1.5, '#2b2b2b') +
            ln(-5, 8, -7, 16, '#ff9c4a', 2.5) + ln(1, 8, -1, 16, '#ff9c4a', 2.5) +
            cc(-14, -2, 2, '#ffd23f');
        }
      },
      { id: 'duck', x: 255, y: 305, s: 1,
        draw: function (opt) {
          return ce(0, 2, 11, 8, opt.fill) +
            cc(10, -5, 6, opt.fill) +
            pa('M15 -7 L22 -4 L15 -2 Z', '#ff9c4a') +
            cc(13, -6, 1.5, '#2b2b2b') +
            ln(-6, 9, -8, 16, '#ff9c4a', 2.5) + ln(0, 9, -2, 16, '#ff9c4a', 2.5);
        }
      },
      { id: 'tractor', x: 355, y: 275, s: 1,
        draw: function (opt) {
          return rc(-24, -4, 22, 12, opt.fill) +
            rc(-18, -18, 16, 12, '#8a2a20') +
            rc(-14, -16, 8, 6, '#c4e8ff') +
            cc(12, 6, 10, '#2b2b2b') + cc(12, 6, 4, '#e8e8e8') +
            cc(-12, 8, 6, '#2b2b2b') + cc(-12, 8, 2.5, '#e8e8e8') +
            ln(6, -10, 10, -22, '#2b2b2b', 3) + cc(10, -24, 2.5, '#2b2b2b');
        }
      },
      { id: 'fence3', x: 60, y: 335, s: 1,
        draw: function (opt) {
          return ln(-30, 0, -30, -20, '#a08050', 5) + ln(0, 0, 0, -20, '#a08050', 5) +
            ln(30, 0, 30, -20, '#a08050', 5) +
            ln(-36, -4, 36, -4, opt.fill, 3) + ln(-36, 4, 36, 4, opt.fill, 3);
        }
      }
    ]
  };

  /* ============================================================
     场景 6：海底
     ============================================================ */
  var undersea = {
    id: 'undersea',
    name: '海底',
    w: 400, h: 400,
    bg: '<defs>' +
      '<linearGradient id="usSky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#1c6fb8"/><stop offset="1" stop-color="#0a3a6a"/></linearGradient>' +
      '</defs>' +
      '<rect x="0" y="0" width="400" height="400" fill="url(#usSky)"/>' +
      '<path d="M0 0 L40 0 L80 40 L40 60 Z" fill="rgba(255,255,255,0.08)"/>' +
      '<path d="M180 0 L220 0 L260 50 L220 60 Z" fill="rgba(255,255,255,0.06)"/>' +
      '<path d="M340 0 L380 0 L410 40 L370 50 Z" fill="rgba(255,255,255,0.08)"/>' +
      '<path d="M0 325 Q80 315 160 325 T360 322 T400 324 L400 400 L0 400 Z" fill="#0a2a50"/>' +
      '<ellipse cx="100" cy="120" rx="30" ry="5" fill="rgba(255,255,255,0.1)"/>' +
      '<ellipse cx="300" cy="230" rx="40" ry="6" fill="rgba(255,255,255,0.08)"/>',
    elements: [
      { id: 'fish2', x: 105, y: 150, s: 1,
        draw: function (opt) {
          return pa('M18 0 L-2 -14 L-2 14 Z', opt.fill) +
            ce(0, 0, 16, 10, opt.fill) +
            ln(-4, -9, -4, 9, 'rgba(255,255,255,0.65)', 3) +
            cc(8, -3, 2, '#2b2b2b');
        }
      },
      { id: 'jellyfish', x: 160, y: 85, s: 1,
        draw: function (opt) {
          return pa('M-14 -2 A14 14 0 0 1 14 -2 Z', opt.fill, ' opacity="0.9"') +
            ln(-9, 0, -11, 12, 'rgba(255,255,255,0.7)', 2.5) +
            ln(-3, 0, -4, 14, 'rgba(255,255,255,0.7)', 2.5) +
            ln(3, 0, 4, 14, 'rgba(255,255,255,0.7)', 2.5) +
            ln(9, 0, 11, 12, 'rgba(255,255,255,0.7)', 2.5);
        }
      },
      { id: 'starfish2', x: 300, y: 95, s: 1,
        draw: function (opt) {
          return star(19, 8, 5, opt.fill) +
            cc(0, -11, 2, '#ffffff') + cc(10, 6, 2, '#ffffff') + cc(-10, 6, 2, '#ffffff');
        }
      },
      { id: 'bubble', x: 380, y: 85, s: 1,
        draw: function (opt) {
          return c(0, 0, 8, 'none', ' stroke="' + opt.fill + '" stroke-width="2.5"') +
            cc(-16, 8, 5, 'none', ' stroke="' + opt.fill + '" stroke-width="2"') +
            cc(14, -10, 4, 'none', ' stroke="' + opt.fill + '" stroke-width="2"') +
            cc(2, -2, 1.5, '#ffffff');
        }
      },
      { id: 'whale', x: 180, y: 215, s: 1,
        draw: function (opt) {
          return ce(0, 0, 24, 13, opt.fill) +
            pa('M-22 0 L-34 -8 L-30 4 Z', opt.fill) +
            pa('M18 -6 L22 -16 L26 -6 Z', opt.fill) +
            cc(10, -4, 2.5, '#2b2b2b') +
            ln(-6, 4, 6, 6, 'rgba(255,255,255,0.5)', 2.5) +
            cc(-10, -2, 3, 'rgba(255,255,255,0.5)');
        }
      },
      { id: 'octopus', x: 250, y: 270, s: 1,
        draw: function (opt) {
          return c(0, -4, 15, opt.fill) +
            ln(-10, 8, -14, 18, opt.fill, 4) + ln(-5, 9, -7, 19, opt.fill, 4) +
            ln(0, 9, 0, 20, opt.fill, 4) + ln(5, 9, 7, 19, opt.fill, 4) + ln(10, 8, 14, 18, opt.fill, 4) +
            cc(-5, -7, 2, '#2b2b2b') + cc(5, -7, 2, '#2b2b2b') +
            cc(0, -2, 2, '#ffffff') + cc(-8, 0, 1.5, '#ffffff');
        }
      },
      { id: 'turtle', x: 355, y: 235, s: 1,
        draw: function (opt) {
          return ce(-8, 4, 8, 4, '#6a8a5a') + ce(14, 4, 7, 4, '#6a8a5a') +
            ce(0, -2, 16, 12, opt.fill) +
            ce(-6, -3, 5, 4, '#4a8a5a') + ce(4, -5, 4, 3.5, '#4a8a5a') +
            cc(16, -6, 4.5, '#6a8a5a') + cc(18, -7, 1.5, '#2b2b2b') +
            ln(16, -2, 22, 4, '#6a8a5a', 3) +
            pa('M-10 -8 L-4 -14 L0 -8 Z', '#4a8a5a');
        }
      },
      { id: 'coral', x: 55, y: 285, s: 1,
        draw: function (opt) {
          return rc(-2, 2, 5, 18, '#e8a0a0') +
            pa('M-2 4 L-14 -2 L-8 -12 Z', opt.fill) +
            pa('M2 6 L12 -6 L4 -12 Z', opt.fill) +
            pa('M0 2 L-2 -12 L-8 -18 Z', opt.fill) +
            pa('M1 4 L6 -10 L12 -14 Z', opt.fill) +
            cc(-12, -14, 3, '#ffffff') + cc(8, -16, 2.5, '#ffffff');
        }
      },
      { id: 'seaweed', x: 385, y: 295, s: 1,
        draw: function (opt) {
          return pa('M0 20 Q-8 6 0 -6 Q-6 -14 2 -22 Q8 -10 4 0 Q10 8 2 20 Z', opt.fill) +
            pa('M14 22 Q6 12 12 2 Q18 -4 14 -12 Q22 -2 18 8 Q24 14 14 22 Z', '#2f9e5e') +
            pa('M-14 22 Q-20 14 -16 4 Q-10 -4 -14 -10 Q-8 0 -10 10 Q-6 16 -14 22 Z', '#2f9e5e');
        }
      }
    ]
  };

  /* ============================================================
     场景 7：冬日
     ============================================================ */
  var winter = {
    id: 'winter',
    name: '冬日',
    w: 400, h: 400,
    bg: '<defs>' +
      '<linearGradient id="wnSky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#9cc0e4"/><stop offset="1" stop-color="#dcefff"/></linearGradient>' +
      '</defs>' +
      '<rect x="0" y="0" width="400" height="400" fill="url(#wnSky)"/>' +
      '<circle cx="60" cy="45" r="2" fill="#ffffff"/>' +
      '<circle cx="180" cy="35" r="2" fill="#ffffff"/>' +
      '<circle cx="300" cy="60" r="2" fill="#ffffff"/>' +
      '<circle cx="360" cy="140" r="2" fill="#ffffff"/>' +
      '<circle cx="90" cy="150" r="2" fill="#ffffff"/>' +
      '<circle cx="40" cy="200" r="2" fill="#ffffff"/>' +
      '<ellipse cx="110" cy="55" rx="30" ry="12" fill="rgba(255,255,255,0.5)"/>' +
      '<ellipse cx="290" cy="120" rx="26" ry="10" fill="rgba(255,255,255,0.45)"/>' +
      '<path d="M0 240 Q120 225 240 240 T400 238 L400 400 L0 400 Z" fill="#ffffff"/>' +
      '<path d="M0 275 Q160 260 320 275 T400 270 L400 400 L0 400 Z" fill="#e8f4ff"/>' +
      '<path d="M0 320 Q100 310 200 320 T400 316 L400 400 L0 400 Z" fill="#d8ecf8"/>',
    elements: [
      { id: 'snowflake', x: 80, y: 90, s: 1,
        draw: function (opt) {
          return star(18, 6, 6, opt.fill);
        }
      },
      { id: 'deer', x: 190, y: 120, s: 1,
        draw: function (opt) {
          return ce(0, 4, 14, 10, opt.fill) +
            pa('M12 -2 L20 -12 L16 0 Z', opt.fill) +
            cc(22, -12, 4, opt.fill) +
            cc(24, -13, 1.5, '#2b2b2b') +
            pa('M20 -14 L18 -22 L22 -14 Z', '#8a4a22') + pa('M22 -14 L26 -20 L24 -12 Z', '#8a4a22') +
            ln(-6, 12, -10, 20, '#8a4a22', 3) + ln(2, 13, 0, 20, '#8a4a22', 3) +
            ln(10, 13, 10, 20, '#8a4a22', 3);
        }
      },
      { id: 'mitten', x: 315, y: 100, s: 1,
        draw: function (opt) {
          return pa('M-10 -2 Q-14 10 -6 14 Q-2 16 4 12 Q10 8 8 0 Q6 -10 0 -12 Q-6 -12 -10 -2 Z', opt.fill) +
            rc(-2, -14, 12, 6, opt.fill, 2) +
            ln(0, -18, 0, -14, '#8a8a8a', 2) +
            cc(-2, 2, 2.5, '#ffffff') + cc(4, 6, 2, '#ffffff');
        }
      },
      { id: 'scarf', x: 375, y: 65, s: 1,
        draw: function (opt) {
          return pa('M-20 -8 Q-6 -14 8 -10 Q14 -8 22 -6 Q8 -2 -4 -2 Q-14 -2 -20 -8 Z', opt.fill) +
            ln(-16, -6, -12, -9, 'rgba(255,255,255,0.7)', 2) +
            ln(-6, -9, -2, -12, 'rgba(255,255,255,0.7)', 2) +
            ln(4, -9, 8, -11, 'rgba(255,255,255,0.7)', 2);
        }
      },
      { id: 'pine', x: 250, y: 205, s: 1,
        draw: function (opt) {
          return rc(-4, 8, 8, 20, '#8a4a22') +
            pa('M0 -34 L-26 8 L26 8 Z', opt.fill) +
            pa('M0 -48 L-18 2 L18 2 Z', '#2f9e5e') +
            cc(-10, -6, 3.5, '#ffffff') + cc(8, 0, 3, '#ffffff');
        }
      },
      { id: 'snowman', x: 140, y: 235, s: 1,
        draw: function (opt) {
          return c(0, 14, 16, opt.fill) +
            c(0, -6, 12, opt.fill) +
            c(0, -22, 9, opt.fill) +
            cc(0, -6, 1.8, '#2b2b2b') + cc(0, 0, 1.8, '#2b2b2b') + cc(0, 6, 1.8, '#2b2b2b') +
            cc(-4, -25, 1.8, '#2b2b2b') + cc(4, -25, 1.8, '#2b2b2b') +
            pa('M-2 -22 L6 -19 L-2 -16 Z', '#ff9c4a') +
            ln(-12, -8, -20, -14, '#a05a2c', 3) + ln(12, -8, 20, -14, '#a05a2c', 3) +
            rc(-8, -30, 16, 3, '#ff5b8a');
        }
      },
      { id: 'penguin', x: 300, y: 290, s: 1,
        draw: function (opt) {
          return pa('M0 -18 A14 14 0 0 0 0 10 A14 14 0 0 0 0 -18 Z', '#2b3a4a') +
            ce(0, -2, 7, 10, opt.fill) +
            pa('M-2 -8 L0 -14 L2 -8 Z', '#ff9c4a') +
            cc(-5, -8, 1.5, '#ffffff') + cc(5, -8, 1.5, '#ffffff') +
            ln(-7, 10, -9, 18, '#ff9c4a', 3) + ln(7, 10, 9, 18, '#ff9c4a', 3) +
            ln(0, -14, 4, -20, '#4a3a2a', 3);
        }
      },
      { id: 'igloo', x: 370, y: 265, s: 1,
        draw: function (opt) {
          return pa('M-26 12 A26 26 0 0 1 26 12 Z', opt.fill) +
            rc(-8, 2, 16, 12, '#8ab4d8') +
            ln(-16, -4, 16, -4, '#c4dce8', 2) + ln(-20, 2, 20, 2, '#c4dce8', 2);
        }
      },
      { id: 'sled', x: 105, y: 305, s: 1,
        draw: function (opt) {
          return pa('M-22 0 Q0 -6 22 0 Z', opt.fill) +
            ln(-20, 0, -20, 8, '#8a4a22', 3) + ln(20, 0, 20, 8, '#8a4a22', 3) +
            pa('M-24 8 Q0 12 24 8', 'none', ' stroke="#8a4a22" stroke-width="3"') +
            rc(-6, -10, 10, 8, '#ffd23f') + rc(-4, -14, 6, 5, '#ff8a5c');
        }
      }
    ]
  };

  /* ============================================================
     场景 8：城堡
     ============================================================ */
  var castle = {
    id: 'castle',
    name: '城堡',
    w: 400, h: 400,
    bg: '<defs>' +
      '<linearGradient id="csSky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#8ad4ff"/><stop offset="1" stop-color="#fff0e0"/></linearGradient>' +
      '</defs>' +
      '<rect x="0" y="0" width="400" height="400" fill="url(#csSky)"/>' +
      '<ellipse cx="200" cy="70" rx="70" ry="20" fill="rgba(255,255,255,0.55)"/>' +
      '<path d="M0 270 Q130 250 260 270 T400 266 L400 400 L0 400 Z" fill="#6fc46f"/>' +
      '<path d="M0 305 Q120 293 240 305 T400 300 L400 400 L0 400 Z" fill="#4da64d"/>' +
      '<path d="M120 330 Q200 318 280 330 L320 400 L80 400 Z" fill="#e8d0a0"/>',
    elements: [
      { id: 'sun4', x: 50, y: 50, s: 1,
        draw: function (opt) {
          return c(18, opt.fill) + ln(0, -26, 0, -21, opt.fill, 4) + ln(0, 26, 0, 21, opt.fill, 4) +
            ln(-26, 0, -21, 0, opt.fill, 4) + ln(26, 0, 21, 0, opt.fill, 4) +
            ln(-18, -18, -14, -14, opt.fill, 4) + ln(18, -18, 14, -14, opt.fill, 4) +
            ln(-18, 18, -14, 14, opt.fill, 4) + ln(18, 18, 14, 14, opt.fill, 4);
        }
      },
      { id: 'cloud4', x: 150, y: 55, s: 1,
        draw: function (opt) { return cloudDraw(opt); }
      },
      { id: 'tree4', x: 65, y: 175, s: 1,
        draw: function (opt) {
          return rc(-4, 8, 8, 20, '#a05a2c') +
            pa('M0 -28 L-24 10 L24 10 Z', opt.fill) +
            pa('M0 -42 L-16 2 L16 2 Z', '#2f9e5e') +
            cc(-7, -10, 3, '#ff5b5b') + cc(6, -2, 2.5, '#ff5b5b');
        }
      },
      { id: 'castle', x: 205, y: 195, s: 1,
        draw: function (opt) {
          var s = '';
          // 左塔
          s += rc(-48, -26, 22, 60, '#c9a8dc') +
            pa('M-54 -26 L-20 -26 L-37 -46 Z', '#8a5cc9') +
            rc(-44, -40, 14, 16, '#b98ad4');
          // 右塔
          s += rc(26, -26, 22, 60, '#c9a8dc') +
            pa('M20 -26 L54 -26 L37 -46 Z', '#8a5cc9') +
            rc(30, -40, 14, 16, '#b98ad4');
          // 中塔（最高，带旗杆）
          s += rc(-14, -44, 28, 48, '#e3d0f0') +
            pa('M-20 -44 L20 -44 L0 -64 Z', '#7c5cf0') +
            ln(0, -64, 0, -78, '#8a6a4a', 3) +
            pa('M0 -78 L16 -74 L0 -70 Z', '#ff5b5b');
          // 主体 + 城垛
          s += rc(-38, -4, 76, 38, '#e3d0f0') +
            rc(-38, -10, 10, 8, '#c9a8dc') + rc(-20, -10, 10, 8, '#c9a8dc') +
            rc(-2, -10, 10, 8, '#c9a8dc') + rc(16, -10, 10, 8, '#c9a8dc') + rc(34, -10, 10, 8, '#c9a8dc');
          // 门 + 窗
          s += pa('M-12 34 A12 12 0 0 1 12 34 L12 34 L-12 34 Z', '#6a4a8a') +
            rc(-28, 6, 10, 10, '#7ec9ff') + rc(18, 6, 10, 10, '#7ec9ff');
          return s;
        }
      },
      { id: 'flower4', x: 95, y: 285, s: 1,
        draw: function (opt) {
          var s = ln(0, -2, 0, 16, '#3fae6c', 3) + ce(-5, 12, 4, 2.5, '#3fae6c');
          for (var i = 0; i < 6; i++) {
            var a = (i * 2 * Math.PI) / 6;
            s += ce(Math.cos(a) * 8, Math.sin(a) * 8 - 8, 6, 5, opt.fill);
          }
          return s + ce(0, -8, 4.5, 4.5, '#ffd23f');
        }
      },
      { id: 'horse', x: 155, y: 310, s: 1,
        draw: function (opt) {
          return pa('M-4 -2 L0 -12 L4 -2 Z', '#8a4a22') +
            ce(0, 2, 14, 8, opt.fill) +
            pa('M10 -4 L18 -12 L14 0 Z', opt.fill) +
            cc(21, -13, 4, opt.fill) +
            cc(23, -14, 1.5, '#2b2b2b') +
            pa('M19 -15 L17 -22 L21 -15 Z', '#8a4a22') +
            ln(-8, 8, -10, 18, '#8a4a22', 3) + ln(-2, 9, -2, 18, '#8a4a22', 3) +
            ln(6, 9, 6, 18, '#8a4a22', 3) + ln(12, 8, 12, 18, '#8a4a22', 3);
        }
      },
      { id: 'knight', x: 285, y: 315, s: 1,
        draw: function (opt) {
          return c(0, -16, 8, opt.fill) +
            rc(-11, -8, 22, 22, '#b8c4d0') +
            rc(-13, -12, 26, 6, '#7c8aa0') +
            rc(-8, -20, 16, 10, '#7c8aa0') +
            rc(-6, -12, 12, 8, '#8ad4ff') +
            ln(-12, 14, -12, 24, '#8a6a4a', 4) + ln(0, 14, 0, 24, '#8a6a4a', 4) +
            ln(12, 14, 12, 24, '#8a6a4a', 4) +
            ln(-14, -2, -26, -6, '#8a6a4a', 3) + cc(-26, -8, 3, '#8a6a4a');
        }
      },
      { id: 'bush', x: 335, y: 260, s: 1,
        draw: function (opt) {
          return c(-12, -2, 10, opt.fill) + c(0, -8, 12, opt.fill) + c(12, -2, 9, opt.fill) +
            cc(-4, -4, 2.5, '#ff5b5b') + cc(8, 0, 2.5, '#ff5b8a');
        }
      },
      { id: 'fence4', x: 375, y: 325, s: 1,
        draw: function (opt) {
          return ln(-28, 0, -28, -18, '#a08050', 4) + ln(0, 0, 0, -18, '#a08050', 4) +
            ln(28, 0, 28, -18, '#a08050', 4) +
            ln(-32, -4, 32, -4, opt.fill, 3) + ln(-32, 3, 32, 3, opt.fill, 3);
        }
      }
    ]
  };

  /* ---------- 导出 ---------- */
  window.SCENES = [ocean, forest, space, garden, farm, undersea, winter, castle];
})();
