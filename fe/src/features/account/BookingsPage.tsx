import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../../components/ui';
import { formatDate, money } from '../../utils/format';
import { TicketPoster } from './components';

const bookingFilters = [['ALL', 'Tất cả'], ['PENDING', 'Đang chờ'], ['CONFIRMED', 'Đã xác nhận'], ['CANCELLED', 'Đã hủy'], ['EXPIRED', 'Đã hết hạn']] as const;

export function BookingsPage() {
  const [params, setParams] = useSearchParams();
  const filter = (params.get('status') ?? 'ALL') as (typeof bookingFilters)[number][0];
  const search = params.get('search') ?? '';
  const [searchInput, setSearchInput] = useState(search);
  const after = params.get('after') ?? undefined;
  const before = params.get('before') ?? undefined;
  const from = params.get('from') ?? undefined;
  const to = params.get('to') ?? undefined;
  const query = useQuery({ queryKey: ['bookings', filter, search, from, to, after, before], queryFn: ({ signal }) => api.bookings({ status: filter === 'ALL' ? undefined : filter, search: search || undefined, from, to, after, before }, signal) });
  useEffect(() => { const timer = window.setTimeout(() => { if (searchInput !== search) setParams((current) => { current.set('search', searchInput); current.delete('after'); current.delete('before'); return current; }); }, 300); return () => window.clearTimeout(timer); }, [searchInput, search, setParams]);
  const bookings = query.data?.data ?? [];
  const meta = query.data?.meta;
  const updateFilter = (value: string) => setParams((current) => { current.set('status', value); current.delete('after'); current.delete('before'); return current; });
  const move = (cursor: string | null, direction: 'after' | 'before') => { if (!cursor) return; setParams((current) => { current.set(direction, cursor); current.delete(direction === 'after' ? 'before' : 'after'); return current; }); };
  return <section className="records-page account-records-page">
    <div className="breadcrumb"><Link to="/">Trang chủ</Link><span>›</span><span>Tài khoản</span><span>›</span><strong>Booking của tôi</strong></div>
    <div className="records-heading"><PageHeader eyebrow="TÀI KHOẢN / LỊCH SỬ" title="Booking của tôi"><a className="secondary" href="tel:19006868">⌁ Hotline hỗ trợ 1900 6868</a></PageHeader><p>Quản lý toàn bộ vé đã đặt và lịch sử xem phim.</p></div>
    <div className="record-toolbar"><div className="filter-tabs" aria-label="Lọc booking">{bookingFilters.map(([value, label]) => <button key={value} className={`filter-chip ${filter === value ? 'active' : ''}`} type="button" onClick={() => updateFilter(value)}>{label}</button>)}</div><label className="record-search"><span aria-hidden="true">⌕</span><span className="sr-only">Tìm booking</span><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Tìm theo mã booking…" /></label></div>
    {query.isPending && <LoadingState label="Đang tải booking…" />}
    {query.isError && <ErrorState cause={query.error} fallback="Không thể tải booking." onRetry={() => void query.refetch()} />}
    {query.isSuccess && !bookings.length && <EmptyState>{search ? 'Không tìm thấy booking phù hợp.' : 'Bạn chưa có booking nào.'}</EmptyState>}
    <div className="record-list">{bookings.map((booking) => <Link className={`booking-record ${booking.status.toLowerCase()}`} key={booking.id} to={`/bookings/${booking.id}`}><div className="record-main"><TicketPoster title={booking.showtime?.movie?.title ?? ''} posterUrl={booking.showtime?.movie?.posterUrl} /><div className="record-copy"><div className="record-status"><StatusBadge status={booking.status} /><span>Mã booking: <strong>#{booking.id.slice(-8)}</strong></span></div><h2>{booking.showtime?.movie?.title ?? 'Booking CineBook'}</h2><p>{formatDate(booking.showtime?.startsAt)} · {booking.showtime?.room?.cinema?.name ?? 'Rạp phim'}</p><div className="record-details"><span>⌂ {booking.showtime?.room?.name}</span><span>⌑ {booking.items?.length ?? 0} ghế</span></div></div></div><div className="record-total"><small>Tổng tiền thanh toán</small><strong>{money(booking.totalAmount)}</strong><StatusBadge status={booking.status} /><span className="record-action">Xem chi tiết →</span></div></Link>)}</div>
    {meta && <div className="cursor-pagination"><button className="secondary" disabled={!meta.hasPreviousPage || query.isFetching} onClick={() => move(meta.previousCursor, 'before')}>← Trước</button><span>{meta.hasPreviousPage || meta.hasNextPage ? 'Đang xem thêm booking' : 'Cuối danh sách'}</span><button className="secondary" disabled={!meta.hasNextPage || query.isFetching} onClick={() => move(meta.nextCursor, 'after')}>Tiếp →</button></div>}
  </section>;
}
