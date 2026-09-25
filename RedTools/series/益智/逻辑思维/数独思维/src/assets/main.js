/* ============================================================
   数独思维 — 主逻辑（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   数据：window.SUDOKU（solver.js 注入，数独核心算法）
        window.APP_DATA（data.js 注入，build 生成 meta，可缺失）
   玩法：点选空格 → 底部数字条点数字填数（非九宫格，低龄友好）
         - 合法（行/列/宫不冲突）：绿色确认，静默接受（答错不惩罚）
         - 不合法（冲突）：红闪 400ms + 温和提示，错误计数 +1
          工具：橡皮（清选中格）/ 撤销（恢复上一步）/ 提示（提示一次，星级封顶 2★）
          全部填满且无冲突即过关。
v1.6：提示带讲解 + 次数限制（4×4 不限 / 6×6 限 3 / 9×9 限 2）；
          错题本（通关/退出自动记录，可回放重练）与收藏本（通关后可收藏）
    v1.7：分享题（题目文本导出/导入 + 打印图片）；导入题不计成绩
    v1.7.1：分享成绩（1080×1920 成绩卡图片 + 分享文案；无竞技对比，仅展示自
          身表现——核心原则无竞技无排行）
    v1.9：家长报告（今日反馈 / 近 7 天 / 技巧掌握度，数据只存本地不上传）
          + 9×9 小屏适配（窄屏缩字号 + 竖屏横屏提示一次；双指缩放 P2 不做）
    v1.10：自由解题（进阶技巧教学：唯一余数 / X-Wing，独立 advSkills 徽章，不吹适龄
          徽章）+ E5 自适应难度（连败两局自动建议降档，不扣分）
    v1.11：分享题二维码（微信长按识别导入；qrcode.js MIT 内嵌，UTF-8 编码中文）
          + 双指缩放棋盘（E4 P2 捏合缩放 + 1:1 复位按钮）
    v1.12：每日挑战（当日种子同题，solver.js 零改动——Math.random 注入）+ 成就系统
          （X3：6 枚个人里程碑，无竞技无排行）
    v1.13：闯关地图（X1：3 档难度 × 每档 3 关线性推进，复用 seed 基建同关同题；
          无竞技，纯个人进度推进）
    v1.14：设置面板（🔊 音效开关 / 🗑️ 清除本地进度 / ℹ️ 关于；数据只存本机）
    v1.15：更名「数独思维」（教育语境，避免「侦探」游戏感误会；成就/闯关称号同步
          中性化：十局小达人 / 思维高手）
    v1.16：家长报告成长进度卡（每日挑战/成就/闯关地图进度，全派生零 schema）
    v1.17：每日挑战难度轮换（周1/2 简单→周3-5 普通→周6 困难→周日普通）+ 成就
          扩充 2 枚（闯关地图通关 / 月度坚持，6 → 8 枚）
    v1.18：闯关×技巧徽章联动（每关 skill 字段，实战点亮 + 进阶关前置掌握门槛）
          + 成就扩充 2 枚（闯关达人 / 小小收藏家，8 → 10 枚）+ 每日挑战 streak 卡
    星级：hints===0 && errors===0 → 3★；hints<=1 && errors<=3 → 2★；否则 1★
   难度：双参数（盘面尺寸 × 目标已知格）4×4→10、6×6→21、9×9→33
   设计约束（对齐 series/益智/设计文档.md §5）：
   - 不使用 import/export / type="module"
   - 不超出 ES2017（无 ?. ?? 对象展开 replaceAll 等）；var + function 风格
   - 事件全部 addEventListener，无内联事件 / eval
   - 无 fetch/XHR/Worker；localStorage 读写 try/catch
   - 音效：Web Audio OscillatorNode 合成（无音频文件，合规）
   - 计时：performance.now() + setInterval(100ms) 按差值刷新（§4.1），
     从游戏页渲染开始计时（数独为长时任务，按整局计时）
   - 成绩/打卡：localStorage key 带工具前缀 redtools.shudurumen.v1
   ============================================================ */
