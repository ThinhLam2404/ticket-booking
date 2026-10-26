import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../../components/ui';
import { formatDate, formatTime, money } from '../../utils/format';
import { QrCode, TicketPoster } from './components';
import { TicketCombos } from './TicketCombos';

export function TicketPage() {
  const { ticketId } = useParams();
  const query = useQuery({ queryKey: ['ticket', ticketId], queryFn: ({ signal }) => api.ticket(ticketId!, signal), enabled: Boolean(ticketId) });
  const ticket = query.data;
  if (query.isPending) return <LoadingState label="Đang tải vé…" />;
  if (query.isError) return <ErrorState cause={query.error} fallback="Không thể tải vé." onRetry={() => void query.refetch()} />;
  if (!ticket) return <EmptyState>Không tìm thấy vé.</EmptyState>;
  const title = ticket.booking.showtime.movie.title;
  const seat = `${ticket.bookingItem.showtimeSeat.seat.row}${ticket.bookingItem.showtimeSeat.seat.number}`;

  return <section className="ticket-detail-page">
    <div className="breadcrumb"><Link to="/tickets">← Vé của tôi</Link><span>›</span><strong>Chi tiết vé</strong></div>
    <div className="ticket-detail-layout">
      <section className="ticket-stub-large" id="ticket-checkin">
        <div className="ticket-stub-top"><p className="eyebrow">CINEBOOK E-TICKET</p><span className="ticket-code">{ticket.code}</span><StatusBadge status={ticket.status} /></div>
        <div className="ticket-qr-frame"><QrCode code={ticket.code} /><span className="ticket-qr-label">MÃ SOÁT VÉ: {ticket.code}</span></div>
        <div className="ticket-stub-movie"><TicketPoster title={title} posterUrl={ticket.booking.showtime.movie.posterUrl} /><div><strong>{title}</strong><span>{ticket.booking.showtime.room?.cinema?.name} · {ticket.booking.showtime.room?.name}</span></div></div>
        <div className="checkin-message" role="status"><strong>Mã soát vé đã sẵn sàng</strong><span>Đưa mã QR này cho nhân viên tại cổng kiểm soát vé.</span></div>
      </section>
      <section className="ticket-information"><PageHeader eyebrow="CHI TIẾT VÉ" title={title}><StatusBadge status={ticket.status} /></PageHeader><p className="ticket-intro">Xuất trình mã QR tại cổng kiểm soát vé để vào phòng chiếu.</p><dl><div><dt>Ngày chiếu</dt><dd>{formatDate(ticket.booking.showtime.startsAt)}</dd></div><div><dt>Thời lượng</dt><dd>{formatTime(ticket.booking.showtime.startsAt)} — {formatTime(ticket.booking.showtime.endsAt)}</dd></div><div><dt>Rạp / phòng</dt><dd>{ticket.booking.showtime.room?.cinema?.name} · {ticket.booking.showtime.room?.name}</dd></div><div><dt>Ghế</dt><dd>{seat}</dd></div><div><dt>Giá vé</dt><dd>{money(ticket.bookingItem.price)}</dd></div><div><dt>Mã booking</dt><dd>#{ticket.bookingId.slice(-8)}</dd></div></dl><div className="ticket-detail-actions"><button className="secondary" type="button" onClick={() => document.getElementById('ticket-checkin')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>Xem mã soát vé</button><button className="secondary" type="button" onClick={() => window.print()}>In / lưu vé</button></div></section>
    </div>
    <TicketCombos bookingId={ticket.bookingId} />
  </section>;
}
