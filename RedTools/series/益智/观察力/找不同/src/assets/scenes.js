/* ============================================================
   找不同 — 场景元素库（SVG 程序化生成，Chrome 61 基线经典脚本）
   ------------------------------------------------------------
   说明：
   - 定义 window.SCENES：8 个场景（海边/森林/农场/太空/海底/城市/冬日/花园）
   - 每个场景 = { id, name, w, h, bg, elements }
     - w/h：SVG 视口（480×320）
     - bg：背景 SVG 字符串（全视口坐标）
     - elements：8~10 个元素
   - 每个元素 = { id, x, y, s, rot, hitR, fill, palette, variantMax, draw }
     - x/y：元素中心（视口坐标）；s：缩放；rot：旋转（deg）
     - hitR：触摸命中圆半径（≥26px，触摸友好）
     - fill：主色；palette：可改色候选（改色差异变换用）
     - variantMax：变体数-1（替换变体差异变换用；0 表示无变体）
     - draw(opt)：返回以 (0,0) 为中心的内层 SVG 字符串；
       opt = { fill, variant }；fill 改主色、variant 切换外观变体
   - 约束：ES2017 经典脚本（var+function）、无内联事件/eval、
     无外部资源；所有图形由基础形状代码生成（童趣扁平风）
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 形状小工具 ---------- */
  function c(r, f, extra) { return '<circle r="' + r + '" fill="' + f + '"' + (extra || '') + '/>'; }
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
  /* 云朵（可改色） */
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
    w: 480, h: 320,
    bg: '<defs>' +
      '<linearGradient id="oceanSky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#7ec9ff"/><stop offset="1" stop-color="#d8f0ff"/></linearGradient>' +
      '<linearGradient id="oceanSea" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#3aa7e8"/><stop offset="1" stop-color="#1c6fb8"/></linearGradient>' +
      '</defs>' +
      '<rect x="0" y="0" width="480" height="320" fill="url(#oceanSky)"/>' +
      '<rect x="0" y="180" width="480" height="140" fill="url(#oceanSea)"/>' +
      '<ellipse cx="120" cy="215" rx="40" ry="6" fill="rgba(255,255,255,0.35)"/>' +
      '<ellipse cx="320" cy="245" rx="55" ry="7" fill="rgba(255,255,255,0.3)"/>' +
      '<ellipse cx="200" cy="290" rx="30" ry="5" fill="rgba(255,255,255,0.25)"/>' +
      '<path d="M0 300 L60 290 L120 300 L180 292 L240 300 L300 292 L360 300 L420 292 L480 300 L480 320 L0 320 Z" fill="#f7e2ae"/>',
    elements: [
      { id: 'sun', x: 60, y: 55, s: 1, rot: 0, hitR: 30, fill: '#ffd23f', palette: ['#ff9c4a', '#ff7eb3', '#8ad4ff'], variantMax: 0,
        draw: function (opt) {
          return c(22, opt.fill) +
            ln(0, -30, 0, -24, opt.fill, 4) + ln(0, 30, 0, 24, opt.fill, 4) +
            ln(-30, 0, -24, 0, opt.fill, 4) + ln(30, 0, 24, 0, opt.fill, 4) +
            ln(-21, -21, -17, -17, opt.fill, 4) + ln(21, -21, 17, -17, opt.fill, 4) +
            ln(-21, 21, -17, 17, opt.fill, 4) + ln(21, 21, 17, 17, opt.fill, 4);
        }
      },
      { id: 'cloud', x: 200, y: 60, s: 1, rot: 0, hitR: 30, fill: '#ffffff', palette: ['#ffe3f0', '#e3f0ff', '#fff0d0'], variantMax: 0,
        draw: function (opt) { return cloudDraw(opt); }
      },
      { id: 'boat', x: 220, y: 240, s: 1, rot: 0, hitR: 34, fill: '#a05a2c', palette: ['#c46b3f', '#4a90c4', '#7aa05a'], variantMax: 0,
        draw: function (opt) {
          return '<g transform="rotate(12)">' +
            pa('M-30 8 L-20 -18 L0 -18 L20 8 Z', '#ffffff') +
            pa('M-20 -18 L-6 8 L0 8 L0 -18 Z', opt.fill) +
            pa('M-34 8 L-14 14 L24 14 L34 8 Z', '#8a4a22') +
            ln(-8, 2, -2, 2, '#ffffff', 2) + '</g>';
        }
      },
      { id: 'fish', x: 340, y: 210, s: 1, rot: 0, hitR: 26, fill: '#ff8a5c', palette: ['#ffd23f', '#7ec9ff', '#c98aff'], variantMax: 1,
        draw: function (opt) {
          var s = '<g transform="scale(-1,1)">' +
            pa('M18 0 L-2 -14 L-2 14 Z', opt.fill) +
            ce(0, 0, 16, 10, opt.fill) +
            ce(0, 0, 16, 10, 'none');
          if (opt.variant === 1) {
            s += ln(-8, -8, -8, 8, 'rgba(255,255,255,0.65)', 3) + ln(0, -10, 0, 10, 'rgba(255,255,255,0.65)', 3);
          } else {
            s += ln(-4, -9, -4, 9, 'rgba(255,255,255,0.65)', 3);
          }
          s += c(8, -3, 2, '#2b2b2b') + '</g>';
          return s;
        }
      },
      { id: 'starfish', x: 420, y: 285, s: 1, rot: 0, hitR: 26, fill: '#ff8a5c', palette: ['#ffd23f', '#ff5b8a', '#8ad4ff'], variantMax: 1,
        draw: function (opt) {
          var s = star(20, 8, 5, opt.fill);
          if (opt.variant === 1) {
            s += c(0, -12, 2.5, '#ffffff') + c(11, 6, 2.5, '#ffffff') + c(-11, 6, 2.5, '#ffffff');
          }
          return s;
        }
      },
      { id: 'shell', x: 285, y: 300, s: 1, rot: 0, hitR: 26, fill: '#ffd9c4', palette: ['#ffc4d9', '#c4e8ff', '#ffe3a0'], variantMax: 1,
        draw: function (opt) {
          var s = pa('M-20 0 A20 20 0 0 1 20 0 Z', opt.fill) +
            ln(-12, -10, -4, -20, 'rgba(255,255,255,0.6)', 2) +
            ln(-4, -8, 0, -16, 'rgba(255,255,255,0.6)', 2) +
            ln(4, -8, 4, -16, 'rgba(255,255,255,0.6)', 2) +
            ln(12, -10, 10, -19, 'rgba(255,255,255,0.6)', 2);
          if (opt.variant === 1) {
            s += pa('M-12 0 A12 12 0 0 1 12 0 Z', 'rgba(255,255,255,0.5)');
          }
          return s;
        }
      },
      { id: 'crab', x: 130, y: 300, s: 1, rot: 0, hitR: 28, fill: '#ff5b5b', palette: ['#ff8a5c', '#c46bff', '#ffd23f'], variantMax: 1,
        draw: function (opt) {
          var s = ce(0, 2, 16, 11, opt.fill) +
            c(-24, -4, 6, opt.fill) + c(24, -4, 6, opt.fill) +
            ln(-14, 8, -22, 14, opt.fill, 3) + ln(-8, 10, -14, 17, opt.fill, 3) +
            ln(14, 8, 22, 14, opt.fill, 3) + ln(8, 10, 14, 17, opt.fill, 3) +
            ln(-8, -8, -8, -16, opt.fill, 3) + ln(8, -8, 8, -16, opt.fill, 3) +
            c(-8, -18, 3, '#2b2b2b') + c(8, -18, 3, '#2b2b2b');
          if (opt.variant === 1) {
            s += ln(0, -6, 0, 2, '#2b2b2b', 2);
          } else {
            s += pa('M-4 4 L0 -2 L4 4 Z', '#2b2b2b');
          }
          return s;
        }
      },
      { id: 'seagull', x: 90, y: 130, s: 1, rot: 0, hitR: 26, fill: '#ffffff', palette: ['#e3f0ff', '#ffe3f0', '#e8e8e8'], variantMax: 0,
        draw: function (opt) {
          return pa('M-22 0 Q-14 -14 0 -8 Q14 -14 22 0 Q12 -2 0 0 Q-12 -2 -22 0 Z', opt.fill) +
            ln(0, 0, 0, 8, '#ff9c4a', 3);
        }
      },
      { id: 'lighthouse', x: 440, y: 75, s: 1, rot: 0, hitR: 28, fill: '#ffffff', palette: ['#ffe3f0', '#e3f0ff', '#fff0d0'], variantMax: 1,
        draw: function (opt) {
          var s = pa('M-12 18 L12 18 L8 -16 L-8 -16 Z', opt.fill) +
            pa('M-12 4 L12 4 L9 -2 L-9 -2 Z', '#ff5b5b') +
            pa('M-8 -16 L8 -16 L0 -24 Z', '#ff5b5b') +
            c(0, -18, 5, '#ffd23f') +
            pa('M0 -23 L-10 -23 L0 -36 Z', '#ff5b5b');
          if (opt.variant === 1) {
            s += pa('M0 -30 L14 -30 L30 -8 Z', 'rgba(255,240,150,0.6)');
          }
          return s;
        }
      },
      { id: 'palm', x: 400, y: 160, s: 1, rot: 0, hitR: 30, fill: '#3fae6c', palette: ['#2f9e5e', '#7ec94f', '#6ba05a'], variantMax: 1,
        draw: function (opt) {
          var s = pa('M-3 20 Q0 4 2 -6 Q-2 4 -3 20 Z', '#a05a2c') +
            pa('M0 -4 Q-26 -10 -28 4 Q-22 6 -14 0 Q-16 8 -12 12 Q-6 6 0 -4 Z', opt.fill) +
            pa('M0 -4 Q26 -10 28 4 Q22 6 14 0 Q16 8 12 12 Q6 6 0 -4 Z', opt.fill);
          if (opt.variant === 1) {
            s += c(-12, 16, 3, '#8a4a22') + c(-6, 19, 3, '#8a4a22');
          } else {
            s += c(12, 16, 3, '#ffd23f');
          }
          return s;
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
    w: 480, h: 320,
    bg: '<defs>' +
      '<linearGradient id="forestSky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#8ad4ff"/><stop offset="1" stop-color="#d8f5d8"/></linearGradient>' +
      '</defs>' +
      '<rect x="0" y="0" width="480" height="320" fill="url(#forestSky)"/>' +
      '<ellipse cx="120" cy="60" rx="34" ry="20" fill="rgba(255,255,255,0.7)"/>' +
      '<ellipse cx="360" cy="90" rx="40" ry="16" fill="rgba(255,255,255,0.6)"/>' +
      '<path d="M0 240 Q80 220 160 240 T320 236 T480 240 L480 320 L0 320 Z" fill="#6fc46f"/>' +
      '<path d="M0 270 Q100 255 200 270 T420 265 T480 268 L480 320 L0 320 Z" fill="#4da64d"/>',
    elements: [
      { id: 'tree', x: 70, y: 170, s: 1, rot: 0, hitR: 32, fill: '#3fae6c', palette: ['#2f9e5e', '#7ec94f', '#ff9c4a'], variantMax: 1,
        draw: function (opt) {
          var s = rc(-4, 10, 8, 26, '#a05a2c') +
            pa('M0 -30 L-28 12 L28 12 Z', opt.fill) +
            pa('M0 -46 L-20 2 L20 2 Z', '#2f9e5e');
          if (opt.variant === 1) {
            s += c(0, -10, 4, '#ff5b5b');
          } else {
            s += c(-8, -6, 3.5, '#ff5b5b') + c(8, 2, 3, '#ff5b5b');
          }
          return s;
        }
      },
      { id: 'flower', x: 150, y: 250, s: 1, rot: 0, hitR: 26, fill: '#ff7eb3', palette: ['#c98aff', '#ffd23f', '#ff8a5c'], variantMax: 1,
        draw: function (opt) {
          var s = '';
          var n = (opt.variant === 1) ? 4 : 6;
          for (var i = 0; i < n; i++) {
            var a = (i * 2 * Math.PI) / 6;
            s += ce(Math.cos(a) * 8, Math.sin(a) * 8 - 4, 6, 5, opt.fill);
          }
          s += c(0, -4, 4.5, '#ffd23f') + ln(0, 1, 0, 16, '#3fae6c', 3) +
            ce(-4, 12, 4, 2.5, '#3fae6c');
          if (opt.variant === 1) {
            s += c(6, -10, 2, '#ff5b5b');
          }
          return s;
        }
      },
      { id: 'mushroom', x: 230, y: 280, s: 1, rot: 0, hitR: 26, fill: '#ff5b5b', palette: ['#c46bff', '#ff9c4a', '#ff7eb3'], variantMax: 1,
        draw: function (opt) {
          var s = rc(-6, 6, 12, 14, '#ffe8d0') +
            pa('M-18 -6 A18 18 0 0 1 18 -6 Z', opt.fill);
          if (opt.variant === 1) {
            s += c(-7, -14, 3, '#ffffff') + c(6, -10, 2.5, '#ffffff') + c(-1, -2, 2.5, '#ffffff');
          } else {
            s += c(-6, -15, 2.5, '#ffffff') + c(7, -11, 2.5, '#ffffff');
          }
          return s;
        }
      },
      { id: 'butterfly', x: 320, y: 120, s: 1, rot: 0, hitR: 28, fill: '#c98aff', palette: ['#ff7eb3', '#ffd23f', '#7ec9ff'], variantMax: 1,
        draw: function (opt) {
          var s = ce(-9, -4, 11, 15, opt.fill, ' transform="rotate(-20 -9 -4)"') +
            ce(9, -4, 11, 15, opt.fill, ' transform="rotate(20 9 -4)"') +
            ce(0, 0, 2.5, 14, '#5a3a2a');
          if (opt.variant === 1) {
            s += c(-9, -4, 2.5, '#ffffff') + c(9, -4, 2.5, '#ffffff');
          }
          return s;
        }
      },
      { id: 'bird', x: 130, y: 90, s: 1, rot: 0, hitR: 26, fill: '#4a90c4', palette: ['#ff8a5c', '#7aa05a', '#c46bff'], variantMax: 1,
        draw: function (opt) {
          var s = ce(0, 0, 12, 9, opt.fill) +
            pa('M8 -4 L18 -1 L8 3 Z', '#ff9c4a') +
            pa('M-4 -7 L-2 -13 L0 -7 Z', '#ffd23f') +
            c(6, -2, 2, '#2b2b2b');
          if (opt.variant === 1) {
            s += pa('M-14 2 L-20 -6 L-8 -1 Z', '#2b2b2b');
          }
          return s;
        }
      },
      { id: 'squirrel', x: 400, y: 230, s: 1, rot: 0, hitR: 28, fill: '#c46b3f', palette: ['#a05a2c', '#e09a6a', '#8a6a4a'], variantMax: 1,
        draw: function (opt) {
          var s = pa('M0 -2 Q-26 -8 -24 -24 Q-22 -34 -12 -30 Q-14 -20 -4 -14 Z', opt.fill) +
            ce(0, 6, 10, 8, opt.fill) +
            c(10, -2, 7, opt.fill) +
            pa('M-2 -6 L0 -12 L2 -6 Z', '#8a4a22') +
            c(13, -4, 2, '#2b2b2b');
          if (opt.variant === 1) {
            s += c(16, 10, 3, '#8a4a22');
          } else {
            s += c(-10, 10, 3, '#8a4a22');
          }
          return s;
        }
      },
      { id: 'rabbit', x: 285, y: 255, s: 1, rot: 0, hitR: 28, fill: '#ffffff', palette: ['#ffe3f0', '#e3f0ff', '#e8d8ff'], variantMax: 1,
        draw: function (opt) {
          var s = ce(-6, -14, 5, 12, '#ffffff', ' transform="rotate(-10 -6 -14)"') +
            ce(6, -14, 5, 12, '#ffffff', ' transform="rotate(10 6 -14)"') +
            ce(-6, -14, 2.5, 7, '#ffc4d9', ' transform="rotate(-10 -6 -14)"') +
            ce(6, -14, 2.5, 7, '#ffc4d9', ' transform="rotate(10 6 -14)"') +
            c(0, 0, 11, '#ffffff') +
            c(-4, -3, 2, '#2b2b2b') + c(4, -3, 2, '#2b2b2b') +
            pa('M-2 3 L0 6 L2 3 Z', '#ff9c8a');
          if (opt.variant === 1) {
            s += ln(-10, 2, -14, 6, '#ff9c8a', 2) + ln(10, 2, 14, 6, '#ff9c8a', 2);
          } else {
            s += ln(-10, 2, -16, -2, '#ff9c8a', 2) + ln(10, 2, 16, -2, '#ff9c8a', 2);
          }
          return s;
        }
      },
      { id: 'fox', x: 450, y: 130, s: 1, rot: 0, hitR: 28, fill: '#ff8a5c', palette: ['#ff5b5b', '#ffd23f', '#c98aff'], variantMax: 1,
        draw: function (opt) {
          var s = pa('M-8 -10 L-18 10 L-2 4 Z', opt.fill) +
            pa('M8 -10 L18 10 L2 4 Z', opt.fill) +
            pa('M-4 -12 L0 -22 L4 -12 Z', '#ffffff') +
            pa('M-6 -8 L-14 2 L-4 0 Z', '#2b2b2b') +
            pa('M6 -8 L14 2 L4 0 Z', '#2b2b2b') +
            pa('M-4 0 L0 12 L4 0 Z', opt.fill) +
            c(0, 4, 5, '#ffffff') + c(0, 6, 2, '#2b2b2b') +
            c(-6, -6, 1.8, '#2b2b2b') + c(6, -6, 1.8, '#2b2b2b');
          if (opt.variant === 1) {
            s += ln(0, 12, 0, 20, '#ff9c8a', 2.5);
          }
          return s;
        }
      },
      { id: 'owl', x: 200, y: 100, s: 1, rot: 0, hitR: 28, fill: '#8a6a4a', palette: ['#a05a2c', '#6a8ac4', '#7a9a5a'], variantMax: 1,
        draw: function (opt) {
          var s = pa('M-6 -12 L0 -24 L6 -12 Z', opt.fill) +
            pa('M0 -8 L-22 14 L22 14 Z', opt.fill) +
            ce(-8, 0, 8, 8, '#ffffff') + ce(8, 0, 8, 8, '#ffffff') +
            c(-8, 0, 4, '#2b2b2b') + c(8, 0, 4, '#2b2b2b') +
            pa('M-3 10 L3 10 L0 16 Z', '#ff9c4a');
          if (opt.variant === 1) {
            s += pa('M-22 14 L-30 22 L-18 18 Z', opt.fill) + pa('M22 14 L30 22 L18 18 Z', opt.fill);
          } else {
            s += pa('M-16 8 L-22 14 L-18 10 Z', '#ffd23f') + pa('M16 8 L22 14 L18 10 Z', '#ffd23f');
          }
          return s;
        }
      }
    ]
  };

  /* ============================================================
     场景 3：农场
     ============================================================ */
  var farm = {
    id: 'farm',
    name: '农场',
    w: 480, h: 320,
    bg: '<defs>' +
      '<linearGradient id="farmSky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#8ad4ff"/><stop offset="1" stop-color="#fff0d0"/></linearGradient>' +
      '</defs>' +
      '<rect x="0" y="0" width="480" height="320" fill="url(#farmSky)"/>' +
      '<rect x="0" y="200" width="480" height="120" fill="#8fc96a"/>' +
      '<path d="M0 240 L480 228 L480 320 L0 320 Z" fill="#6fb85a"/>' +
      '<path d="M0 280 Q120 268 240 280 T480 278 L480 320 L0 320 Z" fill="#e8d0a0"/>',
    elements: [
      { id: 'barn', x: 80, y: 185, s: 1, rot: 0, hitR: 36, fill: '#d94a3f', palette: ['#c46b3f', '#c46b8a', '#a05a2c'], variantMax: 1,
        draw: function (opt) {
          var s = pa('M-34 2 L0 -26 L34 2 Z', '#a83a2f') +
            rc(-28, 2, 56, 30, opt.fill) +
            rc(-16, 10, 12, 22, '#8a4a22') +
            c(-10, 21, 1.5, '#ffd23f') +
            rc(10, 6, 10, 8, '#ffe8d0');
          if (opt.variant === 1) {
            s += pa('M-34 2 L0 -26 L0 2 Z', '#ffffff', ' opacity="0.5"');
          }
          return s;
        }
      },
      { id: 'cow', x: 200, y: 245, s: 1, rot: 0, hitR: 32, fill: '#ffffff', palette: ['#ffe3f0', '#e3f0ff', '#fff0d0'], variantMax: 1,
        draw: function (opt) {
          var s = ce(0, 2, 22, 12, opt.fill) +
            ce(22, -4, 9, 7, opt.fill) +
            c(27, -5, 2, '#2b2b2b') +
            pa('M18 -10 L20 -16 L24 -10 Z', '#2b2b2b') +
            pa('M26 -10 L28 -16 L32 -10 Z', '#2b2b2b') +
            ln(-14, 12, -14, 22, '#a05a2c', 4) + ln(-4, 13, -4, 22, '#a05a2c', 4) +
            ln(8, 12, 8, 22, '#a05a2c', 4) + ln(16, 11, 16, 22, '#a05a2c', 4);
          if (opt.variant === 1) {
            s += ce(-8, -3, 6, 4, '#3a2a1a') + ce(2, 2, 5, 3.5, '#3a2a1a');
          } else {
            s += ce(-8, -3, 6, 4, '#2b2b2b') + ce(2, 2, 5, 3.5, '#2b2b2b');
          }
          return s;
        }
      },
      { id: 'sheep', x: 300, y: 255, s: 1, rot: 0, hitR: 30, fill: '#ffffff', palette: ['#fff0d0', '#ffe3f0', '#e3f0ff'], variantMax: 1,
        draw: function (opt) {
          var s = ce(-8, -3, 12, 9, opt.fill) + ce(4, -7, 11, 8, opt.fill) +
            ce(12, 3, 10, 8, opt.fill) + ce(-2, 6, 12, 8, opt.fill) +
            ce(20, -4, 6, 5, '#4a3a2a') + c(23, -5, 1.5, '#2b2b2b') +
            ln(-14, 10, -16, 18, '#4a3a2a', 3) + ln(6, 11, 6, 19, '#4a3a2a', 3);
          if (opt.variant === 1) {
            s += pa('M-10 -6 L-16 -10 L-10 -12 Z', '#2b2b2b');
          } else {
            s += pa('M-10 -6 L-6 -12 L-4 -6 Z', '#2b2b2b');
          }
          return s;
        }
      },
      { id: 'chicken', x: 115, y: 285, s: 1, rot: 0, hitR: 26, fill: '#ffffff', palette: ['#ffe3a0', '#ffd9e8', '#d8e8ff'], variantMax: 1,
        draw: function (opt) {
          var s = c(0, 0, 9, opt.fill) +
            c(9, -7, 6, opt.fill) +
            pa('M5 -12 L8 -18 L11 -12 Z', '#ff5b5b') +
            pa('M14 -8 L20 -6 L14 -4 Z', '#ff9c4a') +
            c(12, -8, 1.5, '#2b2b2b') +
            ln(-5, 8, -7, 16, '#ff9c4a', 2.5) + ln(1, 8, -1, 16, '#ff9c4a', 2.5);
          if (opt.variant === 1) {
            s += c(16, 8, 3.5, '#ffd23f');
          } else {
            s += c(-14, -2, 2, '#ffd23f');
          }
          return s;
        }
      },
      { id: 'tractor', x: 360, y: 265, s: 1, rot: 0, hitR: 34, fill: '#d94a3f', palette: ['#3f9ed4', '#6fb85a', '#c46b8a'], variantMax: 1,
        draw: function (opt) {
          var s = rc(-24, -4, 22, 12, opt.fill) +
            rc(-18, -18, 16, 12, '#8a2a20') +
            rc(-14, -16, 8, 6, '#c4e8ff') +
            c(12, 6, 10, '#2b2b2b') + c(12, 6, 4, '#e8e8e8') +
            c(-12, 8, 6, '#2b2b2b') + c(-12, 8, 2.5, '#e8e8e8') +
            ln(6, -10, 10, -22, '#2b2b2b', 3) + c(10, -24, 2.5, '#2b2b2b');
          if (opt.variant === 1) {
            s += pa('M26 -4 L40 -4 L40 2 L26 2 Z', '#e8d0a0');
          }
          return s;
        }
      },
      { id: 'apple', x: 210, y: 165, s: 1, rot: 0, hitR: 30, fill: '#ff5b5b', palette: ['#7ec94f', '#ffd23f', '#c46b8a'], variantMax: 1,
        draw: function (opt) {
          var s = rc(-3, 8, 6, 16, '#8a4a22') +
            pa('M0 -28 L-24 10 L24 10 Z', '#3fae6c') +
            pa('M0 -36 L-16 2 L16 2 Z', '#2f9e5e');
          if (opt.variant === 1) {
            s += c(0, -14, 4, opt.fill) + c(-8, 0, 3, opt.fill);
          } else {
            s += c(-8, -10, 3.5, opt.fill) + c(8, -4, 3, opt.fill) + c(-4, 2, 3, opt.fill);
          }
          return s;
        }
      },
      { id: 'fence', x: 420, y: 285, s: 1, rot: 0, hitR: 28, fill: '#e8d0a0', palette: ['#c4a86a', '#a08050', '#ffd9c4'], variantMax: 1,
        draw: function (opt) {
          var s = ln(-30, 0, -30, -20, '#a08050', 5) + ln(0, 0, 0, -20, '#a08050', 5) +
            ln(30, 0, 30, -20, '#a08050', 5) +
            ln(-36, -4, 36, -4, opt.fill, 3) + ln(-36, 4, 36, 4, opt.fill, 3);
          if (opt.variant === 1) {
            s += ln(-15, -2, 15, 10, '#2b2b2b', 2.5, ' transform="rotate(-20)"');
          }
          return s;
        }
      },
      { id: 'windmill', x: 440, y: 140, s: 1, rot: 0, hitR: 30, fill: '#ffffff', palette: ['#ffe3f0', '#e3f0ff', '#fff0d0'], variantMax: 1,
        draw: function (opt) {
          var s = pa('M-10 16 L10 16 L6 -14 L-6 -14 Z', '#e8e0d0') +
            pa('M-6 -14 L6 -14 L0 -22 Z', '#d94a3f') +
            c(0, -16, 2.5, '#8a4a22');
          if (opt.variant === 1) {
            s += '<g transform="rotate(15)">' + rc(-1.5, -26, 3, 12, '#8a6a4a') + rc(-1.5, 8, 3, 12, '#8a6a4a') + rc(-26, -1.5, 12, 3, '#8a6a4a') + rc(10, -1.5, 12, 3, '#8a6a4a') + '</g>';
          } else {
            s += rc(-1.5, -26, 3, 12, '#8a6a4a') + rc(-1.5, 8, 3, 12, '#8a6a4a') + rc(-26, -1.5, 12, 3, '#8a6a4a') + rc(10, -1.5, 12, 3, '#8a6a4a');
          }
          return s;
        }
      },
      { id: 'duck', x: 265, y: 292, s: 1, rot: 0, hitR: 26, fill: '#ffd23f', palette: ['#ff9c4a', '#7ec9ff', '#c98aff'], variantMax: 1,
        draw: function (opt) {
          var s = ce(0, 2, 11, 8, opt.fill) +
            c(10, -5, 6, opt.fill) +
            pa('M15 -7 L22 -4 L15 -2 Z', '#ff9c4a') +
            c(13, -6, 1.5, '#2b2b2b') +
            ln(-6, 9, -8, 16, '#ff9c4a', 2.5) + ln(0, 9, -2, 16, '#ff9c4a', 2.5);
          if (opt.variant === 1) {
            s += ln(-12, 0, -18, -6, '#7ec9ff', 2.5);
          }
          return s;
        }
      }
    ]
  };

  /* ============================================================
     场景 4：太空
     ============================================================ */
  var space = {
    id: 'space',
    name: '太空',
    w: 480, h: 320,
    bg: '<defs>' +
      '<linearGradient id="spaceSky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#1a1a4a"/><stop offset="1" stop-color="#3a3a7a"/></linearGradient>' +
      '</defs>' +
      '<rect x="0" y="0" width="480" height="320" fill="url(#spaceSky)"/>' +
      '<circle cx="60" cy="40" r="1.5" fill="#ffffff"/>' +
      '<circle cx="140" cy="80" r="2" fill="#ffffff"/>' +
      '<circle cx="220" cy="30" r="1.5" fill="#ffffff"/>' +
      '<circle cx="300" cy="60" r="2" fill="#ffffff"/>' +
      '<circle cx="380" cy="90" r="1.5" fill="#ffffff"/>' +
      '<circle cx="430" cy="200" r="2" fill="#ffffff"/>' +
      '<circle cx="50" cy="240" r="2" fill="#ffffff"/>' +
      '<circle cx="160" cy="200" r="1.5" fill="#ffffff"/>' +
      '<circle cx="400" cy="280" r="1.5" fill="#ffffff"/>' +
      '<ellipse cx="240" cy="280" rx="160" ry="40" fill="rgba(120,120,180,0.35)"/>',
    elements: [
      { id: 'star-sun', x: 70, y: 90, s: 1, rot: 0, hitR: 30, fill: '#ffd23f', palette: ['#ff9c4a', '#ff7eb3', '#8ad4ff'], variantMax: 1,
        draw: function (opt) {
          var s = c(18, opt.fill) + ln(0, -26, 0, -20, opt.fill, 4) + ln(0, 26, 0, 20, opt.fill, 4) +
            ln(-26, 0, -20, 0, opt.fill, 4) + ln(26, 0, 20, 0, opt.fill, 4) +
            ln(-18, -18, -14, -14, opt.fill, 4) + ln(18, -18, 14, -14, opt.fill, 4) +
            ln(-18, 18, -14, 14, opt.fill, 4) + ln(18, 18, 14, 14, opt.fill, 4);
          if (opt.variant === 1) {
            s += c(0, 0, 26, 'rgba(255,210,63,0.35)');
          }
          return s;
        }
      },
      { id: 'planet', x: 210, y: 105, s: 1, rot: 0, hitR: 32, fill: '#4a90c4', palette: ['#ff8a5c', '#c46b8a', '#6fb85a'], variantMax: 1,
        draw: function (opt) {
          var s = c(20, opt.fill) +
            ce(0, 0, 20, 20, 'none', ' stroke="rgba(255,255,255,0.4)" stroke-width="1.5"');
          if (opt.variant === 1) {
            s += '<ellipse cx="0" cy="0" rx="30" ry="9" fill="none" stroke="#ffd23f" stroke-width="3" transform="rotate(-15)"/>';
          } else {
            s += '<ellipse cx="0" cy="0" rx="30" ry="9" fill="none" stroke="#c4e8ff" stroke-width="3" transform="rotate(-15)"/>';
          }
          return s;
        }
      },
      { id: 'rocket', x: 140, y: 235, s: 1, rot: 0, hitR: 32, fill: '#ff5b5b', palette: ['#4a90c4', '#7ec94f', '#ffd23f'], variantMax: 1,
        draw: function (opt) {
          var s = pa('M0 -34 L-10 -20 L10 -20 Z', opt.fill) +
            rc(-10, -20, 20, 24, opt.fill) +
            pa('M-10 4 L-16 12 L-10 8 Z', '#4a90c4') + pa('M10 4 L16 12 L10 8 Z', '#4a90c4') +
            c(0, -12, 5, '#c4e8ff');
          if (opt.variant === 1) {
            s += pa('M-6 4 L0 16 L6 4 Z', '#ff9c4a') + pa('M-9 10 L0 24 L9 10 Z', '#ffd23f');
          } else {
            s += pa('M-5 4 L0 12 L5 4 Z', '#ff9c4a');
          }
          return s;
        }
      },
      { id: 'astronaut', x: 320, y: 235, s: 1, rot: 0, hitR: 30, fill: '#ffffff', palette: ['#e3f0ff', '#ffe3f0', '#e8e8e8'], variantMax: 1,
        draw: function (opt) {
          var s = ce(0, 4, 14, 16, '#e8e8e8') +
            c(0, -14, 9, '#ffffff') +
            c(2, -15, 6, '#7ec9ff') +
            rc(-2, -2, 4, 8, '#4a90c4') +
            rc(-14, 2, 5, 10, '#e8e8e8') + rc(9, 2, 5, 10, '#e8e8e8');
          if (opt.variant === 1) {
            s += ln(-16, -4, -24, -12, '#e8e8e8', 5);
          } else {
            s += ln(16, -4, 24, -12, '#e8e8e8', 5);
          }
          return s;
        }
      },
      { id: 'satellite', x: 420, y: 120, s: 1, rot: 0, hitR: 30, fill: '#ffd23f', palette: ['#ff9c4a', '#8ad4ff', '#ff7eb3'], variantMax: 1,
        draw: function (opt) {
          var s = rc(-4, -6, 8, 12, '#e8e8e8') +
            rc(-22, -2, 12, 6, '#4a90c4') + rc(10, -2, 12, 6, '#4a90c4') +
            c(0, -12, 6, '#ffd23f') +
            ln(0, -8, 0, -12, '#8a8a8a', 2);
          if (opt.variant === 1) {
            s += ln(-10, 4, 10, 4, '#2b2b2b', 2);
          } else {
            s += ln(-10, 4, 10, 4, '#8a8a8a', 2);
          }
          return s;
        }
      },
      { id: 'star2', x: 100, y: 290, s: 1, rot: 0, hitR: 24, fill: '#ffffff', palette: ['#ffd23f', '#8ad4ff', '#ff7eb3'], variantMax: 1,
        draw: function (opt) {
          if (opt.variant === 1) {
            return star(14, 6, 5, opt.fill);
          }
          return star(16, 5, 4, opt.fill);
        }
      },
      { id: 'ufo', x: 360, y: 80, s: 1, rot: 0, hitR: 30, fill: '#8ad4ff', palette: ['#c98aff', '#7ec94f', '#ffd23f'], variantMax: 1,
        draw: function (opt) {
          var s = pa('M-12 -6 A12 12 0 0 1 12 -6 Z', '#c4e8ff') +
            ce(0, -2, 20, 8, opt.fill) +
            c(-10, -2, 2, '#ff5b8a') + c(0, -1, 2, '#7ec94f') + c(10, -2, 2, '#ffd23f');
          if (opt.variant === 1) {
            s += pa('M-8 2 L-20 12 L20 12 L8 2 Z', 'rgba(255,240,150,0.5)');
          }
          return s;
        }
      },
      { id: 'moon', x: 280, y: 200, s: 1, rot: 0, hitR: 28, fill: '#fff3d6', palette: ['#ffe3f0', '#e3f0ff', '#ffd9c4'], variantMax: 1,
        draw: function (opt) {
          var s = c(18, opt.fill);
          if (opt.variant === 1) {
            s += c(-6, -6, 3, '#e8d8b0') + c(7, 4, 2.5, '#e8d8b0') + c(-2, 8, 2, '#e8d8b0');
          } else {
            s += c(-6, -6, 3.5, '#e8d8b0') + c(7, 4, 3, '#e8d8b0');
          }
          return s;
        }
      },
      { id: 'comet', x: 455, y: 260, s: 1, rot: 0, hitR: 24, fill: '#ffd23f', palette: ['#ff9c4a', '#8ad4ff', '#ff7eb3'], variantMax: 1,
        draw: function (opt) {
          var s = c(7, opt.fill) +
            pa('M-6 6 L-28 22 L-6 12 Z', 'rgba(255,210,63,0.5)');
          if (opt.variant === 1) {
            s += c(3, -3, 2, '#ffffff');
          }
          return s;
        }
      }
    ]
  };

  /* ============================================================
     场景 5：海底
     ============================================================ */
  var undersea = {
    id: 'undersea',
    name: '海底',
    w: 480, h: 320,
    bg: '<defs>' +
      '<linearGradient id="seaSky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#1c6fb8"/><stop offset="1" stop-color="#0a3a6a"/></linearGradient>' +
      '</defs>' +
      '<rect x="0" y="0" width="480" height="320" fill="url(#seaSky)"/>' +
      '<path d="M0 0 L40 0 L80 40 L40 60 Z" fill="rgba(255,255,255,0.08)"/>' +
      '<path d="M180 0 L220 0 L260 50 L220 60 Z" fill="rgba(255,255,255,0.06)"/>' +
      '<path d="M380 0 L420 0 L450 40 L410 50 Z" fill="rgba(255,255,255,0.08)"/>' +
      '<path d="M0 285 Q60 275 120 285 T240 283 T360 285 T480 283 L480 320 L0 320 Z" fill="#0a2a50"/>' +
      '<ellipse cx="100" cy="120" rx="30" ry="5" fill="rgba(255,255,255,0.1)"/>' +
      '<ellipse cx="340" cy="220" rx="40" ry="6" fill="rgba(255,255,255,0.08)"/>',
    elements: [
      { id: 'fish2', x: 110, y: 150, s: 1, rot: 0, hitR: 28, fill: '#ff8a5c', palette: ['#ffd23f', '#7ec9ff', '#c98aff'], variantMax: 1,
        draw: function (opt) {
          var s = pa('M18 0 L-2 -14 L-2 14 Z', opt.fill) +
            ce(0, 0, 16, 10, opt.fill);
          if (opt.variant === 1) {
            s += ln(-8, -8, -8, 8, 'rgba(255,255,255,0.65)', 3) + ln(0, -10, 0, 10, 'rgba(255,255,255,0.65)', 3);
          } else {
            s += ln(-4, -9, -4, 9, 'rgba(255,255,255,0.65)', 3);
          }
          return s + c(8, -3, 2, '#2b2b2b');
        }
      },
      { id: 'octopus', x: 245, y: 265, s: 1, rot: 0, hitR: 30, fill: '#ff7eb3', palette: ['#c98aff', '#ffd23f', '#8ad4ff'], variantMax: 1,
        draw: function (opt) {
          var s = c(0, -4, 15, opt.fill) +
            ln(-10, 8, -14, 18, opt.fill, 4) + ln(-5, 9, -7, 19, opt.fill, 4) +
            ln(0, 9, 0, 20, opt.fill, 4) + ln(5, 9, 7, 19, opt.fill, 4) + ln(10, 8, 14, 18, opt.fill, 4) +
            c(-5, -7, 2, '#2b2b2b') + c(5, -7, 2, '#2b2b2b');
          if (opt.variant === 1) {
            s += c(0, -2, 2, '#ffffff') + c(-8, 0, 1.5, '#ffffff');
          }
          return s;
        }
      },
      { id: 'turtle', x: 360, y: 230, s: 1, rot: 0, hitR: 32, fill: '#3fae6c', palette: ['#2f9e5e', '#6fb85a', '#7ec94f'], variantMax: 1,
        draw: function (opt) {
          var s = ce(-8, 4, 8, 4, '#6a8a5a') + ce(14, 4, 7, 4, '#6a8a5a') +
            ce(0, -2, 16, 12, opt.fill) +
            ce(-6, -3, 5, 4, '#4a8a5a') + ce(4, -5, 4, 3.5, '#4a8a5a') +
            c(16, -6, 4.5, '#6a8a5a') + c(18, -7, 1.5, '#2b2b2b') +
            ln(16, -2, 22, 4, '#6a8a5a', 3);
          if (opt.variant === 1) {
            s += ce(0, -2, 16, 12, 'none', ' stroke="#2f6a4a" stroke-width="2"');
          } else {
            s += pa('M-10 -8 L-4 -14 L0 -8 Z', '#4a8a5a');
          }
          return s;
        }
      },
      { id: 'coral', x: 60, y: 280, s: 1, rot: 0, hitR: 28, fill: '#ff8a8a', palette: ['#c46b8a', '#ffd23f', '#c98aff'], variantMax: 1,
        draw: function (opt) {
          var s = rc(-2, 2, 5, 18, '#e8a0a0') +
            pa('M-2 4 L-14 -2 L-8 -12 Z', opt.fill) +
            pa('M2 6 L12 -6 L4 -12 Z', opt.fill) +
            pa('M0 2 L-2 -12 L-8 -18 Z', opt.fill) +
            pa('M1 4 L6 -10 L12 -14 Z', opt.fill);
          if (opt.variant === 1) {
            s += c(-12, -14, 3, '#ffffff') + c(8, -16, 2.5, '#ffffff');
          } else {
            s += c(-10, -14, 2.5, '#ffffff');
          }
          return s;
        }
      },
      { id: 'seaweed', x: 430, y: 290, s: 1, rot: 0, hitR: 28, fill: '#3fae6c', palette: ['#2f9e5e', '#7ec94f', '#6fb85a'], variantMax: 1,
        draw: function (opt) {
          var s = pa('M0 20 Q-8 6 0 -6 Q-6 -14 2 -22 Q8 -10 4 0 Q10 8 2 20 Z', opt.fill) +
            pa('M14 22 Q6 12 12 2 Q18 -4 14 -12 Q22 -2 18 8 Q24 14 14 22 Z', '#2f9e5e') +
            pa('M-14 22 Q-20 14 -16 4 Q-10 -4 -14 -10 Q-8 0 -10 10 Q-6 16 -14 22 Z', '#2f9e5e');
          if (opt.variant === 1) {
            s += c(-16, -14, 2.5, '#ffffff');
          }
          return s;
        }
      },
      { id: 'jellyfish', x: 160, y: 90, s: 1, rot: 0, hitR: 28, fill: '#c98aff', palette: ['#ff7eb3', '#8ad4ff', '#ffd23f'], variantMax: 1,
        draw: function (opt) {
          var s = pa('M-14 -2 A14 14 0 0 1 14 -2 Z', opt.fill, ' opacity="0.9"') +
            ln(-9, 0, -11, 12, 'rgba(255,255,255,0.7)', 2.5) +
            ln(-3, 0, -4, 14, 'rgba(255,255,255,0.7)', 2.5) +
            ln(3, 0, 4, 14, 'rgba(255,255,255,0.7)', 2.5) +
            ln(9, 0, 11, 12, 'rgba(255,255,255,0.7)', 2.5);
          if (opt.variant === 1) {
            s += ln(0, 0, 0, 15, 'rgba(255,255,255,0.7)', 2.5);
          }
          return s;
        }
      },
      { id: 'starfish2', x: 300, y: 95, s: 1, rot: 0, hitR: 26, fill: '#ffd23f', palette: ['#ff8a5c', '#ff7eb3', '#8ad4ff'], variantMax: 1,
        draw: function (opt) {
          var s = star(19, 8, 5, opt.fill);
          if (opt.variant === 1) {
            s += c(0, -11, 2, '#ffffff') + c(10, 6, 2, '#ffffff') + c(-10, 6, 2, '#ffffff');
          }
          return s;
        }
      },
      { id: 'bubble', x: 380, y: 90, s: 1, rot: 0, hitR: 26, fill: '#ffffff', palette: ['#c4e8ff', '#ffd9e8', '#d8ffd8'], variantMax: 1,
        draw: function (opt) {
          var s = c(0, 0, 8, 'none', ' stroke="' + opt.fill + '" stroke-width="2.5"') +
            c(-16, 8, 5, 'none', ' stroke="' + opt.fill + '" stroke-width="2"') +
            c(14, -10, 4, 'none', ' stroke="' + opt.fill + '" stroke-width="2"');
          if (opt.variant === 1) {
            s += c(2, -2, 1.5, '#ffffff');
          }
          return s;
        }
      },
      { id: 'whale', x: 180, y: 210, s: 1, rot: 0, hitR: 30, fill: '#4a90c4', palette: ['#2f6a8a', '#6fb8d4', '#8a6ac4'], variantMax: 1,
        draw: function (opt) {
          var s = ce(0, 0, 24, 13, opt.fill) +
            pa('M-22 0 L-34 -8 L-30 4 Z', opt.fill) +
            pa('M18 -6 L22 -16 L26 -6 Z', opt.fill) +
            c(10, -4, 2.5, '#2b2b2b') +
            ln(-6, 4, 6, 6, 'rgba(255,255,255,0.5)', 2.5);
          if (opt.variant === 1) {
            s += c(-10, -2, 3, '#ffffff');
          } else {
            s += c(-10, -2, 3, 'rgba(255,255,255,0.5)');
          }
          return s;
        }
      }
    ]
  };

  /* ============================================================
     场景 6：城市
     ============================================================ */
  var city = {
    id: 'city',
    name: '城市',
    w: 480, h: 320,
    bg: '<defs>' +
      '<linearGradient id="citySky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#8ad4ff"/><stop offset="1" stop-color="#d8f0ff"/></linearGradient>' +
      '</defs>' +
      '<rect x="0" y="0" width="480" height="320" fill="url(#citySky)"/>' +
      '<rect x="0" y="150" width="90" height="90" fill="#b8c4d0"/>' +
      '<rect x="110" y="110" width="80" height="130" fill="#c4c8d4"/>' +
      '<rect x="240" y="170" width="100" height="70" fill="#b8c4d0"/>' +
      '<rect x="380" y="130" width="100" height="110" fill="#c4c8d4"/>' +
      '<rect x="0" y="240" width="480" height="80" fill="#6a7684"/>' +
      '<path d="M0 258 L480 258" stroke="#ffd23f" stroke-width="3" stroke-dasharray="18 14"/>',
    elements: [
      { id: 'house', x: 80, y: 195, s: 1, rot: 0, hitR: 32, fill: '#ff8a5c', palette: ['#c46b3f', '#ff5b8a', '#8a6ac4'], variantMax: 1,
        draw: function (opt) {
          var s = rc(-24, -4, 48, 34, '#f0e8d8') +
            pa('M-30 -4 L0 -30 L30 -4 Z', opt.fill) +
            rc(-10, 12, 20, 18, '#a05a2c') +
            c(-1, 21, 1.5, '#ffd23f') +
            rc(-18, 6, 12, 10, '#c4e8ff') + rc(8, 6, 12, 10, '#c4e8ff');
          if (opt.variant === 1) {
            s += rc(16, -24, 6, 14, '#8a6a4a') + c(19, -30, 2.5, '#8a8a8a');
          }
          return s;
        }
      },
      { id: 'car', x: 210, y: 285, s: 1, rot: 0, hitR: 32, fill: '#4a90c4', palette: ['#ff5b5b', '#ffd23f', '#7ec94f'], variantMax: 1,
        draw: function (opt) {
          var s = rc(-22, -8, 44, 16, opt.fill, 4) +
            rc(-8, -18, 20, 12, opt.fill, 4) +
            rc(-6, -16, 8, 8, '#c4e8ff') + rc(4, -16, 8, 8, '#c4e8ff') +
            c(-12, 8, 6, '#2b2b2b') + c(-12, 8, 2.5, '#e8e8e8') +
            c(12, 8, 6, '#2b2b2b') + c(12, 8, 2.5, '#e8e8e8');
          if (opt.variant === 1) {
            s += c(0, -22, 4, '#ffd23f');
          } else {
            s += c(24, -4, 3, '#ffd23f');
          }
          return s;
        }
      },
      { id: 'tree2', x: 320, y: 220, s: 1, rot: 0, hitR: 30, fill: '#3fae6c', palette: ['#2f9e5e', '#7ec94f', '#ff9c4a'], variantMax: 1,
        draw: function (opt) {
          var s = rc(-4, 6, 8, 18, '#a05a2c') +
            c(0, -12, 18, opt.fill);
          if (opt.variant === 1) {
            s += c(0, -12, 10, '#ffffff');
          }
          return s;
        }
      },
      { id: 'lamp', x: 420, y: 280, s: 1, rot: 0, hitR: 26, fill: '#ffd23f', palette: ['#ff9c4a', '#ff7eb3', '#8ad4ff'], variantMax: 1,
        draw: function (opt) {
          var s = rc(-2, -4, 4, 28, '#5a6a7a') +
            ln(-2, 2, -16, -6, '#5a6a7a', 4) +
            c(-16, -8, 5, opt.fill) +
            pa('M-20 -8 A8 8 0 0 1 -12 -8 Z', opt.fill);
          if (opt.variant === 1) {
            s += c(-16, -8, 10, 'rgba(255,210,63,0.25)');
          }
          return s;
        }
      },
      { id: 'cloud2', x: 140, y: 60, s: 1, rot: 0, hitR: 28, fill: '#ffffff', palette: ['#ffe3f0', '#e3f0ff', '#fff0d0'], variantMax: 0,
        draw: function (opt) { return cloudDraw(opt); }
      },
      { id: 'sun2', x: 350, y: 55, s: 1, rot: 0, hitR: 28, fill: '#ffd23f', palette: ['#ff9c4a', '#ff7eb3', '#8ad4ff'], variantMax: 0,
        draw: function (opt) {
          return c(18, opt.fill) + ln(0, -26, 0, -21, opt.fill, 4) + ln(0, 26, 0, 21, opt.fill, 4) +
            ln(-26, 0, -21, 0, opt.fill, 4) + ln(26, 0, 21, 0, opt.fill, 4);
        }
      },
      { id: 'bicycle', x: 120, y: 290, s: 1, rot: 0, hitR: 30, fill: '#ff5b5b', palette: ['#4a90c4', '#7ec94f', '#ffd23f'], variantMax: 1,
        draw: function (opt) {
          var s = c(-12, 4, 9, 'none', ' stroke="#2b2b2b" stroke-width="3"') +
            c(12, 4, 9, 'none', ' stroke="#2b2b2b" stroke-width="3"') +
            ln(-12, 4, 0, -8, opt.fill, 3) + ln(0, -8, 12, 4, opt.fill, 3) +
            ln(0, -8, 0, -12, '#2b2b2b', 3) + ln(-12, 4, 0, 4, opt.fill, 3) +
            ln(0, 4, 12, 4, opt.fill, 3) + c(0, -12, 2.5, '#2b2b2b');
          if (opt.variant === 1) {
            s += rc(12, -12, 4, 4, '#ff9c4a');
          }
          return s;
        }
      },
      { id: 'balloon', x: 260, y: 90, s: 1, rot: 0, hitR: 26, fill: '#ff5b8a', palette: ['#c98aff', '#ff8a5c', '#8ad4ff'], variantMax: 1,
        draw: function (opt) {
          var s = ce(0, -6, 11, 14, opt.fill) +
            pa('M-3 7 L0 10 L3 7 Z', '#8a3a5a') +
            ln(0, 10, 0, 22, '#8a8a8a', 1.5);
          if (opt.variant === 1) {
            s += pa('M0 -20 L-8 -12 L0 -4 L8 -12 Z', opt.fill);
          }
          return s;
        }
      },
      { id: 'bird2', x: 50, y: 70, s: 1, rot: 0, hitR: 26, fill: '#ff8a5c', palette: ['#4a90c4', '#7aa05a', '#c46b8a'], variantMax: 1,
        draw: function (opt) {
          var s = pa('M-14 0 Q-7 -10 0 -6 Q7 -10 14 0 Q7 -2 0 0 Q-7 -2 -14 0 Z', opt.fill) +
            c(-5, -8, 1.5, '#2b2b2b') + c(5, -8, 1.5, '#2b2b2b');
          if (opt.variant === 1) {
            s += pa('M-8 -8 L-8 -14 L-5 -10 Z', '#ffd23f');
          }
          return s;
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
    w: 480, h: 320,
    bg: '<defs>' +
      '<linearGradient id="winterSky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#a8c8e8"/><stop offset="1" stop-color="#e0f0ff"/></linearGradient>' +
      '</defs>' +
      '<rect x="0" y="0" width="480" height="320" fill="url(#winterSky)"/>' +
      '<path d="M0 220 Q120 205 240 220 T480 218 L480 320 L0 320 Z" fill="#ffffff"/>' +
      '<path d="M0 250 Q160 235 320 250 T480 246 L480 320 L0 320 Z" fill="#e8f4ff"/>' +
      '<ellipse cx="120" cy="55" rx="30" ry="12" fill="rgba(255,255,255,0.5)"/>',
    elements: [
      { id: 'snowman', x: 150, y: 235, s: 1, rot: 0, hitR: 34, fill: '#ffffff', palette: ['#e3f0ff', '#ffe3f0', '#fff0d0'], variantMax: 1,
        draw: function (opt) {
          var s = c(0, 14, 16, opt.fill) +
            c(0, -6, 12, opt.fill) +
            c(0, -22, 9, opt.fill) +
            c(0, -6, 1.8, '#2b2b2b') + c(0, 0, 1.8, '#2b2b2b') + c(0, 6, 1.8, '#2b2b2b') +
            c(-4, -25, 1.8, '#2b2b2b') + c(4, -25, 1.8, '#2b2b2b') +
            pa('M-2 -22 L6 -19 L-2 -16 Z', '#ff9c4a') +
            ln(-12, -8, -20, -14, '#a05a2c', 3) + ln(12, -8, 20, -14, '#a05a2c', 3);
          if (opt.variant === 1) {
            s += rc(-6, -32, 12, 4, '#4a3a2a') + rc(-4, -36, 8, 6, '#d94a3f');
          } else {
            s += rc(-8, -30, 16, 3, '#ff5b8a');
          }
          return s;
        }
      },
      { id: 'snowflake', x: 90, y: 100, s: 1, rot: 0, hitR: 26, fill: '#8ad4ff', palette: ['#c4e8ff', '#ffd9e8', '#c98aff'], variantMax: 1,
        draw: function (opt) {
          var s = '';
          if (opt.variant === 1) {
            s += star(16, 7, 6, opt.fill);
          } else {
            s += star(18, 6, 6, opt.fill);
          }
          return s;
        }
      },
      { id: 'pine', x: 260, y: 210, s: 1, rot: 0, hitR: 32, fill: '#3fae6c', palette: ['#2f9e5e', '#4a90c4', '#6fb85a'], variantMax: 1,
        draw: function (opt) {
          var s = rc(-4, 8, 8, 20, '#8a4a22') +
            pa('M0 -34 L-26 8 L26 8 Z', opt.fill) +
            pa('M0 -48 L-18 2 L18 2 Z', '#2f9e5e');
          if (opt.variant === 1) {
            s += c(-10, -6, 3.5, '#ffffff') + c(8, 0, 3, '#ffffff');
          } else {
            s += c(-8, -8, 3, '#ffffff');
          }
          return s;
        }
      },
      { id: 'igloo', x: 380, y: 260, s: 1, rot: 0, hitR: 32, fill: '#ffffff', palette: ['#e3f0ff', '#ffe3f0', '#fff0d0'], variantMax: 1,
        draw: function (opt) {
          var s = pa('M-26 12 A26 26 0 0 1 26 12 Z', opt.fill) +
            rc(-8, 2, 16, 12, '#8ab4d8') +
            ln(-16, -4, 16, -4, '#c4dce8', 2) + ln(-20, 2, 20, 2, '#c4dce8', 2);
          if (opt.variant === 1) {
            s += ln(-12, -10, -6, -10, '#c4dce8', 2) + ln(6, -10, 14, -10, '#c4dce8', 2);
          }
          return s;
        }
      },
      { id: 'sled', x: 100, y: 300, s: 1, rot: 0, hitR: 28, fill: '#ff5b5b', palette: ['#4a90c4', '#7ec94f', '#ffd23f'], variantMax: 1,
        draw: function (opt) {
          var s = pa('M-22 0 Q0 -6 22 0 Z', opt.fill) +
            ln(-20, 0, -20, 8, '#8a4a22', 3) + ln(20, 0, 20, 8, '#8a4a22', 3) +
            pa('M-24 8 Q0 12 24 8', 'none', ' stroke="#8a4a22" stroke-width="3"');
          if (opt.variant === 1) {
            s += rc(-6, -10, 10, 8, '#ffd23f') + rc(-4, -14, 6, 5, '#ff8a5c');
          }
          return s;
        }
      },
      { id: 'penguin', x: 300, y: 290, s: 1, rot: 0, hitR: 26, fill: '#ffffff', palette: ['#ffe3f0', '#e3f0ff', '#fff0d0'], variantMax: 1,
        draw: function (opt) {
          var s = pa('M0 -18 A14 14 0 0 0 0 10 A14 14 0 0 0 0 -18 Z', '#2b3a4a') +
            ce(0, -2, 7, 10, opt.fill) +
            pa('M-2 -8 L0 -14 L2 -8 Z', '#ff9c4a') +
            c(-5, -8, 1.5, '#ffffff') + c(5, -8, 1.5, '#ffffff') +
            ln(-7, 10, -9, 18, '#ff9c4a', 3) + ln(7, 10, 9, 18, '#ff9c4a', 3);
          if (opt.variant === 1) {
            s += ln(0, -14, 4, -20, '#4a3a2a', 3);
          }
          return s;
        }
      },
      { id: 'scarf', x: 430, y: 100, s: 1, rot: 0, hitR: 26, fill: '#ff5b8a', palette: ['#ffd23f', '#7ec94f', '#4a90c4'], variantMax: 1,
        draw: function (opt) {
          var s = pa('M-20 -8 Q-6 -14 8 -10 Q14 -8 22 -6 Q8 -2 -4 -2 Q-14 -2 -20 -8 Z', opt.fill) +
            ln(-16, -6, -12, -9, 'rgba(255,255,255,0.7)', 2) +
            ln(-6, -9, -2, -12, 'rgba(255,255,255,0.7)', 2) +
            ln(4, -9, 8, -11, 'rgba(255,255,255,0.7)', 2);
          if (opt.variant === 1) {
            s += c(0, -6, 2, '#ffffff');
          }
          return s;
        }
      },
      { id: 'deer', x: 200, y: 130, s: 1, rot: 0, hitR: 30, fill: '#c46b3f', palette: ['#a05a2c', '#e09a6a', '#8a6a4a'], variantMax: 1,
        draw: function (opt) {
          var s = ce(0, 4, 14, 10, opt.fill) +
            pa('M12 -2 L20 -12 L16 0 Z', opt.fill) +
            c(22, -12, 4, opt.fill) +
            c(24, -13, 1.5, '#2b2b2b') +
            pa('M20 -14 L18 -22 L22 -14 Z', '#8a4a22') + pa('M22 -14 L26 -20 L24 -12 Z', '#8a4a22') +
            ln(-6, 12, -10, 20, '#8a4a22', 3) + ln(2, 13, 0, 20, '#8a4a22', 3) +
            ln(10, 13, 10, 20, '#8a4a22', 3);
          if (opt.variant === 1) {
            s += ln(-16, -4, -22, -10, '#8a4a22', 2.5);
          }
          return s;
        }
      },
      { id: 'mitten', x: 320, y: 110, s: 1, rot: 0, hitR: 26, fill: '#ff5b8a', palette: ['#c98aff', '#ffd23f', '#4a90c4'], variantMax: 1,
        draw: function (opt) {
          var s = pa('M-10 -2 Q-14 10 -6 14 Q-2 16 4 12 Q10 8 8 0 Q6 -10 0 -12 Q-6 -12 -10 -2 Z', opt.fill) +
            rc(-2, -14, 12, 6, opt.fill, 2) +
            ln(0, -18, 0, -14, '#8a8a8a', 2);
          if (opt.variant === 1) {
            s += c(-2, 2, 2.5, '#ffffff') + c(4, 6, 2, '#ffffff');
          }
          return s;
        }
      }
    ]
  };

  /* ============================================================
     场景 8：花园
     ============================================================ */
  var garden = {
    id: 'garden',
    name: '花园',
    w: 480, h: 320,
    bg: '<defs>' +
      '<linearGradient id="gardenSky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#8ad4ff"/><stop offset="1" stop-color="#fff0e8"/></linearGradient>' +
      '</defs>' +
      '<rect x="0" y="0" width="480" height="320" fill="url(#gardenSky)"/>' +
      '<path d="M0 230 Q120 218 240 230 T480 228 L480 320 L0 320 Z" fill="#7ec97a"/>' +
      '<path d="M0 260 Q160 248 320 260 T480 256 L480 320 L0 320 Z" fill="#6fb85a"/>' +
      '<ellipse cx="120" cy="60" rx="34" ry="18" fill="rgba(255,255,255,0.7)"/>' +
      '<ellipse cx="360" cy="40" rx="28" ry="14" fill="rgba(255,255,255,0.6)"/>',
    elements: [
      { id: 'flower2', x: 70, y: 180, s: 1, rot: 0, hitR: 28, fill: '#ff7eb3', palette: ['#c98aff', '#ffd23f', '#ff8a5c'], variantMax: 1,
        draw: function (opt) {
          var s = ln(0, -2, 0, 16, '#3fae6c', 3) +
            ce(-5, 12, 4, 2.5, '#3fae6c');
          var n = (opt.variant === 1) ? 4 : 6;
          for (var i = 0; i < n; i++) {
            var a = (i * 2 * Math.PI) / 6;
            s += ce(Math.cos(a) * 8, Math.sin(a) * 8 - 8, 6, 5, opt.fill);
          }
          return s + c(0, -8, 4.5, '#ffd23f');
        }
      },
      { id: 'bee', x: 160, y: 100, s: 1, rot: 0, hitR: 26, fill: '#ffd23f', palette: ['#ff9c4a', '#ff8a5c', '#8ad4ff'], variantMax: 1,
        draw: function (opt) {
          var s = ce(-8, 2, 5, 7, 'rgba(255,255,255,0.8)', ' transform="rotate(-30 -8 2)"') +
            ce(8, 2, 5, 7, 'rgba(255,255,255,0.8)', ' transform="rotate(30 8 2)"') +
            ce(0, 0, 10, 7, opt.fill) +
            ln(-4, -5, -4, 5, '#2b2b2b', 2.5) + ln(3, -6, 3, 6, '#2b2b2b', 2.5) +
            c(10, 0, 1.8, '#2b2b2b') +
            pa('M-10 0 L-16 -2 L-14 2 Z', '#2b2b2b');
          if (opt.variant === 1) {
            s += ln(12, 0, 18, 4, '#2b2b2b', 1.5);
          }
          return s;
        }
      },
      { id: 'butterfly2', x: 260, y: 90, s: 1, rot: 0, hitR: 28, fill: '#ffd23f', palette: ['#ff7eb3', '#c98aff', '#7ec9ff'], variantMax: 1,
        draw: function (opt) {
          var s = ce(-10, -2, 12, 16, opt.fill, ' transform="rotate(-15 -10 -2)"') +
            ce(10, -2, 12, 16, opt.fill, ' transform="rotate(15 10 -2)"') +
            ce(0, 2, 2.5, 13, '#5a3a2a');
          if (opt.variant === 1) {
            s += c(-10, -2, 2.5, '#ffffff') + c(10, -2, 2.5, '#ffffff');
          }
          return s;
        }
      },
      { id: 'snail', x: 340, y: 280, s: 1, rot: 0, hitR: 26, fill: '#c46b3f', palette: ['#a05a2c', '#c46b8a', '#8a9a4a'], variantMax: 1,
        draw: function (opt) {
          var s = pa('M-14 6 Q-6 -2 4 4 Q10 8 6 10 Q0 12 -10 8 Z', '#e8d8a0') +
            pa('M-2 0 A12 12 0 0 1 -2 -24 A12 12 0 0 1 -2 0 Z', opt.fill) +
            pa('M-2 -6 A6 6 0 0 1 -2 -18 A6 6 0 0 1 -2 -6 Z', '#ffd9c4');
          if (opt.variant === 1) {
            s += c(-10, -12, 2, '#ffffff');
          }
          return s;
        }
      },
      { id: 'watering', x: 420, y: 250, s: 1, rot: 0, hitR: 28, fill: '#7ec9ff', palette: ['#c98aff', '#7ec97a', '#ff8a5c'], variantMax: 1,
        draw: function (opt) {
          var s = rc(-10, -2, 22, 14, opt.fill, 4) +
            rc(10, -8, 14, 8, '#7a9ab8', 3) +
            pa('M-10 4 L-16 14 L-8 14 Z', '#7a9ab8') +
            pa('M6 -4 Q16 -10 20 -4 Q16 -2 10 -2 Z', '#5a7a9a');
          if (opt.variant === 1) {
            s += c(-18, 16, 2, '#8ad4ff') + c(-14, 20, 1.5, '#8ad4ff') + c(-21, 21, 1.5, '#8ad4ff');
          } else {
            s += c(-17, 17, 1.5, '#8ad4ff');
          }
          return s;
        }
      },
      { id: 'fence2', x: 180, y: 300, s: 1, rot: 0, hitR: 28, fill: '#e8d0a0', palette: ['#c4a86a', '#a08050', '#ffd9c4'], variantMax: 1,
        draw: function (opt) {
          var s = ln(-28, 0, -28, -18, '#a08050', 4) + ln(0, 0, 0, -18, '#a08050', 4) +
            ln(28, 0, 28, -18, '#a08050', 4) +
            ln(-32, -4, 32, -4, opt.fill, 3) + ln(-32, 3, 32, 3, opt.fill, 3);
          if (opt.variant === 1) {
            s += ln(14, 2, 18, -8, '#a08050', 4);
          }
          return s;
        }
      },
      { id: 'sun3', x: 60, y: 60, s: 1, rot: 0, hitR: 28, fill: '#ffd23f', palette: ['#ff9c4a', '#ff7eb3', '#8ad4ff'], variantMax: 0,
        draw: function (opt) {
          return c(18, opt.fill) + ln(0, -26, 0, -21, opt.fill, 4) + ln(0, 26, 0, 21, opt.fill, 4) +
            ln(-26, 0, -21, 0, opt.fill, 4) + ln(26, 0, 21, 0, opt.fill, 4) +
            ln(-18, -18, -15, -15, opt.fill, 3.5) + ln(18, -18, 15, -15, opt.fill, 3.5) +
            ln(-18, 18, -15, 15, opt.fill, 3.5) + ln(18, 18, 15, 15, opt.fill, 3.5);
        }
      },
      { id: 'mushroom2', x: 270, y: 300, s: 1, rot: 0, hitR: 26, fill: '#c46bff', palette: ['#ff5b8a', '#ff8a5c', '#ffd23f'], variantMax: 1,
        draw: function (opt) {
          var s = rc(-5, 4, 10, 12, '#ffe8d0') +
            pa('M-15 -4 A15 15 0 0 1 15 -4 Z', opt.fill);
          if (opt.variant === 1) {
            s += c(-6, -12, 2.5, '#ffffff') + c(5, -8, 2, '#ffffff') + c(-1, -3, 2, '#ffffff');
          } else {
            s += c(-5, -13, 2, '#ffffff') + c(6, -10, 2, '#ffffff');
          }
          return s;
        }
      },
      { id: 'ladybug', x: 450, y: 150, s: 1, rot: 0, hitR: 26, fill: '#ff5b5b', palette: ['#ff9c4a', '#c46b8a', '#ffd23f'], variantMax: 1,
        draw: function (opt) {
          var s = pa('M0 -14 A14 14 0 0 1 0 14 A14 14 0 0 1 0 -14 Z', opt.fill) +
            ln(-8, -4, 8, -4, '#2b2b2b', 2) +
            c(-5, 2, 2, '#2b2b2b') + c(5, 2, 2, '#2b2b2b') +
            c(-5, -9, 2, '#2b2b2b') + c(5, -9, 2, '#2b2b2b') +
            c(0, -18, 4, '#2b2b2b') + c(-1, -20, 1.2, '#ffffff');
          if (opt.variant === 1) {
            s += c(-11, 6, 1.5, '#ffffff');
          }
          return s;
        }
      }
    ]
  };

  /* ============================================================
     导出
     ============================================================ */
  window.SCENES = [ocean, forest, farm, space, undersea, city, winter, garden];
})();
