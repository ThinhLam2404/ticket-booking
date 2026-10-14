import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api';
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui';
import { money, formatDate } from '../../../utils/format';
import { AdminPage } from '../shared';

export function AdminBookingsPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const status = params.get('status') ?? '';
  const after = params.get('after') ?? undefined;
  const before = params.get('before') ?? undefined;
  const from = params.get('from') ?? undefined;
  const to = params.get('to') ?? undefined;
  const [searchInput, setSearchInput] = useState(search);
  const query = useQuery({ queryKey: ['admin-bookings', search, status, from, to, after, before], queryFn: ({ signal }) => api.adminBookings({ search: search || undefined, status: status || undefined, from, to, after, before }, signal) });
  useEffect(() => { const timer = window.setTimeout(() => { if (searchInput !== search) setParams((current) => { current.set('search', searchInput); current.delete('after'); current.delete('before'); return current; }); }, 300); return () => window.clearTimeout(timer); }, [searchInput, search, setParams]);
  const bookings = query.data?.data ?? [];
  const meta = query.data?.meta;
  const updateStatus = (value: string) => setParams((current) => { current.set('status', value); current.delete('after'); current.delete('before'); return current; });
  const move = (cursor: string | null, direction: 'after' | 'before') => { if (!cursor) return; setParams((current) => { current.set(direction, cursor); current.delete(direction === 'after' ? 'before' : 'after'); return current; }); };
  return <AdminPage><div className="admin-page-header"><div><p className="eyebrow">VẬN HÀNH</p><h1>Quản lý đặt vé</h1></div></div><div className="toolbar"><input aria-label="Tìm đặt vé" placeholder="Tìm mã đặt vé hoặc email…" value={searchInput} onChange={e => setSearchInput(e.target.value)} /><select aria-label="Lọc trạng thái" value={status} onChange={e => updateStatus(e.target.value)}><option value="">Tất cả trạng thái</option><option value="PENDING">Chờ thanh toán</option><option value="CONFIRMED">Đã xác nhận</option><option value="CANCELLED">Đã hủy</option><option value="EXPIRED">Đã hết hạn</option></select></div>{query.isPending && <LoadingState label="Đang tải đặt vé…" />}{query.isError && <ErrorState cause={query.error} fallback="Không thể tải danh sách đặt vé." onRetry={() => void query.refetch()} />}{query.isSuccess && !bookings.length && <EmptyState>Không có đặt vé phù hợp.</EmptyState>}{bookings.length > 0 && <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Mã đặt vé</th><th>Khách hàng</th><th>Suất chiếu</th><th>Tổng tiền</th><th>Trạng thái</th><th /></tr></thead><tbody>{bookings.map(b => <tr key={b.id}><td><strong>#{b.id}</strong><small>{formatDate(b.createdAt)}</small></td><td>{b.userId}</td><td>{b.showtime?.movie?.title ?? '—'}</td><td>{money(b.totalAmount)}</td><td><span className={`status ${b.status.toLowerCase()}`}>{b.status}</span></td><td><Link className="secondary compact-button" to={`/admin/bookings/${b.id}`}>Chi tiết</Link></td></tr>)}</tbody></table></div>}{meta && <div className="cursor-pagination"><button className="secondary" disabled={!meta.hasPreviousPage || query.isFetching} onClick={() => move(meta.previousCursor, 'before')}>← Trước</button><span>{meta.hasNextPage ? 'Có thêm đặt vé' : 'Cuối danh sách'}</span><button className="secondary" disabled={!meta.hasNextPage || query.isFetching} onClick={() => move(meta.nextCursor, 'after')}>Tiếp →</button></div>}</AdminPage>;
}
