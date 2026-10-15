import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, clearAuth } from '../../api';
import { ErrorState, LoadingState, PageHeader } from '../../components/ui';
import { errorMessage } from '../../utils/format';

export function SecurityPage() {
  const navigate = useNavigate();
  const sessions = useQuery({ queryKey: ['auth-sessions'], queryFn: () => api.sessions() });
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function changePassword(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try { await api.changePassword({ currentPassword, newPassword }); await api.logout().catch(() => undefined); clearAuth(); setCurrentPassword(''); setNewPassword(''); setMessage('Đã đổi mật khẩu. Tất cả phiên đăng nhập đã được đăng xuất. Vui lòng đăng nhập lại.'); navigate('/'); }
    catch (cause) { setMessage(errorMessage(cause, 'Không thể đổi mật khẩu.')); }
    finally { setBusy(false); }
  }

  async function revoke(sessionId: string) { await api.revokeSession(sessionId); await sessions.refetch(); }
  async function revokeOthers() { await api.revokeOtherSessions(); await sessions.refetch(); }
  async function revokeAll() { await api.revokeAllSessions(); clearAuth(); navigate('/'); }

  return <section className="records-page account-security-page"><div className="breadcrumb"><span>Tài khoản</span><span>›</span><strong>Bảo mật</strong></div><div className="records-heading"><PageHeader eyebrow="TÀI KHOẢN / BẢO MẬT" title="Bảo mật tài khoản" /><p>Kiểm soát mật khẩu và những thiết bị đang đăng nhập vào tài khoản CineBook.</p></div><div className="security-grid"><form className="security-card" onSubmit={(event) => void changePassword(event)}><p className="eyebrow">MẬT KHẨU</p><h2>Đổi mật khẩu</h2><label>Mật khẩu hiện tại<input required minLength={8} type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" /></label><label>Mật khẩu mới<input required minLength={8} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" /></label>{message && <p className="form-hint" role="status">{message}</p>}<button className="primary" disabled={busy}>{busy ? 'Đang cập nhật…' : 'Đổi mật khẩu'}</button></form><section className="security-card"><div className="card-title"><div><p className="eyebrow">PHIÊN ĐĂNG NHẬP</p><h2>Thiết bị của bạn</h2></div><div className="account-actions"><button className="secondary" type="button" disabled={sessions.isFetching} onClick={() => void revokeOthers()}>Đăng xuất phiên khác</button><button className="danger" type="button" disabled={sessions.isFetching} onClick={() => void revokeAll()}>Đăng xuất mọi nơi</button></div></div>{sessions.isPending && <LoadingState label="Đang tải phiên đăng nhập…" />}{sessions.isError && <ErrorState cause={sessions.error} fallback="Không thể tải phiên đăng nhập." onRetry={() => void sessions.refetch()} />}{sessions.data?.length === 0 && <p className="empty-state state-card">Không có phiên đăng nhập đang hoạt động.</p>}<div className="session-list">{sessions.data?.map((session) => <div className={`session-row${session.current ? ' current' : ''}`} key={session.id}><div><strong>{session.current ? 'Phiên hiện tại' : 'Thiết bị đã đăng nhập'}</strong><small>Bắt đầu {new Date(session.createdAt).toLocaleString('vi-VN')} · Hết hạn {new Date(session.expiresAt).toLocaleString('vi-VN')}</small></div><button className="danger" type="button" onClick={() => void revoke(session.id)}>Thu hồi</button></div>)}</div></section></div></section>;
}
