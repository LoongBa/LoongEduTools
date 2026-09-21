/* ============================================================
   点读陪练 — core/generators.js（出题器，双模式共用）
   ------------------------------------------------------------
   职责：基于 APP_DATA.content（单元条目）生成练习题目
   - 词汇卡：显示英文 → 选中文释义（4 选 1）
   - 句型卡：显示英文 → 选中文翻译（4 选 1）
   出题只消费 content 数组，不感知模式（offline/online 由构建切分 content）
   ES2017 经典脚本；Chrome 61 兼容
   ============================================================ */
(function () {
  'use strict';

  var G = {};

  /* ---------- 洗牌 ---------- */
  function shuffle(arr) {
    var a = arr.slice();
    for (var j = a.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = a[j]; a[j] = a[k]; a[k] = t;
    }
    return a;
  }

  /* ---------- 从 content 生成一题 ---------- */
  // 返回 { q: 题目文本, type: 'vocab'|'sentence', correct: 正确答案, options: [4 个选项] }
  function genQuestion(items, usedIdx) {
    if (!items || !items.length) { return null; }
    // 从未用条目中选（用完则重置）
    var pool = usedIdx && usedIdx.length >= items.length ? items : items;
    var idx = Math.floor(Math.random() * pool.length);
    var item = pool[idx];
    // 干扰项：从其他条目的中文释义取 3 个
    var distractors = [];
    for (var i = 0; i < items.length && distractors.length < 3; i++) {
      var cand = items[i];
      if (cand !== item && cand.cn && distractors.indexOf(cand.cn) < 0) {
        distractors.push(cand.cn);
      }
    }
    while (distractors.length < 3) { distractors.push('···'); }
    var options = shuffle([item.cn].concat(distractors));
    return {
      q: item.word || item.en,
      type: item.type || 'vocab',
      correct: item.cn,
      options: options,
      sound: item.sound || ''
    };
  }

  /* ---------- 对外 API ---------- */
  G.genQuestion = genQuestion;
  G.shuffle = shuffle;

  /* 挂全局（core/main.js 消费） */
  window.LX_CORE = window.LX_CORE || {};
  window.LX_CORE.generators = G;
})();