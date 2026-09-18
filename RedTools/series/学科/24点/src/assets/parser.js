/* ============================================================
   24点 — 表达式解析求值（纯函数，无 DOM，无 eval / new Function）
   ------------------------------------------------------------
   暴露 window.Game24Parser：
   - tokenize(exprText)
       → token 数组；token = {type:'num',value} | {type:'op',value}
         | {type:'lp'} | {type:'rp'} | {type:'bad',value}
   - evaluate(input)
       → {ok:true, value:number} | {ok:false, error:'除零'|'非法表达式'}
       input 可为文本串或 token 数组；双栈（数值栈 + 运算符栈）中缀求值，
       优先级 + - < × ÷，括号优先，左结合；v1 不支持一元负号。
   - validateNumberTokens(tokens, cards)
       → boolean：整数数字 token 多重集合 ≡ 牌面多重集合（防御断言）
   - isTwentyFour(v) → |v-24| < 1e-6
   设计约束：
   - ES2017 经典脚本；运算符字符 + - × ÷（- 为 ASCII 连字符）
   - 拒绝除零（b === 0）；非法表达式统一返回 非法表达式
   ============================================================ */
(function () {
  'use strict';

  var PREC = { '+': 1, '-': 1, '×': 2, '÷': 2 };

  /* ---------- 词法 ---------- */
  function tokenize(exprText) {
    var tokens = [];
    var s = String(exprText || '');
    var i = 0, j, ch;
    while (i < s.length) {
      ch = s.charAt(i);
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        i += 1;
        continue;
      }
      if (ch >= '0' && ch <= '9') {
        j = i;
        while (j < s.length && s.charAt(j) >= '0' && s.charAt(j) <= '9') { j += 1; }
        tokens.push({ type: 'num', value: Number(s.slice(i, j)) });
        i = j;
        continue;
      }
      if (ch === '+' || ch === '-' || ch === '×' || ch === '÷') {
        tokens.push({ type: 'op', value: ch });
        i += 1;
        continue;
      }
      if (ch === '(') { tokens.push({ type: 'lp', value: '(' }); i += 1; continue; }
      if (ch === ')') { tokens.push({ type: 'rp', value: ')' }); i += 1; continue; }
      tokens.push({ type: 'bad', value: ch });
      i += 1;
    }
    return tokens;
  }

  /* ---------- 求值 ---------- */
  function evaluate(input) {
    var tokens = Array.isArray(input) ? input : tokenize(input);
    var i, t;

    /* 词法检查：不允许非法字符 */
    for (i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'bad') { return { ok: false, error: '非法表达式' }; }
    }

    /* 序列检查：数/运算符交替 + 括号配对（顺带拒绝一元负号、空括号、隐式乘） */
    var expect = 'value';
    var balance = 0;
    for (i = 0; i < tokens.length; i++) {
      t = tokens[i];
      if (t.type === 'num') {
        if (expect !== 'value') { return { ok: false, error: '非法表达式' }; }
        expect = 'op';
      } else if (t.type === 'op') {
        if (expect !== 'op') { return { ok: false, error: '非法表达式' }; }
        expect = 'value';
      } else if (t.type === 'lp') {
        if (expect !== 'value') { return { ok: false, error: '非法表达式' }; }
        balance += 1;
        expect = 'value';
      } else if (t.type === 'rp') {
        if (expect !== 'op') { return { ok: false, error: '非法表达式' }; }
        balance -= 1;
        if (balance < 0) { return { ok: false, error: '非法表达式' }; }
        expect = 'op';
      }
    }
    if (expect !== 'op' || balance !== 0) { return { ok: false, error: '非法表达式' }; }

    /* 双栈中缀求值：数值栈 + 运算符栈（含括号） */
    var vals = [];
    var ops = [];

    /* 弹出栈顶运算符并计算；返回 'ok' | 'zero' | 'empty' */
    function applyTop() {
      if (vals.length < 2) { return 'empty'; }
      var op = ops.pop();
      var b = vals.pop();
      var a = vals.pop();
      var r;
      if (op === '+') { r = a + b; }
      else if (op === '-') { r = a - b; }
      else if (op === '×') { r = a * b; }
      else { /* ÷ */
        if (b === 0) { return 'zero'; }
        r = a / b;
      }
      vals.push(r);
      return 'ok';
    }

    for (i = 0; i < tokens.length; i++) {
      t = tokens[i];
      if (t.type === 'num') { vals.push(t.value); continue; }
      if (t.type === 'op') {
        while (ops.length) {
          var top = ops[ops.length - 1];
          if (top === '(') { break; }
          if (PREC[top] >= PREC[t.value]) {
            var st = applyTop();
            if (st === 'zero') { return { ok: false, error: '除零' }; }
            if (st === 'empty') { return { ok: false, error: '非法表达式' }; }
          } else { break; }
        }
        ops.push(t.value);
        continue;
      }
      if (t.type === 'lp') { ops.push('('); continue; }
      if (t.type === 'rp') {
        while (ops.length && ops[ops.length - 1] !== '(') {
          var st2 = applyTop();
          if (st2 === 'zero') { return { ok: false, error: '除零' }; }
          if (st2 === 'empty') { return { ok: false, error: '非法表达式' }; }
        }
        ops.pop(); /* '(' */
      }
    }
    while (ops.length) {
      var st3 = applyTop();
      if (st3 === 'zero') { return { ok: false, error: '除零' }; }
      if (st3 === 'empty') { return { ok: false, error: '非法表达式' }; }
    }
    if (vals.length !== 1) { return { ok: false, error: '非法表达式' }; }
    return { ok: true, value: vals[0] };
  }

  /* ---------- 合法性校验：数字多重集合 ≡ 牌面多重集合 ---------- */
  function validateNumberTokens(tokens, cards) {
    var need = {}, have = {}, i, key, v;

    if (!tokens || !cards) { return false; }
    for (i = 0; i < cards.length; i++) {
      v = cards[i];
      need[v] = (need[v] || 0) + 1;
    }
    for (i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'num') { continue; }
      v = tokens[i].value;
      if (v !== Math.floor(v)) { return false; } /* 必须是整数（防御） */
      have[v] = (have[v] || 0) + 1;
    }
    var keys = Object.keys(need);
    for (i = 0; i < keys.length; i++) {
      key = keys[i];
      if ((have[key] || 0) !== need[key]) { return false; }
    }
    return true;
  }

  function isTwentyFour(v) { return Math.abs(v - 24) < 1e-6; }

  /* ---------- 对外接口 ---------- */
  window.Game24Parser = {
    tokenize: tokenize,
    evaluate: evaluate,
    validateNumberTokens: validateNumberTokens,
    isTwentyFour: isTwentyFour
  };
})();