(function () {
  'use strict';

  var APP = window.APP_DATA || { meta: {} };
  var SUDOKU = window.SUDOKU || null;

  /* ---------- DOM ---------- */
  var headerEl = document.getElementById('app-header');
  var viewEl = document.getElementById('view');
  var footerEl = document.getElementById('app-footer');
  var timerEl = null;
  var errorsEl = null;
  var overlayEl = null;
  var hintBtnEl = null;
  var hint9Shown = false;   // v1.9 E4：9×9 竖屏「建议横屏」提示是否已显示（一次性，不存 localStorage）
  var penBtnEl = null;
  var cellEls = [];   // 棋盘格子外层 DOM（按格下标索引）

  /* ---------- 难度定义（盘面尺寸 N × 目标已知格 givens） ---------- */
  var LEVELS = [
    { key: '4', name: '简单', N: 4, givens: 10 },
    { key: '6', name: '普通', N: 6, givens: 21 },
    { key: '9', name: '困难', N: 9, givens: 33 }
  ];
  var suggestedName = null; // E5 自适应难度（v1.10）：最近两局连败 → 建议降档档名；非持久化，进入任一局即清除
  // 闯关地图（v1.13 X1）：3 档难度 × 每档 3 关 = 9 关线性推进；seedBase 固定 → 同关同题（可复玩）
var MAP_LEVELS = [
    // v1.18：skill 字段映射到真实 SKILLS key（base 用 boxElim/rowColElim/blockElim/crossElim，adv 用 uniqueElim/xwing）
    { i: 0, name: '1-1', levelKey: '4', seedBase: 10001, tip: '简单 4×4 · 初试身手', skill: 'boxElim' },
    { i: 1, name: '1-2', levelKey: '4', seedBase: 10002, tip: '简单 4×4 · 小有心得', skill: 'boxElim' },
    { i: 2, name: '1-3', levelKey: '4', seedBase: 10003, tip: '简单 4×4 · 轻松过关', skill: 'boxElim' },
    { i: 3, name: '2-1', levelKey: '6', seedBase: 20001, tip: '普通 6×6 · 更进一步', skill: 'rowColElim' },
    { i: 4, name: '2-2', levelKey: '6', seedBase: 20002, tip: '普通 6×6 · 渐入佳境', skill: 'rowColElim' },
    { i: 5, name: '2-3', levelKey: '6', seedBase: 20003, tip: '普通 6×6 · 游刃有余', skill: 'blockElim' },
    { i: 6, name: '3-1', levelKey: '9', seedBase: 30001, tip: '困难 9×9 · 挑战自我', skill: 'crossElim' },
    { i: 7, name: '3-2', levelKey: '9', seedBase: 30002, tip: '困难 9×9 · 勇往直前', skill: 'uniqueElim' },
    { i: 8, name: '3-3', levelKey: '9', seedBase: 30003, tip: '困难 9×9 · 思维高手', skill: 'xwing' }
  ];
  var pinchScale = 1;        // v1.11 双指缩放：当前缩放（1 = 原始）
  var pinchActive = false;   // 双指捏合进行中
  var pinchStartDist = 0;    // 捏合起始两指距离
  var pinchStartScale = 1;   // 捏合起始缩放
  var zoomResetBtnEl = null; // 棋盘上方「1:1 复位」按钮 DOM（pinchScale>1 时显示）
  var soundEnabled = true;   // v1.14 全局音效开关（tone 总出口拦截；启动时从 store.settings.sound 同步）

  /* ---------- 状态 ---------- */
  var state = {
    level: '4',
    N: 4,
    givens: 10,
    givensCount: 0,   // 本局实际已知格数（genPuzzle 结果可在 [givens, givens+4]）
    puzzle: [],       // 当前盘面（0 = 空格）
    given: [],        // 是否题目已知格（不可编辑）
    solution: [],
    selected: -1,     // 当前选中格下标（-1 = 无）
    hints: 0,         // 提示次数（用提示星级封顶 2★）
    errors: 0,        // 冲突次数（非法落子）
    pencils: [],      // 候选笔记（铅笔模式）：每个空格一个数组，存该格候选数字（升序）
    penMode: false,   // 是否铅笔（候选笔记）模式
    undoStack: [],    // 撤销栈 [{ i, val, pen }]（含提示/橡皮入栈；pen=true 表示本步操作作用在笔记上）
    won: false,
    playing: false,   // 是否在游戏页（实体键盘仅游戏页响应）
    startMs: 0,
    ms: 0,
    timerId: 0,
    origPuzzle: null, // 原始盘面快照（v1.6）：本局题目初始盘面，永不随填数变化；旧版断局恢复时为 null（不追踪错题）
    errLog: [],       // 本局冲突记录（v1.6）：[{idx, wrong}] 填错的位置与数字，错题本/回放标记用
    hintIdx: [],      // 本局提示过的格子下标（v1.6）：错题记录用
    errMarks: null,   // 回放标记（v1.6）：错题本回放时上次填错的位置（下标数组），普通局为 null
    hintExpl: null,   // 提示讲解（v1.6）：{kind,i,hl,have,miss}，3 秒后或下次操作清除
    replayFrom: null, // 回放来源（v1.6）：'mistake' 错题本 / 'favorite' 收藏本 / null 普通局
    replayMsgShown: false, // v1.6：错题回放提示行是否已显示（仅首次进入提示）
    createdFrom: 'normal', // 题目来源（v1.7）：'normal' 普通局（含回放，正常计成绩）/ 'import' 导入题（不计成绩、不打卡）
    isDaily: false,        // 每日挑战局标记（v1.12）：顶栏追加「· 每日题」，通关记 store.daily
    fromMap: -1            // 闯关地图关卡序号（v1.13）：-1 = 非闯关关；>=0 顶栏追加「· 关卡 X-Y」，通关记 mapProgress
  };

  /* ---------- 持久化（redtools.shudurumen.v1） ---------- */
  var STORE_KEY = 'redtools.shudurumen.v1';
  LX_SHARED.storage.configure({ toolName: 'shudurumen' });  // V0.4 迁移：键前缀 redtools.shudurumen.v1
  function defaultStore() {
    return {
      version: 1,
      best: {},                     // { "4": {ms,errors,hints,stars,date}, ... }
      recent: {},                   // 各难度最近用时 ms
      checkin: { dates: [], streak: 0 },
      history: [],                  // 滚动 30 条 {date,level,ms,errors,hints,stars}
      skills: {},                   // 技巧徽章（v1.4）：{ boxElim: true, ... } 教学关完成点亮
      advSkills: {},                // 进阶技巧徽章（v1.10）：{ uniqueElim: true, xwing: true } 独立于 base skills，零迁移
      mistakes: [],                 // 错题本（v1.6）：[{id,ts,level,board,solution,errors,hintIdx,result,stars}] 通关/中途退出记录，上限 50 条
      favorites: [],                // 收藏本（v1.6）：[{id,ts,level,board,solution}] 通关后可收藏的想再练题目
      daily: null,                  // 每日挑战完成记录（v1.12）：{ date:'YYYYMMDD', level:'6' }；未完成 null
      achievements: {},             // 成就解锁（v1.12）：{ key: 'YYYYMMDD' }（6 枚个人里程碑，无竞技）
      mapProgress: { completed: [] }, // 闯关地图进度（v1.13）：{ completed:[i,...] } 已完成关卡序号（线性按序）
      settings: { sound: true },        // 设置（v1.14）：{ sound: true } 全局音效开关
      cur: null                     // 断局快照（v1.2）：未完成（level,N,givensCount,puzzle,solution,given,pencils,undoStack,hints,errors,selected,penMode,ms,startStamp,origPuzzle)
    };
  }
  function loadStore() {
    try {
      var raw = LX_SHARED.storage.get('v1');
      if (raw) {
        var obj = raw;
        if (obj && obj.version === 1) {
          if (!obj.best) { obj.best = {}; }
          if (!obj.recent) { obj.recent = {}; }
          if (!obj.checkin) { obj.checkin = { dates: [], streak: 0 }; }
          if (!obj.history) { obj.history = []; }
          if (!obj.skills) { obj.skills = {}; }
          if (!obj.advSkills) { obj.advSkills = {}; } // v1.10：旧存档无进阶徽章字段 → 补空
          if (!obj.mistakes) { obj.mistakes = []; }   // v1.6：旧存档无错题本字段 → 补空
          if (!obj.favorites) { obj.favorites = []; } // v1.6：旧存档无收藏本字段 → 补空
          if (!('daily' in obj)) { obj.daily = null; } // v1.12：用 in 检查（null 也是合法值）
          if (!obj.achievements) { obj.achievements = {}; } // v1.12：旧存档无成就字段 → 补空
          if (!obj.mapProgress) { obj.mapProgress = { completed: [] }; } // v1.13：旧存档无闯关进度 → 补空
          if (!obj.mapProgress.completed) { obj.mapProgress.completed = []; } // 防 completed 缺失
          if (!obj.settings) { obj.settings = { sound: true }; } // v1.14：旧存档无设置 → 补默认（音效开）
          if (!obj.cur) { obj.cur = null; }
          if (obj.history.length > 30) { obj.history = obj.history.slice(-30); }
          return obj;
        }
      }
    } catch (err) { /* ignore */ }
    return defaultStore();
  }
  function saveStore() {
    try {
      LX_SHARED.storage.set('v1', store);
    } catch (err) { /* ignore */ }
  }
  var store = loadStore();
  saveStore(); // 初始化写入
  soundEnabled = !!store.settings.sound; // v1.14：启动时从存档同步音效开关（首次渲染前）

  /* ---------- 断局恢复（v1.2）：state 快照 ↔ store.cur ---------- */
  function saveCur() {
    if (state.won) { return; } // 已通关：不覆盖断局快照（onWin 已 clearCur）
    // 计时基线冻结：state.ms 存累计毫秒，startStamp 记录本次落盘时间点，恢复时续算
    state.ms = performance.now() - state.startMs;
    var pens = [];
    var i;
    for (i = 0; i < state.pencils.length; i++) { pens.push(state.pencils[i].slice()); }
    var undos = [];
    for (i = 0; i < state.undoStack.length; i++) {
      undos.push({ i: state.undoStack[i].i, val: state.undoStack[i].val,
                   pen: state.undoStack[i].pen ? state.undoStack[i].pen.slice() : null });
    }
    store.cur = {
      level: state.level, N: state.N, givens: state.givens, givensCount: state.givensCount,
      puzzle: state.puzzle.slice(), solution: state.solution.slice(), given: state.given.slice(),
      pencils: pens, undoStack: undos,
      hints: state.hints, errors: state.errors, selected: state.selected,
      penMode: state.penMode, won: false,
      origPuzzle: state.origPuzzle, // v1.6：原始盘面快照（断局恢复后仍可追踪错题）
      ms: state.ms, startStamp: Date.now()
    };
    saveStore();
  }
  function clearCur() {
    if (store.cur) { store.cur = null; saveStore(); }
  }
  function countFilled(cur) {
    var c = 0;
    var i;
    for (i = 0; i < cur.puzzle.length; i++) {
      if (cur.puzzle[i] !== 0 && !cur.given[i]) { c++; }
    }
    return c;
  }
  function isValidCur(cur) {
    if (!cur || typeof cur !== 'object') { return false; }
    var N = cur.N;
    if (N !== 4 && N !== 6 && N !== 9) { return false; }
    var size = N * N;
    if (!cur.puzzle || cur.puzzle.length !== size) { return false; }
    if (!cur.solution || cur.solution.length !== size) { return false; }
    if (!cur.given || cur.given.length !== size) { return false; }
    if (!cur.pencils || cur.pencils.length !== size) { return false; }
    if (!Array.isArray(cur.undoStack)) { return false; }
    if (typeof cur.hints !== 'number' || typeof cur.errors !== 'number') { return false; }
    if (typeof cur.ms !== 'number' || typeof cur.startStamp !== 'number') { return false; }
    return true;
  }
  function restoreCur() {
    var cur = store.cur;
    if (!isValidCur(cur)) { clearCur(); return false; }
    state.level = cur.level;
    state.N = cur.N;
    state.givens = cur.givens;
    state.givensCount = cur.givensCount;
    state.puzzle = cur.puzzle.slice();
    state.solution = cur.solution.slice();
    state.given = cur.given.slice();
    var pens = [];
    var i;
    for (i = 0; i < cur.pencils.length; i++) { pens.push(cur.pencils[i].slice()); }
    state.pencils = pens;
    var undos = [];
    for (i = 0; i < cur.undoStack.length; i++) {
      undos.push({ i: cur.undoStack[i].i, val: cur.undoStack[i].val,
                   pen: cur.undoStack[i].pen ? cur.undoStack[i].pen.slice() : null });
    }
    state.undoStack = undos;
    state.hints = cur.hints;
    state.errors = cur.errors;
    state.selected = cur.selected;
    state.penMode = cur.penMode;
    state.won = false;
    state.playing = true;
    // 计时续算：从保存点继续（startMs 重置为「当前时刻 - 已累计」）
    state.ms = cur.ms;
    state.startMs = performance.now() - cur.ms;
    return true;
  }

  /* ---------- 工具函数 ---------- */
  function clearNode(node) {
    while (node.firstChild) { node.removeChild(node.firstChild); }
  }
  function makeEl(tag, className, text) {
    var el = document.createElement(tag);
    if (className) { el.className = className; }
    if (text !== undefined && text !== null) { el.textContent = text; }
    return el;
  }
  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtDate(d) {
    return '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
  }
  function calcStreak(dates) {
    return LX_SHARED.progress.streak(dates);
}
  function fmtTime(ms) {
    // 秒 + 1 位小数，如 07.5
    var sec = Math.max(0, ms) / 1000;
    var t = Math.floor(sec);
    var d = Math.floor((sec - t) * 10);
    return (t < 10 ? '0' + t : '' + t) + '.' + d;
  }
  function fmtBestTime(ms) {
    // 分:秒，如 01:23
    var total = Math.max(0, Math.round(ms / 1000));
    var m = Math.floor(total / 60);
    var s = total % 60;
    return (m < 10 ? '0' + m : '' + m) + ':' + (s < 10 ? '0' + s : '' + s);
  }
  function findLevel(key) {
    var i;
    for (i = 0; i < LEVELS.length; i++) {
      if (LEVELS[i].key === key) { return LEVELS[i]; }
    }
    return LEVELS[0];
  }
  function mulberry32(a) {
    // v1.12：标准种子 PRNG（Chrome 28+ 支持 Math.imul）——每日挑战用固定种子生成同题
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function dailySeed() {
    // v1.12：当日整数种子（YYYYMMDD → int）——同一天同 seed → 每日挑战同题；跨天换题
    return parseInt(fmtDate(new Date()), 10);
  }
  // 每日挑战难度轮换（v1.17）：按星期（JS getDay(): 0=周日..6=周六）
  // 周一/周二 4×4 简单轻松起步 → 周三至周五 6×6 普通 → 周六 9×9 周末挑战 → 周日 6×6 收尾
  var DAILY_DIFFS = ['6', '4', '4', '6', '6', '6', '9'];
  /* 格子列宽/格内字体按盘面尺寸 */
  function colPct(n) {
    if (n === 4) { return '25%'; }
    if (n === 6) { return '16.6667%'; }
    return '11.1111%'; // 9
  }
  function cellFont(n) {
    if (n === 4) { return '30px'; }
    if (n === 6) { return '22px'; }
    return '16px'; // 9×9 保持可读（>=14px）
  }

  /* ---------- 音效（Web Audio 合成，同分类整理/迷宫寻路） ---------- */
  var actx = null;
  function ensureAudio() {
    try {
      if (!actx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) { actx = new AC(); }
      }
      if (actx && actx.state === 'suspended') { actx.resume(); }
    } catch (err) { /* ignore */ }
    return actx;
  }
  function tone(freq, dur, type, vol, delay) {
    if (!soundEnabled) { return; } // v1.14：全局音效开关（sndClick/sndCorrect/sndWrong/sndWin 唯一发声出口拦截）
    var ac = ensureAudio();
    if (!ac) { return; }
    try {
      var t0 = ac.currentTime + (delay || 0);
      var osc = ac.createOscillator();
      var g = ac.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(vol || 0.1, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (err) { /* ignore */ }
  }
  function sndClick() { tone(520, 0.05, 'triangle', 0.05, 0); }
  function sndCorrect() { tone(660, 0.08, 'sine', 0.1, 0); tone(990, 0.12, 'sine', 0.1, 0.09); }
  function sndWrong() { tone(165, 0.16, 'square', 0.05, 0); }
  function sndWin() {
    tone(523, 0.12, 'sine', 0.11, 0);
    tone(659, 0.12, 'sine', 0.11, 0.12);
    tone(784, 0.12, 'sine', 0.11, 0.24);
    tone(1047, 0.24, 'sine', 0.11, 0.36);
  }

  /* ---------- 计时 ---------- */
  function startTimer() {
    stopTimer();
    // 断局恢复续算：若已有累计 ms（restoreCur 设置），startMs 以累计值为基线；
    // 否则从当前时刻起算（新局）
    if (state.ms > 0) {
      state.startMs = performance.now() - state.ms;
    } else {
      state.startMs = performance.now();
    }
    state.timerId = setInterval(function () {
      if (!state.won && timerEl) {
        timerEl.textContent = '⏱ ' + fmtTime(performance.now() - state.startMs);
      }
    }, 100);
  }
  function stopTimer() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = 0; }
  }
  function updateTimerUI() {
    if (timerEl) { timerEl.textContent = '⏱ ' + fmtTime(state.won ? state.ms : 0); }
  }

  /* ---------- 渲染：头部 / 页脚 ---------- */
  function renderHeader(title) {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
    var name = APP.meta && APP.meta.name ? APP.meta.name : '数独思维';
    brand.appendChild(makeEl('span', 'header-title', title || name));
    if (APP.meta && APP.meta.version) {
      brand.appendChild(makeEl('span', 'header-ver', 'v' + APP.meta.version));
    }
    headerEl.appendChild(brand);
  }
  function renderHomeFooter() {
    clearNode(footerEl);
    var streak = store.checkin && store.checkin.streak ? store.checkin.streak : 0;
    var btn = makeEl('button', 'btn-checkin', '📅 打卡日历 · 连续 ' + streak + ' 天');
    btn.setAttribute('aria-label', '打开打卡日历');
    btn.addEventListener('click', showCheckinView);
    footerEl.appendChild(btn);
  }
  function renderGameFooter() {
    clearNode(footerEl);
    var bar = makeEl('div', 'game-footer');
    var btnBack = makeEl('button', 'btn-ghost-sm', '返回难度');
    btnBack.setAttribute('aria-label', '返回难度选择');
    btnBack.addEventListener('click', backToDifficulty);
    var btnRestart = makeEl('button', 'btn-ghost-sm', '重新开始');
    btnRestart.setAttribute('aria-label', '重新开始本局');
    btnRestart.addEventListener('click', function () { restartRound(); });
    errorsEl = makeEl('span', 'footer-errors', '❌ ' + state.errors);
    bar.appendChild(btnBack);
    bar.appendChild(btnRestart);
    bar.appendChild(errorsEl);
    footerEl.appendChild(bar);
  }
  function updateErrorsUI() {
    if (errorsEl) { errorsEl.textContent = '❌ ' + state.errors; }
  }

  /* ---------- 棋盘：正方形格子（width+padding-bottom %）+ 宫界线 ---------- */
  function sameBox(i, j, n) {
    var dims = SUDOKU.boxDims(n);
    var br = dims[0];
    var bc = dims[1];
    var ri = Math.floor(i / n), ci = i % n;
    var rj = Math.floor(j / n), cj = j % n;
    return Math.floor(ri / br) === Math.floor(rj / br) && Math.floor(ci / bc) === Math.floor(cj / bc);
  }
  /* 候选数字是否与当前行/列/宫冲突（用于铅笔笔记标红校验） */
  function penConflict(i, v) {
    var n = state.N;
    var r = Math.floor(i / n);
    var c = i % n;
    var j, rr, cc;
    for (j = 0; j < n * n; j++) {
      if (j === i) { continue; }
      rr = Math.floor(j / n);
      cc = j % n;
      if (state.puzzle[j] !== v) { continue; }   // 只看已填数字
      if (rr === r || cc === c || sameBox(i, j, n)) { return true; }
    }
    return false;
  }
  /* 铅笔模式：单元内删除候选数字（自动铅笔：落定/提示后同步清理） */
  function erasePenInUnit(i, v) {
    var n = state.N;
    if (i < 0 || i >= n * n) { return; }
    var r = Math.floor(i / n);
    var c = i % n;
    for (var k = 0; k < n * n; k++) {
      if (k === i) { continue; }
      var kr = Math.floor(k / n);
      var kc = k % n;
      var inSame = (kr === r || kc === c || sameBox(k, i, n));
      if (!inSame) { continue; }
      var pen = state.pencils[k];
      if (pen) {
        var idx = pen.indexOf(v);
        if (idx !== -1) {
          pen.splice(idx, 1);
        }
      }
    }
  }
  function innerClass(i) {
    var n = state.N;
    var r = Math.floor(i / n);
    var c = i % n;
    var cls = 'cell-inner';
    if (state.given[i]) { cls += ' given'; }
    else if (state.puzzle[i] !== 0) { cls += ' user'; }
    if (i === state.selected) {
      cls += ' selected';
    } else if (state.selected >= 0) {
      var sr = Math.floor(state.selected / n);
      var sc = state.selected % n;
      if (r === sr || c === sc || sameBox(i, state.selected, n)) { cls += ' peer'; }
      if (state.puzzle[state.selected] !== 0 && state.puzzle[i] === state.puzzle[state.selected]) {
        cls += ' same';
      }
    }
    // v1.6：提示讲解高亮（复用 peer 浅蓝教学色）
    if (state.hintExpl && state.hintExpl.hl && state.hintExpl.hl.indexOf(i) >= 0) { cls += ' peer'; }
    // v1.6：错题回放标记（浅红，不计入错误）
    if (state.errMarks && state.errMarks.indexOf(i) >= 0) { cls += ' replay-mark'; }
    return cls;
  }
  function cellInner(i) {
    var cell = cellEls[i];
    if (!cell) { return null; }
    return cell.querySelector('.cell-inner');
  }
  function buildNoteGrid(n) {
    // 构建候选笔记网格：每个候选数字 1..N 一个槽（最多 9 个），flex-wrap 自动排布
    var grid = document.createElement('div');
    grid.className = 'cell-note';
    for (var d = 1; d <= n; d++) {
      var slot = document.createElement('span');
      slot.className = 'note-slot';
      slot.setAttribute('data-v', '' + d);
      grid.appendChild(slot);
    }
    return grid;
  }
  function refreshInner(i) {
    var inner = cellInner(i);
    if (!inner) { return; }
    inner.className = innerClass(i);
    var val = state.puzzle[i];
    var note = state.pencils[i];
    // 先清空（保持结构：值 or 笔记网格）
    clearNode(inner);
    if (val !== 0) {
      inner.appendChild(document.createTextNode('' + val));
    } else if (note && note.length) {
      var grid = buildNoteGrid(state.N);
      var slots = grid.childNodes;
      var k;
      for (k = 0; k < slots.length; k++) {
        var d = Number(slots[k].getAttribute('data-v'));
        slots[k].textContent = '' + d;
        if (note.indexOf(d) !== -1) { slots[k].className = 'note-slot on'; }
      }
      inner.appendChild(grid);
    }
  }
  function refreshCells() {
    for (var i = 0; i < state.N * state.N; i++) { refreshInner(i); }
  }
  function flashOk(i) {
    var inner = cellInner(i);
    if (!inner) { return; }
    inner.className = inner.className + ' ok';
    window.setTimeout(function () { if (inner.className) { inner.className = inner.className.replace(' ok', ''); } }, 300);
  }
  function flashWrong(i) {
    var inner = cellInner(i);
    if (!inner) { return; }
    inner.className = inner.className + ' wrong';
    window.setTimeout(function () { if (inner.className) { inner.className = inner.className.replace(' wrong', ''); } }, 400);
  }
  function showMsg(text, warn) {
    var m = document.getElementById('sudoku-msg');
    if (!m) { return; }
    m.textContent = text || ' ';
    m.className = 'sudoku-msg' + (warn ? ' warn' : '');
  }
  function countEmpty() {
    var c = 0;
    for (var i = 0; i < state.puzzle.length; i++) {
      if (state.puzzle[i] === 0) { c++; }
    }
    return c;
  }
  function checkHintBtn() {
    if (!hintBtnEl) { return; }
    // v1.6：盘面填满或提示次数达上限时禁用（4×4 不限；6×6 限 3；9×9 限 2）
    var limitReached = (state.N === 6 && state.hints >= 3) || (state.N === 9 && state.hints >= 2);
    hintBtnEl.disabled = (countEmpty() === 0) || limitReached;
    if (limitReached) { hintBtnEl.title = '本局提示次数已用完'; }
  }
  /* ---------- 双指缩放棋盘（v1.11 E4 P2）：捏合缩放 + 1:1 复位 ---------- */
  function pinchDist(a, b) {
    // 两触点距离（Chrome 38+ 支持 Math.hypot）
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }
  function applyBoardZoom(el) {
    // 缩放 1 时清空 transform（原始大小），否则应用 scale（transform 不改变布局，命中测试仍落到各 .cell）
    el.style.transform = pinchScale > 1 ? 'scale(' + pinchScale + ')' : '';
  }
  function updateZoomResetBtn() {
    // pinchScale>1 时显示「1:1 复位」按钮，否则隐藏
    if (zoomResetBtnEl) {
      zoomResetBtnEl.style.display = (pinchScale > 1) ? 'block' : 'none';
    }
  }
  function resetBoardZoom(el) {
    // 复位到原始大小（点击「1:1 复位」或新盘渲染）
    pinchScale = 1;
    pinchActive = false;
    if (el) {
      el.style.transform = '';
      el.style.transformOrigin = '';
    }
    updateZoomResetBtn();
  }
  function bindPinch(el) {
    // 双指捏合缩放：touchstart 两指起捏、touchmove 以两指中点缩放、touchend 单指结束；
    // 单指不拦截（正常点击/滑动）；passive:false 以允许 preventDefault
    el.addEventListener('touchstart', function (e) {
      if (e.touches.length >= 2) {
        pinchActive = true;
        pinchStartDist = pinchDist(e.touches[0], e.touches[1]);
        pinchStartScale = pinchScale;
        e.preventDefault();
      }
    }, { passive: false });
    el.addEventListener('touchmove', function (e) {
      if (pinchActive && e.touches.length >= 2) {
        var d = pinchDist(e.touches[0], e.touches[1]);
        pinchScale = Math.min(2.2, Math.max(1, pinchStartScale * d / (pinchStartDist || 1)));
        var rect = el.getBoundingClientRect();
        var cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        var cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        el.style.transformOrigin = cx + 'px ' + cy + 'px';
        applyBoardZoom(el);
        e.preventDefault();
      }
    }, { passive: false });
    el.addEventListener('touchend', function (e) {
      if (e.touches.length < 2) {
        pinchActive = false;
        updateZoomResetBtn();
      }
    }, { passive: false });
  }

  /* ---------- 渲染：游戏视图 ---------- */
  function renderGameView() {
    clearNode(viewEl);
    cellEls = [];
    resetBoardZoom(null); // v1.11：每局新盘从原始大小开始（复位按钮随之隐藏）
    var lv = findLevel(state.level);

    // 顶栏：← 返回 + 难度名（含盘面信息）+ ⏱ 计时
    var topbar = makeEl('div', 'topbar');
    var btnBack = makeEl('button', 'btn-ghost-sm', '← 返回');
    btnBack.setAttribute('aria-label', '返回难度选择');
    btnBack.addEventListener('click', backToDifficulty);
    topbar.appendChild(btnBack);
    var title = makeEl('span', 'level-title', lv.name);
    title.appendChild(makeEl('small', '',
      state.N + '×' + state.N + ' · 已知 ' + state.givensCount + ' 格' +
      (state.createdFrom === 'import' ? ' · 导入题' : '') +
      (state.isDaily ? ' · 每日题' : '') +
      (state.fromMap >= 0 ? ' · 关卡 ' + MAP_LEVELS[state.fromMap].name : ''))); // v1.7/v1.12/v1.13 顶栏标记
    topbar.appendChild(title);
    timerEl = makeEl('span', 'top-timer', '⏱ 00.0');
    topbar.appendChild(timerEl);
    viewEl.appendChild(topbar);

    // 棋盘卡片：方形格 width+padding-bottom %（无 gap，宫线在 inner 边框加粗）
    var card = makeEl('div', 'board-card');
    var board = makeEl('div', 'board');
    board.id = 'sudoku-board';
    var pct = colPct(state.N);
    var dims = SUDOKU.boxDims(state.N);
    var br = dims[0];
    var bc = dims[1];
    for (var i = 0; i < state.N * state.N; i++) {
      (function (idx) {
        var r = Math.floor(idx / state.N);
        var c = idx % state.N;
        var cell = makeEl('div', 'cell');
        cell.style.width = pct;
        cell.style.paddingBottom = pct;
        if (r % br === 0 && r > 0) { cell.className = 'cell box-t'; }
        if (c % bc === 0 && c > 0) { cell.className = cell.className + ' box-l'; }
        var inner = makeEl('div', 'cell-inner');
        // v1.9 E4：9×9 窄屏（<=340px）字号降到 14px 保可读（设计基线 ≥14px），其余照旧
        inner.style.fontSize = (state.N === 9 && window.innerWidth <= 340) ? '14px' : cellFont(state.N);
        cell.appendChild(inner);
        cell.addEventListener('click', function () { selectCell(idx); });
        cellEls[idx] = cell;
        board.appendChild(cell);
      })(i);
    }
    card.appendChild(board);
    // v1.11 E4 P2：棋盘上方「1:1 复位」按钮（pinchScale>1 时显示）+ 双指捏合缩放（仅普通局游戏页）
    var zoomBtn = makeEl('button', 'zoom-reset-btn', '1:1 复位');
    zoomBtn.setAttribute('aria-label', '恢复棋盘原始大小');
    zoomBtn.addEventListener('click', function () { resetBoardZoom(card); });
    zoomResetBtnEl = zoomBtn;
    viewEl.appendChild(zoomBtn);
    viewEl.appendChild(card);
    bindPinch(card);
    updateZoomResetBtn();
    // v1.9 E4：9×9 竖屏时温和提示横屏（一次性、非阻塞；双指缩放 P2 不做）
    if (state.N === 9 && window.innerHeight > window.innerWidth && !hint9Shown) {
      hint9Shown = true;
      showOverlay('📱 建议横屏', '9×9 盘面较大，横屏使用格子更大更好点', [
        { cls: 'checkin-line', text: '建议横屏使用，格子更大更好点' }
      ], [
        { text: '知道了', cls: 'btn-main', act: hideOverlay }
      ]);
    }

    // 提示行
    var msgEl = makeEl('div', 'sudoku-msg', '点空格 → 选数字，行/列/宫不重复就过关！');
    msgEl.id = 'sudoku-msg';
    // v1.6：错题回放首次进入时提示浅红格含义
    if (state.errMarks && state.replayFrom === 'mistake' && !state.replayMsgShown) {
      msgEl.textContent = '本局来自错题本：浅红格是上次填错的位置';
      state.replayMsgShown = true;
    }
    viewEl.appendChild(msgEl);

    // 数字条（底部点按输入，非九宫格）+ 工具条
    var kbd = makeEl('div', 'num-kbd');
    var row = makeEl('div', 'num-row');
    for (var v = 1; v <= state.N; v++) {
      (function (val) {
        var b = makeEl('button', 'num-btn', '' + val);
        b.setAttribute('aria-label', '填数字 ' + val);
        b.addEventListener('click', function () { onNumTap(val); });
        row.appendChild(b);
      })(v);
    }
    kbd.appendChild(row);
    var tools = makeEl('div', 'tools');
    var btnErase = makeEl('button', 'tool-btn', '橡皮');
    btnErase.setAttribute('aria-label', '擦掉选中格子的数字或候选笔记');
    btnErase.addEventListener('click', eraseSelected);
    var btnPen = makeEl('button', 'tool-btn', '✏️ 笔记');
    btnPen.setAttribute('aria-label', '铅笔模式：在格子里记候选数字');
    btnPen.addEventListener('click', togglePenMode);
    penBtnEl = btnPen;
    syncPenBtn();
    var btnUndo = makeEl('button', 'tool-btn', '撤销');
    btnUndo.setAttribute('aria-label', '撤销上一步');
    btnUndo.addEventListener('click', undoLast);
    var btnHint = makeEl('button', 'tool-btn', '提示');
    btnHint.setAttribute('aria-label', '获得一个提示');
    btnHint.addEventListener('click', useHint);
    hintBtnEl = btnHint;
    tools.appendChild(btnErase);
    tools.appendChild(btnPen);
    tools.appendChild(btnUndo);
    tools.appendChild(btnHint);
    kbd.appendChild(tools);
    viewEl.appendChild(kbd);

    refreshCells();
    checkHintBtn();
    updateErrorsUI();
    updateTimerUI();
  }

  function syncPenBtn() {
    if (penBtnEl) { penBtnEl.className = 'tool-btn' + (state.penMode ? ' active' : ''); }
  }
  function togglePenMode() {
    if (state.won) { return; }
    state.penMode = !state.penMode;
    sndClick();
    showMsg(state.penMode
      ? '✏ 铅笔模式：点数字在格子里记候选数，再点一下取消'
      : '');
    syncPenBtn();
    saveCur();
  }

  /* ---------- 交互 ---------- */
  function selectCell(i) {
    if (state.won) { return; }
    state.selected = (state.selected === i) ? -1 : i; // 点同一格取消选中
    refreshCells();
    sndClick();
  }
  function onPenTap(v) {
    // 铅笔模式：在选中空格切换候选笔记
    if (state.won) { return; }
    state.hintExpl = null; // v1.6：用户记笔记 → 清除提示讲解高亮
    if (state.selected < 0) { showMsg('先点一个空格子，再记候选数哦', true); return; }
    var i = state.selected;
    if (state.given[i]) { showMsg('这是题目给的格子，不用填', true); return; }
    if (state.puzzle[i] !== 0) { showMsg('这格已填数字，先用橡皮擦掉再记笔记', true); return; }
    var pen = state.pencils[i];
    var has = pen.indexOf(v) !== -1;
    if (has && penConflict(i, v)) {
      // 该数字在行/列/宫已存在 → 不允许保留该笔记（温和提示，标红由视觉承担）
      showMsg('行 / 列 / 宫里已经有 ' + v + ' 啦，这个候选不对', true);
      sndWrong();
      flashWrong(i);
      return;
    }
    // 切换笔记（含撤销记录：清空整格笔记再回填 = 记录全量笔记快照）
    var prevPen = pen.slice();
    if (has) {
      pen.splice(pen.indexOf(v), 1);
    } else {
      if (penConflict(i, v)) {
        showMsg('行 / 列 / 宫里已经有 ' + v + ' 啦，这个候选不对', true);
        sndWrong();
        flashWrong(i);
        return;
      }
      pen.push(v);
      pen.sort(function (a, b) { return a - b; });
    }
    state.undoStack.push({ i: i, val: 0, pen: prevPen });
    if (state.undoStack.length > 200) { state.undoStack.shift(); }
    sndClick();
    refreshCells();
    showMsg('');
    saveCur();
  }
  function onNumTap(v) {
    sndClick();
    if (state.won) { return; }
    if (state.selected < 0) { showMsg('先点一个空格子，再选数字哦', true); return; }
    var i = state.selected;
    if (state.given[i]) { showMsg('这是题目给的格子，不用填', true); return; }
    var cur = state.puzzle[i];
    if (cur === v) { showMsg(''); return; }
    if (state.penMode) { onPenTap(v); return; }
    state.hintExpl = null; // v1.6：用户填数 → 清除提示讲解高亮
    var r = Math.floor(i / state.N);
    var c = i % state.N;
    // 记住本格原笔记（撤销时恢复）
    var prevPen = (state.pencils[i] || []).slice();
    state.puzzle[i] = 0; // 先清空自身再判定冲突（cellValid 检查含自身行）
    var legal = SUDOKU.cellValid(state.puzzle, state.N, r, c, v);
    if (legal) {
      // 合法：接受（答错不惩罚，绿色确认），撤销栈记录原值+原笔记；并做自动铅笔清理
      state.puzzle[i] = v;
      erasePenInUnit(i, v);
      state.undoStack.push({ i: i, val: cur, pen: prevPen });
      if (state.undoStack.length > 200) { state.undoStack.shift(); }
      sndCorrect();
      refreshCells();
      flashOk(i);
      showMsg('');
      checkHintBtn();
      checkWin();
      saveCur();
    } else {
      // 冲突：红闪 400ms，错误 +1，温和提示，不改变盘面
      state.puzzle[i] = cur;
      state.errors++;
      state.errLog.push({ idx: i, wrong: v }); // v1.6：记录冲突位置（错题本/回放标记用）
      sndWrong();
      flashWrong(i);
      showMsg('行 / 列 / 宫里已经有这个数啦，换一个试试', true);
      updateErrorsUI();
      saveCur(); // 错误计数也持久化（冲突后退出不影响下次继续）
    }
  }
  function eraseSelected() {
    if (state.won) { return; }
    var i = state.selected;
    if (i < 0) { showMsg('先点一个格子，再擦数字哦', true); return; }
    if (state.given[i]) { showMsg('题目给的格子不能擦', true); return; }
    var hadPen = (state.pencils[i] || []).slice();
    var hadVal = state.puzzle[i];
    if (hadVal === 0 && hadPen.length === 0) { showMsg(''); sndClick(); return; }
    state.hintExpl = null; // v1.6：用户擦除 → 清除提示讲解高亮
    state.undoStack.push({ i: i, val: hadVal, pen: hadPen });
    if (state.undoStack.length > 200) { state.undoStack.shift(); }
    state.puzzle[i] = 0;
    state.pencils[i] = [];
    state.pencils[i].sort(function (a, b) { return a - b; });
    sndClick();
    refreshCells();
    checkHintBtn();
    showMsg('');
    saveCur();
  }
  function undoLast() {
    if (state.won) { return; }
    var m = state.undoStack.pop();
    if (!m) { showMsg('没有可以撤销的操作', true); return; }
    state.hintExpl = null; // v1.6：撤销 → 清除提示讲解高亮
    state.puzzle[m.i] = m.val;
    if (m.pen) { state.pencils[m.i] = m.pen.slice(); }
    sndClick();
    refreshCells();
    checkHintBtn();
    showMsg('');
    saveCur();
  }
  /* 提示：候选最少的空格 → 直接填该格正确解（保证提示正确）；
     若正确解当前被占（有格被填错），寻找其它正确解仍可放的空格；
     全部被堵则建议先擦掉填错的数。 */
  function pickHintCell() {
    var best = null;
    var bestLen = state.N * state.N + 1;
    var r, c, i, cands, sv;
    for (r = 0; r < state.N; r++) {
      for (c = 0; c < state.N; c++) {
        i = r * state.N + c;
        if (state.puzzle[i] !== 0) { continue; }
        cands = SUDOKU.getCandidates(state.puzzle, state.N, r, c);
        sv = state.solution[i];
        if (cands.indexOf(sv) === -1) { continue; } // 正确解当前不可放，跳过
        if (cands.length < bestLen) {
          bestLen = cands.length;
          best = { i: i, r: r, c: c };
          if (bestLen === 1) { return best; }
        }
      }
    }
    return best;
  }
  /* v1.6：提示讲解——在行/列/宫中找到「已填 N-1 个不同数字、恰缺解」的一处，解释为什么填 v；
     找到即返回 {kind,i,hl,have,miss}，找不到返回 null（退化回旧提示文案） */
  function explainHint(N, puzzle, solution, r, c) {
    var i = r * N + c;
    var v = solution[i];
    var dims = SUDOKU.boxDims(N);
    var br = dims[0];
    var bc = dims[1];
    var units = [
      { kind: 'row', idxs: [] },
      { kind: 'col', idxs: [] },
      { kind: 'box', idxs: [] }
    ];
    var j, idx, val;
    // 行（固定行 r）
    for (j = 0; j < N; j++) { units[0].idxs.push(r * N + j); }
    // 列（固定列 c）
    for (j = 0; j < N; j++) { units[1].idxs.push(j * N + c); }
    // 宫（boxDims 返回 [宫行数, 宫列数]）
    var rs = Math.floor(r / br) * br;
    var cs = Math.floor(c / bc) * bc;
    var rr, cc;
    for (rr = rs; rr < rs + br; rr++) {
      for (cc = cs; cc < cs + bc; cc++) { units[2].idxs.push(rr * N + cc); }
    }
    // 逐个单元判定：单元内已有 N-1 个不同数字且恰缺解 → 该格必填解
    var u;
    for (u = 0; u < units.length; u++) {
      var seen = [];
      for (j = 0; j < units[u].idxs.length; j++) {
        idx = units[u].idxs[j];
        val = puzzle[idx];
        if (val !== 0 && seen.indexOf(val) === -1) { seen.push(val); }
      }
      if (seen.length === N - 1 && seen.indexOf(v) === -1) {
        seen.sort(function (a, b) { return a - b; });
        return { kind: units[u].kind, i: i, hl: units[u].idxs.slice(), have: seen, miss: v };
      }
    }
    return null;
  }
  function useHint() {
    if (state.won) { return; }
    if (countEmpty() === 0) { showMsg('盘面已填满啦', true); return; }
    // v1.6：提示次数限制——4×4 不限；6×6 每局限 3 次；9×9 每局限 2 次
    if ((state.N === 6 && state.hints >= 3) || (state.N === 9 && state.hints >= 2)) {
      showMsg('提示次数用完了（' + state.N + '×' + state.N + ' 每局限 ' + (state.N === 6 ? 3 : 2) + ' 次），先试试自己找', true);
      return;
    }
    var pick = pickHintCell();
    if (!pick) {
      showMsg('有格子被填错了，先用橡皮擦掉，再试试提示', true);
      return;
    }
    var i = pick.i;
    var v = state.solution[i];
    var ex = explainHint(state.N, state.puzzle, state.solution, pick.r, pick.c); // v1.6：尝试生成讲解
    state.undoStack.push({ i: i, val: 0, pen: (state.pencils[i] || []).slice() });
    if (state.undoStack.length > 200) { state.undoStack.shift(); }
    state.puzzle[i] = v;
    state.pencils[i] = [];
    erasePenInUnit(i, v); // 提示也触发自动铅笔清理
    state.hints++;
    state.hintIdx.push(i); // v1.6：记录提示过的格子
    state.hintExpl = ex || null; // v1.6：先设置讲解高亮，再刷新渲染（若后置则高亮不显示）
    sndCorrect();
    refreshCells();
    checkHintBtn();
    if (ex) {
      // v1.6：讲解型提示——指出所在行/列/宫已有数与缺数，并高亮该单元
      showMsg('提示：看' + (ex.kind === 'row' ? '第 ' + (pick.r + 1) + ' 行' : ex.kind === 'col' ? '第 ' + (pick.c + 1) + ' 列' : '这个宫') + '：已经有 ' + ex.have.join('、') + '，缺 ' + ex.miss + '——这格只能填 ' + v);
    } else {
      showMsg('提示：第 ' + (pick.r + 1) + ' 行第 ' + (pick.c + 1) + ' 列 填数字 ' + v);
    }
    // v1.6：讲解高亮 3 秒后自动消失（尽力而为；下一次用户操作也会清除）
    setTimeout(function () {
      if (state.playing && !state.won && state.hintExpl) {
        state.hintExpl = null;
        refreshCells();
      }
    }, 3000);
    checkWin();
    saveCur();
  }

  /* ---------- 通关 / 星级 / 最佳 ---------- */
  function calcStars(hints, errors) {
    // 0 提示 0 错 → 3★；提示<=1 且 错<=3 → 2★；其余 1★
    if (hints === 0 && errors === 0) { return 3; }
    if (hints <= 1 && errors <= 3) { return 2; }
    return 1;
  }
  function betterThan(starsA, msA, starsB, msB) {
    // 最佳成绩判定：星级高优先，同星级比用时
    if (starsA !== starsB) { return starsA > starsB; }
    return msA < msB;
  }
  function starsText(n) {
    var s = '';
    for (var i = 0; i < 3; i++) { s += (i < n) ? '★' : '☆'; }
    return s;
  }
  function suggestLevel() {
    // E5 自适应难度（v1.10）：最近两局都「吃力」（错误+提示 ≥ 该档半数空格）→ 建议降一档；
    // 历史不足 2 局 / 未吃力 / 已是最简单档 → 返回 null（不降）
    var h = store.history;
    if (!h || h.length < 2) { return null; }
    var a = h[h.length - 2];
    var b = h[h.length - 1];
    var la = findLevel(a.level);
    var lb = findLevel(b.level);
    var halfA = Math.ceil((la.N * la.N - la.givens) / 2);
    var halfB = Math.ceil((lb.N * lb.N - lb.givens) / 2);
    if (a.errors + a.hints < halfA) { return null; }
    if (b.errors + b.hints < halfB) { return null; }
    var hi = Math.max(LEVELS.indexOf(la), LEVELS.indexOf(lb));
    return (hi > 0) ? LEVELS[hi - 1] : null; // 已是最简单不降
  }
  function checkWin() {
    var n = state.N;
    for (var i = 0; i < n * n; i++) {
      if (state.puzzle[i] === 0) { return; }
    }
    // 全部填满：防御性校验无冲突（合法落子规则下必然成立）
    var r, c, idx, v, b;
    for (r = 0; r < n; r++) {
      for (c = 0; c < n; c++) {
        idx = r * n + c;
        v = state.puzzle[idx];
        b = state.puzzle.slice();
        b[idx] = 0;
        if (!SUDOKU.cellValid(b, n, r, c, v)) { return; }
      }
    }
    onWin();
  }
  var winNewBest = false; // v1.6：本局是否新纪录（收藏切换后重建结算浮层时保留提示）
  var lastUnlocked = [];  // v1.12：本局新解锁成就名缓存（onWin 写入，buildWinOverlay 展示后清空）
  var lastSkillLit = '';  // v1.18：本局闯关「实战点亮」的技巧名缓存（buildWinOverlay 展示后清空）
  function onWin() {
    if (state.won) { return; }
    state.won = true;
    stopTimer();
    state.ms = performance.now() - state.startMs;
    sndWin();
    commitMistake('win'); // v1.6：通关提交错题本（0 错 0 提示重练 → 消除同盘面旧记录）
    if (state.createdFrom !== 'import') {
      // v1.7：导入题不计成绩——跳过 best/历史/打卡/新纪录
      var key = state.level;
      var ms = Math.round(state.ms);
      var errors = state.errors;
      var hints = state.hints;
      var stars = calcStars(hints, errors);
      var isNewBest = false;
      var best = store.best[key];
      if (!best || betterThan(stars, ms, best.stars, best.ms)) {
        store.best[key] = { ms: ms, errors: errors, hints: hints, stars: stars, date: fmtDate(new Date()) };
        isNewBest = true;
      }
      winNewBest = isNewBest;
      store.recent[key] = ms;
      store.history.push({ date: fmtDate(new Date()), level: key, ms: ms, errors: errors, hints: hints, stars: stars });
      while (store.history.length > 30) { store.history.shift(); }
      doCheckin();
      // v1.10 E5：根据最近两局生成降档建议（import 局不进 history，不更新建议）
      var sug = suggestLevel();
      if (sug) { suggestedName = sug.name; } else { suggestedName = null; }
      // v1.12：每日挑战通关记录 + 成就结算（新解锁名缓存给结算浮层展示）
      if (state.isDaily) { store.daily = { date: fmtDate(new Date()), level: state.level }; } // v1.17：记录实际难度（周轮换）
// v1.13：闯关通关记录（线性解锁 → 按序 push，completed 含该关则不重复）
      if (state.fromMap >= 0) {
        var ml = MAP_LEVELS[state.fromMap];
        if (!mapContains(store.mapProgress.completed, ml.i)) {
          // v1.18：entry 改为 { i, doneAt }（旧数字项无 doneAt，读取时兜底跳过）
          store.mapProgress.completed.push({ i: ml.i, doneAt: fmtDate(new Date()) });
          // v1.18 实战点亮：首次通关且该关技巧徽章未点亮 → 点亮（adv→advSkills / base→skills）
          var mk = skillByKey(ml.skill);
          if (mk) {
            var mLit = (mk.group === 'adv') ? !!store.advSkills[ml.skill] : !!store.skills[ml.skill];
            if (!mLit) {
              if (mk.group === 'adv') { store.advSkills[ml.skill] = true; } else { store.skills[ml.skill] = true; }
              lastSkillLit = mk.name; // 结算浮层 note（buildWinOverlay 展示后清空）
            }
          }
        }
      }
      lastUnlocked = checkAchievements();
    } else {
      winNewBest = false; // v1.7：导入题不产生新纪录
    }
    clearCur();   // 通关后断局快照作废
    saveStore();
    buildWinOverlay();
  }
  function buildWinOverlay() {
    // v1.6：结算浮层独立成函数，收藏切换后可重建（同一局成绩展示不变）
    var notes = [];
    if (state.createdFrom === 'import') {
      // v1.7：导入题通关不计成绩、不打卡——浮层提示来源
      notes.push({ cls: 'checkin-line', text: '📥 导入题 · 不计入成绩' });
    } else {
      notes.push({ cls: 'checkin-line', text: '✅ 今日已打卡 · 连续 ' + (store.checkin.streak || 0) + ' 天' });
    }
    if (suggestedName) {
      // v1.10 E5：连败降档建议（不扣分，仅提示）
      notes.push({ cls: 'checkin-line', text: '🌱 最近两局有点吃力，下次建议从「' + suggestedName + '」练起（不扣分）' });
    }
if (lastUnlocked && lastUnlocked.length > 0) {
      // v1.12：新解锁成就（一行一枚，展示后清空避免重复）
      for (var ai = 0; ai < lastUnlocked.length; ai++) {
        notes.push({ cls: 'checkin-line', text: '🏅 解锁成就：「' + lastUnlocked[ai] + '」' });
      }
      lastUnlocked = [];
    }
    if (lastSkillLit) {
      // v1.18：闯关实战点亮技巧徽章（展示后清空避免重复）
      notes.push({ cls: 'checkin-line', text: '🎓 实战点亮技巧徽章「' + lastSkillLit + '」' });
      lastSkillLit = '';
    }
    var fav = isFav(state.origPuzzle);
    var btns = [
      { text: '📤 分享这题', cls: 'btn-ghost', act: function () { openSharePuzzleOverlay(); } }, // v1.7：导出题目文本 / 打印图片
      { text: '📤 分享成绩', cls: 'btn-ghost', act: function () { openShareResultOverlay(); } }, // v1.7.1：成绩卡图片 + 分享文案
      { text: fav ? '💛 取消收藏' : '⭐ 收藏这局', cls: 'btn-ghost', act: function () { toggleFav(); } },
      { text: '再来一局', cls: 'btn-main', act: function () { restartRound(); } },
      { text: '选难度', cls: 'btn-ghost', act: function () { backToDifficulty(); } },
      { text: '📅 打卡日历', cls: 'btn-ghost', act: function () { showCheckinView(); } }
    ];
    var sub = '用时 ' + fmtTime(Math.round(state.ms)) + ' 秒 · 错误 ' + state.errors + ' 次 · 提示 ' + state.hints + ' 次';
    showOverlay('🎉 数独完成！', sub, notes, btns);
    showStarsInOverlay(calcStars(state.hints, state.errors));
    if (winNewBest) { showRecordBadge(); }
  }
  function showStarsInOverlay(stars) {
    if (!overlayEl) { return; }
    var sum = overlayEl.querySelector('.summary');
    if (!sum) { return; }
    var st = makeEl('div', 'stars-line', starsText(stars));
    sum.insertBefore(st, sum.firstChild);
  }
  function showRecordBadge() {
    if (!overlayEl) { return; }
    var sum = overlayEl.querySelector('.summary');
    if (!sum) { return; }
    sum.appendChild(makeEl('div', 'record-badge', '🎉 新纪录！'));
  }

  /* ---------- 渲染：难度选择视图 ---------- */
  function showDifficultyView() {
    stopTimer();
    state.won = false;
    state.playing = false;
    renderHeader();
    clearNode(viewEl);
    viewEl.appendChild(makeEl('div', 'page-title', '选择难度'));
    viewEl.appendChild(makeEl('div', 'home-hint', '点空格 → 选数字，每行每列每宫只出现一次，填满就过关！'));
    // v1.10 E5：有降档建议时展示温和横幅（选任意难度即开始）
    if (suggestedName) {
      var sugBanner = makeEl('div', 'home-hint');
        sugBanner.style.color = '#ff8c42';
        sugBanner.style.fontWeight = '600';
        sugBanner.textContent = '🌱 最近两局有点吃力，试试「' + suggestedName + '」更轻松吧（选任意难度即开始）';
      sugBanner.style.color = '#ff8c42';
      sugBanner.style.fontWeight = '600';
      viewEl.appendChild(sugBanner);
    }
    // 规则教学入口（v1.3）：三步看懂行/列/宫规则
    var teachBtn = makeEl('button', 'teach-btn');
    teachBtn.appendChild(makeEl('span', 'teach-btn-head', '📖 规则教学'));
    teachBtn.appendChild(makeEl('span', 'teach-btn-sub', '3 步看懂：行 · 列 · 宫不重复'));
    teachBtn.setAttribute('aria-label', '打开规则教学，三步看懂数独规则');
    teachBtn.addEventListener('click', openTeach);
    viewEl.appendChild(teachBtn);
    // 技巧教学入口（v1.4）：教学关完成点亮徽章；locked 占位卡不在难度页展示
    for (var si = 0; si < SKILLS.length; si++) {
      if (SKILLS[si].locked) { continue; }
      if (SKILLS[si].group === 'adv') { continue; } // v1.10：进阶技巧不占难度页 base 卡位（走「🧩 自由解题」）
      (function (s) {
        var skBtn = makeEl('button', 'teach-btn skill-btn');
        skBtn.appendChild(makeEl('span', 'teach-btn-head',
          (store.skills[s.key] ? '✅ ' : '🎯 ') + s.name + '技巧'));
        skBtn.appendChild(makeEl('span', 'teach-btn-sub',
          store.skills[s.key] ? '已点亮徽章 · 可再练一次' : '学一个技巧，点亮一个徽章'));
        skBtn.setAttribute('aria-label', '打开' + s.name + '技巧教学关');
        skBtn.addEventListener('click', function () { openSkill(SKILLS.indexOf(s)); });
        viewEl.appendChild(skBtn);
      })(SKILLS[si]);
    }
    // 徽章墙入口（v1.5）：查看所有技巧徽章点亮状态
    var badgeBtn = makeEl('button', 'teach-btn badge-btn');
    badgeBtn.appendChild(makeEl('span', 'teach-btn-head', '🏆 技巧徽章墙'));
    badgeBtn.appendChild(makeEl('span', 'teach-btn-sub', '查看已点亮的技巧徽章'));
    badgeBtn.setAttribute('aria-label', '打开技巧徽章墙');
    badgeBtn.addEventListener('click', showBadgeWallView);
    viewEl.appendChild(badgeBtn);
    // 自由解题入口（v1.10）：进阶技巧教学关（独立 advSkills 徽章，不吹适龄徽章）
    var advBtn = makeEl('button', 'teach-btn book-btn');
    advBtn.appendChild(makeEl('span', 'teach-btn-head', '🧩 自由解题'));
    advBtn.appendChild(makeEl('span', 'teach-btn-sub', '进阶技巧 · 自主探索'));
    advBtn.setAttribute('aria-label', '自由解题，探索进阶技巧');
    advBtn.addEventListener('click', showAdvView);
    viewEl.appendChild(advBtn);
    // 错题本入口（v1.6）：有错题时显示
    if (store.mistakes && store.mistakes.length > 0) {
      var misBtn = makeEl('button', 'teach-btn book-btn');
      misBtn.appendChild(makeEl('span', 'teach-btn-head', '📕 错题本'));
      misBtn.appendChild(makeEl('span', 'teach-btn-sub', '重练错题 · 共 ' + store.mistakes.length + ' 条'));
      misBtn.setAttribute('aria-label', '打开错题本，共 ' + store.mistakes.length + ' 条');
      misBtn.addEventListener('click', showMistakeView);
      viewEl.appendChild(misBtn);
    }
    // 收藏本入口（v1.6）：常驻展示
    var favBtn = makeEl('button', 'teach-btn book-btn');
    favBtn.appendChild(makeEl('span', 'teach-btn-head', '⭐ 收藏本'));
    favBtn.appendChild(makeEl('span', 'teach-btn-sub',
      store.favorites && store.favorites.length > 0 ? '共 ' + store.favorites.length + ' 条' : '收藏想再练的题目'));
    favBtn.setAttribute('aria-label', '打开收藏本');
    favBtn.addEventListener('click', showFavoriteView);
    viewEl.appendChild(favBtn);
    // 每日挑战入口（v1.12）：当日种子同题，计入普通成绩与打卡（无竞技）
    var dToday = fmtDate(new Date());
    var dailyDone = !!(store.daily && store.daily.date === dToday);
    var dailyBtn = makeEl('button', 'teach-btn book-btn');
    dailyBtn.appendChild(makeEl('span', 'teach-btn-head', '📅 每日挑战'));
    // v1.17：未完成分支按今日难度显示动态文案（周轮换）
    var todayDiffKey = DAILY_DIFFS[new Date().getDay()];
    var todayLv = findLevel(todayDiffKey);
    dailyBtn.appendChild(makeEl('span', 'teach-btn-sub',
      dailyDone ? '今日已完成 ✅ 连续 ' + (store.checkin.streak || 0) + ' 天' :
        '今日一题 · ' + todayLv.name + ' ' + todayLv.N + '×' + todayLv.N + ' · 和全世界同题'));
dailyBtn.setAttribute('aria-label', dailyDone ? '今日每日挑战已完成' : '开始今日每日挑战');
    dailyBtn.addEventListener('click', startDaily);
    viewEl.appendChild(dailyBtn);
    // v1.18 每日挑战 streak 卡（连续打卡 + 本周 7 日圆点，全派生零 schema）
    viewEl.appendChild(buildWeekStreakCard());
    // 闯关地图入口（v1.13 X1）：3 档 × 3 关线性推进，复用 seed 基建同关同题
    var mapComp = (store.mapProgress && store.mapProgress.completed) ? store.mapProgress.completed : [];
    var mapBtn = makeEl('button', 'teach-btn book-btn');
mapBtn.appendChild(makeEl('span', 'teach-btn-head', '🗺️ 闯关地图'));
    mapBtn.appendChild(makeEl('span', 'teach-btn-sub', '通关 ' + mapComp.length + ' / 9 关 · 掌握技巧 ' + litMapSkillCount() + ' / ' + mapSkillTotal()));
    mapBtn.setAttribute('aria-label', '打开闯关地图');
    mapBtn.addEventListener('click', showMapView);
    viewEl.appendChild(mapBtn);
    // 成就入口（v1.12）：个人里程碑，无竞技无排行
    var achBtn = makeEl('button', 'teach-btn book-btn');
    achBtn.appendChild(makeEl('span', 'teach-btn-head', '🏅 成就'));
    achBtn.appendChild(makeEl('span', 'teach-btn-sub', '已解锁 ' + countAchievements() + ' / ' + ACHIEVEMENTS.length + ' 枚'));
    achBtn.setAttribute('aria-label', '打开成就墙');
    achBtn.addEventListener('click', showAchievementView);
    viewEl.appendChild(achBtn);
    // 设置入口（v1.14）：音效开关 / 清除进度 / 关于
    var setBtn = makeEl('button', 'teach-btn book-btn');
    setBtn.appendChild(makeEl('span', 'teach-btn-head', '⚙️ 设置'));
    setBtn.appendChild(makeEl('span', 'teach-btn-sub', '音效 · 清除进度 · 关于'));
    setBtn.setAttribute('aria-label', '打开设置');
    setBtn.addEventListener('click', showSettingsView);
    viewEl.appendChild(setBtn);
    // 家长报告入口（v1.9）：今日反馈 / 近 7 天 / 技巧掌握度（只读本地数据）
    var reportBtn = makeEl('button', 'teach-btn book-btn');
    reportBtn.appendChild(makeEl('span', 'teach-btn-head', '📊 家长报告'));
    reportBtn.appendChild(makeEl('span', 'teach-btn-sub', '今日反馈 · 近 7 天 · 技巧掌握度'));
    reportBtn.setAttribute('aria-label', '打开家长报告');
    reportBtn.addEventListener('click', showReportView);
    viewEl.appendChild(reportBtn);
    // 导入题目入口（v1.7）：粘贴别人分享的题目文本直接玩
    var importBtn = makeEl('button', 'teach-btn book-btn');
    importBtn.appendChild(makeEl('span', 'teach-btn-head', '📥 导入题目'));
    importBtn.appendChild(makeEl('span', 'teach-btn-sub', '粘贴别人分享的数独直接玩'));
    importBtn.setAttribute('aria-label', '导入分享的题目');
    importBtn.addEventListener('click', openImportOverlay);
    viewEl.appendChild(importBtn);
    // 断局恢复入口（v1.2）：有未完成对局时显示
    if (store.cur && isValidCur(store.cur)) {
      var lv = findLevel(store.cur.level);
      var resumeBtn = makeEl('button', 'diff-btn resume-btn');
      var resHead = makeEl('span', 'diff-head', '▶ 继续上次 · ' + lv.name + ' ' + lv.N + '×' + lv.N);
      resumeBtn.appendChild(resHead);
      var resSub = makeEl('span', 'diff-sub',
        '已玩 ' + fmtTime(store.cur.ms) + ' 秒 · 已填 ' + countFilled(store.cur) + ' 格 · 错 ' + store.cur.errors + ' · 提示 ' + store.cur.hints);
      resumeBtn.appendChild(resSub);
      resumeBtn.setAttribute('aria-label', '继续上次未完成的数独对局');
      resumeBtn.addEventListener('click', resumeGame);
      viewEl.appendChild(resumeBtn);
    }
    var list = makeEl('div', 'diff-list');
    for (var i = 0; i < LEVELS.length; i++) {
      (function (l) {
        var btn = makeEl('button', 'diff-btn');
        if (suggestedName && l.name === suggestedName) { btn.className = 'diff-btn suggested'; } // v1.10 E5：建议档高亮
        var head = makeEl('span', 'diff-head',
          '👉 ' + l.name + ' · ' + l.N + '×' + l.N + ' · 已知 ' + l.givens + ' 格');
        btn.appendChild(head);
        var best = store.best[l.key];
        var sub = best
          ? '最佳 ' + starsText(best.stars) + ' · ' + fmtBestTime(best.ms) + ' · 错 ' + best.errors + ' · 提示 ' + best.hints
          : '暂无成绩 · 来挑战！';
        btn.appendChild(makeEl('span', 'diff-sub', sub));
        btn.setAttribute('aria-label', l.name + '难度 ' + l.N + '×' + l.N + ' 已知' + l.givens + '格');
        btn.addEventListener('click', function () { startGame(l.key); });
        list.appendChild(btn);
      })(LEVELS[i]);
    }
    viewEl.appendChild(list);
    renderHomeFooter();
  }
  function showBadgeWallView() {
    // 徽章墙（v1.5）：每枚技巧一枚卡片——已点亮 ✅ / 可学习 🎯 / 锁定 🔒（占位）
    hideOverlay();
    stopTimer();
    state.won = false;
    state.playing = false;
    renderHeader('技巧徽章墙');
    clearNode(viewEl);
    viewEl.appendChild(makeEl('div', 'page-title', '技巧徽章墙'));
    viewEl.appendChild(makeEl('div', 'home-hint', '每个技巧学会后点亮一枚徽章'));
    for (var bi = 0; bi < SKILLS.length; bi++) {
      if (SKILLS[bi].group === 'adv') { continue; } // v1.10：进阶技巧不进适龄徽章墙
      (function (s, idx) {
        var lit = !!store.skills[s.key];
        var head = lit ? '✅ ' + s.name : (s.locked ? '🔒 ' + s.name : '🎯 ' + s.name);
        var sub = s.locked ? '即将上线' : (lit ? '徽章已点亮 · 可再练一次' : '去学习这个技巧');
        var card = makeEl('button', 'teach-btn badge-card' + (s.locked ? ' locked' : ''));
        card.appendChild(makeEl('span', 'teach-btn-head', head));
        card.appendChild(makeEl('span', 'teach-btn-sub', sub));
        card.setAttribute('aria-label', head + '，' + sub);
        if (!s.locked) {
          card.addEventListener('click', function () { openSkill(idx, 'badgewall'); });
        }
        viewEl.appendChild(card);
      })(SKILLS[bi], bi);
    }
    // 徽章墙底部：返回难度（无计时器，直接回难度页）
    var back = makeEl('button', 'btn-checkin', '← 返回');
    back.setAttribute('aria-label', '返回难度选择');
    back.style.marginTop = '4px';
    back.addEventListener('click', showDifficultyView);
    viewEl.appendChild(back);
  }
  function showAdvView() {
    // 自由解题（v1.10）：进阶技巧教学关入口（独立 advSkills 徽章，不吹适龄徽章）——仿徽章墙
    hideOverlay();
    stopTimer();
    state.won = false;
    state.playing = false;
    renderHeader('自由解题');
    clearNode(viewEl);
    viewEl.appendChild(makeEl('div', 'page-title', '自由解题 · 进阶'));
    viewEl.appendChild(makeEl('div', 'home-hint', '自主挑战高阶技巧（不吹适龄徽章）'));
    for (var ai = 0; ai < SKILLS.length; ai++) {
      if (SKILLS[ai].group !== 'adv') { continue; }
      (function (s, idx) {
        var lit = !!store.advSkills[s.key];
        var head = lit ? '✨ ' + s.name : '💎 ' + s.name;
        var sub = lit ? '进阶已点亮 · 可再练' : '去探索这个技巧';
        var card = makeEl('button', 'teach-btn badge-card');
        card.appendChild(makeEl('span', 'teach-btn-head', head));
        card.appendChild(makeEl('span', 'teach-btn-sub', sub));
        card.setAttribute('aria-label', head + '，' + sub);
        card.addEventListener('click', function () { openSkill(idx, 'adv'); });
        viewEl.appendChild(card);
      })(SKILLS[ai], ai);
    }
    // 底部：返回难度（无计时器，直接回难度页）
    var advBack = makeEl('button', 'btn-checkin', '← 返回');
    advBack.setAttribute('aria-label', '返回难度选择');
    advBack.style.marginTop = '4px';
    advBack.addEventListener('click', showDifficultyView);
    viewEl.appendChild(advBack);
  }
/* ---------- 成就（v1.12 X3 / v1.17 扩 2 / v1.18 扩 2 / v1.20 扩 1 / v1.21 扩 3 / v1.22 扩 1）：15 枚个人里程碑，无竞技无排行 ---------- */
  var ACHIEVEMENTS = [
    { key: 'firstDaily', name: '每日挑战首通', desc: '完成一次每日挑战' },
    { key: 'daily3',     name: '连续打卡 3 天', desc: '连续 3 天完成打卡（含每日挑战）' },
    { key: 'daily7',     name: '连续打卡 7 天', desc: '连续 7 天完成打卡' },
    { key: 'games10',    name: '十局小达人', desc: '累计完成 10 局' },
    { key: 'allSkills',  name: '技巧大师', desc: '点亮全部 4 枚适龄技巧徽章' },
    { key: 'perfect3',   name: '三星完美', desc: '0 错 0 提示 ★★★ 通关一局' },
    { key: 'mapMaster',  name: '闯关地图通关', desc: '闯关地图全部 9 关通关' },      // v1.17
    { key: 'monthStreak', name: '月度坚持', desc: '连续打卡 30 天' },                 // v1.17
    { key: 'mapStreak',  name: '闯关达人', desc: '连续 7 天闯关' },                   // v1.18
    { key: 'favorite',   name: '小小收藏家', desc: '收藏 10 道好题' },                 // v1.18
    { key: 'sixArts',    name: '六艺精通', desc: '点亮全部 7 枚技巧徽章（适龄 4 + 进阶 3）' },  // v1.20/v1.23
    { key: 'allStars',   name: '全档三星', desc: '4×4 / 6×6 / 9×9 各至少一次 ★★★ 通关' },      // v1.21
    { key: 'daily14',    name: '坚持两周', desc: '连续打卡 14 天' },                             // v1.21
    { key: 'advBoth',    name: '进阶双修', desc: '点亮唯一余数 + X-Wing 两枚进阶徽章' },          // v1.21
    { key: 'clearAll',   name: '全档挑战', desc: '4×4 / 6×6 / 9×9 各通关一局' }                   // v1.22
  ];
  function countAchievements() {
    // 已解锁成就数（store.achievements 非空键个数）
    var n = 0;
    var k;
    for (k in store.achievements) {
      if (Object.prototype.hasOwnProperty.call(store.achievements, k) && store.achievements[k]) { n++; }
    }
    return n;
  }
  function checkAchievements() {
    // 结算成就：返回本局新解锁的名称数组（已解锁跳过，不重复写入；成就键值存解锁日期）
    var unlocked = [];
    var today = fmtDate(new Date());
    var streak = store.checkin && store.checkin.streak ? store.checkin.streak : 0;
var checks = {
      firstDaily: state.isDaily,
      daily3: streak >= 3,
      daily7: streak >= 7,
      games10: store.history.length >= 10,
      allSkills: countLitSkills() >= baseSkillCount(),
      perfect3: state.errors === 0 && state.hints === 0, // 3★（0 错 0 提示）
      mapMaster: (store.mapProgress && store.mapProgress.completed.length >= MAP_LEVELS.length), // v1.17
      monthStreak: streak >= 30, // v1.17
      mapStreak: mapStreakDays() >= 7, // v1.18 闯关连续 7 天（doneAt 派生）
      favorite: (store.favorites || []).length >= 10, // v1.18 收藏 10 道好题
      sixArts: allSkillLit() >= SKILLS.length, // v1.20 六艺精通：点亮全部技巧徽章（v1.23 扩 7：适龄 4 + 进阶 3，任一来源皆计）
      allStars: !!store.best['4'] && !!store.best['6'] && !!store.best['9'] && store.best['4'].stars >= 3 && store.best['6'].stars >= 3 && store.best['9'].stars >= 3, // v1.21 全档三星（best 单档最佳只增不减，语义安全）
      daily14: streak >= 14, // v1.21 坚持两周
      advBoth: !!(store.advSkills && store.advSkills.uniqueElim && store.advSkills.xwing), // v1.21 进阶双修
      clearAll: !!(store.best['4'] && store.best['6'] && store.best['9']) // v1.22 全档挑战：4×4 / 6×6 / 9×9 各至少通关一局
    };
    var i;
    for (i = 0; i < ACHIEVEMENTS.length; i++) {
      var a = ACHIEVEMENTS[i];
      if (checks[a.key] && !store.achievements[a.key]) {
        store.achievements[a.key] = today;
        unlocked.push(a.name);
      }
    }
    return unlocked;
  }
  function showAchievementView() {
    // 成就墙（v1.12）：仿徽章墙——已解锁 🏅 / 未解锁 🔒，个人里程碑
    hideOverlay();
    stopTimer();
    state.won = false;
    state.playing = false;
    renderHeader('成就');
    clearNode(viewEl);
    viewEl.appendChild(makeEl('div', 'page-title', '成就墙 · 个人里程碑'));
    viewEl.appendChild(makeEl('div', 'home-hint', '每个成就记录你的坚持（无排行无竞技）'));
    for (var ac = 0; ac < ACHIEVEMENTS.length; ac++) {
      (function (a) {
        var got = store.achievements[a.key];
        var head = got ? '🏅 ' + a.name : '🔒 ' + a.name;
        var sub = got ? '解锁于 ' + got : a.desc;
        var card = makeEl('button', 'teach-btn badge-card');
        card.appendChild(makeEl('span', 'teach-btn-head', head));
        card.appendChild(makeEl('span', 'teach-btn-sub', sub));
        card.setAttribute('aria-label', head + '，' + sub);
        viewEl.appendChild(card);
      })(ACHIEVEMENTS[ac]);
    }
    // 底部：返回难度
    var achBack = makeEl('button', 'btn-checkin', '← 返回');
    achBack.setAttribute('aria-label', '返回难度选择');
    achBack.style.marginTop = '4px';
    achBack.addEventListener('click', showDifficultyView);
    viewEl.appendChild(achBack);
  }
  function showMapView() {
    // 闯关地图（v1.13 X1）：3 档 × 3 关线性推进——已通关 ✅ / 下一关可玩 🔓 / 未解锁 🔒
    hideOverlay();
    stopTimer();
    state.won = false;
    state.playing = false;
    renderHeader('闯关地图');
    clearNode(viewEl);
    viewEl.appendChild(makeEl('div', 'page-title', '闯关地图 · 9 关任你战'));
    viewEl.appendChild(makeEl('div', 'home-hint', '从 4×4 到 9×9，一关一关升级（无排行无竞技）'));
    var comp = (store.mapProgress && store.mapProgress.completed) ? store.mapProgress.completed : [];
    var doneCount = comp.length;
    if (doneCount >= MAP_LEVELS.length) {
      viewEl.appendChild(makeEl('div', 'map-done-banner', '🎉 闯关全部通关！点关卡可重玩'));
    }
var grid = makeEl('div', 'map-grid');
    for (var mi = 0; mi < MAP_LEVELS.length; mi++) {
      (function (ml) {
        var st = ml.i < doneCount ? 'done' : (ml.i === doneCount ? 'open' : 'locked');
        var emoji = st === 'done' ? '✅' : (st === 'open' ? '🔓' : '🔒');
        // v1.18：技巧 tag——已点亮 💡 / 未点亮 🔒（base 查 store.skills、adv 查 store.advSkills）
        var skObj = skillByKey(ml.skill);
        var skIdx = -1;
        var skLit = false;
        var si;
        if (skObj) {
          for (si = 0; si < SKILLS.length; si++) { if (SKILLS[si].key === ml.skill) { skIdx = si; break; } }
          skLit = (skObj.group === 'adv') ? !!store.advSkills[ml.skill] : !!store.skills[ml.skill];
        }
        var node = makeEl('button', 'map-node' + (st === 'locked' ? ' locked' : ''));
        node.appendChild(makeEl('span', 'map-emoji', emoji));
        node.appendChild(makeEl('span', 'map-name', ml.name));
        node.appendChild(makeEl('span', 'map-tip', ml.tip));
        if (skObj) {
          // v1.18：技巧 tag——与徽章墙/教学入口视觉一致：已点亮 ✅ / 未点亮 🎯（base 查 store.skills、adv 查 store.advSkills；不用 🔒 避免与三态锁混淆）
          node.appendChild(makeEl('span', 'map-skill-tag' + (skLit ? '' : ' off'),
            (skLit ? '✅ ' : '🎯 ') + skObj.name));
        }
        node.setAttribute('aria-label', ml.name + '，' + ml.tip);
        node.addEventListener('click', function () {
          if (st === 'locked') {
            toast('先通关上一关再解锁哦');
            return;
          }
          // v1.18：进阶技巧关未掌握 → 不直接开局，引导去「自由解题」学习
          if (skObj && skObj.group === 'adv' && !skLit) {
            toast('先到「自由解题」学一下「' + skObj.name + '」再挑战吧');
            state.fromMap = -1; // 清掉残留闯关态，保证返回/重进不残留
            openSkill(skIdx, 'adv');
            return;
          }
          startMapLevel(ml.i); // 已通关可点击重玩（重玩通关不重复累计）
        });
        grid.appendChild(node);
      })(MAP_LEVELS[mi]);
    }
    viewEl.appendChild(grid);
    // 底部：返回难度
    var mapBack = makeEl('button', 'btn-checkin', '← 返回');
    mapBack.setAttribute('aria-label', '返回难度选择');
    mapBack.style.marginTop = '4px';
    mapBack.addEventListener('click', showDifficultyView);
    viewEl.appendChild(mapBack);
  }
  /* ---------- 错题本 / 收藏本（v1.6） ---------- */
  function renderMiniBoard(container, board, N) {
    // 迷你盘面缩略图（列表卡片用）：给定数字可见，空格留白，不可交互
    clearNode(container);
    var pct = colPct(N);
    var font = (N === 4 ? '14px' : (N === 6 ? '11px' : '8px'));
    var cs = 72 / N; // 缩略图固定 72px 高，每格边长（配合 .book-thumb 高度）
    var i;
    for (i = 0; i < N * N; i++) {
      (function (idx) {
        var cell = makeEl('span', 'mini-cell');
        cell.style.width = pct;
        cell.style.height = pct;
        var v = board[idx];
        if (v !== 0) {
          cell.textContent = '' + v;
          cell.style.fontSize = font;
          cell.style.lineHeight = cs + 'px';
          cell.style.textAlign = 'center';
        }
        container.appendChild(cell);
      })(i);
    }
  }
  function mistakeBoardKey(board) {
    // 盘面唯一键（逗号拼接，数字 0-9 无歧义）
    return board.join(',');
  }
  function upsertMistake(rec) {
    // 同盘面错题记录：整条替换（更新 ts/errors/hintIdx/result/stars），否则追加；上限 50 条
    var key = mistakeBoardKey(rec.board);
    var i;
    for (i = 0; i < store.mistakes.length; i++) {
      if (mistakeBoardKey(store.mistakes[i].board) === key) {
        store.mistakes[i] = rec;
        saveStore();
        return;
      }
    }
    store.mistakes.push(rec);
    while (store.mistakes.length > 50) { store.mistakes.shift(); }
    saveStore();
  }
  function commitMistake(result) {
    // 通关/中途退出时提交错题记录；无原始盘面（v1.6 之前旧快照）不追踪
    if (!state.origPuzzle) { return; }
    var errCount = state.errors;
    var hintCount = state.hints;
    var key = mistakeBoardKey(state.origPuzzle);
    if (result === 'win') {
      if (errCount === 0 && hintCount === 0) {
        // 掌握重练：0 错 0 提示通关 → 消除错题本中同盘面的旧记录
        var j;
        for (j = 0; j < store.mistakes.length; j++) {
          if (mistakeBoardKey(store.mistakes[j].board) === key) {
            store.mistakes.splice(j, 1);
            saveStore();
            break;
          }
        }
        return;
      }
      if (errCount > 0 || hintCount > 0) {
        upsertMistake({
          id: 'm_' + Date.now(), ts: Date.now(), level: state.level,
          board: state.origPuzzle.slice(), solution: state.solution.slice(),
          errors: state.errLog.slice(), hintIdx: state.hintIdx.slice(),
          result: 'win', stars: calcStars(errCount, hintCount)
        });
      }
    } else if (result === 'quit') {
      if (errCount > 0) {
        upsertMistake({
          id: 'm_' + Date.now(), ts: Date.now(), level: state.level,
          board: state.origPuzzle.slice(), solution: state.solution.slice(),
          errors: state.errLog.slice(), hintIdx: state.hintIdx.slice(),
          result: 'quit', stars: -1
        });
      }
    }
    state.errLog = [];
    state.hintIdx = [];
  }
  function isFav(board) {
    // 当前盘面是否已在收藏本
    if (!board) { return false; }
    var key = mistakeBoardKey(board);
    var i;
    for (i = 0; i < store.favorites.length; i++) {
      if (mistakeBoardKey(store.favorites[i].board) === key) { return true; }
    }
    return false;
  }
  function toggleFav() {
    // 通关结算：收藏/取消收藏当前盘面，并重建结算浮层
    if (!state.origPuzzle) { return; }
    var key = mistakeBoardKey(state.origPuzzle);
    var i;
    for (i = 0; i < store.favorites.length; i++) {
      if (mistakeBoardKey(store.favorites[i].board) === key) {
        store.favorites.splice(i, 1);
        saveStore();
        buildWinOverlay();
        return;
      }
    }
    store.favorites.push({
      id: 'f_' + Date.now(), ts: Date.now(), level: state.level,
      board: state.origPuzzle.slice(), solution: state.solution.slice()
    });
    saveStore();
    buildWinOverlay();
  }
  function removeBook(list, rec) {
    // 按 id 删除错题/收藏记录（删除后由调用方重渲染视图）
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].id === rec.id) { list.splice(i, 1); saveStore(); return; }
    }
  }
  function replayRecord(rec, src) {
    // 错题本/收藏本回放：从记录重建对局（盘面只读起点，可再次通关/收藏）——初始化对齐 resumeGame
    hideOverlay();
    stopTimer();
    state.won = false;
    state.playing = true;
    state.replayFrom = src;
    var lv = findLevel(rec.level);
    state.level = lv.key;
    state.N = lv.N;
    state.givens = lv.givens;
    var board = rec.board.slice();
    state.puzzle = board;
    state.solution = (rec.solution || []).slice();
    var given = [];
    var i;
    var givensCount = 0;
    for (i = 0; i < board.length; i++) {
      given.push(board[i] !== 0);
      if (board[i] !== 0) { givensCount++; }
    }
    state.given = given;
    state.givensCount = givensCount;
    state.origPuzzle = board.slice();
    state.errLog = [];
    state.hintIdx = [];
    var pencils = [];
    for (i = 0; i < board.length; i++) { pencils.push([]); }
    state.pencils = pencils;
    state.undoStack = [];
    state.hints = 0;
    state.errors = 0;
    state.selected = -1;
    state.penMode = false;
    state.hintExpl = null;
    state.replayMsgShown = false;
    state.createdFrom = 'normal'; // v1.7：回放按普通局计成绩
    state.isDaily = false;        // v1.12：回放非每日挑战
    state.fromMap = -1;           // v1.13：回放非闯关关
    state.startMs = 0;
    state.ms = 0;
    // 错题本回放：标记上次填错的位置（浅红，非错误计数）
    state.errMarks = (src === 'mistake' && rec.errors) ? rec.errors.map(function (e) { return e.idx; }) : null;
    renderGameView();
    renderGameFooter();
    startTimer();
    saveCur();
  }
  function showMistakeView() {
    // 错题本视图（v1.6）：错题卡片 + 重练/删除 + 清空 + 返回
    hideOverlay();
    stopTimer();
    state.won = false;
    state.playing = false;
    renderHeader('错题本');
    clearNode(viewEl);
    viewEl.appendChild(makeEl('div', 'page-title', '错题本'));
    viewEl.appendChild(makeEl('div', 'home-hint', '把做错的题目记下来，重练到全对为止'));
    var recs = store.mistakes || [];
    if (recs.length === 0) {
      viewEl.appendChild(makeEl('div', 'book-empty', '还没有错题，继续加油'));
    } else {
      var i;
      for (i = 0; i < recs.length; i++) {
        (function (rec, idx) {
          var lv = findLevel(rec.level);
          var card = makeEl('div', 'teach-btn book-card');
          var thumb = makeEl('span', 'book-thumb');
          renderMiniBoard(thumb, rec.board, lv.N);
          card.appendChild(thumb);
          card.appendChild(makeEl('span', 'teach-btn-head', '第 ' + (idx + 1) + ' 题 · ' + lv.name + ' ' + rec.level + '×' + rec.level));
          card.appendChild(makeEl('span', 'teach-btn-sub',
            (rec.result === 'win' ? '通关 ' + rec.stars + '★' : '未通关') +
            ' · 错 ' + (rec.errors ? rec.errors.length : 0) +
            ' · 提示 ' + (rec.hintIdx ? rec.hintIdx.length : 0) +
            ' · ' + fmtDate(new Date(rec.ts))));
          var act = makeEl('span', 'book-act', '▶ 重练');
          act.addEventListener('click', function () { replayRecord(rec, 'mistake'); });
          card.appendChild(act);
          var del = makeEl('span', 'book-act', '🗑');
          del.addEventListener('click', function () { removeBook(store.mistakes, rec); showMistakeView(); });
          card.appendChild(del);
          viewEl.appendChild(card);
        })(recs[i], i);
      }
      var clearBtn = makeEl('button', 'btn-checkin', '清空错题本');
      clearBtn.style.marginTop = '4px';
      clearBtn.addEventListener('click', function () {
        showOverlay('清空错题本', '将删除全部 ' + store.mistakes.length + ' 条错题记录', [],
          [
            { text: '确认清空', cls: 'btn-main', act: function () { store.mistakes = []; saveStore(); hideOverlay(); showMistakeView(); } },
            { text: '取消', cls: 'btn-ghost', act: hideOverlay }
          ]);
      });
      viewEl.appendChild(clearBtn);
    }
    var back = makeEl('button', 'btn-checkin', '← 返回');
    back.setAttribute('aria-label', '返回难度选择');
    back.style.marginTop = '4px';
    back.addEventListener('click', showDifficultyView);
    viewEl.appendChild(back);
  }
  function showFavoriteView() {
    // 收藏本视图（v1.6）：收藏卡片 + 重练/删除 + 清空 + 返回
    hideOverlay();
    stopTimer();
    state.won = false;
    state.playing = false;
    renderHeader('收藏本');
    clearNode(viewEl);
    viewEl.appendChild(makeEl('div', 'page-title', '收藏本'));
    viewEl.appendChild(makeEl('div', 'home-hint', '通关后点「⭐ 收藏这局」，想练的题都在这里'));
    var recs = store.favorites || [];
    if (recs.length === 0) {
      viewEl.appendChild(makeEl('div', 'book-empty', '还没有收藏，通关后点「⭐ 收藏这局」'));
    } else {
      var i;
      for (i = 0; i < recs.length; i++) {
        (function (rec, idx) {
          var lv = findLevel(rec.level);
          var card = makeEl('div', 'teach-btn book-card');
          var thumb = makeEl('span', 'book-thumb');
          renderMiniBoard(thumb, rec.board, lv.N);
          card.appendChild(thumb);
          card.appendChild(makeEl('span', 'teach-btn-head', '第 ' + (idx + 1) + ' 题 · ' + lv.name + ' ' + rec.level + '×' + rec.level));
          card.appendChild(makeEl('span', 'teach-btn-sub', '错 0/提示 0 均可 · 收藏于 ' + fmtDate(new Date(rec.ts))));
          var act = makeEl('span', 'book-act', '▶ 重练');
          act.addEventListener('click', function () { replayRecord(rec, 'favorite'); });
          card.appendChild(act);
          var del = makeEl('span', 'book-act', '🗑');
          del.addEventListener('click', function () { removeBook(store.favorites, rec); showFavoriteView(); });
          card.appendChild(del);
          viewEl.appendChild(card);
        })(recs[i], i);
      }
      var clearBtn = makeEl('button', 'btn-checkin', '清空收藏本');
      clearBtn.style.marginTop = '4px';
      clearBtn.addEventListener('click', function () {
        showOverlay('清空收藏本', '将删除全部 ' + store.favorites.length + ' 条收藏记录', [],
          [
            { text: '确认清空', cls: 'btn-main', act: function () { store.favorites = []; saveStore(); hideOverlay(); showFavoriteView(); } },
            { text: '取消', cls: 'btn-ghost', act: hideOverlay }
          ]);
      });
      viewEl.appendChild(clearBtn);
    }
    var back = makeEl('button', 'btn-checkin', '← 返回');
    back.setAttribute('aria-label', '返回难度选择');
    back.style.marginTop = '4px';
    back.addEventListener('click', showDifficultyView);
    viewEl.appendChild(back);
  }
  /* ---------- 分享题（v1.7）：题目文本导出/导入 + 打印图片 ---------- */
  function countNonZero(board) {
    // 统计盘面非空格数（题目已知格数）
    var c = 0;
    var i;
    for (i = 0; i < board.length; i++) { if (board[i] !== 0) { c++; } }
    return c;
  }
  function solveBoard(board, N) {
    // 本地回溯求唯一解（同 solver.js solveCount 的尝试顺序：先 cellValid 后落子——cellValid 假定目标格为空）；
    // 无解/多解返回 null（导入题已通过 solveCount 唯一解校验，此处解必然存在）
    var b = board.slice();
    var sol = null;
    function bt(pos) {
      if (sol) { return; }
      while (pos < N * N && b[pos] !== 0) { pos++; }
      if (pos === N * N) { sol = b.slice(); return; }
      var r = Math.floor(pos / N);
      var c = pos % N;
      var v;
      for (v = 1; v <= N; v++) {
        if (SUDOKU.cellValid(b, N, r, c, v)) {
          b[pos] = v;
          bt(pos + 1);
          b[pos] = 0;
        }
        if (sol) { return; }
      }
    }
    bt(0);
    return sol;
  }
  function puzzleText(board, N, givensCount) {
    // 题目导出文本：一行标题 + 一行 SD{N}: 数据 + 一行使用说明
    return '数独思维 · ' + N + '×' + N + ' · 已知 ' + givensCount + ' 格\n' +
      'SD' + N + ':' + board.join(',') + '\n' +
      '（空格填 0；复制后在数独思维「📥 导入题目」粘贴）';
  }
