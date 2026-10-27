import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useDialogFocus } from '../../../components/useDialogFocus';
import { api } from '../../../api';
import type { AdminInvitation } from '../../../types';
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui';
import { errorMessage, formatDate } from '../../../utils/format';
import { AdminPage, ConfirmDialog, permissionText, roleText, type ConfirmState } from '../shared';

type Permission = 'MANAGE_MOVIES' | 'MANAGE_CINEMAS' | 'MANAGE_SHOWTIMES' | 'VIEW_BOOKINGS' | 'MANAGE_PAYMENTS' | 'VIEW_SYSTEM' | 'MANAGE_USERS' | 'VIEW_AUDIT_LOGS' | 'MANAGE_COMBOS' | 'MANAGE_VOUCHERS';

type UserDraft = {
  disabled: boolean;
  role: 'CUSTOMER' | 'ADMIN';
  selected: Permission[];
};

const permissions: Permission[] = ['MANAGE_MOVIES', 'MANAGE_CINEMAS', 'MANAGE_SHOWTIMES', 'VIEW_BOOKINGS', 'MANAGE_PAYMENTS', 'VIEW_SYSTEM', 'MANAGE_USERS', 'VIEW_AUDIT_LOGS', 'MANAGE_COMBOS', 'MANAGE_VOUCHERS'];

