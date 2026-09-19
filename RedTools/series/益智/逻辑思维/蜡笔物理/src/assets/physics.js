/* ============================================================
 * 蜡笔物理 — 物理层（Physics）
 * 职责：引擎设置 / 关卡构建 / 笔画→刚体管线 / 防卡死 / 碰撞事件
 * 关键修复（相对 docs/草稿/蜡笔物理原型）：
 *   1) 重力调校：GRAVITY_SCALE=0.002 → 实测下落约 2000px/s²（原型 ≈1000 且形状相关，体感"不掉落"）
 *   2) 创建重叠抬升 + 新物体前 0.35s 低摩擦 → 防"画在球/地形上被卡死"
 *   3) 求解器迭代提高（pos10/vel8）→ 堆叠/复合刚体稳定
 * ============================================================ */
(function () {
  'use strict';
  var M = window.Matter;

  /* ---------- 常量 ---------- */
  var WORLD_W = 1000, WORLD_H = 600;
  var BALL_R = 16, STAR_R = 14;
  var HALF_W = 6;            // 笔画半宽（12px 粗）
  var MAX_DRAWINGS = 30;     // 单关最多自绘刚体
  var ERASE_R = 26;          // 橡皮擦半径
  var GRAVITY_SCALE = 0.002; // 重力 scale（标称 1000px/s² @0.001，取 0.002 → 约 2000px/s²）
  var SPAWN_LIFT_MAX = 48;   // 创建时重叠抬升上限
  var SPAWN_SOFT_MS = 350;   // 新刚体低摩擦时长

  /* ---------- 运行时状态（Physics 命名空间导出） ---------- */
  var engine = null, world = null;
  var ball = null, star = null;
  var levelIndex = 0;
  var drawnBodies = [];    // 玩家自绘刚体（数组，含渲染 sprite）
  var terrainBodies = [];  // 场景静态/动体（渲染用）
  var won = false;
  var onWinCallback = null;
  var worldStarted = false; // 世界冻结，直到玩家画出第一笔（球等待搭建完成）

  /* ---------- 工具 ---------- */
  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* ---------- 关卡构建 ---------- */
  function addBody(body) { M.Composite.add(world, body); return body; }

  function buildLevel(idx) {
    var L = window.LEVELS[idx];
    levelIndex = idx;
    drawnBodies = [];
    terrainBodies = [];
    won = false;
    worldStarted = false;

    engine = M.Engine.create({ positionIterations: 10, velocityIterations: 8 });
    world = engine.world;
    engine.gravity.y = 1;
    engine.gravity.scale = GRAVITY_SCALE;

    // 地面（渲染见 render：蜡笔地面线 + 填充）
    var ground = M.Bodies.rectangle(WORLD_W / 2, 580, WORLD_W + 400, 40,
      { isStatic: true, friction: 0.6, label: 'ground' });
    ground.renderType = 'ground';
    addBody(ground);
    // 隐形侧墙
    var wl = M.Bodies.rectangle(-20, WORLD_H / 2, 40, WORLD_H * 2, { isStatic: true, label: 'wall' });
    wl.renderType = 'none';
    addBody(wl);
    var wr = M.Bodies.rectangle(WORLD_W + 20, WORLD_H / 2, 40, WORLD_H * 2, { isStatic: true, label: 'wall' });
    wr.renderType = 'none';
    addBody(wr);

    // 静态地形
    for (var i = 0; i < L.statics.length; i++) {
      var s = L.statics[i];
      if (s.type === 'rect') {
        var b = M.Bodies.rectangle(s.x, s.y, s.w, s.h, { isStatic: true, friction: 0.3, label: 'static' });
        b.renderType = 'staticRect'; b.renderW = s.w; b.renderH = s.h;
        addBody(b); terrainBodies.push(b);
      } else if (s.type === 'tri') {
        var verts = [
          { x: s.x, y: s.baseY - s.h },
          { x: s.x - s.w / 2, y: s.baseY },
          { x: s.x + s.w / 2, y: s.baseY }
        ];
        var tc = polyCentroid(verts);
        var tb = M.Bodies.fromVertices(tc.x, tc.y, verts,
          { isStatic: true, friction: 0.3, label: 'static' }, true, true, 6);
        tb.renderType = 'tri'; tb.renderW = s.w; tb.renderH = s.h;
        tb.renderX = s.x; tb.renderBaseY = s.baseY;
        addBody(tb); terrainBodies.push(tb);
      }
    }

    // 场景动体（box / plank）
    for (var d = 0; d < L.dynamics.length; d++) {
      var dd = L.dynamics[d];
      var db = M.Bodies.rectangle(dd.x, dd.y, dd.w, dd.h, {
        density: dd.density || 0.002, friction: 0.7, frictionStatic: 0.5,
        restitution: 0.05, label: dd.label || 'box'
      });
      db.renderType = dd.type === 'plank' ? 'plank' : 'box';
      db.renderW = dd.w; db.renderH = dd.h;
      addBody(db); terrainBodies.push(db);
    }

    // 小球
    ball = M.Bodies.circle(L.ball.x, L.ball.y, BALL_R, {
      label: 'ball',
      density: L.ball.density || 0.003,
      friction: 0.02, frictionAir: 0.002,
      restitution: 0.03, slop: 0.02
    });
    addBody(ball);

    // 星星（传感器，静态）
    star = M.Bodies.circle(L.star.x, L.star.y, STAR_R, { label: 'star', isSensor: true, isStatic: true });
    addBody(star);

    // 球 ↔ 星 碰撞 → 过关
    M.Events.on(engine, 'collisionStart', function (e) {
      if (won) return;
      for (var k = 0; k < e.pairs.length; k++) {
        var a = e.pairs[k].bodyA, b = e.pairs[k].bodyB;
        if ((a === ball && b === star) || (a === star && b === ball)) {
          won = true;
          if (onWinCallback) onWinCallback();
          break;
        }
      }
    });
  }

  /* ---------- 笔画 → 刚体 管线 ---------- */
  function simplifyPath(pts, eps) {
    if (pts.length < 3) return pts.slice();
    var keep = new Array(pts.length).fill(false);
    keep[0] = keep[pts.length - 1] = true;
    var stack = [[0, pts.length - 1]];
    while (stack.length) {
      var seg = stack.pop();
      var a = seg[0], b = seg[1];
      var ax = pts[a].x, ay = pts[a].y, bx = pts[b].x, by = pts[b].y;
      var dx = bx - ax, dy = by - ay;
      var len = Math.sqrt(dx * dx + dy * dy);
      var maxD = 0, idx = -1;
      for (var i = a + 1; i < b; i++) {
        var d;
        if (len === 0) d = Math.sqrt((pts[i].x - ax) * (pts[i].x - ax) + (pts[i].y - ay) * (pts[i].y - ay));
        else {
          var t = ((pts[i].x - ax) * dx + (pts[i].y - ay) * dy) / (len * len);
          var cx = ax + t * dx, cy = ay + t * dy;
          d = Math.sqrt((pts[i].x - cx) * (pts[i].x - cx) + (pts[i].y - cy) * (pts[i].y - cy));
        }
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (maxD > eps && idx > 0) { keep[idx] = true; stack.push([a, idx], [idx, b]); }
    }
    var out = [];
    for (var j = 0; j < pts.length; j++) if (keep[j]) out.push(pts[j]);
    return out;
  }

  function thickenPath(pts, w) {
    var half = w / 2;
    var left = [], right = [];
    for (var i = 0; i < pts.length; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[Math.min(pts.length - 1, i + 1)];
      var ux = p1.x - p0.x, uy = p1.y - p0.y;
      var vx = p2.x - p1.x, vy = p2.y - p1.y;
      var lu = Math.sqrt(ux * ux + uy * uy) || 1, lv = Math.sqrt(vx * vx + vy * vy) || 1;
      var ax = ux / lu, ay = uy / lu, bx = vx / lv, by = vy / lv;
      var n1x = -ay, n1y = ax;
      var n2x = -by, n2y = bx;
      var mx = n1x + n2x, my = n1y + n2y;
      var lm = Math.sqrt(mx * mx + my * my) || 1;
      mx /= lm; my /= lm;
      var dot = ax * bx + ay * by;
      var cosHalf = Math.sqrt(Math.max(0.02, (1 + dot) / 2));
      var miterLen = half / cosHalf;
      if (miterLen <= half * 2.2) {
        left.push({ x: p1.x + mx * half, y: p1.y + my * half });
        right.push({ x: p1.x - mx * half, y: p1.y - my * half });
      } else {
        left.push({ x: p1.x + n1x * half, y: p1.y + n1y * half });
        left.push({ x: p1.x + n2x * half, y: p1.y + n2y * half });
        right.push({ x: p1.x - n1x * half, y: p1.y - n1y * half });
        right.push({ x: p1.x - n2x * half, y: p1.y - n2y * half });
      }
    }
    return left.concat(right.reverse());
  }

  function polyCentroid(poly) {
    var a = 0, cx = 0, cy = 0;
    for (var i = 0; i < poly.length; i++) {
      var p = poly[i], q = poly[(i + 1) % poly.length];
      var cross = p.x * q.y - q.x * p.y;
      a += cross;
      cx += (p.x + q.x) * cross;
      cy += (p.y + q.y) * cross;
    }
    a *= 0.5;
    if (Math.abs(a) < 1e-6) {
      var sx = 0, sy = 0;
      for (var j = 0; j < poly.length; j++) { sx += poly[j].x; sy += poly[j].y; }
      return { x: sx / poly.length, y: sy / poly.length };
    }
    var f = 1 / (6 * a);
    return { x: cx * f, y: cy * f };
  }

  /** 检测 body 是否与世界中其他刚体 AABB 重叠（排除传感器与自身） */
  function overlapsOthers(body) {
    var bb = body.bounds;
    var all = M.Composite.allBodies(world);
    for (var i = 0; i < all.length; i++) {
      var other = all[i];
      if (other === body) continue;
      if (other.isSensor) continue;
      var ob = other.bounds;
      if (bb.min.x < ob.max.x && bb.max.x > ob.min.x &&
          bb.min.y < ob.max.y && bb.max.y > ob.min.y) {
        return true;
      }
    }
    return false;
  }

  /**
   * 创建自绘刚体（复合刚体）并加入世界。
   * 返回 body；失败返回 null。
   * 防卡死：
   *   - 重叠时向上抬升（最多 SPAWN_LIFT_MAX）
   *   - 前 SPAWN_SOFT_MS 摩擦临时降低，便于脱离接触
   */
  function createDrawnBody(poly, colorIdx) {
    var n = poly.length;
    if (n < 4) return null;
    var area = 0;
    for (var i = 0; i < n; i++) {
      var p = poly[i], q = poly[(i + 1) % n];
      area += p.x * q.y - q.x * p.y;
    }
    area = Math.abs(area) / 2;
    if (area < 150) return null;

    var c = polyCentroid(poly);
    var body = null;
    try {
      body = M.Bodies.fromVertices(c.x, c.y, poly, {
        label: 'drawn',
        density: 0.008,
        friction: 0.3, frictionStatic: 0.3,
        restitution: 0.05,
        slop: 0.03
      }, true, true, 12);
    } catch (err) { return null; }
    if (!body) return null;

    // 重叠处理：自绘刚体创建即【静态】（画完即固化）——
    // 消除原型「梁体在支点滑动/被球撞飞」的不稳定；球与静态体正常碰撞/滚动。
    // 静态物体不参与动力学，玩家撤销/擦除仍可移除。
    M.Body.setStatic(body, true);
    body._frictionFinal = 0.5;
    // 世界冻结直到第一笔：玩家画完第一笔，物理世界启动，球开始滚动
    if (!worldStarted) worldStarted = true;

    body.renderColor = window.CRAYONS[colorIdx].c;
    body.renderPoly = poly.slice();
    body.colorIdx = colorIdx;
    addBody(body);
    drawnBodies.push(body);
    if (drawnBodies.length > MAX_DRAWINGS) {
      var old = drawnBodies.shift();
      if (old && old.parent === old) M.Composite.remove(world, old);
    }
    return body;
  }

  /** 由点集生成笔画刚体（返回 body 或 null） */
  function strokeToBody(points, colorIdx) {
    var simp = simplifyPath(points, 5);
    if (simp.length < 2) return null;
    var poly = thickenPath(simp, HALF_W * 2);
    return createDrawnBody(poly, colorIdx);
  }

  /* ---------- 擦除 / 撤销 ---------- */
  function eraseAt(x, y, r) {
    var r2 = r * r;
    for (var i = drawnBodies.length - 1; i >= 0; i--) {
      var b = drawnBodies[i];
      if (!b || b.parent !== b) continue;
      var hit = false;
      for (var k = 0; k < b.vertices.length; k++) {
        var v = b.vertices[k];
        if ((v.x - x) * (v.x - x) + (v.y - y) * (v.y - y) <= r2) { hit = true; break; }
      }
      if (hit) { M.Composite.remove(world, b); drawnBodies.splice(i, 1); }
    }
  }

  function undoLast() {
    if (drawnBodies.length) {
      var b = drawnBodies.pop();
      if (b && b.parent === b) M.Composite.remove(world, b);
    }
  }

  /* ---------- 每帧更新 ---------- */
  function update(now) {
    // 清理掉出世界的自绘刚体（静态体也在 world 里，防止被画到界外）
    for (var i = drawnBodies.length - 1; i >= 0; i--) {
      var b = drawnBodies[i];
      if (b && b.parent === b) {
        if (b.position.y > WORLD_H + 320 || b.position.x < -260 || b.position.x > WORLD_W + 260) {
          M.Composite.remove(world, b);
          drawnBodies.splice(i, 1);
        }
      }
    }
    // 小球掉出世界 → 重置（由 main 层回调）
    if (!won && ball && ball.position.y > WORLD_H + 320) {
      return 'ball_fell';
    }
    return null;
  }

  /* ---------- 导出 ---------- */
  window.Physics = {
    WORLD_W: WORLD_W, WORLD_H: WORLD_H,
    BALL_R: BALL_R, STAR_R: STAR_R,
    HALF_W: HALF_W, ERASE_R: ERASE_R,
    get engine() { return engine; },
    get world() { return world; },
    get ball() { return ball; },
    get star() { return star; },
    get levelIndex() { return levelIndex; },
    get drawnBodies() { return drawnBodies; },
    get terrainBodies() { return terrainBodies; },
    get won() { return won; },
    get worldStarted() { return worldStarted; },
    setOnWin: function (fn) { onWinCallback = fn; },
    buildLevel: buildLevel,
    strokeToBody: strokeToBody,
    eraseAt: eraseAt,
    undoLast: undoLast,
    update: update,
    rnd: rnd,
    polyCentroid: polyCentroid
  };
})();



