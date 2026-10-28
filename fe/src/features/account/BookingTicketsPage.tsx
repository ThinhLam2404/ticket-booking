import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../../components/ui';
import { formatDate, money } from '../../utils/format';
import { QrCode, TicketPoster } from './components';
import { ComboSummary } from '../booking/ComboSummary';

export function BookingTicketsPage() {
  const { bookingId } = useParams();
  const query = useQuery({
    queryKey: ['ticket-booking', bookingId],
    queryFn: ({ signal }) => api.booking(bookingId!, signal),
    enabled: Boolean(bookingId),
  });
  const booking = query.data;
  if (query.isPending) return <LoadingState label="Đang tải booking…" />;
  if (query.isError) return <ErrorState cause={query.error} fallback="Không thể tải booking." onRetry={() => void query.refetch()} />;
  if (!booking) return <EmptyState>Không tìm thấy booking.</EmptyState>;

  const title = booking.showtime.movie.title;
  const seats = booking.items.map((item) => `${item.showtimeSeat?.seat.row ?? ''}${item.showtimeSeat?.seat.number ?? ''}`);
  const tickets = booking.tickets ?? [];

  return <section className="ticket-detail-page booking-tickets-page">
    <div className="breadcrumb"><Link to="/tickets">← Vé của tôi</Link><span>›</span><strong>Vé trong booking</strong></div>
    <div className="ticket-booking-heading"><TicketPoster title={title} posterUrl={booking.showtime.movie.posterUrl} /><div><PageHeader eyebrow="BOOKING / VÉ ĐIỆN TỬ" title={title}><StatusBadge status={booking.status} /></PageHeader><p>{formatDate(booking.showtime.startsAt)} · {booking.showtime.room?.cinema?.name} · {booking.showtime.room?.name}</p><strong>Mã booking #{booking.id.slice(-8)} · {seats.length} vé · {money(booking.totalAmount)}</strong></div></div>
    {booking.comboItems?.length > 0 && <div className="booking-tickets-combo"><p>Combo dưới đây thuộc toàn bộ booking, không phải combo riêng cho từng vé.</p><ComboSummary booking={booking} /></div>}
    {!tickets.length ? <EmptyState>Booking này chưa có vé điện tử.</EmptyState> : <div className="booking-ticket-grid">{tickets.map((ticket, index) => <Link className="booking-ticket-item" key={ticket.id} to={`/tickets/${ticket.id}`}><div className="booking-ticket-item-header"><StatusBadge status={ticket.status} /><strong>Vé {index + 1}</strong></div><div className="booking-ticket-qr"><QrCode code={ticket.code} /></div><strong>Ghế {seats[index] ?? '—'}</strong><span>Mã vé {ticket.code}</span><small>Xem chi tiết vé →</small></Link>)}</div>}
  </section>;
}
