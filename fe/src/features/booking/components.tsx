import { useRef, useState } from 'react';
import type { SepayCheckoutResponse, ShowtimeSeat } from '../../types';
import { useCountdown } from '../../components/useCountdown';
import { money, statusLabel } from '../../utils/format';
import { initials, posterStyle } from '../../utils/media';

export function MiniPoster({ title, posterUrl }: { title: string; posterUrl?: string | null }) {
  return <div className="mini-poster" style={posterStyle(title, posterUrl)}>{posterUrl ? '' : initials(title)}</div>;
}

export function seatTypeLabel(type: ShowtimeSeat['seat']['type']) {
  return type === 'VIP' ? 'Ghế VIP · Trung tâm' : type === 'COUPLE' ? 'Ghế đôi · 2 chỗ' : 'Ghế thường';
}

export function SeatButton({ seat, selected, onToggle }: { seat: ShowtimeSeat; selected: boolean; onToggle: () => void }) {
  const unavailable = seat.status !== 'AVAILABLE';
  const typeClass = seat.seat.type.toLowerCase();
  return <button className={`seat ${typeClass} ${seat.status.toLowerCase()} ${selected ? 'chosen' : ''}`} disabled={unavailable} onClick={onToggle} aria-label={`Ghế ${seat.seat.row}${seat.seat.number}, ${seat.seat.type === 'COUPLE' ? 'ghế đôi' : selected ? 'đang chọn' : statusLabel(seat.status)}`} title={`${seat.seat.row}${seat.seat.number} · ${seatTypeLabel(seat.seat.type)} · ${money(seat.price)}`}><span>{unavailable ? seat.status === 'HELD' ? '⌑' : '×' : seat.seat.number}</span></button>;
}

export function BookingSteps({ active }: { active: 'seats' | 'payment' }) {
  const steps = [['movie', 'Chọn phim'], ['seats', 'Chọn ghế'], ['payment', 'Thanh toán'], ['ticket', 'Nhận vé']] as const;
  const activeIndex = active === 'seats' ? 1 : 2;
  return <div className="booking-steps" aria-label="Tiến trình đặt vé">{steps.map(([key, label], index) => <div className={`booking-step ${index === activeIndex ? 'active' : ''} ${index < activeIndex ? 'complete' : ''}`} key={key}><span>{index < activeIndex ? '✓' : index + 1}</span><strong>{label}</strong></div>)}</div>;
}

export function QrPanel({ intent, onCheckStatus }: { intent: SepayCheckoutResponse; onCheckStatus: () => void }) {
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
