/* ============================================================
   打字背单词 — 屏幕虚拟键盘组件（ES2017 经典脚本，Chrome 61 基线）
   ------------------------------------------------------------
   依赖：无（独立组件，暴露 window.DaziKeyboard）
   布局：
   - 3 行 QWERTY 字母键：大写显示，回调传入小写
     Row1: Q W E R T Y U I O P
     Row2: A S D F G H J K L + ⌫（退格）
     Row3: Z X C V B N M
   - 底行：[空格] ['] [-] [✓ 提交]
   - 空格键插入空格（用于 "bus stop" 等多词词条）
   - ' 键输入撇号（如 I'm），- 键输入连字符（如 T-shirt）
   设计约束：
   - Chrome 61 兼容：createElement + addEventListener，无 innerHTML 注入
   - 组件不持有业务状态，全部通过 handlers 回调上抛
   - 无 eval / 内联事件；无外部 http(s) 引用
   ============================================================ */
(function (global) {
  'use strict';

  var ROWS = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
  ];

  function makeEl(tag, className, text) {
    var el = document.createElement(tag);
    if (className) { el.className = className; }
    if (text !== undefined && text !== null) { el.textContent = text; }
    return el;
  }

  /**
   * 渲染虚拟键盘到 container。
   * @param {HTMLElement} container 挂载节点
   * @param {Object} handlers       { onChar(char), onBackspace(), onSubmit() }
   * @returns {{ setDisabled: function(boolean) }} 键盘控制句柄（答后禁用）
   */
  function render(container, handlers) {
    var kb = makeEl('div', 'kb');
    var keyEls = [];

    function addKey(label, cls, fn) {
      var b = makeEl('button', 'kb-key' + (cls ? ' ' + cls : ''), label);
      b.type = 'button';
      b.addEventListener('click', fn);
      keyEls.push(b);
      return b;
    }

    /* 3 行 QWERTY（Row2 末尾放 ⌫） */
    var r, i;
    for (r = 0; r < ROWS.length; r++) {
      var row = makeEl('div', 'kb-row');
      for (i = 0; i < ROWS[r].length; i++) {
        (function (ch) {
          row.appendChild(addKey(ch, '', function () {
            handlers.onChar(ch.toLowerCase());
          }));
        })(ROWS[r][i]);
      }
      if (r === 1) {
        row.appendChild(addKey('⌫', 'kb-back', function () {
          handlers.onBackspace();
        }));
      }
      kb.appendChild(row);
    }

    /* 底行：空格（宽键）/ 撇号 / 连字符 / 提交 */
    var bottom = makeEl('div', 'kb-row kb-row-bottom');
    bottom.appendChild(addKey('空格', 'kb-key-space', function () {
      handlers.onChar(' ');
    }));
    bottom.appendChild(addKey("'", 'kb-key-punct', function () {
      handlers.onChar("'");
    }));
    bottom.appendChild(addKey('-', 'kb-key-punct', function () {
      handlers.onChar('-');
    }));
    bottom.appendChild(addKey('✓', 'kb-key-submit', function () {
      handlers.onSubmit();
    }));
    kb.appendChild(bottom);

    container.appendChild(kb);

    return {
      setDisabled: function (disabled) {
        var j;
        for (j = 0; j < keyEls.length; j++) {
          keyEls[j].disabled = disabled;
        }
        kb.className = 'kb' + (disabled ? ' kb-disabled' : '');
      }
    };
  }

  global.DaziKeyboard = { render: render };
})(window);
