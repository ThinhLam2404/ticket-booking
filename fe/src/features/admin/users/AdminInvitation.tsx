import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../../api';
import { LoadingState } from '../../../components/ui';
import { errorMessage } from '../../../utils/format';
import { permissionText } from '../shared';

type State = 'loading' | 'ready' | 'submitting' | 'success' | 'error';

export function AdminAcceptInvitationPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<State>('loading');
  const [message, setMessage] = useState('Đang kiểm tra lời mời…');
  const [email, setEmail] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [fullName, setFullName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');

  useEffect(() => {
    if (!token) { setState('error'); setMessage('Liên kết lời mời không hợp lệ.'); return; }
    void api.previewAdminInvitation({ token }).then((preview) => {
      setEmail(preview.email); setFormEmail(preview.email); setPermissions(preview.permissions); setState('ready');
    }).catch((cause) => { setState('error'); setMessage(errorMessage(cause, 'Lời mời không hợp lệ hoặc đã hết hạn.')); });
  }, [token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmation) { setMessage('Mật khẩu xác nhận không khớp.'); return; }
    setState('submitting');
    try { await api.acceptAdminInvitation({ token, email: formEmail, fullName, password }); setState('success'); setMessage('Tài khoản quản trị đã được tạo. Bạn có thể đăng nhập.'); }
    catch (cause) { setState('ready'); setMessage(errorMessage(cause, 'Không thể chấp nhận lời mời.')); }
  }

  if (state === 'loading') return <main className="auth-page-shell"><LoadingState label={message} /></main>;
  if (state === 'error') return <main className="auth-page-shell"><section className="auth-result" role="alert"><p className="eyebrow">LỜI MỜI QUẢN TRỊ</p><div className="auth-result-icon error">!</div><h1>Không thể tiếp tục</h1><p>{message}</p><Link className="primary auth-result-link" to="/admin/login">Đến trang đăng nhập</Link></section></main>;
  if (state === 'success') return <main className="auth-page-shell"><section className="auth-result"><p className="eyebrow">LỜI MỜI QUẢN TRỊ</p><div className="auth-result-icon success">✓</div><h1>Đã tạo tài khoản</h1><p>{message}</p><Link className="primary auth-result-link" to="/admin/login">Đăng nhập quản trị</Link></section></main>;
  return <main className="auth-page-shell"><section className="auth-result admin-invitation-form"><form onSubmit={(event) => void submit(event)}><p className="eyebrow">LỜI MỜI QUẢN TRỊ</p><h1>Hoàn tất tài khoản</h1><p>Bạn được mời với email <strong>{email}</strong>.</p><div className="invitation-permissions"><strong>Quyền được cấp</strong>{permissions.map((permission) => <span key={permission}>{permissionText[permission] ?? permission}</span>)}</div><label>Họ và tên<input required minLength={2} maxLength={100} value={fullName} onChange={(event) => setFullName(event.target.value)} /></label><label>Email<input required type="email" value={formEmail} onChange={(event) => setFormEmail(event.target.value)} /></label><label>Mật khẩu<input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><label>Nhập lại mật khẩu<input required minLength={8} type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>{message !== 'Đang kiểm tra lời mời…' && <p className="form-error" role="alert">{message}</p>}<button className="primary auth-result-link" disabled={state === 'submitting'}>{state === 'submitting' ? 'Đang tạo tài khoản…' : 'Tạo tài khoản quản trị'}</button></form></section></main>;
}
