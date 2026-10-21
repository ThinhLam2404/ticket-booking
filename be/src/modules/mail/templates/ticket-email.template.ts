import { emailLayout } from './email-layout.js';
import { escapeHtml, formatVnd, formatVnDateTime, sanitizeSubject, type EmailAttachment, type RenderedEmail } from './email-template.types.js';

export type TicketEmailTicket = {
  code: string;
  seatLabel: string;
  price: string | number;
  qrCid: string;
};

export type TicketEmailData = {
  fullName: string;
  appUrl: string;
  bookingId: string;
  totalAmount: string | number;
  combos?: Array<{ name: string; quantity: number; unitPrice: string }>;
  movieTitle: string;
  cinemaName: string;
  cinemaAddress: string;
  roomName: string;
  startsAt: Date | string;
  endsAt: Date | string;
  tickets: TicketEmailTicket[];
  attachments: EmailAttachment[];
};

export function renderTicketEmail(data: TicketEmailData): RenderedEmail {
  const movieTitle = escapeHtml(data.movieTitle);
  const cinemaName = escapeHtml(data.cinemaName);
  const cinemaAddress = escapeHtml(data.cinemaAddress);
  const roomName = escapeHtml(data.roomName);
  const fullName = escapeHtml(data.fullName);
  const appUrl = escapeHtml(`${data.appUrl.replace(/\/$/, '')}/tickets`);
  const showtime = formatVnDateTime(data.startsAt);
  const endTime = formatVnDateTime(data.endsAt);
  const bookingCode = escapeHtml(data.bookingId.slice(-8).toUpperCase());
  const ticketCards = data.tickets.map((ticket) => `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:16px;border:1px solid #d3dce8;border-radius:12px;">
      <tr>
        <td style="padding:18px;vertical-align:top;">
          <div style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">MÃ VÉ</div>
          <div style="margin-top:7px;color:#0e1b35;font-size:19px;font-weight:700;letter-spacing:.04em;">${escapeHtml(ticket.code)}</div>
          <div style="margin-top:12px;color:#42526a;font-size:14px;">Ghế <strong style="color:#0e1b35;">${escapeHtml(ticket.seatLabel)}</strong></div>
          <div style="margin-top:6px;color:#42526a;font-size:14px;">Giá vé <strong style="color:#0e1b35;">${formatVnd(ticket.price)}</strong></div>
        </td>
        <td width="150" style="padding:18px;text-align:center;vertical-align:middle;background:#f8fafc;">
          <img src="cid:${escapeHtml(ticket.qrCid)}" width="120" height="120" alt="QR vé ${escapeHtml(ticket.code)}" style="display:block;width:120px;height:120px;margin:0 auto;background:#ffffff;">
          <div style="margin-top:8px;color:#64748b;font-size:11px;">Xuất trình mã QR</div>
        </td>
      </tr>
    </table>`).join('');
  const textTickets = data.tickets.map((ticket) => `- ${ticket.code} · Ghế ${ticket.seatLabel} · ${formatVnd(ticket.price)}`).join('\n');
  const textCombos = (data.combos ?? []).map((combo) => `- ${combo.name} × ${combo.quantity} · Đơn giá ${formatVnd(combo.unitPrice)}`).join('\n');
  const comboContent = data.combos?.length ? `<h2>Combo bắp nước</h2><ul>${data.combos.map((combo) => `<li>${escapeHtml(combo.name)} × ${combo.quantity} · Đơn giá ${formatVnd(combo.unitPrice)}</li>`).join('')}</ul><p>Xuất trình mã booking tại quầy để nhận combo.</p>` : '';
  const content = `
    <div style="color:#166534;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;">THANH TOÁN THÀNH CÔNG</div>
    <h1 style="margin:12px 0 10px;color:#0e1b35;font-size:30px;line-height:1.1;letter-spacing:-.04em;">Vé của bạn đã sẵn sàng</h1>
    <p style="margin:0 0 24px;color:#42526a;font-size:15px;line-height:1.7;">Xin chào ${fullName}, hãy lưu email này và xuất trình QR tại cổng soát vé.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #d3dce8;border-radius:12px;background:#f8fafc;">
      <tr><td style="padding:18px;">
        <div style="color:#0e1b35;font-size:21px;font-weight:700;">${movieTitle}</div>
        <div style="margin-top:12px;color:#24344d;font-size:14px;line-height:1.7;"><strong>${cinemaName}</strong><br>${roomName}<br>${showtime} – ${endTime}<br><span style="color:#64748b;">${cinemaAddress}</span></div>
        <div style="margin-top:14px;color:#42526a;font-size:13px;">Mã booking <strong style="color:#0e1b35;">#${bookingCode}</strong> · Tổng cộng <strong style="color:#0e1b35;">${formatVnd(data.totalAmount)}</strong></div>
      </td></tr>
    </table>
    ${ticketCards}
    ${comboContent}
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;"><tr><td style="border-radius:8px;background:#0b64dd;"><a href="${appUrl}" style="display:inline-block;padding:14px 22px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">Xem vé của tôi</a></td></tr></table>
    <p style="margin:24px 0 0;color:#64748b;font-size:12px;line-height:1.6;">Mỗi mã QR chỉ dùng cho một vé. Vui lòng không chia sẻ mã vé trước giờ chiếu.</p>`;
  return {
    subject: sanitizeSubject(`Vé điện tử CineBook · ${data.movieTitle}`),
    text: `Thanh toán thành công\n\nXin chào ${data.fullName}, vé của bạn đã sẵn sàng.\nPhim: ${data.movieTitle}\nRạp: ${data.cinemaName} · ${data.roomName}\nSuất: ${showtime} – ${endTime}\nĐịa chỉ: ${data.cinemaAddress}\nMã booking: #${bookingCode}\nTổng cộng: ${formatVnd(data.totalAmount)}\n\n${textTickets}\n\n${textCombos ? `Combo bắp nước:\n${textCombos}\nXuất trình mã booking tại quầy để nhận combo.\n\n` : ''}Xem vé: ${data.appUrl.replace(/\/$/, '')}/tickets`,
    html: emailLayout({
      preheader: `Vé điện tử ${data.movieTitle} đã sẵn sàng.`,
      content,
    }),
    attachments: data.attachments,
  };
}
