import type { Booking } from '../../types';
import { money } from '../../utils/format';

export function ComboSummary({ booking }: { booking: Booking }) {
  if (!booking.comboItems?.length) return null;
  return <section className="combo-panel" aria-label="Combo đã mua"><h3>Combo bắp nước</h3>{booking.comboItems.map((item) => <div className="combo-row" key={item.id}><div><strong>{item.name} × {item.quantity}</strong><p>{item.description}</p><small>Đơn giá {money(item.unitPrice)}</small></div><strong>{money(Number(item.unitPrice) * item.quantity)}</strong></div>)}<p>Tiền vé: {money(booking.ticketSubtotal)} · Combo: {money(booking.comboSubtotal)}</p><p>Nội dung đã chốt, không hỗ trợ thêm hoặc đổi combo.</p></section>;
}
