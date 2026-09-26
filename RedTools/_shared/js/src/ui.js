/* ============================================================
   LX_SHARED.ui — 跨工具 UI 流程层（V0.8 抽取）
   ------------------------------------------------------------
   依据：docs/教育工具/V0.8-跨工具UI流程层沉淀-开发方案.md（Oracle v0.2 审核）
   定位：guard/progress 只做状态判定，ui 只做 UI 呈现；状态与 UI 通过 opts/callback 解耦
   能力清单（11 API；A8 migrate 已移入 storage.js，Oracle B1）：
   - checkinCalendar({dates,today,months?})    打卡月历（A1）
   - lineChart({records,key?,min?,max?})       进步曲线 SVG（A2）
   - saveImage({canvas,filename?})             保存图片双路径（A3）
   - settleChoices({title,sub,stars,onReplay,onShare,onSelf,selfEnabled,cls?})  结算三选（A4，复用 uikit.overlay）
   - guardBar({container,prefs,minuteOptions,gamesOptions,onPrefs})        练习限时设置条（A5）
   - selfBadge(ctx,{streak})                   自律徽标 canvas 绘制（A6，供 drawFn 内调用）
   - selfStreakCard({streak,selfDaily,longest?,store?})  自律成就卡片（A7）
   - shareText({streak,name,metric,value,unit,tags,template?})  分享文案纯函数（A9）
   - getShareCapability()                      能力探测（A10）
   - lockHint({onContinue?,cls?})              自律锁拦截温和提示（A11，替代 window.alert）
   - pauseFlow({due,onPause,onResume,onExtend,onSelf,cls?})  到点暂停浮层（A12）
   DOM 类名对齐数学口算既有约定（迁移 CSS 零改动）：
   - 设置条：limit-btn / limit-btn active（container 类名 limit-row 由调用方定）
   - 月历：calendar / calendar-grid / cal-day / cal-day done / cal-day today / streak-info
   - 曲线：line-chart（SVG class）
   - 浮层：复用 uikit lx-overlay-* 约定（lx-overlay/lx-overlay-card/lx-overlay-title/
     lx-overlay-sub/lx-overlay-summary/lx-stars/lx-overlay-btns，不新增）；
     cls 提供时（存量工具现有 CSS 类名如 limit-overlay/limit-box/...）走 overlayLocal
     可配类名（{overlay,card,title,sub,btns,mainBtn,ghostBtn}），保证 CSS 零改动
   - 自律卡片：lx-self-card / lx-self-card-title / lx-self-stats / lx-self-stat / lx-self-tip
   - shareText template?：自定义模板（{name}/{metric}/{value}/{unit}/{streak} 占位），
     缺省用通用模板；默认值全库同构
   内部工具（makeEl/svgEl/roundRectPath/calcStreak/overlayLocal 兜底）本模块自持，不依赖 uikit 内部
   - ES2017 经典脚本；Chrome 61 兼容（无 ?./??/对象展开/replaceAll/箭头函数）
   ============================================================ */
