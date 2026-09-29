import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { api, cancelBookingKeepalive } from '../../api';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui';
import { useCountdown } from '../../components/useCountdown';
import { errorMessage, formatDate, money } from '../../utils/format';
import type { SepayCheckoutResponse } from '../../types';
import { BookingSteps, MiniPoster, QrPanel } from './components';

const SHOWTIME_BUFFER_SECONDS = 5 * 60;

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
