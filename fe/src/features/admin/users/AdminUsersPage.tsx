import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../../api';
import { AdminPage } from '../shared';
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui';
import { errorMessage } from '../../../utils/format';

const permissions = ['MANAGE_MOVIES', 'MANAGE_CINEMAS', 'MANAGE_SHOWTIMES', 'VIEW_BOOKINGS', 'MANAGE_PAYMENTS', 'VIEW_SYSTEM', 'MANAGE_USERS', 'VIEW_AUDIT_LOGS'] as const;

export function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['admin-users', search], queryFn: () => api.adminUsers(search ? { search } : {}) });
  const mutation = useMutation({ mutationFn: ({ id, disabled, role, selected }: { id: string; disabled: boolean; role: string; selected: string[] }) => api.updateAdminUserAccess(id, { disabled, role: role as 'CUSTOMER' | 'ADMIN', permissions: selected as ('MANAGE_MOVIES' | 'MANAGE_CINEMAS' | 'MANAGE_SHOWTIMES' | 'VIEW_BOOKINGS' | 'MANAGE_PAYMENTS' | 'VIEW_SYSTEM' | 'MANAGE_USERS' | 'VIEW_AUDIT_LOGS')[] }), onSuccess: () => { setError(''); void client.invalidateQueries({ queryKey: ['admin-users'] }); }, onError: (cause) => setError(errorMessage(cause, 'Không thể cập nhật quyền người dùng.')) });
  return <AdminPage><div className="admin-page-header"><div><p className="eyebrow">ACCESS CONTROL</p><h1>Người dùng & quyền truy cập</h1></div></div><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo email hoặc họ tên…" aria-label="Tìm người dùng" />{error && <p className="form-error" role="alert">{error}</p>}{query.isPending && <LoadingState label="Đang tải người dùng…" />}{query.isError && <ErrorState cause={query.error} fallback="Không thể tải danh sách người dùng." onRetry={() => void query.refetch()} />}{query.isSuccess && query.data.length === 0 && <EmptyState>Không có người dùng phù hợp.</EmptyState>}{query.data?.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Người dùng</th><th>Vai trò</th><th>Phiên hoạt động</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{query.data.map((user) => <UserRow key={user.id} user={user} busy={mutation.isPending} onSave={(value) => mutation.mutate({ id: user.id, ...value, selected: value.selected as typeof permissions[number][] })} />)}</tbody></table></div> : null}</AdminPage>;
}

function UserRow({ user, busy, onSave }: { user: Awaited<ReturnType<typeof api.adminUsers>>[number]; busy: boolean; onSave: (value: { disabled: boolean; role: string; selected: string[] }) => void }) {
  const [role, setRole] = useState(user.role);
  const [disabled, setDisabled] = useState(Boolean(user.disabledAt));
  const [selected, setSelected] = useState<string[]>(user.permissions);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const sessions = useQuery({ queryKey: ['admin-user-sessions', user.id], queryFn: () => api.adminUserSessions(user.id), enabled: sessionsOpen });
  const revoke = useMutation({ mutationFn: (sessionId: string) => api.revokeAdminUserSession(user.id, sessionId), onSuccess: () => void sessions.refetch() });
  const revokeAll = useMutation({ mutationFn: () => api.revokeAdminUserSessions(user.id), onSuccess: () => void sessions.refetch() });
  return <tr><td><strong>{user.fullName}</strong><small>{user.email}</small></td><td><select value={role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="CUSTOMER">CUSTOMER</option><option value="ADMIN">ADMIN</option></select></td><td><button className="secondary btn-sm" type="button" onClick={() => setSessionsOpen((value) => !value)}>{user.activeSessionCount} phiên</button>{sessionsOpen && <div className="admin-inline-panel">{sessions.isPending && <small>Đang tải…</small>}{sessions.data?.map((session) => <div className="admin-inline-row" key={session.id}><code>{session.id.slice(0, 8)}…</code><button className="danger btn-sm" type="button" disabled={revoke.isPending} onClick={() => revoke.mutate(session.id)}>Thu hồi</button></div>)}{sessions.isSuccess && sessions.data.length > 0 && <button className="danger btn-sm" type="button" disabled={revokeAll.isPending} onClick={() => revokeAll.mutate()}>Đăng xuất mọi phiên</button>}</div>}</td><td><label className="admin-checkbox"><input type="checkbox" checked={disabled} onChange={(event) => setDisabled(event.target.checked)} /> Vô hiệu hóa</label></td><td><details><summary>Quyền</summary><div className="permission-list">{permissions.map((permission) => <label className="admin-checkbox" key={permission}><input type="checkbox" checked={selected.includes(permission)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, permission] : current.filter((item) => item !== permission))} />{permission}</label>)}<button className="primary btn-sm" type="button" disabled={busy} onClick={() => onSave({ role, disabled, selected })}>Lưu quyền</button></div></details></td></tr>;
}
