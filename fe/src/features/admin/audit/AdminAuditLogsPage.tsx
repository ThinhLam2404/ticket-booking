import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../../api';
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui';
import { formatDate, errorMessage, statusLabel } from '../../../utils/format';
import { AdminPage, permissionText, roleText, Toolbar } from '../shared';

const auditFieldLabels: Record<string, string> = {
  id: 'Mã bản ghi',
  email: 'Email',
  role: 'Vai trò',
  disabledAt: 'Vô hiệu hóa lúc',
  permission: 'Quyền',
  sessionId: 'Mã phiên',
  count: 'Số lượng',
  status: 'Trạng thái',
  reason: 'Lý do',
  resourceType: 'Loại tài nguyên',
};

function shortIdentifier(value: string) {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function auditValueLabel(key: string, value: unknown) {
  if (value == null || value === '') return 'Không ghi nhận';
  if (key === 'role' && typeof value === 'string') return roleText[value] ?? value;
  if (key === 'permission' && typeof value === 'string') {
    return value.split(',').map((permission) => permissionText[permission.trim()] ?? permission.trim()).join(', ');
  }
  if (key === 'status' && typeof value === 'string') return statusLabel(value);
  if (key === 'disabledAt' && typeof value === 'string') return formatDate(value);
  if (key === 'sessionId' && typeof value === 'string') return shortIdentifier(value);
  if (key === 'count' && typeof value === 'number') return value.toLocaleString('vi-VN');
  return String(value);
}

function AuditSummary({ value, emptyLabel = 'Không ghi nhận thay đổi' }: { value: unknown; emptyLabel?: string }) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return <p className="audit-empty-value">{emptyLabel}</p>;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return <p className="audit-empty-value">{emptyLabel}</p>;
  return <dl className="audit-summary-list">{entries.map(([key, item]) => <div key={key}><dt>{auditFieldLabels[key] ?? key}</dt><dd title={typeof item === 'string' ? item : undefined}>{auditValueLabel(key, item)}</dd></div>)}</dl>;
}

function auditEventLabel(action: string, side: 'before' | 'after') {
  if (action === 'LOGIN_SUCCEEDED' && side === 'after') return 'Phiên đăng nhập đã được tạo';
  if (action.includes('SESSION_REVOKED') && side === 'after') return 'Phiên đăng nhập đã được thu hồi';
  if (action === 'SESSIONS_REVOKED_OTHERS' && side === 'after') return 'Các phiên khác đã được thu hồi';
  if (action === 'SESSIONS_REVOKED_ALL' && side === 'after') return 'Tất cả phiên đã được thu hồi';
  return side === 'before' ? 'Không có trạng thái trước sự kiện' : 'Không ghi nhận thay đổi';
}

type AuditEntry = Awaited<ReturnType<typeof api.auditLogs>>[number];

function AuditChange({ entry }: { entry: AuditEntry }) {
  return <details className="audit-details">
    <summary>Xem trước / sau</summary>
    <div className="audit-change-grid">
      <div><strong>Trước</strong><AuditSummary value={entry.before} emptyLabel={auditEventLabel(entry.action, 'before')} /></div>
      <div><strong>Sau</strong><AuditSummary value={entry.after} emptyLabel={auditEventLabel(entry.action, 'after')} /></div>
    </div>
  </details>;
}

function AuditCard({ entry }: { entry: AuditEntry }) {
  return <article className="admin-audit-card">
    <div className="admin-audit-card-head"><div><span className="status-chip">{entry.action}</span><strong>{entry.resourceType}</strong><small>{entry.resourceId ?? 'Không có mã tài nguyên'}</small></div><time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time></div>
    <div className="admin-audit-card-meta"><span>Người thực hiện: <strong>{entry.actorEmail ?? 'Hệ thống'}</strong></span><span>Request ID: <code>{entry.requestId ?? '—'}</code></span></div>
    <AuditChange entry={entry} />
  </article>;
}

export function AdminAuditLogsPage() {
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [actorUserId, setActorUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const query = useQuery({
    queryKey: ['admin-audit-logs', search, action, resourceType, actorUserId, from, to],
    queryFn: () => api.auditLogs({
      limit: 100,
      search: search.trim() || undefined,
      action: action.trim() || undefined,
      resourceType: resourceType.trim() || undefined,
      actorUserId: actorUserId.trim() || undefined,
      from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
      to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
    }),
    retry: 1,
  });

  return <AdminPage>
    <div className="admin-page-header"><div><p className="eyebrow">ACCOUNTABILITY</p><h1>Nhật ký thao tác</h1><p className="admin-page-lede">Theo dõi ai đã thay đổi dữ liệu quản trị và khi nào.</p></div></div>
    <Toolbar>
      <input aria-label="Tìm nhật ký" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm action, email, resource ID…" />
      <input aria-label="Lọc theo hành động" value={action} onChange={(event) => setAction(event.target.value)} placeholder="Action, ví dụ USER_ACCESS_UPDATED" />
      <input aria-label="Lọc theo loại tài nguyên" value={resourceType} onChange={(event) => setResourceType(event.target.value)} placeholder="Loại tài nguyên, ví dụ User" />
      <input aria-label="Lọc theo mã người thực hiện" value={actorUserId} onChange={(event) => setActorUserId(event.target.value)} placeholder="Mã người thực hiện" />
      <label className="admin-date-filter"><span>Từ ngày</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label className="admin-date-filter"><span>Đến ngày</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <button className="secondary btn-sm" type="button" onClick={() => { setSearch(''); setAction(''); setResourceType(''); setActorUserId(''); setFrom(''); setTo(''); }}>Xóa bộ lọc</button>
    </Toolbar>
    {query.isFetching && !query.isPending && <p className="admin-inline-status" role="status">Đang cập nhật nhật ký…</p>}
    {query.isPending && <LoadingState label="Đang tải nhật ký…" />}
    {query.isError && <ErrorState cause={query.error} fallback={errorMessage(query.error, 'Không thể tải nhật ký thao tác.')} onRetry={() => void query.refetch()} />}
    {query.isSuccess && query.data.length === 0 && <EmptyState>Chưa có thao tác phù hợp với bộ lọc.</EmptyState>}
    {query.isSuccess && query.data.length > 0 && <>
      <div className="admin-table-wrap admin-audit-desktop"><table className="admin-table admin-audit-table"><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Tài nguyên</th><th>Thay đổi</th><th>Request ID</th></tr></thead><tbody>{query.data.map((entry) => <tr key={entry.id}><td>{formatDate(entry.createdAt)}</td><td><strong>{entry.actorEmail ?? 'Hệ thống'}</strong><small>{entry.actorUserId ?? '—'}</small></td><td><span className="status-chip">{entry.action}</span></td><td>{entry.resourceType}<small>{entry.resourceId ?? '—'}</small></td><td><AuditChange entry={entry} /></td><td><code>{entry.requestId ?? '—'}</code></td></tr>)}</tbody></table></div>
      <div className="admin-audit-mobile">{query.data.map((entry) => <AuditCard key={entry.id} entry={entry} />)}</div>
    </>}
  </AdminPage>;
}
