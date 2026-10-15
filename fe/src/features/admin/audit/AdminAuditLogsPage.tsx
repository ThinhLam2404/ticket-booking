import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../../api';
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui';
import { formatDate, errorMessage } from '../../../utils/format';
import { AdminPage, Toolbar } from '../shared';

export function AdminAuditLogsPage() {
  const [action, setAction] = useState('');
  const [resourceType, setResourceType] = useState('');
  const query = useQuery({
    queryKey: ['admin-audit-logs', action, resourceType],
    queryFn: () => api.auditLogs({ limit: 100, action: action || undefined, resourceType: resourceType || undefined }),
  });
  return <AdminPage>
    <div className="admin-page-header"><div><p className="eyebrow">ACCOUNTABILITY</p><h1>Nhật ký thao tác</h1></div></div>
    <Toolbar>
      <input aria-label="Lọc theo hành động" value={action} onChange={(event) => setAction(event.target.value)} placeholder="Hành động, ví dụ USER_ACCESS_UPDATED" />
      <input aria-label="Lọc theo loại tài nguyên" value={resourceType} onChange={(event) => setResourceType(event.target.value)} placeholder="Loại tài nguyên" />
    </Toolbar>
    {query.isPending && <LoadingState label="Đang tải nhật ký…" />}
    {query.isError && <ErrorState cause={query.error} fallback={errorMessage(query.error, 'Không thể tải nhật ký thao tác.')} onRetry={() => void query.refetch()} />}
    {query.isSuccess && query.data.length === 0 && <EmptyState>Chưa có thao tác phù hợp.</EmptyState>}
    {query.isSuccess && query.data.length > 0 && <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Thời gian</th><th>Actor</th><th>Hành động</th><th>Tài nguyên</th><th>Before / After</th><th>Request ID</th></tr></thead><tbody>{query.data.map((entry) => <tr key={entry.id}><td>{formatDate(entry.createdAt)}</td><td><strong>{entry.actorEmail ?? 'Hệ thống'}</strong><small>{entry.actorUserId ?? '—'}</small></td><td><span className="status-chip">{entry.action}</span></td><td>{entry.resourceType}<small>{entry.resourceId ?? '—'}</small></td><td><code>{JSON.stringify({ before: entry.before, after: entry.after })}</code></td><td><code>{entry.requestId ?? '—'}</code></td></tr>)}</tbody></table></div>}
  </AdminPage>;
}
