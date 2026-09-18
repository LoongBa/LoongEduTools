/* ============================================================
   24点 — 防沉迷会话模块（纯逻辑，无 DOM / 无持久化，可独立单测）
   ------------------------------------------------------------
   规范：docs/通用需求-防沉迷.md（跨工具通用能力首发实现，未来可沉淀 _shared/）
   暴露 window.Game24Session（Chrome 61 基线，ES2017 经典脚本）：
   - setLimitMin(min)  → 设置档位（钳制为 5 | 10 | 15 分钟；其余回退默认 10）。
                         档位持久化由 main.js 负责（math24_prefs.limitMin），本模块仅内存。
   - setActive(b)      → true=对局进行中（累计时间），false=首页/结算/设置（暂停累计，保留 usedMs）。
                         setActive(true) 重置 lastTs：下一 tick 重新锚定，避免计入暂停期。
   - tick(nowMs)       → 由 main 每 ~500ms 调用；按与上次 tick 的差值累加 active 时间；
                         返回当前快照 { limitMin, usedMs, extraMs, due, active }。
                         基于 performance.now() 差值累加，无 setInterval 漂移。
   - consumeDue()      → 「弹层消费/武装」：当 over(超时) 且本死线尚未弹过 → 置 shown=true 并返回 true；
                         此后在 extend()/enough() 之前不再返回 true（防止 main 每 tick 重复弹）。
   - extend()          → 「延迟 5 分钟」：extraMs += 5*60*1000；shown=false（再次超时会重新武装弹层）。
   - enough()          → 「我很自律，今天足够了」：usedMs=0; extraMs=0; shown=false（视为新会话），保留 limitMin。
   - getState()        → 状态快照 { limitMin, usedMs, extraMs, due, active }。
   - setUsedMs(ms)     → 测试/调参辅助（供测试驱动冒烟），用于逼近阈值。
   触发临界（通用需求 §5.1）：due = (usedMs >= limitMin*60000 + extraMs)
   shown 语义：本死线（limitMin*60000 + extraMs）是否已弹过提醒；
   due 为原始超时布尔（超时期间恒为 true），main 用 consumeDue() 消费弹层边沿，
   弹层展示后由 main 保持开启，直到 extend()/enough() 才解除。
   ============================================================ */
(function () {
  'use strict';

  var VALID_MIN = [5, 10, 15];
  var MIN_MS = 60000;
  var EXTEND_MS = 5 * 60000;

  var limitMin = 10;
  var usedMs = 0;
  var extraMs = 0;
  var active = false;
  var lastTs = 0;      /* 上次 tick 时间戳；0 表示未锚定（激活后首 tick 重新锚定） */
  var shown = false;   /* 本死线是否已弹过提醒 */

  function clampMin(m) {
    if (VALID_MIN.indexOf(m) !== -1) { return m; }
    return 10; /* 非 5/10/15 一律回退默认档 */
  }
  function over() {
    return usedMs >= limitMin * MIN_MS + extraMs;
  }
  function snapshot() {
    return {
      limitMin: limitMin,
      usedMs: usedMs,
      extraMs: extraMs,
      due: over(),
      active: active
    };
  }

  window.Game24Session = {
    setLimitMin: function (m) {
      limitMin = clampMin(m);
      return limitMin;
    },
    setActive: function (b) {
      active = !!b;
      if (active) { lastTs = 0; } /* 重新锚定：激活后的首个 tick 仅记锚点不累计 */
    },
    tick: function (nowMs) {
      if (active) {
        if (lastTs > 0) {
          var d = nowMs - lastTs;
          if (d > 0) { usedMs += d; }
        }
        lastTs = nowMs;
      }
      return snapshot();
    },
    consumeDue: function () {
      if (over() && !shown) {
        shown = true;
        return true;
      }
      return false;
    },
    extend: function () {
      extraMs += EXTEND_MS;
      shown = false;
    },
    enough: function () {
      usedMs = 0;
      extraMs = 0;
      shown = false;
    },
    getState: function () {
      return snapshot();
    },
    setUsedMs: function (ms) { /* 供测试驱动 */
      usedMs = Math.max(0, ms);
    }
  };
})();
