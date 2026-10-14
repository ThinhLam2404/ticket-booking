import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../../components/ui';
import { formatDate } from '../../utils/format';
import { QrCode, TicketPoster } from './components';

const ticketFilters = [['ALL', 'Tất cả vé'], ['ACTIVE', 'Sắp chiếu'], ['USED', 'Đã sử dụng'], ['CANCELLED', 'Đã hủy']] as const;

export function TicketsPage() {
  const [params, setParams] = useSearchParams();
  const filter = (params.get('status') ?? 'ALL') as (typeof ticketFilters)[number][0];
  const search = params.get('search') ?? '';
  const [searchInput, setSearchInput] = useState(search);
  const after = params.get('after') ?? undefined;
  const before = params.get('before') ?? undefined;
  const from = params.get('from') ?? undefined;
  const to = params.get('to') ?? undefined;
  const query = useQuery({ queryKey: ['tickets', filter, search, from, to, after, before], queryFn: ({ signal }) => api.tickets({ status: filter === 'ALL' ? undefined : filter, search: search || undefined, from, to, after, before }, signal) });
  useEffect(() => { const timer = window.setTimeout(() => { if (searchInput !== search) setParams((current) => { current.set('search', searchInput); current.delete('after'); current.delete('before'); return current; }); }, 300); return () => window.clearTimeout(timer); }, [searchInput, search, setParams]);
  const tickets = query.data?.data ?? [];
  const meta = query.data?.meta;
  const updateFilter = (value: string) => setParams((current) => { current.set('status', value); current.delete('after'); current.delete('before'); return current; });
  const move = (cursor: string | null, direction: 'after' | 'before') => { if (!cursor) return; setParams((current) => { current.set(direction, cursor); current.delete(direction === 'after' ? 'before' : 'after'); return current; }); };
  return <section className="records-page tickets-page account-records-page">
    <div className="breadcrumb"><Link to="/">Trang chủ</Link><span>›</span><span>Tài khoản</span><span>›</span><strong>Vé của tôi</strong></div>
    <div className="records-heading"><PageHeader eyebrow="TÀI KHOẢN / VÉ ĐIỆN TỬ" title="Vé của tôi"><span className="ticket-count">{tickets.length} vé đang tải</span></PageHeader><p>Quản lý vé đã đặt và mã QR vào phòng chiếu.</p></div>
    <div className="record-toolbar"><div className="filter-tabs" aria-label="Lọc vé">{ticketFilters.map(([value, label]) => <button key={value} className={`filter-chip ${filter === value ? 'active' : ''}`} type="button" onClick={() => updateFilter(value)}>{label}</button>)}</div><label className="record-search"><span aria-hidden="true">⌕</span><span className="sr-only">Tìm vé</span><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Tìm theo tên phim hoặc mã vé…" /></label></div>
    {query.isPending && <LoadingState label="Đang tải vé…" />}
    {query.isError && <ErrorState cause={query.error} fallback="Không thể tải vé." onRetry={() => void query.refetch()} />}
    {query.isSuccess && !tickets.length && <EmptyState>{search ? 'Không tìm thấy vé phù hợp.' : 'Bạn chưa có vé phù hợp.'}</EmptyState>}
    <div className="ticket-list">{tickets.map((ticket) => { const title = ticket.booking?.showtime?.movie?.title ?? 'Vé CineBook'; return <Link className={`ticket-card ${ticket.status.toLowerCase()}`} key={ticket.id} to={`/tickets/${ticket.id}`}><div className="ticket-card-info"><TicketPoster title={title} posterUrl={ticket.booking?.showtime?.movie?.posterUrl} /><div><div className="record-status"><StatusBadge status={ticket.status} /><span>Mã vé: <strong>#{ticket.code}</strong></span></div><h2>{title}</h2><p>{formatDate(ticket.booking?.showtime?.startsAt)} · {ticket.booking?.showtime?.room?.cinema?.name}</p><div className="record-details"><span>Phòng {ticket.booking?.showtime?.room?.name}</span><span>Ghế {ticket.bookingItem?.showtimeSeat?.seat?.row}{ticket.bookingItem?.showtimeSeat?.seat?.number}</span></div></div></div><div className="ticket-card-stub"><small>MÃ SOÁT VÉ</small><QrCode code={ticket.code} /><strong>{ticket.code}</strong><span>Xem mã vé →</span></div></Link>; })}</div>
    {meta && <div className="cursor-pagination"><button className="secondary" disabled={!meta.hasPreviousPage || query.isFetching} onClick={() => move(meta.previousCursor, 'before')}>← Trước</button><span>{meta.hasPreviousPage || meta.hasNextPage ? 'Đang xem thêm vé' : 'Cuối danh sách'}</span><button className="secondary" disabled={!meta.hasNextPage || query.isFetching} onClick={() => move(meta.nextCursor, 'after')}>Tiếp →</button></div>}
  </section>;
}
