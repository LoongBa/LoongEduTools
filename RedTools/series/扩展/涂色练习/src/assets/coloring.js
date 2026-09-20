/* ============================================================
   涂色练习 — 线稿库与填色引擎（window.ColorApp 命名空间，Chrome 61）
   6 个程序化 SVG 线稿主题（几何构图分区 + 深色描边）
   填色：调色板点色 → 点区填色；完成 = 全部区非白
   依赖 main.js：M.makeEl / M.clearNode / M.viewEl / M.store 等
   约束：不超 ES2017、事件全 addEventListener、零图片素材
   ============================================================ */
(function () {
  'use strict';

  var M = window.ColorApp;

  var PALETTE = M.PALETTE = [
    '#ff5252', '#ff9c1a', '#ffe94d', '#57d68d', '#3dd6d0',
    '#4aa3ff', '#8e6ee8', '#ff8ab8', '#b08968', '#7a7f87'
  ];
  var ERASER = '#ffffff';

  /* ---------- 线稿小工具（绝对坐标 320×280 视口） ---------- */
  function ray(a, r1, r2, cx, cy) { // 光芒三角点串
    var rad = a * Math.PI / 180;
    var da = 9 * Math.PI / 180;
    var p1 = [cx + r1 * Math.cos(rad), cy + r1 * Math.sin(rad)];
    var p2 = [cx + r2 * Math.cos(rad - da), cy + r2 * Math.sin(rad - da)];
    var p3 = [cx + r2 * Math.cos(rad + da), cy + r2 * Math.sin(rad + da)];
    return p1[0].toFixed(1) + ',' + p1[1].toFixed(1) + ' ' +
           p2[0].toFixed(1) + ',' + p2[1].toFixed(1) + ' ' +
           p3[0].toFixed(1) + ',' + p3[1].toFixed(1);
  }

  /* ---------- 6 个线稿主题 ---------- */
  var sun = {
    id: 'sun', name: '太阳', w: 320, h: 260,
    parts: (function () {
      var list = [{ id: 'r', name: '日轮', svg: '<circle cx="160" cy="130" r="52"/>' }];
      for (var i = 0; i < 8; i++) {
        list.push({ id: 'ray' + i, name: '光芒' + (i + 1),
          svg: '<polygon points="' + ray(i * 45, 62, 86, 160, 130) + '"/>' });
      }
      return list;
    })()
  };
  var apple = {
    id: 'apple', name: '苹果', w: 320, h: 260,
    parts: [
      { id: 'body', name: '果身', svg: '<ellipse cx="160" cy="165" rx="52" ry="48"/>' },
      { id: 'stem', name: '果柄', svg: '<rect x="154" y="92" width="12" height="30" rx="4"/>' },
      { id: 'leaf', name: '叶子', svg: '<ellipse cx="146" cy="94" rx="20" ry="10" transform="rotate(-32 146 94)"/>' },
      { id: 'shine', name: '高光', svg: '<ellipse cx="140" cy="147" rx="12" ry="8" transform="rotate(-20 140 147)"/>' }
    ]
  };
  var flower = {
    id: 'flower', name: '小花', w: 320, h: 260,
    parts: (function () {
      var list = [];
      for (var i = 0; i < 6; i++) {
        var a = i * 60;
        list.push({ id: 'petal' + i, name: '花瓣' + (i + 1),
          svg: '<ellipse cx="160" cy="133" rx="19" ry="36" transform="rotate(' + a + ' 160 160)"/>' });
      }
      list.push({ id: 'center', name: '花心', svg: '<circle cx="160" cy="160" r="21"/>' });
      list.push({ id: 'stem', name: '花茎', svg: '<rect x="154" y="180" width="12" height="64" rx="5"/>' });
      list.push({ id: 'leaf', name: '叶子', svg: '<ellipse cx="144" cy="212" rx="24" ry="11" transform="rotate(-38 144 212)"/>' });
      return list;
    })()
  };
  var house = {
    id: 'house', name: '房子', w: 320, h: 260,
    parts: [
      { id: 'wall', name: '墙壁', svg: '<rect x="96" y="146" width="128" height="90" rx="3"/>' },
      { id: 'roof', name: '屋顶', svg: '<polygon points="88,150 160,86 232,150"/>' },
      { id: 'chimney', name: '烟囱', svg: '<rect x="202" y="96" width="16" height="34" rx="3"/>' },
      { id: 'door', name: '门', svg: '<rect x="158" y="196" width="30" height="40" rx="3"/>' },
      { id: 'win1', name: '窗户', svg: '<rect x="112" y="168" width="30" height="30" rx="3"/>' },
      { id: 'win2', name: '窗户2', svg: '<rect x="200" y="168" width="30" height="30" rx="3"/>' },
      { id: 'sun', name: '小太阳', svg: '<circle cx="60" cy="70" r="22"/>' }
    ]
  };
  var fish = {
    id: 'fish', name: '小鱼', w: 320, h: 260,
    parts: [
      { id: 'body', name: '鱼身', svg: '<ellipse cx="152" cy="130" rx="58" ry="36"/>' },
      { id: 'tail', name: '尾巴', svg: '<polygon points="202,104 232,130 202,156 214,130"/>' },
      { id: 'fin', name: '背鳍', svg: '<polygon points="160,98 150,72 186,102"/>' },
      { id: 'fins', name: '腹鳍', svg: '<polygon points="158,162 168,188 182,160"/>' },
      { id: 'eye', name: '眼睛', svg: '<circle cx="126" cy="120" r="8"/>' }
    ]
  };
  var tree = {
    id: 'tree', name: '大树', w: 320, h: 260,
    parts: [
      { id: 'c1', name: '树冠1', svg: '<circle cx="160" cy="96" r="52"/>' },
      { id: 'c2', name: '树冠2', svg: '<circle cx="118" cy="122" r="34"/>' },
      { id: 'c3', name: '树冠3', svg: '<circle cx="202" cy="122" r="34"/>' },
      { id: 'trunk', name: '树干', svg: '<rect x="150" y="150" width="22" height="74" rx="5"/>' },
      { id: 'g1', name: '草地', svg: '<ellipse cx="160" cy="236" rx="86" ry="14"/>' },
      { id: 'g2', name: '小草', svg: '<rect x="86" y="222" width="8" height="18" rx="3"/><rect x="232" y="224" width="8" height="16" rx="3"/>' }
    ]
  };

  var THEMES = M.THEMES = [sun, apple, flower, house, fish, tree];
  var themeMap = {};
  THEMES.forEach(function (t) { themeMap[t.id] = t; });
  M.themeMap = themeMap;

  /* ---------- 线稿渲染 ---------- */
  M.renderArt = function (theme, colors, opts) {
    opts = opts || {};
    var parts = [];
    parts.push('<svg class="art-svg" viewBox="0 0 ' + theme.w + ' ' + theme.h + '"' +
      (opts.id ? ' id="' + opts.id + '"' : '') + '>');
    theme.parts.forEach(function (p) {
      var c = (colors && colors[p.id]) ? colors[p.id] : '#ffffff';
      parts.push('<g class="art-part' + (opts.clickable ? ' clickable' : '') + '" data-id="' + p.id + '">' +
        p.svg.replace(/\s*\/>/g, ' fill="' + c + '" stroke="#4a4a4a" stroke-width="4"' +
          ' stroke-linejoin="round" stroke-linecap="round"/>') +
        '</g>');
    });
    parts.push('</svg>');
    var div = M.makeEl('div', 'art-wrap');
    div.innerHTML = parts.join('');
    return div;
  };

  /* 主题缩略（作品集/选择页用，小尺寸） */
  M.renderThumb = function (theme, colors, opts) {
    var div = M.renderArt(theme, colors || {}, opts || {});
    div.className += ' art-thumb';
    return div;
  };

  /* ---------- 填色进度 ---------- */
  M.paintCount = function (theme, colors) {
    var n = 0;
    theme.parts.forEach(function (p) {
      if (colors[p.id] && colors[p.id] !== ERASER) { n += 1; }
    });
    return n;
  };
  M.isComplete = function (theme, colors) {
    return M.paintCount(theme, colors) >= theme.parts.length;
  };
  M.PALETTE = PALETTE;
  M.ERASER = ERASER;
})();