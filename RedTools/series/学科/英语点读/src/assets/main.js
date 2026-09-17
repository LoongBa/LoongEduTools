/* ============================================================
   新英语四上点读1单元 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   数据源：window.APP_DATA（由 data.js 注入，结构见 build.py 生成）
   音频方案：
   - 每个 track 音频为独立 js（audio/<key>.js），内容写入
     window.AUDIO_DATA[<key>] = "<base64 payload>"
   - 渲染页面时【预加载本页全部音频 js】（动态 <script> 注入）
   - Web Audio API 解码播放（decodeAudioData 纯内存操作，不经过
     <audio> 元素 / data: URI，符合容器 CSP 与平台白名单）
   功能：
   - 点读模式：热区虚线框标识可点区域，点击播单句
   - 顺序模式：按 track 顺序连播本页，支持 暂停/继续、重听本页
   - 翻页：封面 / 上一页 / 下一页 / 末页
   - 模式选择记忆（localStorage，容器禁用时降级）
   设计约束：
   - 不使用 import/export / type="module"（zip 离线，module 不可靠）
   - 不超出 ES2017（无 ?. ?? 对象展开 String.replaceAll 等）
   - 事件全部 addEventListener 绑定，无内联事件 / eval
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA;
  if (!APP || !APP.units || !APP.units.length) {
    return;
  }

  /* ---------- DOM 引用 ---------- */
  var headerEl = document.getElementById('app-header');
  var pageViewEl = document.getElementById('page-view');
  var footerEl = document.getElementById('app-footer');

  /* ---------- 状态 ---------- */
  var units = APP.units;
  var currentUnit = 0;
  var currentPage = 0;
  var currentHotspot = null;
  var audioCtx = null;
  var currentSource = null;
  var bufferCache = {};   // audioKey -> AudioBuffer（解码一次，复用）
  var mode = 'tap';       // 'tap' | 'seq'
  var seq = { running: false, index: 0, pageNo: -1, paused: false, offset: 0,
              playCount: 0, repeat: false, rate: 1, autoNext: true };

  /* ---------- 持久化 ---------- */
  var STORAGE_KEY = 'redtools.mode';
  var STORAGE_SEQ_KEY = 'redtools.seq';
  function loadMode() {
    try {
      var v = window.localStorage.getItem(STORAGE_KEY);
      if (v === 'tap' || v === 'seq') {
        mode = v;
      }
    } catch (err) {
      // 容器禁用 localStorage 时保持默认
    }
  }
  function saveMode() {
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch (err) {
      // ignore
    }
  }
  function loadSeqOptions() {
    try {
      var v = window.localStorage.getItem(STORAGE_SEQ_KEY);
      if (v) {
        var o = JSON.parse(v);
        if (typeof o.repeat === 'boolean') { seq.repeat = o.repeat; }
        if (typeof o.rate === 'number') { seq.rate = o.rate; }
        if (typeof o.autoNext === 'boolean') { seq.autoNext = o.autoNext; }
      }
    } catch (err) {
      // ignore
    }
  }
  function saveSeqOptions() {
    try {
      window.localStorage.setItem(STORAGE_SEQ_KEY, JSON.stringify({
        repeat: seq.repeat, rate: seq.rate, autoNext: seq.autoNext
      }));
    } catch (err) {
      // ignore
    }
  }

  /* ---------- 工具 ---------- */
  function getAudioPayload(key) {
    // 动态 <script> 注入后创建 window.AUDIO_DATA；每次实时读取
    return (window.AUDIO_DATA || {})[key];
  }
  function clearNode(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }
  function makeEl(tag, className, text) {
    var el = document.createElement(tag);
    if (className) {
      el.className = className;
    }
    if (text !== undefined && text !== null) {
      el.textContent = text;
    }
    return el;
  }
  function currentPageObj() {
    return units[currentUnit].pages[currentPage];
  }
  function currentTracks() {
    return currentPageObj().tracks || [];
  }

  /* ---------- 音频：预加载本页 js ---------- */
  function preloadPageAudios(page) {
    if (!page.tracks) {
      return;
    }
    page.tracks.forEach(function (track) {
      if (!track.audio || getAudioPayload(track.audio)) {
        return;
      }
      var script = document.createElement('script');
      script.src = './audio/' + track.audio + '.js';
      script.async = true;
      document.head.appendChild(script);
    });
  }

  function ensureAudioCtx() {
    if (audioCtx) {
      return audioCtx;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      return null;
    }
    audioCtx = new AC();
    return audioCtx;
  }

  function base64ToArrayBuffer(b64) {
    var binary = atob(b64);
    var len = binary.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /* 解码 + 播放单个 track；onEnd 播放完成后回调（顺序模式用） */
  function playAudio(track, onEnd) {
    var payload = getAudioPayload(track.audio);
    if (!payload) {
      // 预加载可能尚未完成：动态补拉一次
      var script = document.createElement('script');
      script.src = './audio/' + track.audio + '.js';
      script.onload = function () {
        playAudio(track, onEnd);
      };
      script.onerror = function () {
        if (onEnd) { onEnd(); }
      };
      document.head.appendChild(script);
      return;
    }
    var ctx = ensureAudioCtx();
    if (!ctx) {
      if (onEnd) { onEnd(); }
      return;
    }
    if (ctx.state === 'suspended' && ctx.resume) {
      try { ctx.resume(); } catch (err) { /* ignore */ }
    }
    var key = track.audio;
    var finish = function (buffer) {
      if (!currentHotspot || currentHotspot.track !== track) {
        // 已被切换/停止
        return;
      }
      var src = ctx.createBufferSource();
      src.buffer = buffer;
      // 变速播放：0.75 / 1 / 1.25 / 1.5（playbackRate 同时改变音高，WebAudio 原生行为）
      src.playbackRate.value = seq.rate;
      src.connect(ctx.destination);
      src.onended = function () {
        // 仅当仍是当前 source 才算播放结束；被 stopSourceOnly 清除后忽略
        if (currentSource !== src) {
          return;
        }
        currentSource = null;
        if (onEnd) {
          onEnd();
        } else {
          stopPlayback();
        }
      };
      currentSource = src;
      src.start(0);
    };
    if (bufferCache[key]) {
      finish(bufferCache[key]);
      return;
    }
    var bytes = base64ToArrayBuffer(payload);
    ctx.decodeAudioData(bytes, function (buffer) {
      bufferCache[key] = buffer;
      finish(buffer);
    }, function () {
      if (onEnd) { onEnd(); }
    });
  }

  /* ---------- 顶栏 ---------- */
  function renderHeader() {
    clearNode(headerEl);
    var titleBox = makeEl('div', 'header-title');
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '点读';
    var sub = makeEl('div', 'header-sub', name);
    brand.appendChild(sub);
    // 版本信息：标题后小字，便于调测
    var ver = APP.meta && APP.meta.version ? APP.meta.version : '';
    if (ver) {
      var verEl = makeEl('span', 'header-ver', 'v' + ver);
      brand.appendChild(verEl);
    }
    titleBox.appendChild(brand);
    headerEl.appendChild(titleBox);

    if (units.length > 1) {
      var tabs = makeEl('div', 'unit-tabs');
      units.forEach(function (unit, index) {
        var tab = makeEl('div', 'unit-tab', unit.title);
        if (index === currentUnit) {
          tab.className = 'unit-tab is-active';
        }
        tab.addEventListener('click', function () {
          if (index === currentUnit) {
            return;
          }
          stopAll();
          currentUnit = index;
          currentPage = 0;
          render();
        });
        tabs.appendChild(tab);
      });
      headerEl.appendChild(tabs);
    }
  }

  /* ---------- 模式切换条 ---------- */
  function renderModeBar() {
    var bar = makeEl('div', 'mode-bar');
    var switchBox = makeEl('div', 'mode-switch');

    var tapBtn = makeEl('div', 'mode-btn' + (mode === 'tap' ? ' is-active' : ''), '点读');
    var seqBtn = makeEl('div', 'mode-btn' + (mode === 'seq' ? ' is-active' : ''), '顺序');

    tapBtn.addEventListener('click', function () {
      if (mode === 'tap') { return; }
      stopAll();
      mode = 'tap';
      saveMode();
      render();
    });
    seqBtn.addEventListener('click', function () {
      if (mode === 'seq') { return; }
      stopAll();
      mode = 'seq';
      saveMode();
      render();
    });

    switchBox.appendChild(tapBtn);
    switchBox.appendChild(seqBtn);
    bar.appendChild(switchBox);
    headerEl.appendChild(bar);
  }

  /* ---------- 主体：页面图 + 热区 ---------- */
  function renderPage() {
    clearNode(pageViewEl);
    var page = currentPageObj();

    var sheet = makeEl('div', 'page-sheet');
    var img = makeEl('img', 'page-img');
    img.alt = 'Page ' + page.no;
    img.src = page.image;
    sheet.appendChild(img);

    if (page.tracks) {
      page.tracks.forEach(function (track) {
        if (typeof track.left !== 'number' || typeof track.top !== 'number' ||
            typeof track.right !== 'number' || typeof track.bottom !== 'number') {
          return;
        }
        var spot = makeEl('div', 'hotspot');
        spot.style.left = (track.left * 100).toFixed(2) + '%';
        spot.style.top = (track.top * 100).toFixed(2) + '%';
        spot.style.width = ((track.right - track.left) * 100).toFixed(2) + '%';
        spot.style.height = ((track.bottom - track.top) * 100).toFixed(2) + '%';
        spot.title = track.text || '';
        spot.addEventListener('click', function () {
          if (mode === 'seq' && seq.running) {
            // 顺序播放中点热区：切回点读并播该句
            stopAll();
            mode = 'tap';
            saveMode();
            render();
          }
          playTrack(spot, track);
        });
        sheet.appendChild(spot);
      });
    }

    pageViewEl.appendChild(sheet);
    bindSwipe(sheet);
    preloadPageAudios(page);
  }

  /* ---------- 触屏滑动翻页 ---------- */
  function bindSwipe(sheet) {
    var startX = 0;
    var startY = 0;
    var startT = 0;
    var swiping = false;
    var SWIPE_THRESHOLD = 48;   // 水平位移阈值（px）
    var SWIPE_TIME = 500;       // 有效滑动时长（ms）

    sheet.addEventListener('pointerdown', function (e) {
      startX = e.clientX;
      startY = e.clientY;
      startT = Date.now();
      swiping = false;
    });
    sheet.addEventListener('pointerup', function (e) {
      if (swiping) {
        return;
      }
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      var dt = Date.now() - startT;
      // 水平位移占优且够长、够快 → 滑动翻页
      if (dt < SWIPE_TIME && Math.abs(dx) > SWIPE_THRESHOLD &&
          Math.abs(dx) > Math.abs(dy) * 1.5) {
        swiping = true;
        e.preventDefault();
        if (dx < 0) {
          turnPage(1);    // 左滑 → 下一页
        } else {
          turnPage(-1);   // 右滑 → 上一页
        }
      }
    });
  }

  function turnPage(delta) {
    var last = units[currentUnit].pages.length - 1;
    var target = currentPage + delta;
    if (target < 0 || target > last) {
      return;   // 边界：停在封面/末页
    }
    stopAll();
    currentPage = target;
    render();
  }

  /* ---------- 底栏：字幕 + 顺序控制 + 翻页 ---------- */
  function renderFooter() {
    clearNode(footerEl);
    var page = currentPageObj();
    var tracks = currentTracks();

    var caption = makeEl('div', 'caption');
    var textEl = makeEl('div', 'caption-text', '');
    var cnEl = makeEl('div', 'caption-cn', '');
    caption.appendChild(textEl);
    caption.appendChild(cnEl);
    footerEl.appendChild(caption);

    // 顺序模式控制条（两行）
    if (mode === 'seq') {
      var ctrl = makeEl('div', 'seq-ctrl');

      // 行1：上一条 / 播放暂停 / 下一条 / 进度
      var row1 = makeEl('div', 'seq-row');
      var prevTrackBtn = makeEl('div', 'ctrl-btn ctrl-nav', '‹ 上一条');
      var playBtn = makeEl('div', 'ctrl-btn ctrl-play', '▶ 播放');
      var nextTrackBtn = makeEl('div', 'ctrl-btn ctrl-nav', '下一条 ›');
      var seqInfo = makeEl('div', 'seq-info', '');

      prevTrackBtn.addEventListener('click', function () {
        seqPrevTrack();
      });
      nextTrackBtn.addEventListener('click', function () {
        seqNextTrack();
      });
      playBtn.addEventListener('click', function () {
        toggleSeqPlay();
      });

      row1.appendChild(prevTrackBtn);
      row1.appendChild(playBtn);
      row1.appendChild(nextTrackBtn);
      row1.appendChild(seqInfo);
      ctrl.appendChild(row1);

      // 行2：重复 / 速度 / 自动连播 / 重听本页
      var row2 = makeEl('div', 'seq-row');
      var repeatBtn = makeEl('div', 'ctrl-btn ctrl-repeat', '重复');
      var speedBtn = makeEl('div', 'ctrl-btn ctrl-speed', '速度');
      var autoNextBtn = makeEl('div', 'ctrl-btn ctrl-autonext', '自动连播');
      var replayBtn = makeEl('div', 'ctrl-btn ctrl-replay', '重听本页');

      repeatBtn.addEventListener('click', function () {
        seq.repeat = !seq.repeat;
        saveSeqOptions();
        updateSeqInfo();
      });
      speedBtn.addEventListener('click', function () {
        cycleSpeed();
      });
      autoNextBtn.addEventListener('click', function () {
        seq.autoNext = !seq.autoNext;
        saveSeqOptions();
        updateSeqInfo();
      });
      replayBtn.addEventListener('click', function () {
        replayPage();
      });

      row2.appendChild(repeatBtn);
      row2.appendChild(speedBtn);
      row2.appendChild(autoNextBtn);
      row2.appendChild(replayBtn);
      ctrl.appendChild(row2);

      footerEl.appendChild(ctrl);
    }

    // 翻页：封面 / 上 / 页码 / 下 / 末页
    var pager = makeEl('div', 'pager');
    var firstBtn = makeEl('div', 'pager-btn pager-btn-short', '封面');
    var prevBtn = makeEl('div', 'pager-btn pager-btn-short', '‹');
    var nextBtn = makeEl('div', 'pager-btn pager-btn-short', '›');
    var lastBtn = makeEl('div', 'pager-btn pager-btn-short', '末页');
    var info = makeEl('div', 'pager-info',
      '第 ' + (currentPage + 1) + ' / ' + units[currentUnit].pages.length + ' 页');

    firstBtn.addEventListener('click', function () {
      if (currentPage !== 0) {
        stopAll();
        currentPage = 0;
        render();
      }
    });
    prevBtn.addEventListener('click', function () {
      if (currentPage > 0) {
        stopAll();
        currentPage -= 1;
        render();
      }
    });
    nextBtn.addEventListener('click', function () {
      if (currentPage < units[currentUnit].pages.length - 1) {
        stopAll();
        currentPage += 1;
        render();
      }
    });
    lastBtn.addEventListener('click', function () {
      var last = units[currentUnit].pages.length - 1;
      if (currentPage !== last) {
        stopAll();
        currentPage = last;
        render();
      }
    });

    pager.appendChild(firstBtn);
    pager.appendChild(prevBtn);
    pager.appendChild(info);
    pager.appendChild(nextBtn);
    pager.appendChild(lastBtn);
    footerEl.appendChild(pager);

    updateCaption(textEl, cnEl);
    updateSeqInfo();
    updatePagerButtons(firstBtn, prevBtn, nextBtn, lastBtn);
  }

  function updatePagerButtons(firstBtn, prevBtn, nextBtn, lastBtn) {
    var last = units[currentUnit].pages.length - 1;
    firstBtn.disabled = currentPage === 0;
    prevBtn.disabled = currentPage === 0;
    nextBtn.disabled = currentPage === last;
    lastBtn.disabled = currentPage === last;
  }

  function updateSeqInfo() {
    if (mode !== 'seq') {
      return;
    }
    var infoEl = footerEl.querySelector('.seq-info');
    var playBtn = footerEl.querySelector('.ctrl-play');
    var repeatBtn = footerEl.querySelector('.ctrl-repeat');
    var speedBtn = footerEl.querySelector('.ctrl-speed');
    var autoNextBtn = footerEl.querySelector('.ctrl-autonext');
    var prevBtn = footerEl.querySelector('.ctrl-nav');
    var nextBtn = footerEl.querySelectorAll('.ctrl-nav')[1];
    if (!infoEl || !playBtn || !repeatBtn || !speedBtn || !autoNextBtn) {
      return;
    }
    var tracks = currentTracks();
    if (!tracks.length) {
      infoEl.textContent = '本页无可播放内容';
      playBtn.textContent = '▶ 播放';
      repeatBtn.textContent = '重复';
      repeatBtn.className = 'ctrl-btn ctrl-repeat';
      speedBtn.textContent = '速度 ' + speedLabel(seq.rate);
      return;
    }
    if (seq.running) {
      infoEl.textContent = '第 ' + (seq.index + 1) + ' / ' + tracks.length + ' 句';
      playBtn.textContent = seq.paused ? '▶ 继续' : '⏸ 暂停';
    } else {
      infoEl.textContent = '共 ' + tracks.length + ' 句';
      playBtn.textContent = '▶ 播放';
    }
    // 重复开关状态
    repeatBtn.textContent = seq.repeat ? '重复 ×2' : '重复 ×1';
    repeatBtn.className = 'ctrl-btn ctrl-repeat' + (seq.repeat ? ' is-on' : '');
    // 速度档位
    speedBtn.textContent = speedLabel(seq.rate);
    speedBtn.className = 'ctrl-btn ctrl-speed' + (seq.rate !== 1 ? ' is-on' : '');
    // 自动连播开关状态
    autoNextBtn.textContent = seq.autoNext ? '自动连播 开' : '自动连播 关';
    autoNextBtn.className = 'ctrl-btn ctrl-autonext' + (seq.autoNext ? ' is-on' : '');
    // 边界：上一条在第一句禁用，下一条在末句禁用（但可重播当前句）
    if (prevBtn) {
      prevBtn.className = 'ctrl-btn ctrl-nav' + (seq.index === 0 ? ' is-disabled' : '');
    }
    if (nextBtn) {
      nextBtn.className = 'ctrl-btn ctrl-nav' +
        (seq.index >= tracks.length - 1 ? ' is-disabled' : '');
    }
  }

  function speedLabel(rate) {
    if (rate === 0.75) { return '0.75× 慢'; }
    if (rate === 1.25) { return '1.25× 快'; }
    if (rate === 1.5) { return '1.5× 较快'; }
    return '1× 正常';
  }

  function updateCaption(textEl, cnEl) {
    var track = getCurrentTrack();
    if (track) {
      textEl.textContent = track.text || '';
      cnEl.textContent = track.cn || '';
    } else {
      textEl.textContent = '点击课文区域试听';
      cnEl.textContent = '';
    }
  }

  function getCurrentTrack() {
    var tracks = currentTracks();
    if (!tracks.length || !currentHotspot) {
      return null;
    }
    var idx = tracks.indexOf(currentHotspot.track);
    return idx >= 0 ? tracks[idx] : null;
  }

  function refreshCaption() {
    var caption = footerEl.querySelector('.caption');
    if (!caption) {
      return;
    }
    var textEl = caption.querySelector('.caption-text');
    var cnEl = caption.querySelector('.caption-cn');
    if (textEl && cnEl) {
      updateCaption(textEl, cnEl);
    }
  }

  /* 临时提示（如播放完毕提示），2s 后恢复字幕 */
  function flashCaption(msg) {
    var caption = footerEl.querySelector('.caption');
    if (!caption) {
      return;
    }
    var textEl = caption.querySelector('.caption-text');
    var cnEl = caption.querySelector('.caption-cn');
    if (!textEl || !cnEl) {
      return;
    }
    textEl.textContent = msg;
    cnEl.textContent = '';
    window.setTimeout(function () {
      refreshCaption();
    }, 2000);
  }

  /* ---------- 点读 ---------- */
  function playTrack(spot, track) {
    if (!track.audio) {
      return;
    }
    stopPlayback();
    spot.className = 'hotspot is-playing';
    currentHotspot = { spot: spot, track: track };
    refreshCaption();
    playAudio(track, null);
  }

  /* 清理页面内所有高亮热区（顺序播放自动切句时旧高亮可能残留） */
  function clearAllHotspots() {
    var spots = pageViewEl.querySelectorAll('.hotspot.is-playing');
    for (var i = 0; i < spots.length; i++) {
      spots[i].className = 'hotspot';
    }
    currentHotspot = null;
  }

  /* ---------- 顺序播放 ---------- */
  function startSequence() {
    var tracks = currentTracks();
    if (!tracks.length) {
      return;
    }
    stopPlayback();
    seq.running = true;
    seq.paused = false;
    seq.offset = 0;
    seq.index = 0;
    seq.pageNo = currentPage;
    updateSeqInfo();
    playSeqNext();
  }

  function playSeqNext() {
    if (!seq.running || seq.pageNo !== currentPage || mode !== 'seq') {
      return;
    }
    var tracks = currentTracks();
    if (seq.index >= tracks.length) {
      // 本页播放完毕
      finishSequence();
      return;
    }
    var track = tracks[seq.index];
    var spot = findSpotForTrack(track);
    stopSourceOnly();
    clearAllHotspots();   // 自动切句：清掉上一句高亮
    if (spot) {
      spot.className = 'hotspot is-playing';
      currentHotspot = { spot: spot, track: track };
    }
    refreshCaption();
    updateSeqInfo();
    playAudio(track, function () {
      if (!seq.running || seq.paused || seq.pageNo !== currentPage) {
        return;
      }
      // 重复模式：每条播两遍后再进下一条
      if (seq.repeat && seq.playCount < 1) {
        seq.playCount += 1;
        playSeqNext();
        return;
      }
      seq.playCount = 0;
      seq.index += 1;
      playSeqNext();
    });
  }

  function seqPrevTrack() {
    if (mode !== 'seq') {
      return;
    }
    var tracks = currentTracks();
    if (!tracks.length) {
      return;
    }
    stopSourceOnly();
    clearHotspot();
    seq.running = true;
    seq.paused = false;
    seq.pageNo = currentPage;
    seq.playCount = 0;
    if (seq.index > 0) {
      seq.index -= 1;
    }
    updateSeqInfo();
    playSeqNext();
  }

  function seqNextTrack() {
    if (mode !== 'seq') {
      return;
    }
    var tracks = currentTracks();
    if (!tracks.length) {
      return;
    }
    stopSourceOnly();
    clearHotspot();
    seq.running = true;
    seq.paused = false;
    seq.pageNo = currentPage;
    seq.playCount = 0;
    if (seq.index < tracks.length - 1) {
      seq.index += 1;
    }
    updateSeqInfo();
    playSeqNext();
  }

  function cycleSpeed() {
    var rates = [0.75, 1, 1.25, 1.5];
    var i = rates.indexOf(seq.rate);
    seq.rate = rates[(i + 1) % rates.length];
    saveSeqOptions();
    updateSeqInfo();
  }

  function findSpotForTrack(track) {
    var spots = pageViewEl.querySelectorAll('.hotspot');
    for (var i = 0; i < spots.length; i++) {
      if (spots[i].title === (track.text || '')) {
        return spots[i];
      }
    }
    return null;
  }

  function pauseSequence() {
    if (!seq.running || !currentSource) {
      return;
    }
    try {
      currentSource.stop();
    } catch (err) {
      // ignore
    }
    seq.paused = true;
    currentSource = null;
    updateSeqInfo();
  }

  function resumeSequence() {
    if (!seq.running || !seq.paused) {
      return;
    }
    seq.paused = false;
    updateSeqInfo();
    // 从当前句重头播放（offset 精度简化：单句重播）
    playSeqNext();
  }

  function toggleSeqPlay() {
    if (seq.running && seq.paused) {
      resumeSequence();
    } else if (seq.running) {
      pauseSequence();
    } else {
      startSequence();
    }
  }

  function replayPage() {
    if (mode !== 'seq') {
      return;
    }
    seq.running = true;
    seq.paused = false;
    seq.offset = 0;
    seq.index = 0;
    seq.pageNo = currentPage;
    stopSourceOnly();
    updateSeqInfo();
    playSeqNext();
  }

  function finishSequence() {
    seq.running = false;
    seq.paused = false;
    stopSourceOnly();
    clearAllHotspots();
    refreshCaption();
    updateSeqInfo();
    // 本页播放完：自动连播开启且非末页 → 自动翻页继续；否则停在页尾提示
    var last = units[currentUnit].pages.length - 1;
    if (seq.autoNext && currentPage < last) {
      currentPage += 1;
      render();
      startSequence();
    } else if (currentPage >= last) {
      flashCaption('已播放到最后一页');
    } else {
      flashCaption('本页播放完毕，可翻页继续');
    }
  }

  /* ---------- 停止 ---------- */
  function stopSourceOnly() {
    if (currentSource) {
      try {
        currentSource.stop();
      } catch (err) {
        // ignore
      }
      currentSource.disconnect();
      currentSource = null;
    }
  }

  function clearHotspot() {
    if (currentHotspot) {
      currentHotspot.spot.className = 'hotspot';
      currentHotspot = null;
    }
  }

  function stopPlayback() {
    stopSourceOnly();
    clearHotspot();
    refreshCaption();
  }

  function stopAll() {
    seq.running = false;
    seq.paused = false;
    stopPlayback();
  }

  /* ---------- 渲染入口 ---------- */
  function render() {
    document.title = (APP.meta && APP.meta.name) || '点读';
    renderHeader();
    renderModeBar();
    renderPage();
    renderFooter();
  }

  /* 容器注入安全区变量时同步 --app-height */
  function syncAppHeight() {
    var docEl = document.documentElement;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    docEl.style.setProperty('--app-height', vh + 'px');
  }

  if (window.addEventListener) {
    window.addEventListener('resize', function () {
      syncAppHeight();
    });
  }

  loadMode();
  loadSeqOptions();
  syncAppHeight();
  render();
})();
