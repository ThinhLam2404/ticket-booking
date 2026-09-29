import { renderTicketEmail } from './ticket-email.template.js';
import { renderVerificationEmail } from './verification-email.template.js';

describe('mail templates', () => {
  it('renders escaped verification content with text fallback', () => {
    const result = renderVerificationEmail({
      fullName: '<Alice & Bob>',
      verificationUrl: 'http://localhost:5173/verify-email?token=abc',
      expiresInHours: 24,
    });

    expect(result.subject).toBe('Xác thực tài khoản CineBook');
    expect(result.html).toContain('&lt;Alice &amp; Bob&gt;');
    expect(result.html).toContain('Xác thực tài khoản');
    expect(result.text).toContain('http://localhost:5173/verify-email?token=abc');
    expect(result.html).not.toContain('<Alice & Bob>');
  });

  it('renders all ticket cards, QR CIDs and booking summary', () => {
    const result = renderTicketEmail({
      fullName: 'Nguyễn Văn A',
      appUrl: 'http://localhost:5173/',
      bookingId: 'booking-12345678',
      totalAmount: '250000',
      movieTitle: 'Phim <đặc biệt>',
      cinemaName: 'CineBook Landmark',
      cinemaAddress: '1 Đường Test',
      roomName: 'Phòng IMAX',
      startsAt: '2026-10-02T12:00:00.000Z',
      endsAt: '2026-10-02T14:00:00.000Z',
      tickets: [
        { code: 'TKT-ONE', seatLabel: 'A1', price: '125000', qrCid: 'ticket-TKT-ONE@cinebook' },
        { code: 'TKT-TWO', seatLabel: 'A2', price: '125000', qrCid: 'ticket-TKT-TWO@cinebook' },
      ],
      attachments: [
        { filename: 'TKT-ONE.png', content: 'qr1', encoding: 'base64', cid: 'ticket-TKT-ONE@cinebook' },
        { filename: 'TKT-TWO.png', content: 'qr2', encoding: 'base64', cid: 'ticket-TKT-TWO@cinebook' },
      ],
    });

    expect(result.subject).toContain('Phim <đặc biệt>');
    expect(result.html).toContain('Phim &lt;đặc biệt&gt;');
    expect(result.html).toContain('TKT-ONE');
    expect(result.html).toContain('TKT-TWO');
    expect(result.html).toContain('cid:ticket-TKT-ONE@cinebook');
    expect(result.html).toContain('cid:ticket-TKT-TWO@cinebook');
    expect(result.text).toContain('Mã booking: #12345678');
    expect(result.text).toContain('250.000');
    expect(result.attachments).toHaveLength(2);
  });
});
