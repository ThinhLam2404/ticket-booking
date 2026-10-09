import type { RenderedEmail } from './email-template.types.js';

export function renderRefundEmail(input: { fullName: string; bookingId: string; amount: string; reason: string }): RenderedEmail {
  return {
    subject: 'CineBook — Thông báo hoàn tiền',
    text: `Xin chào ${input.fullName},\n\nĐặt vé ${input.bookingId} đã được ghi nhận hoàn tiền ${input.amount} VND.\nLý do: ${input.reason}\n\nCineBook`,
    html: `<p>Xin chào ${escapeHtml(input.fullName)},</p><p>Đặt vé <strong>${escapeHtml(input.bookingId)}</strong> đã được ghi nhận hoàn tiền <strong>${escapeHtml(input.amount)} VND</strong>.</p><p>Lý do: ${escapeHtml(input.reason)}</p><p>CineBook</p>`,
    attachments: [],
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}
