import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ApiClientError, api, cancelBookingKeepalive } from '../api';
import { Alert, EmptyState, ErrorState, LoadingState, NoticeDialog } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { useCountdown } from '../components/useCountdown';
import type { SepayCheckoutResponse, ShowtimeSeat } from '../types';
import { errorMessage, formatDate, formatTime, money, statusLabel } from '../utils/format';
import { initials, posterStyle } from '../utils/media';
import { couplePartnerNumber } from '../utils/seat-layout';

const SHOWTIME_BUFFER_SECONDS = 5 * 60;

function MiniPoster({ title, posterUrl }: { title: string; posterUrl?: string | null }) {
  return <div className="mini-poster" style={posterStyle(title, posterUrl)}>{posterUrl ? '' : initials(title)}</div>;
}

function seatTypeLabel(type: ShowtimeSeat['seat']['type']) {
  return type === 'VIP' ? 'Ghế VIP · Trung tâm' : type === 'COUPLE' ? 'Ghế đôi · 2 chỗ' : 'Ghế thường';
}

function SeatButton({ seat, selected, onToggle }: { seat: ShowtimeSeat; selected: boolean; onToggle: () => void }) {
  const unavailable = seat.status !== 'AVAILABLE';
  const typeClass = seat.seat.type.toLowerCase();
  return <button className={`seat ${typeClass} ${seat.status.toLowerCase()} ${selected ? 'chosen' : ''}`} disabled={unavailable} onClick={onToggle} aria-label={`Ghế ${seat.seat.row}${seat.seat.number}, ${seat.seat.type === 'COUPLE' ? 'ghế đôi' : selected ? 'đang chọn' : statusLabel(seat.status)}`} title={`${seat.seat.row}${seat.seat.number} · ${seatTypeLabel(seat.seat.type)} · ${money(seat.price)}`}><span>{unavailable ? seat.status === 'HELD' ? '⌑' : '×' : seat.seat.number}</span></button>;
}

function BookingSteps({ active }: { active: 'seats' | 'payment' }) {
  const steps = [['movie', 'Chọn phim'], ['seats', 'Chọn ghế'], ['payment', 'Thanh toán'], ['ticket', 'Nhận vé']] as const;
  const activeIndex = active === 'seats' ? 1 : 2;
  return <div className="booking-steps" aria-label="Tiến trình đặt vé">{steps.map(([key, label], index) => <div className={`booking-step ${index === activeIndex ? 'active' : ''} ${index < activeIndex ? 'complete' : ''}`} key={key}><span>{index < activeIndex ? '✓' : index + 1}</span><strong>{label}</strong></div>)}</div>;
}

