import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../../api';
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui';
import { money, formatDate } from '../../../utils/format';
import { AdminPage } from '../shared';

export function AdminBookingsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const query = useQuery({ queryKey: ['admin-bookings', search, status], queryFn: ({ signal }) => api.adminBookings({ search: search || undefined, status: status || undefined }, signal) });
  const bookings = query.data?.data ?? [];
  return <AdminPage><div className="admin-page-header"><div><p className="eyebrow">VẬN HÀNH</p><h1>Quản lý đặt vé</h1></div></div><div className="toolbar"><input aria-label="Tìm đặt vé" placeholder="Tìm mã đặt vé hoặc email…" value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="Lọc trạng thái" value={status} onChange={e => setStatus(e.target.value)}><option value="">Tất cả trạng thái</option><option value="PENDING">Chờ thanh toán</option><option value="CONFIRMED">Đã xác nhận</option><option value="CANCELLED">Đã hủy</option><option value="EXPIRED">Đã hết hạn</option></select></div>{query.isPending && <LoadingState label="Đang tải đặt vé…" />}{query.isError && <ErrorState cause={query.error} fallback="Không thể tải danh sách đặt vé." onRetry={() => void query.refetch()} />}{query.isSuccess && !bookings.length && <EmptyState>Không có đặt vé phù hợp.</EmptyState>}{bookings.length > 0 && <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Mã đặt vé</th><th>Khách hàng</th><th>Suất chiếu</th><th>Tổng tiền</th><th>Trạng thái</th><th /></tr></thead><tbody>{bookings.map(b => <tr key={b.id}><td><strong>#{b.id}</strong><small>{formatDate(b.createdAt)}</small></td><td>{b.userId}</td><td>{b.showtime?.movie?.title ?? '—'}</td><td>{money(b.totalAmount)}</td><td><span className={`status ${b.status.toLowerCase()}`}>{b.status}</span></td><td><Link className="secondary compact-button" to={`/admin/bookings/${b.id}`}>Chi tiết</Link></td></tr>)}</tbody></table></div>}</AdminPage>;
}
