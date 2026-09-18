/* ============================================================
   贪吃蛇 — guard：防沉迷 UI + 逻辑（设置条/到点提醒暂停/延迟×2/自律锁/结算三选）
   依赖：core、game（运行时引用 ui/share）。
   挂载：window.SnakeApp.guard
   ============================================================ */
(function () {
  'use strict';
  var core = window.SnakeApp.core;
  var game = window.SnakeApp.game;

  function uiMod() { return window.SnakeApp.ui; }

  /* ---------- 设置条（两 picker 展开互斥） ---------- */
  function guardMinLabel() { return '⏱ ' + core.store.guard.minutePref + ' 分钟'; }
  function guardGamesLabel() {
    var g = core.store.guard.gamesPref;
    return '今日' + (g > 0 ? g + ' 局' : '不限');
  }
  function renderGuardBar() {
    var bar = document.getElementById('guard-bar');
    if (!bar) { return; }
    core.clearNode(bar);

    var minBtn = core.makeEl('button', 'guard-btn', guardMinLabel());
    minBtn.setAttribute('aria-label', '设置本局时长');
    var minPicker = core.makeEl('div', 'guard-picker');
    minPicker.style.display = 'none';
    var mins = core.GUARD_MINUTES;
    for (var i = 0; i < mins.length; i++) {
      (function (m) {
        var b = core.makeEl('button', 'guard-opt' + (core.store.guard.minutePref === m ? ' active' : ''), m + ' 分钟');
        b.addEventListener('click', function () {
          core.store.guard.minutePref = m;
          core.saveStore();
          renderGuardBar();
        });
        minPicker.appendChild(b);
      })(mins[i]);
    }
    minBtn.addEventListener('click', function () {
      var show = minPicker.style.display === 'none';
      gamesPicker.style.display = 'none';
      minPicker.style.display = show ? 'block' : 'none';
    });
    minPicker.appendChild(core.makeEl('div', 'guard-note', '单局时长上限，到点提醒'));

    var gamesBtn = core.makeEl('button', 'guard-btn', guardGamesLabel());
    gamesBtn.setAttribute('aria-label', '设置今日局数上限');
    var gamesPicker = core.makeEl('div', 'guard-picker');
    gamesPicker.style.display = 'none';
    var games = core.GUARD_GAMES;
    for (var j = 0; j < games.length; j++) {
      (function (g) {
        var b = core.makeEl('button', 'guard-opt' + (core.store.guard.gamesPref === g ? ' active' : ''), g > 0 ? g + ' 局' : '不限');
        b.addEventListener('click', function () {
          core.store.guard.gamesPref = g;
          core.saveStore();
          renderGuardBar();
        });
        gamesPicker.appendChild(b);
      })(games[j]);
    }
    gamesBtn.addEventListener('click', function () {
      var show = gamesPicker.style.display === 'none';
      minPicker.style.display = 'none';
      gamesPicker.style.display = show ? 'block' : 'none';
    });
    gamesPicker.appendChild(core.makeEl('div', 'guard-note', '今日有效局数上限，到点提醒'));

    var selfBtn = core.makeEl('button', 'guard-btn guard-self-btn',
      core.isSelfLocked() ? '🌟 已自律' : '🙌 我很自律，今天足够了');
    selfBtn.setAttribute('aria-label', '今天到此为止');
    selfBtn.addEventListener('click', function () {
      if (core.isSelfLocked()) {
        uiMod().showOverlay('🌟 今天已经很自律啦', '明天见，更棒的手眼小达人', '今日已结束',
          [{ cls: 'guard-line', text: '连续自律 ' + (core.store.selfStreak || 0) + ' 天' }],
          [{ text: '明天见', cls: 'btn-main', act: uiMod().hideOverlay }]);
        return;
      }
      doSelfDiscipline();
    });

    bar.appendChild(minBtn);
    bar.appendChild(gamesBtn);
    bar.appendChild(selfBtn);
    bar.appendChild(minPicker);
    bar.appendChild(gamesPicker);
  }

  /* ---------- 到点提醒（暂停 + 弹窗） ---------- */
  function checkGuardTime() {
    var st = game.state;
    if (st.guardPaused || st.guardWarned || !st.started || st.over || st.won) { return; }
    if (st.time >= core.guardMinuteLimit() * 60) {
      st.guardWarned = true;
      game.stopTimer();
      openGuardTimer();
    }
  }
  function openGuardTimer() {
    var st = game.state;
    var left = core.DELAY_LIMIT - core.store.guard.delayMinTimes;
    var notes = [{
      cls: 'guard-line',
      text: '本局已玩 ' + st.time + ' 秒 · 设定 ' + core.store.guard.minutePref + ' 分钟'
    }];
    var btns = [];
    if (left > 0) {
      btns.push({
        text: '延迟 ' + core.DELAY_MINUTES + ' 分钟（剩 ' + left + ' 次）', cls: 'btn-ghost',
        act: function () {
          core.store.guard.delayMinTimes++;
          core.saveStore();
          resumeAfterGuard();
        }
      });
    }
    btns.push({ text: '我很自律，今天足够了', cls: 'btn-main', act: doSelfDiscipline });
    st.guardPaused = true;
    game.stopMoveLoop();
    uiMod().showOverlay('⏰ 时间到啦', '休息一下，明天更棒', st.time + 's', notes, btns);
    uiMod().updateInfo();
    uiMod().renderFooter();
  }
  function resumeAfterGuard() {
    var st = game.state;
    st.guardPaused = false;
    st.guardWarned = false;   // 延迟后允许下一次到点再次提醒（新上限生效）
    uiMod().hideOverlay();
    if (!st.over && !st.won) {
      game.startTimer();
      game.startMoveLoop();
    }
    uiMod().updateInfo();
  }

  /* ---------- 自律退出 ---------- */
  function doSelfDiscipline() {
    var today = core.fmtToday();
    if (core.store.selfDaily.indexOf(today) < 0) {
      core.store.selfDaily.push(today);
      core.store.selfDaily.sort();
      while (core.store.selfDaily.length > 365) { core.store.selfDaily.shift(); }
      core.store.selfStreak = core.calcStreak(core.store.selfDaily);
    }
    core.store.cur = null;
    game.stopTimer();
    game.stopMoveLoop();
    game.state.guardPaused = false;
    game.state.over = true;
    core.saveStore();
    var notes = [{
      cls: 'guard-line',
      text: core.store.selfStreak > 0 ? '🌟 连续自律 ' + core.store.selfStreak + ' 天' : '🌟 今日自律成就 +1'
    }];
    uiMod().showOverlay('👏 今天已经很自律啦', '明天见，更棒的手眼小达人', '今日已结束', notes, [
      { text: '明天见', cls: 'btn-main', act: function () {
        uiMod().hideOverlay();
        uiMod().renderFooter();
        renderGuardBar();
      } }
    ]);
    uiMod().renderFooter();
  }

  /* ---------- 结算三选（再来/分享/自律；局数到点自动转延迟） ---------- */
  function guardSettleNotes() {
    var notes = [];
    var g = core.store.guard.gamesPref;
    if (g > 0 && core.store.guard.playedToday >= core.guardGamesLimit()) {
      notes.push({
        cls: 'guard-line',
        text: '⏳ 今日已完成 ' + core.store.guard.playedToday + ' / ' + core.guardGamesLimit() + ' 局'
      });
    }
    return notes;
  }
  function guardSettleBtns() {
    var btns = [];
    var leftG = core.DELAY_LIMIT - core.store.guard.delayGamesTimes;
    if (core.guardReachedGames()) {
      if (leftG > 0) {
        btns.push({
          text: '延迟 +' + core.DELAY_GAMES + ' 局（剩 ' + leftG + ' 次）', cls: 'btn-main',
          act: function () {
            core.store.guard.delayGamesTimes++;
            core.saveStore();
            game.newGame(game.state.speedKey);
          }
        });
      }
      // 局数已满且无延迟额度 → 不提供再来一局，仅分享/自律
    } else {
      btns.push({ text: '再来一局', cls: 'btn-main', act: function () { game.newGame(game.state.speedKey); } });
    }
    btns.push({ text: '分享打卡', cls: 'btn-ghost', act: function () { window.SnakeApp.share.openShare(); } });
    btns.push({ text: '我很自律，今天足够了', cls: 'btn-self', act: doSelfDiscipline });
    return btns;
  }

  window.SnakeApp.guard = {
    renderGuardBar: renderGuardBar,
    checkGuardTime: checkGuardTime,
    openGuardTimer: openGuardTimer,
    resumeAfterGuard: resumeAfterGuard,
    doSelfDiscipline: doSelfDiscipline,
    guardSettleNotes: guardSettleNotes,
    guardSettleBtns: guardSettleBtns
  };
})();