export function SeatsPage() {
  const { showtimeId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, openAuth } = useAuth();
  const location = useLocation();
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [holdExpiredNotice, setHoldExpiredNotice] = useState(false);
  const [holdConflict, setHoldConflict] = useState<'HELD' | 'UNAVAILABLE' | null>(null);
  const holdKey = useRef(`hold-${crypto.randomUUID()}`);
  const showtimeQuery = useQuery({ queryKey: ['showtime', showtimeId], queryFn: ({ signal }) => api.showtime(showtimeId!, signal), enabled: Boolean(showtimeId) });
  const seatsQuery = useQuery({ queryKey: ['showtime-seats', showtimeId], queryFn: ({ signal }) => api.showtimeSeats(showtimeId!, signal), enabled: Boolean(showtimeId), refetchInterval: 10000 });
  const showtimeCountdown = useCountdown(showtimeQuery.data?.startsAt);
  const holdMutation = useMutation({ mutationFn: () => api.hold(showtimeId!, selectedSeats, holdKey.current), onSuccess: (booking) => { queryClient.setQueryData(['booking', booking.id], booking); void queryClient.invalidateQueries({ queryKey: ['showtime-seats', showtimeId] }); navigate(`/bookings/${booking.id}`); }, onError: (cause) => { void seatsQuery.refetch(); setSelectedSeats([]); holdKey.current = `hold-${crypto.randomUUID()}`; if (cause instanceof ApiClientError && cause.code === 'SEATS_HELD') setHoldConflict('HELD'); else if (cause instanceof ApiClientError && cause.code === 'SEATS_UNAVAILABLE') setHoldConflict('UNAVAILABLE'); } });

  useEffect(() => { holdKey.current = `hold-${crypto.randomUUID()}`; setSelectedSeats([]); }, [showtimeId]);
  useEffect(() => {
    if (!location.state?.holdExpired) return;
    setHoldExpiredNotice(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);
  useEffect(() => {
    if (!seatsQuery.data) return;
    const seatsById = new Map(seatsQuery.data.seats.map((seat) => [seat.id, seat]));
    setSelectedSeats((current) => {
      const selected = new Set(current);
      for (const id of current) {
        const seat = seatsById.get(id);
        if (!seat || seat.status !== 'AVAILABLE') {
          selected.delete(id);
          continue;
        }
        if (seat.seat.type === 'COUPLE') {
          const partnerNumber = couplePartnerNumber(seat.seat.number);
          const partner = seatsQuery.data.seats.find(
            (candidate) =>
              candidate.seat.row === seat.seat.row &&
              candidate.seat.number === partnerNumber,
          );
          if (!partner || partner.status !== 'AVAILABLE' || !selected.has(partner.id)) {
            selected.delete(id);
            if (partner) selected.delete(partner.id);
          }
        }
      }
      const next = current.filter((id) => selected.has(id));
      return next.length === current.length ? current : next;
    });
  }, [seatsQuery.data]);
  const selectedTotal = useMemo(() => (seatsQuery.data?.seats ?? []).reduce((total, seat) => selectedSeats.includes(seat.id) ? total + Number(seat.price) : total, 0), [seatsQuery.data?.seats, selectedSeats]);
  const seatsByRow = useMemo(() => (seatsQuery.data?.seats ?? []).reduce<Record<string, ShowtimeSeat[]>>((rows, seat) => { rows[seat.seat.row] = [...(rows[seat.seat.row] ?? []), seat]; return rows; }, {}), [seatsQuery.data?.seats]);
  function submitHold() {
    if (!user) {
      openAuth();
      return;
    }
    holdMutation.mutate();
  }
  if (!showtimeId || showtimeQuery.isError || seatsQuery.isError) return <ErrorState cause={showtimeQuery.error ?? seatsQuery.error} fallback="Không thể tải sơ đồ ghế." onRetry={() => { void showtimeQuery.refetch(); void seatsQuery.refetch(); }} />;
  if (showtimeQuery.isPending || seatsQuery.isPending) return <LoadingState label="Đang tải sơ đồ ghế…" />;
  if (!showtimeQuery.data || !seatsQuery.data) return <EmptyState>Không tìm thấy suất chiếu.</EmptyState>;
  const showtime = showtimeQuery.data;
  const seats = seatsQuery.data.seats;
  const selectedSeatObjects = seats.filter((seat) => selectedSeats.includes(seat.id));

  const tooClose = showtimeCountdown.seconds > 0 && showtimeCountdown.seconds <= SHOWTIME_BUFFER_SECONDS;

  function toggleSeat(seat: ShowtimeSeat) {
    if (seat.status !== 'AVAILABLE') return;
    const partnerNumber = seat.seat.type === 'COUPLE' ? couplePartnerNumber(seat.seat.number) : null;
    const partner = partnerNumber === null
      ? null
      : seats.find((candidate) => candidate.seat.row === seat.seat.row && candidate.seat.number === partnerNumber);
    if (seat.seat.type === 'COUPLE' && (!partner || partner.seat.type !== 'COUPLE')) return;
    const selectedIds = partner ? [seat.id, partner.id] : [seat.id];
    const unavailablePartner = partner && partner.status !== 'AVAILABLE';
    if (unavailablePartner || selectedIds.some((id) => selectedSeats.includes(id)) && selectedIds.every((id) => selectedSeats.includes(id))) {
      holdKey.current = `hold-${crypto.randomUUID()}`;
      setSelectedSeats((current) => current.filter((id) => !selectedIds.includes(id)));
      return;
    }
    if (partner && (selectedSeats.length + 2 > 10 || partner.seat.type !== 'COUPLE')) return;
    holdKey.current = `hold-${crypto.randomUUID()}`;
    setSelectedSeats((current) => [...new Set([...current, ...selectedIds])].slice(0, 10));
  }

  const actionPending = holdMutation.isPending;

  return <div className="booking-flow-page">{holdExpiredNotice && <Alert type="error" onClose={() => setHoldExpiredNotice(false)}>Phiên giữ ghế đã hết hạn. Ghế đã được trả lại, vui lòng chọn lại.</Alert>}{holdConflict && <NoticeDialog title={holdConflict === 'HELD' ? 'Ghế vừa được người khác giữ' : 'Ghế không còn trống'} message={holdConflict === 'HELD' ? 'Một hoặc nhiều ghế bạn chọn vừa được người khác giữ. Sơ đồ ghế đã được cập nhật.' : 'Một hoặc nhiều ghế bạn chọn không còn khả dụng. Vui lòng chọn lại từ sơ đồ mới nhất.'} onClose={() => setHoldConflict(null)} />}<div className="breadcrumb"><Link to={`/movies/${showtime.movie.id}`}>← Chọn suất khác</Link><span>›</span><strong>Chọn ghế</strong><span className="hold-badge">● Giữ ghế 10 phút</span></div><BookingSteps active="seats" /><section className="showtime-meta-bar"><div className="showtime-meta-movie"><MiniPoster title={showtime.movie.title} posterUrl={showtime.movie.posterUrl} /><div><div className="hero-badges"><span className="format-badge">Phim</span></div><h1>{showtime.movie.title}</h1></div></div><div className="showtime-meta-item"><small>RẠP CHIẾU</small><strong>{showtime.room?.cinema?.name}</strong><span>{showtime.room?.name}</span></div><div className="showtime-meta-item"><small>SUẤT CHIẾU</small><strong>{formatTime(showtime.startsAt)} - Hôm nay</strong><span>{formatDate(showtime.startsAt)}</span></div></section><div className="seat-workspace"><section className="seat-map-panel"><div className="panel-heading"><div><p className="eyebrow">SEAT MAP</p><h2>Sơ đồ ghế ngồi</h2></div><span className="zoom-control">− &nbsp; 100% &nbsp; +</span></div><div className="screen-curve"><span>MÀN HÌNH CHIẾU / SCREEN</span></div><p className="screen-note">Ánh sáng cong IMAX Laser Digital 4K</p><div className="seat-map-scroll"><div className="seat-map">{!seats.length && <EmptyState>Suất chiếu chưa có ghế.</EmptyState>}{Object.entries(seatsByRow).map(([row, rowSeats]) => <div className="seat-row" key={row}><span className="row-label">{row}</span><div className="seat-row-items">{rowSeats.map((seat, index) => <span key={seat.id} className={index === Math.ceil(rowSeats.length / 2) ? 'seat-gap' : ''}><SeatButton seat={seat} selected={selectedSeats.includes(seat.id)} onToggle={() => toggleSeat(seat)} /></span>)}</div><span className="row-label">{row}</span></div>)}</div></div><div className="seat-legend"><span><i className="seat standard available" /><small>Thường</small></span><span><i className="seat vip available" /><small>VIP</small></span><span><i className="seat couple available" /><small>Đôi</small></span><span><i className="seat standard held" /><small>Đang giữ</small></span><span><i className="seat standard sold" /><small>Đã bán</small></span></div></section><aside className="booking-summary-panel"><div className="summary-header"><p className="eyebrow">ORDER SUMMARY</p><h2>Tóm tắt đặt vé</h2></div>{selectedSeatObjects.length ? <div className="summary-seats">{selectedSeatObjects.map((seat) => <div className="summary-seat-row" key={seat.id}><span className="seat-token">{seat.seat.row}{seat.seat.number}</span><div><strong>Ghế {seat.seat.row}{seat.seat.number}</strong><small>{seatTypeLabel(seat.seat.type)}</small></div><span>{money(seat.price)}</span></div>)}<div className="summary-total"><span>Tổng cộng</span><strong>{money(selectedTotal)}</strong></div></div> : <p className="summary-empty">Chưa chọn ghế nào.</p>}<div className="summary-actions">{tooClose ? <p className="summary-warning">Suất chiếu quá gần giờ chiếu, không thể đặt vé mới.</p> : <button className="primary btn-full" disabled={!selectedSeats.length || actionPending} onClick={submitHold}>{actionPending ? 'Đang giữ ghế…' : 'Giữ ghế & Thanh toán'}</button>}{holdMutation.isError && <p className="error-inline">{errorMessage(holdMutation.error, 'Không thể giữ ghế.')}</p>}</div></aside></div></div>;
}

function QrPanel({ intent, onCheckStatus }: { intent: SepayCheckoutResponse; onCheckStatus: () => void }) {
  const countdown = useCountdown(intent.expiresAt);
  const copied = useRef(false);
  const [copyLabel, setCopyLabel] = useState('Sao chép');

  function copyCode() {
    void navigator.clipboard.writeText(intent.paymentCode).then(() => {
      if (!copied.current) {
        copied.current = true;
        setCopyLabel('Đã sao chép');
        setTimeout(() => { setCopyLabel('Sao chép'); copied.current = false; }, 2000);
      }
    });
  }

  return (
    <div className="sepay-qr-panel">
      <p className="eyebrow">CHUYỂN KHOẢN NGÂN HÀNG</p>
      <h2>Quét mã QR để thanh toán</h2>
      {countdown.isExpired ? (
        <p className="qr-expired">Mã thanh toán đã hết hạn. Vui lòng tạo lại.</p>
      ) : (
        <>
          <img
            className="qr-image"
            src={intent.qrUrl}
            alt="Mã QR thanh toán"
            width={220}
            height={220}
          />
          <div className="qr-bank-info">
            <div className="qr-info-row"><span>Ngân hàng</span><strong>{intent.bankCode}</strong></div>
            <div className="qr-info-row"><span>Số tài khoản</span><strong>{intent.accountNumber}</strong></div>
            <div className="qr-info-row"><span>Chủ tài khoản</span><strong>{intent.accountName}</strong></div>
            <div className="qr-info-row"><span>Số tiền</span><strong>{money(intent.amount)}</strong></div>
            <div className="qr-info-row">
              <span>Nội dung CK</span>
              <strong className="qr-payment-code">{intent.paymentCode}</strong>
              <button type="button" className="btn-copy" onClick={copyCode}>{copyLabel}</button>
            </div>
          </div>
          <p className="qr-expire-note">
            Hết hạn sau: <strong>{Math.floor(countdown.seconds / 60)}:{String(countdown.seconds % 60).padStart(2, '0')}</strong>
          </p>
          <p className="qr-important">Vui lòng ghi đúng nội dung chuyển khoản để hệ thống xác nhận tự động.</p>
        </>
      )}
      <button type="button" className="secondary" onClick={onCheckStatus}>
        Tôi đã chuyển khoản — Kiểm tra trạng thái
      </button>
    </div>
  );
}

export function BookingPage() {
  const { bookingId } = useParams();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState('');
  const [intent, setIntent] = useState<SepayCheckoutResponse | null>(null);
  const navigate = useNavigate();
  const bookingQuery = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: ({ signal }) => api.booking(bookingId!, signal),
    enabled: Boolean(bookingId),
    refetchInterval: (query) => query.state.data?.status === 'PENDING' ? 5000 : false,
  });
  const { refetch: refetchBooking } = bookingQuery;
  const booking = bookingQuery.data;
  const countdown = useCountdown(booking?.expiresAt);
  const showtimeCountdown = useCountdown(booking?.showtime?.startsAt);

  const cancelMutation = useMutation({
    mutationFn: () => api.cancelBooking(bookingId!),
    onSuccess: (cancelled) => {
      queryClient.setQueryData(['booking', bookingId], cancelled);
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      void queryClient.invalidateQueries({ queryKey: ['showtime-seats', booking?.showtimeId] });
      setActionError('');
    },
    onError: (cause) => setActionError(errorMessage(cause, 'Không thể hủy booking.')),
  });

  const checkoutMutation = useMutation({
    mutationFn: () => api.checkout(bookingId!),
    onSuccess: (result) => { setIntent(result); setActionError(''); },
    onError: (cause) => setActionError(errorMessage(cause, 'Không thể tạo mã thanh toán.')),
  });

  const leavingRef = useRef(false);
  const shouldGuardLeave = booking?.status === 'PENDING' && !countdown.isExpired;
  const blocker = useBlocker(shouldGuardLeave);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (leavingRef.current) {
      blocker.proceed();
      return;
    }
    if (window.confirm('Rời trang sẽ hủy ghế đang giữ. Tiếp tục?')) {
      leavingRef.current = true;
      if (bookingId) void api.cancelBooking(bookingId).catch(() => undefined);
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker, bookingId]);

  useEffect(() => {
    if (!shouldGuardLeave) return;
    function onPageHide() {
      if (leavingRef.current || !bookingId) return;
      leavingRef.current = true;
      cancelBookingKeepalive(bookingId);
    }
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [shouldGuardLeave, bookingId]);

  const expiryRefreshStarted = useRef(false);

  useEffect(() => {
    if (booking?.status !== 'PENDING' || !countdown.isExpired) {
      expiryRefreshStarted.current = false;
      return;
    }
    if (expiryRefreshStarted.current) return;
    expiryRefreshStarted.current = true;
    void refetchBooking().then(({ data }) => {
      if (data?.status === 'EXPIRED') {
        void queryClient.invalidateQueries({ queryKey: ['bookings'] });
        void queryClient.invalidateQueries({ queryKey: ['showtime-seats', data.showtimeId] });
        navigate(`/showtimes/${data.showtimeId}/seats`, {
          replace: true,
          state: { holdExpired: true },
        });
        return;
      }
      expiryRefreshStarted.current = false;
    });
  }, [booking?.status, countdown.isExpired, navigate, queryClient, refetchBooking]);

  useEffect(() => {
    if (booking?.status !== 'CONFIRMED') return;
    void queryClient.invalidateQueries({ queryKey: ['tickets'] });
    navigate('/tickets', { replace: true });
  }, [booking?.status, navigate, queryClient]);

  if (bookingQuery.isPending) return <LoadingState label="Đang tải booking…" />;
  if (bookingQuery.isError) return <ErrorState cause={bookingQuery.error} fallback="Không thể tải booking." onRetry={() => void bookingQuery.refetch()} />;
  if (!booking) return <EmptyState>Không tìm thấy booking.</EmptyState>;

  const cancelAndNavigate = (to: string, message: string) => {
    if (!window.confirm(message)) return;
    leavingRef.current = true;
    cancelMutation.mutate(undefined, {
      onSuccess: () => navigate(to),
    });
  };
  const changeSeats = () => {
    if (booking.status !== 'PENDING') return;
    cancelAndNavigate(
      `/showtimes/${booking.showtimeId}/seats`,
      'Ghế hiện tại sẽ được trả lại để bạn chọn lại. Tiếp tục?',
    );
  };
  const canPay = booking.status === 'PENDING' && !countdown.isExpired && showtimeCountdown.seconds > SHOWTIME_BUFFER_SECONDS;
  const canCancel = booking.status === 'PENDING' && !countdown.isExpired;
  const progressPct = countdown.seconds > 0 ? Math.min(100, (countdown.seconds / (10 * 60)) * 100) : 0;

  return <div className="checkout-page"><div className="breadcrumb">{booking.status === 'PENDING' ? <button type="button" className="link-button" disabled={cancelMutation.isPending} onClick={() => cancelAndNavigate('/bookings', 'Booking hiện tại sẽ bị hủy và trả lại ghế. Tiếp tục?')}>← Booking của tôi</button> : <Link to="/bookings">← Booking của tôi</Link>}<span>›</span><strong>Xác nhận đặt vé &amp; thanh toán</strong></div><div className="checkout-heading"><div><p className="eyebrow">BOOKING DETAIL</p><h1 className="page-title">Xác nhận đặt vé &amp; thanh toán</h1></div><span className="session-badge">● Mã phiên: #{booking.id.slice(-8)}</span></div><BookingSteps active="payment" /><div className="checkout-grid"><div className="checkout-main"><section className="checkout-card booking-movie-card"><div className="booking-movie-cover"><MiniPoster title={booking.showtime.movie.title} posterUrl={booking.showtime.movie.posterUrl} /></div><div><p className="eyebrow">BOM TẤN CINEBOOK</p><h2>{booking.showtime.movie.title}</h2><p>{booking.showtime.movie.duration} phút · {booking.showtime.room?.name}</p><div className="booking-venue"><strong>⌖ {booking.showtime.room?.cinema?.name}</strong><span>◷ {formatDate(booking.showtime.startsAt)}</span></div></div></section><section className="checkout-card"><div className="card-title"><h2>Ghế ngồi &amp; dịch vụ đi kèm</h2>{booking.status === 'PENDING' ? <button type="button" className="link-button" disabled={cancelMutation.isPending} onClick={changeSeats}>{cancelMutation.isPending ? 'Đang trả ghế…' : 'Thay đổi ghế'}</button> : null}</div><div className="booking-seat-list">{booking.items.map((item) => <div className="checkout-item" key={item.id}><span className="seat-token">{item.showtimeSeat?.seat.row}{item.showtimeSeat?.seat.number}</span><div><strong>Ghế {item.showtimeSeat?.seat.row}{item.showtimeSeat?.seat.number}</strong><small>{item.showtimeSeat?.seat.type === 'VIP' ? 'Ghế VIP' : item.showtimeSeat?.seat.type === 'COUPLE' ? 'Ghế đôi' : 'Ghế thường'}</small></div><span>{money(item.price)}</span></div>)}</div></section></div><aside className="checkout-sidebar"><section className="checkout-card order-summary-card"><p className="eyebrow">ORDER SUMMARY</p><div className="summary-line"><span>Tổng tiền vé</span><strong>{money(booking.totalAmount)}</strong></div><div className="summary-total-line"><span>Tổng thanh toán</span><strong className="summary-total-amount">{money(booking.totalAmount)}</strong></div></section>
    {booking.status === 'PENDING' && !countdown.isExpired && (
      <section className="checkout-card checkout-timer-card">
        <div className="timer-bar-wrap">
          <div className="timer-bar" style={{ width: `${progressPct}%` }} />
        </div>
        <p className="timer-label">Ghế được giữ còn <strong>{Math.floor(countdown.seconds / 60)}:{String(countdown.seconds % 60).padStart(2, '0')}</strong></p>
      </section>
    )}
    {booking.status === 'PENDING' && countdown.isExpired && (
      <section className="checkout-card"><p className="checkout-expired">Phiên đặt vé đã hết hạn.</p></section>
    )}
    {booking.status === 'CONFIRMED' && (
      <section className="checkout-card"><p className="checkout-confirmed">Thanh toán thành công! Đang chuyển đến vé…</p></section>
    )}
    {booking.status === 'CANCELLED' && (
      <section className="checkout-card"><p className="checkout-cancelled">Booking đã bị hủy.</p></section>
    )}
    {canPay && !intent && (
      <section className="checkout-card">
        <button className="primary btn-full" disabled={checkoutMutation.isPending} onClick={() => checkoutMutation.mutate()}>
          {checkoutMutation.isPending ? 'Đang tạo mã thanh toán…' : 'Thanh toán qua chuyển khoản'}
        </button>
        {canCancel && <button type="button" className="secondary btn-full" disabled={cancelMutation.isPending} onClick={() => cancelAndNavigate('/bookings', 'Booking hiện tại sẽ bị hủy và trả lại ghế. Tiếp tục?')}>{cancelMutation.isPending ? 'Đang hủy…' : 'Hủy booking'}</button>}
      </section>
    )}
    {canPay && intent && (
      <QrPanel intent={intent} onCheckStatus={() => void refetchBooking()} />
    )}
    {!canPay && canCancel && (
      <section className="checkout-card">
        <button type="button" className="secondary btn-full" disabled={cancelMutation.isPending} onClick={() => cancelAndNavigate('/bookings', 'Booking hiện tại sẽ bị hủy và trả lại ghế. Tiếp tục?')}>{cancelMutation.isPending ? 'Đang hủy…' : 'Hủy booking'}</button>
      </section>
    )}
    {actionError && <p className="error-inline">{actionError}</p>}
  </aside></div></div>;
}
