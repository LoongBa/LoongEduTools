/* ============================================================
   因果排序 — 序列卡片库（SVG 程序化生成，Chrome 61 基线经典脚本）
   ------------------------------------------------------------
   说明：
   - 定义 window.CAUSALS：8 条「因果/时间」序列（共 33 张卡片）
     昼夜三部曲 3 / 花开三部曲 3 / 晨起流程 4 / 蝴蝶成长 4 /
     做蛋糕 4 / 青蛙成长 4 / 植物生长 5 / 洗手流程 5
   - 每条序列 = { id, name, steps: [drawFn, ...] }
     - steps 数组顺序即正确因果顺序（steps[0] 最先发生）
     - 每个 drawFn 返回一张完整卡片 <svg>（viewBox="-65 -65 130 130"，
       内容以 (0,0) 为中心，童趣扁平风糖果色）
   - 难度取序列（硬编码）：3 步 → daycycle/bloom；4 步 →
     morning/butterfly/cake/frog；5 步 → plant/wash
   - 约束：ES2017 经典脚本（var+function）、无内联事件/eval、
     无外部资源；卡片之间用明显「因果递进」视觉差区分
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 形状小工具（同简单拼图 scenes.js 局部风格） ---------- */
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
  function ln(x1, y1, x2, y2, st, w, extra) {
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + st +
      '" stroke-width="' + w + '"' + (extra || '') + '/>';
  }
  /* N 角星点串（装饰/闪光） */
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
  function greenHill(f) { return pa('M-65 12 Q-32 -2 0 12 Q32 26 65 12 L65 65 L-65 65 Z', f); }
  function cloud(x, y, f) {
    return ce(x, y, 14, 8, f) + ce(x - 9, y + 3, 8, 5.5, f) + ce(x + 9, y + 3, 8, 5.5, f) +
      ce(x - 14, y + 4, 5, 4, f) + ce(x + 14, y + 4, 5, 4, f);
  }
  /* 太阳光芒（中心 x/y，伸出 21→15） */
  function sunRays(x, y) {
    return ln(x, y - 21, x, y - 15, '#ffd23f', 4) + ln(x, y + 15, x, y + 21, '#ffd23f', 4) +
      ln(x - 21, y, x - 15, y, '#ffd23f', 4) + ln(x + 15, y, x + 21, y, '#ffd23f', 4) +
      ln(x - 15, y - 15, x - 11, y - 11, '#ffd23f', 4) + ln(x + 15, y - 15, x + 11, y - 11, '#ffd23f', 4) +
      ln(x - 15, y + 15, x - 11, y + 11, '#ffd23f', 4) + ln(x + 15, y + 15, x + 11, y + 11, '#ffd23f', 4);
  }
  /* 小朋友头部（中心 x/y，面向右） */
  function kidHead(x, y) {
    return cc(x, y, 9, '#ffce9e') +
      pa('M' + (x - 9) + ' ' + (y - 2) + ' A9 9 0 0 1 ' + (x + 9) + ' ' + (y - 2) + ' Z', '#5a3a2a') +
      cc(x - 3.5, y + 2, 1.7, '#2b2b2b') + cc(x + 3.5, y + 2, 1.7, '#2b2b2b') +
      pa('M' + (x - 2) + ' ' + (y + 4) + ' L' + x + ' ' + (y + 7) + ' L' + (x + 2) + ' ' + (y + 4) + ' Z', '#ff8a7a');
  }
  function kidBody(cx, cy, shirt) { return ce(cx, cy, 9, 11, shirt); }

  /* ============================================================
     序列 1：昼夜三部曲（3 步，天空色 + 太阳位置递进）
     ============================================================ */
  var daycycle = {
    id: 'daycycle',
    name: '昼夜三部曲',
    steps: [
      /* 日出：粉色霞光 + 刚冒出地平线的半轮朝阳 */
      function () {
        return w(
          sky('#ffc9cf') +
          pa('M-21 -8 A21 21 0 0 1 21 -8 Z', '#ffb52e') +
          ce(0, -5, 26, 6, '#ffd98a') +
          greenHill('#7ec97a')
        );
      },
      /* 正午：蓝天 + 高挂的太阳 + 云朵 */
      function () {
        return w(
          sky('#7ec9ff') +
          cc(0, -42, 15, '#ffd23f') +
          sunRays(0, -42) +
          cloud(-25, -24, '#ffffff') +
          cloud(24, -14, '#e8f6ff') +
          greenHill('#5ec86a')
        );
      },
      /* 日落：橘红天空 + 低垂半轮夕阳 + 深色剪影 */
      function () {
        return w(
          sky('#ff8a5c') +
          pa('M-5 2 A19 19 0 0 1 33 2 Z', '#ff7a3d') +
          ce(8, 3, 26, 6, '#ffd98a') +
          greenHill('#c26a4a')
        );
      }
    ]
  };

  /* ============================================================
     序列 2：花开三部曲（3 步，花苞 → 半开 → 盛开）
     ============================================================ */
  function bloomPot() {
    return pa('M-22 36 L22 36 L16 60 L-16 60 Z', '#c96a3a') +
      rc(-25, 31, 50, 8, '#d97a4a', 3);
  }
  function bloomStem() {
    return rc(-2.5, -32, 5, 63, '#3fae6c');
  }
  var bloom = {
    id: 'bloom',
    name: '花开三部曲',
    steps: [
      /* 花苞：闭合的绿色花苞，还没开 */
      function () {
        return w(
          sky('#eaf7ea') +
          bloomStem() +
          ce(0, -38, 8, 14, '#6fbf5f') +
          pa('M-5 -50 Q0 -58 5 -50 Z', '#5fae52') +
          ce(-7, -27, 4, 3, '#5fae52') + ce(7, -27, 4, 3, '#5fae52') +
          bloomPot()
        );
      },
      /* 半开：粉色花瓣尖从花苞里探出来 */
      function () {
        return w(
          sky('#eaf7ea') +
          bloomStem() +
          ce(0, -38, 8, 14, '#6fbf5f') +
          pl('-7,-48 7,-48 0,-40', '#ff8ac2') +
          ce(-8, -32, 4.5, 7, '#ff9ec4', ' transform="rotate(14 -8 -32)"') +
          ce(8, -32, 4.5, 7, '#ff9ec4', ' transform="rotate(-14 8 -32)"') +
          bloomPot()
        );
      },
      /* 盛开：六片花瓣全开 + 花心 + 叶子 */
      function () {
        var s = sky('#eaf7ea') + bloomStem();
        for (var i = 0; i < 6; i++) {
          var a = (i * Math.PI) / 3;
          var px = (Math.cos(a) * 10).toFixed(1);
          var py = (-38 + Math.sin(a) * 10).toFixed(1);
          s += ce(px, py, 7, 5, '#ff8ac2');
        }
        return w(s +
          ce(0, -38, 5.5, 5.5, '#ffd23f') +
          ce(-10, -8, 7, 3.5, '#3fae6c', ' transform="rotate(-35 -10 -8)"') +
          ce(10, -10, 7, 3.5, '#3fae6c', ' transform="rotate(35 10 -10)"') +
          bloomPot());
      }
    ]
  };

  /* ============================================================
     序列 3：晨起流程（4 步，起床 → 洗漱 → 早餐 → 出门）
     ============================================================ */
  var morning = {
    id: 'morning',
    name: '晨起流程',
    steps: [
      /* 起床：小朋友从床上坐起来 */
      function () {
        return w(
          sky('#e8f2ff') +
          rc(-65, 6, 130, 59, '#efe3d2') +
          rc(-36, -8, 72, 12, '#c9825a', 4) +
          rc(-40, -18, 9, 32, '#a86a4a', 3) +
          ce(-18, -4, 10, 5, '#ffffff') +
          kidHead(12, -24) + kidBody(12, -8, '#ff8a6a') +
          pa('M-26 -4 L-18 -22 Q6 -28 16 -24 L32 -4 L32 14 L-26 14 Z', '#6fb1e8')
        );
      },
      /* 洗漱：在洗手台前刷牙 */
      function () {
        return w(
          sky('#e8f2ff') +
          rc(-42, -38, 22, 16, '#cfe4ff', 4) +
          rc(-34, -10, 68, 9, '#dbe9f3', 3) +
          rc(-28, -1, 56, 27, '#eef4f8', 4) +
          ce(-18, -6, 13, 6, '#bfe0f0') + ce(4, -6, 13, 6, '#bfe0f0') +
          ln(-18, -20, -18, -10, '#9ab4c8', 4) + ln(4, -20, 4, -10, '#9ab4c8', 4) +
          kidHead(14, -36) + kidBody(14, -18, '#ff8a6a') +
          ln(2, -42, 12, -30, '#4aa8e8', 4) +
          rc(-2, -48, 11, 5, '#bfe8ff', 2.5) +
          cc(4, -52, 2.5, '#ffffff') + cc(-4, -50, 2, '#ffffff') + cc(9, -53, 2.5, '#ffffff')
        );
      },
      /* 早餐：餐桌上有鸡蛋、牛奶、面包 */
      function () {
        return w(
          sky('#e8f2ff') +
          rc(-65, 26, 130, 39, '#efe3d2') +
          rc(-38, 14, 76, 7, '#c9825a', 3) +
          rc(-29, 21, 5, 24, '#a86a4a') + rc(24, 21, 5, 24, '#a86a4a') +
          rc(-28, -12, 14, 17, '#e8c987', 3) +
          ce(-12, 4, 16, 5, '#f6f6f6') + ce(-12, 4, 12, 3.5, '#ffffff') +
          ce(-13, 1, 6, 5, '#ff9c8a') + cc(-11, 2, 2.5, '#ffb52e') +
          rc(10, -16, 12, 19, '#e8f6ff', 2) +
          rc(11, -15, 10, 3, '#ffffff') +
          ln(6, -10, 6, -2, '#a8d8ff', 3) + rc(15, -18, 3, 7, '#ff8a5c', 1.5)
        );
      },
      /* 出门：背着小书包走向门口 */
      function () {
        return w(
          sky('#e8f2ff') +
          rc(-65, 18, 130, 47, '#c9d6e2') +
          rc(28, -36, 30, 54, '#e8a06a', 3) +
          rc(38, -26, 10, 12, '#f6e2c8', 2) +
          cc(52, -8, 2.5, '#ffd23f') +
          kidHead(-16, -30) + kidBody(-16, -12, '#4fb8e8') +
          rc(-29, -16, 11, 18, '#ff7eb6', 4) +
          ln(-20, -2, -23, 16, '#ffce9e', 4) + ln(-12, -2, -9, 16, '#ffce9e', 4) +
          ln(-14, -13, -6, -27, '#ffce9e', 4)
        );
      }
    ]
  };

  /* ============================================================
     序列 4：蝴蝶成长（4 步，卵 → 毛毛虫 → 蛹 → 蝴蝶）
     ============================================================ */
  var butterfly = {
    id: 'butterfly',
    name: '蝴蝶成长',
    steps: [
      /* 虫卵：叶子上的一团小白卵 */
      function () {
        return w(
          sky('#d8f0d8') +
          pa('M0 18 C-18 -4 -16 -26 -2 -28 C10 -29 20 -18 22 -8 C24 2 12 18 0 18 Z', '#7ec97a') +
          ln(0, 12, 0, -14, '#5fae5f', 2.5) + ln(0, -2, 14, -8, '#5fae5f', 2) +
          cc(-6, -6, 3.4, '#fdf6d8') + cc(-6, -6, 1, '#d9c98a') +
          cc(2, -9, 3.4, '#fdf6d8') + cc(2, -9, 1, '#d9c98a') +
          cc(8, -3, 3.4, '#fdf6d8') + cc(8, -3, 1, '#d9c98a') +
          cc(-1, -1, 3.4, '#fdf6d8') + cc(-1, -1, 1, '#d9c98a')
        );
      },
      /* 毛毛虫：趴在叶子上啃食 */
      function () {
        return w(
          sky('#d8f0d8') +
          pa('M0 18 C-18 -4 -16 -26 -2 -28 C10 -29 20 -18 22 -8 C24 2 12 18 0 18 Z', '#7ec97a') +
          ln(0, 12, 0, -14, '#5fae5f', 2.5) +
          cc(-14, -18, 6, '#5fbf5f') +
          cc(-16, -20, 1.6, '#2b2b2b') + cc(-11, -20, 1.6, '#2b2b2b') +
          ln(-17, -24, -20, -30, '#5fbf5f', 2.5) + ln(-12, -24, -9, -30, '#5fbf5f', 2.5) +
          cc(-5, -12, 5.5, '#6fbf5f') + cc(3, -8, 5, '#5fbf5f') + cc(11, -4, 4.5, '#6fbf5f') +
          ln(-7, -8, -9, -2, '#5fbf5f', 2.5) + ln(-1, -4, -3, 2, '#5fbf5f', 2.5) +
          ln(7, 0, 5, 6, '#5fbf5f', 2.5)
        );
      },
      /* 蛹：挂在树枝上的蛹 */
      function () {
        return w(
          sky('#d8f0d8') +
          ln(-44, -34, 44, -34, '#8a6a4a', 4) +
          ln(-30, -34, -34, -44, '#8a6a4a', 3) + ln(30, -34, 34, -44, '#8a6a4a', 3) +
          ln(14, -36, 14, -16, '#9aa4b0', 2) +
          pa('M14 -26 Q24 -14 24 4 Q24 20 14 24 Q4 20 4 4 Q4 -14 14 -26 Z', '#8abd6e') +
          pa('M4 -22 Q14 -30 24 -22 L14 -13 Z', '#5f9e52') +
          rc(5, -6, 18, 4, 'rgba(255,255,255,0.35)') +
          rc(5, 6, 18, 4, 'rgba(255,255,255,0.3)')
        );
      },
      /* 蝴蝶：展翅的彩色蝴蝶 */
      function () {
        return w(
          sky('#d8f0d8') +
          cc(-2, -10, 2.5, '#8ad4ff') + cc(-14, -18, 1.5, '#8ad4ff') + cc(20, -22, 2, '#8ad4ff') +
          ce(-12, -4, 15, 19, '#ff8ac2', ' transform="rotate(-18 -12 -4)"') +
          ce(-8, 8, 10, 10, '#ffab4a', ' transform="rotate(-12 -8 8)"') +
          ce(12, -4, 15, 19, '#ff8ac2', ' transform="rotate(18 12 -4)"') +
          ce(8, 8, 10, 10, '#ffab4a', ' transform="rotate(12 8 8)"') +
          ce(0, 0, 3.5, 20, '#4a3a2a') +
          cc(0, -13, 3, '#4a3a2a') +
          cc(-12, -8, 2.5, '#ffffff') + cc(12, -8, 2.5, '#ffffff') +
          cc(-8, 7, 2, '#ff7eb6') + cc(8, 7, 2, '#ff7eb6') +
          ln(-6, -16, -10, -27, '#4a3a2a', 2) + ln(6, -16, 10, -27, '#4a3a2a', 2) +
          cc(-10, -28, 1.8, '#ffab4a') + cc(10, -28, 1.8, '#ffab4a')
        );
      }
    ]
  };

  /* ============================================================
     序列 5：做蛋糕（4 步，搅拌 → 烘烤 → 装饰 → 完成）
     ============================================================ */
  var cake = {
    id: 'cake',
    name: '做蛋糕',
    steps: [
      /* 搅拌：打蛋盆里搅拌面糊 */
      function () {
        return w(
          sky('#fff3e0') +
          rc(-65, 30, 130, 35, '#f6e2c8') +
          pa('M-28 -8 A28 22 0 0 0 28 -8 Z', '#6ab8e8') +
          ce(0, -8, 28, 5, '#7ec9f0') +
          ce(0, -8, 22, 5, '#e8b06a') +
          ln(4, -7, 4, -4, '#c98a4a', 3) +
          pl('14,-16 30,-12 20,0 8,-4', 'none stroke="#8aa0b0" stroke-width="3" fill="none"') +
          ln(15, -42, 14, -16, '#8aa0b0', 4) +
          cc(16, -46, 2.5, '#8aa0b0')
        );
      },
      /* 烘烤：烤箱里蛋糕在发红光 */
      function () {
        return w(
          sky('#fff3e0') +
          rc(-32, -26, 64, 52, '#7a8aa0', 8) +
          cc(-16, -31, 3.5, '#3a4a5a') + cc(-2, -31, 3.5, '#3a4a5a') + cc(12, -31, 3.5, '#3a4a5a') +
          rc(-24, -14, 48, 28, '#ff9640', 5) +
          ln(-24, -2, 24, -2, '#3a4a5a', 3) +
          rc(-15, 0, 30, 12, '#c9825a', 3) +
          rc(-15, 0, 30, 7, '#e8c987', 3) +
          elGlow(-8, 16, '#ffd23f') + cc(6, 16, 3, '#ffd23f')
        );
      },
      /* 装饰：往蛋糕上裱奶油 */
      function () {
        return w(
          sky('#fff3e0') +
          rc(-65, 34, 130, 31, '#f6e2c8') +
          rc(-24, 6, 48, 14, '#e8c987', 4) +
          rc(-20, -14, 40, 20, '#f6e2c8', 4) +
          pa('M-18 8 Q-12 3 -6 8 Q0 3 6 8 Q12 3 18 8', 'none stroke="#fff" stroke-width="3" fill="none"') +
          pa('M-15 -2 Q-9 -8 -2 -3 Q4 -8 10 -2 Q15 -6 18 -3', 'none stroke="#fff" stroke-width="3" fill="none"') +
          pa('M-8 -44 L8 -44 L0 -16 Z', '#ff9ec4') +
          rc(-2, -20, 4, 5, '#e0e8f0', 1) +
          ce(15, -36, 6, 9, '#ffce9e') +
          cc(15, -42, 6, '#ff8a6a') + cc(2, -48, 4, '#ff8a6a')
        );
      },
      /* 完成：两层蛋糕 + 草莓 + 樱桃 */
      function () {
        return w(
          sky('#fff3e0') +
          rc(-65, 40, 130, 25, '#f6e2c8') +
          rc(-30, 2, 60, 13, '#d98a4a', 4) +
          rc(-24, -16, 48, 15, '#f6e2c8', 4) +
          rc(-26, -2, 52, 5, '#fff6ea', 2.5) +
          rc(-18, -24, 36, 6, '#fff6ea', 2.5) +
          cc(-10, -14, 4, '#ff6b6b') + cc(-2, -16, 4, '#ff6b6b') + cc(6, -14, 4, '#ff6b6b') +
          cc(12, -36, 7, '#ff5b5b') + cc(10, -39, 2.2, '#ffffff') +
          ln(12, -44, 12, -36, '#8a5a2c', 2.5) +
          cc(-20, 8, 2.5, '#ff8a5c') + cc(0, 10, 2.5, '#ff8a5c') + cc(20, 6, 2.5, '#ff8a5c')
        );
      }
    ]
  };
  /* 烤箱加热丝（发光） */
  function elGlow(x, y) {
    return ce(x, y, 6, 2.5, 'rgba(255,210,63,0.9)');
  }

  /* ============================================================
     序列 6：青蛙成长（4 步，蛙卵 → 小蝌蚪 → 长腿蝌蚪 → 青蛙）
     ============================================================ */
  var frog = {
    id: 'frog',
    name: '青蛙成长',
    steps: [
      /* 蛙卵：水里的一团蛙卵 */
      function () {
        var s = sky('#8ad4ff') +
          rc(-65, 40, 130, 25, 'rgba(60,140,200,0.25)');
        var eggs = [[0, 4], [-12, -2], [-6, 10], [10, 0], [6, -8], [-4, -8], [14, 8]];
        for (var i = 0; i < eggs.length; i++) {
          var e = eggs[i];
          s += cc(e[0], e[1], 6, 'rgba(255,255,255,0.8)') +
            cc(e[0], e[1], 2, '#3a5a6a');
        }
        return w(s + ce(-26, 34, 30, 5, 'rgba(255,255,255,0.12)') + ce(26, 22, 22, 4, 'rgba(255,255,255,0.1)'));
      },
      /* 小蝌蚪：黑黑的小蝌蚪游来游去 */
      function () {
        return w(
          sky('#8ad4ff') +
          rc(-65, 40, 130, 25, 'rgba(60,140,200,0.25)') +
          pa('M-4 4 Q10 -10 22 2 Q10 8 -2 8 Z', '#2b2b2b') +
          cc(-13, 4, 9, '#2b2b2b') +
          cc(-9, 0, 2.4, '#ffffff') + cc(-8, 0, 1.2, '#2b2b2b')
        );
      },
      /* 长腿蝌蚪：长出后腿 */
      function () {
        return w(
          sky('#8ad4ff') +
          rc(-65, 40, 130, 25, 'rgba(60,140,200,0.25)') +
          pa('M-2 0 Q14 -8 22 2 Q14 7 2 6 Z', '#2b2b2b') +
          cc(-13, 0, 9, '#2b2b2b') +
          cc(-9, -4, 2.4, '#ffffff') + cc(-8, -4, 1.2, '#2b2b2b') +
          ln(-7, 5, -12, 13, '#2b2b2b', 3) +
          pl('-12,13 -18,10 -17,16 -11,15', '#2b2b2b') +
          ln(0, 6, 2, 14, '#2b2b2b', 3) +
          pl('2,14 7,11 8,17 3,16', '#2b2b2b')
        );
      },
      /* 青蛙：绿色的青蛙坐好 */
      function () {
        return w(
          sky('#8ad4ff') +
          ce(0, 38, 28, 6, 'rgba(255,255,255,0.2)') +
          ce(0, 14, 16, 10, '#52b257') +
          ce(0, 0, 13, 10, '#52b257') +
          cc(-8, -9, 6, '#52b257') + cc(8, -9, 6, '#52b257') +
          cc(-8, -11, 3.5, '#ffffff') + cc(-8, -11, 1.8, '#2b2b2b') +
          cc(8, -11, 3.5, '#ffffff') + cc(8, -11, 1.8, '#2b2b2b') +
          pa('M-6 3 Q0 8 6 3', 'none stroke="#2b2b2b" stroke-width="2.5" fill="none"') +
          ce(0, 14, 8, 5, '#c9f0c9') +
          ln(-10, 20, -18, 25, '#52b257', 4) +
          pl('-18,25 -24,23 -22,29 -17,27', '#52b257') +
          ln(10, 20, 18, 25, '#52b257', 4) +
          pl('18,25 24,23 22,29 17,27', '#52b257') +
          cc(-6, 16, 2, 'rgba(255,255,255,0.4)') + cc(6, 18, 1.6, 'rgba(255,255,255,0.4)') +
          cc(6, -4, 2, 'rgba(255,255,255,0.35)')
        );
      }
    ]
  };

  /* ============================================================
     序列 7：植物生长（5 步，播种 → 发芽 → 长叶 → 开花 → 结果）
     ============================================================ */
  function soil() {
    return pa('M-55 32 Q0 16 55 32 L55 62 L-55 62 Z', '#8a5a2c') +
      cc(-30, 40, 2, '#6a4520') + cc(-10, 46, 2, '#6a4520') +
      cc(10, 42, 2, '#6a4520') + cc(26, 48, 2, '#6a4520') + cc(2, 36, 2, '#6a4520');
  }
  var plant = {
    id: 'plant',
    name: '植物生长',
    steps: [
      /* 播种：往土里撒种子 */
      function () {
        return w(
          sky('#f0fbf0') +
          soil() +
          ce(-4, -38, 6, 9, '#ffce9e') + ce(4, -36, 5, 8, '#ffce9e') +
          cc(-14, -41, 2.4, '#ffce9e') + cc(-8, -45, 2.6, '#ffce9e') + cc(-2, -46, 2.6, '#ffce9e') +
          cc(8, -16, 2, '#c98a4a') + cc(-4, -10, 2, '#c98a4a') +
          cc(12, -2, 2, '#c98a4a') + cc(-12, 4, 2, '#c98a4a') + cc(6, 10, 2, '#c98a4a')
        );
      },
      /* 发芽：小苗从土里钻出来 */
      function () {
        return w(
          sky('#f0fbf0') +
          soil() +
          ln(0, 24, 0, -8, '#3fae6c', 4) +
          ce(-8, -10, 6, 3.5, '#4fae5c', ' transform="rotate(35 -8 -10)"') +
          ce(8, -12, 6, 3.5, '#4fae5c', ' transform="rotate(-35 8 -12)"')
        );
      },
      /* 长叶：小树苗长高了，叶子多起来 */
      function () {
        return w(
          sky('#f0fbf0') +
          soil() +
          ln(0, 24, 0, -28, '#3fae6c', 4) +
          ce(9, 10, 7, 3.5, '#5fbf5f', ' transform="rotate(-20 9 10)"') +
          ce(-10, 0, 8, 4, '#4fae5c', ' transform="rotate(25 -10 0)"') +
          ce(10, -8, 8, 4, '#4fae5c', ' transform="rotate(-25 10 -8)"') +
          ce(-8, -16, 7, 3.5, '#5fbf5f', ' transform="rotate(20 -8 -16)"')
        );
      },
      /* 开花：顶上开出粉色的花 */
      function () {
        var s = sky('#f0fbf0') + soil() +
          ln(0, 24, 0, -30, '#3fae6c', 4) +
          ce(-10, -10, 7, 3.5, '#4fae5c', ' transform="rotate(24 -10 -10)"') +
          ce(10, -8, 7, 3.5, '#4fae5c', ' transform="rotate(-24 10 -8)"');
        for (var i = 0; i < 6; i++) {
          var a = (i * Math.PI) / 3;
          var px = (Math.cos(a) * 9).toFixed(1);
          var py = (-40 + Math.sin(a) * 9).toFixed(1);
          s += ce(px, py, 6.5, 4.5, '#ff7eb6');
        }
        return w(s + ce(0, -40, 5, 5, '#ffd23f'));
      },
      /* 结果：长出红红的苹果 */
      function () {
        return w(
          sky('#f0fbf0') +
          soil() +
          ln(0, 24, 0, -26, '#3fae6c', 5) +
          ce(-10, -4, 8, 4, '#4fae5c', ' transform="rotate(28 -10 -4)"') +
          ce(10, -12, 8, 4, '#4fae5c', ' transform="rotate(-28 10 -12)"') +
          cc(0, -32, 9.5, '#ff5b5b') + cc(-4, -36, 3, 'rgba(255,255,255,0.5)') +
          rc(-1.5, -42, 3, 8, '#8a5a2c') +
          ce(-3, -43, 4, 2.2, '#4fae5c', ' transform="rotate(-20 -3 -43)"') +
          cc(16, -8, 6.5, '#ff6b6b') + cc(13, -10, 2, 'rgba(255,255,255,0.5)') +
          ln(16, -14, 16, -8, '#8a5a2c', 2)
        );
      }
    ]
  };

  /* ============================================================
     序列 8：洗手流程（5 步，开水 → 打肥皂 → 搓手 → 冲水 → 擦干）
     ============================================================ */
  var wash = {
    id: 'wash',
    name: '洗手流程',
    steps: [
      /* 开水：拧开水龙头，水流哗哗 */
      function () {
        return w(
          sky('#e6f3fd') +
          rc(-4, -65, 9, 35, '#9ab4c8') +
          rc(-15, -38, 12, 8, '#ff8a5c', 3) +
          rc(5, -30, 12, 7, '#9ab4c8', 2) +
          rc(12, -23, 5, 7, '#6a8aa0', 2) +
          rc(-42, 12, 84, 9, '#dbe9f3', 3) +
          ce(2, 14, 20, 6, '#bfe0f0') + ce(2, 13, 15, 4, '#8ad4ff') +
          pa('M10 -16 L16 -16 L15 12 L9 12 Z', '#6fc6ff') +
          cc(10, 18, 2.5, '#6fc6ff') + cc(17, 22, 2, '#6fc6ff') + cc(4, 22, 2, '#6fc6ff')
        );
      },
      /* 打肥皂：手心搓着肥皂，冒出泡沫 */
      function () {
        return w(
          sky('#e6f3fd') +
          ce(-11, 2, 8, 10, '#ffce9e') + ce(11, 2, 8, 10, '#ffce9e') +
          rc(-9, -4, 18, 8, '#ffcf6a', 3) +
          cc(-4, -8, 3.5, '#ffffff') + cc(7, -9, 3, '#ffffff') + cc(-14, -10, 2.8, '#ffffff') +
          cc(15, -8, 2.5, '#ffffff') + cc(0, 6, 2.8, '#ffffff') + cc(-18, 2, 2.5, '#ffffff') + cc(18, 2, 2.5, '#ffffff')
        );
      },
      /* 搓手：两只手用力搓，好多泡泡 */
      function () {
        return w(
          sky('#e6f3fd') +
          ce(-8, 3, 12, 13, '#ffce9e') + ce(8, 1, 12, 13, '#ffce9e') +
          cc(-2, -2, 3.5, '#ffffff') + cc(-14, -4, 4, '#ffffff') +
          cc(10, -10, 4, '#ffffff') + cc(-6, -16, 3.5, '#ffffff') +
          cc(16, 10, 3.5, '#ffffff') + cc(-18, 10, 3, '#ffffff') +
          cc(2, -24, 3, '#ffffff') + cc(-12, 18, 3, '#ffffff') + cc(10, 18, 2.5, '#ffffff') +
          pa('M-24 -8 Q-16 -16 -4 -18', 'none stroke="#9ab4c8" stroke-width="2.5" fill="none"') +
          pa('M20 -12 Q26 -2 26 6', 'none stroke="#9ab4c8" stroke-width="2.5" fill="none"')
        );
      },
      /* 冲水：水流把泡泡冲干净 */
      function () {
        return w(
          sky('#e6f3fd') +
          pa('M-8 -65 L0 -65 L0 4 L-8 4 Z', '#6fc6ff') +
          pa('M16 -65 L22 -65 L21 0 L17 0 Z', '#8ad4ff') +
          ce(-4, 12, 11, 9, '#ffce9e') + ce(12, 12, 11, 9, '#ffce9e') +
          cc(-4, 2, 2.5, '#6fc6ff') + cc(10, -2, 2, '#6fc6ff') + cc(14, 8, 2, '#6fc6ff') + cc(-10, 6, 2, '#8ad4ff')
        );
      },
      /* 擦干：用毛巾把小手擦干 */
      function () {
        return w(
          sky('#e6f3fd') +
          rc(-24, -10, 52, 34, '#ff8ac2', 10) +
          rc(-24, -14, 52, 8, '#ff9ec4', 6) +
          ln(-14, 2, -6, 2, 'rgba(255,255,255,0.7)', 2) +
          ln(-14, 8, -6, 8, 'rgba(255,255,255,0.7)', 2) +
          ce(12, 6, 9, 11, '#ffce9e') +
          cc(4, -2, 8, '#ffce9e') +
          cc(-18, -26, 2.5, '#ffe08a') + cc(20, -28, 2.5, '#ffe08a') +
          star(7, 3, 4, '#ffe08a') + cc(26, 18, 2.5, '#ffe08a') +
          pa('M9 -10 Q14 -16 20 -10', 'none stroke="#ff9ec4" stroke-width="2.5" fill="none"') +
          pa('M-6 18 Q0 22 6 18', 'none stroke="#ff9ec4" stroke-width="2.5" fill="none"')
        );
      }
    ]
  };

  /* ---------- 导出 ---------- */
  window.CAUSALS = [daycycle, bloom, morning, butterfly, cake, frog, plant, wash];
})();