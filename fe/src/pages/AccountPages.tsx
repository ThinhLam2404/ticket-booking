import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../components/ui';
import { formatDate, formatTime, money } from '../utils/format';
import { posterStyle } from '../utils/media';

function QrCode({ code }: { code: string }) {
  const [state, setState] = useState<{ src: string; error: boolean }>({ src: '', error: false });

  useEffect(() => {
    let active = true;
    setState({ src: '', error: false });
    void QRCode.toDataURL(`cinebook-ticket:v1:${code}`, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 220,
      color: { dark: '#101820', light: '#ffffff' },
    }).then((url) => {
      if (active) setState({ src: url, error: false });
    }).catch(() => {
      if (active) setState({ src: '', error: true });
    });
    return () => {
      active = false;
    };
  }, [code]);

  if (state.src) return <img className="qr-code" src={state.src} alt={`Mã QR vé ${code}`} width={220} height={220} />;
  return <div className={`qr-code qr-code-loading ${state.error ? 'qr-code-error' : ''}`} role="status" aria-label={state.error ? `Không thể tạo mã QR ${code}` : `Đang tạo mã QR ${code}`}>{state.error ? 'QR lỗi' : null}</div>;
}

function TicketPoster({ title, posterUrl, className = '' }: { title: string; posterUrl?: string | null; className?: string }) {
  return <div className={`ticket-poster-image ${className}`} style={posterStyle(title, posterUrl)} />;
}

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
  </section>;
}