function shareTextForCurrent() {
    // 当前局分享文本：优先原始盘面（题面），退化用当前盘面
    var board = state.origPuzzle || state.puzzle;
    var t = puzzleText(board, state.N, countNonZero(board));
    // v1.22：闯关来源题追加技巧标签行（导入解析只取 SD 行、忽略其它行，此行为人类可读信息，向后兼容）
    if (state.fromMap >= 0) {
      var mlv = MAP_LEVELS[state.fromMap];
      var skv = skillByKey(mlv.skill);
      if (skv) { t += '\n技巧标签：' + skv.name; }
    }
    return t;
  }
  function parsePuzzleText(raw) {
    // 导入解析：找 SD{N}: 行 → 校验 N/长度/取值 → 唯一解校验
    // 成功返回 {N, board}；失败返回 {error}（错误文案用于界面提示）
    if (!raw) { return { error: '格式不对，请按 SD4:… 的格式粘贴' }; }
    var lines = String(raw).split('\n');
    var i, line, m, N = 0, payload = null;
    for (i = 0; i < lines.length; i++) {
      line = lines[i].replace(/\s+$/, '').trim();
      if (!line) { continue; }
      m = /^SD(\d+):/.exec(line);
      if (m) {
        N = Number(m[1]);
        payload = line.slice(m[0].length).trim();
        break;
      }
    }
    if (!payload) { return { error: '格式不对，请按 SD4:… 的格式粘贴' }; }
    if (N !== 4 && N !== 6 && N !== 9) { return { error: '不是 4×4 / 6×6 / 9×9 的题目' }; }
    var parts = payload.split(/[,\s]+/);
    var clean = [];
    for (i = 0; i < parts.length; i++) {
      if (parts[i] === '') { continue; }
      clean.push(parts[i]);
    }
    if (clean.length !== N * N) { return { error: '题目缺数，需要 ' + N * N + ' 个数字' }; }
    var board = [];
    for (i = 0; i < clean.length; i++) {
      if (!/^\d+$/.test(clean[i])) { return { error: '数字必须是 0~' + N }; }
      var v = Number(clean[i]);
      if (v < 0 || v > N) { return { error: '数字必须是 0~' + N }; }
      board.push(v);
    }
    // 唯一解校验（solveCount 限 2 个解即可判定）
    if (SUDOKU.solveCount(board, N, 2) !== 1) { return { error: '这道题没有唯一解，换一道试试' }; }
    return { N: N, board: board };
  }
  function copyTextViaExecCommand(ta) {
    // 兼容复制：选中 textarea → execCommand('copy')，返回是否成功
    try {
      ta.focus();
      ta.select();
      var ok = document.execCommand('copy');
      return !!ok;
    } catch (err) {
      return false;
    }
  }
  var toastEl = null;
  function toast(msg) {
    // 轻提示（复制/保存反馈）：固定居中灰条，2.6 秒自动消失（同贪吃蛇 share.js）
    if (toastEl && toastEl.parentNode) { toastEl.parentNode.removeChild(toastEl); }
    toastEl = makeEl('div', 'toast', msg);
    document.body.appendChild(toastEl);
    window.setTimeout(function () {
      if (toastEl && toastEl.parentNode) { toastEl.parentNode.removeChild(toastEl); }
      toastEl = null;
    }, 2600);
  }
  var shareShowAnswer = false; // 分享浮层：是否显示答案版图片（题面/答案切换）
  function drawPuzzleImage(showAnswer) {
    // 打印图片：canvas 绘制「标题 + 盘面 + 页脚」，仅题面不含答案（showAnswer 时空格显示答案）
    var N = state.N;
    var board = state.origPuzzle || state.puzzle;
    var solution = state.solution || [];
    var cell = Math.round(720 / N);
    var W = N * cell;
    var H = N * cell;
    var HEADER = 90;
    var cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H + HEADER;
    var ctx = cv.getContext('2d');
    // 白底
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H + HEADER);
    // 标题
    ctx.fillStyle = '#2a3a4a';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
