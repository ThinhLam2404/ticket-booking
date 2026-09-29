import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../../components/ui';
import { formatDate, money } from '../../utils/format';
import { TicketPoster } from './components';

const bookingFilters = [['ALL', 'Tất cả'], ['PENDING', 'Đang chờ'], ['CONFIRMED', 'Đã xác nhận'], ['CANCELLED', 'Đã hủy'], ['EXPIRED', 'Đã hết hạn']] as const;

export function BookingsPage() {
  const [filter, setFilter] = useState<(typeof bookingFilters)[number][0]>('ALL');
  const [search, setSearch] = useState('');
  const query = useQuery({ queryKey: ['bookings'], queryFn: ({ signal }) => api.bookings(signal) });
  const bookings = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (query.data ?? []).filter((booking) => {
      const matchesFilter = filter === 'ALL' || booking.status === filter;
      const searchable = `${booking.id} ${booking.showtime?.movie?.title ?? ''} ${booking.showtime?.room?.cinema?.name ?? ''} ${booking.showtime?.room?.name ?? ''}`.toLowerCase();
      return matchesFilter && (!term || searchable.includes(term));
    });
  }, [filter, query.data, search]);

  return <section className="records-page account-records-page">
    <div className="breadcrumb"><Link to="/">Trang chủ</Link><span>›</span><span>Tài khoản</span><span>›</span><strong>Booking của tôi</strong></div>
    <div className="records-heading"><PageHeader eyebrow="TÀI KHOẢN / LỊCH SỬ" title="Booking của tôi"><a className="secondary" href="tel:19006868">⌁ Hotline hỗ trợ 1900 6868</a></PageHeader><p>Quản lý toàn bộ vé đã đặt và lịch sử xem phim. Xuất trình mã vé hoặc mã QR trực tiếp tại quầy soát vé CineBook.</p></div>
    <div className="record-toolbar"><div className="filter-tabs" aria-label="Lọc booking">{bookingFilters.map(([value, label]) => <button key={value} className={`filter-chip ${filter === value ? 'active' : ''}`} type="button" onClick={() => setFilter(value)}>{label}</button>)}</div><label className="record-search"><span aria-hidden="true">⌕</span><span className="sr-only">Tìm booking</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo mã booking, tên phim…" /></label></div>
    {query.isPending && <LoadingState label="Đang tải booking…" />}
    {query.isError && <ErrorState cause={query.error} fallback="Không thể tải booking." onRetry={() => void query.refetch()} />}
    {query.isSuccess && !bookings.length && <EmptyState>{search ? 'Không tìm thấy booking phù hợp.' : filter === 'ALL' ? 'Bạn chưa có booking nào. Hãy chọn một bộ phim để bắt đầu.' : 'Không có booking ở trạng thái này.'}</EmptyState>}
    <div className="record-list">{bookings.map((booking) => <Link className={`booking-record ${booking.status.toLowerCase()}`} key={booking.id} to={`/bookings/${booking.id}`}><div className="record-main"><TicketPoster title={booking.showtime?.movie?.title ?? ''} posterUrl={booking.showtime?.movie?.posterUrl} /><div className="record-copy"><div className="record-status"><StatusBadge status={booking.status} /><span>Mã booking: <strong>#{booking.id.slice(-8)}</strong></span></div><h2>{booking.showtime?.movie?.title ?? 'Booking CineBook'}</h2><p>{formatDate(booking.showtime?.startsAt)} · {booking.showtime?.room?.cinema?.name ?? 'Rạp phim'}</p><div className="record-details"><span>⌂ {booking.showtime?.room?.name}</span><span>⌑ {booking.items?.length ?? 0} ghế</span></div></div></div><div className="record-total"><small>Tổng tiền thanh toán</small><strong>{money(booking.totalAmount)}</strong><StatusBadge status={booking.status} /><span className="record-action">Xem chi tiết →</span></div></Link>)}</div>
  </section>;
}
