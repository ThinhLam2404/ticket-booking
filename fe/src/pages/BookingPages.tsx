import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { EmptyState, ErrorState, LoadingState } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { useCountdown } from '../components/useCountdown';
import type { ShowtimeSeat } from '../types';
import { errorMessage, formatDate, formatTime, money, statusLabel } from '../utils/format';
import { initials, movieVisual, posterStyle } from '../utils/media';
import { couplePartnerNumber } from '../utils/seat-layout';

const HOLD_TTL_SECONDS = 10 * 60;
const SHOWTIME_BUFFER_SECONDS = 5 * 60;
const PURCHASE_WINDOW_SECONDS = HOLD_TTL_SECONDS + SHOWTIME_BUFFER_SECONDS;

function MiniPoster({ title, posterUrl }: { title: string; posterUrl?: string | null }) {
  return <div className="mini-poster" style={posterStyle(title, posterUrl)}>{posterUrl || movieVisual(title).poster ? '' : initials(title)}</div>;
}

function seatTypeLabel(type: ShowtimeSeat['seat']['type']) {
  return type === 'VIP' ? 'Ghế VIP · Trung tâm' : type === 'COUPLE' ? 'Ghế đôi · 2 chỗ' : 'Ghế thường';
}

function SeatButton({ seat, selected, onToggle }: { seat: ShowtimeSeat; selected: boolean; onToggle: () => void }) {
  const unavailable = seat.status !== 'AVAILABLE';
  const typeClass = seat.seat.type.toLowerCase();
  return <button className={`seat ${typeClass} ${seat.status.toLowerCase()} ${selected ? 'chosen' : ''}`} disabled={unavailable} onClick={onToggle} aria-label={`Ghế ${seat.seat.row}${seat.seat.number}, ${seat.seat.type === 'COUPLE' ? 'ghế đôi' : selected ? 'đang chọn' : statusLabel(seat.status)}`} title={`${seat.seat.row}${seat.seat.number} · ${seatTypeLabel(seat.seat.type)} · ${money(seat.price)}`}><span>{unavailable ? seat.status === 'HELD' ? '⌑' : '×' : seat.seat.number}</span></button>;
}

