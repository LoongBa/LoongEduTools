/* ============================================================
   热区校正工具 — 主逻辑（PC 端，无服务器纯前端）
   ------------------------------------------------------------
   数据来源：
   - book.json 由用户 <input type=file> 加载
   - 重绘图/原图/音频目录由 webkitdirectory 选择（File API）
   功能：
   - 点读模式：热区可拖动/缩放，点击热区或列表播放
   - 顺序模式：整页连播（简化版）
   - 句子列表：本页全部 track，点击选中热区
   - 保存：localStorage 自动备份 + 导出 JSON 下载
   坐标：归一化 0-1（与 build_framework 一致）
   ============================================================ */
(function () {
  'use strict';

  /* ---------- DOM ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var homeEl = $('home');
  var editorEl = $('editor');
  var canvasEl = $('page-canvas');
  var canvasOrigEl = $('page-canvas-orig');
  var trackListEl = $('track-list');
  var coordsPanelEl = $('coords-panel');
  var editorRightEl = $('editor-right');

  /* ---------- 状态 ---------- */
  var book = null;          // 解析后的 book.json
  var bookFileName = '';
  var imgRedrawn = {};      // "Page_014.png" -> File
  var imgOrig = {};         // "Page_014.png" -> File
  var audioFiles = [];      // File 列表（音频目录）
  var audioByPageIdx = {};  // "14|1" -> File（P014_01_*.mp3）

  var units = [];           // 单元列表 {title, start, end}
  var currentUnit = 0;
  var currentPage = 0;
  var unitPages = [];       // [{no, image, tracks:[...]}] 已展开
  var currentTracks = [];   // 当前页 track 列表
  var selectedIdx = -1;     // 选中的 track 下标（-1 无）
  var playingIdx = -1;      // 播放中的 track 下标

  var corr = {};            // 校正数据 { "14": { "1": {left,top,right,bottom}, ... }, ... }
                            //   键：页面号字符串 -> track_index -> 坐标
  var dirty = false;        // 有未保存修改

  var mode = 'tap';
  var audioEl = null;       // <audio> 单例（本地/在线播放）
  var seqTimer = null;
  var seqRunning = false;
  var seqIndex = 0;
  var listVisible = true;

  /* ---------- 本地存储 key ---------- */
  /* ---------- 全局模式与册映射 ---------- */
  var LOAD_MODE = (location.protocol === 'http:' || location.protocol === 'https:') ? 'http' : 'file';
  var BOOK_PATH = {
    '一年级_上册': { g: '一年级', v: '上册' }, '一年级_下册': { g: '一年级', v: '下册' },
    '二年级_上册': { g: '二年级', v: '上册' }, '二年级_下册': { g: '二年级', v: '下册' },
    '三年级_上册': { g: '三年级', v: '上册' }, '三年级_下册': { g: '三年级', v: '下册' },
    '四年级_上册': { g: '四年级', v: '上册' }, '四年级_下册': { g: '四年级', v: '下册' },
    '五年级_上册': { g: '五年级', v: '上册' }, '五年级_下册': { g: '五年级', v: '下册' },
    '六年级_上册': { g: '六年级', v: '上册' },
  };
  var currentBookKey = null;   // http 模式当前册 key（file 模式为 null）
  function qs(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function currentBookPath() {
    return BOOK_PATH[currentBookKey] || { g: '', v: '' };
  }

  var LS_CORR_PREFIX = 'hotzone.corr.';
  var LS_LAST_KEY = 'hotzone.last.book';

  /* ---------- 工具 ---------- */
  function clearNode(node) {
    while (node.firstChild) { node.removeChild(node.firstChild); }
  }
  function makeEl(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) { el.className = cls; }
    if (text !== undefined && text !== null) { el.textContent = text; }
    return el;
  }
  function pad3(n) { return (n < 10 ? '00' : n < 100 ? '0' : '') + n; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function round4(v) { return Math.round(v * 10000) / 10000; }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ============================================================
     一、首页：加载数据
     ============================================================ */

  /* 读取 book.json */
  $('file-book').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) { return; }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        book = JSON.parse(reader.result);
        bookFileName = file.name;
        parseUnits();
        $('book-info').textContent = '✓ ' +
          (book.bookinfo ? book.bookinfo.bookname : '') +
          '（' + file.name + '）';
        $('book-info').style.color = '#67c23a';
      } catch (err) {
        $('book-info').textContent = '✗ JSON 解析失败: ' + err.message;
        $('book-info').style.color = '#f56c6c';
      }
    };
    reader.readAsText(file);
  });

  /* 解析单元（与 build_framework.resolve_unit_pages 一致） */
  function parseUnits() {
    var chapters = book && book.bookaudio_v3;
    units = [];
    if (chapters && chapters.length) {
      var total = (book.bookpage || []).length;
      for (var i = 0; i < chapters.length; i++) {
        var start = parseInt(chapters[i].page_no, 10) || 0;
        var end = total + 1;
        if (i + 1 < chapters.length && chapters[i + 1].page_no) {
          end = parseInt(chapters[i + 1].page_no, 10);
        }
        units.push({
          title: chapters[i].title || ('单元' + (i + 1)),
          start: start,
          end: end,
        });
      }
    } else {
      // 无 bookaudio_v3：全书作一个单元
      units.push({ title: '全书', start: 2, end: (book.bookpage || []).length + 1 });
    }
    fillUnitSelect();
  }

  function fillUnitSelect() {
    var sel = $('sel-unit');
    clearNode(sel);
    units.forEach(function (u, i) {
      var opt = document.createElement('option');
      opt.value = i;
      opt.textContent = u.title;
      sel.appendChild(opt);
    });
    sel.disabled = false;
    $('btn-enter').disabled = false;
  }

  /* 重绘图目录 */
  $('dir-redrawn').addEventListener('change', function (e) {
    imgRedrawn = {};
    Array.prototype.forEach.call(e.target.files, function (f) {
      imgRedrawn[f.name] = f;
    });
    updateDirStatus(this, '重绘图 ' + Object.keys(imgRedrawn).length + ' 个文件');
  });

  /* 原图目录 */
  $('dir-orig').addEventListener('change', function (e) {
    imgOrig = {};
    Array.prototype.forEach.call(e.target.files, function (f) {
      imgOrig[f.name] = f;
    });
    updateDirStatus(this, '原图 ' + Object.keys(imgOrig).length + ' 个文件');
  });

  /* 音频目录：索引 P{page:03d}_{idx:02d}_*.mp3 */
  $('dir-audio').addEventListener('change', function (e) {
    audioFiles = [];
    audioByPageIdx = {};
    Array.prototype.forEach.call(e.target.files, function (f) {
      audioFiles.push(f);
      var m = /^P(\d{3})_(\d{2})_.*\.mp3$/i.exec(f.name);
      if (m) {
        audioByPageIdx[parseInt(m[1], 10) + '|' + parseInt(m[2], 10)] = f;
      }
    });
    updateDirStatus(this, '音频 ' + audioFiles.length + ' 个文件');
  });

  function updateDirStatus(input, msg) {
    var info = input.parentElement.querySelector('.file-info');
    info.textContent = '✓ ' + msg;
    info.style.color = '#67c23a';
  }

  /* ---------- 进入校正 ---------- */
  $('btn-enter').addEventListener('click', function () {
    if (!book) { return; }
    currentUnit = parseInt($('sel-unit').value, 10) || 0;
    expandUnitPages();
    loadCorrFromLS();
    currentPage = 0;
    dirty = false;
    showEditor();
  });

  /* 展开当前单元全部页面 */
  function expandUnitPages() {
    var u = units[currentUnit];
    var pageByNo = {};
    (book.bookpage || []).forEach(function (p) { pageByNo[p.page_no] = p; });
    unitPages = [];
    for (var no = u.start; no < u.end; no++) {
      var raw = pageByNo[no];
      if (!raw) { continue; }
      var tracks = [];
      (raw.track_info || []).forEach(function (t) {
        var left = parseFloat(t.track_left), top = parseFloat(t.track_top);
        var right = parseFloat(t.track_right), bottom = parseFloat(t.track_bottom);
        if (isNaN(left) || isNaN(top) || isNaN(right) || isNaN(bottom)) { return; }
        if (right <= left || bottom <= top) { return; }
        tracks.push({
          idx: parseInt(t.track_index, 10) || 0,
          text: t.track_text || '',
          genre: t.track_genre || '',
          left: left, top: top, right: right, bottom: bottom,
          hasAudio: hasAudioFor(no, parseInt(t.track_index, 10) || 0),
        });
      });
      unitPages.push({ no: no, tracks: tracks });
    }
    if (!unitPages.length) {
      unitPages = [{ no: 0, tracks: [] }];
    }
  }

  function hasAudioFor(pageNo, idx) {
    return !!audioByPageIdx[pageNo + '|' + idx];
  }

  /* ============================================================
     二、校正数据：localStorage + 导出
     ============================================================ */

  function corrLSKey() {
    return LS_CORR_PREFIX + bookFileName + '#' + currentUnit;
  }

  function loadCorrFromLS() {
    try {
      var v = localStorage.getItem(corrLSKey());
      corr = v ? JSON.parse(v) : {};
    } catch (err) { corr = {}; }
  }

  function saveCorrToLS() {
    try {
      localStorage.setItem(corrLSKey(), JSON.stringify(corr));
      localStorage.setItem(LS_LAST_KEY, bookFileName + '|' + currentUnit);
    } catch (err) { /* ignore */ }
  }

  /* 校正坐标：优先 corr，回退原始 */
  function getTrackRect(pageObj, track) {
    var pageCorr = corr[String(pageObj.no)];
    if (pageCorr && pageCorr[String(track.idx)]) {
      return pageCorr[String(track.idx)];
    }
    return track; // 原始
  }

  function setTrackRect(pageObj, track, rect) {
    var no = String(pageObj.no);
    if (!corr[no]) { corr[no] = {}; }
    corr[no][String(track.idx)] = {
      left: round4(rect.left), top: round4(rect.top),
      right: round4(rect.right), bottom: round4(rect.bottom),
    };
    dirty = true;
    refreshSaveStatus();
  }

  function resetTrackRect(pageObj, track) {
    var no = String(pageObj.no);
    if (corr[no]) {
      delete corr[no][String(track.idx)];
      if (!Object.keys(corr[no]).length) { delete corr[no]; }
    }
    dirty = true;
    refreshSaveStatus();
  }

  function deleteTrackRect(pageObj, track) {
    var no = String(pageObj.no);
    if (corr[no]) {
      delete corr[no][String(track.idx)];
      if (!Object.keys(corr[no]).length) { delete corr[no]; }
    }
    // 同时从原始数据移除（该热区不再渲染）
    track.deleted = true;
    dirty = true;
    refreshSaveStatus();
  }

  function refreshSaveStatus() {
    var el = $('save-status');
    el.textContent = dirty ? '● 未保存' : '✓ 已保存';
    el.className = 'save-status' + (dirty ? ' dirty' : ' saved');
  }

  /* ---------- 保存（localStorage）与导出（下载） ---------- */
  $('btn-save').addEventListener('click', function () {
    saveCorrToLS();
    dirty = false;
    refreshSaveStatus();
    flashSaveStatus('已保存到浏览器');
  });

  function downloadExport(payload) {
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = exportFileName();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
    return a.download;
  }

  $('btn-export').addEventListener('click', function () {
    saveCorrToLS();
    var payload = buildExport();
    if (LOAD_MODE === 'http') {
      // 服务器模式：直接保存到素材重绘目录（覆盖同名=更新），build 立即可用
      var grade = currentBookPath().g, vol = currentBookPath().v;
      if (!grade || !vol) { flashSaveStatus('未知册次，无法保存'); return; }
      if (!confirm('保存校正数据到素材目录（覆盖同名文件=更新）？\n\n_重绘图片素材/' + exportFileName())) { return; }
      fetch('/api/save_hotzone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: grade + '/' + vol, filename: exportFileName(), content: payload }),
      }).then(function (r) {
        if (!r.ok) { throw new Error('HTTP ' + r.status); }
        return r.text();
      }).then(function (msg) {
        flashSaveStatus('✅ ' + msg);
        // 回传工作台：热区已保存 → 父页面刷新 hotzone.updated_at / hz_issues / page_issues
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'hotzone_saved', book: currentBookKey, unit: currentUnit }, '*');
        }
      }).catch(function (err) {
        flashSaveStatus('❌ 保存失败: ' + err.message + '（已改为下载留档）');
        var fname = downloadExport(payload);
        setTimeout(function () {
          alert('已下载 ' + fname + '\n请手动放到 素材目录/_重绘图片素材/ 覆盖同名');
        }, 500);
      });
      return;
    }
    // file:// 本地数据包模式：无法写素材目录 → 下载，提示放置位置
    var fn = downloadExport(payload);
    flashSaveStatus('已下载 ' + fn + '（请放到 素材目录/_重绘图片素材/ 覆盖同名）');
  });

  /* 已删除的热区：{ page: [track_index,...] }（删除信息不再丢失） */
  function buildDeleted() {
    var del = {};
    unitPages.forEach(function (p) {
      var list = (p.tracks || []).filter(function (t) { return t.deleted; });
      if (list.length) { del[String(p.no)] = list.map(function (t) { return t.idx; }); }
    });
    return del;
  }

  /* AI 处理指引：修正哪里 → 如何重新编译打包 → 升版 → 更新时间 */
  function buildAiInstructions(now) {
    var bp = currentBookPath();
    var fileName = exportFileName();
    return {
      task: '应用以下热区校正数据，重新构建对应点读单元',
      data_file: fileName,
      copy_to: 'F:\\_教材素材\\人教版（PEP）（主编：吴欣）\\' + (bp.g || '') + '\\' + (bp.v || '') + '\\' + fileName,
      rebuild_cmd: 'python build_all.py --tool 英语点读 --units ' + currentUnit,
      version_bump: 'patch（0.0.x → 0.0.x+1，热区微调类变更）',
      updated_at: now,
    };
  }

  function buildExport() {
    var now = new Date().toISOString();
    return {
      tool: 'hotzone-corrector',
      book: bookFileName,
      bookname: book.bookinfo ? book.bookinfo.bookname : '',
      unit_index: currentUnit,
      unit_title: units[currentUnit].title,
      exported_at: now,
      pages: corr,
      deleted: buildDeleted(),
      ai_instructions: buildAiInstructions(now),
    };
  }

  function exportFileName() {
    var u = units[currentUnit];
    var safeTitle = (u.title || 'unit' + (currentUnit + 1))
      .replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
    return '热区校正_' + safeTitle + '.json';
  }

  function flashSaveStatus(msg) {
    var el = $('save-status');
    el.textContent = msg;
    el.className = 'save-status saved';
    setTimeout(function () { refreshSaveStatus(); }, 1500);
  }

  /* ============================================================
     三、内容页渲染
     ============================================================ */

  function showEditor() {
    homeEl.hidden = true;
    editorEl.hidden = false;
    renderAll();
  }

  function showHome() {
    stopAll();
    editorEl.hidden = true;
    homeEl.hidden = false;
  }
  $('btn-back').addEventListener('click', showHome);

  function renderAll() {
    renderTitle();
    renderPage();
    renderTrackList();
    renderToolbar();
  }

  function renderTitle() {
    var u = units[currentUnit];
    $('editor-title').textContent =
      (book.bookinfo ? book.bookinfo.bookname : bookFileName) +
      ' / ' + u.title;
  }

  function currentPageObj() { return unitPages[currentPage]; }

  /* ---------- 页面图 ---------- */
  function pageImageURL(pageObj) {
    var name = 'Page_' + pad3(pageObj.no) + '.png';
    // http 自动加载模式：直接引用素材库 URL（重绘优先，渲染层 error 时回退原图）
    if (LOAD_MODE === 'http') {
      var bp = currentBookPath();
      return '/' + bp.g + '/' + bp.v + '/_重绘图片素材/' + name;
    }
    // file:// 本地数据包（免服务器）：data/<册>/img/Page_NNN_redr.jpg
    if (currentBookKey) {
      return 'data/' + currentBookKey + '/img/Page_' + pad3(pageObj.no) + '_redr.jpg';
    }
    // file 模式（手动）：重绘优先，回退原图
    if (imgRedrawn[name]) { return URL.createObjectURL(imgRedrawn[name]); }
    if (imgOrig[name]) { return URL.createObjectURL(imgOrig[name]); }
    return null;
  }

  function origImageURL(pageObj) {
    var name = 'Page_' + pad3(pageObj.no) + '.png';
    if (LOAD_MODE === 'http') {
      var bp = currentBookPath();
      return '/' + bp.g + '/' + bp.v + '/_图片素材/' + name;
    }
    if (currentBookKey) {
      return 'data/' + currentBookKey + '/img/Page_' + pad3(pageObj.no) + '_orig.jpg';
    }
    if (imgOrig[name]) { return URL.createObjectURL(imgOrig[name]); }
    return null;
  }

  function renderPage() {
    stopAll();
    selectedIdx = -1;
    playingIdx = -1;
    clearNode(canvasEl);
    clearNode(canvasOrigEl);
    coordsPanelEl.hidden = true;
    canvasEl.style.width = '';
    canvasEl.style.height = '';
    canvasOrigEl.style.width = '';
    canvasOrigEl.style.height = '';

    var pageObj = currentPageObj();
    if (!pageObj) { return; }

    // 渲染原图
    var origUrl = origImageURL(pageObj);
    if (origUrl) {
      var origImg = makeEl('img');
      origImg.src = origUrl;
      origImg.alt = '原图 Page ' + pageObj.no;
      origImg.addEventListener('load', function () {
        fitCanvasToViewport(origImg, canvasOrigEl, canvasOrigEl.closest('.page-canvas-wrap'));
        // 大图/布局延迟：容器高度可能首帧未就绪，稍后重试适配
        setTimeout(function () { fitCanvasToViewport(origImg, canvasOrigEl, canvasOrigEl.closest('.page-canvas-wrap')); }, 200);
      });
      canvasOrigEl.appendChild(origImg);
    }

    // 渲染重绘图（带热区）
    var url = pageImageURL(pageObj);
    if (!url) {
      canvasEl.textContent = '⚠ 未找到页面图（请加载重绘图或原图目录）';
      canvasEl.style.padding = '40px';
      canvasEl.style.color = '#888';
      $('canvas-hint').hidden = true;
      return;
    }
    $('canvas-hint').hidden = false;

    var img = makeEl('img');
    img.src = url;
    img.alt = '重绘 Page ' + pageObj.no;
    img.addEventListener('load', function () {
      fitCanvasToViewport(img, canvasEl, canvasEl.closest('.page-canvas-wrap'));
      renderHotzones();
      // 大图/布局延迟：容器高度可能首帧未就绪，稍后重试适配（否则热区定位会超视口）
      setTimeout(function () {
        fitCanvasToViewport(img, canvasEl, canvasEl.closest('.page-canvas-wrap'));
        if (!canvasEl.querySelector('.hotzone')) { renderHotzones(); }
      }, 200);
    });
    img.addEventListener('error', function () {
      // http 模式：重绘缺失时回退原图
      if (LOAD_MODE === 'http') {
        var fb = origImageURL(pageObj);
        if (fb && img.src !== fb) { img.src = fb; return; }
      }
      canvasEl.textContent = '⚠ 图片加载失败';
      canvasEl.style.padding = '40px';
      canvasEl.style.color = '#888';
    });
    canvasEl.appendChild(img);

    currentTracks = pageObj.tracks.filter(function (t) { return !t.deleted; });
    updatePagerInfo();
  }

  /* 按可用区域 contain 适配页面图（避免竖版图超高被截断） */
  function fitCanvasToViewport(img, targetEl, containerEl) {
    var wrap = containerEl || canvasEl.parentElement;   // .page-canvas-wrap
    var wrapW = wrap.clientWidth - 16;   // 留出滚动边距
    var wrapH = wrap.clientHeight - 16;
    if (wrapW <= 0 || wrapH <= 0) { return; }

    var nw = img.naturalWidth || img.width;
    var nh = img.naturalHeight || img.height;
    if (!nw || !nh) { return; }

    // 等比缩放：优先完整显示（高度受限为主，竖版书页）
    var scale = Math.min(wrapW / nw, wrapH / nh);
    if (scale >= 1) { scale = 1; }   // 小图不放大
    targetEl.style.width = Math.round(nw * scale) + 'px';
    targetEl.style.height = Math.round(nh * scale) + 'px';
  }

  /* ---------- 热区渲染 ---------- */
  function renderHotzones() {
    // 移除旧热区
    canvasEl.querySelectorAll('.hotzone').forEach(function (n) { n.remove(); });
    var pageObj = currentPageObj();
    if (!pageObj) { return; }

    currentTracks.forEach(function (track, i) {
      var rect = getTrackRect(pageObj, track);
      var spot = makeEl('div', 'hotzone');
      spot.style.left = (rect.left * 100) + '%';
      spot.style.top = (rect.top * 100) + '%';
      spot.style.width = Math.max(0.3, (rect.right - rect.left) * 100) + '%';
      spot.style.height = Math.max(0.3, (rect.bottom - rect.top) * 100) + '%';

      // 显示英文文字标签
      var label = makeEl('div', 'hotzone-label');
      var displayText = (track.text || '').trim();
      if (displayText) {
        label.textContent = displayText.length > 20 ? displayText.substring(0, 20) + '...' : displayText;
        spot.appendChild(label);
      }

      spot.title = track.text || '';

      if (i === selectedIdx) { spot.classList.add('is-selected'); }
      if (i === playingIdx) { spot.classList.add('is-playing'); }

      // 选中热区 → 挂 8 手柄
      if (i === selectedIdx) {
        ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(function (h) {
          spot.appendChild(makeEl('div', 'handle handle-' + h));
        });
      }

      bindHotzoneDrag(spot, track, rect, i);
      canvasEl.appendChild(spot);
    });
  }

  /* 热区拖拽 + 手柄缩放 */
  function bindHotzoneDrag(spot, track, rect, index) {
    var pageObj = currentPageObj();
    var dragState = null;

    // 手柄：缩放
    Array.prototype.forEach.call(spot.querySelectorAll('.handle'), function (h) {
      h.addEventListener('pointerdown', function (e) {
        e.stopPropagation();
        e.preventDefault();
        try { spot.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件可能无有效 pointerId */ }
        var dir = /handle-(\w+)/.exec(h.className)[1];
        var startX = e.clientX, startY = e.clientY;
        // 实时读取当前校正坐标（避免闭包快照陈旧导致二次操作还原）
        var cur = getTrackRect(pageObj, track);
        var r = { left: cur.left, top: cur.top, right: cur.right, bottom: cur.bottom };
        var imgRect = canvasEl.querySelector('img').getBoundingClientRect();
        dragState = {
          type: 'resize', dir: dir, r: r,
          startX: startX, startY: startY, imgRect: imgRect,
          pageObj: pageObj, track: track, index: index,
        };
      });
    });

    // 热区主体：拖动移动 / 点击选中
    spot.addEventListener('pointerdown', function (e) {
      if (e.target.classList.contains('handle')) { return; }
      e.preventDefault();
      try { spot.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件可能无有效 pointerId */ }
      var startX = e.clientX, startY = e.clientY;
      var moved = false;
      // 实时读取当前校正坐标（避免闭包快照陈旧导致二次操作还原）
      var cur = getTrackRect(pageObj, track);
      var r = { left: cur.left, top: cur.top, right: cur.right, bottom: cur.bottom };
      var imgRect = canvasEl.querySelector('img').getBoundingClientRect();

      dragState = {
        type: 'move', startX: startX, startY: startY, moved: moved,
        r: r, pageObj: pageObj, track: track, index: index, imgRect: imgRect,
      };
    });

    spot.addEventListener('pointermove', function (e) {
      if (!dragState) { return; }
      var ds = dragState;
      var imgRect = ds.imgRect || canvasEl.querySelector('img').getBoundingClientRect();
      var dx = (e.clientX - ds.startX) / imgRect.width;
      var dy = (e.clientY - ds.startY) / imgRect.height;

      if (ds.type === 'move') {
        if (Math.abs(dx) > 0.002 || Math.abs(dy) > 0.002) { ds.moved = true; }
        var w = ds.r.right - ds.r.left, h = ds.r.bottom - ds.r.top;
        var nl = clamp(ds.r.left + dx, 0, 1 - w);
        var nt = clamp(ds.r.top + dy, 0, 1 - h);
        applyRect(ds.pageObj, ds.track, {
          left: nl, top: nt, right: nl + w, bottom: nt + h,
        });
      } else if (ds.type === 'resize') {
        resizeByDir(ds, dx, dy);
      }
    });

    spot.addEventListener('pointerup', function (e) {
      if (!dragState) { return; }
      var ds = dragState;
      dragState = null;
      if (ds.type === 'move' && !ds.moved) {
        // 纯点击 → 选中 + 播放
        selectTrack(ds.index);
        playTrack(ds.index);
      } else {
        // 拖拽/缩放结束：刷新坐标面板 + 列表高亮
        if (ds.index === selectedIdx) { showCoords(); }
      }
    });

    spot.addEventListener('pointercancel', function () { dragState = null; });
  }

  /* 手柄缩放计算 */
  function resizeByDir(ds, dx, dy) {
    var r = ds.r;
    var d = ds.dir;
    var nl = r.left, nt = r.top, nr = r.right, nb = r.bottom;
    var MIN_W = 0.005, MIN_H = 0.005;
    if (d.indexOf('w') >= 0) { nl = clamp(r.left + dx, 0, nr - MIN_W); }
    if (d.indexOf('e') >= 0) { nr = clamp(r.right + dx, nl + MIN_W, 1); }
    if (d.indexOf('n') >= 0) { nt = clamp(r.top + dy, 0, nb - MIN_H); }
    if (d.indexOf('s') >= 0) { nb = clamp(r.bottom + dy, nt + MIN_H, 1); }
    applyRect(ds.pageObj, ds.track, { left: nl, top: nt, right: nr, bottom: nb });
  }

  /* 应用坐标：拖拽期间仅实时更新 CSS，不重建 DOM */
  function applyRect(pageObj, track, rect) {
    setTrackRect(pageObj, track, rect);
    // 找到当前对应热区 DOM，实时更新位置/大小
    var spots = canvasEl.querySelectorAll('.hotzone');
    var i = currentTracks.indexOf(track);
    if (i >= 0 && spots[i]) {
      var spot = spots[i];
      spot.style.left = (rect.left * 100) + '%';
      spot.style.top = (rect.top * 100) + '%';
      spot.style.width = Math.max(0.3, (rect.right - rect.left) * 100) + '%';
      spot.style.height = Math.max(0.3, (rect.bottom - rect.top) * 100) + '%';
    }
  }

  /* ---------- 选中 ---------- */
  function selectTrack(index) {
    stopPlayback();
    selectedIdx = index;
    playingIdx = -1;
    renderHotzones();
    renderTrackList();
    showCoords();
  }

  function showCoords() {
    if (selectedIdx < 0) { coordsPanelEl.hidden = true; return; }
    var pageObj = currentPageObj();
    var track = currentTracks[selectedIdx];
    var rect = getTrackRect(pageObj, track);
    coordsPanelEl.hidden = false;
    $('c-left').value = round4(rect.left);
    $('c-top').value = round4(rect.top);
    $('c-right').value = round4(rect.right);
    $('c-bottom').value = round4(rect.bottom);
  }

  /* 坐标输入同步 */
  ['c-left', 'c-top', 'c-right', 'c-bottom'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      if (selectedIdx < 0) { return; }
      var pageObj = currentPageObj();
      var track = currentTracks[selectedIdx];
      var rect = getTrackRect(pageObj, track);
      var l = clamp(parseFloat($('c-left').value) || 0, 0, 1);
      var t = clamp(parseFloat($('c-top').value) || 0, 0, 1);
      var r = clamp(parseFloat($('c-right').value) || 0, 0, 1);
      var b = clamp(parseFloat($('c-bottom').value) || 0, 0, 1);
      if (r <= l) { r = Math.min(1, l + 0.01); }
      if (b <= t) { b = Math.min(1, t + 0.01); }
      setTrackRect(pageObj, track, { left: l, top: t, right: r, bottom: b });
      renderHotzones();
    });
  });

  $('c-reset').addEventListener('click', function () {
    if (selectedIdx < 0) { return; }
    var pageObj = currentPageObj();
    var track = currentTracks[selectedIdx];
    resetTrackRect(pageObj, track);
    selectTrack(selectedIdx); // 重选刷新
  });

  $('c-del').addEventListener('click', function () {
    if (selectedIdx < 0) { return; }
    var pageObj = currentPageObj();
    var track = currentTracks[selectedIdx];
    deleteTrackRect(pageObj, track);
    selectedIdx = -1;
    coordsPanelEl.hidden = true;
    renderPage();
    renderTrackList();
  });

  /* ---------- 句子列表 ---------- */
  function renderTrackList() {
    clearNode(trackListEl);
    var pageObj = currentPageObj();
    var tracks = currentTracks;
    $('list-count').textContent = tracks.length + ' 条';

    if (!tracks.length) {
      trackListEl.appendChild(makeEl('div', 'track-item', '本页无热区'));
      return;
    }
    tracks.forEach(function (track, i) {
      var item = makeEl('div', 'track-item');
      if (i === selectedIdx) { item.classList.add('is-active'); }
      if (i === playingIdx) { item.classList.add('is-playing'); }

      var idx = makeEl('span', 'track-idx', String(i + 1));
      var textBox = makeEl('span', 'track-text');
      // 中文优先（与点读小程序字幕一致），回退英文；多行 \n 转 <br>
      var display = (track.genre || track.text || '').trim() ||
                    (track.text || '').trim() || '（无文本）';
      textBox.innerHTML = escapeHtml(display).replace(/\n/g, '<br>');
      if (track.genre && track.text && track.genre.indexOf(track.text) < 0) {
        // 中英都有且不同 → 附小字英文（仅当非多行，多行英文太长）
        if (display.indexOf('\n') < 0 && track.genre.indexOf('\n') < 0) {
          textBox.appendChild(makeEl('span', 'track-en', ' ' + track.text));
        }
      }
      item.appendChild(idx);
      item.appendChild(textBox);
      if (!track.hasAudio) {
        item.appendChild(makeEl('span', 'track-noaudio', '无音频'));
      }

      item.addEventListener('click', function () {
        selectTrack(i);
        playTrack(i);
      });
      trackListEl.appendChild(item);
    });
  }

  /* ============================================================
     四、播放（本地音频 / 无音频则跳过）
     ============================================================ */
  function ensureAudio() {
    if (!audioEl) {
      audioEl = new Audio();
      audioEl.onended = function () {
        playingIdx = -1;
        renderHotzones();
        renderTrackList();
        if (mode === 'seq' && seqRunning) { seqNext(); }
      };
    }
    return audioEl;
  }

  function getTrackAudioFile(pageObj, track) {
    return audioByPageIdx[pageObj.no + '|' + track.idx];
  }

  function playTrack(index) {
    var pageObj = currentPageObj();
    var track = currentTracks[index];
    if (!track) { return; }
    var file = getTrackAudioFile(pageObj, track);
    if (!file) { return; }

    stopPlayback();
    var audio = ensureAudio();
    audio.src = LOAD_MODE === 'http' ? file : URL.createObjectURL(file);
    playingIdx = index;
    renderHotzones();
    renderTrackList();
    audio.play().catch(function () { /* 用户交互后应可播 */ });
  }

  function stopPlayback() {
    if (audioEl) {
      audioEl.pause();
      audioEl.removeAttribute('src');
    }
    playingIdx = -1;
    if (seqRunning) { stopSeq(); }
    renderHotzones();
    renderTrackList();
  }

  /* ============================================================
     五、翻页 + 模式 + 顺序播放
     ============================================================ */
  function renderToolbar() {
    var u = units[currentUnit];
    $('p-first').disabled = currentPage === 0;
    $('p-prev').disabled = currentPage === 0;
    $('p-next').disabled = currentPage >= unitPages.length - 1;
    $('p-last').disabled = currentPage >= unitPages.length - 1;
    $('mode-tap').classList.toggle('is-active', mode === 'tap');
    $('mode-seq').classList.toggle('is-active', mode === 'seq');
    $('btn-list-toggle').classList.toggle('is-active', listVisible);
  }

  function updatePagerInfo() {
    $('p-info').textContent = (currentPage + 1) + ' / ' + unitPages.length + ' 页';
    renderToolbar();
  }

  function turnPage(delta) {
    stopPlayback();
    var target = currentPage + delta;
    if (target < 0 || target >= unitPages.length) { return; }
    currentPage = target;
    renderPage();
    renderTrackList();
  }

  $('p-first').addEventListener('click', function () { turnPageTo(0); });
  $('p-prev').addEventListener('click', function () { turnPage(-1); });
  $('p-next').addEventListener('click', function () { turnPage(1); });
  $('p-last').addEventListener('click', function () { turnPageTo(unitPages.length - 1); });

  function turnPageTo(idx) {
    stopPlayback();
    currentPage = idx;
    renderPage();
    renderTrackList();
  }

  /* 模式切换 */
  $('mode-tap').addEventListener('click', function () {
    if (mode === 'tap') { return; }
    stopSeq();
    mode = 'tap';
    renderToolbar();
  });
  $('mode-seq').addEventListener('click', function () {
    if (mode === 'seq') { return; }
    mode = 'seq';
    renderToolbar();
    startSeq();
  });

  /* 列表显隐 */
  $('btn-list-toggle').addEventListener('click', function () {
    listVisible = !listVisible;
    editorRightEl.classList.toggle('hidden', !listVisible);
    renderToolbar();
  });

  /* 顺序播放（简化：整页连播） */
  function startSeq() {
    if (!currentTracks.length) { return; }
    stopSeq();
    seqRunning = true;
    seqIndex = 0;
    seqNext();
  }

  function seqNext() {
    if (!seqRunning) { return; }
    if (seqIndex >= currentTracks.length) {
      stopSeq();
      return;
    }
    var pageObj = currentPageObj();
    var track = currentTracks[seqIndex];
    var file = getTrackAudioFile(pageObj, track);
    if (!file) {
      seqIndex++;
      seqNext();
      return;
    }
    selectedIdx = seqIndex;
    renderHotzones();
    renderTrackList();
    showCoords();
    playTrack(seqIndex);
    seqIndex++;
  }

  function stopSeq() {
    seqRunning = false;
    seqIndex = 0;
  }

  function stopAll() {
    stopPlayback();
    stopSeq();
  }

  /* 键盘：左右翻页（PC 便利） */
  document.addEventListener('keydown', function (e) {
    if (editorEl.hidden) { return; }
    if (e.target.tagName === 'INPUT') { return; }
    if (e.key === 'ArrowLeft') { turnPage(-1); }
    else if (e.key === 'ArrowRight') { turnPage(1); }
  });

  /* 窗口尺寸变化：重新 contain 当前页 */
  window.addEventListener('resize', function () {
    if (editorEl.hidden) { return; }
    var img = canvasEl.querySelector('img');
    var origImg = canvasOrigEl.querySelector('img');
    if (img) {
      fitCanvasToViewport(img, canvasEl, canvasEl.closest('.page-canvas-wrap'));
      renderHotzones();
    }
    if (origImg) {
      fitCanvasToViewport(origImg, canvasOrigEl, canvasOrigEl.closest('.page-canvas-wrap'));
    }
  });

  /* ---------- http 自动加载（仅 LOAD_MODE === 'http'） ---------- */
  function fillBookSelect() {
    var sel = $('sel-book');
    if (!sel) { return; }
    Object.keys(BOOK_PATH).forEach(function (k) {
      var o = document.createElement('option');
      o.value = k;
      o.textContent = k.replace('_', ' ');
      sel.appendChild(o);
    });
    if (currentBookKey) { sel.value = currentBookKey; }
  }

  function autoLoadHttp() {
    var bk = qs('book') || '四年级_上册';
    var unit = parseInt(qs('unit') || '0', 10) || 0;
    var bp = BOOK_PATH[bk];
    if (!bp) { homeStatus('✗ 未知册次: ' + bk); return; }
    currentBookKey = bk;
    fillBookSelect();

    function loadAudioManifest() {
      return fetch('/' + bp.g + '/' + bp.v + '/_重绘图片素材/_hotzone_manifest.json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    }

    // 书数据副本（书数据.json，旧名 book.json 兼容回退）
    function loadBookData() {
      return fetch('/' + bp.g + '/' + bp.v + '/_重绘图片素材/书数据.json')
        .then(function (r) { if (r.ok) { return r; } return fetch('/' + bp.g + '/' + bp.v + '/_重绘图片素材/book.json'); })
        .then(function (r) {
          if (!r.ok) { throw new Error('HTTP ' + r.status); }
          return r.text();
        });
    }

    loadBookData()
      .then(function (txt) {
        book = JSON.parse(txt);
        bookFileName = bk + '_book.json';
        parseUnits();
        $('book-info').textContent = '✓ 已自动加载 ' + bk + '（素材目录副本，与原数据断开）';
        $('book-info').style.color = '#67c23a';
        return loadAudioManifest();
      })
      .then(function (manifest) {
        audioByPageIdx = {};
        if (manifest && manifest.audio) {
          Object.keys(manifest.audio).forEach(function (pno) {
            Object.keys(manifest.audio[pno]).forEach(function (idx) {
              audioByPageIdx[pno + '|' + idx] =
                '/' + bp.g + '/' + bp.v + '/_音频素材/单句音频/' + manifest.audio[pno][idx];
            });
          });
        }
        var u = (unit >= 0 && unit < units.length) ? unit : 0;
        $('sel-unit').value = String(u);
        currentUnit = u;
        expandUnitPages();
        loadCorrFromLS();
        currentPage = 0;
        dirty = false;
        showEditor();
      })
      .catch(function (err) {
        homeStatus('✗ 自动加载失败: ' + err.message + '（请用 hotzone_serve.py 启动服务）');
      });
  }

  // 册下拉切换（http 模式）：换册 = 重新加载对应副本
  var bookSel = $('sel-book');
  if (bookSel) {
    bookSel.addEventListener('change', function () {
      currentBookKey = bookSel.value;
      location.href = location.pathname + '?book=' + encodeURIComponent(currentBookKey) + '&unit=0';
    });
  }

  /* ---------- file:// 本地数据包自动加载（免服务器） ---------- */
  function enterWithUnit(u) {
    u = (u >= 0 && u < units.length) ? u : 0;
    $('sel-unit').value = String(u);
    currentUnit = u;
    expandUnitPages();
    loadCorrFromLS();
    currentPage = 0;
    dirty = false;
    showEditor();
  }

  function autoLoadLocal() {
    var bk = qs('book') || '四年级_上册';
    var bp = BOOK_PATH[bk];
    if (!bp) { return; }
    currentBookKey = bk;
    fillBookSelect();
    var base = 'data/' + bk;
    var s = document.createElement('script');
    s.src = base + '/book.js';
    s.onload = function () {
      if (!window.HZ_BOOK) {
        homeStatus('✗ 数据包缺少 HZ_BOOK: ' + base + '/book.js（请先运行 hotzone_prepare.py）');
        return;
      }
      book = window.HZ_BOOK;
      bookFileName = bk + '_book.json';
      parseUnits();
      $('book-info').textContent = '✓ 已自动加载本地数据包 ' + bk + '（免服务器，数据取自重绘目录副本）';
      $('book-info').style.color = '#67c23a';
      var m = document.createElement('script');
      m.src = base + '/manifest.js';
      m.onload = function () {
        audioByPageIdx = {};
        var am = (window.HZ_MANIFEST || {}).audio || {};
        Object.keys(am).forEach(function (pno) {
          Object.keys(am[pno]).forEach(function (idx) {
            audioByPageIdx[pno + '|' + idx] = base + '/audio/' + am[pno][idx];
          });
        });
        enterWithUnit(parseInt(qs('unit') || '0', 10) || 0);
      };
      m.onerror = function () { enterWithUnit(parseInt(qs('unit') || '0', 10) || 0); };
      document.head.appendChild(m);
    };
    s.onerror = function () {
      homeStatus('未找到本地数据包 ' + base + ' —— 运行 hotzone_prepare.py 生成，或双击 启动热区校正.bat 用服务器模式');
    };
    document.head.appendChild(s);
  }

  /* ---------- 启动 ---------- */
  // 恢复上次进度提示
  try {
    var last = localStorage.getItem(LS_LAST_KEY);
    if (last) {
      var parts = last.split('|');
      var btn = $('btn-resume');
      btn.hidden = false;
      btn.textContent = '上次：' + (parts[0] || '?') + ' 单元' + (parts[1] || '0');
      btn.addEventListener('click', function () {
        // 提示用户重新加载同名 book.json 后自动跳到该单元
        if (book && bookFileName === (parts[0] || '')) {
          var idx = parseInt(parts[1], 10) || 0;
          if (idx >= 0 && idx < units.length) {
            currentUnit = idx;
            $('sel-unit').value = String(idx);
            expandUnitPages();
            loadCorrFromLS();
            currentPage = 0;
            dirty = false;
            showEditor();
            return;
          }
        }
        homeStatus('请重新选择上次的 book.json，加载后我会自动跳到上次单元');
      });
    }
  } catch (err) { /* ignore */ }

  function homeStatus(msg) {
    var el = $('home-status');
    el.textContent = msg;
  }

  // 启动：http 模式自动加载（服务器）；file:// 模式自动加载本地数据包（data/ 目录，免服务器）
  if (LOAD_MODE === 'http') {
    autoLoadHttp();
  } else {
    autoLoadLocal();
  }
})();
