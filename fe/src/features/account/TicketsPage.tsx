import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../../components/ui';
import { formatDate, money } from '../../utils/format';
import { TicketPoster } from './components';

type TicketFilter = 'ALL' | 'ACTIVE' | 'USED' | 'CANCELLED';
const ticketFilters: Array<[TicketFilter, string]> = [['ALL', 'Tất cả vé'], ['ACTIVE', 'Sắp chiếu'], ['USED', 'Đã sử dụng'], ['CANCELLED', 'Đã hủy']];

export function TicketsPage() {
  const [params, setParams] = useSearchParams();
  const filter = (params.get('status') ?? 'ALL') as TicketFilter;
  const search = params.get('search') ?? '';
  const [searchInput, setSearchInput] = useState(search);
  const after = params.get('after') ?? undefined;
  const before = params.get('before') ?? undefined;
  const from = params.get('from') ?? undefined;
  const to = params.get('to') ?? undefined;
  const query = useQuery({
    queryKey: ['tickets', filter, search, from, to, after, before],
    queryFn: ({ signal }) => api.tickets({ status: filter === 'ALL' ? undefined : filter, search: search || undefined, from, to, after, before, limit: 100 }, signal),
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchInput !== search) {
        setParams((current) => {
          current.set('search', searchInput);
          current.delete('after');
          current.delete('before');
          return current;
        });
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, search, setParams]);

  const ticketData = query.data?.data;
  const bookings = useMemo(() => {
    const tickets = ticketData ?? [];
    const groups = new Map<string, typeof tickets>();
    for (const ticket of tickets) {
      const current = groups.get(ticket.bookingId) ?? [];
      current.push(ticket);
      groups.set(ticket.bookingId, current);
    }
    return [...groups.values()];
  }, [ticketData]);
  const meta = query.data?.meta;
  const updateFilter = (value: TicketFilter) => setParams((current) => {
    current.set('status', value);
    current.delete('after');
    current.delete('before');
    return current;
  });
  const move = (cursor: string | null, direction: 'after' | 'before') => {
    if (!cursor) return;
    setParams((current) => {
      current.set(direction, cursor);
      current.delete(direction === 'after' ? 'before' : 'after');
      return current;
    });
  };

  return <section className="records-page tickets-page account-records-page">
    <div className="breadcrumb"><Link to="/">Trang chủ</Link><span>›</span><span>Tài khoản</span><span>›</span><strong>Vé của tôi</strong></div>
    <div className="records-heading"><PageHeader eyebrow="TÀI KHOẢN / VÉ ĐIỆN TỬ" title="Vé của tôi"><span className="ticket-count">{query.isPending ? 'Đang tải vé…' : `${bookings.length} booking`}</span></PageHeader><p>Vé điện tử đã phát hành. Các vé trong cùng một booking được gom vào một thẻ.</p></div>
    <div className="record-toolbar"><div className="filter-tabs" aria-label="Lọc vé">{ticketFilters.map(([value, label]) => <button key={value} className={`filter-chip ${filter === value ? 'active' : ''}`} type="button" onClick={() => updateFilter(value)}>{label}</button>)}</div><label className="record-search"><span aria-hidden="true">⌕</span><span className="sr-only">Tìm vé</span><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Tìm theo tên phim, mã vé hoặc mã booking…" /></label></div>
    {query.isPending && <LoadingState label="Đang tải vé…" />}
    {query.isError && <ErrorState cause={query.error} fallback="Không thể tải vé." onRetry={() => void query.refetch()} />}
    {query.isSuccess && !bookings.length && <EmptyState>{search ? 'Không tìm thấy vé phù hợp.' : 'Bạn chưa có vé điện tử.'}</EmptyState>}
    <div className="ticket-list">{bookings.map((bookingTickets) => {
      const firstTicket = bookingTickets[0];
      const booking = firstTicket.booking;
      const title = booking.showtime?.movie?.title ?? 'Vé CineBook';
      const seats = bookingTickets.map((ticket) => `${ticket.bookingItem?.showtimeSeat?.seat?.row ?? ''}${ticket.bookingItem?.showtimeSeat?.seat?.number ?? ''}`).filter(Boolean);
      const ticketCodes = bookingTickets.map((ticket) => ticket.code);
      const status = bookingTickets.some((ticket) => ticket.status === 'ACTIVE')
        ? 'ACTIVE'
        : bookingTickets.some((ticket) => ticket.status === 'USED')
          ? 'USED'
          : 'CANCELLED';
      return <Link className={`ticket-card booking-ticket-card ${status.toLowerCase()}`} key={booking.id} to={`/bookings/${booking.id}/tickets`}>
        <div className="ticket-card-info"><TicketPoster title={title} posterUrl={booking.showtime?.movie?.posterUrl} /><div>
          <div className="record-status"><StatusBadge status={status} /><span>Mã booking: <strong>#{booking.id.slice(-8)}</strong></span></div>
          <h2>{title}</h2>
          <p>{formatDate(booking.showtime?.startsAt)} · {booking.showtime?.room?.cinema?.name ?? 'Rạp phim'}</p>
          <div className="record-details"><span>Phòng {booking.showtime?.room?.name}</span><span>{seats.length} vé</span></div>
          <div className="booking-seat-chips" aria-label={`Các ghế trong booking, ${seats.length} vé`}>
            {seats.map((seat) => <span key={seat}>Ghế {seat}</span>)}
          </div>
          {booking.comboItems?.length > 0 && <div className="booking-combo-summary" aria-label="Combo trong booking"><strong>Combo bắp nước</strong>{booking.comboItems.map((combo) => <span key={combo.name}>{combo.name} × {combo.quantity}</span>)}</div>}
          <small className="booking-ticket-codes">Mã vé: {ticketCodes.join(' · ')}</small>
        </div></div>
        <div className="ticket-card-stub"><small>TỔNG BOOKING</small><strong>{money(booking.totalAmount)}</strong><span>{seats.length} vé · Xem chi tiết →</span></div>
      </Link>;
    })}</div>
    {meta && <div className="cursor-pagination"><button className="secondary" disabled={!meta.hasPreviousPage || query.isFetching} onClick={() => move(meta.previousCursor, 'before')}>← Trước</button><span>{meta.hasPreviousPage || meta.hasNextPage ? 'Đang xem thêm vé' : 'Cuối danh sách'}</span><button className="secondary" disabled={!meta.hasNextPage || query.isFetching} onClick={() => move(meta.nextCursor, 'after')}>Tiếp →</button></div>}
  </section>;
}
