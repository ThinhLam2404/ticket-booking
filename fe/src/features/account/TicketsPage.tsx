import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../../components/ui';
import { formatDate } from '../../utils/format';
import { QrCode, TicketPoster } from './components';

const ticketFilters = [['ALL', 'Tất cả vé'], ['ACTIVE', 'Sắp chiếu'], ['USED', 'Đã sử dụng'], ['CANCELLED', 'Đã hủy']] as const;

export function TicketsPage() {
  const [filter, setFilter] = useState<(typeof ticketFilters)[number][0]>('ALL');
  const [search, setSearch] = useState('');
  const query = useQuery({ queryKey: ['tickets'], queryFn: ({ signal }) => api.tickets(signal) });
  const tickets = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (query.data ?? []).filter((ticket) => {
      const matchesFilter = filter === 'ALL' || ticket.status === filter;
      const title = ticket.booking?.showtime?.movie?.title ?? '';
      const searchable = `${ticket.code} ${ticket.id} ${ticket.bookingId} ${title} ${ticket.booking?.showtime?.room?.cinema?.name ?? ''}`.toLowerCase();
      return matchesFilter && (!term || searchable.includes(term));
    });
  }, [filter, query.data, search]);

  return <section className="records-page tickets-page account-records-page">
    <div className="breadcrumb"><Link to="/">Trang chủ</Link><span>›</span><span>Tài khoản</span><span>›</span><strong>Vé của tôi</strong></div>
    <div className="records-heading"><PageHeader eyebrow="TÀI KHOẢN / VÉ ĐIỆN TỬ" title="Vé của tôi"><span className="ticket-count">{tickets.length} vé</span></PageHeader><p>Quản lý vé đã đặt, xuất trình mã QR vào phòng chiếu hoặc kiểm tra lịch sử xem phim của bạn.</p></div>
    <div className="record-toolbar"><div className="filter-tabs" aria-label="Lọc vé">{ticketFilters.map(([value, label]) => <button key={value} className={`filter-chip ${filter === value ? 'active' : ''}`} type="button" onClick={() => setFilter(value)}>{label}</button>)}</div><label className="record-search"><span aria-hidden="true">⌕</span><span className="sr-only">Tìm vé</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên phim hoặc mã vé…" /></label></div>
    {query.isPending && <LoadingState label="Đang tải vé…" />}
    {query.isError && <ErrorState cause={query.error} fallback="Không thể tải vé." onRetry={() => void query.refetch()} />}
    {query.isSuccess && !tickets.length && <EmptyState>{search ? 'Không tìm thấy vé phù hợp.' : 'Bạn chưa có vé phù hợp. Hoàn tất thanh toán để nhận vé.'}</EmptyState>}
    <div className="ticket-list">{tickets.map((ticket) => { const title = ticket.booking?.showtime?.movie?.title ?? 'Vé CineBook'; return <Link className={`ticket-card ${ticket.status.toLowerCase()}`} key={ticket.id} to={`/tickets/${ticket.id}`}><div className="ticket-card-info"><TicketPoster title={title} posterUrl={ticket.booking?.showtime?.movie?.posterUrl} /><div><div className="record-status"><StatusBadge status={ticket.status} /><span>Mã vé: <strong>#{ticket.code}</strong></span></div><h2>{title}</h2><p>{formatDate(ticket.booking?.showtime?.startsAt)} · {ticket.booking?.showtime?.room?.cinema?.name}</p><div className="record-details"><span>Phòng {ticket.booking?.showtime?.room?.name}</span><span>Ghế {ticket.bookingItem?.showtimeSeat?.seat?.row}{ticket.bookingItem?.showtimeSeat?.seat?.number}</span></div></div></div><div className="ticket-card-stub"><small>MÃ SOÁT VÉ</small><QrCode code={ticket.code} /><strong>{ticket.code}</strong><span>Xem mã vé →</span></div></Link>; })}</div>
  </section>;
}
