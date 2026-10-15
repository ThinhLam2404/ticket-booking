import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { errorMessage } from '../../utils/format';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token) { setState('error'); setMessage('Liên kết đặt lại mật khẩu không hợp lệ.'); return; }
    if (password !== confirmation) { setState('error'); setMessage('Mật khẩu xác nhận không khớp.'); return; }
    setState('loading');
    try {
      await api.resetPassword({ token, password });
      setState('success');
      setMessage('Mật khẩu đã được cập nhật. Bạn có thể đăng nhập lại bằng mật khẩu mới.');
    } catch (cause) {
      setState('error');
      setMessage(errorMessage(cause, 'Không thể đặt lại mật khẩu. Liên kết có thể đã hết hạn.'));
    }
  }

  return <main className="auth-page-shell"><section className="auth-result reset-password-card" aria-labelledby="reset-password-title">
    {state === 'success' ? <><p className="eyebrow">BẢO MẬT TÀI KHOẢN</p><div className="auth-result-icon success" aria-hidden="true">✓</div><h1 id="reset-password-title">Đã cập nhật mật khẩu</h1><p>{message}</p><Link className="primary auth-result-link" to="/">Về trang chủ</Link></> : <form onSubmit={(event) => void submit(event)}><p className="eyebrow">BẢO MẬT TÀI KHOẢN</p><h1 id="reset-password-title">Đặt lại mật khẩu</h1><p>Chọn một mật khẩu mới để tiếp tục bảo vệ tài khoản CineBook.</p><label>Mật khẩu mới<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /></label><label>Nhập lại mật khẩu<input required minLength={8} type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" /></label>{state === 'error' && <p className="form-error" role="alert">{message}</p>}<button className="primary auth-result-link" disabled={state === 'loading'}>{state === 'loading' ? 'Đang cập nhật…' : 'Cập nhật mật khẩu'}</button></form>}
  </section></main>;
}