export function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [invitationOpen, setInvitationOpen] = useState(false);
  const [invitationsVisible, setInvitationsVisible] = useState(false);
  const [invitationSearch, setInvitationSearch] = useState('');
  const client = useQueryClient();
  const invitations = useQuery({ queryKey: ['admin-invitations', invitationSearch], queryFn: () => api.adminInvitations(invitationSearch), enabled: invitationsVisible, refetchInterval: invitationsVisible ? 10000 : false });
  const invitationMutation = useMutation({
    mutationFn: (body: { email: string; permissions: Permission[] }) => api.createAdminInvitation(body),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ['admin-invitations'] }); setInvitationOpen(false); setNotice('Đã tạo lời mời quản trị. Email đang được gửi.'); },
    onError: (cause) => setError(errorMessage(cause, 'Không thể tạo lời mời quản trị.')),
  });
  const invitationAction = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'resend' | 'revoke' }) => action === 'resend' ? api.resendAdminInvitation(id) : api.revokeAdminInvitation(id),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ['admin-invitations'] }); setConfirm(null); setError(''); setNotice('Đã cập nhật lời mời quản trị.'); },
    onError: (cause) => setError(errorMessage(cause, 'Không thể cập nhật lời mời quản trị.')),
  });
  const query = useQuery({ queryKey: ['admin-users', search], queryFn: () => api.adminUsers(search ? { search } : {}) });
  const mutation = useMutation({
    mutationFn: ({ id, disabled, role, selected }: { id: string; disabled: boolean; role: 'CUSTOMER' | 'ADMIN'; selected: Permission[] }) =>
      api.updateAdminUserAccess(id, { disabled, role, permissions: selected }),
    onSuccess: async (updated) => {
      setError('');
      setConfirm(null);
      setNotice(`Đã cập nhật quyền truy cập cho ${updated.email}.`);
      await client.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (cause) => setError(errorMessage(cause, 'Không thể cập nhật quyền người dùng.')),
  });

  function askSave(user: Awaited<ReturnType<typeof api.adminUsers>>[number], draft: UserDraft) {
    setError('');
    setNotice('');
    setConfirm({
      title: 'Lưu thay đổi người dùng?',
      message: <>
        <p>Bạn sắp cập nhật quyền truy cập của <strong>{user.email}</strong>.</p>
        <ul className="admin-confirm-list">
          <li>Vai trò: <strong>{roleText[draft.role]}</strong></li>
          <li>Trạng thái: <strong>{draft.disabled ? 'Đã vô hiệu hóa' : 'Đang hoạt động'}</strong></li>
          <li>Quyền quản trị: <strong>{draft.role === 'ADMIN' ? `${draft.selected.length} quyền` : 'Không áp dụng cho Customer'}</strong></li>
        </ul>
        <p>Thay đổi sẽ được lưu ngay và có thể thu hồi các phiên đăng nhập của người dùng.</p>
      </>,
      onConfirm: async () => { await mutation.mutateAsync({ id: user.id, ...draft }); },
    });
  }

  return <AdminPage>
    <div className="admin-page-header"><div><p className="eyebrow">ACCESS CONTROL</p><h1>Người dùng & quyền truy cập</h1><p className="admin-page-lede">Thay đổi chỉ được gửi lên máy chủ sau khi bạn xác nhận.</p></div><button className="primary" type="button" onClick={() => { invitationMutation.reset(); setError(''); setNotice(''); setInvitationOpen(true); }}>Mời quản trị viên</button></div>
    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo email hoặc họ tên…" aria-label="Tìm người dùng" />
    {notice && <p className="form-success" role="status" aria-live="polite">{notice}</p>}
    {error && !confirm && <p className="form-error" role="alert">{error}</p>}
    {query.isPending && <LoadingState label="Đang tải người dùng…" />}
    {query.isError && <ErrorState cause={query.error} fallback="Không thể tải danh sách người dùng." onRetry={() => void query.refetch()} />}
    {query.isSuccess && query.data.length === 0 && <EmptyState>Không có người dùng phù hợp.</EmptyState>}
    {query.data?.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Người dùng</th><th>Vai trò</th><th>Phiên hoạt động</th><th>Trạng thái</th><th>Quyền & lưu</th></tr></thead><tbody>{query.data.map((user) => <UserRow key={user.id} user={user} busy={mutation.isPending} onSave={(draft) => askSave(user, draft)} />)}</tbody></table></div> : null}
    <section className="admin-invitations-panel" aria-labelledby="admin-invitations-title">
      <div className="admin-panel-heading"><div><p className="eyebrow">LỜI MỜI</p><h2 id="admin-invitations-title">Lời mời quản trị</h2></div><button className="secondary btn-sm" type="button" onClick={() => setInvitationsVisible((value) => !value)}>{invitationsVisible ? 'Ẩn lời mời' : 'Xem lời mời'}</button></div>
      {invitationsVisible && <>
        <input value={invitationSearch} onChange={(event) => setInvitationSearch(event.target.value)} placeholder="Tìm email lời mời…" aria-label="Tìm lời mời quản trị" />
        {invitations.isPending && <LoadingState label="Đang tải lời mời…" />}
        {invitations.isError && <ErrorState cause={invitations.error} fallback="Không thể tải lời mời." onRetry={() => void invitations.refetch()} />}
        {invitations.isSuccess && invitations.data.length === 0 && <EmptyState>Chưa có lời mời quản trị.</EmptyState>}
        {invitations.data && <div className="admin-invitation-list">{invitations.data.map((invitation) => <InvitationRow key={invitation.id} invitation={invitation} busy={invitationAction.isPending} onAction={(action) => {
          setError(''); setNotice('');
          setConfirm({ title: action === 'resend' ? 'Gửi lại lời mời?' : 'Thu hồi lời mời?', message: <p>{invitation.email}: {action === 'resend' ? 'Liên kết cũ sẽ mất hiệu lực.' : 'Người nhận sẽ không thể dùng liên kết này.'}</p>, onConfirm: async () => { await invitationAction.mutateAsync({ id: invitation.id, action }); } });
        }} />)}</div>}
      </>}
    </section>
    {confirm && <ConfirmDialog state={confirm} loading={mutation.isPending || invitationAction.isPending} error={error || undefined} onClose={() => { if (!mutation.isPending && !invitationAction.isPending) setConfirm(null); }} />}
    {invitationOpen && <InvitationDialog loading={invitationMutation.isPending} error={invitationMutation.error ? errorMessage(invitationMutation.error, 'Không thể tạo lời mời quản trị.') : undefined} onClose={() => { if (!invitationMutation.isPending) setInvitationOpen(false); }} onSubmit={async (body) => { await invitationMutation.mutateAsync(body); }} />}
  </AdminPage>;
}

