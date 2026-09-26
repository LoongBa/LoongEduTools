import { useEffect, useRef, useState } from "react";
import { AuthStatus, api } from "./api";

type Tab = "wechat" | "sms" | "password";

interface Props {
  onLoggedIn: (s: AuthStatus) => void;
  onSkip: () => void;
}

export default function LoginView({ onLoggedIn, onSkip }: Props) {
  const [tab, setTab] = useState<Tab>("sms");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, []);

  function startCountdown(sec: number) {
    setCountdown(sec);
    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (timer.current) window.clearInterval(timer.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  async function sendSms() {
    setErr(null);
    setInfo(null);
    if (!/^1\d{10}$/.test(phone)) {
      setErr("请输入 11 位手机号");
      return;
    }
    setBusy(true);
    try {
      await api.authSmsSend(phone);
      startCountdown(60);
      setInfo("验证码已发送（开发模式：服务端日志可见）");
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doSmsLogin() {
    setErr(null);
    if (!phone || !code) {
      setErr("请填写手机号与验证码");
      return;
    }
    setBusy(true);
    try {
      const s = await api.authSmsVerify(phone, code);
      onLoggedIn(s);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doPasswordLogin() {
    setErr(null);
    if (!phone || !password) {
      setErr("请填写手机号与密码");
      return;
    }
    setBusy(true);
    try {
      const s = await api.authLoginPassword(phone, password);
      onLoggedIn(s);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="login-page">
      <h2>登录</h2>
      <p className="hint">仅供个人教学使用 · 注册即任教信息实名 · 免费</p>

      <div className="tab-row" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "wechat"}
          className={tab === "wechat" ? "tab active" : "tab"}
          onClick={() => setTab("wechat")}
        >
          微信扫码
        </button>
        <button
          role="tab"
          aria-selected={tab === "sms"}
          className={tab === "sms" ? "tab active" : "tab"}
          onClick={() => setTab("sms")}
        >
          短信验证码
        </button>
        <button
          role="tab"
          aria-selected={tab === "password"}
          className={tab === "password" ? "tab active" : "tab"}
          onClick={() => setTab("password")}
        >
          密码
        </button>
      </div>

      {err && (
        <div className="banner error" onClick={() => setErr(null)}>
          {err}（点击关闭）
        </div>
      )}
      {info && (
        <div className="banner warn" onClick={() => setInfo(null)}>
          {info}（点击关闭）
        </div>
      )}

      {tab === "wechat" && (
        <div className="login-panel card">
          <div className="qr-placeholder" aria-label="二维码占位">
            <div className="qr-box">QR</div>
            <p>微信扫码登录</p>
          </div>
          <p className="hint">
            微信开放平台审核中，暂未开放。请使用短信验证码或密码登录。
          </p>
        </div>
      )}

      {tab === "sms" && (
        <div className="login-panel card">
          <label className="field">
            <span>手机号</span>
            <input
              inputMode="numeric"
              maxLength={11}
              placeholder="11 位手机号"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          <label className="field">
            <span>验证码</span>
            <div className="code-row">
              <input
                inputMode="numeric"
                maxLength={6}
                placeholder="6 位验证码"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
              <button
                className="ghost-btn inline"
                disabled={countdown > 0 || busy}
                onClick={sendSms}
              >
                {countdown > 0 ? `${countdown}s` : "获取验证码"}
              </button>
            </div>
          </label>
          <button className="primary-btn" disabled={busy} onClick={doSmsLogin}>
            {busy ? "登录中…" : "登录"}
          </button>
        </div>
      )}

      {tab === "password" && (
        <div className="login-panel card">
          <label className="field">
            <span>手机号</span>
            <input
              inputMode="numeric"
              maxLength={11}
              placeholder="11 位手机号"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          <label className="field">
            <span>密码</span>
            <input
              type="password"
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doPasswordLogin()}
            />
          </label>
          <button className="primary-btn" disabled={busy} onClick={doPasswordLogin}>
            {busy ? "登录中…" : "登录"}
          </button>
        </div>
      )}

      <div className="login-foot">
        <button className="ghost-btn inline" onClick={onSkip}>
          稍后再说（离线使用预装内容）
        </button>
      </div>
    </section>
  );
}