export function SeatsPage() {
  const { showtimeId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, openAuth } = useAuth();
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const holdKey = useRef(`hold-${crypto.randomUUID()}`);
  const showtimeQuery = useQuery({ queryKey: ['showtime', showtimeId], queryFn: ({ signal }) => api.showtime(showtimeId!, signal), enabled: Boolean(showtimeId) });
  const seatsQuery = useQuery({ queryKey: ['showtime-seats', showtimeId], queryFn: ({ signal }) => api.showtimeSeats(showtimeId!, signal), enabled: Boolean(showtimeId), refetchInterval: 10000 });
  const showtimeCountdown = useCountdown(showtimeQuery.data?.startsAt);
  const purchaseMutation = useMutation({ mutationFn: () => api.purchaseSeats({ showtimeId: showtimeId!, showtimeSeatIds: selectedSeats, success: true }, `purchase-${crypto.randomUUID()}`), onSuccess: (result) => { queryClient.setQueryData(['booking', result.booking.id], result.booking); void queryClient.invalidateQueries({ queryKey: ['showtime-seats', showtimeId] }); void queryClient.invalidateQueries({ queryKey: ['tickets'] }); if (result.booking.tickets[0]) navigate(`/tickets/${result.booking.tickets[0].id}`); }, onError: () => { void seatsQuery.refetch(); } });
  const holdMutation = useMutation({ mutationFn: () => api.hold(showtimeId!, selectedSeats, holdKey.current), onSuccess: (booking) => { queryClient.setQueryData(['booking', booking.id], booking); void queryClient.invalidateQueries({ queryKey: ['showtime-seats', showtimeId] }); navigate(`/bookings/${booking.id}`); }, onError: () => { void seatsQuery.refetch(); } });

  useEffect(() => { holdKey.current = `hold-${crypto.randomUUID()}`; setSelectedSeats([]); }, [showtimeId]);
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
    if (showtimeCountdown.seconds <= PURCHASE_WINDOW_SECONDS) {
      purchaseMutation.mutate();
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

  const purchaseAvailable = showtimeCountdown.seconds <= PURCHASE_WINDOW_SECONDS;
  const actionPending = holdMutation.isPending || purchaseMutation.isPending;

  return <div className="booking-flow-page"><div className="breadcrumb"><Link to={`/movies/${showtime.movie.id}`}>← Chọn suất khác</Link><span>›</span><strong>Chọn ghế</strong><span className="hold-badge">● {purchaseAvailable ? 'Mua ngay' : 'Giữ ghế 10 phút'}</span></div><section className="showtime-meta-bar"><div className="showtime-meta-movie"><MiniPoster title={showtime.movie.title} posterUrl={showtime.movie.posterUrl} /><div><div className="hero-badges"><span className="age-badge">{movieVisual(showtime.movie.title).age}</span><span className="format-badge">{movieVisual(showtime.movie.title).format}</span></div><h1>{showtime.movie.title}</h1></div></div><div className="showtime-meta-item"><small>RẠP CHIẾU</small><strong>{showtime.room?.cinema?.name}</strong><span>{showtime.room?.name}</span></div><div className="showtime-meta-item"><small>SUẤT CHIẾU</small><strong>{formatTime(showtime.startsAt)} - Hôm nay</strong><span>{formatDate(showtime.startsAt)}</span></div></section><div className="seat-workspace"><section className="seat-map-panel"><div className="panel-heading"><div><p className="eyebrow">SEAT MAP</p><h2>Sơ đồ ghế ngồi</h2></div><span className="zoom-control">− &nbsp; 100% &nbsp; +</span></div><div className="screen-curve"><span>MÀN HÌNH CHIẾU / SCREEN</span></div><p className="screen-note">Ánh sáng cong IMAX Laser Digital 4K</p><div className="seat-map-scroll"><div className="seat-map">{!seats.length && <EmptyState>Suất chiếu chưa có ghế.</EmptyState>}{Object.entries(seatsByRow).map(([row, rowSeats]) => <div className="seat-row" key={row}><span className="row-label">{row}</span><div className="seat-row-items">{rowSeats.map((seat, index) => <span key={seat.id} className={index === Math.ceil(rowSeats.length / 2) ? 'seat-gap' : ''}><SeatButton seat={seat} selected={selectedSeats.includes(seat.id)} onToggle={() => toggleSeat(seat)} /></span>)}</div><span className="row-label">{row}</span></div>)}</div></div><div className="seat-legend"><span><i className="seat-dot available" />Ghế thường</span><span><i className="seat-dot vip" />Ghế VIP</span><span><i className="seat-dot couple" />Ghế đôi · 2 chỗ</span><span><i className="seat-dot chosen" />Đang chọn</span><span><i className="seat-dot held" />Đang giữ</span><span><i className="seat-dot sold" />Đã bán</span></div></section><aside className="seat-summary-panel"><div className="summary-heading"><p className="eyebrow">TÓM TẮT ĐẶT VÉ</p><span>{selectedSeats.length}/10</span></div><div className="summary-movie"><MiniPoster title={showtime.movie.title} posterUrl={showtime.movie.posterUrl} /><div><strong>{showtime.movie.title}</strong><span>{formatTime(showtime.startsAt)} · {showtime.room?.name}</span></div></div><div className="selected-seat-list"><div className="summary-line"><span>Ghế đã chọn</span><strong>{selectedSeats.length ? `${selectedSeats.length} ghế` : 'Chưa chọn'}</strong></div>{selectedSeatObjects.map((seat) => <div className="selected-seat" key={seat.id}><span className="seat-token">{seat.seat.row}{seat.seat.number}</span><div><strong>Ghế {seat.seat.row}{seat.seat.number}</strong><small>{seatTypeLabel(seat.seat.type)}</small></div><b>{money(seat.price)}</b></div>)}</div><div className="summary-total"><span>Tổng tiền tạm tính</span><strong>{money(selectedTotal)}</strong></div>{(holdMutation.isError || purchaseMutation.isError) && <p className="form-error">{errorMessage(holdMutation.error ?? purchaseMutation.error, purchaseAvailable ? 'Không thể mua ghế.' : 'Không thể giữ ghế.')}</p>}<button className="primary summary-cta" disabled={!selectedSeats.length || actionPending} onClick={submitHold}>{actionPending ? purchaseAvailable ? 'Đang mua ghế…' : 'Đang giữ ghế…' : user ? purchaseAvailable ? 'Mua ngay' : 'Giữ ghế 10 phút & tiếp tục' : 'Đăng nhập để tiếp tục'} <span>→</span></button><p className="security-note">⌁ Bảo mật giao dịch chuẩn PCI DSS<br />Vé đã mua không hỗ trợ hoàn tiền trực tuyến.</p></aside></div></div>;
}

export function BookingPage() {
  const { bookingId } = useParams();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'momo' | 'vnpay' | 'zalopay' | 'card'>('momo');
  const navigate = useNavigate();
  const bookingQuery = useQuery({ queryKey: ['booking', bookingId], queryFn: ({ signal }) => api.booking(bookingId!, signal), enabled: Boolean(bookingId), refetchInterval: (query) => query.state.data?.status === 'PENDING' ? 5000 : false });
  const { refetch: refetchBooking } = bookingQuery;
  const booking = bookingQuery.data;
  const countdown = useCountdown(booking?.expiresAt);
  const paymentKeys = useRef({ success: `payment-success-${crypto.randomUUID()}`, failure: `payment-failure-${crypto.randomUUID()}` });
  const cancelMutation = useMutation({ mutationFn: () => api.cancelBooking(bookingId!), onSuccess: (cancelled) => { queryClient.setQueryData(['booking', bookingId], cancelled); void queryClient.invalidateQueries({ queryKey: ['bookings'] }); void queryClient.invalidateQueries({ queryKey: ['showtime-seats', booking?.showtimeId] }); setActionError(''); }, onError: (cause) => setActionError(errorMessage(cause, 'Không thể hủy booking.')) });
  const paymentMutation = useMutation({ mutationFn: async (success: boolean) => { await api.checkout(bookingId!); return api.mockPayment(bookingId!, success, success ? paymentKeys.current.success : paymentKeys.current.failure); }, onSuccess: (result, success) => { queryClient.setQueryData(['booking', bookingId], result.booking); void queryClient.invalidateQueries({ queryKey: ['bookings'] }); void queryClient.invalidateQueries({ queryKey: ['tickets'] }); void queryClient.invalidateQueries({ queryKey: ['showtime-seats', result.booking.showtimeId] }); setActionError(''); if (success && result.booking.tickets[0]) navigate(`/tickets/${result.booking.tickets[0].id}`); }, onError: (cause) => setActionError(errorMessage(cause, 'Không thể thanh toán.')) });
  useEffect(() => { if (booking?.status === 'PENDING' && countdown.isExpired) void refetchBooking(); }, [booking?.status, countdown.isExpired, refetchBooking]);
  if (bookingQuery.isPending) return <LoadingState label="Đang tải booking…" />;
  if (bookingQuery.isError) return <ErrorState cause={bookingQuery.error} fallback="Không thể tải booking." onRetry={() => void bookingQuery.refetch()} />;
  if (!booking) return <EmptyState>Không tìm thấy booking.</EmptyState>;
  const cancelAndNavigate = (to: string, message: string) => {
    if (!window.confirm(message)) return;
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
  const canPay = booking.status === 'PENDING' && !countdown.isExpired;
  const canCancel = booking.status === 'PENDING' && !countdown.isExpired;
  const selectedPaymentLabel = { momo: 'MoMo', vnpay: 'VNPAY QR', zalopay: 'ZaloPay', card: 'thẻ quốc tế' }[paymentMethod];
  return <div className="checkout-page"><div className="breadcrumb">{booking.status === 'PENDING' ? <button type="button" className="link-button" disabled={cancelMutation.isPending} onClick={() => cancelAndNavigate('/bookings', 'Booking hiện tại sẽ bị hủy và trả lại ghế. Tiếp tục?')}>← Booking của tôi</button> : <Link to="/bookings">← Booking của tôi</Link>}<span>›</span><strong>Xác nhận đặt vé & thanh toán</strong></div><div className="checkout-heading"><div><p className="eyebrow">BOOKING DETAIL</p><h1 className="page-title">Xác nhận đặt vé & thanh toán</h1></div><span className="session-badge">● Mã phiên: #{booking.id.slice(-8)}</span></div><div className="checkout-grid"><div className="checkout-main"><section className="checkout-card booking-movie-card"><div className="booking-movie-cover"><MiniPoster title={booking.showtime.movie.title} posterUrl={booking.showtime.movie.posterUrl} /><span className="age-badge">{movieVisual(booking.showtime.movie.title).age}</span></div><div><p className="eyebrow">BOM TẤN CINEBOOK</p><h2>{booking.showtime.movie.title}</h2><p>{movieVisual(booking.showtime.movie.title).genre} · {booking.showtime.movie.duration} phút · {booking.showtime.room?.name}</p><div className="booking-venue"><strong>⌖ {booking.showtime.room?.cinema?.name}</strong><span>◷ {formatDate(booking.showtime.startsAt)}</span></div></div></section><section className="checkout-card"><div className="card-title"><h2>Ghế ngồi & dịch vụ đi kèm</h2>{booking.status === 'PENDING' ? <button type="button" className="link-button" disabled={cancelMutation.isPending} onClick={changeSeats}>{cancelMutation.isPending ? 'Đang trả ghế…' : 'Thay đổi ghế'}</button> : null}</div><div className="booking-seat-list">{booking.items.map((item) => <div className="checkout-item" key={item.id}><span className="seat-token">{item.showtimeSeat?.seat.row}{item.showtimeSeat?.seat.number}</span><div><strong>Ghế {item.showtimeSeat?.seat.row}{item.showtimeSeat?.seat.number}</strong><small>{item.showtimeSeat?.seat.type === 'VIP' ? 'Ghế VIP · Trung tâm' : item.showtimeSeat?.seat.type === 'COUPLE' ? 'Ghế đôi · 2 chỗ' : 'Ghế thường'}</small></div><b>{money(item.price)}</b></div>)}</div><div className="promo-row"><span className="promo-icon">⌁</span><div><strong>Khuyến mãi & ưu đãi</strong><small>Mã giảm giá sẽ được áp dụng theo chính sách hiện hành.</small></div><span className="promo-disabled">Chưa hỗ trợ</span></div><div className="price-breakdown"><div><span>Vé xem phim</span><strong>{money(booking.totalAmount)}</strong></div><div><span>Phí tiện ích</span><strong className="success-text">Miễn phí</strong></div><div className="grand-total"><span>Tổng thanh toán</span><strong>{money(booking.totalAmount)}</strong></div></div></section></div><aside className="checkout-side"><section className="countdown-card"><div><span>◷ Thời gian giữ vé còn lại</span><strong>{booking.status === 'PENDING' ? countdown.label : statusLabel(booking.status)}</strong></div><div className="progress"><i style={{ width: `${booking.status === 'PENDING' ? Math.min(100, Math.max(0, countdown.seconds / (10 * 60) * 100)) : 0}%` }} /></div><p>Ghế đã chọn sẽ tự động giải phóng khi bộ đếm kết thúc.</p></section><section className="checkout-card payment-card"><div className="card-title"><h2>Phương thức thanh toán</h2><small>BẢO MẬT 256-BIT</small></div><div className="payment-options" role="radiogroup" aria-label="Phương thức thanh toán"><button className={`payment-option ${paymentMethod === 'momo' ? 'active' : ''}`} type="button" role="radio" aria-checked={paymentMethod === 'momo'} onClick={() => setPaymentMethod('momo')}><span className="payment-logo">M</span><span><strong>Ví điện tử MoMo</strong><small>Quét mã QR thanh toán tức thì</small></span><i>{paymentMethod === 'momo' ? '●' : '○'}</i></button><button className={`payment-option ${paymentMethod === 'vnpay' ? 'active' : ''}`} type="button" role="radio" aria-checked={paymentMethod === 'vnpay'} onClick={() => setPaymentMethod('vnpay')}><span className="payment-logo">V</span><span><strong>VNPAY QR</strong><small>Hỗ trợ hơn 40 ứng dụng ngân hàng</small></span><i>{paymentMethod === 'vnpay' ? '●' : '○'}</i></button><button className={`payment-option ${paymentMethod === 'zalopay' ? 'active' : ''}`} type="button" role="radio" aria-checked={paymentMethod === 'zalopay'} onClick={() => setPaymentMethod('zalopay')}><span className="payment-logo">Z</span><span><strong>Ví điện tử ZaloPay</strong><small>Thanh toán nhanh trong 1 chạm</small></span><i>{paymentMethod === 'zalopay' ? '●' : '○'}</i></button><button className={`payment-option ${paymentMethod === 'card' ? 'active' : ''}`} type="button" role="radio" aria-checked={paymentMethod === 'card'} onClick={() => setPaymentMethod('card')}><span className="payment-logo">▣</span><span><strong>Thẻ Quốc tế</strong><small>Visa, Master, JCB · 3D-Secure</small></span><i>{paymentMethod === 'card' ? '●' : '○'}</i></button></div><p className="payment-note">Bạn đang chọn <strong>{selectedPaymentLabel}</strong>. Đây là lựa chọn hiển thị cho luồng mô phỏng thanh toán, chưa kết nối nhà cung cấp thực tế.</p>{actionError && <p className="form-error">{actionError}</p>}{canPay && <button className="primary pay-button" disabled={paymentMutation.isPending} onClick={() => paymentMutation.mutate(true)}>{paymentMutation.isPending ? 'Đang xử lý…' : `Thanh toán bằng ${selectedPaymentLabel} · ${money(booking.totalAmount)}`} <span>→</span></button>}{booking.status === 'CONFIRMED' && <div className="success-panel"><strong>Đặt vé thành công.</strong><p>Vé điện tử của bạn đã được phát hành.</p><Link className="primary" to="/tickets">Xem vé của tôi</Link></div>}{booking.status === 'PENDING' && countdown.isExpired && <div className="warning-panel">Booking đã hết thời gian giữ. Vui lòng quay lại chọn ghế.</div>}<button className="cancel-link" disabled={!canCancel || cancelMutation.isPending} onClick={() => cancelAndNavigate(`/showtimes/${booking.showtimeId}/seats`, 'Bạn có chắc muốn hủy booking này?')}>{cancelMutation.isPending ? 'Đang hủy…' : 'Hủy booking / Quay lại chọn ghế'}</button></section></aside></div></div>;
}
