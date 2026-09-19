/* ============================================================
   翻牌记忆配对 — 图标库（SVG 程序化生成，Chrome 61 基线经典脚本）
   ------------------------------------------------------------
   说明：
   - 定义 window.ICONS：24 个童趣扁平 SVG 图标（糖果色）
   - 每个图标 = { id, label, draw }
     - id：图标标识（卡片配对用，全局唯一）
     - label：中文名（备用）
     - draw()：返回以 (0,0) 为中心的 <svg> 字符串
       （viewBox -20 -20 40 40，卡片内直接 innerHTML 渲染）
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
  /* SVG 包裹：以 (0,0) 为中心，40×40 视口 */
  function svgWrap(inner) {
    return '<svg viewBox="-20 -20 40 40" xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>';
  }

  /* ============================================================
     图标库：24 个童趣扁平图标（糖果色填充）
     ============================================================ */
  var ICONS = [
    { id: 'sun', label: '太阳',
      draw: function () {
        return svgWrap(c(14, '#ffd23f') +
          ln(0, -20, 0, -17, '#ffd23f', 3) + ln(0, 20, 0, 17, '#ffd23f', 3) +
          ln(-20, 0, -17, 0, '#ffd23f', 3) + ln(20, 0, 17, 0, '#ffd23f', 3) +
          ln(-14, -14, -12, -12, '#ffd23f', 3) + ln(14, -14, 12, -12, '#ffd23f', 3) +
          ln(-14, 14, -12, 12, '#ffd23f', 3) + ln(14, 14, 12, 12, '#ffd23f', 3));
      }
    },
    { id: 'cloud', label: '云朵',
      draw: function () {
        return svgWrap(ce(0, 0, 13, 8, '#8ad4ff') + ce(-10, 3, 8, 5.5, '#8ad4ff') +
          ce(10, 3, 8, 5.5, '#8ad4ff') + ce(-16, 5, 5, 3.5, '#8ad4ff') + ce(16, 5, 5, 3.5, '#8ad4ff'));
      }
    },
    { id: 'moon', label: '月亮',
      draw: function () {
        return svgWrap(c(16, '#ffd23f') + c(-3, -4, 12, '#ffffff') +
          c(-8, 2, 2.5, '#f0b429') + c(-2, -8, 2, '#f0b429'));
      }
    },
    { id: 'star', label: '星星',
      draw: function () {
        return svgWrap(star(17, 7, 5, '#ffd23f') + c(0, -7, 2, '#ffffff'));
      }
    },
    { id: 'flower', label: '花朵',
      draw: function () {
        var s = '';
        for (var i = 0; i < 6; i++) {
          var a = (i * 2 * Math.PI) / 6;
          s += ce(Math.cos(a) * 9, Math.sin(a) * 9, 6, 7, '#ff7eb3');
        }
        return svgWrap(s + c(0, 0, 4.5, '#ffd23f'));
      }
    },
    { id: 'tree', label: '大树',
      draw: function () {
        return svgWrap(rc(-3, 4, 6, 14, '#a05a2c') +
          pa('M0 -16 L-16 8 L16 8 Z', '#3fae6c') +
          pa('M0 -26 L-11 2 L11 2 Z', '#2f9e5e'));
      }
    },
    { id: 'fish', label: '小鱼',
      draw: function () {
        return svgWrap(pa('M14 0 L-2 -11 L-2 11 Z', '#ff8a5c') +
          ce(0, 0, 13, 8, '#ff8a5c') +
          c(6, -2, 1.8, '#2b2b2b') +
          ln(-4, -6, -4, 6, 'rgba(255,255,255,0.65)', 2.5));
      }
    },
    { id: 'boat', label: '帆船',
      draw: function () {
        return svgWrap(ln(0, -12, 0, 4, '#a05a2c', 1.5) +
          pa('M-16 4 L-8 -10 L0 4 Z', '#ffd23f') +
          pa('M0 4 L0 -12 L10 4 Z', '#ff6b6b') +
          pa('M-19 4 L-8 9 L14 9 L19 4 Z', '#a05a2c'));
      }
    },
    { id: 'apple', label: '苹果',
      draw: function () {
        return svgWrap(ln(0, -12, 0, -17, '#8a4a22', 2.5) +
          ce(0, 0, 12, 11, '#ff6b6b') +
          ce(3, -6, 3, 2, 'rgba(255,255,255,0.5)') +
          pa('M1 -14 Q8 -20 10 -14 Q6 -10 1 -14 Z', '#3fae6c'));
      }
    },
    { id: 'watermelon', label: '西瓜',
      draw: function () {
        return svgWrap(pa('M-17 2 A17 17 0 0 1 17 2 L15 2 A15 15 0 0 0 -15 2 Z', '#7aa05a') +
          pa('M-15 2 A15 15 0 0 1 15 2 Z', '#ff6b6b') +
          c(-6, -4, 1.5, '#2b2b2b') + c(0, -8, 1.5, '#2b2b2b') + c(6, -4, 1.5, '#2b2b2b'));
      }
    },
    { id: 'butterfly', label: '蝴蝶',
      draw: function () {
        return svgWrap(ce(-9, -2, 8, 12, '#c98aff', ' transform="rotate(-20 -9 -2)"') +
          ce(9, -2, 8, 12, '#c98aff', ' transform="rotate(20 9 -2)"') +
          c(-9, -2, 2.5, '#ffffff') + c(9, -2, 2.5, '#ffffff') +
          ce(0, 2, 2, 10, '#5a3a2a'));
      }
    },
    { id: 'heart', label: '爱心',
      draw: function () {
        return svgWrap(ce(-7, -4, 7, 7, '#ff5b8a') + ce(7, -4, 7, 7, '#ff5b8a') +
          pa('M-13 1 L13 1 L0 15 Z', '#ff5b8a'));
      }
    },
    { id: 'raindrop', label: '雨滴',
      draw: function () {
        return svgWrap(pa('M0 -14 L-9 2 L9 2 Z', '#5b8def') + c(0, 6, 9, '#5b8def') +
          c(-3, 4, 2.5, 'rgba(255,255,255,0.5)'));
      }
    },
    { id: 'snow', label: '雪花',
      draw: function () {
        return svgWrap(star(16, 6, 6, '#8ad4ff'));
      }
    },
    { id: 'balloon', label: '气球',
      draw: function () {
        return svgWrap(pa('M-4 -14 L-1 -8 L3 -14 Z', 'rgba(255,255,255,0.55)') +
          ce(0, -4, 9, 12, '#ff6b6b') +
          pa('M-2 7 L0 10 L2 7 Z', '#c44a4a') +
          ln(0, 10, 0, 18, '#b0b8c4', 1.5));
      }
    },
    { id: 'cat', label: '猫咪',
      draw: function () {
        return svgWrap(pa('M-4 -12 L-14 -12 L-10 -4 Z', '#ff9c4a') +
          pa('M4 -12 L14 -12 L10 -4 Z', '#ff9c4a') +
          c(0, 2, 12, '#ff9c4a') +
          c(-4, -1, 1.8, '#2b2b2b') + c(4, -1, 1.8, '#2b2b2b') +
          pa('M-2 3 L0 6 L2 3 Z', '#ff7eb3') +
          ln(-5, 4, -7, 6, '#2b2b2b', 1.5) + ln(5, 4, 7, 6, '#2b2b2b', 1.5));
      }
    },
    { id: 'mushroom', label: '蘑菇',
      draw: function () {
        return svgWrap(rc(-5, 4, 10, 12, '#ffe8d0') +
          pa('M-15 -4 A15 15 0 0 1 15 -4 Z', '#c46bff') +
          c(-6, -12, 2.5, '#ffffff') + c(6, -8, 2, '#ffffff') + c(-1, -4, 2, '#ffffff'));
      }
    },
    { id: 'plane', label: '飞机',
      draw: function () {
        return svgWrap(ce(-1, 0, 16, 5, '#5b8def') +
          pa('M-16 -5 L-16 -14 L-7 -5 Z', '#4a7ade') +
          pa('M14 -1 L22 0 L14 3 Z', '#4a7ade') +
          pa('M0 2 L6 -9 L15 2 Z', '#7aa7f0') +
          c(2, -1, 2.2, '#ffffff'));
      }
    },
    { id: 'rainbow', label: '彩虹',
      draw: function () {
        return svgWrap(pa('M-19 8 A19 19 0 0 1 19 8 Z', '#ff8a5c') +
          pa('M-15 8 A15 15 0 0 1 15 8 Z', '#ffd23f') +
          pa('M-11 8 A11 11 0 0 1 11 8 Z', '#7ec97a') +
          pa('M-7 8 A7 7 0 0 1 7 8 Z', '#5b8def'));
      }
    },
    { id: 'bee', label: '蜜蜂',
      draw: function () {
        return svgWrap(ce(-6, 1, 4, 6, 'rgba(255,255,255,0.85)', ' transform="rotate(-30 -6 1)"') +
          ce(6, 1, 4, 6, 'rgba(255,255,255,0.85)', ' transform="rotate(30 6 1)"') +
          ce(0, 0, 9, 6, '#ffd23f') +
          ln(-4, -4, -4, 4, '#2b2b2b', 2) + ln(2, -5, 2, 5, '#2b2b2b', 2) +
          c(9, 0, 1.8, '#2b2b2b') +
          pa('M-9 0 L-15 -1 L-13 2 Z', '#2b2b2b'));
      }
    },
    { id: 'snowman', label: '雪人',
      draw: function () {
        return svgWrap(c(0, 9, 10, '#ffffff', ' stroke="#c4dce8" stroke-width="1.5"') +
          c(0, -5, 8, '#ffffff', ' stroke="#c4dce8" stroke-width="1.5"') +
          c(0, -16, 6.5, '#ffffff', ' stroke="#c4dce8" stroke-width="1.5"') +
          c(-2, -18, 1.2, '#2b2b2b') + c(2, -18, 1.2, '#2b2b2b') +
          pa('M-1 -15 L1 -15 L0 -13 Z', '#ff9c4a') +
          rc(-4, -21, 8, 3, '#4a3a2a') + rc(-2.5, -24, 5, 4, '#ff5b8a') +
          c(-6, -4, 1, '#2b2b2b') + c(0, -2, 1, '#2b2b2b') + c(6, -4, 1, '#2b2b2b'));
      }
    },
    { id: 'crown', label: '皇冠',
      draw: function () {
        return svgWrap(pa('M-15 4 L-17 -10 L-9 -3 L0 -13 L9 -3 L17 -10 L15 4 Z', '#ffd23f') +
          rc(-12, 4, 24, 5, '#ffd23f', 1.5) +
          c(-7, 0, 1.8, '#ff5b8a') + c(0, 1, 1.8, '#5b8def') + c(7, 0, 1.8, '#ff5b8a'));
      }
    },
    { id: 'guitar', label: '吉他',
      draw: function () {
        return svgWrap(rc(-2.5, -24, 5, 5, '#8a4a22', 1) +
          rc(-1.5, -20, 3, 13, '#a05a2c') +
          ce(0, 7, 10, 12, '#c46b3f') +
          c(0, 7, 3.5, '#2b2b2b') + c(0, 7, 2, '#e8e0d0') +
          ln(-2, -3, -2, 15, 'rgba(255,255,255,0.5)', 1) +
          ln(0, -3, 0, 15, 'rgba(255,255,255,0.5)', 1) +
          ln(2, -3, 2, 15, 'rgba(255,255,255,0.5)', 1));
      }
    },
    { id: 'rocket', label: '火箭',
      draw: function () {
        return svgWrap(pa('M0 -20 L-7 -12 L7 -12 Z', '#ff6b6b') +
          rc(-7, -12, 14, 15, '#ff6b6b') +
          pa('M-7 3 L-11 8 L-7 6 Z', '#5b8def') + pa('M7 3 L11 8 L7 6 Z', '#5b8def') +
          c(0, -7, 3.5, '#ffffff') +
          pa('M-4 3 L0 10 L4 3 Z', '#ffd23f'));
      }
    }
  ];

  /* ============================================================
     导出
     ============================================================ */
  window.ICONS = ICONS;
})();