ctx.fillText('数独思维 · ' + N + '×' + N + (showAnswer ? '（答案）' : ''), W / 2, 32);
    // v1.22：闯关来源题标注技巧标签（仅 state.fromMap 可识别；普通/导入/教学题不虚构技巧检测）
    var shareSkill = '';
    if (state.fromMap >= 0) {
      var mlv = MAP_LEVELS[state.fromMap];
      var skv = skillByKey(mlv.skill);
      if (skv) { shareSkill = skv.name; }
    }
    if (shareSkill) {
      ctx.fillStyle = '#8ba4bd';
      ctx.font = '15px sans-serif';
      ctx.fillText('技巧标签：' + shareSkill, W / 2, 62);
    }
    ctx.textAlign = 'left';
    // 盘面网格（标题下方偏移 HEADER）
    var dims = SUDOKU.boxDims(N);
    var br = dims[0];
    var bc = dims[1];
    var x, y, i, r, c, v;
    // 细线（所有格线）
    ctx.strokeStyle = '#9db4c8';
    ctx.lineWidth = 2;
    for (i = 0; i <= N; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cell, HEADER);
      ctx.lineTo(i * cell, HEADER + H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, HEADER + i * cell);
      ctx.lineTo(W, HEADER + i * cell);
      ctx.stroke();
    }
    // 粗线（宫界线）
    ctx.strokeStyle = '#2a3a4a';
    ctx.lineWidth = 5;
    for (r = 0; r <= N; r += br) {
      ctx.beginPath();
      ctx.moveTo(0, HEADER + r * cell);
      ctx.lineTo(W, HEADER + r * cell);
      ctx.stroke();
    }
    for (c = 0; c <= N; c += bc) {
      ctx.beginPath();
      ctx.moveTo(c * cell, HEADER);
      ctx.lineTo(c * cell, HEADER + H);
      ctx.stroke();
    }
    // 数字
    for (i = 0; i < N * N; i++) {
      r = Math.floor(i / N);
      c = i % N;
      v = board[i];
      if (v === 0 && showAnswer) { v = solution[i] || 0; }
      if (v === 0) { continue; }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (board[i] !== 0) {
        // 题面已知格：加粗深色
        ctx.fillStyle = '#2a3a4a';
        ctx.font = 'bold ' + Math.round(cell * 0.55) + 'px sans-serif';
      } else {
        // 答案格：天蓝浅色
        ctx.fillStyle = '#4aa8ff';
        ctx.font = Math.round(cell * 0.55) + 'px sans-serif';
      }
      ctx.fillText('' + v, c * cell + cell / 2, HEADER + r * cell + cell / 2);
    }
    // 页脚
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8ba4bd';
    ctx.font = '14px sans-serif';
    ctx.fillText('龙爸乐学 · 数独思维', W / 2, H + HEADER - 18);
    return cv;
  }
  function openSharePuzzleOverlay() {
    // 分享浮层：题目文本复制 + 打印图片（题面/答案切换）；返回结算可重建
    hideOverlay();
    var ov = makeEl('div', 'overlay');
    var card = makeEl('div', 'overlay-card');
    card.appendChild(makeEl('div', 'overlay-title', '📤 分享这题'));
    // 区块 A：题目文本
    var ta = makeEl('textarea', 'export-zone', shareTextForCurrent());
    ta.readOnly = true;
    ta.setAttribute('aria-label', '分享的题目文本');
    card.appendChild(ta);
    var copyBtn = makeEl('button', 'btn-main', '复制题目');
    copyBtn.setAttribute('aria-label', '复制题目文本');
    copyBtn.addEventListener('click', function () {
      if (copyTextViaExecCommand(ta)) {
        toast('✅ 题目已复制，去粘贴给朋友吧');
      } else {
        toast('复制失败，请长按文本手动复制');
      }
    });
    card.appendChild(copyBtn);
    // 区块 B：打印图片（题面无答案）
    shareShowAnswer = false;
    var img = makeEl('img', 'share-img');
    img.src = drawPuzzleImage(shareShowAnswer).toDataURL('image/png');
    img.setAttribute('alt', '数独打印题面');
    card.appendChild(img);
    card.appendChild(makeEl('div', 'share-hint', '📸 长按保存图片 · 打印练习（题面无答案）'));
    var ansBtn = makeEl('button', 'btn-ghost', '查看答案版');
    ansBtn.setAttribute('aria-label', '查看答案版图片');
    ansBtn.addEventListener('click', function () {
      shareShowAnswer = !shareShowAnswer;
      img.src = drawPuzzleImage(shareShowAnswer).toDataURL('image/png');
      ansBtn.textContent = shareShowAnswer ? '返回题面版' : '查看答案版';
      img.setAttribute('alt', shareShowAnswer ? '数独答案版' : '数独打印题面');
    });
    card.appendChild(ansBtn);
    // 区块 C：二维码（v1.11）——微信「长按识别图中二维码」直接导入；浮层打开时生成一次即可
    if (window.qrcode) {
      // 中文文本需 UTF-8 编码（默认 stringToBytes 为 charCodeAt&0xff，中文会损坏；qrcode.js 自带 UTF-8 编码器）
      window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
      var qr = window.qrcode(0, 'L');
      qr.addData(shareTextForCurrent());
      qr.make();
      var n = qr.getModuleCount();
      var c = makeEl('canvas', 'share-qr');
      var size = (n + 8) * 8;          // 8px/模块 + 4 模块静区（quiet zone）
      c.width = size;
      c.height = size;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      for (var r = 0; r < n; r++) {
        for (var col = 0; col < n; col++) {
          if (qr.isDark(r, col)) {
            ctx.fillStyle = '#000000';
            ctx.fillRect((col + 4) * 8, (r + 4) * 8, 8, 8);
          }
        }
      }
      card.appendChild(c);
      card.appendChild(makeEl('div', 'share-hint', '微信：长按二维码 → 识别图中二维码 → 复制文本；或保存二维码转发。朋友在「📥 导入题目」粘贴即玩'));
    }
    // 底部
    var backBtn = makeEl('button', 'btn-ghost', '返回结算');
    backBtn.setAttribute('aria-label', '返回结算');
    backBtn.style.marginTop = '10px';
    backBtn.addEventListener('click', buildWinOverlay);
    card.appendChild(backBtn);
    ov.appendChild(card);
    document.body.appendChild(ov);
    overlayEl = ov;
  }
  function openImportOverlay() {
    // 导入浮层：粘贴 SD{N}: 文本 → 校验 → 开始导入局
    hideOverlay();
    var ov = makeEl('div', 'overlay');
    var card = makeEl('div', 'overlay-card');
    card.appendChild(makeEl('div', 'overlay-title', '📥 导入题目'));
    card.appendChild(makeEl('div', 'overlay-sub', '粘贴别人分享的题目文本（以 SD4:/SD6:/SD9: 开头）'));
    var ta = makeEl('textarea', 'import-zone', '');
    ta.rows = 4;
    ta.placeholder = 'SD4:1,0,3,4,3,4,0,2,2,1,4,3,4,3,2,1';
    ta.setAttribute('aria-label', '导入的题目文本');
    card.appendChild(ta);
    var err = makeEl('div', '', '');
    err.id = 'import-err';
    card.appendChild(err);
    var goBtn = makeEl('button', 'btn-main', '导入并开始');
    goBtn.setAttribute('aria-label', '导入并开始对局');
    goBtn.addEventListener('click', function () {
      var parsed = parsePuzzleText(ta.value);
      if (parsed.error) {
        err.textContent = parsed.error;
        return;
      }
      var sol = solveBoard(parsed.board, parsed.N);
      if (!sol) {
        err.textContent = '这道题没有唯一解，换一道试试';
        return;
      }
      startImportedGame(parsed.N, parsed.board, sol);
    });
    card.appendChild(goBtn);
    var cancelBtn = makeEl('button', 'btn-ghost', '取消');
    cancelBtn.setAttribute('aria-label', '取消导入');
    cancelBtn.addEventListener('click', hideOverlay);
    cancelBtn.style.marginTop = '8px';
    card.appendChild(cancelBtn);
    ov.appendChild(card);
    document.body.appendChild(ov);
    overlayEl = ov;
  }
  function startImportedGame(N, board, solution) {
    // 导入题开局：初始化对齐 replayRecord（盘面给定，答案用唯一解）
    hideOverlay();
    stopTimer();
    state.won = false;
    state.playing = true;
    state.replayFrom = null;
    state.createdFrom = 'import'; // v1.7：导入题不计成绩、不打卡
    var lv = findLevel(String(N));
    state.level = lv.key;
    state.N = lv.N;
    state.givens = lv.givens;
    state.puzzle = board.slice();
    state.solution = solution.slice();
    var given = [];
    var i;
    var givensCount = 0;
    for (i = 0; i < board.length; i++) {
      given.push(board[i] !== 0);
      if (board[i] !== 0) { givensCount++; }
    }
    state.given = given;
    state.givensCount = givensCount;
    state.origPuzzle = board.slice();
    state.errLog = [];
    state.hintIdx = [];
    var pencils = [];
    for (i = 0; i < board.length; i++) { pencils.push([]); }
    state.pencils = pencils;
    state.undoStack = [];
    state.hints = 0;
    state.errors = 0;
    state.selected = -1;
    state.penMode = false;
    state.errMarks = null;
    state.hintExpl = null;
    state.replayMsgShown = false;
    state.isDaily = false; // v1.12：导入局非每日挑战
    state.fromMap = -1;    // v1.13：导入局非闯关关
    state.startMs = 0;
    state.ms = 0;
    renderGameView();
    renderGameFooter();
    startTimer();
    saveCur();
  }
  /* ---------- 分享成绩（v1.7.1）：1080×1920 成绩卡 + 分享文案（无竞技对比、无排行） ---------- */
  function countLitSkills() {
    // 已点亮技巧徽章数（store.skills 中为 true 的个数）
    var n = 0;
    var k;
    for (k in store.skills) {
      if (Object.prototype.hasOwnProperty.call(store.skills, k) && store.skills[k]) { n++; }
    }
    return n;
  }