(function () {
  'use strict';

  var U = {};

  /* ---------- 内部基础工具（本模块自持） ---------- */
  function makeEl(tag, className, text) {
    var el = document.createElement(tag);
    if (className) { el.className = className; }
    if (text !== undefined && text !== null) { el.textContent = text; }
    return el;
  }
  var SVG_NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) { el.setAttribute(k, attrs[k]); }
    }
    return el;
  }
  /* Chrome 61 圆角路径（无 ctx.roundRect） */
  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function clearNode(el) {
    while (el.firstChild) { el.removeChild(el.firstChild); }
  }
  function starsText(n) {
    var s = '';
    var i;
    for (i = 0; i < 3; i++) { s += (i < n) ? '★' : '☆'; }
    return s;
  }
  function btnWithAct(text, cls, act) {
    var b = makeEl('button', cls || 'btn-ghost', text);
    if (act) { b.addEventListener('click', act); }
    return b;
  }
  function toast(msg) {
    var t;
    if (window.LX_SHARED && window.LX_SHARED.uikit && window.LX_SHARED.uikit.toast) {
      window.LX_SHARED.uikit.toast(msg);
    } else {
      t = makeEl('div', 'lx-toast', msg);
      document.body.appendChild(t);
      setTimeout(function () {
        if (t.parentNode) { t.parentNode.removeChild(t); }
      }, 1800);
    }
  }
  /* 连续天数（calcStreak 全库同构；ui 自持一份避免对 progress 的运行时依赖） */
  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtDate(d) {
    return '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
  }
  function calcStreak(dates) {
    if (!dates || !dates.length) { return 0; }
    var set = {};
    var i;
    for (i = 0; i < dates.length; i++) { set[dates[i]] = true; }
    var cur = new Date();
    cur.setHours(0, 0, 0, 0);
    if (!set[fmtDate(cur)]) {
      cur.setDate(cur.getDate() - 1);
    }
    var streak = 0;
    while (set[fmtDate(cur)]) {
      streak++;
      cur.setDate(cur.getDate() - 1);
    }
    return streak;
  }
  /* 兜底浮层（uikit 缺失时用；类名与 uikit lx-overlay-* 逐字节一致，供 CSS 复用） */
  function overlayLocal(opts) {
    opts = opts || {};
    var cls = opts.cls || {};
    var C = {
      overlay: cls.overlay || 'lx-overlay',
      card: cls.card || 'lx-overlay-card',
      title: cls.title || 'lx-overlay-title',
      sub: cls.sub || 'lx-overlay-sub',
      btns: cls.btns || 'lx-overlay-btns',
      mainBtn: cls.mainBtn || 'btn-main',
      ghostBtn: cls.ghostBtn || 'btn-ghost'
    };
    var ov = makeEl('div', C.overlay);
    var card = makeEl('div', C.card);
    var sum = null;
    var box = null;
    var i;
    var bi;
    var b;
    if (opts.title) { card.appendChild(makeEl('div', C.title, opts.title)); }
    if (opts.sub) { card.appendChild(makeEl('div', C.sub, opts.sub)); }
    if (opts.stars) {
      sum = makeEl('div', 'lx-overlay-summary');
      sum.appendChild(makeEl('div', 'lx-stars', starsText(opts.stars)));
      card.appendChild(sum);
    }
    if (opts.btns) {
      box = makeEl('div', C.btns);
      for (bi = 0; bi < opts.btns.length; bi++) {
        b = opts.btns[bi];
        box.appendChild(btnWithAct(b.text, b.cls || C.ghostBtn, b.act));
      }
      card.appendChild(box);
    }
    ov.appendChild(card);
    document.body.appendChild(ov);
    return {
      el: ov,
      close: function () {
        if (ov.parentNode) { ov.parentNode.removeChild(ov); }
      }
    };
  }

  /* ---------- A1 打卡月历 ----------
     checkinCalendar({dates, today, months?}) → { el }
     - dates：YYYYMMDD 数组（打卡日高亮）
     - today：YYYYMMDD 今日（描边 .cal-day.today；缺省取系统今日）
     - months?：YYYYMM 数组（缺省当月）；多个月渲染多个 grid + page-title
     输出类名：calendar / page-title / calendar-grid / cal-day / cal-day done / cal-day today / streak-info */
  function checkinCalendar(opts) {
    opts = opts || {};
    var dates = opts.dates || [];
    var today = opts.today || fmtDate(new Date());
    var set = {};
    var i;
    for (i = 0; i < dates.length; i++) { set[dates[i]] = true; }
    var card = makeEl('div', 'calendar');
    var now = new Date();
    var months = opts.months || ['' + now.getFullYear() + p2(now.getMonth() + 1)];
    months.forEach(function (ym) {
      var y = +ym.slice(0, 4), m = +ym.slice(4, 6);
      card.appendChild(makeEl('div', 'page-title',
        (ym === '' + now.getFullYear() + p2(now.getMonth() + 1)) ? '本月打卡' : (y + '年' + m + '月打卡')));
      var grid = makeEl('div', 'calendar-grid');
      var days = new Date(y, m, 0).getDate();
      var dayList = [];
      var d0;
      for (d0 = 1; d0 <= days; d0++) { dayList.push(d0); }
      dayList.forEach(function (d) {
        var ds = '' + y + p2(m) + p2(d);
        var el = makeEl('div', 'cal-day', '' + d);
        if (set[ds]) { el.className = 'cal-day done'; }
        if (ds === today) { el.className += ' today'; }
        grid.appendChild(el);
      });
      card.appendChild(grid);
    });
    var streak = calcStreak(dates);
    var info = makeEl('div', 'streak-info');
    info.appendChild(makeEl('span', '', '连续打卡 '));
    info.appendChild(makeEl('b', '', '' + streak));
    info.appendChild(makeEl('span', '', ' 天' + (streak >= 7 ? ' 🎉' : '')));
    card.appendChild(info);
    return { el: card };
  }

  /* ---------- A2 进步曲线 SVG ----------
     lineChart({records, key?, min?, max?}) → { el }
     - records：对象数组（数值字段缺省 'rate'）
     - key?：数值字段名（缺省 'rate'）
     - min?/max?：Y 轴范围（缺省 0/100 正确率口径，轴/点标签带 %；给定范围则纯数值标签）
     输出类名：line-chart（SVG class；createElementNS 构建，Chrome 61 兼容） */
  function lineChart(opts) {
    opts = opts || {};
    var records = opts.records || [];
    var key = opts.key || 'rate';
    var min = (opts.min !== undefined && opts.min !== null) ? opts.min : 0;
    var max = (opts.max !== undefined && opts.max !== null) ? opts.max : 100;
    var rateScope = (min === 0 && max === 100);
    var W = 320, H = 180, PL = 36, PR = 14, PT = 18, PB = 26;
    var PW = W - PL - PR, PH = H - PT - PB;
    var n = records.length;
    function px(i) { return n === 1 ? PL + PW / 2 : PL + PW * i / (n - 1); }
    function py(v) { return PT + PH * (1 - (v - min) / (max - min)); }

    var svg = svgEl('svg', {
      class: 'line-chart',
      viewBox: '0 0 ' + W + ' ' + H,
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img',
      'aria-label': '进步曲线'
    });
    if (!n) { return { el: svg }; }

    /* 网格线 + Y 轴标签（默认 0/25/50/75/100%；给定范围按 5 等分） */
    var ticks = [0, 25, 50, 75, 100];
    var t0;
    if (!rateScope) {
      ticks = [];
      for (t0 = 0; t0 <= 4; t0++) { ticks.push(min + (max - min) * t0 / 4); }
    }
    ticks.forEach(function (v) {
      var gy = py(v);
      svg.appendChild(svgEl('line', {
        x1: PL, y1: gy, x2: W - PR, y2: gy,
        stroke: '#e5e6eb', 'stroke-width': 1
      }));
      var yl = svgEl('text', {
        x: PL - 6, y: gy + 3, 'text-anchor': 'end',
        'font-size': 10, fill: '#8a919f'
      });
      yl.textContent = Math.round(v) + (rateScope ? '%' : '');
      svg.appendChild(yl);
    });

    /* X 轴标签：次数 1..n */
    var xi;
    var xl;
    for (xi = 0; xi < n; xi++) {
      xl = svgEl('text', {
        x: px(xi), y: H - PB + 14, 'text-anchor': 'middle',
        'font-size': 10, fill: '#8a919f'
      });
      xl.textContent = '' + (xi + 1);
      svg.appendChild(xl);
    }

    /* 折线 */
    var pts = [];
    var p;
    var vp;
    for (p = 0; p < n; p++) {
      vp = (records[p][key] !== undefined && records[p][key] !== null) ? records[p][key] : 0;
      pts.push(px(p) + ',' + py(vp));
    }
    svg.appendChild(svgEl('polyline', {
      points: pts.join(' '),
      fill: 'none', stroke: '#165dff', 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round'
    }));

    /* 数据点圆点 + 上方数值标注 */
    var q;
    var vq;
    var cx;
    var cy;
    var lb;
    for (q = 0; q < n; q++) {
      vq = (records[q][key] !== undefined && records[q][key] !== null) ? records[q][key] : 0;
      cx = px(q); cy = py(vq);
      svg.appendChild(svgEl('circle', { cx: cx, cy: cy, r: 3.5, fill: '#165dff' }));
      lb = svgEl('text', {
        x: cx, y: cy - 7, 'text-anchor': 'middle',
        'font-size': 10, fill: '#1f2329', 'font-weight': 600
      });
      lb.textContent = '' + vq + (rateScope ? '%' : '');
      svg.appendChild(lb);
    }

    return { el: svg };
  }

  /* ---------- A3 保存图片封装（双路径，Chrome 61 WebView 兜底） ----------
     saveImage({canvas, filename?}) → 是否已触发下载（boolean）
     - 桌面：<a download> 触发下载；失败 catch → 提示「右键图片另存为」
     - 移动端（UA 判定）：不触发下载，提示「长按图片保存」
     输出类名：无（仅 uikit.toast 提示，lx-toast） */
  function saveImage(opts) {
    opts = opts || {};
    var canvas = opts.canvas;
    if (!canvas) { return false; }
    var filename = opts.filename || ('checkin-' + fmtDate(new Date()) + '.png');
    var isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent || '');
    if (isMobile) {
      toast('长按图片保存');
      return false;
    }
    var a;
    try {
      a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return true;
    } catch (err) {
      toast('右键图片另存为');
      return false;
    }
  }

  /* ---------- A4 结算三选模板（内部调用 uikit.overlay 组装，复用非重建） ----------
     settleChoices({title, sub, stars, onReplay, onShare, onSelf, selfEnabled}) → { el, close }
     btns = [再来一局(btn-main), 分享打卡(btn-ghost), (selfEnabled!==false ? 我很自律 : null)].filter(Boolean)
     输出类名：lx-overlay / lx-overlay-card / lx-overlay-title / lx-overlay-sub /
               lx-overlay-summary / lx-stars / lx-overlay-btns（uikit 约定，不新增） */
  function settleChoices(opts) {
    opts = opts || {};
    var mainCls = opts.cls ? (opts.cls.mainBtn || 'btn') : 'btn-main';
    var ghostCls = opts.cls ? (opts.cls.ghostBtn || 'btn') : 'btn-ghost';
    var replayLabel = opts.replayLabel || '再来一局';
    var shareLabel = opts.shareLabel || '分享打卡';
    var selfLabel = opts.selfLabel || '我很自律';
    var btns = [
      { text: replayLabel, cls: mainCls, act: opts.onReplay },
      { text: shareLabel, cls: ghostCls, act: opts.onShare }
    ];
    if (opts.selfEnabled !== false) {
      btns.push({ text: selfLabel, cls: ghostCls, act: opts.onSelf });
    }
    /* Oracle I1：默认复用 uikit.overlay（lx-overlay 约定）；cls 提供时（存量工具现有 CSS 类名
       如 limit-overlay/limit-box/limit-title/limit-desc/limit-btns）走 overlayLocal 可配类名 */
    if (!opts.cls && window.LX_SHARED && window.LX_SHARED.uikit && window.LX_SHARED.uikit.overlay) {
      return window.LX_SHARED.uikit.overlay({
        title: opts.title, sub: opts.sub, stars: opts.stars, btns: btns
      });
    }
    return overlayLocal({ title: opts.title, sub: opts.sub, stars: opts.stars, btns: btns, cls: opts.cls });
  }

  /* ---------- A5 练习限时设置条 ----------
     guardBar({container, prefs, minuteOptions, gamesOptions, onPrefs}) → { el, refresh }
     - prefs：{ minutePref, gamesPref }（当前选中档）
     - minuteOptions / gamesOptions：分钟档 / 题量档数组（0 = 不限 → '不限'）
     - onPrefs({minute:m}) / onPrefs({games:g})：点击回调（工具更新 store 后调 refresh()）
     输出类名：limit-btn / limit-btn active（数学口算约定；container 类名 limit-row 由调用方定） */
  function guardBar(opts) {
    opts = opts || {};
    var container = opts.container;
    if (!container) { return null; }
    var prefs = opts.prefs || {};
    function render() {
      clearNode(container);
      (opts.minuteOptions || []).forEach(function (m) {
        var b = makeEl('button', 'limit-btn' + (prefs.minutePref === m ? ' active' : ''), m + ' 分钟');
        b.addEventListener('click', function () {
          if (opts.onPrefs) { opts.onPrefs({ minute: m }); }
        });
        container.appendChild(b);
      });
      (opts.gamesOptions || []).forEach(function (g) {
        var label = g === 0 ? '不限' : g + ' 题';
        var b = makeEl('button', 'limit-btn' + (prefs.gamesPref === g ? ' active' : ''), label);
        b.addEventListener('click', function () {
          if (opts.onPrefs) { opts.onPrefs({ games: g }); }
        });
        container.appendChild(b);
      });
    }
    render();
    return { el: container, refresh: render };
  }

  /* ---------- A6 自律徽标 canvas 绘制 ----------
     selfBadge(ctx, {streak, x?, y?, w?, h?, text?}) → void（在 ctx 上绘制，供 share.cardCanvas drawFn 内调用）
     - 缺省居中于画布顶部（y=276 对齐数学口算打卡卡胶囊位），圆角胶囊「今日自律 X 天」
     输出类名：无（canvas 绘制） */
  function selfBadge(ctx, opts) {
    if (!ctx) { return; }
    opts = opts || {};
    var streak = opts.streak || 0;
    var text = opts.text || ('今日自律 ' + streak + ' 天');
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 38px sans-serif';
    var tw = ctx.measureText(text).width;
    var w = opts.w || (tw + 64), h = opts.h || 76;
    var x = (opts.x !== undefined && opts.x !== null) ? opts.x : (ctx.canvas.width - w) / 2;
    var y = (opts.y !== undefined && opts.y !== null) ? opts.y : 276;
    roundRectPath(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = '#ff8c00';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x + w / 2, y + h / 2 + 2);
    ctx.restore();
  }

  /* ---------- A7 自律成就卡片 ----------
     selfStreakCard({streak, selfDaily, longest?, store?}) → { el }
     - longest：最长连续自律天数——优先取传入；缺省且给 store 时经 LX_SHARED.progress.longest(store)
       读取（不直读字段名，Oracle N1）
     输出类名：lx-self-card / lx-self-card-title / lx-self-stats / lx-self-stat / lx-self-tip */
  function selfStreakCard(opts) {
    opts = opts || {};
    var streak = opts.streak || 0;
    var selfDaily = opts.selfDaily || [];
    var longest = opts.longest;
    if (longest === undefined && opts.store && window.LX_SHARED && window.LX_SHARED.progress &&
        window.LX_SHARED.progress.longest) {
      longest = window.LX_SHARED.progress.longest(opts.store);
    }
    if (longest === undefined || longest === null) { longest = 0; }
    var selfCount = (selfDaily && selfDaily.length) || 0;
    var card = makeEl('div', 'lx-self-card');
    card.appendChild(makeEl('div', 'lx-self-card-title', '🏅 自律成就'));
    var stats = makeEl('div', 'lx-self-stats');
    function mkStat(label, val) {
      var s = makeEl('div', 'lx-self-stat');
      s.appendChild(makeEl('b', '', val));
      s.appendChild(makeEl('span', '', label));
      return s;
    }
    stats.appendChild(mkStat('连续自律', streak + ' 天'));
    stats.appendChild(mkStat('最长自律', longest + ' 天'));
    stats.appendChild(mkStat('自律次数', '' + selfCount + ' 次'));
    card.appendChild(stats);
    if (streak >= 7) { card.appendChild(makeEl('div', 'lx-self-tip', '🎉 连续 7 天以上，习惯养成中！')); }
    return { el: card };
  }

  /* ---------- A9 分享文案纯函数（全库同构） ----------
     shareText({streak, name, metric, value, unit, tags, template}) → 文案字符串
     默认："今天孩子用{name}完成练习，{metric} {value}{unit}！连续打卡 {streak} 天 📅 继续加油～"
     template：可选自定义模板（占位符 {name}/{metric}/{value}/{unit}/{streak} 替换；
       存量工具行为不变迁移时传原文案模板，如数学口算）
     tags：数组 → 追加 ' #tag' 后缀
     输出类名：无（纯函数） */
  function shareText(opts) {
    opts = opts || {};
    var name = opts.name || '练习';
    var metric = opts.metric || '正确率';
    var value = (opts.value !== undefined && opts.value !== null) ? opts.value : 0;
    var unit = opts.unit || '%';
    var streak = opts.streak || 0;
    var text;
    if (opts.template) {
      text = opts.template
        .replace(/\{name\}/g, name)
        .replace(/\{metric\}/g, metric)
        .replace(/\{value\}/g, '' + value)
        .replace(/\{unit\}/g, unit)
        .replace(/\{streak\}/g, '' + streak);
    } else {
      text = '今天孩子用' + name + '完成练习，' + metric + ' ' + value + unit +
             '！连续打卡 ' + streak + ' 天 📅 继续加油～';
    }
    var tags = opts.tags || [];
    var i;
    for (i = 0; i < tags.length; i++) {
      text += ' #' + tags[i];
    }
    return text;
  }

  /* ---------- A10 能力探测 ----------
     getShareCapability() → { webShare, copy, saveAlbum, download }
     - webShare 双重守卫：navigator.share 存在 且 location.protocol === 'https:'（Chrome 61 file:// 恒 false）
     输出类名：无（纯探测） */
  function getShareCapability() {
    var nav = window.navigator || {};
    return {
      webShare: !!(nav.share) && window.location.protocol === 'https:',
      copy: typeof document.execCommand === 'function',
      saveAlbum: false,   /* 离线容器无平台相册 API，预留（在线版可扩展） */
      download: 'download' in document.createElement('a')
    };
  }

  /* ---------- A11 自律锁拦截温和提示（替代 window.alert） ----------
     lockHint({onContinue?}) → { el, close }
     - 「今天已经很自律啦，明天见」温和浮层；onContinue 回调缺省时按钮仅关闭
     输出类名：lx-overlay / lx-overlay-card / lx-overlay-title / lx-overlay-sub / lx-overlay-btns（uikit 约定） */
  function lockHint(opts) {
    opts = opts || {};
    var handle = null;
    var closed = false;
    function close() {
      if (closed) { return; }
      closed = true;
      if (handle && handle.close) { handle.close(); }
    }
    var btns = [{
      text: '知道了',
      cls: opts.cls ? (opts.cls.mainBtn || 'btn') : 'btn-main',
      act: function () {
        if (opts.onContinue) { opts.onContinue(); }
        close();
      }
    }];
    var overlayOpts = {
      title: '今天已经很自律啦，明天见',
      sub: '休息好才能练得更好，明天继续加油～',
      btns: btns
    };
    if (!opts.cls && window.LX_SHARED && window.LX_SHARED.uikit && window.LX_SHARED.uikit.overlay) {
      handle = window.LX_SHARED.uikit.overlay(overlayOpts);
    } else {
      handle = overlayLocal(Object.assign({}, overlayOpts, { cls: opts.cls }));
    }
    return { el: handle.el, close: close };
  }

  /* ---------- A12 到点暂停浮层（延迟/自律二选） ----------
     pauseFlow({due, onPause, onResume, onExtend, onSelf}) → { el, close }
     - due：{ reason:'min'|'games', title?, desc?, extendLabel?, selfLabel? } 或 reason 字符串
     - 打开时回调 onPause()；close() 时回调 onResume()（幂等）
     - 延迟按钮触发 onExtend()，返回 false（达上限）时浮层保持打开（对齐数学口算 ISSUE-1 语义）；
       自律按钮触发 onSelf() 后关闭
     - 本模块不持句柄不持状态（每次调用新建浮层，仅返回 close 句柄）
     输出类名：lx-overlay / lx-overlay-card / lx-overlay-title / lx-overlay-sub / lx-overlay-btns（uikit 约定） */
  function pauseFlow(opts) {
    opts = opts || {};
    var due = opts.due || {};
    if (typeof due === 'string') { due = { reason: due }; }
    var reason = due.reason || 'min';
    var isMin = reason === 'min';
    var title = due.title || (isMin ? '练习时间到' : '今日目标完成');
    var desc = due.desc || (isMin ? '休息一下吧～' : '完成今日目标！');
    if (opts.onPause) { opts.onPause(); }
    var handle = null;
    var closed = false;
    function close() {
      if (closed) { return; }
      closed = true;
      if (handle && handle.close) { handle.close(); }
      if (opts.onResume) { opts.onResume(); }
    }
    var ghostCls = opts.cls ? (opts.cls.ghostBtn || 'btn') : 'btn-ghost';
    var mainCls = opts.cls ? (opts.cls.mainBtn || 'btn') : 'btn-main';
    var btns = [
      {
        text: due.extendLabel || (isMin ? '延迟 5 分钟' : '再练 2 题'),
        cls: mainCls,
        act: function () {
          var keep = opts.onExtend ? opts.onExtend() : undefined;
          if (keep !== false) { close(); }
        }
      },
      {
        text: due.selfLabel || '我很自律，今天足够了',
        cls: ghostCls,
        act: function () {
          if (opts.onSelf) { opts.onSelf(); }
          close();
        }
      }
    ];
    var overlayOpts = { title: title, sub: desc, btns: btns };
    if (!opts.cls && window.LX_SHARED && window.LX_SHARED.uikit && window.LX_SHARED.uikit.overlay) {
      handle = window.LX_SHARED.uikit.overlay(overlayOpts);
    } else {
      handle = overlayLocal(Object.assign({}, overlayOpts, { cls: opts.cls }));
    }
    return { el: handle.el, close: close };
  }

  /* ---------- 对外 API ---------- */
  U.checkinCalendar = checkinCalendar;
  U.lineChart = lineChart;
  U.saveImage = saveImage;
  U.settleChoices = settleChoices;
  U.guardBar = guardBar;
  U.selfBadge = selfBadge;
  U.selfStreakCard = selfStreakCard;
  U.shareText = shareText;
  U.getShareCapability = getShareCapability;
  U.lockHint = lockHint;
  U.pauseFlow = pauseFlow;

  /* ---------- 注册（依赖 lx-shared-core 预置 ui 槽位；Oracle B2 硬验收 __loaded.ui） ---------- */
  if (window.LX_SHARED && window.LX_SHARED.register) {
    window.LX_SHARED.register('ui', U);
    if (window.LX_SHARED.__loaded) { window.LX_SHARED.__loaded.ui = true; }
  } else {
    window.LX_SHARED = window.LX_SHARED || {};
    window.LX_SHARED.ui = U;
  }
})();