function InvitationRow({ invitation, busy, onAction }: { invitation: AdminInvitation; busy: boolean; onAction: (action: 'resend' | 'revoke') => void }) {
  const emailLabels = { PENDING: 'Đang chờ gửi', SENT: 'Đã gửi', FAILED: 'Gửi thất bại', UNKNOWN: 'Chưa có thông tin' };
  return <article className="admin-invitation-row" aria-label={`Lời mời ${invitation.email}`}><div><strong>{invitation.email}</strong><small>{invitation.permissions.map((permission) => permissionText[permission] ?? permission).join(' · ')}</small><small>Người mời: {invitation.invitedByName ?? 'Quản trị viên'} · {invitation.invitedByEmail ?? invitation.invitedById}</small><small>Tạo: {formatDate(invitation.createdAt)} · Hết hạn: {formatDate(invitation.expiresAt)}</small><small className={`invitation-email-status email-${invitation.emailStatus.toLowerCase()}`}>Email: {emailLabels[invitation.emailStatus]}</small></div><div className="admin-invitation-actions"><span className={`status-chip invitation-${invitation.status.toLowerCase()}`}>{invitation.status === 'PENDING' ? 'Chờ chấp nhận' : invitation.status === 'ACCEPTED' ? 'Đã chấp nhận' : invitation.status === 'REVOKED' ? 'Đã thu hồi' : 'Đã hết hạn'}</span>{(invitation.status === 'PENDING' || invitation.status === 'EXPIRED') && <><button className="secondary btn-sm" type="button" disabled={busy} onClick={() => onAction('resend')}>Gửi lại</button><button className="danger btn-sm" type="button" disabled={busy} onClick={() => onAction('revoke')}>Thu hồi</button></>}</div></article>;
}

function InvitationDialog({ loading, error, onClose, onSubmit }: { loading: boolean; error?: string; onClose: () => void; onSubmit: (body: { email: string; permissions: Permission[] }) => Promise<void> | void }) {
  const [email, setEmail] = useState('');
  const [selected, setSelected] = useState<Permission[]>([]);
  const [review, setReview] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(true, dialogRef, () => { if (!loading) onClose(); });
  useEffect(() => { dialogRef.current?.querySelector<HTMLButtonElement>('.modal-close')?.focus(); }, [review]);
  return <div className="modal-backdrop" role="presentation">
    <div ref={dialogRef} tabIndex={-1} aria-busy={loading} className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="invitation-dialog-title">
      <button className="modal-close" type="button" aria-label="Đóng" disabled={loading} onClick={onClose}>×</button>
      <p className="eyebrow">MỜI THÀNH VIÊN</p>
      <h2 id="invitation-dialog-title">{review ? 'Xác nhận lời mời' : 'Mời quản trị viên'}</h2>
      {error && <p className="form-error" role="alert">{error}</p>}
      {review ? <div className="admin-copy">
        <p>Bạn sắp gửi lời mời quản trị đến <strong>{email}</strong>.</p>
        <ul className="admin-confirm-list">{selected.map((permission) => <li key={permission}>{permissionText[permission]}</li>)}</ul>
        <p>Liên kết trong email có hiệu lực 24 giờ và chỉ sử dụng được một lần.</p>
        <div className="form-actions"><button className="secondary" type="button" disabled={loading} onClick={() => setReview(false)}>Quay lại</button><button className="primary" type="button" disabled={loading} onClick={() => { void onSubmit({ email: email.trim(), permissions: selected }); }}>{loading ? 'Đang gửi…' : 'Xác nhận và gửi'}</button></div>
      </div> : <form className="admin-form" onSubmit={(event) => { event.preventDefault(); setReview(true); }}>
        <label className="admin-field admin-field-wide"><span>Email</span><input required maxLength={255} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="new-admin@example.com" /></label>
        <fieldset className="invitation-permission-field"><legend>Quyền được cấp</legend>{permissions.map((permission) => <label className="admin-checkbox" key={permission}><input type="checkbox" checked={selected.includes(permission)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, permission] : current.filter((item) => item !== permission))} />{permissionText[permission]}</label>)}</fieldset>
        <div className="form-actions"><button className="secondary" type="button" disabled={loading} onClick={onClose}>Hủy</button><button className="primary" type="submit" disabled={loading || !email.trim() || !selected.length}>Xem lại lời mời</button></div>
      </form>}
    </div>
  </div>;
}

