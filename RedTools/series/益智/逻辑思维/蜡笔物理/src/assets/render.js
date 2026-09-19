/* ============================================================
 * 蜡笔物理 — 渲染层（Render）
 * 关键设计（修复原型「画面一直抖动」）：
 *   - 静态层（纸张/地面/地形）离屏烘焙一次，帧循环整块 drawImage
 *   - 每个自绘刚体创建时烘焙成 sprite（蜡笔抖动纹理一次性生成）
 *   - 球/星预烘焙 sprite；星仅做确定性 sin 呼吸动画（非随机抖动）
 *   - 帧循环内零 Math.random()
 * ============================================================ */
(function () {
  'use strict';
  var P = window.Physics;
  var W = P.WORLD_W, H = P.WORLD_H;

  var ctx = null;
  var staticLayer = null;
  var ballSprite = null;
  var starSprite = null;
  var particles = [];
  var PAPER = '#f7f2e5';

  /* ---------- 工具 ---------- */
  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) + amt, g = ((n >> 8) & 0xff) + amt, b = (n & 0xff) + amt;
    r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /* ---------- 纸张纹理（一次性） ---------- */
  function makePaper() {
    var off = document.createElement('canvas');
    off.width = 256; off.height = 256;
    var o = off.getContext('2d');
    o.fillStyle = PAPER;
    o.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 900; i++) {
      o.fillStyle = 'rgba(120,110,90,' + P.rnd(0.01, 0.05).toFixed(3) + ')';
      o.fillRect(Math.random() * 256, Math.random() * 256, 1.4, 1.4);
    }
    o.strokeStyle = 'rgba(150,140,120,0.08)';
    o.lineWidth = 1;
    for (var y = 0; y < 256; y += 7) {
      o.beginPath(); o.moveTo(0, y); o.lineTo(256, y + P.rnd(-1.5, 1.5)); o.stroke();
    }
    var c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    var cc = c.getContext('2d');
    cc.fillStyle = PAPER;
    cc.fillRect(0, 0, 256, 256);
    cc.fillStyle = 'rgba(0,0,0,0)';
    cc.drawImage(off, 0, 0);
    return cc.createPattern(off, 'repeat');
  }

  /* ---------- 蜡笔多边形（一次性绘制用） ---------- */
  function crayonPath(g, poly, jitter) {
    g.beginPath();
    for (var i = 0; i < poly.length; i++) {
      var p = poly[i];
      var jx = jitter ? P.rnd(-jitter, jitter) : 0;
      var jy = jitter ? P.rnd(-jitter, jitter) : 0;
      if (i === 0) g.moveTo(p.x + jx, p.y + jy);
      else g.lineTo(p.x + jx, p.y + jy);
    }
    g.closePath();
  }

  function drawCrayonPoly(g, poly, color, fillAlpha) {
    fillAlpha = fillAlpha === undefined ? 0.72 : fillAlpha;
    for (var pass = 0; pass < 3; pass++) {
      g.globalAlpha = fillAlpha * (pass === 0 ? 0.55 : 0.28);
      g.fillStyle = color;
      crayonPath(g, poly, 1.4);
      g.fill();
    }
    g.globalAlpha = 0.9;
    g.strokeStyle = shade(color, -38);
    g.lineWidth = 2.4;
    for (var k = 0; k < 2; k++) {
      crayonPath(g, poly, 1.6);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  /* ---------- 地形绘制（烘焙到静态层） ---------- */
  function drawGroundTo(g) {
    g.strokeStyle = '#3a3a38';
    g.globalAlpha = 0.55;
    for (var k = 0; k < 5; k++) {
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(0, 560 + k * 1.5 + P.rnd(-0.8, 0.8));
      for (var x = 40; x <= W; x += 40) g.lineTo(x, 560 + P.rnd(-1.2, 1.2) + k * 1.5);
      g.stroke();
    }
    g.globalAlpha = 0.35;
    g.fillStyle = '#b4ac92';
    g.fillRect(0, 560, W, 40);
    g.globalAlpha = 1;
  }

  function terrainPoly(b) {
    if (b.renderType === 'staticRect' || b.renderType === 'box' || b.renderType === 'plank') {
      var x = b.position.x - b.renderW / 2, y = b.position.y - b.renderH / 2;
      return [
        { x: x, y: y }, { x: x + b.renderW, y: y },
        { x: x + b.renderW, y: y + b.renderH }, { x: x, y: y + b.renderH }
      ];
    }
    if (b.renderType === 'tri') {
      return [
        { x: b.renderX, y: b.renderBaseY - b.renderH },
        { x: b.renderX - b.renderW / 2, y: b.renderBaseY },
        { x: b.renderX + b.renderW / 2, y: b.renderBaseY }
      ];
    }
    return null;
  }

  function terrainColor(b) {
    if (b.renderType === 'plank') return '#d8b98a';
    if (b.renderType === 'box') return '#e8e0cc';
    return '#cfc6b2';
  }

  /* ---------- 静态层烘焙（每关一次） ---------- */
  function bakeStaticLayer() {
    var off = document.createElement('canvas');
    off.width = W; off.height = H;
    var g = off.getContext('2d');
    // 纸张
    g.fillStyle = PAPER;
    g.fillRect(0, 0, W, H);
    var pat = makePaper();
    if (pat) {
      g.globalAlpha = 0.9;
      g.fillStyle = pat;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
    // 暗角
    var vg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(90,80,60,0.12)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
    // 地形
    var tb = P.terrainBodies;
    for (var i = 0; i < tb.length; i++) {
      var b = tb[i];
      if (b.renderType === 'none' || b.renderType === 'ground') continue;
      var poly = terrainPoly(b);
      if (poly) drawCrayonPoly(g, poly, terrainColor(b), b.renderType === 'plank' ? 0.6 : 0.62);
    }
    drawGroundTo(g);
    staticLayer = off;
  }

  /* ---------- 球 / 星 sprite ---------- */
  function bakeBall() {
    var pad = 6, r = P.BALL_R;
    var off = document.createElement('canvas');
    off.width = (r + pad) * 2; off.height = (r + pad) * 2;
    var g = off.getContext('2d');
    var cx = r + pad, cy = r + pad;
    // 影子
    g.fillStyle = 'rgba(90,80,60,0.18)';
    g.beginPath(); g.arc(cx + 1.5, cy + 2.5, r, 0, Math.PI * 2); g.fill();
    // 球体
    g.fillStyle = '#d64f3f';
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    // 描边（2 遍抖动，一次性）
    g.strokeStyle = '#8e2f24';
    g.lineWidth = 2.6;
    for (var k = 0; k < 2; k++) {
      g.beginPath(); g.arc(cx + P.rnd(-0.6, 0.6), cy + P.rnd(-0.6, 0.6), r - 1, 0, Math.PI * 2); g.stroke();
    }
    // 高光
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.ellipse(cx - 5, cy - 6, 5, 3.2, -0.6, 0, Math.PI * 2); g.fill();
    ballSprite = { canvas: off, half: r + pad };
  }

  function starPoints(cx, cy, rOut, rIn) {
    var pts = [];
    for (var i = 0; i < 10; i++) {
      var r = i % 2 === 0 ? rOut : rIn;
      var ang = -Math.PI / 2 + i * Math.PI / 5;
      pts.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r });
    }
    return pts;
  }

  function bakeStar() {
    var r = P.STAR_R, pad = 10;
    var off = document.createElement('canvas');
    off.width = (r + 7 + pad) * 2; off.height = (r + 7 + pad) * 2;
    var g = off.getContext('2d');
    var cx = r + 7 + pad, cy = r + 7 + pad;
    // 光晕
    g.globalAlpha = 0.9;
    g.fillStyle = '#ffe27a';
    g.beginPath(); g.arc(cx, cy, r + 7, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    // 星体
    var pts = starPoints(cx, cy, r + 2, r * 0.45);
    g.fillStyle = '#f2c41b';
    g.beginPath();
    for (var i = 0; i < pts.length; i++) {
      if (i === 0) g.moveTo(pts[i].x, pts[i].y); else g.lineTo(pts[i].x, pts[i].y);
    }
    g.closePath(); g.fill();
    // 描边（2 遍抖动，一次性）
    g.strokeStyle = '#b9890f';
    g.lineWidth = 2.2;
    for (var k = 0; k < 2; k++) {
      var jx = P.rnd(-0.7, 0.7), jy = P.rnd(-0.7, 0.7);
      g.beginPath();
      for (var m = 0; m < pts.length; m++) {
        if (m === 0) g.moveTo(pts[m].x + jx, pts[m].y + jy);
        else g.lineTo(pts[m].x + jx, pts[m].y + jy);
      }
      g.closePath(); g.stroke();
    }
    starSprite = { canvas: off, half: r + 7 + pad };
  }

  /* ---------- 自绘刚体 sprite 烘焙 ---------- */
  function bakeDrawnSprite(body) {
    var poly = body.renderPoly;
    var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (var i = 0; i < poly.length; i++) {
      var p = poly[i];
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    var pad = 8;
    var w = Math.ceil(maxX - minX) + pad * 2;
    var h = Math.ceil(maxY - minY) + pad * 2;
    var off = document.createElement('canvas');
    off.width = w; off.height = h;
    var g = off.getContext('2d');
    g.save();
    g.translate(pad - minX, pad - minY);
    drawCrayonPoly(g, poly, body.renderColor, 0.72);
    g.restore();
    // sprite 中心（包围盒中心）相对 body 位置（质心）的偏移（body 局部坐标）
    var bcx = (minX + maxX) / 2, bcy = (minY + maxY) / 2;
    body.sprite = {
      canvas: off, w: w, h: h,
      dx: bcx - body.position.x,
      dy: bcy - body.position.y
    };
  }

  /* ---------- 预览笔迹（无随机，避免抖动） ---------- */
  function drawPreview(points, color) {
    if (!points || points.length < 2) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = color;
    ctx.lineWidth = P.HALF_W * 2;
    ctx.beginPath();
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* ---------- 粒子 ---------- */
  function burst(x, y) {
    var cs = window.CRAYONS;
    for (var i = 0; i < 36; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = P.rnd(1.5, 7);
      particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2.5,
        life: 1,
        c: cs[Math.floor(Math.random() * cs.length)].c
      });
    }
  }

  function updateParticles() {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.22; p.life -= 0.02;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  /* ---------- 总帧 ---------- */
  function render(time, drawing, color) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#efe9da';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // 静态层（纸张+地形+地面，烘焙好整体贴图）
    if (staticLayer) ctx.drawImage(staticLayer, 0, 0);

    // 自绘刚体（sprite）
    var dbs = P.drawnBodies;
    for (var i = 0; i < dbs.length; i++) {
      var b = dbs[i];
      if (!b || b.parent !== b || !b.sprite) continue;
      var sp = b.sprite;
      ctx.save();
      ctx.translate(b.position.x, b.position.y);
      ctx.rotate(b.angle);
      ctx.drawImage(sp.canvas, sp.dx - sp.w / 2, sp.dy - sp.h / 2);
      ctx.restore();
    }

    // 预览笔迹
    if (drawing && drawing.points && drawing.points.length > 1) {
      drawPreview(drawing.points, color);
    }

    // 球
    if (ballSprite && P.ball) {
      var bp = P.ball.position;
      ctx.save();
      ctx.translate(bp.x, bp.y);
      ctx.rotate(P.ball.angle);
      ctx.drawImage(ballSprite.canvas, -ballSprite.half, -ballSprite.half);
      ctx.restore();
    }

    // 星（确定性 sin 呼吸 + 微摆，非随机）
    if (starSprite && P.star) {
      var t = time / 1000;
      var sp2 = P.star.position;
      var sc = 1 + 0.04 * Math.sin(t * 3);
      ctx.save();
      ctx.translate(sp2.x, sp2.y);
      ctx.rotate(Math.sin(t * 1.2) * 0.18);
      ctx.scale(sc, sc);
      ctx.drawImage(starSprite.canvas, -starSprite.half, -starSprite.half);
      ctx.restore();
    }

    // 粒子
    for (var k = 0; k < particles.length; k++) {
      var p = particles[k];
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
    ctx.globalAlpha = 1;
  }

  window.Render = {
    init: function (cv) {
      ctx = cv.getContext('2d');
      bakeBall();
      bakeStar();
    },
    bakeStaticLayer: bakeStaticLayer,
    bakeDrawnSprite: bakeDrawnSprite,
    burst: burst,
    updateParticles: updateParticles,
    render: render
  };
})();
