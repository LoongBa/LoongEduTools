/* ============================================================
   LX_SHARED.share — 分享通用层（V0.7 抽取）
   ------------------------------------------------------------
   依据：V0.5 审计缺口③（10 款内联同构分享：文案 + canvas 卡片 + 弹层 + 复制）
   能力：
   - copyText(text, opts)           文案复制（textarea+execCommand，Chrome 61；
                                     opts.onOk/onFail 回调——工具专属反馈；同步执行保手势）
   - cardCanvas(w, h, drawFn)       离屏 canvas 容器（drawFn(ctx,w,h) 工具专属绘制）
   - overlay(opts)                  分享弹层骨架（img + 复制 + 返回按钮；
                                     { title, imgSrc, hint, copyText, backLabel, onBack }
                                     返回 { el, close } 兼容 uikit.overlay 风格）
   - roundRectPath(ctx,x,y,w,h,r)   Chrome 61 圆角路径（无 ctx.roundRect）
   约定：卡片内容/配色/文案 = 工具专属（drawFn / copyText 回调）；本模块不感知工具数据
   Oracle v0.1 审 NO-GO（3 阻断）→ v0.2：ISSUE-1 依赖 LX 命名空间 share 槽位
   （lx-shared-core 预置）+ ISSUE-2 copyText opts 回调传专属文案 + ISSUE-5
   幂等标志保留工具 wrapper
   - ES2017 经典脚本；Chrome 61 兼容
   ============================================================ */
(function () {
  'use strict';

  var S = {};

  /* ---------- 文案复制（textarea + execCommand，Chrome 61 兼容） ----------
     必须同步执行（用户手势内）：textarea+select+execCommand 全内联，无 setTimeout 包装
     opts.onOk/onFail：复制成功/失败回调（工具传专属反馈；缺省无操作） */
  function copyText(text, opts) {
    opts = opts || {};
    var ok = false;
    var ta = document.createElement('textarea');
    ta.value = text || '';
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();
    if (ta.setSelectionRange) { ta.setSelectionRange(0, ta.value.length); }   /* iOS 兼容 */
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    document.body.removeChild(ta);
    if (ok) {
      if (opts.onOk) { opts.onOk(); }
    } else {
      if (opts.onFail) { opts.onFail(text); }
    }
    return ok;
  }

  /* ---------- 离屏 canvas 容器 ----------
     drawFn(ctx, w, h)：工具专属绘制（渐变/装饰/战绩卡——内容留工具） */
  function cardCanvas(w, h, drawFn) {
    var cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    var ctx = cv.getContext('2d');
    if (!ctx) { return cv; }
    if (drawFn) { drawFn(ctx, w, h); }
    return cv;
  }

  /* ---------- 分享弹层骨架 ----------
     opts = { title, imgSrc, hint, copyText, backLabel, onBack }
     - img 显示卡片（imgSrc 通常 = cardCanvas.toDataURL）
     - 复制按钮 → opts.copyText()（工具实现——含 copyText API 调用 + 反馈）
     - 返回按钮 → opts.onBack()（工具恢复结算/关闭；本模块 close 自身）
     - 幂等防双开由调用方 openShare wrapper 的 shareOpen 标志负责（Oracle ISSUE-5） */
  function overlay(opts) {
    if (!opts) { return null; }
    var ov = document.createElement('div');
    ov.className = 'result-overlay share-overlay';
    var card = document.createElement('div');
    card.className = 'overlay-card share-card';
    var title = document.createElement('div');
    title.className = 'overlay-title';
    title.textContent = opts.title || '📷 分享打卡';
    card.appendChild(title);
    var wrap = document.createElement('div');
    wrap.className = 'share-card-wrap';
    var img = document.createElement('img');
    img.className = 'share-img';
    img.setAttribute('alt', opts.alt || '成绩打卡卡片');
    img.src = opts.imgSrc || '';
    wrap.appendChild(img);
    card.appendChild(wrap);
    if (opts.hint) {
      var hint = document.createElement('div');
      hint.className = 'share-hint';
      hint.textContent = opts.hint;
      card.appendChild(hint);
    }
    var btns = document.createElement('div');
    btns.className = 'share-btns';
    var btnCopy = document.createElement('button');
    btnCopy.className = 'btn btn-primary';
    btnCopy.textContent = opts.copyLabel || '复制分享文案';
    btnCopy.addEventListener('click', function () { if (opts.copyText) { opts.copyText(); } });
    btns.appendChild(btnCopy);
    var btnBack = document.createElement('button');
    btnBack.className = 'btn';
    btnBack.textContent = opts.backLabel || '返回结算';
    btnBack.addEventListener('click', function () {
      close();
      if (opts.onBack) { opts.onBack(); }
    });
    btns.appendChild(btnBack);
    card.appendChild(btns);
    ov.appendChild(card);
    document.body.appendChild(ov);
    function close() {
      if (ov.parentNode) { ov.parentNode.removeChild(ov); }
    }
    return { el: ov, close: close };
  }

  /* ---------- Chrome 61 圆角路径（无 ctx.roundRect） ---------- */
  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- 对外 API ---------- */
  S.copyText = copyText;
  S.cardCanvas = cardCanvas;
  S.overlay = overlay;
  S.roundRectPath = roundRectPath;

  /* ---------- 注册（Oracle ISSUE-1：依赖 lx-shared-core 预置 share 槽位） ---------- */
  if (window.LX_SHARED && window.LX_SHARED.register) {
    window.LX_SHARED.register('share', S);
    if (window.LX_SHARED.__loaded) { window.LX_SHARED.__loaded.share = true; }
  } else {
    window.LX_SHARED = window.LX_SHARED || {};
    window.LX_SHARED.share = S;
  }
})();