function UserRow({ user, busy, onSave }: { user: Awaited<ReturnType<typeof api.adminUsers>>[number]; busy: boolean; onSave: (draft: UserDraft) => void }) {
  const [role, setRole] = useState<UserDraft['role']>(user.role);
  const [disabled, setDisabled] = useState(Boolean(user.disabledAt));
  const [selected, setSelected] = useState<Permission[]>(user.permissions as Permission[]);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sessionError, setSessionError] = useState("");

  useEffect(() => {
    setRole(user.role);
    setDisabled(Boolean(user.disabledAt));
    setSelected(user.permissions as Permission[]);
  }, [user]);

  const sessions = useQuery({ queryKey: ['admin-user-sessions', user.id], queryFn: () => api.adminUserSessions(user.id), enabled: sessionsOpen });
  const revoke = useMutation({ mutationFn: (sessionId: string) => api.revokeAdminUserSession(user.id, sessionId), onSuccess: async () => { await sessions.refetch(); } });
  const revokeAll = useMutation({ mutationFn: () => api.revokeAdminUserSessions(user.id), onSuccess: async () => { await sessions.refetch(); } });

  function save() {
    onSave({ role, disabled, selected });
  }

  return <tr>
    <td><strong>{user.fullName}</strong><small>{user.email}</small></td>
    <td><label className="admin-cell-field"><span className="sr-only">Vai trò của {user.email}</span><select value={role} disabled={busy} onChange={(event) => setRole(event.target.value as UserDraft['role'])}><option value="CUSTOMER">{roleText.CUSTOMER}</option><option value="ADMIN">{roleText.ADMIN}</option></select></label></td>
    <td><button className="secondary btn-sm" type="button" disabled={busy} onClick={() => setSessionsOpen((value) => !value)}>{user.activeSessionCount} phiên</button>{sessionsOpen && <div className="admin-inline-panel">{sessionError && <small className="form-error">{sessionError}</small>}{sessions.isPending && <small>Đang tải…</small>}{sessions.isError && <small className="form-error">Không thể tải phiên.</small>}{sessions.isSuccess && sessions.data.length === 0 && <small>Không còn phiên hoạt động.</small>}{sessions.data?.map((session) => <div className="admin-session-row" key={session.id}><div className="admin-session-info"><code title={session.id}>{session.id}</code><small>Tạo: {formatDate(session.createdAt)}</small><small>Hết hạn: {formatDate(session.expiresAt)}</small></div><button className="danger btn-sm" type="button" disabled={revoke.isPending || revokeAll.isPending} onClick={() => { void revoke.mutateAsync(session.id).catch((cause) => setSessionError(errorMessage(cause, 'Không thể thu hồi phiên.'))); }}>Thu hồi</button></div>)}{sessions.isSuccess && sessions.data.length > 0 && <button className="danger btn-sm" type="button" disabled={revokeAll.isPending || revoke.isPending} onClick={() => { void revokeAll.mutateAsync().catch((cause) => setSessionError(errorMessage(cause, 'Không thể thu hồi các phiên.'))); }}>{revokeAll.isPending ? 'Đang thu hồi…' : 'Đăng xuất mọi phiên'}</button>}</div>}</td>
    <td><label className="admin-checkbox"><input type="checkbox" checked={disabled} disabled={busy} onChange={(event) => setDisabled(event.target.checked)} /> {disabled ? 'Đã vô hiệu hóa' : 'Đang hoạt động'}</label></td>
    <td><details><summary>Chọn quyền</summary><div className="permission-list">{permissions.map((permission) => <label className="admin-checkbox" key={permission}><input type="checkbox" disabled={busy || role !== 'ADMIN'} checked={role === 'ADMIN' && selected.includes(permission)} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, permission])] : current.filter((item) => item !== permission))} />{permissionText[permission]}</label>)}<button className="primary btn-sm" type="button" disabled={busy} onClick={save}>{busy ? 'Đang lưu…' : 'Lưu thay đổi'}</button></div></details></td>
  </tr>;
}
