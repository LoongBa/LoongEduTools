/* 离线包合规经典脚本（minitool：禁 type=module / 禁内联 script）。
 * 职责：① React 前预置主题防闪烁 ② Chrome 61 运行时 API 兜底
 * flex gap 检测已移至 main.tsx bootstrap()（行为测量，body 存在后 render 前执行）。
 */
(function () {
  // ---- Chrome 61 运行时兜底（语法层由 build.target 降级，这里补全局/原型） ----
  if (typeof window.globalThis === "undefined") {
    window.globalThis = window;
  }
  if (typeof window.queueMicrotask !== "function") {
    window.queueMicrotask = function (fn) {
      Promise.resolve().then(fn);
    };
  }
  if (typeof Object.fromEntries !== "function") {
    Object.fromEntries = function (iterable) {
      var obj = {};
      var arr = Array.from(iterable);
      for (var i = 0; i < arr.length; i++) {
        obj[arr[i][0]] = arr[i][1];
      }
      return obj;
    };
  }

  // ---- 主题预置（在 React 加载前立即设置，避免闪烁） ----
  function applyThemeToDOM(theme) {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
    document.documentElement.setAttribute("data-theme", theme);
  }

  var isInIframe = window.self !== window.top;
  if (isInIframe) {
    // 监听父窗口主动推送的主题消息
    window.addEventListener("message", function (event) {
      if (event.data && typeof event.data.theme === "string") {
        var theme = event.data.theme;
        if (theme === "light" || theme === "dark") {
          applyThemeToDOM(theme);
        }
      }
    });
  } else {
    // 非 iframe 环境，使用默认 light 主题
    applyThemeToDOM("light");
  }
})();
