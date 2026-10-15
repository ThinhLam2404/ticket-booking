import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiClientError, api } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { errorMessage } from '../../utils/format';
import { useDialogFocus } from '../../components/useDialogFocus';

export function AuthModal({ mode, onClose }: { mode: 'login' | 'register'; onClose: () => void }) {
  const { login, register } = useAuth();
  const [registerMode, setRegisterMode] = useState(mode === 'register');
  const [forgotMode, setForgotMode] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [formError, setFormError] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [resendState, setResendState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [resendMessage, setResendMessage] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const dialogRef = useRef<HTMLFormElement>(null);
  const firstInput = useRef<HTMLInputElement>(null);
  useDialogFocus(true, dialogRef, onClose, firstInput);

  useEffect(() => {
    if (!resendCooldown) return;
    const timer = window.setInterval(() => {
      setResendCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  async function resendVerification(emailAddress: string) {
    if (resendCooldown > 0) return;
    setResendState('loading');
    setResendMessage('');
    try {
      await api.resendVerificationEmail(emailAddress);
      setResendState('success');
      setResendMessage('Email xác thực mới đã được gửi, vui lòng kiểm tra email');
      setResendCooldown(60);
    } catch (cause) {
      setResendState('error');
      setResendMessage(errorMessage(cause, 'Không thể gửi lại email xác thực.'));
    }
  }

  async function submitReset(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setFormError('');
    try {
      await api.requestPasswordReset({ email: resetEmail });
      setResetSent(true);
    } catch (cause) {
      setFormError(errorMessage(cause, 'Không thể gửi yêu cầu đặt lại mật khẩu.'));
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    setResendState('idle');
    setResendMessage('');
    setLoading(true);
    try {
      if (registerMode) {
        const response = await register({ fullName, email, password });
        setVerificationEmail(response.email);
        setResendCooldown(60);
      } else {
        await login({ email, password });
        onClose();
      }
    } catch (cause) {
      setFormError(errorMessage(cause, 'Không thể xác thực.'));
      if (cause instanceof ApiClientError && cause.code === 'AUTH_EMAIL_NOT_VERIFIED') {
        setUnverifiedEmail(email.trim());
      } else {
        setUnverifiedEmail('');
      }
    } finally {
      setLoading(false);
    }
  }

  const resendMessageClass = resendState === 'success' ? 'alert success' : 'form-error';

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form ref={dialogRef} className="auth-modal" autoComplete="off" onSubmit={forgotMode ? submitReset : submit} role="dialog" aria-modal="true" aria-labelledby="auth-title" tabIndex={-1}>
      <button type="button" className="modal-close" aria-label="Đóng" onClick={onClose}>×</button>
      <div className="auth-mark">▰</div><p className="eyebrow">CINEBOOK MEMBER</p><h2 id="auth-title">{verificationEmail ? 'Kiểm tra email' : forgotMode ? 'Đặt lại mật khẩu' : registerMode ? 'Tạo tài khoản' : 'Chào mừng trở lại'}</h2>
      {verificationEmail ? <>
        <p className="auth-copy">Liên kết xác thực đã được gửi tới <strong>{verificationEmail}</strong>. Mở email để kích hoạt tài khoản trước khi đăng nhập.</p>
        <button type="button" className="primary" onClick={onClose}>Đã hiểu</button>
        <button type="button" className="link-button" disabled={resendState === 'loading' || resendCooldown > 0} onClick={() => void resendVerification(verificationEmail)}>{resendState === 'loading' ? 'Đang gửi…' : resendCooldown > 0 ? `Gửi lại sau ${resendCooldown}s` : 'Gửi lại email xác thực'}</button>
        {resendMessage && <p className={resendMessageClass} aria-live="polite">{resendMessage}</p>}
      </> : forgotMode ? <>
        {resetSent ? <><p className="auth-copy">Nếu email tồn tại, liên kết đặt lại mật khẩu đã được gửi. Hãy kiểm tra hộp thư của bạn.</p><button type="button" className="primary" onClick={onClose}>Đã hiểu</button></> : <><p className="auth-copy">Nhập email đã đăng ký. Nếu tài khoản tồn tại, chúng tôi sẽ gửi liên kết bảo mật.</p><label>Email<input ref={firstInput} required type="email" value={resetEmail} onChange={(event) => setResetEmail(event.target.value)} placeholder="Email" autoComplete="email" /></label>{formError && <p className="form-error" role="alert">{formError}</p>}<button className="primary" disabled={loading}>{loading ? 'Đang gửi…' : 'Gửi liên kết'}</button><button type="button" className="link-button" onClick={() => { setForgotMode(false); setFormError(''); }}>Quay lại đăng nhập</button></>}
      </> : <>
        <p className="auth-copy">Đăng nhập để tiếp tục chọn ghế và quản lý vé điện tử.</p>
        {registerMode && <label>Họ và tên<input ref={firstInput} required value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Nguyễn Văn A" autoComplete="name" /></label>}
        <label>Email<input ref={registerMode ? undefined : firstInput} required type="email" value={email} onChange={(event) => { setEmail(event.target.value); if (unverifiedEmail) setUnverifiedEmail(''); }} placeholder="Email" autoComplete={registerMode ? 'email' : 'off'} /></label>
        <label>Mật khẩu<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mật khẩu" autoComplete="new-password" /></label>
        {!registerMode && <button type="button" className="link-button" onClick={() => { setForgotMode(true); setFormError(''); setResetSent(false); }}>Quên mật khẩu?</button>}
        {formError && <p className="form-error" role="alert">{formError}</p>}
        {unverifiedEmail && !registerMode && <div className="verification-resend" aria-live="polite"><p className="form-hint">Bạn cần xác thực email trước khi đăng nhập.</p><button type="button" className="link-button" disabled={resendState === 'loading' || resendCooldown > 0} onClick={() => void resendVerification(unverifiedEmail)}>{resendState === 'loading' ? 'Đang gửi…' : resendCooldown > 0 ? `Gửi lại sau ${resendCooldown}s` : 'Gửi lại email xác thực'}</button>{resendMessage && <p className={resendMessageClass}>{resendMessage}</p>}</div>}
        <button className="primary" disabled={loading}>{loading ? 'Đang xử lý…' : registerMode ? 'Đăng ký' : 'Đăng nhập'}</button>
        <button type="button" className="link-button" onClick={() => { setRegisterMode((value) => !value); setFormError(''); setUnverifiedEmail(''); setResendState('idle'); setResendMessage(''); setResendCooldown(0); }}>{registerMode ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký'}</button>
      </>}
    </form>
  </div>;
}