function baseSkillCount() {
    // base 技巧总数（v1.10）：排除 group==='adv' 的进阶条目——报告/徽章墙仍显示 X/4
    var n = 0;
    var i;
    for (i = 0; i < SKILLS.length; i++) {
      if (SKILLS[i].group !== 'adv') { n++; }
    }
    return n;
  }
  /* ---------- 闯关×技巧徽章联动（v1.18 X1） ---------- */
  function skillByKey(key) {
    // 按 key 在 SKILLS 中查找技巧（base/adv 通用）；未找到返回 null
    var i;
    for (i = 0; i < SKILLS.length; i++) {
      if (SKILLS[i].key === key) { return SKILLS[i]; }
    }
    return null;
  }
  function mapContains(comp, i) {
    // completed 数组是否含关卡 i（兼容 v1.13 数字项与 v1.18 {i,doneAt} 对象项）
    var k;
    for (k = 0; k < comp.length; k++) {
      var e = comp[k];
      if (typeof e === 'number') { if (e === i) { return true; } }
      else if (e && typeof e === 'object' && e.i === i) { return true; }
    }
    return false;
  }
  function mapStreakDays() {
    // v1.18 闯关连续天数：completed 各 doneAt（旧数字项无该字段跳过）去重后，从今天（或昨天）回溯连续天数
    var comp = (store.mapProgress && store.mapProgress.completed) ? store.mapProgress.completed : [];
    var set = {};
    var i;
    for (i = 0; i < comp.length; i++) {
      var e = comp[i];
      if (e && typeof e === 'object' && typeof e.doneAt === 'string' && e.doneAt) { set[e.doneAt] = true; }
    }
    var cur = new Date();
    cur.setHours(0, 0, 0, 0);
    if (!set[fmtDate(cur)]) { cur.setDate(cur.getDate() - 1); }
    var streak = 0;
    while (set[fmtDate(cur)]) {
      streak++;
      cur.setDate(cur.getDate() - 1);
    }
    return streak;
  }
  function litMapSkillCount() {
    // v1.18 闯关卡 sub「掌握技巧 Y / 6」：MAP_LEVELS 关卡涉及的技巧去重后已点亮数（分母 = SKILLS.length = 4 适龄 + 2 进阶，动态适配）
    var seen = {};
    var lit = 0;
    var i, sk;
    for (i = 0; i < MAP_LEVELS.length; i++) {
      sk = skillByKey(MAP_LEVELS[i].skill);
      if (!sk || seen[sk.key]) { continue; }
      seen[sk.key] = true;
      if (sk.group === 'adv' ? !!store.advSkills[sk.key] : !!store.skills[sk.key]) { lit++; }
    }
    return lit;
  }
  function mapSkillTotal() {
    // v1.23：MAP_LEVELS 关卡涉及的技巧去重总数（= 6：boxElim/rowColElim/blockElim/crossElim/uniqueElim/xwing）
    // ——闯关卡 sub / 成长卡 / 分享成绩卡「掌握技巧 Y / 6」分母（数对占位 nakedPair 属自由解题线，不计入闯关口径）
    var seen = {};
    var n = 0;
    var i, sk;
    for (i = 0; i < MAP_LEVELS.length; i++) {
      sk = skillByKey(MAP_LEVELS[i].skill);
      if (!sk || seen[sk.key]) { continue; }
      seen[sk.key] = true;
      n++;
    }
    return n;
  }
  function allSkillLit() {
    // v1.23：全部 SKILLS 点亮数（base→store.skills，adv→store.advSkills），分母 SKILLS.length（v1.23 = 7）——六艺精通判定
    var n = 0;
    var i;
    for (i = 0; i < SKILLS.length; i++) {
      var sk = SKILLS[i];
      if (sk.group === 'adv' ? !!store.advSkills[sk.key] : !!store.skills[sk.key]) { n++; }
    }
    return n;
  }
  function buildWeekStreakCard() {
    // v1.18 每日挑战 streak 卡：连续打卡大字 + 今日状态 + 本周 7 日圆点（全派生 store.checkin.dates，零 schema）
    var dates = (store.checkin && store.checkin.dates) ? store.checkin.dates : [];
    var set = {};
    var di;
    for (di = 0; di < dates.length; di++) { set[dates[di]] = true; }
    var streak = calcStreak(dates);
    var todayStr = fmtDate(new Date());
    var todayChecked = !!set[todayStr];
    var card = makeEl('div', 'streak-card');
    var left = makeEl('div', 'streak-left');
    left.appendChild(makeEl('div', 'streak-title', '📅 打卡日历'));
    left.appendChild(makeEl('div', 'streak-num', '' + streak));
    left.appendChild(makeEl('div', 'streak-today', todayChecked ? '✅ 今日已打卡' : '🎯 今日未完成'));
    card.appendChild(left);
    var right = makeEl('div', 'streak-week');
    var todayZero = new Date();
    todayZero.setHours(0, 0, 0, 0);
    var mon = new Date(todayZero.getTime());
    mon.setDate(todayZero.getDate() - ((todayZero.getDay() + 6) % 7)); // 本周一
    var wd = ['一', '二', '三', '四', '五', '六', '日'];
    for (var w = 0; w < 7; w++) {
      (function (idx) {
        var dd = new Date(mon.getTime());
        dd.setDate(mon.getDate() + idx);
        var ds = fmtDate(dd);
        var isToday = (ds === todayStr);
        var future = (dd.getTime() > todayZero.getTime());
        var dotCls = 'streak-dot';
        if (future) { dotCls += ' future'; }
        else if (isToday) { dotCls += ' today' + (set[ds] ? ' lit' : ''); }
        else if (set[ds]) { dotCls += ' lit'; }
        var cell = makeEl('div', 'streak-day');
        cell.appendChild(makeEl('span', dotCls, ''));
        cell.appendChild(makeEl('span', 'streak-wd', wd[idx]));
        right.appendChild(cell);
      })(w);
    }
    card.appendChild(right);
    card.appendChild(makeEl('div', 'streak-sub', '连续打卡 ' + streak + ' 天 · 明天继续哦'));
    return card;
  }
  function drawQRTo(ctx, text, x, y, size) {
    // v1.23：在给定 canvas ctx 上绘制二维码（复用内嵌 qrcode.js；UTF-8 编码；4 模块静区）
    if (!window.qrcode) { return; }
    window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
    var qr = window.qrcode(0, 'L');
    qr.addData(text);
    qr.make();
    var n = qr.getModuleCount();
    var module = size / (n + 8);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#2a3a4a';
    var r, c;
    for (r = 0; r < n; r++) {
      for (c = 0; c < n; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect(x + (c + 4) * module, y + (r + 4) * module, module + 0.5, module + 0.5);
        }
      }
    }
  }
  function drawResultCard() {
    // 分享成绩卡：浅蓝渐变底 + 装饰圆点 + 难度/星级/数据 + 迷你完成盘面 + 徽章数 + 页脚
    var W = 1080;
    var H = 1920;
    var cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    var ctx = cv.getContext('2d');
    // 浅蓝渐变背景（#eaf4ff → #ffffff）
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#eaf4ff');
    grad.addColorStop(1, '#ffffff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // 装饰圆点（顶部区域，浅蓝半透明，同贪吃蛇 share）
    ctx.fillStyle = 'rgba(150, 200, 255, 0.35)';
    var d;
    for (d = 0; d < 14; d++) {
      var rx = Math.random() * W;
      var ry = 60 + Math.random() * 380;
      ctx.beginPath();
      ctx.arc(rx, ry, 6 + Math.random() * 14, 0, Math.PI * 2);
      ctx.fill();
    }
    // 标题 / 副标题
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#2f6fbf';
    ctx.font = 'bold 90px sans-serif';
    ctx.fillText('数独思维', W / 2, 320);
    ctx.fillStyle = '#7a9ec0';
    ctx.font = '40px sans-serif';
    ctx.fillText('逻辑推理小达人', W / 2, 420);
    // 中央成绩卡（白底圆角 + 浅边框）
    var lv = findLevel(state.level);
    var stars = calcStars(state.hints, state.errors);
    ctx.fillStyle = '#ffffff';
    // 圆角矩形（Chrome 61 无 ctx.roundRect，手动 path）
    ctx.beginPath();
    ctx.moveTo(110 + 24, 500);
    ctx.lineTo(110 + 860 - 24, 500);
    ctx.quadraticCurveTo(110 + 860, 500, 110 + 860, 500 + 24);
    ctx.lineTo(110 + 860, 500 + 620 - 24);
    ctx.quadraticCurveTo(110 + 860, 500 + 620, 110 + 860 - 24, 500 + 620);
    ctx.lineTo(110 + 24, 500 + 620);
    ctx.quadraticCurveTo(110, 500 + 620, 110, 500 + 620 - 24);
    ctx.lineTo(110, 500 + 24);
    ctx.quadraticCurveTo(110, 500, 110 + 24, 500);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#dce8f5';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 难度行
    ctx.fillStyle = '#2a3a4a';
    ctx.font = 'bold 46px sans-serif';
    ctx.fillText(lv.name + ' · ' + state.N + '×' + state.N, W / 2, 610);
    // 星级（金色大字）
    ctx.fillStyle = '#f5a623';
    ctx.font = '100px sans-serif';
    ctx.fillText(starsText(stars), W / 2, 770);
    // 数据行
    ctx.fillStyle = '#3a5a7a';
    ctx.font = '44px sans-serif';
    ctx.fillText(
      '用时 ' + fmtTime(Math.round(state.ms)) + ' · 错误 ' + state.errors + ' 次 · 提示 ' + state.hints + ' 次',
      W / 2, 920);
    // 迷你完成盘面（state.solution 全量数字；已知格深色加粗，后填格天蓝）
    var gridSize = 420;
    var gx0 = (W - gridSize) / 2;
    var gy0 = 1180;
    var cell = gridSize / state.N;
    var dims = SUDOKU.boxDims(state.N);
    var br = dims[0];
    var bc = dims[1];
    var i, r, c, v;
    ctx.strokeStyle = '#9db4c8';
    ctx.lineWidth = 2;
    for (i = 0; i <= state.N; i++) {
      ctx.beginPath();
      ctx.moveTo(gx0 + i * cell, gy0);
      ctx.lineTo(gx0 + i * cell, gy0 + gridSize);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(gx0, gy0 + i * cell);
      ctx.lineTo(gx0 + gridSize, gy0 + i * cell);
      ctx.stroke();
    }
    ctx.strokeStyle = '#2a3a4a';
    ctx.lineWidth = 5;
    for (r = 0; r <= state.N; r += br) {
      ctx.beginPath();
      ctx.moveTo(gx0, gy0 + r * cell);
      ctx.lineTo(gx0 + gridSize, gy0 + r * cell);
      ctx.stroke();
    }
    for (c = 0; c <= state.N; c += bc) {
      ctx.beginPath();
      ctx.moveTo(gx0 + c * cell, gy0);
      ctx.lineTo(gx0 + c * cell, gy0 + gridSize);
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (i = 0; i < state.N * state.N; i++) {
      v = state.solution[i];
      if (v === 0) { continue; }
      r = Math.floor(i / state.N);
      c = i % state.N;
      if (state.given && state.given[i]) {
        ctx.fillStyle = '#2a3a4a';
        ctx.font = 'bold ' + Math.round(cell * 0.5) + 'px sans-serif';
      } else {
        ctx.fillStyle = '#4aa8ff';
        ctx.font = Math.round(cell * 0.5) + 'px sans-serif';
      }
      ctx.fillText('' + v, gx0 + (c + 0.5) * cell, gy0 + (r + 0.5) * cell);
    }
    // v1.23 二维码：盘面右侧（x 330-750 之外）编码题目 SD 文本——朋友扫码导入玩同款题
    drawQRTo(ctx, shareTextForCurrent(), 850, 1240, 150);
    ctx.fillStyle = '#93a8bd';
    ctx.font = '22px sans-serif';
    ctx.fillText('扫码玩同款题', 925, 1440);
    // 徽章行（v1.21：countLitSkills() base 口径 → litMapSkillCount() + SKILLS.length，对齐闯关卡 sub/成长卡口径）
    ctx.fillStyle = '#2a3a4a';
    ctx.font = '36px sans-serif';
    ctx.fillText((litMapSkillCount() > 0 ? '掌握技巧 ' + litMapSkillCount() + ' / ' + mapSkillTotal() + ' 🏆' : '技巧徽章待点亮 💪'), W / 2, 1710);
    // 页脚
    ctx.fillStyle = '#93a8bd';
    ctx.font = '34px sans-serif';
    ctx.fillText('龙爸乐学 · 数独思维', W / 2, 1810);
    ctx.fillText(fmtDate(new Date()), W / 2, 1855);
    return cv;
  }
  function shareResultText() {
    // 分享文案：仅展示自身表现（用时/错误/提示/徽章），无对比、无排行
    var lv = findLevel(state.level);
    var stars = starsText(calcStars(state.hints, state.errors));
    return '🎉 我在「数独思维」通关 ' + lv.name + ' ' + state.N + '×' + state.N + '！\n' +
      stars + ' · 用时 ' + fmtTime(Math.round(state.ms)) + ' · 错 ' + state.errors + ' 次 · 提示 ' + state.hints + ' 次\n' +
      (litMapSkillCount() > 0 ? '掌握技巧 ' + litMapSkillCount() + ' / ' + mapSkillTotal() + ' 🏆' : '技巧徽章待点亮 💪') + '\n' +
      '来一起练练脑吧～#数独 #小学生逻辑 #龙爸乐学';
  }
  function openShareResultOverlay() {
    // 分享成绩浮层：成绩卡图片 + 分享文案（可手动复制兜底）；返回结算可重建
    hideOverlay();
    var ov = makeEl('div', 'overlay');
    var card = makeEl('div', 'overlay-card');
    card.appendChild(makeEl('div', 'overlay-title', '📤 分享成绩'));
    // 成绩卡图片
    var img = makeEl('img', 'share-img');
    img.src = drawResultCard().toDataURL('image/png');
    img.setAttribute('alt', '数独成绩分享卡');
    card.appendChild(img);
    card.appendChild(makeEl('div', 'share-hint', '📸 长按保存图片 · 分享到小红书 / 朋友圈 · 在微信里长按图片可保存或转发给朋友'));
    // 分享文案（只读，可手动复制兜底）
    var ta = makeEl('textarea', 'export-zone', shareResultText());
    ta.readOnly = true;
    ta.setAttribute('aria-label', '分享成绩文案');
    card.appendChild(ta);
    var copyBtn = makeEl('button', 'btn-main', '复制分享文案');
    copyBtn.setAttribute('aria-label', '复制分享文案');
    copyBtn.addEventListener('click', function () {
      if (copyTextViaExecCommand(ta)) {
        toast('✅ 文案已复制，去粘贴发布吧');
      } else {
        toast('复制失败，请长按文本手动复制');
      }
    });
    card.appendChild(copyBtn);
    // 返回结算
    var backBtn = makeEl('button', 'btn-ghost', '返回结算');
    backBtn.setAttribute('aria-label', '返回结算');
    backBtn.style.marginTop = '8px';
    backBtn.addEventListener('click', buildWinOverlay);
    card.appendChild(backBtn);
    ov.appendChild(card);
    document.body.appendChild(ov);
    overlayEl = ov;
  }
  function newRound(levelKey, seed) {
    clearCur(); // 新局生成：旧断局快照作废
    var lv = findLevel(levelKey);
    // v1.12：seed 存在 → 临时替换 Math.random 为种子 PRNG（solver.js 零改动）；否则普通随机
    var g;
    if (seed) {
      var origRandom = Math.random;
      Math.random = mulberry32(seed);
      try { g = SUDOKU.genPuzzle(lv.N, lv.givens); }
      finally { Math.random = origRandom; }
    } else {
      g = SUDOKU.genPuzzle(lv.N, lv.givens);
    }
    state.level = lv.key;
    state.N = lv.N;
    state.givens = lv.givens;
    state.givensCount = g.givensCount;
    state.puzzle = g.puzzle.slice();
    state.solution = g.solution.slice();
    var given = [];
    for (var i = 0; i < g.puzzle.length; i++) { given.push(g.puzzle[i] !== 0); }
    state.given = given;
    var pencils = [];
    for (var j = 0; j < g.puzzle.length; j++) { pencils.push([]); } // 铅笔笔记：初始全空
    state.pencils = pencils;
    state.penMode = false;
    state.selected = -1;
    state.hints = 0;
    state.errors = 0;
    state.undoStack = [];
    state.won = false;
    state.playing = true;
    state.startMs = 0;
    state.ms = 0;
    // v1.6：会话字段重置（新局从零追踪）
    state.origPuzzle = state.puzzle.slice(); // 原始盘面快照（错题本/收藏本追踪依据）
    state.errLog = [];
    state.hintIdx = [];
    state.errMarks = null;
    state.hintExpl = null;
    state.replayFrom = null;
    state.createdFrom = 'normal'; // v1.7：新生成局为普通来源（正常计成绩）
    state.isDaily = false;        // v1.12：新局非每日挑战（startDaily 在 newRound 之后置 true）
    state.fromMap = -1;           // v1.13：新局非闯关关（startMapLevel 在 newRound 之后置关卡号）
  }
  function startGame(levelKey) {
    if (!SUDOKU) {
      viewEl.textContent = '算法模块缺失，请检查 solver.js';
      return;
    }
    suggestedName = null; // v1.10 E5：进入任一局即消费/清除降档建议
    newRound(levelKey);
    renderGameView();
    renderGameFooter();
    startTimer(); // 计时从游戏页渲染开始（数独整局计时）
  }
  function startDaily() {
    // v1.12/v1.17：每日挑战——当日难度（周轮换）+ 当日种子同题（计入普通成绩打卡；无竞技）
    suggestedName = null; // 每日挑战同样消费降档建议
    var todayDiff = DAILY_DIFFS[new Date().getDay()]; // v1.17：难度轮换（4/6/9）
    newRound(todayDiff, dailySeed());
    state.isDaily = true;
    renderGameView();
    renderGameFooter();
    startTimer();
  }
  function startMapLevel(i) {
    // v1.13：闯关开局——seed 固定 → 同关同题（可复玩/分享）；计入普通成绩打卡
    suggestedName = null;
    var ml = MAP_LEVELS[i];
    newRound(ml.levelKey, ml.seedBase);
    state.fromMap = i;
    state.isDaily = false;
    renderGameView();
    renderGameFooter();
    startTimer();
  }
  function resumeGame() {
    // 断局恢复：从 store.cur 还原并续玩
    if (!SUDOKU) {
      viewEl.textContent = '算法模块缺失，请检查 solver.js';
      return;
    }
    if (!restoreCur()) { showDifficultyView(); return; }
    // v1.6：断局恢复会话字段（旧版快照无 origPuzzle → null，错题提交自动跳过）
    state.origPuzzle = (store.cur && store.cur.origPuzzle) ? store.cur.origPuzzle.slice() : null;
    state.errLog = [];
    state.hintIdx = [];
    state.errMarks = null;
    state.hintExpl = null;
    state.replayFrom = null;
    state.createdFrom = 'normal'; // v1.7：断局恢复按普通局计成绩（cur 快照不存 createdFrom）
    state.isDaily = false;        // v1.12：断局恢复非每日挑战
    state.fromMap = -1;           // v1.13：断局恢复非闯关关
    renderGameView();
    renderGameFooter();
    startTimer();
  }
  function backToDifficulty() {
    // v1.6：离开未完成的普通对局 → 提交错题记录（win 后不重复提交）
    if (state.playing && !state.won && state.origPuzzle) { commitMistake('quit'); }
    hideOverlay();
    stopTimer();
    showDifficultyView();
  }
  function restartRound() {
    hideOverlay();
    newRound(state.level);
    renderGameView();
    renderGameFooter();
    startTimer();
  }

  /* ---------- 结算浮层 ---------- */
  function hideOverlay() {
    if (overlayEl && overlayEl.parentNode) {
      overlayEl.parentNode.removeChild(overlayEl);
    }
    overlayEl = null;
  }
  function showOverlay(title, sub, noteLines, btns) {
    hideOverlay();
    var ov = makeEl('div', 'overlay');
    var card = makeEl('div', 'overlay-card');
    card.appendChild(makeEl('div', 'overlay-title', title));
    if (sub) { card.appendChild(makeEl('div', 'overlay-sub', sub)); }
    var sum = makeEl('div', 'summary');
    for (var i = 0; i < noteLines.length; i++) {
      sum.appendChild(makeEl('div', noteLines[i].cls, noteLines[i].text));
    }
    card.appendChild(sum);
    var btnsBox = makeEl('div', 'overlay-btns');
    for (var j = 0; j < btns.length; j++) {
      (function (b) {
        var btn = makeEl('button', b.cls, b.text);
        btn.addEventListener('click', function () { b.act(); });
        btnsBox.appendChild(btn);
      })(btns[j]);
    }
    card.appendChild(btnsBox);
    ov.appendChild(card);
    document.body.appendChild(ov);
    overlayEl = ov;
  }

  /* ---------- 规则教学（v1.3） ---------- */
  // 4×4 演示盘（空格即「缺谁」引导题）：唯一解验证通过
  var TEACH_BOARD = [1, 0, 3, 4, 3, 4, 0, 2, 2, 1, 4, 3, 4, 3, 2, 1];
  var TEACH_STEPS = [
    { t: '每一行', text: '每一行里，数字 1-4 只能出现一次。看看这一行，缺了哪个数字？', hl: [0, 1, 2, 3] },
    { t: '每一列', text: '每一列里，也只能出现一次。这一列缺了哪个数字？', hl: [1, 5, 9, 13] },
    { t: '每个宫', text: '每个粗线小方格（宫）里，也只能出现一次。这个宫里缺了哪个数字？', hl: [0, 1, 4, 5] },
    { t: '开动小脑瓜', text: '找到缺的数字填进去，每行、每列、每宫都不重复，全部填对就过关啦！点「开始挑战」玩一局吧。', hl: null }
  ];
  var teachIdx = 0;
  var teachEls = null;
  function renderTeachBoard() {
    var box = teachEls.board;
    clearNode(box);
    var step = TEACH_STEPS[teachIdx];
    for (var i = 0; i < 16; i++) {
      (function (idx) {
        var r = Math.floor(idx / 4);
        var c = idx % 4;
        var cell = makeEl('div', 'teach-cell');
        if (r % 2 === 0) { cell.className = 'teach-cell box-t'; }
        if (c % 2 === 0) { cell.className = cell.className + ' box-l'; }
        var v = TEACH_BOARD[idx];
        if (v) {
          cell.appendChild(makeEl('span', 'teach-num', '' + v));
        } else {
          cell.appendChild(makeEl('span', 'teach-q', '?'));
        }
        if (step.hl && step.hl.indexOf(idx) >= 0) { cell.className = cell.className + ' hl'; }
        box.appendChild(cell);
      })(i);
    }
  }
  function showTeachStep() {
    var st = TEACH_STEPS[teachIdx];
    teachEls.title.textContent = st.t;
    teachEls.text.textContent = st.text;
    teachEls.next.textContent = teachIdx === TEACH_STEPS.length - 1 ? '开始挑战' : '下一步';
    teachEls.prev.style.display = teachIdx === 0 ? 'none' : '';
    renderTeachBoard();
  }
  function openTeach() {
    teachIdx = 0;
    var ov = makeEl('div', 'overlay');
    var card = makeEl('div', 'overlay-card teach-card');
    teachEls = {
      title: makeEl('div', 'teach-title', ''),
      text: makeEl('div', 'teach-text', ''),
      board: makeEl('div', 'teach-board')
    };
    card.appendChild(teachEls.title);
    card.appendChild(teachEls.text);
    card.appendChild(teachEls.board);
    var nav = makeEl('div', 'overlay-btns');
    var prev = makeEl('button', 'btn-ghost', '上一步');
    prev.setAttribute('aria-label', '上一步');
    prev.addEventListener('click', function () {
      if (teachIdx > 0) { teachIdx--; showTeachStep(); sndClick(); }
    });
    var next = makeEl('button', 'btn-main', '下一步');
    next.setAttribute('aria-label', '下一步');
    next.addEventListener('click', function () {
      sndClick();
      if (teachIdx < TEACH_STEPS.length - 1) {
        teachIdx++;
        showTeachStep();
      } else {
        hideOverlay();
        teachEls = null;
      }
    });
    var skip = makeEl('button', 'btn-ghost', '跳过');
    skip.setAttribute('aria-label', '跳过教学');
    skip.addEventListener('click', function () { sndClick(); hideOverlay(); teachEls = null; });
    nav.appendChild(prev);
    nav.appendChild(next);
    nav.appendChild(skip);
    card.appendChild(nav);
    ov.appendChild(card);
    document.body.appendChild(ov);
    overlayEl = ov;
    teachEls.prev = prev;
    teachEls.next = next;
    showTeachStep();
  }

  /* ---------- 技巧教学关（v1.4） ---------- */
  // 内嵌教学盘面（独立于普通局）：单宫排除——宫内有 N-1 种数字 → 剩余格唯一可填
  // 盘面唯一解已验证：空格 (0,1)=2（宫0 有 1,3,4 缺 2）、(1,2)=1（宫1 有 3,4,2 缺 1）
  var SKILLS = [
    {
      key: 'boxElim',
      name: '单宫排除',
      tip: '看一个宫：已经有 1、2、3，缺哪个就填哪个',
      N: 4,
      board: [1, 0, 3, 4, 3, 4, 0, 2, 2, 1, 4, 3, 4, 3, 2, 1],
      steps: [
        { text: '看左上这个宫（粗线框）：已经有 1、3、4，缺 2！点这个空格，再点数字 2。', cell: 1, num: 2, hl: [0, 1, 4, 5] },
        { text: '再看右上这个宫：已经有 3、4、2，缺 1！点这个空格，再点数字 1。', cell: 6, num: 1, hl: [2, 3, 6, 7] }
      ],
      done: '太棒啦！你学会了「单宫排除」——看一个宫里缺哪个数，就填哪个！'
    },
    // 行列排除：solution 唯一性已验证——idx2 行/列均缺 3，idx7 行/列均缺 2，无分支
    {
      key: 'rowColElim',
      name: '行列排除',
      tip: '看这一行或这一列：已经有的数，缺哪个就填哪个',
      N: 4,
      board: [1, 2, 0, 4, 3, 4, 1, 0, 2, 1, 4, 3, 4, 3, 2, 1],
      steps: [
        { text: '看这一行（浅蓝横排）：已经有 1、2、4，缺 3！点这个空格，再点数字 3。', cell: 2, num: 3, hl: [0, 1, 2, 3] },
        { text: '再看这一列（浅蓝竖列）：已经有 1、3、4，缺 2！点这个空格，再点数字 2。', cell: 7, num: 2, hl: [3, 7, 11, 15] }
      ],
      done: '太棒啦！你学会了「行列排除」——看一行或一列里缺哪个数，就填哪个！'
    },
    // 区块排除：solution 唯一性已验证——idx2 列缺 4 唯一可填，填后 idx7 宫/行只剩 3
    {
      key: 'blockElim',
      name: '区块排除',
      tip: '看一个宫：宫里缺两个数时，用行和列的线索判断每个空格填什么',
      N: 4,
      board: [2, 3, 0, 1, 4, 1, 2, 0, 1, 4, 3, 2, 3, 2, 1, 4],
      steps: [
        { text: '看这个宫（粗线框）：缺 3 和 4。右边的空格，它的竖列已经有 4 了，所以 4 只能放这里！点这个空格，再点数字 4。', cell: 2, num: 4, hl: [2, 3, 6, 7] },
        { text: '剩下这个空格：宫里只剩 3 了！点它，再点数字 3。', cell: 7, num: 3, hl: [2, 3, 6, 7] }
      ],
      done: '太棒啦！你学会了「区块排除」——宫里缺的数，用行和列一起判断！'
    },
    // 交叉排除：solution 唯一性已验证——行/列/宫三源交集唯一（(0,3)=4：(1,4)∩(2,4)∩(1,2,4)；(1,3)=2：(1,2)∩(2,4)∩(1,2,4)）
    {
      key: 'crossElim',
      name: '交叉排除',
      tip: '交叉排除：行、列、宫三个方向交叉看，缺的数交集里只剩一个，就是答案',
      N: 4,
      board: [0, 2, 3, 0, 3, 4, 0, 0, 2, 1, 4, 3, 0, 0, 2, 1],
      steps: [
        { text: '看这个格子（右上角）：这一行缺 1、4，这一列缺 2、4，这个宫缺 1、2、4——行、列、宫交叉起来，只有 4 三个方向都缺！点这个空格，再点数字 4。', cell: 3, num: 4, hl: [0, 1, 2, 3, 7, 11, 15] },
        { text: '再看这个格子：这一行缺 1、2，这一列缺 2、4，这个宫缺 1、2、4——只有 2 三个方向都缺！点这个空格，再点数字 2。', cell: 7, num: 2, hl: [3, 4, 5, 6, 7, 11, 15] }
      ],
      done: '太棒啦！你学会了「交叉排除」——行、列、宫三个方向一起看，交叉起来答案就出来了！'
    },
    // 唯一余数（v1.10，进阶 adv）：空格 2/11/21/30，解唯一已用求解器验证——三个方向线索交集只剩一个数
    {
      key: 'uniqueElim',
      name: '唯一余数',
      group: 'adv',
      tip: '唯一余数：只看这一格——它所在的行、列、宫都不让它填别的数，那它就只能填那个数',
      N: 6,
      board: [1, 2, 0, 4, 5, 6, 4, 5, 6, 1, 2, 0, 2, 3, 1, 5, 6, 4, 5, 6, 4, 0, 3, 1, 3, 1, 2, 6, 4, 5, 0, 4, 5, 3, 1, 2],
      steps: [
        { text: '看这个格子（浅蓝）：它所在的这一行缺 2、这一列缺 2、这个宫也缺 2——三个方向的线索都指向同一个数字 2！点这个空格，再点数字 2。', cell: 21, num: 2, hl: [3, 9, 15, 18, 19, 22, 23, 21] },
        { text: '再看这个格子：行、列、宫三个方向都缺 3，其它数字都被排除——填 3！点这个空格，再点数字 3。', cell: 2, num: 3, hl: [0, 1, 3, 4, 5, 8, 14, 20, 26, 32, 2] }
      ],
      done: '真棒！你学会了「唯一余数」——锁定一格的行、列、宫线索，唯一能填的数就出来了！'
    },
    // X-Wing（v1.10，进阶 adv）：数字 4 在第 1/4 行都被锁在第 1/3 列（矩形）→ 其它行排除；
    // 完整解 2 个但教学按引导落子完成，不需全局唯一（引导即填即对）
    {
      key: 'xwing',
      name: 'X-Wing',
      group: 'adv',
      tip: 'X-Wing：一个数字在两行都被锁在同样两列（矩形），其它行就能排除它',
      N: 6,
      board: [0, 5, 0, 6, 1, 2, 0, 6, 2, 0, 5, 3, 6, 2, 5, 1, 3, 4, 0, 1, 0, 2, 6, 5, 5, 4, 1, 3, 2, 6, 2, 3, 6, 5, 4, 1],
      steps: [
        { text: '看第 1 行和第 4 行（浅蓝矩形）：数字 4 在它们里都只能放在第 1 列或第 3 列 → 4 被锁在这两行两列的矩形里！那第 2 行这个格子，它这一竖列里 4 已经被矩形占住，所以它不能填 4 → 只能填 1！点这个空格，再点数字 1。', cell: 6, num: 1, hl: [0, 2, 18, 20] },
        { text: '再看第 2 行：4 不能放刚才那格了，这一行只有这个位置能放 4 → 点它，再点数字 4。', cell: 9, num: 4, hl: [7, 8, 10, 11, 9] }
      ],
      done: '真厉害！你学会了「X-Wing」——用两行两列的矩形锁住一个数字，其它格子就知道排除它了！'
    },
    // 数对占位（v1.23，进阶 adv）：行内两格候选同为 {1,2} 数对占位 → 同行动掉 1/2 后唯一（唯一解已验证：idx20=4、idx23=1）
    {
      key: 'nakedPair',
      name: '数对占位',
      group: 'adv',
      tip: '数对占位：一行里有两个格都只能填同样的两个数，那这一行其它格就不能再填它们了',
      N: 6,
      board: [1, 2, 3, 4, 5, 0, 0, 5, 6, 0, 2, 3, 0, 0, 0, 5, 6, 4, 5, 6, 0, 0, 3, 0, 0, 1, 2, 0, 4, 5, 0, 0, 5, 3, 1, 0],
      steps: [
        { text: '看这一行（浅蓝横排）：第 4、6 格都只能填 1 或 2——它们俩把 1、2「占位」了！那这一行其它格就不能再填 1、2。看第 3 格：它本来可以填 1、4，现在 1 被占 → 只能填 4！点这个空格，再点数字 4。', cell: 20, num: 4, hl: [18, 19, 20, 21, 22, 23] },
        { text: '再看数对里的这个格子：它这一竖列已经有 6、3、4、5、2 → 只剩 1 能填！点这个空格，再点数字 1。', cell: 23, num: 1, hl: [18, 19, 20, 21, 22, 23] }
      ],
      done: '真棒！你学会了「数对占位」——两个格锁住同样的两个数，其它格就知道排除它们了！'
    }
  ];
  var skill = {
    active: false,
    idx: -1,        // SKILLS 下标
    step: 0,        // 当前引导步
    board: [],      // 教学关盘面（可填状态）
    given: [],      // 已知格标记
    selected: -1,   // 当前选中格
    cells: []       // 教学关格子 DOM
  };
  var badgeFrom = 'difficulty'; // 技巧教学返回去向：'difficulty' 难度页 / 'badgewall' 徽章墙
  function skillLevel() { return SKILLS[skill.idx]; }
  function renderSkillHeader(title) {
    clearNode(headerEl);
    var brand = makeEl('div', 'header-brand');
    var icon = makeEl('img', 'header-icon');
    icon.alt = '';
    icon.src = './assets/icon.png';
    brand.appendChild(icon);
      brand.appendChild(makeEl('span', 'header-title', title || (APP.meta && APP.meta.name ? APP.meta.name : '数独思维')));
    if (APP.meta && APP.meta.version) {
      brand.appendChild(makeEl('span', 'header-ver', 'v' + APP.meta.version));
    }
    headerEl.appendChild(brand);
  }
  function renderSkillView() {
    clearNode(viewEl);
    var lv = skillLevel();
    skill.cells = [];
    // 顶栏：返回 + 技巧名
    var topbar = makeEl('div', 'topbar');
    var btnBack = makeEl('button', 'btn-ghost-sm', '← 返回');
    btnBack.setAttribute('aria-label', '返回难度选择');
    btnBack.addEventListener('click', function () { exitSkill(); });
    topbar.appendChild(btnBack);
    var title = makeEl('span', 'level-title', '🎯 ' + lv.name);
    title.appendChild(makeEl('small', '', '教学关 · 不计入进度'));
    topbar.appendChild(title);
    viewEl.appendChild(topbar);
    // 棋盘
    var card = makeEl('div', 'board-card');
    var board = makeEl('div', 'board');
    board.id = 'skill-board';
    var pct = colPct(lv.N);
    var br = SUDOKU.boxDims(lv.N)[0];
    var bc = SUDOKU.boxDims(lv.N)[1];
    for (var i = 0; i < lv.N * lv.N; i++) {
      (function (idx) {
        var r = Math.floor(idx / lv.N);
        var c = idx % lv.N;
        var cell = makeEl('div', 'cell');
        cell.style.width = pct;
        cell.style.paddingBottom = pct;
        if (r % br === 0 && r > 0) { cell.className = 'cell box-t'; }
        if (c % bc === 0 && c > 0) { cell.className = cell.className + ' box-l'; }
        var inner = makeEl('div', 'cell-inner');
        inner.style.fontSize = cellFont(lv.N);
        cell.appendChild(inner);
        cell.addEventListener('click', function () { skillSelect(idx); });
        skill.cells[idx] = cell;
        board.appendChild(cell);
      })(i);
    }
    card.appendChild(board);
    viewEl.appendChild(card);
    // 引导文字
    var msgEl = makeEl('div', 'sudoku-msg', lv.tip);
    msgEl.id = 'skill-msg';
    viewEl.appendChild(msgEl);
    // 数字条（1..N）
    var kbd = makeEl('div', 'num-kbd');
    var row = makeEl('div', 'num-row');
    for (var v = 1; v <= lv.N; v++) {
      (function (val) {
        var b = makeEl('button', 'num-btn', '' + val);
        b.setAttribute('aria-label', '填数字 ' + val);
        b.addEventListener('click', function () { skillNumTap(val); });
        row.appendChild(b);
      })(v);
    }
    kbd.appendChild(row);
    viewEl.appendChild(kbd);
    refreshSkillCells();
  }
  function refreshSkillCells() {
    // 两层渲染（与普通局同构）：宫界线/目标格画在外层 .cell，已知/高亮/选中画在内层 .cell-inner
    var lv = skillLevel();
    var st = lv.steps[skill.step];
    var dims = SUDOKU.boxDims(lv.N);
    for (var i = 0; i < skill.cells.length; i++) {
      var cell = skill.cells[i];
      var inner = cell.firstChild;
      var r = Math.floor(i / lv.N);
      var c = i % lv.N;
      // 外层：宫界线（box-t/box-l）+ 目标格蓝框（选中且为目标格时以外层蓝框替代内层橙框，避免双重高亮）
      var cls = 'cell';
      if (r % dims[0] === 0 && r > 0) { cls += ' box-t'; }
      if (c % dims[1] === 0 && c > 0) { cls += ' box-l'; }
      var isTarget = (i === skill.selected && st && st.cell === i);
      if (isTarget) { cls += ' target'; }
      cell.className = cls;
      // 内层：已知格浅灰底 + 同行/列/宫高亮浅蓝 + 选中橙框（目标格不叠加 selected）
      var icls = 'cell-inner';
      if (skill.given[i]) { icls += ' given'; }
      if (st && st.hl && st.hl.indexOf(i) >= 0) { icls += ' peer'; }
      if (i === skill.selected && !isTarget) { icls += ' selected'; }
      inner.className = icls;
      clearNode(inner);
      var v = skill.board[i];
      if (v) { inner.appendChild(makeEl('span', 'skill-num', '' + v)); }
    }
  }
  function skillSelect(i) {
    if (skill.given[i]) { showSkillMsg('这是题目给的格子，不用填'); return; }
    if (skill.board[i] !== 0) { showSkillMsg('这格已填好，看下一步的格子哦'); return; }
    skill.selected = (skill.selected === i) ? -1 : i;
    refreshSkillCells();
    sndClick();
  }
  function skillNumTap(v) {
    var lv = skillLevel();
    var st = lv.steps[skill.step];
    if (skill.selected < 0) { showSkillMsg('先点一个空格子，再选数字哦'); return; }
    var i = skill.selected;
    if (skill.given[i]) { showSkillMsg('这是题目给的格子，不用填'); return; }
    if (i === st.cell && v === st.num) {
      // 引导目标：落子成功，推进下一步
      skill.board[i] = v;
      skill.selected = -1;
      sndCorrect();
      skill.step++;              // 先推进步进，再刷新高亮（否则高亮停留在上一步约束组）
      refreshSkillCells();
      if (skill.step >= lv.steps.length) {
        // 教学关完成：点亮徽章（进阶技巧写入独立 advSkills，不吹 base 适龄徽章）
        if (lv.group === 'adv') { store.advSkills[lv.key] = true; } else { store.skills[lv.key] = true; }
        saveStore();
        showSkillMsg(lv.done);
        sndWin();
        if (lv.group === 'adv') {
          // v1.10：进阶徽章弹窗（独立于适龄徽章体系）
          showOverlay('🎉 学会啦！', '「' + lv.name + '」进阶徽章已点亮',
            [{ cls: 'checkin-line', text: '💎 进阶技巧 · 不计入适龄徽章' },
             { cls: 'record-badge', text: '教学关完成，不计入普通进度' }],
            [{ text: '再来一局', cls: 'btn-ghost', act: exitSkill },
             { text: '返回难度', cls: 'btn-main', act: exitSkill }]);
        } else {
          showOverlay('🎉 学会啦！', '「' + lv.name + '」徽章已点亮',
            [{ cls: 'checkin-line', text: '🎯 技巧徽章 · ' + lv.name },
             { cls: 'record-badge', text: '教学关完成，不计入普通进度' }],
            [{ text: '再来一局', cls: 'btn-ghost', act: exitSkill },
             { text: '返回难度', cls: 'btn-main', act: exitSkill }]);
        }
      } else {
        showSkillMsg(lv.steps[skill.step].text);
      }
    } else {
      // 非目标：温和提示，不计错
      sndWrong();
      showSkillMsg('看高亮的地方：已经有哪几个数？缺的就是答案哦');
      refreshSkillCells();
    }
  }
  function showSkillMsg(text) {
    var msgEl = document.getElementById('skill-msg');
    if (msgEl) { msgEl.textContent = text; }
  }
  function openSkill(k, from) {
    if (SKILLS[k].locked) { return; } // 锁定占位卡（徽章墙灰卡）不可打开
    badgeFrom = from || 'difficulty'; // 记录返回去向：徽章墙进入 → 教学完返回徽章墙
    hideOverlay();
    state.playing = false; // 教学关不是普通局：键盘不响应
    var lv = SKILLS[k];
    skill.active = true;
    skill.idx = k;
    skill.step = 0;
    skill.selected = -1;
    skill.board = lv.board.slice();
    var given = [];
    for (var i = 0; i < lv.board.length; i++) { given.push(lv.board[i] !== 0); }
    skill.given = given;
    renderSkillHeader('技巧教学');
    renderSkillView();
  }
  function exitSkill() {
    // 按进入来源返回：徽章墙 → 徽章墙；自由解题 → 自由解题；其余 → 难度页
    hideOverlay();
    skill.active = false;
    skill.idx = -1;
    if (badgeFrom === 'badgewall') { showBadgeWallView(); }
    else if (badgeFrom === 'adv') { showAdvView(); } // v1.10：进阶技巧返回「自由解题」
    else { showDifficultyView(); }
  }

  /* ---------- 打卡 ---------- */
  function doCheckin() {
    if (!store.checkin) { store.checkin = { dates: [], streak: 0 }; }
    var today = fmtDate(new Date());
    var dates = store.checkin.dates || [];
    if (dates.indexOf(today) < 0) { dates.push(today); }
    dates.sort();
    while (dates.length > 365) { dates.shift(); } // 滚动 365 天
    store.checkin.dates = dates;
    store.checkin.streak = calcStreak(dates);
  }

  /* ---------- 渲染：打卡日历视图 ---------- */
  function showCheckinView() {
    hideOverlay();
    stopTimer();
    state.won = false;
    state.playing = false;
    renderHeader('打卡日历');
    clearNode(viewEl);
    var card = makeEl('div', 'calendar');
    card.appendChild(makeEl('div', 'page-title', '本月打卡'));
    var grid = makeEl('div', 'calendar-grid');
    var now = new Date();
    var days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var t = fmtDate(now);
    var dates = store.checkin.dates || [];
    for (var d = 1; d <= days; d++) {
      (function (day) {
        var ds = fmtDate(new Date(now.getFullYear(), now.getMonth(), day));
        var el = makeEl('div', 'cal-day', '' + day);
        if (dates.indexOf(ds) !== -1) { el.className = 'cal-day done'; }
        if (ds === t) { el.className += ' today'; }
        grid.appendChild(el);
      })(d);
    }
    card.appendChild(grid);
    var streak = calcStreak(dates);
    var info = makeEl('div', 'streak-info');
    info.appendChild(document.createTextNode('连续打卡 '));
    var b = makeEl('b', '', '' + streak);
    info.appendChild(b);
    info.appendChild(document.createTextNode(' 天' + (streak >= 7 ? ' 🎉' : '')));
    card.appendChild(info);
    viewEl.appendChild(card);
    // 底栏：返回难度
    clearNode(footerEl);
    var btnBack = makeEl('button', 'btn-checkin', '← 返回难度');
    btnBack.setAttribute('aria-label', '返回难度选择');
    btnBack.addEventListener('click', showDifficultyView);
    footerEl.appendChild(btnBack);
  }
  /* ---------- 家长报告（v1.9）：只读本地数据，不写任何 store 字段 ---------- */
  function dsNum(s) {
    // 'YYYYMMDD' 转可比较整数（同长度日期字符串可直接比较）
    return parseInt(s, 10);
  }
  function historyInRange(days) {
    // 近 {days} 天（含今天）的对局记录：按 date >= 今天-{days} 过滤 store.history
    var from = dsNum(fmtDate(new Date(Date.now() - days * 86400000)));
    var out = [];
    var i;
    for (i = 0; i < store.history.length; i++) {
      if (dsNum(store.history[i].date) >= from) { out.push(store.history[i]); }
    }
    return out;
  }
  function showReportView() {
    // 家长报告视图（v1.9）：今日反馈 + 近 7 天（难度分布/总用时/技巧掌握度），结构对齐 showCheckinView
    hideOverlay();
    stopTimer();
    state.won = false;
    state.playing = false;
    renderHeader('家长报告');
    clearNode(viewEl);
    viewEl.appendChild(makeEl('div', 'page-title', '家长报告'));
    viewEl.appendChild(makeEl('div', 'home-hint', '数据只保存在本机，不上传'));
    // 卡片 A：今日反馈
    var today = fmtDate(new Date());
    var todayList = [];
    var i;
    for (i = 0; i < store.history.length; i++) {
      if (store.history[i].date === today) { todayList.push(store.history[i]); }
    }
    var cardA = makeEl('div', 'report-card');
    cardA.appendChild(makeEl('div', 'report-card-title', '📅 今日反馈'));
    if (todayList.length === 0) {
      cardA.appendChild(makeEl('div', 'report-empty', '今天还没完成对局'));
    } else {
      var sumMs = 0, sumErr = 0, sumHint = 0, sumStars = 0;
      for (i = 0; i < todayList.length; i++) {
        sumMs += todayList[i].ms;
        sumErr += todayList[i].errors;
        sumHint += todayList[i].hints;
        sumStars += todayList[i].stars;
      }
      cardA.appendChild(makeEl('div', 'report-row',
        '完成 ' + todayList.length + ' 局 · 平均用时 ' + fmtTime(Math.round(sumMs / todayList.length))));
      cardA.appendChild(makeEl('div', 'report-row', '错误合计 ' + sumErr + ' 次 · 提示合计 ' + sumHint + ' 次'));
      cardA.appendChild(makeEl('div', 'report-row',
        '平均星级 ' + (Math.round(sumStars / todayList.length * 10) / 10) + ' ★'));
    }
    viewEl.appendChild(cardA);
    // 卡片 B：近 7 天
    var week = historyInRange(7);
    var cardB = makeEl('div', 'report-card');
    cardB.appendChild(makeEl('div', 'report-card-title', '📆 近 7 天'));
    if (week.length === 0) {
      cardB.appendChild(makeEl('div', 'report-empty', '近 7 天还没完成对局'));
    } else {
      var weekMs = 0;
      for (i = 0; i < week.length; i++) { weekMs += week[i].ms; }
      cardB.appendChild(makeEl('div', 'report-row', '完成 ' + week.length + ' 局 · 总用时 ' + fmtBestTime(weekMs)));
      // 难度分布（按 LEVELS 逐难度统计局数）
      var distParts = [];
      var li;
      for (li = 0; li < LEVELS.length; li++) {
        var cnt = 0;
        var j;
        for (j = 0; j < week.length; j++) {
          if (week[j].level === LEVELS[li].key) { cnt++; }
        }
        distParts.push(LEVELS[li].name + ' ' + LEVELS[li].N + '×' + LEVELS[li].N + '：' + cnt + ' 局');
      }
      cardB.appendChild(makeEl('div', 'report-dist', distParts.join(' · ')));
      // 技巧掌握度：适龄 4 枚徽章点亮状态（lit ✅ / 未点亮 🎯；adv 进阶技巧不吹适龄徽章，仅列 base）
      var skillParts = [];
      for (li = 0; li < SKILLS.length; li++) {
        if (SKILLS[li].group === 'adv') { continue; }
        var lit = !!store.skills[SKILLS[li].key];
        skillParts.push((lit ? '✅ ' : '🎯 ') + SKILLS[li].name);
      }
cardB.appendChild(makeEl('div', 'report-badge-line', skillParts.join(' ')));
      cardB.appendChild(makeEl('div', 'report-row', countLitSkills() + '/' + baseSkillCount() + ' 枚技巧徽章已点亮'));
      // v1.22 进阶分区：适龄 X/4 保持，进阶 2 枚独立展示（✨ 已点亮 / 💎 未点亮），不混入适龄口径
      var advLit = 0;
      var advTotal = 0;
      var advParts = [];
      for (li = 0; li < SKILLS.length; li++) {
        if (SKILLS[li].group !== 'adv') { continue; }
        advTotal++;
        var alit = !!store.advSkills[SKILLS[li].key];
        if (alit) { advLit++; }
        advParts.push((alit ? '✨ ' : '💎 ') + SKILLS[li].name);
      }
      if (advTotal > 0) {
        cardB.appendChild(makeEl('div', 'report-badge-line', advParts.join(' ')));
        cardB.appendChild(makeEl('div', 'report-row', advLit + '/' + advTotal + ' 进阶技巧已点亮'));
      }
    }
    viewEl.appendChild(cardB);
    // 卡片 C：成长进度（v1.16）——每日挑战/成就/闯关地图，全派生零新 schema
    var cardC = makeEl('div', 'report-card');
    cardC.appendChild(makeEl('div', 'report-card-title', '📈 成长进度'));
    // 每日挑战行
    var dailyOk = !!(store.daily && store.daily.date === today);
    var streakN = (store.checkin && store.checkin.streak) ? store.checkin.streak : 0;
    cardC.appendChild(makeEl('div', 'report-row',
      dailyOk ? '✅ 今日每日挑战已完成 · 连续打卡 ' + streakN + ' 天' : '🎯 今日每日挑战未完成'));
    // 成就行（含最近解锁，取 store.achievements 日期最大者）
    var achCount = countAchievements();
    var achParts = '🏅 已解锁成就 ' + achCount + ' / ' + ACHIEVEMENTS.length + ' 枚';
    if (achCount > 0) {
      var latestName = '';
      var latestTs = 0;
      var ai2;
      for (ai2 = 0; ai2 < ACHIEVEMENTS.length; ai2++) {
        var aTs = store.achievements[ACHIEVEMENTS[ai2].key];
        if (aTs && dsNum(aTs) > latestTs) { latestTs = dsNum(aTs); latestName = ACHIEVEMENTS[ai2].name; }
      }
      if (latestName) { achParts += ' · 最近：' + latestName; }
    }
    cardC.appendChild(makeEl('div', 'report-row', achParts));
    // 闯关地图行（当前进度关 + 档位）
    var mapDone = (store.mapProgress && store.mapProgress.completed) ? store.mapProgress.completed.length : 0;
    var mapRow = '🗺️ 闯关地图 ' + mapDone + ' / ' + MAP_LEVELS.length + ' 关 · 掌握技巧 ' + litMapSkillCount() + ' / ' + mapSkillTotal(); // v1.20/v1.23：闯关行补技巧掌握（分母 = MAP 涉及技巧去重数，对齐闯关卡 sub 口径）
    if (mapDone >= MAP_LEVELS.length) {
      mapRow += ' · 已全部通关 🎉';
    } else {
      var curMl = MAP_LEVELS[mapDone];
      mapRow += ' · 当前：' + curMl.name + '（' + (mapDone < 3 ? '简单' : mapDone < 6 ? '普通' : '困难') + '）';
    }
    cardC.appendChild(makeEl('div', 'report-row', mapRow));
    viewEl.appendChild(cardC);
    // v1.23 导出/打印（window.print + @media print CSS → 另存为 PDF，零依赖）
    var printBtn = makeEl('button', 'btn-checkin', '🖨️ 导出/打印');
    printBtn.setAttribute('aria-label', '导出或打印家长报告为 PDF');
    printBtn.style.marginTop = '4px';
    printBtn.addEventListener('click', function () { window.print(); });
    viewEl.appendChild(printBtn);
    // 返回难度
    var back = makeEl('button', 'btn-checkin', '← 返回');
    back.setAttribute('aria-label', '返回难度选择');
    back.style.marginTop = '4px';
    back.addEventListener('click', showDifficultyView);
    viewEl.appendChild(back);
  }

  /* ---------- 设置面板（v1.14）：音效开关 / 清除本地进度 / 关于 ---------- */
  function updateSettingsToggle(toggleEl) {
    // 刷新音效开关按钮文案与样式：开=绿底「开」/ 关=灰底「关」
    if (!toggleEl) { return; }
    toggleEl.className = 'settings-toggle' + (soundEnabled ? ' on' : ' off');
    toggleEl.textContent = soundEnabled ? '开' : '关';
  }
  function showSettingsView() {
    // 设置面板（v1.14）：仿徽章墙/成就视图模式；数据只存本机不联网
    hideOverlay();
    stopTimer();
    state.won = false;
    state.playing = false;
    renderHeader('设置');
    clearNode(viewEl);
    viewEl.appendChild(makeEl('div', 'page-title', '设置'));
    viewEl.appendChild(makeEl('div', 'home-hint', '数据只保存在本机，不联网不上传'));
    // 音效开关行
    var soundRow = makeEl('div', 'settings-row');
    soundRow.appendChild(makeEl('span', 'settings-label', '🔊 音效'));
    var soundToggle = makeEl('button', 'settings-toggle', '');
    soundToggle.setAttribute('aria-label', '切换音效开关');
    soundToggle.addEventListener('click', function () {
      soundEnabled = !soundEnabled;
      store.settings.sound = soundEnabled;
      saveStore();
      updateSettingsToggle(soundToggle);
      if (soundEnabled) { sndClick(); } // 开启时播一声确认音
    });
    soundRow.appendChild(soundToggle);
    updateSettingsToggle(soundToggle);
    viewEl.appendChild(soundRow);
    // 清除进度行
    var clearRow = makeEl('div', 'settings-row');
    var clearCol = makeEl('div', 'settings-col');
    clearCol.appendChild(makeEl('span', 'settings-label', '🗑️ 清除本地进度'));
    clearCol.appendChild(makeEl('span', 'settings-sub', '清空成绩/打卡/错题/成就/闯关等全部本地数据'));
    clearRow.appendChild(clearCol);
    var clearBtn = makeEl('button', 'settings-danger', '清除');
    clearBtn.setAttribute('aria-label', '清除全部本地进度');
    clearBtn.addEventListener('click', function () {
      showOverlay('🗑️ 确定清除？', '此操作不可撤销，将清空本机全部进度与设置', [], [
        { text: '取消', cls: 'btn-ghost', act: hideOverlay },
        { text: '确认清除', cls: 'btn-danger', act: function () {
            try { localStorage.removeItem(STORE_KEY); } catch (err) { /* ignore */ }
            // v1.14：清空后重载 → defaultStore 重新初始化（含全部字段，音效回默认开）
            window.location.reload();
          } }
      ]);
    });
    clearRow.appendChild(clearBtn);
    viewEl.appendChild(clearRow);
    // 关于
    var ver = APP.meta && APP.meta.version ? APP.meta.version : '1.14';
    var aboutCard = makeEl('div', 'settings-about');
    aboutCard.appendChild(makeEl('div', '', 'ℹ️ 关于 · v' + ver));
    aboutCard.appendChild(makeEl('div', '', '数独思维 · 逻辑推理小达人'));
    aboutCard.appendChild(makeEl('div', '', '无账号无云同步，数据只存本机'));
    viewEl.appendChild(aboutCard);
    // 底部：返回难度
    var setBack = makeEl('button', 'btn-checkin', '← 返回');
    setBack.setAttribute('aria-label', '返回难度选择');
    setBack.style.marginTop = '4px';
    setBack.addEventListener('click', showDifficultyView);
    viewEl.appendChild(setBack);
  }

  /* ---------- 实体键盘增强（1-9 / Backspace / Delete；仅游戏页） ---------- */
  if (window.addEventListener) {
    document.addEventListener('keydown', function (e) {
      if (!state.playing || state.won) { return; }
      var k = e.key;
      if (k >= '1' && k <= '9') {
        var v = Number(k);
        if (v >= 1 && v <= state.N) { onNumTap(v); }
      } else if (k === 'Backspace' || k === 'Delete') {
        if (state.selected >= 0) {
          e.preventDefault();
          eraseSelected();
        }
      }
      // Enter：无操作（保持简单）
    });
  }

  /* ---------- 启动 ---------- */
  function syncAppHeight() {
    var docEl = document.documentElement;
    var vh = window.innerHeight || docEl.clientHeight;
    docEl.style.setProperty('--app-height', vh + 'px');
  }
  if (window.addEventListener) {
    window.addEventListener('resize', syncAppHeight);
  }
  syncAppHeight();
  showDifficultyView();
})();
